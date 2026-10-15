import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/apiService';

/**
 * FareEstimate Component — RouteMate AI Phase 3
 * Connects to canonical backend /v1/fare/estimate formula.
 */
export default function FareEstimate({
  pickup,
  destination,
  vehicleType = 'sedan',
  appliedPromoDiscount = 0,
  poolingDiscount = 0,
  paymentMode = 'CASH',
  onSelectPaymentMode = null,
  onEstimateCalculated = null,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [breakdown, setBreakdown] = useState(null);

  useEffect(() => {
    if (!pickup?.lat || !destination?.lat) {
      return;
    }

    let isMounted = true;
    async function fetchEstimate() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiService.estimateFare({
          pickup_lat: Number(pickup.lat),
          pickup_lng: Number(pickup.lng),
          dropoff_lat: Number(destination.lat),
          dropoff_lng: Number(destination.lng),
          vehicle_type: vehicleType,
          surge_multiplier: 1.0,
        });

        if (isMounted) {
          setBreakdown(res);
          if (onEstimateCalculated) {
            onEstimateCalculated(res);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Unable to compute fare estimate.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchEstimate();
    return () => {
      isMounted = false;
    };
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, vehicleType, onEstimateCalculated]);

  if (!pickup?.lat || !destination?.lat) {
    return (
      <div style={containerStyle}>
        <div style={{ color: '#68746A', fontSize: '0.9rem', textAlign: 'center', padding: '16px 8px' }}>
          Select pickup and destination to view live fare estimate.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px' }}>
          <div style={spinnerStyle} />
          <span style={{ color: '#68746A', fontSize: '0.9rem' }}>Calculating canonical fare breakdown...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ color: '#b91c1c', fontSize: '0.85rem', padding: '12px' }}>
          ⚠️ {error}
        </div>
      </div>
    );
  }

  if (!breakdown) return null;

  const totalDiscount = (appliedPromoDiscount || 0) + (poolingDiscount || 0);
  const finalCalculatedTotal = Math.max(0, Math.round((breakdown.total - totalDiscount) * 100) / 100);

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#68746A', letterSpacing: '0.5px' }}>
            Fare Breakdown
          </span>
          <h4 style={{ margin: '2px 0 0', color: '#202820', fontSize: '1.25rem', fontWeight: 700 }}>
            ₹{finalCalculatedTotal.toFixed(2)}
          </h4>
        </div>
        <span style={badgeStyle}>
          {breakdown.estimate_only ? 'Estimate' : 'Authoritative'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', borderTop: '1px solid #E4E8E0', paddingTop: '10px' }}>
        <div style={rowStyle}>
          <span style={{ color: '#68746A' }}>Base Fare (incl. 1st km)</span>
          <span style={{ color: '#202820', fontWeight: 500 }}>₹{breakdown.base_fare.toFixed(2)}</span>
        </div>

        <div style={rowStyle}>
          <span style={{ color: '#68746A' }}>Distance ({breakdown.distance_km} km @ ₹8/km)</span>
          <span style={{ color: '#202820', fontWeight: 500 }}>₹{breakdown.distance_fare.toFixed(2)}</span>
        </div>

        <div style={rowStyle}>
          <span style={{ color: '#68746A' }}>Est. Time ({breakdown.time_minutes} min @ ₹0.50/min)</span>
          <span style={{ color: '#202820', fontWeight: 500 }}>₹{breakdown.time_fare.toFixed(2)}</span>
        </div>

        {breakdown.wait_fare > 0 && (
          <div style={rowStyle}>
            <span style={{ color: '#68746A' }}>Wait Time Charge</span>
            <span style={{ color: '#202820', fontWeight: 500 }}>₹{breakdown.wait_fare.toFixed(2)}</span>
          </div>
        )}

        <div style={rowStyle}>
          <span style={{ color: '#68746A' }}>Surge Multiplier</span>
          <span style={{ color: '#202820', fontWeight: 500 }}>{breakdown.surge_multiplier.toFixed(1)}x</span>
        </div>

        <div style={{ ...rowStyle, borderTop: '1px dashed #E4E8E0', paddingTop: '6px' }}>
          <span style={{ color: '#68746A' }}>Subtotal</span>
          <span style={{ color: '#202820', fontWeight: 500 }}>₹{breakdown.subtotal.toFixed(2)}</span>
        </div>

        <div style={rowStyle}>
          <span style={{ color: '#68746A' }}>Tax (5% GST)</span>
          <span style={{ color: '#202820', fontWeight: 500 }}>₹{breakdown.tax.toFixed(2)}</span>
        </div>

        {appliedPromoDiscount > 0 && (
          <div style={{ ...rowStyle, color: '#15803d' }}>
            <span>Promo Discount</span>
            <span style={{ fontWeight: 600 }}>-₹{appliedPromoDiscount.toFixed(2)}</span>
          </div>
        )}

        {poolingDiscount > 0 && (
          <div style={{ ...rowStyle, color: '#15803d' }}>
            <span>Pooling Discount</span>
            <span style={{ fontWeight: 600 }}>-₹{poolingDiscount.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: '12px', padding: '12px', background: '#F6F7F2', borderRadius: '8px', border: '1px solid #E4E8E0' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#68746A', marginBottom: '6px' }}>
          Payment Method:
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            type="button"
            onClick={() => onSelectPaymentMode && onSelectPaymentMode('CASH')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              border: (paymentMode || 'CASH') === 'CASH' ? '2px solid #176B4D' : '1px solid #E4E8E0',
              backgroundColor: (paymentMode || 'CASH') === 'CASH' ? '#E5F1E9' : '#FFFFFF',
              color: (paymentMode || 'CASH') === 'CASH' ? '#176B4D' : '#68746A',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            💵 Cash
          </button>
          <button
            type="button"
            onClick={() => onSelectPaymentMode && onSelectPaymentMode('RAZORPAY')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              border: paymentMode === 'RAZORPAY' ? '2px solid #176B4D' : '1px solid #E4E8E0',
              backgroundColor: paymentMode === 'RAZORPAY' ? '#E5F1E9' : '#FFFFFF',
              color: paymentMode === 'RAZORPAY' ? '#176B4D' : '#68746A',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            ⚡ Razorpay (UPI/Cards)
          </button>
        </div>

        <p style={{ margin: '0 0 4px', fontSize: '0.78rem', color: '#176B4D', fontWeight: 600 }}>
          {paymentMode === 'RAZORPAY'
            ? '⚡ Razorpay Sandbox — Pay online securely before or after trip.'
            : '💵 Cash payment — the driver collects payment at the end of the ride.'}
        </p>
        <p style={{ margin: 0, fontSize: '0.72rem', color: '#68746A' }}>
          Estimated fare only. Final fare depends on the applicable completed-trip calculation.
        </p>
      </div>
    </div>
  );
}

const containerStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid #E4E8E0',
  padding: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const badgeStyle = {
  fontSize: '0.72rem',
  fontWeight: 600,
  padding: '3px 8px',
  backgroundColor: '#E5F1E9',
  color: '#176B4D',
  borderRadius: '12px',
};

const spinnerStyle = {
  width: '16px',
  height: '16px',
  border: '2px solid #E4E8E0',
  borderTop: '2px solid #176B4D',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};
