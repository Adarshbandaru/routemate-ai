# RouteMate AI — Current Architecture State & Audit

## 1. Executive Summary

RouteMate AI is a hybrid repository comprising two intertwined domains:
1. **Research & Algorithmic Core**: Python package (`src/routemate`) accompanied by 24 test suites (`tests/`), evaluating shared-mobility dispatching, multi-rider pooling, counterfactual recourse, robust dispatch, and fleet rebalancing along with an experimental benchmark suite (Experiments 001–014).
2. **Product Application**:
   - **Backend**: FastAPI service (`backend/`) supporting real-time dispatch, rider booking, driver console, Socket.io event communication, and SQLite persistence (`backend/routemate.db`).
   - **Frontend**: Single-page application built on React 19 and Vite (`dashboard/`), providing both an enterprise research intelligence workbench and mobile-responsive consumer interfaces for riders (`RiderHome`) and drivers (`DriverConsole`, `DriverDashboard`, `DriverActiveRide`).

This document records the exact state of the codebase as of Phase 0 audit before modularization.

---

## 2. Repository Layout & Component Inventory

```
routemate-ai/
├── backend/                       # FastAPI + Socket.io + SQLite service
│   ├── api.py                    # 1,040-line monolithic application file
│   ├── auth.py                   # In-memory OTP + JWT authentication
│   ├── db.py                     # SQLite DDL schema (10 tables) & seed data
│   ├── requirements.txt          # Python dependencies (fastapi, uvicorn, pyjwt, python-socketio)
│   ├── routemate.db              # SQLite database file
│   └── scenarios/                # JSON scenarios for research demonstration
├── dashboard/                     # React 19 + Vite frontend application
│   ├── src/
│   │   ├── components/           # Flat component directory (14 views + common/ + driver/)
│   │   │   ├── common/           # Shared UI (AppShell, drawers, modals, controls)
│   │   │   ├── driver/           # Phase 2 driver components & hooks
│   │   │   ├── RiderHome.jsx     # Phase 1 rider booking interface (45 KB)
│   │   │   ├── DriverConsole.jsx # Monolithic driver console (43 KB)
│   │   │   └── ...               # Research screens (Batch, Staging, Experiments, Playground)
│   │   ├── services/             # apiService.js (HTTP client with offline fallbacks)
│   │   ├── data/                 # Landmarks & seed scenarios
│   │   ├── motion/               # simulationClock.js (discrete simulation engine)
│   │   ├── provenance/           # provenanceLedger.js
│   │   ├── utils/                # urlState.js, mapTiles.js
│   │   ├── tests/                # Node test runner suite (4 test files, 21 tests)
│   │   ├── App.jsx               # Top-level hash routing & shell assembly
│   │   ├── data.js               # Legacy 56 KB data & scenario bundle
│   │   └── index.css             # Monolithic 5,100-line stylesheet (104 KB)
├── src/routemate/                 # Core Python research library (32 modules)
├── tests/                         # Python unittest test suite (24 test modules, 158 tests)
├── research/                      # Research paper drafts, figures, protocols
├── experiments/                   # Experiment artifacts & benchmarks
└── .github/workflows/             # GitHub Actions CI & Pages deployment
```

---

## 3. Detailed Feature-to-File Mapping

