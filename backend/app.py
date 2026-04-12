from flask import Flask, request, jsonify
from flask_cors import CORS
from psycopg2 import errors
import psycopg2
import re

app = Flask(__name__)
CORS(app)


# =========================
# DATABASE CONNECTION
# =========================
def get_connection():
    return psycopg2.connect(
        host="localhost",
        database="retailpulse",   # CHANGE THIS
        user="postgres",   # CHANGE THIS
        password="1234",  # CHANGE THIS
        port="5432"
    )


# =========================
# TEST ROUTE
# =========================
@app.route("/")
def home():
    return "Backend is running"


# =========================
# GET BRANCHES (for dropdown)
# =========================
@app.route("/branches", methods=["GET"])
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
@app.route("/register", methods=["POST"])
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
@app.route("/login", methods=["POST"])
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
            SELECT user_id, name, email, role
            FROM users
            WHERE email = %s AND password = %s
        """, (email, password))

        user = cur.fetchone()

        cur.close()
        conn.close()

        if user:
            return jsonify({
                "user_id": user[0],
                "name": user[1],
                "email": user[2],
                "role": user[3]
            }), 200
        else:
            return jsonify({"message": "Invalid email or password"}), 401

    except Exception as e:
        print("ERROR /login:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# RUN SERVER
# =========================
if __name__ == "__main__":
    app.run(debug=True)