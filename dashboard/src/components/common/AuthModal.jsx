import { useState } from 'react';
import { X, Phone, KeyRound, ShieldCheck, UserCheck, ArrowRight, Check } from 'lucide-react';
import { apiService } from '../../services/apiService';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'success'
  const [phone, setPhone] = useState('+91 98765 43210');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [devHint, setDevHint] = useState(null);
  const [authUser, setAuthUser] = useState(null);

  if (!isOpen) return null;

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiService.sendOtp(phone);
      if (res?.data?.dev_hint_otp) {
        setDevHint(res.data.dev_hint_otp);
      }
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiService.verifyOtp(phone, otp || devHint || '123456');
      const user = res?.data?.user;
      setAuthUser(user);
      setStep('success');
      if (onAuthSuccess) {
        onAuthSuccess(user);
      }
    } catch (err) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="auth-modal-card">
        {/* Modal Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-brand">
            <div className="auth-modal-logo">RM</div>
            <div>
              <h3 id="auth-modal-title" className="auth-modal-title">
                {step === 'phone' && 'Welcome to RouteMate AI'}
                {step === 'otp' && 'Verify Phone Number'}
                {step === 'success' && 'Signed In Successfully'}
              </h3>
              <p className="auth-modal-subtitle">
                {step === 'phone' && 'Enter your mobile number to sign in or create an account'}
                {step === 'otp' && `Enter the 6-digit OTP sent to ${phone}`}
                {step === 'success' && 'Your account is now authenticated with JWT session tokens'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost auth-close-btn"
            onClick={onClose}
            aria-label="Close authentication modal"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="auth-error-banner" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: PHONE NUMBER */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="auth-form">
            <div className="form-group">
              <label htmlFor="auth-phone-input" className="form-label">
                Mobile Number
              </label>
              <div className="auth-input-wrapper">
                <Phone size={16} className="auth-input-icon" />
                <input
                  id="auth-phone-input"
                  type="tel"
                  className="auth-text-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  required
                />
              </div>
            </div>

            <div className="auth-demo-hint">
              <span className="font-mono text-xs text-muted">
                Demo Quick Fill: <code>+91 98765 43210</code>
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? 'Sending Code...' : 'Send Verification OTP'}
              <ArrowRight size={15} />
            </button>
          </form>
        )}

        {/* STEP 2: OTP VERIFICATION */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="auth-form">
            <div className="form-group">
              <label htmlFor="auth-otp-input" className="form-label">
                6-Digit Security Code
              </label>
              <div className="auth-input-wrapper">
                <KeyRound size={16} className="auth-input-icon" />
                <input
                  id="auth-otp-input"
                  type="text"
                  maxLength={6}
                  className="auth-text-input font-mono tracking-widest"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  autoFocus
                  required
                />
              </div>
            </div>

            {devHint && (
              <div className="auth-code-pill" onClick={() => setOtp(devHint)}>
                <span>Dev Demo OTP: <strong>{devHint}</strong> (Click to auto-fill)</span>
              </div>
            )}

            <div className="auth-actions-row">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setStep('phone')}
              >
                Change Phone
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
                <Check size={15} />
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 'success' && (
          <div className="auth-success-view">
            <div className="auth-success-icon-wrap">
              <UserCheck size={36} className="text-primary" />
            </div>
            <h4>Welcome, {authUser?.name || 'Rider'}!</h4>
            <p className="text-sm text-muted">
              Role: <strong className="text-primary">{authUser?.role || 'RIDER'}</strong> &bull; Phone: {authUser?.phone}
            </p>
            <div className="auth-token-badge">
              <ShieldCheck size={13} className="text-accent" />
              <span>Session Active: 24h JWT Token</span>
            </div>
            <button
              type="button"
              className="btn btn-primary auth-submit-btn"
              onClick={onClose}
            >
              Done & Start Booking
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
