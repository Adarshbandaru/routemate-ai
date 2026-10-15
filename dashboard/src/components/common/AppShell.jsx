import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Moon,
  Sun,
  Search,
  HelpCircle,
  X,
  User,
  History,
  LogOut,
  Menu,
  Car,
  Smartphone,
  Calendar,
  Wallet,
} from 'lucide-react';
import AudienceToggle from './AudienceToggle';
import CommandPalette from './CommandPalette';
import EvidenceLedgerDrawer from './EvidenceLedgerDrawer';
import AuthModal from './AuthModal';
import MyBookingsDrawer from './MyBookingsDrawer';
import MobileNavDrawer from './MobileNavDrawer';
import { NAV_ITEMS } from './navConfig';
import { getStoredUser, apiService } from '../../services/apiService';

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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [bookingsDrawerOpen, setBookingsDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());

  useEffect(() => {
    // Attempt background sync of profile if token exists
    if (!currentUser) {
      apiService.getProfile().then((res) => {
        if (res?.data && !res.is_demo) {
          setCurrentUser(res.data);
        }
      }).catch(() => {});
    }
  }, [currentUser]);

  const handleLogout = async () => {
    await apiService.logout();
    setCurrentUser(null);
  };

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

        {/* Desktop Global Controls & Status */}
        <div className="header-status header-status-desktop">
          {/* Environment Status Badge */}
          <div className="status-indicator" title={apiOnline ? 'Connected to live backend' : 'Running on deterministic client-side simulation'}>
            <div className={`status-dot ${apiOnline ? 'online' : 'offline'}`} />
            <span className="font-mono text-sm">{apiOnline ? 'Live API Connected' : 'Offline Simulation'}</span>
          </div>

          {/* My Rides History Button */}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setBookingsDrawerOpen(true)}
            title="View Real Booking History"
            aria-label="View Booking History"
          >
            <History size={13} aria-hidden="true" />
            <span>My Rides</span>
          </button>

          {/* User Authentication Profile Button */}
          {currentUser ? (
            <div className="user-profile-badge-group">
              <button
                type="button"
                className="btn btn-outline btn-sm user-profile-btn"
                onClick={() => setAuthModalOpen(true)}
                title={`Signed in as ${currentUser.name || currentUser.phone}`}
              >
                <User size={13} className="text-primary" />
                <span>{currentUser.name ? currentUser.name.split(' ')[0] : 'Rider'}</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm logout-mini-btn"
                onClick={handleLogout}
                title="Log out"
                aria-label="Log out"
              >
                <LogOut size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm auth-signin-btn"
              onClick={() => setAuthModalOpen(true)}
              title="Sign in with phone OTP"
            >
              <User size={13} />
              <span>Sign In</span>
            </button>
          )}

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

        {/* Mobile Global Controls: Compact brand actions + Menu toggle */}
        <div className="header-status-mobile">
          <div className="mobile-status-dot-wrap" title={apiOnline ? 'Live API Online' : 'Simulation Mode'}>
            <div className={`status-dot ${apiOnline ? 'online' : 'offline'}`} />
          </div>

          <button
            type="button"
            className="theme-toggle"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            type="button"
            className="mobile-hamburger-btn"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            title={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
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
        <button
          type="button"
          className={`mobile-nav-btn ${currentRoute === 'ride' ? 'active' : ''}`}
          onClick={() => onNavigate('ride')}
          aria-current={currentRoute === 'ride' ? 'page' : undefined}
        >
          <Car size={18} />
          <span>Ride</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${currentRoute.startsWith('driver') ? 'active' : ''}`}
          onClick={() => onNavigate('driver')}
          aria-current={currentRoute.startsWith('driver') ? 'page' : undefined}
        >
          <Smartphone size={18} />
          <span>Driver</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${currentRoute === 'scheduled' ? 'active' : ''}`}
          onClick={() => onNavigate('scheduled')}
          aria-current={currentRoute === 'scheduled' ? 'page' : undefined}
        >
          <Calendar size={18} />
          <span>Schedule</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${currentRoute === 'wallet' ? 'active' : ''}`}
          onClick={() => onNavigate('wallet')}
          aria-current={currentRoute === 'wallet' ? 'page' : undefined}
        >
          <Wallet size={18} />
          <span>Wallet</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${!['ride', 'driver', 'scheduled', 'wallet'].includes(currentRoute) || mobileNavOpen ? 'active' : ''}`}
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open all navigation routes and tools"
          aria-expanded={mobileNavOpen}
        >
          <Menu size={18} />
          <span>Menu</span>
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

      {/* Auth & Onboarding Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
        }}
      />

      {/* Persistent Rides History Drawer */}
      <MyBookingsDrawer
        isOpen={bookingsDrawerOpen}
        onClose={() => setBookingsDrawerOpen(false)}
        onBookNewRide={() => onNavigate('ride')}
      />

      {/* Comprehensive Mobile Navigation Drawer */}
      <MobileNavDrawer
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        currentUser={currentUser}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenLedger={() => setLedgerOpen(true)}
        onOpenBookings={() => setBookingsDrawerOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        theme={theme}
        onToggleTheme={onToggleTheme}
        audienceMode={audienceMode}
        onChangeAudienceMode={onChangeAudienceMode}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={onToggleReducedMotion}
        apiOnline={apiOnline}
      />
    </div>
  );
}
