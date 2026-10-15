# RouteMate AI — Codebase Modularization Plan

## 1. Objectives & Principles

This plan establishes a team-friendly, maintainable, modular structure for RouteMate AI without altering existing functionality or introducing premature Phase 3 features.

### Core Principles
1. **Feature-Oriented Boundaries**: Changes to driver logic should not touch rider controllers; changes to research views should not affect product booking flows.
2. **Explicit Interfaces**: Routes handle HTTP/WebSocket concerns; services handle business logic; repositories handle database access.
3. **100% Backward Compatibility**: Public API contracts, URL hash routes, CLI commands, and GitHub Actions CI/Pages workflows must remain intact.
4. **Controlled, Atomic Steps**: Every step is verifiable with executable tests (`py -m unittest discover -s tests -v`, `npm test`, `npx oxlint`, `npm run build`).
5. **Preservation of Pre-existing Work**: No Git resets, commits, pushes, or deletions of working code.

---

## 2. Proposed Architecture & Directory Structure

### 2.1 Backend Target Structure (`backend/`)

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI instance, CORS, Socket.io ASGI mount, router inclusion
│   ├── core/                      # Shared infrastructure & configuration
│   │   ├── __init__.py
│   │   ├── config.py              # Environment variables, JWT settings, database path
│   │   ├── database.py            # SQLite connection factory & table creation
│   │   └── security.py            # JWT token encoding, decoding & authentication helpers
│   ├── schemas/                   # Pydantic request & response validation models
│   │   ├── __init__.py
│   │   ├── auth.py                # OTP request, OTP verify, Register partner
│   │   ├── rider.py               # Confirm ride, booking response, route search
│   │   ├── driver.py              # Driver status, location, ride actions, earnings
│   │   └── scenario.py            # Research scenarios & match proxies
│   ├── repositories/              # Direct SQL queries & database operations
│   │   ├── __init__.py
│   │   ├── user_repo.py           # Users, sessions, addresses
│   │   ├── route_repo.py          # Route catalog & landmark search
│   │   ├── booking_repo.py        # Booking lifecycle persistence
│   │   └── driver_repo.py         # Driver sessions, location history, earnings ledger
│   ├── services/                  # Domain business logic
│   │   ├── __init__.py
│   │   ├── auth_service.py        # Phone OTP issuance & JWT session creation
│   │   ├── booking_service.py     # Booking confirmation & cancellation
│   │   └── driver_service.py      # Status toggles, ride dispatch response & earnings calculation
│   └── api/                       # HTTP routes & WebSocket handlers
│       ├── __init__.py
│       ├── websockets.py          # Socket.io event emitters & handlers
│       └── routes/
│           ├── __init__.py
│           ├── auth.py            # /v1/auth/...
│           ├── routes.py          # /v1/routes/...
│           ├── bookings.py        # /v1/bookings/... & /v1/confirm-ride
│           ├── driver.py          # /v1/driver/...
│           └── scenarios.py       # /v1/scenarios/... & /v1/match
├── api.py                         # Backward-compatible entry point forwarding to app.main
├── db.py                          # Backward-compatible forwarding module
├── auth.py                        # Backward-compatible forwarding module
├── requirements.txt
├── routemate.db
└── scenarios/
```

### 2.2 Frontend Target Structure (`dashboard/src/`)

```
dashboard/src/
├── features/
│   ├── rider/                     # Phase 1 Rider Consumer Experience
│   │   ├── RiderHome.jsx
│   │   ├── RouteCard.jsx
│   │   ├── DefaultRoutesSection.jsx
│   │   ├── LocationAutocomplete.jsx
│   │   ├── AuthModal.jsx
│   │   └── MyBookingsDrawer.jsx
│   ├── driver/                    # Phase 2 Driver Experience
│   │   ├── DriverConsole.jsx
│   │   ├── DriverAuth.jsx
│   │   ├── DriverDashboard.jsx
│   │   ├── DriverRequestAlert.jsx
│   │   ├── DriverActiveRide.jsx
│   │   ├── DriverEarnings.jsx
│   │   ├── DriverProfile.jsx
│   │   ├── useSocket.js
│   │   └── useLocationTracker.js
│   ├── research/                  # Enterprise Intelligence & Benchmark Screens
│   │   ├── GuidedDemo.jsx
│   │   ├── MatchPlayground.jsx
│   │   ├── BatchAssignment.jsx
│   │   ├── FleetRebalanceView.jsx
│   │   ├── ExperimentExplorer.jsx
│   │   ├── LiveAPI.jsx
│   │   ├── ArchitectureView.jsx
│   │   └── FeasibilityMatrix.jsx
│   └── maps/                      # Map Renderers & Geographic Controls
│       ├── RouteMap.jsx
│       └── MapPanel.jsx
├── components/
│   ├── common/                    # Shared Shell & Universal UI Controls
│   │   ├── AppShell.jsx
│   │   ├── ErrorBoundary.jsx
│   │   ├── CommandPalette.jsx
│   │   ├── RideChatModal.jsx
│   │   ├── SimulationClockBar.jsx
│   │   └── ...
│   └── (re-export bridges for backward compatibility)
├── services/                      # API client (apiService.js)
├── data/                          # Seed data & geographic landmarks
├── motion/                        # Discrete simulation clock engine
├── provenance/                    # Provenance ledger
├── utils/                         # URL hash routing & tile providers
├── styles/                        # CSS modules & design tokens
└── tests/                         # Node test runner regression suite
```

---

## 3. Mapping: Current to Proposed Files

### 3.1 Backend Mapping

| Current Location | Proposed Modular Location | Responsibility |
|---|---|---|
| `backend/api.py` (lines 1–50) | `backend/app/main.py` | FastAPI app instance, CORS middleware, Socket.io mount |
| `backend/api.py` (schemas) | `backend/app/schemas/*.py` | Pydantic validation models |
| `backend/api.py` (auth routes) | `backend/app/api/routes/auth.py` | OTP and profile HTTP endpoints |
| `backend/api.py` (route endpoints) | `backend/app/api/routes/routes.py` | Route catalog & corridor search |
| `backend/api.py` (booking endpoints) | `backend/app/api/routes/bookings.py` | Confirm ride & booking queries |
| `backend/api.py` (driver endpoints) | `backend/app/api/routes/driver.py` | Driver status, active ride, earnings |
| `backend/api.py` (scenarios) | `backend/app/api/routes/scenarios.py` | Research scenario list & proxy match |
| `backend/api.py` (socketio) | `backend/app/api/websockets.py` | Socket.io real-time communication |
| `backend/auth.py` | `backend/app/core/security.py` & `backend/app/services/auth_service.py` | Token generation, verification, and session state |
| `backend/db.py` | `backend/app/core/database.py` & `backend/app/repositories/*.py` | SQLite connection, table DDL, and queries |

### 3.2 Frontend Mapping

| Current Location | Proposed Modular Location | Backward-Compatibility Bridge |
|---|---|---|
| `dashboard/src/components/RiderHome.jsx` | `dashboard/src/features/rider/RiderHome.jsx` | `src/components/RiderHome.jsx` re-exports |
| `dashboard/src/components/DriverConsole.jsx` | `dashboard/src/features/driver/DriverConsole.jsx` | `src/components/DriverConsole.jsx` re-exports |
| `dashboard/src/components/driver/*` | `dashboard/src/features/driver/*` | `src/components/driver/*` re-exports |
| `dashboard/src/components/GuidedDemo.jsx` | `dashboard/src/features/research/GuidedDemo.jsx` | `src/components/GuidedDemo.jsx` re-exports |
| `dashboard/src/components/MatchPlayground.jsx` | `dashboard/src/features/research/MatchPlayground.jsx` | `src/components/MatchPlayground.jsx` re-exports |
| `dashboard/src/components/BatchAssignment.jsx` | `dashboard/src/features/research/BatchAssignment.jsx` | `src/components/BatchAssignment.jsx` re-exports |
| `dashboard/src/components/FleetRebalanceView.jsx`| `dashboard/src/features/research/FleetRebalanceView.jsx` | `src/components/FleetRebalanceView.jsx` re-exports |
| `dashboard/src/components/ExperimentExplorer.jsx`| `dashboard/src/features/research/ExperimentExplorer.jsx` | `src/components/ExperimentExplorer.jsx` re-exports |
| `dashboard/src/components/LiveAPI.jsx` | `dashboard/src/features/research/LiveAPI.jsx` | `src/components/LiveAPI.jsx` re-exports |
| `dashboard/src/components/ArchitectureView.jsx` | `dashboard/src/features/research/ArchitectureView.jsx` | `src/components/ArchitectureView.jsx` re-exports |
| `dashboard/src/components/RouteMap.jsx` | `dashboard/src/features/maps/RouteMap.jsx` | `src/components/RouteMap.jsx` re-exports |
| `dashboard/src/components/MapPanel.jsx` | `dashboard/src/features/maps/MapPanel.jsx` | `src/components/MapPanel.jsx` re-exports |

---

## 4. Dependencies Between Modules & Dependency Rules

1. **Unidirectional Control Flow**:
   `Routes (HTTP / WS)` $\rightarrow$ `Services (Business Logic)` $\rightarrow$ `Repositories (Data Access)` $\rightarrow$ `Database`.
2. **Schemas Are Shared Inputs/Outputs**:
   `schemas/` are imported by routes and services; repositories return domain dictionaries or models.
3. **Core Holds No Feature Logic**:
   `core/` provides configuration, security primitives, and database connections. It never imports from `api/`, `services/`, or `repositories/`.
4. **No Circular Imports**:
   Cross-feature imports (e.g. driver service referencing booking repository) must be explicit and strictly horizontal, never cyclical.
5. **Frontend Feature Isolation**:
   `features/rider/` does not import internal implementation details from `features/driver/`. Common dialogs (e.g. `RideChatModal.jsx`) reside in `components/common/`.

---

## 5. Risk Assessment & Mitigation Strategies

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Broken import paths in backend startup** | Backend fails to start with `ImportError` | Maintain compatibility re-exports in `backend/api.py`, `backend/db.py`, and `backend/auth.py`. |
| **Broken Socket.io ASGI mounting** | Real-time events fail to reach connected drivers/riders | Retain exact ASGI app hierarchy: `socket_app = socketio.ASGIApp(sio, other_asgi_app=app)`. |
| **Frontend build breakages from file moves** | GitHub Pages deployment fails (`npm run build`) | Add re-export shims at all original component paths so existing consumers continue to resolve smoothly. |
| **Regression in 158 research tests** | CI fails on `python -m unittest discover -s tests -v` | Core research package (`src/routemate/`) and its tests (`tests/`) remain completely untouched during backend modularization. |
| **State regression in hash routing** | Deep links (`#/ride`, `#/driver/dashboard`) fail | `urlState.js` and `App.jsx` maintain exact valid routes and fallback behaviors. |

---

## 6. Migration Sequence

1. **Step 1: Backend Infrastructure & Core**
   - Create `backend/app/core/config.py`, `backend/app/core/database.py`, `backend/app/core/security.py`.
2. **Step 2: Backend Schemas**
   - Create `backend/app/schemas/` with modular models for auth, rider, driver, and scenarios.
3. **Step 3: Backend Repositories**
   - Extract data access into `user_repo.py`, `route_repo.py`, `booking_repo.py`, `driver_repo.py`.
4. **Step 4: Backend Services**
   - Extract domain logic into `auth_service.py`, `booking_service.py`, `driver_service.py`.
5. **Step 5: Backend API Routers & Socket.io**
   - Create modular routers under `backend/app/api/routes/` and WebSocket handler in `backend/app/api/websockets.py`.
   - Wire top-level FastAPI application in `backend/app/main.py`.
   - Update `backend/api.py`, `backend/db.py`, and `backend/auth.py` as transparent forwarding bridges.
6. **Step 6: Frontend Feature Reorganization**
   - Move feature components into `dashboard/src/features/{rider, driver, research, maps}`.
   - Place backward-compatible re-export stubs in `dashboard/src/components/`.
   - Update `App.jsx` imports.
7. **Step 7: Verification & Standards Documentation**
   - Create `CONTRIBUTING.md` and module ownership map.
   - Run `py -m unittest discover -s tests -v` (verify 158/158 pass).
   - Run `npx oxlint` (verify 0 warnings, 0 errors).
   - Run `npm test` (verify 21/21 pass).
   - Run `npm run build` (verify bundle builds cleanly).

---

## 7. Verification Commands

```bash
# Backend verification
py -m unittest discover -s tests -v
py -c "from app.main import app, socket_app; print('Backend App Import: OK')"

# Frontend verification (in dashboard/)
npx oxlint
npm test
npm run build
```
