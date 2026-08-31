from datetime import datetime
from decimal import Decimal
from pathlib import Path
import random
import sys

from werkzeug.security import generate_password_hash

sys.path.insert(0, str(Path(__file__).resolve().parent))

from seed_demo_data_keep_users import (  # noqa: E402
    RANDOM_SEED,
    ensure_sale_discount_columns,
    first_user,
    get_columns,
    get_demo_users,
    insert_row,
    print_summary,
    reset_business_data,
    seed_categories,
    seed_inventory,
    seed_products,
    seed_purchases,
    seed_sales,
    seed_supplier_products,
    seed_suppliers,
    seed_transfers,
    table_exists,
    users_by_branch,
)
from db import get_connection  # noqa: E402


DEMO_PASSWORD = "Admin123!"

PRESENTATION_USER_EMAILS = [
    "john.tan@gmail.com",
]

PRESENTATION_USER_PHONES = [
    "012-3456789",
]

PRESENTATION_BRANCH_NAMES = [
    "Branch B",
]

BASELINE_BRANCHES = [
    {
        "key": "Warehouse",
        "branch_name": "Warehouse",
        "branch_address": "Main Warehouse, Melaka",
        "phone": "06-1000001",
        "branch_type": "WAREHOUSE",
        "status": "ACTIVE",
    },
    {
        "key": "Melaka Sentral Branch",
        "branch_name": "Melaka Sentral Branch",
        "branch_address": "Melaka Sentral, Melaka",
        "phone": "06-1000002",
        "branch_type": "BRANCH",
        "status": "ACTIVE",
    },
    {
        "key": "Ayer Keroh Branch",
        "branch_name": "Ayer Keroh Branch",
        "branch_address": "Ayer Keroh, Melaka",
        "phone": "06-1000003",
        "branch_type": "BRANCH",
        "status": "ACTIVE",
    },
    {
        "key": "Bukit Katil Branch",
        "branch_name": "Bukit Katil Branch",
        "branch_address": "Bukit Katil, Melaka",
        "phone": "06-1000004",
        "branch_type": "BRANCH",
        "status": "ACTIVE",
    },
]


def ensure_branch_status_column(cur):
    cur.execute(
        """
        ALTER TABLE branch
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        """
    )


def delete_presentation_artifacts(cur):
    if table_exists(cur, "users"):
        cur.execute(
            """
            DELETE FROM users
            WHERE LOWER(email) = ANY(%s)
               OR phone = ANY(%s)
               OR UPPER(name) = 'JOHN TAN'
            """,
            (
                [email.lower() for email in PRESENTATION_USER_EMAILS],
                PRESENTATION_USER_PHONES,
            ),
        )

    if table_exists(cur, "branch"):
        cur.execute(
            """
            DELETE FROM users
            WHERE branch_id IN (
                SELECT branch_id
                FROM branch
                WHERE LOWER(branch_name) = ANY(%s)
            )
            """,
            ([name.lower() for name in PRESENTATION_BRANCH_NAMES],),
        )
        cur.execute(
            """
            DELETE FROM branch
            WHERE LOWER(branch_name) = ANY(%s)
            """,
            ([name.lower() for name in PRESENTATION_BRANCH_NAMES],),
        )


def ensure_branch(cur, branch):
    ensure_branch_status_column(cur)
    columns = get_columns(cur, "branch")

    cur.execute(
        """
        SELECT branch_id
        FROM branch
        WHERE LOWER(branch_name) = LOWER(%s)
        ORDER BY branch_id
        LIMIT 1
        """,
        (branch["branch_name"],),
    )
    row = cur.fetchone()

    values = {
        "branch_name": branch["branch_name"],
        "branch_address": branch["branch_address"],
        "phone": branch["phone"],
        "branch_type": branch["branch_type"],
        "status": branch["status"],
    }
    values = {key: value for key, value in values.items() if key in columns}

    if row:
        assignments = ", ".join(f"{column} = %s" for column in values)
        cur.execute(
            f"UPDATE branch SET {assignments} WHERE branch_id = %s",
            [*values.values(), row[0]],
        )
        return row[0]

    return insert_row(cur, "branch", values, returning="branch_id")


