'use strict';

/* ============================================================
   PCLINIC — LABORATORY DOMAIN LOGIC (BACKEND / Cloud Functions)
   Pure helper functions used by functions/index.js. No Firestore
   access here — only validation, state-machine and legacy-request
   materialization logic, so it can be unit tested in isolation.
   ============================================================ */

function normalizePatientId(value) {
  const text = value == null ? '' : String(value).trim();
  const digits = text.replace(/[^0-9]/g, '');
  return digits || text.toUpperCase();
}

function normalizeOrderId(value) {
  const text = value == null ? '' : String(value).trim();
  if (!text || text.includes('/') || text === '.' || text === '..' || text.length > 1500) {
    throw new Error('Provide a valid Firestore order ID.');
  }
  return text;
}

function normalizeSpecimenAction(value) {
  const text = (value == null ? '' : String(value).trim()).toLowerCase();
  if (text !== 'accession' && text !== 'reject') {
    throw new Error(`Unknown specimen action: "${text}".`);
  }
  return text;
}

function normalizeOrderStatus(value) {
  return (value == null ? '' : String(value).trim()).toLowerCase().replace(/\s+/g, '-');
}

function isLaboratoryOrder(order) {
  return !!order && (order.dept === 'laboratory' || order.type === 'lab' || order.type === 'laboratory');
}

/**
 * Decide whether a requested specimen action should be applied to
 * an order, is already applied (idempotent retry), or is not
 * allowed given the order's current status.
 */
function transitionDisposition(rawStatus, action, hasAccessionNo) {
  const status = normalizeOrderStatus(rawStatus);

  if (action === 'accession') {
    if (status === 'completed' || status === 'cancelled') {
      throw new Error(`An order with status "${status}" cannot be accessioned.`);
    }
    if (hasAccessionNo) return 'already-applied';
    if (status === 'pending' || status === 'in-progress') return 'apply';
    throw new Error(`An order with status "${status}" cannot be accessioned.`);
  }

  if (action === 'reject') {
    if (status === 'cancelled') return 'already-applied';
    if (status === 'completed') {
      throw new Error(`An order with status "${status}" cannot be rejected.`);
    }
    return 'apply';
  }

  throw new Error(`Unknown specimen action: "${action}".`);
}

/**
 * Find and verify the legacy patient.labRequests entry a recovered
 * request claims to correspond to. Requires the legacy request ID,
 * timestamp and test list to all match, so the browser cannot
 * fabricate a request that was never actually ordered.
 */
function findLegacyRequest(patient, legacyOrder) {
  const requests = Array.isArray(patient && patient.labRequests) ? patient.labRequests : [];
  const legacyId = String((legacyOrder && legacyOrder.legacyRequestId) || '');
  const orderedAt = legacyOrder && legacyOrder.orderedAt;
  const itemNames = Array.isArray(legacyOrder && legacyOrder.items)
    ? legacyOrder.items.map((item) => String((item && item.name) || '')).filter(Boolean)
    : [];

  return requests.find((req) => {
    if (!req) return false;
    if (String(req.id) !== legacyId) return false;
    if (orderedAt && req.timestamp !== orderedAt) return false;
    const reqTests = Array.isArray(req.tests) ? req.tests.map(String) : [];
    if (itemNames.length) {
      if (reqTests.length !== itemNames.length) return false;
      if (!itemNames.every((name) => reqTests.includes(name))) return false;
    }
    return true;
  }) || null;
}

/**
 * Deterministic Firestore order ID for a verified legacy request,
 * so the same legacy request always materializes to the same
 * order document rather than duplicating on every retry.
 */
function legacyOrderIdForRequest(patientId, request, index) {
  const suffix = request && request.id != null && request.id !== '' ? request.id : index;
  return `LAB-LEGACY-${patientId}-${suffix}`;
}

/**
 * Build a full /orders-shaped document for a legacy lab request
 * that never had one, so it can be accessioned/rejected like any
 * other order.
 */
function materializeLegacyOrder(orderId, patientId, patient, request) {
  const items = Array.isArray(request && request.tests)
    ? request.tests.map((name) => ({ name: String(name) }))
    : [];
  const firstName = (patient && patient.firstName) || '';
  const lastName = (patient && patient.lastName) || '';

  return {
    id: orderId,
    patientId: String(patientId),
    patientName: `${firstName} ${lastName}`.trim(),
    dept: 'laboratory',
    type: 'lab',
    status: normalizeOrderStatus((request && request.status) || 'pending'),
    priority: ((request && request.priority) || 'routine').toString().trim().toLowerCase(),
    items,
    notes: '',
    orderedBy: String((request && request.requestedBy) || ''),
    orderedById: String((request && request.requestedById) || ''),
    createdAt: (request && request.timestamp) || null,
    legacyMigrated: true,
    legacyRequestId: request && request.id != null ? String(request.id) : null,
  };
}

module.exports = {
  normalizePatientId,
  normalizeOrderId,
  normalizeSpecimenAction,
  normalizeOrderStatus,
  isLaboratoryOrder,
  transitionDisposition,
  findLegacyRequest,
  legacyOrderIdForRequest,
  materializeLegacyOrder,
};
