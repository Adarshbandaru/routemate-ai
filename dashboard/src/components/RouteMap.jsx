import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { coordToLL } from '../data';

const COLORS = {
  rider: '#6366f1',
  eligible: '#10b981',
  rejected: '#ef4444',
  selected: '#06b6d4',
  incident: '#f59e0b',
  neutral: '#64748b',
};

function createPinIcon(emoji, bg, borderColor = '#ffffff') {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: ${bg};
      border: 2px solid ${borderColor};
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
      font-size: 13px;
    ">${emoji}</div>`,
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
      }).setView([37.7749, -122.4194], 13);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;

    // Invalidate size to ensure clean tile render
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // map might be unmounted
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
        dashArray: null,
      }).addTo(map);
      layersRef.current.push(riderLine);

      // Rider markers
      const riderStart = L.marker(coordToLL(rider.start), {
        icon: createPinIcon('🟢', '#1e1b4b', '#818cf8'),
      }).bindPopup(`<b>Rider Pickup</b><br/>ID: <code>${rider.journey_id}</code>`).addTo(map);

      const riderEnd = L.marker(coordToLL(rider.destination), {
        icon: createPinIcon('🏁', '#1e1b4b', '#818cf8'),
      }).bindPopup(`<b>Rider Destination</b><br/>Seats: ${rider.seats_requested || 1}`).addTo(map);

      layersRef.current.push(riderStart, riderEnd);
    }

    // Draw incident if present (Dynamic Recourse demonstration)
    if (incident && incident.coordinate) {
      const incLatLng = coordToLL(incident.coordinate);
      const incMarker = L.marker(incLatLng, {
        icon: createPinIcon('⚠️', '#78350f', '#f59e0b'),
      }).bindPopup(
        `<b>Road Closure Incident</b><br/>${incident.label || 'Congestion spike / closure'}<br/>Recourse Detour active`
      ).addTo(map);
      layersRef.current.push(incMarker);

      if (incident.detourRoute && incident.detourRoute.length > 0) {
        const detourLatLngs = incident.detourRoute.map((c) => coordToLL(c));
        const detourLine = L.polyline(detourLatLngs, {
          color: COLORS.incident,
          weight: 4,
          opacity: 0.9,
          dashArray: '8 6',
        }).bindPopup('<b>Recourse Detour Path</b><br/>Dynamic A* replan avoiding closed edge').addTo(map);
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

        let color = isSelected ? COLORS.selected : isEligible ? COLORS.eligible : COLORS.rejected;
        let weight = isSelected ? 5 : isEligible ? 3 : 2;
        let opacity = isSelected ? 1.0 : isEligible ? 0.7 : 0.25;

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
          radius: isSelected ? 8 : 5,
          fillColor: color,
          color: isSelected ? '#ffffff' : color,
          weight: isSelected ? 2 : 1,
          fillOpacity: isSelected ? 1 : 0.75,
        }).bindPopup(
          `<b>${driver.journey_id}</b><br/>` +
          `Status: ${isEligible ? '✅ Eligible' : '❌ Rejected'}<br/>` +
          `Score: ${result?.score !== undefined ? result.score.toFixed(1) : 'N/A'}<br/>` +
          `Capacity: ${driver.capacity || 'N/A'}`
        ).addTo(map);

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
        // bounds fit failure fallback
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
