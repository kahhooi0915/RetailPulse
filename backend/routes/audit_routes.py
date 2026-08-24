from flask import Blueprint, jsonify, request

from db import get_connection
from routes.auth_routes import login_required, role_required

audit_bp = Blueprint("audit_bp", __name__)


def _audit_row(row):
    return {
        "audit_id": row[0],
        "user_id": row[1],
        "user_name": row[2],
        "role": row[3],
        "action": row[4],
        "module": row[5],
        "record_id": row[6],
        "description": row[7],
        "created_at": row[8].isoformat() if row[8] else None,
    }


@audit_bp.route("/admin/audit-logs", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN")
def get_audit_logs():
    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        module = request.args.get("module")
        action = request.args.get("action")
        audit_user_id = request.args.get("audit_user_id")
        date_from = request.args.get("date_from")
        date_to = request.args.get("date_to")
        limit = request.args.get("limit")

        conditions = []
        params = []

        if module:
            conditions.append("al.module = %s")
            params.append(module)
        if action:
            conditions.append("al.action = %s")
            params.append(action)
        if audit_user_id:
            conditions.append("al.user_id = %s")
            params.append(audit_user_id)
        if date_from:
            conditions.append("al.created_at::date >= %s")
            params.append(date_from)
        if date_to:
            conditions.append("al.created_at::date <= %s")
            params.append(date_to)

        query = """
            SELECT al.audit_id,
                   al.user_id,
                   u.name,
                   u.role,
                   al.action,
                   al.module,
                   al.record_id,
                   al.description,
                   al.created_at
            FROM audit_log al
            JOIN users u ON al.user_id = u.user_id
        """

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY al.created_at DESC, al.audit_id DESC"

        if limit:
            query += " LIMIT %s"
            params.append(int(limit))

        cur.execute(query, params)
        rows = cur.fetchall()

        return jsonify([_audit_row(row) for row in rows]), 200

    except Exception as e:
        print("ERROR /admin/audit-logs GET:", e)
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
