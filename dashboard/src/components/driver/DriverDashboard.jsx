import { useState, useEffect, useCallback } from 'react';
import {
  Car,
  Power,
  TrendingUp,
  Award,
  Star,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Wallet,
  User,
} from 'lucide-react';
import { apiService } from '../../services/apiService';

export default function DriverDashboard({
  driver = null,
  isOnline = true,
  onToggleStatus = null,
  onNavigate = () => {},
}) {
  const driverId = driver?.id || localStorage.getItem('routemate_driver_id') || 'drv_priya';
  const driverName = driver?.name || 'Priya Sharma';

  const [status, setStatus] = useState(isOnline ? 'ONLINE' : 'OFFLINE');
  const [toggling, setToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [earnings, setEarnings] = useState({
    today: 2400,
    week: 14200,
    month: 58000,
    rides_today: 8,
    rides_completed: 642,
    rating: 4.8,
    reviews: 342,
    acceptance_rate: 97.2,
  });

  const fetchEarnings = useCallback(async () => {
    try {
      const res = await apiService.getDriverEarnings(driverId);
      if (res?.data) {
        setEarnings((prev) => ({
          ...prev,
          today: res.data.today ?? prev.today,
          week: res.data.week ?? prev.week,
          month: res.data.month ?? prev.month,
          rides_today: res.data.rides_today ?? prev.rides_today,
          rides_completed: res.data.rides_completed ?? prev.rides_completed,
        }));
      }
    } catch {
      // Retain existing state
    }
  }, [driverId]);

  // Polling earnings every 30 seconds
  useEffect(() => {
    let mounted = true;
    apiService.getDriverEarnings(driverId).then((res) => {
      if (mounted && res?.data) {
        setEarnings((prev) => ({
          ...prev,
          today: res.data.today ?? prev.today,
          week: res.data.week ?? prev.week,
          month: res.data.month ?? prev.month,
          rides_today: res.data.rides_today ?? prev.rides_today,
          rides_completed: res.data.rides_completed ?? prev.rides_completed,
        }));
      }
    }).catch(() => {});

    const interval = setInterval(fetchEarnings, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [driverId, fetchEarnings]);

  const handleStatusToggle = async () => {
    if (toggling) return;
    setToggling(true);
    const newStatus = status === 'ONLINE' ? 'OFFLINE' : 'ONLINE';

    try {
      if (onToggleStatus) {
        await onToggleStatus(newStatus === 'ONLINE');
      } else {
        await apiService.updateDriverStatus(driverId, newStatus);
      }
      setStatus(newStatus);
    } catch {
      // Fallback local toggle
      setStatus(newStatus);
    } finally {
      setToggling(false);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchEarnings();
    setTimeout(() => setRefreshing(false), 400);
  };

  const isDutyOnline = status === 'ONLINE';

  return (
    <div style={{ padding: '1.25rem', maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header Card */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          padding: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'var(--accent-primary-subtle)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--border-medium)',
              fontSize: '1.2rem',
              fontWeight: 700,
            }}
          >
            {driverName.charAt(0)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Welcome, {driverName}
              </h2>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--accent-primary)',
                  background: 'var(--accent-primary-subtle)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <ShieldCheck size={13} />
                Verified Partner
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Punjab GT Road Corridor • Swift Dzire (PB 08 BG 1290)
            </div>
          </div>
        </div>

        {/* Status Toggle Button */}
        <div>
          <button
            type="button"
            onClick={handleStatusToggle}
            disabled={toggling}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.4rem',
              borderRadius: '999px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: toggling ? 'not-allowed' : 'pointer',
              border: 'none',
              background: isDutyOnline ? 'var(--accent-primary)' : 'var(--accent-danger)',
              color: '#FFFFFF',
              boxShadow: isDutyOnline
                ? '0 4px 14px rgba(23, 107, 77, 0.3)'
                : '0 4px 14px rgba(239, 68, 68, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            {toggling ? (
              <RefreshCw size={16} className="spin-animation" />
            ) : (
              <Power size={16} />
            )}
            <span>{isDutyOnline ? 'ONLINE (ON DUTY)' : 'OFFLINE (OFF DUTY)'}</span>
          </button>
        </div>
      </div>

      {/* Waiting for requests message strip */}
      <div
        style={{
          background: isDutyOnline ? 'var(--accent-primary-subtle)' : 'var(--accent-danger-subtle)',
          border: `1px solid ${isDutyOnline ? 'var(--border-medium)' : 'rgba(239, 68, 68, 0.35)'}`,
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.82rem',
          color: isDutyOnline ? 'var(--accent-primary)' : 'var(--accent-danger)',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: isDutyOnline ? 'var(--accent-primary)' : 'var(--accent-danger)',
              boxShadow: isDutyOnline ? '0 0 8px var(--accent-primary)' : 'none',
            }}
          />
          <span>
            {isDutyOnline
              ? 'Waiting for ride requests along Jalandhar — LPU — Phagwara corridor...'
              : 'You are currently offline. Turn online to receive shared mobility requests.'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            opacity: 0.85,
          }}
          title="Refresh stats"
        >
          <RefreshCw size={13} className={refreshing ? 'spin-animation' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Today's Earnings Card */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
            Today&apos;s Gross Earnings
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.25rem' }}>
            ₹{earnings.today.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            Calculated across {earnings.rides_today} completed trips today
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('earnings')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.65rem 1.1rem',
            borderRadius: '8px',
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          <Wallet size={15} color="var(--accent-primary)" />
          <span>Full Earnings Ledger</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Stats Grid: rides today, total completed, rating, reviews */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            padding: '1.15rem',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem', color: 'var(--accent-primary)' }}>
            <TrendingUp size={22} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {earnings.rides_today}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Rides Today</div>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            padding: '1.15rem',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem', color: '#0284C7' }}>
            <Car size={22} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {earnings.rides_completed}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Total Completed</div>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            padding: '1.15rem',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem', color: '#EAB308' }}>
            <Star size={22} fill="#EAB308" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {earnings.rating} ★
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Driver Rating</div>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            padding: '1.15rem',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem', color: '#8B5CF6' }}>
            <Award size={22} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {earnings.reviews}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Rider Reviews</div>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={() => onNavigate('earnings')}
          style={{
            padding: '0.85rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <Wallet size={16} color="var(--accent-primary)" />
          <span>View Earnings</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('profile')}
          style={{
            padding: '0.85rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <User size={16} color="var(--accent-primary)" />
          <span>Edit Profile</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('active-ride')}
          style={{
            padding: '0.85rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <Car size={16} color="var(--accent-primary)" />
          <span>Active Ride</span>
        </button>
      </div>
    </div>
  );
}
