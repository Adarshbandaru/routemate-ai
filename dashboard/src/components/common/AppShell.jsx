import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Moon,
  Sun,
  Search,
  HelpCircle,
  X,
} from 'lucide-react';
import AudienceToggle from './AudienceToggle';
import CommandPalette from './CommandPalette';
import EvidenceLedgerDrawer from './EvidenceLedgerDrawer';
import { NAV_ITEMS } from './navConfig';

export default function AppShell({
  currentRoute,
  onNavigate,
  audienceMode,
  onChangeAudienceMode,
  theme,
  onToggleTheme,
  reducedMotion,
  onToggleReducedMotion,
  apiOnline = false,
  children,
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Global Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      // Ignore inside form inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setLedgerOpen((prev) => !prev);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-layout" data-audience={audienceMode} data-reduced-motion={reducedMotion}>
      {/* Skip to Content for Accessibility */}
      <a href="#main-content" className="skip-to-content-link">
        Skip to main content
      </a>

      {/* Global Header */}
      <header className="app-header" id="app-header">
        <div className="header-brand">
          <div className="header-logo" aria-hidden="true">RM</div>
          <div>
            <div className="header-title">RouteMate AI</div>
            <div className="header-subtitle">Mobility Matching & Fleet Intelligence</div>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="header-status">
          {/* Environment Status Badge */}
          <div className="status-indicator" title={apiOnline ? 'Connected to live backend' : 'Running on deterministic client-side simulation'}>
            <div className={`status-dot ${apiOnline ? 'online' : 'offline'}`} />
            <span className="font-mono text-sm">{apiOnline ? 'Live API Connected' : 'Offline Simulation'}</span>
          </div>

          {/* Quick Search / Command Palette Trigger */}
          <button
            type="button"
            className="btn btn-outline btn-sm search-trigger-btn"
            onClick={() => setPaletteOpen(true)}
            title="Open Command Palette (⌘K / Ctrl+K)"
            aria-label="Open Command Palette"
          >
            <Search size={13} aria-hidden="true" />
            <span className="search-trigger-text">Search / Jump</span>
            <kbd className="palette-kbd">⌘K</kbd>
          </button>

          {/* Evidence Ledger Button */}
          <button
            type="button"
            id="evidence-ledger-btn"
            className="btn btn-outline btn-sm"
            onClick={() => setLedgerOpen(true)}
            title="Open Research Evidence Ledger (Key: E)"
            aria-label="Open Evidence Ledger"
          >
            <ShieldCheck size={14} className="text-accent" aria-hidden="true" />
            <span>Evidence</span>
            <kbd className="palette-kbd">E</kbd>
          </button>

          {/* Audience Depth Toggle */}
          <AudienceToggle mode={audienceMode} onChange={onChangeAudienceMode} />

          {/* Reduced Motion Toggle */}
          <button
            type="button"
            id="reduced-motion-btn"
            className={`btn btn-sm ${reducedMotion ? 'btn-primary' : 'btn-outline'}`}
            onClick={onToggleReducedMotion}
            title={reducedMotion ? 'Disable reduced motion' : 'Enable reduced motion (accessible non-animated step mode)'}
            aria-pressed={reducedMotion}
          >
            <span style={{ fontSize: '11px', fontWeight: 600 }}>
              {reducedMotion ? 'Step Mode' : 'Motion On'}
            </span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            className="theme-toggle"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Keyboard Shortcuts Help */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <HelpCircle size={15} />
          </button>
        </div>
      </header>

      {/* Primary Navigation Tabs */}
      <nav className="nav-tabs" id="nav-tabs" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentRoute === item.id;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              className={`nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="nav-tab-badge font-mono">{item.num}</span>
              <Icon size={14} className="nav-tab-icon" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <main className="main-content" id="main-content" tabIndex={-1}>
        {children}
      </main>

      {/* Bottom Navigation for Mobile Breakpoints */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`mobile-nav-btn ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="mobile-nav-btn"
          onClick={() => setPaletteOpen(true)}
          aria-label="More navigation and actions"
        >
          <Search size={18} />
          <span>More</span>
        </button>
      </nav>

      {/* Global Footer */}
      <footer className="app-footer">
        <div className="footer-left">
          <span>RouteMate AI — Mobility Systems Engineering & Optimization Engine</span>
          <span className="footer-sep">·</span>
          <span className="badge warning sim-badge">Simulated Suite</span>
        </div>
        <div className="footer-right">
          <span>Controlled Synthetic Simulation Suite · No Real-World Dispatch Claims</span>
        </div>
      </footer>

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigateRoute={onNavigate}
        onSelectPreset={() => {}}
        onToggleTheme={onToggleTheme}
        currentTheme={theme}
        onToggleReducedMotion={onToggleReducedMotion}
        reducedMotion={reducedMotion}
        onOpenEvidenceLedger={() => setLedgerOpen(true)}
      />

      {/* Evidence Ledger Global Drawer */}
      <EvidenceLedgerDrawer
        isOpen={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
      />

      {/* Keyboard Shortcuts Modal */}
      {shortcutsOpen && (
        <div className="palette-overlay" onClick={() => setShortcutsOpen(false)} role="dialog" aria-modal="true">
          <div className="palette-card animate-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="palette-input-box" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle size={18} className="text-accent" />
                <span style={{ fontWeight: 600 }}>Keyboard Shortcuts</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShortcutsOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { key: '⌘K / Ctrl+K', desc: 'Open Command Palette & search' },
                { key: 'E', desc: 'Open Research Evidence Ledger' },
                { key: 'Space', desc: 'Play / Pause simulation timeline' },
                { key: '← / →', desc: 'Step to previous / next simulation event' },
                { key: 'R', desc: 'Reset timeline to start' },
                { key: '?', desc: 'Show keyboard shortcuts' },
                { key: 'ESC', desc: 'Close any open drawer or modal' },
              ].map((sc) => (
                <div key={sc.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{sc.desc}</span>
                  <kbd className="palette-kbd">{sc.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
