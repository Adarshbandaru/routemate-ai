import { MapPin, Navigation, Star, ArrowRight } from 'lucide-react';

export default function RouteCard({
  route,
  onSelect,
  isFavorite = false,
  onToggleFavorite,
}) {
  return (
    <div
      className="punjab-route-card"
      onClick={() => onSelect && onSelect(route)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (onSelect) {
            onSelect(route);
          }
        }
      }}
      aria-label={`Select route ${route.name}`}
    >
      {/* Card Header: Title & Badges */}
      <div className="route-card-header">
        <div className="route-card-title-wrap">
          <h4 className="route-card-title">{route.name}</h4>
          <span className={`route-category-badge category-${route.category}`}>
            {route.category.replace('_', ' ')}
          </span>
        </div>
        {onToggleFavorite && (
          <button
            type="button"
            className={`route-star-btn ${isFavorite ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(route.id);
            }}
            title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
            aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
          >
            <Star size={15} fill={isFavorite ? '#176B4D' : 'none'} />
          </button>
        )}
      </div>

      {/* Locations */}
      <div className="route-card-stops">
        <div className="route-stop-line">
          <MapPin size={13} className="text-muted shrink-0" />
          <span className="route-stop-text">{route.pickup.name}</span>
        </div>
        <div className="route-stop-connector" />
        <div className="route-stop-line">
          <Navigation size={13} className="text-accent shrink-0" />
          <span className="route-stop-text text-muted">{route.dropoff.name}</span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="route-metrics-bar">
        <div className="route-metric-item">
          <span className="metric-val">{route.distance_km} km</span>
          <span className="metric-lbl">Distance</span>
        </div>
        <div className="route-metric-item">
          <span className="metric-val">{route.duration_min} min</span>
          <span className="metric-lbl">Duration</span>
        </div>
        <div className="route-metric-item">
          <span className="metric-val text-primary font-bold">₹{route.avg_fare}</span>
          <span className="metric-lbl">Avg Fare</span>
        </div>
      </div>

      {/* Frequency & Action */}
      <div className="route-card-footer">
        <span className="route-freq-tag">
          {route.frequency === 'daily' && '🔥 High Demand'}
          {route.frequency === 'frequent' && '🟢 Frequent Commute'}
          {route.frequency === 'very_frequent' && '⚡ Every 10 mins'}
          {route.frequency === 'hourly' && '⏱️ Hourly Campus Loop'}
          {route.frequency === 'occasional' && '🛣️ Highway Express'}
        </span>
        <span className="route-select-cta">
          Select <ArrowRight size={13} />
        </span>
      </div>
    </div>
  );
}
