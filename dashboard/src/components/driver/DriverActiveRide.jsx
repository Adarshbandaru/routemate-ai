import { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Phone,
  MessageSquare,
  CheckCircle2,
  Clock,
  Star,
  Send,
} from 'lucide-react';
import { createBaseTileLayer } from '../../utils/mapTiles';
import { apiService } from '../../services/apiService';

const QUICK_MESSAGES = [
  "I'm outside",
  "Running late",
  "On my way",
  "Please wait near gate",
  "Traffic near flyover",
];

const DEFAULT_TRIP = {
  id: 'RIDE_REQ_LPU_882',
  booking_number: 'RIDE_REQ_LPU_882',
  rider_name: 'Adarsh Bandaru',
  rider_phone: '+91 98765 43210',
  rider_rating: 4.9,
  pickup_address: 'Jalandhar City Railway Station',
  dropoff_address: 'Lovely Professional University (LPU Main Gate)',
  distance_km: 21.4,
  total_fare: 320,
  eta_mins: 6,
  pickup_lat: 31.3260,
  pickup_lng: 75.5762,
  dropoff_lat: 31.2536,
  dropoff_lng: 75.7037,
  driver_lat: 31.3150,
  driver_lng: 75.5900,
};

export default function DriverActiveRide({
  booking = null,
  onRideCompleted = () => {},
  onBackToDashboard = () => {},
}) {
  const trip = useMemo(() => booking || DEFAULT_TRIP, [booking]);
  const msgCounterRef = useRef(10);

  // Stages: 'heading_to_pickup' | 'on_way_to_dropoff' | 'completed'
  const [stage, setStage] = useState('heading_to_pickup');
  const [eta, setEta] = useState(trip.eta_mins || 6);
  const [messages, setMessages] = useState([
    { id: 1, sender: 'rider', text: 'Hi! I am standing right next to the ticket counter at the main gate.', timestamp: 'Just now' },
  ]);
  const [inputText, setInputText] = useState('');
  const [showChat, setShowChat] = useState(true);

  // Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [31.2950, 75.6320],
      zoom: 12,
      zoomControl: false,
    });

    createBaseTileLayer('esri_light').addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);

    markersLayerRef.current = L.featureGroup().addTo(map);
    mapInstanceRef.current = map;

    // Draw route and markers
    const driverCoords = [trip.driver_lat || 31.3150, trip.driver_lng || 75.5900];
    const pickupCoords = [trip.pickup_lat || 31.3260, trip.pickup_lng || 75.5762];
    const dropoffCoords = [trip.dropoff_lat || 31.2536, trip.dropoff_lng || 75.7037];

    const driverIcon = L.divIcon({
      className: 'driver-live-marker',
      html: `<div style="background:#176B4D; color:#FFF; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(23,107,77,0.6); border:2px solid #FFF; font-weight:bold; font-size:14px;">🚗</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const pickupIcon = L.divIcon({
      className: 'pickup-marker',
      html: `<div style="background:#22C55E; color:#FFF; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 8px rgba(34,197,94,0.5); border:2px solid #FFF; font-size:12px;">📍</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const dropoffIcon = L.divIcon({
      className: 'dropoff-marker',
      html: `<div style="background:#0284C7; color:#FFF; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 8px rgba(2,132,199,0.5); border:2px solid #FFF; font-size:12px;">🏁</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker(driverCoords, { icon: driverIcon }).addTo(markersLayerRef.current).bindPopup('Driver Location');
    L.marker(pickupCoords, { icon: pickupIcon }).addTo(markersLayerRef.current).bindPopup(`Pickup: ${trip.pickup_address}`);
    L.marker(dropoffCoords, { icon: dropoffIcon }).addTo(markersLayerRef.current).bindPopup(`Dropoff: ${trip.dropoff_address}`);

    const routeLine = [driverCoords, pickupCoords, dropoffCoords];
    const polyline = L.polyline(routeLine, {
      color: '#176B4D',
      weight: 4,
      dashArray: '6, 6',
      opacity: 0.85,
    }).addTo(markersLayerRef.current);

    map.fitBounds(polyline.getBounds(), { padding: [40, 40] });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [trip]);

  // Handle Pickup
  const handlePickupCompleted = async () => {
    try {
      await apiService.completeDriverPickup('drv_priya', trip.id);
    } catch {}
    setStage('on_way_to_dropoff');
    setEta(18); // ETA to LPU
  };

  // Handle Dropoff
  const handleDropoffCompleted = async () => {
    try {
      await apiService.completeDriverDropoff('drv_priya', trip.id, trip.total_fare || 320);
    } catch {}
    setStage('completed');
    onRideCompleted(trip);
  };

  // Handle Send Chat
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const newMsg = {
      id: ++msgCounterRef.current,
      sender: 'driver',
      text,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');

    try {
      await apiService.sendDriverMessage('drv_priya', trip.id, text);
    } catch {}
  };

  if (stage === 'completed') {
    return (
      <div style={{ padding: '2rem 1.5rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div className="ride-complete-celebration-card animate-in">
          <div className="celebration-header">
            <CheckCircle2 size={32} color="#176B4D" />
            <h4 style={{ fontSize: '1.25rem' }}>Ride Completed Successfully!</h4>
          </div>

          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#176B4D', margin: '0.5rem 0' }}>
            ₹{trip.total_fare || 320}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#68746A' }}>
            Credited directly to Driver Wallet (Instant Settlement)
          </div>

          <div className="rider-feedback-box" style={{ margin: '1.25rem 0' }}>
            <div className="rider-stars-row">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={18} fill="#EAB308" color="#EAB308" />
              ))}
            </div>
            <p className="rider-feedback-quote">
              &quot;Excellent driving on GT Road! Safe, quick pickup and smooth transit to LPU.&quot;
            </p>
            <span className="rider-feedback-author">— {trip.rider_name || 'Adarsh Bandaru'} (5.0 ★)</span>
          </div>

          <button
            type="button"
            className="btn-accept"
            onClick={onBackToDashboard}
            style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem' }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.25rem', maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Active Stage Banner */}
      <div
        style={{
          background: stage === 'heading_to_pickup' ? 'var(--accent-warning-subtle)' : 'var(--accent-primary-subtle)',
          border: `1px solid ${stage === 'heading_to_pickup' ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-medium)'}`,
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: 'var(--text-muted)' }}>
            Current Ride Status
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {stage === 'heading_to_pickup' ? '🟡 Heading to Pickup' : '🔵 On the way to Dropoff'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '999px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <Clock size={15} />
            <span>ETA: ~{eta} mins</span>
          </div>

          {stage === 'heading_to_pickup' ? (
            <button
              type="button"
              className="btn-accept"
              onClick={handlePickupCompleted}
              style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
            >
              <CheckCircle2 size={16} />
              <span>Pickup Completed</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-accept"
              onClick={handleDropoffCompleted}
              style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
            >
              <CheckCircle2 size={16} />
              <span>Dropoff Completed</span>
            </button>
          )}
        </div>
      </div>

      {/* Map View */}
      <div
        style={{
          height: '420px',
          borderRadius: '14px',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Rider Information Strip */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
          padding: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {trip.rider_name || 'Adarsh Bandaru'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
            <Star size={13} fill="#EAB308" color="#EAB308" />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {trip.rider_rating || 4.9} ★ Verified Passenger
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a
            href={`tel:${trip.rider_phone || '+919876543210'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.82rem',
            }}
          >
            <Phone size={15} color="var(--accent-primary)" />
            <span>Call Rider</span>
          </a>

          <button
            type="button"
            onClick={() => setShowChat((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              background: 'var(--accent-primary-subtle)',
              border: '1px solid var(--border-medium)',
              color: 'var(--accent-primary)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <MessageSquare size={15} />
            <span>{showChat ? 'Hide Chat' : 'In-App Chat'}</span>
          </button>
        </div>
      </div>

      {/* In-App Chat Section */}
      {showChat && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E4E8E0',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#202820' }}>
            In-App Messaging with Rider
          </div>

          {/* Quick Reply Chips */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {QUICK_MESSAGES.map((msg) => (
              <button
                key={msg}
                type="button"
                onClick={() => handleSendMessage(msg)}
                style={{
                  background: '#F6F7F2',
                  border: '1px solid #E4E8E0',
                  borderRadius: '999px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.74rem',
                  fontWeight: 500,
                  color: '#202820',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                &ldquo;{msg}&rdquo;
              </button>
            ))}
          </div>

          {/* Message Thread */}
          <div
            style={{
              height: '180px',
              overflowY: 'auto',
              padding: '0.75rem',
              background: '#F6F7F2',
              borderRadius: '8px',
              border: '1px solid #E4E8E0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.sender === 'driver' ? 'driver-chat-msg-driver' : 'driver-chat-msg-rider'}
              >
                <div>{m.text}</div>
                <div style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '2px', textAlign: 'right' }}>
                  {m.timestamp}
                </div>
              </div>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            style={{ display: 'flex', gap: '0.5rem' }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type message to rider..."
              style={{
                flex: 1,
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #E4E8E0',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              className="btn-accept"
              style={{ padding: '0.65rem 1rem' }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
