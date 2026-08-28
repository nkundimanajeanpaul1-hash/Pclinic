'use strict';

/*
 * tests/radiology-media-client.test.mjs
 *
 * Runs the real pclinic-radiology-media.js against a fake Storage/Firestore so
 * the client-side contract matches the Firestore rule exactly. The rule refuses
 * a record whose storagePath is not radiology/{orderId}/{id}.{ext}, so if this
 * module ever stops declaring `ext` or builds a different name, every upload
 * would fail in the clinic with an opaque permission-denied — this file is what
 * catches that here instead.
 *
 * Run:  npm --prefix tests run test:media
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'pclinic-radiology-media.js'), 'utf8');

const MB = 1024 * 1024;

function makeBackend({ failSetDoc = null } = {}) {
  const writes = [];
  const calls = [];
  const fetches = [];
  const window = {
    firebaseDB: {},
    firebaseFunctions: {
      doc: (db, coll, id) => ({ coll, id }),
      collection: (db, coll) => ({ coll }),
      query: (...a) => ({ q: a }),
      where: (f, op, v) => ({ f, op, v }),
      getDocs: async () => ({ size: 0, forEach() {} }),
      setDoc: async (ref, data) => {
        writes.push({ ref, data });
        if (failSetDoc) throw failSetDoc;
      },
    },
    firebaseAuth: { currentUser: { uid: 'uid-radio', getIdToken: async () => 'id-token-123' } },
    pclinicCloudFunctions: { call: async (name, data) => { calls.push({ name, data }); return { items: [] }; } },
    currentStaff: { uid: 'uid-radio', staffId: '45001', name: 'R. Mugisha', role: 'radio' },
    pcToast: null,
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return true; },
    history: { replaceState() {} },
    location: { pathname: '/radio-dashboard.html', search: '' },
    console, Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error,
    setTimeout, clearTimeout, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, replaceChildren() {} }) },
  };
  window.window = window;
  // One record per call: only the sandbox wrapper pushes, so a scenario that
  // swaps fetch.impl cannot double-count and break an "exactly once" assertion.
  const fetch = { impl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ name: 'ok' }), text: async () => '' }) };
  const sandbox = {
    window, console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error,
    Promise, setTimeout, clearTimeout,
    fetch: (url, init) => {
      fetches.push({ url, method: init && init.method, body: init && init.body, headers: init && init.headers });
      return fetch.impl(url, init);
    },
    Blob: globalThis.Blob, FormData: globalThis.FormData, URL,
    CustomEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
    history: window.history, location: window.location,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'pclinic-radiology-media.js' });
  return { media: window.pcRadioMedia, writes, calls, fetches, window, fetch };
}

const file = (over = {}) => ({ name: 'chest.jpg', type: 'image/jpeg', size: 2 * MB, ...over });

/** Same harness, but with a caller-supplied fetch so failures can be simulated. */
function makeBackendWithFetch(fetchImpl) {
  const harness = makeBackend();
  harness.fetch.impl = fetchImpl;
  return harness;
}

test('only the agreed formats and sizes are accepted', async () => {
  const { media } = makeBackend();
  assert.equal(media.inspect(file()).ok, true);
  for (const type of ['image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']) {
    assert.equal(media.inspect({ name: 'x', type, size: 1024 }).ok, true, `${type} must be accepted`);
  }
  for (const type of ['', 'image/svg+xml', 'application/dicom', 'video/quicktime', 'application/pdf']) {
    assert.equal(media.inspect({ name: 'x', type, size: 1024 }).ok, false, `${type} must be refused`);
  }
  // DICOM is called out by name, because that is what a radiographer will try first.
  assert.match(media.inspect({ name: 'study.dcm', type: '', size: 1024 }).reason, /DICOM|cannot be displayed/);
  assert.equal(media.inspect({ name: 'big.jpg', type: 'image/jpeg', size: 25 * MB + 1 }).ok, false, '25 MB+1 must be refused');
  assert.equal(media.inspect({ name: 'at-limit.jpg', type: 'image/jpeg', size: 25 * MB }).ok, true, 'exactly 25 MB must pass');
  assert.equal(media.inspect({ name: 'empty.jpg', type: 'image/jpeg', size: 0 }).ok, false);
  assert.equal(media.inspect(null).ok, false);
});

