import json
import os
import shutil
import subprocess
import time
from datetime import datetime

from flask import Blueprint, jsonify, request, send_file

from audit import log_audit
from config import Config
from db import get_connection

backup_bp = Blueprint("backup_bp", __name__)

BACKUP_DIR = os.path.abspath(
    os.getenv(
        "BACKUP_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", "backups"),
    )
)


def _pg_dump_command():
    configured_path = os.getenv("PG_DUMP_PATH")
    if configured_path:
        return configured_path

    path_command = shutil.which("pg_dump")
    if path_command:
        return path_command

    if os.name == "nt":
        program_files = [
            os.environ.get("ProgramFiles"),
            os.environ.get("ProgramFiles(x86)"),
        ]
        for root in [item for item in program_files if item]:
            postgres_root = os.path.join(root, "PostgreSQL")
            if not os.path.isdir(postgres_root):
                continue

            versions = sorted(os.listdir(postgres_root), reverse=True)
            for version in versions:
                candidate = os.path.join(postgres_root, version, "bin", "pg_dump.exe")
                if os.path.isfile(candidate):
                    return candidate

    return "pg_dump"


def _psql_command():
    configured_path = os.getenv("PSQL_PATH")
    if configured_path:
        return configured_path

    path_command = shutil.which("psql")
    if path_command:
        return path_command

    if os.name == "nt":
        program_files = [
            os.environ.get("ProgramFiles"),
            os.environ.get("ProgramFiles(x86)"),
        ]
        for root in [item for item in program_files if item]:
            postgres_root = os.path.join(root, "PostgreSQL")
            if not os.path.isdir(postgres_root):
                continue

            versions = sorted(os.listdir(postgres_root), reverse=True)
            for version in versions:
                candidate = os.path.join(postgres_root, version, "bin", "psql.exe")
                if os.path.isfile(candidate):
                    return candidate

    return "psql"


def _requester_id():
    data = request.get_json(silent=True) or {}
    return (
        request.args.get("user_id")
        or request.headers.get("X-User-Id")
        or data.get("user_id")
        or data.get("actor_user_id")
    )


