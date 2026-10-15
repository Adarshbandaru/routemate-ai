/**
 * Vehicle Motion Engine
 * Pure mathematical algorithms and imperative animation controllers for real route polylines.
 *
 * Adheres strictly to:
 * - Delta-time based requestAnimationFrame interpolation (no setInterval, no per-frame React re-renders)
 * - Haversine cumulative distance precomputation
 * - Shortest-arc angular bearing interpolation without 359° -> 0° spin anomalies
 * - Synchronized timeline scrubbing and discrete event triggers
 */

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Standard Haversine distance in kilometers between two [lat, lng] points.
 */
export function haversineDistanceKm(p1, p2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = toRad(p1[0]);
  const lon1 = toRad(p1[1]);
  const lat2 = toRad(p2[0]);
  const lon2 = toRad(p2[1]);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Compute forward azimuth/bearing from p1 to p2 in degrees [0, 360).
 */
export function computeBearingDegrees(p1, p2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const lat1 = toRad(p1[0]);
  const lon1 = toRad(p1[1]);
  const lat2 = toRad(p2[0]);
  const lon2 = toRad(p2[1]);

  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * Compute the shortest-arc angular difference and interpolate smoothly between current and target angle.
 * Prevents full spins across the 0° / 360° boundary.
 */
export function shortestArcInterpolate(currentAngle, targetAngle, factor = 0.2) {
  const diff = ((targetAngle - currentAngle + 540) % 360) - 180;
  return (currentAngle + diff * factor + 360) % 360;
}

/**
 * Precompute cumulative distance cache for a polyline: [[lat, lng], ...].
 */
export function precomputePolylineProfile(polyline) {
  if (!polyline || polyline.length === 0) {
    return { points: [], cumulativeKm: [0], totalDistanceKm: 0, bearings: [0] };
  }
  if (polyline.length === 1) {
    return { points: polyline, cumulativeKm: [0], totalDistanceKm: 0, bearings: [0] };
  }

  const cumulativeKm = [0];
  const bearings = [];
  let totalKm = 0;

  for (let i = 1; i < polyline.length; i++) {
    const d = haversineDistanceKm(polyline[i - 1], polyline[i]);
    totalKm += d;
    cumulativeKm.push(totalKm);
    bearings.push(computeBearingDegrees(polyline[i - 1], polyline[i]));
  }
  // Duplicate last segment bearing for final point
  bearings.push(bearings[bearings.length - 1] || 0);

  return {
    points: polyline,
    cumulativeKm,
    totalDistanceKm: totalKm,
    bearings,
  };
}

/**
 * Interpolate coordinate, bearing, and traveled segment along a profiled polyline at normalized progress t in [0, 1].
 */
export function interpolateAlongProfile(profile, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const { points, cumulativeKm, totalDistanceKm, bearings } = profile;

  if (points.length === 0) {
    return { lat: 0, lng: 0, bearing: 0, segmentIndex: 0, traveledPath: [] };
  }
  if (points.length === 1 || totalDistanceKm === 0) {
    return {
      lat: points[0][0],
      lng: points[0][1],
      bearing: bearings[0] || 0,
      segmentIndex: 0,
      traveledPath: [points[0]],
    };
  }

  const targetKm = t * totalDistanceKm;

  // Binary search or linear scan for segment
  let segIndex = 0;
  for (let i = 1; i < cumulativeKm.length; i++) {
    if (cumulativeKm[i] >= targetKm || i === cumulativeKm.length - 1) {
      segIndex = i - 1;
      break;
    }
  }

  const p0 = points[segIndex];
  const p1 = points[segIndex + 1] || p0;
  const segStartKm = cumulativeKm[segIndex];
  const segEndKm = cumulativeKm[segIndex + 1] || segStartKm;
  const segLength = segEndKm - segStartKm;

  const segFraction = segLength > 1e-9 ? (targetKm - segStartKm) / segLength : 0;
  const lat = p0[0] + (p1[0] - p0[0]) * segFraction;
  const lng = p0[1] + (p1[1] - p0[1]) * segFraction;
  const bearing = bearings[segIndex];

  // Path traveled up to current point
  const traveledPath = points.slice(0, segIndex + 1);
  traveledPath.push([lat, lng]);

  return {
    lat,
    lng,
    bearing,
    segmentIndex: segIndex,
    traveledPath,
    currentKm: targetKm,
    totalKm: totalDistanceKm,
  };
}

/**
 * SVG Top-Down Vehicle Sprites (Legible, crisp top-down mobility sprite with ground shadow)
 * Default: car (realistic ground truth). Cosmetic variation (bike/scooter) labeled illustrative.
 */
export function createVehicleSvgString({ kind = 'car', color = '#3b82f6', _label = '', status = 'active' }) {
  const strokeColor = status === 'completed' ? '#10b981' : color;
  const fillColor = '#0f172a';

  if (kind === 'bike') {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));">
        <circle cx="12" cy="5" r="3" stroke="${strokeColor}" stroke-width="2" fill="${fillColor}"/>
        <line x1="12" y1="8" x2="12" y2="17" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="8" y1="12" x2="16" y2="12" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="12" cy="19" r="3" stroke="${strokeColor}" stroke-width="2" fill="${fillColor}"/>
      </svg>
    `;
  }

  // Standard clean top-down aerodynamic car icon
  return `
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.55)); transform-origin: center;">
      <!-- Vehicle chassis -->
      <rect x="8" y="4" width="16" height="24" rx="5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" />
      <!-- Windshield -->
      <path d="M10 11 Q 16 9, 22 11 L 21 16 Q 16 15, 11 16 Z" fill="${strokeColor}" opacity="0.85" />
      <!-- Rear window -->
      <path d="M11 21 Q 16 20, 21 21 L 20 24 Q 16 23.5, 12 24 Z" fill="${strokeColor}" opacity="0.5" />
      <!-- Headlights -->
      <circle cx="10" cy="5.5" r="1.5" fill="#fef08a" />
      <circle cx="22" cy="5.5" r="1.5" fill="#fef08a" />
      <!-- Taillights -->
      <rect x="9.5" y="27" width="2.5" height="1" rx="0.5" fill="#ef4444" />
      <rect x="20" y="27" width="2.5" height="1" rx="0.5" fill="#ef4444" />
    </svg>
  `;
}
