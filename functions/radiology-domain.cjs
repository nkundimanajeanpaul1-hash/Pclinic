'use strict';

/* ============================================================
   PCLINIC — RADIOLOGY DOMAIN LOGIC (BACKEND / Cloud Functions)
   Pure helper functions used by functions/index.js. No Firestore
   access here — only validation, state-machine and formatting
   logic, so it can be unit tested in isolation.
   ============================================================ */

const RADIOLOGY_STATES = ['pending', 'in-progress', 'acquired', 'reporting', 'reported', 'cancelled'];

// Allowed forward transitions, keyed by current state -> action -> next state.
const TRANSITIONS = {
  pending: { start: 'in-progress', cancel: 'cancelled' },
  'in-progress': { acquire: 'acquired', cancel: 'cancelled' },
  acquired: { cancel: 'cancelled' },
  reporting: { cancel: 'cancelled' },
  reported: {},
  cancelled: {},
};

/**
 * Determine the current radiology workflow state of an order.
 * Falls back to inferring from order.status if radiologyState
 * has never been set (e.g. a freshly created imaging order).
 */
function deriveRadiologyState(order) {
  const stored = order && order.radiologyState;
  if (typeof stored === 'string' && RADIOLOGY_STATES.includes(stored)) {
    return stored;
  }
  if (order && order.status === 'cancelled') return 'cancelled';
  if (order && order.status === 'completed') return 'reported';
  return 'pending';
}

/**
 * Validate and resolve a requested state transition.
 * Throws a plain Error (caller wraps as failed-precondition) if
 * the action is not valid from the current state.
 */
function assertTransition(current, action) {
  const allowed = TRANSITIONS[current];
  const next = allowed && allowed[action];
  if (!next) {
    throw new Error(`Cannot perform "${action}" while the study is "${current}".`);
  }
  return next;
}

/**
 * Trim/validate a text field. Mirrors the convention used by
 * functions/lab-domain.cjs's cleanText so error messages are
 * consistent across callable functions.
 */
function cleanText(value, maxLen, required, fieldName) {
  let text = value == null ? '' : String(value).trim();
  if (!text) {
    if (required) throw new Error(`A ${fieldName} is required.`);
    return '';
  }
  if (text.length > maxLen) {
    throw new Error(`${fieldName} must be ${maxLen} characters or fewer.`);
  }
  return text;
}

/**
 * Normalize a raw report object coming from the client into a
 * clean shape before it is merged into a draft/final payload.
 */
function normalizeReportInput(raw) {
  const report = raw && typeof raw === 'object' ? raw : {};
  return {
    patientId: cleanText(report.patientId, 120, true, 'patientId'),
    study: cleanText(report.study, 300, true, 'study'),
    modality: cleanText(report.modality, 40, false, 'modality'),
    studyDate: cleanText(report.studyDate, 40, false, 'studyDate'),
    indication: cleanText(report.indication, 2000, false, 'indication'),
    comparison: cleanText(report.comparison, 2000, false, 'comparison'),
    findings: cleanText(report.findings, 10000, false, 'findings'),
    impression: cleanText(report.impression, 4000, false, 'impression'),
    recommendation: cleanText(report.recommendation, 2000, false, 'recommendation'),
    critical: report.critical === true,
    notifiedTo: cleanText(report.notifiedTo, 200, false, 'notifiedTo'),
  };
}

/**
 * Extra validation applied only when a report is being finalised
 * (signed). Draft saves may be incomplete; final reports may not.
 */
function validateFinalReport(report) {
  if (!report.findings) throw new Error('Findings are required to finalise a report.');
  if (!report.impression) throw new Error('An impression is required to finalise a report.');
  if (report.critical && !report.notifiedTo) {
    throw new Error('A verbal notification recipient is required for a critical result.');
  }
  return report;
}

/**
 * Deterministic, stable report document ID for a given imaging
 * order, so there is exactly one draft/final report per order.
 */
function reportIdForOrder(orderId) {
  return `rad_${String(orderId)}`;
}

module.exports = {
  deriveRadiologyState,
  assertTransition,
  cleanText,
  normalizeReportInput,
  validateFinalReport,
  reportIdForOrder,
};
