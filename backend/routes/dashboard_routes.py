from datetime import datetime

from flask import Blueprint, g, jsonify, request
from db import get_connection
from routes.auth_routes import login_required, role_required

dashboard_bp = Blueprint("dashboard_bp", __name__)


def _to_float(value):
    return float(value or 0)


def _is_admin():
    return g.current_user["role"] == "SYSTEM_ADMIN"


def _current_branch_id():
    return g.current_user.get("branch_id")


def _dashboard_period_filter():
    period = (request.args.get("period") or "monthly").strip().lower()
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    if start_date and end_date:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
        return "custom", "AND s.sale_date::date BETWEEN %s AND %s", [start_date, end_date]

    if period == "yearly":
        return "yearly", "AND s.sale_date >= date_trunc('year', CURRENT_DATE)", []

    return "monthly", "AND s.sale_date >= date_trunc('month', CURRENT_DATE)", []


@dashboard_bp.route("/admin/dashboard/summary", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER", "BRANCH_STAFF")
def admin_dashboard_summary():
    try:
        period, sale_date_filter, sale_date_params = _dashboard_period_filter()
        conn = get_connection()
        cur = conn.cursor()

        transfer_params = []
        transfer_branch_filter = ""
        sale_branch_filter = ""
        inventory_branch_filter = ""
        if not _is_admin():
            transfer_branch_filter = "AND (from_branch_id = %s OR to_branch_id = %s)"
            sale_branch_filter = "AND s.branch_id = %s"
            inventory_branch_filter = "WHERE i.branch_id = %s"
            transfer_params.extend([_current_branch_id(), _current_branch_id()])

        cur.execute(f"""
            SELECT COUNT(*)
            FROM stock_transfer
            WHERE status IN ('PENDING', 'PENDING_SOURCE')
              {transfer_branch_filter}
        """, transfer_params)
        pending_transfers = cur.fetchone()[0]

        sale_params = [*sale_date_params]
        if not _is_admin():
            sale_params.append(_current_branch_id())

        cur.execute(f"""
            SELECT COALESCE(SUM(s.total_amount), 0)
            FROM sale s
            JOIN branch b ON s.branch_id = b.branch_id
            WHERE b.branch_type = 'BRANCH'
              {sale_date_filter}
              {sale_branch_filter}
        """, sale_params)
        total_sales = cur.fetchone()[0]

        # Cost basis logic:
        # 1. Use the latest RECEIVED purchase_detail.unit_cost per product.
        # 2. If no received purchase exists, fall back to the preferred/lowest active supplier_product purchase_price.
        # 3. If no purchase cost exists, use 0 so incomplete product setup does not break the dashboard.
        cur.execute(f"""
            SELECT COALESCE(
                SUM(
                    (
                        COALESCE(p.selling_price, sd.unit_price, 0)
                        - COALESCE(latest_purchase.unit_cost, supplier_cost.purchase_price, 0)
                    ) * sd.quantity
                ),
                0
            )
            FROM sale_detail sd
            JOIN sale s ON sd.sale_id = s.sale_id
            JOIN branch b ON s.branch_id = b.branch_id
            JOIN product p ON sd.product_id = p.product_id
            LEFT JOIN LATERAL (
                SELECT pd.unit_cost
                FROM purchase_detail pd
                JOIN purchase po ON pd.purchase_id = po.purchase_id
                WHERE pd.product_id = sd.product_id
                  AND po.status = 'RECEIVED'
                ORDER BY po.purchase_date DESC NULLS LAST,
                         po.purchase_id DESC,
                         pd.purchase_detail_id DESC
                LIMIT 1
            ) latest_purchase ON TRUE
            LEFT JOIN LATERAL (
                SELECT sp.purchase_price
                FROM supplier_product sp
                JOIN supplier sup ON sp.supplier_id = sup.supplier_id
                WHERE sp.product_id = sd.product_id
                  AND sup.status = 'ACTIVE'
                ORDER BY sp.is_preferred DESC,
                         sp.purchase_price ASC,
                         sp.supplier_id ASC
                LIMIT 1
            ) supplier_cost ON TRUE
            WHERE b.branch_type = 'BRANCH'
              {sale_date_filter}
              {sale_branch_filter}
        """, sale_params)
        gross_profit = cur.fetchone()[0]

        inventory_params = []
        if not _is_admin():
            inventory_params.append(_current_branch_id())

        cur.execute(f"""
            SELECT COALESCE(
                SUM(
                    i.quantity_in_stock
                    * COALESCE(latest_purchase.unit_cost, supplier_cost.purchase_price, 0)
                ),
                0
            )
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            LEFT JOIN LATERAL (
                SELECT pd.unit_cost
                FROM purchase_detail pd
                JOIN purchase po ON pd.purchase_id = po.purchase_id
                WHERE pd.product_id = i.product_id
                  AND po.status = 'RECEIVED'
                ORDER BY po.purchase_date DESC NULLS LAST,
                         po.purchase_id DESC,
                         pd.purchase_detail_id DESC
                LIMIT 1
            ) latest_purchase ON TRUE
            LEFT JOIN LATERAL (
                SELECT sp.purchase_price
                FROM supplier_product sp
                JOIN supplier sup ON sp.supplier_id = sup.supplier_id
                WHERE sp.product_id = i.product_id
                  AND sup.status = 'ACTIVE'
                ORDER BY sp.is_preferred DESC,
                         sp.purchase_price ASC,
                         sp.supplier_id ASC
                LIMIT 1
            ) supplier_cost ON TRUE
            {inventory_branch_filter}
        """, inventory_params)
        inventory_value = cur.fetchone()[0]

        cur.close()
        conn.close()

        return jsonify({
            "period": period,
            "total_sales": _to_float(total_sales),
            "gross_profit": _to_float(gross_profit),
            "inventory_value": _to_float(inventory_value),
            "pending_transfers": pending_transfers
        }), 200

    except Exception as e:
        print("ERROR /admin/dashboard/summary GET:", e)
        return jsonify({"message": str(e)}), 500
