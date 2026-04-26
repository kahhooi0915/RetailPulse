from flask import Blueprint, request, jsonify
from db import get_connection

product_bp = Blueprint("product_bp", __name__)


# =========================
# ADMIN - GET ALL PRODUCTS
# =========================
@product_bp.route("/admin/products", methods=["GET"])
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
@product_bp.route("/admin/products/<int:product_id>", methods=["GET"])
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
@product_bp.route("/admin/products", methods=["POST"])
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

        cur.execute("SELECT 1 FROM category WHERE category_id = %s", (category_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category not found"}), 404

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
@product_bp.route("/admin/products/<int:product_id>", methods=["PUT"])
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

        cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        cur.execute("SELECT 1 FROM category WHERE category_id = %s", (category_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Category not found"}), 404

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
@product_bp.route("/admin/products/<int:product_id>", methods=["DELETE"])
def admin_delete_product(product_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

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