import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import { runFleetRebalancingSimulation, exportToCSV } from '../data';
import SimulationClockBar from './common/SimulationClockBar';
import { useSimulationClock } from '../motion/simulationClock';
import { updateUrlHash } from '../utils/urlState';
import { createBaseTileLayer } from '../utils/mapTiles';
import {
  Download,
  AlertTriangle,
} from 'lucide-react';

const REGIMES = [
  { id: 'morning_peak', label: 'Morning Peak', desc: 'Inbound rush to LPU Campus & Jalandhar educational & commercial cores' },
  { id: 'evening_peak', label: 'Evening Rush', desc: 'Outbound rush from LPU to Phagwara Bus Stand & Ludhiana transit hubs' },
  { id: 'off_peak', label: 'Off-Peak Balanced', desc: 'Evenly distributed intercity demand along GT Road (NH1) corridor' },
];

export default function FleetRebalanceView({ initialRegime = 'evening_peak' }) {
  const [regime, setRegime] = useState(initialRegime);
  const [idleCount, setIdleCount] = useState(25);
  const [selectedZone, setSelectedZone] = useState(null);
  const [viewMode, setViewMode] = useState('after'); // 'before' or 'after'

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    updateUrlHash('staging', { regime, count: idleCount }, true);
  }, [regime, idleCount]);

  const simResult = useMemo(
    () => runFleetRebalancingSimulation(idleCount, regime),
    [idleCount, regime]
  );

  const clock = useSimulationClock({
    durationSeconds: 30,
    initialSpeed: 1,
    autoPlay: false,
  });

  const handleExportDirectives = useCallback(() => {
    const data = simResult.directives.map((d) => ({
      directive_id: d.id,
      driver_id: d.driver_id,
      from_zone: d.from_zone,
      to_zone: d.to_zone,
      distance_km: d.distance_km,
      transit_minutes: d.est_minutes,
    }));
    exportToCSV(data, `repositioning_directives_${regime}.csv`);
  }, [simResult, regime]);

  // Leaflet Map Rendering
  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([31.18, 75.72], 10);

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

    // Draw Transit Zones
    simResult.zoneStats.forEach((z) => {
      const isSelected = selectedZone === z.zone_id;
      const isDeficit = z.deficit > 0;
      const isSurplus = z.deficit < 0;
      const ringColor = isDeficit ? '#ef4444' : isSurplus ? '#10b981' : '#0ea5e9';

      const circle = L.circle([z.coordinate.latitude, z.coordinate.longitude], {
        radius: z.radius_km * 450,
        color: ringColor,
        fillColor: ringColor,
        fillOpacity: isSelected ? 0.35 : 0.15,
        weight: isSelected ? 2.5 : 1.5,
      }).addTo(map);

      const marker = L.circleMarker([z.coordinate.latitude, z.coordinate.longitude], {
        radius: isSelected ? 8 : 6,
        color: '#ffffff',
        fillColor: ringColor,
        fillOpacity: 1,
        weight: 2,
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">${z.zone_id}</div>
          <div style="font-size: 12px; font-weight: 700; color: #f8fafc; margin-top: 2px;">${z.name}</div>
          <div style="margin-top: 6px; font-size: 11px;">
            <div>Initial Supply: <strong>${z.initialVehicles}</strong></div>
            <div>Modeled Need: <strong>${z.targetVehicles}</strong></div>
            <div>Status: <strong style="color: ${ringColor};">${isDeficit ? `Deficit (-${z.deficit})` : isSurplus ? `Surplus (+${Math.abs(z.deficit)})` : 'Balanced'}</strong></div>
          </div>
        </div>
      `).addTo(map);

      marker.on('click', () => setSelectedZone(z.zone_id));
      layersRef.current.push(circle, marker);
    });

    // Draw relocation paths if in 'after' viewMode
    if (viewMode === 'after') {
      simResult.directives.forEach((d) => {
        const fromLL = [d.from_coord.latitude, d.from_coord.longitude];
        const toLL = [d.to_coord.latitude, d.to_coord.longitude];

        const line = L.polyline([fromLL, toLL], {
          color: '#f59e0b',
          weight: 2.5,
          dashArray: '5 6',
          opacity: 0.85,
        }).addTo(map);

        // Interpolated moving vehicle along relocation path
        const lat = fromLL[0] + (toLL[0] - fromLL[0]) * clock.progress;
        const lng = fromLL[1] + (toLL[1] - fromLL[1]) * clock.progress;

        const vehMarker = L.circleMarker([lat, lng], {
          radius: 4,
          fillColor: '#f59e0b',
          color: '#ffffff',
          weight: 1.5,
          fillOpacity: 1,
        }).addTo(map);

        layersRef.current.push(line, vehMarker);
      });
    }
  }, [simResult, selectedZone, viewMode, clock.progress]);

  return (
    <div className="animate-in" id="fleet-staging-view">
      {/* Permanent Research Honesty Banner */}
      <div className="simulation-honesty-banner" role="alert">
        <AlertTriangle size={15} className="text-amber" />
        <span>
          <strong>Simulation: modeled demand, not observed.</strong> Transit zone demands derive from synthetic time-of-day multipliers, not live telemetry.
        </span>
      </div>

      {/* Page Header */}
      <div className="section-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="section-title">Fleet Staging & Predictive Rebalancing</h1>
          <p className="section-desc">
            Balance spatial supply across downtown transit corridors to reduce prospective passenger wait times.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="regime-select">Demand Regime</label>
          <select
            id="regime-select"
            className="form-select"
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
          >
            {REGIMES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="idle-vehicles">Idle Vehicles</label>
          <select
            id="idle-vehicles"
            className="form-select"
            value={idleCount}
            onChange={(e) => setIdleCount(parseInt(e.target.value, 10))}
          >
            <option value={15}>15 Idle Vehicles</option>
            <option value={25}>25 Idle Vehicles</option>
            <option value={40}>40 Idle Vehicles</option>
          </select>
        </div>

        {/* Before / After Toggle */}
        <div className="segmented-control" role="group" aria-label="Staging view state">
          <button
            type="button"
            className={`segmented-btn ${viewMode === 'before' ? 'active' : ''}`}
            onClick={() => setViewMode('before')}
            aria-pressed={viewMode === 'before'}
          >
            Before Rebalancing
          </button>
          <button
            type="button"
            className={`segmented-btn ${viewMode === 'after' ? 'active' : ''}`}
            onClick={() => setViewMode('after')}
            aria-pressed={viewMode === 'after'}
          >
            After Relocations ({simResult.directives.length})
          </button>
        </div>

        <button type="button" className="btn btn-outline" onClick={handleExportDirectives}>
          <Download size={14} />
          <span>Export Directives</span>
        </button>
      </div>

      {/* Telemetry Strip */}
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        <div className="stat-card green">
          <div className="stat-label">Deficit Resolution</div>
          <div className="stat-value green font-mono">{simResult.deficitReductionPct.toFixed(1)}%</div>
          <div className="stat-detail">Relocated supply satisfied demand gap</div>
        </div>

        <div className="stat-card amber">
          <div className="stat-label">Staging Deadhead Mileage</div>
          <div className="stat-value amber font-mono">{simResult.totalVkt.toFixed(1)} km</div>
          <div className="stat-detail">Repositioning fleet transit burden</div>
        </div>

        <div className="stat-card cyan">
          <div className="stat-label">Active Directives</div>
          <div className="stat-value cyan font-mono">{simResult.directives.length}</div>
          <div className="stat-detail">Inter-zone relocation dispatches</div>
        </div>

        <div className="stat-card indigo">
          <div className="stat-label">Unmet Demand</div>
          <div className="stat-value indigo font-mono">{simResult.remainingUnmet}</div>
          <div className="stat-detail">Uncovered passenger seats</div>
        </div>
      </div>

      {/* Simulation Clock Scrubber */}
      {viewMode === 'after' && (
        <div style={{ marginBottom: '16px' }}>
          <SimulationClockBar clock={clock} title="Relocation Transit Timeline" />
        </div>
      )}

      {/* Map & Zone List */}
      <div className="grid-sidebar">
        {/* Zone Balance List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="card-header" style={{ padding: '4px 0' }}>
            <span className="text-xs text-muted font-semibold uppercase">Transit Zones ({simResult.zoneStats.length})</span>
            {selectedZone && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedZone(null)}
              >
                Clear
              </button>
            )}
          </div>

          {simResult.zoneStats.map((z) => {
            const isDeficit = z.deficit > 0;
            const isSurplus = z.deficit < 0;
            const isSelected = selectedZone === z.zone_id;

            return (
              <div
                key={z.zone_id}
                className={`card ${isSelected ? 'selected-border' : ''}`}
                style={{ padding: '10px 12px', cursor: 'pointer' }}
                onClick={() => setSelectedZone(isSelected ? null : z.zone_id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{z.name}</span>
                  <span className={`badge ${isDeficit ? 'danger' : isSurplus ? 'success' : 'neutral'}`}>
                    {isDeficit ? `Deficit (-${z.deficit})` : isSurplus ? `Surplus (+${Math.abs(z.deficit)})` : 'Balanced'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>Supply: <strong>{z.initialVehicles}</strong></span>
                  <span>Modeled Need: <strong>{z.targetVehicles}</strong></span>
                  <span>Effective Demand: <strong>{z.effectiveDemand}</strong></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Map */}
        <div className="map-panel-wrapper" style={{ height: '500px', position: 'relative' }}>
          <div ref={mapRef} className="map-container" style={{ height: '100%', width: '100%' }} />
          <div className="map-overlay-badge top-right">
            <span className="badge warning sim-badge">Simulated Transit Staging</span>
          </div>
        </div>
      </div>
    </div>
  );
}
