import json
import os
import re
import traceback
import urllib.error
import urllib.request
from decimal import Decimal

from flask import Blueprint, g, jsonify, request

from db import get_connection
from routes.auth_routes import login_required, role_required
from services.forecast_service import get_forecast_summary

ai_bp = Blueprint("ai_bp", __name__)

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash-lite"]
GEMINI_MAX_OUTPUT_TOKENS = 2048
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

SUGGESTED_QUESTIONS = [
    "Which products should be reordered immediately?",
    "Which product is expected to become the top seller next month?",
    "Which branch currently requires the most attention?",
    "Summarize current inventory status.",
    "Summarize sales performance.",
]


def _to_number(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def _close(conn=None, cur=None):
    if cur:
        cur.close()
    if conn:
        conn.close()


def _current_scope():
    role = g.current_user["role"]
    return {
        "role": role,
        "branch_id": None if role == "SYSTEM_ADMIN" else g.current_user.get("branch_id"),
        "user_id": g.current_user["user_id"],
    }


def _is_scoped(scope):
    return bool(scope and scope.get("branch_id") is not None)


def _debug_ai_logs_enabled():
    return os.getenv("AI_DEBUG_LOGS", "").strip().lower() in {"1", "true", "yes", "on"}


def _read_error_body(error):
    try:
        return error.read().decode("utf-8", errors="replace")
    except Exception as read_error:
        return f"<could not read error body: {read_error}>"


def _get_gemini_endpoint(model):
    return f"{GEMINI_API_BASE_URL}/{model}:generateContent"


def _log_gemini_configuration(api_key, model):
    print(
        "Gemini configuration: "
        f"model={model}, "
        f"endpoint={_get_gemini_endpoint(model)}, "
        f"api_key_loaded={bool(api_key)}"
    )


def _log_gemini_http_error(error):
    body = _read_error_body(error)
    print("ERROR Gemini API HTTP status:", getattr(error, "code", "<unknown>"))
    print("ERROR Gemini API HTTP reason:", getattr(error, "reason", "<unknown>"))
    if _debug_ai_logs_enabled():
        print("ERROR Gemini API HTTP headers:", dict(getattr(error, "headers", {}) or {}))
        print("ERROR Gemini API HTTP body:", body)
    return body


def _detect_intent(message):
    text = (message or "").lower()

    top_seller_requested = re.search(
        r"\b(top|best|highest|leader|number\s*1|no\.?\s*1)\b",
        text,
    ) and ("seller" in text or "selling" in text or "product" in text)
    conditional_terms = [
        "morning",
        "afternoon",
        "evening",
        "night",
        "branch",
        "ayer keroh",
        "melaka sentral",
        "bukit katil",
        "warehouse",
    ]
    if top_seller_requested and any(term in text for term in conditional_terms):
        return "conditional_top_seller"

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


def _normalize_search_text(value):
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _extract_time_filter(message):
    text = _normalize_search_text(message)
    time_filters = {
        "morning": {
            "label": "morning",
            "start_hour": 6,
            "end_hour": 11,
            "description": "06:00-11:59",
        },
        "afternoon": {
            "label": "afternoon",
            "start_hour": 12,
            "end_hour": 16,
            "description": "12:00-16:59",
        },
        "evening": {
            "label": "evening",
            "start_hour": 17,
            "end_hour": 20,
            "description": "17:00-20:59",
        },
        "night": {
            "label": "night",
            "start_hour": 21,
            "end_hour": 23,
            "description": "21:00-23:59",
        },
    }

    for keyword, time_filter in time_filters.items():
        if keyword in text:
            return time_filter
    return None


def _branch_matches_question(branch_name, question_text):
    branch_text = _normalize_search_text(branch_name)
    branch_without_suffix = re.sub(r"\bbranch\b", "", branch_text).strip()
    question_text = _normalize_search_text(question_text)

    return branch_text in question_text or (
        branch_without_suffix and branch_without_suffix in question_text
    )


def _fetch_branch_by_id(branch_id):
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT branch_id, branch_name, branch_code
            FROM branch
            WHERE branch_id = %s
        """, (branch_id,))
        row = cur.fetchone()
    finally:
        _close(conn, cur)

    if not row:
        return None

    return {
        "branch_id": row[0],
        "branch_name": row[1],
        "branch_code": row[2],
    }


def _fetch_matching_branch(question, scope=None):
    if _is_scoped(scope):
        return _fetch_branch_by_id(scope["branch_id"])

    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT branch_id, branch_name, branch_code
            FROM branch
            ORDER BY branch_name
        """)
        branches = cur.fetchall()
    finally:
        _close(conn, cur)

    for branch_id, branch_name, branch_code in branches:
        if _branch_matches_question(branch_name, question) or _branch_matches_question(branch_code, question):
            return {
                "branch_id": branch_id,
                "branch_name": branch_name,
                "branch_code": branch_code,
            }
    return None


