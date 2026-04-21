from flask import Flask, request, jsonify
from flask_cors import CORS
from psycopg2 import errors
from flask import Flask, send_from_directory
import os
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
# BASIC ROUTES
# =========================

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
# IMAGE PATH ROUTE
# =========================
@app.route('/images/products/<path:filename>')
def serve_product_image(filename):
    folder = os.path.join(app.root_path, 'static', 'images', 'products')
    return send_from_directory(folder, filename)

# =========================
# ADMIN DASHBOARD ROUTES
# =========================

# =========================
# USERS CRUD
# =========================
# =========================
# USERS CRUD
# =========================

# =========================
# ADMIN - GET ALL USERS
# =========================
@app.route("/admin/users", methods=["GET"])
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
@app.route("/admin/users/<int:user_id>", methods=["GET"])
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
@app.route("/admin/users", methods=["POST"])
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

        # Role and branch validation
        if role == "SYSTEM_ADMIN":
            branch_id = None
        else:
            if branch_id is None:
                return jsonify({"message": "Branch is required for branch staff and inventory manager"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check email unique
        cur.execute("SELECT 1 FROM users WHERE LOWER(email) = LOWER(%s)", (email.strip(),))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Email already exists"}), 400

        # Check phone unique
        cur.execute("SELECT 1 FROM users WHERE phone = %s", (phone.strip(),))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Phone number already exists"}), 400

        # Check branch exists for non-admin roles
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
@app.route("/admin/users/<int:user_id>", methods=["PUT"])
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

        # Check user exists
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

        # Keep old password if not provided
        if not password or not str(password).strip():
            password = existing_password
        else:
            if len(password) < 8 or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
                cur.close()
                conn.close()
                return jsonify({
                    "message": "Password must be at least 8 characters and include one special character"
                }), 400

        # Role and branch validation
        if role == "SYSTEM_ADMIN":
            branch_id = None
        else:
            if branch_id is None:
                cur.close()
                conn.close()
                return jsonify({"message": "Branch is required for branch staff and inventory manager"}), 400

        # Check email unique except itself
        cur.execute("""
            SELECT 1 FROM users
            WHERE LOWER(email) = LOWER(%s)
              AND user_id <> %s
        """, (email.strip(), user_id))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Email already exists"}), 400

        # Check phone unique except itself
        cur.execute("""
            SELECT 1 FROM users
            WHERE phone = %s
              AND user_id <> %s
        """, (phone.strip(), user_id))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Phone number already exists"}), 400

        # Check branch exists for non-admin roles
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
@app.route("/admin/users/<int:user_id>", methods=["DELETE"])
def admin_delete_user(user_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check user exists
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
    
# =========================
# BRANCH CRUD
# =========================

# =========================
# ADMIN - GET ALL BRANCHES
# =========================
@app.route("/admin/branches", methods=["GET"])
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
@app.route("/admin/branches/<int:branch_id>", methods=["GET"])
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
@app.route("/admin/branches", methods=["POST"])
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
@app.route("/admin/branches/<int:branch_id>", methods=["PUT"])
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
@app.route("/admin/branches/<int:branch_id>", methods=["DELETE"])
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

# =========================
# CATEGORY CRUD
# =========================
# =========================
# ADMIN - GET ALL CATEGORIES
# =========================
@app.route("/admin/categories", methods=["GET"])
def admin_get_categories():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT category_id, category_code, category_name, status
            FROM category
            ORDER BY category_id
        """)

        rows = cur.fetchall()

        categories = []
        for row in rows:
            categories.append({
                "category_id": row[0],
                "category_code": row[1],
                "category_name": row[2],
                "status": row[3]
            })

        cur.close()
        conn.close()

        return jsonify(categories), 200

    except Exception as e:
        print("ERROR /admin/categories GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - GET SINGLE CATEGORY
# =========================
@app.route("/admin/categories/<int:category_id>", methods=["GET"])
def admin_get_single_category(category_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT category_id, category_code, category_name, status
            FROM category
            WHERE category_id = %s
        """, (category_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "Category not found"}), 404

        category = {
            "category_id": row[0],
            "category_code": row[1],
            "category_name": row[2],
            "status": row[3]
        }

        return jsonify(category), 200

    except Exception as e:
        print("ERROR /admin/categories/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - ADD CATEGORY
# =========================
@app.route("/admin/categories", methods=["POST"])
def admin_add_category():
    try:
        data = request.get_json()

        category_name = data.get("category_name")
        status = data.get("status", "ACTIVE")

        if not category_name or not category_name.strip():
            return jsonify({"message": "Category name is required"}), 400

        if status not in ["ACTIVE", "INACTIVE"]:
            return jsonify({"message": "Invalid status"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Prevent duplicate category name
        cur.execute("""
            SELECT 1 FROM category
            WHERE LOWER(category_name) = LOWER(%s)
        """, (category_name.strip(),))

        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category name already exists"}), 400

        cur.execute("""
            INSERT INTO category (category_name, status)
            VALUES (%s, %s)
            RETURNING category_id, category_code
        """, (category_name.strip(), status))

        new_category = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Category added successfully",
            "category_id": new_category[0],
            "category_code": new_category[1]
        }), 201

    except Exception as e:
        print("ERROR /admin/categories POST:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - UPDATE CATEGORY
# =========================
@app.route("/admin/categories/<int:category_id>", methods=["PUT"])
def admin_update_category(category_id):
    try:
        data = request.get_json()

        category_name = data.get("category_name")
        status = data.get("status")

        if not category_name or not category_name.strip():
            return jsonify({"message": "Category name is required"}), 400

        if status not in ["ACTIVE", "INACTIVE"]:
            return jsonify({"message": "Invalid status"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM category WHERE category_id = %s", (category_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category not found"}), 404

        # Prevent duplicate category name except itself
        cur.execute("""
            SELECT 1 FROM category
            WHERE LOWER(category_name) = LOWER(%s)
              AND category_id <> %s
        """, (category_name.strip(), category_id))

        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category name already exists"}), 400

        cur.execute("""
            UPDATE category
            SET category_name = %s,
                status = %s
            WHERE category_id = %s
        """, (category_name.strip(), status, category_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Category updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/categories PUT:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - DELETE CATEGORY
# =========================
@app.route("/admin/categories/<int:category_id>", methods=["DELETE"])
def admin_delete_category(category_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check category exists
        cur.execute("SELECT 1 FROM category WHERE category_id = %s", (category_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category not found"}), 404

        # Prevent delete if category is used by product
        cur.execute("SELECT COUNT(*) FROM product WHERE category_id = %s", (category_id,))
        count = cur.fetchone()[0]

        if count > 0:
            cur.close()
            conn.close()
            return jsonify({
                "message": "Cannot delete category because it is assigned to existing products."
            }), 400

        cur.execute("DELETE FROM category WHERE category_id = %s", (category_id,))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "Category deleted successfully"}), 200

    except Exception as e:
        print("ERROR /admin/categories DELETE:", e)
        return jsonify({"message": str(e)}), 500

# ========================
# PRODUCT CRUD
# =========================

# =========================
# ADMIN - GET ALL PRODUCTS
# =========================
@app.route("/admin/products", methods=["GET"])
def admin_get_products():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT p.product_id, p.product_code, p.product_name,
                   p.category_id, c.category_name,
                   p.selling_price, p.reorder_level,
                   p.status, p.description, p.product_image
            FROM product p
            JOIN category c ON p.category_id = c.category_id
            ORDER BY p.product_id
        """)

        rows = cur.fetchall()

        products = []
        for row in rows:
            products.append({
                "product_id": row[0],
                "product_code": row[1],
                "product_name": row[2],
                "category_id": row[3],
                "category_name": row[4],
                "selling_price": float(row[5]),
                "reorder_level": row[6],
                "status": row[7],
                "description": row[8],
                "product_image": row[9]
            })

        cur.close()
        conn.close()

        return jsonify(products), 200

    except Exception as e:
        print("ERROR /admin/products GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - GET SINGLE PRODUCT
# =========================
@app.route("/admin/products/<int:product_id>", methods=["GET"])
def admin_get_single_product(product_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT p.product_id, p.product_code, p.product_name,
                   p.category_id, c.category_name,
                   p.selling_price, p.reorder_level,
                   p.status, p.description, p.product_image
            FROM product p
            JOIN category c ON p.category_id = c.category_id
            WHERE p.product_id = %s
        """, (product_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "Product not found"}), 404

        product = {
            "product_id": row[0],
            "product_code": row[1],
            "product_name": row[2],
            "category_id": row[3],
            "category_name": row[4],
            "selling_price": float(row[5]),
            "reorder_level": row[6],
            "status": row[7],
            "description": row[8],
            "product_image": row[9]
        }

        return jsonify(product), 200

    except Exception as e:
        print("ERROR /admin/products/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - ADD PRODUCT
# =========================
@app.route("/admin/products", methods=["POST"])
def admin_add_product():
    try:
        data = request.get_json()

        product_name = data.get("product_name")
        category_id = data.get("category_id")
        selling_price = data.get("selling_price")
        reorder_level = data.get("reorder_level")
        status = data.get("status")
        description = data.get("description")
        product_image = data.get("product_image", "/static/images/products/default.webp")

        if not product_name or not product_name.strip():
            return jsonify({"message": "Product name is required"}), 400

        if category_id is None:
            return jsonify({"message": "Category is required"}), 400

        if selling_price is None:
            return jsonify({"message": "Selling price is required"}), 400

        if reorder_level is None:
            return jsonify({"message": "Reorder level is required"}), 400

        if status not in ["ACTIVE", "INACTIVE"]:
            return jsonify({"message": "Invalid status"}), 400

        if float(selling_price) < 0:
            return jsonify({"message": "Selling price cannot be negative"}), 400

        if int(reorder_level) < 0:
            return jsonify({"message": "Reorder level cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check category exists
        cur.execute("SELECT 1 FROM category WHERE category_id = %s", (category_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category not found"}), 404

        # Prevent duplicate product name
        cur.execute("""
            SELECT 1 FROM product
            WHERE LOWER(product_name) = LOWER(%s)
        """, (product_name.strip(),))

        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product name already exists"}), 400

        cur.execute("""
            INSERT INTO product (
                product_name, category_id, selling_price,
                reorder_level, status, description, product_image
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING product_id, product_code
        """, (
            product_name.strip(),
            category_id,
            selling_price,
            reorder_level,
            status,
            description,
            product_image
        ))

        new_product = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Product added successfully",
            "product_id": new_product[0],
            "product_code": new_product[1]
        }), 201

    except Exception as e:
        print("ERROR /admin/products POST:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - UPDATE PRODUCT
# =========================
@app.route("/admin/products/<int:product_id>", methods=["PUT"])
def admin_update_product(product_id):
    try:
        data = request.get_json()

        product_name = data.get("product_name")
        category_id = data.get("category_id")
        selling_price = data.get("selling_price")
        reorder_level = data.get("reorder_level")
        status = data.get("status")
        description = data.get("description")
        product_image = data.get("product_image", "/static/images/products/default.webp")

        if not product_name or not product_name.strip():
            return jsonify({"message": "Product name is required"}), 400

        if category_id is None:
            return jsonify({"message": "Category is required"}), 400

        if selling_price is None:
            return jsonify({"message": "Selling price is required"}), 400

        if reorder_level is None:
            return jsonify({"message": "Reorder level is required"}), 400

        if status not in ["ACTIVE", "INACTIVE"]:
            return jsonify({"message": "Invalid status"}), 400

        if float(selling_price) < 0:
            return jsonify({"message": "Selling price cannot be negative"}), 400

        if int(reorder_level) < 0:
            return jsonify({"message": "Reorder level cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check product exists
        cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        # Check category exists
        cur.execute("SELECT 1 FROM category WHERE category_id = %s", (category_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category not found"}), 404

        # Prevent duplicate product name except itself
        cur.execute("""
            SELECT 1 FROM product
            WHERE LOWER(product_name) = LOWER(%s)
              AND product_id <> %s
        """, (product_name.strip(), product_id))

        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product name already exists"}), 400

        cur.execute("""
            UPDATE product
            SET product_name = %s,
                category_id = %s,
                selling_price = %s,
                reorder_level = %s,
                status = %s,
                description = %s,
                product_image = %s
            WHERE product_id = %s
        """, (
            product_name.strip(),
            category_id,
            selling_price,
            reorder_level,
            status,
            description,
            product_image,
            product_id
        ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Product updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/products PUT:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - DELETE PRODUCT
# =========================
@app.route("/admin/products/<int:product_id>", methods=["DELETE"])
def admin_delete_product(product_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check product exists
        cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        cur.execute("DELETE FROM product WHERE product_id = %s", (product_id,))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "Product deleted successfully"}), 200

    except Exception as e:
        print("ERROR /admin/products DELETE:", e)
        return jsonify({
            "message": "Cannot delete product. It may still be used by inventory, sale details, or transfer details."
        }), 400

# =========================
# INVENTORY CRUD
# =========================

# =========================
# ADMIN - GET ALL INVENTORY
# =========================
@app.route("/admin/inventory", methods=["GET"])
def admin_get_inventory():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT i.product_id,
                   p.product_code,
                   p.product_name,
                   i.branch_id,
                   b.branch_name,
                   i.quantity_in_stock,
                   i.last_updated
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            JOIN branch b ON i.branch_id = b.branch_id
            ORDER BY i.branch_id, i.product_id
        """)

        rows = cur.fetchall()

        inventory_list = []
        for row in rows:
            inventory_list.append({
                "product_id": row[0],
                "product_code": row[1],
                "product_name": row[2],
                "branch_id": row[3],
                "branch_name": row[4],
                "quantity_in_stock": row[5],
                "last_updated": row[6].isoformat() if row[6] else None
            })

        cur.close()
        conn.close()

        return jsonify(inventory_list), 200

    except Exception as e:
        print("ERROR /admin/inventory GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - GET SINGLE INVENTORY
# =========================
@app.route("/admin/inventory/<int:product_id>/<int:branch_id>", methods=["GET"])
def admin_get_single_inventory(product_id, branch_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT i.product_id,
                   p.product_code,
                   p.product_name,
                   i.branch_id,
                   b.branch_name,
                   i.quantity_in_stock,
                   i.last_updated
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            JOIN branch b ON i.branch_id = b.branch_id
            WHERE i.product_id = %s AND i.branch_id = %s
        """, (product_id, branch_id))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "Inventory record not found"}), 404

        inventory = {
            "product_id": row[0],
            "product_code": row[1],
            "product_name": row[2],
            "branch_id": row[3],
            "branch_name": row[4],
            "quantity_in_stock": row[5],
            "last_updated": row[6].isoformat() if row[6] else None
        }

        return jsonify(inventory), 200

    except Exception as e:
        print("ERROR /admin/inventory/<product_id>/<branch_id> GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - ADD INVENTORY
# =========================
@app.route("/admin/inventory", methods=["POST"])
def admin_add_inventory():
    try:
        data = request.get_json()

        product_id = data.get("product_id")
        branch_id = data.get("branch_id")
        quantity_in_stock = data.get("quantity_in_stock")

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if branch_id is None:
            return jsonify({"message": "Branch is required"}), 400

        if quantity_in_stock is None:
            return jsonify({"message": "Quantity in stock is required"}), 400

        if int(quantity_in_stock) < 0:
            return jsonify({"message": "Quantity in stock cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check product exists
        cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        # Check branch exists
        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Branch not found"}), 404

        # Prevent duplicate inventory record
        cur.execute("""
            SELECT 1
            FROM inventory
            WHERE product_id = %s AND branch_id = %s
        """, (product_id, branch_id))

        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Inventory record already exists for this product and branch"}), 400

        cur.execute("""
            INSERT INTO inventory (
                product_id, branch_id, quantity_in_stock, last_updated
            )
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
        """, (
            product_id,
            branch_id,
            quantity_in_stock
        ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Inventory added successfully"}), 201

    except Exception as e:
        print("ERROR /admin/inventory POST:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - UPDATE INVENTORY
# =========================
@app.route("/admin/inventory/<int:product_id>/<int:branch_id>", methods=["PUT"])
def admin_update_inventory(product_id, branch_id):
    try:
        data = request.get_json()

        quantity_in_stock = data.get("quantity_in_stock")

        if quantity_in_stock is None:
            return jsonify({"message": "Quantity in stock is required"}), 400

        if int(quantity_in_stock) < 0:
            return jsonify({"message": "Quantity in stock cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check inventory exists
        cur.execute("""
            SELECT 1
            FROM inventory
            WHERE product_id = %s AND branch_id = %s
        """, (product_id, branch_id))

        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Inventory record not found"}), 404

        cur.execute("""
            UPDATE inventory
            SET quantity_in_stock = %s,
                last_updated = CURRENT_TIMESTAMP
            WHERE product_id = %s AND branch_id = %s
        """, (
            quantity_in_stock,
            product_id,
            branch_id
        ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Inventory updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/inventory PUT:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - DELETE INVENTORY
# =========================
@app.route("/admin/inventory/<int:product_id>/<int:branch_id>", methods=["DELETE"])
def admin_delete_inventory(product_id, branch_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check inventory exists
        cur.execute("""
            SELECT 1
            FROM inventory
            WHERE product_id = %s AND branch_id = %s
        """, (product_id, branch_id))

        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Inventory record not found"}), 404

        cur.execute("""
            DELETE FROM inventory
            WHERE product_id = %s AND branch_id = %s
        """, (product_id, branch_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Inventory deleted successfully"}), 200

    except Exception as e:
        print("ERROR /admin/inventory DELETE:", e)
        return jsonify({"message": str(e)}), 500

# =========================
# SALE CRUD
# =========================

# =========================
# ADMIN - GET ALL SALES
# =========================
@app.route("/admin/sales", methods=["GET"])
def admin_get_sales():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT s.sale_id, s.sale_code, s.user_id, u.name,
                   s.branch_id, b.branch_name,
                   s.sale_date, s.total_amount, s.payment_method
            FROM sale s
            JOIN users u ON s.user_id = u.user_id
            JOIN branch b ON s.branch_id = b.branch_id
            ORDER BY s.sale_id
        """)

        rows = cur.fetchall()

        sales = []
        for row in rows:
            sales.append({
                "sale_id": row[0],
                "sale_code": row[1],
                "user_id": row[2],
                "user_name": row[3],
                "branch_id": row[4],
                "branch_name": row[5],
                "sale_date": row[6].isoformat() if row[6] else None,
                "total_amount": float(row[7]),
                "payment_method": row[8]
            })

        cur.close()
        conn.close()

        return jsonify(sales), 200

    except Exception as e:
        print("ERROR /admin/sales GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - GET SINGLE SALE
# =========================
@app.route("/admin/sales/<int:sale_id>", methods=["GET"])
def admin_get_single_sale(sale_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT s.sale_id, s.sale_code, s.user_id, u.name,
                   s.branch_id, b.branch_name,
                   s.sale_date, s.total_amount, s.payment_method
            FROM sale s
            JOIN users u ON s.user_id = u.user_id
            JOIN branch b ON s.branch_id = b.branch_id
            WHERE s.sale_id = %s
        """, (sale_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "Sale not found"}), 404

        sale = {
            "sale_id": row[0],
            "sale_code": row[1],
            "user_id": row[2],
            "user_name": row[3],
            "branch_id": row[4],
            "branch_name": row[5],
            "sale_date": row[6].isoformat() if row[6] else None,
            "total_amount": float(row[7]),
            "payment_method": row[8]
        }

        return jsonify(sale), 200

    except Exception as e:
        print("ERROR /admin/sales/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - ADD SALE
# =========================
@app.route("/admin/sales", methods=["POST"])
def admin_add_sale():
    try:
        data = request.get_json()

        user_id = data.get("user_id")
        branch_id = data.get("branch_id")
        total_amount = data.get("total_amount")
        payment_method = data.get("payment_method")
        sale_date = data.get("sale_date")

        allowed_payment_methods = ["CASH", "CARD", "E_WALLET"]

        if user_id is None:
            return jsonify({"message": "User is required"}), 400

        if branch_id is None:
            return jsonify({"message": "Branch is required"}), 400

        if total_amount is None:
            return jsonify({"message": "Total amount is required"}), 400

        if payment_method not in allowed_payment_methods:
            return jsonify({"message": "Invalid payment method"}), 400

        if float(total_amount) < 0:
            return jsonify({"message": "Total amount cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check user exists
        cur.execute("""
            SELECT user_id, role, branch_id
            FROM users
            WHERE user_id = %s
        """, (user_id,))
        user_row = cur.fetchone()

        if not user_row:
            cur.close()
            conn.close()
            return jsonify({"message": "User not found"}), 404

        # Check branch exists
        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Branch not found"}), 404

        # Optional business rule:
        # Branch staff / inventory manager can only create sales for their own branch
        user_role = user_row[1]
        user_branch_id = user_row[2]

        if user_role in ["BRANCH_STAFF", "INVENTORY_MANAGER"] and user_branch_id != branch_id:
            cur.close()
            conn.close()
            return jsonify({
                "message": "Selected user does not belong to this branch"
            }), 400

        if sale_date:
            cur.execute("""
                INSERT INTO sale (user_id, branch_id, sale_date, total_amount, payment_method)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING sale_id, sale_code
            """, (
                user_id,
                branch_id,
                sale_date,
                total_amount,
                payment_method
            ))
        else:
            cur.execute("""
                INSERT INTO sale (user_id, branch_id, sale_date, total_amount, payment_method)
                VALUES (%s, %s, CURRENT_TIMESTAMP, %s, %s)
                RETURNING sale_id, sale_code
            """, (
                user_id,
                branch_id,
                total_amount,
                payment_method
            ))

        new_sale = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Sale added successfully",
            "sale_id": new_sale[0],
            "sale_code": new_sale[1]
        }), 201

    except Exception as e:
        print("ERROR /admin/sales POST:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - UPDATE SALE
# =========================
@app.route("/admin/sales/<int:sale_id>", methods=["PUT"])
def admin_update_sale(sale_id):
    try:
        data = request.get_json()

        user_id = data.get("user_id")
        branch_id = data.get("branch_id")
        total_amount = data.get("total_amount")
        payment_method = data.get("payment_method")
        sale_date = data.get("sale_date")

        allowed_payment_methods = ["CASH", "CARD", "E_WALLET"]

        if user_id is None:
            return jsonify({"message": "User is required"}), 400

        if branch_id is None:
            return jsonify({"message": "Branch is required"}), 400

        if total_amount is None:
            return jsonify({"message": "Total amount is required"}), 400

        if payment_method not in allowed_payment_methods:
            return jsonify({"message": "Invalid payment method"}), 400

        if float(total_amount) < 0:
            return jsonify({"message": "Total amount cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check sale exists
        cur.execute("SELECT 1 FROM sale WHERE sale_id = %s", (sale_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Sale not found"}), 404

        # Check user exists
        cur.execute("""
            SELECT user_id, role, branch_id
            FROM users
            WHERE user_id = %s
        """, (user_id,))
        user_row = cur.fetchone()

        if not user_row:
            cur.close()
            conn.close()
            return jsonify({"message": "User not found"}), 404

        # Check branch exists
        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Branch not found"}), 404

        # Optional business rule:
        # Branch staff / inventory manager can only create sales for their own branch
        user_role = user_row[1]
        user_branch_id = user_row[2]

        if user_role in ["BRANCH_STAFF", "INVENTORY_MANAGER"] and user_branch_id != branch_id:
            cur.close()
            conn.close()
            return jsonify({
                "message": "Selected user does not belong to this branch"
            }), 400

        if sale_date:
            cur.execute("""
                UPDATE sale
                SET user_id = %s,
                    branch_id = %s,
                    sale_date = %s,
                    total_amount = %s,
                    payment_method = %s
                WHERE sale_id = %s
            """, (
                user_id,
                branch_id,
                sale_date,
                total_amount,
                payment_method,
                sale_id
            ))
        else:
            cur.execute("""
                UPDATE sale
                SET user_id = %s,
                    branch_id = %s,
                    total_amount = %s,
                    payment_method = %s
                WHERE sale_id = %s
            """, (
                user_id,
                branch_id,
                total_amount,
                payment_method,
                sale_id
            ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Sale updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/sales PUT:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - DELETE SALE
# =========================
@app.route("/admin/sales/<int:sale_id>", methods=["DELETE"])
def admin_delete_sale(sale_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check sale exists
        cur.execute("SELECT 1 FROM sale WHERE sale_id = %s", (sale_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Sale not found"}), 404

        cur.execute("DELETE FROM sale WHERE sale_id = %s", (sale_id,))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "Sale deleted successfully"}), 200

    except Exception as e:
        print("ERROR /admin/sales DELETE:", e)
        return jsonify({
            "message": "Cannot delete sale. It may still be used by sale details."
        }), 400
    
# =========================
# SALE DETAIL CRUD
# =========================

# =========================
# ADMIN - GET ALL SALE DETAILS
# =========================
@app.route("/admin/sale-details", methods=["GET"])
def admin_get_sale_details():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT sd.detail_id, sd.sale_id, s.sale_code,
                   sd.product_id, p.product_code, p.product_name,
                   sd.quantity, sd.unit_price, sd.subtotal
            FROM sale_detail sd
            JOIN sale s ON sd.sale_id = s.sale_id
            JOIN product p ON sd.product_id = p.product_id
            ORDER BY sd.detail_id
        """)

        rows = cur.fetchall()

        sale_details = []
        for row in rows:
            sale_details.append({
                "detail_id": row[0],
                "sale_id": row[1],
                "sale_code": row[2],
                "product_id": row[3],
                "product_code": row[4],
                "product_name": row[5],
                "quantity": row[6],
                "unit_price": float(row[7]),
                "subtotal": float(row[8])
            })

        cur.close()
        conn.close()

        return jsonify(sale_details), 200

    except Exception as e:
        print("ERROR /admin/sale-details GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - GET SINGLE SALE DETAIL
# =========================
@app.route("/admin/sale-details/<int:detail_id>", methods=["GET"])
def admin_get_single_sale_detail(detail_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT sd.detail_id, sd.sale_id, s.sale_code,
                   sd.product_id, p.product_code, p.product_name,
                   sd.quantity, sd.unit_price, sd.subtotal
            FROM sale_detail sd
            JOIN sale s ON sd.sale_id = s.sale_id
            JOIN product p ON sd.product_id = p.product_id
            WHERE sd.detail_id = %s
        """, (detail_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "Sale detail not found"}), 404

        sale_detail = {
            "detail_id": row[0],
            "sale_id": row[1],
            "sale_code": row[2],
            "product_id": row[3],
            "product_code": row[4],
            "product_name": row[5],
            "quantity": row[6],
            "unit_price": float(row[7]),
            "subtotal": float(row[8])
        }

        return jsonify(sale_detail), 200

    except Exception as e:
        print("ERROR /admin/sale-details/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - GET SALE DETAILS BY SALE ID
# =========================
@app.route("/admin/sales/<int:sale_id>/details", methods=["GET"])
def admin_get_sale_details_by_sale_id(sale_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check sale exists
        cur.execute("SELECT sale_id, sale_code FROM sale WHERE sale_id = %s", (sale_id,))
        sale_row = cur.fetchone()

        if not sale_row:
            cur.close()
            conn.close()
            return jsonify({"message": "Sale not found"}), 404

        cur.execute("""
            SELECT sd.detail_id, sd.sale_id,
                   sd.product_id, p.product_code, p.product_name,
                   sd.quantity, sd.unit_price, sd.subtotal
            FROM sale_detail sd
            JOIN product p ON sd.product_id = p.product_id
            WHERE sd.sale_id = %s
            ORDER BY sd.detail_id
        """, (sale_id,))

        rows = cur.fetchall()

        sale_details = []
        for row in rows:
            sale_details.append({
                "detail_id": row[0],
                "sale_id": row[1],
                "product_id": row[2],
                "product_code": row[3],
                "product_name": row[4],
                "quantity": row[5],
                "unit_price": float(row[6]),
                "subtotal": float(row[7])
            })

        cur.close()
        conn.close()

        return jsonify({
            "sale_id": sale_row[0],
            "sale_code": sale_row[1],
            "details": sale_details
        }), 200

    except Exception as e:
        print("ERROR /admin/sales/<sale_id>/details GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - ADD SALE DETAIL
# UPGRADED LOGIC
# =========================
@app.route("/admin/sale-details", methods=["POST"])
def admin_add_sale_detail():
    try:
        data = request.get_json()

        sale_id = data.get("sale_id")
        product_id = data.get("product_id")
        quantity = data.get("quantity")
        unit_price = data.get("unit_price")

        if sale_id is None:
            return jsonify({"message": "Sale is required"}), 400

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if quantity is None:
            return jsonify({"message": "Quantity is required"}), 400

        if unit_price is None:
            return jsonify({"message": "Unit price is required"}), 400

        if int(quantity) <= 0:
            return jsonify({"message": "Quantity must be greater than 0"}), 400

        if float(unit_price) < 0:
            return jsonify({"message": "Unit price cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check sale exists
        cur.execute("SELECT 1 FROM sale WHERE sale_id = %s", (sale_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Sale not found"}), 404

        # Check product exists
        cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        # Check if same product already exists in this sale
        cur.execute("""
            SELECT detail_id, quantity, unit_price
            FROM sale_detail
            WHERE sale_id = %s AND product_id = %s
        """, (sale_id, product_id))

        existing_row = cur.fetchone()

        if existing_row:
            detail_id = existing_row[0]
            old_quantity = existing_row[1]

            new_quantity = old_quantity + int(quantity)
            new_subtotal = float(new_quantity) * float(unit_price)

            cur.execute("""
                UPDATE sale_detail
                SET quantity = %s,
                    unit_price = %s,
                    subtotal = %s
                WHERE detail_id = %s
            """, (
                new_quantity,
                unit_price,
                new_subtotal,
                detail_id
            ))

            conn.commit()
            cur.close()
            conn.close()

            return jsonify({
                "message": "Sale detail already exists, quantity updated successfully",
                "detail_id": detail_id,
                "quantity": new_quantity,
                "unit_price": float(unit_price),
                "subtotal": new_subtotal
            }), 200

        else:
            subtotal = float(quantity) * float(unit_price)

            cur.execute("""
                INSERT INTO sale_detail (sale_id, product_id, quantity, unit_price, subtotal)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING detail_id
            """, (
                sale_id,
                product_id,
                quantity,
                unit_price,
                subtotal
            ))

            new_detail = cur.fetchone()

            conn.commit()
            cur.close()
            conn.close()

            return jsonify({
                "message": "Sale detail added successfully",
                "detail_id": new_detail[0],
                "quantity": int(quantity),
                "unit_price": float(unit_price),
                "subtotal": subtotal
            }), 201

    except Exception as e:
        print("ERROR /admin/sale-details POST:", e)
        return jsonify({"message": str(e)}), 500



# =========================
# ADMIN - UPDATE SALE DETAIL
# =========================
@app.route("/admin/sale-details/<int:detail_id>", methods=["PUT"])
def admin_update_sale_detail(detail_id):
    try:
        data = request.get_json()

        sale_id = data.get("sale_id")
        product_id = data.get("product_id")
        quantity = data.get("quantity")
        unit_price = data.get("unit_price")

        if sale_id is None:
            return jsonify({"message": "Sale is required"}), 400

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if quantity is None:
            return jsonify({"message": "Quantity is required"}), 400

        if unit_price is None:
            return jsonify({"message": "Unit price is required"}), 400

        if int(quantity) <= 0:
            return jsonify({"message": "Quantity must be greater than 0"}), 400

        if float(unit_price) < 0:
            return jsonify({"message": "Unit price cannot be negative"}), 400

        subtotal = float(quantity) * float(unit_price)

        conn = get_connection()
        cur = conn.cursor()

        # Check sale detail exists
        cur.execute("SELECT 1 FROM sale_detail WHERE detail_id = %s", (detail_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Sale detail not found"}), 404

        # Check sale exists
        cur.execute("SELECT 1 FROM sale WHERE sale_id = %s", (sale_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Sale not found"}), 404

        # Check product exists
        cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        cur.execute("""
            UPDATE sale_detail
            SET sale_id = %s,
                product_id = %s,
                quantity = %s,
                unit_price = %s,
                subtotal = %s
            WHERE detail_id = %s
        """, (
            sale_id,
            product_id,
            quantity,
            unit_price,
            subtotal,
            detail_id
        ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Sale detail updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/sale-details PUT:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN - DELETE SALE DETAIL
# =========================
@app.route("/admin/sale-details/<int:detail_id>", methods=["DELETE"])
def admin_delete_sale_detail(detail_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check sale detail exists
        cur.execute("SELECT 1 FROM sale_detail WHERE detail_id = %s", (detail_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Sale detail not found"}), 404

        cur.execute("DELETE FROM sale_detail WHERE detail_id = %s", (detail_id,))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "Sale detail deleted successfully"}), 200

    except Exception as e:
        print("ERROR /admin/sale-details DELETE:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# RUN SERVER
# =========================
if __name__ == "__main__":
    app.run(debug=True)


