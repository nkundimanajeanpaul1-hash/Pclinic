'use strict';

/*
 * tests/pclinic-file-sync.test.mjs
 *
 * Executes the real pclinic-file.js (not a re-implementation) in a hand-rolled
 * DOM, against a fake Firestore, to prove the cross-device behaviour that was
 * broken before 2026-08-27:
 *
 *   saveFile() pushed to patients/{id}/files but nothing ever read that
 *   collection back, so listFiles() — the only reader used by imaging-request,
 *   pclinic-filepage and medical-summary — showed localStorage, i.e. records
 *   created on *this* computer only.
 *
 * Run:  npm --prefix tests run test:files
 *
 * Two module instances share one fake server, standing in for two computers in
 * the clinic. The fake mirrors the parts of the Firestore surface the module
 * uses: doc/collection/setDoc/getDocs/onSnapshot.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The shipping file, executed unmodified — not a re-implementation.
const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'pclinic-file.js'), 'utf8');

/* ── the shared "server" ──────────────────────────────────────── */

function makeServer() {
  const store = new Map();          // 'patientId/fileId' -> data
  const listeners = new Map();      // patientId -> Set<callback>
  let nextWrite = null;             // set to an Error to deny the next write

  // Raw rows; the snapshot wrappers below expose them as { id, data() }.
  const rowsFor = (pid) => [...store.entries()]
    .filter(([k]) => k.startsWith(pid + '/'))
    .map(([k, data]) => ({ id: k.split('/')[1], data }));
  const fire = (pid) => {
    for (const cb of listeners.get(pid) || []) cb(rowsFor(pid));
  };

  return {
    store, fire,
    denyNextWrite(error) { nextWrite = error; },
    snapshotCount(pid) { return listeners.get(pid)?.size || 0; },

    functions() {
      const api = {
        doc(_db, collPath, id) { return { __path: collPath, __id: id }; },
        collection(_db, collPath) { return { __path: collPath }; },
        async setDoc(ref, data) {
          const patientId = ref.__path.split('/')[1];
          if (nextWrite) {
            const error = nextWrite;
            nextWrite = null;
            throw error;
          }
          store.set(patientId + '/' + ref.__id, JSON.parse(JSON.stringify(data)));
          fire(patientId);
          return true;
        },
        async getDocs(ref) {
          const rows = rowsFor(ref.__path.split('/')[1]);
          return { size: rows.length, forEach(cb) { rows.forEach(cb); } };
        },
        onSnapshot(ref, onNext, onError) {
          const patientId = ref.__path.split('/')[1];
          if (!listeners.has(patientId)) listeners.set(patientId, new Set());
          const wrapped = (rows) => onNext({
            size: rows.length,
            forEach(cb) { rows.forEach((r) => cb({ id: r.id, data: () => r.data })); },
          });
          listeners.get(patientId).add(wrapped);
          wrapped(rowsFor(patientId));
          return () => { listeners.get(patientId)?.delete(wrapped); };
        },
      };
      return api;
    },
  };
}

/* ── a minimal browser for the module ─────────────────────────── */

