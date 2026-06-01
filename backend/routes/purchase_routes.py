from flask import Blueprint, request, jsonify
from db import get_connection

purchase_bp = Blueprint("purchase_bp", __name__)

ACTIVE_PURCHASE_STATUSES = ("PENDING", "ORDERED")


def normalize_bool(value):
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "preferred")

    return bool(value)


def find_active_purchase_for_product_branch(cur, product_id, branch_id):
    cur.execute("""
        SELECT po.purchase_id,
               po.purchase_code,
               po.status
        FROM purchase po
        JOIN purchase_detail pd ON po.purchase_id = pd.purchase_id
        WHERE po.branch_id = %s
          AND pd.product_id = %s
          AND po.status IN %s
        ORDER BY po.purchase_id DESC
        LIMIT 1
    """, (branch_id, product_id, ACTIVE_PURCHASE_STATUSES))

    return cur.fetchone()


# =========================================================
# SUPPLIER MANAGEMENT
# =========================================================

@purchase_bp.route("/admin/suppliers", methods=["GET"])
def get_suppliers():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT supplier_id,
                   supplier_code,
                   supplier_name,
                   contact_person,
                   phone,
                   email,
                   address,
                   status
            FROM supplier
            ORDER BY supplier_id
        """)

        rows = cur.fetchall()

        suppliers = []
        for row in rows:
            suppliers.append({
                "supplier_id": row[0],
                "supplier_code": row[1],
                "supplier_name": row[2],
                "contact_person": row[3],
                "phone": row[4],
                "email": row[5],
                "address": row[6],
                "status": row[7]
            })

        cur.close()
        conn.close()

        return jsonify(suppliers), 200

    except Exception as e:
        print("ERROR get_suppliers:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/suppliers", methods=["POST"])
def create_supplier():
    try:
        data = request.get_json()

        supplier_name = data.get("supplier_name")
        contact_person = data.get("contact_person")
        phone = data.get("phone")
        email = data.get("email")
        address = data.get("address")
        status = data.get("status", "ACTIVE")

        if not supplier_name:
            return jsonify({"message": "Supplier name is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO supplier (
                supplier_name,
                contact_person,
                phone,
                email,
                address,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING supplier_id, supplier_code
        """, (
            supplier_name,
            contact_person,
            phone,
            email,
            address,
            status
        ))

        row = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Supplier created successfully",
            "supplier_id": row[0],
            "supplier_code": row[1]
        }), 201

    except Exception as e:
        print("ERROR create_supplier:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/suppliers/<int:supplier_id>", methods=["PUT"])
def update_supplier(supplier_id):
    try:
        data = request.get_json()

        supplier_name = data.get("supplier_name")
        contact_person = data.get("contact_person")
        phone = data.get("phone")
        email = data.get("email")
        address = data.get("address")
        status = data.get("status", "ACTIVE")

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE supplier
            SET supplier_name = %s,
                contact_person = %s,
                phone = %s,
                email = %s,
                address = %s,
                status = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE supplier_id = %s
        """, (
            supplier_name,
            contact_person,
            phone,
            email,
            address,
            status,
            supplier_id
        ))

        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({"message": "Supplier not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Supplier updated successfully"}), 200

    except Exception as e:
        print("ERROR update_supplier:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/suppliers/<int:supplier_id>", methods=["DELETE"])
def delete_supplier(supplier_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE supplier
            SET status = 'INACTIVE',
                updated_at = CURRENT_TIMESTAMP
            WHERE supplier_id = %s
        """, (supplier_id,))

        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({"message": "Supplier not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Supplier deactivated successfully"}), 200

    except Exception as e:
        print("ERROR delete_supplier:", e)
        return jsonify({"message": str(e)}), 500


# =========================================================
# SUPPLIER PRODUCT
# =========================================================

