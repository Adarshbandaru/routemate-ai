import { useState, useEffect, useCallback } from 'react';
import AppShell from './components/common/AppShell';
import ErrorBoundary from './components/common/ErrorBoundary';
import RapidoHomeScreen from './components/RapidoHomeScreen';
import GuidedDemo from './components/GuidedDemo';
import MatchPlayground from './components/MatchPlayground';
import BatchAssignment from './components/BatchAssignment';
import FleetRebalanceView from './components/FleetRebalanceView';
import ExperimentExplorer from './components/ExperimentExplorer';
import LiveAPI from './components/LiveAPI';
import ArchitectureView from './components/ArchitectureView';
import { parseHashState, updateUrlHash } from './utils/urlState';
import { checkAPIHealth } from './data';

export default function App() {
  const [routeState, setRouteState] = useState(() => {
    const rawHash = window?.location?.hash || '';
    if (!rawHash || rawHash === '#' || rawHash === '#/' || rawHash === '#/ride') {
      return { route: 'ride', params: {} };
    }
    return parseHashState(rawHash);
  });
  const [audienceMode, setAudienceMode] = useState(() => localStorage.getItem('routemate-audience') || 'overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('routemate-theme') || 'dark');
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

  // Theme management
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('routemate-theme', theme);
  }, [theme]);

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
    checkAPIHealth('http://127.0.0.1:8000').then((res) => {
      setApiOnline(Boolean(res?.online));
    });
  }, []);

  const handleNavigate = useCallback((newRoute) => {
    updateUrlHash(newRoute);
    setRouteState({ route: newRoute, params: {} });
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleToggleReducedMotion = useCallback(() => {
    setReducedMotion((prev) => !prev);
  }, []);

  const currentRoute = routeState.route;

  if (currentRoute === 'ride') {
    return (
      <ErrorBoundary title="Error rendering Rapido interface">
        <RapidoHomeScreen onSwitchToConsole={() => handleNavigate('demo')} />
      </ErrorBoundary>
    );
  }

  return (
    <AppShell
      currentRoute={currentRoute}
      onNavigate={handleNavigate}
      audienceMode={audienceMode}
      onChangeAudienceMode={setAudienceMode}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      reducedMotion={reducedMotion}
      onToggleReducedMotion={handleToggleReducedMotion}
      apiOnline={apiOnline}
    >
      <ErrorBoundary title={`Error rendering ${currentRoute} page`}>
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
