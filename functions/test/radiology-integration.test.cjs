'use strict';

/*
 * Emulator integration tests for the radiology Cloud Functions
 * (functions/index.js: radiologyTransition, radiologySaveDraft,
 * radiologyFinalize, radiologyAddendum, radiologyAcknowledgeCritical).
 *
 * Run them through the emulator so the callables execute their real
 * requireStaff() authorization and their real Firestore transactions:
 *
 *   npm --prefix functions run test:emulator
 *
 * How the harness works, and why:
 *  - Staff are represented by self-minted unsigned JWTs sent as
 *    Authorization: Bearer against the Functions emulator, which decodes
 *    tokens without checking signatures in emulator mode. That makes every
 *    uid deterministic (so /users/{uid} profiles can be seeded up front) and
 *    needs no Auth emulator, service account or API key.
 *  - Callables are invoked over plain HTTP rather than through the client
 *    SDK, so an "unauthenticated caller" case is just a request without a
 *    header, and failures surface as the exact status code to assert on.
 *  - Documents are seeded/cleared through env.withSecurityRulesDisabled()
 *    (Admin-equivalent bypass); the repo's real firestore.rules is loaded, so
 *    the assert.rejects() cases prove what a browser is genuinely denied.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} = require('firebase/firestore');

const PROJECT = 'demo-pclinic';
const FUNCTIONS_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5001);
const FIRESTORE_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);
const RULES_PATH = resolve(__dirname, '..', '..', 'firestore.rules');
// Numeric google.rpc.Status codes the emulator may return instead of names.
const STATUS_CODES = {
  0: 'ok', 1: 'cancelled', 2: 'unknown', 3: 'invalid-argument',
  4: 'deadline-exceeded', 5: 'not-found', 6: 'already-exists',
  7: 'permission-denied', 8: 'resource-exhausted', 9: 'failed-precondition',
  10: 'aborted', 11: 'out-of-range', 12: 'unimplemented', 13: 'internal',
  14: 'unavailable', 15: 'data-loss', 16: 'unauthenticated',
};

const ACTORS = {
  admin: { uid: 'uid-admin', staffId: '90000000', name: 'Test Admin', role: 'admin', active: true },
  radio: { uid: 'uid-radio', staffId: '90000010', name: 'Test Radiologist', role: 'radio', active: true },
  doctor: { uid: 'uid-doctor', staffId: '90000001', name: 'Test Doctor', role: 'doctor', active: true },
  otherDoctor: { uid: 'uid-other-doctor', staffId: '90000004', name: 'Other Doctor', role: 'doctor', active: true },
  nurse: { uid: 'uid-nurse', staffId: '90000002', name: 'Test Nurse', role: 'nurse', active: true },
  inactiveRadio: { uid: 'uid-radio-inactive', staffId: '90000003', name: 'Inactive Radiologist', role: 'radio', active: false },
};

let env;
const openContexts = new Set();

function tokenFor(uid) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    user_id: uid, sub: uid, uid,
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`,
    iat: now, exp: now + 3600,
    firebase: { identities: {}, sign_in_provider: 'anonymous' },
  })}.`;
}

function normalizeCode(raw) {
  const text = String(raw);
  if (STATUS_CODES[text]) return STATUS_CODES[text];
  return text.toLowerCase().replace(/_/g, '-').replace(/^https?:\/\//, '');
}

async function call(name, data, actorKey = 'radio') {
  const headers = { 'Content-Type': 'application/json' };
  if (actorKey !== null) headers.Authorization = `Bearer ${tokenFor(ACTORS[actorKey].uid)}`;
  let response;
  try {
    response = await fetch(
      `http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT}/africa-south1/${name}`,
      { method: 'POST', headers, body: JSON.stringify({ data }) },
    );
  } catch (error) {
    return { code: 'transport-error', message: String(error) };
  }
  const body = await response.json().catch(() => ({}));
  if (body && body.result !== undefined) return { code: null, result: body.result };
  const error = (body && body.error) || {};
  return {
    code: normalizeCode(error.status || error.code || response.status),
    message: String(error.message || JSON.stringify(body)).slice(0, 400),
    result: error.details || null,
  };
}

function imagingOrder(overrides) {
  return {
    id: 'rad-order-1',
    dept: 'radiology',
    type: 'imaging',
    patientId: '1001',
    patientName: 'Aline Test',
    status: 'pending',
    priority: 'routine',
    study: 'Chest X-ray',
    notes: 'Persistent cough',
    orderedBy: 'Test Doctor',
    orderedById: ACTORS.doctor.staffId,
    orderedAt: '2026-08-27T08:00:00.000Z',
    items: [{ name: 'Chest X-ray' }],
    ...overrides,
  };
}

/**
 * A signed-in browser session for the rules-enforcement assertions. The
 * context is retained so test.after() can close it: an open Firestore
 * connection keeps the Node process alive and the test run would hang.
 */
