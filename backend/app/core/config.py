"""Configuration settings and environment variable management for RouteMate AI."""

import os
from pathlib import Path

# Base Paths
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
SCENARIOS_DIR = BACKEND_DIR / "scenarios"
DB_PATH = BACKEND_DIR / "routemate.db"

# Environment Settings
ENVIRONMENT = os.environ.get("ROUTEMATE_ENV", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"

# JWT & Authentication Settings
DEFAULT_JWT_SECRET = "routemate_production_secret_key_2024_secure_jwt"
JWT_SECRET = os.environ.get("JWT_SECRET", DEFAULT_JWT_SECRET)
if IS_PRODUCTION and JWT_SECRET == DEFAULT_JWT_SECRET:
    import logging
    logging.getLogger("routemate.config").critical(
        "CRITICAL SECURITY RISK: Running in production mode with default JWT_SECRET! "
        "Set an explicit, strong JWT_SECRET environment variable."
    )

JWT_ALGORITHM = "HS256"
SESSION_EXPIRY_SECONDS = int(os.environ.get("SESSION_EXPIRY_SECONDS", 24 * 3600))  # 24 hours
OTP_EXPIRY_SECONDS = int(os.environ.get("OTP_EXPIRY_SECONDS", 600))  # 10 minutes
ALLOW_DEV_OTP = os.environ.get(
    "ROUTEMATE_ALLOW_DEV_OTP",
    "true" if not IS_PRODUCTION else "false"
).lower() in ("true", "1", "yes")

# CORS Settings - Strict parsing of ALLOWED_ORIGINS
raw_cors = os.environ.get("ALLOWED_ORIGINS", "")
if raw_cors.strip():
    CORS_ORIGINS = [orig.strip() for orig in raw_cors.split(",") if orig.strip()]
elif IS_PRODUCTION:
    CORS_ORIGINS = [
        "https://adarshbandaru.github.io",
        "https://routemate.ai",
        "https://app.routemate.ai",
    ]
else:
    CORS_ORIGINS = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
        "https://adarshbandaru.github.io",
    ]

# Razorpay Settings (Phase 3.5)
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_routemate_sandbox")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "routemate_rzp_secret_test_2026")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "routemate_rzp_webhook_secret_2026")
RAZORPAY_SANDBOX_MODE = os.environ.get("RAZORPAY_SANDBOX_MODE", "true").lower() in ("true", "1", "yes")

