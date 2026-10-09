export default function ArchitectureView() {
  return (
    <div className="animate-in" id="architecture-view">
      <div className="section-header">
        <h2 className="section-title">System Architecture & Pipeline Blueprint</h2>
        <p className="section-desc">
          RouteMate matching pipeline — from request normalization through spatial-temporal indexing and 8-gate zero-tolerance filtering to explainable multi-factor scoring.
        </p>
      </div>

      <div className="grid-2">
        {/* Pipeline stages */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">End-to-End Pipeline Stages</span>
            <span className="badge info">6-Stage Flow</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { stage: '01', name: 'Request Normalization', desc: 'Schema validation, coordinate projection, departure window normalization, and passenger verification checks.', color: '#3b82f6' },
                { stage: '02', name: 'Spatial-Temporal Retrieval', desc: 'Broad spatial-temporal index bounds, bounding-box spatial query, recall-preserving candidate cohort generation.', color: '#6366f1' },
                { stage: '03', name: 'Feature Vector Extraction', desc: 'Haversine pickup/dest distances, route trajectory overlap, cosine direction alignment, incremental detour insertion cost.', color: '#0ea5e9' },
                { stage: '04', name: 'Admissibility Feasibility Gating', desc: '8 hard zero-tolerance checks: direction alignment, pickup threshold, destination threshold, departure window, detour limit, ID, vehicle, capacity.', color: '#10b981' },
                { stage: '05', name: 'Explainable Scoring & Ranking', desc: 'Multi-factor calibrated ranking or L2-regularized logistic ranker artifact, Top-K recommendation selection.', color: '#f59e0b' },
                { stage: '06', name: 'Constraint Explanation & Audit', desc: 'Linear feature contributions, constraint-level admissibility audit trail, rejected candidate violation diagnostics.', color: '#8b5cf6' },
              ].map((s) => (
                <div key={s.stage} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 14px',
                  background: 'var(--bg-hover)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: `3px solid ${s.color}`,
                  border: '1px solid var(--border-subtle)',
                  borderLeftWidth: '3px',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: s.color,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                  }}>
                    {s.stage}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {s.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Hard checks detail + Weights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">Admissibility Gate Specifications</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Zero-tolerance hard pruning gates enforced before ranking
                </span>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Constraint Gate</th>
                    <th>Threshold Spec</th>
                    <th>Failure Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { check: 'Direction Similarity', threshold: 'cos(θ) > 0.5', note: 'Opposite-direction routes excluded' },
                    { check: 'Pickup Distance', threshold: 'd_start ≤ 2.0 km', note: 'Haversine origin-to-pickup' },
                    { check: 'Destination Distance', threshold: 'd_end ≤ 3.0 km', note: 'Haversine dropoff-to-dest' },
                    { check: 'Departure Time Difference', threshold: '|Δt| ≤ 30 min', note: 'Temporal schedule tolerance' },
                    { check: 'Geometric Insertion Detour', threshold: 'Δd_detour ≤ 5.0 km', note: 'Ordered waypoint detour cost' },
                    { check: 'Identity Verification', threshold: 'driver ∧ rider = true', note: 'KYC verified identity' },
                    { check: 'Vehicle Registration', threshold: 'valid = true', note: 'Insurance and registration check' },
                    { check: 'Passenger Capacity', threshold: 'seats_avail ≥ req', note: 'Sufficient available seat belts' },
                  ].map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{row.check}</td>
                      <td>
                        <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8', fontSize: '0.75rem', border: '1px solid var(--border-subtle)' }}>
                          {row.threshold}
                        </code>
                      </td>
                      <td style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Multi-Factor Scoring Weights</span>
              <span className="badge neutral">Sum = 1.0</span>
            </div>
            <div className="card-body">
              <div className="bar-chart">
                {[
                  { label: 'Pickup Distance (Low)', weight: 0.25, color: 'indigo' },
                  { label: 'Route Corridor Overlap', weight: 0.25, color: 'indigo' },
                  { label: 'Destination Distance (Low)', weight: 0.20, color: 'cyan' },
                  { label: 'Direction Alignment', weight: 0.10, color: 'green' },
                  { label: 'Geometric Detour Minimization', weight: 0.10, color: 'green' },
                  { label: 'Departure Schedule Synchronization', weight: 0.10, color: 'amber' },
                ].map((item) => (
                  <div key={item.label} className="bar-row">
                    <span className="bar-label" style={{ width: '220px', fontSize: '0.725rem' }}>{item.label}</span>
                    <div className="bar-track" style={{ height: '20px' }}>
                      <div className={`bar-fill ${item.color}`} style={{ width: `${item.weight * 100 * 3.8}%` }}>
                        <span className="bar-value">{(item.weight * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