def _is_system_admin(user_id):
    if not user_id:
        return False

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT 1
            FROM users
            WHERE user_id = %s
              AND role = 'SYSTEM_ADMIN'
              AND status = 'ACTIVE'
            """,
            (user_id,),
        )
        return cur.fetchone() is not None
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def _require_system_admin():
    user_id = _requester_id()
    if not _is_system_admin(user_id):
        return None, (jsonify({"message": "Only system admins can access database backups"}), 403)
    return user_id, None


def _ensure_backup_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)


def _metadata_path(filename):
    return os.path.join(BACKUP_DIR, f"{filename}.json")


def _safe_backup_path(filename):
    if not filename or filename != os.path.basename(filename) or not filename.endswith(".sql"):
        return None

    backup_dir = os.path.abspath(BACKUP_DIR)
    file_path = os.path.abspath(os.path.join(backup_dir, filename))
    if os.path.commonpath([backup_dir, file_path]) != backup_dir:
        return None
    return file_path


def _read_duration(filename):
    metadata_file = _metadata_path(filename)
    if not os.path.exists(metadata_file):
        return None

    try:
        with open(metadata_file, "r", encoding="utf-8") as file:
            metadata = json.load(file)
        return metadata.get("duration_seconds")
    except (OSError, ValueError):
        return None


def _backup_metadata(filename, index):
    file_path = os.path.join(BACKUP_DIR, filename)
    stat = os.stat(file_path)
    return {
        "backup_id": index,
        "filename": filename,
        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "file_size": stat.st_size,
        "status": "Completed",
        "duration_seconds": _read_duration(filename),
    }


def _list_backups():
    _ensure_backup_dir()
    files = [
        item
        for item in os.listdir(BACKUP_DIR)
        if item.endswith(".sql") and os.path.isfile(os.path.join(BACKUP_DIR, item))
    ]
    files.sort(key=lambda item: os.path.getmtime(os.path.join(BACKUP_DIR, item)), reverse=True)
    return [_backup_metadata(filename, index + 1) for index, filename in enumerate(files)]


def _database_env():
    env = os.environ.copy()
    if Config.DB_PASSWORD:
        env["PGPASSWORD"] = Config.DB_PASSWORD
    return env


def _pg_connection_args(database=None):
    return [
        "-h",
        Config.DB_HOST,
        "-p",
        str(Config.DB_PORT),
        "-U",
        Config.DB_USER,
        "-d",
        database or Config.DB_NAME,
    ]


def _verify_backup_file(filename):
    file_path = _safe_backup_path(filename)
    if not file_path:
        return None, "Invalid backup filename"
    if not os.path.exists(file_path):
        return None, "Backup file not found"
    if os.path.getsize(file_path) <= 0:
        return None, "Backup file is empty"

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as file:
            sample = file.read(65536)
    except OSError as e:
        return None, f"Backup file cannot be read: {e}"

    required_markers = (
        "PostgreSQL database dump",
        "Dumped from database version",
        "CREATE TABLE",
        "COPY ",
    )
    if not any(marker in sample for marker in required_markers):
        return None, "Backup file does not look like a PostgreSQL SQL backup"

    return file_path, None


def _create_backup_file(prefix=None):
    _ensure_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{Config.DB_NAME}_{prefix or 'backup'}_{timestamp}.sql"
    file_path = os.path.join(BACKUP_DIR, filename)

    command = [
        _pg_dump_command(),
        *_pg_connection_args(),
        "--format=plain",
        "--no-owner",
        "-f",
        file_path,
    ]

    started_at = time.perf_counter()
    result = subprocess.run(command, capture_output=True, text=True, env=_database_env(), timeout=300)
    duration_seconds = round(time.perf_counter() - started_at, 2)

    if result.returncode != 0:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise RuntimeError(result.stderr.strip() or "Backup failed")

    with open(_metadata_path(filename), "w", encoding="utf-8") as file:
        json.dump({"duration_seconds": duration_seconds}, file)

    return filename, duration_seconds


@backup_bp.route("/admin/backups", methods=["GET"])
def get_backups():
    _, error = _require_system_admin()
    if error:
        return error

    try:
        backups = _list_backups()
        storage_used = sum(item["file_size"] for item in backups)
        return jsonify({"backups": backups, "storage_used": storage_used}), 200
    except Exception as e:
        print("ERROR /admin/backups GET:", e)
        return jsonify({"message": str(e)}), 500


@backup_bp.route("/admin/backups/create", methods=["POST"])
def create_backup():
    user_id, error = _require_system_admin()
    if error:
        return error

    _ensure_backup_dir()

    try:
        filename, duration_seconds = _create_backup_file("backup")
        metadata = _backup_metadata(filename, 1)
        log_audit(
            user_id,
            "CREATE",
            "Database Backup",
            None,
            f"Created database backup file {filename}.",
        )
        return jsonify({"message": "Backup created successfully", "backup": metadata}), 201
    except FileNotFoundError:
        return jsonify({"message": "pg_dump command was not found. Install PostgreSQL client tools or set PG_DUMP_PATH in backend/.env."}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"message": "Backup timed out before completion"}), 500
    except Exception as e:
        print("ERROR /admin/backups/create POST:", e)
        return jsonify({"message": str(e)}), 500


@backup_bp.route("/admin/backups/verify", methods=["POST"])
def verify_backup():
    user_id, error = _require_system_admin()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    filename = data.get("filename")
    file_path, verify_error = _verify_backup_file(filename)
    if verify_error:
        return jsonify({"message": verify_error}), 400

    try:
        metadata = _backup_metadata(filename, 1)
        log_audit(
            user_id,
            "VERIFY",
            "Database Backup",
            None,
            f"Verified database backup file {filename}.",
        )
        return jsonify({
            "message": "Backup verified successfully",
            "backup": metadata,
            "file_path": os.path.basename(file_path),
        }), 200
    except Exception as e:
        print("ERROR /admin/backups/verify POST:", e)
        return jsonify({"message": str(e)}), 500


@backup_bp.route("/admin/backups/restore", methods=["POST"])
def restore_backup():
    user_id, error = _require_system_admin()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    filename = data.get("filename")
    confirm = data.get("confirm")
    if confirm != "RESTORE":
        return jsonify({"message": "Restore confirmation is required"}), 400

    file_path, verify_error = _verify_backup_file(filename)
    if verify_error:
        return jsonify({"message": verify_error}), 400

    try:
        safety_filename, _ = _create_backup_file("pre_restore")

        reset_command = [
            _psql_command(),
            *_pg_connection_args(),
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;",
        ]
        reset_result = subprocess.run(
            reset_command,
            capture_output=True,
            text=True,
            env=_database_env(),
            timeout=300,
        )
        if reset_result.returncode != 0:
            return jsonify({"message": reset_result.stderr.strip() or "Database reset failed"}), 500

        restore_command = [
            _psql_command(),
            *_pg_connection_args(),
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            file_path,
        ]
        started_at = time.perf_counter()
        restore_result = subprocess.run(
            restore_command,
            capture_output=True,
            text=True,
            env=_database_env(),
            timeout=600,
        )
        duration_seconds = round(time.perf_counter() - started_at, 2)
        if restore_result.returncode != 0:
            return jsonify({
                "message": restore_result.stderr.strip() or "Database restore failed",
                "safety_backup": safety_filename,
            }), 500

        log_audit(
            user_id,
            "RESTORE",
            "Database Backup",
            None,
            f"Restored database from backup file {filename}. Safety backup: {safety_filename}.",
        )
        return jsonify({
            "message": "Database restored successfully",
            "restored_backup": filename,
            "safety_backup": safety_filename,
            "duration_seconds": duration_seconds,
        }), 200
    except FileNotFoundError:
        return jsonify({"message": "PostgreSQL client command was not found. Install PostgreSQL client tools or set PG_DUMP_PATH and PSQL_PATH in backend/.env."}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"message": "Database restore timed out before completion"}), 500
    except Exception as e:
        print("ERROR /admin/backups/restore POST:", e)
        return jsonify({"message": str(e)}), 500


@backup_bp.route("/admin/backups/download/<path:filename>", methods=["GET"])
def download_backup(filename):
    _, error = _require_system_admin()
    if error:
        return error

    file_path = _safe_backup_path(filename)
    if not file_path:
        return jsonify({"message": "Invalid backup filename"}), 400
    if not os.path.exists(file_path):
        return jsonify({"message": "Backup file not found"}), 404

    return send_file(file_path, as_attachment=True, download_name=filename)
