'use strict';

/*
 * Unit tests for functions/admin-imaging.cjs — what the admin "Delete" on the
 * Imaging tab removes from the common server, and what it refuses to touch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { planDeletion, summarise, objectPathFor, deleteImagingStudy, normaliseScope } = require('../admin-imaging.cjs');

const order = { id: 'ord-1', dept: 'radiology', type: 'imaging', patientId: 1001, radiologyState: 'reported', status: 'completed', billId: 'bill-1' };
const media = [
  { id: 'm1', orderId: 'ord-1', ext: 'dcm', storagePath: 'radiology/ord-1/m1.dcm' },
  { id: 'm2', orderId: 'ord-1', ext: 'png', storagePath: 'radiology/other/m2.png' },   // tampered path → object left alone
];
const reports = [{ id: 'rad_ord-1', orderId: 'ord-1' }];
const addenda = [{ id: 'add-1' }, { id: 'add-2' }];
const alerts = [{ id: 'rad_ord-1' }];
const annotations = [{ id: 'm1_doc-1' }, { id: 'm1_rad-1' }];
const bills = [{ id: 'bill-1', number: 'INV-1', paid: 0, total: 15000 }];

test('scope "all" removes the order and everything hanging off it', () => {
  const plan = planDeletion({ order, media, reports, addenda, alerts, annotations, bills, scope: 'all' });
  assert.equal(plan.deleteOrder, true);
  assert.deepEqual(plan.media, ['m1', 'm2']);
  assert.deepEqual(plan.objects, ['radiology/ord-1/m1.dcm'], 'only objects the record legitimately names');
  assert.deepEqual(plan.reports, ['rad_ord-1']); assert.deepEqual(plan.addenda, ['add-1', 'add-2']); assert.deepEqual(plan.alerts, ['rad_ord-1']);
  assert.deepEqual(plan.annotations, ['m1_doc-1', 'm1_rad-1']); assert.deepEqual(plan.bills, ['bill-1']);
  assert.equal(plan.orderPatch, null);
  assert.equal(summarise(plan), 'order, 2 images, report, 2 addenda, critical alert, 2 annotation sets, 1 bill removed');
});

test('scope "images" removes images + their annotations only and steps an acquired study back', () => {
  const plan = planDeletion({ order: { ...order, radiologyState: 'acquired' }, media, reports, addenda, alerts, annotations, bills, scope: 'images' });
  assert.equal(plan.deleteOrder, false);
  assert.deepEqual(plan.media, ['m1', 'm2']); assert.deepEqual(plan.annotations, ['m1_doc-1', 'm1_rad-1']);
  assert.deepEqual(plan.reports, []); assert.deepEqual(plan.bills, []);
  assert.deepEqual(plan.orderPatch, { radiologyState: 'in-progress' });
  const reported = planDeletion({ order, media, scope: 'images' });
  assert.equal(reported.orderPatch, null, 'a reported study keeps its state when only images go');
});

test('scope "report" removes report/addenda/alert and reopens the order for radiology', () => {
  const plan = planDeletion({ order, media, reports, addenda, alerts, annotations, bills, scope: 'report' });
  assert.deepEqual(plan.reports, ['rad_ord-1']); assert.deepEqual(plan.addenda, ['add-1', 'add-2']); assert.deepEqual(plan.alerts, ['rad_ord-1']);
  assert.deepEqual(plan.media, []); assert.deepEqual(plan.bills, []); assert.equal(plan.deleteOrder, false);
  assert.deepEqual(plan.orderPatch, { radiologyState: 'acquired', status: 'in-progress', reportId: null, result: null });
  const noImages = planDeletion({ order, media: [], reports, scope: 'report' });
  assert.equal(noImages.orderPatch.radiologyState, 'pending');
  const nothing = planDeletion({ order, media, reports: [], scope: 'report' });
  assert.equal(nothing.orderPatch, null, 'no report → nothing to reopen');
});

test('bills with money already paid are refused unless forced', () => {
  const paid = [{ id: 'bill-2', number: 'INV-2', paid: 5000, total: 15000 }];
  const plan = planDeletion({ order, bills: paid, scope: 'bill' });
  assert.deepEqual(plan.bills, []); assert.equal(plan.blocked.length, 1); assert.match(plan.blocked[0].reason, /5000 paid/);
  const forced = planDeletion({ order, bills: paid, scope: 'bill', force: true });
  assert.deepEqual(forced.bills, ['bill-2']); assert.deepEqual(forced.blocked, []);
  const all = planDeletion({ order, bills: paid, scope: 'all' });
  assert.equal(all.deleteOrder, true, 'scope all still removes the order…');
  assert.deepEqual(all.bills, [], '…but keeps a paid bill unless forced');
});

test('scope validation and object path guard', () => {
  assert.throws(() => normaliseScope('everything'), /scope must be one of/);
  assert.equal(normaliseScope(undefined), 'all'); assert.equal(normaliseScope('Report'), 'report');
  assert.equal(objectPathFor({ id: 'x', orderId: 'o', ext: 'DCM', storagePath: 'radiology/o/x.dcm' }), 'radiology/o/x.dcm');
  assert.equal(objectPathFor({ id: 'x', orderId: 'o', ext: 'dcm', storagePath: '../users.json' }), null);
});

/* ── deleteImagingStudy against a tiny fake Firestore/Storage ── */
function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed)); const log = [];
  const docRef = (col, id) => ({
    col, id,
    async get() { const d = data[col] && data[col][id]; return { exists: !!d, id, data: () => d }; },
  });
  const db = {
    data, log,
    collection(col) {
      return {
        doc: (id) => docRef(col, id || ('auto-' + Math.random().toString(36).slice(2, 8))),
        where(field, op, value) { return { async get() { const rows = Object.values(data[col] || {}).filter((r) => String(r[field]) === String(value)); return { forEach: (fn) => rows.forEach((r) => fn({ id: r.id, data: () => r })) }; } }; },
      };
    },
    batch() {
      const ops = [];
      return {
        delete(ref) { ops.push(['delete', ref.col, ref.id]); },
        update(ref, patch) { ops.push(['update', ref.col, ref.id, patch]); },
        set(ref, doc) { ops.push(['set', ref.col, ref.id, doc]); },
        async commit() { ops.forEach((o) => { log.push(o); if (o[0] === 'delete') { if (data[o[1]]) delete data[o[1]][o[2]]; } else if (o[0] === 'update') { Object.assign(data[o[1]][o[2]], o[3]); } else { data[o[1]] = data[o[1]] || {}; data[o[1]][o[2]] = o[3]; } }); },
      };
    },
  };
  return db;
}
const seed = {
  orders: { 'ord-1': { ...order } },
  radiologyMedia: { m1: media[0], m2: media[1] },
  radiologyReports: { 'rad_ord-1': { id: 'rad_ord-1', orderId: 'ord-1' } },
  radiologyAddenda: { 'add-1': { id: 'add-1', orderId: 'ord-1' } },
  criticalAlerts: { 'rad_ord-1': { id: 'rad_ord-1', orderId: 'ord-1' } },
  radiologyAnnotations: { 'm1_doc-1': { id: 'm1_doc-1', orderId: 'ord-1', mediaId: 'm1' } },
  bills: { 'bill-1': { id: 'bill-1', orderId: 'ord-1', paid: 0, total: 15000, number: 'INV-1' }, 'bill-9': { id: 'bill-9', orderId: 'other', paid: 0 } },
};
const staff = { uid: 'adm', staffId: 'A1', name: 'Admin', role: 'admin' };
const Timestamp = { now: () => 'NOW' };
function fakeBucket() { const deleted = []; return { deleted, file: (p) => ({ async delete() { deleted.push(p); } }) }; }

