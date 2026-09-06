'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanupPatientArrays,
  deleteClinicalOrderCascade,
  deleteBillOnly,
  deleteLegacyPatientEntry,
} = require('../admin-clinical.cjs');

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fakeDb(seed) {
  const data = deepClone(seed || {});
  const log = [];

  function getDocData(col, id) {
    return data[col] && Object.prototype.hasOwnProperty.call(data[col], id) ? data[col][id] : undefined;
  }

  function ensureCol(col) {
    data[col] = data[col] || {};
    return data[col];
  }

  function docRef(col, id) {
    return {
      col,
      id,
      path: `${col}/${id}`,
      async get() {
        const row = getDocData(col, id);
        return {
          exists: row !== undefined,
          id,
          ref: this,
          data: () => row,
        };
      },
      collection(sub) {
        return collectionRef(`${col}/${id}/${sub}`);
      },
    };
  }

  function collectionRef(col) {
    return {
      path: col,
      doc(id) {
        const finalId = id || ('auto-' + Math.random().toString(36).slice(2, 8));
        return docRef(col, finalId);
      },
      where(field, op, value) {
        return {
          async get() {
            const rows = Object.entries(data[col] || {})
              .filter(([, row]) => String(row && row[field]) === String(value))
              .map(([rowId, row]) => ({ id: rowId, ref: docRef(col, rowId), data: () => row }));
            return { forEach(fn) { rows.forEach(fn); } };
          },
        };
      },
      async get() {
        const rows = Object.entries(data[col] || {}).map(([rowId, row]) => ({ id: rowId, ref: docRef(col, rowId), data: () => row }));
        return { forEach(fn) { rows.forEach(fn); } };
      },
    };
  }

  return {
    data,
    log,
    collection: collectionRef,
    batch() {
      const ops = [];
      return {
        delete(ref) { ops.push(['delete', ref.col, ref.id]); },
        update(ref, patch) { ops.push(['update', ref.col, ref.id, patch]); },
        set(ref, payload) { ops.push(['set', ref.col, ref.id, payload]); },
        async commit() {
          ops.forEach((op) => {
            log.push(op);
            if (op[0] === 'delete') {
              if (data[op[1]]) delete data[op[1]][op[2]];
              return;
            }
            if (op[0] === 'update') {
              ensureCol(op[1]);
              data[op[1]][op[2]] = data[op[1]][op[2]] || { id: op[2] };
              Object.assign(data[op[1]][op[2]], op[3]);
              return;
            }
            ensureCol(op[1]);
            data[op[1]][op[2]] = op[3];
          });
        },
      };
    },
  };
}

const Timestamp = { now: () => 'NOW' };
const staff = { uid: 'adm-1', staffId: 'ADM-1', name: 'Admin', role: 'admin' };
function fakeBucket() { return { file() { return { async delete() {} }; } }; }

test('cleanupPatientArrays removes only the targeted lab order, leaving same-test duplicates alone', () => {
  const patient = {
    labRequests: [
      { id: 'lab-1', orderId: 'lab-1', tests: ['CBC'], timestamp: '2026-09-06T08:00:00Z' },
      { tests: ['CBC'], timestamp: '2026-09-06T12:00:00Z' },
      { tests: ['LFT'], timestamp: '2026-09-06T09:00:00Z' },
    ],
    labResults: [
      { id: 'lab-1', orderId: 'lab-1', tests: [{ test: 'CBC', value: '12' }] },
      { tests: [{ test: 'CBC', value: '13' }], date: '2026-09-06T12:00:00Z' },
    ],
  };
  const out = cleanupPatientArrays(patient, {
    id: 'lab-1',
    type: 'lab',
    items: [{ name: 'CBC' }],
    orderedAt: '2026-09-06T08:00:00Z',
    completedAt: '2026-09-06T10:00:00Z',
  }, new Set());

  assert.equal(out.removed.labRequests, 1);
  assert.equal(out.removed.labResults, 1);
  assert.deepEqual(out.patch.labRequests, [
    { tests: ['CBC'], timestamp: '2026-09-06T12:00:00Z' },
    { tests: ['LFT'], timestamp: '2026-09-06T09:00:00Z' },
  ]);
  assert.deepEqual(out.patch.labResults, [
    { tests: [{ test: 'CBC', value: '13' }], date: '2026-09-06T12:00:00Z' },
  ]);
});

