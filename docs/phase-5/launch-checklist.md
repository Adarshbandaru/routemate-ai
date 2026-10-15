# RouteMate AI — Production Launch Checklist

**Target Release:** v1.0.0 (Punjab Shared-Mobility Network)  
**Status Key:**  
- `[IMPLEMENTED]`: Code completed and active in repository  
- `[TESTED]`: Verified with passing automated unit/integration tests  
- `[CONFIGURED]`: Environment and infrastructure templates prepared  
- `[REQUIRES CREDENTIALS]`: Blocked on live third-party credentials or paid cloud setup  
- `[NOT VERIFIED]`: Requires production infrastructure or live human sign-off  

---

## 1. Security & Compliance Checklist

- [x] `[IMPLEMENTED] [TESTED]` **Single-Use OTP & Replay Prevention:** Verified OTP cannot be reused after initial authentication.
- [x] `[IMPLEMENTED] [TESTED]` **Brute-Force Protection:** Rate-limited OTP attempts (max 5 per OTP lifecycle; lockout enforced).
- [x] `[IMPLEMENTED] [TESTED]` **Insecure Direct Object Reference (IDOR) Hardening:**
  - [x] User cannot view, debit, or topup another user's wallet (`/v1/wallet/{id}/*`).
  - [x] User cannot cancel rides belonging to another user (`/v1/bookings/{id}/cancel`).
- [x] `[IMPLEMENTED] [TESTED]` **CORS Origins Whitelist:** Explicit parsing of `ALLOWED_ORIGINS` with credentials support.
- [x] `[IMPLEMENTED] [TESTED]` **HTTP Security Headers:** Injected `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy`.
- [x] `[IMPLEMENTED] [TESTED]` **Razorpay Payment HMAC Verification:** Cryptographic SHA256 signature verification on `/v1/payment/razorpay/verify` and webhooks.
- [ ] `[REQUIRES CREDENTIALS]` **Live Payment Gateway Credentials:** Razorpay live merchant keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
- [ ] `[REQUIRES CREDENTIALS]` **Production SMS Gateway:** Real carrier gateway (Twilio, AWS SNS, or Gupshup) for SMS OTP delivery.

---

## 2. Database Reliability & Resilience

- [x] `[IMPLEMENTED] [TESTED]` **SQLite WAL Mode & Concurrency:** Write-Ahead Logging active for non-blocking concurrent reads and writes.
- [x] `[IMPLEMENTED] [TESTED]` **Relational Integrity & Busy Timeout:** `PRAGMA foreign_keys = ON;` and `PRAGMA busy_timeout = 5000;`.
- [x] `[IMPLEMENTED] [TESTED]` **Active Database Health Ping:** `/health` and `/v1/health` perform live query test, returning 503 on database disruption.
- [x] `[IMPLEMENTED] [TESTED]` **Automated Online Backup Utility:** Point-in-time snapshot with `PRAGMA integrity_check` and automated retention pruning.
- [x] `[IMPLEMENTED] [TESTED]` **Automated Restore Verification Utility:** Pre-restore safety snapshots and dry-run verification.
- [ ] `[NOT VERIFIED]` **Off-Site Backup Replication:** Automated shipping of `.db` snapshots to off-site cloud storage (AWS S3, GCP Cloud Storage).

---

## 3. Frontend & Client Performance

- [x] `[IMPLEMENTED] [TESTED]` **Vite Chunk Splitting:** Rollup `manualChunks` function split bundle into `react-vendor`, `map-vendor`, `ui-vendor`, and `index`. All chunks < 410 kB.
- [x] `[IMPLEMENTED] [TESTED]` **Zero Bundle Warnings:** Eliminated Vite >500 kB build warnings.
- [x] `[IMPLEMENTED] [TESTED]` **Dynamic API URL Resolution:** Unified `VITE_API_BASE_URL` fallback across all components (`App.jsx`, `RiderHome.jsx`, `RapidoHomeScreen.jsx`, `LiveAPI.jsx`).
- [x] `[IMPLEMENTED] [TESTED]` **Clean Linter Status:** 0 errors, 0 warnings across 73 frontend files using Oxlint.
- [x] `[IMPLEMENTED] [TESTED]` **Frontend Unit Tests:** 27 of 27 unit tests passing.

---

## 4. CI/CD & Deployment Pipeline

- [x] `[IMPLEMENTED] [CONFIGURED]` **GitHub Actions Workflow:** Multi-Python (3.10, 3.11, 3.12) backend test matrix with automated backup utility verification.
- [x] `[IMPLEMENTED] [CONFIGURED]` **Least-Privilege CI Permissions:** Explicit `permissions: contents: read` configured on CI runner.
- [x] `[IMPLEMENTED] [CONFIGURED]` **Multi-Stage Docker Containers:** Non-root user in `Dockerfile.backend`; Nginx SPA compression and routing in `Dockerfile.frontend`.
- [x] `[IMPLEMENTED] [CONFIGURED]` **Docker Compose Stack:** Dynamic environment interpolation with default fallbacks.
- [x] `[IMPLEMENTED] [CONFIGURED]` **Environment Templates:** `.env.example` templates created for root, backend, and dashboard.

---

## 5. Operations & Incident Response

- [x] `[IMPLEMENTED]` **Request Correlation Tracking:** `X-Request-ID` and `X-Response-Time` headers attached to every HTTP response.
- [x] `[IMPLEMENTED]` **Operational Telemetry:** `/v1/telemetry/stats` endpoint returning active drivers, bookings, users, and transaction counts.
- [x] `[IMPLEMENTED]` **Operational Runbooks:** Deployment Guide, Disaster Recovery Runbook, Incident Response Guide.
- [ ] `[REQUIRES CREDENTIALS]` **External Monitoring Integration:** Sentry DSN configuration for exception aggregation.
- [ ] `[NOT VERIFIED]` **Uptime Alerting:** UptimeRobot / Pingdom synthetic probes configured against `/health`.
