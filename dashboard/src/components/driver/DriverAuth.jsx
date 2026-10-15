import { useState } from 'react';
import {
  Car,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  User,
  FileText,
} from 'lucide-react';
import { apiService } from '../../services/apiService';

export default function DriverAuth({ onAuthSuccess = () => {} }) {
  // 3-step flow: 1: Phone, 2: OTP, 3: Register
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('+91 98765 01234');
  const [otpId, setOtpId] = useState('');
  const [otp, setOtp] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 3 registration fields
  const [driverName, setDriverName] = useState('Priya Sharma');
  const [licenseNumber, setLicenseNumber] = useState('PB08-2021-0094821');
  const [vehicleType, setVehicleType] = useState('sedan');

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!phone || phone.length < 10) {
      setError('Please enter a valid 10-digit mobile number with country code.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await apiService.requestDriverOtp(phone);
      if (res?.otp_id) {
        setOtpId(res.otp_id);
      } else {
        setOtpId(`otp_${Date.now()}`);
      }
      setOtp('123456');
      setStep(2);
    } catch {
      // Offline fallback
      setOtpId(`otp_${Date.now()}`);
      setOtp('123456');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await apiService.verifyDriverOtp(otpId, otp);
      if (res?.token && res?.driver) {
        localStorage.setItem('routemate_driver_token', res.token);
        localStorage.setItem('routemate_driver_id', res.driver.id || 'drv_priya');
        localStorage.setItem('routemate_driver_logged_in', 'true');
        onAuthSuccess(res.driver);
      } else {
        // Driver needs registration
        setStep(3);
      }
    } catch {
      // Demo fallback: if demo Priya Sharma, authenticate directly
      if (phone.includes('01234') || otp === '123456') {
        const demoDriver = {
          id: 'drv_priya',
          name: 'Priya Sharma',
          rating: 4.8,
          phone,
        };
        localStorage.setItem('routemate_driver_token', 'jwt_demo_priya_2026');
        localStorage.setItem('routemate_driver_id', 'drv_priya');
        localStorage.setItem('routemate_driver_logged_in', 'true');
        onAuthSuccess(demoDriver);
      } else {
        setStep(3);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    if (!driverName || !licenseNumber) {
      setError('Please fill in your name and driving license number.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await apiService.registerDriverPartner({
        phone,
        name: driverName,
        license_number: licenseNumber,
        vehicle_type: vehicleType,
      });

      const newDriver = {
        id: res?.driver_id || `drv_${Date.now()}`,
        name: driverName,
        rating: 4.8,
        phone,
      };

      localStorage.setItem('routemate_driver_token', 'jwt_driver_registered_2026');
      localStorage.setItem('routemate_driver_id', newDriver.id);
      localStorage.setItem('routemate_driver_logged_in', 'true');
      onAuthSuccess(newDriver);
    } catch {
      // Fallback
      const newDriver = {
        id: 'drv_priya',
        name: driverName,
        rating: 4.8,
        phone,
      };
      localStorage.setItem('routemate_driver_token', 'jwt_driver_registered_2026');
      localStorage.setItem('routemate_driver_id', newDriver.id);
      localStorage.setItem('routemate_driver_logged_in', 'true');
      onAuthSuccess(newDriver);
    } finally {
      setLoading(false);
    }
  };

  const handle1TapDemo = () => {
    const demoDriver = {
      id: 'drv_priya',
      name: 'Priya Sharma',
      rating: 4.8,
      phone: '+91 98765 01234',
    };
    localStorage.setItem('routemate_driver_token', 'jwt_demo_priya_2026');
    localStorage.setItem('routemate_driver_id', 'drv_priya');
    localStorage.setItem('routemate_driver_logged_in', 'true');
    onAuthSuccess(demoDriver);
  };

  return (
    <div className="driver-auth-screen-layout">
      <div className="driver-auth-card animate-in">
        {/* Header */}
        <div className="driver-auth-header">
          <div className="driver-auth-icon-badge">
            <Car size={26} />
          </div>
          <h2>RouteMate Driver Partner</h2>
          <p className="text-secondary text-sm">
            {step === 1 && 'Step 1 of 3: Enter your registered mobile number'}
            {step === 2 && 'Step 2 of 3: Enter 6-digit OTP verification code'}
            {step === 3 && 'Step 3 of 3: Complete your driver & vehicle registration'}
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="rider-toast-notification alert-danger mb-3" role="alert">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Phone Input */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} className="driver-auth-form">
            <div className="form-group">
              <label htmlFor="driver-phone-input" className="form-label text-xs uppercase font-semibold">
                Mobile Number (with +91)
              </label>
              <div className="input-with-icon">
                <Phone size={15} className="input-icon" />
                <input
                  id="driver-phone-input"
                  type="tel"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 01234"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
            >
              <span>{loading ? 'Sending OTP...' : 'Send OTP & Continue'}</span>
              <ArrowRight size={15} className="ml-1" />
            </button>

            <div className="auth-divider">
              <span>OR</span>
            </div>

            <button
              type="button"
              className="btn btn-outline btn-block demo-quick-login-btn"
              onClick={handle1TapDemo}
            >
              <ShieldCheck size={16} className="text-primary mr-1" />
              <span>1-Tap Demo Sign In (Priya Sharma • Swift Dzire)</span>
            </button>
          </form>
        )}

        {/* STEP 2: OTP Verification */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="driver-auth-form">
            <div className="form-group">
              <label htmlFor="driver-otp-input" className="form-label text-xs uppercase font-semibold">
                6-Digit Verification Code
              </label>
              <input
                id="driver-otp-input"
                type="text"
                maxLength={6}
                className="form-input font-mono text-center text-lg letter-spacing-lg"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                autoFocus
                required
              />
              <span className="text-xs text-muted block text-center mt-1">
                Demo code: <b>123456</b> (Sent to {phone})
              </span>
            </div>

            <div className="actions-row">
              <button
                type="button"
                className="btn btn-outline flex-1"
                onClick={() => setStep(1)}
              >
                Change Phone
              </button>
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Registration Form */}
        {step === 3 && (
          <form onSubmit={handleRegister} className="driver-auth-form">
            <div className="form-group">
              <label htmlFor="driver-name-input" className="form-label text-xs uppercase font-semibold">
                Full Name
              </label>
              <div className="input-with-icon">
                <User size={15} className="input-icon" />
                <input
                  id="driver-name-input"
                  type="text"
                  className="form-input"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="driver-license-input" className="form-label text-xs uppercase font-semibold">
                Commercial Driving License Number
              </label>
              <div className="input-with-icon">
                <FileText size={15} className="input-icon" />
                <input
                  id="driver-license-input"
                  type="text"
                  className="form-input font-mono"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="PB08-2021-0094821"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="driver-vehicle-type-select" className="form-label text-xs uppercase font-semibold">
                Vehicle Type
              </label>
              <select
                id="driver-vehicle-type-select"
                className="form-input"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
              >
                <option value="sedan">Sedan (Maruti Dzire / Honda Amaze)</option>
                <option value="suv">SUV (Ertiga / Innova)</option>
                <option value="hatchback">Hatchback (Swift / WagonR)</option>
                <option value="auto">Auto Rickshaw</option>
                <option value="bike">Moto Bike</option>
              </select>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
            >
              <CheckCircle2 size={16} className="mr-1" />
              <span>{loading ? 'Registering...' : 'Complete Registration & Open Dashboard'}</span>
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="driver-auth-footer">
          <ShieldCheck size={14} className="text-primary" />
          <span>Verified Commercial Fleet Operator &bull; Punjab Transport Authority</span>
        </div>
      </div>
    </div>
  );
}
