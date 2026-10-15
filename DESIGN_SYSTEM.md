# RouteMate AI Design System Specification

> **Version**: 2.0.0-production  
> **Status**: Verified & Binding  
> **Target Audience**: Core Maintainers, System Engineers, Product Designers  

---

## 1. Product Vision & Principles

RouteMate AI is a mission-control intelligence console for shared mobility and carpooling dispatch. It bridges the gap between geometric proximity and topological feasibility on urban road graphs.

### Core Tenets
1. **Understandable in 10 Seconds**: First-time viewers immediately comprehend the problem (*"nearby on a map does not mean feasible on a one-way street network"*), the filtering funnel, and vehicle motion along real roads.
2. **Trustworthy Under Inspection**: Every empirical metric, optimality claim, and runtime speedup is directly traceable to its checked-in artifact path, random seed, evaluation scenario, and baseline in the Global Evidence Ledger (`E`).
3. **Delightful to Use**: 60 fps vehicle animations, shortest-arc rotation, seamless dark/light theme switching, full keyboard accessibility (`⌘K`, `E`, `Space`, `←/→`), and responsive layouts from mobile (375px) to ultrawide (1920px).

---

## 2. Design Tokens

### 2.1 Color Tokens
```css
/* Surface & Background Hierarchy */
--bg-primary: #090d16;          /* Deep mission-control navy/black */
--bg-secondary: #0f172a;        /* Elevated card background */
--bg-card: #131c31;             /* Panel & modal surfaces */
--bg-card-subtle: #17233d;      /* Secondary container surface */
--bg-hover: rgba(255, 255, 255, 0.04);
--bg-active: rgba(56, 189, 248, 0.12);

/* Border System */
--border-subtle: #1e293b;       /* Divider & card edges */
--border-strong: #334155;       /* Focus and prominent borders */
--border-focus: #38bdf8;        /* Accessible focus rings */

/* Typography Colors */
--text-primary: #f8fafc;        /* High-contrast content text */
--text-secondary: #94a3b8;      /* Structural descriptions */
--text-muted: #64748b;          /* Metadata, units, hints */

/* Accent & Functional Semantics */
--accent-primary: #38bdf8;      /* Electric sky / active driver */
--accent-primary-hover: #0284c7;
--accent-success: #10b981;      /* Emerald / feasible check / optimal */
--accent-warning: #f59e0b;      /* Amber / one-way circuity / caution */
--accent-danger: #ef4444;       /* Crimson / hard gate violation */
--accent-purple: #8b5cf6;       /* Violet / multi-rider batch group */
--accent-cyan: #06b6d4;         /* Cyan / destination & corridor overlap */
```

### 2.2 Typography & Numerals
- **Display & Interface**: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
- **Data & Telemetry**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
- **Numeric Rule**: All counters, latency measurements, objective values, coordinates, and percentages **MUST** use `font-variant-numeric: tabular-nums` to prevent layout jitter during updates.

### 2.3 Motion & Transitions
- Standard transition duration: `150ms cubic-bezier(0.4, 0, 0.2, 1)`.
- Accessible Reduced Motion: When `prefers-reduced-motion: reduce` or `data-reduced-motion="true"` is set, all transitions collapse to `0.01ms` and timelines transition in discrete step mode.

---

## 3. Vehicle Motion Engine Rules

### 3.1 Haversine Distance & Bearing
- Calculations operate on true spherical coordinates using earth radius $R = 6371.0088\text{ km}$.
- Forward initial bearing formula:
  $$\theta = \text{atan2}(\sin(\Delta\lambda)\cos(\phi_2), \cos(\phi_1)\sin(\phi_2) - \sin(\phi_1)\cos(\phi_2)\cos(\Delta\lambda))$$
  Normalized strictly to $[0^\circ, 360^\circ)$.

### 3.2 Shortest-Arc Rotation (No 359° Spin)
- When interpolating between angle $\theta_1$ and $\theta_2$, the difference $\Delta\theta = (\theta_2 - \theta_1 + 540^\circ) \bmod 360^\circ - 180^\circ$ is used.
- This guarantees a vehicle turning from $355^\circ$ to $5^\circ$ executes a smooth $10^\circ$ clockwise rotation rather than an unnatural $350^\circ$ spin.

### 3.3 60 FPS Imperative Transform Architecture
- Vehicle position and rotation do **not** trigger React component re-renders on every `requestAnimationFrame`.
- The `MapPanel` uses Leaflet DOM references (`marker.getElement()`) and modifies `transform: translate3d(...) rotate(...)` directly, bypassing React reconciliation cycles.

### 3.4 Sprite Semantics
- Ground-truth default vehicle: Top-down car SVG sprite (`kind = 'car'`), matching `src/routemate/models.py`.
- Any non-car sprite (e.g. bike or scooter) must carry an explicit `"Illustrative / Synthetic"` label.

---

## 4. Reusable Core Components

