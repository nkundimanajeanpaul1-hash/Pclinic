// Unit tests for pclinic-radiology-annotations.js — the browser module that
// stores workstation drawings / key-image flags / notes in Firestore.
// Runs against a tiny in-memory fake of window.firebaseFunctions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = await readFile(resolve(here, '..', 'pclinic-radiology-annotations.js'), 'utf8');

function fakeFirestore() {
  const store = {}; const listeners = []; const log = [];
  function rows(col) { return Object.values(store[col] || {}); }
  function snap(list) { return { size: list.length, forEach: (fn) => list.forEach((r) => fn({ id: r.id, data: () => JSON.parse(JSON.stringify(r)) })) }; }
  function notify() { listeners.forEach((l) => l()); }
  const f = {
    collection: (db, name) => ({ col: name }),
    doc: (db, name, id) => ({ col: name, id }),
    query: (col, w) => ({ col: col.col, where: w }),
    where: (field, op, value) => ({ field, value }),
    onSnapshot: (q, ok, err) => {
      const l = () => { try { ok(snap(rows(q.col).filter((r) => !q.where || String(r[q.where.field]) === String(q.where.value)))); } catch (e) { err && err(e); } };
      listeners.push(l); setTimeout(l, 0); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    },
    setDoc: async (ref, data) => { log.push(['set', ref.id]); if (f.failWith) throw new Error(f.failWith); store[ref.col] = store[ref.col] || {}; store[ref.col][ref.id] = JSON.parse(JSON.stringify(data)); notify(); },
    deleteDoc: async (ref) => { log.push(['delete', ref.id]); if (store[ref.col]) delete store[ref.col][ref.id]; notify(); },
    failWith: null
  };
  return { f, store, log };
}

function boot({ role = 'doctor', uid = 'doc-1', name = 'Dr Alice', backend = true } = {}) {
  const fs = fakeFirestore();
  const listeners = {};
  const win = {
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((x) => x !== fn); },
    dispatchEvent: (e) => { (listeners[e.type] || []).forEach((fn) => fn(e)); },
    currentStaff: { staffId: 'S1', name, role },
    firebaseAuth: { currentUser: { uid } },
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  if (backend) { win.firebaseDB = {}; win.firebaseFunctions = fs.f; }
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(src, ctx);
  return { A: win.pcRadioAnnotations, win, fs };
}

// Objects born inside the vm realm have foreign prototypes; clone before deep-comparing.
const J = (v) => JSON.parse(JSON.stringify(v));
const MEAS = { tool: 'Length', uuid: 'u1', frame: 0, json: JSON.stringify({ handles: { start: { x: 1, y: 1 }, end: { x: 5, y: 5 } }, length: 3.2 }) };

test('module exposes the API and knows who is writing', () => {
  const { A } = boot();
  assert.equal(typeof A.save, 'function'); assert.equal(typeof A.subscribe, 'function');
  assert.deepEqual(J(A.me()), { uid: 'doc-1', staffId: 'S1', name: 'Dr Alice', role: 'doctor' });
  assert.equal(A.canWrite(), true);
  assert.equal(A.docId('m-1', 'doc-1'), 'm-1_doc-1');
});

test('only doctor / radio / admin may write; nurse and signed-out users cannot', () => {
  assert.equal(boot({ role: 'nurse' }).A.canWrite(), false);
  assert.equal(boot({ role: 'radio' }).A.canWrite(), true);
  assert.equal(boot({ role: 'admin' }).A.canWrite(), true);
  assert.equal(boot({ role: 'lab' }).A.canWrite(), false);
  assert.equal(boot({ uid: '' }).A.canWrite(), false);
});

test('sanitizeMeasurements drops malformed entries, unknown tools and oversized JSON', () => {
  const { A } = boot();
  const out = A.sanitizeMeasurements([
    MEAS,
    { tool: 'Nuke', uuid: 'x', frame: 0, json: '{}' },            // unknown tool
    { tool: 'Angle', uuid: 'a', frame: -3, json: '{"a":1}' },      // negative frame → 0
    { tool: 'Length', json: 'not json' },                          // bad json
    { tool: 'Length', json: '"just a string"' },                   // not an object
    { tool: 'Probe', uuid: 'p', frame: 2.7, json: '{"x":1}' },     // fractional frame → 2
    null, 'garbage',
    { tool: 'Length', uuid: 'big', frame: 0, json: '{"pad":"' + 'x'.repeat(70000) + '"}' }
  ]);
  assert.deepEqual(J(out.map((m) => [m.tool, m.uuid, m.frame])), [['Length', 'u1', 0], ['Angle', 'a', 0], ['Probe', 'p', 2]]);
  assert.equal(A.sanitizeMeasurements('nope').length, 0);
});

test('isEmpty: no drawings, no key flag, blank note', () => {
  const { A } = boot();
  assert.equal(A.isEmpty({ measurements: [], keyImage: false, note: '   ' }), true);
  assert.equal(A.isEmpty({ measurements: [MEAS], keyImage: false, note: '' }), false);
  assert.equal(A.isEmpty({ measurements: [], keyImage: true, note: '' }), false);
  assert.equal(A.isEmpty({ measurements: [], keyImage: false, note: 'seen' }), false);
});

