from decimal import Decimal

from flask import Blueprint, g, request, jsonify
from db import get_connection
from audit import log_audit
from routes.auth_routes import login_required, role_required

inventory_bp = Blueprint("inventory_bp", __name__)


ACTIVE_PURCHASE_STATUSES = ("PENDING", "ORDERED")


def ensure_branch_status_column(cur):
    cur.execute("""
        ALTER TABLE branch
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    """)


def ensure_product_warehouse_reorder_level_column(cur):
    cur.execute("""
        ALTER TABLE product
        ADD COLUMN IF NOT EXISTS warehouse_reorder_level INTEGER
    """)
    cur.execute("""
        UPDATE product
        SET warehouse_reorder_level = COALESCE(warehouse_reorder_level, reorder_level, 0)
        WHERE warehouse_reorder_level IS NULL
    """)


def _to_float(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def _close(conn=None, cur=None):
    if cur:
        cur.close()
    if conn:
        conn.close()


def _current_user_id():
    return g.current_user["user_id"]


def _current_role():
    return g.current_user["role"]


def _current_branch_id():
    return g.current_user.get("branch_id")


def _can_access_branch(branch_id):
    return _current_role() == "SYSTEM_ADMIN" or int(branch_id) == int(_current_branch_id())


# =========================
# ADMIN - GET ALL INVENTORY
# =========================
@inventory_bp.route("/admin/inventory", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER", "BRANCH_STAFF")
def admin_get_inventory():
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_branch_status_column(cur)

        params = []
        branch_filter = ""
        if _current_role() != "SYSTEM_ADMIN":
            branch_filter = "WHERE i.branch_id = %s"
            params.append(_current_branch_id())

        cur.execute(f"""
            SELECT i.product_id,
                   p.product_code,
                   p.product_name,
                   i.branch_id,
                   b.branch_name,
                   b.status AS branch_status,
                   i.quantity_in_stock,
                   i.last_updated,
                   ap.purchase_id,
                   ap.purchase_code,
                   ap.status,
                   active_transfer.transfer_id,
                   active_transfer.transfer_code,
                   active_transfer.status,
                   active_transfer.quantity
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            JOIN branch b ON i.branch_id = b.branch_id
            LEFT JOIN LATERAL (
                SELECT po.purchase_id,
                       po.purchase_code,
                       po.status
                FROM purchase po
                JOIN purchase_detail pd ON po.purchase_id = pd.purchase_id
                WHERE po.branch_id = i.branch_id
                  AND pd.product_id = i.product_id
                  AND po.status IN ('PENDING', 'ORDERED')
                ORDER BY po.purchase_id DESC
                LIMIT 1
            ) ap ON TRUE
            LEFT JOIN LATERAL (
                SELECT st.transfer_id,
                       st.transfer_code,
                       st.status,
                       td.quantity
                FROM stock_transfer st
                JOIN transfer_detail td ON st.transfer_id = td.transfer_id
                WHERE st.to_branch_id = i.branch_id
                  AND td.product_id = i.product_id
                  AND st.status IN ('PENDING', 'PENDING_SOURCE', 'APPROVED')
                ORDER BY st.transfer_id DESC
                LIMIT 1
            ) active_transfer ON TRUE
            {branch_filter}
            ORDER BY i.branch_id, i.product_id
        """, params)

        rows = cur.fetchall()

        inventory_list = []
        for row in rows:
            inventory_list.append({
                "product_id": row[0],
                "product_code": row[1],
                "product_name": row[2],
                "branch_id": row[3],
                "branch_name": row[4],
                "branch_status": row[5],
                "quantity_in_stock": row[6],
                "last_updated": row[7].isoformat() if row[7] else None,
                "active_purchase_id": row[8],
                "active_purchase_code": row[9],
                "active_purchase_status": row[10],
                "has_active_purchase": row[8] is not None,
                "active_transfer_id": row[11],
                "active_transfer_code": row[12],
                "active_transfer_status": row[13],
                "active_transfer_quantity": row[14],
                "has_active_transfer": row[11] is not None
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
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER", "BRANCH_STAFF")
def admin_get_single_inventory(product_id, branch_id):
    try:
        if not _can_access_branch(branch_id):
            return jsonify({"message": "Forbidden"}), 403

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
@login_required
@role_required("SYSTEM_ADMIN")
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
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER")
def admin_update_inventory(product_id, branch_id):
    try:
        data = request.get_json()
        actor_user_id = _current_user_id()

        if not _can_access_branch(branch_id):
            return jsonify({"message": "Forbidden"}), 403

        quantity_in_stock = data.get("quantity_in_stock")

        if quantity_in_stock is None:
            return jsonify({"message": "Quantity in stock is required"}), 400

        if int(quantity_in_stock) < 0:
            return jsonify({"message": "Quantity in stock cannot be negative"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT p.product_name, b.branch_name
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            JOIN branch b ON i.branch_id = b.branch_id
            WHERE i.product_id = %s AND i.branch_id = %s
        """, (product_id, branch_id))
        inventory_row = cur.fetchone()

        if not inventory_row:
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
        log_audit(
            actor_user_id,
            "UPDATE_INVENTORY",
            "Inventory",
            product_id,
            f"Updated inventory for {inventory_row[0]} at {inventory_row[1]} to {quantity_in_stock} unit(s)."
        )
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
@login_required
@role_required("SYSTEM_ADMIN")
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


# =========================
# ADMIN WAREHOUSE - SUMMARY
# =========================
@inventory_bp.route("/admin/warehouse/summary", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_summary():
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_product_warehouse_reorder_level_column(cur)
        conn.commit()

        cur.execute("""
            SELECT COALESCE(SUM(i.quantity_in_stock), 0),
                   COUNT(*) FILTER (
                       WHERE i.quantity_in_stock > 0
                         AND i.quantity_in_stock <= COALESCE(p.warehouse_reorder_level, p.reorder_level, 0)
                   ),
                   COUNT(*) FILTER (WHERE i.quantity_in_stock = 0)
            FROM inventory i
            JOIN branch b ON i.branch_id = b.branch_id
            JOIN product p ON i.product_id = p.product_id
            WHERE b.branch_type = 'WAREHOUSE'
        """)
        stock_row = cur.fetchone()

        cur.execute("""
            SELECT COUNT(*)
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            WHERE fb.branch_type = 'WAREHOUSE'
              AND tb.branch_type = 'BRANCH'
              AND st.status = 'PENDING_SOURCE'
        """)
        pending_requests = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM inventory i
            JOIN branch b ON i.branch_id = b.branch_id
            JOIN product p ON i.product_id = p.product_id
            WHERE b.branch_type = 'WAREHOUSE'
              AND i.quantity_in_stock <= COALESCE(p.warehouse_reorder_level, p.reorder_level, 0)
        """)
        purchase_needed = cur.fetchone()[0]

        _close(conn, cur)

        return jsonify({
            "total_warehouse_stock_units": stock_row[0],
            "warehouse_low_stock_products": stock_row[1],
            "warehouse_out_of_stock_products": stock_row[2],
            "pending_branch_requests": pending_requests,
            "purchase_needed_items": purchase_needed
        }), 200

    except Exception as e:
        print("ERROR /admin/warehouse/summary GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN WAREHOUSE - STOCK
# =========================
@inventory_bp.route("/admin/warehouse/stock", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_stock():
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_product_warehouse_reorder_level_column(cur)
        conn.commit()

        cur.execute("""
            SELECT i.product_id,
                   p.product_code,
                   p.product_name,
                   c.category_name,
                   i.branch_id,
                   b.branch_name,
                   i.quantity_in_stock,
                   COALESCE(p.warehouse_reorder_level, p.reorder_level, 0) AS reorder_level,
                   CASE
                       WHEN i.quantity_in_stock = 0 THEN 'OUT_OF_STOCK'
                       WHEN i.quantity_in_stock <= COALESCE(p.warehouse_reorder_level, p.reorder_level, 0) THEN 'LOW_STOCK'
                       ELSE 'HEALTHY'
                   END AS status,
                   i.last_updated,
                   supplier_choice.supplier_id,
                   supplier_choice.supplier_name,
                   supplier_choice.contact_person,
                   supplier_choice.phone,
                   supplier_choice.email,
                   supplier_choice.purchase_price,
                   active_purchase.purchase_id,
                   active_purchase.purchase_code,
                   active_purchase.status
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            LEFT JOIN category c ON p.category_id = c.category_id
            JOIN branch b ON i.branch_id = b.branch_id
            LEFT JOIN LATERAL (
                SELECT sp.supplier_id,
                       s.supplier_name,
                       s.contact_person,
                       s.phone,
                       s.email,
                       sp.purchase_price
                FROM supplier_product sp
                JOIN supplier s ON sp.supplier_id = s.supplier_id
                WHERE sp.product_id = i.product_id
                  AND sp.status = 'ACTIVE'
                  AND s.status = 'ACTIVE'
                ORDER BY sp.is_preferred DESC, sp.purchase_price ASC, s.supplier_name
                LIMIT 1
            ) supplier_choice ON TRUE
            LEFT JOIN LATERAL (
                SELECT po.purchase_id,
                       po.purchase_code,
                       po.status
                FROM purchase po
                JOIN purchase_detail pd ON po.purchase_id = pd.purchase_id
                WHERE po.branch_id = i.branch_id
                  AND pd.product_id = i.product_id
                  AND po.status IN ('PENDING', 'ORDERED')
                ORDER BY po.purchase_id DESC
                LIMIT 1
            ) active_purchase ON TRUE
            WHERE b.branch_type = 'WAREHOUSE'
            ORDER BY b.branch_name, p.product_name
        """)

        rows = cur.fetchall()
        result = []

        for row in rows:
            result.append({
                "product_id": row[0],
                "product_code": row[1],
                "product_name": row[2],
                "category_name": row[3],
                "branch_id": row[4],
                "warehouse_name": row[5],
                "quantity_in_stock": row[6],
                "reorder_level": row[7],
                "status": row[8],
                "last_updated": row[9].isoformat() if row[9] else None,
                "supplier_id": row[10],
                "preferred_supplier": row[11] if row[10] else "No supplier assigned",
                "supplier_contact_person": row[12],
                "supplier_phone": row[13],
                "supplier_email": row[14],
                "purchase_price": _to_float(row[15]) if row[15] is not None else None,
                "active_purchase_id": row[16],
                "active_purchase_code": row[17],
                "active_purchase_status": row[18],
                "has_active_purchase": row[16] is not None
            })

        _close(conn, cur)

        return jsonify(result), 200

    except Exception as e:
        print("ERROR /admin/warehouse/stock GET:", e)
        return jsonify({"message": str(e)}), 500


@inventory_bp.route("/admin/warehouse/distribute", methods=["POST"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_distribute_stock():
    conn = None
    cur = None

    try:
        data = request.get_json() or {}
        from_branch_id = data.get("from_branch_id")
        to_branch_id = data.get("to_branch_id")
        product_id = data.get("product_id")
        quantity = data.get("quantity")
        approved_by = _current_user_id()

        if not from_branch_id or not to_branch_id or not product_id:
            return jsonify({"message": "Warehouse, destination branch, and product are required"}), 400

        distribute_to_all = str(to_branch_id).upper() == "ALL"

        try:
            from_branch_id = int(from_branch_id)
            if not distribute_to_all:
                to_branch_id = int(to_branch_id)
            product_id = int(product_id)
            quantity = int(quantity)
        except (TypeError, ValueError):
            return jsonify({"message": "Warehouse, branch, product, and quantity must be valid numbers"}), 400

        if quantity <= 0:
            return jsonify({"message": "Quantity must be greater than 0"}), 400

        if not distribute_to_all and from_branch_id == to_branch_id:
            return jsonify({"message": "Source warehouse and destination branch cannot be the same"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT branch_id, branch_name, branch_type
            FROM branch
            WHERE branch_id = %s
        """, (from_branch_id,))
        source_row = cur.fetchone()
        source_branch = {"name": source_row[1], "type": source_row[2]} if source_row else None

        if not source_branch or source_branch["type"] != "WAREHOUSE":
            conn.rollback()
            return jsonify({"message": "Source must be a warehouse"}), 400

        if distribute_to_all:
            cur.execute("""
                SELECT branch_id, branch_name
                FROM branch
                WHERE branch_type = 'BRANCH'
                ORDER BY branch_name
            """)
            destination_rows = cur.fetchall()
        else:
            cur.execute("""
                SELECT branch_id, branch_name, branch_type
                FROM branch
                WHERE branch_id = %s
            """, (to_branch_id,))
            destination = cur.fetchone()
            if not destination or destination[2] != "BRANCH":
                conn.rollback()
                return jsonify({"message": "Destination must be a branch"}), 400
            destination_rows = [(destination[0], destination[1])]

        if not destination_rows:
            conn.rollback()
            return jsonify({"message": "No destination branches found"}), 400

        cur.execute("""
            SELECT p.product_code, p.product_name
            FROM product p
            JOIN category c ON p.category_id = c.category_id
            WHERE p.product_id = %s
              AND p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
        """, (product_id,))
        product = cur.fetchone()

        if not product:
            conn.rollback()
            return jsonify({"message": "Active product not found"}), 404

        cur.execute("""
            SELECT quantity_in_stock
            FROM inventory
            WHERE product_id = %s
              AND branch_id = %s
            FOR UPDATE
        """, (product_id, from_branch_id))
        source_stock = cur.fetchone()

        if not source_stock or source_stock[0] < quantity:
            available_stock = source_stock[0] if source_stock else 0
            conn.rollback()
            return jsonify({
                "message": "Not enough warehouse stock for this distribution",
                "available_stock": available_stock,
                "requested_quantity": quantity,
                "shortfall": max(quantity - available_stock, 0),
            }), 400

        total_quantity = quantity * len(destination_rows)
        if source_stock[0] < total_quantity:
            conn.rollback()
            return jsonify({
                "message": "Not enough warehouse stock for all selected branches",
                "available_stock": source_stock[0],
                "requested_quantity": total_quantity,
                "quantity_per_branch": quantity,
                "branch_count": len(destination_rows),
                "shortfall": total_quantity - source_stock[0],
            }), 400

        cur.execute("""
            SELECT st.transfer_id, st.transfer_code, st.to_branch_id, b.branch_name
            FROM stock_transfer st
            JOIN transfer_detail td ON st.transfer_id = td.transfer_id
            JOIN branch b ON st.to_branch_id = b.branch_id
            WHERE st.from_branch_id = %s
              AND td.product_id = %s
              AND st.status IN ('PENDING', 'PENDING_SOURCE', 'APPROVED')
              AND st.to_branch_id = ANY(%s)
            ORDER BY st.transfer_id
            LIMIT 1
        """, (from_branch_id, product_id, [row[0] for row in destination_rows]))
        duplicate = cur.fetchone()

        if duplicate:
            conn.rollback()
            return jsonify({
                "message": f"A pending or approved distribution already exists for this product and {duplicate[3]}",
                "transfer_id": duplicate[0],
                "transfer_code": duplicate[1],
            }), 409

        source_stock_before = source_stock[0]
        created_transfers = []

        for index, (destination_branch_id, destination_branch_name) in enumerate(destination_rows):
            transfer_source_before = source_stock_before - (quantity * index)
            transfer_source_after = transfer_source_before - quantity

            cur.execute("""
                INSERT INTO stock_transfer (
                    from_branch_id,
                    to_branch_id,
                    status,
                    requested_by,
                    approved_by,
                    reject_reason,
                    approved_at
                )
                VALUES (%s, %s, 'APPROVED', %s, %s, NULL, CURRENT_TIMESTAMP)
                RETURNING transfer_id, transfer_code
            """, (from_branch_id, destination_branch_id, approved_by, approved_by))
            transfer = cur.fetchone()

            cur.execute("""
                INSERT INTO transfer_detail (
                    transfer_id,
                    product_id,
                    quantity,
                    source_stock_before,
                    source_stock_after
                )
                VALUES (%s, %s, %s, %s, %s)
            """, (transfer[0], product_id, quantity, transfer_source_before, transfer_source_after))

            created_transfers.append({
                "transfer_id": transfer[0],
                "transfer_code": transfer[1],
                "destination_branch_id": destination_branch_id,
                "destination_branch_name": destination_branch_name,
            })

        cur.execute("""
            UPDATE inventory
            SET quantity_in_stock = quantity_in_stock - %s,
                last_updated = CURRENT_TIMESTAMP
            WHERE product_id = %s
              AND branch_id = %s
        """, (total_quantity, product_id, from_branch_id))

        conn.commit()

        log_audit(
            approved_by,
            "DISTRIBUTE_WAREHOUSE_STOCK",
            "Warehouse Management",
            created_transfers[0]["transfer_id"],
            f"Distributed {quantity} unit(s) of {product[1]} from {source_branch['name']} to "
            f"{len(created_transfers)} branch(es)."
        )

        return jsonify({
            "message": "Warehouse stock distribution created successfully. Branch manager must confirm receipt.",
            "transfer_id": created_transfers[0]["transfer_id"],
            "transfer_code": created_transfers[0]["transfer_code"],
            "transfers": created_transfers,
            "source_stock_before": source_stock_before,
            "source_stock_after": source_stock_before - total_quantity,
        }), 201

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR /admin/warehouse/distribute POST:", e)
        return jsonify({"message": str(e)}), 500

    finally:
        _close(conn, cur)


# =========================
# ADMIN WAREHOUSE - TRANSFERS
# =========================
@inventory_bp.route("/admin/warehouse/transfers", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_transfers():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT st.transfer_id,
                   st.transfer_code,
                   fb.branch_name AS source_warehouse,
                   tb.branch_name AS destination_branch,
                   req.name AS requested_by_name,
                   st.transfer_date,
                   COUNT(td.transfer_detail_id) AS items_count,
                   st.status,
                   st.approved_at
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            LEFT JOIN users req ON st.requested_by = req.user_id
            LEFT JOIN transfer_detail td ON st.transfer_id = td.transfer_id
            WHERE fb.branch_type = 'WAREHOUSE'
              AND tb.branch_type = 'BRANCH'
            GROUP BY st.transfer_id,
                     st.transfer_code,
                     fb.branch_name,
                     tb.branch_name,
                     req.name,
                     st.transfer_date,
                     st.status,
                     st.approved_at
            ORDER BY COALESCE(st.approved_at, st.transfer_date) DESC, st.transfer_id DESC
        """)

        rows = cur.fetchall()
        result = []

        for row in rows:
            result.append({
                "transfer_id": row[0],
                "transfer_code": row[1],
                "source_warehouse": row[2],
                "destination_branch": row[3],
                "requested_by": row[4],
                "transfer_date": row[5].isoformat() if row[5] else None,
                "items_count": row[6],
                "status": row[7],
                "approved_at": row[8].isoformat() if row[8] else None
            })

        _close(conn, cur)

        return jsonify(result), 200

    except Exception as e:
        print("ERROR /admin/warehouse/transfers GET:", e)
        return jsonify({"message": str(e)}), 500


@inventory_bp.route("/admin/warehouse/transfer-approvals", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_transfer_approvals():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT st.transfer_id,
                   st.transfer_code,
                   fb.branch_name AS source_warehouse,
                   tb.branch_name AS destination_branch,
                   req.name AS requested_by_name,
                   st.transfer_date,
                   COUNT(td.transfer_detail_id) AS items_count,
                   st.status
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            LEFT JOIN users req ON st.requested_by = req.user_id
            LEFT JOIN transfer_detail td ON st.transfer_id = td.transfer_id
            WHERE st.status = 'PENDING_SOURCE'
              AND fb.branch_type = 'WAREHOUSE'
              AND tb.branch_type = 'BRANCH'
            GROUP BY st.transfer_id,
                     st.transfer_code,
                     fb.branch_name,
                     tb.branch_name,
                     req.name,
                     st.transfer_date,
                     st.status
            ORDER BY st.transfer_date DESC, st.transfer_id DESC
        """)

        rows = cur.fetchall()
        result = []

        for row in rows:
            result.append({
                "transfer_id": row[0],
                "transfer_code": row[1],
                "source_warehouse": row[2],
                "destination_branch": row[3],
                "requested_by": row[4],
                "transfer_date": row[5].isoformat() if row[5] else None,
                "items_count": row[6],
                "status": row[7]
            })

        _close(conn, cur)

        return jsonify(result), 200

    except Exception as e:
        print("ERROR /admin/warehouse/transfer-approvals GET:", e)
        return jsonify({"message": str(e)}), 500


@inventory_bp.route("/admin/warehouse/transfers/<int:transfer_id>", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_transfer_details(transfer_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT st.transfer_id,
                   st.transfer_code,
                   st.from_branch_id,
                   fb.branch_name AS source_warehouse,
                   st.to_branch_id,
                   tb.branch_name AS destination_branch,
                   req.name AS requested_by_name,
                   appr.name AS approved_by_name,
                   recv.name AS received_by_name,
                   st.status,
                   st.reject_reason,
                   st.transfer_date,
                   st.approved_at
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            LEFT JOIN users req ON st.requested_by = req.user_id
            LEFT JOIN users appr ON st.approved_by = appr.user_id
            LEFT JOIN users recv ON st.received_by = recv.user_id
            WHERE st.transfer_id = %s
              AND fb.branch_type = 'WAREHOUSE'
              AND tb.branch_type = 'BRANCH'
        """, (transfer_id,))

        transfer_row = cur.fetchone()

        if not transfer_row:
            _close(conn, cur)
            return jsonify({"message": "Warehouse transfer not found"}), 404

        cur.execute("""
            SELECT td.transfer_detail_id,
                   td.product_id,
                   p.product_code,
                   p.product_name,
                   td.quantity,
                   td.source_stock_before,
                   td.source_stock_after,
                   td.destination_stock_before,
                   td.destination_stock_after,
                   COALESCE(i.quantity_in_stock, 0) AS current_source_stock
            FROM transfer_detail td
            JOIN product p ON td.product_id = p.product_id
            LEFT JOIN inventory i
              ON i.product_id = td.product_id
             AND i.branch_id = %s
            WHERE td.transfer_id = %s
            ORDER BY td.transfer_detail_id
        """, (transfer_row[2], transfer_id))

        detail_rows = cur.fetchall()
        details = []

        for row in detail_rows:
            details.append({
                "transfer_detail_id": row[0],
                "product_id": row[1],
                "product_code": row[2],
                "product_name": row[3],
                "quantity": row[4],
                "source_stock_before": row[5],
                "source_stock_after": row[6],
                "destination_stock_before": row[7],
                "destination_stock_after": row[8],
                "current_source_stock": row[9]
            })

        _close(conn, cur)

        return jsonify({
            "transfer_id": transfer_row[0],
            "transfer_code": transfer_row[1],
            "from_branch_id": transfer_row[2],
            "source_warehouse": transfer_row[3],
            "to_branch_id": transfer_row[4],
            "destination_branch": transfer_row[5],
            "requested_by": transfer_row[6],
            "approved_by": transfer_row[7],
            "received_by": transfer_row[8],
            "status": transfer_row[9],
            "reject_reason": transfer_row[10],
            "transfer_date": transfer_row[11].isoformat() if transfer_row[11] else None,
            "approved_at": transfer_row[12].isoformat() if transfer_row[12] else None,
            "details": details
        }), 200

    except Exception as e:
        print("ERROR /admin/warehouse/transfers/<transfer_id> GET:", e)
        return jsonify({"message": str(e)}), 500


@inventory_bp.route("/admin/warehouse/transfers/<int:transfer_id>/approve", methods=["PUT"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_approve_transfer(transfer_id):
    conn = None
    cur = None

    try:
        data = request.get_json() or {}
        approved_by = _current_user_id()

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT st.from_branch_id, st.to_branch_id
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            WHERE st.transfer_id = %s
              AND st.status = 'PENDING_SOURCE'
              AND fb.branch_type = 'WAREHOUSE'
              AND tb.branch_type = 'BRANCH'
            FOR UPDATE OF st
        """, (transfer_id,))

        transfer = cur.fetchone()
        if not transfer:
            conn.rollback()
            return jsonify({"message": "Pending warehouse transfer not found"}), 404

        from_branch_id = transfer[0]

        cur.execute("""
            SELECT transfer_detail_id, product_id, quantity
            FROM transfer_detail
            WHERE transfer_id = %s
            ORDER BY transfer_detail_id
        """, (transfer_id,))

        items = cur.fetchall()
        if not items:
            conn.rollback()
            return jsonify({"message": "Transfer has no items to approve"}), 400

        stock_updates = []

        for transfer_detail_id, product_id, qty in items:
            cur.execute("""
                SELECT quantity_in_stock
                FROM inventory
                WHERE product_id = %s
                  AND branch_id = %s
                FOR UPDATE
            """, (product_id, from_branch_id))

            stock = cur.fetchone()

            if not stock or stock[0] < qty:
                conn.rollback()
                return jsonify({
                    "message": "Insufficient warehouse stock for one or more transfer items",
                    "product_id": product_id,
                    "available_stock": stock[0] if stock else 0,
                    "requested_quantity": qty
                }), 400

            source_stock_before = stock[0]
            source_stock_after = source_stock_before - qty
            stock_updates.append((
                transfer_detail_id,
                product_id,
                qty,
                source_stock_before,
                source_stock_after
            ))

        for transfer_detail_id, product_id, qty, source_stock_before, source_stock_after in stock_updates:
            cur.execute("""
                UPDATE inventory
                SET quantity_in_stock = quantity_in_stock - %s,
                    last_updated = CURRENT_TIMESTAMP
                WHERE product_id = %s
                  AND branch_id = %s
            """, (qty, product_id, from_branch_id))

            cur.execute("""
                UPDATE transfer_detail
                SET source_stock_before = %s,
                    source_stock_after = %s
                WHERE transfer_detail_id = %s
            """, (source_stock_before, source_stock_after, transfer_detail_id))

        cur.execute("""
            UPDATE stock_transfer
            SET status = 'APPROVED',
                approved_by = %s,
                approved_at = CURRENT_TIMESTAMP,
                reject_reason = NULL
            WHERE transfer_id = %s
              AND status = 'PENDING_SOURCE'
        """, (approved_by, transfer_id))

        conn.commit()

        return jsonify({"message": "Warehouse transfer approved successfully"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR /admin/warehouse/transfers/<transfer_id>/approve PUT:", e)
        return jsonify({"message": str(e)}), 500
    finally:
        _close(conn, cur)


@inventory_bp.route("/admin/warehouse/transfers/<int:transfer_id>/reject", methods=["PUT"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_reject_transfer(transfer_id):
    conn = None
    cur = None

    try:
        data = request.get_json() or {}
        approved_by = _current_user_id()
        reject_reason = (data.get("reject_reason") or "").strip()

        if not reject_reason:
            return jsonify({"message": "Reject reason is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT st.transfer_id
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            WHERE st.transfer_id = %s
              AND st.status = 'PENDING_SOURCE'
              AND fb.branch_type = 'WAREHOUSE'
              AND tb.branch_type = 'BRANCH'
            FOR UPDATE OF st
        """, (transfer_id,))

        if not cur.fetchone():
            conn.rollback()
            return jsonify({"message": "Pending warehouse transfer not found"}), 404

        cur.execute("""
            UPDATE stock_transfer
            SET status = 'REJECTED',
                reject_reason = %s,
                approved_by = %s,
                approved_at = CURRENT_TIMESTAMP
            WHERE transfer_id = %s
              AND status = 'PENDING_SOURCE'
        """, (reject_reason, approved_by, transfer_id))

        conn.commit()

        return jsonify({"message": "Warehouse transfer rejected successfully"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR /admin/warehouse/transfers/<transfer_id>/reject PUT:", e)
        return jsonify({"message": str(e)}), 500
    finally:
        _close(conn, cur)


# =========================
# ADMIN WAREHOUSE - PURCHASE NEEDED
# =========================
@inventory_bp.route("/admin/warehouse/purchase-needed", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_purchase_needed():
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_product_warehouse_reorder_level_column(cur)
        conn.commit()

        cur.execute("""
            SELECT i.product_id,
                   p.product_code,
                   p.product_name,
                   c.category_name,
                   i.branch_id,
                   b.branch_name AS warehouse_name,
                   i.quantity_in_stock,
                   COALESCE(p.warehouse_reorder_level, p.reorder_level, 0) AS reorder_level,
                   GREATEST(
                       COALESCE(p.warehouse_reorder_level, p.reorder_level, 0) * 2 - i.quantity_in_stock,
                       COALESCE(p.warehouse_reorder_level, p.reorder_level, 0)
                   ) AS suggested_purchase_quantity,
                   supplier_choice.supplier_id,
                   supplier_choice.supplier_name,
                   supplier_choice.purchase_price,
                   active_purchase.purchase_id,
                   active_purchase.purchase_code,
                   active_purchase.status
            FROM inventory i
            JOIN branch b ON i.branch_id = b.branch_id
            JOIN product p ON i.product_id = p.product_id
            JOIN category c ON p.category_id = c.category_id
            LEFT JOIN LATERAL (
                SELECT sp.supplier_id,
                       s.supplier_name,
                       sp.purchase_price
                FROM supplier_product sp
                JOIN supplier s ON sp.supplier_id = s.supplier_id
                WHERE sp.product_id = i.product_id
                  AND sp.status = 'ACTIVE'
                  AND s.status = 'ACTIVE'
                ORDER BY sp.is_preferred DESC, sp.purchase_price ASC, s.supplier_name
                LIMIT 1
            ) supplier_choice ON TRUE
            LEFT JOIN LATERAL (
                SELECT po.purchase_id,
                       po.purchase_code,
                       po.status
                FROM purchase po
                JOIN purchase_detail pd ON po.purchase_id = pd.purchase_id
                WHERE po.branch_id = i.branch_id
                  AND pd.product_id = i.product_id
                  AND po.status IN ('PENDING', 'ORDERED')
                ORDER BY po.purchase_id DESC
                LIMIT 1
            ) active_purchase ON TRUE
            WHERE b.branch_type = 'WAREHOUSE'
              AND p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
              AND i.quantity_in_stock <= COALESCE(p.warehouse_reorder_level, p.reorder_level, 0)
            ORDER BY i.quantity_in_stock ASC, p.product_name
        """)

        rows = cur.fetchall()
        result = []

        for row in rows:
            result.append({
                "product_id": row[0],
                "product_code": row[1],
                "product_name": row[2],
                "category_name": row[3],
                "branch_id": row[4],
                "warehouse_name": row[5],
                "warehouse_stock": row[6],
                "reorder_level": row[7],
                "suggested_purchase_quantity": row[8],
                "supplier_id": row[9],
                "preferred_supplier": row[10] if row[9] else "No supplier assigned",
                "purchase_price": _to_float(row[11]) if row[11] is not None else None,
                "active_purchase_id": row[12],
                "active_purchase_code": row[13],
                "active_purchase_status": row[14],
                "has_active_purchase": row[12] is not None
            })

        _close(conn, cur)

        return jsonify(result), 200

    except Exception as e:
        print("ERROR /admin/warehouse/purchase-needed GET:", e)
        return jsonify({"message": str(e)}), 500


@inventory_bp.route("/admin/warehouse/purchase-needed/<int:product_id>/create-purchase", methods=["POST"])
@login_required
@role_required("SYSTEM_ADMIN")
def admin_warehouse_create_purchase(product_id):
    conn = None
    cur = None

    try:
        data = request.get_json() or {}
        branch_id = data.get("branch_id")
        created_by = _current_user_id()

        if not branch_id:
            return jsonify({"message": "Warehouse branch is required"}), 400

        conn = get_connection()
        cur = conn.cursor()
        ensure_product_warehouse_reorder_level_column(cur)
        conn.commit()

        cur.execute("""
            SELECT i.quantity_in_stock,
                   COALESCE(p.warehouse_reorder_level, p.reorder_level, 0),
                   b.branch_name
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            JOIN branch b ON i.branch_id = b.branch_id
            WHERE i.product_id = %s
              AND i.branch_id = %s
              AND b.branch_type = 'WAREHOUSE'
            FOR UPDATE OF i
        """, (product_id, branch_id))

        inventory_row = cur.fetchone()
        if not inventory_row:
            conn.rollback()
            return jsonify({"message": "Warehouse inventory record not found"}), 404

        quantity_in_stock = inventory_row[0]
        reorder_level = inventory_row[1]

        if quantity_in_stock > reorder_level:
            conn.rollback()
            return jsonify({"message": "Purchase is not needed because warehouse stock is above reorder level"}), 400

        cur.execute("""
            SELECT po.purchase_id,
                   po.purchase_code,
                   po.status
            FROM purchase po
            JOIN purchase_detail pd ON po.purchase_id = pd.purchase_id
            WHERE po.branch_id = %s
              AND pd.product_id = %s
              AND po.status IN ('PENDING', 'ORDERED')
            ORDER BY po.purchase_id DESC
            LIMIT 1
            FOR UPDATE OF po
        """, (branch_id, product_id))

        active_purchase = cur.fetchone()
        if active_purchase:
            conn.rollback()
            return jsonify({
                "message": "Purchase already pending for this product and warehouse",
                "purchase_id": active_purchase[0],
                "purchase_code": active_purchase[1],
                "status": active_purchase[2]
            }), 409

        cur.execute("""
            SELECT sp.supplier_id,
                   sp.purchase_price
            FROM supplier_product sp
            JOIN supplier s ON sp.supplier_id = s.supplier_id
            JOIN product p ON sp.product_id = p.product_id
            JOIN category c ON p.category_id = c.category_id
            WHERE sp.product_id = %s
              AND sp.status = 'ACTIVE'
              AND s.status = 'ACTIVE'
              AND p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
            ORDER BY sp.is_preferred DESC, sp.purchase_price ASC, s.supplier_name
            LIMIT 1
        """, (product_id,))

        supplier_row = cur.fetchone()
        if not supplier_row:
            conn.rollback()
            return jsonify({"message": "No active supplier assigned for this product"}), 400

        supplier_id = supplier_row[0]
        unit_cost = supplier_row[1]
        suggested_quantity = max((reorder_level * 2) - quantity_in_stock, reorder_level)
        subtotal = suggested_quantity * unit_cost

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
        """, (supplier_id, branch_id, created_by, subtotal))

        purchase_row = cur.fetchone()
        purchase_id = purchase_row[0]
        purchase_code = purchase_row[1]

        cur.execute("""
            INSERT INTO purchase_detail (
                purchase_id,
                product_id,
                quantity,
                unit_cost,
                subtotal
            )
            VALUES (%s, %s, %s, %s, %s)
        """, (purchase_id, product_id, suggested_quantity, unit_cost, subtotal))

        conn.commit()

        return jsonify({
            "message": "Warehouse purchase created successfully",
            "purchase_id": purchase_id,
            "purchase_code": purchase_code,
            "supplier_id": supplier_id,
            "branch_id": branch_id,
            "product_id": product_id,
            "quantity": suggested_quantity,
            "unit_cost": _to_float(unit_cost),
            "total_amount": _to_float(subtotal)
        }), 201

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR /admin/warehouse/purchase-needed/<product_id>/create-purchase POST:", e)
        return jsonify({"message": str(e)}), 500
    finally:
        _close(conn, cur)
