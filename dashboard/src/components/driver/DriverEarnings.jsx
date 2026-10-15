import { useState, useEffect } from 'react';
import {
  Wallet,
  TrendingUp,
  Calendar,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { apiService } from '../../services/apiService';

const WEEKLY_DATA = [
  { day: 'Mon', amount: 1850, rides: 6 },
  { day: 'Tue', amount: 2100, rides: 7 },
  { day: 'Wed', amount: 2400, rides: 8 },
  { day: 'Thu', amount: 1950, rides: 6 },
  { day: 'Fri', amount: 2800, rides: 9 },
  { day: 'Sat', amount: 3100, rides: 10 },
  { day: 'Sun', amount: 0, rides: 0 },
];

const HISTORICAL_RIDES = [
  {
    id: 'RIDE_PK_091',
    route: 'Jalandhar City Railway Station → Lovely Professional University (LPU)',
    timestamp: 'Today, 02:45 PM',
    distance: '21.4 km',
    duration: '24 mins',
    fare: 320,
    status: 'Settled',
    paymentMethod: 'UPI Instant',
  },
  {
    id: 'RIDE_PK_090',
    route: 'Phagwara Bus Stand → LPU Law Gate',
    timestamp: 'Today, 11:15 AM',
    distance: '9.2 km',
    duration: '14 mins',
    fare: 180,
    status: 'Settled',
    paymentMethod: 'Cash',
  },
  {
    id: 'RIDE_PK_089',
    route: 'Ludhiana Clock Tower → Jalandhar Cantt',
    timestamp: 'Yesterday, 06:30 PM',
    distance: '58.0 km',
    duration: '62 mins',
    fare: 850,
    status: 'Settled',
    paymentMethod: 'UPI Instant',
  },
  {
    id: 'RIDE_PK_088',
    route: 'LPU Main Gate → Jalandhar Model Town',
    timestamp: 'Yesterday, 02:10 PM',
    distance: '23.1 km',
    duration: '28 mins',
    fare: 340,
    status: 'Settled',
    paymentMethod: 'UPI Instant',
  },
  {
    id: 'RIDE_PK_087',
    route: 'Rama Mandi Flyover → Phagwara Sugar Mill',
    timestamp: '13 Oct, 09:20 AM',
    distance: '16.5 km',
    duration: '20 mins',
    fare: 260,
    status: 'Settled',
    paymentMethod: 'UPI Instant',
  },
];

export default function DriverEarnings({ onBack = () => {} }) {
  const [earnings, setEarnings] = useState({
    today: 2400,
    week: 14200,
    month: 58000,
    rides_today: 8,
    rides_completed: 642,
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await apiService.getDriverEarnings('drv_priya');
        if (res?.data) {
          setEarnings((prev) => ({ ...prev, ...res.data }));
        }
      } catch {}
    }
    load();
  }, []);

  const maxDaily = Math.max(...WEEKLY_DATA.map((d) => d.amount), 3200);

  return (
    <div style={{ padding: '1.25rem', maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header with Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            padding: '0.5rem 0.9rem',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>

        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Weekly Statement: Oct 09 – Oct 15, 2026
        </div>
      </div>

      {/* 3 Main Cards: Today, This Week, This Month */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
        {/* Today Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '14px',
            border: '1px solid var(--border-subtle)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
              Today&apos;s Earnings
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.5rem' }}>
            ₹{earnings.today.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
            {earnings.rides_today} completed trips today
          </div>
        </div>

        {/* This Week Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '14px',
            border: '1px solid var(--border-subtle)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
              This Week
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.5rem' }}>
            ₹{earnings.week.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
            46 trips completed (Mon – Sun)
          </div>
        </div>

        {/* This Month Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '14px',
            border: '1px solid var(--border-subtle)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
              This Month
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-warning-subtle)', color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--accent-warning)', marginTop: '0.5rem' }}>
            ₹{earnings.month.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
            194 trips completed in October
          </div>
        </div>
      </div>

      {/* Weekly Visual Breakdown Bar Chart */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Weekly Daily Breakdown
            </h3>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
              Daily gross payout earnings for current week
            </p>
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
            Avg ₹2,366 / day
          </div>
        </div>

        {/* SVG/CSS Bar Chart */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.85rem', height: '160px', alignItems: 'flex-end', paddingBottom: '0.5rem' }}>
          {WEEKLY_DATA.map((d) => {
            const heightPercent = Math.max(8, (d.amount / maxDaily) * 100);
            const isToday = d.day === 'Wed';
            return (
              <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isToday ? 'var(--accent-primary)' : 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  {d.amount > 0 ? `₹${d.amount}` : '-'}
                </div>
                <div
                  style={{
                    width: '100%',
                    maxWidth: '44px',
                    height: `${heightPercent}%`,
                    background: isToday ? 'var(--accent-primary)' : 'var(--accent-primary-subtle)',
                    borderRadius: '6px 6px 0 0',
                    transition: 'height 0.4s ease',
                    border: isToday ? '1px solid var(--accent-primary)' : '1px solid var(--border-medium)',
                  }}
                />
                <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--accent-primary)' : 'var(--text-primary)', marginTop: '0.45rem' }}>
                  {d.day}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rides Summary Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.85rem',
          background: 'var(--bg-base)',
          padding: '1rem',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Lifetime Rides
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {earnings.rides_completed}
          </div>
        </div>

        <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Average Trip Fare
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.2rem' }}>
            ₹312
          </div>
        </div>

        <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Average Trip Distance
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            18.6 km
          </div>
        </div>

        <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Dispatch Acceptance
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.2rem' }}>
            97.2%
          </div>
        </div>
      </div>

      {/* Historical Ride List */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1rem' }}>
          Historical Ride Ledger
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {HISTORICAL_RIDES.map((ride) => (
            <div
              key={ride.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-base)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {ride.route}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', gap: '0.65rem' }}>
                  <span>{ride.timestamp}</span>
                  <span>•</span>
                  <span>{ride.distance}</span>
                  <span>•</span>
                  <span>{ride.duration}</span>
                  <span>•</span>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{ride.paymentMethod}</span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                  +₹{ride.fare}
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    color: 'var(--accent-primary)',
                    background: 'var(--accent-primary-subtle)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                    marginTop: '0.2rem',
                  }}
                >
                  <CheckCircle2 size={11} />
                  {ride.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
