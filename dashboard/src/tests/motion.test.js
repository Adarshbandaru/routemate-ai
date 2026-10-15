import { test } from 'node:test';
import assert from 'node:assert';
import {
  haversineDistanceKm,
  computeBearingDegrees,
  shortestArcInterpolate,
  precomputePolylineProfile,
  interpolateAlongProfile,
} from '../motion/vehicleMotionEngine.js';

test('haversineDistanceKm calculates accurate distance', () => {
  // SF Market St points ~ 1.1 km apart
  const p1 = [37.7749, -122.4194];
  const p2 = [37.7849, -122.4094];
  const dist = haversineDistanceKm(p1, p2);
  assert(dist > 1.3 && dist < 1.6, `Distance should be ~1.42 km, got ${dist}`);
});

test('haversineDistanceKm returns 0 for identical points', () => {
  const p = [37.7749, -122.4194];
  assert.strictEqual(haversineDistanceKm(p, p), 0);
});

test('computeBearingDegrees returns expected compass angles', () => {
  // Pure North
  const p1 = [37.0, -122.0];
  const pNorth = [38.0, -122.0];
  const bNorth = computeBearingDegrees(p1, pNorth);
  assert(Math.abs(bNorth - 0) < 1e-4 || Math.abs(bNorth - 360) < 1e-4);

  // Pure East
  const pEast = [37.0, -121.0];
  const bEast = computeBearingDegrees(p1, pEast);
  assert(Math.abs(bEast - 90) < 1.0);
});

test('shortestArcInterpolate avoids full 360 degree spin', () => {
  // From 350 deg to 10 deg: shortest arc is +20 deg clockwise, not -340 deg counterclockwise
  const current = 350;
  const target = 10;
  const interpolated = shortestArcInterpolate(current, target, 0.5);
  // Halfway through +20 deg should be 360 or 0 deg
  assert(Math.abs(interpolated - 0) < 1e-4 || Math.abs(interpolated - 360) < 1e-4);
});

test('precomputePolylineProfile caches distances and cumulative lengths', () => {
  const polyline = [
    [37.7749, -122.4194],
    [37.7780, -122.4150],
    [37.7820, -122.4100],
  ];
  const profile = precomputePolylineProfile(polyline);
  assert.strictEqual(profile.points.length, 3);
  assert.strictEqual(profile.cumulativeKm[0], 0);
  assert(profile.totalDistanceKm > 0.5);
  assert.strictEqual(profile.cumulativeKm[profile.cumulativeKm.length - 1], profile.totalDistanceKm);
});

test('interpolateAlongProfile returns exact endpoints at t=0 and t=1', () => {
  const polyline = [
    [37.7749, -122.4194],
    [37.7780, -122.4150],
    [37.7820, -122.4100],
  ];
  const profile = precomputePolylineProfile(polyline);

  const start = interpolateAlongProfile(profile, 0);
  assert.strictEqual(start.lat, polyline[0][0]);
  assert.strictEqual(start.lng, polyline[0][1]);

  const end = interpolateAlongProfile(profile, 1.0);
  assert(Math.abs(end.lat - polyline[2][0]) < 1e-6);
  assert(Math.abs(end.lng - polyline[2][1]) < 1e-6);

  const mid = interpolateAlongProfile(profile, 0.5);
  assert(mid.lat > polyline[0][0] && mid.lat < polyline[2][0]);
});
