import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/apiService';

/**
 * PromosCarousel Component — RouteMate AI Phase 3
 * Horizontally scrollable active promo cards with copy-to-clipboard functionality.
 */
export default function PromosCarousel({ onSelectPromo = null }) {
  const [promos, setPromos] = useState([]);
  const [copiedCode, setCopiedCode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadPromos() {
      setLoading(true);
      try {
        const res = await apiService.getAvailablePromos();
        if (isMounted && res?.data) {
          setPromos(res.data);
        }
      } catch {
        // Fallback
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadPromos();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopy = async (code) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      }
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setCopiedCode(code);
    }
  };

  if (loading || promos.length === 0) return null;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#202820', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🎉 Special Offers & Promo Codes
        </span>
        <span style={{ fontSize: '0.72rem', color: '#68746A' }}>
          Scroll for more →
        </span>
      </div>

      <div style={carouselScrollContainer}>
        {promos.map((p) => (
          <div key={p.id || p.code} style={promoCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={codeBadgeStyle}>
                {p.code}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(p.code)}
                style={copyButtonStyle}
                title="Copy code"
              >
                {copiedCode === p.code ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>

            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#202820' }}>
                {p.discount_type === 'FLAT'
                  ? `Flat ₹${p.discount_value} OFF`
                  : `${p.discount_value}% OFF up to ₹${p.max_discount || 100}`}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#68746A', marginTop: '2px' }}>
                Min ride amount: ₹{p.min_ride_amount}
              </div>
            </div>

            {onSelectPromo && (
              <button
                type="button"
                onClick={() => onSelectPromo(p.code)}
                style={applyPromoButtonStyle}
              >
                Apply to Booking
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const carouselScrollContainer = {
  display: 'flex',
  gap: '12px',
  overflowX: 'auto',
  paddingBottom: '6px',
  scrollbarWidth: 'thin',
};

const promoCardStyle = {
  minWidth: '220px',
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid #E4E8E0',
  padding: '12px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const codeBadgeStyle = {
  fontSize: '0.78rem',
  fontWeight: 800,
  padding: '3px 8px',
  backgroundColor: '#E5F1E9',
  color: '#176B4D',
  borderRadius: '6px',
  letterSpacing: '0.5px',
};

const copyButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '0.72rem',
  color: '#68746A',
  cursor: 'pointer',
  padding: '2px 4px',
};

const applyPromoButtonStyle = {
  marginTop: '10px',
  padding: '6px 10px',
  backgroundColor: '#176B4D',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.74rem',
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
};
