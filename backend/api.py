"""RouteMate AI — Compatibility Entry Point.

This file preserves backward compatibility for legacy commands (`python api.py`
or `uvicorn api:app`). All implementation details are now modularized under `app/`.
"""

import sys
from pathlib import Path

# Add backend directory to path so 'app' imports cleanly
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import uvicorn
from app.main import app, socket_app, sio
from app.core.database import init_db, get_connection
from app.core.security import (
    generate_otp_for_phone,
    verify_phone_otp,
    verify_jwt_token,
    OTP_STORE,
    OTP_BY_ID,
    JWT_SECRET,
    JWT_ALGORITHM,
)

__all__ = [
    "app",
    "socket_app",
    "sio",
    "init_db",
    "get_connection",
    "generate_otp_for_phone",
    "verify_phone_otp",
    "verify_jwt_token",
    "OTP_STORE",
    "OTP_BY_ID",
    "JWT_SECRET",
    "JWT_ALGORITHM",
]

if __name__ == "__main__":
    uvicorn.run("api:socket_app", host="0.0.0.0", port=8000, reload=False)
