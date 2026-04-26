from flask import Blueprint, request, jsonify
import re

from db import get_connection

user_bp = Blueprint("user_bp", __name__)


# =========================
# ADMIN - GET ALL USERS
# =========================
@user_bp.route("/admin/users", methods=["GET"])
def admin_get_users():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT u.user_id, u.user_code, u.name, u.email, u.phone,
                   u.role, u.branch_id, b.branch_name
            FROM users u
            LEFT JOIN branch b ON u.branch_id = b.branch_id
            ORDER BY u.user_id
        """)

        rows = cur.fetchall()

        users = []
        for row in rows:
            users.append({
                "user_id": row[0],
                "user_code": row[1],
                "name": row[2],
                "email": row[3],
                "phone": row[4],
                "role": row[5],
                "branch_id": row[6],
                "branch_name": row[7]
            })

        cur.close()
        conn.close()

        return jsonify(users), 200

    except Exception as e:
        print("ERROR /admin/users GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - GET SINGLE USER
# =========================
@user_bp.route("/admin/users/<int:user_id>", methods=["GET"])
def admin_get_single_user(user_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT u.user_id, u.user_code, u.name, u.email, u.phone,
                   u.role, u.branch_id, b.branch_name
            FROM users u
            LEFT JOIN branch b ON u.branch_id = b.branch_id
            WHERE u.user_id = %s
        """, (user_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "User not found"}), 404

        user = {
            "user_id": row[0],
            "user_code": row[1],
            "name": row[2],
            "email": row[3],
            "phone": row[4],
            "role": row[5],
            "branch_id": row[6],
            "branch_name": row[7]
        }

        return jsonify(user), 200

    except Exception as e:
        print("ERROR /admin/users/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - ADD USER
# =========================
@user_bp.route("/admin/users", methods=["POST"])
def admin_add_user():
    try:
        data = request.get_json()

        name = data.get("name")
        email = data.get("email")
        phone = data.get("phone")
        password = data.get("password")
        role = data.get("role")
        branch_id = data.get("branch_id")

        allowed_roles = ["BRANCH_STAFF", "INVENTORY_MANAGER", "SYSTEM_ADMIN"]

        if not name or not name.strip():
            return jsonify({"message": "Name is required"}), 400

        if not email or not email.strip():
            return jsonify({"message": "Email is required"}), 400

        if not phone or not phone.strip():
            return jsonify({"message": "Phone is required"}), 400

        if not password:
            return jsonify({"message": "Password is required"}), 400

        if role not in allowed_roles:
            return jsonify({"message": "Invalid role"}), 400

        if len(password) < 8 or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            return jsonify({
                "message": "Password must be at least 8 characters and include one special character"
            }), 400

        if role == "SYSTEM_ADMIN":
            branch_id = None
        else:
            if branch_id is None:
                return jsonify({"message": "Branch is required for branch staff and inventory manager"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM users WHERE LOWER(email) = LOWER(%s)", (email.strip(),))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Email already exists"}), 400

        cur.execute("SELECT 1 FROM users WHERE phone = %s", (phone.strip(),))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Phone number already exists"}), 400

        if branch_id is not None:
            cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
            if not cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({"message": "Branch not found"}), 404

        cur.execute("""
            INSERT INTO users (name, email, phone, password, role, branch_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING user_id, user_code
        """, (
            name.strip(),
            email.strip(),
            phone.strip(),
            password,
            role,
            branch_id
        ))

        new_user = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "User added successfully",
            "user_id": new_user[0],
            "user_code": new_user[1]
        }), 201

    except Exception as e:
        print("ERROR /admin/users POST:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - UPDATE USER
# =========================
@user_bp.route("/admin/users/<int:user_id>", methods=["PUT"])
def admin_update_user(user_id):
    try:
        data = request.get_json()

        name = data.get("name")
        email = data.get("email")
        phone = data.get("phone")
        password = data.get("password")
        role = data.get("role")
        branch_id = data.get("branch_id")

        allowed_roles = ["BRANCH_STAFF", "INVENTORY_MANAGER", "SYSTEM_ADMIN"]

        if not name or not name.strip():
            return jsonify({"message": "Name is required"}), 400

        if not email or not email.strip():
            return jsonify({"message": "Email is required"}), 400

        if not phone or not phone.strip():
            return jsonify({"message": "Phone is required"}), 400

        if role not in allowed_roles:
            return jsonify({"message": "Invalid role"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT user_id, password
            FROM users
            WHERE user_id = %s
        """, (user_id,))
        existing_user = cur.fetchone()

        if not existing_user:
            cur.close()
            conn.close()
            return jsonify({"message": "User not found"}), 404

        existing_password = existing_user[1]

        if not password or not str(password).strip():
            password = existing_password
        else:
            if len(password) < 8 or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
                cur.close()
                conn.close()
                return jsonify({
                    "message": "Password must be at least 8 characters and include one special character"
                }), 400

        if role == "SYSTEM_ADMIN":
            branch_id = None
        else:
            if branch_id is None:
                cur.close()
                conn.close()
                return jsonify({"message": "Branch is required for branch staff and inventory manager"}), 400

        cur.execute("""
            SELECT 1 FROM users
            WHERE LOWER(email) = LOWER(%s)
              AND user_id <> %s
        """, (email.strip(), user_id))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Email already exists"}), 400

        cur.execute("""
            SELECT 1 FROM users
            WHERE phone = %s
              AND user_id <> %s
        """, (phone.strip(), user_id))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Phone number already exists"}), 400

        if branch_id is not None:
            cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
            if not cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({"message": "Branch not found"}), 404

        cur.execute("""
            UPDATE users
            SET name = %s,
                email = %s,
                phone = %s,
                password = %s,
                role = %s,
                branch_id = %s
            WHERE user_id = %s
        """, (
            name.strip(),
            email.strip(),
            phone.strip(),
            password,
            role,
            branch_id,
            user_id
        ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "User updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/users PUT:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - DELETE USER
# =========================
@user_bp.route("/admin/users/<int:user_id>", methods=["DELETE"])
def admin_delete_user(user_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM users WHERE user_id = %s", (user_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "User not found"}), 404

        cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "User deleted successfully"}), 200

    except Exception as e:
        print("ERROR /admin/users DELETE:", e)
        return jsonify({
            "message": "Cannot delete user. It may still be used by sales or stock transfers."
        }), 400