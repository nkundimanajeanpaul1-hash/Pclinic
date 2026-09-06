'use strict';

/*
 * functions/admin-clinical.cjs — admin-only hard delete for clinical orders.
 *
 * User requirement: when an admin deletes a clinical order/service/request,
 * it must disappear everywhere — order stream, linked results/reports,
 * billing, messages/alerts, patient embedded arrays and linked patient files.
 *
 * Imaging already has a dedicated audited delete path because it also owns
 * Storage objects and multiple radiology-side collections. This module uses
 * that existing implementation for imaging, and handles every other clinical
 * order type directly.
 */

const { ID_RE, isImagingOrder, deleteImagingStudy } = require('./admin-imaging.cjs');

function invalid(message) {
  throw Object.assign(new Error(message), { code: 'invalid-argument' });
}

function notFound(message) {
  throw Object.assign(new Error(message), { code: 'not-found' });
}

function normId(value, label) {
  const out = String(value == null ? '' : value).trim();
  if (!out) invalid(`A ${label} is required.`);
  if (!ID_RE.test(out)) invalid(`The ${label} is not valid.`);
  return out;
}

function normPatient(value) {
  return String(value == null ? '' : value).replace(/^MOD-/i, '').trim();
}

function normText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function splitNames(value) {
  if (Array.isArray(value)) return value.map(normText).filter(Boolean);
  const text = normText(value);
  return text ? [text] : [];
}

function itemNames(order) {
  return (Array.isArray(order && order.items) ? order.items : [])
    .map((item) => normText(item && (item.name || item.code || '')))
    .filter(Boolean);
}

function itemSignature(names) {
  return names.slice().sort().join(' | ');
}

