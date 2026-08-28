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
  assert.match(error.message, /radiologyTransition is not deployed, is unreachable, or crashed/,
    `toast still unhelpful: "${error.message}"`);
  assert.match(error.message, /firebase deploy --only functions/, 'the message must name the fix');
  assert.match(error.message, /nothing was saved/, 'staff must know the study did not move');
  assert.equal(error.code, 'functions/internal', 'the machine code is kept for log-based debugging');
  assert.ok(error.cause, 'the original error must remain reachable for the console');
});

test('a not-deployed endpoint is distinguished from a crash', async () => {
  const { pcRadiology } = load(rejectWith('functions/not-found', 'NOT_FOUND'));
  const error = await pcRadiology.saveDraft('ord-1', {}).then(() => null, (e) => e);
  assert.match(error.message, /radiologySaveDraft does not exist in Firebase project/,
    `got: "${error.message}"`);
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
