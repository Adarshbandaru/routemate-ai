# RouteMate AI — Incident Response & Triage Runbook

**Version:** 1.0.0-phase5  
**Audience:** Site Reliability Engineers, On-Call Engineers, Backend Developers  
**Classification:** Operational Guide  

---

## 1. Incident Severity Levels (SLA Matrix)

| Severity | Definition | Examples | Response Time | Update Frequency |
|---|---|---|:---:|:---:|
| **SEV-1 (Critical)** | Core booking, matching, or payment outage affecting all users. | API returning 500/503 errors; database down; payment signatures failing globally. | < 15 mins | Every 30 mins |
| **SEV-2 (High)** | Degradation of critical feature with workaround, or isolated user subset. | OTP SMS delays; WebSocket reconnect loops; single vehicle tracking frozen. | < 30 mins | Every 1 hour |
| **SEV-3 (Medium)** | Minor feature bug with no direct revenue impact. | Map icon distortion; receipt PDF styling glitch; admin telemetry chart delay. | < 4 hours | Daily |
| **SEV-4 (Low)** | Cosmetic or documentation issue. | Typo in error message; minor theme color inconsistency. | Next sprint | As needed |

---

## 2. Common Incident Playbooks

### Playbook 1: Failed Bookings / Dispatch Stoppage
- **Symptoms:** Riders see "Unable to confirm ride" or HTTP 500 errors on `POST /v1/bookings`.
- **Diagnostic Steps:**
  1. Inspect backend logs for correlated Request IDs:
     ```bash
     grep "req_" backend/logs/routemate.log | grep -E "ERROR|CRITICAL"
     ```
  2. Verify database health:
     ```bash
     curl -i http://localhost:8000/v1/health
     ```
  3. Check if database connection pool is saturated or locked:
     ```bash
     sqlite3 backend/routemate.db "PRAGMA journal_mode; PRAGMA busy_timeout;"
     ```
  4. Ensure active driver records exist in the matching corridor:
     ```bash
     sqlite3 backend/routemate.db "SELECT id, name, available FROM drivers WHERE available = 1;"
     ```
- **Remediation:** If the database is locked, restart the backend service container. If no drivers are available, trigger automated fleet rebalancing.

### Playbook 2: Payment Discrepancies & Razorpay Webhook Failures
- **Symptoms:** Rider reports deduction but booking status remains `PENDING`.
- **Diagnostic Steps:**
  1. Query transaction by booking ID or Razorpay Order ID:
     ```bash
     sqlite3 backend/routemate.db "SELECT * FROM transactions WHERE booking_id = 'bk_xxx' OR razorpay_order_id = 'order_xxx';"
     ```
  2. Verify webhook signature header in logs (`X-Razorpay-Signature`).
  3. Check Razorpay Merchant Dashboard for event delivery status (`payment.captured`).
- **Remediation:**
  - If payment was captured by Razorpay, manually trigger authoritative reconciliation:
    ```bash
    curl -X POST http://localhost:8000/v1/payment/razorpay/verify \
      -H "Content-Type: application/json" \
      -d '{"booking_id":"bk_xxx","razorpay_order_id":"order_xxx","razorpay_payment_id":"pay_xxx","razorpay_signature":"sig_xxx"}'
    ```

### Playbook 3: API Rate Limiting Storm (HTTP 429)
- **Symptoms:** Legitimate users report `Rate limit exceeded` (HTTP 429).
- **Diagnostic Steps:**
  1. Inspect response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.
  2. Identify calling IP address causing volume spike.
  3. Check if behind a corporate proxy or shared NAT gateway.
- **Remediation:** If a legitimate corporate IP is being throttled, adjust `general_limit` or `sensitive_limit` in `.env` / middleware configuration.

---

## 3. Communication & Post-Mortem Template

Every SEV-1 and SEV-2 incident requires a post-mortem document completed within 48 hours containing:
1. **Summary:** 2-sentence executive summary of user impact and duration.
2. **Impact Metrics:** Total affected riders, failed bookings, lost revenue.
3. **Timeline:** UTC chronological sequence from first trigger to detection, triage, fix, and resolution.
4. **Root Cause Analysis (5 Whys):** Deep mechanical cause.
5. **Action Items:** Preventive engineering tickets with assigned owners and due dates.
