import { useState, useMemo, useCallback, useEffect } from 'react';
import { generateSyntheticScenario, runMatchingPipeline, exportToCSV } from '../data';
import MapPanel from './MapPanel';
import StatsBar from './StatsBar';
import FeasibilityMatrix from './FeasibilityMatrix';
import CircuityLens from './common/CircuityLens';
import ProvenancePopover from './common/ProvenancePopover';
import { updateUrlHash } from '../utils/urlState';
import {
  Download,
  Shuffle,
  Sliders,
  Filter,
  HelpCircle,
} from 'lucide-react';

export default function MatchPlayground({
  initialSeed = 42,
  initialDriver = null,
  audienceMode = 'overview',
}) {
  const [seed, setSeed] = useState(initialSeed);
  const [driverCount, setDriverCount] = useState(12);
  const [selectedDriver, setSelectedDriver] = useState(initialDriver);
  const [circuityLensActive, setCircuityLensActive] = useState(false);
  const [pruningOverlayActive, setPruningOverlayActive] = useState(false);

  // Sync state to URL hash
  useEffect(() => {
    updateUrlHash(
      'playground',
      {
        seed,
        driver: selectedDriver || undefined,
        lens: circuityLensActive ? '1' : undefined,
      },
      true
    );
  }, [seed, selectedDriver, circuityLensActive]);

  // Generate synthetic scenario
  const { rider, drivers } = useMemo(
    () => generateSyntheticScenario(seed, driverCount),
    [seed, driverCount]
  );

  const matchResults = useMemo(
    () => runMatchingPipeline(rider, drivers),
    [rider, drivers]
  );

  const handleSelectDriver = useCallback((id) => {
    setSelectedDriver((prev) => (prev === id ? null : id));
  }, []);

  const selectedResult = selectedDriver
    ? matchResults.all.find((r) => r.driver_id === selectedDriver)
    : null;

  const handleExportCSV = useCallback(() => {
    const data = matchResults.all.map((r) => ({
      driver_id: r.driver_id,
      eligible: r.final_eligible,
      score: r.score,
      pickup_km: r.features.pickup_distance_km.toFixed(3),
      dest_km: r.features.destination_distance_km.toFixed(3),
      route_sim: r.features.route_similarity.toFixed(3),
      dir_sim: r.features.direction_similarity.toFixed(3),
      detour_km: r.features.detour_km.toFixed(3),
      departure_min: r.features.departure_difference_min.toFixed(1),
      rejection_reasons: r.rejection_reasons.join('; '),
    }));
    exportToCSV(data, `routemate_playground_seed${seed}.csv`);
  }, [matchResults, seed]);

  return (
    <div className="animate-in" id="playground-view">
      {/* Page Header */}
      <div className="section-header" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="section-title">Match Playground</h1>
            <p className="section-desc">
              Inspect rider–driver compatibility across geospatial routing corridors, zero-tolerance feasibility gates, and circuity divergence.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {audienceMode === 'engineer' && (
              <span className="badge info">Engineer View: Raw Gates Active</span>
            )}
            <ProvenancePopover experimentId="008_road_network_validation" />
            <ProvenancePopover experimentId="009_hybrid_pruning" />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="playground-controls-bar" style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="seed-input">Scenario Seed</label>
          <input
            id="seed-input"
            type="number"
            className="form-input"
            value={seed}
            onChange={(e) => {
              setSeed(parseInt(e.target.value, 10) || 0);
              setSelectedDriver(null);
            }}
            style={{ width: '90px' }}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="driver-count-select">Driver Candidates</label>
          <select
            id="driver-count-select"
            className="form-select"
            value={driverCount}
            onChange={(e) => {
              setDriverCount(parseInt(e.target.value, 10));
              setSelectedDriver(null);
            }}
          >
            <option value={4}>4 Candidates (Thin)</option>
            <option value={8}>8 Candidates</option>
            <option value={12}>12 Candidates (Balanced)</option>
            <option value={16}>16 Candidates</option>
            <option value={24}>24 Candidates (Dense)</option>
          </select>
        </div>

        <button
          type="button"
          id="regenerate-btn"
          className="btn btn-primary"
          onClick={() => {
            setSeed(Math.floor(Math.random() * 1000));
            setSelectedDriver(null);
          }}
        >
          <Shuffle size={14} />
          <span>Randomize Scenario</span>
        </button>

        {/* Circuity Lens Toggle Button */}
        <button
          type="button"
          className={`btn ${circuityLensActive ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setCircuityLensActive(!circuityLensActive)}
          aria-pressed={circuityLensActive}
          title="Overlay straight-line Euclidean distance against street-network route"
        >
          <Sliders size={14} />
          <span>Circuity Lens {circuityLensActive ? 'ON' : 'OFF'}</span>
        </button>

        {/* Pruning Radius Toggle */}
        <button
          type="button"
          className={`btn ${pruningOverlayActive ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setPruningOverlayActive(!pruningOverlayActive)}
          aria-pressed={pruningOverlayActive}
          title="Overlay 2km admissible spatial pruning radius (Exp 009)"
        >
          <Filter size={14} />
          <span>Pruning Region {pruningOverlayActive ? 'ON' : 'OFF'}</span>
        </button>

        <button type="button" className="btn btn-outline" onClick={handleExportCSV}>
          <Download size={14} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Circuity Lens Active Callout */}
      {circuityLensActive && (
        <div style={{ marginBottom: '16px' }}>
          <CircuityLens
            isEnabled={circuityLensActive}
            onToggle={() => setCircuityLensActive(false)}
            euclideanDetourKm={selectedResult?.features?.detour_km || 0.56}
            roadDetourKm={(selectedResult?.features?.detour_km || 0.56) * 1.341}
            circuityFactor={1.341}
            gateThresholdKm={2.0}
          />
        </div>
      )}

      {/* Telemetry Stats Bar */}
      <div style={{ marginBottom: '16px' }}>
        <StatsBar stats={matchResults.stats} />
      </div>

      {/* Map + Detail Sidebar Grid */}
      <div className="grid-sidebar">
        {/* Detail Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selectedResult ? (
            <div className="card animate-in" id="driver-detail-panel">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="font-mono font-semibold" style={{ fontSize: '0.875rem' }}>
                    {selectedResult.driver_id}
                  </span>
                  <span className={`badge ${selectedResult.final_eligible ? 'success' : 'danger'}`}>
                    {selectedResult.final_eligible ? 'ELIGIBLE' : 'REJECTED'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedDriver(null)}
                  aria-label="Deselect driver"
                >
                  ✕
                </button>
              </div>

              <div className="card-body">
                {/* Score gauge */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <span className="text-xs text-muted font-semibold uppercase">Match Compatibility Index</span>
                    <span className="font-mono font-bold" style={{
                      fontSize: '1.25rem',
                      color: selectedResult.score >= 70 ? 'var(--accent-success)' : selectedResult.score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)'
                    }}>
                      {selectedResult.score.toFixed(1)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ 100</span>
                    </span>
                  </div>
                  <div className="score-bar-container">
                    <div
                      className="score-bar-fill"
                      style={{
                        width: `${selectedResult.score}%`,
                        background: selectedResult.score >= 70 ? 'var(--accent-success)' : selectedResult.score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)',
                      }}
                    />
                  </div>
                </div>

                {/* Constraint Gates */}
                <div style={{ marginBottom: '14px' }}>
                  <div className="text-xs text-muted font-semibold uppercase" style={{ marginBottom: '6px', letterSpacing: '0.5px' }}>
                    8 Admissibility Constraints
                  </div>
                  <div className="checks-grid">
                    {Object.entries({
                      route_direction_compatible: 'Direction',
                      pickup_distance_eligible: 'Pickup Dist',
                      destination_distance_eligible: 'Dest Dist',
                      departure_time_eligible: 'Departure Time',
                      detour_eligible: 'Detour Burden',
                      identity_verification: 'Identity',
                      vehicle_verification: 'Vehicle',
                      capacity_eligible: 'Seats Capacity',
                    }).map(([key, label]) => (
                      <span key={key} className={`check-badge ${selectedResult[key] ? 'pass' : 'fail'}`}>
                        {selectedResult[key] ? '✓' : '✕'} {label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Metric Features */}
                <div>
                  <div className="text-xs text-muted font-semibold uppercase" style={{ marginBottom: '6px', letterSpacing: '0.5px' }}>
                    Continuous Metric Attributes
                  </div>
                  <div className="feature-detail font-mono">
                    {Object.entries({
                      pickup_distance_km: ['Pickup Dist', 'km'],
                      destination_distance_km: ['Dest Dist', 'km'],
                      route_similarity: ['Route Overlap', ''],
                      direction_similarity: ['Direction Sim', ''],
                      detour_km: ['Detour Burden', 'km'],
                      departure_difference_min: ['Departure Δ', 'min'],
                    }).map(([key, [label, unit]]) => (
                      <div key={key} className="feature-item">
                        <span className="feature-name">{label}</span>
                        <span className="feature-value">
                          {selectedResult.features[key]?.toFixed(2)}{unit ? ` ${unit}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rejection reasons */}
                {selectedResult.rejection_reasons.length > 0 && (
                  <div className="rejection-reasons" style={{ marginTop: '12px' }}>
                    <ul>
                      {selectedResult.rejection_reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body">
                <div className="empty-state">
                  <HelpCircle size={28} className="text-muted" />
                  <div className="empty-state-text">Select a Driver Candidate</div>
                  <div className="empty-state-hint">
                    Click any route polyline on the map or candidate row in the table below to inspect constraint gates and score breakdowns.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Map Legend */}
          <div className="card">
            <div className="card-body" style={{ padding: '12px 14px' }}>
              <div className="text-xs text-muted font-semibold uppercase" style={{ marginBottom: '8px', letterSpacing: '0.5px' }}>
                Corridor Legend (Exact Route Data)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { color: '#3b82f6', label: 'Rider request corridor', dash: false },
                  { color: '#10b981', label: 'Feasible driver candidate', dash: false },
                  { color: '#ef4444', label: 'Pruned / rejected candidate', dash: true },
                  { color: '#06b6d4', label: 'Active inspection route', dash: false },
                  { color: '#0ea5e9', label: 'Straight-line Euclidean baseline (Lens)', dash: true },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '18px', height: '3px',
                      background: item.color,
                      borderRadius: '2px',
                      ...(item.dash ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0, ${item.color} 4px, transparent 4px, transparent 8px)`, background: 'none' } : {}),
                    }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Map Panel */}
        <MapPanel
          rider={rider}
          drivers={drivers}
          matchResults={matchResults}
          selectedDriver={selectedDriver}
          onSelectDriver={handleSelectDriver}
          circuityLensEnabled={circuityLensActive}
          pruningOverlayEnabled={pruningOverlayActive}
          height="520px"
        />
      </div>

      {/* Feasibility Matrix Table */}
      <div style={{ marginTop: '18px' }}>
        <FeasibilityMatrix
          results={matchResults}
          selectedDriver={selectedDriver}
          onSelectDriver={handleSelectDriver}
        />
      </div>
    </div>
  );
}