@purchase_bp.route("/admin/supplier-products", methods=["GET"])
def get_supplier_products():
    try:
        supplier_id = request.args.get("supplier_id")
        available_only = request.args.get("available") in ["1", "true", "TRUE", "yes"]

        conn = get_connection()
        cur = conn.cursor()

        query = """
            SELECT sp.supplier_id,
                   s.supplier_name,
                   sp.product_id,
                   p.product_name,
                   sp.purchase_price,
                   sp.lead_time_days,
                   sp.is_preferred,
                   sp.status,
                   p.status AS product_status,
                   c.status AS category_status,
                   s.status AS supplier_status
            FROM supplier_product sp
            JOIN supplier s ON sp.supplier_id = s.supplier_id
            JOIN product p ON sp.product_id = p.product_id
            JOIN category c ON p.category_id = c.category_id
        """

        params = []
        conditions = []

        if supplier_id:
            conditions.append("sp.supplier_id = %s")
            params.append(supplier_id)

        if available_only:
            conditions.extend([
                "sp.status = 'ACTIVE'",
                "s.status = 'ACTIVE'",
                "p.status = 'ACTIVE'",
                "c.status = 'ACTIVE'"
            ])

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY s.supplier_name, p.product_name"

        cur.execute(query, params)
        rows = cur.fetchall()

        result = []
        for row in rows:
            result.append({
                "supplier_id": row[0],
                "supplier_name": row[1],
                "product_id": row[2],
                "product_name": row[3],
                "purchase_price": float(row[4]),
                "lead_time_days": row[5],
                "is_preferred": row[6],
                "status": row[7],
                "product_status": row[8],
                "category_status": row[9],
                "supplier_status": row[10]
            })

        cur.close()
        conn.close()

        return jsonify(result), 200

    except Exception as e:
        print("ERROR get_supplier_products:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/supplier-products", methods=["POST"])
def create_supplier_product():
    try:
        data = request.get_json()

        supplier_id = data.get("supplier_id")
        product_id = data.get("product_id")
        purchase_price = data.get("purchase_price")
        lead_time_days = data.get("lead_time_days")
        is_preferred = normalize_bool(data.get("is_preferred", False))
        status = data.get("status", "ACTIVE")

        if supplier_id is None:
            return jsonify({"message": "Supplier is required"}), 400

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if purchase_price is None or float(purchase_price) <= 0:
            return jsonify({"message": "Purchase price must be greater than 0"}), 400

        if lead_time_days is None or lead_time_days == "" or int(lead_time_days) <= 0:
            return jsonify({"message": "Lead time must be greater than 0"}), 400

        if status not in ["ACTIVE", "INACTIVE"]:
            return jsonify({"message": "Invalid status"}), 400

        conn = get_connection()
        cur = conn.cursor()

        if is_preferred:
            cur.execute("""
                UPDATE supplier_product
                SET is_preferred = FALSE
                WHERE product_id = %s
                  AND supplier_id <> %s
            """, (product_id, supplier_id))

        cur.execute("""
            INSERT INTO supplier_product (
                supplier_id,
                product_id,
                purchase_price,
                lead_time_days,
                is_preferred,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            supplier_id,
            product_id,
            float(purchase_price),
            int(lead_time_days),
            is_preferred,
            status
        ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Supplier product created successfully"}), 201

    except Exception as e:
        print("ERROR create_supplier_product:", e)
        return jsonify({"message": str(e)}), 500


# =========================================================
# PURCHASE MANAGEMENT
# =========================================================

@purchase_bp.route("/admin/purchases", methods=["GET"])
def get_purchases():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT p.purchase_id,
                   p.purchase_code,
                   s.supplier_name,
                   b.branch_name,
                   u.name,
                   p.purchase_date,
                   p.status,
                   p.total_amount
            FROM purchase p
            JOIN supplier s ON p.supplier_id = s.supplier_id
            JOIN branch b ON p.branch_id = b.branch_id
            JOIN users u ON p.created_by = u.user_id
            ORDER BY p.purchase_id DESC
        """)

        rows = cur.fetchall()

        result = []
        for row in rows:
            result.append({
                "purchase_id": row[0],
                "purchase_code": row[1],
                "supplier_name": row[2],
                "branch_name": row[3],
                "created_by_name": row[4],
                "purchase_date": row[5].isoformat() if row[5] else None,
                "status": row[6],
                "total_amount": float(row[7])
            })

        cur.close()
        conn.close()

        return jsonify(result), 200

    except Exception as e:
        print("ERROR get_purchases:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/purchases", methods=["POST"])
