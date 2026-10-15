"""Authentication compatibility facade forwarding to app.core.security."""

import sys
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.security import (
    generate_otp_for_phone,
    verify_phone_otp,
    verify_jwt_token,
    create_access_token,
    decode_access_token,
    OTP_STORE,
    OTP_BY_ID,
    JWT_SECRET,
    JWT_ALGORITHM,
    SESSION_EXPIRY_SECONDS,
)

__all__ = [
    "generate_otp_for_phone",
    "verify_phone_otp",
    "verify_jwt_token",
    "create_access_token",
    "decode_access_token",
    "OTP_STORE",
    "OTP_BY_ID",
    "JWT_SECRET",
    "JWT_ALGORITHM",
    "SESSION_EXPIRY_SECONDS",
]