function makeComputer(server, { staff = {}, activePatient = '1001' } = {}) {
  const storage = new Map();
  const local = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  Object.defineProperty(local, 'length', { get: () => storage.size });
  Object.defineProperty(local, 'key', { value: (i) => [...storage.keys()][i] ?? null });

  function makeElement() {
  return {
    style: { cssText: '', setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {}, children: [], textContent: '', innerHTML: '', text: '',
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    remove() {}, setAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
    addEventListener() {}, removeEventListener() {}, querySelector: () => null,
    querySelectorAll: () => [], closest: () => null, click() {}, focus() {}, blur() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    scrollTop: 0, scrollIntoView() {},
  };
  }

  const listeners = new Map();
  const document = {
    readyState: 'complete', title: '', head: makeElement('head'), body: makeElement('body'), documentElement: makeElement('html'),
    activeElement: null,
    addEventListener(type, cb) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(cb); },
    removeEventListener() {},
    createElement: (tag) => makeElement(tag),
    createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: makeElement,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    write() {}, close() {},
  };

  const toasts = [];
  const window = {
    localStorage: local, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    document,
    location: { pathname: '/imaging-request.html', search: '?patient=' + activePatient, href: 'http://localhost/imaging-request.html?patient=' + activePatient, origin: 'http://localhost', replace() {}, assign() {} },
    firebaseDB: {}, firebaseFunctions: server.functions(),
    firebaseReady: true, currentStaff: staff,
    pcToast: (msg, kind) => toasts.push({ msg: String(msg), kind }),
    addEventListener(type, cb) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(cb); },
    removeEventListener() {},
    dispatchEvent(event) {
      for (const cb of listeners.get(event.type) || []) { try { cb(event); } catch (e) { /* page handler */ } }
      return true;
    },
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    getPatients: () => [{ id: '1001', mrn: '1001', firstName: 'Aline', lastName: 'Mukamana', dob: '1990-01-01', gender: 'Female' }],
    URLSearchParams, CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    Event: class { constructor(type) { this.type = type; } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    print() {}, open: () => null, scrollTo() {},
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'node' },
    PublicKeyCredential: undefined, credentials: undefined,
  };
  window.window = window;
  window.self = window;
  window.globalThis = window;

  const sandbox = {
    window, document, localStorage: local, sessionStorage: window.sessionStorage,
    location: window.location, navigator: window.navigator,
    setTimeout: (fn, ms) => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Promise,
    encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN,
    URLSearchParams, CustomEvent: window.CustomEvent, Event: window.Event,
    Intl, fetch: async () => { throw new Error('no network in tests'); },
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'pclinic-file.js' });

  return {
    pcFile: window.pcFile, window, localStorage: local, toasts,
    files: () => JSON.parse(local.getItem('pclinic_files') || '[]'),
    eventCount: (type) => (listeners.get(type) || new Set()).size,
  };
}

const tick = () => new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r))));

/* ── tests ────────────────────────────────────────────────────── */

test('a request saved on one computer is listed on another', async () => {
  const server = makeServer();
  const doctor = makeComputer(server, { staff: { name: 'Dr. Keza', role: 'doctor', staffId: '20001' } });
  const radiology = makeComputer(server, { staff: { name: 'R. Mugisha', role: 'radio', staffId: '45001' } });

  // Computer B starts out empty — this is the bug being fixed. (Lengths are
  // compared rather than arrays, because the module runs in its own vm realm
  // and its Array.prototype is not the test's.)
  assert.equal(radiology.pcFile.list('1001', 'imaging').length, 0, 'B should start empty');

  doctor.pcFile.save({
    type: 'imaging', patientId: '1001', patientName: 'Aline Mukamana',
    title: 'Imaging Request', modality: 'xr', exams: [{ name: 'Chest X-ray' }],
    reason: 'Persistent cough', priority: 'urgent',
  });
  await tick();

  const onA = doctor.pcFile.list('1001', 'imaging');
  assert.equal(onA.length, 1, 'A must see its own request');

  const onB = radiology.pcFile.list('1001', 'imaging');
  assert.equal(onB.length, 1, `B must see the request filed on A (got ${onB.length})`);
  assert.equal(onB[0].reason, 'Persistent cough');
  assert.equal(onB[0].priority, 'urgent');
  assert.equal(onB[0].by, 'Dr. Keza', 'the requesting clinician must survive the round trip');
  assert.equal(onB[0].id, onA[0].id, 'same record, not a duplicate');

  // Nothing was invented locally on B: its own store is still empty until the
  // confirmed server record is mirrored, and the mirror is the server's copy.
  assert.ok(server.store.has('1001/' + onA[0].id), 'record must exist on the server');
});

