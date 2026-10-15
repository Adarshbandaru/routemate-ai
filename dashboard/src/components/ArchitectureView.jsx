import { useState, useEffect } from 'react';
import {
  ArrowRight,
  FileCode2,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';

const PIPELINE_NODES = [
  {
    id: 'ingestion',
    label: '1. Ingestion',
    sub: 'Schema validation & domain validation',
    sourceFile: 'src/routemate/models.py',
    color: '#3b82f6',
    equations: 'Validates Coordinate bounds, local domains, departure timezone awareness, and seat requests.',
  },
  {
    id: 'retrieval',
    label: '2. Retrieval',
    sub: 'Broad candidate cohort indexing',
    sourceFile: 'src/routemate/candidates.py',
    color: '#6366f1',
    equations: 'O(N) unpruned retrieval preserving 100% initial recall baseline before hard gates.',
  },
  {
    id: 'pruning',
    label: '3. Spatial Pruning',
    sub: 'Admissible lower-bound filtering (Exp 009)',
    sourceFile: 'src/routemate/hybrid_pruning.py',
    color: '#0ea5e9',
    equations: 'd_euc(u, v) <= d_road(u, v). If d_euc > tau_gate ==> d_road > tau_gate. Prunes 81.78% of Dijkstra calls with 0 false negatives.',
  },
  {
    id: 'gates',
    label: '4. Feasibility Gates',
    sub: '8 zero-tolerance hard constraints',
    sourceFile: 'src/routemate/candidates.py',
    color: '#10b981',
    equations: 'Direction (>0.5), Pickup (<=2km), Dest (<=3km), Time (<=30m), Detour (<=5km), Identity, Vehicle, Capacity.',
  },
  {
    id: 'ranking',
    label: '5. Scoring & Ranking',
    sub: 'Multi-factor calibrated weights & ML ranker',
    sourceFile: 'src/routemate/scoring.py',
    color: '#f59e0b',
    equations: 'Score = 100 * sum(w_i * (1 - feat_i / max_i)). Feature weights: pickup (0.25), overlap (0.25), dest (0.20), detour (0.10), time (0.10).',
  },
  {
    id: 'assignment',
    label: '6. Batch Assignment',
    sub: 'Greedy, Auction-Swap, and Exact B&B',
    sourceFile: 'src/routemate/assignment.py',
    color: '#ec4899',
    equations: 'Max sum(scores) s.t. vehicle capacity and detour limits. Heuristics achieve 9.3% mean gap with 36,000x speedup.',
  },
  {
    id: 'routing',
    label: '7. Graph Routing',
    sub: 'Directed Dijkstra & BPR congestion curves',
    sourceFile: 'src/routemate/routing.py',
    color: '#8b5cf6',
    equations: 't(e) = t_0 * (1 + alpha * (V/C)^beta). Accounts for one-way street circuity (1.341x to 3.075x peak).',
  },
  {
    id: 'dispatch',
    label: '8. Rolling Dispatch',
    sub: 'Event-driven active-trip insertion & recourse',
    sourceFile: 'src/routemate/rolling_dispatch.py',
    color: '#14b8a6',
    equations: 'In-flight waypoint insertions reduce fleet VKT by 60.5% and wait times by 39.1% with zero passenger reassignments.',
  },
  {
    id: 'evaluation',
    label: '9. Evaluation Audit',
    sub: '14 checked-in empirical experiment suites',
    sourceFile: 'src/routemate/synthesis.py',
    color: '#f43f5e',
    equations: 'P@k, NDCG@k, Circuity multiplier, VKT, P50/P95 latency, oracle regret drop.',
  },
];

export default function ArchitectureView() {
  const [activeStep, setActiveStep] = useState(0);
  const [isAutoStepping, setIsAutoStepping] = useState(false);

  useEffect(() => {
    if (!isAutoStepping) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_NODES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isAutoStepping]);

  return (
    <div className="animate-in" id="architecture-view">
      <div className="section-header" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="section-title">System Architecture & Pipeline Blueprint</h1>
            <p className="section-desc">
              Formal data flow specification from ingestion to combinatorial dispatch, linked directly to source modules.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn btn-sm ${isAutoStepping ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setIsAutoStepping(!isAutoStepping)}
            >
              {isAutoStepping ? <Pause size={14} /> : <Play size={14} />}
              <span>{isAutoStepping ? 'Pause Flow' : 'Step Through Flow'}</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => { setIsAutoStepping(false); setActiveStep(0); }}
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive SVG Flow Diagram */}
      <div className="card" style={{ marginBottom: '18px', padding: '16px' }}>
        <div className="card-header" style={{ padding: '0 0 12px 0' }}>
          <span className="card-title">Interactive Pipeline Flow & Edge Data Transfer</span>
          <span className="badge neutral font-mono">Stage {activeStep + 1} of {PIPELINE_NODES.length} Active</span>
        </div>

        <div className="architecture-svg-wrapper">
          <div className="pipeline-flow-grid">
            {PIPELINE_NODES.map((node, idx) => {
              const isActive = activeStep === idx;
              const isPast = activeStep > idx;
              return (
                <div key={node.id} className="pipeline-stage-card-wrapper">
                  <div
                    className={`pipeline-stage-box ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
                    style={{ borderColor: isActive ? node.color : undefined }}
                    onClick={() => setActiveStep(idx)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="stage-top-meta">
                      <span className="font-mono text-xs font-semibold" style={{ color: node.color }}>
                        0{idx + 1}
                      </span>
                      {isActive && <span className="status-dot online" />}
                    </div>
                    <div className="stage-node-title">{node.label.split('. ')[1]}</div>
                    <div className="stage-node-sub">{node.sub}</div>

                    <div className="source-file-tag font-mono">
                      <FileCode2 size={11} />
                      <span>{node.sourceFile.split('/').pop()}</span>
                    </div>
                  </div>

                  {idx < PIPELINE_NODES.length - 1 && (
                    <div className={`flow-connector-arrow ${isPast ? 'active' : ''}`}>
                      <ArrowRight size={16} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Node Deep-Dive */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge font-mono" style={{ background: PIPELINE_NODES[activeStep].color, color: '#fff' }}>
              Stage 0{activeStep + 1}
            </span>
            <span className="card-title">{PIPELINE_NODES[activeStep].label}</span>
          </div>
          <span className="font-mono text-sm text-cyan">{PIPELINE_NODES[activeStep].sourceFile}</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {PIPELINE_NODES[activeStep].sub}
          </p>

          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '12px', marginBottom: '12px' }}>
            <div className="text-xs text-muted font-semibold uppercase" style={{ marginBottom: '6px' }}>Mathematical & Algorithmic Formulation</div>
            <code className="font-mono text-sm text-primary" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>
              {PIPELINE_NODES[activeStep].equations}
            </code>
          </div>
        </div>
      </div>

      {/* Grid of Formal Gate Specifications */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Admissibility Gate Formal Specifications</span>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Constraint</th>
                  <th>Mathematical Threshold</th>
                  <th>Source Reference</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { check: 'Direction Similarity', spec: 'cos(Δθ) > 0.5', ref: 'geometry.py:direction_similarity' },
                  { check: 'Pickup Distance', spec: 'd_haversine(D_s, R_s) ≤ 2.0 km', ref: 'candidates.py:evaluate_feasibility' },
                  { check: 'Destination Distance', spec: 'd_haversine(D_d, R_d) ≤ 3.0 km', ref: 'candidates.py:evaluate_feasibility' },
                  { check: 'Departure Tolerance', spec: '|t_dep_D - t_dep_R| ≤ 30 min', ref: 'candidates.py:evaluate_feasibility' },
                  { check: 'Detour Burden Limit', spec: 'Δd_detour ≤ 5.0 km', ref: 'geometry.py:ordered_insertion_detour_km' },
                  { check: 'Identity Verification', spec: 'V_id(driver) ∧ V_id(rider) = 1', ref: 'models.py:VerificationContext' },
                  { check: 'Vehicle Registration', spec: 'V_veh(driver) = 1', ref: 'models.py:Vehicle' },
                  { check: 'Seating Capacity', spec: 'C_avail ≥ party_size', ref: 'candidates.py:capacity_eligible' },
                ].map((row, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{row.check}</td>
                    <td><code className="font-mono text-cyan">{row.spec}</code></td>
                    <td className="font-mono text-xs text-muted">{row.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Continuous Scoring Feature Weights</span>
            <span className="badge neutral">Sum = 1.00</span>
          </div>
          <div className="card-body">
            <div className="bar-chart">
              {[
                { label: 'Pickup Distance Minimization', weight: 0.25, color: 'indigo' },
                { label: 'Route Corridor Overlap', weight: 0.25, color: 'indigo' },
                { label: 'Destination Distance Minimization', weight: 0.20, color: 'cyan' },
                { label: 'Direction Alignment', weight: 0.10, color: 'green' },
                { label: 'Geometric Detour Minimization', weight: 0.10, color: 'green' },
                { label: 'Departure Schedule Synchronization', weight: 0.10, color: 'amber' },
              ].map((item) => (
                <div key={item.label} className="bar-row">
                  <span className="bar-label font-mono" style={{ width: '240px', fontSize: '0.75rem' }}>{item.label}</span>
                  <div className="bar-track" style={{ height: '20px' }}>
                    <div className={`bar-fill ${item.color}`} style={{ width: `${item.weight * 100 * 3.6}%` }}>
                      <span className="bar-value">{(item.weight * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>

      {/* Regional Corridor & Vehicle Model Specification */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-header">
          <span className="card-title">Regional Corridor & Domain Model Specification (Punjab Focus)</span>
          <span className="badge info">LPU–Phagwara–Jalandhar–Ludhiana</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '4px', color: 'var(--accent-primary)' }}>
                Corridor Topology & Highway Spine
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Modeled around Grand Trunk Road (GT Road / NH1 / NH44) spanning Jalandhar Railway Station, Lovely Professional University (LPU) Main Gate, Phagwara Bus Stand, and Ludhiana Industrial Area (~62 km total span).
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '4px', color: 'var(--accent-success)' }}>
                Speed Profiles & Detour Tolerance
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                BPR-calibrated speed curves: Urban core (20–30 km/h in Phagwara/Jalandhar local sectors), Highway corridor (60–80 km/h on GT Road). Detour tolerance threshold strictly capped at ≤ 5.0 km to maintain passenger utility.
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '4px', color: 'var(--accent-warning)' }}>
                Vehicle Modeling & Fleet Scope
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Core algorithmic state strictly models standard 4–5 seat passenger cars (<code className="font-mono text-cyan">Vehicle.kind = 'car'</code>). Auto-rickshaw or two-wheeler icons are illustrative UI representations; capacity checks require verified 4-wheel registrations.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
