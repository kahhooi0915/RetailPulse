import json
import os
import re
import urllib.error
import urllib.request
from decimal import Decimal

from flask import Blueprint, jsonify, request

from db import get_connection
from services.forecast_service import get_forecast_summary

ai_bp = Blueprint("ai_bp", __name__)

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_MAX_OUTPUT_TOKENS = 2048
GEMINI_ENDPOINT = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)


def _to_number(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def _close(conn=None, cur=None):
    if cur:
        cur.close()
    if conn:
        conn.close()


def _detect_intent(message):
    text = (message or "").lower()

    if re.search(r"\b(top|best|highest|leader|number\s*1|no\.?\s*1)\b", text) and (
        "seller" in text or "selling" in text or "forecast" in text or "next" in text
    ):
        return "top_seller_forecast"
    if any(term in text for term in ["poor", "slow", "not selling", "weak", "lowest"]):
        return "poor_selling_product"
    if any(term in text for term in ["low stock", "out of stock", "stock risk", "below reorder"]):
        return "low_stock_product"
    if any(term in text for term in ["reorder", "restock", "purchase suggestion", "buy more"]):
        return "reorder_suggestion"
    if "branch" in text and any(term in text for term in ["attention", "risk", "performance", "requires", "needs"]):
        return "branch_attention"
    if "inventory" in text or "stock summary" in text:
        return "inventory_summary"
    if "sales" in text or "revenue" in text or "summary" in text:
        return "sales_summary"

    return "unknown"


def _fetch_inventory_rows(intent):
    conn = get_connection()
    cur = conn.cursor()

    where_clause = ""
    if intent in ("low_stock_product", "reorder_suggestion"):
        where_clause = "WHERE i.quantity_in_stock <= COALESCE(p.reorder_level, 0)"

    cur.execute(f"""
        SELECT
            p.product_code,
            p.product_name,
            b.branch_name,
            i.quantity_in_stock,
            COALESCE(p.reorder_level, 0) AS reorder_level,
            GREATEST(COALESCE(p.reorder_level, 0) * 2 - i.quantity_in_stock, 0) AS suggested_reorder_quantity
        FROM inventory i
        JOIN product p ON i.product_id = p.product_id
        JOIN branch b ON i.branch_id = b.branch_id
        {where_clause}
        ORDER BY i.quantity_in_stock ASC, p.product_name
        LIMIT 15
    """)

    rows = cur.fetchall()

    cur.execute("""
        SELECT
            COUNT(*) AS inventory_rows,
            COALESCE(SUM(i.quantity_in_stock), 0) AS total_stock_units,
            COUNT(*) FILTER (WHERE i.quantity_in_stock <= COALESCE(p.reorder_level, 0)) AS low_stock_rows,
            COUNT(*) FILTER (WHERE i.quantity_in_stock = 0) AS out_of_stock_rows
        FROM inventory i
        JOIN product p ON i.product_id = p.product_id
    """)
    summary_row = cur.fetchone()

    _close(conn, cur)

    return {
        "intent": intent,
        "summary": {
            "inventory_rows": summary_row[0],
            "total_stock_units": summary_row[1],
            "low_stock_rows": summary_row[2],
            "out_of_stock_rows": summary_row[3],
        },
        "rows": [
            {
                "product_code": row[0],
                "product_name": row[1],
                "branch_name": row[2],
                "quantity_in_stock": row[3],
                "reorder_level": row[4],
                "suggested_reorder_quantity": row[5],
            }
            for row in rows
        ],
    }


def _fetch_sales_summary():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            COUNT(DISTINCT s.sale_id),
            COALESCE(SUM(sd.quantity), 0),
            COALESCE(SUM(sd.subtotal), 0),
            MIN(s.sale_date),
            MAX(s.sale_date)
        FROM sale s
        LEFT JOIN sale_detail sd ON s.sale_id = sd.sale_id
    """)
    summary = cur.fetchone()

    cur.execute("""
        SELECT
            p.product_name,
            COALESCE(SUM(sd.quantity), 0) AS units_sold,
            COALESCE(SUM(sd.subtotal), 0) AS revenue
        FROM sale_detail sd
        JOIN product p ON sd.product_id = p.product_id
        GROUP BY p.product_id, p.product_name
        ORDER BY revenue DESC, units_sold DESC
        LIMIT 5
    """)
    top_products = cur.fetchall()

    cur.execute("""
        SELECT
            b.branch_name,
            COUNT(DISTINCT s.sale_id) AS sales_count,
            COALESCE(SUM(sd.subtotal), 0) AS revenue
        FROM sale s
        JOIN branch b ON s.branch_id = b.branch_id
        LEFT JOIN sale_detail sd ON s.sale_id = sd.sale_id
        GROUP BY b.branch_id, b.branch_name
        ORDER BY revenue DESC
        LIMIT 5
    """)
    branch_rows = cur.fetchall()

    _close(conn, cur)

    return {
        "intent": "sales_summary",
        "summary": {
            "sales_count": summary[0],
            "units_sold": summary[1],
            "total_revenue": float(_to_number(summary[2]) or 0),
            "first_sale_date": summary[3].isoformat() if summary[3] else None,
            "latest_sale_date": summary[4].isoformat() if summary[4] else None,
        },
        "top_products": [
            {
                "product_name": row[0],
                "units_sold": row[1],
                "revenue": float(_to_number(row[2]) or 0),
            }
            for row in top_products
        ],
        "top_branches": [
            {
                "branch_name": row[0],
                "sales_count": row[1],
                "revenue": float(_to_number(row[2]) or 0),
            }
            for row in branch_rows
        ],
    }


def _fetch_poor_selling_products():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            p.product_code,
            p.product_name,
            COALESCE(SUM(sd.quantity), 0) AS units_sold,
            COALESCE(SUM(sd.subtotal), 0) AS revenue
        FROM product p
        LEFT JOIN sale_detail sd ON p.product_id = sd.product_id
        LEFT JOIN sale s ON sd.sale_id = s.sale_id
        WHERE p.status = 'ACTIVE'
        GROUP BY p.product_id, p.product_code, p.product_name
        ORDER BY units_sold ASC, revenue ASC, p.product_name
        LIMIT 10
    """)

    rows = cur.fetchall()
    _close(conn, cur)

    return {
        "intent": "poor_selling_product",
        "summary": "Lowest-selling active products based on recorded sale_detail quantity and subtotal.",
        "rows": [
            {
                "product_code": row[0],
                "product_name": row[1],
                "units_sold": row[2],
                "revenue": float(_to_number(row[3]) or 0),
            }
            for row in rows
        ],
    }


