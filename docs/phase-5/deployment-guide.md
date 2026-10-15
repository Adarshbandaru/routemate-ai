# RouteMate AI — Production Deployment Guide

**Version:** 1.0.0-phase5  
**Audience:** DevOps Engineers, Platform Administrators, Site Reliability Engineers

---

## 1. System Overview & Architecture

RouteMate AI is architected as a modular, container-ready shared-mobility platform:

```
                            [ Client Web / Mobile Browser ]
                                           │
                                     HTTPS │ (TLS 1.3)
                                           ▼
                            [ Nginx Reverse Proxy / CDN ]
                             (Static SPA Assets & Assets)
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                             │
               HTTP │ /v1/*                                  WSS  │ /socket.io/*
                    ▼                                             ▼
          [ FastAPI Backend API ]                     [ Socket.io Server ]
          (Uvicorn Worker Processes)                  (Real-time Location/Chat)
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           │ SQLite WAL Mode (busy_timeout=5000ms)
                                           ▼
                                [ routemate.db Persistent Volume ]
                                           │
                                           ▼
                                [ Daily Automated Backups ]
```

### Components
1. **Frontend:** React 19 SPA built with Vite and Rolldown chunk splitting, served via Nginx with gzip compression and cache headers.
2. **Backend:** Python 3.11+ FastAPI service with sliding-window rate limiting, request correlation tracking (`X-Request-ID`), and OWASP security headers.
3. **Real-time Layer:** Python-SocketIO server mounting bidirectional channels for driver location telemetry and in-ride dispatch chat.
4. **Data Persistence:** SQLite 3 WAL (Write-Ahead Logging) database with 5000ms busy timeout, foreign key enforcement, and automated point-in-time snapshot backup utilities.

---

## 2. Infrastructure & Hosting Options

### Option A: Multi-Container Docker Compose (Recommended)
Best for single-node VM deployments (AWS EC2, GCP Compute Engine, DigitalOcean Droplet, or Hetzner).

#### Prerequisites:
- Docker 24.0+ and Docker Compose v2.20+
- Minimum 2 vCPU, 2 GB RAM, 20 GB SSD storage.
- A registered domain name with DNS A records pointing to the host IP.

#### Deployment Steps:
1. Clone the repository and enter the directory:
   ```bash
   git clone https://github.com/Adarshbandaru/routemate-ai.git
   cd routemate-ai
   ```
2. Create and configure production environment:
   ```bash
   cp .env.example .env
   # Edit .env with strong secrets:
   # ROUTEMATE_ENV=production
   # JWT_SECRET=<secure_random_hex_64_chars>
   # ALLOWED_ORIGINS=https://routemate.ai,https://app.routemate.ai
   # RAZORPAY_KEY_ID=<live_razorpay_key_id>
   # RAZORPAY_KEY_SECRET=<live_razorpay_key_secret>
   ```
3. Build and launch services in detached mode:
   ```bash
   docker compose up -d --build
   ```
4. Verify service health:
   ```bash
   curl -f http://localhost:8000/health
   curl -f http://localhost/
   ```

### Option B: Cloud Split Deployment (GitHub Pages + Managed Backend)
- **Frontend:** Hosted statically on GitHub Pages (`https://adarshbandaru.github.io/routemate-ai`).
- **Backend:** Hosted on a container runtime (AWS ECS Fargate, GCP Cloud Run, or Render).
- **Environment Binding:** In GitHub repository secrets, set `VITE_API_BASE_URL=https://api.routemate.ai` and `VITE_SOCKET_URL=https://api.routemate.ai`.

---

## 3. Environment Variables Reference

| Variable | Environment | Default | Description | Required in Prod |
|---|---|---|---|:---:|
| `ROUTEMATE_ENV` | Backend | `development` | Environment mode (`development`, `staging`, `production`) | **YES** |
| `JWT_SECRET` | Backend | `routemate_production_secret...` | 256-bit secret key for HMAC-SHA256 JWT signing | **YES** |
| `ALLOWED_ORIGINS` | Backend | Localhost origins | Comma-delimited list of authorized CORS origins | **YES** |
| `SESSION_EXPIRY_SECONDS` | Backend | `86400` | Session duration in seconds (24 hours) | No |
| `OTP_EXPIRY_SECONDS` | Backend | `600` | OTP validity window in seconds (10 minutes) | No |
| `ROUTEMATE_ALLOW_DEV_OTP` | Backend | `false` in prod | Enables sandbox `123456` OTP for designated test numbers | **MUST BE FALSE** |
| `RAZORPAY_KEY_ID` | Backend | `rzp_test_...` | Razorpay merchant API key ID | When payments enabled |
| `RAZORPAY_KEY_SECRET` | Backend | `routemate_rzp_...` | Razorpay merchant API secret key | When payments enabled |
| `RAZORPAY_WEBHOOK_SECRET` | Backend | `routemate_rzp_...` | Secret for HMAC signature verification of webhooks | When payments enabled |
| `VITE_API_BASE_URL` | Frontend | `http://127.0.0.1:8000` | Public URL of the FastAPI backend API | **YES** |
| `VITE_SOCKET_URL` | Frontend | `http://localhost:8000` | Public URL of Socket.io real-time server | **YES** |

---

## 4. HTTPS, TLS, and Reverse Proxy Configuration

In production, terminate TLS at Nginx or a cloud load balancer (e.g., Cloudflare, AWS ALB):

```nginx
server {
    listen 443 ssl http2;
    server_name api.routemate.ai;

    ssl_certificate /etc/letsencrypt/live/api.routemate.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.routemate.ai/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Backend API proxy
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.io WebSocket proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 5. Rollback Strategy

1. **Application Container Rollback:**
   ```bash
   # Revert to previous release tag
   git checkout tags/v1.0.0
   docker compose up -d --build
   ```
2. **Database State Rollback:**
   If a corruption or failure occurs, restore the most recent verified point-in-time snapshot:
   ```bash
   python -m backend.scripts.restore_db backend/backups/routemate_backup_YYYYMMDD_HHMMSS.db
   ```
3. **Frontend CDN Cache Purge:**
   Trigger invalidation on Cloudflare / CloudFront for index.html:
   ```bash
   aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/index.html"
   ```
