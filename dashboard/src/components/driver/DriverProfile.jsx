import { useState, useEffect } from 'react';
import {
  Phone,
  FileText,
  Car,
  Star,
  ShieldCheck,
  Edit3,
  Check,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { apiService } from '../../services/apiService';

export default function DriverProfile({ onBack = () => {} }) {
  const [profile, setProfile] = useState({
    name: 'Priya Sharma',
    phone: '+91 98765 01234',
    license_number: 'PB08-2021-0094821',
    vehicle_type: 'sedan',
    vehicle_model: 'Maruti Suzuki Swift Dzire',
    vehicle_number: 'PB 08 BG 1290',
    rating: 4.8,
    reviews: 342,
    total_rides: 642,
    acceptance_rate: 97.2,
    completion_rate: 99.1,
    joined_date: 'October 2024',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('Priya Sharma');
  const [editVehicle, setEditVehicle] = useState('sedan');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiService.getDriverProfile('drv_priya').then((res) => {
      if (mounted && res?.data) {
        setProfile((prev) => ({
          ...prev,
          name: res.data.name || prev.name,
          phone: res.data.phone || prev.phone,
          license_number: res.data.license_number || prev.license_number,
          vehicle_type: res.data.vehicle_type || prev.vehicle_type,
          rating: res.data.rating || prev.rating,
          reviews: res.data.reviews || prev.reviews,
        }));
        if (res.data.name) setEditName(res.data.name);
        if (res.data.vehicle_type) setEditVehicle(res.data.vehicle_type);
      }
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Update local profile
      setProfile((prev) => ({
        ...prev,
        name: editName,
        vehicle_type: editVehicle,
      }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      setIsEditing(false);
    } catch {}
    setSaving(false);
  };

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

        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'var(--accent-primary-subtle)',
              border: '1px solid var(--border-medium)',
              padding: '0.5rem 0.9rem',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--accent-primary)',
              cursor: 'pointer',
            }}
          >
            <Edit3 size={15} />
            <span>Edit Profile</span>
          </button>
        )}
      </div>

      {saveSuccess && (
        <div
          style={{
            background: 'var(--accent-primary-subtle)',
            border: '1px solid var(--border-medium)',
            color: 'var(--accent-primary)',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={16} />
          <span>Profile changes saved successfully!</span>
        </div>
      )}

      {/* Main Profile Header Card */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          padding: '1.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'var(--accent-primary-subtle)',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '3px solid var(--border-medium)',
            fontSize: '1.6rem',
            fontWeight: 800,
          }}
        >
          {profile.name.charAt(0)}
        </div>

        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              {profile.name}
            </h2>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                fontSize: '0.72rem',
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

          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Partner since {profile.joined_date} • Jalandhar Dispatch Hub
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.5rem' }}>
            <Star size={16} fill="#EAB308" color="#EAB308" />
            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {profile.rating}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              ({profile.reviews} verified rider reviews)
            </span>
          </div>
        </div>
      </div>

      {/* Edit Form Modal/Box if isEditing */}
      {isEditing && (
        <form
          onSubmit={handleSaveProfile}
          style={{
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1.5px solid var(--accent-primary)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
            Update Driver Information
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Full Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Vehicle Category
              </label>
              <select
                value={editVehicle}
                onChange={(e) => setEditVehicle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.85rem',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="sedan">Sedan (Dzire, Etios)</option>
                <option value="hatchback">Hatchback (WagonR, Swift)</option>
                <option value="suv">SUV / MUV (Ertiga, Innova)</option>
                <option value="auto">Auto Rickshaw</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-accept"
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.82rem' }}
            >
              <Check size={15} />
              <span>{saving ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Details Grid: Name, Phone, License, Vehicle */}
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
          Credentials & Vehicle Specifications
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', flexShrink: 0 }}>
              <Phone size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Phone Number
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {profile.phone}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', flexShrink: 0 }}>
              <FileText size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Driving License
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {profile.license_number}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', flexShrink: 0 }}>
              <Car size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Vehicle Details
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {profile.vehicle_model}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {profile.vehicle_number} ({profile.vehicle_type.toUpperCase()})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Performance Statistics Grid */}
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
          Performance & Reliability Scorecard
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'var(--bg-base)', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {profile.total_rides}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Total Trips</div>
          </div>

          <div style={{ background: 'var(--bg-base)', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
              {profile.acceptance_rate}%
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Acceptance Rate</div>
          </div>

          <div style={{ background: 'var(--bg-base)', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0284C7' }}>
              {profile.completion_rate}%
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Completion Rate</div>
          </div>

          <div style={{ background: 'var(--bg-base)', padding: '1rem', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#EAB308' }}>
              {profile.rating} ★
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Customer Rating</div>
          </div>
        </div>
      </div>
    </div>
  );
}