test('save writes one document per image per author with the author stamped from the session', async () => {
  const { A, fs } = boot();
  const r = await A.save({ mediaId: 'm-1', orderId: 'ord-1', patientId: 1001, measurements: [MEAS], keyImage: true, note: 'x'.repeat(5000) });
  assert.equal(r.id, 'm-1_doc-1'); assert.equal(r.deleted, false);
  const d = fs.store.radiologyAnnotations['m-1_doc-1'];
  assert.equal(d.byUid, 'doc-1'); assert.equal(d.byName, 'Dr Alice'); assert.equal(d.byRole, 'doctor'); assert.equal(d.byId, 'S1');
  assert.equal(d.patientId, '1001', 'patientId is stored as a string like radiologyMedia');
  assert.equal(d.orderId, 'ord-1'); assert.equal(d.keyImage, true);
  assert.equal(d.note.length, 4000, 'note is capped at 4000 characters');
  assert.equal(d.measurements.length, 1); assert.equal(d.client, 'pcdv/1');
  assert.match(d.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(d).sort(), ['byId', 'byName', 'byRole', 'byUid', 'client', 'id', 'keyImage', 'measurements', 'mediaId', 'note', 'orderId', 'patientId', 'updatedAt'], 'exactly the keys firestore.rules allows');
});

test('saving an empty entry removes the document instead of storing an empty shell', async () => {
  const { A, fs } = boot();
  await A.save({ mediaId: 'm-1', orderId: 'ord-1', patientId: '1001', measurements: [MEAS], keyImage: false, note: '' });
  assert.ok(fs.store.radiologyAnnotations['m-1_doc-1']);
  const r = await A.save({ mediaId: 'm-1', orderId: 'ord-1', patientId: '1001', measurements: [], keyImage: false, note: '' });
  assert.equal(r.deleted, true);
  assert.equal(fs.store.radiologyAnnotations['m-1_doc-1'], undefined);
  assert.deepEqual(fs.log, [['set', 'm-1_doc-1'], ['delete', 'm-1_doc-1']]);
});

test('save refuses clearly, in plain language, when it cannot proceed', async () => {
  await assert.rejects(boot({ role: 'nurse' }).A.save({ mediaId: 'm', orderId: 'o', measurements: [] , keyImage: true }), /doctors and radiology only/);
  await assert.rejects(boot({ uid: '' }).A.save({ mediaId: 'm', orderId: 'o', measurements: [], keyImage: true }), /Sign in again/);
  await assert.rejects(boot({ backend: false }).A.save({ mediaId: 'm', orderId: 'o', measurements: [], keyImage: true }), /not connected/);
  await assert.rejects(boot().A.save({ orderId: 'o' }), /Nothing to save/);
  const denied = boot(); denied.fs.f.failWith = 'Missing or insufficient permissions.';
  await assert.rejects(denied.A.save({ mediaId: 'm', orderId: 'o', measurements: [], keyImage: true }), /refused the save \(permission\)/);
  const offline = boot(); offline.fs.f.failWith = 'Failed to get document because the client is offline.';
  await assert.rejects(offline.A.save({ mediaId: 'm', orderId: 'o', measurements: [], keyImage: true }), /No connection/);
});

test('subscribe streams every author for one study, sanitised, oldest first', async () => {
  const { A, fs } = boot();
  fs.store.radiologyAnnotations = {
    'm-1_doc-1': { id: 'm-1_doc-1', mediaId: 'm-1', orderId: 'ord-1', byUid: 'doc-1', byName: 'Dr Alice', measurements: [MEAS, { tool: 'Bogus', json: '{}' }], keyImage: 1, note: null, updatedAt: '2026-09-02T10:00:00Z' },
    'm-1_rad-1': { id: 'm-1_rad-1', mediaId: 'm-1', orderId: 'ord-1', byUid: 'rad-1', byName: 'Bob', measurements: [], keyImage: false, note: 'ok', updatedAt: '2026-09-02T09:00:00Z' },
    'm-9_rad-1': { id: 'm-9_rad-1', mediaId: 'm-9', orderId: 'ord-OTHER', byUid: 'rad-1', measurements: [], keyImage: true, note: '', updatedAt: '2026-09-02T11:00:00Z' }
  };
  const seen = [];
  const stop = A.subscribe('ord-1', (rows, err) => seen.push({ rows, err }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen.length, 1); assert.equal(seen[0].err, null);
  assert.deepEqual(J(seen[0].rows.map((r) => r.id)), ['m-1_rad-1', 'm-1_doc-1'], 'sorted by updatedAt, other studies excluded');
  const mine = seen[0].rows[1];
  assert.equal(mine.measurements.length, 1, 'bogus tool dropped'); assert.equal(mine.keyImage, true); assert.equal(mine.note, '');
  // a later write reaches the subscriber
  await A.save({ mediaId: 'm-1', orderId: 'ord-1', patientId: '1001', measurements: [], keyImage: true, note: 'late' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(seen.length, 2); assert.equal(seen[1].rows.filter((r) => r.id === 'm-1_doc-1')[0].note, 'late');
  stop();
  await A.save({ mediaId: 'm-1', orderId: 'ord-1', patientId: '1001', measurements: [], keyImage: false, note: 'after stop' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(seen.length, 2, 'unsubscribed listener is silent');
});

test('subscribe before the backend is ready waits for firebaseReady instead of failing', async () => {
  const { A, win, fs } = boot({ backend: false });
  const seen = [];
  A.subscribe('ord-1', (rows, err) => seen.push({ rows, err }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen.length, 0, 'nothing yet');
  win.firebaseDB = {}; win.firebaseFunctions = fs.f; win.dispatchEvent({ type: 'firebaseReady' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen.length, 1); assert.equal(seen[0].err, null); assert.deepEqual(J(seen[0].rows), []);
});
