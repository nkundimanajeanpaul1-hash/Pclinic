'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePatientId,
  normalizeOrderId,
  normalizeSpecimenAction,
  normalizeOrderStatus,
  transitionDisposition,
  findLegacyRequest,
  legacyOrderIdForRequest,
  materializeLegacyOrder,
} = require('../lab-domain.cjs');

test('normalizes specimen identifiers and actions', () => {
  assert.equal(normalizePatientId(' MOD-1007 '), '1007');
  assert.equal(normalizeOrderId('ord-safe_123'), 'ord-safe_123');
  assert.equal(normalizeSpecimenAction('ACCESSION'), 'accession');
  assert.equal(normalizeOrderStatus('In Progress'), 'in-progress');
  assert.throws(() => normalizeOrderId('orders/not-safe'), /valid Firestore order ID/);
  assert.throws(() => normalizeSpecimenAction('complete'), /Unknown specimen action/);
});

test('allows active specimen transitions and makes retries idempotent', () => {
  assert.equal(transitionDisposition('pending', 'accession', false), 'apply');
  assert.equal(transitionDisposition('in-progress', 'accession', false), 'apply');
  assert.equal(transitionDisposition('in-progress', 'accession', true), 'already-applied');
  assert.equal(transitionDisposition('cancelled', 'reject', false), 'already-applied');
  assert.throws(() => transitionDisposition('completed', 'accession', false), /cannot be accessioned/);
});

test('verifies and materializes a real legacy patient request', () => {
  const request = {
    id: 172345,
    tests: ['CBC', 'Creatinine'],
    priority: 'Urgent',
    status: 'Pending',
    requestedBy: 'Dr Example',
    requestedById: '41054',
    timestamp: '2026-08-17T08:00:00.000Z',
  };
  const patient = { id: 1007, firstName: 'Aline', lastName: 'Test', labRequests: [request] };
  const legacy = {
    legacyRequestId: '172345',
    orderedAt: request.timestamp,
    items: [{ name: 'CBC' }, { name: 'Creatinine' }],
  };
  assert.equal(findLegacyRequest(patient, legacy), request);
  assert.equal(legacyOrderIdForRequest('1007', request, 0), 'LAB-LEGACY-1007-172345');
  const order = materializeLegacyOrder('LAB-LEGACY-1007-172345', '1007', patient, request);
  assert.equal(order.patientId, '1007');
  assert.equal(order.patientName, 'Aline Test');
  assert.equal(order.status, 'pending');
  assert.equal(order.priority, 'urgent');
  assert.deepEqual(order.items.map((item) => item.name), ['CBC', 'Creatinine']);
  assert.equal(order.legacyMigrated, true);
});

test('does not match an unverified legacy request', () => {
  const patient = {
    labRequests: [{ id: 'one', tests: ['CBC'], timestamp: '2026-08-17T08:00:00.000Z' }],
  };
  assert.equal(findLegacyRequest(patient, {
    legacyRequestId: 'different',
    orderedAt: '2026-08-17T09:00:00.000Z',
    items: [{ name: 'HIV' }],
  }), null);
});
