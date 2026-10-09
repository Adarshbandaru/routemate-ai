export default function ArchitectureView() {
  return (
    <div className="animate-in" id="architecture-view">
      <div className="section-header">
        <h2 className="section-title">🏗️ System Architecture</h2>
        <p className="section-desc">
          RouteMate matching pipeline — from request ingestion through feasibility gating to ranked recommendations.
        </p>
      </div>

      <div className="grid-2">
        {/* Pipeline stages */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚡ Pipeline Stages</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { stage: '1', name: 'Request Validation', desc: 'Schema validation, coordinate/timezone normalization, consent checks', color: '#6366f1', icon: '🔒' },
                { stage: '2', name: 'Candidate Retrieval', desc: 'Broad spatial-temporal index, stable ID ordering, recall-preserving', color: '#8b5cf6', icon: '🔍' },
                { stage: '3', name: 'Feature Generation', desc: 'Pickup/dest distance, route similarity, direction, detour, departure Δ', color: '#a855f7', icon: '📐' },
                { stage: '4', name: 'Feasibility Gating', desc: '8 hard checks: direction, distance, time, detour, identity, vehicle, capacity', color: '#06b6d4', icon: '🚦' },
                { stage: '5', name: 'Ranking', desc: 'Heuristic score or ML artifact (logistic ranker), top-K selection', color: '#10b981', icon: '🏆' },
                { stage: '6', name: 'Explanation', desc: 'Feature contributions, rejection reasons, constraint-level transparency', color: '#f59e0b', icon: '💡' },
              ].map((s) => (
                <div key={s.stage} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '16px',
                  background: 'rgba(30, 41, 59, 0.4)',
                  borderRadius: '10px',
                  borderLeft: `3px solid ${s.color}`,
                  transition: 'all 0.2s ease',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px',
                    background: `${s.color}20`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0,
                  }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '4px' }}>
                      Stage {s.stage}: {s.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
                      {s.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Hard checks detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">🚦 Hard Feasibility Checks</span>
            </div>
            <div className="card-body">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Threshold</th>
                    <th>Failure = Rejection</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { check: 'Direction Similarity', threshold: '> 0.5', note: 'Opposite-direction routes excluded' },
                    { check: 'Pickup Distance', threshold: '≤ 2.0 km', note: 'Haversine start-to-start' },
                    { check: 'Destination Distance', threshold: '≤ 3.0 km', note: 'Haversine end-to-end' },
                    { check: 'Departure Difference', threshold: '≤ 30 min', note: 'Absolute time offset' },
                    { check: 'Geometric Detour', threshold: '≤ 5.0 km', note: 'Ordered insertion cost' },
                    { check: 'Identity Verification', threshold: 'Both true', note: 'Driver + rider verified' },
                    { check: 'Vehicle Verification', threshold: 'Both true', note: 'Vehicle + registration' },
                    { check: 'Capacity', threshold: '≥ seats_requested', note: 'Available passenger seats' },
                  ].map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{row.check}</td>
                      <td><code style={{ background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: '4px', color: '#818cf8', fontSize: '0.8125rem' }}>{row.threshold}</code></td>
                      <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">⚖️ Scoring Weights</span>
            </div>
            <div className="card-body">
              <div className="bar-chart">
                {[
                  { label: 'Pickup Distance', weight: 0.25, color: 'purple' },
                  { label: 'Route Similarity', weight: 0.25, color: 'purple' },
                  { label: 'Destination Distance', weight: 0.20, color: 'cyan' },
                  { label: 'Direction Similarity', weight: 0.10, color: 'green' },
                  { label: 'Geometric Detour', weight: 0.10, color: 'green' },
                  { label: 'Departure Difference', weight: 0.10, color: 'amber' },
                ].map((item) => (
                  <div key={item.label} className="bar-row">
                    <span className="bar-label">{item.label}</span>
                    <div className="bar-track">
                      <div className={`bar-fill ${item.color}`} style={{ width: `${item.weight * 100 * 4}%` }}>
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
