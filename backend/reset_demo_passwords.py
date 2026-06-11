import os

from werkzeug.security import generate_password_hash

from db import get_connection


DEFAULT_PASSWORD = "Admin123!"


def reset_demo_passwords():
    password = os.getenv("DEMO_PASSWORD", DEFAULT_PASSWORD)
    password_hash = generate_password_hash(password)

    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            UPDATE users
            SET password = %s,
                status = 'ACTIVE'
            WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
            RETURNING email, role
            """,
            (password_hash,),
        )
        users = cur.fetchall()
        conn.commit()

        print("Demo passwords reset successfully.")
        print(f"Temporary password: {password}")
        print("\nAccounts:")
        for email, role in users:
            print(f"- {email} ({role})")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    reset_demo_passwords()
