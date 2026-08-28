'use strict';

/*
 * tests/imaging-results-page.test.mjs
 *
 * Runs the real inline script of imaging-results.html (extracted from the page,
 * not re-implemented) against a minimal DOM, to pin the three behaviours changed
 * on 2026-08-28:
 *
 *   1. a failed Firestore subscription / init is shown, not swallowed into
 *      "no reports" — previously the whole boot ran inside
 *      .catch(function(){}) and pcRadiology.init() rethrows;
 *   2. reports are matched by id OR mrn OR the numeric MRN, because the old
 *      filter (String(r.patientId) === String(patient.id || patient.mrn))
 *      silently dropped correctly-signed reports when the order was raised
 *      against the MRN while the patient object carried another internal id;
 *   3. the PACS/DICOMweb notice only appears when that patient actually has a
 *      report — it used to be unconditional static markup, so it read like an
 *      error on every patient with an empty queue.
 *
 * Run:  npm --prefix tests run test:results
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'imaging-results.html');
const HTML = readFileSync(PAGE, 'utf8');

function pageScript() {
  const blocks = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1, 'no inline script found in the page');
  return blocks.map((m) => m[1]).join('\n;\n');
}

function makeElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [], style: { cssText: '', setProperty() {} }, dataset: {},
    className: '', textContent: '', innerHTML: '', hidden: false, type: '', onclick: null, id: '',
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    replaceChildren() { this.children.length = 0; this.textContent = ''; },
    remove() {}, setAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
    addEventListener() {}, removeEventListener() {}, click() {}, focus() {}, blur() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    contains: () => false, scrollIntoView() {},
  };
  Object.defineProperty(el, 'parentNode', { value: null, writable: true });
  return el;
}

/** Flatten the rendered text of a subtree the way a user would read it. */
function textOf(el) {
  if (!el) return '';
  let out = el.textContent || '';
  (el.children || []).forEach((c) => { out += ' ' + textOf(c); });
  return out.replace(/\s+/g, ' ').trim();
}

function buttonsOf(el, found = []) {
  if (!el) return found;
  if (el.tagName === 'BUTTON') found.push(el);
  (el.children || []).forEach((c) => buttonsOf(c, found));
  return found;
}

function boot({ reports = [], failInit = null, subscriptionError = null, staff = { role: 'radio', staffId: '45001', name: 'R. Mugisha' } } = {}) {
  const byId = new Map();
  ['patientBanner', 'reportList', 'imageNotice', 'closeBtn', 'toastContainer'].forEach((id) => {
    const el = makeElement('div'); el.id = id; byId.set(id, el);
  });
  const listeners = new Map();
  const document = {
    readyState: 'complete', title: '', head: makeElement('head'), body: makeElement('body'),
    documentElement: makeElement('html'), activeElement: null,
    getElementById: (id) => byId.get(id) || null,
    createElement: makeElement, createTextNode: (t) => ({ textContent: t }),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(t, cb) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(cb); },
    removeEventListener() {}, write() {}, close() {},
  };

  let emitted = null;
  const initCalls = [];
  const window = {
    document, location: { search: '?patient=1002', origin: 'http://localhost', href: 'http://localhost/imaging-results.html' },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    parent: null, history: { back() {} },
    open: () => null,
    getPatients: () => [{ id: '1002', mrn: '1002', firstName: 'Djuma', lastName: 'Nshuti', gender: 'Male', dob: '2019-01-23' }],
    currentStaff: staff,
    requireAuth: () => Promise.resolve(staff),
    sharedShowToast: null, showToast: null,
    pcRadiology: {
      init(options) { initCalls.push(options || {}); if (failInit) return Promise.reject(failInit); return Promise.resolve({}); },
      subscribe(cb) { emitted = cb; cb({ reports, addenda: [], alerts: [], error: subscriptionError }); return () => {}; },
      acknowledgeCritical: async () => ({}),
      orderById: () => null,
    },
    addEventListener(t, cb) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(cb); },
    removeEventListener() {},
    dispatchEvent(event) { for (const cb of listeners.get(event.type) || []) cb(event); return true; },
    URLSearchParams, setTimeout, clearTimeout, CustomEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
    Event: class { constructor(t) { this.type = t; } },
    console, Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Intl,
  };
  window.window = window;

  const sandbox = {
    window, document, location: window.location, history: window.history,
    sessionStorage: window.sessionStorage, localStorage: window.localStorage,
    navigator: { userAgent: 'node' }, console, JSON, Math, Date, Object, Array, String, Number,
    Boolean, RegExp, Error, Promise, Intl, URLSearchParams,
    CustomEvent: window.CustomEvent, Event: window.Event,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(pageScript(), sandbox, { filename: 'imaging-results.html' });

  const fire = (type) => { for (const cb of listeners.get(type) || []) cb({ origin: 'http://localhost', source: null, data: null }); };
  return { window, byId, fire, emit: (next) => emitted && emitted(next), initCalls,
           text: (id) => textOf(byId.get(id)), buttons: (id) => buttonsOf(byId.get(id)) };
};

