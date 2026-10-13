'use strict';

/*
 * tests/imaging-results-security.test.mjs
 *
 * Guards for the 2026-10-13 imaging pass over imaging-results.html and the
 * modules that page loads (pclinic-file.js identification bar, pclinic-radiology.js
 * feeds, auth-guard.js portal map, pclinic-dicom-viewer.js).
 *
 * Most of these are source-text guards because the defect is a string that must
 * not come back (an escaper that does not escape quotes, a hardcoded insurance, a
 * catch that says nothing). One test is behavioural: the radiology feed keeps a
 * per-stream error book, which is driven through a fake Firestore in a vm.
 *
 * Run:  node --test --test-force-exit tests/imaging-results-security.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');
const FILE = read('pclinic-file.js');
const PAGE = read('imaging-results.html');
const VIEWER = read('pclinic-dicom-viewer.js');
const GUARD = read('auth-guard.js');

function fnBody(src, name) {
  const at = src.search(new RegExp('function ' + name + '\\s*\\('));
  assert.ok(at !== -1, name + ' is missing');
  return src.slice(at, at + 4000);
}

/* ── the shared identification bar (pclinic-file.js) ─────────────── */

test('attribute values in the identification bar are escaped for quote context', () => {
  assert.match(FILE, /function escA\(v\)/, 'an attribute-safe escaper must exist');
  assert.equal((FILE.match(/="' \+ esc\(/g) || []).length, 0,
    'esc() does not escape quotes — it must never be used inside "…"');
  assert.ok((FILE.match(/="' \+ escA\(/g) || []).length >= 40,
    'every interpolated attribute value goes through escA');
  assert.match(FILE, /id="ocSearchFamily" placeholder="Family name\.\.\." value="' \+ escA\(name\)/);
  assert.match(FILE, /id="ocSearchMrn" placeholder="MRN\.\.\." value="' \+ escA\(mrn\)/);
});

test('escA escapes both quote characters, which is what makes it safe in a value', () => {
  const m = FILE.match(/function escA\(v\)\s*\{[\s\S]*?\}\s*\n/);
  assert.ok(m, 'escA must be a single self-contained helper');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(m[0] + '\nthis.escA = escA;', sandbox);
  assert.equal(sandbox.escA('a"b'), 'a&quot;b');
  assert.equal(sandbox.escA("a'b"), 'a&#39;b');
  assert.equal(sandbox.escA('a<b>&c'), 'a&lt;b&gt;&amp;c');
  assert.equal(sandbox.escA(null), '');
});

test('the signed-in staff name in the top bar is escaped before it becomes markup', () => {
  assert.match(FILE, /👨‍⚕️ ' \+ esc\(\(\(window\.currentStaff && window\.currentStaff\.name\)/,
    'a staff record is attacker-writable input like any other');
});

test('the bar states the patient record instead of inventing an insurance or a district', () => {
  assert.doesNotMatch(FILE, /id="ocInsurance"><option>RSSB \/ RAMA</, 'no fabricated insurance');
  assert.doesNotMatch(FILE, /id="ocDistrict"><option>NYARUGENGE</, 'no fabricated district');
  assert.match(FILE, /var insRaw = \(!isCleared && p\.insurance && typeof p\.insurance === 'object'\)/,
    'insurance may be an object with a provider field');
  assert.match(FILE, /— not recorded —/);
});

test('logout ends the Firebase session instead of only navigating away', () => {
  const body = fnBody(FILE, 'confirmLogout');
  assert.match(body, /window\.pcLogout\(\{ confirm: false \}\)/, 'the shared secure logout (sign-out + cache wipe) is used');
  assert.match(body, /firebaseAuthFunctions\.signOut\(window\.firebaseAuth\)/, 'and the fallback still signs the session out');
});

test('the alerts button admits it is reading this browser\'s cache', () => {
  assert.doesNotMatch(FILE, /Live Common Server Alerts/, 'cached numbers must not be sold as the server ledger');
  assert.match(FILE, /not the live server list/);
});

/* ── portal map (auth-guard.js) + page boot ─────────────────────── */

test('imaging-results is a known portal, so nothing renders before the session is checked', () => {
  const roles = PAGE.match(/window\.requireAuth\(\[([^\]]*)\]/);
  assert.ok(roles, 'the page must gate its boot on requireAuth');
  const wanted = roles[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  const map = GUARD.match(/'imaging-results\.html': \[([^\]]*)\]/);
  assert.ok(map, 'auth-guard must know imaging-results.html or it never cloaks it pre-render');
  assert.deepEqual(map[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort(), [...wanted].sort(),
    'the pre-render role list must match the page itself');
});

test('a workstation that cannot follow the patient is announced, not swallowed', () => {
  const at = PAGE.indexOf('function syncWorkstationPatient');
  assert.ok(at > -1);
  const body = PAGE.slice(at, PAGE.indexOf('\n', at));
  assert.match(body, /catch\(e\)\{console\.error/, 'the failure is logged');
  assert.match(body, /notify\('The workstation could not switch to this patient/,
    'and the doctor is told the images may still belong to the previous patient');
});

/* ── radiology feeds (pclinic-radiology.js) ─────────────────────── */

function loadRadiology() {
  const feeds = {};
  const win = {
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    currentStaff: { name: 'Dr Test', role: 'radio' },
    firebaseReady: true, firebaseDB: { name: 'demo-pclinic' },
  };
  win.window = win;
  win.firebaseFunctions = {
    collection: (db, name) => ({ name }),
    query: (ref) => ref,
    where: () => ({}),
    onSnapshot: (ref, next, error) => { feeds[ref.name] = { next, error }; return () => {}; },
  };
  const sandbox = { window: win, console, Promise, setTimeout, clearTimeout, Object, Array, String, Number, Boolean, RegExp, Error, JSON, Math, Date, CustomEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('pclinic-radiology.js'), sandbox, { filename: 'pclinic-radiology.js' });
  return { api: win.pcRadiology, feeds };
}

test('one failing radiology feed stays reported until that feed itself recovers', async () => {
  const { api, feeds } = loadRadiology();
  let last = null;
  api.subscribe((snapshot) => { last = snapshot; });
  await api.init({ staff: { name: 'Dr Test', role: 'radio' } });
  for (const name of ['orders', 'radiologyReports', 'radiologyAddenda', 'criticalAlerts']) {
    assert.ok(feeds[name], name + ' feed must be subscribed');
  }

  // A role that may read reports but not critical alerts: one feed dies, the rest are fine.
  feeds.criticalAlerts.error({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
  assert.ok(last.error, 'the failure must reach the page');
  assert.match(String(last.error.message), /radiology alerts feed/, 'the message names the feed that failed');
  assert.equal(String(last.error.code), 'permission-denied');

  // Another feed delivering rows must not make the broken feed look healthy again.
  feeds.radiologyReports.next({ forEach: (cb) => cb({ id: 'r1', data: () => ({ status: 'final', patientId: '1003' }) }) });
  assert.ok(last.error, 'a healthy feed must not clear another feed\'s error');
  assert.match(String(last.error.message), /radiology alerts feed/);
  assert.equal(last.reports.length, 1, 'the working feed still renders');

  feeds.criticalAlerts.next({ forEach: () => {} });
  assert.equal(last.error, null, 'only the failing feed\'s own recovery clears it');
});

/* ── the workstation viewer ─────────────────────────────────────── */

test('a DICOM file belonging to another patient is not attached without asking', () => {
  assert.match(VIEWER, /function checkUploadIdentity\(files\)/);
  assert.match(VIEWER, /checkUploadIdentity\(files\)\.then\(function \(proceed\) \{[\s\S]{0,300}startUpload\(files\)/,
    'the identity gate runs before any byte is uploaded');
  assert.match(VIEWER, /x00100020/, 'the file\'s own Patient ID is read');
  assert.match(VIEWER, /do not carry the identity of the patient on screen/);
  assert.match(VIEWER, /A misfiled study is very hard to undo/);
  assert.match(VIEWER, /f\.slice\(0, 2097152\)/, 'only the header is read, not a whole series');
});

test('the print window escapes the patient name in its title as well as its heading', () => {
  const at = VIEWER.indexOf('function printImage()');
  assert.ok(at > -1);
  const body = VIEWER.slice(at, VIEWER.indexOf('\n', at));
  assert.match(body, /<title>PClinic — ' \+ esc\(nameOf\(patient\)/, 'a patient name must not close the title tag');
});

/* ── hosting: the changed modules must reach browsers ───────────── */

test('every module changed in this pass is loaded with a fresh cache-busting label', () => {
  // Hosting sends no Cache-Control for .js, so a page keeps a stale module until its
  // ?v= label changes — a security fix that never reaches the browser fixes nothing.
  for (const page of ['imaging-results.html', 'radio-dashboard.html']) {
    const html = read(page);
    for (const mod of ['pclinic-file.js', 'pclinic-radiology.js', 'auth-guard.js', 'pclinic-dicom-viewer.js', 'pclinic-dicom-viewer.css']) {
      const tag = new RegExp(mod.replace(/\./g, '\\.') + '\\?v=([A-Za-z0-9_]+)');
      const found = html.match(tag);
      assert.ok(found, page + ' loads ' + mod + ' with a ?v= label');
      assert.match(found[1], /^20261013_/, page + ' still loads a 2026-09 build of ' + mod);
    }
  }
  // One label across the site for the shared identification bar, or the portals diverge.
  const labels = new Set();
  for (const f of readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    const m = read(f).match(/pclinic-file\.js\?v=([A-Za-z0-9_]+)/);
    if (m) labels.add(m[1]);
  }
  assert.deepEqual([...labels], ['20261013_RADUNIT1'], 'pclinic-file.js carries one label on every page');
});
