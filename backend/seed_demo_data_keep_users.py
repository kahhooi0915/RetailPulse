from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
import random
import sys

import psycopg2
from psycopg2 import sql

sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import get_connection  # noqa: E402


RANDOM_SEED = 20260604

BUSINESS_TABLES = [
    "sale_detail",
    "sale",
    "inventory",
    "transfer_detail",
    "stock_transfer_detail",
    "stock_transfer",
    "purchase_detail",
    "purchase",
    "supplier_product",
    "supplier",
    "product",
    "category",
    "audit_log",
]

COUNT_TABLES = {
    "branches": "branch",
    "categories": "category",
    "products": "product",
    "suppliers": "supplier",
    "inventory rows": "inventory",
    "sales": "sale",
    "sale_detail": "sale_detail",
    "purchase": "purchase",
    "stock_transfer": "stock_transfer",
}

PAYMENT_METHODS = ["CASH", "CARD", "E_WALLET"]
DISCOUNT_RATES = [0, 0, 0, 0, 5, 10, 15]


def table_exists(cur, table_name):
    cur.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = %s
        """,
        (table_name,),
    )
    return cur.fetchone() is not None


def get_columns(cur, table_name):
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table_name,),
    )
    return {row[0] for row in cur.fetchall()}


def get_table_columns(cur, table_names):
    return {
        table_name: get_columns(cur, table_name)
        for table_name in table_names
        if table_exists(cur, table_name)
    }


def ensure_sale_discount_columns(cur):
    if not table_exists(cur, "sale"):
        return

    cur.execute(
        """
        ALTER TABLE sale
        ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0
        """
    )


def insert_row(cur, table_name, values, returning=None):
    columns = get_columns(cur, table_name)
    filtered = {
        key: value
        for key, value in values.items()
        if key in columns and value is not _SKIP
    }

    if not filtered:
        raise ValueError(f"No insertable values for table {table_name}")

    query = sql.SQL("INSERT INTO {table} ({cols}) VALUES ({vals})").format(
        table=sql.Identifier(table_name),
        cols=sql.SQL(", ").join(sql.Identifier(col) for col in filtered),
        vals=sql.SQL(", ").join(sql.Placeholder() for _ in filtered),
    )

    if returning:
        query += sql.SQL(" RETURNING {}").format(sql.Identifier(returning))

    cur.execute(query, list(filtered.values()))
    return cur.fetchone()[0] if returning else None


def reset_sequence(cur, table_name):
    cur.execute("SELECT pg_get_serial_sequence(%s, %s)", (table_name, f"{table_name}_id"))
    row = cur.fetchone()
    if not row or not row[0]:
        id_columns = {
            "sale_detail": "detail_id",
            "transfer_detail": "transfer_detail_id",
            "stock_transfer": "transfer_id",
            "purchase_detail": "purchase_detail_id",
        }
        id_column = id_columns.get(table_name)
        if id_column:
            cur.execute("SELECT pg_get_serial_sequence(%s, %s)", (table_name, id_column))
            row = cur.fetchone()

    if row and row[0]:
        cur.execute(sql.SQL("ALTER SEQUENCE {} RESTART WITH 1").format(sql.SQL(row[0])))


def reset_business_data(cur):
    existing_reset_tables = [
        table_name for table_name in BUSINESS_TABLES if table_exists(cur, table_name)
    ]

    if existing_reset_tables:
        cur.execute(
            sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY").format(
                sql.SQL(", ").join(sql.Identifier(table) for table in existing_reset_tables)
            )
        )


def get_active_users(cur):
    cur.execute(
        """
        SELECT user_id, role, branch_id, status
        FROM users
        WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
        ORDER BY user_id
        """
    )
    return [
        {"user_id": row[0], "role": row[1], "branch_id": row[2], "status": row[3]}
        for row in cur.fetchall()
    ]


def get_demo_users(cur):
    users = get_active_users(cur)
    branch_roles = {"BRANCH_STAFF", "INVENTORY_MANAGER"}
    assignable = [user for user in users if user["role"] in branch_roles]

    if not assignable:
        raise RuntimeError(
            "No active BRANCH_STAFF or INVENTORY_MANAGER users found. "
            "Create at least one non-admin branch user before running this seed."
        )

    return assignable


def users_by_branch(users, branch_ids):
    result = {branch_id: [] for branch_id in branch_ids}
    for user in users:
        if user["branch_id"] in result and user["role"] != "SYSTEM_ADMIN":
            result[user["branch_id"]].append(user["user_id"])

    missing = [branch_id for branch_id, user_ids in result.items() if not user_ids]
    if missing:
        fallback_users = [user["user_id"] for user in users if user["role"] != "SYSTEM_ADMIN"]
        if not fallback_users:
            raise RuntimeError("No non-admin users available for demo sales.")
        for branch_id in missing:
            result[branch_id] = [fallback_users[0]]

    return result


def first_user(cur, roles=None):
    if roles:
        cur.execute(
            """
            SELECT user_id
            FROM users
            WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
              AND role = ANY(%s)
            ORDER BY user_id
            LIMIT 1
            """,
            (roles,),
        )
    else:
        cur.execute(
            """
            SELECT user_id
            FROM users
            WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
            ORDER BY user_id
            LIMIT 1
            """
        )
    row = cur.fetchone()
    return row[0] if row else None


def get_demo_branch_ids(cur):
    branch_columns = get_columns(cur, "branch")
    select_columns = ["branch_id"]
    for column in ("branch_name", "branch_type", "status"):
        if column in branch_columns:
            select_columns.append(column)

    cur.execute(
        sql.SQL("SELECT {} FROM branch ORDER BY branch_id").format(
            sql.SQL(", ").join(sql.Identifier(column) for column in select_columns)
        )
    )

    branches = []
    for row in cur.fetchall():
        branch = dict(zip(select_columns, row))
        branch.setdefault("branch_name", "")
        branch.setdefault("branch_type", "")
        branch.setdefault("status", "ACTIVE")
        branches.append(branch)

    active_branches = [
        branch for branch in branches if branch.get("status") in (None, "ACTIVE")
    ]
    if not active_branches:
        active_branches = branches

    if not active_branches:
        raise RuntimeError(
            "No branches found. Create your branches before running this seed."
        )

    warehouse = next(
        (
            branch
            for branch in active_branches
            if str(branch.get("branch_type", "")).upper() == "WAREHOUSE"
        ),
        None,
    )
    if warehouse is None:
        warehouse = next(
            (
                branch
                for branch in active_branches
                if str(branch.get("branch_name", "")).strip().lower() == "warehouse"
            ),
            active_branches[0],
        )

    sales_branches = [
        branch
        for branch in active_branches
        if branch["branch_id"] != warehouse["branch_id"]
        and str(branch.get("branch_type", "")).upper() != "WAREHOUSE"
    ]
    if not sales_branches:
        sales_branches = [
            branch
            for branch in active_branches
            if branch["branch_id"] != warehouse["branch_id"]
        ]
    if not sales_branches:
        sales_branches = [warehouse]

    while len(sales_branches) < 3:
        sales_branches.append(sales_branches[len(sales_branches) % len(sales_branches)])

    return {
        "Warehouse": warehouse["branch_id"],
        "Melaka Sentral Branch": sales_branches[0]["branch_id"],
        "Ayer Keroh Branch": sales_branches[1]["branch_id"],
        "Bukit Katil Branch": sales_branches[2]["branch_id"],
    }


def seed_categories(cur):
    ids = {}
    for category_name in [
        "Personal Care",
        "Beverages",
        "Stationery",
        "Household",
        "Snacks",
    ]:
        category_id = insert_row(
            cur,
            "category",
            {"category_name": category_name, "status": "ACTIVE"},
            returning="category_id",
        )
        ids[category_name] = category_id
    return ids


def seed_products(cur, category_ids):
    product_data = [
        ("Body Wash", "Personal Care", "Fresh daily body wash for family use.", "bodywash.jpg", 16.90, 12, 60),
        ("Deodorant 50ML", "Personal Care", "Compact roll-on deodorant for daily freshness.", "deodorant.jpg", 8.90, 10, 50),
        ("Coca Cola 250ML", "Beverages", "Chilled carbonated soft drink can.", "cocacola.jpg", 2.50, 24, 120),
        ("Marker Pen", "Stationery", "Black permanent marker pen for office and school.", "markerpen.jpg", 3.20, 15, 75),
        ("Tea Bags", "Beverages", "Classic black tea bags, 25 sachets per box.", "teabags.jpg", 9.90, 10, 50),
        ("Toothpaste", "Personal Care", "Daily fluoride toothpaste for family dental care.", "toothpaste.jpg", 7.50, 8, 40),
        ("Shampoo", "Personal Care", "Gentle shampoo for daily hair care.", "shampoo.jpg", 14.90, 10, 50),
        ("Notebook A5", "Stationery", "A5 ruled notebook for study and office notes.", "notebooka5.jpg", 4.80, 20, 100),
        ("Pepsi 500ML", "Beverages", "Refreshing cola drink bottle for chilled display.", "pepsi.jpg", 3.20, 18, 90),
        ("Sunscreen", "Personal Care", "Lightweight daily sunscreen for outdoor protection.", "sunscreen.jpg", 19.90, 16, 80),
    ]

    ids = {}
    product_columns = get_columns(cur, "product")
    for name, category, description, image_name, selling_price, reorder_level, warehouse_reorder_level in product_data:
        image_data = None
        image_mime = None
        image_path = Path(__file__).resolve().parent / "static" / "images" / "products" / image_name
        if image_path.exists() and {"product_image_data", "product_image_mime"} <= product_columns:
            image_data = psycopg2.Binary(image_path.read_bytes())
            image_mime = "image/webp" if image_path.suffix.lower() == ".webp" else "image/jpeg"

        product_id = insert_row(
            cur,
            "product",
            {
                "product_name": name,
                "category_id": category_ids[category],
                "selling_price": Decimal(str(selling_price)),
                "reorder_level": reorder_level,
                "warehouse_reorder_level": warehouse_reorder_level,
                "status": "ACTIVE",
                "description": description,
                "product_image_data": image_data,
                "product_image_mime": image_mime,
            },
            returning="product_id",
        )
        ids[name] = {
            "product_id": product_id,
            "selling_price": Decimal(str(selling_price)),
            "reorder_level": reorder_level,
            "warehouse_reorder_level": warehouse_reorder_level,
        }
    return ids


def seed_suppliers(cur):
    suppliers = [
        (
            "Melaka Retail Supplier Sdn Bhd",
            "Nur Aisyah",
            "012-8144555",
            "sales@melakaretail.example",
            "No. 22, Jalan Industri, Melaka",
        ),
        (
            "FreshMart Distribution",
            "Tan Wei Ming",
            "012-3577888",
            "orders@freshmart.example",
            "Lot 18, Ayer Keroh Distribution Park, Melaka",
        ),
        (
            "OfficePro Wholesale",
            "Siti Hajar",
            "012-4190333",
            "support@officepro.example",
            "No. 7, Jalan Perniagaan, Melaka",
        ),
    ]

    ids = {}
    for name, contact, phone, email, address in suppliers:
        supplier_id = insert_row(
            cur,
            "supplier",
            {
                "supplier_name": name,
                "contact_person": contact,
                "phone": phone,
                "email": email,
                "address": address,
                "status": "ACTIVE",
            },
            returning="supplier_id",
        )
        ids[name] = supplier_id
    return ids


def seed_supplier_products(cur, supplier_ids, product_ids):
    assignments = {
        "Melaka Retail Supplier Sdn Bhd": [
            ("Body Wash", 10.50, 4, True),
            ("Deodorant 50ML", 5.20, 5, True),
            ("Toothpaste", 4.60, 3, True),
            ("Shampoo", 9.20, 4, True),
            ("Sunscreen", 12.10, 3, False),
        ],
        "FreshMart Distribution": [
            ("Coca Cola 250ML", 1.55, 2, True),
            ("Tea Bags", 6.40, 5, True),
            ("Pepsi 500ML", 2.10, 2, True),
        ],
        "OfficePro Wholesale": [
            ("Marker Pen", 1.75, 3, True),
            ("Notebook A5", 2.65, 4, True),
        ],
    }

    seen = set()
    for supplier_name, items in assignments.items():
        for product_name, purchase_price, lead_time_days, is_preferred in items:
            supplier_id = supplier_ids[supplier_name]
            product_id = product_ids[product_name]["product_id"]
            if (supplier_id, product_id) in seen:
                continue
            seen.add((supplier_id, product_id))
            insert_row(
                cur,
                "supplier_product",
                {
                    "supplier_id": supplier_id,
                    "product_id": product_id,
                    "purchase_price": Decimal(str(purchase_price)),
                    "lead_time_days": lead_time_days,
                    "is_preferred": is_preferred,
                    "status": "ACTIVE",
                },
            )


def seed_sales(cur, product_ids, branch_ids, branch_users):
    branch_profiles = {
        "Melaka Sentral Branch": {"sales_per_month": 45, "quantity_boost": 1.35},
        "Ayer Keroh Branch": {"sales_per_month": 30, "quantity_boost": 1.0},
        "Bukit Katil Branch": {"sales_per_month": 18, "quantity_boost": 0.75},
    }
    important_products = [
        "Body Wash",
        "Marker Pen",
        "Tea Bags",
        "Coca Cola 250ML",
        "Deodorant 50ML",
    ]
    slow_moving_products = ["Toothpaste", "Pepsi 500ML", "Sunscreen"]
    other_products = [
        name
        for name in product_ids
        if name not in important_products and name not in slow_moving_products
    ]
    start_date = datetime.now() - timedelta(days=365)

    for month_offset in range(12):
        month_start = start_date + timedelta(days=month_offset * 30)
        for branch_name, profile in branch_profiles.items():
            branch_id = branch_ids[branch_name]
            user_ids = branch_users[branch_id]
            sale_count = profile["sales_per_month"]

            for index in range(sale_count):
                sale_date = month_start + timedelta(
                    days=random.randint(0, 27),
                    hours=random.randint(9, 21),
                    minutes=random.randint(0, 59),
                )
                sale_id = insert_row(
                    cur,
                    "sale",
                    {
                        "user_id": random.choice(user_ids),
                        "branch_id": branch_id,
                        "sale_date": sale_date,
                        "total_amount": Decimal("0.00"),
                        "payment_method": random.choice(PAYMENT_METHODS),
                    },
                    returning="sale_id",
                )

                selected = [important_products[(index + month_offset) % len(important_products)]]
                selected += random.sample(other_products, k=random.randint(1, 2))
                total = Decimal("0.00")

                for product_name in selected:
                    product = product_ids[product_name]
                    base_qty = random.randint(1, 4)
                    quantity = max(1, int(round(base_qty * profile["quantity_boost"])))
                    unit_price = product["selling_price"]
                    subtotal = (unit_price * quantity).quantize(Decimal("0.01"))
                    insert_row(
                        cur,
                        "sale_detail",
                        {
                            "sale_id": sale_id,
                            "product_id": product["product_id"],
                            "quantity": quantity,
                            "unit_price": unit_price,
                            "subtotal": subtotal,
                        },
                    )
                    total += subtotal

                discount_percent = Decimal(str(random.choice(DISCOUNT_RATES)))
                discount_amount = (total * discount_percent / Decimal("100")).quantize(Decimal("0.01"))

                cur.execute(
                    """
                    UPDATE sale
                    SET total_amount = %s,
                        discount_percent = %s,
                        discount_amount = %s
                    WHERE sale_id = %s
                    """,
                    (
                        (total - discount_amount).quantize(Decimal("0.01")),
                        discount_percent,
                        discount_amount,
                        sale_id,
                    ),
                )

    rare_sales = [
        ("Toothpaste", "Ayer Keroh Branch", 2, 155),
        ("Pepsi 500ML", "Bukit Katil Branch", 1, 95),
        ("Sunscreen", "Melaka Sentral Branch", 2, 35),
    ]

    for product_name, branch_name, quantity, days_ago in rare_sales:
        product = product_ids[product_name]
        unit_price = product["selling_price"]
        subtotal = (unit_price * quantity).quantize(Decimal("0.01"))
        discount_percent = Decimal(str(random.choice([0, 5, 10])))
        discount_amount = (subtotal * discount_percent / Decimal("100")).quantize(Decimal("0.01"))
        branch_id = branch_ids[branch_name]
        sale_id = insert_row(
            cur,
            "sale",
            {
                "user_id": random.choice(branch_users[branch_id]),
                "branch_id": branch_id,
                "sale_date": datetime.now() - timedelta(days=days_ago),
                "total_amount": (subtotal - discount_amount).quantize(Decimal("0.01")),
                "discount_percent": discount_percent,
                "discount_amount": discount_amount,
                "payment_method": random.choice(PAYMENT_METHODS),
            },
            returning="sale_id",
        )
        insert_row(
            cur,
            "sale_detail",
            {
                "sale_id": sale_id,
                "product_id": product["product_id"],
                "quantity": quantity,
                "unit_price": unit_price,
                "subtotal": subtotal,
            },
        )


def seed_purchases(cur, supplier_ids, product_ids, branch_ids, created_by):
    purchases = [
        (
            "PENDING",
            "Melaka Retail Supplier Sdn Bhd",
            datetime.now() - timedelta(days=2),
            [("Shampoo", 30, 9.20), ("Sunscreen", 48, 12.10)],
        ),
        (
            "PENDING",
            "FreshMart Distribution",
            datetime.now() - timedelta(days=1),
            [("Coca Cola 250ML", 180, 1.55), ("Tea Bags", 75, 6.40)],
        ),
        (
            "ORDERED",
            "OfficePro Wholesale",
            datetime.now() - timedelta(days=7),
            [("Marker Pen", 60, 1.75), ("Notebook A5", 80, 2.65)],
        ),
        (
            "ORDERED",
            "Melaka Retail Supplier Sdn Bhd",
            datetime.now() - timedelta(days=10),
            [("Body Wash", 90, 10.50), ("Deodorant 50ML", 70, 5.20)],
        ),
        (
            "RECEIVED",
            "FreshMart Distribution",
            datetime.now() - timedelta(days=18),
            [("Coca Cola 250ML", 120, 1.55), ("Tea Bags", 40, 6.40), ("Pepsi 500ML", 75, 2.10)],
        ),
        (
            "RECEIVED",
            "OfficePro Wholesale",
            datetime.now() - timedelta(days=35),
            [("Marker Pen", 100, 1.75), ("Notebook A5", 120, 2.65)],
        ),
        (
            "CANCELLED",
            "FreshMart Distribution",
            datetime.now() - timedelta(days=45),
            [("Pepsi 500ML", 50, 2.10)],
        ),
    ]

    for status, supplier_name, purchase_date, items in purchases:
        total = sum(Decimal(str(qty)) * Decimal(str(cost)) for _, qty, cost in items)
        purchase_id = insert_row(
            cur,
            "purchase",
            {
                "supplier_id": supplier_ids[supplier_name],
                "branch_id": branch_ids["Warehouse"],
                "created_by": created_by,
                "purchase_date": purchase_date,
                "status": status,
                "total_amount": total.quantize(Decimal("0.01")),
            },
            returning="purchase_id",
        )
        for product_name, quantity, unit_cost in items:
            cost = Decimal(str(unit_cost))
            insert_row(
                cur,
                "purchase_detail",
                {
                    "purchase_id": purchase_id,
                    "product_id": product_ids[product_name]["product_id"],
                    "quantity": quantity,
                    "unit_cost": cost,
                    "subtotal": (cost * quantity).quantize(Decimal("0.01")),
                },
            )


def seed_transfers(cur, product_ids, branch_ids, requested_by, approved_by, received_by):
    transfers = [
        (
            "RECEIVED",
            "Warehouse",
            "Melaka Sentral Branch",
            [("Body Wash", 20), ("Coca Cola 250ML", 36)],
            None,
        ),
        (
            "APPROVED",
            "Warehouse",
            "Ayer Keroh Branch",
            [("Marker Pen", 15), ("Tea Bags", 12)],
            None,
        ),
        (
            "PENDING",
            "Warehouse",
            "Melaka Sentral Branch",
            [("Shampoo", 8)],
            None,
        ),
        (
            "PENDING",
            "Warehouse",
            "Ayer Keroh Branch",
            [("Body Wash", 10)],
            None,
        ),
        (
            "PENDING",
            "Warehouse",
            "Bukit Katil Branch",
            [("Deodorant 50ML", 10), ("Pepsi 500ML", 12)],
            None,
        ),
        (
            "PENDING_SOURCE",
            "Warehouse",
            "Melaka Sentral Branch",
            [("Tea Bags", 18)],
            None,
        ),
        (
            "PENDING_SOURCE",
            "Warehouse",
            "Ayer Keroh Branch",
            [("Notebook A5", 20)],
            None,
        ),
        (
            "PENDING_SOURCE",
            "Warehouse",
            "Bukit Katil Branch",
            [("Coca Cola 250ML", 24)],
            None,
        ),
        (
            "PENDING_SOURCE",
            "Melaka Sentral Branch",
            "Ayer Keroh Branch",
            [("Coca Cola 250ML", 12)],
            None,
        ),
        (
            "PENDING_SOURCE",
            "Ayer Keroh Branch",
            "Bukit Katil Branch",
            [("Deodorant 50ML", 6)],
            None,
        ),
        (
            "PENDING_SOURCE",
            "Bukit Katil Branch",
            "Melaka Sentral Branch",
            [("Tea Bags", 5)],
            None,
        ),
        (
            "REJECTED",
            "Melaka Sentral Branch",
            "Bukit Katil Branch",
            [("Notebook A5", 10)],
            "Source branch stock reserved for weekend promotion.",
        ),
    ]

    for status, from_branch, to_branch, items, reject_reason in transfers:
        transfer_values = {
            "from_branch_id": branch_ids[from_branch],
            "to_branch_id": branch_ids[to_branch],
            "status": status,
            "requested_by": requested_by,
            "approved_by": approved_by if status in {"APPROVED", "RECEIVED", "REJECTED"} else None,
            "received_by": received_by if status == "RECEIVED" else None,
            "reject_reason": reject_reason,
            "approved_at": datetime.now() - timedelta(days=2)
            if status in {"APPROVED", "RECEIVED", "REJECTED"}
            else None,
            "transfer_date": datetime.now() - timedelta(days=random.randint(1, 25)),
        }
        transfer_id = insert_row(
            cur,
            "stock_transfer",
            transfer_values,
            returning="transfer_id",
        )

        for product_name, quantity in items:
            insert_row(
                cur,
                "transfer_detail",
                {
                    "transfer_id": transfer_id,
                    "product_id": product_ids[product_name]["product_id"],
                    "quantity": quantity,
                },
            )


def seed_inventory(cur, product_ids, branch_ids):
    quantities = {
        "Warehouse": {
            "Body Wash": 92,
            "Deodorant 50ML": 35,
            "Coca Cola 250ML": 75,
            "Marker Pen": 112,
            "Tea Bags": 32,
            "Toothpaste": 25,
            "Shampoo": 32,
            "Notebook A5": 150,
            "Pepsi 500ML": 45,
            "Sunscreen": 50,
        },
        "Melaka Sentral Branch": {
            "Body Wash": 38,
            "Deodorant 50ML": 16,
            "Coca Cola 250ML": 58,
            "Marker Pen": 34,
            "Tea Bags": 6,
            "Toothpaste": 18,
            "Shampoo": 7,
            "Notebook A5": 44,
            "Pepsi 500ML": 36,
            "Sunscreen": 9,
        },
        "Ayer Keroh Branch": {
            "Body Wash": 7,
            "Deodorant 50ML": 19,
            "Coca Cola 250ML": 42,
            "Marker Pen": 8,
            "Tea Bags": 5,
            "Toothpaste": 14,
            "Shampoo": 18,
            "Notebook A5": 28,
            "Pepsi 500ML": 22,
            "Sunscreen": 13,
        },
        "Bukit Katil Branch": {
            "Body Wash": 22,
            "Deodorant 50ML": 0,
            "Coca Cola 250ML": 19,
            "Marker Pen": 6,
            "Tea Bags": 16,
            "Toothpaste": 3,
            "Shampoo": 4,
            "Notebook A5": 24,
            "Pepsi 500ML": 7,
            "Sunscreen": 30,
        },
    }

    seeded_inventory = set()
    for branch_name, products in quantities.items():
        branch_id = branch_ids[branch_name]
        for product_name, quantity in products.items():
            inventory_key = (product_ids[product_name]["product_id"], branch_id)
            if inventory_key in seeded_inventory:
                continue
            seeded_inventory.add(inventory_key)
            insert_row(
                cur,
                "inventory",
                {
                    "product_id": product_ids[product_name]["product_id"],
                    "branch_id": branch_id,
                    "quantity_in_stock": quantity,
                    "last_updated": datetime.now(),
                },
            )


def print_summary(cur):
    print("\nDemo seed summary")
    print("-----------------")
    for label, table_name in COUNT_TABLES.items():
        if table_exists(cur, table_name):
            cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table_name)))
            print(f"{label}: {cur.fetchone()[0]}")
        else:
            print(f"{label}: table not found")


class _Skip:
    pass


_SKIP = _Skip()


def main():
    random.seed(RANDOM_SEED)
    conn = None
    cur = None

    try:
        conn = get_connection()
        conn.autocommit = False
        cur = conn.cursor()

        print("Starting RetailPulse demo reset. Existing users and branches will be preserved.")
        ensure_sale_discount_columns(cur)
        reset_business_data(cur)

        branch_ids = get_demo_branch_ids(cur)
        sales_branch_ids = [
            branch_ids["Melaka Sentral Branch"],
            branch_ids["Ayer Keroh Branch"],
            branch_ids["Bukit Katil Branch"],
        ]
        assigned_users = get_demo_users(cur)
        branch_users = users_by_branch(assigned_users, sales_branch_ids)

        category_ids = seed_categories(cur)
        product_ids = seed_products(cur, category_ids)
        supplier_ids = seed_suppliers(cur)
        seed_supplier_products(cur, supplier_ids, product_ids)

        seed_sales(cur, product_ids, branch_ids, branch_users)

        created_by = first_user(cur, ["SYSTEM_ADMIN", "INVENTORY_MANAGER"]) or assigned_users[0]["user_id"]
        requested_by = assigned_users[0]["user_id"]
        approved_by = first_user(cur, ["SYSTEM_ADMIN", "INVENTORY_MANAGER"]) or requested_by
        received_by = first_user(cur, ["INVENTORY_MANAGER"]) or requested_by

        seed_purchases(cur, supplier_ids, product_ids, branch_ids, created_by)
        seed_transfers(cur, product_ids, branch_ids, requested_by, approved_by, received_by)
        seed_inventory(cur, product_ids, branch_ids)

        print_summary(cur)
        conn.commit()
        print("\nDemo data reset and seed completed successfully.")

    except Exception as exc:
        if conn:
            conn.rollback()
        print("\nERROR: Demo data reset failed. All changes were rolled back.")
        print(f"Reason: {exc}")
        raise

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