function dbFor(actorKey) {
  const context = env.authenticatedContext(ACTORS[actorKey].uid);
  openContexts.add(context);
  return context.firestore();
}

async function write(collectionName, id, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), collectionName, id), data);
  });
}

/** Read through the Admin-equivalent bypass: what the store really holds. */
async function readRaw(collectionName, id) {
  let value;
  await env.withSecurityRulesDisabled(async (ctx) => {
    value = (await getDoc(doc(ctx.firestore(), collectionName, id))).data();
  });
  return value === undefined ? null : value;
}

async function findRaw(collectionName, field, equal) {
  let rows;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(query(collection(ctx.firestore(), collectionName), where(field, '==', equal)));
    rows = snap.docs.map((d) => d.data());
  });
  return rows;
}

/**
 * Empty the emulator database between tests. env.clearFirestore() is the
 * documented reset (a REST delete of every document in the project), so it
 * also removes the auditLog and messages rows created by the callables.
 */
async function resetStore() {
  await env.clearFirestore();
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: FIRESTORE_PORT },
  });
});

test.after(async () => {
  for (const context of openContexts) context.cleanup();
  openContexts.clear();
  if (env) await env.cleanup();
});

test.beforeEach(async () => {
  await resetStore();
  // staffId must satisfy the rules' ^[0-9]{1,20}$ pattern and be unique per
  // actor, because departmentMayUpdateOrder() trusts it as the order owner.
  for (const record of Object.values(ACTORS)) {
    await write('users', record.uid, {
      staffId: record.staffId, name: record.name, role: record.role,
      active: record.active, createdAt: 'test', createdBy: 'test',
    });
  }
  await write('patients', '1001', {
    id: '1001', mrn: '1001', firstName: 'Aline', lastName: 'Test',
    createdById: ACTORS.doctor.staffId, createdAt: '2026-08-01T08:00:00.000Z',
  });
  await write('orders', 'rad-order-1', imagingOrder({}));
});

/* ── workflow ─────────────────────────────────────────────────── */

test('a radiologist walks the study from order to signed report', async () => {
  const start = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' });
  assert.equal(start.code, null, `start failed: ${start.message}`);
  assert.equal(start.result.state, 'in-progress');
  assert.equal((await readRaw('orders', 'rad-order-1')).status, 'in-progress');

  // Acquisition cannot be skipped, so a draft is refused while in-progress.
  const tooEarly = await call('radiologySaveDraft', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Effusion' },
  });
  assert.equal(tooEarly.code, 'failed-precondition');
  assert.match(tooEarly.message, /Complete image acquisition/);

  const acquire = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'acquire' });
  assert.equal(acquire.code, null, `acquire failed: ${acquire.message}`);
  assert.equal(acquire.result.state, 'acquired');

  const draft = await call('radiologySaveDraft', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Right effusion.', impression: '' },
  });
  assert.equal(draft.code, null, `draft failed: ${draft.message}`);
  assert.equal(draft.result.reportId, 'rad_rad-order-1');
  let report = await readRaw('radiologyReports', draft.result.reportId);
  assert.equal(report.status, 'draft');
  // A draft must never look signed, and the order points at exactly one report.
  assert.equal(report.signedByUid, undefined);
  assert.equal((await readRaw('orders', 'rad-order-1')).reportId, 'rad_rad-order-1');

  const final = await call('radiologyFinalize', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Right effusion.', impression: 'Moderate right pleural effusion.' },
  });
  assert.equal(final.code, null, `finalize failed: ${final.message}`);
  assert.equal(final.result.status, 'final');

  const order = await readRaw('orders', 'rad-order-1');
  assert.equal(order.radiologyState, 'reported');
  assert.equal(order.status, 'completed');
  assert.equal(order.result.impression, 'Moderate right pleural effusion.');

  report = await readRaw('radiologyReports', draft.result.reportId);
  assert.equal(report.status, 'final');
  // The signature comes from the verified caller, never from the payload.
  assert.equal(report.signedByUid, ACTORS.radio.uid);
  assert.equal(report.signedById, ACTORS.radio.staffId);
  assert.equal(report.createdByUid, ACTORS.radio.uid);
  assert.equal(report.version, 1);

  // The requesting clinician is notified through the message queue.
  const messages = await findRaw('messages', 'toStaffId', ACTORS.doctor.staffId);
  assert.equal(messages.length, 1, `expected one notification, got ${JSON.stringify(messages)}`);
  assert.match(messages[0].text, /Radiology report finalised/);
  assert.equal(messages[0].priority, 'normal');
});