test('a live server change repaints an open page', async () => {
  const server = makeServer();
  const nurse = makeComputer(server, { staff: { name: 'N. Uwase', role: 'nurse', staffId: '30001' } });
  let sawCount = null;
  nurse.window.addEventListener('pcFilesUpdated', (e) => { sawCount = e.detail && e.detail.count; });

  nurse.pcFile.listenFiles('1001');
  await tick();

  const doctor = makeComputer(server, { staff: { name: 'Dr. Keza', role: 'doctor', staffId: '20001' } });
  doctor.pcFile.save({ type: 'imaging', patientId: '1001', reason: 'From the doctor', exams: [] });
  await tick();

  assert.ok(sawCount !== null, 'the open page never heard about the new record');
  assert.equal(sawCount, 1);
  assert.equal(nurse.pcFile.list('1001', 'imaging').length, 1, 'nurse list did not update');
});

test('a rejected write is reported instead of looking saved', async () => {
  const server = makeServer();
  const doctor = makeComputer(server, { staff: { name: 'Dr. Keza', role: 'doctor', staffId: '20001' } });
  server.denyNextWrite(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));

  const rec = doctor.pcFile.save({ type: 'imaging', patientId: '1001', reason: 'Denied', exams: [] });
  await tick();

  const stored = doctor.files().find((r) => String(r.id) === String(rec.id));
  assert.equal(stored._syncFailed, true, 'a denied save must be flagged');
  assert.match(stored._syncError, /permission-denied: Missing or insufficient permissions\./,
    'the machine reason must be readable, as in pclinic-orders.js');
  assert.equal(doctor.toasts.some((t) => t.kind === 'error' && /NOT saved to the common server/.test(t.msg)), true,
    'the clinician must be told the record is local-only');
  assert.equal(doctor.pcFile.fileSyncError('1001').includes('permission-denied'), true);

  // Still visible locally (the work is not lost) and retryable.
  assert.equal(doctor.pcFile.list('1001', 'imaging').length, 1);
  server.denyNextWrite(null);
  const ok = await doctor.pcFile.retryFileSync(rec.id);
  assert.equal(ok, true, 'retry after the permissions fix must succeed');
  assert.equal(doctor.files().find((r) => String(r.id) === String(rec.id))._syncFailed, undefined,
    'a successful retry must clear the failure flag');
});

test('an unreachable server keeps the clinic working offline', async () => {
  const server = makeServer();
  const doctor = makeComputer(server, { staff: { name: 'Dr. Keza', role: 'doctor', staffId: '20001' } });
  doctor.window.firebaseFunctions = null;      // no Firestore session at all

  const rec = doctor.pcFile.save({ type: 'imaging', patientId: '1001', reason: 'Offline', exams: [] });
  await tick();

  assert.equal(doctor.pcFile.list('1001', 'imaging').length, 1, 'offline work must not be blocked');
  assert.equal(doctor.files().find((r) => String(r.id) === String(rec.id))._syncFailed, true);
  assert.match(doctor.files().find((r) => String(r.id) === String(rec.id))._syncError, /offline/);
});

test('server-confirmed records are not duplicated by the local mirror', async () => {
  const server = makeServer();
  const doctor = makeComputer(server, { staff: { name: 'Dr. Keza', role: 'doctor', staffId: '20001' } });
  doctor.pcFile.save({ type: 'imaging', patientId: '1001', reason: 'Once only', exams: [] });
  await tick();
  await tick();

  const list = doctor.pcFile.list('1001', 'imaging');
  assert.equal(list.length, 1, `expected one record, got ${list.length}`);
  assert.equal(new Set(list.map((r) => String(r.id))).size, 1, 'ids must be unique after the mirror');
});

test('a data URL never reaches the server-shaped record, and list stays readable', async () => {
  const server = makeServer();
  const doctor = makeComputer(server, { staff: { name: 'Dr. Keza', role: 'doctor', staffId: '20001' } });
  doctor.pcFile.save({ type: 'imaging', patientId: '1001', reason: 'Plain', exams: [] });
  await tick();

  const [only] = [...server.store.values()];
  assert.equal(Object.prototype.hasOwnProperty.call(only, 'data'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(only, 'photo'), false);
  assert.equal(only.type, 'imaging');
  // Firestore Timestamps / nested structures must be JSON-safe for localStorage.
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(doctor.pcFile.list('1001', 'imaging'))));
});
