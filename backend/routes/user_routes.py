from flask import Blueprint, request, jsonify
import re
from db import get_connection

user_bp = Blueprint("user_bp", __name__)

ALLOWED_ROLES = ["BRANCH_STAFF", "INVENTORY_MANAGER", "SYSTEM_ADMIN"]
EMAIL_REGEX = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
PHONE_REGEX = r"^\d{3}-\d{6,8}$"


def validate_user_input(name, email, phone, password, role, is_update=False):
    if not name or not name.strip():
        return "Name is required"

    if not email or not email.strip():
        return "Email is required"

    if not re.match(EMAIL_REGEX, email.strip()):
        return "Invalid email format"

    if not phone or not phone.strip():
        return "Phone is required"

    if not re.match(PHONE_REGEX, phone.strip()):
        return "Phone number must be in XXX-XXXXXX format"

    if role not in ALLOWED_ROLES:
        return "Invalid role"

    if not is_update and not password:
        return "Password is required"

    if password and str(password).strip():
        if len(password) < 8 or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            return "Password must be at least 8 characters and include one special character"

    return None


@user_bp.route("/admin/users", methods=["GET"])
def admin_get_users():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT u.user_id, u.user_code, u.name, u.email, u.phone,
                   u.role, u.branch_id, b.branch_name, u.status
            FROM users u
            LEFT JOIN branch b ON u.branch_id = b.branch_id
            ORDER BY u.user_id
        """)

        users = [{
            "user_id": r[0],
            "user_code": r[1],
            "name": r[2],
            "email": r[3],
            "phone": r[4],
            "role": r[5],
            "branch_id": r[6],
            "branch_name": r[7],
            "status": r[8]
        } for r in cur.fetchall()]

        cur.close()
        conn.close()

        return jsonify(users), 200

    except Exception as e:
        print("ERROR /admin/users GET:", e)
        return jsonify({"message": str(e)}), 500


@user_bp.route("/admin/users/<int:user_id>", methods=["GET"])
def admin_get_single_user(user_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT u.user_id, u.user_code, u.name, u.email, u.phone,
                   u.role, u.branch_id, b.branch_name, u.status
            FROM users u
            LEFT JOIN branch b ON u.branch_id = b.branch_id
            WHERE u.user_id = %s
        """, (user_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "User not found"}), 404

        return jsonify({
            "user_id": row[0],
            "user_code": row[1],
            "name": row[2],
            "email": row[3],
            "phone": row[4],
            "role": row[5],
            "branch_id": row[6],
            "branch_name": row[7],
            "status": row[8]
        }), 200

    except Exception as e:
        print("ERROR /admin/users/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


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

        error = validate_user_input(name, email, phone, password, role)
        if error:
            return jsonify({"message": error}), 400

        name = name.strip().upper()
        email = email.strip().lower()
        phone = phone.strip()

        if role == "SYSTEM_ADMIN":
            branch_id = None
        elif branch_id is None:
            return jsonify({"message": "Branch is required for branch staff and inventory manager"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Email already exists"}), 400

        cur.execute("SELECT 1 FROM users WHERE phone = %s", (phone,))
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

        if role == "INVENTORY_MANAGER":
            cur.execute("""
                SELECT 1 FROM users
                WHERE branch_id = %s 
                  AND role = 'INVENTORY_MANAGER'
                  AND status = 'ACTIVE'
            """, (branch_id,))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({"message": "This branch already has an active manager"}), 400

        if role == "BRANCH_STAFF":
            cur.execute("""
                SELECT 1 FROM users
                WHERE branch_id = %s 
                  AND role = 'INVENTORY_MANAGER'
                  AND status = 'ACTIVE'
            """, (branch_id,))
            if not cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({
                    "message": "This branch must have an active manager before assigning staff"
                }), 400

        cur.execute("""
            INSERT INTO users (name, email, phone, password, role, branch_id, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'ACTIVE')
            RETURNING user_id, user_code
        """, (name, email, phone, password, role, branch_id))

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

        error = validate_user_input(name, email, phone, password, role, is_update=True)
        if error:
            return jsonify({"message": error}), 400

        name = name.strip().upper()
        email = email.strip().lower()
        phone = phone.strip()

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

        if not password or not str(password).strip():
            password = existing_user[1]

        if role == "SYSTEM_ADMIN":
            branch_id = None
        elif branch_id is None:
            cur.close()
            conn.close()
            return jsonify({"message": "Branch is required for branch staff and inventory manager"}), 400

        cur.execute("""
            SELECT 1 FROM users
            WHERE LOWER(email) = LOWER(%s)
              AND user_id <> %s
        """, (email, user_id))

        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Email already exists"}), 400

        cur.execute("""
            SELECT 1 FROM users
            WHERE phone = %s
              AND user_id <> %s
        """, (phone, user_id))

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

        if role == "INVENTORY_MANAGER":
            cur.execute("""
                SELECT 1 FROM users
                WHERE branch_id = %s
                  AND role = 'INVENTORY_MANAGER'
                  AND status = 'ACTIVE'
                  AND user_id <> %s
            """, (branch_id, user_id))

            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({"message": "This branch already has an active manager"}), 400

        if role == "BRANCH_STAFF":
            cur.execute("""
                SELECT 1 FROM users
                WHERE branch_id = %s
                  AND role = 'INVENTORY_MANAGER'
                  AND status = 'ACTIVE'
                  AND user_id <> %s
            """, (branch_id, user_id))

            if not cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({
                    "message": "This branch must have an active manager before assigning staff"
                }), 400

        cur.execute("""
            UPDATE users
            SET name = %s,
                email = %s,
                phone = %s,
                password = %s,
                role = %s,
                branch_id = %s
            WHERE user_id = %s
        """, (name, email, phone, password, role, branch_id, user_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "User updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/users PUT:", e)
        return jsonify({"message": str(e)}), 500


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


@user_bp.route("/admin/users/<int:user_id>/deactivate", methods=["PUT"])
def admin_deactivate_user(user_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE users
            SET status = 'INACTIVE'
            WHERE user_id = %s
            RETURNING user_id
        """, (user_id,))

        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "User not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "User deactivated successfully"}), 200

    except Exception as e:
        print("ERROR deactivate user:", e)
        return jsonify({"message": str(e)}), 500


@user_bp.route("/admin/users/<int:user_id>/activate", methods=["PUT"])
def admin_activate_user(user_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE users
            SET status = 'ACTIVE'
            WHERE user_id = %s
            RETURNING user_id
        """, (user_id,))

        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "User not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "User activated successfully"}), 200

    except Exception as e:
        print("ERROR activate user:", e)
        return jsonify({"message": str(e)}), 500