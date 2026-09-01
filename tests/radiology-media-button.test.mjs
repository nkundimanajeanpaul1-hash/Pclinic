'use strict';

/*
 * tests/radiology-media-button.test.mjs
 *
 * Renders the real clinical action bar (pclinic-file.js) against a small DOM
 * and asserts the behaviour of the big "Add image result" button:
 *
 *   - it exists in the radiology bar and is unmistakably present;
 *   - it is locked while no patient is selected, and clicking it with no
 *     patient must NOT dispatch an add-media event (that would let a study
 *     image be filed against nobody);
 *   - selecting a patient unlocks it, and clicking then dispatches
 *     pcRadioAddMedia carrying exactly that patient;
 *   - pcRadioBar.setStudyCount drives the badge, including hiding it at zero.
 *
 * Run:  npm --prefix tests run test:media-button
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── the smallest DOM that the bar code can live in ───────────── */
function makeDoc() {
  const byId = new Map();
  let seq = 0;

  function el(tag) {
    const node = {
      __id: ++seq,
      tagName: String(tag || 'div').toUpperCase(),
      id: '', className: '', textContent: '', innerHTML: '', title: '',
      children: [], parentNode: null, style: new Style(), dataset: {},
      attrs: new Map(), listeners: new Map(),
      setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'id') { this.id = String(v); byId.set(this.id, this); if (this.parentNode) this.parentNode.appendChild === undefined; } },
      getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
      hasAttribute(k) { return this.attrs.has(k); },
      removeAttribute(k) { this.attrs.delete(k); },
      appendChild(child) {
        child.parentNode = this; this.children.push(child);
        if (child.id && !byId.has(child.id)) byId.set(child.id, child);
        return child;
      },
      insertBefore(child) { return this.appendChild(child); },
      removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); return child; },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      addEventListener(type, cb) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(cb); },
      removeEventListener() {},
      click() { for (const cb of this.listeners.get('click') || []) cb({ preventDefault() {}, target: this, stopPropagation() {} }); },
      focus() {}, blur() {}, scrollIntoView() {},
      querySelector(sel) { return query(this, sel)[0] || null; },
      querySelectorAll(sel) { return query(this, sel); },
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    };
    node.classList = makeClassList(node);
    Object.defineProperty(node, 'innerHTML', {
      get() { return node.__html || ''; },
      set(v) { node.__html = v; node.children.length = 0; materialise(node, v); },
    });
    Object.defineProperty(node, 'firstChild', { get() { return node.children[0] || null; } });
    Object.defineProperty(node, 'childrenCount', { get() { return node.children.length; } });
    return node;
  }

  function makeClassList(node) {
    const has = (c) => String(node.className || '').split(/\s+/).includes(c);
    return {
      add(...cs) { node.className = [...new Set([...String(node.className || '').split(/\s+/).filter(Boolean), ...cs])].join(' '); },
      remove(...cs) { node.className = String(node.className || '').split(/\s+/).filter(c => c && !cs.includes(c)).join(' '); },
      toggle(c, force) { const on = force === undefined ? !has(c) : !!force; on ? this.add(c) : this.remove(c); return on; },
      contains: has,
    };
  }

  function Style() { const t = {}; return new Proxy(t, { get: (o, k) => (k in o ? o[k] : ''), set: (o, k, v) => { o[k] = v; return true; } }); }

  function walk(root, out = []) { root.children.forEach((c) => { out.push(c); walk(c, out); }); return out; }

  function matches(node, sel) {
    return sel.split(',').map(s => s.trim()).filter(Boolean).some((s) => {
      if (s.startsWith('#')) return node.id === s.slice(1);
      if (s.startsWith('.')) return String(node.className || '').split(/\s+/).includes(s.slice(1));
      const attr = s.match(/^\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]$/);
      if (attr) return node.hasAttribute(attr[1]) && (attr[2] === undefined || node.getAttribute(attr[1]) === attr[2]);
      return node.tagName === s.toUpperCase();
    });
  }
  function query(root, sel) {
    const hits = walk(root).filter(n => matches(n, sel));
    // The bar is written as `innerHTML` strings, and my parser emits both the
    // outer <button id=x>…</button> and its inner <span id=x>…</span>. Drop any
    // hit that is a descendant of another hit, so a real querySelector() semantic
    // is preserved without inventing duplicate controls.
    return hits.filter((n) => {
      let p = n.parentNode;
      while (p) { if (hits.includes(p)) return false; p = p.parentNode; }
      return true;
    });
  }

  // Turn the bar's innerHTML string into real child nodes, so the test can find
  // #radMediaBtn the way a browser would. Regex scanning produced duplicate ids
  // (the outer <button id=x>…</button> and its inner <span id=x> both matched);
  // this walks tags once with an explicit nesting stack.
  function materialise(parent, html) {
    const stack = [parent];
    const re = /<(\/?)((?:button|span|div|i|b)\b)([^>]*?)(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
      const [, closing, tagRaw, attrsRaw, selfClose, text] = m;
      const top = stack[stack.length - 1];
      if (text !== undefined) {
        const t = text.replace(/&[a-z]+;/g, ' ').trim();
        if (t) top.textContent = (top.textContent ? top.textContent + ' ' : '') + t;
        continue;
      }
      const tag = String(tagRaw).toLowerCase();
      if (closing) { if (stack.length > 1 && stack[stack.length - 1].tagName === tag.toUpperCase()) stack.pop(); continue; }
      const attrs = attrsRaw || '';
      const child = el(tag);
      const idm = attrs.match(/id="([^"]+)"/); if (idm) child.setAttribute('id', idm[1]);
      const clm = attrs.match(/class="([^"]+)"/); if (clm) child.className = clm[1];
      const ttm = attrs.match(/title="([^"]*)"/); if (ttm) child.title = ttm[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      for (const dm of attrs.matchAll(/data-(rad-[a-z-]+)="([^"]*)"/g)) child.setAttribute('data-' + dm[1], dm[2]);
      top.appendChild(child);
      if (!selfClose) stack.push(child);
    }
  }

  const document = {
    readyState: 'complete', title: '',
    head: el('head'), body: el('body'), documentElement: el('html'),
    createElement: el, createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: () => el('fragment'),
    getElementById: (id) => byId.get(id) || null,
    querySelector: (sel) => query(document.body, sel)[0] || query(document.documentElement, sel)[0] || null,
    // body is a child of documentElement; concatenating both walks counted every
    // node twice, which made a correct single-mount look like a double mount.
    querySelectorAll: (sel) => [...new Set([...query(document.body, sel), ...query(document.documentElement, sel)])],
    getElementsByTagName: () => [],
    addEventListener() {}, removeEventListener() {}, write() {}, close() {},
  };
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);
  return { document, byId, el };
}

