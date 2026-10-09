import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import {
  generateBatchScenario,
  runBatchAssignment,
  coordToLL,
  exportToCSV,
} from '../data';

const PALETTE = [
  '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#ef4444', '#84cc16',
  '#a855f7', '#22d3ee', '#34d399', '#fbbf24', '#fb7185',
];

export default function BatchAssignment() {
  const [seed, setSeed] = useState(99);
  const [riderCount, setRiderCount] = useState(6);
  const [driverCount, setDriverCount] = useState(10);
  const [method, setMethod] = useState('greedy');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

  const { riders, drivers } = useMemo(
    () => generateBatchScenario(seed, riderCount, driverCount),
    [seed, riderCount, driverCount]
  );

  const greedyResult = useMemo(() => runBatchAssignment(riders, drivers, 'greedy'), [riders, drivers]);
  const auctionResult = useMemo(() => runBatchAssignment(riders, drivers, 'auction'), [riders, drivers]);
  const optimalResult = useMemo(() => runBatchAssignment(riders, drivers, 'optimal'), [riders, drivers]);

  const result = method === 'greedy' ? greedyResult : method === 'auction' ? auctionResult : optimalResult;

  const handleExport = useCallback(() => {
    const exportData = result.groups.map((g) => ({
      driver_id: g.driver_id,
      rider_ids: g.rider_ids.join('; '),
      seats_used: g.seatsUsed,
      remaining_capacity: g.remainingCapacity,
      group_score: g.groupScore,
    }));
    exportToCSV(exportData, `batch_assignment_${method}_${seed}.csv`);
  }, [result, method, seed]);

  // Map rendering
  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([37.7749, -122.4194], 13);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    }
    const map = mapInstanceRef.current;
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // map unmounted
      }
    }, 150);
    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];

    // Build a color map for groups
    const groupColors = {};
    result.groups.forEach((g, i) => {
      groupColors[g.driver_id] = PALETTE[i % PALETTE.length];
      g.rider_ids.forEach((rid) => {
        groupColors[rid] = PALETTE[i % PALETTE.length];
      });
    });

    // Draw rider routes
    riders.forEach((rider) => {
      const color = groupColors[rider.journey_id] || '#475569';
      const isInSelected = selectedGroup && result.groups[selectedGroup]?.rider_ids.includes(rider.journey_id);
      const latlngs = rider.route.map(coordToLL);
      const line = L.polyline(latlngs, {
        color,
        weight: isInSelected ? 4 : 2,
        opacity: selectedGroup !== null ? (isInSelected ? 0.9 : 0.15) : 0.6,
        dashArray: '6 4',
      }).addTo(map);
      const marker = L.circleMarker(coordToLL(rider.start), {
        radius: 5, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: isInSelected ? 1 : 0.7,
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px 2px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">Rider Request</div>
          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: #38bdf8;">${rider.journey_id}</div>
        </div>
      `).addTo(map);
      layersRef.current.push(line, marker);
    });

    // Draw driver routes
    drivers.forEach((driver) => {
      const color = groupColors[driver.journey_id] || '#475569';
      const groupIdx = result.groups.findIndex((g) => g.driver_id === driver.journey_id);
      const isInSelected = selectedGroup !== null && groupIdx === selectedGroup;
      const isUnmatched = result.unmatchedDrivers.includes(driver.journey_id);
      const latlngs = driver.route.map(coordToLL);
      const line = L.polyline(latlngs, {
        color: isUnmatched ? '#475569' : color,
        weight: isInSelected ? 5 : 3,
        opacity: selectedGroup !== null ? (isInSelected ? 0.95 : 0.1) : (isUnmatched ? 0.2 : 0.7),
      }).addTo(map);
      const marker = L.circleMarker(coordToLL(driver.start), {
        radius: isInSelected ? 8 : 6,
        fillColor: isUnmatched ? '#475569' : color,
        color: '#fff', weight: 2, fillOpacity: isInSelected ? 1 : 0.8,
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px 2px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">${isUnmatched ? 'Idle Fleet' : `Pool 0${groupIdx + 1}`}</div>
          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: #f8fafc;">${driver.journey_id}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Capacity: ${driver.capacity} seats</div>
        </div>
      `).addTo(map);
      layersRef.current.push(line, marker);
    });

    // Fit
    const allPts = [
      ...riders.flatMap((r) => r.route.map(coordToLL)),
      ...drivers.flatMap((d) => d.route.map(coordToLL)),
    ];
    if (allPts.length) map.fitBounds(L.latLngBounds(allPts).pad(0.1));
  }, [riders, drivers, result, selectedGroup]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  const optimalityGap = optimalResult.objectiveValue > 1e-6
    ? (((optimalResult.objectiveValue - result.objectiveValue) / optimalResult.objectiveValue) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="animate-in" id="batch-assignment-view">
      <div className="section-header">
        <h2 className="section-title">Batch Assignment Simulator</h2>
        <p className="section-desc">
          Simulate multi-rider batch assignment with Greedy, Auction-Swap, and Exact Branch-and-Bound solvers. Evaluate vehicle utilization and optimality gap.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group">
          <label className="form-label">Seed</label>
          <input id="batch-seed" type="number" className="form-input" value={seed}
            onChange={(e) => { setSeed(parseInt(e.target.value, 10) || 0); setSelectedGroup(null); }}
            style={{ width: '80px' }} />
        </div>
        <div className="form-group">
          <label className="form-label">Rider Demands</label>
          <select className="form-select" value={riderCount}
            onChange={(e) => { setRiderCount(parseInt(e.target.value, 10)); setSelectedGroup(null); }}>
            {[3, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} Riders</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Driver Fleet</label>
          <select className="form-select" value={driverCount}
            onChange={(e) => { setDriverCount(parseInt(e.target.value, 10)); setSelectedGroup(null); }}>
            {[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n} Vehicles</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Solver Algorithm</label>
          <select className="form-select" value={method}
            onChange={(e) => { setMethod(e.target.value); setSelectedGroup(null); }}>
            <option value="greedy">Greedy Heuristic</option>
            <option value="auction">Auction-Swap</option>
            <option value="optimal">Branch & Bound (Exact)</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => { setSeed(Math.floor(Math.random() * 9999)); setSelectedGroup(null); }}>
          Random Seed
        </button>
        <button className={`btn ${compareMode ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setCompareMode(!compareMode)}>
          Compare Solvers
        </button>
        <button className="btn btn-outline" onClick={handleExport}>
          Export CSV
        </button>
      </div>

      {/* Stats row */}
      <div className="stats-grid animate-in" style={{ marginBottom: '18px' }}>
        <div className="stat-card indigo">
          <div className="stat-label">Feasibility Graph</div>
          <div className="stat-value indigo">{result.feasibleEdges}</div>
          <div className="stat-detail">{result.totalPairs} pairs evaluated</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Matched Riders</div>
          <div className="stat-value green">{result.matchedRiders}/{riders.length}</div>
          <div className="stat-detail">{((result.matchedRiders / riders.length) * 100).toFixed(0)}% coverage</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-label">Active Vehicles</div>
          <div className="stat-value cyan">{result.matchedDrivers}</div>
          <div className="stat-detail">{result.unmatchedDrivers.length} idle fleet</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Objective Value</div>
          <div className="stat-value amber">{result.objectiveValue.toFixed(1)}</div>
          <div className="stat-detail">
            {method === 'optimal' ? 'provably optimal (0% gap)' : `gap vs optimal: ${optimalityGap}%`}
          </div>
        </div>
        <div className="stat-card rose">
          <div className="stat-label">Solve Latency</div>
          <div className="stat-value rose">{result.totalMs}ms</div>
          <div className="stat-detail">graph: {result.graphMs}ms + solve: {result.solveMs}ms</div>
        </div>
      </div>

      {/* Compare panel */}
      {compareMode && (
        <div className="card animate-in" style={{ marginBottom: '18px' }}>
          <div className="card-header">
            <div>
              <span className="card-title">Solver Benchmark: Greedy vs Auction vs Branch & Bound</span>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                Comparing combinatorial objective scores, heuristic gap, and latency
              </span>
            </div>
            <span className="badge success">
              Optimal: {optimalResult.objectiveValue.toFixed(1)} obj
            </span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Greedy</th>
                  <th>Auction-Swap</th>
                  <th>Optimal (B&B)</th>
                  <th>Heuristic Gap</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Matched Riders', g: greedyResult.matchedRiders, a: auctionResult.matchedRiders, o: optimalResult.matchedRiders },
                  { label: 'Active Vehicles', g: greedyResult.matchedDrivers, a: auctionResult.matchedDrivers, o: optimalResult.matchedDrivers },
                  { label: 'Objective Score', g: greedyResult.objectiveValue.toFixed(1), a: auctionResult.objectiveValue.toFixed(1), o: optimalResult.objectiveValue.toFixed(1) },
                  { label: 'Optimality Gap', g: ((optimalResult.objectiveValue - greedyResult.objectiveValue) / (optimalResult.objectiveValue || 1) * 100).toFixed(1) + '%', a: ((optimalResult.objectiveValue - auctionResult.objectiveValue) / (optimalResult.objectiveValue || 1) * 100).toFixed(1) + '%', o: '0.0%' },
                  { label: 'Feasible Graph Edges', g: greedyResult.feasibleEdges, a: auctionResult.feasibleEdges, o: optimalResult.feasibleEdges },
                  { label: 'Solve Latency', g: greedyResult.solveMs + 'ms', a: auctionResult.solveMs + 'ms', o: optimalResult.solveMs + 'ms' },
                ].map((row) => (
                  <tr key={row.label}>
                    <td style={{ fontWeight: 500 }}>{row.label}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{row.g}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{row.a}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#34d399' }}>{row.o}</td>
                    <td style={{
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: row.label === 'Optimality Gap' ? '#fbbf24' : 'var(--text-muted)',
                    }}>
                      {row.label === 'Optimality Gap' ? `Auction: ${row.a}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid-sidebar">
        {/* Assignment groups sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="card" style={{ maxHeight: '520px', overflowY: 'auto' }}>
            <div className="card-header">
              <span className="card-title">Formed Pools</span>
              <span className="badge info">{result.groups.length} Pools</span>
            </div>
            <div className="card-body" style={{ padding: '10px' }}>
              {result.groups.length === 0 && (
                <div className="empty-state">
                  <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                  </svg>
                  <div className="empty-state-text">No Feasible Pools Formed</div>
                  <div className="empty-state-hint">
                    No candidates met detour bounds. Try adjusting seed or increasing fleet size.
                  </div>
                </div>
              )}
              {result.groups.map((group, idx) => {
                const isSelected = selectedGroup === idx;
                const color = PALETTE[idx % PALETTE.length];
                return (
                  <div
                    key={group.driver_id}
                    className="assignment-group-card"
                    style={{
                      borderLeft: `3px solid ${color}`,
                      ...(isSelected ? { background: `${color}15`, borderColor: color } : {}),
                    }}
                    onClick={() => setSelectedGroup(isSelected ? null : idx)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{group.driver_id}</span>
                      <span style={{ fontWeight: 700, color, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
                        {group.groupScore.toFixed(1)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      {group.rider_ids.map((rid) => (
                        <span key={rid} className="badge info" style={{ fontSize: '9px', padding: '1px 5px' }}>
                          {rid}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      {group.seatsUsed} seats used · {group.remainingCapacity} remaining
                    </div>
                  </div>
                );
              })}

              {result.unmatchedRiders.length > 0 && (
                <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--accent-danger-subtle)', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontSize: '0.6875rem', color: '#f87171', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase' }}>
                    Unmatched Riders ({result.unmatchedRiders.length})
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {result.unmatchedRiders.map((rid) => (
                      <span key={rid} className="badge danger" style={{ fontSize: '9px', padding: '1px 5px' }}>{rid}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div ref={mapRef} className="map-container" id="batch-map" />
      </div>

      {/* Edge details table */}
      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-header">
          <div>
            <span className="card-title">Feasibility Bipartite Graph Edges</span>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
              Evaluated compatible rider–driver pairings meeting detour bounds
            </span>
          </div>
          <span className="badge info">{result.edges.length} feasible</span>
        </div>
        <div className="card-body" style={{ padding: 0, maxHeight: '280px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Rider</th>
                <th>Score</th>
                <th>Pickup</th>
                <th>Dest</th>
                <th>Detour</th>
                <th>Assignment</th>
              </tr>
            </thead>
            <tbody>
              {result.edges.slice(0, 50).map((e, i) => {
                const assigned = result.groups.some((g) => g.driver_id === e.driver_id && g.rider_ids.includes(e.rider_id));
                return (
                  <tr key={i} style={assigned ? { background: 'var(--accent-success-subtle)' } : {}}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{e.driver_id}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{e.rider_id}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: e.score >= 70 ? '#34d399' : e.score >= 50 ? '#fbbf24' : '#f87171' }}>
                      {e.score.toFixed(1)}
                    </td>
                    <td>{e.features.pickup_distance_km.toFixed(2)} km</td>
                    <td>{e.features.destination_distance_km.toFixed(2)} km</td>
                    <td>{e.features.detour_km.toFixed(2)} km</td>
                    <td>
                      <span className={`badge ${assigned ? 'success' : 'neutral'}`} style={{ fontSize: '9px' }}>
                        {assigned ? 'ASSIGNED' : 'UNASSIGNED'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
