import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  precomputePolylineProfile,
  interpolateAlongProfile,
  shortestArcInterpolate,
  createVehicleSvgString,
} from '../motion/vehicleMotionEngine';
import { coordToLL } from '../data';
import { BASEMAP_OPTIONS, createBaseTileLayer } from '../utils/mapTiles';

const COLORS = {
  rider: '#3b82f6',
  eligible: '#10b981',
  rejected: '#ef4444',
  selected: '#06b6d4',
  incident: '#f59e0b',
  straightLine: '#0ea5e9',
  ghost: '#475569',
};

function createPinIcon(type, color = '#3b82f6', _label = '') {
  return L.divIcon({
    className: `custom-map-pin pin-${type}`,
    html: `
      <div style="
        position: relative;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #090d16;
        border: 2px solid ${color};
        border-radius: 50%;
        box-shadow: 0 0 10px ${color}80;
      " title="${_label}">
        <div style="width: 7px; height: 7px; background: ${color}; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function createGhostIcon(_reason = '') {
  return L.divIcon({
    className: 'custom-map-pin ghost-pin',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1e293b;
        border: 1px dashed #ef4444;
        border-radius: 50%;
        opacity: 0.6;
      ">
        <span style="color: #ef4444; font-size: 10px; font-weight: bold;">✕</span>
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function MapPanel({
  rider = null,
  drivers = [],
  matchResults = null,
  selectedDriver = null,
  onSelectDriver = null,
  incident = null,
  animatedVehicles = [], // [{ id, route, color, kind, status }]
  simulationProgress = 0, // [0, 1]
  circuityLensEnabled = false,
  pruningOverlayEnabled = false,
  activeFunnelStage = null,
  height = '500px',
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const staticLayersRef = useRef([]);
  const movingMarkersRef = useRef(new Map()); // id -> { marker, profile, lastAngle, trailPolyline }
  const [tileError, setTileError] = useState(false);
  const [basemapType, setBasemapType] = useState('esri_light');
  const [mapReady, setMapReady] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([31.2536, 75.7037], 12);
      mapInstanceRef.current = map;
      setMapReady(true);
    }

    const map = mapInstanceRef.current;
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 150);

    return () => clearTimeout(timer);
  }, []);

  // Update basemap when basemapType changes or map becomes ready
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const nextLayer = createBaseTileLayer(basemapType, () => setTileError(true));
    nextLayer.addTo(map);
    tileLayerRef.current = nextLayer;
  }, [basemapType, mapReady]);

  // Update static route layers & markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Clear old static layers
    staticLayersRef.current.forEach((l) => map.removeLayer(l));
    staticLayersRef.current = [];

    const allPoints = [];

    // 1. Rider route
    if (rider && rider.route && rider.route.length > 0) {
      const riderLLs = rider.route.map((c) => coordToLL(c));
      allPoints.push(...riderLLs);

      const riderLine = L.polyline(riderLLs, {
        color: COLORS.rider,
        weight: 5,
        opacity: 0.95,
      }).addTo(map);

      const pickupMarker = L.marker(coordToLL(rider.start), {
        icon: createPinIcon('pickup', COLORS.rider),
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">Rider Pickup</div>
          <div style="font-family: var(--font-mono); font-weight: 600; color: #3b82f6;">${rider.journey_id || 'Rider'}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Requested: ${rider.seats_requested || 1} seat(s)</div>
        </div>
      `).addTo(map);

      const destMarker = L.marker(coordToLL(rider.destination), {
        icon: createPinIcon('dest', '#10b981'),
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">Rider Destination</div>
          <div style="font-family: var(--font-mono); font-weight: 600; color: #10b981;">Target Stop</div>
        </div>
      `).addTo(map);

      staticLayersRef.current.push(riderLine, pickupMarker, destMarker);

      // Circuity Lens straight-line overlay
      if (circuityLensEnabled) {
        const straightLine = L.polyline([coordToLL(rider.start), coordToLL(rider.destination)], {
          color: COLORS.straightLine,
          weight: 3,
          dashArray: '4 6',
          opacity: 0.85,
        }).addTo(map);
        staticLayersRef.current.push(straightLine);
      }

      // Pruning radius overlay (Exp 009 admissible distance envelope)
      if (pruningOverlayEnabled) {
        const circle = L.circle(coordToLL(rider.start), {
          radius: 2000, // 2 km admissible pickup boundary
          color: 'rgba(99, 102, 241, 0.5)',
          fillColor: 'rgba(99, 102, 241, 0.08)',
          fillOpacity: 0.3,
          weight: 1,
          dashArray: '3 5',
        }).addTo(map);
        staticLayersRef.current.push(circle);
      }
    }

    // 2. Incident & dynamic recourse detour
    if (incident && incident.coordinate) {
      const incLL = coordToLL(incident.coordinate);
      const incMarker = L.marker(incLL, {
        icon: createPinIcon('incident', COLORS.incident),
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: #f59e0b;">Incident Active</div>
          <div style="font-size: 12px; font-weight: 600;">${incident.label || 'Road Closure'}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Dynamic A* recourse triggered</div>
        </div>
      `).addTo(map);
      staticLayersRef.current.push(incMarker);

      if (incident.detourRoute && incident.detourRoute.length > 0) {
        const detourLLs = incident.detourRoute.map((c) => coordToLL(c));
        const detourLine = L.polyline(detourLLs, {
          color: COLORS.incident,
          weight: 4,
          dashArray: '6 4',
          opacity: 0.9,
        }).addTo(map);
        staticLayersRef.current.push(detourLine);
        allPoints.push(...detourLLs);
      }
    }

    // 3. Driver routes and candidates
    if (drivers && drivers.length > 0) {
      const resultMap = {};
      if (matchResults?.all) {
        matchResults.all.forEach((r) => { resultMap[r.driver_id] = r; });
      }

      drivers.forEach((driver) => {
        const result = resultMap[driver.journey_id];
        const isEligible = result ? result.final_eligible : true;
        const isSelected = selectedDriver === driver.journey_id;

        // Stage filter
        const topEligible = matchResults?.eligible?.[0]?.driver_id;
        const isFilteredOut =
          (activeFunnelStage === 'gated' && !isEligible) ||
          (activeFunnelStage === 'pruned' && result && !result.route_direction_compatible) ||
          (activeFunnelStage === 'ranked' && !isEligible) ||
          (activeFunnelStage === 'assigned' && driver.journey_id !== topEligible);

        if (isFilteredOut) {
          // Render as faint ghost marker with rejection reason
          const ghostLL = coordToLL(driver.start);
          const reason = result?.rejection_reasons?.[0] || 'Filtered out';
          const ghost = L.marker(ghostLL, {
            icon: createGhostIcon(reason),
          }).bindPopup(`
            <div style="font-family: var(--font-family); font-size: 11px; color: #ef4444;">
              <strong>${driver.journey_id}</strong>: ${reason}
            </div>
          `).addTo(map);
          staticLayersRef.current.push(ghost);
          return;
        }

        const driverLLs = (driver.route || []).map((c) => coordToLL(c));
        if (driverLLs.length === 0) return;
        allPoints.push(...driverLLs);

        const color = isSelected
          ? COLORS.selected
          : isEligible
          ? COLORS.eligible
          : COLORS.rejected;

        const line = L.polyline(driverLLs, {
          color,
          weight: isSelected ? 5 : isEligible ? 3 : 2,
          opacity: isSelected ? 1.0 : isEligible ? 0.75 : 0.25,
          dashArray: isEligible ? null : '5 4',
        }).addTo(map);

        line.on('click', () => onSelectDriver?.(driver.journey_id));

        const startMarker = L.circleMarker(coordToLL(driver.start), {
          radius: isSelected ? 7 : 5,
          fillColor: color,
          color: isSelected ? '#ffffff' : color,
          weight: isSelected ? 2 : 1,
          fillOpacity: isSelected ? 1 : 0.8,
        }).addTo(map);

        startMarker.bindPopup(`
          <div style="font-family: var(--font-family); padding: 4px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span style="font-family: var(--font-mono); font-weight: 600;">${driver.journey_id}</span>
              <span class="badge ${isEligible ? 'success' : 'danger'}" style="font-size: 9px;">
                ${isEligible ? 'ELIGIBLE' : 'REJECTED'}
              </span>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
              Score: <strong style="color: var(--text-primary);">${result?.score !== undefined ? result.score.toFixed(1) : '—'}</strong> ·
              Capacity: <strong>${driver.capacity || 1}</strong>
            </div>
          </div>
        `);

        startMarker.on('click', () => onSelectDriver?.(driver.journey_id));
        staticLayersRef.current.push(line, startMarker);
      });
    }

    // Fit bounds smoothly
    if (allPoints.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(allPoints).pad(0.12));
      } catch {}
    }
  }, [
    rider,
    drivers,
    matchResults,
    selectedDriver,
    onSelectDriver,
    incident,
    circuityLensEnabled,
    pruningOverlayEnabled,
    activeFunnelStage,
    mapReady,
  ]);

  // Handle Animated Moving Vehicles via Imperative DOM updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean up vehicles not in animatedVehicles
    const activeIds = new Set(animatedVehicles.map((v) => v.id));
    for (const [id, entry] of movingMarkersRef.current.entries()) {
      if (!activeIds.has(id)) {
        map.removeLayer(entry.marker);
        if (entry.trailPolyline) map.removeLayer(entry.trailPolyline);
        movingMarkersRef.current.delete(id);
      }
    }

    // Initialize or update moving vehicle markers
    animatedVehicles.forEach((v) => {
      if (!v.route || v.route.length < 2) return;
      const polyline = v.route.map((c) => coordToLL(c));

      let entry = movingMarkersRef.current.get(v.id);
      if (!entry) {
        const profile = precomputePolylineProfile(polyline);
        const iconHtml = createVehicleSvgString({
          kind: v.kind || 'car',
          color: v.color || '#3b82f6',
          status: v.status || 'active',
        });

        const icon = L.divIcon({
          className: 'moving-vehicle-icon',
          html: `<div class="vehicle-sprite-wrapper" id="sprite-${v.id}">${iconHtml}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker(polyline[0], { icon, zIndexOffset: 1000 }).addTo(map);
        const trailPolyline = L.polyline([polyline[0]], {
          color: v.color || '#3b82f6',
          weight: 4,
          opacity: 0.9,
        }).addTo(map);

        entry = { marker, trailPolyline, profile, lastAngle: profile.bearings[0] || 0 };
        movingMarkersRef.current.set(v.id, entry);
      }
    });
  }, [animatedVehicles]);

  // Imperatively interpolate positions per frame without React state
  useEffect(() => {
    movingMarkersRef.current.forEach((entry, id) => {
      const state = interpolateAlongProfile(entry.profile, simulationProgress);
      entry.marker.setLatLng([state.lat, state.lng]);

      // Smooth heading rotation
      const smoothAngle = shortestArcInterpolate(entry.lastAngle, state.bearing, 0.3);
      entry.lastAngle = smoothAngle;

      const el = document.getElementById(`sprite-${id}`);
      if (el) {
        el.style.transform = `rotate(${smoothAngle}deg)`;
      }

      // Update traveled trail
      if (entry.trailPolyline && state.traveledPath.length > 1) {
        entry.trailPolyline.setLatLngs(state.traveledPath);
      }
    });
  }, [simulationProgress]);

  // Reset View
  const handleResetView = useCallback(() => {
    if (mapInstanceRef.current && rider?.start) {
      mapInstanceRef.current.setView(coordToLL(rider.start), 13);
    }
  }, [rider]);

  return (
    <div className="map-panel-wrapper" style={{ height, width: '100%', position: 'relative' }}>
      <div ref={mapContainerRef} className="map-container" id="route-map" style={{ height: '100%', width: '100%' }} />

      {/* Persistent Map Attribution / Simulation Badge */}
      <div className="map-overlay-badge top-right">
        <span className="badge warning sim-badge">Simulated Route Traces</span>
      </div>

      {/* Tile Error Notice */}
      {tileError && (
        <div className="map-tile-error-banner" role="alert">
          <span>Map basemap tiles failed to load from CDN. Vectors remain active.</span>
        </div>
      )}

      {/* Floating Basemap Switcher */}
      <div
        className="map-floating-controls bottom-left"
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          zIndex: 1000,
          display: 'flex',
          gap: '4px',
          background: 'rgba(9, 13, 22, 0.88)',
          padding: '3px',
          borderRadius: '6px',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}
      >
        {BASEMAP_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`btn btn-sm ${basemapType === opt.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '2px 8px',
              fontSize: '0.6875rem',
              fontWeight: 500,
              height: '24px',
            }}
            onClick={() => setBasemapType(opt.id)}
            title={`Switch basemap to ${opt.label}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Floating Map Controls */}
      <div className="map-floating-controls bottom-right">
        <button
          type="button"
          className="btn btn-outline btn-sm map-ctrl-btn"
          onClick={handleResetView}
          title="Reset map camera to pickup corridor"
          aria-label="Reset camera"
        >
          Reset View
        </button>
      </div>
    </div>
  );
}
