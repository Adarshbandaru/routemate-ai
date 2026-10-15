import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Calendar,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  Car,
  Clock,
  ChevronRight,
  Info,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { SEED_SCENARIOS } from '../data/seedScenarios';
import { createBaseTileLayer, BASEMAP_OPTIONS } from '../utils/mapTiles';
import {
  precomputePolyline,
  interpolateAlongPolyline,
} from '../lib/vehicleAnimation';
import { apiService } from '../services/apiService';
import DefaultRoutesSection from './common/DefaultRoutesSection';
import LocationAutocomplete from './common/LocationAutocomplete';
import { PUNJAB_LANDMARKS } from '../data/punjabLandmarks';
import RideChatModal from './common/RideChatModal';
import {
  FareEstimate,
  PromoCodeInput,
  PromosCarousel,
  RidePoolingToggle,
  DriverProfileCard,
  RatingsModal,
  TripReceipt,
  RazorpayCheckoutModal,
} from './phase3';

const BACKEND_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';

function createPinIcon(type, color, label) {
  return L.divIcon({
    className: `map-pin-marker pin-${type}`,
    html: `
      <div style="
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #ffffff;
        border: 2.5px solid ${color};
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
        display: flex;
        align-items: center;
        justify-content: center;
      " title="${label || ''}">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function createDriverIcon(color = '#176B4D', isSelected = false) {
  const border = isSelected ? '2px solid #176B4D' : '1.5px solid #E4E8E0';
  const shadow = isSelected ? '0 4px 12px rgba(23, 107, 77, 0.28)' : '0 2px 6px rgba(0, 0, 0, 0.12)';
  const iconColor = isSelected ? '#176B4D' : '#68746A';
  return L.divIcon({
    className: 'driver-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #ffffff;
        border: ${border};
        box-shadow: ${shadow};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.15s ease;
      ">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H8c-.7 0-1.3.3-1.8.7C5.3 8.6 4 10 4 10s-2.7.6-4.5 1.1C-.3 11.3 0 12.1 0 13v3c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export default function RiderHome({ onSwitchToConsole }) {
  const [backendOnline, setBackendOnline] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState('lpu_commute');
  const [scenarios, setScenarios] = useState(SEED_SCENARIOS);

  const currentScenario = useMemo(() => {
    return scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];
  }, [scenarios, selectedScenarioId]);

  const [stage, setStage] = useState('search'); // 'search' | 'results' | 'details' | 'confirmed'
  const [basemap, setBasemap] = useState('esri_light');
  const [seatsRequested, setSeatsRequested] = useState(1);
  const [departureTime, setDepartureTime] = useState('Today, 18:30');
  const [showRejected, setShowRejected] = useState(false);
  const [tripPhase, setTripPhase] = useState('idle'); // 'to_pickup' | 'arrived' | 'to_dropoff' | 'completed'
  const [toastMessage, setToastMessage] = useState(null);
  const [searchSubMode, setSearchSubMode] = useState('popular'); // 'popular' | 'custom'
  const [customPickup, setCustomPickup] = useState(PUNJAB_LANDMARKS[2]); // Jalandhar Stn
  const [customDropoff, setCustomDropoff] = useState(PUNJAB_LANDMARKS[0]); // LPU Main Gate
  const [isSearching, setIsSearching] = useState(false);
  const [riderChatOpen, setRiderChatOpen] = useState(false);
  const [allowPooling, setAllowPooling] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [liveFareEstimate, setLiveFareEstimate] = useState(null);
  const [ratingsModalOpen, setRatingsModalOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [activeBookingId, setActiveBookingId] = useState(null);
  const [cashCollected, setCashCollected] = useState(false);
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [razorpayModalOpen, setRazorpayModalOpen] = useState(false);
  const [onlinePaid, setOnlinePaid] = useState(false);

  const poolingDiscount = allowPooling ? 30.0 : 0.0;

  const [selectedDriverId, setSelectedDriverId] = useState(() => SEED_SCENARIOS[0].available_drivers[0]?.id || null);

  const compatibleDrivers = useMemo(() => {
    if (!currentScenario?.available_drivers) return [];
    return currentScenario.available_drivers.filter(
      (d) => d.seats_available >= seatsRequested
    );
  }, [currentScenario, seatsRequested]);

  const capacityFilteredOut = useMemo(() => {
    if (!currentScenario?.available_drivers) return [];
    return currentScenario.available_drivers.filter(
      (d) => d.seats_available < seatsRequested
    );
  }, [currentScenario, seatsRequested]);

  const selectedDriver = useMemo(() => {
    if (!compatibleDrivers.length) return null;
    return (
      compatibleDrivers.find((d) => d.id === selectedDriverId) ||
      compatibleDrivers[0]
    );
  }, [compatibleDrivers, selectedDriverId]);

  const setSelectedDriver = useCallback((driver) => {
    setSelectedDriverId(driver ? driver.id : null);
  }, []);

  const handleSelectScenario = useCallback((id) => {
    setSelectedScenarioId(id);
    const sc = scenarios.find((s) => s.id === id);
    if (sc?.available_drivers?.length) {
      setSelectedDriverId(sc.available_drivers[0].id);
    }
  }, [scenarios]);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const markersGroupRef = useRef(null);
  const animatedMarkerRef = useRef(null);
  const animationFrameRef = useRef(null);

  const showToast = useCallback((msg, durationMs = 3500) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, durationMs);
  }, []);

  // 1. Check live backend health & load scenarios if available
  useEffect(() => {
    let isMounted = true;
    async function checkBackend() {
      try {
        const res = await fetch(`${BACKEND_URL}/v1/health`, { method: 'GET' });
        const json = await res.json();
        if (json.success && isMounted) {
          setBackendOnline(true);
          try {
            const scRes = await fetch(`${BACKEND_URL}/v1/scenarios`);
            const scData = await scRes.json();
            if (scData.success && scData.data?.length > 0 && isMounted) {
              // Merge live scenarios with client-side seed rich details
              const merged = SEED_SCENARIOS.map((s) => {
                const live = scData.data.find((item) => item.id === s.id);
                return live ? { ...s, ...live } : s;
              });
              setScenarios(merged);
            }
          } catch {}
        }
      } catch {
        if (isMounted) setBackendOnline(false);
      }
    }
    checkBackend();
    return () => { isMounted = false; };
  }, []);



  // 3. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([31.28, 75.64], 11);

      tileLayerRef.current = createBaseTileLayer('esri_light').addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      markersGroupRef.current = L.featureGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const timer = setTimeout(() => {
      try {
        mapInstanceRef.current?.invalidateSize();
      } catch {}
    }, 200);

    const handleResize = () => {
      try {
        mapInstanceRef.current?.invalidateSize();
      } catch {}
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Sync Basemap tile layer on user selection
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = createBaseTileLayer(basemap, () => {
      setBasemap('esri_light');
      showToast('Tile layer refreshed to Warm Canvas.');
    }).addTo(map);
  }, [basemap, showToast]);

  // 4. Update Map Overlays on Scenario or Driver Selection
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

    // Pickup Marker (Warm Terracotta / Amber)
    if (currentScenario.pickup) {
      const pLL = [currentScenario.pickup.lat, currentScenario.pickup.lng];
      const pMarker = L.marker(pLL, {
        icon: createPinIcon('pickup', '#C2410C', currentScenario.pickup.name),
      }).bindPopup(`<b>Pickup:</b> ${currentScenario.pickup.name}<br/>${currentScenario.pickup.address}`);
      group.addLayer(pMarker);
      boundsPoints.push(pLL);
    }

    // Dropoff Marker (Forest Green)
    if (currentScenario.dropoff) {
      const dLL = [currentScenario.dropoff.lat, currentScenario.dropoff.lng];
      const dMarker = L.marker(dLL, {
        icon: createPinIcon('dropoff', '#176B4D', currentScenario.dropoff.name),
      }).bindPopup(`<b>Destination:</b> ${currentScenario.dropoff.name}<br/>${currentScenario.dropoff.address}`);
      group.addLayer(dMarker);
      boundsPoints.push(dLL);
    }

    // Route Polyline (Deep Forest Green)
    if (currentScenario.route_polyline && currentScenario.route_polyline.length > 1) {
      const poly = L.polyline(currentScenario.route_polyline, {
        color: '#176B4D',
        weight: 4.5,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);
      routePolylineRef.current = poly;
      for (const pt of currentScenario.route_polyline) {
        boundsPoints.push(pt);
      }
    }

    // Candidate Driver Markers
    if (currentScenario.available_drivers) {
      for (const d of currentScenario.available_drivers) {
        if (d.current_lat && d.current_lng) {
          const isSelected = selectedDriver?.id === d.id;
          const dMarker = L.marker([d.current_lat, d.current_lng], {
            icon: createDriverIcon(isSelected ? '#176B4D' : '#68746A', isSelected),
            zIndexOffset: isSelected ? 500 : 100,
          }).bindPopup(`<b>${d.name}</b> (${d.vehicle_name})<br/>ETA: ${d.eta_to_pickup_min} min`);
          dMarker.on('click', () => setSelectedDriver(d));
          group.addLayer(dMarker);
          boundsPoints.push([d.current_lat, d.current_lng]);
        }
      }
    }

    // Highlight approach path from selected driver to pickup
    if (selectedDriver && selectedDriver.current_lat && selectedDriver.current_lng && currentScenario.pickup) {
      const approachPoly = L.polyline(
        [
          [selectedDriver.current_lat, selectedDriver.current_lng],
          [currentScenario.pickup.lat, currentScenario.pickup.lng],
        ],
        {
          color: '#176B4D',
          weight: 2.5,
          dashArray: '5, 8',
          opacity: 0.85,
        }
      );
      group.addLayer(approachPoly);
    }

    if (boundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [40, 40], maxZoom: 14 });
    }
  }, [currentScenario, selectedDriver, setSelectedDriver]);

  // 5. Driver Animation for Demo Confirmation
  const startDemoSimulation = useCallback((driver, scenario) => {
    const map = mapInstanceRef.current;
    if (!map || !driver || !scenario) return;

    if (animatedMarkerRef.current) {
      map.removeLayer(animatedMarkerRef.current);
      animatedMarkerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const driverStart = [driver.current_lat, driver.current_lng];
    const pickupPt = [scenario.pickup.lat, scenario.pickup.lng];
    const dropoffPt = [scenario.dropoff.lat, scenario.dropoff.lng];

    const toPickupPoly = [driverStart, pickupPt];
    const toDropoffPoly = scenario.route_polyline && scenario.route_polyline.length > 1
      ? scenario.route_polyline
      : [pickupPt, dropoffPt];

    const pProfile = precomputePolyline(toPickupPoly);
    const dProfile = precomputePolyline(toDropoffPoly);

    const vehicleMarker = L.marker(driverStart, {
      icon: L.divIcon({
        className: 'sim-vehicle-marker',
        html: `
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #176B4D;
            border: 2.5px solid #ffffff;
            box-shadow: 0 4px 14px rgba(23, 107, 77, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H8c-.7 0-1.3.3-1.8.7C5.3 8.6 4 10 4 10s-2.7.6-4.5 1.1C-.3 11.3 0 12.1 0 13v3c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2"/>
              <path d="M9 17h6"/>
              <circle cx="17" cy="17" r="2"/>
            </svg>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
      zIndexOffset: 1000,
    }).addTo(map);

    animatedMarkerRef.current = vehicleMarker;

    const pDuration = 4000;
    const dDuration = 10000;
    let startTime = null;
    let currentPhase = 'to_pickup';
    setTripPhase('to_pickup');

    function animate(now) {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;

      if (currentPhase === 'to_pickup') {
        const progress = Math.min(1, elapsed / pDuration);
        const pt = interpolateAlongPolyline(pProfile, progress);
        vehicleMarker.setLatLng([pt.lat, pt.lng]);

        if (progress >= 1) {
          currentPhase = 'arrived';
          setTripPhase('arrived');
          showToast(`Driver ${driver.name} has arrived at ${scenario.pickup.name}!`);
          setTimeout(() => {
            currentPhase = 'to_dropoff';
            setTripPhase('to_dropoff');
            startTime = performance.now();
            showToast(`En route to ${scenario.dropoff.name}...`);
            animationFrameRef.current = requestAnimationFrame(animate);
          }, 1500);
          return;
        }
      } else if (currentPhase === 'to_dropoff') {
        const progress = Math.min(1, elapsed / dDuration);
        const pt = interpolateAlongPolyline(dProfile, progress);
        vehicleMarker.setLatLng([pt.lat, pt.lng]);

        if (progress >= 1) {
          setTripPhase('completed');
          setCashCollected(true);
          showToast(`Arrived safely at ${scenario.dropoff.name}! Cash collected by driver.`);
          return;
        }
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [showToast]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const handleSelectDefaultRoute = useCallback((route) => {
    const existing = scenarios.find((s) => s.id === route.id);
    if (existing) {
      handleSelectScenario(existing.id);
    } else {
      const synthetic = {
        id: route.id,
        name: route.name,
        description: `Popular route: ${route.category}`,
        distance_km: route.distance_km,
        duration_min: route.duration_min,
        pickup: route.pickup,
        dropoff: route.dropoff,
        route_polyline: route.route_polyline || [
          [route.pickup.lat, route.pickup.lng],
          [(route.pickup.lat + route.dropoff.lat) / 2, (route.pickup.lng + route.dropoff.lng) / 2],
          [route.dropoff.lat, route.dropoff.lng],
        ],
        available_drivers: [
          {
            id: `drv_${route.id}_1`,
            name: 'Priya Sharma',
            vehicle: 'Glacier White Swift Dzire',
            rating: 4.9,
            trips: 342,
            distance_km: route.distance_km,
            duration_min: route.duration_min,
            estimated_fare: route.avg_fare,
            eta_to_pickup_min: 3,
            detour_delay_min: 0,
            seats_available: 3,
            compatibility_reason: 'Direct corridor trip via NH-44',
            verified: true,
            current_lat: route.pickup.lat + 0.003,
            current_lng: route.pickup.lng + 0.004,
          },
          {
            id: `drv_${route.id}_2`,
            name: 'Rajesh Kumar',
            vehicle: 'Silver Honda City',
            rating: 4.8,
            trips: 218,
            distance_km: Math.round(route.distance_km * 1.05 * 10) / 10,
            duration_min: route.duration_min + 3,
            estimated_fare: Math.round(route.avg_fare * 1.08),
            eta_to_pickup_min: 5,
            detour_delay_min: 2,
            seats_available: 2,
            compatibility_reason: 'Nearby pickup corridor match',
            verified: true,
            current_lat: route.pickup.lat - 0.004,
            current_lng: route.pickup.lng - 0.003,
          },
        ],
        rejected_candidates: [],
      };
      setScenarios((prev) => [synthetic, ...prev.filter((s) => s.id !== synthetic.id)]);
      setSelectedScenarioId(synthetic.id);
      setSelectedDriverId(synthetic.available_drivers[0].id);
    }
    setStage('results');
    showToast(`Loaded ${route.name} (${route.distance_km} km)`);
  }, [scenarios, handleSelectScenario, showToast]);

  const handleCustomSearchSubmit = () => {
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
      const latDiff = Math.abs(customPickup.lat - customDropoff.lat);
      const lngDiff = Math.abs(customPickup.lng - customDropoff.lng);
      const dist = Math.max(2.0, Math.round((latDiff * 111.0 + lngDiff * 95.0) * 10) / 10);
      const duration = Math.round(dist * 1.2 + 5);
      const fare = Math.round(50 + dist * 10 + duration * 1);

      const customScenarioId = `custom_${Date.now()}`;
      const customScenario = {
        id: customScenarioId,
        name: `${customPickup.name.split('(')[0].trim()} → ${customDropoff.name.split('(')[0].trim()}`,
        description: 'Custom corridor trip',
        distance_km: dist,
        duration_min: duration,
        pickup: customPickup,
        dropoff: customDropoff,
        route_polyline: [
          [customPickup.lat, customPickup.lng],
          [(customPickup.lat + customDropoff.lat) / 2, (customPickup.lng + customDropoff.lng) / 2],
          [customDropoff.lat, customDropoff.lng],
        ],
        available_drivers: [
          {
            id: `drv_${customScenarioId}_1`,
            name: 'Priya Sharma',
            vehicle: 'Glacier White Swift Dzire',
            rating: 4.9,
            trips: 342,
            distance_km: dist,
            duration_min: duration,
            estimated_fare: fare,
            eta_to_pickup_min: 3,
            detour_delay_min: 0,
            seats_available: 3,
            compatibility_reason: 'Optimal route via NH-44 corridor',
            verified: true,
            current_lat: customPickup.lat + 0.002,
            current_lng: customPickup.lng + 0.003,
          },
          {
            id: `drv_${customScenarioId}_2`,
            name: 'Gurpreet Singh',
            vehicle: 'Maruti Ertiga Hybrid',
            rating: 4.85,
            trips: 189,
            distance_km: dist,
            duration_min: duration + 4,
            estimated_fare: Math.round(fare * 1.1),
            eta_to_pickup_min: 6,
            detour_delay_min: 2,
            seats_available: 4,
            compatibility_reason: 'Spacious vehicle en route',
            verified: true,
            current_lat: customPickup.lat - 0.003,
            current_lng: customPickup.lng - 0.002,
          },
        ],
        rejected_candidates: [],
      };
      setScenarios((prev) => [customScenario, ...prev]);
      setSelectedScenarioId(customScenarioId);
      setSelectedDriverId(customScenario.available_drivers[0].id);
      setStage('results');
      showToast(`Found 2 compatible drivers for ${customPickup.name.split('(')[0].trim()}`);
    }, 400);
  };

  const handleSelectDriverAndInspect = (driver) => {
    setSelectedDriver(driver);
    setStage('details');
  };

  const handleConfirmBooking = async () => {
    setStage('confirmed');
    setCashCollected(false);
    startDemoSimulation(selectedDriver, currentScenario);

    try {
      const res = await apiService.createBooking({
        driver_id: selectedDriver?.id,
        pickup_lat: currentScenario.pickup.lat,
        pickup_lng: currentScenario.pickup.lng,
        pickup_address: currentScenario.pickup.name,
        dropoff_lat: currentScenario.dropoff.lat,
        dropoff_lng: currentScenario.dropoff.lng,
        dropoff_address: currentScenario.dropoff.name,
        seats: seatsRequested,
        route_polyline: currentScenario.route_polyline || [],
      });
      const bId = res?.booking?.id || res?.data?.id || `bk_${Date.now()}`;
      setActiveBookingId(bId);

      if (appliedPromo?.code) {
        await apiService.applyPromo(bId, appliedPromo.code).catch(() => {});
      }
      if (allowPooling) {
        await apiService.poolRide({
          pickup_lat: currentScenario.pickup.lat,
          pickup_lng: currentScenario.pickup.lng,
          dropoff_lat: currentScenario.dropoff.lat,
          dropoff_lng: currentScenario.dropoff.lng,
          allow_pooling: true,
          booking_id: bId,
        }).catch(() => {});
      }
      if (res?.booking?.booking_number || res?.data?.booking_number) {
        showToast(`Booking ${res.booking?.booking_number || res.data?.booking_number} saved to database!`);
      }
      if (paymentMode === 'RAZORPAY') {
        setRazorpayModalOpen(true);
      }
    } catch {
      setActiveBookingId(`bk_${Date.now()}`);
      if (paymentMode === 'RAZORPAY') {
        setRazorpayModalOpen(true);
      }
    }
  };

  const handleReset = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (animatedMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(animatedMarkerRef.current);
      animatedMarkerRef.current = null;
    }
    setStage('search');
    setTripPhase('idle');
  };

  return (
    <div className="rider-product-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="rider-toast-notification" role="status" aria-live="polite">
          <Info size={16} className="text-accent" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left Journey Command Sidebar */}
      <aside className="rider-sidebar-panel" aria-label="Ride Planning & Search">
        {/* Brand & Mode Header */}
        <div className="rider-panel-header">
          <div className="rider-brand-row">
            <div className="rider-logo-badge">
              <Car size={18} />
            </div>
            <div>
              <h1 className="rider-title">Book a Shared Ride</h1>
              <p className="rider-subtitle">Punjab Mobility Corridor &bull; Dynamic Pooling</p>
            </div>
          </div>

          {/* Transparent Engine Status Badge */}
          <div className="rider-engine-status" title={backendOnline ? 'Connected to live FastAPI backend' : 'Deterministic candidate matching running locally in-browser'}>
            <div className={`status-dot ${backendOnline ? 'online' : 'simulated'}`} />
            <span>
              {backendOnline ? 'Live Backend Connected' : 'Deterministic Client Engine (Offline / Static)'}
            </span>
          </div>
        </div>

        {/* STAGE 1: SEARCH & ITINERARY BUILDER */}
        {stage === 'search' && (
          <div className="rider-flow-content">
            {/* Search Mode Switcher Tabs */}
            <div className="search-submode-tabs" role="tablist" aria-label="Route Selection Mode">
              <button
                type="button"
                className={`submode-tab-btn ${searchSubMode === 'popular' ? 'active' : ''}`}
                onClick={() => setSearchSubMode('popular')}
              >
                <Sparkles size={13} />
                <span>Popular Punjab Routes</span>
              </button>
              <button
                type="button"
                className={`submode-tab-btn ${searchSubMode === 'custom' ? 'active' : ''}`}
                onClick={() => setSearchSubMode('custom')}
              >
                <MapPin size={13} />
                <span>Custom Route</span>
              </button>
            </div>

            {/* SUBMODE A: POPULAR PUNJAB ROUTES CAROUSEL & CARDS */}
            {searchSubMode === 'popular' && (
              <DefaultRoutesSection
                onSelectRoute={handleSelectDefaultRoute}
                onSwitchToCustom={() => setSearchSubMode('custom')}
                selectedRouteId={selectedScenarioId}
              />
            )}

            {/* SUBMODE B: CUSTOM PUNJAB ROUTE BUILDER WITH AUTOCOMPLETE */}
            {searchSubMode === 'custom' && (
              <div className="custom-route-builder-flow">
                {/* Saved Address Quick Chips */}
                <div className="saved-chips-row">
                  <button
                    type="button"
                    className="saved-chip-btn"
                    onClick={() => {
                      setCustomPickup(PUNJAB_LANDMARKS[2]);
                      showToast('Set pickup to Jalandhar Railway Station');
                    }}
                  >
                    <span>🏠 Home: Jalandhar Stn</span>
                  </button>
                  <button
                    type="button"
                    className="saved-chip-btn"
                    onClick={() => {
                      setCustomDropoff(PUNJAB_LANDMARKS[0]);
                      showToast('Set destination to LPU Campus');
                    }}
                  >
                    <span>🎓 Campus: LPU Gate</span>
                  </button>
                  <button
                    type="button"
                    className="saved-chip-btn"
                    onClick={() => {
                      setCustomDropoff(PUNJAB_LANDMARKS[7]);
                      showToast('Set destination to Phagwara Bus Stand');
                    }}
                  >
                    <span>🚏 Bus Stand: Phagwara</span>
                  </button>
                </div>

                {/* Pickup Autocomplete */}
                <LocationAutocomplete
                  label="Pickup Location"
                  value={customPickup}
                  onSelectLocation={(item) => {
                    setCustomPickup(item);
                    showToast(`Pickup: ${item.name}`);
                  }}
                  iconType="pickup"
                />

                {/* Dropoff Autocomplete */}
                <LocationAutocomplete
                  label="Dropoff Destination"
                  value={customDropoff}
                  onSelectLocation={(item) => {
                    setCustomDropoff(item);
                    showToast(`Destination: ${item.name}`);
                  }}
                  iconType="dropoff"
                />

                {/* Travel Parameters */}
                <div className="travel-params-grid">
                  <div className="param-field">
                    <label className="form-label flex-items-center gap-1">
                      <Calendar size={13} className="text-muted" />
                      <span>Departure Time</span>
                    </label>
                    <select
                      className="input-field"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                    >
                      <option value="Now (in 5 mins)">Now (in 5 mins)</option>
                      <option value="Today, 18:00">Today, 18:00</option>
                      <option value="Today, 18:30">Today, 18:30</option>
                      <option value="Today, 19:00">Today, 19:00</option>
                      <option value="Today, 19:30">Today, 19:30</option>
                      <option value="Tomorrow, 08:30">Tomorrow, 08:30 (Morning Commute)</option>
                      <option value="Tomorrow, 09:00">Tomorrow, 09:00 (Campus Shuttle)</option>
                    </select>
                  </div>

                  <div className="param-field">
                    <label className="form-label flex-items-center gap-1">
                      <Users size={13} className="text-muted" />
                      <span>Seats Needed</span>
                    </label>
                    <div className="seat-stepper">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`seat-btn ${seatsRequested === n ? 'active' : ''}`}
                          onClick={() => setSeatsRequested(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Submit Custom Search */}
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg find-ride-btn"
                  onClick={handleCustomSearchSubmit}
                  disabled={isSearching}
                >
                  <Search size={18} />
                  <span>{isSearching ? 'Matching Drivers Along GT Road...' : 'Find Compatible Rides'}</span>
                </button>
              </div>
            )}

            {/* Ride Pooling Toggle */}
            <div style={{ marginTop: '14px' }}>
              <RidePoolingToggle
                allowPooling={allowPooling}
                onChange={setAllowPooling}
                poolingDiscount={poolingDiscount}
              />
            </div>

            {/* Special Offers Carousel */}
            <div style={{ marginTop: '14px' }}>
              <PromosCarousel
                onSelectPromo={(code) => {
                  setAppliedPromo({ code, discount: 50, finalAmount: 200 });
                  showToast(`Offer ${code} applied! Check fare breakdown.`);
                }}
              />
            </div>

            {/* Prototype Notice */}
            <p className="prototype-disclaimer text-xs text-muted">
              Punjab Transit Matching Engine &bull; Validates route overlap, detour delay, and vehicle capacity.
            </p>
          </div>
        )}

        {/* STAGE 2: MATCHING RESULTS */}
        {stage === 'results' && (
          <div className="rider-flow-content">
            <div className="stage-nav-header">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setStage('search')}
              >
                &larr; Modify Search
              </button>
              <span className="badge badge-accent font-mono text-xs">
                {compatibleDrivers.length} Matched
              </span>
            </div>

            <div className="results-intro">
              <h2 className="text-base font-semibold">Ranked Compatible Rides</h2>
              <p className="text-xs text-muted">
                Deterministic matching based on route overlap, detour deviation, and {seatsRequested} requested {seatsRequested === 1 ? 'seat' : 'seats'}.
              </p>
            </div>

            {/* Empty State when no drivers match requested seats */}
            {compatibleDrivers.length === 0 ? (
              <div className="empty-results-card">
                <AlertCircle size={28} className="text-warning mb-2" />
                <h3 className="text-sm font-semibold">No Vehicles Match {seatsRequested} Seats</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Active drivers on this Punjab corridor have insufficient vacant seats to accommodate {seatsRequested} passengers simultaneously within detour limits.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-3"
                  onClick={() => setSeatsRequested(1)}
                >
                  Search with 1 Seat
                </button>
              </div>
            ) : (
              /* Driver Match Cards */
              <div className="driver-match-list">
                {compatibleDrivers.map((driver, idx) => (
                  <div
                    key={driver.id}
                    className={`driver-card ${selectedDriver?.id === driver.id ? 'selected' : ''}`}
                    onClick={() => setSelectedDriver(driver)}
                  >
                    <div className="driver-card-top">
                      <div className="driver-avatar-wrap">
                        <img src={driver.photo_url} alt={driver.name} className="driver-avatar" />
                        <div className="driver-rank-badge">#{idx + 1}</div>
                      </div>
                      <div className="driver-meta">
                        <div className="driver-name-row">
                          <span className="driver-name">{driver.name}</span>
                          <span className="driver-price font-mono">{driver.price_estimate}</span>
                        </div>
                        <div className="driver-sub-row text-xs text-muted">
                          <span>★ {driver.rating} ({driver.reviews})</span>
                          <span>&bull;</span>
                          <span>{driver.vehicle_name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="driver-card-metrics font-mono text-xs">
                      <div className="metric-chip">
                        <Clock size={12} className="text-accent" />
                        <span>{driver.eta_to_pickup_min}m pickup</span>
                      </div>
                      <div className="metric-chip">
                        <ArrowRight size={12} className="text-success" />
                        <span>+{driver.detour_km} km detour</span>
                      </div>
                      <div className="metric-chip">
                        <Users size={12} className="text-muted" />
                        <span>{driver.seats_available} seats left</span>
                      </div>
                    </div>

                    {/* Why this match? */}
                    <div className="match-explanation">
                      <div className="match-score-badge">
                        <Sparkles size={12} />
                        <span>{driver.match_score || 95}% Match</span>
                      </div>
                      <p className="text-xs text-secondary mt-1">
                        {driver.reasons?.[0] || 'Passed spatial detour tolerance and capacity feasibility constraints.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      className={`btn btn-sm btn-block select-driver-btn ${selectedDriver?.id === driver.id ? 'btn-primary' : 'btn-outline'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectDriverAndInspect(driver);
                      }}
                    >
                      <span>Inspect & Confirm</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Filtered Out Candidates Toggle */}
            {((currentScenario.rejected_candidates?.length || 0) + capacityFilteredOut.length > 0) && (
              <div className="rejected-section">
                <button
                  type="button"
                  className="rejected-toggle-btn"
                  onClick={() => setShowRejected(!showRejected)}
                >
                  <AlertCircle size={14} className="text-warning" />
                  <span>
                    {(currentScenario.rejected_candidates?.length || 0) + capacityFilteredOut.length} Ineligible Candidates Filtered
                  </span>
                  <ChevronDown size={14} className={`chevron-icon ${showRejected ? 'open' : ''}`} />
                </button>

                {showRejected && (
                  <div className="rejected-list">
                    {capacityFilteredOut.map((cap) => (
                      <div key={`cap_${cap.id}`} className="rejected-card">
                        <div className="font-semibold text-xs text-primary">{cap.name} &bull; {cap.vehicle_name}</div>
                        <div className="text-xs text-danger mt-1">
                          Capacity constraint: Only {cap.seats_available} {cap.seats_available === 1 ? 'seat' : 'seats'} available (requested {seatsRequested}).
                        </div>
                      </div>
                    ))}
                    {currentScenario.rejected_candidates?.map((rej) => (
                      <div key={rej.id} className="rejected-card">
                        <div className="font-semibold text-xs text-primary">{rej.name} &bull; {rej.vehicle_name}</div>
                        <div className="text-xs text-danger mt-1">{rej.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STAGE 3: RIDE DETAILS & CONFIRMATION */}
        {stage === 'details' && selectedDriver && (
          <div className="rider-flow-content">
            <div className="stage-nav-header">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setStage('results')}
              >
                &larr; Back to Results
              </button>
              <span className="badge badge-success font-mono text-xs">
                Verified Candidate
              </span>
            </div>

            <div className="details-card">
              <div className="driver-profile-header">
                <img src={selectedDriver.photo_url} alt={selectedDriver.name} className="driver-avatar-lg" />
                <div>
                  <h3 className="font-semibold text-base">{selectedDriver.name}</h3>
                  <div className="text-xs text-muted">★ {selectedDriver.rating} &bull; {selectedDriver.vehicle_name}</div>
                  <div className="font-mono text-xs text-accent mt-1">{selectedDriver.vehicle_number}</div>
                </div>
              </div>

              <div className="verifications-list">
                <div className="verif-item">
                  <CheckCircle2 size={14} className="text-success" />
                  <span>Identity Verified (Govt ID Check)</span>
                </div>
                <div className="verif-item">
                  <CheckCircle2 size={14} className="text-success" />
                  <span>Commercial Vehicle Registration Valid</span>
                </div>
                <div className="verif-item">
                  <CheckCircle2 size={14} className="text-success" />
                  <span>Zero Active Safety Incidents</span>
                </div>
              </div>

              <div className="itinerary-summary">
                <div className="itinerary-node">
                  <div className="itinerary-dot start" />
                  <div>
                    <div className="text-xs text-muted">Pickup</div>
                    <div className="text-sm font-semibold">{currentScenario.pickup.name}</div>
                  </div>
                </div>
                <div className="itinerary-node">
                  <div className="itinerary-dot end" />
                  <div>
                    <div className="text-xs text-muted">Dropoff</div>
                    <div className="text-sm font-semibold">{currentScenario.dropoff.name}</div>
                  </div>
                </div>
              </div>

              {/* Phase 3: Driver Profile & Feedback Card */}
              <div style={{ marginTop: '12px' }}>
                <DriverProfileCard
                  driverId={selectedDriver?.id || 'drv_priya'}
                  driverName={selectedDriver?.name || 'Priya Sharma'}
                  vehicleInfo={`${selectedDriver?.vehicle_name || 'Sedan'} (${selectedDriver?.vehicle_number || 'PB 08 BG 1290'})`}
                />
              </div>

              {/* Phase 3: Canonical Fare Estimate Breakdown */}
              <div style={{ margin: '12px 0' }}>
                <FareEstimate
                  pickup={currentScenario.pickup}
                  destination={currentScenario.dropoff}
                  appliedPromoDiscount={appliedPromo?.discount || 0}
                  poolingDiscount={poolingDiscount}
                  paymentMode={paymentMode}
                  onSelectPaymentMode={setPaymentMode}
                  onEstimateCalculated={setLiveFareEstimate}
                />
              </div>

              {/* Phase 3: Promo Codes */}
              <div style={{ marginBottom: '12px' }}>
                <PromoCodeInput
                  rideAmount={liveFareEstimate?.total || 250}
                  appliedPromo={appliedPromo}
                  onPromoApplied={setAppliedPromo}
                  onPromoRemoved={() => setAppliedPromo(null)}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={handleConfirmBooking}
              >
                <span>Request Demo Ride</span>
              </button>

              <div className="demo-notice text-xs text-muted">
                Demo Request &bull; This action executes an interactive dispatch simulation on the map.
              </div>
            </div>
          </div>
        )}

        {/* STAGE 4: TRIP CONFIRMED & IN PROGRESS */}
        {stage === 'confirmed' && selectedDriver && (
          <div className="rider-flow-content">
            <div className="trip-status-card">
              <div className="status-badge-row">
                <span className="badge badge-accent">Demo Ride Active</span>
                <span className="font-mono text-xs text-muted">Trip #RM-9842</span>
              </div>

              <h2 className="trip-phase-title">
                {tripPhase === 'to_pickup' && '🚗 Driver Arriving...'}
                {tripPhase === 'arrived' && '📍 Driver at Pickup!'}
                {tripPhase === 'to_dropoff' && '🛣️ On the Way to Destination'}
                {tripPhase === 'completed' && '🎉 Trip Completed!'}
              </h2>

              <p className="trip-phase-desc text-xs text-muted">
                {tripPhase === 'to_pickup' && `${selectedDriver.name} is on the way in a ${selectedDriver.vehicle_name} (${selectedDriver.vehicle_number}).`}
                {tripPhase === 'arrived' && `Driver has reached ${currentScenario.pickup.name}. Board the vehicle.`}
                {tripPhase === 'to_dropoff' && `Cruising along Punjab corridor toward ${currentScenario.dropoff.name}.`}
                {tripPhase === 'completed' && `You have arrived safely at ${currentScenario.dropoff.name}. Thank you for testing RouteMate AI!`}
              </p>

              <div className="trip-progress-bar">
                <div
                  className="trip-progress-fill"
                  style={{
                    width:
                      tripPhase === 'to_pickup'
                        ? '30%'
                        : tripPhase === 'arrived'
                        ? '50%'
                        : tripPhase === 'to_dropoff'
                        ? '80%'
                        : '100%',
                  }}
                />
              </div>

              {/* Phase 3: Completed Ride Cash Payment, Receipt & Rating Actions */}
              {tripPhase === 'completed' && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {onlinePaid ? (
                    <div style={{ padding: '10px 12px', backgroundColor: '#E5F1E9', borderRadius: '8px', border: '1px solid #8BAA96', fontSize: '0.82rem', color: '#176B4D', fontWeight: 600 }}>
                      ⚡ Online Payment of ₹{(liveFareEstimate?.total || 250).toFixed(2)} completed via Razorpay. Status: COMPLETED.
                    </div>
                  ) : (
                    <div style={{ padding: '10px 12px', backgroundColor: '#E5F1E9', borderRadius: '8px', border: '1px solid #8BAA96', fontSize: '0.82rem', color: '#176B4D', fontWeight: 600 }}>
                      💵 Cash Payment of ₹{(liveFareEstimate?.total || 250).toFixed(2)} collected by {selectedDriver.name}. Status: {cashCollected ? 'COMPLETED' : 'PENDING'}.
                    </div>
                  )}
                  {!onlinePaid && (
                    <button
                      type="button"
                      className="btn btn-outline btn-block btn-sm"
                      onClick={() => setRazorpayModalOpen(true)}
                    >
                      ⚡ Pay Online via Razorpay
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => setReceiptModalOpen(true)}
                  >
                    📄 View Trip Receipt & Share
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-block"
                    onClick={() => setRatingsModalOpen(true)}
                  >
                    ★ Rate Driver & Trip
                  </button>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary btn-block mt-4 mb-2"
                onClick={() => setRiderChatOpen(true)}
              >
                <MessageSquare size={14} />
                <span>Chat with Driver ({selectedDriver.name})</span>
              </button>

              <button
                type="button"
                className="btn btn-outline btn-block"
                onClick={handleReset}
              >
                <RefreshCw size={14} />
                <span>Start New Search</span>
              </button>
            </div>
          </div>
        )}

        {/* Research Console Switcher Link at Bottom */}
        <div className="rider-footer-console-link">
          <span>Exploring algorithms?</span>
          <button
            type="button"
            className="link-btn"
            onClick={onSwitchToConsole}
          >
            <span>Open Research Console</span>
            <ExternalLink size={12} />
          </button>
        </div>
      </aside>

      {/* Right Map Canvas */}
      <main className="rider-map-canvas" aria-label="Punjab Mobility Corridor Map">
        <div ref={mapContainerRef} className="rider-leaflet-container" />

        {/* Map Legend & Basemap Switcher Overlay */}
        <div className="rider-map-overlay-legend">
          <div className="legend-chip">
            <span className="legend-dot pickup" />
            <span>Pickup</span>
          </div>
          <div className="legend-chip">
            <span className="legend-dot dropoff" />
            <span>Destination</span>
          </div>
          <div className="legend-chip">
            <span className="legend-line route" />
            <span>Corridor</span>
          </div>
          <div className="legend-chip">
            <span className="legend-dot vehicle" />
            <span>Matched Driver</span>
          </div>
          <div className="legend-divider" />
          <div className="basemap-switcher-group">
            {BASEMAP_OPTIONS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`basemap-btn ${basemap === b.id ? 'active' : ''}`}
                onClick={() => setBasemap(b.id)}
                title={`Switch to ${b.label}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Rider-to-Driver Chat Modal */}
      <RideChatModal
        isOpen={riderChatOpen}
        onClose={() => setRiderChatOpen(false)}
        bookingId={selectedScenarioId || 'RIDE_ACTIVE_DEMO'}
        partnerName={selectedDriver?.name || 'Driver Priya'}
        partnerRole="DRIVER"
        partnerVehicle={selectedDriver ? `${selectedDriver.vehicle_name} (${selectedDriver.vehicle_number})` : 'Assigned Driver'}
        currentUserRole="RIDER"
      />

      {/* Rider Ratings Modal */}
      <RatingsModal
        isOpen={ratingsModalOpen}
        onClose={() => setRatingsModalOpen(false)}
        bookingId={activeBookingId || selectedScenarioId || 'sample_booking'}
        driverName={selectedDriver?.name || 'Driver Priya'}
        onRatingSubmitted={() => {
          showToast('Thank you for rating your trip!');
        }}
      />

      {/* Trip Receipt Modal */}
      {receiptModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(32, 40, 32, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: '16px',
        }}>
          <TripReceipt
            bookingId={activeBookingId || selectedScenarioId || 'sample_booking'}
            onClose={() => setReceiptModalOpen(false)}
          />
        </div>
      )}

      {/* Razorpay Online Checkout Modal (Phase 3.5) */}
      <RazorpayCheckoutModal
        isOpen={razorpayModalOpen}
        onClose={() => setRazorpayModalOpen(false)}
        bookingId={activeBookingId || selectedScenarioId || 'sample_booking'}
        amount={liveFareEstimate?.total || 263.03}
        onPaymentSuccess={() => {
          setOnlinePaid(true);
          setCashCollected(true);
          showToast('Payment verified via Razorpay HMAC-SHA256!');
        }}
      />
    </div>
  );
}
