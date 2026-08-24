from flask import Blueprint, g, jsonify, request

from services.forecast_service import get_forecast_summary
from routes.auth_routes import login_required, role_required

forecast_bp = Blueprint("forecast_bp", __name__)


@forecast_bp.route("/admin/forecast/products", methods=["GET"])
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER")
def forecast_products():
    try:
        debug = request.args.get("debug", "").lower() == "true"
        branch_id = None
        if g.current_user["role"] != "SYSTEM_ADMIN":
            branch_id = g.current_user["branch_id"]
        return jsonify(get_forecast_summary(debug=debug, branch_id=branch_id)), 200

    except Exception as e:
        print("ERROR /admin/forecast/products:", e)
        return jsonify({"message": str(e)}), 500
