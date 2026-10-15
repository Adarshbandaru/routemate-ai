import { useState } from 'react';

const CHECK_KEYS = [
  { key: 'route_direction_compatible', label: 'Direction' },
  { key: 'pickup_distance_eligible', label: 'Pickup ≤2km' },
  { key: 'destination_distance_eligible', label: 'Dest ≤3km' },
  { key: 'departure_time_eligible', label: 'Time ≤30m' },
  { key: 'detour_eligible', label: 'Detour ≤5km' },
  { key: 'identity_verification', label: 'ID Verify' },
  { key: 'vehicle_verification', label: 'Vehicle' },
  { key: 'capacity_eligible', label: 'Capacity' },
];

export default function FeasibilityMatrix({ results, selectedDriver, onSelectDriver }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  if (!results) return null;

  const filtered = filter === 'all' ? results.all
    : filter === 'eligible' ? results.eligible
    : results.rejected;

  return (
    <div className="card" id="feasibility-matrix">
      <div className="card-header">
        <div>
          <span className="card-title">Feasibility Gate Evaluation Matrix</span>
          <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
            8 hard admissibility constraints evaluated per driver candidate
          </span>
        </div>
        <div className="experiment-selector">
          {[
            { id: 'all', label: `All (${results.all.length})` },
            { id: 'eligible', label: `Eligible (${results.eligible.length})` },
            { id: 'rejected', label: `Rejected (${results.rejected.length})` },
          ].map((item) => (
            <button
              key={item.id}
              className={`experiment-chip ${filter === item.id ? 'active' : ''}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body" style={{ padding: 0, maxHeight: '520px', overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '130px' }}>Driver</th>
              <th style={{ width: '90px' }}>Status</th>
              <th style={{ width: '70px' }}>Score</th>
              {CHECK_KEYS.map((c) => (
                <th key={c.key} style={{ textAlign: 'center', fontSize: '0.65rem' }}>{c.label}</th>
              ))}
              <th>Rejection Bottlenecks</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isSelected = selectedDriver === row.driver_id;
              const isExpanded = expanded === row.driver_id;
              return (
                <tr
                  key={row.driver_id}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? 'var(--bg-active)' : undefined,
                  }}
                  onClick={() => {
                    onSelectDriver?.(row.driver_id);
                    setExpanded(isExpanded ? null : row.driver_id);
                  }}
                >
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {row.driver_id}
                  </td>
                  <td>
                    <span className={`badge ${row.final_eligible ? 'success' : 'danger'}`}>
                      {row.final_eligible ? 'ELIGIBLE' : 'REJECTED'}
                    </span>
                  </td>
                  <td style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: row.score >= 70 ? '#34d399' : row.score >= 50 ? '#fbbf24' : '#f87171',
                  }}>
                    {row.score.toFixed(1)}
                  </td>
                  {CHECK_KEYS.map((c) => {
                    const pass = row[c.key];
                    return (
                      <td key={c.key} style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: pass ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: pass ? '#10b981' : '#ef4444',
                          lineHeight: '14px',
                          fontSize: '10px',
                          fontWeight: 700,
                          textAlign: 'center',
                        }}>
                          {pass ? '✓' : '✕'}
                        </span>
                      </td>
                    );
                  })}
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {row.rejection_reasons.length > 0 ? (
                      <span style={{ color: '#f87171' }}>{row.rejection_reasons.join('; ')}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
