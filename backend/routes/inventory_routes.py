from flask import Blueprint, request, jsonify
from db import get_connection

inventory_bp = Blueprint("inventory_bp", __name__)


# =========================
# ADMIN - GET ALL INVENTORY
# =========================
@inventory_bp.route("/admin/inventory", methods=["GET"])
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
@inventory_bp.route("/admin/inventory/<int:product_id>/<int:branch_id>", methods=["GET"])
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
@inventory_bp.route("/admin/inventory", methods=["POST"])
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

        cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        cur.execute("SELECT 1 FROM branch WHERE branch_id = %s", (branch_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Branch not found"}), 404

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
@inventory_bp.route("/admin/inventory/<int:product_id>/<int:branch_id>", methods=["PUT"])
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
@inventory_bp.route("/admin/inventory/<int:product_id>/<int:branch_id>", methods=["DELETE"])
def admin_delete_inventory(product_id, branch_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

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