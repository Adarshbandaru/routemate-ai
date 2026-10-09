import { useState } from 'react';

const CHECK_LABELS = {
  route_direction_compatible: 'Direction',
  pickup_distance_eligible: 'Pickup ≤2km',
  destination_distance_eligible: 'Dest ≤3km',
  departure_time_eligible: 'Time ≤30min',
  detour_eligible: 'Detour ≤5km',
  identity_verification: 'Identity',
  vehicle_verification: 'Vehicle',
  capacity_eligible: 'Capacity',
};

const FEATURE_LABELS = {
  pickup_distance_km: 'Pickup Distance',
  destination_distance_km: 'Dest Distance',
  route_similarity: 'Route Similarity',
  direction_similarity: 'Direction Sim.',
  detour_km: 'Detour',
  departure_difference_min: 'Departure Δ',
  driver_route_km: 'Driver Route',
};

const FEATURE_UNITS = {
  pickup_distance_km: 'km',
  destination_distance_km: 'km',
  route_similarity: '',
  direction_similarity: '',
  detour_km: 'km',
  departure_difference_min: 'min',
  driver_route_km: 'km',
};

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
        <span className="card-title">
          🔍 Feasibility Matrix
        </span>
        <div className="experiment-selector">
          {['all', 'eligible', 'rejected'].map((f) => (
            <button
              key={f}
              className={`experiment-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${results.all.length})` :
               f === 'eligible' ? `✅ Eligible (${results.eligible.length})` :
               `❌ Rejected (${results.rejected.length})`}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <div className="feasibility-grid">
          {filtered.map((row) => {
            const isSelected = selectedDriver === row.driver_id;
            const isExpanded = expanded === row.driver_id;
            return (
              <div
                key={row.driver_id}
                className={`feasibility-row ${row.final_eligible ? 'eligible' : 'rejected'}`}
                style={isSelected ? { borderColor: '#06b6d4', boxShadow: '0 0 12px rgba(6,182,212,0.3)' } : {}}
                onClick={() => {
                  onSelectDriver?.(row.driver_id);
                  setExpanded(isExpanded ? null : row.driver_id);
                }}
              >
                <div className="feasibility-header">
                  <span className="feasibility-id">{row.driver_id}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`badge ${row.final_eligible ? 'success' : 'danger'}`}>
                      {row.final_eligible ? '✅ ELIGIBLE' : '❌ REJECTED'}
                    </span>
                    <span style={{ 
                      fontWeight: 700, 
                      fontSize: '0.875rem',
                      color: row.score >= 70 ? '#10b981' : row.score >= 50 ? '#f59e0b' : '#ef4444' 
                    }}>
                      {row.score.toFixed(1)}
                    </span>
                  </div>
                </div>

                <div className="checks-grid">
                  {Object.entries(CHECK_LABELS).map(([key, label]) => (
                    <span key={key} className={`check-badge ${row[key] ? 'pass' : 'fail'}`}>
                      {row[key] ? '✓' : '✗'} {label}
                    </span>
                  ))}
                </div>

                {row.rejection_reasons.length > 0 && (
                  <div className="rejection-reasons">
                    <ul>
                      {row.rejection_reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}

                {isExpanded && (
                  <div className="feature-detail" style={{ marginTop: '12px' }}>
                    {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                      <div key={key} className="feature-item">
                        <span className="feature-name">{label}</span>
                        <span className="feature-value">
                          {row.features[key]?.toFixed(3)}{FEATURE_UNITS[key] ? ` ${FEATURE_UNITS[key]}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
