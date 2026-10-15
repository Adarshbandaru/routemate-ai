import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../styles/rapido-theme.css';
import {
  precomputePolyline,
  interpolateAlongPolyline,
} from '../lib/vehicleAnimation';

const BACKEND_URL = 'http://127.0.0.1:8000';

function getVehicleIconSvg(vehicleType = 'sedan', color = '#FF6B35') {
  if (vehicleType === 'bike') {
    return `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5.5" cy="17.5" r="3.5"/>
        <circle cx="18.5" cy="17.5" r="3.5"/>
        <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5L9 9H6m6 8.5l3-6h4"/>
      </svg>
    `;
  }
  if (vehicleType === 'auto') {
    return `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M7 7l2-4h6l2 4"/>
      </svg>
    `;
  }
  // Default car / sedan
  return `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H8c-.7 0-1.3.3-1.8.7C5.3 8.6 4 10 4 10s-2.7.6-4.5 1.1C-.3 11.3 0 12.1 0 13v3c0 .6.4 1 1 1h2"/>
      <circle cx="7" cy="17" r="2"/>
      <path d="M9 17h6"/>
      <circle cx="17" cy="17" r="2"/>
    </svg>
  `;
}

function createPinIcon(type, color, label) {
  return L.divIcon({
    className: `rapido-map-pin pin-${type}`,
    html: `
      <div style="
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #111;
        border: 3px solid ${color};
        box-shadow: 0 0 12px ${color};
        display: flex;
        align-items: center;
        justify-content: center;
      " title="${label || ''}">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: ${color};"></div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function createDriverMarkerIcon(vehicleType, color = '#FF6B35', isSelected = false) {
  const borderStyle = isSelected ? 'border: 2px solid #FF6B35; box-shadow: 0 0 14px rgba(255, 107, 53, 0.8);' : 'border: 1px solid rgba(255,255,255,0.2);';
  return L.divIcon({
    className: 'rapido-driver-marker',
    html: `
      <div style="
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: #1A1A1A;
        ${borderStyle}
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 120ms ease;
      ">
        ${getVehicleIconSvg(vehicleType, color)}
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

export default function RapidoHomeScreen({ onSwitchToConsole }) {
  const [backendOnline, setBackendOnline] = useState(false);
  const [allScenarios, setAllScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('lpu_commute');
  const [currentScenario, setCurrentScenario] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [stage, setStage] = useState('search'); // 'search' | 'results' | 'confirmed'
  const [tripPhase, setTripPhase] = useState('idle'); // 'to_pickup' | 'arrived_pickup' | 'to_dropoff' | 'completed'
  const [toastMessage, setToastMessage] = useState(null);
  const [confirmedRide, setConfirmedRide] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routePolylineRef = useRef(null);
  const markersGroupRef = useRef(null);
  const animatedMarkerRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Show Toast
  const showToast = useCallback((msg, durationMs = 3500) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, durationMs);
  }, []);

  // 1. Initial Health Check & Scenarios Load
  useEffect(() => {
    async function initBackend() {
      try {
        const healthRes = await fetch(`${BACKEND_URL}/v1/health`);
        const healthData = await healthRes.json();
        if (healthData.success) {
          setBackendOnline(true);
        }
      } catch {
        setBackendOnline(false);
      }

      try {
        const scenariosRes = await fetch(`${BACKEND_URL}/v1/scenarios`);
        const scenariosData = await scenariosRes.json();
        if (scenariosData.success && scenariosData.data?.length > 0) {
          setAllScenarios(scenariosData.data);
        }
      } catch {
        // Fallback scenario list if offline
        setAllScenarios([
          { id: 'lpu_commute', name: 'LPU Commute - Evening Rush' },
          { id: 'campus_shuttle', name: 'Campus Shuttle Rush' },
          { id: 'industrial_delivery', name: 'Industrial Delivery' },
          { id: 'phagwara_gridlock', name: 'Phagwara Gridlock (Incident)' },
        ]);
      }
    }

    initBackend();
  }, []);

  // 2. Fetch Selected Scenario Data
  useEffect(() => {
    async function loadScenarioData() {
      try {
        const res = await fetch(`${BACKEND_URL}/v1/scenario/${selectedScenarioId}`);
        const json = await res.json();
        if (json.success && json.data) {
          setCurrentScenario(json.data);
          setSelectedDriver(null);
          setStage('search');
          setTripPhase('idle');
          if (json.data.available_drivers?.length > 0) {
            setSelectedDriver(json.data.available_drivers[0]);
          }
        }
      } catch (e) {
        console.error('Failed to load scenario:', e);
      }
    }

    if (selectedScenarioId) {
      loadScenarioData();
    }
  }, [selectedScenarioId]);

  // 3. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([31.2536, 75.7037], 11);

      // Add Carto Dark tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      // Add Zoom Control at top-left
      L.control.zoom({ position: 'topleft' }).addTo(map);

      markersGroupRef.current = L.featureGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const timer = setTimeout(() => {
      try {
        mapInstanceRef.current?.invalidateSize();
      } catch {}
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  // 4. Update Map Layers When Scenario or Selected Driver Changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    if (!map || !group || !currentScenario) return;

    group.clearLayers();
    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (animatedMarkerRef.current) {
      map.removeLayer(animatedMarkerRef.current);
      animatedMarkerRef.current = null;
    }

    const boundsPoints = [];

    // Pickup Marker (Red)
    if (currentScenario.pickup) {
      const pickupLL = [currentScenario.pickup.lat, currentScenario.pickup.lng];
      const pMarker = L.marker(pickupLL, {
        icon: createPinIcon('pickup', '#E74C3C', currentScenario.pickup.name),
      }).bindPopup(`
        <div style="font-family: inherit; font-size: 12px; color: #fff; background: #222; padding: 6px; border-radius: 6px;">
          <div style="color: #E74C3C; font-weight: 700; text-transform: uppercase; font-size: 10px;">Pickup</div>
          <div style="font-weight: 600; font-size: 13px;">${currentScenario.pickup.name}</div>
          <div style="color: #aaa; margin-top: 2px;">${currentScenario.pickup.address}</div>
        </div>
      `);
      group.addLayer(pMarker);
      boundsPoints.push(pickupLL);
    }

    // Dropoff Marker (Green)
    if (currentScenario.dropoff) {
      const dropoffLL = [currentScenario.dropoff.lat, currentScenario.dropoff.lng];
      const dMarker = L.marker(dropoffLL, {
        icon: createPinIcon('dropoff', '#2ECC71', currentScenario.dropoff.name),
      }).bindPopup(`
        <div style="font-family: inherit; font-size: 12px; color: #fff; background: #222; padding: 6px; border-radius: 6px;">
          <div style="color: #2ECC71; font-weight: 700; text-transform: uppercase; font-size: 10px;">Dropoff</div>
          <div style="font-weight: 600; font-size: 13px;">${currentScenario.dropoff.name}</div>
          <div style="color: #aaa; margin-top: 2px;">${currentScenario.dropoff.address}</div>
        </div>
      `);
      group.addLayer(dMarker);
      boundsPoints.push(dropoffLL);
    }

    // Route Polyline (Orange Dashed)
    if (currentScenario.route_polyline && currentScenario.route_polyline.length > 0) {
      const line = L.polyline(currentScenario.route_polyline, {
        color: '#FF6B35',
        weight: 4,
        opacity: 0.85,
        dashArray: '6 6',
      }).addTo(map);
      routePolylineRef.current = line;
      boundsPoints.push(...currentScenario.route_polyline);
    }

    // Candidate Drivers (Only show candidate markers if not actively animating confirmed ride)
    if (stage !== 'confirmed' && currentScenario.available_drivers) {
      currentScenario.available_drivers.forEach((drv) => {
        const isSelected = selectedDriver?.id === drv.id;
        const drvLL = [drv.current_lat, drv.current_lng];
        const marker = L.marker(drvLL, {
          icon: createDriverMarkerIcon(drv.vehicle_type, isSelected ? '#FF6B35' : '#38bdf8', isSelected),
        }).bindPopup(`
          <div style="font-family: inherit; font-size: 12px; color: #fff; background: #222; padding: 6px; border-radius: 6px;">
            <div style="font-weight: 700; font-size: 13px;">${drv.name}</div>
            <div style="color: #FF6B35; font-weight: 600;">${drv.vehicle_name} (${drv.vehicle_number})</div>
            <div style="color: #aaa;">⭐ ${drv.rating} · ETA: ${drv.eta_to_pickup_min} min</div>
          </div>
        `);

        marker.on('click', () => {
          setSelectedDriver(drv);
        });

        group.addLayer(marker);
        boundsPoints.push(drvLL);
      });
    }

    // Fit map bounds smoothly
    if (boundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [40, 40],
        maxZoom: 14,
      });
    }
  }, [currentScenario, selectedDriver, stage]);

  // 5. Driver Animation Logic (requestAnimationFrame)
  const startDriverAnimation = useCallback((driver, scenario) => {
    const map = mapInstanceRef.current;
    if (!map || !driver || !scenario) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Phase 1: Driver current location -> Pickup
    const pickupLL = [scenario.pickup.lat, scenario.pickup.lng];
    const dropoffLL = [scenario.dropoff.lat, scenario.dropoff.lng];

    const toPickupPolyline = [
      [driver.current_lat, driver.current_lng],
      [(driver.current_lat + pickupLL[0]) / 2, (driver.current_lng + pickupLL[1]) / 2],
      pickupLL,
    ];
    const pickupProfile = precomputePolyline(toPickupPolyline);

    // Phase 2: Pickup -> Dropoff along scenario route
    const tripRoute = scenario.route_polyline && scenario.route_polyline.length > 1
      ? scenario.route_polyline
      : [pickupLL, dropoffLL];
    const tripProfile = precomputePolyline(tripRoute);

    // Create moving Leaflet marker
    if (animatedMarkerRef.current) {
      map.removeLayer(animatedMarkerRef.current);
    }

    const animatedMarker = L.marker([driver.current_lat, driver.current_lng], {
      icon: L.divIcon({
        className: 'rapido-moving-driver',
        html: `
          <div id="rapido-driver-sprite" style="
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #1A1A1A;
            border: 3px solid #FF6B35;
            box-shadow: 0 0 16px rgba(255, 107, 53, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(0deg);
            transition: transform 60ms linear;
          ">
            ${getVehicleIconSvg(driver.vehicle_type, '#FF6B35')}
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
      zIndexOffset: 1000,
    }).addTo(map);

    animatedMarkerRef.current = animatedMarker;

    const phase1DurationMs = 5000; // 5s to pickup
    const phase2DurationMs = 12000; // 12s to dropoff

    let startTime = null;
    let phase = 'to_pickup';
    setTripPhase('to_pickup');

    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      if (phase === 'to_pickup') {
        const progress = Math.min(1, elapsed / phase1DurationMs);
        const { lat, lng, bearing } = interpolateAlongPolyline(pickupProfile, progress);

        animatedMarker.setLatLng([lat, lng]);
        const sprite = document.getElementById('rapido-driver-sprite');
        if (sprite) {
          sprite.style.transform = `rotate(${bearing}deg)`;
        }

        map.panTo([lat, lng], { animate: true, duration: 0.1 });

        if (progress >= 1) {
          phase = 'arrived_pickup';
          setTripPhase('arrived_pickup');
          showToast(`📍 Driver ${driver.name} has arrived at ${scenario.pickup.name}! Get in.`);

          // Pause 1.5s at pickup before heading to dropoff
          setTimeout(() => {
            phase = 'to_dropoff';
            setTripPhase('to_dropoff');
            startTime = performance.now();
            showToast(`🚀 On the way to ${scenario.dropoff.name}!`);
            animationFrameRef.current = requestAnimationFrame(animate);
          }, 1500);
          return;
        }
      } else if (phase === 'to_dropoff') {
        const progress = Math.min(1, elapsed / phase2DurationMs);
        const { lat, lng, bearing } = interpolateAlongPolyline(tripProfile, progress);

        animatedMarker.setLatLng([lat, lng]);
        const sprite = document.getElementById('rapido-driver-sprite');
        if (sprite) {
          sprite.style.transform = `rotate(${bearing}deg)`;
        }

        map.panTo([lat, lng], { animate: true, duration: 0.1 });

        if (progress >= 1) {
          phase = 'completed';
          setTripPhase('completed');
          showToast(`🎉 Ride Completed! You have safely arrived at ${scenario.dropoff.name}.`);
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [showToast]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // 6. Handle Confirm Ride Action
  const handleConfirmRide = async () => {
    if (!selectedDriver || !currentScenario) return;

    try {
      const res = await fetch(`${BACKEND_URL}/v1/confirm-ride`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: selectedDriver.id,
          scenario_id: currentScenario.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfirmedRide(data.data);
        setStage('confirmed');
        showToast(`Ride confirmed with ${selectedDriver.name}! Driver is arriving in ${selectedDriver.eta_to_pickup_min} min.`);
        startDriverAnimation(selectedDriver, currentScenario);
      }
    } catch (e) {
      console.error('Failed to confirm ride:', e);
      // Fallback local confirm
      setConfirmedRide({
        ride_id: 'RIDE_' + Math.floor(Math.random() * 900000 + 100000),
        driver: selectedDriver,
        pickup: currentScenario.pickup,
        dropoff: currentScenario.dropoff,
        status: 'driver_arriving',
        eta_min: selectedDriver.eta_to_pickup_min,
      });
      setStage('confirmed');
      startDriverAnimation(selectedDriver, currentScenario);
    }
  };

  const handleResetTrip = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setStage('search');
    setTripPhase('idle');
    setConfirmedRide(null);
  };

  return (
    <div className="rapido-app-container">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="rapido-toast-container">
          <div className="rapido-toast">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* 1. Header (Sticky) */}
      <header className="rapido-header">
        <div className="rapido-header-left">
          <div className="rapido-logo-circle">RM</div>
          <div className="rapido-brand-text">
            <span className="rapido-brand-name">Rapido</span>
            <span className="rapido-brand-sub">Mobility Intelligence</span>
          </div>
        </div>

        <div className="rapido-header-right">
          <div className="rapido-status-pill">
            <span className={`rapido-dot ${backendOnline ? 'online' : 'offline'}`} />
            <span>Backend: {backendOnline ? 'Connected' : 'Offline'}</span>
          </div>
          {onSwitchToConsole && (
            <button
              type="button"
              className="rapido-secondary-btn"
              onClick={onSwitchToConsole}
              title="Open RouteMate Ops / Research Console"
            >
              Ops Console →
            </button>
          )}
        </div>
      </header>

      {/* 2. Fullscreen Leaflet Map Viewport */}
      <div className="rapido-map-viewport">
        <div ref={mapContainerRef} className="rapido-leaflet-map" />

        {/* Floating Controls */}
        <div className="rapido-map-floating-bar">
          <button
            type="button"
            className="rapido-map-btn"
            onClick={() => {
              if (currentScenario && mapInstanceRef.current) {
                const pts = [
                  [currentScenario.pickup.lat, currentScenario.pickup.lng],
                  [currentScenario.dropoff.lat, currentScenario.dropoff.lng],
                ];
                mapInstanceRef.current.fitBounds(L.latLngBounds(pts), { padding: [50, 50] });
              }
            }}
          >
            Center Route
          </button>
        </div>
      </div>

      {/* 3. Bottom Sheet */}
      <div className="rapido-bottom-sheet">
        <div className="rapido-drag-handle" />

        {/* ================= STAGE 1: SEARCH ================= */}
        {stage === 'search' && currentScenario && (
          <div>
            {/* Scenario Selector Row */}
            <div className="rapido-scenario-row">
              <select
                className="rapido-select"
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
              >
                {allScenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Pickup Location Card */}
            <div className="rapido-location-card">
              <span className="rapido-location-label">📍 Pickup Location</span>
              <span className="rapido-location-name">{currentScenario.pickup.name}</span>
              <span className="rapido-location-address">{currentScenario.pickup.address}</span>
            </div>

            {/* Dropoff Location Card */}
            <div className="rapido-location-card">
              <span className="rapido-location-label" style={{ color: '#2ECC71' }}>
                📍 Dropoff Location
              </span>
              <span className="rapido-location-name">{currentScenario.dropoff.name}</span>
              <span className="rapido-location-address">{currentScenario.dropoff.address}</span>
            </div>

            {/* Distance & Duration Strip */}
            <div className="rapido-metrics-strip">
              <div className="rapido-metric-box">
                <span className="rapido-metric-label">Distance</span>
                <span className="rapido-metric-val">{currentScenario.distance_km} km</span>
              </div>
              <div className="rapido-metric-box">
                <span className="rapido-metric-label">Estimated Time</span>
                <span className="rapido-metric-val">{currentScenario.duration_min} min</span>
              </div>
            </div>

            {/* Find Drivers Button */}
            <button
              type="button"
              className="rapido-primary-btn"
              onClick={() => setStage('results')}
            >
              <span>Find Drivers ({currentScenario.available_drivers?.length || 0} Nearby)</span>
            </button>
          </div>
        )}

        {/* ================= STAGE 2: RESULTS ================= */}
        {stage === 'results' && currentScenario && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700 }}>Available Drivers</span>
              <button
                type="button"
                className="rapido-secondary-btn"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => setStage('search')}
              >
                Change Route
              </button>
            </div>

            {/* Driver Cards List */}
            <div className="rapido-drivers-list">
              {currentScenario.available_drivers?.map((driver) => {
                const isSelected = selectedDriver?.id === driver.id;
                return (
                  <div
                    key={driver.id}
                    className={`rapido-driver-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedDriver(driver)}
                  >
                    <img
                      src={driver.photo_url}
                      alt={driver.name}
                      className="rapido-driver-avatar"
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop';
                      }}
                    />

                    <div className="rapido-driver-info">
                      <div className="rapido-driver-name">{driver.name}</div>
                      <div className="rapido-driver-rating">
                        ⭐ {driver.rating} <span style={{ color: '#777' }}>({driver.reviews} reviews)</span>
                      </div>
                      <div className="rapido-driver-vehicle">
                        {driver.vehicle_name} · <span style={{ color: '#888' }}>{driver.vehicle_number}</span>
                      </div>
                    </div>

                    <div className="rapido-driver-pricing">
                      <div className="rapido-driver-price">{driver.price_estimate}</div>
                      <div className="rapido-driver-eta">{driver.eta_to_pickup_min} min away</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Confirm Ride Button */}
            <button
              type="button"
              className="rapido-primary-btn"
              disabled={!selectedDriver}
              onClick={handleConfirmRide}
            >
              <span>Confirm Ride with {selectedDriver ? selectedDriver.name : 'Driver'}</span>
            </button>
          </div>
        )}

        {/* ================= STAGE 3: CONFIRMED & ACTIVE RIDE ================= */}
        {stage === 'confirmed' && currentScenario && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#FF6B35' }}>
                🎉 Ride Confirmed!
              </span>
              <span style={{ fontSize: '12px', color: '#888' }}>
                ID: {confirmedRide?.ride_id || 'RIDE_948102'}
              </span>
            </div>

            {/* Status Banner */}
            <div
              className={`rapido-status-banner ${
                tripPhase === 'arrived_pickup'
                  ? 'arrived'
                  : tripPhase === 'to_dropoff'
                  ? 'on_trip'
                  : tripPhase === 'completed'
                  ? 'completed'
                  : 'arriving'
              }`}
            >
              {tripPhase === 'arrived_pickup' && '📍 Driver Arrived at Pickup! Board the vehicle.'}
              {tripPhase === 'to_dropoff' && `🚗 En Route to ${currentScenario.dropoff.name}...`}
              {tripPhase === 'completed' && '✅ Ride Completed! Hope you had a pleasant journey.'}
              {tripPhase === 'to_pickup' && `⏱️ Driver arriving in ~${selectedDriver?.eta_to_pickup_min || 2} min`}
            </div>

            {/* Driver Profile Card */}
            {selectedDriver && (
              <div className="rapido-confirmed-card">
                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr auto', gap: '12px', alignItems: 'center' }}>
                  <img
                    src={selectedDriver.photo_url}
                    alt={selectedDriver.name}
                    className="rapido-driver-avatar"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop';
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700 }}>{selectedDriver.name}</div>
                    <div style={{ fontSize: '12px', color: '#aaa' }}>
                      {selectedDriver.vehicle_name} · <strong style={{ color: '#fff' }}>{selectedDriver.vehicle_number}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      📞 {selectedDriver.phone} · ⭐ {selectedDriver.rating}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="rapido-driver-price">{selectedDriver.price_estimate}</div>
                    <div style={{ fontSize: '11px', color: '#2ECC71', fontWeight: 600 }}>Cash / UPI</div>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#aaa', borderTop: '1px solid var(--rapido-border)', paddingTop: '8px' }}>
                  <span>Route: <strong>{currentScenario.pickup.name}</strong> → <strong>{currentScenario.dropoff.name}</strong></span>
                  <span style={{ float: 'right' }}>{currentScenario.distance_km} km</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="rapido-secondary-btn"
                style={{ flex: 1 }}
                onClick={handleResetTrip}
              >
                {tripPhase === 'completed' ? 'Book Another Ride' : 'Cancel Ride'}
              </button>
              <button
                type="button"
                className="rapido-primary-btn"
                style={{ flex: 2, margin: 0 }}
                onClick={() => {
                  if (currentScenario && mapInstanceRef.current) {
                    const pts = [
                      [currentScenario.pickup.lat, currentScenario.pickup.lng],
                      [currentScenario.dropoff.lat, currentScenario.dropoff.lng],
                    ];
                    mapInstanceRef.current.fitBounds(L.latLngBounds(pts), { padding: [60, 60] });
                  }
                }}
              >
                Track on Map
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
