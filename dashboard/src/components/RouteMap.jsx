import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { coordToLL } from '../data';
import { createBaseTileLayer } from '../utils/mapTiles';

const COLORS = {
  rider: '#3b82f6',
  eligible: '#10b981',
  rejected: '#ef4444',
  selected: '#06b6d4',
  incident: '#f59e0b',
  neutral: '#64748b',
};

// SVG pin creators for clean mobility-tech map styling
function createPickupIcon() {
  return L.divIcon({
    className: 'custom-map-pin pickup-pin',
    html: `
      <div style="
        position: relative;
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0f172a;
        border: 2px solid #3b82f6;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
      ">
        <div style="width: 8px; height: 8px; background: #3b82f6; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function createDestinationIcon() {
  return L.divIcon({
    className: 'custom-map-pin dest-pin',
    html: `
      <div style="
        position: relative;
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0f172a;
        border: 2px solid #10b981;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
          <line x1="4" y1="22" x2="4" y2="15"></line>
        </svg>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function createIncidentIcon() {
  return L.divIcon({
    className: 'custom-map-pin incident-pin',
    html: `
      <div style="
        position: relative;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1e1b18;
        border: 2px solid #f59e0b;
        border-radius: 6px;
        box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

export default function RouteMap({
  rider,
  drivers,
  matchResults,
  selectedDriver,
  onSelectDriver,
  incident,
  height = '480px',
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([31.2536, 75.7037], 12);

      createBaseTileLayer('esri_light').addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;

    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // map unmounted
      }
    }, 150);

    // Clear old layers
    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current = [];

    if (!rider) return;

    // Draw rider route
    const riderLatLngs = (rider.route || []).map((c) => coordToLL(c));
    if (riderLatLngs.length > 0) {
      const riderLine = L.polyline(riderLatLngs, {
        color: COLORS.rider,
        weight: 5,
        opacity: 0.95,
      }).addTo(map);
      layersRef.current.push(riderLine);

      // Rider markers
      const riderStart = L.marker(coordToLL(rider.start), {
        icon: createPickupIcon(),
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px 2px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">Rider Pickup</div>
          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: #3b82f6; margin-top: 2px;">${rider.journey_id}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Seats requested: ${rider.seats_requested || 1}</div>
        </div>
      `).addTo(map);

      const riderEnd = L.marker(coordToLL(rider.destination), {
        icon: createDestinationIcon(),
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px 2px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">Rider Destination</div>
          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: #10b981; margin-top: 2px;">Target Stop</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Departure: ${rider.departure || '08:30'}</div>
        </div>
      `).addTo(map);

      layersRef.current.push(riderStart, riderEnd);
    }

    // Draw incident if present
    if (incident && incident.coordinate) {
      const incLatLng = coordToLL(incident.coordinate);
      const incMarker = L.marker(incLatLng, {
        icon: createIncidentIcon(),
      }).bindPopup(`
        <div style="font-family: var(--font-family); padding: 4px 2px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: #f59e0b; letter-spacing: 0.5px;">Incident Active</div>
          <div style="font-size: 12px; font-weight: 600; margin-top: 2px;">${incident.label || 'Road Closure'}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Dynamic A* replan triggered</div>
        </div>
      `).addTo(map);
      layersRef.current.push(incMarker);

      if (incident.detourRoute && incident.detourRoute.length > 0) {
        const detourLatLngs = incident.detourRoute.map((c) => coordToLL(c));
        const detourLine = L.polyline(detourLatLngs, {
          color: COLORS.incident,
          weight: 4,
          opacity: 0.9,
          dashArray: '8 6',
        }).bindPopup(`
          <div style="font-family: var(--font-family); padding: 4px 2px;">
            <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: #f59e0b;">Recourse Detour Path</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Avoiding blocked segment</div>
          </div>
        `).addTo(map);
        layersRef.current.push(detourLine);
      }
    }

    // Draw driver routes
    if (drivers && drivers.length > 0) {
      const resultMap = {};
      if (matchResults?.all) {
        matchResults.all.forEach((r) => { resultMap[r.driver_id] = r; });
      }

      drivers.forEach((driver) => {
        const result = resultMap[driver.journey_id];
        const isSelected = selectedDriver === driver.journey_id;
        const isEligible = result ? result.final_eligible : true;

        const color = isSelected ? COLORS.selected : isEligible ? COLORS.eligible : COLORS.rejected;
        const weight = isSelected ? 5 : isEligible ? 3 : 2;
        const opacity = isSelected ? 1.0 : isEligible ? 0.75 : 0.25;

        const driverLatLngs = (driver.route || []).map((c) => coordToLL(c));
        if (driverLatLngs.length === 0) return;

        const driverLine = L.polyline(driverLatLngs, {
          color,
          weight,
          opacity,
          dashArray: isEligible ? null : '6 4',
        }).addTo(map);

        driverLine.on('click', () => onSelectDriver?.(driver.journey_id));

        const startMarker = L.circleMarker(coordToLL(driver.start), {
          radius: isSelected ? 7 : 5,
          fillColor: color,
          color: isSelected ? '#ffffff' : color,
          weight: isSelected ? 2 : 1,
          fillOpacity: isSelected ? 1 : 0.8,
        }).bindPopup(`
          <div style="font-family: var(--font-family); padding: 4px 2px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 600;">${driver.journey_id}</span>
              <span class="badge ${isEligible ? 'success' : 'danger'}" style="font-size: 9px; padding: 1px 5px;">
                ${isEligible ? 'ELIGIBLE' : 'REJECTED'}
              </span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; font-size: 11px; color: var(--text-secondary);">
              <div>Score: <strong style="color: var(--text-primary);">${result?.score !== undefined ? result.score.toFixed(1) : '—'}</strong></div>
              <div>Seats: <strong style="color: var(--text-primary);">${driver.capacity || '—'}</strong></div>
            </div>
          </div>
        `).addTo(map);

        startMarker.on('click', () => onSelectDriver?.(driver.journey_id));

        layersRef.current.push(driverLine, startMarker);
      });
    }

    // Fit bounds smoothly
    const allPoints = [
      ...riderLatLngs,
      ...(drivers || []).flatMap((d) => (d.route || []).map((c) => coordToLL(c))),
    ];
    if (allPoints.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(allPoints).pad(0.12));
      } catch {
        // bounds fit fallback
      }
    }

  }, [rider, drivers, matchResults, selectedDriver, onSelectDriver, incident]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapRef}
      className="map-container"
      id="route-map"
      style={{ height, width: '100%', position: 'relative' }}
    />
  );
}
