# RouteMate AI — Mission Control Dashboard

> **Production-grade shared mobility dispatch intelligence, interactive feasibility exploration, and empirical evidence ledger.**

---

## 🌟 Overview

The RouteMate AI Dashboard is built with React 19, Vite, Leaflet, and pure Vanilla CSS tokens. Designed with the aesthetics and rigor of high-performance operational tools (Linear, Kepler.gl, Stripe, Waymo ops consoles), it provides:

1. **Understandable in 10 Seconds**: Recruits and operators instantly see why geometric proximity fails on directed road networks (one-way streets, bridge bottlenecks), see the candidate filtering funnel, and watch moving vehicles follow realistic road polylines.
2. **Trustworthy Under Inspection**: Every empirical metric links to an auditable artifact in the Global Evidence Ledger (`E`), with full scenario seeds, baselines, and discrepancy transparency.
3. **Delightful to Use**: 60 fps imperative vehicle transforms, shortest-arc rotation (zero $359^\circ$ spinning bugs), dark/light mode, accessible keyboard navigation (`⌘K`, `E`, `Space`, `←/→`), and responsive layouts from mobile (375px) to desktop (1920px).

---

## 🚀 Navigation Architecture

The dashboard uses hash-based URL routing safe for static hosting environments (GitHub Pages, Vercel, S3):

| Route | View | Description |
|---|---|---|
| `/#/demo` | **Guided Demo** | 6-step interactive workflow through trip ingestion, 8 admissibility gates, ML ranking, combinatorial pooling, rolling dispatch, and incident recourse. |
| `/#/playground` | **Match Playground** | Interactive map corridor analysis with Circuity Lens overlay and 8-gate feasibility evaluation matrix. |
| `/#/batch` | **Batch Assignment** | Multi-rider pooling workbench featuring the Combinatorial Solver Race (Greedy vs Auction vs Branch & Bound). |
| `/#/staging` | **Fleet Staging** | Macro-level metropolitan vehicle rebalancing with transit zone supply/deficit analysis and simulation timeline scrubber. |
| `/#/experiments` | **Experiment Explorer** | Deep inspection of all 14 empirical benchmarks (`001_baseline` to `014_research_synthesis`) with scenario filtering and provenance popovers. |
| `/#/api` | **Live API** | FastAPI client & in-browser simulator with real-time cURL command generator and JSON payload export. |
| `/#/architecture` | **Architecture** | Interactive data pipeline blueprint linking directly to Python source modules and formal mathematical constraint thresholds. |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` or `Ctrl+K` | Open Command Palette (fuzzy navigation across pages, scenarios, policies, and ledger) |
| `E` | Toggle Global Evidence Ledger drawer |
| `?` or `Shift+/` | Toggle Keyboard Shortcuts cheat sheet |
| `Space` | Play / Pause Simulation Clock |
| `←` / `→` | Step to Previous / Next Timeline Event |
| `Escape` | Close active drawer, modal, or popover |

---

## 🛠️ Motion & Map System

- **Imperative Leaflet Transforms**: Smooth 60 fps vehicle marker updates bypass React reconciliation by modifying marker DOM style transforms directly.
- **Shortest-Arc Rotation**: Smooth angular interpolation handles angle wrap-around ($355^\circ \to 5^\circ$ rotates clockwise $10^\circ$).
- **Top-Down Car Sprites**: Default vehicle sprite matches backend domain model (`kind = 'car'`).
- **Tile Fallbacks & Error States**: Network tile load failures gracefully fall back to dark neutral canvas grids.

---

## 🧪 Testing & Verification

```bash
# Run unit tests (Haversine math, bearing, interpolation, URL hash state)
npm test

# Run Oxlint (0 errors, 0 warnings policy)
npm run lint

# Build production bundle
npm run build

# Start local development server
npm run dev
```

---

## 🎨 Design System

See [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) for full token definitions, typography standards, component specs, and research integrity guidelines.
