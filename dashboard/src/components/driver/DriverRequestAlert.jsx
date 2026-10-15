import { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Clock,
  MapPin,
  Navigation,
  Star,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

function playPingSound() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

export default function DriverRequestAlert({
  request,
  onAccept = () => {},
  onReject = () => {},
  timeoutSeconds = 10,
}) {
  const [countdown, setCountdown] = useState(timeoutSeconds);
  const audioPlayedRef = useRef(false);

  useEffect(() => {
    if (!audioPlayedRef.current) {
      playPingSound();
      audioPlayedRef.current = true;
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onReject(request, 'auto_timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [request, onReject]);

  if (!request) return null;

  const fare = request.fare || request.total_fare || 320;
  const distance = request.distance_km || 21.4;
  const duration = request.duration_min || Math.round((request.duration_sec || 1440) / 60);
  const riderName = request.rider_name || 'Adarsh Bandaru';
  const riderRating = request.rider_rating || 4.9;
  const pickup = request.pickup_address || request.pickup?.address || 'Jalandhar City Railway Station';
  const dropoff = request.dropoff_address || request.dropoff?.address || 'Lovely Professional University (LPU)';

  return (
    <div className="request-alert-backdrop" role="dialog" aria-modal="true" aria-label="Incoming Ride Request">
      <div className="request-alert-card animate-in">
        {/* Ring Pulse and Timer Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="request-ring-container">
              <div className="request-ring-pulse" />
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bell size={18} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                New Ride Request
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Respond before timer expires
              </div>
            </div>
          </div>

          {/* 10s Countdown Timer Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.35rem 0.65rem',
              borderRadius: '999px',
              background: countdown <= 3 ? 'var(--color-danger-light)' : 'var(--color-primary-light)',
              color: countdown <= 3 ? 'var(--color-danger)' : 'var(--color-primary)',
              border: `1px solid ${countdown <= 3 ? 'var(--color-danger)' : 'var(--color-primary)'}`,
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            <Clock size={14} />
            <span>{countdown}s</span>
          </div>
        </div>

        {/* Rider Profile Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem',
            background: 'var(--bg-elevated)',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {riderName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
              <Star size={13} fill="#EAB308" color="#EAB308" />
              <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {riderRating} ★ Verified Rider
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-primary)' }}>
              ₹{fare}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Est. Fare</div>
          </div>
        </div>

        {/* Route Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
            <MapPin size={16} color="var(--color-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                Pickup Location
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                {pickup}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
            <Navigation size={16} color="var(--color-info)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                Dropoff Destination
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                {dropoff}
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '0.5rem',
            padding: '0.65rem',
            background: 'var(--bg-elevated)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            textAlign: 'center',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Distance</div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>{distance} km</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Duration</div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>{duration} min</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Payout</div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--color-primary)' }}>₹{fare}</div>
          </div>
        </div>

        {/* Action Buttons: Accept / Reject */}
        <div className="driver-actions-grid">
          <button
            type="button"
            className="btn-reject"
            onClick={() => onReject(request, 'driver_declined')}
          >
            <XCircle size={17} />
            <span>Reject</span>
          </button>

          <button
            type="button"
            className="btn-accept"
            onClick={() => onAccept(request)}
          >
            <CheckCircle2 size={17} />
            <span>Accept Ride</span>
          </button>
        </div>
      </div>
    </div>
  );
}
