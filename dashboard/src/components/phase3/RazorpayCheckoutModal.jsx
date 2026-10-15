import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../../services/apiService';

/**
 * Helper for generating HMAC-SHA256 signature in sandbox test mode.
 */
async function fetchSandboxSignature(orderId, paymentId) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode('routemate_rzp_secret_test_2026');
  const msgData = encoder.encode(`${orderId}|${paymentId}`);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * RazorpayCheckoutModal (Phase 3.5)
 * Secure online payment checkout with cryptographic HMAC-SHA256 server verification.
 */
export default function RazorpayCheckoutModal({
  isOpen,
  onClose,
  bookingId,
  amount,
  onPaymentSuccess,
}) {
  const [selectedMethod, setSelectedMethod] = useState('upi');
  const [upiId, setUpiId] = useState('rider@okhdfcbank');
  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState(null);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  // Initialize Razorpay order upon opening
  useEffect(() => {
    if (!isOpen || !bookingId) {
      return;
    }

    let isMounted = true;
    apiService
      .createRazorpayOrder(bookingId, amount)
      .then((data) => {
        if (isMounted) {
          setOrderData(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unable to initiate Razorpay order.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, bookingId, amount]);

  const handleSimulatePayment = useCallback(
    async (shouldFail = false) => {
      if (!orderData) return;

      setLoading(true);
      setError(null);

      try {
        if (shouldFail) {
          await apiService.verifyRazorpayPayment(
            bookingId,
            orderData.order_id,
            `pay_fail_${orderData.order_id.slice(-6)}`,
            'tampered_invalid_signature'
          );
        } else {
          const paymentId = `pay_rzp_${orderData.order_id.slice(-8)}`;
          const signature = await fetchSandboxSignature(orderData.order_id, paymentId);
          const res = await apiService.verifyRazorpayPayment(
            bookingId,
            orderData.order_id,
            paymentId,
            signature
          );

          setSuccessData(res);
          if (onPaymentSuccess) {
            onPaymentSuccess(res);
          }
        }
      } catch (err) {
        setError(err.message || 'Payment verification failed. Please try again or pay with cash.');
      } finally {
        setLoading(false);
      }
    },
    [bookingId, orderData, onPaymentSuccess]
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(32, 40, 32, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rzp-checkout-title"
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '92vh',
          boxSizing: 'border-box',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          border: '1px solid #E4E8E0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: '#176B4D',
            color: '#FFFFFF',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚡</span>
              <h2 id="rzp-checkout-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                Razorpay Secure Checkout
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
              256-bit encrypted • Phase 3.5 Gateway
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Sandbox Notice Banner */}
        <div
          style={{
            backgroundColor: '#FEF3C7',
            borderBottom: '1px solid #FDE68A',
            padding: '10px 20px',
            fontSize: '12px',
            color: '#92400E',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>🧪</span>
          <span>
            <strong>Sandbox Test Mode:</strong> No real funds are debited. Test UPI, card, and failure scenarios safely.
          </span>
        </div>

        {/* Body Content */}
        <div style={{ padding: '18px', overflowY: 'auto', maxHeight: 'calc(92vh - 120px)' }}>
          {/* Order Summary */}
          <div
            style={{
              backgroundColor: '#F6F7F2',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: '1px solid #E4E8E0',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', color: '#68746A' }}>Amount Payable</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#176B4D' }}>
                ₹{Number(amount || 0).toFixed(2)}
              </div>
            </div>
            {orderData && (
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#68746A' }}>
                <div>Order: <code style={{ color: '#202820' }}>{orderData.order_id.slice(0, 16)}...</code></div>
                <div>Status: <span style={{ color: '#D97706', fontWeight: 600 }}>PENDING</span></div>
              </div>
            )}
          </div>

          {successData ? (
            <div
              style={{
                backgroundColor: '#E5F1E9',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center',
                border: '1px solid #8BAA96',
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#176B4D', fontSize: '18px' }}>
                Payment Verified Successfully!
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#202820' }}>
                Your transaction has been cryptographically verified and recorded in ride history.
              </p>
              <div style={{ fontSize: '12px', color: '#68746A', marginBottom: '20px' }}>
                Transaction ID: <strong>{successData.transaction_id}</strong>
              </div>
              <button
                onClick={onClose}
                style={{
                  backgroundColor: '#176B4D',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Continue to Trip
              </button>
            </div>
          ) : (
            <>
              {/* Payment Method Selector */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#202820', marginBottom: '8px' }}>
                  Select Payment Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'upi', label: '📱 UPI', sub: 'GPay/PhonePe' },
                    { id: 'card', label: '💳 Card', sub: 'Debit/Credit' },
                    { id: 'netbanking', label: '🏦 NetBanking', sub: 'All Banks' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMethod(m.id)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '10px',
                        border: selectedMethod === m.id ? '2px solid #176B4D' : '1px solid #E4E8E0',
                        backgroundColor: selectedMethod === m.id ? '#E5F1E9' : '#FFFFFF',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#202820' }}>{m.label}</div>
                      <div style={{ fontSize: '10px', color: '#68746A' }}>{m.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Method Specific Fields */}
              {selectedMethod === 'upi' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#68746A', marginBottom: '6px' }}>
                    Enter Virtual Payment Address (VPA)
                  </label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="username@okhdfcbank"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #E4E8E0',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#68746A', marginTop: '4px' }}>
                    Supported: Google Pay, PhonePe, Paytm, BHIM UPI
                  </div>
                </div>
              )}

              {selectedMethod === 'card' && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ padding: '12px', backgroundColor: '#F6F7F2', borderRadius: '8px', border: '1px solid #E4E8E0', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600, color: '#202820', marginBottom: '4px' }}>Sandbox Test Card</div>
                    <div style={{ fontFamily: 'monospace', color: '#176B4D' }}>4111 1111 1111 1111 • Exp: 12/28 • CVV: 123</div>
                  </div>
                </div>
              )}

              {selectedMethod === 'netbanking' && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ padding: '12px', backgroundColor: '#F6F7F2', borderRadius: '8px', border: '1px solid #E4E8E0', fontSize: '12px' }}>
                    <div style={{ color: '#202820' }}>Simulated instant netbanking via HDFC Bank, SBI, or ICICI Bank.</div>
                  </div>
                </div>
              )}

              {error && (
                <div
                  style={{
                    backgroundColor: '#FEE2E2',
                    border: '1px solid #FCA5A5',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: '#B91C1C',
                    marginBottom: '16px',
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  disabled={loading || !orderData}
                  onClick={() => handleSimulatePayment(false)}
                  style={{
                    width: '100%',
                    backgroundColor: '#176B4D',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '14px',
                    borderRadius: '10px',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {loading ? 'Verifying with Razorpay...' : `Pay ₹${Number(amount || 0).toFixed(2)} Securely`}
                </button>

                <button
                  type="button"
                  disabled={loading || !orderData}
                  onClick={() => handleSimulatePayment(true)}
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    color: '#68746A',
                    border: '1px dashed #E4E8E0',
                    padding: '8px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Simulate Payment Failure Scenario
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
