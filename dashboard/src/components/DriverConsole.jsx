import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Car,
  Power,
  Navigation,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Award,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Bell,
  Star,
  User,
  Edit3,
  X,
  Phone,
  Check,
} from 'lucide-react';
import { createBaseTileLayer } from '../utils/mapTiles';
import { apiService } from '../services/apiService';
import RideChatModal from './common/RideChatModal';

// Web Audio API chime for incoming request ping 🔔
function playPingNotification() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

export default function DriverConsole() {
  // Step 1: Driver Authentication State
  const [driverLoggedIn, setDriverLoggedIn] = useState(() => {
    return localStorage.getItem('routemate_driver_logged_in') === 'true';
  });
  const [loginPhone, setLoginPhone] = useState('+91 98765 01234');
  const [loginOtp, setLoginOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Step 2 & 3: Dashboard & Online State
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' | 'active_ride' | 'earnings'
  const [earnings, setEarnings] = useState({
    today: 2400,
    week: 11200,
    month: 42500,
    rides_today: 8,
    acceptance_rate: 97.2,
    rating: 4.8,
  });

  // Step 4: Incoming Requests & Audio Ping
  const [pendingRequests, setPendingRequests] = useState([]);
  const [requestCountdown, setRequestCountdown] = useState(10);
  const pingPlayedRef = useRef(false);

  // Step 5, 6, 7: Trip Lifecycle
  // tripStep: 'to_pickup' (Heading to Pickup) | 'at_pickup' (Arrived at Pickup) | 'on_way_to_dropoff' (On the way to Dropoff) | 'at_dropoff' (At Dropoff) | 'ride_completed'
  const [activeTrip, setActiveTrip] = useState(null);
  const [tripStep, setTripStep] = useState('to_pickup');
  const [rideCompleteSummary, setRideCompleteSummary] = useState(null);

  // Modals & Popovers
  const [chatOpen, setChatOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const polylineRef = useRef(null);

  const showToast = useCallback((msg, durationMs = 3000) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, durationMs);
  }, []);

  // Fetch driver data from backend
  const loadDriverData = useCallback(async () => {
    try {
      const earnRes = await apiService.getDriverEarnings('drv_priya');
      if (earnRes?.data) {
        setEarnings((prev) => ({ ...prev, ...earnRes.data }));
      }

      const reqRes = await apiService.getDriverRequests('drv_priya');
      if (reqRes?.data && reqRes.data.length > 0) {
        setPendingRequests(reqRes.data);
      } else {
        // Simulated Punjab corridor ride request (Jalandhar -> LPU)
        setPendingRequests([
          {
            id: 'RIDE_REQ_LPU_882',
            booking_number: 'RIDE_REQ_LPU_882',
            rider_name: 'Adarsh Bandaru',
            rider_phone: '+91 98765 43210',
            rider_rating: 4.9,
            pickup_address: 'Jalandhar City Railway Station',
            dropoff_address: 'Lovely Professional University (LPU Main Gate)',
            distance_km: 21.4,
            duration_sec: 1440,
            eta_mins: 6,
            distance_to_pickup: '2.4 km',
            total_fare: 320,
            seats: 1,
            pickup_lat: 31.3260,
            pickup_lng: 75.5762,
            dropoff_lat: 31.2536,
            dropoff_lng: 75.7037,
            route_polyline: [
              [31.3260, 75.5762],
              [31.2950, 75.6320],
              [31.2536, 75.7037],
            ],
          },
        ]);
      }
    } catch {
      // Retain fallback
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const earnRes = await apiService.getDriverEarnings('drv_priya');
        if (isMounted && earnRes?.data) {
          setEarnings((prev) => ({ ...prev, ...earnRes.data }));
        }

        const reqRes = await apiService.getDriverRequests('drv_priya');
        if (isMounted && reqRes?.data && reqRes.data.length > 0) {
          setPendingRequests(reqRes.data);
        } else if (isMounted) {
          setPendingRequests([
            {
              id: 'RIDE_REQ_LPU_882',
              booking_number: 'RIDE_REQ_LPU_882',
              rider_name: 'Adarsh Bandaru',
              rider_phone: '+91 98765 43210',
              rider_rating: 4.9,
              pickup_address: 'Jalandhar City Railway Station',
              dropoff_address: 'Lovely Professional University (LPU Main Gate)',
              distance_km: 21.4,
              duration_sec: 1440,
              eta_mins: 6,
              distance_to_pickup: '2.4 km',
              total_fare: 320,
              seats: 1,
              pickup_lat: 31.3260,
              pickup_lng: 75.5762,
              dropoff_lat: 31.2536,
              dropoff_lng: 75.7037,
              route_polyline: [
                [31.3260, 75.5762],
                [31.2950, 75.6320],
                [31.2536, 75.7037],
              ],
            },
          ]);
        }
      } catch {
        // Fallback
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  // Step 4: Incoming Request Ping Sound 🔔
  useEffect(() => {
    if (isOnline && pendingRequests.length > 0 && !activeTrip && !pingPlayedRef.current) {
      playPingNotification();
      pingPlayedRef.current = true;
    }
    if (pendingRequests.length === 0) {
      pingPlayedRef.current = false;
    }
  }, [isOnline, pendingRequests.length, activeTrip]);

  // Step 4: 10-second countdown timer for auto-dismiss / reject
  useEffect(() => {
    if (!isOnline || pendingRequests.length === 0 || activeTrip) return;
    const interval = setInterval(() => {
      setRequestCountdown((prev) => {
        if (prev <= 1) {
          showToast('Request dismissed automatically (10s elapsed).');
          setPendingRequests((list) => list.slice(1));
          pingPlayedRef.current = false;
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOnline, pendingRequests.length, activeTrip, showToast]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [31.2950, 75.6320], // Centered between Jalandhar & LPU
      zoom: 12,
      zoomControl: false,
    });

    createBaseTileLayer('esri_light').addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);

    markersGroupRef.current = L.featureGroup().addTo(map);
    mapInstanceRef.current = map;

    const resizeTimer = setTimeout(() => {
      try {
        mapInstanceRef.current?.invalidateSize();
      } catch {}
    }, 200);

    return () => clearTimeout(resizeTimer);
  }, []);

  // Update map when activeTrip changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    const trip = activeTrip || pendingRequests[0];
    if (!trip) return;

    const pLL = [trip.pickup_lat, trip.pickup_lng];
    const dLL = [trip.dropoff_lat, trip.dropoff_lng];

    // Pickup Pin
    L.marker(pLL, {
      icon: L.divIcon({
        className: 'driver-map-pin',
        html: `<div style="width:24px;height:24px;border-radius:50%;background:#ffffff;border:2.5px solid #C2410C;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.2);"><div style="width:6px;height:6px;border-radius:50%;background:#C2410C;"></div></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).bindPopup(`<b>Pickup:</b> ${trip.pickup_address}`).addTo(group);

    // Destination Pin
    L.marker(dLL, {
      icon: L.divIcon({
        className: 'driver-map-pin',
        html: `<div style="width:24px;height:24px;border-radius:50%;background:#ffffff;border:2.5px solid #176B4D;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.2);"><div style="width:6px;height:6px;border-radius:50%;background:#176B4D;"></div></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).bindPopup(`<b>Destination:</b> ${trip.dropoff_address}`).addTo(group);

    // Vehicle Pin (Current Position)
    const vehLL = [trip.pickup_lat + 0.005, trip.pickup_lng + 0.006];
    L.marker(vehLL, {
      icon: L.divIcon({
        className: 'driver-vehicle-pin',
        html: `<div style="width:34px;height:34px;border-radius:50%;background:#176B4D;border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(23,107,77,0.4);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H8c-.7 0-1.3.3-1.8.7C5.3 8.6 4 10 4 10s-2.7.6-4.5 1.1C-.3 11.3 0 12.1 0 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    }).addTo(group);

    // Polyline
    const poly = trip.route_polyline || [vehLL, pLL, dLL];
    polylineRef.current = L.polyline(poly, {
      color: '#176B4D',
      weight: 4,
      opacity: 0.85,
    }).addTo(map);

    try {
      map.fitBounds([pLL, dLL, vehLL], { padding: [50, 50] });
    } catch {}
  }, [activeTrip, pendingRequests]);

  // Auth Handlers
  const handleDriverLogin = (e) => {
    if (e) e.preventDefault();
    localStorage.setItem('routemate_driver_logged_in', 'true');
    setDriverLoggedIn(true);
    showToast('Signed in successfully as Priya Sharma (PB 08 BG 1290).');
  };

  const handleSendOtp = () => {
    setOtpSent(true);
    setLoginOtp('123456');
    showToast('OTP sent: 123456');
  };

  const handleDriverLogout = () => {
    localStorage.removeItem('routemate_driver_logged_in');
    setDriverLoggedIn(false);
    showToast('Signed out of Driver Console.');
  };

  // Online / Offline Toggle
  const handleToggleOnline = async () => {
    const next = !isOnline;
    setIsOnline(next);
    pingPlayedRef.current = false;
    showToast(next ? 'Status: 🟢 Online • Ready to receive requests.' : 'Status: ⚪ Offline • Duty off.');
    try {
      await apiService.updateDriverAvailability('drv_priya', next);
    } catch {}
  };

  // Step 5: Accept Request
  const handleAcceptTrip = async (trip) => {
    setActiveTrip(trip);
    setTripStep('to_pickup'); // Heading to Pickup
    setActiveTab('active_ride');
    showToast(`Accepted trip for ${trip.rider_name}! Status: 🟡 Heading to Pickup`);
    try {
      await apiService.acceptDriverRequest('drv_priya', trip.id || trip.booking_number);
    } catch {}
  };

  // Step 4: Reject Request
  const handleRejectTrip = async (trip) => {
    setPendingRequests((prev) => prev.filter((r) => (r.id || r.booking_number) !== (trip.id || trip.booking_number)));
    setRequestCountdown(10);
    pingPlayedRef.current = false;
    showToast('Ride request rejected.');
    try {
      await apiService.rejectDriverRequest('drv_priya', trip.id || trip.booking_number);
    } catch {}
  };

  // Step 6, 7, 8: Advance Trip Lifecycle
  const handleAdvanceTripStep = () => {
    if (tripStep === 'to_pickup') {
      // Driver arrives at pickup
      setTripStep('at_pickup');
      showToast('Arrived at pickup point. Ready for rider onboard.');
    } else if (tripStep === 'at_pickup') {
      // Step 6: [PICKUP COMPLETED] -> Status: 🔵 On the way to Dropoff
      setTripStep('on_way_to_dropoff');
      showToast('Pickup completed! Status: 🔵 On the way to Dropoff.');
    } else if (tripStep === 'on_way_to_dropoff') {
      // Step 7: [DROPOFF COMPLETED]
      setTripStep('at_dropoff');
      showToast('Arrived at destination. Showing dropoff & payment summary.');
    } else if (tripStep === 'at_dropoff') {
      // Step 8: RIDE COMPLETE
      const fare = activeTrip.total_fare || 320;
      const updatedEarnings = earnings.today + fare;
      const updatedRides = earnings.rides_today + 1;

      setEarnings((prev) => ({
        ...prev,
        today: updatedEarnings,
        rides_today: updatedRides,
      }));

      setRideCompleteSummary({
        rider_name: activeTrip.rider_name || 'Adarsh Bandaru',
        pickup_address: activeTrip.pickup_address,
        dropoff_address: activeTrip.dropoff_address,
        fare,
        payment_status: 'Paid via UPI (Txn: RM-88219-OK)',
        rating: 5.0,
        rider_review: 'Great driving along GT Road! Very polite and on time.',
        updated_today_earnings: updatedEarnings,
        updated_rides: updatedRides,
      });

      setTripStep('ride_completed');
      showToast(`Ride complete! ₹${fare} added to earnings.`);
    } else if (tripStep === 'ride_completed') {
      // Step 8 complete: Back to online state (ready for next request)
      setActiveTrip(null);
      setRideCompleteSummary(null);
      setTripStep('to_pickup');
      setActiveTab('requests');
      setIsOnline(true);
      pingPlayedRef.current = false;
      showToast('Back to Online state. Ready to receive next ride request!');
      loadDriverData();
    }
  };

  const currentRequest = pendingRequests[0];

  // -------------------------------------------------------------
  // STEP 1: DRIVER LOGIN VIEW (If not authenticated)
  // -------------------------------------------------------------
  if (!driverLoggedIn) {
    return (
      <div className="driver-auth-screen-layout">
        <div className="driver-auth-card animate-in">
          <div className="driver-auth-header">
            <div className="driver-auth-icon-badge">
              <Car size={26} />
            </div>
            <h2>RouteMate Driver Partner</h2>
            <p className="text-secondary text-sm">Sign in to start receiving shared-mobility ride requests across Punjab.</p>
          </div>

          <form onSubmit={handleDriverLogin} className="driver-auth-form">
            <div className="form-group">
              <label htmlFor="driver-phone-input" className="form-label text-xs uppercase font-semibold">
                Registered Mobile Number
              </label>
              <div className="input-with-icon">
                <Phone size={15} className="input-icon" />
                <input
                  id="driver-phone-input"
                  type="tel"
                  className="form-input"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="+91 98765 01234"
                  required
                />
              </div>
            </div>

            {!otpSent ? (
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={handleSendOtp}
              >
                Send 6-Digit OTP
              </button>
            ) : (
              <div className="otp-group animate-in">
                <label htmlFor="driver-otp-input" className="form-label text-xs uppercase font-semibold">
                  Enter 6-Digit Verification Code
                </label>
                <input
                  id="driver-otp-input"
                  type="text"
                  maxLength={6}
                  className="form-input font-mono text-center text-lg letter-spacing-lg"
                  value={loginOtp}
                  onChange={(e) => setLoginOtp(e.target.value)}
                  placeholder="123456"
                  required
                />
                <button type="submit" className="btn btn-primary btn-block mt-3">
                  Verify OTP & Open Dashboard
                </button>
              </div>
            )}

            <div className="auth-divider">
              <span>OR</span>
            </div>

            <button
              type="button"
              className="btn btn-outline btn-block demo-quick-login-btn"
              onClick={handleDriverLogin}
            >
              <ShieldCheck size={16} className="text-primary mr-1" />
              <span>1-Tap Demo Sign In (Priya Sharma • PB 08 BG 1290)</span>
            </button>
          </form>

          <div className="driver-auth-footer">
            <ShieldCheck size={14} className="text-primary" />
            <span>Punjab Transport Authority & Commercial Fleet Verified</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STEP 2 to 8: DRIVER DASHBOARD & ACTIVE WORKFLOW
  // -------------------------------------------------------------
  return (
    <div className="driver-console-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="rider-toast-notification" role="status" aria-live="polite">
          <CheckCircle2 size={15} className="text-accent" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Driver Sidebar Panel */}
      <aside className="driver-sidebar-panel">
        {/* STEP 2: DRIVER DASHBOARD HEADER */}
        <div className="driver-header-card">
          <div className="driver-profile-top">
            <div className="driver-avatar-box">
              <Car size={20} />
            </div>
            <div className="driver-info-meta">
              <div className="driver-name-row">
                <h2 className="driver-name">Priya Sharma</h2>
                <span className="driver-verified-tag">
                  <ShieldCheck size={12} /> Verified
                </span>
              </div>
              <p className="driver-vehicle-desc">Glacier White Swift Dzire &bull; PB 08 BG 1290</p>
            </div>
            <button
              type="button"
              className="btn-ghost btn-sm text-xs driver-logout-btn"
              onClick={handleDriverLogout}
              title="Sign out of Driver Console"
            >
              Sign Out
            </button>
          </div>

          {/* STEP 2 & 3: ONLINE / OFFLINE TOGGLE */}
          <div className="driver-online-bar">
            <div className="online-status-indicator">
              <div className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
              <div>
                <span className="font-semibold text-sm block">
                  {isOnline ? '🟢 Online' : '⚪ Offline'}
                </span>
                <span className="text-xs text-muted block">
                  {isOnline ? 'Ready to receive requests' : 'Duty paused'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className={`driver-toggle-btn ${isOnline ? 'active' : ''}`}
              onClick={handleToggleOnline}
              title={isOnline ? 'Go Offline' : 'Go Online'}
            >
              <Power size={14} />
              <span>{isOnline ? 'Go Offline' : 'Go Online'}</span>
            </button>
          </div>

          {/* STEP 2: TODAY'S EARNINGS & STATS ROW */}
          <div className="driver-dashboard-stats-strip">
            <div className="dash-stat-item">
              <span className="stat-lbl">Today's Earnings</span>
              <span className="stat-val text-primary font-bold">₹{earnings.today.toLocaleString()}</span>
            </div>
            <div className="stat-divider" />
            <div className="dash-stat-item">
              <span className="stat-lbl">Today's Rides</span>
              <span className="stat-val font-semibold">{earnings.rides_today} rides</span>
            </div>
            <div className="stat-divider" />
            <div className="dash-stat-item">
              <span className="stat-lbl">Driver Rating</span>
              <span className="stat-val text-accent font-semibold flex items-center gap-1">
                <Star size={12} fill="currentColor" className="text-accent inline" />
                {earnings.rating}★
              </span>
            </div>
          </div>

          {/* STEP 2: QUICK ACTIONS (View Earnings, Edit Profile) */}
          <div className="driver-quick-actions-row">
            <button
              type="button"
              className="btn btn-outline btn-sm quick-action-btn"
              onClick={() => setActiveTab('earnings')}
            >
              <TrendingUp size={13} />
              <span>View Earnings</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm quick-action-btn"
              onClick={() => setProfileModalOpen(true)}
            >
              <Edit3 size={13} />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="driver-tabs-row" role="tablist">
          <button
            type="button"
            className={`driver-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Ride Requests {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </button>
          <button
            type="button"
            className={`driver-tab-btn ${activeTab === 'active_ride' ? 'active' : ''}`}
            onClick={() => setActiveTab('active_ride')}
          >
            {activeTrip ? 'Current Trip 🟡' : 'Active Trip'}
          </button>
          <button
            type="button"
            className={`driver-tab-btn ${activeTab === 'earnings' ? 'active' : ''}`}
            onClick={() => setActiveTab('earnings')}
          >
            Daily Earnings
          </button>
        </div>

        {/* TAB 1: INCOMING REQUESTS (Step 4) */}
        {activeTab === 'requests' && (
          <div className="driver-tab-content">
            {!isOnline && (
              <div className="driver-offline-notice">
                <AlertCircle size={28} className="text-muted" />
                <h4>You are currently offline</h4>
                <p>Toggle your status to Online above to receive incoming ride requests along NH-44.</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleToggleOnline}>
                  Go Online Now
                </button>
              </div>
            )}

            {isOnline && !currentRequest && (
              <div className="driver-waiting-box">
                <RefreshCw size={24} className="spin text-accent" />
                <h4>Searching for rides nearby...</h4>
                <p>Positioned on GT Road / NH-44 corridor between Jalandhar and Phagwara.</p>
              </div>
            )}

            {isOnline && currentRequest && (
              <div className="driver-request-card animate-in">
                {/* STEP 4: Audio Ping Notification Badge */}
                <div className="ping-notification-banner">
                  <Bell size={13} className="text-accent animate-bounce" />
                  <span>Ping 🔔 New Ride Request Nearby!</span>
                </div>

                {/* STEP 4: Countdown Timer Bar (10s auto-dismiss) */}
                <div className="request-timer-bar">
                  <div className="timer-track">
                    <div
                      className="timer-fill"
                      style={{ width: `${(requestCountdown / 10) * 100}%` }}
                    />
                  </div>
                  <div className="timer-label">
                    <Clock size={12} />
                    <span>Auto-dismiss in {requestCountdown}s</span>
                  </div>
                </div>

                {/* Rider Details & Fare */}
                <div className="request-header-row">
                  <div>
                    <span className="request-badge font-mono text-xs">{currentRequest.booking_number || currentRequest.id}</span>
                    <h3 className="rider-caller-name">{currentRequest.rider_name}</h3>
                    <span className="rider-rating-chip text-xs">
                      <Star size={11} fill="currentColor" className="inline text-accent mr-1" />
                      {currentRequest.rider_rating}★ &bull; {currentRequest.rider_phone}
                    </span>
                  </div>
                  <div className="request-fare-tag">
                    <span className="fare-amt font-bold text-primary">₹{currentRequest.total_fare}</span>
                    <span className="fare-sub">Est. Earning</span>
                  </div>
                </div>

                {/* Pickup & Dropoff Stops */}
                <div className="request-stops-box">
                  <div className="request-stop">
                    <MapPin size={13} className="text-danger" />
                    <div>
                      <span className="stop-title">{currentRequest.pickup_address}</span>
                      <span className="stop-sub">Pickup Point</span>
                    </div>
                  </div>
                  <div className="request-stop-arrow">&darr;</div>
                  <div className="request-stop">
                    <Navigation size={13} className="text-accent" />
                    <div>
                      <span className="stop-title">{currentRequest.dropoff_address}</span>
                      <span className="stop-sub">Dropoff Destination</span>
                    </div>
                  </div>
                </div>

                <div className="request-details-grid">
                  <div className="req-metric">
                    <span className="lbl">Distance</span>
                    <span className="val">{currentRequest.distance_km} km</span>
                  </div>
                  <div className="req-metric">
                    <span className="lbl">Seats</span>
                    <span className="val">{currentRequest.seats || 1} seat</span>
                  </div>
                  <div className="req-metric">
                    <span className="lbl">Corridor</span>
                    <span className="val">NH-44 Direct</span>
                  </div>
                </div>

                {/* STEP 4: Buttons [ACCEPT] (10s countdown) and [REJECT] */}
                <div className="request-actions-grid">
                  <button
                    type="button"
                    className="btn btn-outline request-decline-btn"
                    onClick={() => handleRejectTrip(currentRequest)}
                  >
                    <XCircle size={16} />
                    <span>Reject</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary request-accept-btn"
                    onClick={() => handleAcceptTrip(currentRequest)}
                  >
                    <CheckCircle2 size={16} />
                    <span>Accept ({requestCountdown}s) &bull; ₹{currentRequest.total_fare}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ACTIVE RIDE MANAGEMENT (Steps 5, 6, 7, 8) */}
        {activeTab === 'active_ride' && (
          <div className="driver-tab-content">
            {!activeTrip ? (
              <div className="driver-waiting-box">
                <Car size={32} className="text-muted" />
                <h4>No Active Trip In Progress</h4>
                <p>Accept an incoming ride request from the Requests tab to begin navigation.</p>
              </div>
            ) : (
              <div className="active-trip-panel animate-in">
                {/* STEP 5: Status Badges (Heading to Pickup, At Pickup, On the way to Dropoff, etc.) */}
                <div className="active-trip-header">
                  <div>
                    {tripStep === 'to_pickup' && (
                      <span className="badge badge-warning text-xs font-semibold">
                        🟡 Heading to Pickup
                      </span>
                    )}
                    {tripStep === 'at_pickup' && (
                      <span className="badge badge-warning text-xs font-semibold">
                        🟡 Arrived at Pickup
                      </span>
                    )}
                    {tripStep === 'on_way_to_dropoff' && (
                      <span className="badge badge-accent text-xs font-semibold">
                        🔵 On the way to Dropoff
                      </span>
                    )}
                    {tripStep === 'at_dropoff' && (
                      <span className="badge badge-accent text-xs font-semibold">
                        🔵 At Dropoff
                      </span>
                    )}
                    {tripStep === 'ride_completed' && (
                      <span className="badge badge-success text-xs font-semibold">
                        🟢 Ride Completed
                      </span>
                    )}
                    <h3 className="trip-rider-name">{activeTrip.rider_name}</h3>
                    <p className="trip-rider-phone text-xs text-muted">{activeTrip.rider_phone}</p>
                  </div>

                  {/* Chat Available Button */}
                  <div className="trip-header-buttons">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm trip-chat-btn"
                      onClick={() => setChatOpen(true)}
                      title="Open In-App Chat with Rider"
                    >
                      <MessageSquare size={14} />
                      <span>Chat</span>
                    </button>
                  </div>
                </div>

                {/* Stepper Progress */}
                <div className="trip-stepper">
                  <div className={`step-item ${['to_pickup', 'at_pickup', 'on_way_to_dropoff', 'at_dropoff', 'ride_completed'].includes(tripStep) ? 'active' : ''}`}>
                    <span className="step-num">1</span>
                    <span className="step-text">Pickup</span>
                  </div>
                  <div className={`step-item ${['at_pickup', 'on_way_to_dropoff', 'at_dropoff', 'ride_completed'].includes(tripStep) ? 'active' : ''}`}>
                    <span className="step-num">2</span>
                    <span className="step-text">Arrived</span>
                  </div>
                  <div className={`step-item ${['on_way_to_dropoff', 'at_dropoff', 'ride_completed'].includes(tripStep) ? 'active' : ''}`}>
                    <span className="step-num">3</span>
                    <span className="step-text">En Route</span>
                  </div>
                  <div className={`step-item ${['at_dropoff', 'ride_completed'].includes(tripStep) ? 'active' : ''}`}>
                    <span className="step-num">4</span>
                    <span className="step-text">Dropoff</span>
                  </div>
                </div>

                {/* STEP 5: Route & ETA Card */}
                <div className="trip-instruction-card">
                  <Navigation size={18} className="text-primary shrink-0" />
                  <div>
                    <div className="instruction-heading">
                      {tripStep === 'to_pickup' && 'Heading to Pickup'}
                      {tripStep === 'at_pickup' && 'Arrived at Pickup • Waiting for Rider'}
                      {tripStep === 'on_way_to_dropoff' && 'Driving to Dropoff Destination'}
                      {tripStep === 'at_dropoff' && 'At Dropoff Destination'}
                      {tripStep === 'ride_completed' && 'Ride Finished Successfully!'}
                    </div>
                    <div className="instruction-sub">
                      {tripStep === 'to_pickup' && `${activeTrip.pickup_address} (ETA: ${activeTrip.eta_mins || 6} mins • ${activeTrip.distance_to_pickup || '2.4 km'})`}
                      {tripStep === 'at_pickup' && 'Passenger coordinating via in-app chat. Verify rider before departure.'}
                      {tripStep === 'on_way_to_dropoff' && `${activeTrip.dropoff_address} via NH-44 corridor (${activeTrip.distance_km} km)`}
                      {tripStep === 'at_dropoff' && `Arrived at destination. Fare: ₹${activeTrip.total_fare}. Collect payment.`}
                      {tripStep === 'ride_completed' && `Collected ₹${activeTrip.total_fare} via UPI. Rating received.`}
                    </div>
                  </div>
                </div>

                {/* STEP 7: AT DROPOFF (Earnings & Payment Status) */}
                {['at_dropoff', 'ride_completed'].includes(tripStep) && (
                  <div className="dropoff-payment-card animate-in">
                    <div className="dropoff-payment-row">
                      <span className="payment-lbl">Earnings for this ride:</span>
                      <span className="payment-val text-primary font-bold text-lg">+₹{activeTrip.total_fare}</span>
                    </div>
                    <div className="dropoff-payment-row">
                      <span className="payment-lbl">Payment Status:</span>
                      <span className="payment-status-badge">
                        <Check size={12} className="inline mr-1" />
                        Paid via UPI (Ref #RM-88219)
                      </span>
                    </div>
                  </div>
                )}

                {/* STEP 8: RIDE COMPLETE SUMMARY & RATING FROM RIDER */}
                {tripStep === 'ride_completed' && rideCompleteSummary && (
                  <div className="ride-complete-celebration-card animate-in">
                    <div className="celebration-header">
                      <ShieldCheck size={20} className="text-accent" />
                      <h4>Ride Completed Successfully!</h4>
                    </div>
                    <div className="rider-feedback-box">
                      <div className="rider-stars-row">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} size={15} fill="currentColor" className="text-accent" />
                        ))}
                        <span className="font-bold text-sm ml-1">5.0★</span>
                      </div>
                      <p className="rider-feedback-quote">
                        "{rideCompleteSummary.rider_review}"
                      </p>
                      <span className="rider-feedback-author">&mdash; {rideCompleteSummary.rider_name}</span>
                    </div>
                    <div className="updated-earnings-pill">
                      <span>Today's Total: <b>₹{earnings.today.toLocaleString()}</b> ({earnings.rides_today} rides)</span>
                    </div>
                  </div>
                )}

                {/* Stepper Primary CTA Buttons (Steps 6, 7, 8) */}
                <button
                  type="button"
                  className="btn btn-primary btn-block trip-next-action-btn"
                  onClick={handleAdvanceTripStep}
                >
                  {tripStep === 'to_pickup' && 'I Have Arrived at Pickup'}
                  {tripStep === 'at_pickup' && 'PICKUP COMPLETED (Rider Onboard)'}
                  {tripStep === 'on_way_to_dropoff' && 'DROPOFF COMPLETED'}
                  {tripStep === 'at_dropoff' && 'Confirm Payment & Finish Ride'}
                  {tripStep === 'ride_completed' && 'Back to Online State (Ready for Next Request)'}
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DAILY EARNINGS (Step 2) */}
        {activeTab === 'earnings' && (
          <div className="driver-tab-content">
            <div className="earnings-hero-card">
              <span className="earnings-hero-label">Today's Earnings</span>
              <h2 className="earnings-hero-amount">₹{earnings.today.toLocaleString()}</h2>
              <div className="earnings-hero-meta">
                <span>{earnings.rides_today} rides completed today</span>
              </div>
            </div>

            <div className="earnings-stats-grid">
              <div className="driver-stat-card">
                <TrendingUp size={16} className="text-primary" />
                <span className="stat-val">₹{earnings.week.toLocaleString()}</span>
                <span className="stat-lbl">This Week</span>
              </div>
              <div className="driver-stat-card">
                <Award size={16} className="text-accent" />
                <span className="stat-val">{earnings.acceptance_rate}%</span>
                <span className="stat-lbl">Acceptance</span>
              </div>
            </div>

            <div className="earnings-history-card">
              <h4 className="text-sm font-semibold mb-2">Today's Ride Ledger</h4>
              <div className="earnings-history-list">
                <div className="ledger-entry">
                  <div>
                    <span className="ledger-entry-title">Jalandhar City &rarr; LPU Main Gate</span>
                    <span className="ledger-entry-time text-xs text-muted">21.4 km &bull; Completed</span>
                  </div>
                  <span className="ledger-entry-amt text-primary font-bold">+₹320</span>
                </div>
                <div className="ledger-entry">
                  <div>
                    <span className="ledger-entry-title">Phagwara Bus Stand &rarr; LPU Block 34</span>
                    <span className="ledger-entry-time text-xs text-muted">8.2 km &bull; Completed</span>
                  </div>
                  <span className="ledger-entry-amt text-primary font-bold">+₹140</span>
                </div>
                <div className="ledger-entry">
                  <div>
                    <span className="ledger-entry-title">Model Town &rarr; Lovely Professional Univ</span>
                    <span className="ledger-entry-time text-xs text-muted">18.0 km &bull; Completed</span>
                  </div>
                  <span className="ledger-entry-amt text-primary font-bold">+₹280</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Driver Map Preview Canvas */}
      <main className="driver-map-canvas" aria-label="Live Fleet Navigation Map">
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      </main>

      {/* STEP 5: In-App Rider Chat Modal */}
      <RideChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        bookingId={activeTrip?.id || activeTrip?.booking_number || 'RIDE_ACTIVE_DEMO'}
        partnerName={activeTrip?.rider_name || 'Rider Adarsh'}
        partnerRole="RIDER"
        partnerVehicle="Passenger"
        currentUserRole="DRIVER"
      />

      {/* STEP 2: EDIT PROFILE MODAL */}
      {profileModalOpen && (
        <div className="chat-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="driver-profile-title">
          <div className="chat-modal-card profile-modal-card">
            <div className="chat-modal-header">
              <div className="chat-partner-info">
                <div className="chat-avatar-badge">
                  <User size={16} />
                </div>
                <div>
                  <h4 id="driver-profile-title" className="chat-partner-title">Driver Partner Profile</h4>
                  <p className="chat-partner-sub">Punjab Commercial Transport License</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost chat-close-btn"
                onClick={() => setProfileModalOpen(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="profile-modal-body">
              <div className="profile-field">
                <span className="field-lbl">Driver Name</span>
                <span className="field-val font-semibold">Priya Sharma</span>
              </div>
              <div className="profile-field">
                <span className="field-lbl">Registered Phone</span>
                <span className="field-val font-mono">+91 98765 01234</span>
              </div>
              <div className="profile-field">
                <span className="field-lbl">Vehicle Model</span>
                <span className="field-val">Maruti Swift Dzire (Glacier White)</span>
              </div>
              <div className="profile-field">
                <span className="field-lbl">Registration Plate</span>
                <span className="field-val font-mono font-semibold">PB 08 BG 1290</span>
              </div>
              <div className="profile-field">
                <span className="field-lbl">Commercial Permit</span>
                <span className="field-val text-accent font-semibold flex items-center gap-1">
                  <ShieldCheck size={13} className="text-accent" />
                  Punjab State Transport Authority (Active)
                </span>
              </div>
              <div className="profile-field">
                <span className="field-lbl">Driver Rating</span>
                <span className="field-val font-semibold text-accent">{earnings.rating}★ &bull; 97.2% Acceptance</span>
              </div>
            </div>

            <div className="profile-modal-footer">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => {
                  setProfileModalOpen(false);
                  showToast('Driver profile updated.');
                }}
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
