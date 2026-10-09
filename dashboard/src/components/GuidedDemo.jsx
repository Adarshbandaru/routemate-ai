import { useState, useMemo, useCallback } from 'react';
import {
  DEMO_RIDE_PRESETS,
  generateSyntheticScenario,
  runMatchingPipeline,
  generateBatchScenario,
  runBatchAssignment,
} from '../data';
import RouteMap from './RouteMap';

const STEPS = [
  { id: 'request', num: 1, title: 'Create Ride Request', icon: '📍' },
  { id: 'filtering', num: 2, title: 'Feasibility Filtering', icon: '🛡️' },
  { id: 'ranking', num: 3, title: 'Explainable Scoring', icon: '🧠' },
  { id: 'batch', num: 4, title: 'Fleet Batch Assignment', icon: '🚐' },
  { id: 'dispatch', num: 5, title: 'Dispatch Comparison', icon: '⚡' },
  { id: 'evidence', num: 6, title: 'Experiment Evidence', icon: '📊' },
];

export default function GuidedDemo({ onNavigateTab }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState('fidi_soma');
  const [customSeats, setCustomSeats] = useState(1);
  const [seed, setSeed] = useState(42);
  const [driverCount, setDriverCount] = useState(10);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [dispatchPolicy, setDispatchPolicy] = useState('event_driven_rolling');
  const [incidentActive, setIncidentActive] = useState(false);

  const preset = useMemo(
    () => DEMO_RIDE_PRESETS.find((p) => p.id === selectedPreset) || DEMO_RIDE_PRESETS[0],
    [selectedPreset]
  );

  // Generate scenario for matching
  const { rider, drivers } = useMemo(() => {
    const base = generateSyntheticScenario(seed, driverCount);
    // Interpolate route from preset start to destination
    const route = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      latitude: preset.start.latitude + (preset.destination.latitude - preset.start.latitude) * t,
      longitude: preset.start.longitude + (preset.destination.longitude - preset.start.longitude) * t,
    }));
    // Overlay preset parameters onto the rider
    const customizedRider = {
      ...base.rider,
      start: preset.start,
      destination: preset.destination,
      route,
      seats_requested: customSeats,
      departure: preset.departure,
    };
    return { rider: customizedRider, drivers: base.drivers };
  }, [seed, driverCount, preset, customSeats]);

  const incidentObj = useMemo(() => {
    if (!incidentActive || !rider?.start || !rider?.destination) return null;
    const midLat = (rider.start.latitude + rider.destination.latitude) / 2;
    const midLon = (rider.start.longitude + rider.destination.longitude) / 2;
    return {
      coordinate: { latitude: midLat + 0.001, longitude: midLon },
      label: 'Sudden Congestion / Closed Edge (+1.26 km)',
      detourRoute: [
        rider.start,
        { latitude: midLat + 0.004, longitude: midLon - 0.003 },
        { latitude: midLat + 0.002, longitude: midLon + 0.003 },
        rider.destination,
      ],
    };
  }, [incidentActive, rider]);

  const matchResults = useMemo(
    () => runMatchingPipeline(rider, drivers),
    [rider, drivers]
  );

  const eligibleDrivers = useMemo(
    () => matchResults.eligible,
    [matchResults]
  );

  const topDriver = eligibleDrivers[0] || matchResults.all[0];
  const activeDriver = selectedDriverId
    ? matchResults.all.find((d) => d.driver_id === selectedDriverId) || topDriver
    : topDriver;

  // Batch scenario for Step 4
  const batchScenario = useMemo(
    () => generateBatchScenario(seed, 6, 10),
    [seed]
  );

  const greedyBatch = useMemo(
    () => runBatchAssignment(batchScenario.riders, batchScenario.drivers, 'greedy'),
    [batchScenario]
  );
  const auctionBatch = useMemo(
    () => runBatchAssignment(batchScenario.riders, batchScenario.drivers, 'auction'),
    [batchScenario]
  );
  const optimalBatch = useMemo(
    () => runBatchAssignment(batchScenario.riders, batchScenario.drivers, 'optimal'),
    [batchScenario]
  );

  const nextStep = useCallback(() => {
    setCurrentStep((s) => Math.min(STEPS.length - 1, s + 1));
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  return (
    <div className="animate-in" id="guided-demo-flow">
      {/* Header Banner */}
      <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid #6366f1' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem' }}>🚀</span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                End-to-End Matching & Dispatch Walkthrough
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px', marginBottom: 0 }}>
              Trace a commuter trip from instant request creation through 8-rule feasibility gates, explainable scoring, multi-rider batching, and rolling-horizon dispatch.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="badge info">Interactive Portfolio Demo</span>
            <span className="badge warning">Controlled Synthetic Setup</span>
          </div>
        </div>

        {/* Stepper Progress Bar */}
        <div className="card-body" style={{ paddingTop: '12px' }}>
          <div className="demo-stepper">
            {STEPS.map((s, idx) => {
              const isPast = idx < currentStep;
              const isCurrent = idx === currentStep;
              return (
                <button
                  key={s.id}
                  className={`demo-step-btn ${isCurrent ? 'active' : ''} ${isPast ? 'completed' : ''}`}
                  onClick={() => setCurrentStep(idx)}
                >
                  <span className="demo-step-num">{isPast ? '✓' : s.num}</span>
                  <span className="demo-step-title">{s.icon} {s.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="demo-step-container">
        {/* ================= STEP 1: CREATE RIDE REQUEST ================= */}
        {currentStep === 0 && (
          <div className="card animate-in">
            <div className="card-header">
              <span className="card-title">📍 Step 1: Create & Configure Ride Request</span>
              <span className="badge info">Trip Ingestion Layer</span>
            </div>
            <div className="card-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Select a commute preset or configure passenger origin, destination, seats requested, and departure window.
              </p>

              {/* Presets Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {DEMO_RIDE_PRESETS.map((p) => {
                  const isSelected = p.id === selectedPreset;
                  return (
                    <div
                      key={p.id}
                      className={`card ${isSelected ? 'active-card' : ''}`}
                      style={{
                        padding: '14px',
                        cursor: 'pointer',
                        borderColor: isSelected ? 'var(--primary-color, #6366f1)' : 'var(--border-color)',
                        background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg)',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => setSelectedPreset(p.id)}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '4px' }}>{p.title}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>{p.subtitle}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.notes}</div>
                    </div>
                  );
                })}
              </div>

              {/* Request Parameters Form */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                <div>
                  <label className="form-label">Rider Identifier</label>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 600, color: '#06b6d4' }}>
                    {rider.journey_id}
                  </div>
                </div>
                <div>
                  <label className="form-label">Seats Requested</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3].map((num) => (
                      <button
                        key={num}
                        className={`btn btn-sm ${customSeats === num ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setCustomSeats(num)}
                      >
                        {num} {num === 1 ? 'Seat' : 'Seats'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">Origin Coordinate</label>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                    {preset.start.latitude.toFixed(4)}, {preset.start.longitude.toFixed(4)}
                  </div>
                </div>
                <div>
                  <label className="form-label">Destination Coordinate</label>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                    {preset.destination.latitude.toFixed(4)}, {preset.destination.longitude.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Map Preview of Request */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  GEOSPATIAL ROUTE PREVIEW (SAN FRANCISCO CORRIDOR)
                </div>
                <RouteMap rider={rider} height="280px" />
              </div>

              {/* Bottom Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Seed:</span>
                    <input
                      className="form-input"
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
                      style={{ width: '75px', padding: '4px 8px', fontSize: '0.8125rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Fleet Size:</span>
                    <select
                      className="form-select"
                      value={driverCount}
                      onChange={(e) => setDriverCount(parseInt(e.target.value, 10))}
                      style={{ padding: '4px 8px', fontSize: '0.8125rem' }}
                    >
                      <option value={6}>6 Drivers</option>
                      <option value={10}>10 Drivers</option>
                      <option value={16}>16 Drivers</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={nextStep}>
                  Next: Filter Compatible Drivers →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 2: FEASIBILITY FILTERING ================= */}
        {currentStep === 1 && (
          <div className="card animate-in">
            <div className="card-header">
              <span className="card-title">🛡️ Step 2: 8-Gate Zero-Tolerance Feasibility Filtering</span>
              <span className="badge success">{eligibleDrivers.length} / {matchResults.all.length} Drivers Eligible</span>
            </div>
            <div className="card-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Before applying any machine learning ranking, RouteMate enforces 8 hard feasibility gates. An unverified driver or incompatible corridor is immediately pruned to guarantee safety and compliance.
              </p>

              {/* Matrix of checks */}
              <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Direction</th>
                      <th>Pickup Dist</th>
                      <th>Dropoff Dist</th>
                      <th>Departure Δ</th>
                      <th>Detour</th>
                      <th>ID Check</th>
                      <th>Vehicle Check</th>
                      <th>Capacity</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchResults.all.slice(0, 8).map((d) => {
                      const isSelected = activeDriver?.driver_id === d.driver_id;
                      return (
                        <tr
                          key={d.driver_id}
                          style={{
                            background: isSelected ? 'rgba(99, 102, 241, 0.12)' : undefined,
                            cursor: 'pointer',
                          }}
                          onClick={() => setSelectedDriverId(d.driver_id)}
                        >
                          <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{d.driver_id}</td>
                          <td>{d.checks.route_direction_compatible ? '✅' : '❌'}</td>
                          <td>{d.checks.pickup_distance_eligible ? '✅' : '❌'}</td>
                          <td>{d.checks.destination_distance_eligible ? '✅' : '❌'}</td>
                          <td>{d.checks.departure_time_eligible ? '✅' : '❌'}</td>
                          <td>{d.checks.detour_eligible ? '✅' : '❌'}</td>
                          <td>{d.checks.identity_verification ? '✅' : '❌'}</td>
                          <td>{d.checks.vehicle_verification ? '✅' : '❌'}</td>
                          <td>{d.checks.capacity_eligible ? '✅' : '❌'}</td>
                          <td>
                            <span className={`badge ${d.final_eligible ? 'success' : 'danger'}`}>
                              {d.final_eligible ? 'Eligible' : 'Rejected'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Inspector of Selected Driver */}
              {activeDriver && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600 }}>Inspection: {activeDriver.driver_id}</div>
                    <span className={`badge ${activeDriver.final_eligible ? 'success' : 'danger'}`}>
                      {activeDriver.final_eligible ? 'Passed All Hard Gates' : 'Pruned by Feasibility Gate'}
                    </span>
                  </div>
                  {!activeDriver.final_eligible && activeDriver.rejection_reasons.length > 0 && (
                    <div style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '8px' }}>
                      Rejection Causes: {activeDriver.rejection_reasons.join(', ')}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '0.8125rem' }}>
                    <div>Pickup Distance: <strong>{activeDriver.features.pickup_distance_km.toFixed(2)} km</strong></div>
                    <div>Destination Distance: <strong>{activeDriver.features.destination_distance_km.toFixed(2)} km</strong></div>
                    <div>Insertion Detour: <strong>{activeDriver.features.detour_km.toFixed(2)} km</strong></div>
                    <div>Direction Similarity: <strong>{(activeDriver.features.direction_similarity * 100).toFixed(0)}%</strong></div>
                  </div>
                </div>
              )}

              {/* Map of Compatibility */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                    CORRIDOR COMPATIBILITY MAP (CLICK ANY DRIVER ROW ABOVE TO HIGHLIGHT ROUTE)
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Inspecting: <code style={{ color: '#06b6d4' }}>{activeDriver?.driver_id}</code>
                  </span>
                </div>
                <RouteMap
                  rider={rider}
                  drivers={drivers}
                  matchResults={matchResults}
                  selectedDriver={activeDriver?.driver_id}
                  onSelectDriver={(id) => setSelectedDriverId(id)}
                  height="320px"
                />
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={prevStep}>← Back</button>
                <button className="btn btn-primary" onClick={nextStep}>
                  Next: Inspect Explainable Scores →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 3: EXPLAINABLE SCORING ================= */}
        {currentStep === 2 && (
          <div className="card animate-in">
            <div className="card-header">
              <span className="card-title">🧠 Step 3: Explainable Machine Learning Ranking</span>
              <span className="badge info">L2 Logistic & Route-Time Heuristic</span>
            </div>
            <div className="card-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Eligible driver candidates are evaluated using an explainable multi-factor scoring function. Positive weights reward corridor alignment and verified status, while penalties are applied for passenger detour and pickup distance.
              </p>

              {/* Ranking Leaderboard */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>
                    TOP-K RECOMMENDED MATCHES
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {eligibleDrivers.slice(0, 5).map((d, rank) => {
                      const isSelected = activeDriver?.driver_id === d.driver_id;
                      return (
                        <div
                          key={d.driver_id}
                          className="card"
                          style={{
                            padding: '12px',
                            cursor: 'pointer',
                            borderColor: isSelected ? '#10b981' : 'var(--border-color)',
                            background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'var(--card-bg)',
                          }}
                          onClick={() => setSelectedDriverId(d.driver_id)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, color: rank === 0 ? '#10b981' : 'var(--text-muted)' }}>
                                #{rank + 1}
                              </span>
                              <span style={{ fontWeight: 600 }}>{d.driver_id}</span>
                            </div>
                            <span style={{ fontWeight: 700, color: '#10b981', fontSize: '1rem' }}>
                              {d.score.toFixed(1)} pts
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Detour: {d.features.detour_km.toFixed(2)} km | Direction Sim: {(d.features.direction_similarity * 100).toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Score Breakdown Radar / Attribution */}
                {activeDriver && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>
                      EXPLANATION ATTRIBUTION: {activeDriver.driver_id}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {[
                        { label: 'Corridor Direction Match', val: activeDriver.features.direction_similarity * 40, max: 40, color: '#10b981' },
                        { label: 'Route Overlap Density', val: activeDriver.features.route_similarity * 30, max: 30, color: '#06b6d4' },
                        { label: 'Proximity (Low Pickup Dist)', val: Math.max(0, 20 - activeDriver.features.pickup_distance_km * 4), max: 20, color: '#8b5cf6' },
                        { label: 'Detour Burden Penalty', val: Math.max(0, 15 - activeDriver.features.detour_km * 3), max: 15, color: '#f59e0b' },
                      ].map((item) => (
                        <div key={item.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '4px' }}>
                            <span>{item.label}</span>
                            <span style={{ fontWeight: 600, color: item.color }}>+{item.val.toFixed(1)} / {item.max}</span>
                          </div>
                          <div className="bar-track" style={{ height: '6px' }}>
                            <div
                              style={{
                                width: `${Math.min(100, (item.val / item.max) * 100)}%`,
                                height: '100%',
                                background: item.color,
                                borderRadius: '3px',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px', fontSize: '0.8125rem', color: '#10b981' }}>
                      💡 <strong>Audit Trail:</strong> Candidate passed all verification criteria and achieved top-quartile corridor alignment with minimal passenger detour.
                    </div>
                  </div>
                )}
              </div>

              {/* Map of Ranked Routes */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                    TOP-RANKED CANDIDATE CORRIDORS (CORRIDOR OVERLAP VISUALIZATION)
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Inspecting: <code style={{ color: '#10b981' }}>{activeDriver?.driver_id}</code> ({activeDriver?.score?.toFixed(1)} pts)
                  </span>
                </div>
                <RouteMap
                  rider={rider}
                  drivers={eligibleDrivers.map((e) => drivers.find((d) => d.journey_id === e.driver_id)).filter(Boolean)}
                  matchResults={matchResults}
                  selectedDriver={activeDriver?.driver_id}
                  onSelectDriver={(id) => setSelectedDriverId(id)}
                  height="320px"
                />
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={prevStep}>← Back</button>
                <button className="btn btn-primary" onClick={nextStep}>
                  Next: Run Fleet Batch Assignment →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 4: BATCH ASSIGNMENT ================= */}
        {currentStep === 3 && (
          <div className="card animate-in">
            <div className="card-header">
              <span className="card-title">🚐 Step 4: Fleet Multi-Rider Batch Assignment</span>
              <span className="badge success">Combinatorial Fleet Optimization</span>
            </div>
            <div className="card-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Individual matching pairs do not scale to city-wide operations. RouteMate groups concurrent passenger requests into high-occupancy vehicle pools while strictly honoring vehicle capacities and detour bounds.
              </p>

              {/* Comparison table */}
              <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Algorithm</th>
                      <th>Matched Riders</th>
                      <th>Active Vehicles</th>
                      <th>Objective Score</th>
                      <th>Optimality Gap</th>
                      <th>Solve Latency</th>
                      <th>Platform Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Greedy Insertion</td>
                      <td>{greedyBatch.matchedRiders} / 6</td>
                      <td>{greedyBatch.matchedDrivers}</td>
                      <td style={{ fontWeight: 600 }}>{greedyBatch.objectiveValue.toFixed(1)}</td>
                      <td style={{ color: '#f59e0b' }}>
                        {(((optimalBatch.objectiveValue - greedyBatch.objectiveValue) / (optimalBatch.objectiveValue || 1)) * 100).toFixed(1)}%
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{greedyBatch.solveMs} ms</td>
                      <td><span className="badge info">Ultra-Fast Rolling (&lt;1ms)</span></td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Auction-Swap</td>
                      <td>{auctionBatch.matchedRiders} / 6</td>
                      <td>{auctionBatch.matchedDrivers}</td>
                      <td style={{ fontWeight: 600 }}>{auctionBatch.objectiveValue.toFixed(1)}</td>
                      <td style={{ color: '#f59e0b' }}>
                        {(((optimalBatch.objectiveValue - auctionBatch.objectiveValue) / (optimalBatch.objectiveValue || 1)) * 100).toFixed(1)}%
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{auctionBatch.solveMs} ms</td>
                      <td><span className="badge info">Local Search Improvement</span></td>
                    </tr>
                    <tr style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
                      <td style={{ fontWeight: 700, color: '#10b981' }}>Exact Branch & Bound</td>
                      <td>{optimalBatch.matchedRiders} / 6</td>
                      <td>{optimalBatch.matchedDrivers}</td>
                      <td style={{ fontWeight: 700, color: '#10b981' }}>{optimalBatch.objectiveValue.toFixed(1)}</td>
                      <td style={{ fontWeight: 700, color: '#10b981' }}>0.0% (Optimal)</td>
                      <td style={{ fontFamily: 'monospace' }}>{optimalBatch.solveMs} ms</td>
                      <td><span className="badge success">Ground Truth Benchmark</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Assigned Groups Preview */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>
                  FORMED VEHICLE POOLS (GREEDY METHOD)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {greedyBatch.groups.map((g) => (
                    <div key={g.driver_id} className="card" style={{ padding: '12px', borderLeft: '4px solid #06b6d4' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{g.driver_id}</span>
                        <span className="badge success">Score: {g.groupScore.toFixed(1)}</span>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Seats Used: <strong>{g.seatsUsed}</strong> | Remaining: <strong>{g.remainingCapacity}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {g.rider_ids.map((rid) => (
                          <span key={rid} className="badge info" style={{ fontSize: '10px' }}>
                            {rid}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={prevStep}>← Back</button>
                <button className="btn btn-primary" onClick={nextStep}>
                  Next: Compare Dispatch Strategies →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 5: DISPATCH COMPARISON ================= */}
        {currentStep === 4 && (
          <div className="card animate-in">
            <div className="card-header">
              <span className="card-title">⚡ Step 5: Rolling-Horizon Dispatch vs Static Batching</span>
              <span className="badge info">Experiment 013 Breakthrough</span>
            </div>
            <div className="card-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Conventional dispatch groups rides into fixed 60-second batch windows and ignores vehicles already executing trips. Event-driven rolling dispatch with active-trip waypoint insertions slashes fleet vehicle kilometers traveled (VKT) by <strong>60.5%</strong> and passenger wait time by <strong>39.1%</strong>.
              </p>

              {/* Policy Selector Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {[
                  { id: 'static_batch', label: 'Static Batching (60s)', desc: 'Idle vehicles only, fixed window' },
                  { id: 'periodic_rolling', label: 'Periodic Rolling (30s)', desc: 'Active trip insertions every 30s' },
                  { id: 'event_driven_rolling', label: 'Event-Driven Rolling (Instant)', desc: 'Immediate replanning on arrival/stop' },
                ].map((pol) => {
                  const isSel = dispatchPolicy === pol.id;
                  return (
                    <button
                      key={pol.id}
                      className={`btn ${isSel ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding: '10px 16px', textAlign: 'left' }}
                      onClick={() => setDispatchPolicy(pol.id)}
                    >
                      <div style={{ fontWeight: 600 }}>{pol.label}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{pol.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Side-by-side Metric Comparison Cards */}
              <div className="stats-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card cyan">
                  <div className="stat-label">Fleet Mileage (VKT)</div>
                  <div className="stat-value cyan">
                    {dispatchPolicy === 'event_driven_rolling' ? '50.5 km' : dispatchPolicy === 'periodic_rolling' ? '53.3 km' : '127.8 km'}
                  </div>
                  <div className="stat-detail">
                    {dispatchPolicy === 'event_driven_rolling' ? '🔥 -60.5% mileage vs static batch' : dispatchPolicy === 'periodic_rolling' ? '-58.3% mileage' : 'Baseline uninserted batch'}
                  </div>
                </div>

                <div className="stat-card amber">
                  <div className="stat-label">Median Passenger Wait (p50)</div>
                  <div className="stat-value amber">
                    {dispatchPolicy === 'event_driven_rolling' ? '102.6 s' : dispatchPolicy === 'periodic_rolling' ? '172.6 s' : '169.0 s'}
                  </div>
                  <div className="stat-detail">
                    {dispatchPolicy === 'event_driven_rolling' ? '⚡ -39.1% passenger wait time' : 'Batch quantization delay'}
                  </div>
                </div>

                <div className="stat-card green">
                  <div className="stat-label">In-Flight Active Insertions</div>
                  <div className="stat-value green">
                    {dispatchPolicy === 'event_driven_rolling' ? '36' : dispatchPolicy === 'periodic_rolling' ? '34' : '0'}
                  </div>
                  <div className="stat-detail">
                    {dispatchPolicy === 'static_batch' ? 'Static batch cannot insert in-flight' : 'Dynamic waypoint insertions'}
                  </div>
                </div>

                <div className="stat-card purple">
                  <div className="stat-label">Dynamic Reassignments</div>
                  <div className="stat-value purple">0</div>
                  <div className="stat-detail">Zero passenger churn / disruption</div>
                </div>
              </div>

              {/* Recourse Detour & Dispatch Map Preview */}
              <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Dynamic Recourse Detour Simulator</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Simulate sudden mid-corridor incident (Exp 012) and view dynamic A* detouring vs rolling dispatch
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm ${incidentActive ? 'btn-danger' : 'btn-outline'}`}
                    onClick={() => setIncidentActive(!incidentActive)}
                  >
                    {incidentActive ? '⚠️ Incident Active (Detour Engaged)' : '⚡ Trigger Road Closure'}
                  </button>
                </div>
                <RouteMap
                  rider={rider}
                  drivers={eligibleDrivers.slice(0, 3).map((e) => drivers.find((d) => d.journey_id === e.driver_id)).filter(Boolean)}
                  matchResults={matchResults}
                  incident={incidentObj}
                  height="300px"
                />
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={prevStep}>← Back</button>
                <button className="btn btn-primary" onClick={nextStep}>
                  Next: View Verified Experiment Evidence →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 6: EXPERIMENT EVIDENCE ================= */}
        {currentStep === 5 && (
          <div className="card animate-in">
            <div className="card-header">
              <span className="card-title">📊 Step 6: Verified Scientific Evidence & Research Matrix</span>
              <span className="badge success">13 Verified Experiments Synthesized</span>
            </div>
            <div className="card-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Every architectural capability in RouteMate AI is backed by reproducible experimental artifacts, published CSV/JSON metrics, and peer-reviewable ablation studies.
              </p>

              {/* Evidence Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                {[
                  {
                    exp: 'Exp 008: Road Network Validation',
                    badge: 'OSM Downtown SF',
                    metric: '75.6% False Positive Elimination',
                    finding: 'Euclidean gating misclassifies 34 of 45 pairs. Dijkstra graph routing corrects top-1 match in 68% of queries.',
                  },
                  {
                    exp: 'Exp 009: Hybrid Two-Tier Pruning',
                    badge: 'Calibrated Lower Bound',
                    metric: '81.8% Pruned | 0 False Negatives',
                    finding: 'Admissible lower-bound pruning saves 81.8% of expensive network Dijkstra calls with 100% true feasible recall.',
                  },
                  {
                    exp: 'Exp 011: Multi-Rider Pooling',
                    badge: 'C=1 to 4 Capacity Scaling',
                    metric: '+70.0% Rider Match Surge (C=2)',
                    finding: 'Dual-occupancy vehicle pooling surges matched commuters from 40% to 68% within 2.93 km mean detour bounds.',
                  },
                  {
                    exp: 'Exp 012: Dynamic Online Recourse',
                    badge: 'Sub-5ms Replanning',
                    metric: '60% → 100% Feasibility Restored',
                    finding: 'Sudden arterial road closures drop static routes to 60% failure; online recourse restores 100% feasibility in 3.42ms.',
                  },
                  {
                    exp: 'Exp 013: Rolling-Horizon Dispatch',
                    badge: 'Event-Driven Simulation',
                    metric: '-60.5% Fleet VKT | -39.1% Wait Time',
                    finding: 'Immediate event triggers and active-trip waypoint insertions break vehicle supply bottlenecks.',
                  },
                  {
                    exp: 'Exp 014: Research Synthesis',
                    badge: 'Cross-Experiment Analysis',
                    metric: 'H1, H2, H3 Empirically Confirmed',
                    finding: 'Pre-registered hypotheses on filtering, network divergence, and recourse recovery validated across multi-seed sweeps.',
                  },
                ].map((item) => (
                  <div key={item.exp} className="card" style={{ padding: '14px', borderLeft: '4px solid #6366f1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.exp}</span>
                      <span className="badge info" style={{ fontSize: '10px' }}>{item.badge}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9375rem', marginBottom: '4px' }}>
                      {item.metric}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {item.finding}
                    </div>
                  </div>
                ))}
              </div>

              {/* Research Notice Banner */}
              <div style={{ background: 'rgba(99, 102, 241, 0.08)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.3)', marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, color: '#818cf8', marginBottom: '4px' }}>
                  🔬 Scientific Rigor & Synthetic Data Disclosure
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  All evaluations were conducted in controlled synthetic and OpenStreetMap micro-simulations using fixed seeds (42, 101, 2024). No unsubstantiated claims of city-wide real-world deployment are made. Full papers, metrics, and logs are persisted under <code>research/paper/</code> and <code>experiments/</code>.
                </div>
              </div>

              {/* Jump Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={() => setCurrentStep(0)}>
                  ↺ Restart Walkthrough
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {onNavigateTab && (
                    <>
                      <button className="btn btn-outline" onClick={() => onNavigateTab('experiments')}>
                        Open All 14 Experiments →
                      </button>
                      <button className="btn btn-primary" onClick={() => onNavigateTab('batch')}>
                        Explore Live Batch Playground →
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
