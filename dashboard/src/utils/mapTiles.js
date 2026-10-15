import L from 'leaflet';

export const BASEMAP_OPTIONS = [
  {
    id: 'esri_light',
    label: 'Warm Canvas',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    options: {
      attribution: '&copy; Esri, DeLorme, NAVTEQ',
      maxZoom: 16,
    },
  },
  {
    id: 'osm_standard',
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    },
  },
  {
    id: 'esri_imagery',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      attribution: '&copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    },
  },
];

export function createBaseTileLayer(type = 'esri_light', onError = null) {
  const layerConfig = BASEMAP_OPTIONS.find((b) => b.id === type) || BASEMAP_OPTIONS[0];
  const layer = L.tileLayer(layerConfig.url, layerConfig.options);

  layer.on('tileerror', (event) => {
    if (onError) {
      onError(event);
    }
  });

  return layer;
}