test('every step is recorded in an audit log no client can forge', async () => {
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' });
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'acquire' });
  await call('radiologyFinalize', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Normal.', impression: 'Normal study.' },
  });

  const transitions = await findRaw('auditLog', 'resourceType', 'order');
  const actions = (await getAuditActions()).sort();
  assert.deepEqual(actions, [
    'radiology.order.acquire',
    'radiology.order.start',
    'radiology.report.finalise',
  ]);
  assert.equal(transitions.length, 2);
  assert.equal(transitions[0].actorUid, ACTORS.radio.uid);
  assert.equal(transitions[0].actorStaffId, ACTORS.radio.staffId);
  assert.equal(transitions[0].actorRole, 'radio');
  assert.equal(transitions[0].patientId, '1001');

  // A nurse must not even be able to read the trail...
  await assert.rejects(getDocs(collection(dbFor('nurse'), 'auditLog')));
  // ...and no clinical role may write one.
  await assert.rejects(setDoc(doc(dbFor('radio'), 'auditLog', 'fake-entry'), {
    action: 'radiology.report.finalise', actorRole: 'radio', resourceId: 'rad_rad-order-1',
  }));
});

async function getAuditActions() {
  const rows = await findRaw('auditLog', 'actorUid', ACTORS.radio.uid);
  return rows.map((row) => row.action);
}

/* ── immutability and addenda ─────────────────────────────────── */

