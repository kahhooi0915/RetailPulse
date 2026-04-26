from flask import Blueprint, request, jsonify
import re

from db import get_connection

auth_bp = Blueprint("auth_bp", __name__)


# =========================
# GET BRANCHES (for dropdown)
# =========================
@auth_bp.route("/branches", methods=["GET"])
def get_branches():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT branch_id, branch_name
            FROM branch
            ORDER BY branch_name
        """)

        rows = cur.fetchall()

        branches = []
        for row in rows:
            branches.append({
                "branch_id": row[0],
                "branch_name": row[1]
            })

        cur.close()
        conn.close()

        return jsonify(branches), 200

    except Exception as e:
        print("ERROR /branches:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# REGISTER
# =========================
@auth_bp.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json()

        name = data.get("name")
        email = data.get("email")
        phone = data.get("phone")
        password = data.get("password")
        role = data.get("role")
        branch_id = data.get("branch_id")

        if not all([name, email, phone, password, role, branch_id]):
            return jsonify({"message": "All fields are required"}), 400

        if role not in ["BRANCH_STAFF", "INVENTORY_MANAGER"]:
            return jsonify({"message": "Invalid role selected"}), 400

        if len(password) < 8 or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            return jsonify({
                "message": "Password must be at least 8 characters and include one special character"
            }), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "This email is already registered."}), 400

        cur.execute("SELECT 1 FROM users WHERE phone = %s", (phone,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "This phone number is already registered."}), 400

        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Selected branch does not exist."}), 400

        cur.execute("""
            INSERT INTO users (name, email, phone, password, role, branch_id)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (name, email, phone, password, role, branch_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Account created successfully."}), 201

    except Exception as e:
        print("ERROR /register:", e)
        return jsonify({"message": "Registration failed. Please try again."}), 500


# =========================
# LOGIN
# =========================
@auth_bp.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json()

        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return jsonify({"message": "Email and password required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT u.user_id, u.name, u.email, u.role,
                   u.branch_id, b.branch_name
            FROM users u
            LEFT JOIN branch b ON u.branch_id = b.branch_id
            WHERE u.email = %s AND u.password = %s
        """, (email, password))

        user = cur.fetchone()

        cur.close()
        conn.close()

        if user:
            return jsonify({
                "user_id": user[0],
                "name": user[1],
                "email": user[2],
                "role": user[3],
                "branch_id": user[4],
                "branch_name": user[5]
            }), 200
        else:
            return jsonify({"message": "Invalid email or password"}), 401

    except Exception as e:
        print("ERROR /login:", e)
        return jsonify({"message": str(e)}), 500