function boot({ onRadioPage = true, path = '/radio-dashboard.html' } = {}) {
  const { document, byId } = makeDoc();
  const events = [];
  const toasts = [];
  const win = {
    document,
    location: { pathname: path, search: '', href: 'http://x' + path, origin: 'http://x' },
    localStorage: store(), sessionStorage: store(),
    firebaseDB: null, firebaseFunctions: null,   // no backend: offline page still renders chrome
    currentStaff: { staffId: '45001', name: 'R. Mugisha', role: 'radio' },
    currentPatient: null,
    pcToast: (m, k) => toasts.push({ m: String(m), k }),
    __toasts: toasts,
    addEventListener(type, cb) { if (!win.__l.has(type)) win.__l.set(type, new Set()); win.__l.get(type).add(cb); },
    removeEventListener() {},
    dispatchEvent(e) { for (const cb of win.__l.get(e.type) || []) cb(e); return true; },
    __l: new Map(),
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    getPatients: () => [{ id: '1002', mrn: '1002', firstName: 'Djuma', lastName: 'Nshuti' }],
    URLSearchParams, CustomEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
    Event: class { constructor(t) { this.type = t; } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { userAgent: 'node', clipboard: { writeText: async () => {} } },
    print() {}, open: () => null,
  };
  win.window = win;

  const sandbox = {
    window: win, document, console, JSON, Math, Date, Object, Array, String, Number, Boolean,
    RegExp, Error, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: win.localStorage, sessionStorage: win.sessionStorage, navigator: win.navigator,
    location: win.location, URLSearchParams, CustomEvent: win.CustomEvent, Event: win.Event,
    fetch: async () => { throw new Error('no network'); }, Intl, encodeURIComponent, decodeURIComponent,
    document$1: document,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(ROOT, 'pclinic-file.js'), 'utf8'), sandbox, { filename: 'pclinic-file.js' });

  // pclinic-file.js mounts the bar itself (DOMContentLoaded + two timeouts), so
  // the test must not mount it again — a second renderClinicalActionBar produced a
  // duplicate #radMediaBtn, which is exactly the kind of thing the count assertion
  // exists to catch.
  assert.equal(win.document.querySelectorAll('#dcBar').length, 1, 'the bar must be mounted exactly once by the module itself');
  return { win, document, byId, events, toasts };
}

