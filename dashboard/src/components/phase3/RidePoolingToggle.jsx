import React from 'react';

/**
 * RidePoolingToggle Component — RouteMate AI Phase 3
 * Allows riders to opt into shared pooling for reduced fares and higher vehicle utilization.
 */
export default function RidePoolingToggle({
  allowPooling = false,
  onChange,
  poolStatus = null,
  poolingDiscount = 0,
}) {
  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1rem' }}>👥</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#202820' }}>
              Ride Pooling Option
            </span>
            {allowPooling && (
              <span style={greenBadgeStyle}>
                Pool Enabled
              </span>
            )}
          </div>
          <p style={{ margin: '3px 0 0', color: '#68746A', fontSize: '0.78rem' }}>
            {allowPooling
              ? 'Sharing your route with compatible riders reduces your fare and emissions.'
              : 'Private ride — exclusive vehicle with no additional pick-ups.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => onChange(false)}
            style={{
              ...toggleOptionStyle,
              backgroundColor: !allowPooling ? '#176B4D' : '#F6F7F2',
              color: !allowPooling ? '#FFFFFF' : '#68746A',
              borderColor: !allowPooling ? '#176B4D' : '#E4E8E0',
            }}
          >
            Private
          </button>
          <button
            type="button"
            onClick={() => onChange(true)}
            style={{
              ...toggleOptionStyle,
              backgroundColor: allowPooling ? '#176B4D' : '#F6F7F2',
              color: allowPooling ? '#FFFFFF' : '#68746A',
              borderColor: allowPooling ? '#176B4D' : '#E4E8E0',
            }}
          >
            Pool
          </button>
        </div>
      </div>

      {allowPooling && (
        <div style={poolStatusBoxStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.8rem', color: '#202820', fontWeight: 600 }}>
              {poolStatus?.riders > 1
                ? `Matched with ${poolStatus.riders - 1} co-rider(s)`
                : 'Searching for compatible co-riders along NH-44...'}
            </div>
            {poolingDiscount > 0 && (
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#15803d' }}>
                -₹{poolingDiscount.toFixed(2)} applied
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#68746A', marginTop: '4px' }}>
            Route compatibility and seat capacity are verified server-side before matching.
          </div>
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

const greenBadgeStyle = {
  fontSize: '0.68rem',
  fontWeight: 700,
  padding: '2px 6px',
  backgroundColor: '#E5F1E9',
  color: '#176B4D',
  borderRadius: '10px',
};

const toggleOptionStyle = {
  padding: '6px 14px',
  borderRadius: '8px',
  border: '1px solid',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const poolStatusBoxStyle = {
  marginTop: '10px',
  padding: '8px 12px',
  backgroundColor: '#F6F7F2',
  borderRadius: '8px',
  border: '1px dashed #8BAA96',
};
