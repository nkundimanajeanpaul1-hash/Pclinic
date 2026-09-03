'use strict';

/*
 * functions/admin-imaging.cjs — "delete an imaging study from the common server"
 *
 * The admin dashboard shows every radiology order of a patient together with
 * the images (radiologyMedia + Storage objects), the report (radiologyReports,
 * radiologyAddenda, criticalAlerts), the workstation annotations
 * (radiologyAnnotations) and the bill raised for it. Browser clients may not
 * delete any of those (firestore.rules), so the removal runs here with the
 * Admin SDK after the caller has been verified as an active admin.
 *
 * Pure planning helpers are exported so they can be unit-tested without an
 * emulator; `deleteImagingStudy` wires them to Firestore + Storage.
 */

const ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
const SCOPES = ['all', 'images', 'report', 'bill'];

function normaliseScope(value) {
  const scope = String(value || 'all').toLowerCase();
  if (!SCOPES.includes(scope)) throw new Error(`scope must be one of ${SCOPES.join(', ')}.`);
  return scope;
}

function isImagingOrder(order) {
  return !!order && (order.dept === 'radiology' || order.type === 'imaging');
}

/** Storage object of a media record — only the exact path the record itself names. */
function objectPathFor(row) {
  const ext = String(row.ext || '').toLowerCase();
  const path = String(row.storagePath || '');
  return path === `radiology/${row.orderId}/${row.id}.${ext}` ? path : null;
}

/**
 * Decide what a request removes.
 *   scope 'images'  → media records + objects + annotations
 *   scope 'report'  → report, addenda, alert; order goes back to 'acquired' (or 'pending' when no images)
 *   scope 'bill'    → the bill(s) linked to the order (only unpaid ones unless force)
 *   scope 'all'     → everything above + the order itself
 */
function planDeletion({ order, media = [], reports = [], addenda = [], alerts = [], annotations = [], bills = [], scope = 'all', force = false, mediaId = null }) {
  const s = normaliseScope(scope);
  const plan = { scope: s, mediaId: mediaId ? String(mediaId) : null, deleteOrder: false, media: [], objects: [], annotations: [], reports: [], addenda: [], alerts: [], bills: [], orderPatch: null, blocked: [] };

  if (s === 'all' || s === 'images') {
    // scope 'images' + mediaId → just that one image (and the drawings made on it)
    const pick = (s === 'images' && plan.mediaId) ? media.filter((m) => String(m.id) === plan.mediaId) : media;
    if (s === 'images' && plan.mediaId && !pick.length) throw Object.assign(new Error('That image is no longer on the common server.'), { code: 'not-found' });
    plan.media = pick.map((m) => m.id);
    plan.objects = pick.map(objectPathFor).filter(Boolean);
    plan.annotations = annotations.filter((a) => !plan.mediaId || s === 'all' || String(a.mediaId) === plan.mediaId).map((a) => a.id);
  }
  if (s === 'all' || s === 'report') {
    plan.reports = reports.map((r) => r.id);
    plan.addenda = addenda.map((a) => a.id);
    plan.alerts = alerts.map((a) => a.id);
  }
  if (s === 'all' || s === 'bill') {
    bills.forEach((b) => {
      const paid = Number(b.paid) || 0;
      if (paid > 0 && !force) plan.blocked.push({ id: b.id, number: b.number || b.id, reason: `already has ${paid} paid — void it in the cashier ledger or confirm the forced delete.` });
      else plan.bills.push(b.id);
    });
  }
  if (s === 'all') {
    plan.deleteOrder = true;
  } else if (s === 'report' && plan.reports.length) {
    const hasImages = media.length > 0;
    plan.orderPatch = { radiologyState: hasImages ? 'acquired' : 'pending', status: 'in-progress', reportId: null, result: null };
  } else if (s === 'images' && order && order.radiologyState === 'acquired' && plan.media.length && plan.media.length === media.length) {
    plan.orderPatch = { radiologyState: 'in-progress' };   // no image left → not "acquired" any more
  }
  return plan;
}

