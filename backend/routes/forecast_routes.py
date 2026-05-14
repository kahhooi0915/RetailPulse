from flask import Blueprint, jsonify
from db import get_connection
import pandas as pd
from sklearn.linear_model import LinearRegression
import numpy as np

forecast_bp = Blueprint("forecast_bp", __name__)


@forecast_bp.route("/admin/forecast/products", methods=["GET"])
def forecast_products():
    try:
        conn = get_connection()

        query = """
            SELECT
                p.product_id,
                p.product_code,
                p.product_name,
                DATE_TRUNC('month', s.sale_date) AS sale_month,
                SUM(sd.quantity) AS total_quantity,
                SUM(sd.subtotal) AS total_revenue
            FROM sale_detail sd
            JOIN sale s ON sd.sale_id = s.sale_id
            JOIN product p ON sd.product_id = p.product_id
            GROUP BY
                p.product_id,
                p.product_code,
                p.product_name,
                DATE_TRUNC('month', s.sale_date)
            ORDER BY p.product_id, sale_month;
        """

        df = pd.read_sql_query(query, conn)
        conn.close()

        if df.empty:
            return jsonify({
                "message": "No sales data available for forecasting.",
                "forecasts": []
            }), 200

        df["sale_month"] = pd.to_datetime(df["sale_month"])
        df["month_index"] = (
            df["sale_month"].dt.year * 12 + df["sale_month"].dt.month
        )

        forecasts = []

        for product_id, group in df.groupby("product_id"):
            group = group.sort_values("sale_month")

            product_code = group.iloc[0]["product_code"]
            product_name = group.iloc[0]["product_name"]

            total_quantity = int(group["total_quantity"].sum())
            total_revenue = float(group["total_revenue"].sum())

            latest_month_index = int(group["month_index"].max())
            next_month_index = latest_month_index + 1

            if len(group) >= 2:
                X = group[["month_index"]].values
                y = group["total_quantity"].values

                model = LinearRegression()
                model.fit(X, y)

                predicted_quantity = model.predict([[next_month_index]])[0]
                forecast_quantity = max(0, round(float(predicted_quantity)))

                first_qty = float(group.iloc[0]["total_quantity"])
                last_qty = float(group.iloc[-1]["total_quantity"])

                if last_qty > first_qty:
                    trend = "Increasing"
                elif last_qty < first_qty:
                    trend = "Declining"
                else:
                    trend = "Stable"

                method = "Linear Regression"
            else:
                forecast_quantity = int(group.iloc[-1]["total_quantity"])
                trend = "Not enough data"
                method = "Fallback: Last Month Sales"

            monthly_sales = []
            for _, row in group.iterrows():
                monthly_sales.append({
                    "month": row["sale_month"].strftime("%Y-%m"),
                    "quantity": int(row["total_quantity"]),
                    "revenue": float(row["total_revenue"])
                })

            forecasts.append({
                "product_id": int(product_id),
                "product_code": product_code,
                "product_name": product_name,
                "total_quantity": total_quantity,
                "total_revenue": total_revenue,
                "forecast_quantity": forecast_quantity,
                "trend": trend,
                "method": method,
                "monthly_sales": monthly_sales
            })

        forecasts = sorted(
            forecasts,
            key=lambda item: item["forecast_quantity"],
            reverse=True
        )

        return jsonify({
            "message": "Forecast generated successfully.",
            "model": "Pandas + scikit-learn Linear Regression",
            "forecasts": forecasts
        }), 200

    except Exception as e:
        print("ERROR /admin/forecast/products:", e)
        return jsonify({"message": str(e)}), 500