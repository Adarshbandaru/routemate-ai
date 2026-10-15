import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tokensPath = path.resolve(__dirname, '../styles/tokens.css');
const tokensContent = fs.readFileSync(tokensPath, 'utf-8');

test('Theme System: tokens.css defines required CSS color tokens for light and dark modes', () => {
  // Light mode tokens
  assert.ok(tokensContent.includes('--color-primary: #176B4D;'), 'Light primary token must exist');
  assert.ok(tokensContent.includes('--bg-primary: #F6F7F2;'), 'Light background token must exist');
  assert.ok(tokensContent.includes('--bg-surface: #FFFFFF;'), 'Light surface token must exist');
  assert.ok(tokensContent.includes('--text-primary: #202820;'), 'Light text primary token must exist');

  // Dark mode tokens
  assert.ok(tokensContent.includes("[data-theme='dark']"), 'Dark theme selector must exist');
  assert.ok(tokensContent.includes('--bg-primary: #0F1010;'), 'Dark background token must exist');
  assert.ok(tokensContent.includes('--bg-surface: #1A1A1A;'), 'Dark surface token must exist');
  assert.ok(tokensContent.includes('--text-primary: #F5F5F5;'), 'Dark text primary token must exist');
  assert.ok(tokensContent.includes('--color-primary: #4BA583;'), 'Dark primary token must exist');
});

test('Theme System: tokens.css includes responsive breakpoints and reduced-motion rules', () => {
  assert.ok(tokensContent.includes('@media (max-width: 480px)'), 'Mobile 480px breakpoint must exist');
  assert.ok(tokensContent.includes('@media (min-width: 768px)'), 'Tablet 768px breakpoint must exist');
  assert.ok(tokensContent.includes('@media (min-width: 1024px)'), 'Desktop 1024px breakpoint must exist');
  assert.ok(tokensContent.includes('@media (prefers-reduced-motion: reduce)'), 'Reduced motion preference must exist');
});

test('Shared Components: Common UI components exist with styles', () => {
  const buttonJsx = fs.readFileSync(path.resolve(__dirname, '../components/common/Button.jsx'), 'utf-8');
  assert.ok(buttonJsx.includes('className={`btn btn-${variant}'), 'Button component must support variants');

  const cardJsx = fs.readFileSync(path.resolve(__dirname, '../components/common/Card.jsx'), 'utf-8');
  assert.ok(cardJsx.includes('className={`card'), 'Card component must support elevation');

  const inputJsx = fs.readFileSync(path.resolve(__dirname, '../components/common/Input.jsx'), 'utf-8');
  assert.ok(inputJsx.includes('className={`input'), 'Input component must render input');
});