const settle = () => new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r))));

const PATIENT = { id: '1002', mrn: '1002', firstName: 'Djuma', lastName: 'Nshuti', gender: 'Male', dob: '2019-01-23' };

/** Boot the page, let it resolve its promises, then pin a patient. */
async function withPatient(report, patient = PATIENT, extra = {}) {
  const env = boot({ reports: report ? [report] : [], ...extra });
  env.fire('DOMContentLoaded');
  await settle();
  if (patient) env.window.pcImagingResults.setPatientForTest(patient);
  return env;
}

/* ── 1. failures are shown, not hidden ─────────────────────────── */

test('a failed subscription is reported instead of looking like an empty queue', async () => {
  const env = boot({ subscriptionError: Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }) });
  env.fire('DOMContentLoaded');
  await settle();

  const shown = env.text('reportList');
  assert.match(shown, /Could not load reports from the common server/, `init failure was swallowed: "${shown}"`);
  assert.match(shown, /permission-denied/, 'the machine reason must be visible to whoever is debugging');
  assert.equal(env.buttons('reportList').length, 1, 'a retry action must be offered');
});

test('a rejected init is caught after the subscription is already live', async () => {
  const env = boot({ failInit: new Error('Firebase did not initialize.') });
  // The page only boots on DOMContentLoaded, so drive it the same way.
  env.window.document.readyState = 'loading';
  env.fire('DOMContentLoaded');
  await settle();

  assert.equal(env.initCalls.length, 1, 'init must still be attempted');
  assert.match(env.text('reportList'), /Could not load reports/, 'init rejection must reach the screen');
  assert.match(env.text('reportList'), /Firebase did not initialize/, 'the reason must be readable');
  // A retry that succeeds must clear the error state.
  env.window.pcRadiology.init = () => Promise.resolve({});
  await env.window.pcImagingResults.retryLoad();
  assert.doesNotMatch(env.text('reportList'), /Could not load reports/, 'retry left a stale error');
});

test('a sign-in failure is surfaced rather than silently swallowed', async () => {
  const env = boot({});
  env.window.requireAuth = () => Promise.reject(new Error('Session expired'));
  env.window.document.readyState = 'loading';
  env.fire('DOMContentLoaded');
  await settle();

  assert.match(env.text('reportList'), /Sign-in could not be verified/, 'the old .catch(function(){}) hid this completely');
});

/* ── 2. patient matching no longer drops real reports ─────────── */

