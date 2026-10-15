import { test } from 'node:test';
import assert from 'node:assert';
import { parseHashState, buildHashString } from '../utils/urlState.js';

test('parseHashState defaults to demo route when empty', () => {
  const result = parseHashState('');
  assert.strictEqual(result.route, 'demo');
  assert.deepStrictEqual(result.params, {});
});

test('parseHashState parses route and query parameters correctly', () => {
  const hash = '#/batch?solver=optimal&seed=42&mode=engineer';
  const result = parseHashState(hash);
  assert.strictEqual(result.route, 'batch');
  assert.strictEqual(result.params.solver, 'optimal');
  assert.strictEqual(result.params.seed, '42');
  assert.strictEqual(result.params.mode, 'engineer');
});

test('parseHashState handles leading slashes and invalid routes gracefully', () => {
  const hash = '#/invalid_path?preset=rush_hour';
  const result = parseHashState(hash);
  assert.strictEqual(result.route, 'demo'); // fallback to demo
  assert.strictEqual(result.params.preset, 'rush_hour');
});

test('buildHashString encodes valid routes and parameters', () => {
  const hash = buildHashString('playground', { seed: 101, candidate: 'driver-42-001' });
  assert.strictEqual(hash, '#/playground?seed=101&candidate=driver-42-001');
});

test('buildHashString omits empty or null parameters', () => {
  const hash = buildHashString('experiments', { exp: '008', filter: null, query: '' });
  assert.strictEqual(hash, '#/experiments?exp=008');
});
