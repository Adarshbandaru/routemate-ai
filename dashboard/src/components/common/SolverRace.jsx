import { Zap } from 'lucide-react';
import ProvenancePopover from './ProvenancePopover';

export default function SolverRace({
  solvers = {
    greedy: { name: 'Greedy Heuristic', objective: 185.59, solveMs: 0.008, gapPct: 10.4, matched: 8, timedOut: false },
    auction: { name: 'Auction / Local Swap', objective: 185.59, solveMs: 0.024, gapPct: 10.4, matched: 8, timedOut: false },
    optimal: { name: 'Exact Branch & Bound', objective: 204.29, solveMs: 0.117, gapPct: 0.0, matched: 9, timedOut: false },
  },
  activeSolver = 'greedy',
  onSelectSolver,
}) {
  const lanes = [
    {
      id: 'greedy',
      title: 'Greedy First-Fit',
      type: 'Approximate',
      data: solvers.greedy || {},
      badge: 'Fastest (O(E log E))',
      color: '#3b82f6',
    },
    {
      id: 'auction',
      title: 'Auction & Local Swap',
      type: 'Approximate',
      data: solvers.auction || {},
      badge: 'Balanced Heuristic',
      color: '#0ea5e9',
    },
    {
      id: 'optimal',
      title: 'Exact Branch-and-Bound',
      type: 'Exact',
      data: solvers.optimal || {},
      badge: 'Theoretical Optimum',
      color: '#10b981',
    },
  ];

  return (
    <div className="solver-race-card card" role="region" aria-label="Batch Assignment Solver Race">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={16} className="text-accent" />
            <h3 className="card-title">Combinatorial Solver Race</h3>
            <span className="badge neutral">Benchmark Exp 007</span>
            <ProvenancePopover experimentId="007_assignment_scaling" />
          </div>
          <p className="card-subtitle">
            Measured runtime, objective value, and optimality gap across assignment algorithms.
          </p>
        </div>
      </div>

      <div className="card-body">
        <div className="solver-race-lanes">
          {lanes.map((lane) => {
            const isSelected = activeSolver === lane.id;
            const d = lane.data;
            const isTimedOut = d.timedOut || d.solveMs > 2000;

            return (
              <button
                key={lane.id}
                type="button"
                className={`solver-race-lane ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectSolver(lane.id)}
                aria-pressed={isSelected}
              >
                <div className="lane-header-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="lane-title">{lane.title}</span>
                    <span className="badge neutral" style={{ fontSize: '9px' }}>{lane.type}</span>
                  </div>
                  <span className="badge" style={{ borderColor: lane.color, color: lane.color }}>
                    {lane.badge}
                  </span>
                </div>

                <div className="lane-metrics-row font-mono">
                  <div className="lane-metric">
                    <span className="m-label">Objective</span>
                    <span className="m-val text-primary">
                      {isTimedOut ? 'Incomplete' : (d.objective?.toFixed(1) || '—')}
                    </span>
                  </div>

                  <div className="lane-metric">
                    <span className="m-label">Runtime</span>
                    <span className={`m-val ${isTimedOut ? 'text-danger' : 'text-cyan'}`}>
                      {isTimedOut ? 'TIMED OUT (>2s)' : `${d.solveMs !== undefined ? d.solveMs.toFixed(3) : '—'} ms`}
                    </span>
                  </div>

                  <div className="lane-metric">
                    <span className="m-label">Optimality Gap</span>
                    <span className={`m-val ${d.gapPct === 0 ? 'text-success' : 'text-amber'}`}>
                      {isTimedOut ? 'Unknown' : (d.gapPct !== undefined ? `${d.gapPct.toFixed(1)}%` : '—')}
                    </span>
                  </div>

                  <div className="lane-metric">
                    <span className="m-label">Matched</span>
                    <span className="m-val">{d.matched || 0} parties</span>
                  </div>
                </div>

                {/* Relative progress bar */}
                <div className="lane-bar-track">
                  <div
                    className="lane-bar-fill"
                    style={{
                      width: isTimedOut ? '100%' : `${Math.max(15, Math.min(100, (d.objective / 250) * 100))}%`,
                      background: isTimedOut ? 'var(--accent-danger)' : lane.color,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
