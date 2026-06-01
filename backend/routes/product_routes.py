import psycopg2
from flask import Blueprint, request, jsonify
from db import get_connection

product_bp = Blueprint("product_bp", __name__)
DEFAULT_PRODUCT_IMAGE_URL = "/static/images/products/default.webp"

# Generate image URL for frontend display
def get_product_image_url(product_id, has_image):
    if has_image:
        return f"/admin/products/{product_id}/image"
    return DEFAULT_PRODUCT_IMAGE_URL

@product_bp.route("/admin/products", methods=["GET"])
def admin_get_products():
    try:
        available_only = request.args.get("available") in ["1", "true", "TRUE", "yes"]

        conn = get_connection()
        cur = conn.cursor()

        query = """
            SELECT p.product_id, p.product_code, p.product_name,
                   p.category_id, c.category_name,
                   p.selling_price, p.reorder_level,
                   p.status, p.description,
                   CASE WHEN p.product_image_data IS NOT NULL THEN TRUE ELSE FALSE END AS has_image,
                   c.status AS category_status
            FROM product p
            JOIN category c ON p.category_id = c.category_id
        """

        if available_only:
            query += """
            WHERE p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
            """

        query += " ORDER BY p.product_id"

        cur.execute(query)

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
                "has_image": row[9],
                "product_image": get_product_image_url(row[0], row[9]),
                "category_status": row[10]
            })

        cur.close()
        conn.close()
        return jsonify(products), 200

    except Exception as e:
        print("ERROR /admin/products GET:", e)
        return jsonify({"message": str(e)}), 500


