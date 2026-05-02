from flask import Blueprint, request, jsonify
from db import get_connection

stock_transfer_bp = Blueprint("stock_transfer_bp", __name__)

# =========================
# STAFF - CREATE REQUEST
# =========================
@stock_transfer_bp.route("/staff/stock-transfer/request", methods=["POST"])
def create_transfer_request():
    try:
        data = request.get_json()

        from_branch_id = data.get("from_branch_id")
        to_branch_id = data.get("to_branch_id")
        requested_by = data.get("requested_by")

        if not all([from_branch_id, to_branch_id, requested_by]):
            return jsonify({"message": "Missing required fields"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO stock_transfer (
                from_branch_id,
                to_branch_id,
                status,
                requested_by
            )
            VALUES (%s, %s, 'PENDING', %s)
            RETURNING transfer_id, transfer_code
        """, (from_branch_id, to_branch_id, requested_by))

        new_transfer = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "message": "Transfer request created",
            "transfer_id": new_transfer[0],
            "transfer_code": new_transfer[1]
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# =========================
# MANAGER (SOURCE) - APPROVE
# =========================
@stock_transfer_bp.route("/manager/stock-transfer/<int:transfer_id>/approve", methods=["PUT"])
def approve_transfer(transfer_id):
    try:
        data = request.get_json()
        approved_by = data.get("approved_by")

        conn = get_connection()
        cur = conn.cursor()

        # Get transfer info
        cur.execute("""
            SELECT from_branch_id, to_branch_id
            FROM stock_transfer
            WHERE transfer_id = %s AND status = 'PENDING'
        """, (transfer_id,))
        transfer = cur.fetchone()

        if not transfer:
            return jsonify({"message": "Transfer not found or already processed"}), 404

        from_branch_id, to_branch_id = transfer

        # Get transfer items
        cur.execute("""
            SELECT product_id, quantity
            FROM transfer_detail
            WHERE transfer_id = %s
        """, (transfer_id,))
        items = cur.fetchall()

        # Deduct inventory from source branch
        for item in items:
            product_id, qty = item

            cur.execute("""
                SELECT quantity_in_stock
                FROM inventory
                WHERE product_id = %s AND branch_id = %s
            """, (product_id, from_branch_id))

            stock = cur.fetchone()

            if not stock or stock[0] < qty:
                return jsonify({"message": "Insufficient stock"}), 400

            cur.execute("""
                UPDATE inventory
                SET quantity_in_stock = quantity_in_stock - %s
                WHERE product_id = %s AND branch_id = %s
            """, (qty, product_id, from_branch_id))

        # Update status
        cur.execute("""
            UPDATE stock_transfer
            SET status = 'APPROVED',
                approved_by = %s
            WHERE transfer_id = %s
        """, (approved_by, transfer_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Transfer approved (now in transit)"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# =========================
# MANAGER (SOURCE) - REJECT
# =========================
@stock_transfer_bp.route("/manager/stock-transfer/<int:transfer_id>/reject", methods=["PUT"])
def reject_transfer(transfer_id):
    try:
        data = request.get_json()
        approved_by = data.get("approved_by")

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE stock_transfer
            SET status = 'REJECTED',
                approved_by = %s
            WHERE transfer_id = %s AND status = 'PENDING'
        """, (approved_by, transfer_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Transfer rejected"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# =========================
# MANAGER (DESTINATION) - RECEIVE
# =========================
@stock_transfer_bp.route("/manager/stock-transfer/<int:transfer_id>/receive", methods=["PUT"])
def receive_transfer(transfer_id):
    try:
        data = request.get_json()
        received_by = data.get("received_by")

        conn = get_connection()
        cur = conn.cursor()

        # Get transfer info
        cur.execute("""
            SELECT from_branch_id, to_branch_id
            FROM stock_transfer
            WHERE transfer_id = %s AND status = 'APPROVED'
        """, (transfer_id,))
        transfer = cur.fetchone()

        if not transfer:
            return jsonify({"message": "Transfer not ready for receiving"}), 400

        from_branch_id, to_branch_id = transfer

        # Get items
        cur.execute("""
            SELECT product_id, quantity
            FROM transfer_detail
            WHERE transfer_id = %s
        """, (transfer_id,))
        items = cur.fetchall()

        # Add to destination branch
        for item in items:
            product_id, qty = item

            # Check if inventory exists
            cur.execute("""
                SELECT 1 FROM inventory
                WHERE product_id = %s AND branch_id = %s
            """, (product_id, to_branch_id))

            if cur.fetchone():
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

        # Update transfer status
        cur.execute("""
            UPDATE stock_transfer
            SET status = 'RECEIVED',
                received_by = %s
            WHERE transfer_id = %s
        """, (received_by, transfer_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Stock received successfully"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# =========================
# VIEW TRANSFERS
# =========================
@stock_transfer_bp.route("/stock-transfers", methods=["GET"])
def get_transfers():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT transfer_id, transfer_code,
                   from_branch_id, to_branch_id,
                   status
            FROM stock_transfer
            ORDER BY transfer_id DESC
        """)

        rows = cur.fetchall()

        transfers = []
        for row in rows:
            transfers.append({
                "transfer_id": row[0],
                "transfer_code": row[1],
                "from_branch_id": row[2],
                "to_branch_id": row[3],
                "status": row[4]
            })

        cur.close()
        conn.close()

        return jsonify(transfers), 200

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
            FROM product
            WHERE product_id = %s
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