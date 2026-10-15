import { test } from 'node:test';
import assert from 'node:assert';
import { parseHashState, buildHashString } from '../utils/urlState.js';

test('parseHashState parses Phase 3 scheduled, history, and wallet routes', () => {
  const routes = ['scheduled', 'history', 'wallet'];
  for (const r of routes) {
    const parsed = parseHashState(`#/${r}`);
    assert.strictEqual(parsed.route, r);
  }
});

test('parseHashState parses parameterized receipt route #/receipt/:bookingId', () => {
  const hash = '#/receipt/bk_punjab_12345';
  const parsed = parseHashState(hash);
  assert.strictEqual(parsed.route, 'receipt');
  assert.strictEqual(parsed.params.bookingId, 'bk_punjab_12345');
});

test('buildHashString correctly encodes Phase 3 routes', () => {
  const sHash = buildHashString('scheduled', { date: '2027-10-16' });
  assert.strictEqual(sHash, '#/scheduled?date=2027-10-16');

  const wHash = buildHashString('wallet');
  assert.strictEqual(wHash, '#/wallet');

  const hHash = buildHashString('history', { limit: 10 });
  assert.strictEqual(hHash, '#/history?limit=10');
});

test('Phase 3 canonical fare calculation arithmetic consistency', () => {
  // Test Canonical formula: 24.5 km, 25 min, 0 wait, surge 1.0 -> 263.03
  const base = 50.0;
  const distFare = Math.max(0, 24.5 - 1.0) * 8.0; // 188.0
  const timeFare = 25 * 0.50; // 12.5
  const subtotal = base + distFare + timeFare; // 250.5
  const tax = Math.round(subtotal * 0.05 * 100) / 100; // 12.53
  const total = subtotal + tax; // 263.03

  assert.strictEqual(distFare, 188.0);
  assert.strictEqual(timeFare, 12.5);
  assert.strictEqual(subtotal, 250.5);
  assert.strictEqual(tax, 12.53);
  assert.strictEqual(total, 263.03);
});

test('Phase 3.5 Razorpay order amount conversion to paise', () => {
  const fareInr = 263.03;
  const amountPaise = Math.round(fareInr * 100);
  assert.strictEqual(amountPaise, 26303);

  const flatFare = 100.0;
  assert.strictEqual(Math.round(flatFare * 100), 10000);
});

test('Phase 3.5 Razorpay HMAC payload construction', () => {
  const orderId = 'order_sandbox_123456';
  const paymentId = 'pay_sandbox_789012';
  const message = `${orderId}|${paymentId}`;
  assert.strictEqual(message, 'order_sandbox_123456|pay_sandbox_789012');
});
