from flask import Blueprint, request, jsonify
from db import get_connection

category_bp = Blueprint("category_bp", __name__)


# =========================
# ADMIN - GET ALL CATEGORIES
# =========================
@category_bp.route("/admin/categories", methods=["GET"])
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
@category_bp.route("/admin/categories/<int:category_id>", methods=["GET"])
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
@category_bp.route("/admin/categories", methods=["POST"])
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
@category_bp.route("/admin/categories/<int:category_id>", methods=["PUT"])
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
@category_bp.route("/admin/categories/<int:category_id>", methods=["DELETE"])
def admin_delete_category(category_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM category WHERE category_id = %s", (category_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category not found"}), 404

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