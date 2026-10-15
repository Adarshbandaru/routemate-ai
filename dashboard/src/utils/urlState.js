/**
 * URL Hash and State Synchronization utility.
 * Manages GitHub Pages-safe hash routing and deep-link parameter encoding/decoding.
 * Format: #/<route>?param1=val1&param2=val2
 */

export const VALID_ROUTES = [
  'ride',
  'demo',
  'playground',
  'batch',
  'staging',
  'experiments',
  'api',
  'architecture',
];

export function parseHashState(hashString = window?.location?.hash || '') {
  const clean = hashString.startsWith('#') ? hashString.slice(1) : hashString;
  const [routePart, queryPart] = clean.split('?');

  const routeName = (routePart || '').replace(/^\//, '').toLowerCase();
  const route = VALID_ROUTES.includes(routeName) ? routeName : 'demo';

  const params = {};
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    for (const [key, val] of searchParams.entries()) {
      params[key] = val;
    }
  }

  return { route, params };
}

export function buildHashString(route, params = {}) {
  const safeRoute = VALID_ROUTES.includes(route) ? route : 'demo';
  const searchParams = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      searchParams.set(k, String(v));
    }
  }

  const query = searchParams.toString();
  return query ? `#/${safeRoute}?${query}` : `#/${safeRoute}`;
}

export function updateUrlHash(route, params = {}, replace = false) {
  const hash = buildHashString(route, params);
  if (typeof window !== 'undefined' && window.location) {
    if (replace) {
      window.history.replaceState(null, '', hash);
    } else {
      window.location.hash = hash;
    }
  }
  return hash;
}
