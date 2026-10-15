import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.resolve(__dirname, '../index.css');
const cssContent = fs.readFileSync(cssPath, 'utf-8');

test('Driver Console Dark Mode: index.css does not use hardcoded white on driver containers', () => {
  // Ensure .chat-modal-card and .chat-modal-header do not have hardcoded #FFFFFF background
  const chatCardMatch = cssContent.match(/\.chat-modal-card\s*\{[^}]*\}/s);
  assert.ok(chatCardMatch, '.chat-modal-card rule must exist');
  assert.ok(!chatCardMatch[0].includes('background: #FFFFFF'), '.chat-modal-card must not use hardcoded #FFFFFF background');
  assert.ok(chatCardMatch[0].includes('var(--bg-card)'), '.chat-modal-card must use var(--bg-card)');

  const chatHeaderMatch = cssContent.match(/\.chat-modal-header\s*\{[^}]*\}/s);
  assert.ok(chatHeaderMatch, '.chat-modal-header rule must exist');
  assert.ok(!chatHeaderMatch[0].includes('background: #FFFFFF'), '.chat-modal-header must not use hardcoded #FFFFFF background');
  assert.ok(chatHeaderMatch[0].includes('var(--bg-surface)'), '.chat-modal-header must use var(--bg-surface)');

  const waitingBoxMatch = cssContent.match(/\.driver-offline-notice,\s*\.driver-waiting-box\s*\{[^}]*\}/s);
  assert.ok(waitingBoxMatch, '.driver-waiting-box rule must exist');
  assert.ok(!waitingBoxMatch[0].includes('background: #FFFFFF'), '.driver-waiting-box must not use hardcoded #FFFFFF background');
  assert.ok(waitingBoxMatch[0].includes('var(--bg-card)'), '.driver-waiting-box must use var(--bg-card)');

  const driverHeaderMatch = cssContent.match(/\.driver-header-card\s*\{[^}]*\}/s);
  assert.ok(driverHeaderMatch, '.driver-header-card rule must exist');
  assert.ok(!driverHeaderMatch[0].includes('background: #FFFFFF'), '.driver-header-card must not use hardcoded #FFFFFF background');
  assert.ok(driverHeaderMatch[0].includes('var(--bg-surface)'), '.driver-header-card must use var(--bg-surface)');
});

test('Driver Console Dark Mode: map dark tile filter and control overrides are present', () => {
  assert.ok(cssContent.includes('.driver-map-canvas .leaflet-tile-pane'), 'Dark tile filter rule must exist for driver map');
  assert.ok(cssContent.includes('.driver-map-canvas .leaflet-control-zoom a'), 'Dark zoom controls must be styled');
  assert.ok(cssContent.includes('.driver-map-canvas .leaflet-control-attribution'), 'Dark map attribution must be styled');
});

test('Driver Console Dark Mode: utility classes and button helpers are properly defined', () => {
  assert.ok(cssContent.includes('.text-primary'), '.text-primary utility must exist');
  assert.ok(cssContent.includes('.text-secondary'), '.text-secondary utility must exist');
  assert.ok(cssContent.includes('.text-muted'), '.text-muted utility must exist');
  assert.ok(cssContent.includes('.text-accent'), '.text-accent utility must exist');
  assert.ok(cssContent.includes('.chat-close-btn'), '.chat-close-btn must exist');
  assert.ok(cssContent.includes('.profile-modal-card'), '.profile-modal-card rule must exist');
  assert.ok(cssContent.includes('.profile-field .field-lbl'), '.field-lbl must be styled');
  assert.ok(cssContent.includes('.profile-field .field-val'), '.field-val must be styled');
});
