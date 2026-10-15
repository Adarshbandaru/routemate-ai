import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DEMO_RIDE_PRESETS,
  generateSyntheticScenario,
  runMatchingPipeline,
  generateBatchScenario,
  runBatchAssignment,
} from '../data';
import MapPanel from './MapPanel';
import SimulationClockBar from './common/SimulationClockBar';
import ProvenancePopover from './common/ProvenancePopover';
import { useSimulationClock } from '../motion/simulationClock';
import { updateUrlHash } from '../utils/urlState';
import {
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

const STEPS = [
  { id: 'request', num: 1, title: 'Request Ingestion', label: 'Trip Intake' },
  { id: 'filtering', num: 2, title: 'Feasibility Gates', label: '8 Hard Checks' },
  { id: 'ranking', num: 3, title: 'Explainable Ranking', label: 'Multi-Factor Score' },
  { id: 'batch', num: 4, title: 'Batch Assignment', label: 'Combinatorial Pooling' },
  { id: 'dispatch', num: 5, title: 'Rolling Dispatch', label: 'Active Trip Insertion' },
  { id: 'evidence', num: 6, title: 'Verified Evidence', label: 'Empirical Synthesis' },
];

export default function GuidedDemo({ initialPreset = 'lpu_commute', initialStep = 0, onNavigateTab }) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [selectedPreset, setSelectedPreset] = useState(initialPreset);
  const [customSeats, setCustomSeats] = useState(1);
  const seed = 42;
  const driverCount = 12;
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [activeFunnelStage, setActiveFunnelStage] = useState(null);
  const [dispatchPolicy, setDispatchPolicy] = useState('event_driven_rolling');
  const [incidentActive, setIncidentActive] = useState(false);

  // Sync step and preset to URL hash
  useEffect(() => {
    updateUrlHash('demo', { step: currentStep, preset: selectedPreset }, true);
  }, [currentStep, selectedPreset]);

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
      label: 'Simulated GT Road (NH1) Bottleneck / Diversion (+3.2 km)',
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

  // Simulation Clock for Stage 4–5
  const simEvents = useMemo(() => [
    { id: 'ev-dep', time: 5, label: 'Vehicle Departure', type: 'dep' },
    { id: 'ev-pick', time: 18, label: 'Passenger 1 Pickup', type: 'pickup' },
    { id: 'ev-ins', time: 32, label: 'In-Flight Active Trip Insertion', type: 'insertion' },
    { id: 'ev-drop1', time: 48, label: 'Passenger 1 Drop-off', type: 'dropoff' },
    { id: 'ev-drop2', time: 58, label: 'Passenger 2 Final Drop-off', type: 'dropoff' },
  ], []);

  const clock = useSimulationClock({
    durationSeconds: 60,
    initialSpeed: 1,
    events: simEvents,
    autoPlay: false,
  });

  // Animated moving vehicles on the real route polylines
  const animatedVehicles = useMemo(() => {
    if (currentStep < 3) return [];
    const selectedDriverObj = drivers.find((d) => d.journey_id === (topDriver?.driver_id || drivers[0]?.journey_id));
    if (!selectedDriverObj) return [];

    return [
      {
        id: selectedDriverObj.journey_id,
        route: selectedDriverObj.route,
        color: '#06b6d4',
        kind: 'car',
        status: clock.currentTime >= 48 ? 'completed' : 'active',
      },
    ];
  }, [currentStep, drivers, topDriver, clock.currentTime]);

  const nextStep = useCallback(() => {
    setCurrentStep((s) => Math.min(STEPS.length - 1, s + 1));
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  // Compute funnel counts for Step 2
  const funnelStages = useMemo(() => {
    const total = matchResults.stats.total;
    const directionFailed = matchResults.all.filter((r) => !r.route_direction_compatible).length;
    const prunedCount = total - directionFailed;
    const gatedCount = matchResults.stats.eligible_count;
    const rankedCount = matchResults.stats.eligible_count;
    const assignedCount = Math.min(1, rankedCount);

    return [
      { id: 'retrieved', label: 'Retrieved', count: total, desc: 'Spatial corridor ingestion' },
      { id: 'pruned', label: 'Pruned', count: prunedCount, desc: 'Admissible lower-bound circuity cut' },
      { id: 'gated', label: 'Gated', count: gatedCount, desc: '8 hard zero-tolerance checks' },
      { id: 'ranked', label: 'Ranked', count: rankedCount, desc: 'Multi-factor weighted score' },
      { id: 'assigned', label: 'Assigned', count: assignedCount, desc: 'Optimal driver pairing' },
    ];
  }, [matchResults]);

  return (
    <div className="demo-layout animate-in" id="guided-demo-flow">
      {/* 1. Compact Header */}
      <div className="demo-header-row">
        <div className="demo-brand-title">
          <span className="demo-brand-label">RouteMate AI</span>
          <span className="demo-brand-sep">|</span>
          <span className="demo-brand-section">Guided Demo</span>
        </div>
        <div className="demo-step-counter">
          Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep].title}
        </div>
        <div className="demo-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-xs text-muted"
            onClick={() => setCurrentStep(0)}
            title="Reset to Step 1"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* 2. Step-Specific Controls Bar (Clean, unnested, airy) */}
      {currentStep === 0 && (
        <div className="demo-controls-bar">
          <div className="demo-ctrl-item">
            <label className="demo-ctrl-label" htmlFor="preset-select">Preset</label>
            <select
              id="preset-select"
              className="demo-select font-mono"
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
            >
              {DEMO_RIDE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div className="demo-ctrl-item">
            <span className="demo-ctrl-label">Party Size</span>
            <div className="demo-pill-group">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`demo-pill-btn ${customSeats === num ? 'active' : ''}`}
                  onClick={() => setCustomSeats(num)}
                >
                  {num} {num === 1 ? 'Seat' : 'Seats'}
                </button>
              ))}
            </div>
          </div>

          <div className="demo-ctrl-item" style={{ flex: '1 1 auto', minWidth: '220px' }}>
            <span className="demo-ctrl-label">Corridor</span>
            <span className="demo-ctrl-text">
              <strong>{preset.subtitle}</strong> · <span className="text-muted">{preset.notes}</span>
            </span>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="demo-funnel-bar">
          <span className="demo-funnel-title">Decision Funnel:</span>
          <div className="demo-funnel-nodes">
            {funnelStages.map((stage, idx) => {
              const isSelected = activeFunnelStage === stage.id;
              return (
                <div key={stage.id} className="demo-funnel-node-wrap">
                  <button
                    type="button"
                    className={`demo-funnel-node ${isSelected ? 'active' : ''}`}
                    onClick={() => setActiveFunnelStage(isSelected ? null : stage.id)}
                    title={stage.desc}
                  >
                    <span className="demo-funnel-node-label">{stage.label}</span>
                    <span className="demo-funnel-node-count font-mono">({stage.count})</span>
                  </button>
                  {idx < funnelStages.length - 1 && (
                    <span className="demo-funnel-arrow">→</span>
                  )}
                </div>
              );
            })}
          </div>
          {activeFunnelStage && (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-muted"
              onClick={() => setActiveFunnelStage(null)}
              style={{ marginLeft: 'auto' }}
            >
              Clear Filter
            </button>
          )}
        </div>
      )}

      {currentStep === 2 && (
        <div className="demo-controls-bar">
          <span className="demo-ctrl-label">Top Matches:</span>
          <div className="demo-candidates-inline">
            {eligibleDrivers.slice(0, 3).map((cand, idx) => {
              const isSelected = activeDriver?.driver_id === cand.driver_id;
              return (
                <button
                  key={cand.driver_id}
                  type="button"
                  className={`demo-candidate-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedDriverId(cand.driver_id)}
                >
                  <span className="font-mono font-bold">#{idx + 1} {cand.driver_id}</span>
                  <span className="badge success font-mono">{cand.score.toFixed(1)}/100</span>
                  <span className="text-muted text-xs">
                    Pickup {cand.features.pickup_distance_km.toFixed(1)} km · Detour {cand.features.detour_km.toFixed(1)} km
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className="demo-controls-bar" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 360px', minWidth: '280px' }}>
            <SimulationClockBar clock={clock} events={simEvents} title="Route Playback" />
          </div>
          <div className="demo-inline-metrics">
            <span className="demo-ctrl-label">Solver Bench:</span>
            <span className="demo-metric-pill">
              Greedy: <strong>9.3% gap</strong> <span className="text-muted">({greedyBatch.solveMs}ms)</span>
            </span>
            <span className="demo-metric-pill">
              Auction: <strong>4.1% gap</strong> <span className="text-muted">({auctionBatch.solveMs}ms)</span>
            </span>
            <span className="demo-metric-pill highlight">
              Exact B&B: <strong>Optimal</strong> <span className="text-muted">({optimalBatch.solveMs}ms)</span>
            </span>
          </div>
        </div>
      )}

      {currentStep === 4 && (
        <div className="demo-controls-bar" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label className="demo-ctrl-label" htmlFor="dispatch-policy-select">Policy</label>
            <select
              id="dispatch-policy-select"
              className="demo-select font-mono"
              value={dispatchPolicy}
              onChange={(e) => setDispatchPolicy(e.target.value)}
            >
              <option value="event_driven_rolling">Event-Driven Rolling (Instant Insertions)</option>
              <option value="periodic_rolling">Periodic Rolling (30s Window)</option>
              <option value="static_batch">Static Batching (60s Baseline)</option>
            </select>
            <button
              type="button"
              className={`btn btn-xs ${incidentActive ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => setIncidentActive(!incidentActive)}
            >
              {incidentActive ? 'Closure Active (Recourse Reroute)' : 'Simulate GT Road Closure'}
            </button>
          </div>
          <div className="demo-inline-metrics font-mono text-xs">
            <span>Fleet VKT: <strong className="text-cyan">{dispatchPolicy === 'event_driven_rolling' ? '50.45 km (-60.5%)' : dispatchPolicy === 'periodic_rolling' ? '53.34 km (-58.3%)' : '127.78 km'}</strong></span>
            <span className="demo-sep">·</span>
            <span>Wait: <strong className="text-amber">{dispatchPolicy === 'event_driven_rolling' ? '102.6s (-39.1%)' : '169.0s'}</strong></span>
            <span className="demo-sep">·</span>
            <span>Insertions: <strong className="text-success">{dispatchPolicy === 'event_driven_rolling' ? '36' : dispatchPolicy === 'periodic_rolling' ? '34' : '0'}</strong></span>
          </div>
        </div>
      )}

      {/* 3. Hero Leaflet Map (Dominates 70–80% of screen height for Steps 1–5) */}
      {currentStep < 5 ? (
        <div className="demo-map-wrap">
          <MapPanel
            rider={rider}
            drivers={drivers}
            matchResults={matchResults}
            activeFunnelStage={activeFunnelStage}
            selectedDriver={activeDriver?.driver_id}
            onSelectDriver={(id) => setSelectedDriverId(id)}
            incident={incidentObj}
            animatedVehicles={animatedVehicles}
            simulationProgress={clock.progress}
            height="calc(100vh - 240px)"
          />
        </div>
      ) : (
        /* Step 6: Verified Empirical Evidence (Linear-style clean audit grid) */
        <div className="demo-evidence-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {[
              {
                expId: '008_road_network_validation',
                title: 'Exp 008: Road Network Validation',
                metric: '75.6% False Positive Elimination',
                desc: 'Euclidean gating misclassifies 34 of 45 pairs. Directed Dijkstra routing corrects top-1 match in 68% of queries.',
              },
              {
                expId: '009_hybrid_pruning',
                title: 'Exp 009: Hybrid Two-Tier Pruning',
                metric: '81.78% Pruned · 0 False Negatives',
                desc: 'Geodesic lower-bound pruning saves 81.78% of expensive routing calls with 100% true feasible recall.',
              },
              {
                expId: '012_dynamic_recourse',
                title: 'Exp 012: Dynamic Online Recourse',
                metric: '60% → 100% Feasibility Restored',
                desc: 'Arterial street closures drop static routes to 60% failure; online A* recourse restores 100% feasibility in 3.42 ms.',
              },
              {
                expId: '013_rolling_dispatch',
                title: 'Exp 013: Rolling-Horizon Dispatch',
                metric: '-60.5% Fleet VKT · -39.1% Wait',
                desc: 'Immediate event triggers and active-trip waypoint insertions prevent vehicle supply bottlenecks.',
              },
              {
                expId: '005_classical_ml',
                title: 'Exp 005: Supervised ML Benchmark',
                metric: 'ML Ranker = Heuristic (P@3 0.783)',
                desc: 'L2 logistic regression did not dominate explainable multi-factor scoring. Preserved as an honest negative result.',
              },
              {
                expId: '007_assignment_scaling',
                title: 'Exp 007: Assignment Combinatorics',
                metric: 'Exact Solver Timeout at 40x20',
                desc: 'Branch & Bound exceeds timeout at scale. Greedy heuristic achieves 9.3% mean gap with 36,000x speedup.',
              },
            ].map((item) => (
              <div
                key={item.expId}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px 16px',
                  borderLeft: '3px solid var(--accent-primary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{item.title}</span>
                  <ProvenancePopover experimentId={item.expId} />
                </div>
                <div className="font-mono text-success" style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '6px' }}>
                  {item.metric}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.desc}</p>
              </div>
            ))}
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <AlertTriangle size={15} className="text-amber" />
              <span className="font-semibold" style={{ fontSize: '0.8125rem' }}>Research Integrity & Domain Boundaries</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Baseline experiments (001–014) are verified on OpenStreetMap street networks and calibrated synthetic corridors.
              Travel times derive from BPR speed-flow volume delay curves and Dijkstra shortest paths. Core algorithmic models optimize passenger cars; micromobility sprites are illustrative.
            </p>
          </div>
        </div>
      )}

      {/* 4. Action Footer (Airy, clean, unnested) */}
      <div className="demo-actions-footer">
        <div>
          {currentStep > 0 && (
            <button type="button" className="btn btn-outline btn-sm" onClick={prevStep}>
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {currentStep < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={nextStep}>
              <span>Next: {STEPS[currentStep + 1].title}</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setCurrentStep(0)}>
                <RotateCcw size={13} />
                <span>Restart Demo</span>
              </button>
              {onNavigateTab && (
                <>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onNavigateTab('experiments')}>
                    Inspect Experiments →
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigateTab('playground')}>
                    Match Playground →
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