def create_purchase():
    conn = None
    cur = None

    try:
        data = request.get_json()

        supplier_id = data.get("supplier_id")
        product_id = data.get("product_id")
        quantity = data.get("quantity")
        created_by = data.get("created_by")

        if supplier_id is None:
            return jsonify({"message": "Supplier is required"}), 400

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if quantity is None or int(quantity) <= 0:
            return jsonify({"message": "Quantity must be greater than 0"}), 400

        if created_by is None:
            return jsonify({"message": "Created by user is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT branch_id, branch_name
            FROM branch
            WHERE branch_type = 'WAREHOUSE'
            ORDER BY branch_id
            LIMIT 1
        """)
        warehouse = cur.fetchone()

        if not warehouse:
            return jsonify({"message": "Warehouse receiving location not found"}), 400

        warehouse_id = warehouse[0]

        cur.execute("""
            SELECT sp.purchase_price,
                   sp.lead_time_days
            FROM supplier_product sp
            JOIN supplier s ON sp.supplier_id = s.supplier_id
            JOIN product p ON sp.product_id = p.product_id
            JOIN category c ON p.category_id = c.category_id
            WHERE sp.supplier_id = %s
              AND sp.product_id = %s
              AND sp.status = 'ACTIVE'
              AND s.status = 'ACTIVE'
              AND p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
        """, (supplier_id, product_id))
        supplier_product = cur.fetchone()

        if not supplier_product:
            return jsonify({"message": "Selected product is not active for this supplier"}), 400

        active_purchase = find_active_purchase_for_product_branch(
            cur,
            product_id,
            warehouse_id
        )

        if active_purchase:
            return jsonify({
                "message": "Purchase already pending for this product.",
                "purchase_id": active_purchase[0],
                "purchase_code": active_purchase[1],
                "status": active_purchase[2]
            }), 409

        unit_cost = float(supplier_product[0])
        purchase_quantity = int(quantity)
        subtotal = purchase_quantity * unit_cost

        cur.execute("""
            INSERT INTO purchase (
                supplier_id,
                branch_id,
                created_by,
                status,
                total_amount
            )
            VALUES (%s, %s, %s, 'PENDING', %s)
            RETURNING purchase_id, purchase_code
        """, (
            supplier_id,
            warehouse_id,
            created_by,
            subtotal
        ))

        row = cur.fetchone()

        cur.execute("""
            INSERT INTO purchase_detail (
                purchase_id,
                product_id,
                quantity,
                unit_cost,
                subtotal
            )
            VALUES (%s, %s, %s, %s, %s)
        """, (
            row[0],
            product_id,
            purchase_quantity,
            unit_cost,
            subtotal
        ))

        conn.commit()

        return jsonify({
            "message": "Purchase created successfully",
            "purchase_id": row[0],
            "purchase_code": row[1],
            "branch_id": warehouse_id,
            "branch_name": warehouse[1],
            "product_id": product_id,
            "quantity": purchase_quantity,
            "unit_cost": unit_cost,
            "total_amount": subtotal
        }), 201

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR create_purchase:", e)
        return jsonify({"message": str(e)}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@purchase_bp.route("/admin/purchases/<int:purchase_id>", methods=["GET"])
def get_purchase_details(purchase_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT purchase_id,
                   purchase_code,
                   supplier_id,
                   branch_id,
                   created_by,
                   purchase_date,
                   status,
                   total_amount
            FROM purchase
            WHERE purchase_id = %s
        """, (purchase_id,))

        row = cur.fetchone()

        if not row:
            cur.close()
            conn.close()
            return jsonify({"message": "Purchase not found"}), 404

        purchase = {
            "purchase_id": row[0],
            "purchase_code": row[1],
            "supplier_id": row[2],
            "branch_id": row[3],
            "created_by": row[4],
            "purchase_date": row[5].isoformat() if row[5] else None,
            "status": row[6],
            "total_amount": float(row[7])
        }

        cur.execute("""
            SELECT pd.purchase_detail_id,
                   pd.product_id,
                   p.product_name,
                   pd.quantity,
                   pd.unit_cost,
                   pd.subtotal
            FROM purchase_detail pd
            JOIN product p ON pd.product_id = p.product_id
            WHERE pd.purchase_id = %s
            ORDER BY pd.purchase_detail_id
        """, (purchase_id,))

        detail_rows = cur.fetchall()
        details = []

        for d in detail_rows:
            details.append({
                "purchase_detail_id": d[0],
                "product_id": d[1],
                "product_name": d[2],
                "quantity": d[3],
                "unit_cost": float(d[4]),
                "subtotal": float(d[5])
            })

        purchase["details"] = details

        cur.close()
        conn.close()

        return jsonify(purchase), 200

    except Exception as e:
        print("ERROR get_purchase_details:", e)
        return jsonify({"message": str(e)}), 500


# =========================================================
# PURCHASE DETAIL
# =========================================================

@purchase_bp.route("/admin/purchases/<int:purchase_id>/details", methods=["POST"])
def add_purchase_detail(purchase_id):
    try:
        data = request.get_json()

        product_id = data.get("product_id")
        quantity = data.get("quantity")
        unit_cost = data.get("unit_cost")

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT branch_id
            FROM purchase
            WHERE purchase_id = %s
        """, (purchase_id,))
        purchase_row = cur.fetchone()

        if not purchase_row:
            cur.close()
            conn.close()
            return jsonify({"message": "Purchase not found"}), 404

        active_purchase = find_active_purchase_for_product_branch(
            cur,
            product_id,
            purchase_row[0]
        )

        if active_purchase:
            cur.close()
            conn.close()
            return jsonify({
                "message": "Purchase already pending for this product.",
                "purchase_id": active_purchase[0],
                "purchase_code": active_purchase[1],
                "status": active_purchase[2]
            }), 409

        cur.execute("""
            INSERT INTO purchase_detail (
                purchase_id,
                product_id,
                quantity,
                unit_cost,
                subtotal
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING purchase_detail_id
        """, (
            purchase_id,
            product_id,
            quantity,
            unit_cost,
            quantity * unit_cost
        ))

        row = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Purchase detail added successfully",
            "purchase_detail_id": row[0]
        }), 201

    except Exception as e:
        print("ERROR add_purchase_detail:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/purchase-details/<int:purchase_detail_id>", methods=["DELETE"])
def delete_purchase_detail(purchase_detail_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            DELETE FROM purchase_detail
            WHERE purchase_detail_id = %s
        """, (purchase_detail_id,))

        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({"message": "Purchase detail not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Purchase detail deleted successfully"}), 200

    except Exception as e:
        print("ERROR delete_purchase_detail:", e)
        return jsonify({"message": str(e)}), 500


# =========================================================
# PURCHASE STATUS ACTIONS
# =========================================================

@purchase_bp.route("/admin/purchases/<int:purchase_id>/ordered", methods=["PUT"])
def mark_purchase_ordered(purchase_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE purchase
            SET status = 'ORDERED',
                updated_at = CURRENT_TIMESTAMP
            WHERE purchase_id = %s
              AND status = 'PENDING'
        """, (purchase_id,))

        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({
                "message": "Purchase not found or status is not PENDING"
            }), 400

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Purchase marked as ORDERED"}), 200

    except Exception as e:
        print("ERROR mark_purchase_ordered:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/purchases/<int:purchase_id>/cancel", methods=["PUT"])
def cancel_purchase_order(purchase_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE purchase
            SET status = 'CANCELLED',
                updated_at = CURRENT_TIMESTAMP
            WHERE purchase_id = %s
              AND status = 'PENDING'
        """, (purchase_id,))

        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({
                "message": "Purchase not found or only PENDING purchases can be cancelled"
            }), 400

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Purchase order cancelled"}), 200

    except Exception as e:
        print("ERROR cancel_purchase_order:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/purchases/<int:purchase_id>/receive", methods=["PUT"])
def mark_purchase_received(purchase_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT receive_purchase(%s)", (purchase_id,))
        result = cur.fetchone()[0]

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": result}), 200

    except Exception as e:
        print("ERROR mark_purchase_received:", e)
        return jsonify({"message": str(e)}), 500

# =========================================================
# INVENTORY OVERVIEW - CREATE PURCHASE RECOMMENDATION
# =========================================================
@purchase_bp.route("/admin/purchase-recommendations", methods=["POST"])
def create_purchase_recommendation():
    try:
        data = request.get_json()

        product_id = data.get("product_id")
        branch_id = data.get("branch_id")
        created_by = data.get("created_by")
        quantity = data.get("quantity")

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if branch_id is None:
            return jsonify({"message": "Branch is required"}), 400

        if created_by is None:
            return jsonify({"message": "Created by user is required"}), 400

        if quantity is None or int(quantity) <= 0:
            return jsonify({"message": "Valid quantity is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        active_purchase = find_active_purchase_for_product_branch(
            cur,
            product_id,
            branch_id
        )

        if active_purchase:
            cur.close()
            conn.close()
            return jsonify({
                "message": "Purchase already pending for this product.",
                "purchase_id": active_purchase[0],
                "purchase_code": active_purchase[1],
                "status": active_purchase[2]
            }), 409

        # Find preferred active supplier for this product
        cur.execute("""
            SELECT sp.supplier_id, sp.purchase_price
            FROM supplier_product sp
            JOIN supplier s ON sp.supplier_id = s.supplier_id
            JOIN product p ON sp.product_id = p.product_id
            JOIN category c ON p.category_id = c.category_id
            WHERE sp.product_id = %s
              AND sp.status = 'ACTIVE'
              AND s.status = 'ACTIVE'
              AND p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
            ORDER BY sp.is_preferred DESC, sp.purchase_price ASC
            LIMIT 1
        """, (product_id,))

        supplier_row = cur.fetchone()

        if not supplier_row:
            cur.close()
            conn.close()
            return jsonify({
                "message": "No active supplier found for this product. Please assign supplier first."
            }), 400

        supplier_id = supplier_row[0]
        unit_cost = float(supplier_row[1])
        subtotal = int(quantity) * unit_cost

        # Create purchase header
        cur.execute("""
            INSERT INTO purchase (
                supplier_id,
                branch_id,
                created_by,
                status,
                total_amount
            )
            VALUES (%s, %s, %s, 'PENDING', %s)
            RETURNING purchase_id, purchase_code
        """, (
            supplier_id,
            branch_id,
            created_by,
            subtotal
        ))

        purchase_row = cur.fetchone()
        purchase_id = purchase_row[0]
        purchase_code = purchase_row[1]

        # Create purchase detail
        cur.execute("""
            INSERT INTO purchase_detail (
                purchase_id,
                product_id,
                quantity,
                unit_cost,
                subtotal
            )
            VALUES (%s, %s, %s, %s, %s)
        """, (
            purchase_id,
            product_id,
            int(quantity),
            unit_cost,
            subtotal
        ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "message": "Purchase recommendation created successfully",
            "purchase_id": purchase_id,
            "purchase_code": purchase_code,
            "supplier_id": supplier_id,
            "quantity": int(quantity),
            "unit_cost": unit_cost,
            "total_amount": subtotal
        }), 201

    except Exception as e:
        print("ERROR create_purchase_recommendation:", e)
        return jsonify({"message": str(e)}), 500

# =========================================================
# SUPPLIER PRODUCT - UPDATE
# =========================================================
@purchase_bp.route("/admin/supplier-products/<int:supplier_id>/<int:product_id>", methods=["PUT"])
def update_supplier_product(supplier_id, product_id):
    try:
        data = request.get_json()

        purchase_price = data.get("purchase_price")
        lead_time_days = data.get("lead_time_days")
        is_preferred = normalize_bool(data.get("is_preferred", False))
        status = data.get("status", "ACTIVE")

        if purchase_price is None or float(purchase_price) <= 0:
            return jsonify({"message": "Purchase price must be greater than 0"}), 400

        if lead_time_days is None or lead_time_days == "" or int(lead_time_days) <= 0:
            return jsonify({"message": "Lead time must be greater than 0"}), 400

        if status not in ["ACTIVE", "INACTIVE"]:
            return jsonify({"message": "Invalid status"}), 400

        conn = get_connection()
        cur = conn.cursor()

        if is_preferred:
            cur.execute("""
                UPDATE supplier_product
                SET is_preferred = FALSE
                WHERE product_id = %s
                  AND supplier_id <> %s
            """, (product_id, supplier_id))

        cur.execute("""
            UPDATE supplier_product
            SET purchase_price = %s,
                lead_time_days = %s,
                is_preferred = %s,
                status = %s
            WHERE supplier_id = %s
              AND product_id = %s
        """, (
            float(purchase_price),
            int(lead_time_days),
            is_preferred,
            status,
            supplier_id,
            product_id
        ))

        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({"message": "Supplier product mapping not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Supplier product mapping updated successfully"}), 200

    except Exception as e:
        print("ERROR update_supplier_product:", e)
        return jsonify({"message": str(e)}), 500


# =========================================================
# SUPPLIER PRODUCT - DELETE / DEACTIVATE
# =========================================================
@purchase_bp.route("/admin/supplier-products/<int:supplier_id>/<int:product_id>", methods=["DELETE"])
def delete_supplier_product(supplier_id, product_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            DELETE FROM supplier_product
            WHERE supplier_id = %s
              AND product_id = %s
        """, (supplier_id, product_id))

        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({"message": "Supplier product mapping not found"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Supplier product mapping deleted successfully"}), 200

    except Exception as e:
        print("ERROR delete_supplier_product:", e)
        return jsonify({"message": str(e)}), 500
    
       # =========================================================
# SUPPLIER PRODUCT - BULK CREATE
# =========================================================
@purchase_bp.route("/admin/supplier-products/bulk", methods=["POST"])
def create_supplier_products_bulk():
    try:
        data = request.get_json()

        supplier_id = data.get("supplier_id")
        items = data.get("items", [])

        if supplier_id is None:
            return jsonify({"message": "Supplier is required"}), 400

        if not isinstance(items, list) or len(items) == 0:
            return jsonify({"message": "At least one product must be selected"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM supplier WHERE supplier_id = %s AND status = 'ACTIVE'", (supplier_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Active supplier not found"}), 404

        inserted_count = 0
        skipped_count = 0
        updated_count = 0

        for item in items:
            product_id = item.get("product_id")
            purchase_price = item.get("purchase_price")
            lead_time_days = item.get("lead_time_days")
            is_preferred = normalize_bool(item.get("is_preferred", False))
            status = item.get("status", "ACTIVE")

            if product_id is None:
                continue

            if purchase_price is None or float(purchase_price) <= 0:
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({"message": "Purchase price must be greater than 0 for all selected products"}), 400

            if lead_time_days is None or lead_time_days == "" or int(lead_time_days) <= 0:
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({"message": "Lead time must be greater than 0"}), 400

            if status not in ["ACTIVE", "INACTIVE"]:
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({"message": "Invalid status"}), 400

            cur.execute("SELECT 1 FROM product WHERE product_id = %s", (product_id,))
            if not cur.fetchone():
                skipped_count += 1
                continue

            if is_preferred:
                cur.execute("""
                    UPDATE supplier_product
                    SET is_preferred = FALSE
                    WHERE product_id = %s
                      AND supplier_id <> %s
                """, (product_id, supplier_id))

            cur.execute("""
                SELECT status
                FROM supplier_product
                WHERE supplier_id = %s
                  AND product_id = %s
            """, (supplier_id, product_id))

            existing = cur.fetchone()

            if existing:
                cur.execute("""
                    UPDATE supplier_product
                    SET purchase_price = %s,
                        lead_time_days = %s,
                        is_preferred = %s,
                        status = %s
                    WHERE supplier_id = %s
                      AND product_id = %s
                """, (
                    float(purchase_price),
                    int(lead_time_days),
                    is_preferred,
                    status,
                    supplier_id,
                    product_id
                ))
                updated_count += 1
            else:
                cur.execute("""
                    INSERT INTO supplier_product (
                        supplier_id,
                        product_id,
                        purchase_price,
                        lead_time_days,
                        is_preferred,
                        status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    supplier_id,
                    product_id,
                    float(purchase_price),
                    int(lead_time_days),
                    is_preferred,
                    status
                ))
                inserted_count += 1

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "message": "Supplier products saved successfully",
            "inserted_count": inserted_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count
        }), 201

    except Exception as e:
        print("ERROR create_supplier_products_bulk:", e)
        return jsonify({"message": str(e)}), 500