test("belongsToPatient matches id, MRN and the numeric MRN alike", async () => {
  const env = await withPatient(null);
  const { belongsToPatient, reportsFor } = env.window.pcImagingResults;

  // Order raised against the MRN while the patient object carries an internal id.
  assert.equal(belongsToPatient(
    { patientId: '1002', patientMrn: '1002' }, { id: 'PAT-77', mrn: '1002' }), true,
    'the pre-fix equality test dropped exactly this case');
  // Normal case: both sides use the same id.
  assert.equal(belongsToPatient({ patientId: '1002' }, { id: '1002', mrn: '1002' }), true);
  // Numeric MRN embedded in a prefixed id (MRN-1002 vs 1002).
  assert.equal(belongsToPatient({ patientId: '1002' }, { id: 'MRN-1002', mrn: 'MRN-1002' }), true);
  // Another patient must stay out of the chart.
  assert.equal(belongsToPatient({ patientId: '2001', patientMrn: '2001' }, { id: '1002', mrn: '1002' }), false);
  assert.equal(belongsToPatient({}, { id: '1002' }), false, 'an unattributed report must never leak into a chart');
  assert.equal(belongsToPatient(null, null), false);

  // reportsFor() keeps final rows only.
  const rows = reportsFor({ id: '1002', mrn: '1002' }, { reports: [
    { status: 'final', patientId: '1002' }, { status: 'draft', patientId: '1002' },
    { status: 'final', patientId: '9999' }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'final');
});

test('the page renders a final report whose patientId is the MRN', async () => {
  const env = await withPatient(
    { id: 'rad_ord-1', status: 'final', patientId: '1002', patientMrn: '1002', study: 'Chest X-ray',
      findings: 'Clear.', impression: 'No acute findings.', signedAt: '2026-08-28T09:00:00.000Z',
      signedByName: 'R. Mugisha' },
    { id: 'PAT-77', mrn: '1002' });

  const shown = env.text('reportList');
  assert.match(shown, /Chest X-ray/);
  assert.match(shown, /No acute findings\./);
  assert.match(shown, /FINAL/);
});

test('a report for a different patient is still excluded', async () => {
  const env = await withPatient(
    { id: 'rad_ord-9', status: 'final', patientId: '2001', patientMrn: '2001', study: 'Skull', findings: 'x', impression: 'y' });

  assert.match(env.text('reportList'), /No radiology reports for this patient/);
  assert.doesNotMatch(env.text('reportList'), /Skull/);
});

test('the empty message names the MRN checked, so staff can rule out an id mismatch', async () => {
  const env = await withPatient(null);
  assert.match(env.text('reportList'), /MRN 1002 checked/, 'the message must say what it compared');
});

/* ── 3. the PACS notice is conditional ─────────────────────────── */

test('the PACS notice is hidden when there is nothing to view', async () => {
  const env = boot({ reports: [] });
  env.fire('DOMContentLoaded');
  await settle();
  env.window.pcImagingResults.setPatientForTest(PATIENT);

  assert.equal(env.byId.get('imageNotice').hidden, true, 'the unconditional notice read as an error on an empty queue');
});

test('the PACS notice appears when the patient has a final report', async () => {
  const env = boot({ reports: [{ id: 'rad_ord-1', status: 'final', patientId: '1002', patientMrn: '1002', study: 'Chest X-ray', findings: 'Clear.', impression: 'Normal.' }] });
  env.fire('DOMContentLoaded');
  await settle();
  env.window.pcImagingResults.setPatientForTest(PATIENT);

  assert.equal(env.byId.get('imageNotice').hidden, false, 'the image caveat is relevant once a report is open');
});

test('a draft is announced as awaiting signature rather than as nothing existing', async () => {
  const env = boot({ reports: [{ id: 'rad_ord-2', status: 'draft', patientId: '1002', patientMrn: '1002', study: 'Abdomen US' }] });
  env.fire('DOMContentLoaded');
  await settle();
  env.window.pcImagingResults.setPatientForTest(PATIENT);

  assert.match(env.text('reportList'), /1 draft awaiting final signature by Radiology/, 'a draft must not look like an empty queue');
  assert.equal(env.byId.get('imageNotice').hidden, false, 'the writer is pending, so the caveat belongs here');
});

test('a signed report never changes status when drafts coexist', async () => {
  const env = boot({ reports: [
    { id: 'rad_ord-3', status: 'final', patientId: '1002', patientMrn: '1002', study: 'Chest X-ray', findings: 'A', impression: 'B' },
    { id: 'rad_ord-4', status: 'draft', patientId: '1002', patientMrn: '1002', study: 'Abdomen US' },
  ] });
  env.fire('DOMContentLoaded');
  await settle();
  env.window.pcImagingResults.setPatientForTest(PATIENT);

  const shown = env.text('reportList');
  assert.match(shown, /Chest X-ray/);
  assert.doesNotMatch(shown, /Abdomen US/, 'drafts must not be presented as signed results');
});