function sameDay(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

function parseDate(value) {
  if (!value) return null;
  try {
    if (value && typeof value.toDate === 'function') {
      const d = value.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (value && typeof value === 'object' && typeof value.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch (error) {
    return null;
  }
}

function linkValues(entry) {
  if (!entry || typeof entry !== 'object') return [];
  const values = [];
  ['id', 'orderId', '_orderId', 'requestId', 'resultId', 'billId', '_billId'].forEach((key) => {
    const value = entry[key];
    if (value != null && value !== '') values.push(String(value));
  });
  const imagingData = entry.imagingData && typeof entry.imagingData === 'object' ? entry.imagingData : null;
  if (imagingData) values.push(...linkValues(imagingData));
  return values;
}

function isExplicitlyLinked(entry, orderId, billIds) {
  const links = linkValues(entry);
  if (links.includes(String(orderId))) return true;
  return links.some((value) => billIds.has(String(value)));
}

function testNames(entry) {
  if (!entry || typeof entry !== 'object') return [];
  if (Array.isArray(entry.tests)) {
    return entry.tests.map((row) => {
      if (row && typeof row === 'object') return normText(row.test || row.name || row.code || '');
      return normText(row);
    }).filter(Boolean);
  }
  if (Array.isArray(entry.items)) {
    return entry.items.map((row) => normText(row && (row.name || row.code || ''))).filter(Boolean);
  }
  if (entry.testName) return splitNames(entry.testName);
  return [];
}

function entryTime(entry) {
  return parseDate(entry && (entry.timestamp || entry.date || entry.at || entry.createdAt || entry.updatedAt));
}

function scoreNames(orderNames, entryNames) {
  if (!orderNames.length || !entryNames.length) return -1;
  const orderSig = itemSignature(orderNames);
  const entrySig = itemSignature(entryNames);
  if (orderSig && orderSig === entrySig) return 100;
  let overlap = 0;
  orderNames.forEach((left) => {
    if (entryNames.some((right) => left === right || left.includes(right) || right.includes(left))) overlap += 1;
  });
  if (!overlap) return -1;
  return 45 + overlap;
}

function pickLegacyIndex(list, order, names) {
  if (!Array.isArray(list) || !list.length || !names.length) return -1;
  const targetAt = parseDate(order && (order.completedAt || order.orderedAt || order.createdAt || order.updatedAt));
  let best = { index: -1, score: -1 };
  list.forEach((entry, index) => {
    const score0 = scoreNames(names, testNames(entry));
    if (score0 < 0) return;
    let score = score0;
    const when = entryTime(entry);
    if (when && targetAt) {
      const delta = Math.abs(when.getTime() - targetAt.getTime());
      if (delta <= 5 * 60 * 1000) score += 30;
      else if (delta <= 2 * 60 * 60 * 1000) score += 20;
      else if (sameDay(when, targetAt)) score += 10;
      else score -= 10;
    }
    if (score > best.score) best = { index, score };
  });
  return best.score >= 70 ? best.index : -1;
}

function removeLinkedEntries(list, order, billIds, fuzzyNames) {
  const rows = Array.isArray(list) ? list.slice() : [];
  if (!rows.length) return { next: rows, removed: 0 };
  const kept = [];
  let removed = 0;
  rows.forEach((entry) => {
    if (isExplicitlyLinked(entry, order.id, billIds)) {
      removed += 1;
      return;
    }
    kept.push(entry);
  });
  if (removed > 0) return { next: kept, removed };
  const pick = pickLegacyIndex(rows, order, fuzzyNames || []);
  if (pick < 0) return { next: rows, removed: 0 };
  return {
    next: rows.filter((_, index) => index !== pick),
    removed: 1,
  };
}

function cleanupPatientArrays(patient, order, billIds) {
  const patch = {};
  const removed = {
    labRequests: 0,
    labResults: 0,
    physioRequests: 0,
    imagingRequests: 0,
    prescriptions: 0,
    clinicalNotes: 0,
  };
  const orderNamesList = itemNames(order);
  const type = String(order && (order.type || order.dept) || '').toLowerCase();

  function apply(field, result) {
    if (!Array.isArray(patient && patient[field])) return;
    if (result.removed > 0) {
      patch[field] = result.next;
      removed[field] = result.removed;
    }
  }

  if (type === 'lab') {
    apply('labRequests', removeLinkedEntries(patient.labRequests, order, billIds, orderNamesList));
    apply('labResults', removeLinkedEntries(patient.labResults, order, billIds, orderNamesList));
  }

  if (type === 'physio') {
    apply('physioRequests', removeLinkedEntries(patient.physioRequests, order, billIds, orderNamesList));
  }

  if (type === 'prescription' && Array.isArray(patient && patient.prescriptions)) {
    apply('prescriptions', removeLinkedEntries(patient.prescriptions, order, billIds, []));
  }

  if ((type === 'imaging' || type === 'radiology') && Array.isArray(patient && patient.imagingRequests)) {
    apply('imagingRequests', removeLinkedEntries(patient.imagingRequests, order, billIds, orderNamesList));
  }

  if (Array.isArray(patient && patient.clinicalNotes)) {
    apply('clinicalNotes', removeLinkedEntries(patient.clinicalNotes, order, billIds, []));
  }

  return { patch, removed };
}

function legacyArrayField(kind) {
  const key = String(kind || '').toLowerCase();
  if (key === 'labrequest') return 'labRequests';
  if (key === 'labresult') return 'labResults';
  if (key === 'physiorequest') return 'physioRequests';
  if (key === 'imagingrequest') return 'imagingRequests';
  if (key === 'prescription') return 'prescriptions';
  if (key === 'clinicalnote') return 'clinicalNotes';
  return '';
}

function legacyNames(entry) {
  return testNames(entry);
}

function deleteOneLegacyEntry(list, legacyEntry) {
  const rows = Array.isArray(list) ? list.slice() : [];
  if (!rows.length) return { next: rows, removed: 0 };
  const targetLinks = new Set(linkValues(legacyEntry));
  if (targetLinks.size) {
    const kept = rows.filter((entry) => {
      const matched = linkValues(entry).some((value) => targetLinks.has(String(value)));
      return !matched;
    });
    if (kept.length !== rows.length) return { next: kept, removed: rows.length - kept.length };
  }
  const wanted = legacyNames(legacyEntry);
  const fakeOrder = {
    id: String(legacyEntry && (legacyEntry.orderId || legacyEntry.id || 'legacy')),
    orderedAt: legacyEntry && (legacyEntry.timestamp || legacyEntry.date || legacyEntry.at || legacyEntry.createdAt),
    completedAt: legacyEntry && (legacyEntry.date || legacyEntry.completedAt || legacyEntry.updatedAt),
    items: wanted.map((name, index) => ({ id: index + 1, name })),
  };
  const pick = pickLegacyIndex(rows, fakeOrder, wanted);
  if (pick < 0) return { next: rows, removed: 0 };
  return { next: rows.filter((_, index) => index !== pick), removed: 1 };
}

function summariseRemoved(removed) {
  const parts = [];
  if (removed.order) parts.push('order');
  if (removed.reports) parts.push(`${removed.reports} report${removed.reports === 1 ? '' : 's'}`);
  if (removed.addenda) parts.push(`${removed.addenda} addend${removed.addenda === 1 ? 'um' : 'a'}`);
  if (removed.media) parts.push(`${removed.media} image${removed.media === 1 ? '' : 's'}`);
  if (removed.annotations) parts.push(`${removed.annotations} annotation set${removed.annotations === 1 ? '' : 's'}`);
  if (removed.bills) parts.push(`${removed.bills} bill${removed.bills === 1 ? '' : 's'}`);
  if (removed.messages) parts.push(`${removed.messages} message${removed.messages === 1 ? '' : 's'}`);
  if (removed.notifications) parts.push(`${removed.notifications} notification${removed.notifications === 1 ? '' : 's'}`);
  if (removed.criticalAlerts) parts.push(`${removed.criticalAlerts} critical alert${removed.criticalAlerts === 1 ? '' : 's'}`);
  if (removed.labCriticalAlerts) parts.push(`${removed.labCriticalAlerts} lab critical alert${removed.labCriticalAlerts === 1 ? '' : 's'}`);
  if (removed.patientFiles) parts.push(`${removed.patientFiles} patient file${removed.patientFiles === 1 ? '' : 's'}`);
  if (removed.patientEmbedded) parts.push(`${removed.patientEmbedded} patient embedded entr${removed.patientEmbedded === 1 ? 'y' : 'ies'}`);
  return parts.length ? parts.join(', ') + ' removed' : 'nothing to remove';
}

function addRef(map, ref, id, collectionName) {
  if (!ref) return;
  const key = ref.path || `${collectionName || ''}/${String(id || ref.id || '')}`;
  map.set(key, ref);
}

async function rowsByField(db, col, field, value) {
  const snap = await db.collection(col).where(field, '==', value).get();
  const out = [];
  snap.forEach((docSnap) => {
    out.push({ id: docSnap.id, ref: docSnap.ref, ...docSnap.data() });
  });
  return out;
}

async function getPatientFiles(db, patientId) {
  if (!patientId) return [];
  const patientRef = db.collection('patients').doc(String(patientId));
  let snap;
  if (patientRef && typeof patientRef.collection === 'function') {
    snap = await patientRef.collection('files').get();
  } else {
    snap = await db.collection(`patients/${patientId}/files`).get();
  }
  const out = [];
  snap.forEach((docSnap) => {
    out.push({ id: docSnap.id, ref: docSnap.ref, ...docSnap.data() });
  });
  return out;
}

async function deleteClinicalOrderCascade(deps, { orderId, force = false }) {
  const { db, Timestamp, staff } = deps;
  const orderRef = db.collection('orders').doc(normId(orderId, 'order id'));
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) notFound('This clinical order no longer exists on the common server.');
  const order = { id: orderSnap.id, ...orderSnap.data() };

  if (isImagingOrder(order)) {
    return deleteImagingStudy(deps, { orderId: order.id, scope: 'all', force: force === true });
  }

  const patientId = normPatient(order.patientId);
  const patientRef = patientId ? db.collection('patients').doc(patientId) : null;
  const [patientSnap, billsByOrder, messagesByOrder, messagesByResult, criticalByOrder, criticalByResult, labCriticalByOrder, labCriticalByResult, notificationsByOrder, notificationsByResult] = await Promise.all([
    patientRef ? patientRef.get() : Promise.resolve(null),
    rowsByField(db, 'bills', 'orderId', order.id),
    rowsByField(db, 'messages', 'orderId', order.id),
    rowsByField(db, 'messages', 'resultId', order.id),
    rowsByField(db, 'criticalAlerts', 'orderId', order.id),
    rowsByField(db, 'criticalAlerts', 'resultId', order.id),
    rowsByField(db, 'labCriticalAlerts', 'orderId', order.id),
    rowsByField(db, 'labCriticalAlerts', 'resultId', order.id),
    rowsByField(db, 'notifications', 'orderId', order.id).catch(() => []),
    rowsByField(db, 'notifications', 'resultId', order.id).catch(() => []),
  ]);

  const billMap = new Map();
  billsByOrder.forEach((row) => billMap.set(String(row.id), row));
  if (order.billId) {
    const directBill = await db.collection('bills').doc(String(order.billId)).get();
    if (directBill.exists) billMap.set(String(directBill.id), { id: directBill.id, ref: directBill.ref, ...directBill.data() });
  }
  const bills = Array.from(billMap.values());
  const billIds = new Set(bills.map((row) => String(row.id)));

  const [notificationsByBill, messagesByBill, files] = await Promise.all([
    Promise.all(Array.from(billIds).map((billId) => rowsByField(db, 'notifications', 'billId', billId).catch(() => []))).then((chunks) => chunks.flat()),
    Promise.all(Array.from(billIds).map((billId) => rowsByField(db, 'messages', 'billId', billId))).then((chunks) => chunks.flat()),
    getPatientFiles(db, patientId),
  ]);

  const patientEmbedded = { patch: {}, removed: { labRequests: 0, labResults: 0, physioRequests: 0, imagingRequests: 0, prescriptions: 0, clinicalNotes: 0 } };
  if (patientSnap && patientSnap.exists) {
    Object.assign(patientEmbedded, cleanupPatientArrays(patientSnap.data() || {}, order, billIds));
  }

  const fileRefs = new Map();
  files.forEach((row) => {
    if (String(row.orderId || '') === String(order.id) || billIds.has(String(row.billId || ''))) {
      addRef(fileRefs, row.ref, row.id, `patients/${patientId}/files`);
    }
  });

  const messageRefs = new Map();
  messagesByOrder.concat(messagesByResult, messagesByBill).forEach((row) => addRef(messageRefs, row.ref, row.id, 'messages'));

  const notificationRefs = new Map();
  notificationsByOrder.concat(notificationsByResult, notificationsByBill).forEach((row) => addRef(notificationRefs, row.ref, row.id, 'notifications'));

  const criticalRefs = new Map();
  criticalByOrder.concat(criticalByResult).forEach((row) => addRef(criticalRefs, row.ref, row.id, 'criticalAlerts'));

  const labCriticalRefs = new Map();
  labCriticalByOrder.concat(labCriticalByResult).forEach((row) => addRef(labCriticalRefs, row.ref, row.id, 'labCriticalAlerts'));

  const paidBills = bills.filter((bill) => (Number(bill.paid) || 0) > 0).map((bill) => ({ id: bill.id, number: bill.number || bill.id, paid: Number(bill.paid) || 0 }));
  if (paidBills.length && !force) {
    throw Object.assign(new Error(`Bill ${paidBills[0].number} already has ${paidBills[0].paid} paid and needs forced delete confirmation.`), { code: 'failed-precondition', blocked: paidBills });
  }

  let batch = db.batch();
  let ops = 0;
  const commits = [];
  const op = (fn) => {
    fn(batch);
    ops += 1;
    if (ops >= 450) {
      commits.push(batch.commit());
      batch = db.batch();
      ops = 0;
    }
  };

  Array.from(messageRefs.values()).forEach((ref) => op((b) => b.delete(ref)));
  Array.from(notificationRefs.values()).forEach((ref) => op((b) => b.delete(ref)));
  Array.from(criticalRefs.values()).forEach((ref) => op((b) => b.delete(ref)));
  Array.from(labCriticalRefs.values()).forEach((ref) => op((b) => b.delete(ref)));
  Array.from(fileRefs.values()).forEach((ref) => op((b) => b.delete(ref)));
  bills.forEach((bill) => op((b) => b.delete(bill.ref || db.collection('bills').doc(String(bill.id)))));
  if (patientRef && Object.keys(patientEmbedded.patch).length) {
    const now = Timestamp.now();
    op((b) => b.update(patientRef, {
      ...patientEmbedded.patch,
      updatedAt: now,
      updatedBy: staff.name,
      updatedById: staff.staffId,
    }));
  }
  op((b) => b.delete(orderRef));

  const removedEmbedded = Object.values(patientEmbedded.removed).reduce((sum, count) => sum + (Number(count) || 0), 0);
  const now = Timestamp.now();
  op((b) => b.set(db.collection('auditLog').doc(), {
    actorUid: staff.uid,
    actorStaffId: staff.staffId,
    actorName: staff.name,
    actorRole: staff.role,
    action: 'admin.clinical-order.delete',
    resourceType: 'order',
    resourceId: String(order.id),
    patientId: patientId || null,
    details: {
      type: String(order.type || ''),
      dept: String(order.dept || ''),
      force: !!force,
      bills: bills.map((bill) => ({ id: bill.id, number: bill.number || bill.id, paid: Number(bill.paid) || 0 })),
      patientEmbeddedRemoved: patientEmbedded.removed,
      messages: Array.from(messageRefs.keys()),
      notifications: Array.from(notificationRefs.keys()),
      criticalAlerts: Array.from(criticalRefs.keys()),
      labCriticalAlerts: Array.from(labCriticalRefs.keys()),
      patientFiles: Array.from(fileRefs.keys()),
    },
    at: now,
  }));

  commits.push(batch.commit());
  await Promise.all(commits);

  const removed = {
    order: true,
    reports: 0,
    addenda: 0,
    media: 0,
    annotations: 0,
    bills: bills.length,
    messages: messageRefs.size,
    notifications: notificationRefs.size,
    criticalAlerts: criticalRefs.size,
    labCriticalAlerts: labCriticalRefs.size,
    patientFiles: fileRefs.size,
    patientEmbedded: removedEmbedded,
  };

  return {
    orderId: String(order.id),
    billIds: bills.map((bill) => String(bill.id)),
    patientId: patientId || null,
    orderType: String(order.type || order.dept || ''),
    removed,
    patientEmbeddedRemoved: patientEmbedded.removed,
    summary: summariseRemoved(removed),
  };
}

async function deleteBillOnly(deps, { billId, force = false }) {
  const { db, Timestamp, staff } = deps;
  const ref = db.collection('bills').doc(normId(billId, 'bill id'));
  const snap = await ref.get();
  if (!snap.exists) notFound('This bill no longer exists on the common server.');
  const bill = { id: snap.id, ref: snap.ref, ...snap.data() };
  const paid = Number(bill.paid) || 0;
  if (paid > 0 && !force) {
    throw Object.assign(new Error(`Bill ${bill.number || bill.id} already has ${paid} paid and needs forced delete confirmation.`), { code: 'failed-precondition', blocked: [{ id: bill.id, number: bill.number || bill.id, paid }] });
  }

  const patientId = normPatient(bill.patientId);
  const files = await getPatientFiles(db, patientId);
  const fileRefs = new Map();
  files.forEach((row) => {
    if (String(row.billId || '') === String(bill.id)) addRef(fileRefs, row.ref, row.id, `patients/${patientId}/files`);
  });
  const [messagesByBill, notificationsByBill] = await Promise.all([
    rowsByField(db, 'messages', 'billId', bill.id),
    rowsByField(db, 'notifications', 'billId', bill.id).catch(() => []),
  ]);
  const messageRefs = new Map();
  const notificationRefs = new Map();
  messagesByBill.forEach((row) => addRef(messageRefs, row.ref, row.id, 'messages'));
  notificationsByBill.forEach((row) => addRef(notificationRefs, row.ref, row.id, 'notifications'));

  let batch = db.batch();
  let ops = 0;
  const commits = [];
  const op = (fn) => {
    fn(batch);
    ops += 1;
    if (ops >= 450) {
      commits.push(batch.commit());
      batch = db.batch();
      ops = 0;
    }
  };
  Array.from(messageRefs.values()).forEach((r) => op((b) => b.delete(r)));
  Array.from(notificationRefs.values()).forEach((r) => op((b) => b.delete(r)));
  Array.from(fileRefs.values()).forEach((r) => op((b) => b.delete(r)));
  op((b) => b.delete(ref));
  const now = Timestamp.now();
  op((b) => b.set(db.collection('auditLog').doc(), {
    actorUid: staff.uid,
    actorStaffId: staff.staffId,
    actorName: staff.name,
    actorRole: staff.role,
    action: 'admin.bill.delete',
    resourceType: 'bill',
    resourceId: String(bill.id),
    patientId: patientId || null,
    details: {
      force: !!force,
      number: bill.number || bill.id,
      paid,
      orderId: String(bill.orderId || ''),
      messages: Array.from(messageRefs.keys()),
      notifications: Array.from(notificationRefs.keys()),
      patientFiles: Array.from(fileRefs.keys()),
    },
    at: now,
  }));
  commits.push(batch.commit());
  await Promise.all(commits);

  const removed = {
    order: false,
    reports: 0,
    addenda: 0,
    media: 0,
    annotations: 0,
    bills: 1,
    messages: messageRefs.size,
    notifications: notificationRefs.size,
    criticalAlerts: 0,
    labCriticalAlerts: 0,
    patientFiles: fileRefs.size,
    patientEmbedded: 0,
  };
  return {
    orderId: bill.orderId ? String(bill.orderId) : null,
    billIds: [String(bill.id)],
    patientId: patientId || null,
    orderType: '',
    removed,
    patientEmbeddedRemoved: {},
    summary: summariseRemoved(removed),
  };
}

async function deleteLegacyPatientEntry(deps, { patientId, legacyKind, legacyEntry }) {
  const { db, Timestamp, staff } = deps;
  const id = normPatient(patientId);
  if (!id) invalid('A patient ID is required for a legacy embedded delete.');
  const field = legacyArrayField(legacyKind);
  if (!field) invalid('legacyKind must be one of labRequest, labResult, physioRequest, imagingRequest, prescription or clinicalNote.');
  if (!legacyEntry || typeof legacyEntry !== 'object') invalid('A legacy entry payload is required.');

  const patientRef = db.collection('patients').doc(String(id));
  const patientSnap = await patientRef.get();
  if (!patientSnap.exists) notFound('The patient was not found on the common server.');
  const patient = patientSnap.data() || {};
  const cleaned = deleteOneLegacyEntry(patient[field], legacyEntry);
  if (!cleaned.removed) {
    return {
      orderId: null,
      billIds: [],
      patientId: id,
      orderType: 'legacy',
      removed: {
        order: false,
        reports: 0,
        addenda: 0,
        media: 0,
        annotations: 0,
        bills: 0,
        messages: 0,
        notifications: 0,
        criticalAlerts: 0,
        labCriticalAlerts: 0,
        patientFiles: 0,
        patientEmbedded: 0,
      },
      patientEmbeddedRemoved: { [field]: 0 },
      summary: 'nothing to remove',
    };
  }

  const files = await getPatientFiles(db, id);
  const entryLinks = new Set(linkValues(legacyEntry));
  const fileRefs = new Map();
  files.forEach((row) => {
    const linked = entryLinks.size && linkValues(row).some((value) => entryLinks.has(String(value)));
    if (linked) addRef(fileRefs, row.ref, row.id, `patients/${id}/files`);
  });

  let batch = db.batch();
  let ops = 0;
  const commits = [];
  const op = (fn) => {
    fn(batch);
    ops += 1;
    if (ops >= 450) {
      commits.push(batch.commit());
      batch = db.batch();
      ops = 0;
    }
  };
  const now = Timestamp.now();
  op((b) => b.update(patientRef, {
    [field]: cleaned.next,
    updatedAt: now,
    updatedBy: staff.name,
    updatedById: staff.staffId,
  }));
  Array.from(fileRefs.values()).forEach((ref) => op((b) => b.delete(ref)));
  op((b) => b.set(db.collection('auditLog').doc(), {
    actorUid: staff.uid,
    actorStaffId: staff.staffId,
    actorName: staff.name,
    actorRole: staff.role,
    action: 'admin.patient-embedded.delete',
    resourceType: 'patient',
    resourceId: String(id),
    patientId: id,
    details: {
      legacyKind: String(legacyKind),
      patientFiles: Array.from(fileRefs.keys()),
      removed: cleaned.removed,
    },
    at: now,
  }));
  commits.push(batch.commit());
  await Promise.all(commits);

  const removed = {
    order: false,
    reports: 0,
    addenda: 0,
    media: 0,
    annotations: 0,
    bills: 0,
    messages: 0,
    notifications: 0,
    criticalAlerts: 0,
    labCriticalAlerts: 0,
    patientFiles: fileRefs.size,
    patientEmbedded: cleaned.removed,
  };
  return {
    orderId: null,
    billIds: [],
    patientId: id,
    orderType: 'legacy',
    removed,
    patientEmbeddedRemoved: { [field]: cleaned.removed },
    summary: summariseRemoved(removed),
  };
}

async function resolveOrderIdFromBill(db, billId) {
  const ref = db.collection('bills').doc(normId(billId, 'bill id'));
  const snap = await ref.get();
  if (!snap.exists) notFound('This bill no longer exists on the common server.');
  const bill = { id: snap.id, ref: snap.ref, ...snap.data() };
  return { bill, orderId: bill.orderId ? String(bill.orderId) : '' };
}

module.exports = {
  normText,
  itemNames,
  itemSignature,
  removeLinkedEntries,
  cleanupPatientArrays,
  deleteClinicalOrderCascade,
  deleteBillOnly,
  deleteLegacyPatientEntry,
  resolveOrderIdFromBill,
  summariseRemoved,
};
