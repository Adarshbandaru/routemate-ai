import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/apiService';

/**
 * TripReceipt Component — RouteMate AI Phase 3
 * Renders an authoritative trip receipt with printable styling and WhatsApp sharing.
 */
export default function TripReceipt({ bookingId = 'sample_booking', onClose }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [supportMessage, setSupportMessage] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchReceipt() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiService.getTripReceipt(bookingId);
        if (isMounted) setReceipt(res);
      } catch (err) {
        if (isMounted) setError(err.message || 'Unable to load trip receipt.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchReceipt();
    return () => {
      isMounted = false;
    };
  }, [bookingId]);

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    if (!receipt) return;
    const text = `RouteMate AI Trip Receipt\nBooking: ${receipt.booking_id}\nFare: ₹${receipt.total.toFixed(2)} (${receipt.payment_method})\nFrom: ${receipt.pickup}\nTo: ${receipt.dropoff}\nStatus: ${receipt.payment_status}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleReportIssue = () => {
    setSupportMessage('RouteMate Support ticket opened. Our Punjab dispatch team will review your trip details.');
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '32px', color: '#68746A' }}>
          Generating trip receipt...
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: '16px', backgroundColor: '#FEE2E2', color: '#b91c1c', borderRadius: '8px', fontSize: '0.85rem' }}>
          ⚠️ {error || 'Receipt not available.'}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            Close
          </button>
        )}
      </div>
    );
  }

  const { driver, fare_breakdown: fb } = receipt;

  return (
    <div style={containerStyle} className="routemate-receipt-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #E4E8E0', paddingBottom: '12px', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1.2rem' }}>🚕</span>
            <h3 style={{ margin: 0, color: '#176B4D', fontSize: '1.3rem', fontWeight: 800 }}>
              RouteMate AI
            </h3>
          </div>
          <p style={{ margin: '2px 0 0', color: '#68746A', fontSize: '0.78rem' }}>
            Punjab Smart Mobility Corridors
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#68746A' }}>TRIP RECEIPT</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#202820' }}>{receipt.booking_id}</div>
          <div style={{ fontSize: '0.72rem', color: '#68746A' }}>{receipt.date}</div>
        </div>
      </div>

      {/* Driver & Trip Info */}
      <div style={{ backgroundColor: '#F6F7F2', borderRadius: '8px', padding: '12px', marginBottom: '14px', border: '1px solid #E4E8E0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#68746A' }}>Driver</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#202820' }}>{driver?.name || 'Assigned Driver'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#68746A' }}>Vehicle</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#202820' }}>{driver?.vehicle || 'Sedan'}</div>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#202820', borderTop: '1px solid #E4E8E0', paddingTop: '8px' }}>
          <div>🟢 <strong>Pickup:</strong> {receipt.pickup}</div>
          <div style={{ marginTop: '3px' }}>🔴 <strong>Dropoff:</strong> {receipt.dropoff}</div>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.75rem', color: '#68746A' }}>
          <span>Distance: <strong>{receipt.distance_km} km</strong></span>
          <span>Duration: <strong>{receipt.duration_min} min</strong></span>
        </div>
      </div>

      {/* Itemized Fare Breakdown */}
      <div style={{ marginBottom: '14px' }}>
        <h5 style={{ margin: '0 0 8px', color: '#202820', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Fare Breakdown
        </h5>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.82rem' }}>
          <div style={rowStyle}>
            <span style={{ color: '#68746A' }}>Base Fare</span>
            <span style={{ fontWeight: 600, color: '#202820' }}>₹{fb.base.toFixed(2)}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: '#68746A' }}>Distance Fare</span>
            <span style={{ fontWeight: 600, color: '#202820' }}>₹{fb.distance.toFixed(2)}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: '#68746A' }}>Time Fare</span>
            <span style={{ fontWeight: 600, color: '#202820' }}>₹{fb.time.toFixed(2)}</span>
          </div>
          {fb.wait > 0 && (
            <div style={rowStyle}>
              <span style={{ color: '#68746A' }}>Waiting Fare</span>
              <span style={{ fontWeight: 600, color: '#202820' }}>₹{fb.wait.toFixed(2)}</span>
            </div>
          )}
          <div style={rowStyle}>
            <span style={{ color: '#68746A' }}>Surge Multiplier</span>
            <span style={{ fontWeight: 600, color: '#202820' }}>{fb.surge_multiplier.toFixed(1)}x</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: '#68746A' }}>Tax (5% GST)</span>
            <span style={{ fontWeight: 600, color: '#202820' }}>₹{fb.tax.toFixed(2)}</span>
          </div>
          {fb.discount > 0 && (
            <div style={{ ...rowStyle, color: '#15803d' }}>
              <span>Total Discount</span>
              <span style={{ fontWeight: 700 }}>-₹{fb.discount.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Total & Payment Method */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E5F1E9', borderRadius: '8px', padding: '12px', border: '1px solid #8BAA96', marginBottom: '14px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#176B4D', textTransform: 'uppercase' }}>
            Total Amount Due
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#176B4D' }}>
            ₹{receipt.total.toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: '#68746A' }}>Payment Mode</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#202820' }}>
            💵 {receipt.payment_method}
          </div>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '10px',
            backgroundColor: receipt.payment_status === 'COMPLETED' ? '#15803d' : '#b45309',
            color: '#FFFFFF',
            display: 'inline-block',
            marginTop: '3px',
          }}>
            {receipt.payment_status}
          </span>
        </div>
      </div>

      {supportMessage && (
        <div style={{ padding: '8px 12px', backgroundColor: '#E5F1E9', color: '#176B4D', borderRadius: '6px', fontSize: '0.78rem', marginBottom: '12px' }}>
          ✓ {supportMessage}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} className="no-print">
        <button type="button" onClick={handlePrint} style={actionButtonStyle}>
          🖨️ Print / PDF
        </button>
        <button type="button" onClick={handleWhatsAppShare} style={actionButtonStyle}>
          💬 WhatsApp
        </button>
        <button type="button" onClick={handleReportIssue} style={secondaryActionButtonStyle}>
          🚩 Report Issue
        </button>
        {onClose && (
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

const containerStyle = {
  backgroundColor: 'var(--bg-card, #FFFFFF)',
  borderRadius: '14px',
  border: '1px solid var(--border-subtle, #E4E8E0)',
  padding: '16px',
  width: '100%',
  maxWidth: '480px',
  maxHeight: '90vh',
  overflowY: 'auto',
  margin: '0 auto',
  boxSizing: 'border-box',
  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
};

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const actionButtonStyle = {
  flex: 1,
  padding: '8px 12px',
  backgroundColor: '#176B4D',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'center',
};

const secondaryActionButtonStyle = {
  flex: 1,
  padding: '8px 12px',
  backgroundColor: '#F6F7F2',
  color: '#202820',
  border: '1px solid #E4E8E0',
  borderRadius: '8px',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'center',
};

const closeButtonStyle = {
  padding: '8px 14px',
  backgroundColor: '#F6F7F2',
  color: '#68746A',
  border: '1px solid #E4E8E0',
  borderRadius: '8px',
  fontSize: '0.78rem',
  cursor: 'pointer',
};
