from decimal import Decimal

from flask import Blueprint, request, jsonify
from db import get_connection

inventory_bp = Blueprint("inventory_bp", __name__)


ACTIVE_PURCHASE_STATUSES = ("PENDING", "ORDERED")


def _to_float(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def _close(conn=None, cur=None):
    if cur:
        cur.close()
    if conn:
        conn.close()


def _get_admin_user(cur, user_id):
    if not user_id:
        return None

    cur.execute("""
        SELECT user_id, role, status
        FROM users
        WHERE user_id = %s
    """, (user_id,))

    row = cur.fetchone()
    if not row:
        return None

    return {
        "user_id": row[0],
        "role": row[1],
        "status": row[2],
    }


def _is_active_admin(user):
    return user and user["role"] == "SYSTEM_ADMIN" and user["status"] == "ACTIVE"


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
                   i.last_updated,
                   ap.purchase_id,
                   ap.purchase_code,
                   ap.status
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
                "last_updated": row[6].isoformat() if row[6] else None,
                "active_purchase_id": row[7],
                "active_purchase_code": row[8],
                "active_purchase_status": row[9],
                "has_active_purchase": row[7] is not None
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


# =========================
# ADMIN WAREHOUSE - SUMMARY
# =========================
@inventory_bp.route("/admin/warehouse/summary", methods=["GET"])
def admin_warehouse_summary():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT COALESCE(SUM(i.quantity_in_stock), 0),
                   COUNT(*) FILTER (
                       WHERE i.quantity_in_stock > 0
                         AND i.quantity_in_stock <= COALESCE(p.reorder_level, 0)
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
              AND st.status = 'PENDING'
        """)
        pending_requests = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM inventory i
            JOIN branch b ON i.branch_id = b.branch_id
            JOIN product p ON i.product_id = p.product_id
            WHERE b.branch_type = 'WAREHOUSE'
              AND i.quantity_in_stock <= COALESCE(p.reorder_level, 0)
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
def admin_warehouse_stock():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT i.product_id,
                   p.product_code,
                   p.product_name,
                   c.category_name,
                   i.branch_id,
                   b.branch_name,
                   i.quantity_in_stock,
                   COALESCE(p.reorder_level, 0) AS reorder_level,
                   CASE
                       WHEN i.quantity_in_stock = 0 THEN 'OUT_OF_STOCK'
                       WHEN i.quantity_in_stock <= COALESCE(p.reorder_level, 0) THEN 'LOW_STOCK'
                       ELSE 'HEALTHY'
                   END AS status,
                   i.last_updated
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            LEFT JOIN category c ON p.category_id = c.category_id
            JOIN branch b ON i.branch_id = b.branch_id
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
                "last_updated": row[9].isoformat() if row[9] else None
            })

        _close(conn, cur)

        return jsonify(result), 200

    except Exception as e:
        print("ERROR /admin/warehouse/stock GET:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# ADMIN WAREHOUSE - TRANSFERS
# =========================
@inventory_bp.route("/admin/warehouse/transfers", methods=["GET"])
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
                   st.status
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
        print("ERROR /admin/warehouse/transfers GET:", e)
        return jsonify({"message": str(e)}), 500


@inventory_bp.route("/admin/warehouse/transfer-approvals", methods=["GET"])
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
            WHERE st.status = 'PENDING'
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
                   td.destination_stock_after
            FROM transfer_detail td
            JOIN product p ON td.product_id = p.product_id
            WHERE td.transfer_id = %s
            ORDER BY td.transfer_detail_id
        """, (transfer_id,))

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
                "destination_stock_after": row[8]
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
def admin_warehouse_approve_transfer(transfer_id):
    conn = None
    cur = None

    try:
        data = request.get_json() or {}
        approved_by = data.get("approved_by")

        if not approved_by:
            return jsonify({"message": "Approver is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        admin_user = _get_admin_user(cur, approved_by)
        if not _is_active_admin(admin_user):
            conn.rollback()
            return jsonify({"message": "Only an active system admin can approve warehouse transfers"}), 403

        cur.execute("""
            SELECT st.from_branch_id, st.to_branch_id
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            WHERE st.transfer_id = %s
              AND st.status = 'PENDING'
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
              AND status = 'PENDING'
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
def admin_warehouse_reject_transfer(transfer_id):
    conn = None
    cur = None

    try:
        data = request.get_json() or {}
        approved_by = data.get("approved_by")
        reject_reason = (data.get("reject_reason") or "").strip()

        if not approved_by:
            return jsonify({"message": "Approver is required"}), 400

        if not reject_reason:
            return jsonify({"message": "Reject reason is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        admin_user = _get_admin_user(cur, approved_by)
        if not _is_active_admin(admin_user):
            conn.rollback()
            return jsonify({"message": "Only an active system admin can reject warehouse transfers"}), 403

        cur.execute("""
            SELECT st.transfer_id
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            WHERE st.transfer_id = %s
              AND st.status = 'PENDING'
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
              AND status = 'PENDING'
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
def admin_warehouse_purchase_needed():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT i.product_id,
                   p.product_code,
                   p.product_name,
                   c.category_name,
                   i.branch_id,
                   b.branch_name AS warehouse_name,
                   i.quantity_in_stock,
                   COALESCE(p.reorder_level, 0) AS reorder_level,
                   GREATEST(
                       COALESCE(p.reorder_level, 0) * 2 - i.quantity_in_stock,
                       COALESCE(p.reorder_level, 0)
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
              AND i.quantity_in_stock <= COALESCE(p.reorder_level, 0)
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
def admin_warehouse_create_purchase(product_id):
    conn = None
    cur = None

    try:
        data = request.get_json() or {}
        branch_id = data.get("branch_id")
        created_by = data.get("created_by")

        if not branch_id:
            return jsonify({"message": "Warehouse branch is required"}), 400

        if not created_by:
            return jsonify({"message": "Created by user is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        admin_user = _get_admin_user(cur, created_by)
        if not _is_active_admin(admin_user):
            conn.rollback()
            return jsonify({"message": "Only an active system admin can create warehouse purchases"}), 403

        cur.execute("""
            SELECT i.quantity_in_stock,
                   COALESCE(p.reorder_level, 0),
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