def _fetch_conditional_top_seller(question, scope=None):
    branch = _fetch_matching_branch(question, scope)
    time_filter = _extract_time_filter(question)

    missing_filters = []
    if not branch:
        missing_filters.append("branch")
    if not time_filter:
        missing_filters.append("time period")

    if missing_filters:
        return {
            "intent": "conditional_top_seller",
            "data_available": False,
            "summary": "A branch and time period are required for conditional top-seller questions.",
            "missing_filters": missing_filters,
            "supported_time_periods": ["morning", "afternoon", "evening", "night"],
        }

    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT
                p.product_code,
                p.product_name,
                SUM(sd.quantity) AS units_sold,
                COALESCE(SUM(sd.subtotal), 0) AS revenue,
                COUNT(DISTINCT s.sale_id) AS sales_count
            FROM sale s
            JOIN sale_detail sd ON s.sale_id = sd.sale_id
            JOIN product p ON sd.product_id = p.product_id
            WHERE s.branch_id = %s
              AND EXTRACT(HOUR FROM s.sale_date) BETWEEN %s AND %s
            GROUP BY p.product_id, p.product_code, p.product_name
            ORDER BY units_sold DESC, revenue DESC, p.product_name
            LIMIT 5
            """,
            (
                branch["branch_id"],
                time_filter["start_hour"],
                time_filter["end_hour"],
            ),
        )
        rows = cur.fetchall()
    finally:
        _close(conn, cur)

    ranked_products = [
        {
            "product_code": row[0],
            "product_name": row[1],
            "units_sold": row[2],
            "revenue": float(_to_number(row[3]) or 0),
            "sales_count": row[4],
        }
        for row in rows
    ]

    return {
        "intent": "conditional_top_seller",
        "ranking_basis": "units_sold",
        "branch_name": branch["branch_name"],
        "branch_code": branch["branch_code"],
        "time_period": time_filter["label"],
        "time_range": time_filter["description"],
        "top_product": ranked_products[0] if ranked_products else None,
        "ranked_products": ranked_products,
    }


def _fetch_inventory_rows(intent, scope=None):
    conn = get_connection()
    cur = conn.cursor()

    conditions = []
    params = []
    summary_conditions = []
    summary_params = []

    if _is_scoped(scope):
        conditions.append("i.branch_id = %s")
        params.append(scope["branch_id"])
        summary_conditions.append("i.branch_id = %s")
        summary_params.append(scope["branch_id"])

    if intent in ("low_stock_product", "reorder_suggestion"):
        conditions.append("i.quantity_in_stock <= COALESCE(p.reorder_level, 0)")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    summary_where_clause = (
        f"WHERE {' AND '.join(summary_conditions)}"
        if summary_conditions
        else ""
    )

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
    """, params)

    rows = cur.fetchall()

    cur.execute("""
        SELECT
            COUNT(*) AS inventory_rows,
            COALESCE(SUM(i.quantity_in_stock), 0) AS total_stock_units,
            COUNT(*) FILTER (WHERE i.quantity_in_stock <= COALESCE(p.reorder_level, 0)) AS low_stock_rows,
            COUNT(*) FILTER (WHERE i.quantity_in_stock = 0) AS out_of_stock_rows
        FROM inventory i
        JOIN product p ON i.product_id = p.product_id
        {summary_where_clause}
    """, summary_params)
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


