from flask import Blueprint, request, jsonify
from db import get_connection
from audit import log_audit

stock_transfer_bp = Blueprint("stock_transfer_bp", __name__)


def _get_user(cur, user_id):
    if not user_id:
        return None

    cur.execute("""
        SELECT user_id, role, branch_id, status
        FROM users
        WHERE user_id = %s
    """, (user_id,))

    row = cur.fetchone()
    if not row:
        return None

    return {
        "user_id": row[0],
        "role": row[1],
        "branch_id": row[2],
        "status": row[3],
    }


def _get_branch_type(cur, branch_id):
    cur.execute("""
        SELECT branch_type
        FROM branch
        WHERE branch_id = %s
    """, (branch_id,))

    row = cur.fetchone()
    return row[0] if row else None


def _can_create_request(user, from_branch_id, to_branch_id):
    if not user or user["status"] != "ACTIVE":
        return False, "Requesting user not found or inactive"

    if user["role"] not in ["BRANCH_STAFF", "INVENTORY_MANAGER"]:
        return False, "Only staff and inventory managers can request stock transfers"

    if user["role"] in ["BRANCH_STAFF", "INVENTORY_MANAGER"]:
        if _to_int(user["branch_id"]) != _to_int(to_branch_id):
            return False, "Users can only request stock for their assigned branch"

    if _to_int(from_branch_id) == _to_int(to_branch_id):
        return False, "Source and destination branch cannot be the same"

    return True, None


def _can_approve_transfer(user, from_branch_id, from_branch_type, to_branch_type):
    if not user or user["status"] != "ACTIVE":
        return False, "Approver not found or inactive"

    if from_branch_type == "WAREHOUSE" and to_branch_type == "BRANCH":
        if user["role"] != "SYSTEM_ADMIN":
            return False, "Only system admin can approve warehouse stock requests"
        return True, None

    if from_branch_type == "BRANCH" and to_branch_type == "BRANCH":
        if user["role"] == "INVENTORY_MANAGER" and _to_int(user["branch_id"]) == _to_int(from_branch_id):
            return True, None

        return False, "Only the source branch inventory manager can approve branch transfer requests"

    return False, "Unsupported stock transfer approval route"


def _can_manager_approve_endpoint(user, from_branch_id, from_branch_type, to_branch_type):
    if not user or user["status"] != "ACTIVE":
        return False, "Approver not found or inactive"

    if from_branch_type != "BRANCH" or to_branch_type != "BRANCH":
        return False, "Managers can only approve branch-to-branch transfer requests"

    if user["role"] == "INVENTORY_MANAGER" and _to_int(user["branch_id"]) == _to_int(from_branch_id):
        return True, None

    return False, "Only the source branch inventory manager can approve branch transfer requests"


def _can_admin_approve_endpoint(user, from_branch_type, to_branch_type):
    if not user or user["status"] != "ACTIVE":
        return False, "Approver not found or inactive"

    if from_branch_type != "WAREHOUSE" or to_branch_type != "BRANCH":
        return False, "System admins can only approve warehouse-to-branch transfer requests here"

    if user["role"] != "SYSTEM_ADMIN":
        return False, "Only system admin can approve warehouse stock requests"

    return True, None