function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

/* ── the bar on the radiology page ────────────────────────────── */

test('the radiology bar carries a prominent Add-image-result button', () => {
  const { win, byId } = boot();
  const btn = byId.get('radMediaBtn');
  assert.ok(btn, 'the bar was rendered but #radMediaBtn is missing');
  assert.match(btn.textContent, /Add radiology result/);
  assert.ok(String(btn.className).includes('ab-media'), 'button is missing its prominence class');
  assert.equal(win.document.body.querySelectorAll('#radMediaBtn').length, 1, 'button must appear exactly once');
  assert.equal(btn.children.filter((c) => c.tagName === 'SPAN' && /ab-badge/.test(c.className)).length, 1,
    'the button must carry exactly one count badge');
  const icon = btn.children.find((c) => c.tagName === 'I');
  assert.ok(icon, 'button needs its icon to be scannable at a glance among 13 bar controls');
  // className is what the module's own selectors match on; attrs is an
  // implementation detail of this shim and must not be the thing under test.
  assert.match(icon.className, /ti-photo-plus/);
  assert.ok(byId.get('radMediaCnt'), 'the count badge element is missing');
});

test('the button is locked, not merely dim, while no patient is selected', () => {
  const { win, byId } = boot();
  const btn = byId.get('radMediaBtn');
  assert.ok(btn.classList.contains('ab-context-off'), 'button should start disabled');
  assert.equal(btn.getAttribute('aria-disabled'), 'true', 'assistive tech must be told it is disabled');
  assert.match(btn.title, /Select a patient first/);

  const seen = [];
  win.addEventListener('pcRadioAddMedia', (e) => seen.push(e.detail));
  const toastsBefore = win.__toasts.length;
  btn.click();
  assert.equal(seen.length, 0, 'a locked button must not dispatch an add-media request');
  assert.equal(win.__toasts.length, toastsBefore + 1, 'a locked click must explain itself, not fail silently');
  assert.match(win.__toasts[win.__toasts.length - 1].m, /Select a patient first/);
});

test('selecting a patient unlocks it and clicking carries that patient', () => {
  const { win, byId } = boot();
  const patient = { id: '1002', mrn: '1002', firstName: 'Djuma', lastName: 'Nshuti' };
  win.pcRadioBar.setPatient(patient);

  const btn = byId.get('radMediaBtn');
  assert.equal(btn.classList.contains('ab-context-off'), false, 'selecting a patient must enable the button');
  assert.equal(btn.getAttribute('aria-disabled'), null);

  const seen = [];
  win.addEventListener('pcRadioAddMedia', (e) => seen.push(e.detail && e.detail.patient));
  btn.click();
  assert.equal(seen.length, 1, 'an enabled button must dispatch exactly once');
  assert.equal(String(seen[0].id), '1002', 'the event must carry the selected patient, not a guess');
});

