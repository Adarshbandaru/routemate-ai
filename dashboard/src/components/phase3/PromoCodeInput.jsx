import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/apiService';

/**
 * PromoCodeInput Component — RouteMate AI Phase 3
 * Validates against server /v1/promo/validate and applies discounts.
 */
export default function PromoCodeInput({
  rideAmount = 250,
  onPromoApplied = null,
  appliedPromo = null,
  onPromoRemoved = null,
}) {
  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [availablePromos, setAvailablePromos] = useState([]);
  const [showAvailable, setShowAvailable] = useState(false);

  useEffect(() => {
    async function loadPromos() {
      try {
        const res = await apiService.getAvailablePromos();
        if (res?.data) {
          setAvailablePromos(res.data);
        }
      } catch {
        // Fallback silently if offline
      }
    }
    loadPromos();
  }, []);

  const handleApply = async (codeToValidate) => {
    const code = (codeToValidate || inputCode).trim().toUpperCase();
    if (!code) {
      setMessage({ type: 'error', text: 'Please enter a promo code.' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const res = await apiService.validatePromo(code, rideAmount);
      if (res.valid) {
        setMessage({
          type: 'success',
          text: `Success! ₹${res.discount.toFixed(2)} discount applied.`,
        });
        if (onPromoApplied) {
          onPromoApplied({
            code,
            discount: res.discount,
            finalAmount: res.final_amount,
          });
        }
      } else {
        setMessage({
          type: 'error',
          text: res.message || 'Promo code is not eligible for this ride.',
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Error validating promo code.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    setInputCode('');
    setMessage(null);
    if (onPromoRemoved) {
      onPromoRemoved();
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#202820' }}>
          Offers & Promo Codes
        </span>
        {availablePromos.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAvailable(!showAvailable)}
            style={toggleButtonStyle}
          >
            {showAvailable ? 'Hide Offers' : `${availablePromos.length} Offers Available`}
          </button>
        )}
      </div>

      {appliedPromo ? (
        <div style={appliedCardStyle}>
          <div>
            <span style={{ fontWeight: 700, color: '#176B4D', fontSize: '0.9rem' }}>
              🏷️ {appliedPromo.code}
            </span>
            <div style={{ fontSize: '0.78rem', color: '#15803d', marginTop: '2px' }}>
              ₹{appliedPromo.discount.toFixed(2)} saved on this ride
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            style={removeButtonStyle}
          >
            Remove
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="e.g. WELCOME50"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            style={inputStyle}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => handleApply(inputCode)}
            disabled={loading || !inputCode.trim()}
            style={applyButtonStyle}
          >
            {loading ? '...' : 'Apply'}
          </button>
        </div>
      )}

      {message && (
        <div style={{
          marginTop: '8px',
          fontSize: '0.78rem',
          padding: '6px 10px',
          borderRadius: '6px',
          backgroundColor: message.type === 'success' ? '#E5F1E9' : '#FEE2E2',
          color: message.type === 'success' ? '#176B4D' : '#b91c1c',
        }}>
          {message.text}
        </div>
      )}

      {showAvailable && !appliedPromo && availablePromos.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {availablePromos.map((p) => (
            <div
              key={p.id || p.code}
              style={offerRowStyle}
              onClick={() => {
                setInputCode(p.code);
                handleApply(p.code);
              }}
            >
              <div>
                <span style={{ fontWeight: 700, color: '#176B4D', fontSize: '0.82rem' }}>
                  {p.code}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#68746A', marginLeft: '8px' }}>
                  {p.discount_type === 'FLAT' ? `Flat ₹${p.discount_value} OFF` : `${p.discount_value}% OFF (up to ₹${p.max_discount || 100})`}
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#176B4D', fontWeight: 600 }}>
                TAP TO APPLY
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const containerStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid #E4E8E0',
  padding: '14px',
};

const inputStyle = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #E4E8E0',
  backgroundColor: '#F6F7F2',
  color: '#202820',
  fontSize: '0.85rem',
  fontWeight: 600,
  letterSpacing: '0.5px',
  outline: 'none',
};

const applyButtonStyle = {
  padding: '8px 16px',
  backgroundColor: '#176B4D',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const appliedCardStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  backgroundColor: '#E5F1E9',
  borderRadius: '8px',
  border: '1px solid #8BAA96',
};

const removeButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#b91c1c',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: '4px',
};

const toggleButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#176B4D',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const offerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 10px',
  backgroundColor: '#F6F7F2',
  borderRadius: '6px',
  border: '1px solid #E4E8E0',
  cursor: 'pointer',
};
