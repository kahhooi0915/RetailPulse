from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import os
import re
import secrets
import smtplib

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from db import get_connection


forgot_password_bp = Blueprint("forgot_password_bp", __name__)

reset_tokens = {}
TOKEN_LIFETIME_MINUTES = 15
PASSWORD_SPECIAL_CHAR_PATTERN = r"[!@#$%^&*(),.?\":{}|<>]"


def cleanup_expired_tokens():
    now = datetime.now(timezone.utc)
    expired_tokens = [
        token for token, data in reset_tokens.items()
        if data["expires_at"] <= now
    ]

    for token in expired_tokens:
        reset_tokens.pop(token, None)


def send_reset_email(recipient_email, reset_link):
    mail_username = os.getenv("MAIL_USERNAME")
    mail_password = os.getenv("MAIL_PASSWORD")

    if not mail_username or not mail_password:
        raise RuntimeError("MAIL_USERNAME and MAIL_PASSWORD must be set")

    message = EmailMessage()
    message["Subject"] = "RetailPulse Password Reset"
    message["From"] = mail_username
    message["To"] = recipient_email
    message.set_content(
        "You requested a password reset for your RetailPulse account.\n\n"
        f"Reset your password here: {reset_link}\n\n"
        f"This link expires in {TOKEN_LIFETIME_MINUTES} minutes. "
        "If you did not request this reset, you can ignore this email."
    )

    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.starttls()
        smtp.login(mail_username, mail_password)
        smtp.send_message(message)


@forgot_password_bp.route("/forgot-password/send-reset-link", methods=["POST"])
def send_reset_link():
    cleanup_expired_tokens()

    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip()

        if not email:
            return jsonify({"message": "Email is required"}), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            "SELECT email FROM users WHERE LOWER(email) = LOWER(%s)",
            (email,)
        )
        user = cur.fetchone()

        cur.close()
        conn.close()

        if not user:
            return jsonify({"message": "No account found with this email"}), 404

        token = secrets.token_urlsafe(32)
        registered_email = user[0]
        reset_tokens[token] = {
            "email": registered_email,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_LIFETIME_MINUTES),
        }

        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        reset_link = f"{frontend_url}/reset-password?token={token}"
        send_reset_email(registered_email, reset_link)

        return jsonify({
            "message": "Password reset link sent. Please check your email."
        }), 200

    except Exception as e:
        print("ERROR /forgot-password/send-reset-link:", e)
        return jsonify({"message": "Unable to send reset link. Please try again."}), 500


@forgot_password_bp.route("/forgot-password/reset-password", methods=["POST"])
def reset_password():
    cleanup_expired_tokens()

    try:
        data = request.get_json() or {}
        token = data.get("token")
        new_password = data.get("new_password")

        if not token or not new_password:
            return jsonify({"message": "Token and new password are required"}), 400

        token_data = reset_tokens.get(token)

        if not token_data:
            return jsonify({"message": "Invalid or expired reset token"}), 400

        if token_data["expires_at"] <= datetime.now(timezone.utc):
            reset_tokens.pop(token, None)
            return jsonify({"message": "Reset token has expired"}), 400

        if len(new_password) < 8 or not re.search(PASSWORD_SPECIAL_CHAR_PATTERN, new_password):
            return jsonify({
                "message": "Password must be at least 8 characters and include one special character"
            }), 400

        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            "UPDATE users SET password = %s WHERE LOWER(email) = LOWER(%s)",
            (generate_password_hash(new_password), token_data["email"])
        )
        conn.commit()

        cur.close()
        conn.close()

        reset_tokens.pop(token, None)

        return jsonify({"message": "Password reset successfully. You can now log in."}), 200

    except Exception as e:
        print("ERROR /forgot-password/reset-password:", e)
        return jsonify({"message": "Unable to reset password. Please try again."}), 500
