from flask import Blueprint, request, jsonify
from db import get_connection
from routes.auth_routes import login_required, role_required

branch_bp = Blueprint("branch_bp", __name__)


def ensure_branch_status_column(cur):
    cur.execute("""
        ALTER TABLE branch
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    """)


# =========================
# ADMIN - GET ALL BRANCHES
# =========================
@branch_bp.route("/admin/branches", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER", "BRANCH_STAFF")
def admin_get_branches():
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_branch_status_column(cur)
        conn.commit()

        cur.execute("""
            SELECT branch_id, branch_code, branch_name, branch_address, phone, branch_type, status
            FROM branch
            ORDER BY branch_id
        """)

        rows = cur.fetchall()

        branches = []
        for row in rows:
            branches.append({
                "branch_id": row[0],
                "branch_code": row[1],
                "branch_name": row[2],
                "branch_address": row[3],
                "phone": row[4],
                "branch_type": row[5],
                "status": row[6]
            })

        cur.close()
        conn.close()

        return jsonify(branches), 200

    except Exception as e:
        print("ERROR /admin/branches GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - GET SINGLE BRANCH
# =========================
@branch_bp.route("/admin/branches/<int:branch_id>", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER", "BRANCH_STAFF")
def admin_get_single_branch(branch_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_branch_status_column(cur)
        conn.commit()

        cur.execute("""
            SELECT branch_id, branch_code, branch_name, branch_address, phone, branch_type, status
            FROM branch
            WHERE branch_id = %s
        """, (branch_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "Branch not found"}), 404

        branch = {
            "branch_id": row[0],
            "branch_code": row[1],
            "branch_name": row[2],
            "branch_address": row[3],
            "phone": row[4],
            "branch_type": row[5],
            "status": row[6]
        }

        return jsonify(branch), 200

    except Exception as e:
        print("ERROR /admin/branches/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - ADD BRANCH
# =========================
@branch_bp.route("/admin/branches", methods=["POST"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_add_branch():
    conn = None
    cur = None

    try:
        data = request.get_json()

        branch_name = data.get("branch_name")
        branch_address = data.get("branch_address")
        phone = data.get("phone")
        branch_type = data.get("branch_type", "BRANCH")
        status = data.get("status", "ACTIVE")

        if not branch_name or not branch_name.strip():
            return jsonify({"message": "Branch name is required"}), 400

        if branch_type not in ["BRANCH", "WAREHOUSE"]:
            return jsonify({"message": "Invalid branch type"}), 400

        if status not in ["ACTIVE", "INACTIVE"]:
            return jsonify({"message": "Invalid status"}), 400

        conn = get_connection()
        cur = conn.cursor()
        ensure_branch_status_column(cur)

        cur.execute("""
            INSERT INTO branch (branch_name, branch_address, phone, branch_type, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING branch_id, branch_code
        """, (branch_name.strip(), branch_address, phone, branch_type, status))

        new_branch = cur.fetchone()

        # Inventory initialization added:
        # Every newly created branch starts with 0 stock for all active products.
        cur.execute("""
            INSERT INTO inventory (
                product_id,
                branch_id,
                quantity_in_stock
            )
            SELECT
                p.product_id,
                %s,
                0
            FROM product p
            WHERE p.status = 'ACTIVE'
            ON CONFLICT (product_id, branch_id) DO NOTHING
        """, (new_branch[0],))

        conn.commit()

        return jsonify({
            "message": "Branch created successfully and inventory initialized.",
            "branch_id": new_branch[0],
            "branch_code": new_branch[1]
        }), 201

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR /admin/branches POST:", e)
        return jsonify({"message": str(e)}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# =========================
# ADMIN - UPDATE BRANCH
# =========================
@branch_bp.route("/admin/branches/<int:branch_id>", methods=["PUT"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_update_branch(branch_id):
    try:
        data = request.get_json()

        branch_name = data.get("branch_name")
        branch_address = data.get("branch_address")
        phone = data.get("phone")
        branch_type = data.get("branch_type", "BRANCH")
        status = data.get("status", "ACTIVE")

        if not branch_name or not branch_name.strip():
            return jsonify({"message": "Branch name is required"}), 400

        if branch_type not in ["BRANCH", "WAREHOUSE"]:
            return jsonify({"message": "Invalid branch type"}), 400

        if status not in ["ACTIVE", "INACTIVE"]:
            return jsonify({"message": "Invalid status"}), 400

        conn = get_connection()
        cur = conn.cursor()
        ensure_branch_status_column(cur)

        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Branch not found"}), 404

        cur.execute("""
            UPDATE branch
            SET branch_name = %s,
                branch_address = %s,
                phone = %s,
                branch_type = %s,
                status = %s
            WHERE branch_id = %s
        """, (branch_name.strip(), branch_address, phone, branch_type, status, branch_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Branch updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/branches PUT:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - INACTIVATE BRANCH
# =========================
@branch_bp.route("/admin/branches/<int:branch_id>", methods=["DELETE"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_inactivate_branch(branch_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_branch_status_column(cur)

        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Branch not found"}), 404

        cur.execute("""
            UPDATE branch
            SET status = 'INACTIVE'
            WHERE branch_id = %s
        """, (branch_id,))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "Branch inactivated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/branches DELETE:", e)
        return jsonify({"message": str(e)}), 500
