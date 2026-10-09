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
import FleetRebalanceView from './components/FleetRebalanceView';

const TABS = [
  { id: 'demo', label: 'Guided Demo' },
  { id: 'playground', label: 'Match Playground' },
  { id: 'batch', label: 'Batch Assignment' },
  { id: 'rebalance', label: 'Fleet Staging' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'api', label: 'Live API' },
  { id: 'architecture', label: 'Architecture' },
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
          <div className="header-logo">RM</div>
          <div>
            <div className="header-title">RouteMate AI</div>
            <div className="header-subtitle">Mobility Matching & Fleet Intelligence</div>
          </div>
        </div>
        <div className="header-status">
          <div className="status-indicator">
            <div className="status-dot online" />
            <span>v0.2.0 · Prototype</span>
          </div>
          <span className="badge neutral">Synthetic Benchmarks</span>
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-tabs" id="nav-tabs">
        {TABS.map((tab, idx) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-tab-badge">0{idx + 1}</span>
            <span>{tab.label}</span>
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
                Evaluate rider–driver compatibility across geospatial routing corridors, zero-tolerance feasibility gates, and explainable scoring weights.
              </p>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
                  style={{ width: '90px' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Driver Fleet Size</label>
                <select
                  id="driver-count-select"
                  className="form-select"
                  value={driverCount}
                  onChange={(e) => {
                    setDriverCount(parseInt(e.target.value, 10));
                    setSelectedDriver(null);
                  }}
                >
                  <option value={4}>4 Candidates</option>
                  <option value={8}>8 Candidates</option>
                  <option value={12}>12 Candidates</option>
                  <option value={16}>16 Candidates</option>
                  <option value={24}>24 Candidates</option>
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
                Random Scenario
              </button>
              <button className="btn btn-outline" onClick={handleExportPlayground}>
                Export CSV
              </button>
            </div>

            {/* Stats Telemetry */}
            <div style={{ marginBottom: '18px' }}>
              <StatsBar stats={matchResults.stats} />
            </div>

            {/* Map + Detail sidebar */}
            <div className="grid-sidebar">
              {/* Sidebar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {selectedResult ? (
                  <div className="card animate-in" id="driver-detail-panel">
                    <div className="card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.875rem' }}>
                          {selectedResult.driver_id}
                        </span>
                        <span className={`badge ${selectedResult.final_eligible ? 'success' : 'danger'}`}>
                          {selectedResult.final_eligible ? 'ELIGIBLE' : 'REJECTED'}
                        </span>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDriver(null)}>
                        ✕
                      </button>
                    </div>
                    <div className="card-body">
                      {/* Score gauge */}
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                            Match Index
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            fontSize: '1.25rem',
                            color: selectedResult.score >= 70 ? '#34d399' : selectedResult.score >= 50 ? '#fbbf24' : '#f87171'
                          }}>
                            {selectedResult.score.toFixed(1)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ 100</span>
                          </span>
                        </div>
                        <div className="score-bar-container">
                          <div
                            className="score-bar-fill"
                            style={{
                              width: `${selectedResult.score}%`,
                              background: selectedResult.score >= 70 ? '#10b981' : selectedResult.score >= 50 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                      </div>

                      {/* Checks */}
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Admissibility Constraints
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
                              {selectedResult[key] ? '✓' : '✕'} {label}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Features */}
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Metric Attributes
                        </div>
                        <div className="feature-detail">
                          {Object.entries({
                            pickup_distance_km: ['Pickup Dist', 'km'],
                            destination_distance_km: ['Dest Dist', 'km'],
                            route_similarity: ['Route Overlap', ''],
                            direction_similarity: ['Direction Sim', ''],
                            detour_km: ['Detour Burden', 'km'],
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
                        <div className="rejection-reasons">
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
                      <div className="empty-state">
                        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                          <line x1="8" y1="2" x2="8" y2="18"></line>
                          <line x1="16" y1="6" x2="16" y2="22"></line>
                        </svg>
                        <div className="empty-state-text">Select a Driver Candidate</div>
                        <div className="empty-state-hint">
                          Click any route on the map or candidate row in the matrix to inspect constraint gates and feature vectors.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Map Legend */}
                <div className="card">
                  <div className="card-body" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Corridor Legend
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[
                        { color: '#3b82f6', label: 'Rider request corridor', dash: false },
                        { color: '#10b981', label: 'Eligible driver candidate', dash: false },
                        { color: '#ef4444', label: 'Pruned / rejected candidate', dash: true },
                        { color: '#06b6d4', label: 'Active inspection route', dash: false },
                      ].map((item) => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '18px', height: '3px',
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
            <div style={{ marginTop: '18px' }}>
              <FeasibilityMatrix
                results={matchResults}
                selectedDriver={selectedDriver}
                onSelectDriver={handleSelectDriver}
              />
            </div>
          </div>
        )}

        {activeTab === 'batch' && <BatchAssignment />}
        {activeTab === 'rebalance' && <FleetRebalanceView />}
        {activeTab === 'experiments' && <ExperimentExplorer />}
        {activeTab === 'api' && <LiveAPI />}
        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>RouteMate AI — Mobility Systems Engineering & Optimization Engine</span>
        <span>Controlled Synthetic Simulation Suite · No Real-World Dispatch Claims</span>
      </footer>
    </div>
  );
}
