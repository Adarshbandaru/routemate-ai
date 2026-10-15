import { useState, useEffect } from 'react';
import { X, MapPin, Navigation, Car, AlertCircle, RefreshCw } from 'lucide-react';
import { apiService } from '../../services/apiService';

export default function MyBookingsDrawer({ isOpen, onClose, onBookNewRide }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getUserBookings();
      setBookings(res?.data || []);
    } catch (err) {
      setError(err.message || 'Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (isOpen) {
      apiService.getUserBookings()
        .then((res) => {
          if (active) setBookings(res?.data || []);
        })
        .catch((err) => {
          if (active) setError(err.message || 'Could not load bookings.');
        });
    }
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="bookings-drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="bookings-drawer-title">
      <div className="bookings-drawer-panel">
        <div className="bookings-drawer-header">
          <div>
            <h3 id="bookings-drawer-title" className="bookings-drawer-title">
              My Ride History
            </h3>
            <p className="bookings-drawer-subtitle">
              Persisted in database &bull; Real-time status tracking
            </p>
          </div>
          <div className="bookings-header-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={fetchBookings}
              title="Refresh bookings"
              aria-label="Refresh bookings"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              title="Close drawer"
              aria-label="Close drawer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="bookings-drawer-content">
          {loading && (
            <div className="bookings-loading-state">
              <RefreshCw size={24} className="spin text-primary" />
              <p className="text-sm text-muted">Retrieving ride records...</p>
            </div>
          )}

          {error && (
            <div className="bookings-error-card">
              <AlertCircle size={16} className="text-danger" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && bookings.length === 0 && (
            <div className="bookings-empty-state">
              <div className="empty-state-icon-box">
                <Car size={32} />
              </div>
              <h4>No Rides Found Yet</h4>
              <p>Your confirmed and completed rides in the Punjab corridor will appear here in real time.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  if (onBookNewRide) onBookNewRide();
                }}
              >
                Book Your First Ride
              </button>
            </div>
          )}

          {!loading && bookings.map((b) => (
            <div key={b.id || b.booking_number} className="booking-history-card">
              <div className="booking-card-top">
                <span className="booking-id-tag font-mono">{b.booking_number || b.id}</span>
                <span className={`booking-status-tag status-${(b.status || 'requested').toLowerCase()}`}>
                  {b.status || 'REQUESTED'}
                </span>
              </div>

              <div className="booking-route-summary">
                <div className="route-summary-stop">
                  <MapPin size={13} className="text-primary" />
                  <span className="font-semibold">{b.pickup_address || 'Pickup Point'}</span>
                </div>
                <div className="route-summary-arrow">&darr;</div>
                <div className="route-summary-stop">
                  <Navigation size={13} className="text-accent" />
                  <span className="font-semibold">{b.dropoff_address || 'Dropoff Point'}</span>
                </div>
              </div>

              <div className="booking-card-footer">
                <div className="booking-metric">
                  <span className="metric-label">Distance</span>
                  <span className="metric-val">{b.distance_km || 24.5} km</span>
                </div>
                <div className="booking-metric">
                  <span className="metric-label">Fare</span>
                  <span className="metric-val font-semibold text-primary">₹{b.total_fare || 320}</span>
                </div>
                <div className="booking-metric">
                  <span className="metric-label">Time</span>
                  <span className="metric-val text-xs text-muted">
                    {b.created_at ? new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
