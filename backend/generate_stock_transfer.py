from faker import Faker
import random
import psycopg2

fake = Faker()

conn = psycopg2.connect(
    host="localhost",
    database="retailpulse",
    user="postgres",
    password="1234"  # change this
)

cur = conn.cursor()

cur.execute("SELECT branch_id FROM branch")
branch_ids = [row[0] for row in cur.fetchall()]

cur.execute("""
    SELECT user_id, branch_id
    FROM users
    WHERE role = 'INVENTORY_MANAGER'
      AND status = 'ACTIVE'
      AND branch_id IS NOT NULL
""")
managers = cur.fetchall()

cur.execute("""
    SELECT product_id
    FROM product
    WHERE status = 'ACTIVE'
""")
product_ids = [row[0] for row in cur.fetchall()]

if len(branch_ids) < 2:
    raise Exception("Need at least 2 branches.")

if not managers:
    raise Exception("Need at least one active INVENTORY_MANAGER.")

if not product_ids:
    raise Exception("Need at least one active product.")

number_of_transfers = 30

for _ in range(number_of_transfers):
    from_branch, to_branch = random.sample(branch_ids, 2)

    requested_by = random.choice(managers)[0]

    status = random.choice([
        "PENDING",
        "APPROVED",
        "REJECTED",
        "RECEIVED"
    ])

    approved_by = None
    received_by = None

    if status in ["APPROVED", "REJECTED", "RECEIVED"]:
        approved_by = random.choice(managers)[0]

    if status == "RECEIVED":
        received_by = random.choice(managers)[0]

    transfer_date = fake.date_time_between(
        start_date="-90d",
        end_date="now"
    )

    cur.execute("""
        INSERT INTO stock_transfer (
            from_branch_id,
            to_branch_id,
            transfer_date,
            status,
            requested_by,
            approved_by,
            received_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING transfer_id, transfer_code
    """, (
        from_branch,
        to_branch,
        transfer_date,
        status,
        requested_by,
        approved_by,
        received_by
    ))

    transfer_id, transfer_code = cur.fetchone()

    selected_products = random.sample(
        product_ids,
        random.randint(1, min(5, len(product_ids)))
    )

    for product_id in selected_products:
        quantity = random.randint(5, 50)

        cur.execute("""
            INSERT INTO transfer_detail (
                transfer_id,
                product_id,
                quantity
            )
            VALUES (%s, %s, %s)
        """, (
            transfer_id,
            product_id,
            quantity
        ))

    print(f"Created {transfer_code} - {status}")

conn.commit()
cur.close()
conn.close()

print("Stock transfer and transfer detail data generated successfully.")