def _can_receive_transfer(user, to_branch_id):
    if not user or user["status"] != "ACTIVE":
        return False, "Receiver not found or inactive"

    if user["role"] != "INVENTORY_MANAGER":
        return False, "Only inventory managers can confirm received stock"

    if _to_int(user["branch_id"]) != _to_int(to_branch_id):
        return False, "Inventory managers can only receive stock for their assigned branch"

    return True, None


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# =========================
# STAFF - CREATE REQUEST
# =========================
@stock_transfer_bp.route("/staff/stock-transfer/request", methods=["POST"])
@stock_transfer_bp.route("/manager/stock-transfer/request", methods=["POST"])
def create_transfer_request():
    conn = None
    cur = None
    try:
        data = request.get_json()

        from_branch_id = data.get("from_branch_id")
        to_branch_id = data.get("to_branch_id")
        requested_by = data.get("requested_by")

        if not all([from_branch_id, to_branch_id, requested_by]):
            return jsonify({"message": "Missing required fields"}), 400

        conn = get_connection()
        cur = conn.cursor()

        from_branch_type = _get_branch_type(cur, from_branch_id)
        to_branch_type = _get_branch_type(cur, to_branch_id)

        if not from_branch_type or not to_branch_type:
            return jsonify({"message": "Source or destination branch not found"}), 404

        if to_branch_type != "BRANCH":
            return jsonify({"message": "Stock transfer destination must be a branch"}), 400

        user = _get_user(cur, requested_by)
        allowed, message = _can_create_request(user, from_branch_id, to_branch_id)

        if not allowed:
            return jsonify({"message": message}), 403

        cur.execute("""
            INSERT INTO stock_transfer (
                from_branch_id,
                to_branch_id,
                status,
                requested_by,
                reject_reason,
                approved_at
            )
            VALUES (%s, %s, 'PENDING', %s, NULL, NULL)
            RETURNING transfer_id, transfer_code
        """, (from_branch_id, to_branch_id, requested_by))

        new_transfer = cur.fetchone()
        conn.commit()
        log_audit(
            requested_by,
            "CREATE_TRANSFER",
            "Stock Transfer",
            new_transfer[0],
            f"Created Stock Transfer {new_transfer[1]}."
        )

        return jsonify({
            "message": "Transfer request created",
            "transfer_id": new_transfer[0],
            "transfer_code": new_transfer[1]
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# =========================
# MANAGER (SOURCE) - APPROVE
# =========================
@stock_transfer_bp.route("/manager/stock-transfer/<int:transfer_id>/approve", methods=["PUT"])
def approve_transfer(transfer_id):
    return process_transfer_approval(transfer_id, approval_scope="MANAGER")


@stock_transfer_bp.route("/admin/stock-transfer/<int:transfer_id>/approve", methods=["PUT"])
def admin_approve_transfer(transfer_id):
    return process_transfer_approval(transfer_id, approval_scope="ADMIN")


def process_transfer_approval(transfer_id, approval_scope=None):
    conn = None
    cur = None
    try:
        data = request.get_json()
        approved_by = data.get("approved_by")

        if not approved_by:
            return jsonify({"message": "Approver is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Get transfer info
        cur.execute("""
            SELECT st.from_branch_id, st.to_branch_id, fb.branch_type, tb.branch_type, st.transfer_code
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            WHERE transfer_id = %s AND status = 'PENDING'
            FOR UPDATE OF st
        """, (transfer_id,))
        transfer = cur.fetchone()

        if not transfer:
            return jsonify({"message": "Transfer not found or already processed"}), 404

        from_branch_id, to_branch_id, from_branch_type, to_branch_type, transfer_code = transfer
        approver = _get_user(cur, approved_by)

        if approval_scope == "MANAGER":
            allowed, message = _can_manager_approve_endpoint(
                approver,
                from_branch_id,
                from_branch_type,
                to_branch_type
            )
        elif approval_scope == "ADMIN":
            allowed, message = _can_admin_approve_endpoint(
                approver,
                from_branch_type,
                to_branch_type
            )
        else:
            allowed, message = _can_approve_transfer(
                approver,
                from_branch_id,
                from_branch_type,
                to_branch_type
            )

        if not allowed:
            conn.rollback()
            return jsonify({"message": message}), 403

        # Get transfer items
        cur.execute("""
            SELECT transfer_detail_id, product_id, quantity
            FROM transfer_detail
            WHERE transfer_id = %s
        """, (transfer_id,))
        items = cur.fetchall()

        if not items:
            conn.rollback()
            return jsonify({"message": "Transfer has no items to approve"}), 400

        stock_updates = []

        # Check all source stock before making any inventory changes.
        for transfer_detail_id, product_id, qty in items:
            cur.execute("""
                SELECT quantity_in_stock
                FROM inventory
                WHERE product_id = %s AND branch_id = %s
                FOR UPDATE
            """, (product_id, from_branch_id))

            stock = cur.fetchone()

            if not stock or stock[0] < qty:
                conn.rollback()
                return jsonify({
                    "message": "Insufficient source stock for one or more transfer items",
                    "product_id": product_id,
                    "available_stock": stock[0] if stock else 0,
                    "requested_quantity": qty
                }), 400

            source_stock_before = stock[0]
            source_stock_after = source_stock_before - qty
            stock_updates.append((transfer_detail_id, product_id, qty, source_stock_before, source_stock_after))

        # Deduct inventory from source branch only after every item has passed validation.
        for transfer_detail_id, product_id, qty, source_stock_before, source_stock_after in stock_updates:
            cur.execute("""
                UPDATE inventory
                SET quantity_in_stock = quantity_in_stock - %s,
                    last_updated = CURRENT_TIMESTAMP
                WHERE product_id = %s AND branch_id = %s
            """, (qty, product_id, from_branch_id))

            cur.execute("""
                UPDATE transfer_detail
                SET source_stock_before = %s,
                    source_stock_after = %s
                WHERE transfer_detail_id = %s
            """, (source_stock_before, source_stock_after, transfer_detail_id))

        # Update status
        cur.execute("""
            UPDATE stock_transfer
            SET status = 'APPROVED',
                approved_by = %s,
                reject_reason = NULL,
                approved_at = CURRENT_TIMESTAMP
            WHERE transfer_id = %s
        """, (approved_by, transfer_id))

        conn.commit()
        log_audit(
            approved_by,
            "APPROVE_TRANSFER",
            "Stock Transfer",
            transfer_id,
            f"Approved Stock Transfer {transfer_code}."
        )

        return jsonify({"message": "Transfer approved (now in transit)"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# =========================
# MANAGER (SOURCE) - REJECT
# =========================
@stock_transfer_bp.route("/manager/stock-transfer/<int:transfer_id>/reject", methods=["PUT"])
def reject_transfer(transfer_id):
    return process_transfer_rejection(transfer_id)


@stock_transfer_bp.route("/admin/stock-transfer/<int:transfer_id>/reject", methods=["PUT"])
def admin_reject_transfer(transfer_id):
    return process_transfer_rejection(transfer_id)


def process_transfer_rejection(transfer_id):
    conn = None
    cur = None
    try:
        data = request.get_json()
        approved_by = data.get("approved_by")
        reject_reason = (data.get("reject_reason") or "").strip()

        if not approved_by:
            return jsonify({"message": "Approver is required"}), 400

        if not reject_reason:
            return jsonify({"message": "Reject reason is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT st.from_branch_id, fb.branch_type, tb.branch_type, st.transfer_code
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            WHERE st.transfer_id = %s AND st.status = 'PENDING'
            FOR UPDATE OF st
        """, (transfer_id,))

        transfer = cur.fetchone()

        if not transfer:
            return jsonify({"message": "Transfer not found or already processed"}), 404

        from_branch_id, from_branch_type, to_branch_type, transfer_code = transfer
        approver = _get_user(cur, approved_by)

        if request.path.startswith("/manager/"):
            allowed, message = _can_manager_approve_endpoint(
                approver,
                from_branch_id,
                from_branch_type,
                to_branch_type
            )
        elif request.path.startswith("/admin/"):
            allowed, message = _can_admin_approve_endpoint(
                approver,
                from_branch_type,
                to_branch_type
            )
        else:
            allowed, message = _can_approve_transfer(
                approver,
                from_branch_id,
                from_branch_type,
                to_branch_type
            )

        if not allowed:
            conn.rollback()
            return jsonify({"message": message}), 403

        cur.execute("""
            UPDATE stock_transfer
            SET status = 'REJECTED',
                approved_by = %s,
                reject_reason = %s,
                approved_at = CURRENT_TIMESTAMP
            WHERE transfer_id = %s AND status = 'PENDING'
        """, (approved_by, reject_reason, transfer_id))

        conn.commit()
        log_audit(
            approved_by,
            "REJECT_TRANSFER",
            "Stock Transfer",
            transfer_id,
            f"Rejected Stock Transfer {transfer_code}."
        )

        return jsonify({"message": "Transfer rejected"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# =========================
# MANAGER (DESTINATION) - RECEIVE
# =========================
@stock_transfer_bp.route("/manager/stock-transfer/<int:transfer_id>/receive", methods=["PUT"])
def receive_transfer(transfer_id):
    conn = None
    cur = None
    try:
        data = request.get_json()
        received_by = data.get("received_by")

        if not received_by:
            return jsonify({"message": "Receiver is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Get transfer info
        cur.execute("""
            SELECT from_branch_id, to_branch_id, transfer_code
            FROM stock_transfer
            WHERE transfer_id = %s AND status = 'APPROVED'
        """, (transfer_id,))
        transfer = cur.fetchone()

        if not transfer:
            return jsonify({"message": "Transfer not ready for receiving"}), 400

        from_branch_id, to_branch_id, transfer_code = transfer
        receiver = _get_user(cur, received_by)
        allowed, message = _can_receive_transfer(receiver, to_branch_id)

        if not allowed:
            return jsonify({"message": message}), 403

        # Get items
        cur.execute("""
            SELECT transfer_detail_id, product_id, quantity
            FROM transfer_detail
            WHERE transfer_id = %s
        """, (transfer_id,))
        items = cur.fetchall()

        # Add to destination branch
        for item in items:
            transfer_detail_id, product_id, qty = item

            # Check if inventory exists
            cur.execute("""
                SELECT quantity_in_stock FROM inventory
                WHERE product_id = %s AND branch_id = %s
            """, (product_id, to_branch_id))

            destination_stock = cur.fetchone()
            destination_stock_before = destination_stock[0] if destination_stock else 0
            destination_stock_after = destination_stock_before + qty

            if destination_stock:
                cur.execute("""
                    UPDATE inventory
                    SET quantity_in_stock = quantity_in_stock + %s
                    WHERE product_id = %s AND branch_id = %s
                """, (qty, product_id, to_branch_id))
            else:
                cur.execute("""
                    INSERT INTO inventory (product_id, branch_id, quantity_in_stock)
                    VALUES (%s, %s, %s)
                """, (product_id, to_branch_id, qty))

            cur.execute("""
                UPDATE transfer_detail
                SET destination_stock_before = %s,
                    destination_stock_after = %s
                WHERE transfer_detail_id = %s
            """, (destination_stock_before, destination_stock_after, transfer_detail_id))

        # Update transfer status
        cur.execute("""
            UPDATE stock_transfer
            SET status = 'RECEIVED',
                received_by = %s
            WHERE transfer_id = %s
        """, (received_by, transfer_id))

        conn.commit()
        log_audit(
            received_by,
            "COMPLETE_TRANSFER",
            "Stock Transfer",
            transfer_id,
            f"Completed Stock Transfer {transfer_code}."
        )

        return jsonify({"message": "Stock received successfully"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# =========================
# VIEW TRANSFERS
# =========================
@stock_transfer_bp.route("/admin/stock-transfers/records", methods=["GET"])
def get_admin_stock_transfer_records():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT st.transfer_id,
                   st.transfer_code,
                   st.from_branch_id,
                   fb.branch_name AS source_name,
                   fb.branch_type AS source_type,
                   st.to_branch_id,
                   tb.branch_name AS destination_name,
                   tb.branch_type AS destination_type,
                   COALESCE(SUM(td.quantity), 0) AS requested_quantity,
                   st.status,
                   st.transfer_date
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            LEFT JOIN transfer_detail td ON st.transfer_id = td.transfer_id
            GROUP BY st.transfer_id,
                     st.transfer_code,
                     st.from_branch_id,
                     fb.branch_name,
                     fb.branch_type,
                     st.to_branch_id,
                     tb.branch_name,
                     tb.branch_type,
                     st.status,
                     st.transfer_date
            ORDER BY st.transfer_date DESC, st.transfer_id DESC
        """)

        rows = cur.fetchall()

        records = []
        for row in rows:
            records.append({
                "transfer_id": row[0],
                "transfer_code": row[1],
                "from_branch_id": row[2],
                "source_name": row[3],
                "source_type": row[4],
                "to_branch_id": row[5],
                "destination_name": row[6],
                "destination_type": row[7],
                "requested_quantity": row[8],
                "status": row[9],
                "transfer_date": row[10].isoformat() if row[10] else None
            })

        cur.close()
        conn.close()

        return jsonify(records), 200

    except Exception as e:
        print("ERROR get_admin_stock_transfer_records:", e)
        return jsonify({"message": str(e)}), 500


@stock_transfer_bp.route("/admin/stock-transfers/<int:transfer_id>/details", methods=["GET"])
def get_admin_stock_transfer_details(transfer_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT st.transfer_id,
                   st.transfer_code,
                   fb.branch_name AS source_name,
                   fb.branch_type AS source_type,
                   tb.branch_name AS destination_name,
                   tb.branch_type AS destination_type,
                   req.name AS requested_by_name,
                   appr.name AS approved_by_name,
                   recv.name AS received_by_name,
                   st.status,
                   st.transfer_date
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            LEFT JOIN users req ON st.requested_by = req.user_id
            LEFT JOIN users appr ON st.approved_by = appr.user_id
            LEFT JOIN users recv ON st.received_by = recv.user_id
            WHERE st.transfer_id = %s
        """, (transfer_id,))

        transfer_row = cur.fetchone()

        if not transfer_row:
            cur.close()
            conn.close()
            return jsonify({"message": "Transfer not found"}), 404

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

        cur.close()
        conn.close()

        return jsonify({
            "transfer_id": transfer_row[0],
            "transfer_code": transfer_row[1],
            "source_name": transfer_row[2],
            "source_type": transfer_row[3],
            "destination_name": transfer_row[4],
            "destination_type": transfer_row[5],
            "requested_by": transfer_row[6],
            "approved_by": transfer_row[7],
            "received_by": transfer_row[8],
            "status": transfer_row[9],
            "transfer_date": transfer_row[10].isoformat() if transfer_row[10] else None,
            "details": details
        }), 200

    except Exception as e:
        print("ERROR get_admin_stock_transfer_details:", e)
        return jsonify({"message": str(e)}), 500


@stock_transfer_bp.route("/stock-transfers", methods=["GET"])
def get_transfers():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT st.transfer_id,
                   st.transfer_code,
                   st.from_branch_id,
                   fb.branch_name AS source_branch_name,
                   fb.branch_type AS source_branch_type,
                   st.to_branch_id,
                   tb.branch_name AS destination_branch_name,
                   tb.branch_type AS destination_branch_type,
                   st.status,
                   st.requested_by,
                   st.approved_by,
                   st.received_by,
                   st.reject_reason,
                   st.approved_at,
                   st.transfer_date,
                   COALESCE(
                       ARRAY_AGG(td.product_id ORDER BY td.product_id)
                       FILTER (WHERE td.product_id IS NOT NULL),
                       ARRAY[]::INTEGER[]
                   ) AS product_ids
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            LEFT JOIN transfer_detail td ON st.transfer_id = td.transfer_id
            GROUP BY st.transfer_id,
                     st.transfer_code,
                     st.from_branch_id,
                     fb.branch_name,
                     fb.branch_type,
                     st.to_branch_id,
                     tb.branch_name,
                     tb.branch_type,
                     st.status,
                     st.requested_by,
                     st.approved_by,
                     st.received_by,
                     st.reject_reason,
                     st.approved_at,
                     st.transfer_date
            ORDER BY st.transfer_id DESC
        """)

        rows = cur.fetchall()

        transfers = []
        for row in rows:
            transfers.append({
                "transfer_id": row[0],
                "transfer_code": row[1],
                "from_branch_id": row[2],
                "source_branch_name": row[3],
                "source_branch_type": row[4],
                "to_branch_id": row[5],
                "destination_branch_name": row[6],
                "destination_branch_type": row[7],
                "status": row[8],
                "requested_by": row[9],
                "approved_by": row[10],
                "received_by": row[11],
                "reject_reason": row[12],
                "approved_at": row[13].isoformat() if row[13] else None,
                "transfer_date": row[14].isoformat() if row[14] else None,
                "product_ids": row[15] or []
            })

        cur.close()
        conn.close()

        return jsonify(transfers), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@stock_transfer_bp.route("/manager/stock-transfer/approvals", methods=["GET"])
def get_manager_stock_transfer_approvals():
    try:
        branch_id = request.args.get("branch_id")

        if not branch_id:
            return jsonify({"message": "Manager branch_id is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT st.transfer_id,
                   st.transfer_code,
                   st.from_branch_id,
                   fb.branch_name AS source_branch_name,
                   fb.branch_type AS source_branch_type,
                   st.to_branch_id,
                   tb.branch_name AS destination_branch_name,
                   tb.branch_type AS destination_branch_type,
                   st.status,
                   st.requested_by,
                   st.approved_by,
                   st.received_by,
                   st.reject_reason,
                   st.approved_at,
                   st.transfer_date
            FROM stock_transfer st
            JOIN branch fb ON st.from_branch_id = fb.branch_id
            JOIN branch tb ON st.to_branch_id = tb.branch_id
            WHERE st.status = 'PENDING'
              AND fb.branch_type = 'BRANCH'
              AND tb.branch_type = 'BRANCH'
              AND st.from_branch_id = %s
            ORDER BY st.transfer_date DESC, st.transfer_id DESC
        """, (branch_id,))

        rows = cur.fetchall()
        approvals = []

        for row in rows:
            approvals.append({
                "transfer_id": row[0],
                "transfer_code": row[1],
                "from_branch_id": row[2],
                "source_branch_name": row[3],
                "source_branch_type": row[4],
                "to_branch_id": row[5],
                "destination_branch_name": row[6],
                "destination_branch_type": row[7],
                "status": row[8],
                "requested_by": row[9],
                "approved_by": row[10],
                "received_by": row[11],
                "reject_reason": row[12],
                "approved_at": row[13].isoformat() if row[13] else None,
                "transfer_date": row[14].isoformat() if row[14] else None
            })

        cur.close()
        conn.close()

        return jsonify(approvals), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500
    
    # =========================
# ADD TRANSFER ITEM
# =========================
@stock_transfer_bp.route("/stock-transfer/<int:transfer_id>/add-item", methods=["POST"])
def add_transfer_item(transfer_id):
    try:
        data = request.get_json()

        product_id = data.get("product_id")
        quantity = data.get("quantity")

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if quantity is None:
            return jsonify({"message": "Quantity is required"}), 400

        if int(quantity) <= 0:
            return jsonify({"message": "Quantity must be greater than 0"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check transfer exists and still pending
        cur.execute("""
            SELECT status
            FROM stock_transfer
            WHERE transfer_id = %s
        """, (transfer_id,))

        transfer = cur.fetchone()

        if not transfer:
            cur.close()
            conn.close()
            return jsonify({"message": "Transfer not found"}), 404

        if transfer[0] != "PENDING":
            cur.close()
            conn.close()
            return jsonify({"message": "Cannot add item after transfer is approved/rejected/received"}), 400

        # Check product exists
        cur.execute("""
            SELECT 1
            FROM product p
            JOIN category c ON p.category_id = c.category_id
            WHERE p.product_id = %s
              AND p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
        """, (product_id,))

        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        # If same product already exists in this transfer, update quantity
        cur.execute("""
            SELECT transfer_detail_id, quantity
            FROM transfer_detail
            WHERE transfer_id = %s AND product_id = %s
        """, (transfer_id, product_id))

        existing_item = cur.fetchone()

        if existing_item:
            transfer_detail_id = existing_item[0]
            old_quantity = existing_item[1]
            new_quantity = old_quantity + int(quantity)

            cur.execute("""
                UPDATE transfer_detail
                SET quantity = %s
                WHERE transfer_detail_id = %s
            """, (new_quantity, transfer_detail_id))

            conn.commit()
            cur.close()
            conn.close()

            return jsonify({
                "message": "Transfer item quantity updated successfully",
                "transfer_detail_id": transfer_detail_id,
                "quantity": new_quantity
            }), 200

        cur.execute("""
            INSERT INTO transfer_detail (transfer_id, product_id, quantity)
            VALUES (%s, %s, %s)
            RETURNING transfer_detail_id
        """, (transfer_id, product_id, quantity))

        new_detail_id = cur.fetchone()[0]
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Transfer item added successfully",
            "transfer_detail_id": new_detail_id
        }), 201

    except Exception as e:
        print("ERROR add_transfer_item:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# GET TRANSFER ITEMS
# =========================
@stock_transfer_bp.route("/stock-transfer/<int:transfer_id>/items", methods=["GET"])
def get_transfer_items(transfer_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT td.transfer_detail_id,
                   td.transfer_id,
                   td.product_id,
                   p.product_code,
                   p.product_name,
                   td.quantity
            FROM transfer_detail td
            JOIN product p ON td.product_id = p.product_id
            WHERE td.transfer_id = %s
            ORDER BY td.transfer_detail_id
        """, (transfer_id,))

        rows = cur.fetchall()

        items = []
        for row in rows:
            items.append({
                "transfer_detail_id": row[0],
                "transfer_id": row[1],
                "product_id": row[2],
                "product_code": row[3],
                "product_name": row[4],
                "quantity": row[5]
            })

        cur.close()
        conn.close()

        return jsonify(items), 200

    except Exception as e:
        print("ERROR get_transfer_items:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# UPDATE TRANSFER ITEM
# =========================
@stock_transfer_bp.route("/stock-transfer/item/<int:transfer_detail_id>", methods=["PUT"])
def update_transfer_item(transfer_detail_id):
    try:
        data = request.get_json()
        quantity = data.get("quantity")

        if quantity is None:
            return jsonify({"message": "Quantity is required"}), 400

        if int(quantity) <= 0:
            return jsonify({"message": "Quantity must be greater than 0"}), 400

        conn = get_connection()
        cur = conn.cursor()

        # Check item exists and transfer is still pending
        cur.execute("""
            SELECT st.status
            FROM transfer_detail td
            JOIN stock_transfer st ON td.transfer_id = st.transfer_id
            WHERE td.transfer_detail_id = %s
        """, (transfer_detail_id,))

        result = cur.fetchone()

        if not result:
            cur.close()
            conn.close()
            return jsonify({"message": "Transfer item not found"}), 404

        if result[0] != "PENDING":
            cur.close()
            conn.close()
            return jsonify({"message": "Cannot update item after transfer is approved/rejected/received"}), 400

        cur.execute("""
            UPDATE transfer_detail
            SET quantity = %s
            WHERE transfer_detail_id = %s
        """, (quantity, transfer_detail_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Transfer item updated successfully"}), 200

    except Exception as e:
        print("ERROR update_transfer_item:", e)
        return jsonify({"message": str(e)}), 500


# =========================
# DELETE TRANSFER ITEM
# =========================
@stock_transfer_bp.route("/stock-transfer/item/<int:transfer_detail_id>", methods=["DELETE"])
def delete_transfer_item(transfer_detail_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check item exists and transfer is still pending
        cur.execute("""
            SELECT st.status
            FROM transfer_detail td
            JOIN stock_transfer st ON td.transfer_id = st.transfer_id
            WHERE td.transfer_detail_id = %s
        """, (transfer_detail_id,))

        result = cur.fetchone()

        if not result:
            cur.close()
            conn.close()
            return jsonify({"message": "Transfer item not found"}), 404

        if result[0] != "PENDING":
            cur.close()
            conn.close()
            return jsonify({"message": "Cannot delete item after transfer is approved/rejected/received"}), 400

        cur.execute("""
            DELETE FROM transfer_detail
            WHERE transfer_detail_id = %s
        """, (transfer_detail_id,))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Transfer item deleted successfully"}), 200

    except Exception as e:
        print("ERROR delete_transfer_item:", e)
        return jsonify({"message": str(e)}), 500
    
    # =========================
# SMART AUTO SUGGEST TRANSFER
# =========================
@stock_transfer_bp.route("/manager/stock-transfer/auto-suggest", methods=["POST"])
def auto_suggest_transfer():
    conn = None
    cur = None
    try:
        data = request.get_json()

        product_id = data.get("product_id")
        to_branch_id = data.get("to_branch_id")
        requested_by = data.get("requested_by")

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if to_branch_id is None:
            return jsonify({"message": "Destination branch is required"}), 400

        if requested_by is None:
            return jsonify({"message": "Requested by is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        requester = _get_user(cur, requested_by)

        if not requester or requester["status"] != "ACTIVE":
            return jsonify({"message": "Requesting user not found or inactive"}), 403

        if requester["role"] != "INVENTORY_MANAGER":
            return jsonify({"message": "Only inventory managers can create manager transfer requests"}), 403

        if _to_int(requester["branch_id"]) != _to_int(to_branch_id):
            return jsonify({"message": "Managers can only request stock for their assigned branch"}), 403

        # Check product reorder level
        cur.execute("""
            SELECT p.reorder_level
            FROM product p
            JOIN category c ON p.category_id = c.category_id
            WHERE p.product_id = %s
              AND p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
        """, (product_id,))

        product_row = cur.fetchone()

        if not product_row:
            cur.close()
            conn.close()
            return jsonify({"message": "Product not found"}), 404

        reorder_level = int(product_row[0])

        # Check destination branch stock
        cur.execute("""
            SELECT quantity_in_stock
            FROM inventory
            WHERE product_id = %s AND branch_id = %s
        """, (product_id, to_branch_id))

        dest_stock_row = cur.fetchone()

        if not dest_stock_row:
            cur.close()
            conn.close()
            return jsonify({"message": "Product is not assigned to this branch"}), 404

        current_stock = int(dest_stock_row[0])

        if current_stock > reorder_level:
            cur.close()
            conn.close()
            return jsonify({"message": "This product is not low stock"}), 400

        request_qty = reorder_level - current_stock

        if request_qty <= 0:
            request_qty = reorder_level

        # Prevent duplicate pending/approved request for same product and destination branch
        cur.execute("""
            SELECT st.transfer_id
            FROM stock_transfer st
            JOIN transfer_detail td ON st.transfer_id = td.transfer_id
            WHERE st.to_branch_id = %s
              AND td.product_id = %s
              AND st.status IN ('PENDING', 'APPROVED')
            LIMIT 1
        """, (to_branch_id, product_id))

        duplicate = cur.fetchone()

        if duplicate:
            cur.close()
            conn.close()
            return jsonify({
                "message": "A pending or approved transfer already exists for this product"
            }), 400

        # Prefer warehouse stock first, then the highest-stock source branch.
        cur.execute("""
            SELECT i.branch_id, i.quantity_in_stock
            FROM inventory i
            JOIN branch b ON i.branch_id = b.branch_id
            WHERE i.product_id = %s
              AND i.branch_id <> %s
              AND i.quantity_in_stock >= %s
            ORDER BY
              CASE WHEN b.branch_type = 'WAREHOUSE' THEN 0 ELSE 1 END,
              i.quantity_in_stock DESC
            LIMIT 1
        """, (product_id, to_branch_id, request_qty))

        source_row = cur.fetchone()

        if not source_row:
            cur.close()
            conn.close()
            return jsonify({
                "message": "No branch has enough stock for this product"
            }), 400

        from_branch_id = source_row[0]

        cur.execute("""
            INSERT INTO stock_transfer (
                from_branch_id,
                to_branch_id,
                status,
                requested_by,
                reject_reason,
                approved_at
            )
            VALUES (%s, %s, 'PENDING', %s, NULL, NULL)
            RETURNING transfer_id, transfer_code
        """, (from_branch_id, to_branch_id, requested_by))

        transfer = cur.fetchone()
        transfer_id = transfer[0]
        transfer_code = transfer[1]

        # Create transfer detail
        cur.execute("""
            INSERT INTO transfer_detail (
                transfer_id,
                product_id,
                quantity
            )
            VALUES (%s, %s, %s)
        """, (transfer_id, product_id, request_qty))

        conn.commit()
        log_audit(
            requested_by,
            "CREATE_TRANSFER",
            "Stock Transfer",
            transfer_id,
            f"Created Stock Transfer {transfer_code}."
        )
        return jsonify({
            "message": "Stock transfer request created successfully",
            "transfer_id": transfer_id,
            "transfer_code": transfer_code,
            "from_branch_id": from_branch_id,
            "to_branch_id": to_branch_id,
            "quantity": request_qty
        }), 201

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR auto_suggest_transfer:", e)
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
