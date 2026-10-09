import { useState, useMemo, useCallback, useEffect } from 'react';
import { generateSyntheticScenario, runMatchingPipeline, exportToCSV } from './data';
import RouteMap from './components/RouteMap';
import StatsBar from './components/StatsBar';
import FeasibilityMatrix from './components/FeasibilityMatrix';
import ExperimentExplorer from './components/ExperimentExplorer';
import ArchitectureView from './components/ArchitectureView';
import BatchAssignment from './components/BatchAssignment';
import LiveAPI from './components/LiveAPI';
import GuidedDemo from './components/GuidedDemo';

const TABS = [
  { id: 'demo', label: '🚀 Guided Demo', icon: '🚀' },
  { id: 'playground', label: '🗺️ Match Playground', icon: '🗺️' },
  { id: 'batch', label: '🚐 Batch Assignment', icon: '🚐' },
  { id: 'experiments', label: '📊 Experiments', icon: '📊' },
  { id: 'api', label: '🔌 Live API', icon: '🔌' },
  { id: 'architecture', label: '🏗️ Architecture', icon: '🏗️' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('demo');
  const [seed, setSeed] = useState(42);
  const [driverCount, setDriverCount] = useState(12);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('routemate-theme') || 'dark');

  // Theme management
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('routemate-theme', theme);
  }, [theme]);

  // Generate synthetic data and run matching
  const { rider, drivers } = useMemo(
    () => generateSyntheticScenario(seed, driverCount),
    [seed, driverCount]
  );

  const matchResults = useMemo(
    () => runMatchingPipeline(rider, drivers),
    [rider, drivers]
  );

  const handleSelectDriver = useCallback((id) => {
    setSelectedDriver((prev) => (prev === id ? null : id));
  }, []);

  const selectedResult = selectedDriver
    ? matchResults.all.find((r) => r.driver_id === selectedDriver)
    : null;

  const handleExportPlayground = useCallback(() => {
    const data = matchResults.all.map((r) => ({
      driver_id: r.driver_id,
      eligible: r.final_eligible,
      score: r.score,
      pickup_km: r.features.pickup_distance_km.toFixed(3),
      dest_km: r.features.destination_distance_km.toFixed(3),
      route_sim: r.features.route_similarity.toFixed(3),
      dir_sim: r.features.direction_similarity.toFixed(3),
      detour_km: r.features.detour_km.toFixed(3),
      departure_min: r.features.departure_difference_min.toFixed(1),
      rejection_reasons: r.rejection_reasons.join('; '),
    }));
    exportToCSV(data, `playground_results_seed${seed}.csv`);
  }, [matchResults, seed]);

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header" id="app-header">
        <div className="header-brand">
          <div className="header-logo">R</div>
          <div>
            <div className="header-title">RouteMate AI</div>
            <div className="header-subtitle">Matching Intelligence Dashboard</div>
          </div>
        </div>
        <div className="header-status">
          <div className="status-indicator">
            <div className="status-dot online" />
            <span>Prototype v0.2.0</span>
          </div>
          <span className="badge info">Synthetic Data Only</span>
          <button
            className="btn btn-ghost btn-sm theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav-tabs" id="nav-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="main-content">
        {activeTab === 'demo' && <GuidedDemo onNavigateTab={setActiveTab} />}

        {activeTab === 'playground' && (
          <div className="animate-in" id="playground-view">
            <div className="section-header">
              <h1 className="section-title">Match Playground</h1>
              <p className="section-desc">
                Generate synthetic scenarios and explore how the matching pipeline evaluates rider–driver compatibility.
              </p>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group">
                <label className="form-label">Seed</label>
                <input
                  id="seed-input"
                  type="number"
                  className="form-input"
                  value={seed}
                  onChange={(e) => {
                    setSeed(parseInt(e.target.value, 10) || 0);
                    setSelectedDriver(null);
                  }}
                  style={{ width: '100px' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Driver Count</label>
                <select
                  id="driver-count-select"
                  className="form-select"
                  value={driverCount}
                  onChange={(e) => {
                    setDriverCount(parseInt(e.target.value, 10));
                    setSelectedDriver(null);
                  }}
                >
                  <option value={4}>Thin (4)</option>
                  <option value={8}>Light (8)</option>
                  <option value={12}>Balanced (12)</option>
                  <option value={16}>Medium (16)</option>
                  <option value={24}>Dense (24)</option>
                </select>
              </div>
              <button
                id="regenerate-btn"
                className="btn btn-primary"
                onClick={() => {
                  setSeed(Math.floor(Math.random() * 1000));
                  setSelectedDriver(null);
                }}
              >
                🎲 Random Scenario
              </button>
              <button className="btn btn-ghost" onClick={handleExportPlayground}>
                📥 Export CSV
              </button>
            </div>

            {/* Stats */}
            <div style={{ marginBottom: '24px' }}>
              <StatsBar stats={matchResults.stats} />
            </div>

            {/* Map + Detail panel */}
            <div className="grid-sidebar">
              {/* Sidebar: selected driver detail or summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {selectedResult ? (
                  <div className="card animate-in" id="driver-detail-panel">
                    <div className="card-header">
                      <span className="card-title">
                        {selectedResult.final_eligible ? '✅' : '❌'} {selectedResult.driver_id}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDriver(null)}>
                        ✕ Close
                      </button>
                    </div>
                    <div className="card-body">
                      <div style={{ marginBottom: '16px' }}>
                        <span className={`badge ${selectedResult.final_eligible ? 'success' : 'danger'}`}>
                          {selectedResult.final_eligible ? 'ELIGIBLE' : 'REJECTED'}
                        </span>
                        <span style={{ 
                          marginLeft: '8px', fontWeight: 700, fontSize: '1.5rem',
                          color: selectedResult.score >= 70 ? '#10b981' : selectedResult.score >= 50 ? '#f59e0b' : '#ef4444'
                        }}>
                          {selectedResult.score.toFixed(1)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>/100</span>
                      </div>

                      {/* Score bar */}
                      <div style={{ marginBottom: '16px' }}>
                        <div className="score-bar-container" style={{ width: '100%', height: '8px' }}>
                          <div
                            className="score-bar-fill"
                            style={{
                              width: `${selectedResult.score}%`,
                              background: selectedResult.score >= 70 ? 'linear-gradient(90deg, #10b981, #06b6d4)' :
                                selectedResult.score >= 50 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' :
                                'linear-gradient(90deg, #ef4444, #f87171)',
                            }}
                          />
                        </div>
                      </div>

                      {/* Checks */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Feasibility Checks
                        </div>
                        <div className="checks-grid">
                          {Object.entries({
                            route_direction_compatible: 'Direction',
                            pickup_distance_eligible: 'Pickup',
                            destination_distance_eligible: 'Dest',
                            departure_time_eligible: 'Time',
                            detour_eligible: 'Detour',
                            identity_verification: 'Identity',
                            vehicle_verification: 'Vehicle',
                            capacity_eligible: 'Capacity',
                          }).map(([key, label]) => (
                            <span key={key} className={`check-badge ${selectedResult[key] ? 'pass' : 'fail'}`}>
                              {selectedResult[key] ? '✓' : '✗'} {label}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Features */}
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Features
                        </div>
                        <div className="feature-detail">
                          {Object.entries({
                            pickup_distance_km: ['Pickup Dist', 'km'],
                            destination_distance_km: ['Dest Dist', 'km'],
                            route_similarity: ['Route Overlap', ''],
                            direction_similarity: ['Direction', ''],
                            detour_km: ['Detour', 'km'],
                            departure_difference_min: ['Departure Δ', 'min'],
                          }).map(([key, [label, unit]]) => (
                            <div key={key} className="feature-item">
                              <span className="feature-name">{label}</span>
                              <span className="feature-value">
                                {selectedResult.features[key]?.toFixed(2)}{unit ? ` ${unit}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rejection reasons */}
                      {selectedResult.rejection_reasons.length > 0 && (
                        <div className="rejection-reasons" style={{ marginTop: '12px' }}>
                          <ul>
                            {selectedResult.rejection_reasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card">
                    <div className="card-body">
                      <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <div className="empty-state-icon">🗺️</div>
                        <div className="empty-state-text">Select a Driver</div>
                        <div className="empty-state-hint">
                          Click a route on the map or a row in the feasibility matrix to inspect detailed match analysis.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div className="card">
                  <div className="card-body" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Map Legend
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[
                        { color: '#6366f1', label: 'Rider route', dash: false },
                        { color: '#10b981', label: 'Eligible driver', dash: false },
                        { color: '#ef4444', label: 'Rejected driver', dash: true },
                        { color: '#06b6d4', label: 'Selected driver', dash: false },
                      ].map((item) => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '20px', height: '3px',
                            background: item.color,
                            borderRadius: '2px',
                            ...(item.dash ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0, ${item.color} 4px, transparent 4px, transparent 8px)`, background: 'none' } : {}),
                          }} />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Map */}
              <RouteMap
                rider={rider}
                drivers={drivers}
                matchResults={matchResults}
                selectedDriver={selectedDriver}
                onSelectDriver={handleSelectDriver}
              />
            </div>

            {/* Feasibility Matrix */}
            <div style={{ marginTop: '24px' }}>
              <FeasibilityMatrix
                results={matchResults}
                selectedDriver={selectedDriver}
                onSelectDriver={handleSelectDriver}
              />
            </div>
          </div>
        )}

        {activeTab === 'batch' && <BatchAssignment />}
        {activeTab === 'experiments' && <ExperimentExplorer />}
        {activeTab === 'api' && <LiveAPI />}
        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>RouteMate AI — Research Prototype · Synthetic Data Only</span>
        <span>Not a production service · No safety, dispatch, or acceptance claims</span>
      </footer>
    </div>
  );
}