test('deleteImagingStudy(all) empties every collection for the order, deletes the object, writes one audit entry', async () => {
  const db = fakeDb(seed); const bucket = fakeBucket();
  const out = await deleteImagingStudy({ db, bucket, Timestamp, staff }, { orderId: 'ord-1', scope: 'all' });
  assert.deepEqual(out.removed, { order: true, media: 2, objects: 1, reports: 1, addenda: 1, alerts: 1, annotations: 1, bills: 1 });
  assert.deepEqual(bucket.deleted, ['radiology/ord-1/m1.dcm']);
  assert.equal(db.data.orders['ord-1'], undefined); assert.deepEqual(db.data.radiologyMedia, {}); assert.deepEqual(db.data.radiologyReports, {});
  assert.deepEqual(Object.keys(db.data.bills), ['bill-9'], 'another order\'s bill is untouched');
  const audit = Object.values(db.data.auditLog); assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'admin.imaging.delete'); assert.equal(audit[0].actorUid, 'adm'); assert.equal(audit[0].patientId, '1001');
  assert.equal(out.summary, 'order, 2 images, report, 1 addendum, critical alert, 1 annotation set, 1 bill removed');
});

test('deleteImagingStudy(report) keeps images and bill, reopens the order', async () => {
  const db = fakeDb(seed); const bucket = fakeBucket();
  const out = await deleteImagingStudy({ db, bucket, Timestamp, staff }, { orderId: 'ord-1', scope: 'report' });
  assert.deepEqual(out.removed, { order: false, media: 0, objects: 0, reports: 1, addenda: 1, alerts: 1, annotations: 0, bills: 0 });
  assert.equal(Object.keys(db.data.radiologyMedia).length, 2); assert.ok(db.data.bills['bill-1']);
  assert.equal(db.data.orders['ord-1'].radiologyState, 'acquired'); assert.equal(db.data.orders['ord-1'].status, 'in-progress'); assert.equal(db.data.orders['ord-1'].reportId, null);
  assert.deepEqual(bucket.deleted, []);
});