def _fetch_sales_summary(scope=None):
    conn = get_connection()
    cur = conn.cursor()

    sale_filter = ""
    sale_params = []
    if _is_scoped(scope):
        sale_filter = "WHERE s.branch_id = %s"
        sale_params.append(scope["branch_id"])

    cur.execute(f"""
        SELECT
            COUNT(DISTINCT s.sale_id),
            COALESCE(SUM(sd.quantity), 0),
            COALESCE(SUM(sd.subtotal), 0),
            MIN(s.sale_date),
            MAX(s.sale_date)
        FROM sale s
        LEFT JOIN sale_detail sd ON s.sale_id = sd.sale_id
        {sale_filter}
    """, sale_params)
    summary = cur.fetchone()

    cur.execute(f"""
        SELECT
            p.product_name,
            COALESCE(SUM(sd.quantity), 0) AS units_sold,
            COALESCE(SUM(sd.subtotal), 0) AS revenue
        FROM sale_detail sd
        JOIN sale s ON sd.sale_id = s.sale_id
        JOIN product p ON sd.product_id = p.product_id
        {sale_filter}
        GROUP BY p.product_id, p.product_name
        ORDER BY revenue DESC, units_sold DESC
        LIMIT 5
    """, sale_params)
    top_products = cur.fetchall()

    cur.execute(f"""
        SELECT
            b.branch_name,
            COUNT(DISTINCT s.sale_id) AS sales_count,
            COALESCE(SUM(sd.subtotal), 0) AS revenue
        FROM sale s
        JOIN branch b ON s.branch_id = b.branch_id
        LEFT JOIN sale_detail sd ON s.sale_id = sd.sale_id
        {sale_filter}
        GROUP BY b.branch_id, b.branch_name
        ORDER BY revenue DESC
        LIMIT 5
    """, sale_params)
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


def _fetch_poor_selling_products(scope=None):
    conn = get_connection()
    cur = conn.cursor()

    params = []
    branch_quantity = "COALESCE(SUM(sd.quantity), 0)"
    branch_revenue = "COALESCE(SUM(sd.subtotal), 0)"
    if _is_scoped(scope):
        branch_quantity = "COALESCE(SUM(sd.quantity) FILTER (WHERE s.branch_id = %s), 0)"
        branch_revenue = "COALESCE(SUM(sd.subtotal) FILTER (WHERE s.branch_id = %s), 0)"
        params.extend([scope["branch_id"], scope["branch_id"]])

    cur.execute(f"""
        SELECT
            p.product_code,
            p.product_name,
            {branch_quantity} AS units_sold,
            {branch_revenue} AS revenue
        FROM product p
        LEFT JOIN sale_detail sd ON p.product_id = sd.product_id
        LEFT JOIN sale s ON sd.sale_id = s.sale_id
        WHERE p.status = 'ACTIVE'
        GROUP BY p.product_id, p.product_code, p.product_name
        ORDER BY units_sold ASC, revenue ASC, p.product_name
        LIMIT 10
    """, params)

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


def _fetch_branch_attention_summary(scope=None):
    conn = get_connection()
    cur = conn.cursor()

    branch_filter = ""
    params = []
    if _is_scoped(scope):
        branch_filter = "WHERE b.branch_id = %s"
        params.append(scope["branch_id"])

    cur.execute(f"""
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
        {branch_filter}
        ORDER BY low_stock_items DESC, out_of_stock_items DESC, sales_revenue ASC
        LIMIT 8
    """, params)

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