test('a final report is immutable and can only be amended by addendum', async () => {
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' });
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'acquire' });
  await call('radiologyFinalize', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Normal.', impression: 'Normal study.' },
  });

  // The primary guard is the workflow state: a reported study is closed for
  // editing, so no draft write is attempted at all.
  const rewrite = await call('radiologySaveDraft', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Rewritten silently.', impression: 'Rewritten.' },
  });
  assert.equal(rewrite.code, 'failed-precondition');
  assert.match(rewrite.message, /Complete image acquisition/);

  const report = await readRaw('radiologyReports', 'rad_rad-order-1');
  assert.equal(report.findings, 'Normal.', 'signed findings were altered');
  assert.equal(report.impression, 'Normal study.');

  const missingParts = await call('radiologyAddendum', {
    reportId: 'rad_rad-order-1',
    text: 'Small pneumothorax seen on review.',
  });
  assert.equal(missingParts.code, 'invalid-argument', 'an addendum without a reason was accepted');

  const addendum = await call('radiologyAddendum', {
    reportId: 'rad_rad-order-1',
    text: 'Small pneumothorax seen on review.',
    reason: 'Second reader discrepancy',
  });
  assert.equal(addendum.code, null, `addendum failed: ${addendum.message}`);
  const record = await readRaw('radiologyAddenda', addendum.result.addendumId);
  assert.equal(record.status, 'final');
  assert.equal(record.reportId, 'rad_rad-order-1');
  assert.equal(record.orderId, 'rad-order-1');
  assert.equal(record.patientId, '1001');
  assert.equal(record.text, 'Small pneumothorax seen on review.');
  assert.equal(record.signedByUid, ACTORS.radio.uid);
  assert.match(record.reason, /Second reader discrepancy/);
  // The original report document is untouched by the addendum.
  assert.equal((await readRaw('radiologyReports', 'rad_rad-order-1')).findings, 'Normal.');

  // The immutability guard is independent of the state check: even if the
  // order were reopened to an editable state, a final report still cannot be
  // overwritten — it can only be amended.
  await write('orders', 'rad-order-1', imagingOrder({ radiologyState: 'acquired', status: 'in-progress' }));
  const reopened = await call('radiologySaveDraft', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Rewritten silently.', impression: 'Rewritten.' },
  });
  assert.equal(reopened.code, 'failed-precondition');
  assert.match(reopened.message, /final report is immutable/);
  assert.equal((await readRaw('radiologyReports', 'rad_rad-order-1')).findings, 'Normal.',
    'a reopened order let a final report be rewritten');

  // An addendum can never be attached to a draft.
  await write('orders', 'rad-order-2', imagingOrder({ id: 'rad-order-2', radiologyState: 'acquired' }));
  const draftOnly = await call('radiologySaveDraft', {
    orderId: 'rad-order-2',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Draft.' },
  });
  const draftAddendum = await call('radiologyAddendum', {
    reportId: draftOnly.result.reportId, text: 'Too early.', reason: 'testing',
  });
  assert.equal(draftAddendum.code, 'failed-precondition');
  assert.match(draftAddendum.message, /only be attached to final reports/);
});

test('replaying a transition is idempotent rather than duplicated', async () => {
  const first = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' });
  const second = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' });
  assert.equal(first.result.alreadyApplied, undefined);
  assert.equal(second.result.alreadyApplied, true);
  assert.equal(second.result.state, 'in-progress');

  const order = await readRaw('orders', 'rad-order-1');
  assert.equal(order.history.length, 1, `history grew on retry: ${JSON.stringify(order.history)}`);

  const cancel = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'cancel', reason: 'Patient left' });
  assert.equal(cancel.code, null, `cancel failed: ${cancel.message}`);
  const cancelled = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'cancel', reason: 'again' });
  assert.equal(cancelled.result.alreadyApplied, true);
  const after = await readRaw('orders', 'rad-order-1');
  assert.equal(after.status, 'cancelled');
  assert.equal(after.radiologyState, 'cancelled');
  assert.equal(after.cancelReason, 'Patient left', 'cancel reason was overwritten on retry');

  // Cancellation tells the ordering clinician why their request died.
  const messages = await findRaw('messages', 'toStaffId', ACTORS.doctor.staffId);
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /Radiology request cancelled/);
  assert.equal(messages[0].priority, 'urgent');
});

test('re-finalizing an already final report keeps the original signature', async () => {
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' });
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'acquire' });
  const first = await call('radiologyFinalize', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Normal.', impression: 'Normal study.' },
  });
  assert.equal(first.code, null, first.message);
  const original = await readRaw('radiologyReports', 'rad_rad-order-1');

  // A different radiologist replaying the call must not re-sign or rewrite.
  const replay = await call('radiologyFinalize', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Different.', impression: 'Different.' },
  });
  assert.equal(replay.code, null, `replay failed: ${replay.message}`);
  assert.equal(replay.result.alreadyFinal, true);

  const after = await readRaw('radiologyReports', 'rad_rad-order-1');
  assert.equal(after.findings, 'Normal.');
  assert.equal(after.signedByUid, original.signedByUid);
  assert.deepEqual(after.signedAt, original.signedAt);
});

/* ── critical results ─────────────────────────────────────────── */