| Feature Domain | Backend Files | Frontend Files | Core Library Files | Test Files | Status |
|---|---|---|---|---|---|
| **Rider Experience (Phase 1)** | `backend/api.py`<br>`backend/db.py`<br>`backend/auth.py` | `dashboard/src/components/RiderHome.jsx`<br>`dashboard/src/components/common/RouteCard.jsx`<br>`dashboard/src/components/common/LocationAutocomplete.jsx`<br>`dashboard/src/components/common/AuthModal.jsx`<br>`dashboard/src/components/common/MyBookingsDrawer.jsx` | N/A | `dashboard/src/tests/punjabCorridor.test.js` | Fully Functional |
| **Driver Experience (Phase 2)** | `backend/api.py`<br>`backend/db.py`<br>`backend/auth.py` | `dashboard/src/components/DriverConsole.jsx`<br>`dashboard/src/components/driver/DriverAuth.jsx`<br>`dashboard/src/components/driver/DriverDashboard.jsx`<br>`dashboard/src/components/driver/DriverRequestAlert.jsx`<br>`dashboard/src/components/driver/DriverActiveRide.jsx`<br>`dashboard/src/components/driver/DriverEarnings.jsx`<br>`dashboard/src/components/driver/DriverProfile.jsx`<br>`dashboard/src/components/driver/useSocket.js`<br>`dashboard/src/components/driver/useLocationTracker.js` | N/A | `dashboard/src/tests/urlState.test.js` | Fully Functional |
| **Real-time Socket.io Sync** | `backend/api.py` (sio mount & event handlers) | `dashboard/src/components/driver/useSocket.js`<br>`dashboard/src/components/common/RideChatModal.jsx` | N/A | Manual / Browser Verified | Functional |
| **Dispatch & Matching Engine** | `backend/api.py` (`/v1/match`) | `dashboard/src/components/MatchPlayground.jsx`<br>`dashboard/src/components/BatchAssignment.jsx` | `src/routemate/assignment.py`<br>`src/routemate/candidates.py`<br>`src/routemate/hybrid_pruning.py`<br>`src/routemate/rolling_dispatch.py` | `tests/test_assignment.py`<br>`tests/test_candidates.py` | Functional & Benchmarked |
| **Routing & Geodesics** | N/A | `dashboard/src/components/RouteMap.jsx`<br>`dashboard/src/components/MapPanel.jsx`<br>`dashboard/src/utils/mapTiles.js` | `src/routemate/routing.py`<br>`src/routemate/geometry.py`<br>`src/routemate/road_network_validation.py` | `tests/test_routing.py`<br>`dashboard/src/tests/motion.test.js` | Functional |
| **Fleet Rebalancing** | N/A | `dashboard/src/components/FleetRebalanceView.jsx` | `src/routemate/repositioning.py` | `tests/test_repositioning.py`<br>`dashboard/src/tests/punjabCorridor.test.js` | Functional Simulation |
| **Simulation Clock** | N/A | `dashboard/src/components/common/SimulationClockBar.jsx` | N/A | `dashboard/src/tests/simulationClock.test.js` | Fully Functional |
| **Research Synthesis & Experiments** | `backend/api.py` (`/v1/scenarios`) | `dashboard/src/components/ExperimentExplorer.jsx`<br>`dashboard/src/components/GuidedDemo.jsx`<br>`dashboard/src/components/LiveAPI.jsx` | `src/routemate/synthesis.py`<br>`src/routemate/ablation.py`<br>`src/routemate/recourse.py` | `tests/test_experiment_*.py` | Fully Functional |

---

## 4. Key Maintainability & Architectural Smells

### 4.1 Backend (`backend/`)
1. **Oversized Controller Monolith (`backend/api.py`)**:
   - 1,040 lines of code containing HTTP routing, Socket.io event definitions, Pydantic schemas, database queries, and business logic all in one file.
   - Touching any one feature (e.g., driver earnings) risks regressions in rider authentication or research endpoints.
2. **Scattered Database Queries**:
   - Raw SQL `cur.execute(...)` calls with custom parameter substitutions are sprinkled directly within FastAPI route functions.
   - No repository or data-access layer abstracts database interactions.
3. **Implicit Dependencies & Global State**:
   - `auth.py` and `db.py` rely on implicit module-level singletons (`OTP_STORE`, `OTP_BY_ID`, `DB_PATH`).
   - Relative imports (`from db import ...`, `from auth import ...`) fail if invoked from outside the `backend/` working directory.
4. **Missing Migration Tooling**:
   - `db.py` runs DDL `CREATE TABLE IF NOT EXISTS` upon server launch. Schema changes cannot be reliably tracked, upgraded, or rolled back.

### 4.2 Frontend (`dashboard/`)
1. **Flat Component Directory**:
   - 22 components reside in `dashboard/src/components/` and `dashboard/src/components/common/` without feature-based domain separation.
   - Consumer rider screens (`RiderHome.jsx`), driver console (`DriverConsole.jsx`), and research simulation tools (`BatchAssignment.jsx`, `FleetRebalanceView.jsx`, `ExperimentExplorer.jsx`) share the same namespace.
2. **Duplicated Driver Logic**:
   - `DriverConsole.jsx` (1,055 lines) contains embedded versions of login, duty toggle, active ride tracking, and earnings calculation, alongside the newer modular components in `dashboard/src/components/driver/`.
3. **Monolithic Data Bundle (`src/data.js`)**:
   - 56 KB file containing mock driver candidates, geographic polyline geometries, seed scenarios, formatters, and provenance helpers.
4. **Monolithic Stylesheet (`src/index.css`)**:
   - Over 5,100 lines of CSS in a single global file. While well-organized by comment sections, it lacks modular stylesheets per feature domain.

---

## 5. Verification Baseline

As of this audit:
- **Backend Python Test Suite**: **158 tests passing (100%)** via `py -m unittest discover -s tests -v`.
- **Frontend Test Suite**: **21 tests passing (100%)** via `npm test` in `dashboard/`.
- **Frontend Linter**: **0 errors, 0 warnings** via `npx oxlint` in `dashboard/`.
- **Frontend Production Build**: **Successful** (`✓ built in 1.21s`) via `npm run build` in `dashboard/`.
- **Continuous Integration (`.github/workflows/ci.yml`)**: Covers Python matrix (3.10, 3.11, 3.12) and Node 20 lint/test/build.
- **Deployment (`.github/workflows/pages.yml`)**: Deploys `dashboard/dist` to GitHub Pages.