test('deleteImagingStudy refuses unknown orders, non-imaging orders, bad ids and paid bills', async () => {
  const db = fakeDb({ ...seed, orders: { 'ord-1': { ...order }, 'lab-1': { id: 'lab-1', dept: 'lab', type: 'lab' } }, bills: { 'bill-1': { id: 'bill-1', orderId: 'ord-1', paid: 100, total: 200, number: 'INV-1' } } });
  const bucket = fakeBucket();
  await assert.rejects(deleteImagingStudy({ db, bucket, Timestamp, staff }, { orderId: 'nope' }), (e) => e.code === 'not-found');
  await assert.rejects(deleteImagingStudy({ db, bucket, Timestamp, staff }, { orderId: 'lab-1' }), (e) => e.code === 'failed-precondition');
  await assert.rejects(deleteImagingStudy({ db, bucket, Timestamp, staff }, { orderId: '../x' }), (e) => e.code === 'invalid-argument');
  await assert.rejects(deleteImagingStudy({ db, bucket, Timestamp, staff }, { orderId: 'ord-1', scope: 'bill' }), /INV-1 already has 100 paid/);
  assert.ok(db.data.bills['bill-1'], 'nothing was deleted');
  const forced = await deleteImagingStudy({ db, bucket, Timestamp, staff }, { orderId: 'ord-1', scope: 'bill', force: true });
  assert.equal(forced.removed.bills, 1); assert.equal(db.data.bills['bill-1'], undefined);
});

test('scope "images" + mediaId removes one image and only its drawings; state changes only when none is left', () => {
  const annos = [{ id: 'm1_doc-1', mediaId: 'm1' }, { id: 'm2_doc-1', mediaId: 'm2' }];
  const plan = planDeletion({ order: { ...order, radiologyState: 'acquired' }, media, annotations: annos, scope: 'images', mediaId: 'm1' });
  assert.deepEqual(plan.media, ['m1']); assert.deepEqual(plan.objects, ['radiology/ord-1/m1.dcm']); assert.deepEqual(plan.annotations, ['m1_doc-1']);
  assert.equal(plan.orderPatch, null, 'm2 is still there → still acquired');
  const last = planDeletion({ order: { ...order, radiologyState: 'acquired' }, media: [media[0]], annotations: annos, scope: 'images', mediaId: 'm1' });
  assert.deepEqual(last.orderPatch, { radiologyState: 'in-progress' });
  assert.throws(() => planDeletion({ order, media, scope: 'images', mediaId: 'ghost' }), (e) => e.code === 'not-found');
});

test('deleteImagingStudy(images, mediaId) through the fake backend', async () => {
  const db = fakeDb({ ...seed, radiologyAnnotations: { 'm1_doc-1': { id: 'm1_doc-1', orderId: 'ord-1', mediaId: 'm1' }, 'm2_doc-1': { id: 'm2_doc-1', orderId: 'ord-1', mediaId: 'm2' } } });
  const bucket = fakeBucket();
  const out = await deleteImagingStudy({ db, bucket, Timestamp, staff }, { orderId: 'ord-1', scope: 'images', mediaId: 'm2' });
  assert.deepEqual(out.removed, { order: false, media: 1, objects: 0, reports: 0, addenda: 0, alerts: 0, annotations: 1, bills: 0 });
  assert.deepEqual(Object.keys(db.data.radiologyMedia), ['m1']); assert.deepEqual(Object.keys(db.data.radiologyAnnotations), ['m1_doc-1']);
  assert.ok(db.data.radiologyReports['rad_ord-1'], 'report untouched'); assert.ok(db.data.orders['ord-1'], 'order untouched');
});

test('scope "bill" works for a non-radiology (lab) order too — the admin Bills tab uses it', async () => {
  const db = fakeDb({ ...seed, orders: { ...seed.orders, 'lab-1': { id: 'lab-1', dept: 'lab', type: 'lab' } }, bills: { ...seed.bills, 'bill-lab': { id: 'bill-lab', number: 'INV-9', orderId: 'lab-1', patientId: 'p1', total: 5, paid: 0, status: 'pending' } } });
  const out = await deleteImagingStudy({ db, bucket: fakeBucket(), Timestamp, staff }, { orderId: 'lab-1', scope: 'bill' });
  assert.equal(out.removed.bills, 1); assert.ok(!db.data.bills['bill-lab']); assert.ok(db.data.orders['lab-1'], 'the lab order itself is untouched');
  await assert.rejects(deleteImagingStudy({ db, bucket: fakeBucket(), Timestamp, staff }, { orderId: 'lab-1', scope: 'all' }), (e) => e.code === 'failed-precondition');
});

