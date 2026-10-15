import L from 'leaflet';

export const GOOGLE_MAPS_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) ||
  'AIzaSyBL1BNctCIsRZg2muY82RSdXn2vLa4CcOA';

export const BASEMAP_OPTIONS = [
  {
    id: 'carto_dark',
    label: 'Dark Mission',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    },
  },
  {
    id: 'google_roadmap',
    label: 'Google Maps',
    url: `https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`,
    options: {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    },
  },
  {
    id: 'google_hybrid',
    label: 'Google Satellite',
    url: `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_API_KEY}`,
    options: {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    },
  },
];

export function createBaseTileLayer(type = 'carto_dark', onError = null) {
  const layerConfig = BASEMAP_OPTIONS.find((b) => b.id === type) || BASEMAP_OPTIONS[0];
  const layer = L.tileLayer(layerConfig.url, layerConfig.options);
  if (onError) {
    layer.on('tileerror', onError);
  }
  return layer;
}
