# Contributing to RouteMate AI

Welcome to RouteMate AI! This guide establishes architectural boundaries, development workflows, testing requirements, and coding conventions to ensure any teammate can modify or extend one feature safely without breaking other parts of the platform.

---

## 1. Architecture Overview & Module Ownership

RouteMate AI is architected into clear functional boundaries:

```
routemate-ai/
├── backend/app/                   # FastAPI + Socket.io Mobility Service
│   ├── api/routes/                # HTTP controllers (auth, routes, bookings, driver, scenarios)
│   ├── api/websockets.py          # Socket.io real-time event handlers
│   ├── schemas/                   # Pydantic input/output validation contracts
│   ├── services/                  # Domain business logic
│   ├── repositories/              # Database access layer (SQLite queries)
│   └── core/                      # Config, security (JWT/OTP), database connection
├── dashboard/src/                 # React 19 + Vite Frontend
│   ├── features/rider/            # Consumer ride search, route selection, and booking
│   ├── features/driver/           # Driver authentication, console, active ride, earnings
│   ├── features/research/         # Enterprise intelligence, batching, rebalancing, benchmarks
│   ├── features/maps/             # Leaflet mapping and route rendering
│   └── components/common/         # Reusable design system controls (AppShell, modals, drawers)
└── src/routemate/                 # Core research algorithms and mathematical models
```

### Module Ownership Map

| Domain | Responsible Directory | Key Files | What Lives Here |
|---|---|---|---|
| **Rider Experience** | `dashboard/src/features/rider/`<br>`backend/app/api/routes/bookings.py` | `RiderHome.jsx`<br>`booking_service.py`<br>`booking_repo.py` | Consumer search, corridor routes, ride confirmation, trip details |
| **Driver Experience** | `dashboard/src/features/driver/`<br>`backend/app/api/routes/driver.py` | `DriverConsole.jsx`<br>`DriverDashboard.jsx`<br>`driver_service.py`<br>`driver_repo.py` | Driver OTP login, duty toggle, 10s incoming request alert, active ride navigation, earnings ledger |
| **Real-Time WebSockets**| `backend/app/api/websockets.py`<br>`dashboard/src/features/driver/useSocket.js` | `websockets.py`<br>`useSocket.js` | Real-time driver-rider coordination, location telemetry, in-app messaging |
| **Research Intelligence** | `dashboard/src/features/research/`<br>`backend/app/api/routes/scenarios.py` | `BatchAssignment.jsx`<br>`FleetRebalanceView.jsx`<br>`ExperimentExplorer.jsx` | Benchmarks, greedy/optimal solvers, fleet rebalancing, sensitivity studies |
| **Core Research Library** | `src/routemate/` | `assignment.py`<br>`routing.py`<br>`hybrid_pruning.py` | Deterministic geometric routing, graph Dijkstra, logistic rankers, recourse models |

---

## 2. Where Does My Code Belong?

### Adding a New Backend Endpoint
1. **Define Schema**: Add request and response Pydantic models in `backend/app/schemas/`.
2. **Implement Business Logic**: Put calculation, pricing, or orchestration logic in `backend/app/services/`. Do not put heavy business logic inside route controllers.
3. **Database Access**: If database queries are needed, add a method to the relevant repository in `backend/app/repositories/`. Never execute raw SQL queries inside route functions.
4. **Register Route**: Add the endpoint to the corresponding file in `backend/app/api/routes/` and tag it cleanly.

### Adding a New Frontend Feature
1. **Identify Feature Domain**:
   - Rider consumer flow $\rightarrow$ `dashboard/src/features/rider/`
   - Driver flow $\rightarrow$ `dashboard/src/features/driver/`
   - Research dashboard / simulation $\rightarrow$ `dashboard/src/features/research/`
   - Geospatial rendering $\rightarrow$ `dashboard/src/features/maps/`
2. **Use Shared Design System**: Reuse controls from `dashboard/src/components/common/` (`AppShell`, `ErrorBoundary`, `RideChatModal`).
3. **API Integration**: Add endpoint methods to `dashboard/src/services/apiService.js` with offline fallback mocks for frictionless demo testing.
4. **Deep-Link Hash Routing**: If adding a new screen, declare the route in `dashboard/src/utils/urlState.js` under `VALID_ROUTES` and wire it in `dashboard/src/App.jsx`.

---

## 3. Database Schema Changes & Migrations

- The database schema is defined in `backend/app/core/database.py`.
- **Database Engine**: Uses SQLite (`backend/routemate.db`) by default for self-contained local development, with a documented path to PostgreSQL via connection URI.
- **Rules for Schema Evolution**:
  - Always use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
  - When altering existing tables, write idempotent column migration checks (e.g. `PRAGMA table_info` before `ALTER TABLE ADD COLUMN`).
  - **Phase 3 Restriction**: Do not create future Phase 3 tables (payments, wallet balances, ratings engine) until Phase 3 officially begins.

---

## 4. Local Development Setup

### Backend (Python + FastAPI)
```bash
# 1. From repository root, install dependencies:
pip install -r backend/requirements.txt
pip install -e .

# 2. Run backend development server:
py backend/api.py
# Server runs at http://localhost:8000
# OpenAPI interactive docs available at http://localhost:8000/docs
```

### Frontend (React 19 + Vite)
```bash
# 1. Navigate to dashboard:
cd dashboard

# 2. Install dependencies:
npm install

# 3. Start local development server:
npm run dev
# Dashboard available at http://localhost:5173
```

---

## 5. Environment Variables & Secret Hygiene

- **NEVER** commit `.env` files, database files (`.db`), or private API keys to Git.
- Standard environment variables:
  ```env
  # Backend
  JWT_SECRET=your_secure_random_key_here
  DATABASE_URL=sqlite:///backend/routemate.db

  # Frontend (dashboard/.env)
  VITE_API_BASE_URL=http://localhost:8000/v1
  VITE_SOCKET_URL=http://localhost:8000
  ```

---

## 6. Verification & Quality Gates

Before submitting any Pull Request or asking for review, run all quality gates:

```bash
# 1. Backend Python Unit Tests (158 tests)
py -m unittest discover -s tests -v

# 2. Frontend Linting (0 warnings, 0 errors required)
cd dashboard
npx oxlint

# 3. Frontend Unit Tests (21 tests)
npm test

# 4. Frontend Production Build (GitHub Pages compatibility)
npm run build
```

---

## 7. Git Workflow & Review Safety

1. **Feature Branches**: Branch from `main` using descriptive names: `feat/driver-profile`, `fix/route-polyline-bounds`.
2. **Commit Policy**:
   - Keep commits focused and atomic.
   - Do not commit generated build outputs (`dashboard/dist/`), cache directories (`__pycache__/`, `.pytest_cache/`), or active databases (`routemate.db`).
3. **No Unapproved Commits**: In pair-programming agent workflows, the assistant must **NEVER** run `git commit` or `git push` without explicit user sign-off.
