import re

from flask import Blueprint, g, request, jsonify
from db import get_connection
from audit import log_audit
from routes.auth_routes import login_required, role_required

purchase_bp = Blueprint("purchase_bp", __name__)

ACTIVE_PURCHASE_STATUSES = ("PENDING", "ORDERED")


def _current_user_id():
    return g.current_user["user_id"]


def normalize_bool(value):
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "preferred")

    return bool(value)


def normalize_supplier_phone(phone):
    phone = str(phone or "").strip()

    if not phone:
        return ""

    digits = re.sub(r"\D", "", phone)
    if 9 <= len(digits) <= 11:
        phone = f"{digits[:3]}-{digits[3:]}"

    if not re.fullmatch(r"\d{3}-\d{6,8}", phone):
        raise ValueError("Phone number must use Malaysia format, like 012-3456789")

    return phone


def validate_supplier_uniqueness(cur, supplier_name, phone, email, supplier_id=None):
    supplier_name = str(supplier_name or "").strip()
    email = str(email or "").strip()

    cur.execute("""
        SELECT 1 FROM supplier
        WHERE LOWER(supplier_name) = LOWER(%s)
          AND (%s IS NULL OR supplier_id <> %s)
    """, (supplier_name, supplier_id, supplier_id))
    if cur.fetchone():
        raise ValueError("Supplier name already exists")

    if phone:
        cur.execute("""
            SELECT 1 FROM supplier
            WHERE phone = %s
              AND (%s IS NULL OR supplier_id <> %s)
        """, (phone, supplier_id, supplier_id))
        if cur.fetchone():
            raise ValueError("Phone number already exists")

    if email:
        cur.execute("""
            SELECT 1 FROM supplier
            WHERE LOWER(email) = LOWER(%s)
              AND (%s IS NULL OR supplier_id <> %s)
        """, (email, supplier_id, supplier_id))
        if cur.fetchone():
            raise ValueError("Email already exists")


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


def ensure_inventory_audit_function(cur):
    cur.execute("""
        CREATE OR REPLACE FUNCTION public.log_inventory_update()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            actor_id integer;
            action_text text;
            description_text text;
        BEGIN
            actor_id := NULLIF(current_setting('app.current_user_id', true), '')::integer;

            IF actor_id IS NULL THEN
                actor_id := NULLIF(current_setting('app.user_id', true), '')::integer;
            END IF;

            IF actor_id IS NULL THEN
                actor_id := NULLIF(current_setting('retailpulse.current_user_id', true), '')::integer;
            END IF;

            IF actor_id IS NULL THEN
                actor_id := NULLIF(current_setting('retailpulse.user_id', true), '')::integer;
            END IF;

            IF actor_id IS NULL THEN
                SELECT user_id
                INTO actor_id
                FROM users
                WHERE role = 'SYSTEM_ADMIN'
                  AND status = 'ACTIVE'
                ORDER BY user_id
                LIMIT 1;
            END IF;

            IF actor_id IS NULL THEN
                SELECT user_id
                INTO actor_id
                FROM users
                WHERE status = 'ACTIVE'
                ORDER BY user_id
                LIMIT 1;
            END IF;

            IF actor_id IS NULL THEN
                RETURN NEW;
            END IF;

            IF TG_OP = 'INSERT' THEN
                action_text := 'INSERT';
                description_text := 'Branch ' || NEW.branch_id ||
                    ': Stock quantity set to ' || NEW.quantity_in_stock;
            ELSE
                action_text := 'UPDATE';
                description_text := 'Branch ' || NEW.branch_id ||
                    ': Stock quantity changed from ' || OLD.quantity_in_stock ||
                    ' to ' || NEW.quantity_in_stock;
            END IF;

            INSERT INTO audit_log (user_id, action, module, record_id, description, created_at)
            VALUES (actor_id, action_text, 'INVENTORY', NEW.product_id, description_text, CURRENT_TIMESTAMP);

            RETURN NEW;
        END;
        $$;
    """)


# =========================================================
# SUPPLIER MANAGEMENT
# =========================================================

