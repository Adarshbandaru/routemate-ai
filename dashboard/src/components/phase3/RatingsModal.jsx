import React, { useState } from 'react';
import { apiService } from '../../services/apiService';

const AVAILABLE_TAGS = [
  { id: 'cleanliness', label: '✨ Cleanliness' },
  { id: 'comfort', label: '🛋️ Comfort' },
  { id: 'safety', label: '🛡️ Safety' },
  { id: 'communication', label: '💬 Communication' },
  { id: 'professionalism', label: '👔 Professionalism' },
];

/**
 * RatingsModal Component — RouteMate AI Phase 3
 * Allows riders and drivers to rate completed rides and select feedback tags.
 */
export default function RatingsModal({
  bookingId,
  driverName = 'Your Driver',
  isOpen = false,
  onClose,
  onRatingSubmitted,
}) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [selectedTags, setSelectedTags] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const toggleTag = (tagId) => {
    setSelectedTags((prev) => ({
      ...prev,
      [tagId]: !prev[tagId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bookingId) {
      setError('No active booking to rate.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        rating,
        review: reviewText.trim() || undefined,
        tags: selectedTags,
      };
      await apiService.rateBooking(bookingId, payload);
      setSubmitted(true);
      if (onRatingSubmitted) {
        onRatingSubmitted({ bookingId, rating, tags: selectedTags });
      }
    } catch (err) {
      setError(err.message || 'Failed to submit rating.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={backdropStyle}>
      <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🎉</div>
            <h3 id="modal-title" style={{ margin: '0 0 6px', color: '#202820', fontSize: '1.25rem' }}>
              Thank you for your feedback!
            </h3>
            <p style={{ margin: '0 0 20px', color: '#68746A', fontSize: '0.88rem' }}>
              Your rating helps improve the RouteMate shared-mobility community in Punjab.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={submitButtonStyle}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 id="modal-title" style={{ margin: 0, color: '#202820', fontSize: '1.15rem', fontWeight: 700 }}>
                  Rate your trip
                </h3>
                <p style={{ margin: '2px 0 0', color: '#68746A', fontSize: '0.8rem' }}>
                  Trip with {driverName}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={closeButtonStyle}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {error && (
              <div style={{ padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#b91c1c', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '12px' }}>
                ⚠️ {error}
              </div>
            )}

            {/* Star Selector */}
            <div style={{ textAlign: 'center', margin: '14px 0' }}>
              <div style={{ display: 'inline-flex', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    style={starButtonStyle}
                    aria-label={`${star} star`}
                  >
                    <span style={{
                      fontSize: '1.8rem',
                      color: (hoverRating || rating) >= star ? '#FCD34D' : '#E4E8E0',
                      transition: 'color 0.15s ease',
                    }}>
                      ★
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#202820', fontWeight: 600, marginTop: '4px' }}>
                {rating === 5 && 'Excellent'}
                {rating === 4 && 'Good'}
                {rating === 3 && 'Average'}
                {rating === 2 && 'Below Average'}
                {rating === 1 && 'Poor'}
              </div>
            </div>

            {/* Feedback Tags */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#68746A', marginBottom: '6px' }}>
                What went well?
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {AVAILABLE_TAGS.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      ...tagButtonStyle,
                      backgroundColor: selectedTags[tag.id] ? '#E5F1E9' : '#F6F7F2',
                      borderColor: selectedTags[tag.id] ? '#176B4D' : '#E4E8E0',
                      color: selectedTags[tag.id] ? '#176B4D' : '#202820',
                      fontWeight: selectedTags[tag.id] ? 600 : 400,
                    }}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Text Review */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#68746A', marginBottom: '6px' }}>
                Additional comments (optional)
              </label>
              <textarea
                rows={3}
                placeholder="Share your experience or compliment the driver..."
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                style={textareaStyle}
                maxLength={500}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={submitButtonStyle}
            >
              {submitting ? 'Submitting Rating...' : 'Submit Rating'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const backdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(32, 40, 32, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
  padding: '16px',
};

const modalStyle = {
  backgroundColor: 'var(--bg-card, #FFFFFF)',
  borderRadius: '16px',
  width: '100%',
  maxWidth: '440px',
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: '18px',
  boxSizing: 'border-box',
  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
  border: '1px solid var(--border-subtle, #E4E8E0)',
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '1.1rem',
  color: '#68746A',
  cursor: 'pointer',
};

const starButtonStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px',
};

const tagButtonStyle = {
  padding: '6px 10px',
  borderRadius: '16px',
  border: '1px solid',
  fontSize: '0.75rem',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const textareaStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #E4E8E0',
  backgroundColor: '#F6F7F2',
  fontSize: '0.82rem',
  fontFamily: 'inherit',
  resize: 'none',
  boxSizing: 'border-box',
  outline: 'none',
};

const submitButtonStyle = {
  width: '100%',
  padding: '10px 16px',
  backgroundColor: '#176B4D',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.88rem',
  fontWeight: 600,
  cursor: 'pointer',
};
