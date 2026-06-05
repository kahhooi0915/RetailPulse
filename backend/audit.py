from db import get_connection


def log_audit(user_id, action, module, record_id=None, description=None):
    if not user_id:
        return

    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO audit_log (user_id, action, module, record_id, description)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (user_id, action, module, record_id, description),
        )
        conn.commit()
    except Exception as e:
        print("ERROR log_audit:", e)
        if conn:
            conn.rollback()
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def get_actor_user_id(data=None):
    if data:
        for key in ("actor_user_id", "user_id", "created_by", "requested_by", "approved_by", "received_by"):
            if data.get(key):
                return data.get(key)
    return None
