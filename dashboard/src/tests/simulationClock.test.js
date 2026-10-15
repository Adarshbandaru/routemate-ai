import { test } from 'node:test';
import assert from 'node:assert';
import { stepClockTime, detectTriggeredEvents } from '../motion/simulationClock.js';

test('stepClockTime advances time correctly based on dt and speed', () => {
  const result = stepClockTime(10, 0.5, 1, 60);
  assert.strictEqual(result.nextTime, 10.5);
  assert.strictEqual(result.isFinished, false);

  const fastResult = stepClockTime(10, 0.5, 2, 60);
  assert.strictEqual(fastResult.nextTime, 11.0);
  assert.strictEqual(fastResult.isFinished, false);
});

test('stepClockTime clamps at durationSeconds and marks isFinished', () => {
  const result = stepClockTime(59.5, 1.0, 1, 60);
  assert.strictEqual(result.nextTime, 60);
  assert.strictEqual(result.isFinished, true);

  const overshootResult = stepClockTime(58, 2.0, 4, 60);
  assert.strictEqual(overshootResult.nextTime, 60);
  assert.strictEqual(overshootResult.isFinished, true);
});

test('detectTriggeredEvents detects events within time delta interval', () => {
  const events = [
    { id: 'ev-1', time: 5 },
    { id: 'ev-2', time: 10 },
    { id: 'ev-3', time: 15 },
  ];
  const triggeredSet = new Set();

  const batch1 = detectTriggeredEvents(events, 0, 6, triggeredSet);
  assert.strictEqual(batch1.length, 1);
  assert.strictEqual(batch1[0].id, 'ev-1');
  triggeredSet.add('ev-1');

  const batch2 = detectTriggeredEvents(events, 6, 12, triggeredSet);
  assert.strictEqual(batch2.length, 1);
  assert.strictEqual(batch2[0].id, 'ev-2');
  triggeredSet.add('ev-2');

  // Do not re-trigger ev-2
  const batch3 = detectTriggeredEvents(events, 10, 14, triggeredSet);
  assert.strictEqual(batch3.length, 0);
});

test('detectTriggeredEvents triggers boundary events at durationSeconds', () => {
  const events = [
    { id: 'ev-final', time: 60 },
  ];
  const triggeredSet = new Set();

  const triggered = detectTriggeredEvents(events, 59.0, 60.0, triggeredSet);
  assert.strictEqual(triggered.length, 1);
  assert.strictEqual(triggered[0].id, 'ev-final');
});

test('detectTriggeredEvents handles empty or null events gracefully', () => {
  assert.deepStrictEqual(detectTriggeredEvents([], 0, 10, new Set()), []);
  assert.deepStrictEqual(detectTriggeredEvents(null, 0, 10, new Set()), []);
});
