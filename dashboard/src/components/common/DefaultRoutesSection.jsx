import { useState, useEffect } from 'react';
import { Sparkles, Search } from 'lucide-react';
import RouteCard from './RouteCard';
import { apiService } from '../../services/apiService';

const FALLBACK_DEFAULT_ROUTES = {
  lpu: [
    {
      id: 'route_lpu_001',
      name: 'Jalandhar Stn ↔ LPU Campus',
      category: 'commute',
      pickup: { name: 'Jalandhar Railway Station', address: 'Jalandhar, Punjab', lat: 31.3260, lng: 75.5762 },
      dropoff: { name: 'LPU Campus Main Gate', address: 'Lovely Professional University, NH-44, Phagwara', lat: 31.2536, lng: 75.7037 },
      distance_km: 21.4,
      duration_min: 24,
      avg_fare: 320,
      frequency: 'daily',
      route_polyline: [[31.3260, 75.5762], [31.2950, 75.6320], [31.2536, 75.7037]],
    },
    {
      id: 'route_lpu_002',
      name: 'LPU Campus → Ludhiana Stn',
      category: 'long_distance',
      pickup: { name: 'LPU Campus Main Gate', address: 'Lovely Professional University, NH-44', lat: 31.2536, lng: 75.7037 },
      dropoff: { name: 'Ludhiana Railway Station', address: 'Ludhiana, Punjab', lat: 30.9010, lng: 75.8573 },
      distance_km: 42.5,
      duration_min: 45,
      avg_fare: 480,
      frequency: 'frequent',
      route_polyline: [[31.2536, 75.7037], [31.2230, 75.7710], [30.9010, 75.8573]],
    },
    {
      id: 'route_lpu_003',
      name: 'Phagwara Bus Stand → LPU',
      category: 'short',
      pickup: { name: 'Phagwara Bus Stand', address: 'GT Road, Phagwara, Punjab', lat: 31.2230, lng: 75.7710 },
      dropoff: { name: 'LPU Law Gate', address: 'LPU Law Gate, Phagwara', lat: 31.2536, lng: 75.7037 },
      distance_km: 7.8,
      duration_min: 12,
      avg_fare: 120,
      frequency: 'hourly',
      route_polyline: [[31.2230, 75.7710], [31.2400, 75.7350], [31.2536, 75.7037]],
    },
  ],
  jalandhar: [
    {
      id: 'route_jal_001',
      name: 'Jalandhar City Center ↔ Phagwara',
      category: 'commute',
      pickup: { name: 'Jalandhar City Center', address: 'BMC Chowk, Jalandhar', lat: 31.3150, lng: 75.5800 },
      dropoff: { name: 'Phagwara Sugar Mill Chowk', address: 'GT Road, Phagwara', lat: 31.2230, lng: 75.7710 },
      distance_km: 24.2,
      duration_min: 28,
      avg_fare: 380,
      frequency: 'frequent',
      route_polyline: [[31.3150, 75.5800], [31.2950, 75.6320], [31.2230, 75.7710]],
    },
    {
      id: 'route_jal_002',
      name: 'Jalandhar Stn → Bus Stand',
      category: 'local',
      pickup: { name: 'Jalandhar Railway Station', address: 'Jalandhar Station Road', lat: 31.3260, lng: 75.5762 },
      dropoff: { name: 'Jalandhar ISBT Bus Stand', address: 'Interstate Bus Terminal, Jalandhar', lat: 31.3180, lng: 75.5850 },
      distance_km: 2.4,
      duration_min: 8,
      avg_fare: 60,
      frequency: 'very_frequent',
      route_polyline: [[31.3260, 75.5762], [31.3180, 75.5850]],
    },
    {
      id: 'route_jal_003',
      name: 'Adampur Airport → Jalandhar City',
      category: 'airport',
      pickup: { name: 'Adampur Airport (AIP)', address: 'Adampur Airfield Terminal', lat: 31.4330, lng: 75.7580 },
      dropoff: { name: 'Jalandhar City Center', address: 'BMC Chowk, Jalandhar', lat: 31.3150, lng: 75.5800 },
      distance_km: 23.5,
      duration_min: 32,
      avg_fare: 450,
      frequency: 'occasional',
      route_polyline: [[31.4330, 75.7580], [31.3600, 75.6700], [31.3150, 75.5800]],
    },
  ],
  ludhiana: [
    {
      id: 'route_lud_001',
      name: 'Ludhiana Focal Point → Phagwara',
      category: 'business',
      pickup: { name: 'Ludhiana Focal Point', address: 'Phase V, Ludhiana', lat: 30.8850, lng: 75.9120 },
      dropoff: { name: 'Phagwara Industrial Area', address: 'GT Road, Phagwara', lat: 31.2230, lng: 75.7710 },
      distance_km: 46.0,
      duration_min: 48,
      avg_fare: 550,
      frequency: 'daily',
      route_polyline: [[30.8850, 75.9120], [30.9010, 75.8573], [31.2230, 75.7710]],
    },
    {
      id: 'route_lud_002',
      name: 'Ludhiana Stn ↔ Clock Tower',
      category: 'local',
      pickup: { name: 'Ludhiana Railway Station', address: 'Ludhiana Station', lat: 30.9010, lng: 75.8573 },
      dropoff: { name: 'Ghanta Ghar (Clock Tower)', address: 'Central Ludhiana', lat: 30.9120, lng: 75.8450 },
      distance_km: 3.0,
      duration_min: 10,
      avg_fare: 80,
      frequency: 'very_frequent',
      route_polyline: [[30.9010, 75.8573], [30.9120, 75.8450]],
    },
    {
      id: 'route_lud_003',
      name: 'Ludhiana → Amritsar Express',
      category: 'long_distance',
      pickup: { name: 'Ludhiana Station', address: 'Ludhiana, Punjab', lat: 30.9010, lng: 75.8573 },
      dropoff: { name: 'Golden Temple Corridor', address: 'Amritsar City, Punjab', lat: 31.6200, lng: 74.8765 },
      distance_km: 140.0,
      duration_min: 135,
      avg_fare: 1850,
      frequency: 'occasional',
      route_polyline: [[30.9010, 75.8573], [31.2536, 75.7037], [31.3260, 75.5762], [31.6200, 74.8765]],
    },
  ],
};

