'use strict';

/*
 * tests/dicom-workstation.test.mjs
 *
 * Contracts of the Weasis-style workstation (pclinic-dicom-viewer.js) that do
 * not need a browser: the pure helpers it exports under _internal, the wiring
 * between pages and the viewer, and the hosting configuration the viewer
 * depends on (self-hosted libraries, CSP that lets the decode worker run).
 * Everything interactive is covered by the Playwright run documented in
 * DOCTOR-WORKSTATION-NOTES.txt.
 *
 * Run:  node --test --test-force-exit tests/dicom-workstation.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(ROOT, 'pclinic-dicom-viewer.js'), 'utf8');

function loadViewer() {
  const listeners = new Map();
  const win = {
    addEventListener(t, cb) { listeners.set(t, cb); }, removeEventListener() {}, dispatchEvent() { return true; },
    matchMedia: () => ({ matches: false }), innerWidth: 1400, innerHeight: 900, __pcdvNoPreload: true,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { hardwareConcurrency: 4 },
  };
  const document = { currentScript: { src: 'http://x/pclinic-dicom-viewer.js?v=T' }, readyState: 'loading', addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {} }), createElementNS: () => ({ setAttribute() {}, appendChild() {} }), body: { appendChild() {}, classList: { toggle() {}, remove() {} }, style: {} }, head: { appendChild() {} }, getElementById: () => null, querySelector: () => null, fullscreenElement: null };
  win.document = document; win.window = win;
  const sandbox = { window: win, document, console, Promise, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, JSON, setTimeout, clearTimeout, requestIdleCallback: undefined, navigator: win.navigator, localStorage: win.localStorage, Image: function () {}, URL: { createObjectURL() {}, revokeObjectURL() {} }, fetch: async () => { throw new Error('no network'); }, Blob: function () {}, CustomEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } }, Event: class { constructor(t) { this.type = t; } } };
  sandbox.globalThis = sandbox; vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'pclinic-dicom-viewer.js' });
  return win.PcDicomViewer;
}

/* ── public surface ─────────────────────────────────────────────── */

test('the viewer exposes both entry points (modal for radiology, mount for the doctor page) and patient sync', () => {
  const V = loadViewer();
  for (const fn of ['open', 'mount', 'close', 'isOpen', 'setPatient', 'refreshStudies', 'selectStudy', 'preload', 'current']) {
    assert.equal(typeof V[fn], 'function', fn + ' missing');
  }
  assert.equal(V.isOpen(), false);
});

/* ── orientation letters (Weasis-style L/R/A/P/H/F) ─────────────── */

test('orientation letters follow the DICOM direction cosines and rotate/flip with the viewport', () => {
  const { baseOrientation, rotateOrientation, dirLabel } = loadViewer()._internal;
  assert.equal(dirLabel([1, 0, 0]), 'L'); assert.equal(dirLabel([-1, 0, 0]), 'R'); assert.equal(dirLabel([0, 1, 0]), 'P'); assert.equal(dirLabel([0, 0, -1]), 'F');
  assert.equal(dirLabel([0.7, 0.7, 0]), 'LP', 'oblique rows carry two letters, strongest first');
  const ds = { string: (t) => ({ x00200037: '1\\0\\0\\0\\1\\0' }[t]) };  // axial: rows → L, columns → P
  const J = (v) => JSON.parse(JSON.stringify(v));   // objects come from another vm realm
  const o = baseOrientation(ds);
  assert.deepEqual(J(o), { right: 'L', left: 'R', bottom: 'P', top: 'A' });
  assert.deepEqual(J(rotateOrientation(o, { rotation: 90 })), { top: 'R', right: 'A', bottom: 'L', left: 'P' }, '90° clockwise moves the left label to the top');
  assert.deepEqual(J(rotateOrientation(o, { hflip: true })), { top: 'A', right: 'R', bottom: 'P', left: 'L' });
  const po = { string: (t) => ({ x00200020: 'L\\F' }[t]) };  // CR with Patient Orientation only
  assert.deepEqual(J(baseOrientation(po)), { right: 'L', left: 'R', bottom: 'F', top: 'H' });
  assert.equal(baseOrientation({ string: () => undefined }), null, 'no orientation → no letters (never guess)');
});

/* ── scale bar ─────────────────────────────────────────────────── */

test('the scale bar picks a round length that fits the viewport', () => {
  const { niceStep } = loadViewer()._internal;
  assert.equal(niceStep(120, 0.143), 10, '0.143 mm/px at 1:1 → a 10 mm (1 cm) bar of 70 px');
  assert.equal(niceStep(120, 1), 100, 'no calibration → 100 pix');
  assert.equal(niceStep(60, 0.5), 20);
});

/* ── measurement text ──────────────────────────────────────────── */