test('a critical report raises an alert only the requester can acknowledge', async () => {
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' });
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'acquire' });

  const noRecipient = await call('radiologyFinalize', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'Tension pneumothorax.', impression: 'Tension pneumothorax.', critical: true },
  });
  assert.equal(noRecipient.code, 'invalid-argument');
  assert.match(noRecipient.message, /verbal notification/);

  const final = await call('radiologyFinalize', {
    orderId: 'rad-order-1',
    report: {
      patientId: '1001', study: 'Chest X-ray',
      findings: 'Tension pneumothorax.', impression: 'Tension pneumothorax.',
      critical: true, notifiedTo: 'Dr Bizimana (20001)',
    },
  });
  assert.equal(final.code, null, `finalize failed: ${final.message}`);
  assert.equal(final.result.critical, true);

  const alert = await readRaw('criticalAlerts', 'rad_rad-order-1');
  assert.equal(alert.acknowledged, false);
  assert.equal(alert.status, 'notified');
  assert.equal(alert.reportId, 'rad_rad-order-1');
  assert.equal(alert.orderId, 'rad-order-1');
  assert.equal(alert.patientId, '1001');
  assert.equal(alert.orderedById, ACTORS.doctor.staffId);
  assert.equal(alert.notifiedTo, 'Dr Bizimana (20001)');

  // Someone else who is also a doctor must not be able to close it.
  const wrong = await call('radiologyAcknowledgeCritical', { reportId: 'rad_rad-order-1' }, 'otherDoctor');
  assert.equal(wrong.code, 'permission-denied', `unrelated doctor acknowledged: ${JSON.stringify(wrong)}`);
  assert.equal((await readRaw('criticalAlerts', 'rad_rad-order-1')).acknowledged, false);

  const mine = await call('radiologyAcknowledgeCritical', { reportId: 'rad_rad-order-1' }, 'doctor');
  assert.equal(mine.code, null, `acknowledge failed: ${mine.message}`);
  assert.equal(mine.result.acknowledged, true);
  const acknowledged = await readRaw('criticalAlerts', 'rad_rad-order-1');
  assert.equal(acknowledged.acknowledged, true);
  assert.equal(acknowledged.status, 'acknowledged');
  assert.equal(acknowledged.acknowledgedById, ACTORS.doctor.staffId);
  assert.equal(acknowledged.acknowledgedByUid, ACTORS.doctor.uid);

  // Re-acknowledging is a no-op that preserves the original time.
  const firstAt = JSON.stringify(acknowledged.acknowledgedAt);
  const again = await call('radiologyAcknowledgeCritical', { reportId: 'rad_rad-order-1' }, 'doctor');
  assert.equal(again.code, null, `retry failed: ${again.message}`);
  assert.equal(JSON.stringify((await readRaw('criticalAlerts', 'rad_rad-order-1')).acknowledgedAt), firstAt);

  const missing = await call('radiologyAcknowledgeCritical', { reportId: 'rad_does-not-exist' }, 'doctor');
  assert.equal(missing.code, 'not-found');
});

/* ── authorization and validation boundaries ──────────────────── */

test('roles outside radiology cannot drive the study', async () => {
  const asNurse = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' }, 'nurse');
  assert.equal(asNurse.code, 'permission-denied');
  assert.equal((await readRaw('orders', 'rad-order-1')).status, 'pending');

  const asInactive = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' }, 'inactiveRadio');
  assert.equal(asInactive.code, 'permission-denied', 'an inactive profile was accepted');
  assert.match(asInactive.message, /inactive/);
});

test('an unauthenticated caller and a profile-less uid are both denied', async () => {
  const unsigned = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' }, null);
  assert.equal(unsigned.code, 'unauthenticated');
  assert.match(unsigned.message, /Sign-in is required/);

  // A signed-in uid with no /users/{uid} document must not inherit anything.
  const ghostToken = `${tokenFor('uid-ghost')}`;
  const response = await fetch(`http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT}/africa-south1/radiologyTransition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ghostToken}` },
    body: JSON.stringify({ data: { orderId: 'rad-order-1', action: 'start' } }),
  });
  const body = await response.json();
  assert.equal(normalizeCode(body.error.status || body.error.code), 'permission-denied');
  assert.match(body.error.message, /profile is missing/);
  assert.equal((await readRaw('orders', 'rad-order-1')).status, 'pending');
});

