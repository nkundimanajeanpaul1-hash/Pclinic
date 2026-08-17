'use strict';

const { setGlobalOptions } = require('firebase-functions/v2');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
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

exports.radiologyTransition = onCall(async (request) => {
  const staff = await requireStaff(request, ['radio']);
  const orderId = cleanText(request.data && request.data.orderId, 300, true, 'orderId');
  const action = cleanText(request.data && request.data.action, 40, true, 'action');
  const reason = cleanText(request.data && request.data.reason, 1000, false, 'reason');
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
  const orderId = cleanText(request.data && request.data.orderId, 300, true, 'orderId');
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
  const orderId = cleanText(request.data && request.data.orderId, 300, true, 'orderId');
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
  const reportId = cleanText(request.data && request.data.reportId, 500, true, 'reportId');
  const text = cleanText(request.data && request.data.text, 10000, true, 'addendum text');
  const reason = cleanText(request.data && request.data.reason, 1000, true, 'addendum reason');
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
  const reportId = cleanText(request.data && request.data.reportId, 500, true, 'reportId');
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
