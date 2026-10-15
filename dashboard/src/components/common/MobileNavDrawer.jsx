import { useEffect } from 'react';
import {
  X,
  Search,
  ShieldCheck,
  History,
  User,
  LogOut,
  Moon,
  Sun,
  HelpCircle,
  Activity,
  Sparkles,
} from 'lucide-react';
import { NAV_ITEMS } from './navConfig';

export default function MobileNavDrawer({
  isOpen,
  onClose,
  currentRoute,
  onNavigate,
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenPalette,
  onOpenLedger,
  onOpenBookings,
  onOpenShortcuts,
  theme,
  onToggleTheme,
  audienceMode,
  onChangeAudienceMode,
  reducedMotion,
  onToggleReducedMotion,
  apiOnline,
}) {
  // Close drawer on ESC key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Split navigation into primary mobility vs intelligence/research
  const primaryRoutes = NAV_ITEMS.slice(0, 5); // ride, driver, scheduled, history, wallet
  const researchRoutes = NAV_ITEMS.slice(5); // demo, playground, batch, staging, experiments, api, architecture

  const handleItemClick = (id) => {
    onNavigate(id);
    onClose();
  };

  return (
    <div
      className="mobile-nav-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="RouteMate Navigation Menu"
    >
      <div
        className="mobile-nav-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="mobile-nav-header">
          <div className="mobile-nav-brand">
            <div className="header-logo" aria-hidden="true">RM</div>
            <div>
              <div className="mobile-nav-title">RouteMate AI</div>
              <div className="mobile-nav-subtitle">
                <span className={`status-dot ${apiOnline ? 'online' : 'offline'}`} />
                <span>{apiOnline ? 'Live API Online' : 'Simulation Mode'}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="mobile-nav-close-btn"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* User Profile / Authentication Banner */}
        <div className="mobile-nav-auth-banner">
          {currentUser ? (
            <div className="mobile-nav-user-row">
              <div className="mobile-nav-avatar">
                <User size={18} />
              </div>
              <div className="mobile-nav-user-info">
                <div className="mobile-nav-user-name">{currentUser.name || 'Rider'}</div>
                <div className="mobile-nav-user-sub">{currentUser.phone || 'Verified User'}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  onLogout();
                }}
                title="Log out"
                aria-label="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                onClose();
                onOpenAuth();
              }}
            >
              <User size={15} />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>

        {/* Scrollable Navigation Body */}
        <div className="mobile-nav-body">
          {/* Section 1: Mobility Workflows */}
          <div className="mobile-nav-section">
            <div className="mobile-nav-section-title">Mobility Workflows</div>
            <div className="mobile-nav-links-grid">
              {primaryRoutes.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`mobile-nav-link-card ${isActive ? 'active' : ''}`}
                    onClick={() => handleItemClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <div className="mobile-nav-link-icon-wrap">
                      <Icon size={18} />
                    </div>
                    <div className="mobile-nav-link-text">
                      <span className="mobile-nav-link-label">{item.label}</span>
                      <span className="mobile-nav-link-num font-mono">{item.num}</span>
                    </div>
                    {isActive && <div className="mobile-nav-active-pill">Active</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Research & Engine Tools */}
          <div className="mobile-nav-section">
            <div className="mobile-nav-section-title">Research & Fleet Intelligence</div>
            <div className="mobile-nav-links-grid">
              {researchRoutes.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`mobile-nav-link-card ${isActive ? 'active' : ''}`}
                    onClick={() => handleItemClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <div className="mobile-nav-link-icon-wrap">
                      <Icon size={18} />
                    </div>
                    <div className="mobile-nav-link-text">
                      <span className="mobile-nav-link-label">{item.label}</span>
                      <span className="mobile-nav-link-num font-mono">{item.num}</span>
                    </div>
                    {isActive && <div className="mobile-nav-active-pill">Active</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Quick Utilities */}
          <div className="mobile-nav-section">
            <div className="mobile-nav-section-title">Utilities & Research Ledger</div>
            <div className="mobile-nav-actions-list">
              <button
                type="button"
                className="mobile-nav-action-row"
                onClick={() => {
                  onClose();
                  onOpenPalette();
                }}
              >
                <div className="action-row-left">
                  <Search size={16} />
                  <span>Command Palette & Search</span>
                </div>
                <kbd className="palette-kbd">⌘K</kbd>
              </button>

              <button
                type="button"
                className="mobile-nav-action-row"
                onClick={() => {
                  onClose();
                  onOpenLedger();
                }}
              >
                <div className="action-row-left">
                  <ShieldCheck size={16} className="text-accent" />
                  <span>Research Evidence Ledger</span>
                </div>
                <kbd className="palette-kbd">E</kbd>
              </button>

              <button
                type="button"
                className="mobile-nav-action-row"
                onClick={() => {
                  onClose();
                  onOpenBookings();
                }}
              >
                <div className="action-row-left">
                  <History size={16} />
                  <span>My Booking History</span>
                </div>
              </button>

              <button
                type="button"
                className="mobile-nav-action-row"
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
              >
                <div className="action-row-left">
                  <HelpCircle size={16} />
                  <span>Keyboard Shortcuts</span>
                </div>
                <kbd className="palette-kbd">?</kbd>
              </button>
            </div>
          </div>

          {/* Section 4: Preferences (Audience, Motion, Theme) */}
          <div className="mobile-nav-section">
            <div className="mobile-nav-section-title">Preferences</div>
            <div className="mobile-nav-pref-card">
              {/* Audience Depth */}
              <div className="mobile-pref-row">
                <div className="mobile-pref-label">
                  <Sparkles size={14} className="text-accent" />
                  <span>Audience Depth</span>
                </div>
                <div className="segmented-control">
                  {[
                    { id: 'overview', label: 'Exec' },
                    { id: 'math', label: 'Algo' },
                    { id: 'engineer', label: 'Deep' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`segmented-btn ${audienceMode === m.id ? 'active' : ''}`}
                      onClick={() => onChangeAudienceMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reduced Motion */}
              <div className="mobile-pref-row">
                <div className="mobile-pref-label">
                  <Activity size={14} />
                  <span>Motion Mode</span>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${reducedMotion ? 'btn-primary' : 'btn-outline'}`}
                  onClick={onToggleReducedMotion}
                >
                  {reducedMotion ? 'Step Mode' : 'Animated'}
                </button>
              </div>

              {/* Theme Toggle */}
              <div className="mobile-pref-row">
                <div className="mobile-pref-label">
                  {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                  <span>Display Theme</span>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