def ensure_baseline_branches(cur):
    return {
        branch["key"]: ensure_branch(cur, branch)
        for branch in BASELINE_BRANCHES
    }


def phone_is_available(cur, phone, email):
    cur.execute(
        """
        SELECT 1
        FROM users
        WHERE phone = %s
          AND LOWER(email) <> LOWER(%s)
        """,
        (phone, email),
    )
    return cur.fetchone() is None


def unique_phone(cur, preferred_phone, email):
    if phone_is_available(cur, preferred_phone, email):
        return preferred_phone

    for index in range(1000, 9999):
        candidate = f"010-{index:07d}"
        if phone_is_available(cur, candidate, email):
            return candidate

    raise RuntimeError(f"Unable to find an available phone number for {email}")


def ensure_user(cur, *, name, email, phone, role, branch_id=None):
    phone = unique_phone(cur, phone, email)
    password_hash = generate_password_hash(DEMO_PASSWORD)

    cur.execute(
        """
        SELECT user_id
        FROM users
        WHERE LOWER(email) = LOWER(%s)
        """,
        (email,),
    )
    row = cur.fetchone()

    if row:
        cur.execute(
            """
            UPDATE users
            SET name = %s,
                phone = %s,
                password = %s,
                role = %s,
                branch_id = %s,
                status = 'ACTIVE'
            WHERE user_id = %s
            """,
            (name.upper(), phone, password_hash, role, branch_id, row[0]),
        )
        return row[0]

    return insert_row(
        cur,
        "users",
        {
            "name": name.upper(),
            "email": email.lower(),
            "phone": phone,
            "password": password_hash,
            "role": role,
            "branch_id": branch_id,
            "status": "ACTIVE",
        },
        returning="user_id",
    )


def ensure_baseline_users(cur, branch_ids):
    return {
        "admin": ensure_user(
            cur,
            name="System Admin",
            email="admin@retailpulse.com",
            phone="010-0000001",
            role="SYSTEM_ADMIN",
            branch_id=None,
        ),
        "melaka_manager": ensure_user(
            cur,
            name="Melaka Manager",
            email="melaka.manager@retailpulse.com",
            phone="010-0000002",
            role="INVENTORY_MANAGER",
            branch_id=branch_ids["Melaka Sentral Branch"],
        ),
        "ayer_manager": ensure_user(
            cur,
            name="Ayer Keroh Manager",
            email="ayer.manager@retailpulse.com",
            phone="010-0000003",
            role="INVENTORY_MANAGER",
            branch_id=branch_ids["Ayer Keroh Branch"],
        ),
        "bukit_manager": ensure_user(
            cur,
            name="Bukit Katil Manager",
            email="bukit.manager@retailpulse.com",
            phone="010-0000004",
            role="INVENTORY_MANAGER",
            branch_id=branch_ids["Bukit Katil Branch"],
        ),
        "melaka_staff": ensure_user(
            cur,
            name="Melaka Staff",
            email="melaka.staff@retailpulse.com",
            phone="010-0000005",
            role="BRANCH_STAFF",
            branch_id=branch_ids["Melaka Sentral Branch"],
        ),
        "ayer_staff": ensure_user(
            cur,
            name="Ayer Keroh Staff",
            email="ayer.staff@retailpulse.com",
            phone="010-0000006",
            role="BRANCH_STAFF",
            branch_id=branch_ids["Ayer Keroh Branch"],
        ),
    }


