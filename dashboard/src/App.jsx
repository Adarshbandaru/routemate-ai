import { useState, useEffect, useCallback } from 'react';
import AppShell from './components/common/AppShell';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ThemeProvider, useTheme } from './context';
import './styles/tokens.css';
import { RiderHome } from './features/rider';
import {
  DriverConsole,
  DriverAuth,
  DriverDashboard,
  DriverActiveRide,
  DriverEarnings,
  DriverProfile,
} from './features/driver';
import {
  GuidedDemo,
  MatchPlayground,
  BatchAssignment,
  FleetRebalanceView,
  ExperimentExplorer,
  LiveAPI,
  ArchitectureView,
} from './features/research';
import {
  ScheduledBooking,
  RideHistory,
  TripReceipt,
  WalletBalance,
} from './components/phase3';
import { parseHashState, updateUrlHash } from './utils/urlState';
import { checkAPIHealth } from './data';

function AppContent() {
  const [routeState, setRouteState] = useState(() => {
    const rawHash = window?.location?.hash || '';
    if (!rawHash || rawHash === '#' || rawHash === '#/' || rawHash === '#/ride') {
      return { route: 'ride', params: {} };
    }
    return parseHashState(rawHash);
  });
  const [audienceMode, setAudienceMode] = useState(() => localStorage.getItem('routemate-audience') || 'overview');
  const { theme, toggleTheme } = useTheme();
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('routemate-reduced-motion') === 'true');
  const [apiOnline, setApiOnline] = useState(false);

  // Sync hash routing on popstate / hashchange
  useEffect(() => {
    function handleHashChange() {
      const rawHash = window.location.hash;
      if (!rawHash || rawHash === '#' || rawHash === '#/' || rawHash === '#/ride') {
        setRouteState({ route: 'ride', params: {} });
      } else {
        setRouteState(parseHashState(rawHash));
      }
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Audience Mode management
  useEffect(() => {
    document.documentElement.setAttribute('data-audience', audienceMode);
    localStorage.setItem('routemate-audience', audienceMode);
  }, [audienceMode]);

  // Reduced motion preference
  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-motion', String(reducedMotion));
    localStorage.setItem('routemate-reduced-motion', String(reducedMotion));
  }, [reducedMotion]);

  // Check initial backend health
  useEffect(() => {
    const apiBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
    checkAPIHealth(apiBase).then((res) => {
      setApiOnline(Boolean(res?.online));
    });
  }, []);

  const handleNavigate = useCallback((newRoute) => {
    updateUrlHash(newRoute);
    setRouteState({ route: newRoute, params: {} });
  }, []);

  const handleToggleReducedMotion = useCallback(() => {
    setReducedMotion((prev) => !prev);
  }, []);

  const currentRoute = routeState.route;

  return (
    <AppShell
      currentRoute={currentRoute}
      onNavigate={handleNavigate}
      audienceMode={audienceMode}
      onChangeAudienceMode={setAudienceMode}
      theme={theme}
      onToggleTheme={toggleTheme}
      reducedMotion={reducedMotion}
      onToggleReducedMotion={handleToggleReducedMotion}
      apiOnline={apiOnline}
    >
      <ErrorBoundary title={`Error rendering ${currentRoute} page`}>
        {currentRoute === 'ride' && (
          <RiderHome onSwitchToConsole={() => handleNavigate('demo')} />
        )}

        {currentRoute === 'driver' && <DriverConsole />}

        {currentRoute === 'driver/auth' && (
          <DriverAuth onAuthSuccess={() => handleNavigate('driver/dashboard')} />
        )}

        {currentRoute === 'driver/dashboard' && (
          <DriverDashboard
            onNavigate={(sub) => handleNavigate(sub.startsWith('driver') ? sub : `driver/${sub}`)}
          />
        )}

        {currentRoute === 'driver/active-ride' && (
          <DriverActiveRide
            onBackToDashboard={() => handleNavigate('driver/dashboard')}
          />
        )}

        {currentRoute === 'driver/earnings' && (
          <DriverEarnings
            onBack={() => handleNavigate('driver/dashboard')}
          />
        )}

        {currentRoute === 'driver/profile' && (
          <DriverProfile
            onBack={() => handleNavigate('driver/dashboard')}
          />
        )}

        {currentRoute === 'scheduled' && (
          <div style={{ padding: '24px 16px' }}>
            <ScheduledBooking
              onScheduledSuccess={() => handleNavigate('history')}
            />
          </div>
        )}

        {currentRoute === 'history' && (
          <div style={{ padding: '24px 16px' }}>
            <RideHistory
              onSelectBooking={(bId) => handleNavigate(`receipt/${bId}`)}
            />
          </div>
        )}

        {currentRoute === 'receipt' && (
          <div style={{ padding: '24px 16px' }}>
            <TripReceipt
              bookingId={routeState.params.bookingId || 'sample_booking'}
              onClose={() => handleNavigate('history')}
            />
          </div>
        )}

        {currentRoute === 'wallet' && (
          <div style={{ padding: '24px 16px' }}>
            <WalletBalance />
          </div>
        )}

        {currentRoute === 'demo' && (
          <GuidedDemo
            initialPreset={routeState.params.preset || 'lpu_commute'}
            initialStep={parseInt(routeState.params.step, 10) || 0}
            onNavigateTab={handleNavigate}
          />
        )}

        {currentRoute === 'playground' && (
          <MatchPlayground
            initialSeed={parseInt(routeState.params.seed, 10) || 42}
            initialDriver={routeState.params.driver || null}
            audienceMode={audienceMode}
          />
        )}

        {currentRoute === 'batch' && (
          <BatchAssignment
            initialSeed={parseInt(routeState.params.seed, 10) || 99}
            initialMethod={routeState.params.method || 'greedy'}
          />
        )}

        {currentRoute === 'staging' && (
          <FleetRebalanceView
            initialRegime={routeState.params.regime || 'evening_peak'}
          />
        )}

        {currentRoute === 'experiments' && (
          <ExperimentExplorer
            initialExp={routeState.params.exp || '001_baseline'}
          />
        )}

        {currentRoute === 'api' && <LiveAPI />}

        {currentRoute === 'architecture' && <ArchitectureView />}
      </ErrorBoundary>
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
