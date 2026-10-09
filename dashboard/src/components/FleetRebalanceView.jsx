import { useState, useMemo, useRef, useEffect } from 'react';
import L from 'leaflet';
import {
  runFleetRebalancingSimulation,
  exportToCSV,
} from '../data';

const REGIMES = [
  { id: 'morning_peak', label: 'Morning Peak', desc: 'Surge at Financial District & SoMa employment cores' },
  { id: 'evening_peak', label: 'Evening Rush', desc: 'Surge at Caltrain transit terminal & outbound spines' },
  { id: 'off_peak', label: 'Off-Peak Balanced', desc: 'Evenly distributed metropolitan demand' },
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

      const ringColor = isDeficit ? '#ef4444' : isSurplus ? '#10b981' : '#0ea5e9';

      // Zone radius circle
      const zoneCircle = L.circle([z.coordinate.latitude, z.coordinate.longitude], {
        radius: z.radius_km * 450,
        color: ringColor,
        fillColor: ringColor,
        fillOpacity: isSelected ? 0.3 : 0.15,
        weight: isSelected ? 2.5 : 1.5,
      }).addTo(map);

      // Zone center marker
      const zoneMarker = L.circleMarker([z.coordinate.latitude, z.coordinate.longitude], {
        radius: isSelected ? 8 : 6,
        color: '#ffffff',
        fillColor: ringColor,
        fillOpacity: 1,
        weight: 2,
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px 2px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">${z.zone_id}</div>
          <div style="font-size: 12px; font-weight: 700; color: #f8fafc; margin-top: 2px;">${z.name}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; font-size: 11px; color: var(--text-secondary);">
            <div>Idle Supply: <strong>${z.initialVehicles}</strong></div>
            <div>Target Need: <strong>${z.targetVehicles}</strong></div>
          </div>
          <div style="margin-top: 6px;">
            <span class="badge ${isDeficit ? 'danger' : isSurplus ? 'success' : 'info'}" style="font-size: 9px;">
              ${isDeficit ? `DEFICIT (-${z.deficit})` : isSurplus ? `SURPLUS (+${Math.abs(z.deficit)})` : 'BALANCED'}
            </span>
          </div>
        </div>
      `).addTo(map);

      zoneMarker.on('click', () => setSelectedZone(z.zone_id));
      layersRef.current.push(zoneCircle, zoneMarker);
    });

    // 2. Draw repositioning directive trajectories
    simResult.directives.forEach((d) => {
      const fromLL = [d.from_coord.latitude, d.from_coord.longitude];
      const toLL = [d.to_coord.latitude, d.to_coord.longitude];

      const line = L.polyline([fromLL, toLL], {
        color: '#f59e0b',
        weight: 3,
        opacity: 0.85,
        dashArray: '6 6',
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px 2px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: #f59e0b;">Relocation Directive</div>
          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; margin-top: 2px;">${d.driver_id}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
            ${d.from_zone} → ${d.to_zone} · ${d.distance_km} km (~${d.est_minutes} min)
          </div>
        </div>
      `).addTo(map);

      layersRef.current.push(line);
    });

  }, [simResult, selectedZone]);

  return (
    <div className="animate-in" id="fleet-rebalance-view">
      <div className="section-header">
        <h1 className="section-title">Predictive Fleet Repositioning & Spatial Staging</h1>
        <p className="section-desc">
          Proactively stage idle vehicles toward forecasted passenger demand hotspots before trip requests arrive, minimizing P95 commuter wait times.
        </p>
      </div>

      {/* Controls Bar */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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

        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Idle Fleet:</span>
            <input
              type="range"
              min={10}
              max={50}
              step={5}
              value={idleCount}
              onChange={(e) => setIdleCount(parseInt(e.target.value, 10))}
              style={{ width: '110px' }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.8125rem' }}>{idleCount}</span>
          </div>

          <button className="btn btn-outline" onClick={handleExportDirectives}>
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: '18px' }}>
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
          <div className="stat-detail">{simResult.initialUnmet} → {simResult.remainingUnmet} unmet vehicle gap</div>
        </div>

        <div className="stat-card indigo">
          <div className="stat-label">Rebalance Deadhead VKT</div>
          <div className="stat-value indigo">{simResult.totalVkt} km</div>
          <div className="stat-detail">Total anticipatory fleet mileage</div>
        </div>
      </div>

      {/* Main Grid: Map + Table */}
      <div className="grid-sidebar" style={{ gridTemplateColumns: '1fr 360px' }}>
        {/* Map Panel */}
        <div className="card" style={{ padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
              San Francisco Demand Radar & Staging Directives
            </div>
            <div style={{ display: 'flex', gap: '10px', fontSize: '0.7rem' }}>
              <span style={{ color: '#ef4444' }}>● Deficit Zone</span>
              <span style={{ color: '#10b981' }}>● Surplus Zone</span>
              <span style={{ color: '#f59e0b' }}>- - Relocation Vector</span>
            </div>
          </div>
          <div ref={mapRef} style={{ width: '100%', height: '480px', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }} />
        </div>

        {/* Sidebar: Zone Status & Directives Log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Zone Allocation Table */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Zone Supply vs Demand</span>
            </div>
            <div className="card-body" style={{ padding: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                        padding: '7px 9px',
                        background: 'var(--bg-hover)',
                        borderRadius: 'var(--radius-xs)',
                        borderLeft: `3px solid ${isDef ? '#ef4444' : isSur ? '#10b981' : '#0ea5e9'}`,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.775rem' }}>{z.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          Idle: <strong>{z.initialVehicles}</strong> · Target: <strong>{z.targetVehicles}</strong>
                        </div>
                      </div>
                      <span className={`badge ${isDef ? 'danger' : isSur ? 'success' : 'info'}`} style={{ fontSize: '10px' }}>
                        {isDef ? `-${z.deficit}` : isSur ? `+${Math.abs(z.deficit)}` : 'BALANCED'}
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
              <span className="card-title">Staging Instructions</span>
              <span className="badge info">{simResult.directives.length} Issued</span>
            </div>
            <div className="card-body" style={{ padding: '10px', maxHeight: '220px', overflowY: 'auto' }}>
              {simResult.directives.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px', fontSize: '0.75rem' }}>
                  No relocation needed; fleet is in spatial supply equilibrium.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {simResult.directives.map((d) => (
                    <div
                      key={d.id}
                      style={{
                        padding: '6px 8px',
                        background: 'var(--accent-warning-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        fontSize: '0.725rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '2px' }}>
                        <code style={{ color: '#fbbf24' }}>{d.driver_id}</code>
                        <span>{d.distance_km} km (~{d.est_minutes}m)</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        {d.from_zone} → {d.to_zone}
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