function summarise(plan) {
  const parts = [];
  if (plan.deleteOrder) parts.push('order');
  if (plan.media.length) parts.push(`${plan.media.length} image${plan.media.length === 1 ? '' : 's'}`);
  if (plan.reports.length) parts.push('report');
  if (plan.addenda.length) parts.push(`${plan.addenda.length} addend${plan.addenda.length === 1 ? 'um' : 'a'}`);
  if (plan.alerts.length) parts.push('critical alert');
  if (plan.annotations.length) parts.push(`${plan.annotations.length} annotation set${plan.annotations.length === 1 ? '' : 's'}`);
  if (plan.bills.length) parts.push(`${plan.bills.length} bill${plan.bills.length === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') + ' removed' : 'nothing to remove';
}

/**
 * Perform the deletion. `deps` = { db, bucket, FieldValue, Timestamp, staff, log }.
 * Reads everything first, plans, then writes in one batch (≤ 500 ops per batch).
 */
async function deleteImagingStudy(deps, { orderId, scope = 'all', force = false, mediaId = null }) {
  const { db, bucket, Timestamp, staff } = deps;
  const log = deps.log || (() => {});
  if (!ID_RE.test(String(orderId || ''))) throw Object.assign(new Error('The order id is not valid.'), { code: 'invalid-argument' });
  const orderRef = db.collection('orders').doc(String(orderId));
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw Object.assign(new Error('This imaging request no longer exists on the common server.'), { code: 'not-found' });
  const order = { id: orderSnap.id, ...orderSnap.data() };
  // scope 'bill' is also used by the admin Bills tab for lab/other request bills; every other scope is radiology-only.
  if (!isImagingOrder(order) && normaliseScope(scope) !== 'bill') throw Object.assign(new Error('This order is not a radiology order.'), { code: 'failed-precondition' });

  const rows = async (col, field, value) => {
    const snap = await db.collection(col).where(field, '==', value).get();
    const out = []; snap.forEach((d) => out.push({ id: d.id, ...d.data() })); return out;
  };
  const reportId = `rad_${order.id}`;
  const [media, reports, addenda, alerts, annotations, billsByOrder] = await Promise.all([
    rows('radiologyMedia', 'orderId', order.id),
    rows('radiologyReports', 'orderId', order.id),
    rows('radiologyAddenda', 'orderId', order.id),
    rows('criticalAlerts', 'orderId', order.id),
    rows('radiologyAnnotations', 'orderId', order.id),
    rows('bills', 'orderId', order.id),
  ]);
  // The report document id is deterministic; include it even if the orderId field were missing.
  if (!reports.some((r) => r.id === reportId)) {
    const direct = await db.collection('radiologyReports').doc(reportId).get();
    if (direct.exists) reports.push({ id: direct.id, ...direct.data() });
  }
  const bills = billsByOrder.slice();
  if (order.billId && !bills.some((b) => b.id === order.billId)) {
    const direct = await db.collection('bills').doc(String(order.billId)).get();
    if (direct.exists) bills.push({ id: direct.id, ...direct.data() });
  }

  const plan = planDeletion({ order, media, reports, addenda, alerts, annotations, bills, scope, force, mediaId });
  if (plan.blocked.length && (plan.scope === 'bill')) {
    throw Object.assign(new Error(`Bill ${plan.blocked[0].number} ${plan.blocked[0].reason}`), { code: 'failed-precondition', blocked: plan.blocked });
  }

  // Storage first (outside the batch): a stranded object is harmless, a stranded record is not.
  const objectsRemoved = [];
  for (const path of plan.objects) {
    try { await bucket.file(path).delete({ ignoreNotFound: true }); objectsRemoved.push(path); }
    catch (error) { log(`admin imaging delete: object ${path} not removed: ${error && error.message}`); }
  }

  let batch = db.batch(); let ops = 0; const batches = [];
  const op = (fn) => { fn(batch); ops++; if (ops >= 450) { batches.push(batch.commit()); batch = db.batch(); ops = 0; } };
  plan.media.forEach((id) => op((b) => b.delete(db.collection('radiologyMedia').doc(id))));
  plan.annotations.forEach((id) => op((b) => b.delete(db.collection('radiologyAnnotations').doc(id))));
  plan.reports.forEach((id) => op((b) => b.delete(db.collection('radiologyReports').doc(id))));
  plan.addenda.forEach((id) => op((b) => b.delete(db.collection('radiologyAddenda').doc(id))));
  plan.alerts.forEach((id) => op((b) => b.delete(db.collection('criticalAlerts').doc(id))));
  plan.bills.forEach((id) => op((b) => b.delete(db.collection('bills').doc(id))));
  const now = Timestamp.now();
  if (plan.deleteOrder) op((b) => b.delete(orderRef));
  else if (plan.orderPatch) op((b) => b.update(orderRef, { ...plan.orderPatch, updatedAt: now, updatedBy: staff.name, updatedById: staff.staffId }));
  op((b) => b.set(db.collection('auditLog').doc(), {
    actorUid: staff.uid, actorStaffId: staff.staffId, actorName: staff.name, actorRole: staff.role,
    action: 'admin.imaging.delete', resourceType: 'order', resourceId: String(order.id),
    patientId: order.patientId == null ? null : String(order.patientId),
    details: { scope: plan.scope, mediaId: plan.mediaId, force: !!force, media: plan.media, objects: objectsRemoved, reports: plan.reports, addenda: plan.addenda, alerts: plan.alerts, annotations: plan.annotations, bills: plan.bills, deleteOrder: plan.deleteOrder, orderPatch: plan.orderPatch, blockedBills: plan.blocked },
    at: now,
  }));
  batches.push(batch.commit());
  await Promise.all(batches);

  return {
    orderId: order.id, patientId: order.patientId == null ? null : String(order.patientId), scope: plan.scope,
    removed: { order: plan.deleteOrder, media: plan.media.length, objects: objectsRemoved.length, reports: plan.reports.length, addenda: plan.addenda.length, alerts: plan.alerts.length, annotations: plan.annotations.length, bills: plan.bills.length },
    blockedBills: plan.blocked, orderPatch: plan.orderPatch, summary: summarise(plan),
  };
}

module.exports = { ID_RE, SCOPES, normaliseScope, isImagingOrder, objectPathFor, planDeletion, summarise, deleteImagingStudy };