@purchase_bp.route("/admin/suppliers", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER")
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
@login_required
@role_required("SYSTEM_ADMIN")
def create_supplier():
    try:
        data = request.get_json()
        actor_user_id = _current_user_id()

        supplier_name = data.get("supplier_name")
        contact_person = data.get("contact_person")
        phone = normalize_supplier_phone(data.get("phone"))
        email = data.get("email")
        address = data.get("address")
        status = data.get("status", "ACTIVE")

        if not supplier_name:
            return jsonify({"message": "Supplier name is required"}), 400

        conn = get_connection()
        cur = conn.cursor()
        validate_supplier_uniqueness(cur, supplier_name, phone, email)

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
        log_audit(
            actor_user_id,
            "ADD_SUPPLIER",
            "Supplier Management",
            row[0],
            f"Added supplier {supplier_name}."
        )

        cur.close()
        conn.close()

        return jsonify({
            "message": "Supplier created successfully",
            "supplier_id": row[0],
            "supplier_code": row[1]
        }), 201

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        print("ERROR create_supplier:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/suppliers/<int:supplier_id>", methods=["PUT"])
@login_required
@role_required("SYSTEM_ADMIN")
def update_supplier(supplier_id):
    try:
        data = request.get_json()
        actor_user_id = _current_user_id()

        supplier_name = data.get("supplier_name")
        contact_person = data.get("contact_person")
        phone = normalize_supplier_phone(data.get("phone"))
        email = data.get("email")
        address = data.get("address")
        status = data.get("status", "ACTIVE")

        conn = get_connection()
        cur = conn.cursor()
        validate_supplier_uniqueness(cur, supplier_name, phone, email, supplier_id)

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
        log_audit(
            actor_user_id,
            "UPDATE_SUPPLIER",
            "Supplier Management",
            supplier_id,
            f"Updated supplier {supplier_name}."
        )
        cur.close()
        conn.close()

        return jsonify({"message": "Supplier updated successfully"}), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        print("ERROR update_supplier:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/suppliers/<int:supplier_id>", methods=["DELETE"])
@login_required
@role_required("SYSTEM_ADMIN")
def delete_supplier(supplier_id):
    try:
        actor_user_id = _current_user_id()
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT supplier_name FROM supplier WHERE supplier_id = %s", (supplier_id,))
        supplier = cur.fetchone()

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
        log_audit(
            actor_user_id,
            "DELETE_SUPPLIER",
            "Supplier Management",
            supplier_id,
            f"Deleted supplier {supplier[0] if supplier else supplier_id}."
        )
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
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER")
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
@login_required
@role_required("SYSTEM_ADMIN")
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
@login_required
@role_required("SYSTEM_ADMIN")
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
                "total_amount": float(row[7] or 0)
            })

        cur.close()
        conn.close()

        return jsonify(result), 200

    except Exception as e:
        print("ERROR get_purchases:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/purchases/products-not-purchased", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN")
def get_products_not_purchased():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                p.product_id,
                p.product_code,
                p.product_name,
                c.category_name,
                p.selling_price,
                supplier_offer.supplier_id,
                supplier_offer.supplier_code,
                supplier_offer.supplier_name,
                supplier_offer.purchase_price,
                supplier_offer.lead_time_days
            FROM product p
            JOIN category c ON p.category_id = c.category_id
            JOIN LATERAL (
                SELECT
                    sp.supplier_id,
                    s.supplier_code,
                    s.supplier_name,
                    sp.purchase_price,
                    sp.lead_time_days,
                    sp.is_preferred
                FROM supplier_product sp
                JOIN supplier s ON sp.supplier_id = s.supplier_id
                WHERE sp.product_id = p.product_id
                  AND sp.status = 'ACTIVE'
                  AND s.status = 'ACTIVE'
                ORDER BY sp.is_preferred DESC,
                         sp.purchase_price ASC,
                         s.supplier_name ASC
                LIMIT 1
            ) supplier_offer ON TRUE
            WHERE p.status = 'ACTIVE'
              AND c.status = 'ACTIVE'
              AND NOT EXISTS (
                  SELECT 1
                  FROM purchase_detail pd
                  WHERE pd.product_id = p.product_id
              )
            ORDER BY p.product_id DESC
            LIMIT 8
        """)

        rows = cur.fetchall()
        result = []
        for row in rows:
            result.append({
                "product_id": row[0],
                "product_code": row[1],
                "product_name": row[2],
                "category_name": row[3],
                "selling_price": float(row[4]),
                "supplier_id": row[5],
                "supplier_code": row[6],
                "supplier_name": row[7],
                "purchase_price": float(row[8]),
                "lead_time_days": row[9],
            })

        cur.close()
        conn.close()

        return jsonify(result), 200

    except Exception as e:
        print("ERROR get_products_not_purchased:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/purchases", methods=["POST"])
@login_required
@role_required("SYSTEM_ADMIN")
def create_purchase():
    conn = None
    cur = None

    try:
        data = request.get_json() or {}

        supplier_id = data.get("supplier_id")
        receiving_branch_id = data.get("receiving_branch_id") or data.get("branch_id")
        items = data.get("items")
        created_by = _current_user_id()

        if supplier_id is None:
            return jsonify({"message": "Supplier is required"}), 400

        # Backward compatibility for existing callers that send one product.
        if items is None:
            items = [{
                "product_id": data.get("product_id"),
                "quantity": data.get("quantity"),
                "purchase_price": data.get("purchase_price")
            }]

        if not isinstance(items, list) or len(items) == 0:
            return jsonify({"message": "At least one product item is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        if receiving_branch_id:
            cur.execute("""
                SELECT branch_id, branch_name, branch_type
                FROM branch
                WHERE branch_id = %s
            """, (receiving_branch_id,))
        else:
            cur.execute("""
                SELECT branch_id, branch_name, branch_type
                FROM branch
                WHERE branch_type = 'WAREHOUSE'
                ORDER BY branch_id
                LIMIT 1
            """)
        warehouse = cur.fetchone()

        if not warehouse:
            return jsonify({"message": "Warehouse receiving location not found"}), 400

        warehouse_id = warehouse[0]
        if warehouse[2] != "WAREHOUSE":
            return jsonify({"message": "Supplier purchases can only be received into a warehouse"}), 400

        cur.execute("""
            SELECT 1
            FROM supplier
            WHERE supplier_id = %s
              AND status = 'ACTIVE'
        """, (supplier_id,))
        if not cur.fetchone():
            return jsonify({"message": "Active supplier not found"}), 404

        product_ids = []
        purchase_items = []
        total_amount = 0

        for item in items:
            product_id = item.get("product_id")
            quantity = item.get("quantity")
            purchase_price = item.get("purchase_price")

            if product_id is None:
                return jsonify({"message": "Product is required for every item"}), 400

            if product_id in product_ids:
                return jsonify({"message": "Product cannot be duplicated in the same purchase order"}), 400

            if quantity is None or int(quantity) <= 0:
                return jsonify({"message": "Quantity must be greater than 0"}), 400

            if purchase_price is not None and float(purchase_price) < 0:
                return jsonify({"message": "Purchase price must be greater than or equal to 0"}), 400

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

            product_ids.append(product_id)
            purchase_quantity = int(quantity)
            unit_cost = float(purchase_price) if purchase_price is not None else float(supplier_product[0])
            subtotal = purchase_quantity * unit_cost
            total_amount += subtotal
            purchase_items.append({
                "product_id": product_id,
                "quantity": purchase_quantity,
                "unit_cost": unit_cost,
                "lead_time_days": supplier_product[1],
                "subtotal": subtotal
            })

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
            total_amount
        ))

        row = cur.fetchone()

        for item in purchase_items:
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
                item["product_id"],
                item["quantity"],
                item["unit_cost"],
                item["subtotal"]
            ))

        conn.commit()
        log_audit(
            created_by,
            "CREATE_PURCHASE",
            "Purchase Management",
            row[0],
            f"Created Purchase Order {row[1]}."
        )

        return jsonify({
            "message": "Purchase created successfully",
            "purchase_id": row[0],
            "purchase_code": row[1],
            "branch_id": warehouse_id,
            "branch_name": warehouse[1],
            "items": purchase_items,
            "total_amount": total_amount
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
@login_required
@role_required("SYSTEM_ADMIN")
def get_purchase_details(purchase_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT p.purchase_id,
                   p.purchase_code,
                   p.supplier_id,
                   p.branch_id,
                   p.created_by,
                   p.purchase_date,
                   p.status,
                   p.total_amount,
                   s.supplier_name,
                   s.contact_person,
                   s.phone,
                   s.email,
                   b.branch_name
            FROM purchase p
            JOIN supplier s ON p.supplier_id = s.supplier_id
            JOIN branch b ON p.branch_id = b.branch_id
            WHERE p.purchase_id = %s
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
            "total_amount": float(row[7]),
            "supplier_name": row[8],
            "supplier_contact_person": row[9],
            "supplier_phone": row[10],
            "supplier_email": row[11],
            "branch_name": row[12]
        }

        cur.execute("""
            SELECT pd.purchase_detail_id,
                   pd.product_id,
                   p.product_name,
                   pd.quantity,
                   pd.unit_cost,
                   pd.subtotal,
                   sp.lead_time_days
            FROM purchase_detail pd
            JOIN product p ON pd.product_id = p.product_id
            LEFT JOIN supplier_product sp
              ON sp.product_id = pd.product_id
             AND sp.supplier_id = %s
            WHERE pd.purchase_id = %s
            ORDER BY pd.purchase_detail_id
        """, (purchase["supplier_id"], purchase_id))

        detail_rows = cur.fetchall()
        details = []

        for d in detail_rows:
            details.append({
                "purchase_detail_id": d[0],
                "product_id": d[1],
                "product_name": d[2],
                "quantity": d[3],
                "unit_cost": float(d[4]),
                "subtotal": float(d[5]),
                "lead_time_days": d[6]
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
@login_required
@role_required("SYSTEM_ADMIN")
def add_purchase_detail(purchase_id):
    try:
        data = request.get_json()

        product_id = data.get("product_id")
        quantity = data.get("quantity")
        unit_cost = data.get("unit_cost")

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT supplier_id, branch_id, status
            FROM purchase
            WHERE purchase_id = %s
        """, (purchase_id,))
        purchase_row = cur.fetchone()

        if not purchase_row:
            cur.close()
            conn.close()
            return jsonify({"message": "Purchase not found"}), 404

        if purchase_row[2] != "PENDING":
            cur.close()
            conn.close()
            return jsonify({"message": "Purchase items can only be added while purchase is PENDING"}), 400

        if product_id is None:
            cur.close()
            conn.close()
            return jsonify({"message": "Product is required"}), 400

        if quantity is None or int(quantity) <= 0:
            cur.close()
            conn.close()
            return jsonify({"message": "Quantity must be greater than 0"}), 400

        if unit_cost is None or float(unit_cost) < 0:
            cur.close()
            conn.close()
            return jsonify({"message": "Unit cost cannot be negative"}), 400

        cur.execute("""
            SELECT 1
            FROM purchase_detail
            WHERE purchase_id = %s
              AND product_id = %s
        """, (purchase_id, product_id))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Product cannot be duplicated in the same purchase order"}), 400

        cur.execute("""
            SELECT 1
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
        """, (purchase_row[0], product_id))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"message": "Selected product is not active for this supplier"}), 400

        active_purchase = find_active_purchase_for_product_branch(
            cur,
            product_id,
            purchase_row[1]
        )

        if active_purchase and active_purchase[0] != purchase_id:
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
            int(quantity) * float(unit_cost)
        ))

        row = cur.fetchone()

        cur.execute("""
            UPDATE purchase
            SET total_amount = (
                    SELECT COALESCE(SUM(subtotal), 0)
                    FROM purchase_detail
                    WHERE purchase_id = %s
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE purchase_id = %s
        """, (purchase_id, purchase_id))
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
@login_required
@role_required("SYSTEM_ADMIN")
def delete_purchase_detail(purchase_detail_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT purchase_id
            FROM purchase_detail
            WHERE purchase_detail_id = %s
        """, (purchase_detail_id,))
        detail = cur.fetchone()

        if not detail:
            cur.close()
            conn.close()
            return jsonify({"message": "Purchase detail not found"}), 404

        cur.execute("""
            DELETE FROM purchase_detail
            WHERE purchase_detail_id = %s
        """, (purchase_detail_id,))

        cur.execute("""
            UPDATE purchase
            SET total_amount = (
                    SELECT COALESCE(SUM(subtotal), 0)
                    FROM purchase_detail
                    WHERE purchase_id = %s
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE purchase_id = %s
        """, (detail[0], detail[0]))

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
@login_required
@role_required("SYSTEM_ADMIN")
def mark_purchase_ordered(purchase_id):
    try:
        actor_user_id = _current_user_id()
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT purchase_code, created_by FROM purchase WHERE purchase_id = %s", (purchase_id,))
        purchase = cur.fetchone()

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
        log_audit(
            actor_user_id or (purchase[1] if purchase else None),
            "MARK_PURCHASE_ORDERED",
            "Purchase Management",
            purchase_id,
            f"Purchase Order {purchase[0] if purchase else purchase_id} marked as ordered."
        )
        cur.close()
        conn.close()

        return jsonify({"message": "Purchase marked as ORDERED"}), 200

    except Exception as e:
        print("ERROR mark_purchase_ordered:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/purchases/<int:purchase_id>/cancel", methods=["PUT"])
@login_required
@role_required("SYSTEM_ADMIN")
def cancel_purchase_order(purchase_id):
    try:
        actor_user_id = _current_user_id()
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT purchase_code, created_by FROM purchase WHERE purchase_id = %s", (purchase_id,))
        purchase = cur.fetchone()

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
        log_audit(
            actor_user_id or (purchase[1] if purchase else None),
            "CANCEL_PURCHASE",
            "Purchase Management",
            purchase_id,
            f"Cancelled Purchase Order {purchase[0] if purchase else purchase_id}."
        )
        cur.close()
        conn.close()

        return jsonify({"message": "Purchase order cancelled"}), 200

    except Exception as e:
        print("ERROR cancel_purchase_order:", e)
        return jsonify({"message": str(e)}), 500


@purchase_bp.route("/admin/purchases/<int:purchase_id>/receive", methods=["PUT"])
@login_required
@role_required("SYSTEM_ADMIN")
def mark_purchase_received(purchase_id):
    conn = None
    cur = None

    try:
        actor_user_id = _current_user_id()
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT purchase_id, branch_id, status, purchase_code, created_by
            FROM purchase
            WHERE purchase_id = %s
            FOR UPDATE
        """, (purchase_id,))
        purchase = cur.fetchone()

        if not purchase:
            conn.rollback()
            return jsonify({"message": "Purchase not found"}), 404

        if purchase[2] == "RECEIVED":
            conn.rollback()
            return jsonify({"message": "Purchase has already been received"}), 400

        if purchase[2] != "ORDERED":
            conn.rollback()
            return jsonify({"message": "Only ORDERED purchases can be received"}), 400

        branch_id = purchase[1]
        audit_user_id = actor_user_id

        if not audit_user_id:
            conn.rollback()
            return jsonify({"message": "Receiving user is required for audit logging"}), 400

        for setting_name in (
            "app.current_user_id",
            "app.user_id",
            "retailpulse.current_user_id",
            "retailpulse.user_id",
        ):
            cur.execute("SELECT set_config(%s, %s, true)", (setting_name, str(audit_user_id)))

        ensure_inventory_audit_function(cur)

        cur.execute("""
            SELECT purchase_detail_id, product_id, quantity
            FROM purchase_detail
            WHERE purchase_id = %s
            ORDER BY purchase_detail_id
        """, (purchase_id,))
        items = cur.fetchall()

        if not items:
            conn.rollback()
            return jsonify({"message": "Purchase has no items to receive"}), 400

        for _, product_id, quantity in items:
            cur.execute("""
                SELECT quantity_in_stock
                FROM inventory
                WHERE product_id = %s
                  AND branch_id = %s
                FOR UPDATE
            """, (product_id, branch_id))
            inventory_row = cur.fetchone()

            if inventory_row:
                cur.execute("""
                    UPDATE inventory
                    SET quantity_in_stock = quantity_in_stock + %s,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE product_id = %s
                      AND branch_id = %s
                """, (quantity, product_id, branch_id))
            else:
                cur.execute("""
                    INSERT INTO inventory (
                        product_id,
                        branch_id,
                        quantity_in_stock,
                        last_updated
                    )
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                """, (product_id, branch_id, quantity))

        cur.execute("""
            UPDATE purchase
            SET status = 'RECEIVED',
                updated_at = CURRENT_TIMESTAMP
            WHERE purchase_id = %s
              AND status = 'ORDERED'
        """, (purchase_id,))

        conn.commit()
        log_audit(
            audit_user_id,
            "MARK_PURCHASE_DELIVERED",
            "Purchase Management",
            purchase_id,
            f"Purchase Order {purchase[3]} marked as delivered and warehouse inventory updated."
        )

        return jsonify({"message": "Purchase received successfully"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print("ERROR mark_purchase_received:", e)
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# =========================================================
# INVENTORY OVERVIEW - CREATE PURCHASE RECOMMENDATION
# =========================================================
@purchase_bp.route("/admin/purchase-recommendations", methods=["POST"])
@login_required
@role_required("SYSTEM_ADMIN")
def create_purchase_recommendation():
    try:
        data = request.get_json()

        product_id = data.get("product_id")
        branch_id = data.get("branch_id")
        created_by = _current_user_id()
        quantity = data.get("quantity")

        if product_id is None:
            return jsonify({"message": "Product is required"}), 400

        if branch_id is None:
            return jsonify({"message": "Branch is required"}), 400

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
        log_audit(
            created_by,
            "CREATE_PURCHASE",
            "Purchase Management",
            purchase_id,
            f"Created Purchase Order {purchase_code}."
        )
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
@login_required
@role_required("SYSTEM_ADMIN")
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
@login_required
@role_required("SYSTEM_ADMIN")
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
@login_required
@role_required("SYSTEM_ADMIN")
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