test('deleteClinicalOrderCascade hard-deletes a lab order together with bills, messages, alerts, files and patient arrays', async () => {
  const db = fakeDb({
    orders: {
      'lab-1': {
        id: 'lab-1',
        type: 'lab',
        dept: 'lab',
        patientId: '1001',
        patientName: 'Aline Mukamana',
        billId: 'bill-1',
        items: [{ name: 'CBC' }],
        orderedAt: '2026-09-06T08:00:00Z',
      },
      'lab-2': {
        id: 'lab-2',
        type: 'lab',
        dept: 'lab',
        patientId: '1001',
        patientName: 'Aline Mukamana',
        billId: 'bill-2',
        items: [{ name: 'LFT' }],
        orderedAt: '2026-09-06T09:00:00Z',
      },
    },
    patients: {
      '1001': {
        id: '1001',
        labRequests: [
          { id: 'lab-1', orderId: 'lab-1', tests: ['CBC'], timestamp: '2026-09-06T08:00:00Z' },
          { id: 'lab-2', orderId: 'lab-2', tests: ['LFT'], timestamp: '2026-09-06T09:00:00Z' },
        ],
        labResults: [
          { id: 'lab-1', orderId: 'lab-1', tests: [{ test: 'CBC', value: '12' }] },
          { id: 'lab-2', orderId: 'lab-2', tests: [{ test: 'LFT', value: 'ok' }] },
        ],
        clinicalNotes: [{ id: 'note-1', orderId: 'lab-1', note: 'Linked note' }],
      },
    },
    'patients/1001/files': {
      'file-1': { id: 'file-1', patientId: '1001', orderId: 'lab-1', billId: 'bill-1' },
      'file-2': { id: 'file-2', patientId: '1001', orderId: 'lab-2' },
    },
    bills: {
      'bill-1': { id: 'bill-1', number: 'INV-1', orderId: 'lab-1', patientId: '1001', total: 5000, paid: 0 },
      'bill-2': { id: 'bill-2', number: 'INV-2', orderId: 'lab-2', patientId: '1001', total: 3000, paid: 0 },
    },
    messages: {
      'msg-1': { id: 'msg-1', orderId: 'lab-1' },
      'msg-2': { id: 'msg-2', resultId: 'lab-1' },
      'msg-3': { id: 'msg-3', orderId: 'lab-2' },
    },
    notifications: {
      'ntf-1': { id: 'ntf-1', orderId: 'lab-1' },
      'ntf-2': { id: 'ntf-2', billId: 'bill-1' },
      'ntf-3': { id: 'ntf-3', orderId: 'lab-2' },
    },
    criticalAlerts: {
      'crt-1': { id: 'crt-1', orderId: 'lab-1' },
      'crt-2': { id: 'crt-2', orderId: 'lab-2' },
    },
    labCriticalAlerts: {
      'lcrt-1': { id: 'lcrt-1', resultId: 'lab-1' },
      'lcrt-2': { id: 'lcrt-2', resultId: 'lab-2' },
    },
  });

  const out = await deleteClinicalOrderCascade({ db, bucket: fakeBucket(), Timestamp, staff }, { orderId: 'lab-1' });
  assert.equal(out.removed.order, true);
  assert.equal(out.removed.bills, 1);
  assert.equal(out.removed.messages, 2);
  assert.equal(out.removed.notifications, 2);
  assert.equal(out.removed.criticalAlerts, 1);
  assert.equal(out.removed.labCriticalAlerts, 1);
  assert.equal(out.removed.patientFiles, 1);
  assert.equal(out.removed.patientEmbedded, 3);

  assert.equal(db.data.orders['lab-1'], undefined);
  assert.ok(db.data.orders['lab-2']);
  assert.equal(db.data.bills['bill-1'], undefined);
  assert.ok(db.data.bills['bill-2']);
  assert.equal(db.data.messages['msg-1'], undefined);
  assert.equal(db.data.messages['msg-2'], undefined);
  assert.ok(db.data.messages['msg-3']);
  assert.equal(db.data.notifications['ntf-1'], undefined);
  assert.equal(db.data.notifications['ntf-2'], undefined);
  assert.ok(db.data.notifications['ntf-3']);
  assert.equal(db.data.criticalAlerts['crt-1'], undefined);
  assert.ok(db.data.criticalAlerts['crt-2']);
  assert.equal(db.data.labCriticalAlerts['lcrt-1'], undefined);
  assert.ok(db.data.labCriticalAlerts['lcrt-2']);
  assert.equal(db.data['patients/1001/files']['file-1'], undefined);
  assert.ok(db.data['patients/1001/files']['file-2']);
  assert.deepEqual(db.data.patients['1001'].labRequests, [{ id: 'lab-2', orderId: 'lab-2', tests: ['LFT'], timestamp: '2026-09-06T09:00:00Z' }]);
  assert.deepEqual(db.data.patients['1001'].labResults, [{ id: 'lab-2', orderId: 'lab-2', tests: [{ test: 'LFT', value: 'ok' }] }]);
  assert.deepEqual(db.data.patients['1001'].clinicalNotes, []);
  assert.equal(Object.keys(db.data.auditLog).length, 1);
});

