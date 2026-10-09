import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import {
  generateBatchScenario,
  runBatchAssignment,
  coordToLL,
  exportToCSV,
} from '../data';

const PALETTE = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899',
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
      }).setView([0, 0.036], 13);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    }
    const map = mapInstanceRef.current;
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
        radius: 6, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: isInSelected ? 1 : 0.7,
      }).bindPopup(`<b>${rider.journey_id}</b><br/>Rider`).addTo(map);
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
        radius: isInSelected ? 9 : 7,
        fillColor: isUnmatched ? '#475569' : color,
        color: '#fff', weight: 2, fillOpacity: isInSelected ? 1 : 0.8,
      }).bindPopup(
        `<b>${driver.journey_id}</b><br/>` +
        `Cap: ${driver.capacity} | ${isUnmatched ? 'Unmatched' : `Group ${groupIdx + 1}`}`
      ).addTo(map);
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
        <h2 className="section-title">🚐 Batch Assignment Simulator</h2>
        <p className="section-desc">
          Simulate multi-rider batch matching with Greedy, Auction-Swap, and Exact Branch-and-Bound solvers. Evaluate vehicle utilization and optimality gap.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group">
          <label className="form-label">Seed</label>
          <input id="batch-seed" type="number" className="form-input" value={seed}
            onChange={(e) => { setSeed(parseInt(e.target.value, 10) || 0); setSelectedGroup(null); }}
            style={{ width: '90px' }} />
        </div>
        <div className="form-group">
          <label className="form-label">Riders</label>
          <select className="form-select" value={riderCount}
            onChange={(e) => { setRiderCount(parseInt(e.target.value, 10)); setSelectedGroup(null); }}>
            {[3, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Drivers</label>
          <select className="form-select" value={driverCount}
            onChange={(e) => { setDriverCount(parseInt(e.target.value, 10)); setSelectedGroup(null); }}>
            {[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Method</label>
          <select className="form-select" value={method}
            onChange={(e) => { setMethod(e.target.value); setSelectedGroup(null); }}>
            <option value="greedy">Greedy Heuristic</option>
            <option value="auction">Auction-Swap</option>
            <option value="optimal">Branch & Bound (Exact)</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => { setSeed(Math.floor(Math.random() * 9999)); setSelectedGroup(null); }}>
          🎲 Random
        </button>
        <button className={`btn ${compareMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setCompareMode(!compareMode)}>
          ⚔️ Compare
        </button>
        <button className="btn btn-ghost" onClick={handleExport}>
          📥 Export
        </button>
      </div>

      {/* Stats row */}
      <div className="stats-grid animate-in" style={{ marginBottom: '24px' }}>
        <div className="stat-card purple">
          <div className="stat-label">Feasibility Graph</div>
          <div className="stat-value purple">{result.feasibleEdges}</div>
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
          <div className="stat-detail">{result.unmatchedDrivers.length} idle</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Objective</div>
          <div className="stat-value amber">{result.objectiveValue.toFixed(1)}</div>
          <div className="stat-detail">
            {method === 'optimal' ? 'provably optimal (0% gap)' : `gap vs optimal: ${optimalityGap}%`}
          </div>
        </div>
        <div className="stat-card pink">
          <div className="stat-label">Solve Time</div>
          <div className="stat-value pink">{result.totalMs}ms</div>
          <div className="stat-detail">graph: {result.graphMs}ms + solve: {result.solveMs}ms</div>
        </div>
      </div>

      {/* Compare panel */}
      {compareMode && (
        <div className="card animate-in" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <span className="card-title">⚔️ Algorithm Benchmark: Greedy vs Auction vs Optimal</span>
            <span className="badge success">
              Optimal: {optimalResult.objectiveValue.toFixed(1)} obj
            </span>
          </div>
          <div className="card-body">
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
                  { label: 'Objective', g: greedyResult.objectiveValue.toFixed(1), a: auctionResult.objectiveValue.toFixed(1), o: optimalResult.objectiveValue.toFixed(1) },
                  { label: 'Optimality Gap', g: ((optimalResult.objectiveValue - greedyResult.objectiveValue) / (optimalResult.objectiveValue || 1) * 100).toFixed(1) + '%', a: ((optimalResult.objectiveValue - auctionResult.objectiveValue) / (optimalResult.objectiveValue || 1) * 100).toFixed(1) + '%', o: '0.0%' },
                  { label: 'Feasible Edges', g: greedyResult.feasibleEdges, a: auctionResult.feasibleEdges, o: optimalResult.feasibleEdges },
                  { label: 'Solve Time', g: greedyResult.solveMs + 'ms', a: auctionResult.solveMs + 'ms', o: optimalResult.solveMs + 'ms' },
                ].map((row) => {
                  return (
                    <tr key={row.label}>
                      <td style={{ fontWeight: 500 }}>{row.label}</td>
                      <td style={{ fontFamily: "'Courier New', monospace" }}>{row.g}</td>
                      <td style={{ fontFamily: "'Courier New', monospace" }}>{row.a}</td>
                      <td style={{ fontFamily: "'Courier New', monospace", fontWeight: 600, color: '#10b981' }}>{row.o}</td>
                      <td style={{
                        fontWeight: 600,
                        color: row.label === 'Optimality Gap' ? '#f59e0b' : '#64748b',
                      }}>
                        {row.label === 'Optimality Gap' ? `Auction: ${row.a}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid-sidebar">
        {/* Assignment groups sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="card" style={{ maxHeight: '560px', overflowY: 'auto' }}>
            <div className="card-header">
              <span className="card-title">📋 Assignment Groups</span>
              <span className="badge info">{result.groups.length} groups</span>
            </div>
            <div className="card-body" style={{ padding: '12px' }}>
              {result.groups.length === 0 && (
                <div className="empty-state" style={{ padding: '24px 12px' }}>
                  <div className="empty-state-icon">🚐</div>
                  <div className="empty-state-text">No Feasible Pools Formed</div>
                  <div className="empty-state-hint">
                    No rider candidates met the detour and capacity constraints for this cohort. Try adjusting the seed or increasing the driver fleet size.
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
                      borderLeft: `4px solid ${color}`,
                      ...(isSelected ? { background: `${color}15`, borderColor: color, boxShadow: `0 0 12px ${color}40` } : {}),
                    }}
                    onClick={() => setSelectedGroup(isSelected ? null : idx)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{group.driver_id}</span>
                      <span style={{ fontWeight: 700, color, fontSize: '0.875rem' }}>
                        {group.groupScore.toFixed(1)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      {group.rider_ids.map((rid) => (
                        <span key={rid} className="badge info" style={{ fontSize: '10px', padding: '1px 6px' }}>
                          {rid}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                      {group.seatsUsed} seats used · {group.remainingCapacity} remaining
                    </div>
                  </div>
                );
              })}

              {result.unmatchedRiders.length > 0 && (
                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div style={{ fontSize: '0.6875rem', color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>
                    UNMATCHED RIDERS ({result.unmatchedRiders.length})
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {result.unmatchedRiders.map((rid) => (
                      <span key={rid} className="badge danger" style={{ fontSize: '10px', padding: '1px 6px' }}>{rid}</span>
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
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <span className="card-title">🔗 Feasibility Graph Edges</span>
          <span className="badge info">{result.edges.length} feasible</span>
        </div>
        <div className="card-body" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Rider</th>
                <th>Score</th>
                <th>Pickup</th>
                <th>Dest</th>
                <th>Detour</th>
                <th>Assigned</th>
              </tr>
            </thead>
            <tbody>
              {result.edges.slice(0, 50).map((e, i) => {
                const assigned = result.groups.some((g) => g.driver_id === e.driver_id && g.rider_ids.includes(e.rider_id));
                return (
                  <tr key={i} style={assigned ? { background: 'rgba(16,185,129,0.06)' } : {}}>
                    <td style={{ fontFamily: "'Courier New', monospace", fontSize: '0.75rem' }}>{e.driver_id}</td>
                    <td style={{ fontFamily: "'Courier New', monospace", fontSize: '0.75rem' }}>{e.rider_id}</td>
                    <td style={{ fontWeight: 600, color: e.score >= 70 ? '#10b981' : e.score >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {e.score.toFixed(1)}
                    </td>
                    <td>{e.features.pickup_distance_km.toFixed(2)} km</td>
                    <td>{e.features.destination_distance_km.toFixed(2)} km</td>
                    <td>{e.features.detour_km.toFixed(2)} km</td>
                    <td>
                      <span className={`badge ${assigned ? 'success' : 'warning'}`} style={{ fontSize: '10px' }}>
                        {assigned ? '✓ Yes' : '— No'}
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