def _fetch_branch_attention_summary():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        WITH inventory_summary AS (
            SELECT
                i.branch_id,
                COALESCE(SUM(i.quantity_in_stock), 0) AS total_stock_units,
                COUNT(i.product_id) FILTER (
                    WHERE i.quantity_in_stock <= COALESCE(p.reorder_level, 0)
                ) AS low_stock_items,
                COUNT(i.product_id) FILTER (
                    WHERE i.quantity_in_stock = 0
                ) AS out_of_stock_items
            FROM inventory i
            JOIN product p ON i.product_id = p.product_id
            GROUP BY i.branch_id
        ),
        sales_summary AS (
            SELECT
                s.branch_id,
                COUNT(DISTINCT s.sale_id) AS sales_count,
                COALESCE(SUM(sd.subtotal), 0) AS sales_revenue
            FROM sale s
            LEFT JOIN sale_detail sd ON s.sale_id = sd.sale_id
            GROUP BY s.branch_id
        )
        SELECT
            b.branch_name,
            b.branch_code,
            b.branch_type,
            COALESCE(i.total_stock_units, 0) AS total_stock_units,
            COALESCE(i.low_stock_items, 0) AS low_stock_items,
            COALESCE(i.out_of_stock_items, 0) AS out_of_stock_items,
            COALESCE(s.sales_count, 0) AS sales_count,
            COALESCE(s.sales_revenue, 0) AS sales_revenue
        FROM branch b
        LEFT JOIN inventory_summary i ON b.branch_id = i.branch_id
        LEFT JOIN sales_summary s ON b.branch_id = s.branch_id
        WHERE b.status = 'ACTIVE'
        ORDER BY low_stock_items DESC, out_of_stock_items DESC, sales_revenue ASC
        LIMIT 8
    """)

    rows = cur.fetchall()
    _close(conn, cur)

    return {
        "intent": "branch_attention",
        "summary": "Branches ranked by low-stock and out-of-stock pressure, then lower sales revenue.",
        "rows": [
            {
                "branch_name": row[0],
                "branch_code": row[1],
                "branch_type": row[2],
                "total_stock_units": row[3],
                "low_stock_items": row[4],
                "out_of_stock_items": row[5],
                "sales_count": row[6],
                "sales_revenue": float(_to_number(row[7]) or 0),
            }
            for row in rows
        ],
    }


def _build_data_context(intent):
    if intent == "top_seller_forecast":
        forecast_summary = get_forecast_summary()
        official_summary = {
            "intent": "top_seller_forecast",
            "ranking_basis": "total_forecast_units",
            "forecast_period": forecast_summary.get("forecast_period"),
            "predicted_top_seller": forecast_summary.get("predicted_top_seller"),
            "product_code": forecast_summary.get("product_code"),
            "total_forecast_units": forecast_summary.get("total_forecast_units"),
            "best_model": forecast_summary.get("best_model"),
            "predicted_revenue": forecast_summary.get("predicted_revenue"),
            "description": forecast_summary.get("description"),
            "top_ranked_products": (forecast_summary.get("forecasts") or [])[:5],
        }
        print("Official forecast summary sent to AI:", official_summary)
        return official_summary
    if intent == "poor_selling_product":
        return _fetch_poor_selling_products()
    if intent in ("low_stock_product", "reorder_suggestion", "inventory_summary"):
        return _fetch_inventory_rows(intent)
    if intent == "sales_summary":
        return _fetch_sales_summary()
    if intent == "branch_attention":
        return _fetch_branch_attention_summary()
    return None


def _ask_gemini(message, intent, context):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    system_prompt = (
        "You are RetailPulse AI Business Assistant. For general knowledge or casual questions, "
        "answer naturally. For RetailPulse business questions, use only the supplied backend system data. "
        "Do not guess missing business facts. If business data is insufficient, say so. "
        "For business questions, your role is to explain and recommend only. Never insert, update, "
        "delete, approve, reject, or modify database data, and never claim that you performed an action. "
        "When discussing forecasts generated by Prophet, refer to Prophet as a forecasting approach, "
        "technique, or method, and avoid model terminology for Prophet. "
        "Keep the response concise, practical, and grounded in the available facts."
    )

    user_prompt = {
        "user_question": message,
        "detected_intent": intent,
        "backend_data_summary": context,
        "instruction": (
            "If backend_data_summary is null, answer the general question normally. "
            "If backend_data_summary is provided, explain the result and give practical recommendations "
            "using only that backend data. Format your answer in markdown. For top seller forecast answers, "
            "you must use only this official forecast result. Do not replace the top seller with another product. "
            "Rank forecast answers by total_forecast_units. Bold the product name, predicted quantity, "
            "and estimated revenue. Display every revenue, sales, purchase, cost, and estimated revenue amount "
            "in Malaysian Ringgit using the format RM 1,860.00. Never use $ or USD for RetailPulse monetary values."
        ),
    }

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": system_prompt},
                    {"text": json.dumps(user_prompt, default=str)},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": GEMINI_MAX_OUTPUT_TOKENS,
        },
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{GEMINI_ENDPOINT}?key={api_key}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=20) as response:
        response_text = response.read().decode("utf-8")

    print("Gemini response:", response_text)
    result = json.loads(response_text)

    candidates = result.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response")

    return text


@ai_bp.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or data.get("message") or "").strip()

    print("AI question received:", question)

    if not question:
        return jsonify({"answer": "Question is required"}), 400

    intent = _detect_intent(question)

    try:
        try:
            context = _build_data_context(intent)
        except Exception as e:
            print("ERROR /api/ai/chat data context:", e)
            context = {
                "intent": intent,
                "summary": "Backend business data could not be retrieved for this question.",
                "data_available": False,
            }
        answer = _ask_gemini(question, intent, context)
    except (RuntimeError, urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
        print("ERROR Gemini API:", e)
        return jsonify({
            "answer": "AI service is currently unavailable. Please try again later."
        }), 503
    except Exception as e:
        print("ERROR /api/ai/chat:", e)
        return jsonify({
            "answer": "AI service is currently unavailable. Please try again later."
        }), 503

    return jsonify({"answer": answer}), 200
