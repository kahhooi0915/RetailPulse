from faker import Faker
from datetime import datetime, timedelta
import random
import psycopg2

fake = Faker()

conn = psycopg2.connect(
    host="localhost",
    database="retailpulse",
    user="postgres",
    password="1234",
    port="5432"
)

cur = conn.cursor()

# Load active products
cur.execute("""
    SELECT product_id, selling_price
    FROM product
    WHERE status = 'ACTIVE'
""")
products = cur.fetchall()

# Load branch staff only
cur.execute("""
    SELECT user_id, branch_id
    FROM users
    WHERE role = 'BRANCH_STAFF'
      AND status = 'ACTIVE'
""")
staff_users = cur.fetchall()

if not products:
    raise Exception("No active products found.")

if not staff_users:
    raise Exception("No active branch staff found.")

# Product trend settings
# Some products increasing, some stable, some declining
product_growth = {}

for product_id, price in products:
    product_growth[product_id] = random.choice([
        1.15,  # increasing
        1.08,  # slightly increasing
        1.00,  # stable
        0.95,  # slightly declining
        0.90   # declining
    ])

payment_methods = ["CASH", "CARD", "E_WALLET"]

# 6 months data
start_date = datetime.today() - timedelta(days=180)
end_date = datetime.today()
current_date = start_date

print("Generating 6 months fake sales data...")

while current_date <= end_date:
    daily_sales_count = random.randint(10, 25)

    for _ in range(daily_sales_count):
        user_id, branch_id = random.choice(staff_users)

        sale_date = current_date.replace(
            hour=random.randint(9, 21),
            minute=random.randint(0, 59),
            second=random.randint(0, 59)
        )

        payment_method = random.choice(payment_methods)

        cur.execute("""
            INSERT INTO sale (
                user_id,
                branch_id,
                sale_date,
                total_amount,
                payment_method
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING sale_id
        """, (
            user_id,
            branch_id,
            sale_date,
            0,
            payment_method
        ))

        sale_id = cur.fetchone()[0]

        item_count = random.randint(1, 4)
        selected_products = random.sample(products, min(item_count, len(products)))

        total_amount = 0

        for product_id, selling_price in selected_products:
            months_passed = (
                (current_date.year - start_date.year) * 12
                + current_date.month - start_date.month
            )

            trend_factor = product_growth[product_id] ** months_passed

            base_quantity = random.randint(1, 5)
            quantity = max(1, round(base_quantity * trend_factor))

            unit_price = float(selling_price)
            subtotal = round(quantity * unit_price, 2)

            cur.execute("""
                INSERT INTO sale_detail (
                    sale_id,
                    product_id,
                    quantity,
                    unit_price,
                    subtotal
                )
                VALUES (%s, %s, %s, %s, %s)
            """, (
                sale_id,
                product_id,
                quantity,
                unit_price,
                subtotal
            ))

            total_amount += subtotal

            # Optional: deduct stock from inventory
            cur.execute("""
                UPDATE inventory
                SET quantity_in_stock = GREATEST(quantity_in_stock - %s, 0),
                    last_updated = CURRENT_TIMESTAMP
                WHERE product_id = %s
                  AND branch_id = %s
            """, (
                quantity,
                product_id,
                branch_id
            ))

        cur.execute("""
            UPDATE sale
            SET total_amount = %s
            WHERE sale_id = %s
        """, (
            round(total_amount, 2),
            sale_id
        ))

    current_date += timedelta(days=1)

conn.commit()
cur.close()
conn.close()

print("Fake sales data generated successfully.")