test('deleteClinicalOrderCascade refuses paid linked bills until forced, then delegates hard delete', async () => {
  const db = fakeDb({
    orders: {
      'lab-1': { id: 'lab-1', type: 'lab', dept: 'lab', patientId: '1001', billId: 'bill-1', items: [{ name: 'CBC' }] },
    },
    bills: {
      'bill-1': { id: 'bill-1', orderId: 'lab-1', patientId: '1001', number: 'INV-1', total: 5000, paid: 1000 },
    },
  });
  await assert.rejects(
    deleteClinicalOrderCascade({ db, bucket: fakeBucket(), Timestamp, staff }, { orderId: 'lab-1' }),
    /INV-1 already has 1000 paid/
  );
  const out = await deleteClinicalOrderCascade({ db, bucket: fakeBucket(), Timestamp, staff }, { orderId: 'lab-1', force: true });
  assert.equal(out.removed.bills, 1);
  assert.equal(db.data.orders['lab-1'], undefined);
  assert.equal(db.data.bills['bill-1'], undefined);
});

test('deleteBillOnly removes an orphan bill plus bill-linked files/messages', async () => {
  const db = fakeDb({
    bills: {
      'bill-1': { id: 'bill-1', patientId: '1001', number: 'INV-1', total: 900, paid: 0 },
    },
    messages: {
      'msg-1': { id: 'msg-1', billId: 'bill-1' },
    },
    notifications: {
      'ntf-1': { id: 'ntf-1', billId: 'bill-1' },
    },
    'patients/1001/files': {
      'file-1': { id: 'file-1', patientId: '1001', billId: 'bill-1' },
    },
  });
  const out = await deleteBillOnly({ db, bucket: fakeBucket(), Timestamp, staff }, { billId: 'bill-1' });
  assert.equal(out.removed.bills, 1);
  assert.equal(out.removed.messages, 1);
  assert.equal(out.removed.notifications, 1);
  assert.equal(out.removed.patientFiles, 1);
  assert.equal(db.data.bills['bill-1'], undefined);
  assert.equal(db.data.messages['msg-1'], undefined);
  assert.equal(db.data.notifications['ntf-1'], undefined);
  assert.equal(db.data['patients/1001/files']['file-1'], undefined);
});

test('deleteLegacyPatientEntry removes one patient-only legacy lab request from the common server patient record', async () => {
  const db = fakeDb({
    patients: {
      '1001': {
        id: '1001',
        labRequests: [
          { tests: ['CBC'], timestamp: '2026-09-06T08:00:00Z' },
          { tests: ['CBC'], timestamp: '2026-09-06T12:00:00Z' },
        ],
      },
    },
  });
  const out = await deleteLegacyPatientEntry({ db, bucket: fakeBucket(), Timestamp, staff }, {
    patientId: '1001',
    legacyKind: 'labRequest',
    legacyEntry: { tests: ['CBC'], timestamp: '2026-09-06T12:00:00Z' },
  });
  assert.equal(out.removed.patientEmbedded, 1);
  assert.deepEqual(db.data.patients['1001'].labRequests, [{ tests: ['CBC'], timestamp: '2026-09-06T08:00:00Z' }]);
  assert.equal(Object.keys(db.data.auditLog).length, 1);
});
