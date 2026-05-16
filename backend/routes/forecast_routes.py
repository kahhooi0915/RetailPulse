from flask import Blueprint, jsonify
from db import get_connection
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
from prophet import Prophet
import numpy as np
import math

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
        df["month_index"] = df["sale_month"].dt.year * 12 + df["sale_month"].dt.month

        forecasts = []

        for product_id, group in df.groupby("product_id"):
            group = group.sort_values("sale_month").reset_index(drop=True)

            product_code = group.iloc[0]["product_code"]
            product_name = group.iloc[0]["product_name"]

            total_quantity = int(group["total_quantity"].sum())
            total_revenue = float(group["total_revenue"].sum())

            monthly_sales = []
            for _, row in group.iterrows():
                monthly_sales.append({
                    "month": row["sale_month"].strftime("%Y-%m"),
                    "quantity": int(row["total_quantity"]),
                    "revenue": float(row["total_revenue"])
                })

            latest_month = group["sale_month"].max()
            next_month = latest_month + pd.DateOffset(months=1)
            next_month_index = int(next_month.year * 12 + next_month.month)

            model_results = []

            # Not enough data for proper model comparison
            if len(group) < 4:
                forecast_quantity = int(group.iloc[-1]["total_quantity"])

                forecasts.append({
                    "product_id": int(product_id),
                    "product_code": product_code,
                    "product_name": product_name,
                    "total_quantity": total_quantity,
                    "total_revenue": total_revenue,
                    "forecast_quantity": forecast_quantity,
                    "trend": "Not enough data",
                    "selected_model": "Fallback: Last Month Sales",
                    "mae": None,
                    "rmse": None,
                    "model_comparison": [],
                    "monthly_sales": monthly_sales
                })
                continue

            # =========================
            # TRAIN / TEST SPLIT
            # =========================
            split_index = int(len(group) * 0.8)

            train = group.iloc[:split_index]
            test = group.iloc[split_index:]

            if len(test) == 0:
                test = group.iloc[-1:]
                train = group.iloc[:-1]

            # =========================
            # LINEAR REGRESSION MODEL
            # =========================
            try:
                X_train = train[["month_index"]].values
                y_train = train["total_quantity"].values

                X_test = test[["month_index"]].values
                y_test = test["total_quantity"].values

                lr_model = LinearRegression()
                lr_model.fit(X_train, y_train)

                lr_test_pred = lr_model.predict(X_test)
                lr_test_pred = np.maximum(lr_test_pred, 0)

                lr_mae = mean_absolute_error(y_test, lr_test_pred)
                lr_rmse = math.sqrt(mean_squared_error(y_test, lr_test_pred))

                lr_future_pred = lr_model.predict([[next_month_index]])[0]
                lr_future_pred = max(0, round(float(lr_future_pred)))

                model_results.append({
                    "model": "Linear Regression",
                    "mae": round(float(lr_mae), 2),
                    "rmse": round(float(lr_rmse), 2),
                    "forecast_quantity": int(lr_future_pred)
                })

            except Exception as e:
                print("Linear Regression error:", e)

            # =========================
            # PROPHET MODEL
            # =========================
            try:
                prophet_train = train[["sale_month", "total_quantity"]].rename(
                    columns={
                        "sale_month": "ds",
                        "total_quantity": "y"
                    }
                )

                prophet_test = test[["sale_month", "total_quantity"]].rename(
                    columns={
                        "sale_month": "ds",
                        "total_quantity": "y"
                    }
                )

                prophet_model = Prophet(
                    yearly_seasonality=False,
                    weekly_seasonality=False,
                    daily_seasonality=False
                )

                prophet_model.fit(prophet_train)

                prophet_forecast_test = prophet_model.predict(prophet_test[["ds"]])

                prophet_test_pred = prophet_forecast_test["yhat"].values
                prophet_test_pred = np.maximum(prophet_test_pred, 0)

                y_test = prophet_test["y"].values

                prophet_mae = mean_absolute_error(y_test, prophet_test_pred)
                prophet_rmse = math.sqrt(mean_squared_error(y_test, prophet_test_pred))

                future_df = pd.DataFrame({
                    "ds": [next_month]
                })

                prophet_future = prophet_model.predict(future_df)
                prophet_future_pred = prophet_future["yhat"].iloc[0]
                prophet_future_pred = max(0, round(float(prophet_future_pred)))

                model_results.append({
                    "model": "Prophet",
                    "mae": round(float(prophet_mae), 2),
                    "rmse": round(float(prophet_rmse), 2),
                    "forecast_quantity": int(prophet_future_pred)
                })

            except Exception as e:
                print("Prophet error:", e)

            # =========================
            # SELECT BEST MODEL
            # =========================
            if model_results:
                best_model = min(model_results, key=lambda x: x["rmse"])

                forecast_quantity = best_model["forecast_quantity"]
                selected_model = best_model["model"]
                mae = best_model["mae"]
                rmse = best_model["rmse"]
            else:
                forecast_quantity = int(group.iloc[-1]["total_quantity"])
                selected_model = "Fallback: Last Month Sales"
                mae = None
                rmse = None

            # =========================
            # TREND
            # =========================
            first_qty = float(group.iloc[0]["total_quantity"])
            last_qty = float(group.iloc[-1]["total_quantity"])

            if last_qty > first_qty:
                trend = "Increasing"
            elif last_qty < first_qty:
                trend = "Declining"
            else:
                trend = "Stable"

            forecasts.append({
                "product_id": int(product_id),
                "product_code": product_code,
                "product_name": product_name,
                "total_quantity": total_quantity,
                "total_revenue": total_revenue,
                "forecast_month": next_month.strftime("%Y-%m"),
                "forecast_quantity": int(forecast_quantity),
                "trend": trend,
                "selected_model": selected_model,
                "mae": mae,
                "rmse": rmse,
                "model_comparison": model_results,
                "monthly_sales": monthly_sales
            })

        forecasts = sorted(
            forecasts,
            key=lambda item: item["forecast_quantity"],
            reverse=True
        )

        return jsonify({
            "message": "Forecast generated successfully.",
            "description": "Linear Regression and Prophet are compared using MAE and RMSE. The model with the lowest RMSE is selected.",
            "forecasts": forecasts
        }), 200

    except Exception as e:
        print("ERROR /admin/forecast/products:", e)
        return jsonify({"message": str(e)}), 500