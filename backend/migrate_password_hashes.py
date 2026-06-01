from werkzeug.security import generate_password_hash

from db import get_connection


HASH_PREFIXES = ("pbkdf2:", "scrypt:")


def is_password_hash(password):
    return isinstance(password, str) and password.startswith(HASH_PREFIXES)


def migrate_passwords():
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT user_id, email, password
            FROM users
            ORDER BY user_id
            """
        )

        users = cur.fetchall()
        migrated_count = 0
        skipped_count = 0

        for user_id, email, password in users:
            if is_password_hash(password):
                skipped_count += 1
                print(f"SKIP {email}: password is already hashed")
                continue

            cur.execute(
                "UPDATE users SET password = %s WHERE user_id = %s",
                (generate_password_hash(password), user_id),
            )
            migrated_count += 1
            print(f"MIGRATE {email}: password hashed")

        conn.commit()

        print(
            f"Done. Migrated {migrated_count} user(s), "
            f"skipped {skipped_count} already-hashed user(s)."
        )
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    migrate_passwords()
