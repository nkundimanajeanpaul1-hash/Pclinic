import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/repo3';
const CSS = fs.readFileSync(path.join(ROOT, 'dashboard-doctor-parity.css'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'dashboard-doctor-parity.js'), 'utf8');

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

test('batch doctor parity stylesheet covers the shared shell pieces, doctor-style workspace split, and the small vertical quick actions used by the requested dashboards', () => {
  for (const marker of [
    'body.doctor-parity-shell {',
    'body.doctor-parity-shell .content-area {',
    'body.doctor-parity-shell .main-panel,',
    'body.doctor-parity-shell .tbl,',
    'body.doctor-parity-shell .nav,',
    'body.doctor-parity-shell .reception-action-bar {',
    'body.doctor-parity-shell .doctor-parity-workspace {',
    'grid-template-columns: minmax(0, 1fr) 180px;',
    'body.doctor-parity-shell .doctor-parity-main {',
    'body.doctor-parity-shell .doctor-parity-side {',
    'body.doctor-parity-shell .doctor-parity-side .doctor-parity-quick-panel {',
    'body.doctor-parity-shell .doctor-parity-workspace .view {',
    'body.doctor-parity-shell .doctor-parity-quick-panel {',
    'top: 118px;',
    'body.doctor-parity-shell .doctor-parity-quick-grid {',
    'grid-template-columns: 1fr;',
    'body.doctor-parity-shell .doctor-parity-quick-card {',
    'padding: 8px 10px;',
    'body.doctor-parity-shell .doctor-parity-quick-copy {',
    'flex-direction: row;',
    'body.doctor-parity-shell .doctor-parity-hidden-legacy-quick-actions {',
    'body.doctor-parity-shell .doctor-parity-quick-note {',
    'body.doctor-parity-shell .doctor-parity-quick-desc {',
    'display: none !important;',
    'body.doctor-parity-shell .doctor-parity-quick-target {',
    'body.doctor-parity-shell.role-beds .ward-section {',
    'body.doctor-parity-shell.role-cashier .view,',
    'body.doctor-parity-shell.role-finance .view {'
  ]) {
    assert.ok(CSS.includes(marker), `missing shared parity CSS marker: ${marker}`);
  }
});

test('the shared doctor parity script defines visible quick actions and the doctor-style workspace arrangement for all requested roles', () => {
  for (const marker of [
    "if (document.body.classList.contains('role-theater')) return 'theater';",
    "if (document.body.classList.contains('role-pharmacy')) return 'pharmacy';",
    "if (document.body.classList.contains('role-admin')) return 'admin';",
    "if (document.body.classList.contains('role-cashier')) return 'cashier';",
    "if (document.body.classList.contains('role-finance')) return 'finance';",
    "if (document.body.classList.contains('role-inventory')) return 'inventory';",
    "if (document.body.classList.contains('role-hr')) return 'hr';",
    "if (document.body.classList.contains('role-beds')) return 'beds';",
    'const ACTIONS = {',
    'function layoutTargets(role) {',
    'function maybeHideLegacyQuickActions(role) {',
    'function mountWorkspace(role, panel) {',
    'doctorParityWorkspace',
    'doctor-parity-workspace',
    'doctor-parity-main',
    'doctor-parity-side',
    'doctorParityQuickActions',
    'doctor-parity-quick-panel',
    'doctor-parity-quick-grid'
  ]) {
    assert.ok(JS.includes(marker), `missing shared parity JS marker: ${marker}`);
  }
});

test('each requested dashboard loads the shared doctor parity stylesheet, the quick-actions script and the body role class', () => {
  for (const [file, roleClass] of DASHBOARDS) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(html, /dashboard-doctor-parity\.css\?v=20260909_BATCH4WORKSPACE/);
    assert.match(html, /dashboard-doctor-parity\.js\?v=20260909_BATCH4WORKSPACE/);
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
