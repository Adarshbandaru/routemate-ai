import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import {
  generateBatchScenario,
  runBatchAssignment,
  coordToLL,
  exportToCSV,
} from '../data';
import SolverRace from './common/SolverRace';
import SimulationClockBar from './common/SimulationClockBar';
import ProvenancePopover from './common/ProvenancePopover';
import { useSimulationClock } from '../motion/simulationClock';
import { updateUrlHash } from '../utils/urlState';
import { createBaseTileLayer } from '../utils/mapTiles';
import { Download, Shuffle } from 'lucide-react';

const PALETTE = [
  '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#ef4444', '#84cc16',
  '#a855f7', '#22d3ee', '#34d399', '#fbbf24', '#fb7185',
];

export default function BatchAssignment({
  initialSeed = 99,
  initialMethod = 'greedy',
}) {
  const [seed, setSeed] = useState(initialSeed);
  const [riderCount, setRiderCount] = useState(6);
  const [driverCount, setDriverCount] = useState(10);
  const [method, setMethod] = useState(initialMethod);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

  // Sync with URL hash
  useEffect(() => {
    updateUrlHash('batch', { method, seed }, true);
  }, [method, seed]);

  const { riders, drivers } = useMemo(
    () => generateBatchScenario(seed, riderCount, driverCount),
    [seed, riderCount, driverCount]
  );

  const greedyResult = useMemo(() => runBatchAssignment(riders, drivers, 'greedy'), [riders, drivers]);
  const auctionResult = useMemo(() => runBatchAssignment(riders, drivers, 'auction'), [riders, drivers]);
  const optimalResult = useMemo(() => runBatchAssignment(riders, drivers, 'optimal'), [riders, drivers]);

  const result = method === 'greedy' ? greedyResult : method === 'auction' ? auctionResult : optimalResult;

  const raceSolvers = useMemo(() => ({
    greedy: {
      name: 'Greedy Heuristic',
      objective: greedyResult.objectiveValue,
      solveMs: greedyResult.solveMs,
      gapPct: optimalResult.objectiveValue > 0
        ? Math.max(0, ((optimalResult.objectiveValue - greedyResult.objectiveValue) / optimalResult.objectiveValue) * 100)
        : 0,
      matched: greedyResult.matchedRiders,
      timedOut: false,
    },
    auction: {
      name: 'Auction / Local Swap',
      objective: auctionResult.objectiveValue,
      solveMs: auctionResult.solveMs,
      gapPct: optimalResult.objectiveValue > 0
        ? Math.max(0, ((optimalResult.objectiveValue - auctionResult.objectiveValue) / optimalResult.objectiveValue) * 100)
        : 0,
      matched: auctionResult.matchedRiders,
      timedOut: false,
    },
    optimal: {
      name: 'Exact Branch & Bound',
      objective: optimalResult.objectiveValue,
      solveMs: optimalResult.solveMs,
      gapPct: 0.0,
      matched: optimalResult.matchedRiders,
      timedOut: optimalResult.solveMs >= 2000,
    },
  }), [greedyResult, auctionResult, optimalResult]);

  const clock = useSimulationClock({
    durationSeconds: 45,
    initialSpeed: 1,
    autoPlay: false,
  });

  const handleExport = useCallback(() => {
    const exportData = result.groups.map((g) => ({
      driver_id: g.driver_id,
      rider_ids: g.rider_ids.join('; '),
      seats_used: g.seatsUsed,
      remaining_capacity: g.remainingCapacity,
      group_score: g.groupScore,
    }));
    exportToCSV(exportData, `routemate_batch_${method}_seed${seed}.csv`);
  }, [result, method, seed]);

  // Leaflet Map Rendering
  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([31.2536, 75.7037], 12);

      createBaseTileLayer('google_roadmap').addTo(mapInstanceRef.current);
    }
    const map = mapInstanceRef.current;
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 150);

    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];

    const groupColors = {};
    result.groups.forEach((g, i) => {
      groupColors[g.driver_id] = PALETTE[i % PALETTE.length];
      g.rider_ids.forEach((rid) => {
        groupColors[rid] = PALETTE[i % PALETTE.length];
      });
    });

    const allPoints = [];

    // Draw rider routes
    riders.forEach((rider) => {
      const color = groupColors[rider.journey_id] || '#475569';
      const isInSelected = selectedGroupIdx !== null && result.groups[selectedGroupIdx]?.rider_ids.includes(rider.journey_id);
      const latlngs = rider.route.map(coordToLL);
      allPoints.push(...latlngs);

      const line = L.polyline(latlngs, {
        color,
        weight: isInSelected ? 4 : 2,
        opacity: selectedGroupIdx !== null ? (isInSelected ? 0.95 : 0.15) : 0.6,
        dashArray: '6 4',
      }).addTo(map);

      const marker = L.circleMarker(coordToLL(rider.start), {
        radius: 5,
        fillColor: color,
        color: '#fff',
        weight: 1.5,
        fillOpacity: isInSelected ? 1 : 0.7,
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">Rider Request</div>
          <div style="font-family: var(--font-mono); font-weight: 600; color: #38bdf8;">${rider.journey_id}</div>
          <div style="font-size: 11px; margin-top: 2px;">Assigned to: ${result.groups.find((g) => g.rider_ids.includes(rider.journey_id))?.driver_id || 'Unmatched'}</div>
        </div>
      `).addTo(map);

      layersRef.current.push(line, marker);
    });

    // Draw driver routes
    drivers.forEach((driver) => {
      const isMatched = result.groups.some((g) => g.driver_id === driver.journey_id);
      const color = groupColors[driver.journey_id] || '#334155';
      const isSelected = selectedGroupIdx !== null && result.groups[selectedGroupIdx]?.driver_id === driver.journey_id;
      const latlngs = driver.route.map(coordToLL);
      allPoints.push(...latlngs);

      const line = L.polyline(latlngs, {
        color,
        weight: isSelected ? 5 : isMatched ? 3 : 1.5,
        opacity: selectedGroupIdx !== null ? (isSelected ? 1.0 : 0.15) : isMatched ? 0.85 : 0.25,
      }).addTo(map);

      const marker = L.circleMarker(coordToLL(driver.start), {
        radius: isSelected ? 8 : 6,
        fillColor: color,
        color: isSelected ? '#ffffff' : color,
        weight: 2,
        fillOpacity: isSelected ? 1 : 0.85,
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">Driver Vehicle</div>
          <div style="font-family: var(--font-mono); font-weight: 600;">${driver.journey_id}</div>
          <div style="font-size: 11px; margin-top: 2px;">Status: ${isMatched ? 'Matched Pool' : 'Idle / Unmatched'}</div>
        </div>
      `).addTo(map);

      layersRef.current.push(line, marker);
    });

    if (allPoints.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(allPoints).pad(0.1));
      } catch {}
    }
  }, [result, riders, drivers, selectedGroupIdx]);

  return (
    <div className="animate-in" id="batch-view">
      {/* Header */}
      <div className="section-header" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="section-title">Combinatorial Batch Assignment</h1>
            <p className="section-desc">
              Group concurrent commuter trips into high-occupancy vehicle pools under detour and capacity constraints.
            </p>
          </div>
          <ProvenancePopover experimentId="007_assignment_scaling" />
        </div>
      </div>

      {/* Solver Race Hero Component */}
      <div style={{ marginBottom: '16px' }}>
        <SolverRace
          solvers={raceSolvers}
          activeSolver={method}
          onSelectSolver={setMethod}
        />
      </div>

      {/* Controls Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="batch-seed">Scenario Seed</label>
          <input
            id="batch-seed"
            type="number"
            className="form-input"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
            style={{ width: '80px' }}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="rider-count">Concurrent Riders</label>
          <select
            id="rider-count"
            className="form-select"
            value={riderCount}
            onChange={(e) => setRiderCount(parseInt(e.target.value, 10))}
          >
            <option value={4}>4 Riders</option>
            <option value={6}>6 Riders</option>
            <option value={8}>8 Riders</option>
            <option value={12}>12 Riders</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="driver-count">Available Drivers</label>
          <select
            id="driver-count"
            className="form-select"
            value={driverCount}
            onChange={(e) => setDriverCount(parseInt(e.target.value, 10))}
          >
            <option value={6}>6 Drivers</option>
            <option value={10}>10 Drivers</option>
            <option value={15}>15 Drivers</option>
          </select>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setSeed(Math.floor(Math.random() * 1000))}
        >
          <Shuffle size={14} />
          <span>New Scenario</span>
        </button>

        <button type="button" className="btn btn-outline" onClick={handleExport}>
          <Download size={14} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Telemetry Strip */}
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        <div className="stat-card cyan">
          <div className="stat-label">Objective Value</div>
          <div className="stat-value cyan font-mono">{result.objectiveValue.toFixed(1)}</div>
          <div className="stat-detail">Global weighted matching score</div>
        </div>

        <div className="stat-card green">
          <div className="stat-label">Matched Riders</div>
          <div className="stat-value green font-mono">
            {result.matchedRiders} <span style={{ fontSize: '0.85rem' }}>/ {riders.length}</span>
          </div>
          <div className="stat-detail">
            {((result.matchedRiders / (riders.length || 1)) * 100).toFixed(1)}% fulfillment rate
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-label">Active Fleet Vehicles</div>
          <div className="stat-value amber font-mono">
            {result.matchedDrivers} <span style={{ fontSize: '0.85rem' }}>/ {drivers.length}</span>
          </div>
          <div className="stat-detail">{result.unmatchedDrivers.length} idle vehicles</div>
        </div>

        <div className="stat-card indigo">
          <div className="stat-label">Solve Latency</div>
          <div className="stat-value indigo font-mono">{result.solveMs} ms</div>
          <div className="stat-detail">Graph build: {result.graphMs} ms</div>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <div style={{ marginBottom: '16px' }}>
        <SimulationClockBar clock={clock} title="Assigned Fleet Playback" />
      </div>

      {/* Map & Pools Grid */}
      <div className="grid-sidebar">
        {/* Formed Pools List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="card-header" style={{ padding: '4px 0' }}>
            <span className="text-xs text-muted font-semibold uppercase">Formed Vehicle Pools ({result.groups.length})</span>
            {selectedGroupIdx !== null && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedGroupIdx(null)}
              >
                Clear
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '480px', overflowY: 'auto' }}>
            {result.groups.map((group, idx) => {
              const isSelected = selectedGroupIdx === idx;
              const color = PALETTE[idx % PALETTE.length];
              return (
                <div
                  key={group.driver_id}
                  className={`card ${isSelected ? 'selected-border' : ''}`}
                  style={{ padding: '10px 12px', cursor: 'pointer', borderLeft: `3px solid ${color}` }}
                  onClick={() => setSelectedGroupIdx(isSelected ? null : idx)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="font-mono font-semibold" style={{ fontSize: '0.8125rem' }}>{group.driver_id}</span>
                    <span className="badge success font-mono">Score: {group.groupScore.toFixed(1)}</span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Seats Used: <strong>{group.seatsUsed}</strong> · Remaining: <strong>{group.remainingCapacity}</strong>
                  </div>

                  {/* Capacity Bar */}
                  <div className="score-bar-container" style={{ marginBottom: '6px', height: '4px' }}>
                    <div
                      className="score-bar-fill"
                      style={{
                        width: `${((group.seatsUsed) / (group.seatsUsed + group.remainingCapacity || 1)) * 100}%`,
                        background: color,
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {group.rider_ids.map((rid) => (
                      <span key={rid} className="badge neutral font-mono" style={{ fontSize: '9px', padding: '1px 5px' }}>
                        {rid}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Map */}
        <div className="map-panel-wrapper" style={{ height: '480px', position: 'relative' }}>
          <div ref={mapRef} className="map-container" style={{ height: '100%', width: '100%' }} />
          <div className="map-overlay-badge top-right">
            <span className="badge warning sim-badge">Simulated Batch Run</span>
          </div>
        </div>
      </div>
    </div>
  );
}