def _build_data_context(intent, message=None, scope=None):
    if intent == "conditional_top_seller":
        return _fetch_conditional_top_seller(message or "", scope)
    if intent == "top_seller_forecast":
        forecast_summary = get_forecast_summary(branch_id=scope.get("branch_id") if _is_scoped(scope) else None)
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
        if _debug_ai_logs_enabled():
            print("Official forecast summary sent to AI:", official_summary)
        return official_summary
    if intent == "poor_selling_product":
        return _fetch_poor_selling_products(scope)
    if intent in ("low_stock_product", "reorder_suggestion", "inventory_summary"):
        return _fetch_inventory_rows(intent, scope)
    if intent == "sales_summary":
        return _fetch_sales_summary(scope)
    if intent == "branch_attention":
        return _fetch_branch_attention_summary(scope)
    return None


def _ask_gemini(message, intent, context, scope=None):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    system_prompt = (
        "You are RetailPulse AI Business Assistant. For general knowledge or casual questions, "
        "answer naturally. For RetailPulse business questions, use only the supplied backend system data. "
        "Do not guess missing business facts. If business data is insufficient, say so. "
        "For business questions, your role is to explain and recommend only. Never insert, update, "
        "delete, approve, reject, or modify database data, and never claim that you performed an action. "
        "Respect the authenticated user's authorization scope. If a user asks about another branch but "
        "the supplied backend data only covers their authorized branch, answer only from the supplied data "
        "and do not infer or reveal other branch information. "
        "When discussing forecasts generated by Prophet, refer to Prophet as a forecasting approach, "
        "technique, or method, and avoid model terminology for Prophet. "
        "Keep the response concise, practical, and grounded in the available facts."
    )

    user_prompt = {
        "user_question": message,
        "detected_intent": intent,
        "backend_data_summary": context,
        "authorized_data_scope": {
            "role": scope.get("role") if scope else None,
            "branch_id": scope.get("branch_id") if scope else None,
            "scope_description": (
                "system-wide"
                if not _is_scoped(scope)
                else "authenticated user's branch only"
            ),
        },
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
        "system_instruction": {
            "parts": [{"text": system_prompt}],
        },
        "contents": [
            {
                "parts": [{"text": json.dumps(user_prompt, default=str)}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": GEMINI_MAX_OUTPUT_TOKENS,
        },
    }

    response_text = None
    last_error = None
    models_to_try = [GEMINI_MODEL, *GEMINI_FALLBACK_MODELS]

    for model in models_to_try:
        _log_gemini_configuration(api_key, model)
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            _get_gemini_endpoint(model),
            data=data,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            method="POST",
        )

        if _debug_ai_logs_enabled():
            print(
                "Gemini request payload:",
                json.dumps(
                    {
                        "model": model,
                        "intent": intent,
                        "payload": payload,
                    },
                    default=str,
                ),
            )

        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                response_text = response.read().decode("utf-8")
                print("Gemini HTTP status:", getattr(response, "status", "<unknown>"))
                print("Gemini response model attempted:", model)
                if _debug_ai_logs_enabled():
                    print("Gemini response body:", response_text)
                break
        except urllib.error.HTTPError as error:
            last_error = error
            _log_gemini_http_error(error)
            continue
        except urllib.error.URLError as error:
            last_error = error
            print("ERROR Gemini API URL/network error:", repr(error))
            continue
        except TimeoutError as error:
            last_error = error
            print("ERROR Gemini API timeout:", repr(error))
            continue

    if response_text is None:
        if last_error:
            raise last_error
        raise RuntimeError("Gemini did not return a response")

    result = json.loads(response_text)

    candidates = result.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response")

    return text


def _format_rm(value):
    return f"RM {float(_to_number(value) or 0):,.2f}"


def _format_fallback_answer(intent, context):
    if not context:
        return None

    if intent == "conditional_top_seller":
        if context.get("data_available") is False:
            missing = ", ".join(context.get("missing_filters") or [])
            return (
                "I need a specific branch and time period to answer that conditional top-seller question. "
                f"Missing: {missing or 'branch or time period'}. Supported time periods are morning, "
                "afternoon, evening, and night."
            )

        top = context.get("top_product")
        if not top:
            return (
                f"I could not find sales records for {context.get('branch_name', 'that branch')} "
                f"during the {context.get('time_period', 'selected time period')}."
            )

        lines = [
            (
                f"**{top['product_name']}** is the top-selling product at "
                f"**{context['branch_name']}** during the **{context['time_period']}** "
                f"({context['time_range']}), with **{top['units_sold']}** units sold "
                f"and revenue of **{_format_rm(top['revenue'])}**."
            ),
            "",
            "| Product | Units sold | Sales | Revenue |",
            "|---|---:|---:|---:|",
        ]
        for row in (context.get("ranked_products") or [])[:5]:
            lines.append(
                f"| {row['product_name']} | {row['units_sold']} | "
                f"{row['sales_count']} | {_format_rm(row['revenue'])} |"
            )
        return "\n".join(lines)

    if context.get("data_available") is False:
        return None

    if intent == "branch_attention":
        rows = context.get("rows") or []
        if not rows:
            return "I could not find branch inventory or sales records to rank branch attention right now."

        top = rows[0]
        lines = [
            f"**{top['branch_name']}** currently requires the most attention.",
            "",
            "It ranks highest based on low-stock pressure, out-of-stock items, and lower sales revenue.",
            "",
            "| Branch | Low-stock items | Out of stock | Stock units | Sales | Revenue |",
            "|---|---:|---:|---:|---:|---:|",
        ]
        for row in rows[:5]:
            lines.append(
                f"| {row['branch_name']} | {row['low_stock_items']} | {row['out_of_stock_items']} | "
                f"{row['total_stock_units']} | {row['sales_count']} | {_format_rm(row['sales_revenue'])} |"
            )
        lines.extend([
            "",
            "Recommended next step: prioritize replenishment for branches with the most low-stock and out-of-stock items.",
        ])
        return "\n".join(lines)

    if intent in ("low_stock_product", "reorder_suggestion", "inventory_summary"):
        summary = context.get("summary") or {}
        rows = context.get("rows") or []
        lines = [
            "**Current inventory status**",
            "",
            f"- Total stock units: **{summary.get('total_stock_units', 0)}**",
            f"- Low-stock rows: **{summary.get('low_stock_rows', 0)}**",
            f"- Out-of-stock rows: **{summary.get('out_of_stock_rows', 0)}**",
        ]
        if rows:
            lines.extend([
                "",
                "| Product | Branch | Stock | Reorder level | Suggested reorder |",
                "|---|---|---:|---:|---:|",
            ])
            for row in rows[:8]:
                lines.append(
                    "| {product_name} | {branch_name} | {quantity_in_stock} | "
                    "{reorder_level} | {suggested_reorder_quantity} |".format(**row)
                )
        return "\n".join(lines)

    if intent == "sales_summary":
        summary = context.get("summary") or {}
        top_products = context.get("top_products") or []
        top_branches = context.get("top_branches") or []
        lines = [
            "**Sales performance summary**",
            "",
            f"- Sales count: **{summary.get('sales_count', 0)}**",
            f"- Units sold: **{summary.get('units_sold', 0)}**",
            f"- Total revenue: **{_format_rm(summary.get('total_revenue', 0))}**",
        ]
        if top_products:
            lines.extend(["", "**Top products**"])
            for row in top_products:
                lines.append(
                    f"- {row['product_name']}: {row['units_sold']} units, {_format_rm(row['revenue'])}"
                )
        if top_branches:
            lines.extend(["", "**Top branches**"])
            for row in top_branches:
                lines.append(
                    f"- {row['branch_name']}: {row['sales_count']} sales, {_format_rm(row['revenue'])}"
                )
        return "\n".join(lines)

    if intent == "poor_selling_product":
        rows = context.get("rows") or []
        if not rows:
            return "I could not find active products with sales data to rank poor-selling products right now."
        lines = [
            "**Lowest-selling active products**",
            "",
            "| Product | Units sold | Revenue |",
            "|---|---:|---:|",
        ]
        for row in rows[:8]:
            lines.append(f"| {row['product_name']} | {row['units_sold']} | {_format_rm(row['revenue'])} |")
        return "\n".join(lines)

    if intent == "top_seller_forecast":
        top = context.get("predicted_top_seller")
        if not top:
            return None
        return (
            f"**{top}** is expected to become the top seller for "
            f"{context.get('forecast_period') or 'the forecast period'}, with "
            f"**{context.get('total_forecast_units', 0)}** forecast units and estimated revenue of "
            f"**{_format_rm(context.get('predicted_revenue', 0))}**."
        )

    return None


@ai_bp.route("/api/ai/chat", methods=["POST"])
@login_required
@role_required("SYSTEM_ADMIN", "INVENTORY_MANAGER", "BRANCH_STAFF")
def ai_chat():
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or data.get("message") or "").strip()

    if not question:
        return jsonify({"answer": "Question is required"}), 400

    intent = _detect_intent(question)
    scope = _current_scope()
    print(
        "AI question received: "
        f"intent={intent}, length={len(question)}, role={scope['role']}, branch_id={scope['branch_id']}"
    )

    try:
        try:
            context = _build_data_context(intent, question, scope)
        except Exception as e:
            print("ERROR /api/ai/chat data context type:", type(e).__name__)
            print("ERROR /api/ai/chat data context message:", str(e))
            print("ERROR /api/ai/chat data context traceback:", traceback.format_exc())
            context = {
                "intent": intent,
                "summary": "Backend business data could not be retrieved for this question.",
                "data_available": False,
            }
        try:
            answer = _ask_gemini(question, intent, context, scope)
        except (RuntimeError, urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            print("ERROR Gemini API caught type:", type(e).__name__)
            print("ERROR Gemini API caught message:", str(e))
            print("ERROR Gemini API caught traceback:", traceback.format_exc())
            fallback_answer = _format_fallback_answer(intent, context)
            if fallback_answer:
                answer = (
                    fallback_answer
                    + "\n\n> Gemini response generation is unavailable right now, so this answer was generated from RetailPulse backend data."
                )
            else:
                return jsonify({
                    "answer": "AI service is currently unavailable. Check the Flask server logs for the Gemini error details.",
                    "suggested_questions": SUGGESTED_QUESTIONS,
                }), 503
    except (RuntimeError, urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
        print("ERROR Gemini API outer catch type:", type(e).__name__)
        print("ERROR Gemini API outer catch message:", str(e))
        print("ERROR Gemini API outer catch traceback:", traceback.format_exc())
        return jsonify({
            "answer": "AI service is currently unavailable. Check the Flask server logs for the Gemini error details.",
            "suggested_questions": SUGGESTED_QUESTIONS,
        }), 503
    except Exception as e:
        print("ERROR /api/ai/chat type:", type(e).__name__)
        print("ERROR /api/ai/chat message:", str(e))
        print("ERROR /api/ai/chat traceback:", traceback.format_exc())
        return jsonify({
            "answer": "AI service is currently unavailable because the backend hit an unexpected error. Check the Flask server logs for details.",
            "suggested_questions": SUGGESTED_QUESTIONS,
        }), 503

    return jsonify({"answer": answer, "suggested_questions": SUGGESTED_QUESTIONS}), 200