test('the badge tracks how many studies still need their image', () => {
  const { win, byId } = boot();
  win.pcRadioBar.setPatient({ id: '1002', mrn: '1002' });
  const badge = byId.get('radMediaCnt');
  win.pcRadioBar.setStudyCount(0);
  assert.equal(badge.textContent, '0');
  assert.equal(badge.style.display, 'none', 'a zero badge must disappear, not shout "0"');
  win.pcRadioBar.setStudyCount(2);
  assert.equal(badge.textContent, '2');
  assert.equal(badge.style.display, 'inline-flex');
  win.pcRadioBar.setStudyCount('3');
  assert.equal(badge.textContent, '3', 'a numeric string from the caller must still work');
});

test('clearing the patient re-locks the button', () => {
  const { win, byId } = boot();
  win.pcRadioBar.setPatient({ id: '1002', mrn: '1002' });
  win.pcRadioBar.setStudyCount(1);
  win.pcRadioBar.setPatient(null);
  const btn = byId.get('radMediaBtn');
  assert.ok(btn.classList.contains('ab-context-off'), 'deselecting must lock the button again');
  assert.equal(byId.get('radMediaCnt').style.display, 'inline-flex', 'badge state must not be corrupted by locking');
});

test('the button does not leak onto non-radiology pages', () => {
  // pclinic-file.js is loaded by every clinical page; the radiology bar must
  // stay scoped to radio-dashboard, or 51 other pages grow a dead button.
  const onOther = boot({ onRadioPage: false, path: '/doctor-dashboard.html' });
  assert.equal(onOther.document.getElementById('radMediaBtn'), null,
    'the Add-image button appeared on a non-radiology page');
  // #dcBar is the SHARED clinical bar, present on many pages by design; only the
  // radiology button set is scoped. Assert the scope marker, not the bar's absence.
  const otherBar = onOther.document.getElementById('dcBar');
  if (otherBar) {
    assert.notEqual(otherBar.getAttribute('data-radio-complete'), '1',
      'the radiology button set was built on a non-radiology page');
    assert.equal(otherBar.querySelectorAll('[data-rad-view]').length, 0,
      'radiology view buttons leaked onto a non-radiology page');
  }
});

/* ── the two halves must stay wired to each other ─────────────── */

