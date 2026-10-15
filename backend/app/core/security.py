"""Security, cryptographic token generation, and authentication verification."""

import time
import uuid
from typing import Any, Dict, Optional
import jwt

from .config import JWT_SECRET, JWT_ALGORITHM, SESSION_EXPIRY_SECONDS, OTP_EXPIRY_SECONDS, ALLOW_DEV_OTP
from .database import get_connection

# In-memory store for active OTPs: phone -> {otp, expires_at, otp_id, attempts}
OTP_STORE: Dict[str, Dict[str, Any]] = {}
OTP_BY_ID: Dict[str, Dict[str, Any]] = {}
MAX_OTP_ATTEMPTS = 5


def create_access_token(user_id: str, role: str = "RIDER") -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + SESSION_EXPIRY_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except (jwt.PyJWTError, Exception):
        return None


def generate_otp_for_phone(phone: str) -> Dict[str, Any]:
    # In development/test mode, use standard 123456 or 6-digit pseudo-random
    otp_code = (
        "123456"
        if ALLOW_DEV_OTP and (phone.endswith("43210") or "98765" in phone or phone.endswith("01234"))
        else str(int(time.time() * 1000) % 900000 + 100000)
    )
    otp_id = str(uuid.uuid4())
    expires_at = time.time() + OTP_EXPIRY_SECONDS

    payload = {
        "otp_id": otp_id,
        "phone": phone,
        "otp": otp_code,
        "expires_at": expires_at,
        "attempts": 0,
    }
    OTP_STORE[phone] = payload
    OTP_BY_ID[otp_id] = payload

    res = {
        "otp_id": otp_id,
        "phone": phone,
        "expires_in_sec": OTP_EXPIRY_SECONDS,
    }
    if ALLOW_DEV_OTP:
        res["dev_hint_otp"] = otp_code
    return res


def verify_phone_otp(phone: str, otp_code: str) -> Optional[Dict[str, Any]]:
    stored = OTP_STORE.get(phone)
    now = time.time()

    # Handle expiration
    if stored and now > stored.get("expires_at", 0):
        OTP_STORE.pop(phone, None)
        OTP_BY_ID.pop(stored.get("otp_id", ""), None)
        stored = None

    # Enforce attempt rate limiting on active OTP
    if stored:
        stored["attempts"] = stored.get("attempts", 0) + 1
        if stored["attempts"] > MAX_OTP_ATTEMPTS:
            OTP_STORE.pop(phone, None)
            OTP_BY_ID.pop(stored.get("otp_id", ""), None)
            return None

    valid = False
    if ALLOW_DEV_OTP and otp_code == "123456":
        valid = True
    elif stored and stored.get("otp") == otp_code and now <= stored.get("expires_at", 0):
        valid = True

    if not valid:
        return None

    # Single-use OTP token consumption (prevent replay)
    if stored:
        OTP_STORE.pop(phone, None)
        OTP_BY_ID.pop(stored.get("otp_id", ""), None)


    # Get or create user
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE phone = ?", (phone,))
    row = cur.fetchone()

    if not row:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        cur.execute(
            "INSERT INTO users (id, phone, name, role) VALUES (?, ?, ?, ?)",
            (user_id, phone, f"User {phone[-4:]}", "RIDER"),
        )
        conn.commit()
        user = {"id": user_id, "phone": phone, "name": f"User {phone[-4:]}", "role": "RIDER"}
    else:
        user = dict(row)

    token = create_access_token(user["id"], user.get("role", "RIDER"))

    # Record active session
    cur.execute(
        "INSERT INTO user_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, datetime('now', '+1 day'))",
        (str(uuid.uuid4()), user["id"], token),
    )
    conn.commit()
    conn.close()

    return {"token": token, "user": user}


def verify_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None

    user_id = payload["sub"]
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user_row = cur.fetchone()
    conn.close()

    if not user_row:
        return None
    return dict(user_row)