@product_bp.route("/admin/products/<int:product_id>", methods=["GET"])
def admin_get_single_product(product_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT p.product_id, p.product_code, p.product_name,
                   p.category_id, c.category_name,
                   p.selling_price, p.reorder_level,
                   p.status, p.description,
                   CASE WHEN p.product_image_data IS NOT NULL THEN TRUE ELSE FALSE END AS has_image,
                   c.status AS category_status
            FROM product p
            JOIN category c ON p.category_id = c.category_id
            WHERE p.product_id = %s
        """, (product_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"message": "Product not found"}), 404

        return jsonify({
            "product_id": row[0],
            "product_code": row[1],
            "product_name": row[2],
            "category_id": row[3],
            "category_name": row[4],
            "selling_price": float(row[5]),
            "reorder_level": row[6],
            "status": row[7],
            "description": row[8],
            "has_image": row[9],
            "product_image": get_product_image_url(row[0], row[9]),
            "category_status": row[10]
        }), 200

    except Exception as e:
        print("ERROR /admin/products/<id> GET:", e)
        return jsonify({"message": str(e)}), 500


@product_bp.route("/admin/products", methods=["POST"])
def admin_add_product():
    conn = None
    cur = None

    try:
        product_name = request.form.get("product_name")
        category_id = request.form.get("category_id")
        selling_price = request.form.get("selling_price")
        reorder_level = request.form.get("reorder_level")
        status = request.form.get("status")
        description = request.form.get("description")
        image_file = request.files.get("product_image")

        if not product_name or not product_name.strip():
            return jsonify({"message": "Product name is required"}), 400

        if not category_id:
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

        image_data = None
        image_mime = None

        if image_file and image_file.filename:
            image_data = image_file.read()
            image_mime = image_file.mimetype

            if image_mime not in ["image/png", "image/jpeg", "image/jpg", "image/webp"]:
                return jsonify({"message": "Only PNG, JPG, JPEG, and WEBP images are allowed"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM category WHERE category_id = %s", (category_id,))
        if not cur.fetchone():
            return jsonify({"message": "Category not found"}), 404

        cur.execute("""
            SELECT 1 FROM product
            WHERE LOWER(product_name) = LOWER(%s)
        """, (product_name.strip(),))

        if cur.fetchone():
            return jsonify({"message": "Product name already exists"}), 400

        cur.execute("""
            INSERT INTO product (
                product_name, category_id, selling_price,
                reorder_level, status, description,
                product_image_data, product_image_mime
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING product_id, product_code
        """, (
            product_name.strip(),
            category_id,
            selling_price,
            reorder_level,
            status,
            description,
            psycopg2.Binary(image_data) if image_data else None,
            image_mime
        ))

        new_product = cur.fetchone()
        new_product_id = new_product[0]
        new_product_code = new_product[1]

        # Inventory initialization added:
        # Every newly created product starts with 0 stock in all existing branches.
        cur.execute("""
            INSERT INTO inventory (
                product_id,
                branch_id,
                quantity_in_stock
            )
            SELECT
                %s,
                b.branch_id,
                0
            FROM branch b
            ON CONFLICT (product_id, branch_id) DO NOTHING
        """, (new_product_id,))

        conn.commit()

        return jsonify({
            "message": "Product created successfully and inventory initialized.",
            "product_id": new_product_id,
            "product_code": new_product_code
        }), 201

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR /admin/products POST:", e)
        return jsonify({"message": str(e)}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@product_bp.route("/admin/products/<int:product_id>", methods=["PUT"])
def admin_update_product(product_id):
    try:
        product_name = request.form.get("product_name")
        category_id = request.form.get("category_id")
        selling_price = request.form.get("selling_price")
        reorder_level = request.form.get("reorder_level")
        status = request.form.get("status")
        description = request.form.get("description")
        image_file = request.files.get("product_image")

        if not product_name or not product_name.strip():
            return jsonify({"message": "Product name is required"}), 400

        if not category_id:
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

        if image_file and image_file.filename:
            image_data = image_file.read()
            image_mime = image_file.mimetype

            if image_mime not in ["image/png", "image/jpeg", "image/jpg", "image/webp"]:
                cur.close()
                conn.close()
                return jsonify({"message": "Only PNG, JPG, JPEG, and WEBP images are allowed"}), 400

            cur.execute("""
                UPDATE product
                SET product_name = %s,
                    category_id = %s,
                    selling_price = %s,
                    reorder_level = %s,
                    status = %s,
                    description = %s,
                    product_image_data = %s,
                    product_image_mime = %s
                WHERE product_id = %s
            """, (
                product_name.strip(),
                category_id,
                selling_price,
                reorder_level,
                status,
                description,
                psycopg2.Binary(image_data),
                image_mime,
                product_id
            ))
        else:
            cur.execute("""
                UPDATE product
                SET product_name = %s,
                    category_id = %s,
                    selling_price = %s,
                    reorder_level = %s,
                    status = %s,
                    description = %s
                WHERE product_id = %s
            """, (
                product_name.strip(),
                category_id,
                selling_price,
                reorder_level,
                status,
                description,
                product_id
            ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Product updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/products PUT:", e)
        return jsonify({"message": str(e)}), 500


@product_bp.route("/admin/products/<int:product_id>/image", methods=["GET"])
def admin_get_product_image(product_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT product_image_data, product_image_mime
            FROM product
            WHERE product_id = %s
        """, (product_id,))

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row or not row[0]:
            return jsonify({"message": "Image not found"}), 404

        return bytes(row[0]), 200, {
            "Content-Type": row[1] or "image/jpeg"
        }

    except Exception as e:
        print("ERROR /admin/products/<id>/image:", e)
        return jsonify({"message": str(e)}), 500


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

    except Exception:
        return jsonify({
            "message": "Cannot delete product. It may still be used by inventory, sale details, or transfer details."
        }), 400

# =========================
# ADMIN - UPDATE PRODUCT REORDER LEVEL
# =========================
@product_bp.route("/admin/products/<int:product_id>/reorder-level", methods=["PUT"])
def admin_update_product_reorder_level(product_id):
    try:
        data = request.get_json()
        reorder_level = data.get("reorder_level")

        if reorder_level is None:
            return jsonify({"message": "Reorder level is required"}), 400

        if int(reorder_level) < 0:
            return jsonify({"message": "Reorder level cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        cur.execute("""
            UPDATE product
            SET reorder_level = %s
            WHERE product_id = %s
        """, (int(reorder_level), product_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Reorder level updated successfully"}), 200

    except Exception as e:
        print("ERROR /admin/products/<id>/reorder-level PUT:", e)
        return jsonify({"message": str(e)}), 500
    
 