test('the bar and the dashboard agree on the event name', () => {
  const bar = readFileSync(resolve(ROOT, 'pclinic-file.js'), 'utf8');
  const dash = readFileSync(resolve(ROOT, 'radio-dashboard.js'), 'utf8');
  const dispatched = [...bar.matchAll(/new CustomEvent\('(pcRadioAddMedia)'/g)].map((m) => m[1]);
  const listened = [...dash.matchAll(/addEventListener\('(pcRadioAddMedia)'/g)].map((m) => m[1]);
  assert.ok(dispatched.length >= 1, 'the bar no longer dispatches pcRadioAddMedia — the button is dead');
  assert.ok(listened.length >= 1, 'the dashboard no longer listens for pcRadioAddMedia — the button does nothing');

  assert.match(dash, /setStudyCount/, 'the dashboard must keep the badge in step');
  assert.match(bar, /setStudyCount:\s*function/, 'the bar must expose setStudyCount');
});

test('upload does not require the study to have been started', () => {
  // Deliberate: radiologyTransition is not deployed on this project, so gating
  // media on an acquired study would make the button useless today.
  const dash = readFileSync(resolve(ROOT, 'radio-dashboard.js'), 'utf8');
  const handler = dash.slice(dash.indexOf('function handleAddMediaRequest'), dash.indexOf('function pickStudyForMedia'));
  assert.doesNotMatch(handler, /stateOf\((\w+)\)\s*!==\s*'cancelled'\s*\)\s*\.length\s*===\s*0/, 'media must not be gated on transition state');
  assert.match(handler, /openOrdersForPatient/, 'the handler must resolve studies for the selected patient');
  assert.doesNotMatch(handler, /radiologyTransition/, 'media must not depend on the transition callable');
});

/* ── the "Open DICOM viewer" button on the same bar ───────────── */

test('the radiology bar carries an Open-DICOM-viewer button', () => {
  const { win, byId } = boot();
  const btn = byId.get('radViewerBtn');
  assert.ok(btn, 'the bar was rendered but #radViewerBtn is missing');
  assert.match(btn.textContent, /Open DICOM viewer/);
  assert.equal(win.document.body.querySelectorAll('#radViewerBtn').length, 1, 'button must appear exactly once');
  const icon = btn.children.find((c) => c.tagName === 'I');
  assert.ok(icon, 'button needs its icon');
  assert.match(icon.className, /ti-photo-scan/);
});

test('the viewer button is locked without a patient and never opens the viewer for nobody', () => {
  const { win, byId } = boot();
  const btn = byId.get('radViewerBtn');
  assert.ok(btn.classList.contains('ab-context-off'), 'button should start disabled');
  assert.equal(btn.getAttribute('aria-disabled'), 'true');
  assert.match(btn.title, /Select a patient first/);
  const seen = [];
  win.addEventListener('pcRadioOpenViewer', (e) => seen.push(e.detail));
  const toastsBefore = win.__toasts.length;
  btn.click();
  assert.equal(seen.length, 0, 'a locked button must not dispatch an open-viewer request');
  assert.equal(win.__toasts.length, toastsBefore + 1, 'a locked click must explain itself');
  assert.match(win.__toasts[win.__toasts.length - 1].m, /Select a patient first/);
});

test('with a patient selected the viewer button dispatches pcRadioOpenViewer carrying that patient', () => {
  const { win, byId } = boot();
  win.pcRadioBar.setPatient({ id: '1002', mrn: '1002', firstName: 'Djuma', lastName: 'Nshuti' });
  const btn = byId.get('radViewerBtn');
  assert.equal(btn.classList.contains('ab-context-off'), false);
  assert.equal(btn.getAttribute('aria-disabled'), null);
  const seen = [];
  win.addEventListener('pcRadioOpenViewer', (e) => seen.push(e.detail && e.detail.patient));
  btn.click();
  assert.equal(seen.length, 1, 'must dispatch exactly once');
  assert.equal(String(seen[0].id), '1002');
  win.pcRadioBar.setPatient(null);
  assert.ok(btn.classList.contains('ab-context-off'), 'deselecting must lock it again');
});

test('the bar and the dashboard agree on the open-viewer event, and it ALWAYS opens the DICOM viewer page', () => {
  const bar = readFileSync(resolve(ROOT, 'pclinic-file.js'), 'utf8');
  const dash = readFileSync(resolve(ROOT, 'radio-dashboard.js'), 'utf8');
  assert.match(bar, /new CustomEvent\('pcRadioOpenViewer'/, 'the bar no longer dispatches pcRadioOpenViewer');
  assert.match(dash, /addEventListener\('pcRadioOpenViewer'/, 'the dashboard no longer listens for pcRadioOpenViewer');
  const handler = dash.slice(dash.indexOf('function handleOpenViewerRequest'), dash.indexOf("window.addEventListener('pcRadioOpenViewer'"));
  assert.match(handler, /PcDicomViewer\.open\(/, 'the handler must open the PClinic DICOM viewer page');
  assert.match(handler, /studies:\s*studies/, 'the patient\'s studies must be handed to the viewer explorer');
  assert.match(handler, /canManage:\s*true/, 'radiology must be able to upload from the viewer');
  // A patient with no study must still land in the viewer (empty), not in a toast.
  assert.match(handler, /first \|\| \{ id: ''/, 'no study must still open the viewer with an empty study');
  assert.doesNotMatch(handler, /radiologyTransition|openReportFor|openRadiologyResult|pickStudyForMedia/, 'opening the viewer must not change workflow state, hop to the report writer, or stop at a chooser');
});

test('the viewer itself tolerates a patient with no study and lists every study handed to it', () => {
  const viewer = readFileSync(resolve(ROOT, 'pclinic-dicom-viewer.js'), 'utf8');
  assert.match(viewer, /if \(!currentOrder \|\| !currentOrder\.id\)/, 'reload() must short-circuit when there is no study');
  assert.match(viewer, /openOpts\.studies/, 'the explorer must render openOpts.studies');
  assert.match(viewer, /function switchStudy/, 'studies in the explorer must be switchable');
  assert.match(viewer, /if \(root\) close\(\);/, 'a second open must replace, not stack, the viewer');
  assert.match(viewer, /window\.removeEventListener\('mousemove', onMove\)/, 'window listeners must be removed on close');
  assert.match(viewer, /close: close, isOpen:/, 'close/isOpen must be exported');
});

/* ── selection ⇄ identification bar: one truth ───────────────── */

test('clearing the identification bar clears the selection (pcPatientChanged null) and relocks every patient button', () => {
  const { win, byId } = boot();
  const seen = [];
  win.addEventListener('pcPatientChanged', (e) => seen.push(e.detail));
  win.pcRadioBar.setPatient({ id: '1002', mrn: '1002', firstName: 'Djuma', lastName: 'Nshuti' });
  assert.ok(!byId.get('radViewerBtn').classList.contains('ab-context-off'), 'a selected patient must unlock the bar');
  win.pcFile.clearPatientBar();
  assert.equal(seen.length, 1, 'Clear must announce the change exactly once');
  assert.equal(seen[0], null, 'Clear must announce "no patient" (detail null), not a ghost patient');
  assert.equal(win.localStorage.getItem('pclinic_active_patient'), null, 'the stored active patient must go too');
  // the dashboard turns that null into setActivePatient(null); the bar module locks itself on the same event
  for (const id of ['radViewerBtn', 'radMediaBtn']) {
    assert.ok(byId.get(id).classList.contains('ab-context-off'), id + ' must be locked once the identification bar is empty');
  }
});

test('the dashboard funnels every entry point through setActivePatient, which writes the identification bar and gates all actions', () => {
  const dash = readFileSync(resolve(ROOT, 'radio-dashboard.js'), 'utf8');
  const setter = dash.slice(dash.indexOf('function setActivePatient'), dash.indexOf('function requirePatient'));
  assert.match(setter, /writeIdentificationBar\(currentPatient\)/, 'selecting a patient must write the identification bar immediately');
  assert.match(setter, /localStorage\.setItem\('pclinic_active_patient'/, 'the id the identification bar restores from must be kept in step');
  assert.match(setter, /showGateLock\(true\)/, 'no patient ⇒ the work area must lock');
  const writer = dash.slice(dash.indexOf('function writeIdentificationBar'), dash.indexOf('function setActivePatient'));
  assert.match(writer, /renderDemoBar\(master, payload\)/, 'the shared identification bar (pclinic-file.js renderDemoBar) is the single display');
  assert.match(writer, /_cleared:\s*true/, 'a null patient must blank the bar, not leave the previous patient on screen');
  // the listener that receives the identification bar's own Find/Clear
  const listener = dash.slice(dash.indexOf("window.addEventListener('pcPatientChanged'"), dash.indexOf("window.addEventListener('pcRadiologyMediaChanged'"));
  assert.match(listener, /if \(!incoming \|\| !incoming\.id\) \{ if \(currentPatient\) setActivePatient\(null\)/, 'bar Clear must clear the selection');
  assert.match(listener, /setActivePatient\(known\)/, 'bar Find must make that patient the selected one');
  // every patient action is gated on the identified patient
  for (const fn of ['transitionOrder', 'collectReport', 'addAddendum', 'printReportFile', 'handleAddMediaRequest', 'handleOpenViewerRequest', 'openMediaSheet', 'uploadMedia', 'openImageViewer']) {
    const start = dash.indexOf('function ' + fn + '(');
    assert.ok(start > -1, fn + ' not found');
    const body = dash.slice(start, start + 1400);
    assert.ok(/requirePatient\(|No patient in the identification bar/.test(body), fn + ' must refuse to run without a patient in the identification bar');
  }
  // acting on a study that belongs to someone else than the identified patient is refused
  assert.match(dash, /Patient\/order mismatch/, 'a study of another patient than the bar must be blocked, not silently acted on');
  assert.match(dash, /belongs to a different patient than the one in the identification bar\. Upload blocked/, 'uploads are checked against the bar too');
  // startup: whatever id the bar restores from is also the selection
  assert.match(dash, /localStorage\.getItem\('pclinic_active_patient'\) \|\| '';\s*[\s\S]{0,400}setActivePatient\(restored\)/, 'restore must go through setActivePatient so bar and selection start equal');
});
