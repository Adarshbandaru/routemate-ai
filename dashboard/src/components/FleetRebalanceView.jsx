import { useState, useMemo, useRef, useEffect } from 'react';
import L from 'leaflet';
import {
  runFleetRebalancingSimulation,
  exportToCSV,
} from '../data';

const REGIMES = [
  { id: 'morning_peak', label: '🌅 Morning Peak', desc: 'Surge at FiDi & SoMa offices' },
  { id: 'evening_peak', label: '🌆 Evening Rush', desc: 'Surge at Caltrain & Transit Spines' },
  { id: 'off_peak', label: '☀️ Off-Peak Balanced', desc: 'Evenly distributed commuter demand' },
];

export default function FleetRebalanceView() {
  const [regime, setRegime] = useState('evening_peak');
  const [idleCount, setIdleCount] = useState(25);
  const [selectedZone, setSelectedZone] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

  const simResult = useMemo(
    () => runFleetRebalancingSimulation(idleCount, regime),
    [idleCount, regime]
  );

  const handleExportDirectives = () => {
    const data = simResult.directives.map((d) => ({
      directive_id: d.id,
      driver_id: d.driver_id,
      from_zone: d.from_zone,
      to_zone: d.to_zone,
      distance_km: d.distance_km,
      transit_minutes: d.est_minutes,
    }));
    exportToCSV(data, `repositioning_directives_${regime}.csv`);
  };

  // Map rendering
  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([37.778, -122.408], 13);

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

    // 1. Draw transit zones
    simResult.zoneStats.forEach((z) => {
      const isSelected = selectedZone === z.zone_id;
      const isDeficit = z.deficit > 0;
      const isSurplus = z.deficit < 0;

      const ringColor = isDeficit ? '#ef4444' : isSurplus ? '#10b981' : '#06b6d4';

      // Zone radius circle
      const zoneCircle = L.circle([z.coordinate.latitude, z.coordinate.longitude], {
        radius: z.radius_km * 450,
        color: ringColor,
        fillColor: ringColor,
        fillOpacity: isSelected ? 0.35 : 0.18,
        weight: isSelected ? 3 : 1.5,
      }).addTo(map);

      // Zone center marker
      const zoneMarker = L.circleMarker([z.coordinate.latitude, z.coordinate.longitude], {
        radius: isSelected ? 8 : 6,
        color: '#ffffff',
        fillColor: ringColor,
        fillOpacity: 1,
        weight: 2,
      }).bindPopup(
        `<b>${z.name}</b><br/>` +
        `Current Idle: <strong>${z.initialVehicles}</strong><br/>` +
        `Demand Target: <strong>${z.targetVehicles}</strong><br/>` +
        `Status: ${isDeficit ? `⚠️ Deficit (-${z.deficit})` : isSurplus ? `🟢 Surplus (+${Math.abs(z.deficit)})` : '✅ Balanced'}`
      ).addTo(map);

      zoneMarker.on('click', () => setSelectedZone(z.zone_id));
      layersRef.current.push(zoneCircle, zoneMarker);
    });

    // 2. Draw repositioning directive trajectories (arrows)
    simResult.directives.forEach((d) => {
      const fromLL = [d.from_coord.latitude, d.from_coord.longitude];
      const toLL = [d.to_coord.latitude, d.to_coord.longitude];

      const line = L.polyline([fromLL, toLL], {
        color: '#f59e0b',
        weight: 3,
        opacity: 0.85,
        dashArray: '6 6',
      }).bindPopup(
        `<b>Relocation Directive</b><br/>Vehicle: <code>${d.driver_id}</code><br/>` +
        `From: ${d.from_zone} → To: ${d.to_zone}<br/>` +
        `Deadhead: ${d.distance_km} km (~${d.est_minutes} min)`
      ).addTo(map);

      layersRef.current.push(line);
    });

  }, [simResult, selectedZone]);

  return (
    <div className="animate-in" id="fleet-rebalance-view">
      <div className="section-header">
        <h1 className="section-title">Predictive Fleet Repositioning & Spatial Staging</h1>
        <p className="section-desc">
          Proactively stage idle vehicles toward forecasted passenger demand hotspots before requests occur, minimizing rider pickup latency (P95 wait time).
        </p>
      </div>

      {/* Controls Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {REGIMES.map((r) => {
            const isSel = regime === r.id;
            return (
              <button
                key={r.id}
                className={`btn ${isSel ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setRegime(r.id)}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Idle Vehicles:</span>
            <input
              type="range"
              min={10}
              max={50}
              step={5}
              value={idleCount}
              onChange={(e) => setIdleCount(parseInt(e.target.value, 10))}
              style={{ width: '120px' }}
            />
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{idleCount}</span>
          </div>

          <button className="btn btn-ghost" onClick={handleExportDirectives}>
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card cyan">
          <div className="stat-label">Total Idle Fleet</div>
          <div className="stat-value cyan">{simResult.idleCount}</div>
          <div className="stat-detail">Available unassigned vehicles</div>
        </div>

        <div className="stat-card green">
          <div className="stat-label">Relocation Directives</div>
          <div className="stat-value green">{simResult.directives.length}</div>
          <div className="stat-detail">Proactive pre-staging moves</div>
        </div>

        <div className="stat-card amber">
          <div className="stat-label">Deficit Resolution</div>
          <div className="stat-value amber">{simResult.deficitReductionPct}%</div>
          <div className="stat-detail">{simResult.initialUnmet} → {simResult.remainingUnmet} unmet vehicle deficit</div>
        </div>

        <div className="stat-card purple">
          <div className="stat-label">Rebalance Deadhead VKT</div>
          <div className="stat-value purple">{simResult.totalVkt} km</div>
          <div className="stat-detail">Total anticipatory fleet mileage</div>
        </div>
      </div>

      {/* Main Grid: Map + Table */}
      <div className="grid-sidebar" style={{ gridTemplateColumns: '1fr 380px' }}>
        {/* Map Panel */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
              San Francisco Transit Demand Radar & Relocation Vectors
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
              <span style={{ color: '#ef4444' }}>● Deficit Zone</span>
              <span style={{ color: '#10b981' }}>● Surplus Zone</span>
              <span style={{ color: '#f59e0b' }}>- - Relocation Vector</span>
            </div>
          </div>
          <div ref={mapRef} style={{ width: '100%', height: '480px', borderRadius: '8px', overflow: 'hidden' }} />
        </div>

        {/* Sidebar: Zone Status & Directives Log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Zone Allocation Table */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Zone Supply vs Demand</span>
            </div>
            <div className="card-body" style={{ padding: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {simResult.zoneStats.map((z) => {
                  const isDef = z.deficit > 0;
                  const isSur = z.deficit < 0;
                  return (
                    <div
                      key={z.zone_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 10px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '6px',
                        borderLeft: `4px solid ${isDef ? '#ef4444' : isSur ? '#10b981' : '#06b6d4'}`,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{z.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Idle: <strong>{z.initialVehicles}</strong> | Target: <strong>{z.targetVehicles}</strong>
                        </div>
                      </div>
                      <span className={`badge ${isDef ? 'danger' : isSur ? 'success' : 'info'}`} style={{ fontSize: '11px' }}>
                        {isDef ? `-${z.deficit}` : isSur ? `+${Math.abs(z.deficit)}` : 'Balanced'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Directives Log */}
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header">
              <span className="card-title">Active Staging Instructions</span>
              <span className="badge info">{simResult.directives.length} Issued</span>
            </div>
            <div className="card-body" style={{ padding: '12px', maxHeight: '220px', overflowY: 'auto' }}>
              {simResult.directives.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '0.8125rem' }}>
                  No relocation needed; fleet is in supply equilibrium.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {simResult.directives.map((d) => (
                    <div
                      key={d.id}
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(245, 158, 11, 0.08)',
                        borderRadius: '4px',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '2px' }}>
                        <code style={{ color: '#f59e0b' }}>{d.driver_id}</code>
                        <span>{d.distance_km} km (~{d.est_minutes}m)</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        {d.from_zone} ➔ {d.to_zone}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
