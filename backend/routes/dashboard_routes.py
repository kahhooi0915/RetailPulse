from flask import Blueprint, jsonify
from db import get_connection

dashboard_bp = Blueprint("dashboard_bp", __name__)


@dashboard_bp.route("/admin/dashboard/summary", methods=["GET"])
def admin_dashboard_summary():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT COUNT(*)
            FROM stock_transfer
            WHERE status = 'PENDING'
        """)
        pending_transfers = cur.fetchone()[0]

        cur.close()
        conn.close()

        return jsonify({
            "pending_transfers": pending_transfers
        }), 200

    except Exception as e:
        print("ERROR /admin/dashboard/summary GET:", e)
        return jsonify({"message": str(e)}), 500
