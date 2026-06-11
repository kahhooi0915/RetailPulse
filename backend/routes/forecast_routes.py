from flask import Blueprint, jsonify, request

from services.forecast_service import get_forecast_summary

forecast_bp = Blueprint("forecast_bp", __name__)


@forecast_bp.route("/admin/forecast/products", methods=["GET"])
def forecast_products():
    try:
        debug = request.args.get("debug", "").lower() == "true"
        return jsonify(get_forecast_summary(debug=debug)), 200

    except Exception as e:
        print("ERROR /admin/forecast/products:", e)
        return jsonify({"message": str(e)}), 500
