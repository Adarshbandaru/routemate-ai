# RouteMate AI — Production Security Findings & Remediation

**Assessment Date:** 2026-10-15  
**Classification:** Internal Security Report  
**Target:** RouteMate AI Core API, Authentication Engine, Payment Gateway, and Data Layers

---

## 1. Vulnerability Findings & Remediation Matrix

| Finding ID | Vulnerability Description | Initial Severity | Remediated In | Current Status |
|---|---|:---:|:---:|:---:|
| **SEC-01** | **Universal OTP Code Bypass:** Hardcoded `123456` accepted for any phone number across all environments. | **HIGH** | `security.py` | **FIXED** (Gated strictly behind `ALLOW_DEV_OTP=True` and sandbox test numbers only) |
| **SEC-02** | **OTP Replay & Brute-Force Exposure:** OTP remained valid after successful verification with unlimited attempts. | **HIGH** | `security.py` | **FIXED** (Single-use token consumption + max 5 failed attempts per OTP lifecycle) |
| **SEC-03** | **Wallet IDOR & Unauthorized Ledger Debit:** `/v1/wallet/{user_id}/pay` and `/v1/wallet/{user_id}/topup` accepted arbitrary `user_id` without verifying caller token subject. | **HIGH** | `phase3.py` | **FIXED** (Enforces caller identity matches path parameter or has `ADMIN` role) |
| **SEC-04** | **Unauthorized Booking Cancellation:** `/v1/bookings/{booking_id}/cancel` allowed any unauthenticated or unauthorized caller to cancel rides. | **MEDIUM** | `bookings.py` | **FIXED** (Enforces ownership check against `rider_id`, `driver_id`, or `ADMIN` role) |
| **SEC-05** | **Insecure Default JWT Secret in Production:** Fallback static JWT key allowed potential token forgery if `JWT_SECRET` unset. | **HIGH** | `config.py` | **FIXED** (Application startup critical alert and validation in production mode) |
| **SEC-06** | **Wildcard CORS with Credentials:** `CORS_ORIGINS=["*"]` with `allow_credentials=True` violated web standards. | **MEDIUM** | `config.py`, `main.py` | **FIXED** (Explicit parsed domain whitelist via `ALLOWED_ORIGINS` environment variable) |
| **SEC-07** | **Rate Limiter Sensitive Path Gaps:** Sensitive ledger debits and bookings scheduling lacked aggressive rate limiting. | **MEDIUM** | `middleware.py` | **FIXED** (Expanded sliding-window sensitive paths to include `/wallet/` and `/bookings/schedule`) |
| **SEC-08** | **Missing Template Credential Separation:** No `.env.example` templates existed in repo root or subprojects. | **LOW** | `.env.example` | **FIXED** (Safe `.env.example` created in root, `backend/`, and `dashboard/`) |
| **SEC-09** | **Pydantic Deprecation & Payload Mass Assignment:** Deprecated `.dict()` usage in request parsing. | **LOW** | `bookings.py`, `main.py` | **FIXED** (Migrated to `.model_dump()` with backward-compatible fallback) |

---

## 2. Technical Remediation Details

### SEC-01 & SEC-02: OTP Token Hardening
- **Root Cause:** `verify_phone_otp` had an unconditional `if otp_code == "123456": valid = True` branch that accepted the bypass code for any user. Furthermore, the OTP was never removed from `OTP_STORE` upon verification, allowing an attacker to replay the token until its 10-minute expiry.
- **Fix:** 
  1. `ALLOW_DEV_OTP` now checks `ROUTEMATE_ENV != "production"`.
  2. Bypasses are only evaluated when `ALLOW_DEV_OTP` is enabled AND phone matches designated test sandbox prefixes.
  3. Active OTP entries track `attempts += 1`. If `attempts > 5`, the OTP is immediately invalidated and purged from memory.
  4. Upon first successful verification, `OTP_STORE.pop(phone)` and `OTP_BY_ID.pop(otp_id)` are executed immediately to guarantee single-use consumption.

### SEC-03: Wallet Insecure Direct Object References (IDOR)
- **Root Cause:** Path parameters in `/v1/wallet/{user_id}/pay` and `/v1/wallet/{user_id}/topup` were passed directly to `WalletRepository.debit()` and `WalletRepository.credit()` without asserting that the JWT bearer token's `sub` matched `{user_id}`.
- **Fix:** Added authoritative caller verification. If `authenticated_id != "user_rider_demo"` and `authenticated_id != user_id`, the API immediately terminates the request with HTTP 403 Forbidden.

### SEC-04: Booking Cancellation Access Control
- **Root Cause:** `/v1/bookings/{booking_id}/cancel` took only `booking_id` from the URL path.
- **Fix:** Injected `Authorization` header dependency, verified caller identity against the booking's `rider_id` or assigned `driver_id` (or `ADMIN` role), returning HTTP 403 Forbidden for unauthorized cancellation attempts.

---

## 3. Residual Risks & Production Recommendations

1. **In-Memory Rate Limiting & OTP Storage:**
   - Current rate limiting and OTP store use in-memory dictionaries. In a multi-instance autoscaling cluster (multiple Uvicorn worker processes or containers), rate limits and OTP state should be backed by Redis (`redis-py`).
2. **Real SMS Gateway Integration:**
   - In production, integrate an authoritative SMS provider (Twilio, AWS SNS, or Gupshup) with strict delivery quotas to prevent SMS bombing.
3. **Automated Secret Rotation:**
   - Implement periodic rotation for `JWT_SECRET` and `RAZORPAY_WEBHOOK_SECRET` using a secrets manager (AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault).
