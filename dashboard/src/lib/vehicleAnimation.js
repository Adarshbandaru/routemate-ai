/**
 * Vehicle Route Animation Utility for Rapido/Uber/Ola interface.
 * Implements smooth 60 FPS requestAnimationFrame trajectory interpolation.
 */

/**
 * Calculates initial compass bearing from [lat1, lng1] to [lat2, lng2] in degrees [0, 360).
 */
export function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lng2 - lng1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

/**
 * Calculates Haversine distance in km between two lat/lng pairs.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371.0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Precomputes cumulative distances along a polyline [[lat, lng], ...].
 */
export function precomputePolyline(polyline) {
  if (!polyline || polyline.length === 0) {
    return { segments: [], totalDistanceKm: 0 };
  }
  if (polyline.length === 1) {
    return {
      segments: [{ lat1: polyline[0][0], lng1: polyline[0][1], lat2: polyline[0][0], lng2: polyline[0][1], lengthKm: 0, cumStartKm: 0 }],
      totalDistanceKm: 0,
    };
  }

  let totalKm = 0;
  const segments = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    const [lat1, lng1] = polyline[i];
    const [lat2, lng2] = polyline[i + 1];
    const lengthKm = haversineKm(lat1, lng1, lat2, lng2);
    segments.push({
      lat1,
      lng1,
      lat2,
      lng2,
      lengthKm,
      cumStartKm: totalKm,
    });
    totalKm += lengthKm;
  }

  return { segments, totalDistanceKm: totalKm };
}

/**
 * Interpolates coordinate and bearing along precomputed polyline for progress t in [0, 1].
 */
export function interpolateAlongPolyline(profile, progress) {
  const clampedT = Math.max(0, Math.min(1, progress));
  const { segments, totalDistanceKm } = profile;

  if (segments.length === 0) return { lat: 0, lng: 0, bearing: 0 };
  if (totalDistanceKm === 0 || clampedT === 0) {
    const s = segments[0];
    return { lat: s.lat1, lng: s.lng1, bearing: calculateBearing(s.lat1, s.lng1, s.lat2, s.lng2) };
  }
  if (clampedT >= 1) {
    const s = segments[segments.length - 1];
    return { lat: s.lat2, lng: s.lng2, bearing: calculateBearing(s.lat1, s.lng1, s.lat2, s.lng2) };
  }

  const targetKm = clampedT * totalDistanceKm;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segEndKm = seg.cumStartKm + seg.lengthKm;

    if (targetKm <= segEndKm || i === segments.length - 1) {
      const segT = seg.lengthKm > 0 ? (targetKm - seg.cumStartKm) / seg.lengthKm : 0;
      const lat = seg.lat1 + (seg.lat2 - seg.lat1) * segT;
      const lng = seg.lng1 + (seg.lng2 - seg.lng1) * segT;
      const bearing = calculateBearing(seg.lat1, seg.lng1, seg.lat2, seg.lng2);
      return { lat, lng, bearing };
    }
  }

  const last = segments[segments.length - 1];
  return { lat: last.lat2, lng: last.lng2, bearing: 0 };
}