def seed_fixed_sales_monitoring_case(cur, product_ids, branch_ids, user_ids):
    product = product_ids["Coca Cola 250ML"]
    quantity = 2
    unit_price = product["selling_price"]
    subtotal = (unit_price * quantity).quantize(Decimal("0.01"))
    sale_date = datetime(2026, 8, 17, 10, 30)

    sale_id = insert_row(
        cur,
        "sale",
        {
            "user_id": user_ids["ayer_staff"],
            "branch_id": branch_ids["Ayer Keroh Branch"],
            "sale_date": sale_date,
            "total_amount": subtotal,
            "payment_method": "CASH",
            "discount_percent": Decimal("0.00"),
            "discount_amount": Decimal("0.00"),
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


def clear_tc10_purchase_blocker(cur, product_ids, branch_ids):
    cur.execute(
        """
        UPDATE purchase
        SET status = 'RECEIVED'
        WHERE branch_id = %s
          AND status IN ('PENDING', 'ORDERED')
          AND purchase_id IN (
              SELECT purchase_id
              FROM purchase_detail
              WHERE product_id = %s
          )
        """,
        (
            branch_ids["Warehouse"],
            product_ids["Coca Cola 250ML"]["product_id"],
        ),
    )


def clear_tc8_transfer_blocker(cur, product_ids, branch_ids):
    cur.execute(
        """
        UPDATE stock_transfer
        SET status = 'REJECTED',
            reject_reason = 'Reserved for functional test presentation reset.'
        WHERE from_branch_id = %s
          AND to_branch_id = %s
          AND status IN ('PENDING', 'PENDING_SOURCE', 'APPROVED')
          AND transfer_id IN (
              SELECT transfer_id
              FROM transfer_detail
              WHERE product_id = %s
          )
        """,
        (
            branch_ids["Melaka Sentral Branch"],
            branch_ids["Ayer Keroh Branch"],
            product_ids["Coca Cola 250ML"]["product_id"],
        ),
    )


def print_functional_test_accounts(user_ids):
    print("\nFunctional test presentation accounts")
    print("-------------------------------------")
    print(f"Password for all listed accounts: {DEMO_PASSWORD}")
    print("- admin@retailpulse.com (SYSTEM_ADMIN)")
    print("- melaka.staff@retailpulse.com (BRANCH_STAFF)")
    print("- ayer.manager@retailpulse.com (INVENTORY_MANAGER)")
    print(f"\nPrepared {len(user_ids)} baseline user account(s).")


def main():
    random.seed(RANDOM_SEED)
    conn = None
    cur = None

    try:
        conn = get_connection()
        conn.autocommit = False
        cur = conn.cursor()

        print("Starting RetailPulse functional test presentation reset.")
        ensure_sale_discount_columns(cur)
        reset_business_data(cur)
        delete_presentation_artifacts(cur)

        branch_ids = ensure_baseline_branches(cur)
        user_ids = ensure_baseline_users(cur, branch_ids)

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
        seed_fixed_sales_monitoring_case(cur, product_ids, branch_ids, user_ids)

        created_by = first_user(cur, ["SYSTEM_ADMIN", "INVENTORY_MANAGER"]) or user_ids["admin"]
        requested_by = user_ids["melaka_staff"]
        approved_by = user_ids["admin"]
        received_by = user_ids["ayer_manager"]

        seed_purchases(cur, supplier_ids, product_ids, branch_ids, created_by)
        clear_tc10_purchase_blocker(cur, product_ids, branch_ids)
        seed_transfers(cur, product_ids, branch_ids, requested_by, approved_by, received_by)
        clear_tc8_transfer_blocker(cur, product_ids, branch_ids)
        seed_inventory(cur, product_ids, branch_ids)

        print_summary(cur)
        print_functional_test_accounts(user_ids)
        conn.commit()
        print("\nFunctional test presentation reset completed successfully.")

    except Exception as exc:
        if conn:
            conn.rollback()
        print("\nERROR: Functional test presentation reset failed. All changes were rolled back.")
        print(f"Reason: {exc}")
        raise

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
