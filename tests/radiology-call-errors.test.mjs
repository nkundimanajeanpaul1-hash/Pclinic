'use strict';

/*
 * tests/radiology-call-errors.test.mjs
 *
 * The radiology worklist's "Start study"/"Acquire" buttons call the
 * radiologyTransition Cloud Function. When that function is not deployed the
 * callable SDK rejects with the bare platform code, and radio-dashboard.js
 * shows error.message — producing a toast that read only "internal" and gave
 * the radiographer nothing to act on.
 *
 * pclinic-radiology.js now wraps every callable rejection with a readable
 * reason, following labReleaseErrorMessage() in pclinic-lab.js. These tests run
 * the real module and assert on what the user would actually see.
 *
 * Run:  npm --prefix tests run test:call-errors
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'pclinic-radiology.js'), 'utf8');

/** Load the real module against a fake callable whose outcome is supplied. */
function load(callImpl) {
  const events = [];
  const window = {
    firebaseReady: true,
    firebaseDB: {},
    firebaseFunctions: {},
    currentStaff: { uid: 'u', role: 'radio', staffId: '45001', name: 'Test Radiologist', active: true },
    pclinicCloudFunctions: { region: 'africa-south1', call: callImpl },
    addEventListener() {}, removeEventListener() {},
    dispatchEvent(event) { events.push(event); return true; },
    setTimeout, clearTimeout,
    console, Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  window.window = window;
  const sandbox = {
    window, console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error,
    Promise, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'pclinic-radiology.js' });
  return { pcRadiology: window.pcRadiology, events };
}

const rejectWith = (code, message) => () => Promise.reject(
  Object.assign(new Error(message || code), { code }));

test('"internal" from a missing callable is explained, not echoed', async () => {
  const { pcRadiology } = load(rejectWith('functions/internal', 'internal'));
  const error = await pcRadiology.transition('ord-1', 'start', '').then(
    () => null, (e) => e);

  assert.ok(error, 'the rejection must still propagate — never swallow it');
  assert.match(error.message, /radiologyTransition is not deployed to Firebase project pclinic-20d81/,
    `toast must not hedge once the platform gives a bare 404: "${error.message}"`);
  assert.match(error.message, /africa-south1-radiologyTransition/,
    'the message must name the Cloud Run service to look for');
  assert.match(error.message, /firebase deploy --only functions/, 'the message must name the fix');
  assert.match(error.message, /nothing was saved/, 'staff must know the study did not move');
  assert.equal(error.code, 'functions/internal', 'the machine code is kept for log-based debugging');
  assert.ok(error.cause, 'the original error must remain reachable for the console');
});

test('a deployed-but-crashing function is not reported as a missing deploy', async () => {
  // A real crash reaches the JSON error path, so code and message are distinct.
  const { pcRadiology } = load(rejectWith('functions/internal',
    'Function error: TypeError: Cannot read properties of undefined (reading \'patientId\')'));
  const error = await pcRadiology.transition('ord-1', 'start', '').then(() => null, (e) => e);
  assert.match(error.message, /reached the server but failed to run/);
  assert.doesNotMatch(error.message, /is not deployed/, 'a crash must not be mislabelled as a missing function');
});

test('the three shapes of a missing endpoint all read as "not deployed"', async () => {
  const shapes = [
    ['functions/internal', 'FirebaseError: functions/internal'],
    ['functions/internal', 'internal'],
    [undefined, '<html><head><title>404 Page not found</title></head></html>'],
  ];
  for (const [code, raw] of shapes) {
    const { pcRadiology } = load(() => Promise.reject(Object.assign(new Error(raw), code ? { code } : {})));
    const error = await pcRadiology.transition('ord-1', 'start', '').then(() => null, (e) => e);
    assert.match(error.message, /is not deployed to Firebase project pclinic-20d81/,
      `shape "${raw}" was misread: ${error.message}`);
  }
});

test('a genuine crash whose text contains 404 is not called a missing deploy', async () => {
  // Regression: an unanchored /404/ matched the "404" inside "TypeError".
  const { pcRadiology } = load(rejectWith('functions/internal',
    'Error 14 at node:120 in TypeError: failed to load firestore, retry code 404'));
  const error = await pcRadiology.transition('ord-1', 'start', '').then(() => null, (e) => e);
  assert.match(error.message, /reached the server but failed to run/);
  assert.doesNotMatch(error.message, /is not deployed/);
});

test('an unrecognised error is summarised, and never handed to the toast as markup', async () => {
  const { pcRadiology } = load(rejectWith('functions/internal',
    '<html><body>some proxy page</body></html>'));
  const error = await pcRadiology.transition('ord-1', 'start', '').then(() => null, (e) => e);
  assert.doesNotMatch(error.message, /</, `raw markup reached the UI: ${error.message}`);
  assert.match(error.message, /radiologyTransition/);
});

test('a not-found code names the function and carries the deploy command', async () => {
  const { pcRadiology } = load(rejectWith('functions/not-found', 'NOT_FOUND'));
  const error = await pcRadiology.saveDraft('ord-1', {}).then(() => null, (e) => e);
  assert.match(error.message, /radiologySaveDraft is not deployed to Firebase project/,
    `got: "${error.message}"`);
  assert.match(error.message, /firebase deploy --only functions/,
    'every missing-function message must carry the command, not just advice');
  // An explicit unimplemented code keeps its own wording.
  const other = load(rejectWith('functions/unimplemented', 'unimplemented'));
  const e2 = await other.pcRadiology.finalize('ord-1', {}).then(() => null, (e) => e);
  assert.match(e2.message, /reached the server but failed to run|does not exist/);
});

test('session and network failures keep their own distinct advice', async () => {
  const denied = load(rejectWith('functions/permission-denied',
    'Missing or insufficient permissions.'));
  const e1 = await denied.pcRadiology.finalize('ord-1', {}).then(() => null, (e) => e);
  assert.match(e1.message, /not permitted to perform this radiology action/);
  assert.match(e1.message, /active Radiology role/);

  const expired = load(rejectWith('functions/unauthenticated', 'auth/expired'));
  const e2 = await expired.pcRadiology.acknowledgeCritical('rad_ord-1').then(() => null, (e) => e);
  assert.match(e2.message, /session expired/i);

  const offline = load(() => Promise.reject(new TypeError('Failed to fetch')));
  const e3 = await offline.pcRadiology.transition('ord-1', 'acquire', '').then(() => null, (e) => e);
  assert.match(e3.message, /unreachable from this computer/);
});

test('a real server-side reason (failed-precondition) is passed through untouched', async () => {
  const { pcRadiology } = load(rejectWith('functions/failed-precondition',
    'Complete image acquisition before writing a report.'));
  const error = await pcRadiology.saveDraft('ord-1', {}).then(() => null, (e) => e);
  assert.equal(error.message, 'Complete image acquisition before writing a report.',
    'clinically meaningful messages must not be rewritten into boilerplate');
});

test('a successful call is unaffected', async () => {
  const seen = [];
  // window.pclinicCloudFunctions.call already unwraps the callable envelope
  // (firebase-config.js returns response.data), so it resolves with the payload.
  const { pcRadiology } = load((name, payload) => {
    seen.push({ name, payload });
    return Promise.resolve({ orderId: 'ord-1', state: 'in-progress' });
  });
  const out = await pcRadiology.transition('ord-1', 'start', '');
  assert.deepEqual(out, { orderId: 'ord-1', state: 'in-progress' });
  assert.equal(seen[0].name, 'radiologyTransition');
  assert.equal(seen[0].payload.reason, '', 'an absent reason is normalised, not forwarded as undefined');
});
