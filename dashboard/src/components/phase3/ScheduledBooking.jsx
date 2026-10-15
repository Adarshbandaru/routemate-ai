import React, { useState, useEffect, useCallback } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import Input from '../common/Input';
import { apiService } from '../../services/apiService';
import './ScheduledBooking.css';

/**
 * ScheduledBooking Component — RouteMate AI
 * High contrast, theme-aware pre-booking for intercity Punjab journeys.
 */
export default function ScheduledBooking({
  defaultPickup = { lat: 31.3260, lng: 75.5762, name: 'Jalandhar City Center' },
  defaultDropoff = { lat: 31.2536, lng: 75.7037, name: 'LPU Phagwara Main Gate' },
  onScheduledSuccess = null,
}) {
  const [scheduledDate, setScheduledDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [passengerCount, setPassengerCount] = useState(1);
  const [specialRequests, setSpecialRequests] = useState('');
  const [pickupLocation, setPickupLocation] = useState(defaultPickup?.name || 'Jalandhar City Center');
  const [dropoffLocation, setDropoffLocation] = useState(defaultDropoff?.name || 'LPU Phagwara Main Gate');
  const [estimatedFare, setEstimatedFare] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [scheduledList, setScheduledList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // Compute live estimate
  useEffect(() => {
    if (defaultPickup?.lat && defaultDropoff?.lat) {
      apiService.estimateFare({
        pickup_lat: defaultPickup.lat,
        pickup_lng: defaultPickup.lng,
        dropoff_lat: defaultDropoff.lat,
        dropoff_lng: defaultDropoff.lng,
        vehicle_type: 'sedan',
      }).then((res) => {
        setEstimatedFare(res?.total || 240);
      }).catch(() => {
        setEstimatedFare(240);
      });
    }
  }, [defaultPickup?.lat, defaultPickup?.lng, defaultDropoff?.lat, defaultDropoff?.lng]);

  const loadScheduledList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await apiService.getScheduledRides();
      if (res?.data) {
        setScheduledList(res.data);
      }
    } catch {
      // Fallback
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    apiService.getScheduledRides()
      .then((res) => {
        if (isMounted && res?.data) setScheduledList(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingList(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!scheduledDate || !scheduledTime) {
      setMessage({ type: 'error', text: 'Please pick a future date and time.' });
      return;
    }

    const isoString = `${scheduledDate}T${scheduledTime}:00`;
    const selectedDt = new Date(isoString);
    if (selectedDt <= new Date()) {
      setMessage({ type: 'error', text: 'Scheduled time must be strictly in the future.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const payload = {
        pickup_lat: defaultPickup.lat,
        pickup_lng: defaultPickup.lng,
        dropoff_lat: defaultDropoff.lat,
        dropoff_lng: defaultDropoff.lng,
        pickup_location: pickupLocation,
        dropoff_location: dropoffLocation,
        scheduled_time: selectedDt.toISOString(),
        passenger_count: Number(passengerCount),
        special_requests: specialRequests.trim() || undefined,
        vehicle_type: 'sedan',
      };

      const res = await apiService.scheduleRide(payload);
      setMessage({
        type: 'success',
        text: `Ride scheduled successfully! Status: ${res.status || 'CONFIRMED'} (Fare: ₹${res.estimated_fare || estimatedFare || 240})`,
      });
      loadScheduledList();
      if (onScheduledSuccess) {
        onScheduledSuccess(res);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to schedule ride.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    try {
      await apiService.cancelScheduledRide(bookingId);
      loadScheduledList();
    } catch (err) {
      setMessage({ type: 'error', text: `Error cancelling ride: ${err.message}` });
    }
  };

  return (
    <div className="scheduled-booking-page">
      <div className="scheduled-page-header">
        <h1>📅 Schedule a Ride</h1>
        <p>Book an intercity Punjab commute or campus journey in advance</p>
      </div>

      <Card className="schedule-form-card" elevated>
        {message && (
          <div className={`alert-message ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {message.type === 'success' ? '✓' : '⚠️'} {message.text}
          </div>
        )}

        <form onSubmit={handleScheduleSubmit}>
          <div className="schedule-grid-2">
            <Input
              label="Pickup Location"
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
              required
            />
            <Input
              label="Dropoff Location"
              value={dropoffLocation}
              onChange={(e) => setDropoffLocation(e.target.value)}
              required
            />
          </div>

          <div className="schedule-grid-2">
            <Input
              label="Date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              required
            />
            <Input
              label="Time"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="passenger-select">
              Number of Passengers
            </label>
            <select
              id="passenger-select"
              className="input"
              value={passengerCount}
              onChange={(e) => setPassengerCount(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((num) => (
                <option key={num} value={num}>
                  {num} {num === 1 ? 'Passenger' : 'Passengers'}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Special Requests (Optional)"
            placeholder="e.g., Please wait near Gate 1, Luggage trunk required"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
          />

          {estimatedFare && (
            <div className="fare-estimate-strip">
              <span className="fare-estimate-label">Estimated Fare</span>
              <span className="fare-estimate-value">₹{typeof estimatedFare === 'number' ? estimatedFare.toFixed(2) : estimatedFare}</span>
            </div>
          )}

          <div className="form-actions">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
            >
              Confirm Scheduled Ride
            </Button>
          </div>
        </form>
      </Card>

      {/* Upcoming Scheduled Rides List */}
      <div className="scheduled-rides-section">
        <h2>Upcoming Scheduled Rides</h2>

        {loadingList ? (
          <Card className="schedule-empty-state">
            <p>Loading scheduled journeys...</p>
          </Card>
        ) : scheduledList.length === 0 ? (
          <Card className="schedule-empty-state">
            <p>No upcoming scheduled rides yet</p>
          </Card>
        ) : (
          <div className="scheduled-rides-list">
            {scheduledList.map((ride) => (
              <Card key={ride.id} className="scheduled-ride-card">
                <div className="scheduled-ride-info">
                  <p className="scheduled-ride-date">
                    🕒 {new Date(ride.scheduled_time).toLocaleString()}
                  </p>
                  <p className="scheduled-ride-location">
                    {ride.pickup_location} → {ride.dropoff_location}
                  </p>
                  <div className="scheduled-ride-meta">
                    <span className={`scheduled-badge ${
                      ride.status === 'CONFIRMED'
                        ? 'badge-confirmed'
                        : ride.status === 'CANCELLED'
                        ? 'badge-cancelled'
                        : 'badge-pending'
                    }`}>
                      {ride.status}
                    </span>
                    <span className="scheduled-ride-fare">
                      ₹{ride.estimated_fare}
                    </span>
                  </div>
                </div>

                {ride.status !== 'CANCELLED' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleCancelBooking(ride.id)}
                  >
                    Cancel
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
