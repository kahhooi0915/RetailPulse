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
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{Config.DB_NAME}_backup_{timestamp}.sql"
    file_path = os.path.join(BACKUP_DIR, filename)

    command = [
        _pg_dump_command(),
        "-h",
        Config.DB_HOST,
        "-p",
        str(Config.DB_PORT),
        "-U",
        Config.DB_USER,
        "-d",
        Config.DB_NAME,
        "--format=plain",
        "--no-owner",
        "-f",
        file_path,
    ]

    env = os.environ.copy()
    if Config.DB_PASSWORD:
        env["PGPASSWORD"] = Config.DB_PASSWORD

    started_at = time.perf_counter()
    try:
        result = subprocess.run(command, capture_output=True, text=True, env=env, timeout=300)
        duration_seconds = round(time.perf_counter() - started_at, 2)

        if result.returncode != 0:
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({"message": result.stderr.strip() or "Backup failed"}), 500

        with open(_metadata_path(filename), "w", encoding="utf-8") as file:
            json.dump({"duration_seconds": duration_seconds}, file)

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
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({"message": "Backup timed out before completion"}), 500
    except Exception as e:
        print("ERROR /admin/backups/create POST:", e)
        if os.path.exists(file_path):
            os.remove(file_path)
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
