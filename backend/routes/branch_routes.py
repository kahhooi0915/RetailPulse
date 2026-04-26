from flask import Blueprint, request, jsonify
from db import get_connection

branch_bp = Blueprint("branch_bp", __name__)


# =========================
# ADMIN - GET ALL BRANCHES
# =========================
@branch_bp.route("/admin/branches", methods=["GET"])
def admin_get_branches():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT branch_id, branch_code, branch_name, branch_address, phone
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
                "phone": row[4]
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
def admin_get_single_branch(branch_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT branch_id, branch_code, branch_name, branch_address, phone
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
            "phone": row[4]
        }

        return jsonify(branch), 200

    except Exception as e:
        print("ERROR /admin/branches/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - ADD BRANCH
# =========================
@branch_bp.route("/admin/branches", methods=["POST"])
def admin_add_branch():
    try:
        data = request.get_json()

        branch_name = data.get("branch_name")
        branch_address = data.get("branch_address")
        phone = data.get("phone")

        if not branch_name or not branch_name.strip():
            return jsonify({"message": "Branch name is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO branch (branch_name, branch_address, phone)
            VALUES (%s, %s, %s)
            RETURNING branch_id, branch_code
        """, (branch_name.strip(), branch_address, phone))

        new_branch = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Branch added successfully",
            "branch_id": new_branch[0],
            "branch_code": new_branch[1]
        }), 201

    except Exception as e:
        print("ERROR /admin/branches POST:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - UPDATE BRANCH
# =========================
@branch_bp.route("/admin/branches/<int:branch_id>", methods=["PUT"])
def admin_update_branch(branch_id):
    try:
        data = request.get_json()

        branch_name = data.get("branch_name")
        branch_address = data.get("branch_address")
        phone = data.get("phone")

        if not branch_name or not branch_name.strip():
            return jsonify({"message": "Branch name is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Branch not found"}), 404

        cur.execute("""
            UPDATE branch
            SET branch_name = %s,
                branch_address = %s,
                phone = %s
            WHERE branch_id = %s
        """, (branch_name.strip(), branch_address, phone, branch_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Branch updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/branches PUT:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - DELETE BRANCH
# =========================
@branch_bp.route("/admin/branches/<int:branch_id>", methods=["DELETE"])
def admin_delete_branch(branch_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Branch not found"}), 404

        cur.execute("DELETE FROM branch WHERE branch_id = %s", (branch_id,))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "Branch deleted successfully"}), 200

    except Exception as e:
        print("ERROR /admin/branches DELETE:", e)
        return jsonify({
            "message": "Cannot delete branch. It may still be used by users, inventory, sales, or transfers."
        }), 400