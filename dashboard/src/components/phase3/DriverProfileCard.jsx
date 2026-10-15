import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/apiService';

/**
 * DriverProfileCard Component — RouteMate AI Phase 3
 * Displays driver ratings, review distribution, recent reviews, and favorite toggle.
 */
export default function DriverProfileCard({
  driverId = 'drv_priya',
  driverName = 'Priya Sharma',
  vehicleInfo = 'Glacier White Sedan (PB 08 BG 1290)',
  onFavoriteChanged = null,
}) {
  const [ratingsData, setRatingsData] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [favLoading, setFavLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchDriverInfo() {
      setLoading(true);
      try {
        const [rRes, fRes] = await Promise.all([
          apiService.getDriverRatings(driverId),
          apiService.getFavoriteDriverStatus(driverId),
        ]);
        if (isMounted) {
          setRatingsData(rRes);
          setIsFavorite(!!fRes?.is_favorite);
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchDriverInfo();
    return () => {
      isMounted = false;
    };
  }, [driverId]);

  const handleToggleFavorite = async () => {
    setFavLoading(true);
    try {
      if (isFavorite) {
        await apiService.removeFavoriteDriver(driverId);
        setIsFavorite(false);
        if (onFavoriteChanged) onFavoriteChanged(false);
      } else {
        await apiService.addFavoriteDriver(driverId);
        setIsFavorite(true);
        if (onFavoriteChanged) onFavoriteChanged(true);
      }
    } catch {
      // Toggle failure
    } finally {
      setFavLoading(false);
    }
  };

  const avgRating = ratingsData?.avg_rating || 5.0;
  const totalReviews = ratingsData?.total_reviews || 0;
  const breakdown = ratingsData?.breakdown || { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={avatarStyle}>
            {driverName.charAt(0)}
          </div>
          <div>
            <h4 style={{ margin: '0 0 2px', color: '#202820', fontSize: '1rem', fontWeight: 700 }}>
              {driverName}
            </h4>
            <div style={{ color: '#68746A', fontSize: '0.78rem' }}>
              🚗 {vehicleInfo}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
              <span style={{ color: '#FCD34D', fontSize: '0.85rem' }}>★</span>
              <span style={{ fontWeight: 700, color: '#202820', fontSize: '0.82rem' }}>
                {avgRating.toFixed(1)}
              </span>
              <span style={{ color: '#68746A', fontSize: '0.75rem' }}>
                ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleFavorite}
          disabled={favLoading}
          style={{
            ...favoriteButtonStyle,
            backgroundColor: isFavorite ? '#E5F1E9' : '#F6F7F2',
            color: isFavorite ? '#176B4D' : '#68746A',
            borderColor: isFavorite ? '#8BAA96' : '#E4E8E0',
          }}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorite drivers'}
        >
          {isFavorite ? '❤️ Favorited' : '🤍 Favorite'}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '12px', textAlign: 'center', color: '#68746A', fontSize: '0.8rem' }}>
          Loading driver feedback...
        </div>
      ) : (
        <div>
          {/* Star Rating Breakdown Bars */}
          <div style={{ borderTop: '1px solid #E4E8E0', paddingTop: '10px', marginTop: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#68746A', textTransform: 'uppercase' }}>
              Rating Distribution
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = breakdown[String(stars)] || 0;
                const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                return (
                  <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
                    <span style={{ width: '14px', color: '#68746A' }}>{stars}★</span>
                    <div style={barBackgroundStyle}>
                      <div style={{ ...barFillStyle, width: `${percentage}%` }} />
                    </div>
                    <span style={{ width: '24px', textAlign: 'right', color: '#68746A' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Reviews */}
          <div style={{ borderTop: '1px solid #E4E8E0', paddingTop: '10px', marginTop: '10px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#68746A', textTransform: 'uppercase' }}>
              Recent Rider Reviews
            </span>
            {ratingsData?.recent_reviews?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                {ratingsData.recent_reviews.slice(0, 3).map((r, idx) => (
                  <div key={idx} style={reviewCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ color: '#FCD34D', fontSize: '0.75rem' }}>{'★'.repeat(r.rating || 5)}</span>
                      <span style={{ color: '#68746A', fontSize: '0.7rem' }}>{r.created_at ? String(r.created_at).slice(0, 10) : 'Recent'}</span>
                    </div>
                    <div style={{ color: '#202820', fontSize: '0.78rem', fontStyle: 'italic' }}>
                      "{r.review}"
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: '#68746A', marginTop: '4px' }}>
                No textual reviews yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid #E4E8E0',
  padding: '16px',
};

const avatarStyle = {
  width: '42px',
  height: '42px',
  borderRadius: '50%',
  backgroundColor: '#E5F1E9',
  color: '#176B4D',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.2rem',
  fontWeight: 700,
};

const favoriteButtonStyle = {
  padding: '6px 12px',
  borderRadius: '16px',
  border: '1px solid',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const barBackgroundStyle = {
  flex: 1,
  height: '6px',
  backgroundColor: '#F6F7F2',
  borderRadius: '3px',
  overflow: 'hidden',
};

const barFillStyle = {
  height: '100%',
  backgroundColor: '#176B4D',
  borderRadius: '3px',
  transition: 'width 0.3s ease',
};

const reviewCardStyle = {
  padding: '8px',
  backgroundColor: '#F6F7F2',
  borderRadius: '6px',
  border: '1px solid #E4E8E0',
};