test('validation failures never mutate the order', async () => {
  const unknownAction = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'finalize' });
  assert.equal(unknownAction.code, 'invalid-argument');

  const cancelWithoutReason = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'cancel' });
  assert.equal(cancelWithoutReason.code, 'invalid-argument');

  const acquireTooEarly = await call('radiologyTransition', { orderId: 'rad-order-1', action: 'acquire' });
  assert.equal(acquireTooEarly.code, 'failed-precondition');

  const missingOrder = await call('radiologyTransition', { orderId: 'rad-nope', action: 'start' });
  assert.equal(missingOrder.code, 'not-found');

  const emptyOrderId = await call('radiologyTransition', { orderId: '   ', action: 'start' });
  assert.equal(emptyOrderId.code, 'invalid-argument');

  // A client mistake must never surface as `internal`: that hides the reason
  // from the toast and pages whoever watches function errors.
  const oversized = await call('radiologySaveDraft', {
    orderId: 'rad-order-1',
    report: { patientId: '1001', study: 'Chest X-ray', findings: 'x'.repeat(10001) },
  });
  assert.equal(oversized.code, 'invalid-argument', `oversized field returned ${oversized.code}: ${oversized.message}`);
  const noReportId = await call('radiologyAddendum', { text: 'x', reason: 'y' });
  assert.equal(noReportId.code, 'invalid-argument', `missing reportId returned ${noReportId.code}`);
  const noAlertId = await call('radiologyAcknowledgeCritical', {}, 'doctor');
  assert.equal(noAlertId.code, 'invalid-argument', `missing reportId returned ${noAlertId.code}`);

  // A lab order must never be driven through the radiology state machine.
  await write('orders', 'lab-order-1', imagingOrder({ id: 'lab-order-1', dept: 'lab', type: 'lab' }));
  const wrongDept = await call('radiologyTransition', { orderId: 'lab-order-1', action: 'start' });
  assert.equal(wrongDept.code, 'failed-precondition');
  assert.match(wrongDept.message, /not a radiology order/);

  for (const id of ['rad-order-1', 'lab-order-1']) {
    assert.equal((await readRaw('orders', id)).status, 'pending', `${id} was mutated by a rejected call`);
  }

  // A report must never be filed against the wrong chart.
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'start' });
  await call('radiologyTransition', { orderId: 'rad-order-1', action: 'acquire' });
  const mismatched = await call('radiologySaveDraft', {
    orderId: 'rad-order-1',
    report: { patientId: '9999', study: 'Chest X-ray', findings: 'x', impression: 'y' },
  });
  assert.equal(mismatched.code, 'failed-precondition');
  assert.match(mismatched.message, /do not match/);
  assert.equal(await readRaw('radiologyReports', 'rad_rad-order-1'), null);
});

test('the browser cannot fake a transition or a signed report', async () => {
  const radioDb = dbFor('radio');
  const doctorDb = dbFor('doctor');

  // Radiology has no browser write path for its own orders —
  // departmentMayUpdateOrder() deliberately omits dept 'radiology' — so the
  // callable is the only way the study state changes.
  await assert.rejects(updateDoc(doc(radioDb, 'orders', 'rad-order-1'), {
    radiologyState: 'reported', status: 'completed',
  }));

  // A signed report can never be written from a client at all.
  await assert.rejects(setDoc(doc(radioDb, 'radiologyReports', 'rad_rad-order-1'), {
    status: 'final', patientId: '1001', orderId: 'rad-order-1',
    findings: 'whatever', impression: 'whatever', signedByUid: 'someone-else',
  }));
  await assert.rejects(setDoc(doc(doctorDb, 'radiologyReports', 'rad_rad-order-1'), { status: 'draft' }));
  await assert.rejects(setDoc(doc(radioDb, 'radiologyAddenda', 'fake-addendum'), { reportId: 'rad_rad-order-1' }));
  await assert.rejects(setDoc(doc(doctorDb, 'criticalAlerts', 'rad_rad-order-1'), { acknowledged: true }));

  // So the order still holds its original state.
  assert.equal((await readRaw('orders', 'rad-order-1')).status, 'pending');
});
