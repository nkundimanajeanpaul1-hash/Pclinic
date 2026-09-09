import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/repo3';
const CSS = fs.readFileSync(path.join(ROOT, 'dashboard-doctor-parity.css'), 'utf8');

const DASHBOARDS = [
  ['theater-dashboard.html', 'role-theater'],
  ['pharmacy-dashboard.html', 'role-pharmacy'],
  ['admin-dashboard.html', 'role-admin'],
  ['cashier-dashboard.html', 'role-cashier'],
  ['Finance-dashboard.html', 'role-finance'],
  ['inventory-dashboard.html', 'role-inventory'],
  ['hr-dashboard.html', 'role-hr'],
  ['beds-dashboard.html', 'role-beds']
];

test('batch doctor parity stylesheet covers the shared shell pieces used by the requested dashboards', () => {
  for (const marker of [
    'body.doctor-parity-shell {',
    'body.doctor-parity-shell .content-area {',
    'body.doctor-parity-shell .main-panel,',
    'body.doctor-parity-shell .tbl,',
    'body.doctor-parity-shell .nav,',
    'body.doctor-parity-shell .reception-action-bar {',
    'body.doctor-parity-shell.role-beds .ward-section {',
    'body.doctor-parity-shell.role-cashier .view,',
    'body.doctor-parity-shell.role-finance .view {'
  ]) {
    assert.ok(CSS.includes(marker), `missing shared parity CSS marker: ${marker}`);
  }
});

test('each requested dashboard loads the shared doctor parity stylesheet and body role class', () => {
  for (const [file, roleClass] of DASHBOARDS) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(html, /dashboard-doctor-parity\.css\?v=20260909_BATCH1/);
    assert.match(html, new RegExp(`<body class="doctor-parity-shell ${roleClass}">`));
  }
});

test('finance dashboard wording no longer carries copied doctor labels in the visible shell', () => {
  const finance = fs.readFileSync(path.join(ROOT, 'Finance-dashboard.html'), 'utf8');
  assert.match(finance, /Loading finance dashboard…/);
  assert.match(finance, /<span class="appsub">Finance<\/span>/);
  assert.doesNotMatch(finance, /Loading doctor dashboard…/);
  assert.doesNotMatch(finance, /<span class="appsub">Doctor<\/span>/);
});
