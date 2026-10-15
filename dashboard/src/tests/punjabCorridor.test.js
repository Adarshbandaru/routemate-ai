import { test } from 'node:test';
import assert from 'node:assert';
import {
  PUNJAB_ANCHOR,
  DEMO_RIDE_PRESETS,
  PUNJAB_TRANSIT_ZONES,
  coordToLL,
  runFleetRebalancingSimulation,
} from '../data.js';

test('PUNJAB_ANCHOR is centered on LPU Phagwara', () => {
  assert.strictEqual(PUNJAB_ANCHOR.latitude, 31.2536);
  assert.strictEqual(PUNJAB_ANCHOR.longitude, 75.7037);
});

test('DEMO_RIDE_PRESETS includes all 4 Punjab regional presets', () => {
  assert.strictEqual(DEMO_RIDE_PRESETS.length, 4);

  const ids = DEMO_RIDE_PRESETS.map((p) => p.id);
  assert(ids.includes('lpu_commute'), 'Missing lpu_commute preset');
  assert(ids.includes('campus_shuttle'), 'Missing campus_shuttle preset');
  assert(ids.includes('industrial_delivery'), 'Missing industrial_delivery preset');
  assert(ids.includes('phagwara_gridlock'), 'Missing phagwara_gridlock preset');

  // Verify coordinates stay within the Punjab corridor bounds [30.5 - 31.8 N, 75.0 - 76.5 E]
  for (const preset of DEMO_RIDE_PRESETS) {
    const s = preset.start;
    const d = preset.destination;
    assert(s.latitude >= 30.5 && s.latitude <= 31.8, `Start lat out of range for ${preset.id}`);
    assert(s.longitude >= 75.0 && s.longitude <= 76.5, `Start lon out of range for ${preset.id}`);
    assert(d.latitude >= 30.5 && d.latitude <= 31.8, `Dest lat out of range for ${preset.id}`);
    assert(d.longitude >= 75.0 && d.longitude <= 76.5, `Dest lon out of range for ${preset.id}`);
  }
});

test('coordToLL correctly maps coordinates to Punjab corridor', () => {
  // Absolute coordinate passes through unchanged
  const absCoord = { latitude: 31.3260, longitude: 75.5762 };
  const mappedAbs = coordToLL(absCoord);
  assert.strictEqual(mappedAbs[0], 31.3260);
  assert.strictEqual(mappedAbs[1], 75.5762);

  // Offset coordinate maps relative to PUNJAB_ANCHOR
  const offsetCoord = { latitude: 0.01, longitude: 0.02 };
  const mappedOffset = coordToLL(offsetCoord);
  assert(Math.abs(mappedOffset[0] - (31.2536 + 0.01)) < 1e-4);
  assert(Math.abs(mappedOffset[1] - (75.7037 + 0.02)) < 1e-4);
});

test('PUNJAB_TRANSIT_ZONES provides valid fleet rebalancing simulation', () => {
  assert.strictEqual(PUNJAB_TRANSIT_ZONES.length, 5);
  const sim = runFleetRebalancingSimulation(25, 'evening_peak');
  assert.strictEqual(sim.zoneStats.length, 5);
  assert(sim.directives.length > 0, 'Directives should be generated');
  assert(sim.totalVkt > 0, 'Total VKT should be positive');
});
