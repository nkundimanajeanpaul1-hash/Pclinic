'use strict';

const { setGlobalOptions } = require('firebase-functions/v2');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const {
  deriveRadiologyState,
  assertTransition,
  cleanText,
  normalizeReportInput,
  validateFinalReport,
  reportIdForOrder,
} = require('./radiology-domain.cjs');
const {
  normalizePatientId,
  normalizeOrderId,
  normalizeSpecimenAction,
  normalizeOrderStatus,
  isLaboratoryOrder,
  transitionDisposition,
  findLegacyRequest,
  legacyOrderIdForRequest,
  materializeLegacyOrder,
} = require('./lab-domain.cjs');
const { viewUrlFor } = require('./radiology-media.cjs');
const { deleteImagingStudy } = require('./admin-imaging.cjs');

initializeApp();
setGlobalOptions({ region: 'africa-south1', maxInstances: 20 });
const db = getFirestore();

function fail(code, message) {
  throw new HttpsError(code, message);
}

function timestampToIso(value, fallback) {
  if (value && typeof value.toDate === 'function') {
    try { return value.toDate().toISOString(); } catch (error) { /* use fallback */ }
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return fallback;
}

async function requireStaff(request, allowedRoles) {
  if (!request.auth || !request.auth.uid) fail('unauthenticated', 'Sign-in is required.');
  const snap = await db.collection('users').doc(request.auth.uid).get();
  if (!snap.exists) fail('permission-denied', 'Staff profile is missing.');
  const profile = snap.data() || {};
  if (profile.active !== true) fail('permission-denied', 'Staff account is inactive.');
  if (profile.role !== 'admin' && !allowedRoles.includes(profile.role)) {
    fail('permission-denied', 'This action is not available for your role.');
  }
  return {
    uid: request.auth.uid,
    staffId: String(profile.staffId || ''),
    name: String(profile.name || profile.staffId || 'Staff'),
    role: String(profile.role || ''),
  };
}

function ensureImagingOrder(order) {
  if (!order || (order.dept !== 'radiology' && order.type !== 'imaging')) {
    fail('failed-precondition', 'The selected order is not a radiology order.');
  }
}

function ensurePatientMatch(order, patientId) {
  if (String(order.patientId) !== String(patientId)) {
    fail('failed-precondition', 'Order and report patient IDs do not match.');
  }
}

function auditInTransaction(tx, staff, action, resourceType, resourceId, patientId, details) {
  const ref = db.collection('auditLog').doc();
  tx.set(ref, {
    actorUid: staff.uid,
    actorStaffId: staff.staffId,
    actorName: staff.name,
    actorRole: staff.role,
    action,
    resourceType,
    resourceId: String(resourceId || ''),
    patientId: patientId == null ? null : String(patientId),
    details: details || {},
    at: Timestamp.now(),
  });
}

function messageInTransaction(tx, staff, order, text, priority, category) {
  const ref = db.collection('messages').doc();
  tx.set(ref, {
    id: ref.id,
    text,
    toRoles: ['doctor'],
    toStaffId: order.orderedById || null,
    priority: priority || 'normal',
    patientId: order.patientId || null,
    patientName: order.patientName || '',
    category: category || 'result',
    fromName: staff.name,
    fromId: staff.staffId,
    fromRole: staff.role,
    at: Timestamp.now(),
    readBy: [],
  });
}

function reportPayload(staff, order, report, existing, status) {
  const now = Timestamp.now();
  return {
    id: reportIdForOrder(order.id),
    orderId: String(order.id),
    patientId: String(order.patientId),
    patientName: String(order.patientName || ''),
    patientMrn: String(order.patientId || ''),
    orderedBy: String(order.orderedBy || ''),
    orderedById: String(order.orderedById || ''),
    priority: String(order.priority || 'routine'),
    study: report.study,
    modality: report.modality,
    studyDate: report.studyDate,
    indication: report.indication || String(order.notes || ''),
    comparison: report.comparison,
    findings: report.findings,
    impression: report.impression,
    recommendation: report.recommendation,
    critical: report.critical,
    criticalNotification: status === 'final' && report.critical ? {
      notifiedTo: report.notifiedTo,
      notifiedAt: now,
      method: 'verbal',
    } : null,
    status,
    version: 1,
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    createdByUid: existing && existing.createdByUid ? existing.createdByUid : staff.uid,
    createdById: existing && existing.createdById ? existing.createdById : staff.staffId,
    createdByName: existing && existing.createdByName ? existing.createdByName : staff.name,
    updatedAt: now,
    updatedByUid: staff.uid,
    updatedById: staff.staffId,
    updatedByName: staff.name,
  };
}

/*
 * Atomically accept/accession or reject one selected patient's laboratory
 * order group. This callable is required for recovered patient.labRequests,
 * because those legacy requests do not yet have an /orders document and the
 * browser is intentionally forbidden from inventing one as Laboratory staff.
 */
// Callable functions normally enable CORS automatically. Keep it explicit
// because the dashboard is hosted on Cloudflare Pages, not Firebase Hosting.
exports.labSpecimenTransition = onCall({ cors: true }, async (request) => {
  const staff = await requireStaff(request, ['lab']);
  const data = request.data || {};

  let patientId;
  let action;
  try {
    patientId = normalizePatientId(data.patientId);
    action = normalizeSpecimenAction(data.action);
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  if (!patientId) fail('invalid-argument', 'A patient ID is required.');

  let accessionNo;
  let reason;
  let notes;
  try {
    accessionNo = cleanText(data.accessionNo, 120, false, 'accessionNo');
    reason = cleanText(data.reason, 1000, false, 'reason');
    notes = cleanText(data.notes, 2000, false, 'notes');
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  if (action === 'accession' && !accessionNo) fail('invalid-argument', 'An accession number is required.');
  if (action === 'reject' && !reason) fail('invalid-argument', 'A specimen rejection reason is required.');

  if (!Array.isArray(data.orders) || data.orders.length < 1 || data.orders.length > 25) {
    fail('invalid-argument', 'Submit between 1 and 25 laboratory orders.');
  }

  const seenOrderIds = new Set();
  const entries = data.orders.map((entry) => {
    let orderId;
    const entryPatientId = normalizePatientId(entry && entry.patientId);
    try { orderId = normalizeOrderId(entry && entry.orderId); }
    catch (error) { fail('invalid-argument', error.message); }
    if (entryPatientId !== patientId) fail('invalid-argument', 'Every order must belong to the selected patient.');
    if (seenOrderIds.has(orderId)) fail('invalid-argument', 'The specimen request contains a duplicate order.');
    seenOrderIds.add(orderId);
    return {
      orderId,
      legacyOrder: entry && entry.legacyOrder && typeof entry.legacyOrder === 'object' ? entry.legacyOrder : null,
      ref: db.collection('orders').doc(orderId),
    };
  });

  const patientRef = db.collection('patients').doc(patientId);
  return db.runTransaction(async (tx) => {
    // Firestore transactions require reads before writes. Read the patient as
    // well as every candidate order so legacy materialisation is verified
    // against the authoritative patient.labRequests array.
    const snapshots = await Promise.all([
      tx.get(patientRef),
      ...entries.map((entry) => tx.get(entry.ref)),
    ]);
    const patientSnap = snapshots[0];
    if (!patientSnap.exists) fail('not-found', 'The selected patient was not found.');
    const patient = patientSnap.data() || {};
    const patientRequests = Array.isArray(patient.labRequests) ? patient.labRequests.slice() : [];
    let patientRequestsChanged = false;
    const now = Timestamp.now();
    const transitionedAt = now.toDate().toISOString();
    const responses = [];

    entries.forEach((entry, index) => {
      const orderSnap = snapshots[index + 1];
      let order;
      let legacyRequest = null;
      let legacyRequestIndex = -1;

      if (orderSnap.exists) {
        order = { id: orderSnap.id, ...orderSnap.data() };
      } else {
        if (!entry.legacyOrder) {
          fail('not-found', `Laboratory order ${entry.orderId} was not found on the common server.`);
        }
        legacyRequest = findLegacyRequest(patient, entry.legacyOrder);
        if (!legacyRequest) {
          fail('failed-precondition', `Recovered request ${entry.orderId} could not be verified against the patient's laboratory requests.`);
        }
        legacyRequestIndex = patientRequests.indexOf(legacyRequest);
        const expectedLegacyOrderId = legacyOrderIdForRequest(patientId, legacyRequest, legacyRequestIndex);
        if (entry.orderId !== expectedLegacyOrderId) {
          fail('failed-precondition', 'The recovered laboratory order ID does not match the verified patient request.');
        }
        try {
          order = materializeLegacyOrder(entry.orderId, patientId, patient, legacyRequest);
        } catch (error) {
          fail('failed-precondition', error.message);
        }
      }

      if (!isLaboratoryOrder(order)) fail('failed-precondition', 'The selected order is not a laboratory order.');
      if (normalizePatientId(order.patientId) !== patientId) {
        fail('failed-precondition', 'Order and selected patient IDs do not match.');
      }

      let disposition;
      try {
        disposition = transitionDisposition(order.status, action, !!order.accessionNo);
      } catch (error) {
        fail('failed-precondition', error.message);
      }

      const nextStatus = action === 'reject' ? 'cancelled' : 'in-progress';
      const actorFields = action === 'reject' ? {
        cancelReason: reason,
        cancelledAt: now,
        cancelledBy: staff.name,
        cancelledById: staff.staffId,
      } : {
        accessionNo,
        accessionNotes: notes,
        accessionedAt: now,
        accessionedBy: staff.name,
        accessionedById: staff.staffId,
      };

      if (disposition === 'apply') {
        const patch = {
          status: nextStatus,
          updatedAt: now,
          updatedBy: staff.name,
          updatedById: staff.staffId,
          ...actorFields,
          history: FieldValue.arrayUnion({
            at: now,
            by: staff.name,
            byId: staff.staffId,
            action: action === 'reject' ? `laboratory specimen rejected: ${reason}` : `laboratory specimen accessioned: ${accessionNo}`,
          }),
        };
        tx.set(
          entry.ref,
          orderSnap.exists ? patch : { ...order, ...patch, id: entry.orderId },
          { merge: true }
        );

        if (legacyRequest && legacyRequestIndex >= 0) {
          patientRequests[legacyRequestIndex] = {
            ...patientRequests[legacyRequestIndex],
            status: action === 'reject' ? 'Rejected' : 'In-Progress',
            ...(action === 'reject' ? {
              rejectionReason: reason,
              rejectedAt: transitionedAt,
              rejectedBy: staff.name,
              rejectedById: staff.staffId,
            } : {
              accessionNo,
              accessionedAt: transitionedAt,
              accessionedBy: staff.name,
              accessionedById: staff.staffId,
            }),
          };
          patientRequestsChanged = true;
        }

        if (action === 'reject') {
          messageInTransaction(
            tx,
            staff,
            order,
            `Laboratory specimen rejected for ${order.patientName || 'patient'} — ${reason}`,
            'urgent',
            'lab-specimen'
          );
        }
        auditInTransaction(
          tx,
          staff,
          action === 'reject' ? 'laboratory.specimen.reject' : 'laboratory.specimen.accession',
          'order',
          entry.orderId,
          patientId,
          { accessionNo: action === 'accession' ? accessionNo : null, reason: action === 'reject' ? reason : null }
        );
      }

      responses.push({
        orderId: entry.orderId,
        patientId,
        status: disposition === 'already-applied' ? normalizeOrderStatus(order.status) : nextStatus,
        accessionNo: action === 'accession' ? (order.accessionNo || accessionNo) : null,
        transitionedAt: disposition === 'already-applied'
          ? timestampToIso(order.accessionedAt || order.cancelledAt, transitionedAt)
          : transitionedAt,
        transitionedBy: disposition === 'already-applied'
          ? String(order.accessionedBy || order.cancelledBy || staff.name)
          : staff.name,
        transitionedById: disposition === 'already-applied'
          ? String(order.accessionedById || order.cancelledById || staff.staffId)
          : staff.staffId,
        reason: action === 'reject' ? (order.cancelReason || reason) : null,
        migratedLegacyOrder: !orderSnap.exists,
        alreadyApplied: disposition === 'already-applied',
      });
    });

    if (patientRequestsChanged) {
      tx.update(patientRef, {
        labRequests: patientRequests,
        updatedAt: now,
        updatedBy: staff.name,
        updatedById: staff.staffId,
      });
    }
    return { orders: responses };
  });
});

/*
 * Finalise and release one laboratory order's results to the requesting
 * doctor. Mirrors labSpecimenTransition's legacy-recovery handling: a
 * recovered patient.labRequests entry with no /orders document yet is
 * verified and migrated atomically in the same transaction that releases
 * the result, so it is never possible to release a result that cannot be
 * traced back to a real, verified request.
 */
exports.labFinalize = onCall({ cors: true }, async (request) => {
  const staff = await requireStaff(request, ['lab']);
  const data = request.data || {};

  let orderId;
  let patientId;
  try {
    orderId = normalizeOrderId(data.orderId);
    patientId = normalizePatientId(data.patientId);
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  if (!patientId) fail('invalid-argument', 'A patient ID is required.');

  if (!Array.isArray(data.results) || data.results.length < 1) {
    fail('invalid-argument', 'At least one laboratory result is required.');
  }

  let results;
  let comments;
  try {
    results = data.results.map((row) => ({
      code: cleanText(row && row.code, 60, false, 'code'),
      orderItemCode: cleanText(row && row.orderItemCode, 60, false, 'orderItemCode'),
      orderItemName: cleanText(row && row.orderItemName, 200, false, 'orderItemName'),
      test: cleanText(row && row.test, 200, true, 'test'),
      value: cleanText(row && row.value, 200, true, 'value'),
      unit: cleanText(row && row.unit, 40, false, 'unit'),
      refRange: cleanText(row && row.refRange, 100, false, 'refRange'),
      flag: cleanText(row && row.flag, 40, false, 'flag') || 'Normal',
    }));
    comments = cleanText(data.comments, 2000, false, 'comments');
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  const microbiology = data.microbiology && typeof data.microbiology === 'object' ? data.microbiology : null;
  const critical = results.some((row) => String(row.flag).indexOf('Critical') !== -1);
  const legacyOrder = data.legacyOrder && typeof data.legacyOrder === 'object' ? data.legacyOrder : null;

  const orderRef = db.collection('orders').doc(orderId);
  const patientRef = db.collection('patients').doc(patientId);
  const resultId = orderId;
  const messageId = ('lab-result-' + orderId).replace(/\//g, '_');
  const messageRef = db.collection('messages').doc(messageId);
  const alertRef = db.collection('criticalAlerts').doc(resultId);

  return db.runTransaction(async (tx) => {
    const [orderSnap, patientSnap] = await Promise.all([tx.get(orderRef), tx.get(patientRef)]);
    if (!patientSnap.exists) fail('not-found', 'The selected patient was not found.');
    const patient = patientSnap.data() || {};
    const patientRequests = Array.isArray(patient.labRequests) ? patient.labRequests.slice() : [];

    let order;
    let legacyRequest = null;
    let legacyRequestIndex = -1;

    if (orderSnap.exists) {
      order = { id: orderSnap.id, ...orderSnap.data() };
    } else {
      if (!legacyOrder) fail('not-found', `Laboratory order ${orderId} was not found on the common server.`);
      legacyRequest = findLegacyRequest(patient, legacyOrder);
      if (!legacyRequest) {
        fail('failed-precondition', `Recovered request ${orderId} could not be verified against the patient's laboratory requests.`);
      }
      legacyRequestIndex = patientRequests.indexOf(legacyRequest);
      const expectedLegacyOrderId = legacyOrderIdForRequest(patientId, legacyRequest, legacyRequestIndex);
      if (orderId !== expectedLegacyOrderId) {
        fail('failed-precondition', 'The recovered laboratory order ID does not match the verified patient request.');
      }
      try {
        order = materializeLegacyOrder(orderId, patientId, patient, legacyRequest);
      } catch (error) {
        fail('failed-precondition', error.message);
      }
    }

    if (!isLaboratoryOrder(order)) fail('failed-precondition', 'The selected order is not a laboratory order.');
    if (normalizePatientId(order.patientId) !== patientId) {
      fail('failed-precondition', 'Order and selected patient IDs do not match.');
    }
    const status = normalizeOrderStatus(order.status);
    if (status === 'completed') fail('already-exists', 'This result is already final and cannot be overwritten.');
    if (status === 'cancelled') fail('failed-precondition', 'A cancelled order cannot be released.');

    const now = Timestamp.now();
    const completedAt = now.toDate().toISOString();

    const patch = {
      status: 'completed',
      labState: 'final',
      resultId,
      results,
      labComments: comments,
      microbiology,
      critical,
      completedAt: now,
      completedBy: staff.name,
      completedById: staff.staffId,
      history: FieldValue.arrayUnion({ at: now, by: staff.name, byId: staff.staffId, action: 'laboratory result finalised' }),
    };
    tx.set(orderRef, orderSnap.exists ? patch : { ...order, ...patch, id: orderId }, { merge: true });

    const patientPatch = {
      labResults: FieldValue.arrayUnion({
        id: resultId,
        orderId,
        patientId,
        tests: results,
        comments,
        microbiology,
        sampleType: (microbiology && microbiology.sampleType) || '',
        organism: (microbiology && microbiology.organism) || '',
        colonyCount: (microbiology && microbiology.colonyCount) || '',
        incubationNote: (microbiology && microbiology.incubationNote) || '',
        antibiotics: (microbiology && microbiology.antibiotics) || [],
        critical,
        status: 'final',
        verifiedBy: staff.name,
        verifiedById: staff.staffId,
        date: completedAt,
      }),
      updatedAt: now,
      updatedBy: staff.name,
      updatedById: staff.staffId,
    };
    if (legacyRequest && legacyRequestIndex >= 0) {
      patientRequests[legacyRequestIndex] = {
        ...patientRequests[legacyRequestIndex],
        status: 'Completed',
        completedAt,
        completedBy: staff.name,
        completedById: staff.staffId,
      };
      patientPatch.labRequests = patientRequests;
    }
    tx.update(patientRef, patientPatch);

    tx.set(messageRef, {
      id: messageId,
      text: (critical ? 'CRITICAL — ' : '') + `Laboratory results finalised for ${order.patientName || 'patient'}: ` +
        (order.items || []).map((item) => item.name).join(', '),
      toRoles: order.orderedById ? [] : ['doctor'],
      toStaffId: order.orderedById || null,
      priority: critical ? 'urgent' : 'normal',
      patientId: order.patientId,
      patientName: order.patientName || '',
      orderId,
      resultId,
      category: 'lab-result',
      fromName: staff.name,
      fromId: staff.staffId,
      fromRole: staff.role,
      at: now,
      readBy: [],
    });

    if (critical) {
      tx.set(alertRef, {
        id: resultId,
        resultId,
        orderId,
        patientId: String(order.patientId),
        patientName: String(order.patientName || ''),
        orderedById: String(order.orderedById || ''),
        acknowledged: false,
        status: 'notified',
        notifiedAt: now,
        notifiedById: staff.staffId,
        notifiedByName: staff.name,
        createdAt: now,
      });
    }

    auditInTransaction(tx, staff, 'laboratory.result.finalise', 'order', orderId, patientId, { critical });

    return {
      orderId,
      resultId,
      status: 'final',
      critical,
      completedAt,
      completedBy: staff.name,
      completedById: staff.staffId,
      results,
      microbiology,
    };
  });
});

/*
 * Doctor-side acknowledgement of a critical laboratory result alert.
 * Mirrors radiologyAcknowledgeCritical: only the requesting clinician
 * (or an admin) may acknowledge, and it is idempotent on retry.
 */
exports.labAcknowledgeCritical = onCall(async (request) => {
  const staff = await requireStaff(request, ['doctor']);
  let resultId;
  try {
    resultId = cleanText(request.data && request.data.resultId, 500, true, 'resultId');
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  const alertRef = db.collection('criticalAlerts').doc(resultId);
  const orderRef = db.collection('orders').doc(resultId);

  return db.runTransaction(async (tx) => {
    const [alertSnap, orderSnap] = await Promise.all([tx.get(alertRef), tx.get(orderRef)]);
    if (!alertSnap.exists) fail('not-found', 'Critical laboratory alert was not found.');
    const alert = alertSnap.data();
    const order = orderSnap.exists ? orderSnap.data() : {};
    if (staff.role !== 'admin' && String(order.orderedById || alert.orderedById || '') !== staff.staffId) {
      fail('permission-denied', 'Only the requesting clinician can acknowledge this alert.');
    }
    if (alert.acknowledged === true) return { resultId, acknowledged: true };
    const now = Timestamp.now();
    tx.update(alertRef, {
      acknowledged: true,
      status: 'acknowledged',
      acknowledgedAt: now,
      acknowledgedByUid: staff.uid,
      acknowledgedById: staff.staffId,
      acknowledgedByName: staff.name,
    });
    auditInTransaction(tx, staff, 'laboratory.critical.acknowledge', 'criticalAlert', resultId, alert.patientId, {});
    return { resultId, acknowledged: true };
  });
});

exports.radiologyTransition = onCall(async (request) => {
  const staff = await requireStaff(request, ['radio']);
  let orderId;
  let action;
  let reason;
  try {
    orderId = cleanText(request.data && request.data.orderId, 300, true, 'orderId');
    action = cleanText(request.data && request.data.action, 40, true, 'action');
    reason = cleanText(request.data && request.data.reason, 1000, false, 'reason');
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  if (!['start', 'acquire', 'cancel'].includes(action)) fail('invalid-argument', 'Unknown radiology action.');
  if (action === 'cancel' && !reason) fail('invalid-argument', 'A cancellation reason is required.');

  const orderRef = db.collection('orders').doc(orderId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) fail('not-found', 'Radiology order was not found.');
    const order = { id: snap.id, ...snap.data() };
    ensureImagingOrder(order);
    const current = deriveRadiologyState(order);
    if ((action === 'start' && current === 'in-progress') ||
        (action === 'acquire' && ['acquired', 'reporting'].includes(current)) ||
        (action === 'cancel' && current === 'cancelled')) {
      return { orderId, state: current, alreadyApplied: true };
    }
    let next;
    try { next = assertTransition(current, action); }
    catch (error) { fail('failed-precondition', error.message); }
    const now = Timestamp.now();
    const historyEntry = { at: now, by: staff.name, byId: staff.staffId, action: `radiology ${current} -> ${next}` };
    const patch = {
      radiologyState: next,
      status: next === 'cancelled' ? 'cancelled' : 'in-progress',
      updatedAt: now,
      updatedBy: staff.name,
      updatedById: staff.staffId,
      history: FieldValue.arrayUnion(historyEntry),
    };
    if (action === 'start') patch.acquisitionStartedAt = now;
    if (action === 'acquire') patch.acquisitionCompletedAt = now;
    if (action === 'cancel') {
      patch.cancelReason = reason;
      patch.cancelledAt = now;
      patch.cancelledBy = staff.name;
      messageInTransaction(tx, staff, order, `Radiology request cancelled for ${order.patientName || 'patient'} — ${reason}`, 'urgent', 'result');
    }
    tx.update(orderRef, patch);
    auditInTransaction(tx, staff, `radiology.order.${action}`, 'order', orderId, order.patientId, { from: current, to: next, reason });
    return { orderId, state: next };
  });
  return result;
});

exports.radiologySaveDraft = onCall(async (request) => {
  const staff = await requireStaff(request, ['radio']);
  let orderId;
  try {
    orderId = cleanText(request.data && request.data.orderId, 300, true, 'orderId');
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  let report;
  try { report = normalizeReportInput(request.data && request.data.report); }
  catch (error) { fail('invalid-argument', error.message); }
  const orderRef = db.collection('orders').doc(orderId);
  const reportRef = db.collection('radiologyReports').doc(reportIdForOrder(orderId));

  return db.runTransaction(async (tx) => {
    const [orderSnap, reportSnap] = await Promise.all([tx.get(orderRef), tx.get(reportRef)]);
    if (!orderSnap.exists) fail('not-found', 'Radiology order was not found.');
    const order = { id: orderSnap.id, ...orderSnap.data() };
    ensureImagingOrder(order);
    ensurePatientMatch(order, report.patientId);
    const state = deriveRadiologyState(order);
    if (!['acquired', 'reporting'].includes(state)) {
      fail('failed-precondition', 'Complete image acquisition before writing a report.');
    }
    const existing = reportSnap.exists ? reportSnap.data() : null;
    if (existing && existing.status === 'final') fail('failed-precondition', 'A final report is immutable. Create an addendum instead.');
    const payload = reportPayload(staff, order, report, existing, 'draft');
    tx.set(reportRef, payload, { merge: false });
    tx.update(orderRef, {
      radiologyState: 'reporting',
      status: 'in-progress',
      reportId: reportRef.id,
      updatedAt: Timestamp.now(),
      updatedBy: staff.name,
      updatedById: staff.staffId,
    });
    auditInTransaction(tx, staff, existing ? 'radiology.report.draft.update' : 'radiology.report.draft.create', 'radiologyReport', reportRef.id, order.patientId, { orderId });
    return { reportId: reportRef.id, status: 'draft' };
  });
});

exports.radiologyFinalize = onCall(async (request) => {
  const staff = await requireStaff(request, ['radio']);
  let orderId;
  try {
    orderId = cleanText(request.data && request.data.orderId, 300, true, 'orderId');
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  let report;
  try { report = validateFinalReport(normalizeReportInput(request.data && request.data.report)); }
  catch (error) { fail('invalid-argument', error.message); }
  const orderRef = db.collection('orders').doc(orderId);
  const reportRef = db.collection('radiologyReports').doc(reportIdForOrder(orderId));
  const alertRef = db.collection('criticalAlerts').doc(reportRef.id);

  return db.runTransaction(async (tx) => {
    const [orderSnap, reportSnap] = await Promise.all([tx.get(orderRef), tx.get(reportRef)]);
    if (!orderSnap.exists) fail('not-found', 'Radiology order was not found.');
    const order = { id: orderSnap.id, ...orderSnap.data() };
    ensureImagingOrder(order);
    ensurePatientMatch(order, report.patientId);
    const existing = reportSnap.exists ? reportSnap.data() : null;
    if (existing && existing.status === 'final') {
      return { reportId: reportRef.id, status: 'final', critical: existing.critical === true, alreadyFinal: true };
    }
    const state = deriveRadiologyState(order);
    if (!['acquired', 'reporting'].includes(state)) fail('failed-precondition', 'The study must be acquired before final signing.');

    const now = Timestamp.now();
    const payload = reportPayload(staff, order, report, existing, 'final');
    payload.signedAt = now;
    payload.signedByUid = staff.uid;
    payload.signedById = staff.staffId;
    payload.signedByName = staff.name;
    tx.set(reportRef, payload, { merge: false });
    tx.update(orderRef, {
      radiologyState: 'reported',
      status: 'completed',
      reportId: reportRef.id,
      result: { reportId: reportRef.id, critical: report.critical, impression: report.impression, status: 'final' },
      completedAt: now,
      completedBy: staff.name,
      updatedAt: now,
      updatedBy: staff.name,
      updatedById: staff.staffId,
      history: FieldValue.arrayUnion({ at: now, by: staff.name, byId: staff.staffId, action: 'radiology report finalised' }),
    });
    if (report.critical) {
      tx.set(alertRef, {
        id: alertRef.id,
        reportId: reportRef.id,
        orderId,
        patientId: String(order.patientId),
        patientName: String(order.patientName || ''),
        orderedById: String(order.orderedById || ''),
        notifiedTo: report.notifiedTo,
        notifiedAt: now,
        notifiedById: staff.staffId,
        notifiedByName: staff.name,
        acknowledged: false,
        status: 'notified',
        createdAt: now,
      });
    }
    messageInTransaction(tx, staff, order,
      `${report.critical ? 'CRITICAL — ' : ''}Radiology report finalised: ${report.study} for ${order.patientName || 'patient'}`,
      report.critical ? 'urgent' : 'normal', 'result');
    auditInTransaction(tx, staff, 'radiology.report.finalise', 'radiologyReport', reportRef.id, order.patientId, { orderId, critical: report.critical });
    return { reportId: reportRef.id, status: 'final', critical: report.critical };
  });
});

exports.radiologyAddendum = onCall(async (request) => {
  const staff = await requireStaff(request, ['radio']);
  let reportId;
  let text;
  let reason;
  try {
    reportId = cleanText(request.data && request.data.reportId, 500, true, 'reportId');
    text = cleanText(request.data && request.data.text, 10000, true, 'addendum text');
    reason = cleanText(request.data && request.data.reason, 1000, true, 'addendum reason');
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  const reportRef = db.collection('radiologyReports').doc(reportId);
  const addendumRef = db.collection('radiologyAddenda').doc();

  return db.runTransaction(async (tx) => {
    const reportSnap = await tx.get(reportRef);
    if (!reportSnap.exists) fail('not-found', 'Final radiology report was not found.');
    const report = reportSnap.data();
    if (report.status !== 'final') fail('failed-precondition', 'Addenda can only be attached to final reports.');
    const now = Timestamp.now();
    tx.set(addendumRef, {
      id: addendumRef.id,
      reportId,
      orderId: report.orderId,
      patientId: report.patientId,
      patientName: report.patientName,
      text,
      reason,
      status: 'final',
      signedAt: now,
      signedByUid: staff.uid,
      signedById: staff.staffId,
      signedByName: staff.name,
      createdAt: now,
    });
    const order = { patientId: report.patientId, patientName: report.patientName, orderedById: report.orderedById };
    messageInTransaction(tx, staff, order, `Radiology addendum issued for ${report.study || 'study'} — ${report.patientName || 'patient'}`, 'normal', 'result');
    auditInTransaction(tx, staff, 'radiology.report.addendum', 'radiologyAddendum', addendumRef.id, report.patientId, { reportId, reason });
    return { addendumId: addendumRef.id, reportId };
  });
});

exports.radiologyAcknowledgeCritical = onCall(async (request) => {
  const staff = await requireStaff(request, ['doctor']);
  let reportId;
  try {
    reportId = cleanText(request.data && request.data.reportId, 500, true, 'reportId');
  } catch (error) {
    fail('invalid-argument', error.message);
  }
  const alertRef = db.collection('criticalAlerts').doc(reportId);
  const reportRef = db.collection('radiologyReports').doc(reportId);

  return db.runTransaction(async (tx) => {
    const [alertSnap, reportSnap] = await Promise.all([tx.get(alertRef), tx.get(reportRef)]);
    if (!alertSnap.exists || !reportSnap.exists) fail('not-found', 'Critical radiology alert was not found.');
    const alert = alertSnap.data();
    const report = reportSnap.data();
    if (staff.role !== 'admin' && String(report.orderedById || '') !== staff.staffId) {
      fail('permission-denied', 'Only the requesting clinician can acknowledge this alert.');
    }
    if (alert.acknowledged === true) return { reportId, acknowledged: true };
    const now = Timestamp.now();
    tx.update(alertRef, {
      acknowledged: true,
      status: 'acknowledged',
      acknowledgedAt: now,
      acknowledgedByUid: staff.uid,
      acknowledgedById: staff.staffId,
      acknowledgedByName: staff.name,
    });
    auditInTransaction(tx, staff, 'radiology.critical.acknowledge', 'criticalAlert', reportId, report.patientId, {});
    return { reportId, acknowledged: true };
  });
});

/* ════════════════════════════════════════════════════════════════
   RADIOLOGY STUDY MEDIA (images / web video)
   The browser uploads straight to the private bucket under
   radiology/{orderId}/{mediaId}.{ext} and files one metadata record in
   radiologyMedia. Pixels are never read from the browser: this module
   hands out short-lived signed URLs after checking the caller's staff
   profile, so a revoked or deactivated account cannot keep viewing
   images through a saved link, and no object path is guessable.
   ════════════════════════════════════════════════════════════════ */
const MEDIA_ID_RE = /^[A-Za-z0-9._-]{1,160}$/;
const MEDIA_WINDOW_SECONDS = 600;

async function mediaViewer(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) fail('permission-denied', 'Staff profile is missing.');
  const profile = snap.data() || {};
  if (profile.active !== true) fail('permission-denied', 'Staff account is inactive.');
  if (profile.role !== 'admin' && !['doctor', 'nurse', 'radio', 'lab', 'theater', 'beds'].includes(profile.role)) {
    fail('permission-denied', 'Your role may not open radiology study media.');
  }
  return { uid, role: String(profile.role || ''), staffId: String(profile.staffId || ''), name: String(profile.name || profile.staffId || 'Staff') };
}

// Signs every media object for one order, for the next 10 minutes only.
exports.radiologyMediaSign = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) fail('unauthenticated', 'Sign-in is required.');
  const viewer = await mediaViewer(request.auth.uid);
  const data = request.data || {};
  let orderId;
  try { orderId = cleanText(data.orderId, 300, true, 'orderId'); }
  catch (error) { fail('invalid-argument', error.message); }

  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) fail('not-found', 'Radiology order was not found.');
  const order = { id: orderSnap.id, ...orderSnap.data() };
  ensureImagingOrder(order);

  const found = await db.collection('radiologyMedia').where('orderId', '==', orderId).get();
  const bucket = getStorage().bucket();
  const items = [];
  let signingProblem = '';
  for (const docSnap of found.docs) {
    const row = { id: docSnap.id, ...docSnap.data() };
    const path = String(row.storagePath || '');
    // Only ever sign the object this record names, and only inside its own order
    // prefix: a tampered record must not become a reader for another study.
    const expected = `radiology/${orderId}/${docSnap.id}`;
    const declaredExt = String(row.ext || '').toLowerCase();
    // Must agree with firestore.rules: the object is exactly radiology/{orderId}/{id}.{ext}
    const sameFolder = path === `${expected}.${declaredExt}`
      || (path.startsWith(`${expected}.`) && path.slice(expected.length + 1) === declaredExt);
    if (!MEDIA_ID_RE.test(docSnap.id) || !sameFolder || !/^[a-z0-9]{2,4}$/.test(declaredExt)) {
      console.warn(`radiologyMedia/${docSnap.id}: storagePath ${path} does not match its record, skipping`);
      continue;
    }
    const base = {
      id: docSnap.id, kind: row.kind || 'image', mime: row.mime || '', fileName: row.fileName || '',
      bytes: Number(row.bytes) || 0, at: row.at || null, byName: row.byName || '',
    };
    // Signed URL when the runtime may sign; otherwise a download-token link
    // (see radiology-media.cjs). Once signing has failed for one object it will
    // fail for all of them in this call, so the error is carried forward instead
    // of paying the IAM round-trip again per file.
    const resolved = await viewUrlFor(bucket.file(path), {
      bucketName: bucket.name, expiresInSeconds: MEDIA_WINDOW_SECONDS, skipSigning: signingProblem,
    });
    if (resolved.signError && !signingProblem) {
      signingProblem = resolved.signError;
      console.warn(`radiologyMediaSign: signed URLs unavailable (${signingProblem}); serving download-token links. ` +
        'To restore expiring links grant roles/iam.serviceAccountTokenCreator to the functions service account.');
    }
    if (resolved.url) {
      items.push({ ...base, url: resolved.url, mode: resolved.mode, expiresIn: resolved.mode === 'signed' ? MEDIA_WINDOW_SECONDS : 0 });
    } else {
      // A missing object is a data condition, not a reason to fail the whole view —
      // but the viewer must be able to say WHY there is nothing to show.
      console.warn(`radiologyMedia/${docSnap.id}: no view URL for ${path}: ${resolved.reason}`);
      items.push({ ...base, error: resolved.error, reason: resolved.reason });
    }
  }
  return { orderId, count: items.length, items, signing: signingProblem ? 'token-fallback' : 'signed', signingProblem: signingProblem || null };
});

// Undo the uploader's own upload before the study is signed.
exports.radiologyMediaDelete = onCall(async (request) => {
  const staff = await requireStaff(request, ['radio']);
  let mediaId;
  try { mediaId = cleanText(request.data && request.data.mediaId, 200, true, 'mediaId'); }
  catch (error) { fail('invalid-argument', error.message); }
  if (!MEDIA_ID_RE.test(mediaId)) fail('invalid-argument', 'The media id is not a valid document id.');
  const ref = db.collection('radiologyMedia').doc(mediaId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'Study media record was not found.');
    const row = { id: snap.id, ...snap.data() };
    if (staff.role !== 'admin' && String(row.byUid || '') !== staff.uid) {
      fail('permission-denied', 'Only the person who attached a file may remove it.');
    }
    const orderSnap = await tx.get(db.collection('orders').doc(String(row.orderId || '')));
    if (orderSnap.exists) {
      const order = { id: orderSnap.id, ...orderSnap.data() };
      if (deriveRadiologyState(order) === 'reported') {
        fail('failed-precondition', 'This study is already reported; file an addendum rather than deleting its media.');
      }
    }
    tx.delete(ref);
    const path = String(row.storagePath || '');
    // Only ever delete the object this record itself names.
    if (path === `radiology/${row.orderId}/${mediaId}.${String(row.ext || '').toLowerCase()}`) {
      try { await getStorage().bucket().file(path).delete({ ignoreNotFound: true }); }
      catch (error) { console.warn(`radiologyMedia/${mediaId}: object ${path} not removed: ${error && error.message}`); }
    }
    auditInTransaction(tx, staff, 'radiology.media.delete', 'radiologyMedia', mediaId, row.patientId, { orderId: row.orderId || null });
    return { mediaId, orderId: row.orderId || null, removed: true };
  });
});

/**
 * adminImagingDelete — admin-only removal of an imaging request and/or what hangs
 * off it (images in Storage + radiologyMedia, report/addenda/alert, workstation
 * annotations, the linked bill). Browser rules deny every one of those deletes on
 * purpose; this is the single audited path.
 *   data: { orderId, scope: 'all'|'images'|'report'|'bill', force?: boolean }
 */
exports.adminImagingDelete = onCall(async (request) => {
  const staff = await requireStaff(request, ['admin']);
  if (staff.role !== 'admin') fail('permission-denied', 'Only an administrator may delete imaging records.');
  let orderId, scope, mediaId;
  try {
    orderId = cleanText(request.data && request.data.orderId, 200, true, 'orderId');
    scope = cleanText(request.data && request.data.scope, 20, false, 'scope') || 'all';
    mediaId = cleanText(request.data && request.data.mediaId, 200, false, 'mediaId') || null;
  } catch (error) { fail('invalid-argument', error.message); }
  const force = request.data && request.data.force === true;
  try {
    return await deleteImagingStudy(
      { db, bucket: getStorage().bucket(), FieldValue, Timestamp, staff, log: (m) => console.warn(m) },
      { orderId, scope, force, mediaId }
    );
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    fail(error && error.code && /^[a-z-]+$/.test(error.code) ? error.code : 'internal', (error && error.message) || 'The delete failed.');
  }
});

