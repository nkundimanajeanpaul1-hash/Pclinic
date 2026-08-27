'use strict';

/*
 * Unit tests for functions/radiology-domain.cjs — the state machine and
 * validation layer behind radiologyTransition / radiologySaveDraft /
 * radiologyFinalize / radiologyAddendum / radiologyAcknowledgeCritical.
 *
 * These functions are pure (no Firestore), so they are tested in isolation.
 * The end-to-end behaviour against the Admin SDK is covered by
 * test/radiology-integration.test.cjs, which runs under the emulator.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveRadiologyState,
  assertTransition,
  cleanText,
  normalizeReportInput,
  validateFinalReport,
  reportIdForOrder,
} = require('../radiology-domain.cjs');

test('derives the workflow state, falling back to order.status', () => {
  // An explicitly stored state always wins.
  assert.equal(deriveRadiologyState({ radiologyState: 'acquired' }), 'acquired');
  assert.equal(deriveRadiologyState({ radiologyState: 'cancelled', status: 'completed' }), 'cancelled');
  // A stored value outside the allowlist is ignored, not trusted.
  assert.equal(deriveRadiologyState({ radiologyState: 'reported ', status: 'pending' }), 'pending');
  assert.equal(deriveRadiologyState({ radiologyState: 42, status: 'completed' }), 'reported');
  // A freshly created imaging order has no radiologyState yet: infer it.
  assert.equal(deriveRadiologyState({ status: 'cancelled' }), 'cancelled');
  assert.equal(deriveRadiologyState({ status: 'completed' }), 'reported');
  assert.equal(deriveRadiologyState({ status: 'pending' }), 'pending');
  assert.equal(deriveRadiologyState({}), 'pending');
  assert.equal(deriveRadiologyState(null), 'pending');
  assert.equal(deriveRadiologyState(undefined), 'pending');
});

test('resolves every legal forward transition and rejects the rest', () => {
  assert.equal(assertTransition('pending', 'start'), 'in-progress');
  assert.equal(assertTransition('in-progress', 'acquire'), 'acquired');
  // Once images exist the acquisition step cannot be replayed: the caller
  // treats a repeated "acquire" as a no-op before it reaches this function.
  assert.throws(() => assertTransition('acquired', 'acquire'), /Cannot perform "acquire" while the study is "acquired"\./);
  assert.throws(() => assertTransition('pending', 'acquire'), /Cannot perform "acquire" while the study is "pending"\./);
  assert.throws(() => assertTransition('in-progress', 'start'), /Cannot perform "start" while the study is "in-progress"\./);
  // Unknown actions resolve to no next state and are therefore denied too.
  assert.throws(() => assertTransition('pending', 'finalize'), /Cannot perform "finalize" while the study is "pending"\./);
  assert.throws(() => assertTransition('pending', undefined), /Cannot perform "undefined"/);
});

test('cancelled and reported studies are closed to forward movement', () => {
  for (const state of ['reported', 'cancelled']) {
    for (const action of ['start', 'acquire', 'cancel']) {
      assert.throws(() => assertTransition(state, action), /Cannot perform/);
    }
  }
  // acquired and reporting can only be cancelled — never re-opened backwards.
  assert.equal(assertTransition('acquired', 'cancel'), 'cancelled');
  assert.equal(assertTransition('reporting', 'cancel'), 'cancelled');
});

test('cleanText trims, enforces length and required fields', () => {
  assert.equal(cleanText('  Chest X-ray  ', 300, true, 'study'), 'Chest X-ray');
  assert.equal(cleanText(null, 300, false, 'modality'), '');
  assert.equal(cleanText('   ', 300, false, 'modality'), '');
  assert.equal(cleanText(0, 300, false, 'count'), '0');
  assert.throws(() => cleanText(null, 300, true, 'orderId'), /A orderId is required\./);
  assert.throws(() => cleanText('', 300, true, 'orderId'), /A orderId is required\./);
  assert.throws(() => cleanText('a'.repeat(11), 10, false, 'reason'), /reason must be 10 characters or fewer\./);
  // Exactly at the limit is fine — the comparison must be strict.
  assert.equal(cleanText('a'.repeat(10), 10, false, 'reason').length, 10);
});

test('normalizeReportInput yields the exact shape index.js merges', () => {
  const report = normalizeReportInput({
    patientId: ' MOD-1007 ',
    study: ' CT abdomen ',
    modality: 'CT',
    findings: '  Free fluid.  ',
    critical: 'yes',
    unknownField: 'dropped',
  });
  assert.deepEqual(report, {
    patientId: 'MOD-1007',
    study: 'CT abdomen',
    modality: 'CT',
    studyDate: '',
    indication: '',
    comparison: '',
    findings: 'Free fluid.',
    impression: '',
    recommendation: '',
    critical: false,
    notifiedTo: '',
  });
  // A report payload never carries client-controlled extra keys onward.
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'unknownField'), false);
  // Only a literal boolean true marks a result critical.
  assert.equal(normalizeReportInput({ patientId: '1', study: 's', critical: true }).critical, true);
  assert.equal(normalizeReportInput({ patientId: '1', study: 's', critical: 1 }).critical, false);
});

test('normalizeReportInput rejects junk input and missing required fields', () => {
  for (const junk of [null, undefined, 'text', 42, []]) {
    assert.throws(() => normalizeReportInput(junk), /A patientId is required\./);
  }
  assert.throws(() => normalizeReportInput({ patientId: '1007' }), /A study is required\./);
  assert.throws(
    () => normalizeReportInput({ patientId: '1007', study: 'x'.repeat(301) }),
    /study must be 300 characters or fewer\./,
  );
});

test('validateFinalReport blocks an unsigned report missing clinical content', () => {
  const base = { patientId: '1007', study: 'CXR', modality: '', studyDate: '', indication: '', comparison: '', recommendation: '', notifiedTo: '' };
  assert.throws(() => validateFinalReport({ ...base, findings: '', impression: 'Effusion' }), /Findings are required to finalise a report\./);
  assert.throws(() => validateFinalReport({ ...base, findings: 'Effusion', impression: '' }), /An impression is required to finalise a report\./);
  // A critical result must record who was called, or the escalation is unauditable.
  assert.throws(
    () => validateFinalReport({ ...base, findings: 'Pneumo', impression: 'Pneumo', critical: true, notifiedTo: '' }),
    /verbal notification recipient is required/,
  );
  const signed = validateFinalReport({ ...base, findings: 'Pneumo', impression: 'Pneumo', critical: true, notifiedTo: 'Dr Bizimana' });
  assert.equal(signed.impression, 'Pneumo');
  // Non-critical reports need no notification recipient.
  assert.equal(validateFinalReport({ ...base, findings: 'Normal', impression: 'Normal', critical: false }).findings, 'Normal');
});

test('reportIdForOrder is deterministic so one order holds one report', () => {
  assert.equal(reportIdForOrder('ord_9f2'), 'rad_ord_9f2');
  assert.equal(reportIdForOrder('ord_9f2'), reportIdForOrder('ord_9f2'));
  assert.notEqual(reportIdForOrder('ord_9f2'), reportIdForOrder('ord_9f3'));
  // A numeric legacy id still produces a usable document id.
  assert.equal(reportIdForOrder(172345), 'rad_172345');
});