| Component | Path | Description & Purpose |
|---|---|---|
| `AppShell` | `src/components/common/AppShell.jsx` | Sticky mission header, responsive navigation, theme toggle, mobile bottom bar, and shortcut handlers. |
| `MapPanel` | `src/components/MapPanel.jsx` | High-performance Leaflet canvas, vehicle DOM transforms, Circuity Lens, ghost candidate markers, and tile error fallback. |
| `DecisionFunnel` | `src/components/common/DecisionFunnel.jsx` | 5-stage interactive pipeline funnel showing candidate attrition from initial pool (100) to final matched (1). |
| `CircuityLens` | `src/components/common/CircuityLens.jsx` | Road vs straight-line divergence overlay comparing actual OSM trajectory with Euclidean chord. |
| `SolverRace` | `src/components/common/SolverRace.jsx` | Parallel algorithm benchmark comparing Greedy ($O(E \log E)$), Auction local-swap, and Branch & Bound. |
| `SimulationClockBar` | `src/components/common/SimulationClockBar.jsx` | Mission timeline scrubber with transport controls, 0.5×–4× speed buttons, and event markers. |
| `ProvenancePopover` | `src/components/common/ProvenancePopover.jsx` | Accessible popover linking any displayed metric directly to its source artifact, seed, and baseline. |
| `EvidenceLedgerDrawer`| `src/components/common/EvidenceLedgerDrawer.jsx` | Searchable, filterable slide-out audit ledger tracking all 14 empirical research claims (`E` shortcut). |
| `CommandPalette` | `src/components/common/CommandPalette.jsx` | Keyboard-driven quick switcher (`⌘K` / `Ctrl+K`) across pages, scenarios, policies, and evidence. |
| `AudienceToggle` | `src/components/common/AudienceToggle.jsx` | Two-way selector switching between high-level operational overview and deep technical engineering views. |

---

## 5. Research Integrity & Audit Guidelines

### 5.1 Strict Truthfulness
1. **No Fake Count-Ups**: Never animate empirical research metrics with decorative count-up counters. Numbers must render instantly as true values.
2. **Negative Results Preserved**: Never hide algorithmic regressions. Exp 007's greedy gap (10.4%) and Exp 008's Euclidean false-positive rate (75.6%) are displayed prominently as key findings.
3. **Source Discrepancies Explicitly Flagged**: If informal documentation reports a value differing from checked-in JSON artifacts (e.g., informal 1.18× vs verified 1.341× circuity in Exp 006), the Evidence Ledger must explicitly annotate the difference with a `discrepancy` badge.
4. **Permanent Simulated Badges**: Synthetic scenarios and client-side simulated responses must permanently show a `Simulated` badge.

---

## 6. Do's and Don'ts for Maintainers

### Do:
- Use `updateUrlHash(route, params, replace)` to synchronize state into the URL hash so URLs remain shareable on static hosts (GitHub Pages).
- Maintain 100% accessible keyboard focus rings (`:focus-visible`).
- Keep all unit tests green with `npm test` and lint free with `npm run lint`.
- Use the Global Evidence Ledger to register any newly generated experiment benchmarks.

### Don't:
- Do not import heavy UI libraries or CSS frameworks (Tailwind, Material UI). Maintain pure vanilla CSS tokens.
- Do not claim real-time live traffic or live demand when rendering synthetic or offline OSM benchmark scenarios.
- Do not mutate or bypass backend Python domain models in `src/routemate/`.

---

## 7. Geographic Specification: Punjab Regional Corridor & Map Layers

### 7.1 Regional Anchor & Coordinate Framing
- **Regional Anchor**: Lovely Professional University (LPU), Phagwara, Punjab, India (`31.2536° N, 75.7037° E`).
- **Highway Spine**: National Highway 1 / NH44 (Grand Trunk Road) connecting Jalandhar (`31.3260° N, 75.5762° E`), Phagwara (`31.2240° N, 75.7708° E`), and Ludhiana (`30.9010° N, 75.8573° E`).
- **Coordinate Projection**: Longitude degree scaling factor $\Delta x = \Delta\lambda \cdot \cos(31.2536^\circ) \approx 0.8549 \cdot \Delta\lambda$. True Haversine spherical distance is maintained across all evaluations.

### 7.2 Multi-Basemap Architecture (`src/utils/mapTiles.js`)
The mapping canvas supports seamless runtime tile provider switching:
1. **Dark Mission (Carto)**: Optimized high-contrast dark theme for mission-control telemetry.
2. **Google Maps Streets**: Standard street cartography with clear Indian highway designations (NH44, GT Road).
3. **Google Satellite Hybrid**: High-resolution satellite imagery with overlaid road vectors and landmark labels.

### 7.3 Scenario Presets & Transit Zones
- `lpu_commute`: LPU Evening Commute (Jalandhar Station → LPU Campus, ~21 km)
- `campus_shuttle`: Campus Shuttle Rush (LPU Campus → Phagwara → Ludhiana Station, ~42 km)
- `industrial_delivery`: Industrial Delivery Ludhiana (Ludhiana Industrial Area → Phagwara Hub, ~38 km)
- `stress_test`: Phagwara Gridlock Stress Test (LPU → Jalandhar with GT Road bottleneck recourse)
- **Transit Zones**: LPU Central Campus, Jalandhar City Center, Phagwara Bus Stand, Ludhiana Industrial Core, and Rama Mandi Junction.
