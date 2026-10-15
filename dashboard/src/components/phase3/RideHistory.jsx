import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { apiService } from '../../services/apiService';
import TripReceipt from './TripReceipt';
import './RideHistory.css';

/**
 * RideHistory Component — RouteMate AI
 * High-contrast, theme-aware trip history and spending ledger.
 */
export default function RideHistory({ onSelectBooking = null }) {
  const [historyData, setHistoryData] = useState({ history: [], total_monthly_spend: 0, total_rides: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await apiService.getRideHistory();
        if (isMounted && res) {
          setHistoryData(res);
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRides = (historyData.history || []).filter((ride) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ride.location?.toLowerCase().includes(q) ||
      ride.date?.toLowerCase().includes(q) ||
      ride.driver_name?.toLowerCase().includes(q) ||
      ride.payment_method?.toLowerCase().includes(q)
    );
  });

  const handleViewReceipt = (bookingId) => {
    if (onSelectBooking) {
      onSelectBooking(bookingId);
    } else {
      setSelectedBookingId(bookingId);
    }
  };

  return (
    <div className="ride-history-page">
      <div className="history-page-header">
        <h1>🚗 Ride History</h1>
        <p>Authoritative completed trips and payment records</p>
      </div>

      <Card className="spend-summary" elevated>
        <div className="spend-stat">
          <span className="label">Monthly Spend</span>
          <span className="value">
            ₹{historyData.total_monthly_spend ? Number(historyData.total_monthly_spend).toFixed(2) : '0.00'}
          </span>
        </div>
        <div className="spend-stat">
          <span className="label">Rides Completed</span>
          <span className="value">{historyData.total_rides || (historyData.history || []).length || 0}</span>
        </div>
      </Card>

      <div className="search-box">
        <input
          type="text"
          placeholder="Search rides by location, date, or driver..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {loading ? (
        <Card className="history-empty-state">
          <p className="empty-title">Loading travel history...</p>
        </Card>
      ) : filteredRides.length === 0 ? (
        <Card className="history-empty-state">
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🚗</div>
          <p className="empty-title">No rides found</p>
          <p className="empty-message">
            {searchQuery
              ? 'No trips matched your search filter.'
              : 'Your travel history will appear here once rides are completed.'}
          </p>
          <Button
            variant="primary"
            onClick={() => {
              window.location.hash = '#/ride';
            }}
          >
            Book a Ride
          </Button>
        </Card>
      ) : (
        <div className="rides-list">
          {filteredRides.map((ride) => (
            <Card key={ride.id} className="ride-item">
              <div className="ride-header">
                <div>
                  <p className="ride-date">📅 {ride.date || 'Today'}</p>
                  <p className="ride-route">{ride.location || 'Punjab Corridor'}</p>
                </div>
                <div className="ride-amount">₹{ride.fare || '0'}</div>
              </div>

              <div className="ride-details">
                {ride.driver_name && <span>Driver: <strong>{ride.driver_name}</strong></span>}
                <span>•</span>
                <span>Payment: <strong>{ride.payment_method || 'CASH'}</strong></span>
                <span>•</span>
                <span className="ride-badge ride-badge-completed">{ride.status || 'COMPLETED'}</span>
              </div>

              <div className="history-card-footer">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleViewReceipt(ride.id)}
                >
                  View Receipt
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedBookingId && (
        <TripReceipt
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
        />
      )}
    </div>
  );
}