test('the object name matches what firestore.rules requires', async () => {
  const { media, writes } = makeBackend();
  const order = { id: 'rad-order-9', patientId: '1001', study: 'Chest X-ray' };
  const rec = await media.upload(order, file({ type: 'image/png', name: 'chest.png' }));

  assert.equal(rec.ext, 'png', 'the rule re-derives the path from ext; a missing ext denies every upload');
  assert.equal(rec.storagePath, `radiology/${order.id}/${rec.id}.png`);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.id, rec.id);
  assert.equal(writes[0].ref.coll, 'radiologyMedia');
  assert.equal(rec.patientId, '1001');
  assert.equal(rec.byUid, 'uid-radio', 'the rule requires byUid == request.auth.uid');
  assert.equal(rec.bytes, 2 * MB);
  assert.equal(rec.kind, 'image');
  assert.ok(!('data' in rec) && !('dataUrl' in rec), 'no inline bytes may ever be stored');
});

test('an unregistered upload is cleaned up instead of orphaned in the bucket', async () => {
  const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const { media, fetches } = makeBackend({ failSetDoc: denied });
  const order = { id: 'rad-order-7', patientId: '1001' };

  await assert.rejects(() => media.upload(order, file()), (error) => {
    assert.match(error.message, /record was rejected/, `got: ${error.message}`);
    assert.match(error.message, /firestore\.rules/, 'the user must be told the rules need deploying');
    return true;
  });

  const deletes = fetches.filter((f) => f.method === 'DELETE');
  assert.equal(deletes.length, 1, 'the uploaded object must be removed when its record is refused');
  assert.match(deletes[0].url, /storage\.googleapis\.com\/storage\/v1\/b\/pclinic-20d81\.appspot\.com\/o\/radiology%2Frad-order-7/,
    `unexpected cleanup URL: ${deletes[0].url}`);
  assert.equal(deletes[0].headers.Authorization, 'Bearer id-token-123');
});

test('a missing bucket is reported as an action, not a stack trace', async () => {
  // Storage is not enabled on the project: the very first PUT answers 404.
  const harness = makeBackendWithFetch(async () => ({
    ok: false, status: 404, text: async () => '<html>404 Page not found</html>', json: async () => ({}),
  }));
  const err = await harness.media.upload({ id: 'o1', patientId: '1' }, file()).then(() => null, (e) => e);
  assert.match(err.message, /Firebase Storage is not enabled/);
  assert.equal(harness.writes.length, 0, 'nothing may be recorded when the object did not land');
});

test('a CORS-rejected single-shot upload retries as a resumable session', async () => {
  let n = 0;
  const harness = makeBackendWithFetch(async (url, init) => {
    n += 1;
    if (n === 1) return { ok: false, status: 400, text: async () => 'CORS preflight origin not allowed', json: async () => ({}) };
    if (String(init.method) === 'POST') {
      return { ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === 'location' ? 'https://session/upload/1' : null) }, json: async () => ({}) };
    }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ name: 'ok' }), text: async () => '' };
  });
  await harness.media.upload({ id: 'o2', patientId: '1' }, file());
  assert.ok(n >= 3, `expected a start + PUT round trip, got ${n} fetches`);
  assert.equal(harness.writes.length, 1, 'the record is filed after the retry succeeds');
});

test('a signed URL request goes through the callable, never the bucket', async () => {
  const { media, calls } = makeBackend();
  await media.urlsFor('rad-order-9');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'radiologyMediaSign');
  assert.equal(calls[0].data.orderId, 'rad-order-9');
});

test('removal is refused locally for someone else\'s file before any call is made', async () => {
  const { media, calls } = makeBackend();
  const err = await media.remove({ id: 'rmed-x', byUid: 'uid-other' }).then(() => null, (e) => e);
  assert.match(err.message, /Only the person who uploaded/);
  assert.equal(calls.length, 0, 'no network call may happen for a request the rules will deny');
});

test('without a signed-in session nothing is uploaded', async () => {
  const harness = makeBackend();
  harness.window.firebaseAuth.currentUser = null;
  const err = await harness.media.upload({ id: 'o1', patientId: '1' }, file()).then(() => null, (e) => e);
  assert.match(err.message, /session expired/i);
  assert.equal(harness.fetches.length, 0, 'no PUT may be attempted without a token');
});

test('without the common server the work is refused clearly, not queued blindly', async () => {
  const harness = makeBackend();
  harness.window.firebaseDB = null;
  const err = await harness.media.upload({ id: 'o1', patientId: '1' }, file()).then(() => null, (e) => e);
  assert.match(err.message, /Sign in and wait for the common server/);
  assert.equal(harness.fetches.length, 0);
});