test('measurements are described in mm / mm² when calibrated, px otherwise, and HU on CT', () => {
  const { describeMeasurement } = loadViewer()._internal;
  const cal = { rowPixelSpacing: 0.143, intercept: 0 }, uncal = { rowPixelSpacing: undefined, intercept: 0 }, ct = { rowPixelSpacing: 0.5, intercept: -1024 };
  assert.equal(describeMeasurement('Length', { length: 22.94 }, cal), '22.9 mm');
  assert.equal(describeMeasurement('Length', { length: 160 }, uncal), '160.0 px');
  assert.equal(describeMeasurement('Angle', { rAngle: 112.38 }, cal), '112.4°');
  assert.match(describeMeasurement('EllipticalRoi', { cachedStats: { area: 154.2, mean: 40.0, stdDev: 1.2, min: 38, max: 42 } }, ct), /Area 154\.2 mm² · mean 40\.0 HU ± 1\.2 · min 38 · max 42/);
  assert.match(describeMeasurement('Probe', { cachedStats: { x: 127, y: 127, mo: 40 } }, ct), /x127 y127 · value 40 HU/);
  assert.equal(describeMeasurement('ArrowAnnotate', { text: 'Fracture line' }, cal), '“Fracture line”');
  assert.equal(describeMeasurement('Bidirectional', { longestDiameter: 12.34, shortestDiameter: 5.6 }, cal), 'L 12.3 × S 5.6 mm');
});

/* ── libraries are self-hosted (CSP on Hosting blocks CDNs) ─────── */

test('every viewer library is self-hosted under vendor/ and no CDN is referenced', () => {
  for (const f of ['hammer.min.js', 'cornerstone.min.js', 'cornerstoneMath.min.js', 'dicomParser.min.js', 'cornerstoneWADOImageLoader.bundle.min.js', 'cornerstoneTools.min.js', 'index.worker.bundle.min.worker.js', 'LICENSES.txt']) {
    assert.ok(existsSync(resolve(ROOT, 'vendor', f)), 'vendor/' + f + ' missing');
    assert.ok(statSync(resolve(ROOT, 'vendor', f)).size > 500, 'vendor/' + f + ' is empty');
  }
  assert.doesNotMatch(SRC, /unpkg\.com|cdn\.jsdelivr|cdnjs/, 'the viewer must not load libraries from a CDN');
  const worker = readFileSync(resolve(ROOT, 'vendor', 'cornerstoneWADOImageLoader.bundle.min.js'), 'utf8');
  assert.match(worker, /PClinic patch/, 'the loader must start the decode worker from its file URL (inline blob workers are blocked by CSP)');
  assert.ok(worker.length < 400000, 'the 1.2 MB inline copy of the worker must stay stripped');
});

test('firebase.json lets the page start the decode worker and gives that one file its own CSP', () => {
  const fj = JSON.parse(readFileSync(resolve(ROOT, 'firebase.json'), 'utf8'));
  const rules = fj.hosting.headers;
  const page = rules.find((r) => r.source === '**').headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(page, /worker-src 'self' blob:/, 'page CSP must allow same-origin workers');
  assert.match(page, /script-src [^;]*'wasm-unsafe-eval'/, 'page CSP must allow WebAssembly compilation');
  assert.doesNotMatch(page, /script-src [^;]*'unsafe-eval'/, "'unsafe-eval' must NOT be granted to pages");
  const w = rules.find((r) => r.source === '/vendor/index.worker.bundle.min.worker.js');
  assert.ok(w, 'the worker file needs its own header rule');
  assert.match(w.headers.find((h) => h.key === 'Content-Security-Policy').value, /'unsafe-eval'/, 'the emscripten codecs inside the worker need unsafe-eval — confined to that file');
  assert.ok(rules.indexOf(w) > rules.findIndex((r) => r.source === '**'), 'the worker rule must come AFTER the catch-all so its CSP wins');
  assert.ok(!fj.hosting.ignore.some((g) => /vendor/.test(g)), 'vendor/ must be deployed');
});

test('bucket CORS allows every origin the app is served from', () => {
  const cors = JSON.parse(readFileSync(resolve(ROOT, 'cors.json'), 'utf8'));
  for (const o of ['https://pclinic-20d81.web.app', 'https://pclinic-20d81.firebaseapp.com', 'https://nkundimanajeanpaul1-hash.github.io']) {
    assert.ok(cors[0].origin.includes(o), o + ' missing from cors.json');
  }
  assert.ok(cors[0].method.includes('GET'));
});

/* ── page wiring ───────────────────────────────────────────────── */

