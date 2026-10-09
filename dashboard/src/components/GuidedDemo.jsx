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
  { id: 'request', num: 1, title: 'Request Ingestion', label: 'Trip Intake' },
  { id: 'filtering', num: 2, title: 'Feasibility Gates', label: '8 Hard Checks' },
  { id: 'ranking', num: 3, title: 'Explainable Ranking', label: 'Multi-Factor Score' },
  { id: 'batch', num: 4, title: 'Batch Assignment', label: 'Combinatorial Pooling' },
  { id: 'dispatch', num: 5, title: 'Rolling Dispatch', label: 'Active Trip Insertion' },
  { id: 'evidence', num: 6, title: 'Verified Evidence', label: 'Empirical Synthesis' },
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
    const route = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      latitude: preset.start.latitude + (preset.destination.latitude - preset.start.latitude) * t,
      longitude: preset.start.longitude + (preset.destination.longitude - preset.start.longitude) * t,
    }));
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
      {/* Workflow Stepper Bar */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-body" style={{ padding: '12px' }}>
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
                  <div className="demo-step-top">
                    <span className="demo-step-num">0{s.num}</span>
                    {isPast && <span style={{ color: '#10b981', fontSize: '10px', fontWeight: 700 }}>✓</span>}
                  </div>
                  <div className="demo-step-title">{s.title}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.label}</div>
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
              <div>
                <span className="card-title">Step 1 · Commuter Request Ingestion</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Ingest origin, destination coordinates, seat requirements, and departure window
                </span>
              </div>
              <span className="badge info">Intake Stage</span>
            </div>
            <div className="card-body">
              {/* Presets Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '18px' }}>
                {DEMO_RIDE_PRESETS.map((p) => {
                  const isSelected = p.id === selectedPreset;
                  return (
                    <div
                      key={p.id}
                      className="card"
                      style={{
                        padding: '12px 14px',
                        cursor: 'pointer',
                        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                        background: isSelected ? 'var(--bg-active)' : 'var(--bg-card-subtle)',
                        boxShadow: isSelected ? '0 0 0 1px var(--accent-primary)' : undefined,
                      }}
                      onClick={() => setSelectedPreset(p.id)}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '2px' }}>{p.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{p.subtitle}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.notes}</div>
                    </div>
                  );
                })}
              </div>

              {/* Request Parameters Form */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                background: 'var(--bg-hover)',
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '18px',
              }}>
                <div>
                  <label className="form-label">Rider Identifier</label>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 600, color: '#38bdf8' }}>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {preset.start.latitude.toFixed(4)}, {preset.start.longitude.toFixed(4)}
                  </div>
                </div>
                <div>
                  <label className="form-label">Destination Coordinate</label>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {preset.destination.latitude.toFixed(4)}, {preset.destination.longitude.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Map Preview of Request */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Commute Route Corridor (San Francisco Metro)
                </div>
                <RouteMap rider={rider} height="280px" />
              </div>

              {/* Bottom Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Seed:</span>
                    <input
                      className="form-input"
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
                      style={{ width: '70px', padding: '3px 6px', fontSize: '0.75rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fleet Pool:</span>
                    <select
                      className="form-select"
                      value={driverCount}
                      onChange={(e) => setDriverCount(parseInt(e.target.value, 10))}
                      style={{ padding: '3px 6px', fontSize: '0.75rem' }}
                    >
                      <option value={6}>6 Candidates</option>
                      <option value={10}>10 Candidates</option>
                      <option value={16}>16 Candidates</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={nextStep}>
                  Proceed to Feasibility Filtering →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 2: FEASIBILITY FILTERING ================= */}
        {currentStep === 1 && (
          <div className="card animate-in">
            <div className="card-header">
              <div>
                <span className="card-title">Step 2 · 8-Gate Zero-Tolerance Feasibility Filtering</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Prior to ranking, hard constraints eliminate unverified drivers and incompatible corridors
                </span>
              </div>
              <span className="badge success">{eligibleDrivers.length} / {matchResults.all.length} Eligible</span>
            </div>
            <div className="card-body">
              {/* Matrix of checks */}
              <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
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
                            background: isSelected ? 'var(--bg-active)' : undefined,
                            cursor: 'pointer',
                          }}
                          onClick={() => setSelectedDriverId(d.driver_id)}
                        >
                          <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{d.driver_id}</td>
                          <td>{d.checks.route_direction_compatible ? '✓' : '✕'}</td>
                          <td>{d.checks.pickup_distance_eligible ? '✓' : '✕'}</td>
                          <td>{d.checks.destination_distance_eligible ? '✓' : '✕'}</td>
                          <td>{d.checks.departure_time_eligible ? '✓' : '✕'}</td>
                          <td>{d.checks.detour_eligible ? '✓' : '✕'}</td>
                          <td>{d.checks.identity_verification ? '✓' : '✕'}</td>
                          <td>{d.checks.vehicle_verification ? '✓' : '✕'}</td>
                          <td>{d.checks.capacity_eligible ? '✓' : '✕'}</td>
                          <td>
                            <span className={`badge ${d.final_eligible ? 'success' : 'danger'}`}>
                              {d.final_eligible ? 'ELIGIBLE' : 'REJECTED'}
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
                <div style={{
                  background: 'var(--bg-hover)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                      Inspecting Candidate: <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{activeDriver.driver_id}</span>
                    </div>
                    <span className={`badge ${activeDriver.final_eligible ? 'success' : 'danger'}`}>
                      {activeDriver.final_eligible ? 'PASSED 8/8 HARD GATES' : 'PRUNED BY CONSTRAINTS'}
                    </span>
                  </div>
                  {!activeDriver.final_eligible && activeDriver.rejection_reasons.length > 0 && (
                    <div style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                      Rejection Causes: {activeDriver.rejection_reasons.join(', ')}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '0.75rem' }}>
                    <div>Pickup Distance: <strong>{activeDriver.features.pickup_distance_km.toFixed(2)} km</strong></div>
                    <div>Destination Distance: <strong>{activeDriver.features.destination_distance_km.toFixed(2)} km</strong></div>
                    <div>Insertion Detour: <strong>{activeDriver.features.detour_km.toFixed(2)} km</strong></div>
                    <div>Direction Match: <strong>{(activeDriver.features.direction_similarity * 100).toFixed(0)}%</strong></div>
                  </div>
                </div>
              )}

              {/* Map of Compatibility */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    Corridor Compatibility Overlay (Click row above to highlight)
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Active: <code style={{ color: '#0ea5e9' }}>{activeDriver?.driver_id}</code>
                  </span>
                </div>
                <RouteMap
                  rider={rider}
                  drivers={drivers}
                  matchResults={matchResults}
                  selectedDriver={activeDriver?.driver_id}
                  onSelectDriver={(id) => setSelectedDriverId(id)}
                  height="300px"
                />
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={prevStep}>← Back</button>
                <button className="btn btn-primary" onClick={nextStep}>
                  Proceed to Explainable Scoring →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 3: EXPLAINABLE SCORING ================= */}
        {currentStep === 2 && (
          <div className="card animate-in">
            <div className="card-header">
              <div>
                <span className="card-title">Step 3 · Explainable Multi-Factor Ranking</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Eligible candidates scored via calibrated weights rewarding overlap and penalizing passenger detour
                </span>
              </div>
              <span className="badge info">Ranking Engine</span>
            </div>
            <div className="card-body">
              {/* Ranking Leaderboard */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Ranked Candidates (Top-K)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {eligibleDrivers.slice(0, 5).map((d, rank) => {
                      const isSelected = activeDriver?.driver_id === d.driver_id;
                      return (
                        <div
                          key={d.driver_id}
                          className="card"
                          style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                            background: isSelected ? 'var(--bg-active)' : 'var(--bg-card-subtle)',
                          }}
                          onClick={() => setSelectedDriverId(d.driver_id)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: rank === 0 ? '#10b981' : 'var(--text-muted)' }}>
                                #{rank + 1}
                              </span>
                              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>{d.driver_id}</span>
                            </div>
                            <span style={{ fontWeight: 700, color: '#34d399', fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>
                              {d.score.toFixed(1)} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>pts</span>
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            Detour: {d.features.detour_km.toFixed(2)} km · Direction: {(d.features.direction_similarity * 100).toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Score Breakdown Attribution */}
                {activeDriver && (
                  <div style={{ background: 'var(--bg-hover)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, marginBottom: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Factor Attribution · {activeDriver.driver_id}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { label: 'Corridor Direction Match', val: activeDriver.features.direction_similarity * 40, max: 40, color: '#10b981' },
                        { label: 'Route Overlap Density', val: activeDriver.features.route_similarity * 30, max: 30, color: '#0ea5e9' },
                        { label: 'Proximity (Low Pickup Dist)', val: Math.max(0, 20 - activeDriver.features.pickup_distance_km * 4), max: 20, color: '#6366f1' },
                        { label: 'Detour Burden Penalty', val: Math.max(0, 15 - activeDriver.features.detour_km * 3), max: 15, color: '#f59e0b' },
                      ].map((item) => (
                        <div key={item.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
                            <span>{item.label}</span>
                            <span style={{ fontWeight: 600, color: item.color, fontFamily: 'var(--font-mono)' }}>
                              +{item.val.toFixed(1)} / {item.max}
                            </span>
                          </div>
                          <div className="bar-track" style={{ height: '5px' }}>
                            <div
                              style={{
                                width: `${Math.min(100, (item.val / item.max) * 100)}%`,
                                height: '100%',
                                background: item.color,
                                borderRadius: '2px',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '12px', padding: '8px 10px', background: 'var(--accent-success-subtle)', borderRadius: 'var(--radius-xs)', fontSize: '0.725rem', color: '#34d399' }}>
                      Candidate meets all compliance criteria with minimal passenger detour penalty.
                    </div>
                  </div>
                )}
              </div>

              {/* Map of Ranked Routes */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    Ranked Corridors Geographic View
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Inspecting: <code style={{ color: '#10b981' }}>{activeDriver?.driver_id}</code> ({activeDriver?.score?.toFixed(1)} pts)
                  </span>
                </div>
                <RouteMap
                  rider={rider}
                  drivers={eligibleDrivers.map((e) => drivers.find((d) => d.journey_id === e.driver_id)).filter(Boolean)}
                  matchResults={matchResults}
                  selectedDriver={activeDriver?.driver_id}
                  onSelectDriver={(id) => setSelectedDriverId(id)}
                  height="300px"
                />
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={prevStep}>← Back</button>
                <button className="btn btn-primary" onClick={nextStep}>
                  Proceed to Fleet Batch Assignment →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 4: BATCH ASSIGNMENT ================= */}
        {currentStep === 3 && (
          <div className="card animate-in">
            <div className="card-header">
              <div>
                <span className="card-title">Step 4 · Combinatorial Fleet Batch Assignment</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Group concurrent passenger demands into multi-rider vehicle pools honoring capacities and detour limits
                </span>
              </div>
              <span className="badge success">Fleet Optimization</span>
            </div>
            <div className="card-body">
              {/* Comparison table */}
              <div style={{ overflowX: 'auto', marginBottom: '18px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Algorithm</th>
                      <th>Matched Riders</th>
                      <th>Active Vehicles</th>
                      <th>Objective Score</th>
                      <th>Optimality Gap</th>
                      <th>Solve Latency</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Greedy Heuristic</td>
                      <td>{greedyBatch.matchedRiders} / 6</td>
                      <td>{greedyBatch.matchedDrivers}</td>
                      <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{greedyBatch.objectiveValue.toFixed(1)}</td>
                      <td style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                        {(((optimalBatch.objectiveValue - greedyBatch.objectiveValue) / (optimalBatch.objectiveValue || 1)) * 100).toFixed(1)}%
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{greedyBatch.solveMs} ms</td>
                      <td><span className="badge info">Ultra-Fast Rolling (&lt;1ms)</span></td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Auction-Swap</td>
                      <td>{auctionBatch.matchedRiders} / 6</td>
                      <td>{auctionBatch.matchedDrivers}</td>
                      <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{auctionBatch.objectiveValue.toFixed(1)}</td>
                      <td style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                        {(((optimalBatch.objectiveValue - auctionBatch.objectiveValue) / (optimalBatch.objectiveValue || 1)) * 100).toFixed(1)}%
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{auctionBatch.solveMs} ms</td>
                      <td><span className="badge info">Local Search Improvement</span></td>
                    </tr>
                    <tr style={{ background: 'var(--accent-success-subtle)' }}>
                      <td style={{ fontWeight: 700, color: '#34d399' }}>Exact Branch & Bound</td>
                      <td>{optimalBatch.matchedRiders} / 6</td>
                      <td>{optimalBatch.matchedDrivers}</td>
                      <td style={{ fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>{optimalBatch.objectiveValue.toFixed(1)}</td>
                      <td style={{ fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>0.0% (Optimal)</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{optimalBatch.solveMs} ms</td>
                      <td><span className="badge success">Ground Truth Benchmark</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Formed vehicle pools */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Formed High-Occupancy Pools (Greedy Method)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {greedyBatch.groups.map((g) => (
                    <div key={g.driver_id} className="card" style={{ padding: '10px 12px', borderLeft: '3px solid #0ea5e9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{g.driver_id}</span>
                        <span className="badge success">Score: {g.groupScore.toFixed(1)}</span>
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Seats Used: <strong>{g.seatsUsed}</strong> · Remaining: <strong>{g.remainingCapacity}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {g.rider_ids.map((rid) => (
                          <span key={rid} className="badge neutral" style={{ fontSize: '9px', padding: '1px 5px' }}>
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
                  Proceed to Dispatch Strategies →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 5: DISPATCH COMPARISON ================= */}
        {currentStep === 4 && (
          <div className="card animate-in">
            <div className="card-header">
              <div>
                <span className="card-title">Step 5 · Rolling-Horizon Dispatch vs Static Batching</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Evaluate dynamic in-flight waypoint insertions against conventional batch quantization windows
                </span>
              </div>
              <span className="badge info">Exp 013 Benchmark</span>
            </div>
            <div className="card-body">
              {/* Policy Selector Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[
                  { id: 'static_batch', label: 'Static Batching (60s)', desc: 'Idle fleet only, fixed window' },
                  { id: 'periodic_rolling', label: 'Periodic Rolling (30s)', desc: 'Active trip insertions every 30s' },
                  { id: 'event_driven_rolling', label: 'Event-Driven Rolling (Instant)', desc: 'Immediate replan on arrivals' },
                ].map((pol) => {
                  const isSel = dispatchPolicy === pol.id;
                  return (
                    <button
                      key={pol.id}
                      className={`btn ${isSel ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding: '8px 12px', textAlign: 'left' }}
                      onClick={() => setDispatchPolicy(pol.id)}
                    >
                      <div style={{ fontWeight: 600 }}>{pol.label}</div>
                      <div style={{ fontSize: '0.6875rem', opacity: 0.8 }}>{pol.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Telemetry Cards */}
              <div className="stats-grid" style={{ marginBottom: '18px' }}>
                <div className="stat-card cyan">
                  <div className="stat-label">Fleet Mileage (VKT)</div>
                  <div className="stat-value cyan">
                    {dispatchPolicy === 'event_driven_rolling' ? '50.5 km' : dispatchPolicy === 'periodic_rolling' ? '53.3 km' : '127.8 km'}
                  </div>
                  <div className="stat-detail">
                    {dispatchPolicy === 'event_driven_rolling' ? '-60.5% vs static batch' : dispatchPolicy === 'periodic_rolling' ? '-58.3% mileage' : 'Baseline uninserted batch'}
                  </div>
                </div>

                <div className="stat-card amber">
                  <div className="stat-label">Median Wait (P50)</div>
                  <div className="stat-value amber">
                    {dispatchPolicy === 'event_driven_rolling' ? '102.6 s' : dispatchPolicy === 'periodic_rolling' ? '172.6 s' : '169.0 s'}
                  </div>
                  <div className="stat-detail">
                    {dispatchPolicy === 'event_driven_rolling' ? '-39.1% passenger latency' : 'Batch quantization delay'}
                  </div>
                </div>

                <div className="stat-card green">
                  <div className="stat-label">In-Flight Insertions</div>
                  <div className="stat-value green">
                    {dispatchPolicy === 'event_driven_rolling' ? '36' : dispatchPolicy === 'periodic_rolling' ? '34' : '0'}
                  </div>
                  <div className="stat-detail">
                    {dispatchPolicy === 'static_batch' ? 'Static batch cannot insert in-flight' : 'Dynamic waypoint insertions'}
                  </div>
                </div>

                <div className="stat-card indigo">
                  <div className="stat-label">Dynamic Reassignments</div>
                  <div className="stat-value indigo">0</div>
                  <div className="stat-detail">Zero passenger churn / disruption</div>
                </div>
              </div>

              {/* Recourse Detour & Dispatch Map Preview */}
              <div style={{ marginBottom: '18px', padding: '14px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Dynamic Online Recourse Simulator</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
                      Simulate sudden mid-corridor incident (Exp 012) and view dynamic A* detouring vs rolling dispatch
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm ${incidentActive ? 'btn-danger' : 'btn-outline'}`}
                    onClick={() => setIncidentActive(!incidentActive)}
                  >
                    {incidentActive ? 'Incident Active (Detour Engaged)' : 'Trigger Arterial Closure'}
                  </button>
                </div>
                <RouteMap
                  rider={rider}
                  drivers={eligibleDrivers.slice(0, 3).map((e) => drivers.find((d) => d.journey_id === e.driver_id)).filter(Boolean)}
                  matchResults={matchResults}
                  incident={incidentObj}
                  height="280px"
                />
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={prevStep}>← Back</button>
                <button className="btn btn-primary" onClick={nextStep}>
                  Proceed to Scientific Evidence →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 6: EXPERIMENT EVIDENCE ================= */}
        {currentStep === 5 && (
          <div className="card animate-in">
            <div className="card-header">
              <div>
                <span className="card-title">Step 6 · Verified Scientific Evidence & Research Matrix</span>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  14 empirical benchmarks confirming filtering guarantees, network circuity divergence, and recourse recovery
                </span>
              </div>
              <span className="badge success">Empirical Synthesis</span>
            </div>
            <div className="card-body">
              {/* Evidence Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '18px' }}>
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
                    metric: '81.8% Pruned · 0 False Negatives',
                    finding: 'Admissible lower-bound pruning saves 81.8% of expensive network Dijkstra calls with 100% true feasible recall.',
                  },
                  {
                    exp: 'Exp 011: Multi-Rider Pooling',
                    badge: 'Capacity Scaling',
                    metric: '+70.0% Match Surge (C=2)',
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
                    metric: '-60.5% Fleet VKT · -39.1% Wait',
                    finding: 'Immediate event triggers and active-trip waypoint insertions break vehicle supply bottlenecks.',
                  },
                  {
                    exp: 'Exp 014: Research Synthesis',
                    badge: 'Multi-Seed Sweeps',
                    metric: 'H1, H2, H3 Empirically Confirmed',
                    finding: 'Pre-registered hypotheses on filtering, network divergence, and recourse recovery validated across seeds (42, 101, 2024).',
                  },
                ].map((item) => (
                  <div key={item.exp} className="card" style={{ padding: '12px 14px', borderLeft: '3px solid #3b82f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{item.exp}</span>
                      <span className="badge info" style={{ fontSize: '9px' }}>{item.badge}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#34d399', fontSize: '0.875rem', marginBottom: '4px' }}>
                      {item.metric}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {item.finding}
                    </div>
                  </div>
                ))}
              </div>

              {/* Research Notice Banner */}
              <div style={{
                background: 'var(--bg-hover)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '18px',
              }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8125rem', marginBottom: '3px' }}>
                  Scientific Rigor & Synthetic Data Disclosure
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  All evaluations were conducted in controlled synthetic and OpenStreetMap road graph micro-simulations using fixed seeds (42, 101, 2024). No unsubstantiated claims of city-wide real-world deployment are made. Full papers, metrics, and logs are persisted under <code>research/paper/</code> and <code>experiments/</code>.
                </div>
              </div>

              {/* Jump Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => setCurrentStep(0)}>
                  Restart Walkthrough
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {onNavigateTab && (
                    <>
                      <button className="btn btn-outline" onClick={() => onNavigateTab('experiments')}>
                        Open All 14 Experiments →
                      </button>
                      <button className="btn btn-primary" onClick={() => onNavigateTab('batch')}>
                        Explore Batch Assignment →
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
