import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { coordToLL } from '../data';

const COLORS = {
  rider: '#6366f1',
  eligible: '#10b981',
  rejected: '#ef4444',
  selected: '#06b6d4',
  neutral: '#64748b',
};

export default function RouteMap({ rider, drivers, matchResults, selectedDriver, onSelectDriver }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

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

    // Clear old layers
    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current = [];

    if (!rider) return;

    // Draw rider route
    const riderLatLngs = rider.route.map(coordToLL);
    const riderLine = L.polyline(riderLatLngs, {
      color: COLORS.rider,
      weight: 5,
      opacity: 0.9,
      dashArray: null,
    }).addTo(map);
    layersRef.current.push(riderLine);

    // Rider markers
    const riderStart = L.circleMarker(coordToLL(rider.start), {
      radius: 8,
      fillColor: COLORS.rider,
      color: '#fff',
      weight: 2,
      fillOpacity: 1,
    }).bindPopup(`<b>Rider Start</b><br/>ID: ${rider.journey_id}`).addTo(map);

    const riderEnd = L.circleMarker(coordToLL(rider.destination), {
      radius: 8,
      fillColor: COLORS.rider,
      color: '#fff',
      weight: 2,
      fillOpacity: 1,
    }).bindPopup(`<b>Rider Destination</b>`).addTo(map);

    layersRef.current.push(riderStart, riderEnd);

    // Draw driver routes
    if (drivers && matchResults) {
      const resultMap = {};
      matchResults.all.forEach((r) => { resultMap[r.driver_id] = r; });

      drivers.forEach((driver) => {
        const result = resultMap[driver.journey_id];
        const isSelected = selectedDriver === driver.journey_id;
        const isEligible = result?.final_eligible;

        let color = isSelected ? COLORS.selected : isEligible ? COLORS.eligible : COLORS.rejected;
        let weight = isSelected ? 4 : 2;
        let opacity = isSelected ? 0.95 : isEligible ? 0.6 : 0.25;

        const driverLatLngs = driver.route.map(coordToLL);
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
          color: isSelected ? '#fff' : color,
          weight: isSelected ? 2 : 1,
          fillOpacity: isSelected ? 1 : 0.7,
        }).bindPopup(
          `<b>${driver.journey_id}</b><br/>` +
          `Status: ${isEligible ? '✅ Eligible' : '❌ Rejected'}<br/>` +
          `Score: ${result?.score?.toFixed(1) ?? 'N/A'}`
        ).addTo(map);

        startMarker.on('click', () => onSelectDriver?.(driver.journey_id));

        layersRef.current.push(driverLine, startMarker);
      });
    }

    // Fit bounds
    const allPoints = [
      ...riderLatLngs,
      ...(drivers || []).flatMap((d) => d.route.map(coordToLL)),
    ];
    if (allPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allPoints).pad(0.1));
    }

  }, [rider, drivers, matchResults, selectedDriver, onSelectDriver]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapRef} className="map-container" id="route-map" />;
}
