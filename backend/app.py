from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import re

app = Flask(__name__)
CORS(app)

def get_connection():
    return psycopg2.connect(
        host="localhost",
        database="retailpulse",
        user="postgres",
        password="1234",
        port="5432"
    )

@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")

    if not name or not email or not password or not role:
        return jsonify({"message": "All fields are required"}), 400

    if len(password) < 8 or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return jsonify({
            "message": "Password must be at least 8 characters and include one special character"
        }), 400

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT * FROM users WHERE email = %s", (email,))
    existing_user = cur.fetchone()

    if existing_user:
        cur.close()
        conn.close()
        return jsonify({"message": "Email already exists"}), 400

    cur.execute("""
        INSERT INTO users (name, email, password, role)
        VALUES (%s, %s, %s, %s)
    """, (name, email, password, role))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"message": "User registered successfully"}), 201

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"message": "Email and password required"}), 400

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT user_id, user_code, name, email, role
        FROM users
        WHERE email = %s AND password = %s
    """, (email, password))

    user = cur.fetchone()

    cur.close()
    conn.close()

    if user:
        return jsonify({
            "message": "Login successful",
            "user_id": user[0],
            "user_code": user[1],
            "name": user[2],
            "email": user[3],
            "role": user[4]
        }), 200

    return jsonify({"message": "Invalid email or password"}), 401

if __name__ == "__main__":
    app.run(debug=True)