test('the doctor page mounts the workstation under the identification bar and keeps both in step', () => {
  const html = readFileSync(resolve(ROOT, 'imaging-results.html'), 'utf8');
  assert.match(html, /<div id="pcMasterHeader"><\/div>/, 'the shared header (identification bar) host must exist');
  assert.match(html, /<div id="workstation"/, 'the workstation host must exist');
  assert.match(html, /pclinic-file\.js\?v=/, 'pclinic-file.js (identification bar) must be loaded');
  assert.match(html, /PcDicomViewer\.mount\(host/, 'the page must mount the workstation inline');
  assert.match(html, /onPatientChange/, 'a patient chosen in the explorer must flow back to the page');
  assert.match(html, /addEventListener\('pcPatientChanged'/, 'the identification bar Find/Clear must flow into the workstation');
  assert.match(html, /canManage:staff&&\(staff\.role==='radio'\|\|staff\.role==='admin'\)/, 'doctors are read-only; radiology may upload');
  assert.match(html, /Show images in workstation/, 'report cards must jump to the study in the workstation');
  assert.doesNotMatch(html, /PcDicomViewer\.open\(/, 'the doctor page must not open the old pop-up');
});

test('radiology opens the same workstation with upload rights and the identified patient', () => {
  const dash = readFileSync(resolve(ROOT, 'radio-dashboard.js'), 'utf8');
  const calls = [...dash.matchAll(/PcDicomViewer\.open\(([^;]*)\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 2, 'expected the action-bar and the card entry points');
  for (const c of calls) { assert.match(c, /canManage/, 'radiology must get upload rights: ' + c); assert.match(c, /patient/, 'the identified patient must be handed over: ' + c); }
});

test('preliminary images are labelled and the report tab reads the signed report from pcRadiology', () => {
  assert.match(SRC, /Preliminary — no signed report yet/);
  assert.match(SRC, /reportForOrder/); assert.match(SRC, /addendaForReport/); assert.match(SRC, /alertForReport/);
  assert.match(SRC, /pcRadioMedia\.localUrlFor|M\.localUrlFor/, 'own uploads must display before the server can sign them');
  assert.match(SRC, /deleteIfHandleOutsideImage: false/, 'a measurement dragged past the edge must be clamped, not deleted');
});

test('drawings, key images and notes are saved to the common server through pcRadioAnnotations', () => {
  const api = loadViewer();
  assert.equal(typeof api.saveNow, 'function', 'pages can force a flush (e.g. before navigating away)');
  assert.equal(typeof api.toggleKeyImage, 'function');
  assert.equal(typeof api.annotations, 'function');
  // wiring inside the viewer
  assert.match(SRC, /window\.pcRadioAnnotations/, 'viewer talks to the annotations module');
  assert.match(SRC, /A\.subscribe\(id, function \(rows, err\)/, 'subscribes per study, every author');
  assert.match(SRC, /anno\.timer = setTimeout\(flushAnnotations, 1000\)/, 'auto-save 1 s after the last change');
  assert.match(SRC, /'Saved ✓ ' \+ fmtDateTime/, 'Saved ✓ indicator');
  assert.match(SRC, /Retrying…/, 'failed saves retry by themselves');
  assert.match(SRC, /_pcRemote/, 'colleagues\' drawings are marked read-only');
  assert.match(SRC, /'pagehide', unloadBound/, 'a pending save is flushed when the tab closes');
  assert.match(SRC, /data-id="key"|'key'/, 'key-image button in the tool bar');
  // pages load the module (with cache-busting) before the viewer
  for (const page of ['imaging-results.html', 'radio-dashboard.html']) {
    const html = readFileSync(resolve(ROOT, page), 'utf8');
    const iAnno = html.indexOf('pclinic-radiology-annotations.js?v=');
    const iViewer = html.indexOf('pclinic-dicom-viewer.js?v=');
    assert.ok(iAnno > 0, page + ' loads pclinic-radiology-annotations.js');
    assert.ok(iAnno < iViewer, page + ' loads the annotations module before the viewer');
  }
  // rules: the collection exists, is readable by patient readers and writable only by the author
  const rules = readFileSync(resolve(ROOT, 'firestore.rules'), 'utf8');
  const block = rules.slice(rules.indexOf('match /radiologyAnnotations/'), rules.indexOf('match /billingPatientDirectory/'));
  assert.ok(block.length > 200, 'radiologyAnnotations rules present');
  assert.match(block, /allow get, list: if patientReader\(\)/);
  assert.match(block, /allow create: if hasRole\(\['doctor', 'radio', 'admin'\]\)/);
  assert.match(block, /exists\(mediaPath\(\)\)/, 'an annotation must point at a real image record');
  assert.match(block, /resource\.data\.get\('byUid', null\) == request\.auth\.uid/, 'update/delete only by the author');
  assert.match(block, /hasAny\(\['data', 'dataUrl', 'base64'/, 'never pixels');
});