const FAVORITES_STORAGE_KEY = 'routemate_favorite_routes';

export default function DefaultRoutesSection({
  onSelectRoute,
  onSwitchToCustom,
  _selectedRouteId,
}) {
  const [groupedRoutes, setGroupedRoutes] = useState(FALLBACK_DEFAULT_ROUTES);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'lpu' | 'jalandhar' | 'ludhiana'
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : ['route_lpu_001'];
    } catch {
      return ['route_lpu_001'];
    }
  });

  useEffect(() => {
    let active = true;
    apiService.getDefaultRoutes()
      .then((res) => {
        if (active && res?.data && Object.keys(res.data).length > 0) {
          setGroupedRoutes(res.data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const toggleFavorite = (routeId) => {
    setFavorites((prev) => {
      const next = prev.includes(routeId)
        ? prev.filter((id) => id !== routeId)
        : [...prev, routeId];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const allRoutesList = [
    ...(groupedRoutes.lpu || []),
    ...(groupedRoutes.jalandhar || []),
    ...(groupedRoutes.ludhiana || []),
  ];

  const displayedRoutes = () => {
    if (activeTab === 'lpu') return groupedRoutes.lpu || [];
    if (activeTab === 'jalandhar') return groupedRoutes.jalandhar || [];
    if (activeTab === 'ludhiana') return groupedRoutes.ludhiana || [];
    return allRoutesList;
  };

  return (
    <div className="default-routes-container">
      {/* Section Header */}
      <div className="default-routes-header">
        <div>
          <div className="section-eyebrow">
            <Sparkles size={13} className="text-primary" />
            <span>1-Tap Instant Commute</span>
          </div>
          <h2 className="section-heading">Popular Routes in Punjab</h2>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm custom-search-toggle-btn"
          onClick={onSwitchToCustom}
          title="Switch to custom pickup & destination input"
        >
          <Search size={13} />
          <span>Custom Route</span>
        </button>
      </div>

      {/* Quick Corridor Stats Banner */}
      <div className="corridor-stats-banner">
        <div className="corridor-stat-col">
          <span className="corridor-stat-value font-mono">24.5 km</span>
          <span className="corridor-stat-label">Avg Distance</span>
        </div>
        <div className="corridor-stat-divider" />
        <div className="corridor-stat-col">
          <span className="corridor-stat-value font-mono">₹320</span>
          <span className="corridor-stat-label">Avg Fare</span>
        </div>
        <div className="corridor-stat-divider" />
        <div className="corridor-stat-col">
          <span className="corridor-stat-value font-mono">25 min</span>
          <span className="corridor-stat-label">Avg Duration</span>
        </div>
      </div>

      {/* Hub Tabs Filter */}
      <div className="hub-tabs-row" role="tablist" aria-label="Punjab Transit Hubs">
        {[
          { id: 'all', label: 'All Hubs (9)' },
          { id: 'lpu', label: '🎓 LPU & Campus (3)' },
          { id: 'jalandhar', label: '🏙️ Jalandhar (3)' },
          { id: 'ludhiana', label: '🏭 Ludhiana (3)' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`hub-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Route Cards Grid */}
      <div className="routes-cards-grid">
        {displayedRoutes().map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            onSelect={onSelectRoute}
            isFavorite={favorites.includes(route.id)}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
