import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rules = await readFile(resolve(here, '..', 'firestore.rules'), 'utf8');
let env;

const profiles = {
  admin: { uid: 'admin-uid', staffId: '10001', name: 'Test Admin', role: 'admin', active: true },
  doctor: { uid: 'doctor-uid', staffId: '20001', name: 'Test Doctor', role: 'doctor', active: true },
  nurse: { uid: 'nurse-uid', staffId: '30001', name: 'Test Nurse', role: 'nurse', active: true },
  reception: { uid: 'reception-uid', staffId: '40001', name: 'Test Reception', role: 'reception', active: true },
  radio: { uid: 'radio-uid', staffId: '45001', name: 'Test Radiologist', role: 'radio', active: true },
  lab: { uid: 'lab-uid', staffId: '47001', name: 'Test Laboratory Technologist', role: 'lab', active: true },
  cashier: { uid: 'cashier-uid', staffId: '50001', name: 'Test Cashier', role: 'cashier', active: true },
  finance: { uid: 'finance-uid', staffId: '51001', name: 'Test Finance', role: 'finance', active: true },
  theater: { uid: 'theater-uid', staffId: '52001', name: 'Test Theater', role: 'theater', active: true },
  beds: { uid: 'beds-uid', staffId: '53001', name: 'Test Beds', role: 'beds', active: true },
  hr: { uid: 'hr-uid', staffId: '60001', name: 'Test HR', role: 'hr', active: true },
  inactive: { uid: 'inactive-uid', staffId: '70001', name: 'Inactive User', role: 'doctor', active: false },
};

function dbFor(key) {
  const p = profiles[key];
  return env.authenticatedContext(p.uid).firestore();
}

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const p of Object.values(profiles)) {
      await setDoc(doc(db, 'users', p.uid), {
        staffId: p.staffId,
        name: p.name,
        role: p.role,
        active: p.active,
        createdAt: 'test',
        createdBy: 'test',
      });
    }
    await setDoc(doc(db, 'patients', '1001'), {
      id: 1001,
      mrn: '1001',
      firstName: 'Demo',
      lastName: 'Patient',
      createdAt: 'test',
      createdById: profiles.reception.staffId,
      updatedAt: 'test',
      photo: null,
    });
    await setDoc(doc(db, 'billingPatientDirectory', '1001'), {
      id: '1001', mrn: '1001', name: 'Demo Patient', firstName: 'Demo', lastName: 'Patient',
      insuranceProvider: 'RSSB', patientPayPercent: 15, active: true, updatedAt: 'test'
    });
    await setDoc(doc(db, 'beds', 'ICU-1'), { id: 'ICU-1', ward: 'ICU', bedNumber: 'ICU-1', status: 'available' });
    await setDoc(doc(db, 'notifications', 'ntf-doctor'), {
      id: 'ntf-doctor', title: 'Appointment', message: 'Test', type: 'appointment',
      toRoles: ['doctor'], toStaffId: '', createdById: profiles.reception.staffId, read: false, createdAt: 'test'
    });
    await setDoc(doc(db, 'bills', 'bill-1'), {
      id: 'bill-1', patientId: 1001, createdById: profiles.doctor.staffId,
      createdAt: 'test', status: 'pending', total: 100, paid: 0, balance: 100,
    });
    await setDoc(doc(db, 'orders', 'img-order-1'), {
      id: 'img-order-1', patientId: 1001, patientName: 'Demo Patient',
      type: 'imaging', dept: 'radiology', status: 'pending', radiologyState: 'pending',
      orderedById: profiles.doctor.staffId, orderedAt: 'test',
    });
    await setDoc(doc(db, 'orders', 'lab-order-1'), {
      id: 'lab-order-1', patientId: 1001, patientName: 'Demo Patient',
      type: 'lab', dept: 'lab', status: 'pending',
      orderedById: profiles.doctor.staffId, orderedAt: 'test',
    });
    await setDoc(doc(db, 'labResults', 'lab-order-1'), {
      id: 'lab-order-1', orderId: 'lab-order-1', patientId: '1001',
      results: [{ test: 'CBC', value: 'Normal' }], status: 'final',
    });
    await setDoc(doc(db, 'labCriticalAlerts', 'lab-order-1'), {
      id: 'lab-order-1', orderId: 'lab-order-1', patientId: '1001', acknowledged: false,
    });
    await setDoc(doc(db, 'radiologyReports', 'rad-report-1'), {
      id: 'rad-report-1', orderId: 'img-order-1', patientId: '1001',
      study: 'Chest X-Ray', findings: 'Demo findings', impression: 'Demo impression', status: 'final',
    });
    await setDoc(doc(db, 'radiologyAddenda', 'rad-addendum-1'), {
      id: 'rad-addendum-1', reportId: 'rad-report-1', patientId: '1001', text: 'Demo addendum', status: 'final',
    });
    await setDoc(doc(db, 'criticalAlerts', 'rad-report-1'), {
      id: 'rad-report-1', reportId: 'rad-report-1', patientId: '1001', acknowledged: false,
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pclinic',
    firestore: { rules },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

describe('default deny and patient access', () => {
  test('signed-out, no-profile, inactive, HR and cashier cannot read patients', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'patients', '1001')));
    await assertFails(getDoc(doc(env.authenticatedContext('orphan').firestore(), 'patients', '1001')));
    await assertFails(getDoc(doc(dbFor('inactive'), 'patients', '1001')));
    await assertFails(getDoc(doc(dbFor('hr'), 'patients', '1001')));
    await assertFails(getDoc(doc(dbFor('cashier'), 'patients', '1001')));
  });

  test('doctor can read and list patients', async () => {
    await assertSucceeds(getDoc(doc(dbFor('doctor'), 'patients', '1001')));
    await assertSucceeds(getDocs(collection(dbFor('doctor'), 'patients')));
  });

  test('reception creates a patient but nurse cannot', async () => {
    const data = { id: 1002, mrn: '1002', firstName: 'Demo', lastName: 'Two', createdAt: 'test', createdById: profiles.reception.staffId, photo: null };
    await assertSucceeds(setDoc(doc(dbFor('reception'), 'patients', '1002'), data));
    await assertFails(setDoc(doc(dbFor('nurse'), 'patients', '1003'), { ...data, id: 1003, mrn: '1003' }));
  });

  test('media fields are rejected', async () => {
    await assertFails(updateDoc(doc(dbFor('doctor'), 'patients', '1001'), { photo: 'data:image/png;base64,abc' }));
    await assertFails(setDoc(doc(dbFor('reception'), 'patients', '1002'), {
      id: 1002, mrn: '1002', createdAt: 'test', createdById: profiles.reception.staffId, photo: 'data:image/png;base64,abc'
    }));
  });

  test('patient identity is immutable', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('doctor'), 'patients', '1001'), { clinicalNotes: [] }));
    await assertFails(updateDoc(doc(dbFor('doctor'), 'patients', '1001'), { mrn: '9999' }));
    await assertFails(updateDoc(doc(dbFor('hr'), 'patients', '1001'), { firstName: 'Changed' }));
  });

  test('only admin deletes a patient', async () => {
    await assertFails(deleteDoc(doc(dbFor('reception'), 'patients', '1001')));
    await assertSucceeds(deleteDoc(doc(dbFor('admin'), 'patients', '1001')));
  });

  test('unknown patient subcollections and unknown top-level collections are denied', async () => {
    await assertFails(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'futureClinicalData', 'x'), { patientId: 1001 }));
    await assertFails(setDoc(doc(dbFor('admin'), 'unknown', 'x'), { value: true }));
  });
});

describe('staff profile safety', () => {
  test('admin cannot create a profile with plaintext password or invalid role', async () => {
    const base = { staffId: '80001', name: 'New User', role: 'nurse', active: true, createdAt: 'test', createdBy: '10001' };
    await assertFails(setDoc(doc(dbFor('admin'), 'users', 'new-user-1'), { ...base, initialPassword: 'plaintext' }));
    await assertFails(setDoc(doc(dbFor('admin'), 'users', 'new-user-2'), { ...base, role: 'superuser' }));
    await assertSucceeds(setDoc(doc(dbFor('admin'), 'users', 'new-user-3'), base));
  });

  test('admin can deactivate another user but cannot deactivate self', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('admin'), 'users', profiles.doctor.uid), { active: false }));
    await assertFails(updateDoc(doc(dbFor('admin'), 'users', profiles.admin.uid), { active: false }));
  });

  test('profiles are never deleted', async () => {
    await assertFails(deleteDoc(doc(dbFor('admin'), 'users', profiles.doctor.uid)));
  });

  test('clinical roles can read staff profiles (for staffId selection); non-clinical roles cannot list', async () => {
    // Self-read always works; clinical roles may read any active profile...
    await assertSucceeds(getDoc(doc(dbFor('doctor'), 'users', profiles.doctor.uid)));
    await assertSucceeds(getDoc(doc(dbFor('reception'), 'users', profiles.doctor.uid)));
    await assertSucceeds(getDoc(doc(dbFor('nurse'), 'users', profiles.beds.uid)));
    // ...and list them for booking/assignment by immutable staffId.
    await assertSucceeds(getDocs(query(collection(dbFor('reception'), 'users'))));
    await assertSucceeds(getDocs(query(collection(dbFor('doctor'), 'users'))));
    // Non-clinical (billing) roles stay out of the staff directory.
    await assertFails(getDocs(query(collection(dbFor('cashier'), 'users'))));
    await assertFails(getDocs(query(collection(dbFor('finance'), 'users'))));
    // Inactive staff cannot read the directory.
    await assertFails(getDocs(query(collection(dbFor('inactive'), 'users'))));
  });
});

describe('laboratory workflow security', () => {
  test('doctor creates a lab order exactly as pclinic-orders.js createOrder() does', async () => {
    // Exact payload shape emitted by createOrder()/sync() in pclinic-orders.js
    // (lab-request.html → pcOrders.createAsync) for a lab order with billing.
    const clientPayload = {
      id: 'ord-labclient-1',
      patientId: '1001',
      patientName: 'Demo Patient',
      type: 'lab',
      dept: 'lab',
      items: [{ code: 'LAB-CBC', name: 'CBC', qty: 1, price: 5000 }],
      priority: 'routine',
      notes: 'Sample: Blood · Requested by: Test Doctor',
      status: 'pending',
      total: 5000,
      billed: true,
      billId: 'bill-labclient-1',
      orderedBy: 'Test Doctor',
      orderedById: profiles.doctor.staffId,
      orderedAt: '2026-08-21T12:00:00.000Z',
      history: [{ at: '2026-08-21T12:00:00.000Z', by: 'Test Doctor', byId: profiles.doctor.staffId, action: 'created' }],
    };
    await assertSucceeds(setDoc(doc(dbFor('doctor'), 'orders', clientPayload.id), clientPayload));

    // A nurse can also create; reception can too.
    await assertSucceeds(setDoc(doc(dbFor('nurse'), 'orders', 'ord-nurse-1'), {
      ...clientPayload, id: 'ord-nurse-1', orderedById: profiles.nurse.staffId,
      orderedBy: 'Test Nurse', history: [],
    }));

    // Failures the live clinic saw: any of these single differences denies the create.
    await assertFails(setDoc(doc(dbFor('doctor'), 'orders', 'ord-mismatch-id'), { ...clientPayload, id: 'ord-other-id' }));
    await assertFails(setDoc(doc(dbFor('doctor'), 'orders', 'ord-mismatch-staff'), { ...clientPayload, orderedById: profiles.nurse.staffId }));
    await assertFails(setDoc(doc(dbFor('doctor'), 'orders', 'ord-wrong-status'), { ...clientPayload, status: 'in-progress' }));
  });

  test('laboratory may transition an existing lab order but cannot manufacture a legacy order in the browser', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('lab'), 'orders', 'lab-order-1'), {
      status: 'in-progress', accessionNo: 'LAB-1001-TEST', accessionedById: profiles.lab.staffId,
    }));
    await assertFails(setDoc(doc(dbFor('lab'), 'orders', 'LAB-LEGACY-1001-test'), {
      id: 'LAB-LEGACY-1001-test', patientId: 1001, patientName: 'Demo Patient',
      type: 'lab', dept: 'lab', status: 'in-progress',
      orderedById: profiles.doctor.staffId, orderedAt: 'test',
    }));
    await assertFails(updateDoc(doc(dbFor('cashier'), 'orders', 'lab-order-1'), { status: 'in-progress' }));
  });

  test('clinical laboratory roles can read final reports but non-clinical roles cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor('lab'), 'labResults', 'lab-order-1')));
    await assertSucceeds(getDoc(doc(dbFor('doctor'), 'labResults', 'lab-order-1')));
    await assertSucceeds(getDoc(doc(dbFor('nurse'), 'labCriticalAlerts', 'lab-order-1')));
    await assertFails(getDoc(doc(dbFor('reception'), 'labResults', 'lab-order-1')));
    await assertFails(getDoc(doc(dbFor('cashier'), 'labCriticalAlerts', 'lab-order-1')));
  });

  test('browser clients cannot create or overwrite final laboratory reports or alerts', async () => {
    await assertFails(setDoc(doc(dbFor('lab'), 'labResults', 'client-result'), {
      id: 'client-result', orderId: 'lab-order-1', patientId: '1001', status: 'final'
    }));
    await assertFails(updateDoc(doc(dbFor('lab'), 'labResults', 'lab-order-1'), {
      results: [{ test: 'CBC', value: 'Changed' }]
    }));
    await assertFails(setDoc(doc(dbFor('doctor'), 'labCriticalAlerts', 'client-alert'), {
      id: 'client-alert', patientId: '1001'
    }));
  });
});

describe('radiology workflow security', () => {
  test('radiology can read imaging orders but cannot transition them directly', async () => {
    await assertSucceeds(getDoc(doc(dbFor('radio'), 'orders', 'img-order-1')));
    await assertFails(getDoc(doc(dbFor('radio'), 'orders', 'lab-order-1')));
    await assertSucceeds(getDocs(query(collection(dbFor('radio'), 'orders'), where('dept', '==', 'radiology'))));
    await assertFails(updateDoc(doc(dbFor('radio'), 'orders', 'img-order-1'), {
      status: 'in-progress', radiologyState: 'in-progress'
    }));
  });

  test('radiology reports are readable only by clinical reporting roles', async () => {
    await assertSucceeds(getDoc(doc(dbFor('radio'), 'radiologyReports', 'rad-report-1')));
    await assertSucceeds(getDocs(collection(dbFor('radio'), 'radiologyReports')));
    await assertSucceeds(getDoc(doc(dbFor('doctor'), 'radiologyReports', 'rad-report-1')));
    await assertSucceeds(getDoc(doc(dbFor('nurse'), 'radiologyAddenda', 'rad-addendum-1')));
    await assertFails(getDoc(doc(dbFor('reception'), 'radiologyReports', 'rad-report-1')));
    await assertFails(getDoc(doc(dbFor('cashier'), 'criticalAlerts', 'rad-report-1')));
  });

  test('browser clients cannot create or alter reports, addenda or alerts', async () => {
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyReports', 'client-report'), {
      id: 'client-report', patientId: '1001', status: 'final'
    }));
    await assertFails(updateDoc(doc(dbFor('radio'), 'radiologyReports', 'rad-report-1'), {
      impression: 'Changed in browser'
    }));
    await assertFails(setDoc(doc(dbFor('doctor'), 'criticalAlerts', 'client-alert'), {
      id: 'client-alert', patientId: '1001'
    }));
  });
});

describe('reception cross-role integrations', () => {
  test('cashier and finance read only the restricted billing directory', async () => {
    await assertSucceeds(getDoc(doc(dbFor('cashier'), 'billingPatientDirectory', '1001')));
    await assertSucceeds(getDoc(doc(dbFor('finance'), 'billingPatientDirectory', '1001')));
    await assertFails(getDoc(doc(dbFor('cashier'), 'patients', '1001')));
    await assertSucceeds(setDoc(doc(dbFor('reception'), 'billingPatientDirectory', '1002'), {
      id:'1002', mrn:'1002', name:'Safe Name', firstName:'Safe', lastName:'Name', insuranceProvider:'', patientPayPercent:100, active:true, updatedAt:'test'
    }));
    await assertFails(setDoc(doc(dbFor('reception'), 'billingPatientDirectory', '1003'), {
      id:'1003', mrn:'1003', name:'Unsafe', firstName:'', lastName:'', insuranceProvider:'', patientPayPercent:100, active:true, updatedAt:'test', nationalId:'secret'
    }));
  });

  test('bed registry: operational roles read; Reception/Nurse assign/release; Beds full control', async () => {
    for (const role of ['reception','nurse','beds','theater']) await assertSucceeds(getDoc(doc(dbFor(role), 'beds', 'ICU-1')));
    // Reception may assign (occupied) and release (available) a bed...
    await assertSucceeds(updateDoc(doc(dbFor('reception'), 'beds', 'ICU-1'), { status:'occupied', patientId:'1001' }));
    await assertSucceeds(updateDoc(doc(dbFor('reception'), 'beds', 'ICU-1'), { status:'available', patientId:'' }));
    // ...but may not change bed identity or set maintenance states.
    await assertFails(updateDoc(doc(dbFor('reception'), 'beds', 'ICU-1'), { status:'maintenance' }));
    await assertFails(updateDoc(doc(dbFor('reception'), 'beds', 'ICU-1'), { ward:'Other' }));
    await assertFails(updateDoc(doc(dbFor('reception'), 'beds', 'ICU-1'), { bedNumber:'X' }));
    // Theater may read but not write.
    await assertFails(updateDoc(doc(dbFor('theater'), 'beds', 'ICU-1'), { status:'occupied' }));
    // Beds keeps full lifecycle control.
    await assertSucceeds(updateDoc(doc(dbFor('beds'), 'beds', 'ICU-1'), { status:'maintenance' }));
    await assertSucceeds(updateDoc(doc(dbFor('beds'), 'beds', 'ICU-1'), { status:'available' }));
  });

  test('server notifications are role-addressed', async () => {
    await assertSucceeds(getDoc(doc(dbFor('doctor'), 'notifications', 'ntf-doctor')));
    await assertFails(getDoc(doc(dbFor('cashier'), 'notifications', 'ntf-doctor')));
    await assertSucceeds(setDoc(doc(dbFor('reception'), 'notifications', 'ntf-cashier'), {
      id:'ntf-cashier', title:'Billing request', message:'MRN 1001', type:'billing_request',
      toRoles:['cashier'], toStaffId:'', createdById:profiles.reception.staffId, read:false, createdAt:'test'
    }));
    await assertSucceeds(getDoc(doc(dbFor('cashier'), 'notifications', 'ntf-cashier')));
    await assertFails(getDoc(doc(dbFor('nurse'), 'notifications', 'ntf-cashier')));
  });
});

describe('patient counter, billing and files', () => {
  test('reception increments counter exactly by one; other roles cannot', async () => {
    await assertSucceeds(setDoc(doc(dbFor('reception'), 'config', 'patientCounter'), { lastId: 1001, updatedAt: 'test' }));
    await assertSucceeds(updateDoc(doc(dbFor('reception'), 'config', 'patientCounter'), { lastId: 1002, updatedAt: 'test2' }));
    await assertFails(updateDoc(doc(dbFor('reception'), 'config', 'patientCounter'), { lastId: 1004, updatedAt: 'bad' }));
    await assertFails(updateDoc(doc(dbFor('doctor'), 'config', 'patientCounter'), { lastId: 1003, updatedAt: 'bad' }));
  });

  test('cashier reads/creates bills but cannot read full patients', async () => {
    await assertSucceeds(getDoc(doc(dbFor('cashier'), 'bills', 'bill-1')));
    await assertSucceeds(setDoc(doc(dbFor('cashier'), 'bills', 'bill-cashier-1'), {
      id:'bill-cashier-1', patientId:'1001', createdById:profiles.cashier.staffId,
      createdAt:'test', status:'pending', total:15, paid:0, balance:15
    }));
    await assertFails(getDoc(doc(dbFor('cashier'), 'patients', '1001')));
  });

  test('patient files reject embedded data URLs', async () => {
    await assertSucceeds(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'f1'), { id: 'f1', patientId: 1001, type: 'note', attachments: [] }));
    await assertFails(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'f2'), { id: 'f2', patientId: 1001, type: 'photo', data: 'data:image/png;base64,abc' }));
    await assertFails(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'f3'), { id: 'f3', patientId: 1001, type: 'note', attachments: [{ data: 'data:text/plain;base64,abc' }] }));
  });

  // pclinic-file.js saveFile() writes patients/{id}/files and, after the 2026-08-27
  // change, listFiles() also reads it back. These cases pin the cross-device read
  // that the download path depends on: a record written by one staff member must be
  // readable by another, and the billing-only roles must stay out.
  test('a patient file written by one clinician is readable on another device', async () => {
    await assertSucceeds(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'img-1'), {
      id: 'img-1', patientId: 1001, type: 'imaging', title: 'Imaging Request',
      modality: 'xr', exams: ['Chest X-ray'], priority: 'urgent',
      at: '2026-08-27T08:00:00.000Z', by: 'Test Doctor', byId: profiles.doctor.staffId,
      orderId: 'ord-1', billId: 'bill-1', attachments: []
    }));

    // A *different* user reading the same subcollection is what the second
    // computer does. getDocs on the collection is the exact query the client runs.
    for (const role of ['reception', 'nurse', 'radio', 'lab', 'admin']) {
      await assertSucceeds(getDoc(doc(dbFor(role), 'patients', '1001', 'files', 'img-1')),
        `${role} cannot open a file another clinician saved`);
      const snap = await getDocs(collection(dbFor(role), 'patients', '1001', 'files'));
      assert.equal(snap.docs.map((d) => d.id).includes('img-1'), true,
        `${role} cannot list the patient's files`);
    }

    // Roles denied the monolithic patient record stay denied here.
    for (const role of ['cashier', 'finance', 'hr']) {
      await assertFails(getDoc(doc(dbFor(role), 'patients', '1001', 'files', 'img-1')));
      await assertFails(getDocs(collection(dbFor(role), 'patients', '1001', 'files')));
    }
    await assertFails(getDocs(collection(dbFor('inactive'), 'patients', '1001', 'files')));
  });

  test("a reader cannot forge or erase another clinician's file record", async () => {
    await assertSucceeds(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'img-2'), {
      id: 'img-2', patientId: 1001, type: 'imaging', at: '2026-08-27T08:00:00.000Z',
      byId: profiles.doctor.staffId, attachments: []
    }));
    // The nurse can read it but may not silently rewrite or delete the request.
    await assertSucceeds(getDoc(doc(dbFor('nurse'), 'patients', '1001', 'files', 'img-2')));
    await assertSucceeds(setDoc(doc(dbFor('nurse'), 'patients', '1001', 'files', 'img-3'), {
      id: 'img-3', patientId: 1001, type: 'imaging', at: '2026-08-27T09:00:00.000Z',
      byId: profiles.nurse.staffId, attachments: []
    }));
    await assertFails(updateDoc(doc(dbFor('nurse'), 'patients', '1001', 'files', 'img-2'),
      { patientId: 1002 }));
    // Deleting a filed clinical document is admin-only, same as the patient itself.
    await assertFails(deleteDoc(doc(dbFor('nurse'), 'patients', '1001', 'files', 'img-2')));
    await assertFails(deleteDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'img-2')));
    // A file must never be filed against the wrong chart.
    await assertFails(setDoc(doc(dbFor('nurse'), 'patients', '1001', 'files', 'img-4'), {
      id: 'img-4', patientId: 9999, type: 'imaging', at: '2026-08-27T09:00:00.000Z',
      byId: profiles.nurse.staffId, attachments: []
    }));
  });
});

describe('radiology study media', () => {
  const ORDER = 'rad-order-media';
  const PATH = `radiology/${ORDER}/rmed-1.jpg`;

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'orders', ORDER), {
        id: ORDER, dept: 'radiology', type: 'imaging', patientId: '1001',
        patientName: 'Aline Test', status: 'pending', orderedById: profiles.doctor.staffId,
        orderedAt: 'test'
      });
    });
  });

  function record(overrides = {}) {
    const base = {
      id: 'rmed-1', orderId: ORDER, patientId: '1001', fileName: 'chest.jpg', ext: 'jpg',
      mime: 'image/jpeg', kind: 'image', bytes: 240000,
      sha256: '', at: 'test', byUid: profiles.radio.uid, byId: profiles.radio.staffId,
      byName: profiles.radio.name, byRole: 'radio',
      ...overrides
    };
    // storagePath follows the id unless a case overrides it explicitly, so a test
    // that only changes the id does not trip the path clause for the wrong reason.
    if (!Object.prototype.hasOwnProperty.call(overrides, 'storagePath')) {
      base.storagePath = 'radiology/' + base.orderId + '/' + base.id + '.' + base.ext;
    }
    return base;
  }

  test('a radiologist files a study file and everyone clinical can read the record', async () => {
    await assertSucceeds(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), record()));
    for (const role of ['doctor', 'nurse', 'lab', 'reception', 'admin']) {
      await assertSucceeds(getDoc(doc(dbFor(role), 'radiologyMedia', 'rmed-1')),
        `${role} must be able to see that a study has media`);
    }
    // Only metadata is in Firestore: pixels are never reachable through rules.
    const snap = await getDoc(doc(dbFor('doctor'), 'radiologyMedia', 'rmed-1'));
    assert.equal(snap.data().storagePath, PATH);
    assert.equal(snap.data().data, undefined);
  });

  test('billing-only and non-active staff cannot see media records at all', async () => {
    await assertSucceeds(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), record()));
    for (const role of ['cashier', 'finance', 'hr']) {
      await assertFails(getDoc(doc(dbFor(role), 'radiologyMedia', 'rmed-1')));
    }
    await assertFails(getDoc(doc(dbFor('inactive'), 'radiologyMedia', 'rmed-1')));
  });

  test('only radiology and admin may file media, and never as someone else', async () => {
    await assertFails(setDoc(doc(dbFor('doctor'), 'radiologyMedia', 'rmed-doc'), record({ id: 'rmed-doc' })));
    await assertFails(setDoc(doc(dbFor('nurse'), 'radiologyMedia', 'rmed-nur'), record({ id: 'rmed-nur' })));
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-spoof'),
      record({ id: 'rmed-spoof', ext: 'jpg', byUid: profiles.doctor.uid })));
    await assertSucceeds(setDoc(doc(dbFor('admin'), 'radiologyMedia', 'rmed-adm'),
      record({ id: 'rmed-adm', byUid: profiles.admin.uid })));
  });

  test('a record cannot point at another study object or another patient', async () => {
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'),
      record({ storagePath: `radiology/${ORDER}/someone-else.jpg` })));   // id no longer matches the name
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'),
      record({ storagePath: `radiology/other-order/rmed-1.jpg` })));        // escapes the order folder
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'),
      record({ storagePath: 'radiology/other-order/rmed-1.jpg' })));
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'),
      record({ storagePath: '../../etc/passwd' })));
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'),
      record({ patientId: '9999' })));
    // An order that does not exist must not gain media.
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'),
      record({ orderId: 'rad-order-nope', storagePath: 'radiology/rad-order-nope/rmed-1.jpg' })));
  });

  test('inline bytes, disallowed formats and oversized files are refused', async () => {
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), record({ data: 'AAAA' })));
    // A .dcm *name* is only metadata: bytes never reach the bucket through
    // Firestore, and storage.rules rejects the object itself. What the rules
    // must refuse is an unlisted mime, which is what actually gates display.
    await assertSucceeds(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-dcm'),
      record({ id: 'rmed-dcm', mime: 'image/jpeg', fileName: 'study.dcm', ext: 'jpg' })));
    // The declared extension must match the object name, or the record would
    // describe a file that cannot be located for signing.
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-lie'),
      record({ id: 'rmed-lie', ext: 'png', storagePath: `radiology/${ORDER}/rmed-lie.jpg` })));
    // DICOM is an accepted study format since the workstation update; an unlisted
    // raster type such as TIFF is what must still be refused.
    await assertSucceeds(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-dicom'),
      record({ id: 'rmed-dicom', mime: 'application/dicom', fileName: 'hand.dcm', ext: 'dcm' })));
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'),
      record({ mime: 'image/tiff' })));
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'),
      record({ mime: 'video/quicktime', kind: 'video', ext: 'mov', storagePath: `radiology/${ORDER}/rmed-1.mov` })));
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), record({ bytes: 0 })));
    await assertFails(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), record({ bytes: 26214401 })));
    await assertSucceeds(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), record({ bytes: 26214400 })));
    await assertSucceeds(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-2'),
      record({ id: 'rmed-2', mime: 'video/mp4', kind: 'video', ext: 'mp4', storagePath: `radiology/${ORDER}/rmed-2.mp4` })));
  });

  test('a filed media record can never be edited, and only its owner may remove it', async () => {
    await assertSucceeds(setDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), record()));
    await assertFails(updateDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), { fileName: 'swapped.jpg' }));
    await assertFails(updateDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1'), { storagePath: 'radiology/x/y' }));
    await assertFails(deleteDoc(doc(dbFor('doctor'), 'radiologyMedia', 'rmed-1')));
    await assertFails(deleteDoc(doc(dbFor('nurse'), 'radiologyMedia', 'rmed-1')));
    // An admin who did not upload it may not quietly remove evidence either:
    // admins act on the order, not on other people's files.
    await assertFails(deleteDoc(doc(dbFor('admin'), 'radiologyMedia', 'rmed-1')));
    await assertSucceeds(deleteDoc(doc(dbFor('radio'), 'radiologyMedia', 'rmed-1')));
  });
});

describe('radiology annotations (workstation drawings, key images, notes)', () => {
  const ORDER = 'rad-order-anno';
  const MEDIA = 'rmed-anno';

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'orders', ORDER), {
        id: ORDER, dept: 'radiology', type: 'imaging', patientId: 1001,
        patientName: 'Aline Test', status: 'in-progress', orderedById: profiles.doctor.staffId,
        orderedAt: 'test'
      });
      await setDoc(doc(db, 'radiologyMedia', MEDIA), {
        id: MEDIA, orderId: ORDER, patientId: '1001', fileName: 'hand.dcm', ext: 'dcm',
        mime: 'application/dicom', kind: 'image', bytes: 512000, sha256: '', at: 'test',
        storagePath: `radiology/${ORDER}/${MEDIA}.dcm`,
        byUid: profiles.radio.uid, byId: profiles.radio.staffId, byName: profiles.radio.name, byRole: 'radio'
      });
    });
  });

  function anno(who, overrides = {}) {
    const p = profiles[who];
    const base = {
      id: `${MEDIA}_${p.uid}`, mediaId: MEDIA, orderId: ORDER, patientId: '1001',
      measurements: [{ tool: 'Length', uuid: 'u1', frame: 0, json: '{"handles":{"start":{"x":1,"y":2},"end":{"x":9,"y":9}}}' }],
      keyImage: true, note: 'Fracture line visible', byUid: p.uid, byId: p.staffId, byName: p.name, byRole: p.role,
      updatedAt: '2026-09-02T10:00:00.000Z', client: 'pcdv/1',
      ...overrides
    };
    return base;
  }
  const ref = (who, id) => doc(dbFor(who), 'radiologyAnnotations', id || `${MEDIA}_${profiles[who].uid}`);

  test('doctors, radiology and admin save their own drawings; every clinical reader sees them', async () => {
    await assertSucceeds(setDoc(ref('doctor'), anno('doctor')));
    await assertSucceeds(setDoc(ref('radio'), anno('radio')));
    await assertSucceeds(setDoc(ref('admin'), anno('admin')));
    for (const role of ['doctor', 'nurse', 'radio', 'lab', 'reception', 'admin', 'theater', 'beds']) {
      await assertSucceeds(getDoc(ref(role, `${MEDIA}_${profiles.doctor.uid}`)), `${role} must see the doctor's drawings`);
      const snap = await getDocs(query(collection(dbFor(role), 'radiologyAnnotations'), where('orderId', '==', ORDER)));
      assert.equal(snap.size, 3, `${role} lists every author for the study`);
    }
    for (const role of ['cashier', 'finance', 'hr', 'inactive']) {
      await assertFails(getDoc(ref(role, `${MEDIA}_${profiles.doctor.uid}`)));
    }
  });

  test('nurses and other roles cannot write; nobody writes as someone else or under a foreign id', async () => {
    await assertFails(setDoc(ref('nurse'), anno('nurse')));
    await assertFails(setDoc(ref('lab'), anno('lab')));
    await assertFails(setDoc(ref('inactive'), anno('inactive')));
    // spoofed author
    await assertFails(setDoc(ref('doctor'), anno('doctor', { byUid: profiles.radio.uid })));
    // id must be <mediaId>_<uid>
    await assertFails(setDoc(ref('doctor', `${MEDIA}_${profiles.radio.uid}`), anno('doctor', { id: `${MEDIA}_${profiles.radio.uid}` })));
    await assertFails(setDoc(ref('doctor', 'free-id'), anno('doctor', { id: 'free-id' })));
  });

  test('an annotation must describe a real image of the same study and patient, and carry no pixels', async () => {
    await assertFails(setDoc(ref('doctor', `ghost_${profiles.doctor.uid}`), anno('doctor', { id: `ghost_${profiles.doctor.uid}`, mediaId: 'ghost' })));
    await assertFails(setDoc(ref('doctor'), anno('doctor', { orderId: 'other-order' })));
    await assertFails(setDoc(ref('doctor'), anno('doctor', { patientId: '9999' })));
    await assertFails(setDoc(ref('doctor'), anno('doctor', { data: 'AAAA' })));
    await assertFails(setDoc(ref('doctor'), anno('doctor', { dataUrl: 'data:image/png;base64,AAAA' })));
    await assertFails(setDoc(ref('doctor'), anno('doctor', { measurements: 'not-a-list' })));
    await assertFails(setDoc(ref('doctor'), anno('doctor', { keyImage: 'yes' })));
    await assertFails(setDoc(ref('doctor'), anno('doctor', { note: 'x'.repeat(4001) })));
    await assertSucceeds(setDoc(ref('doctor'), anno('doctor', { note: 'x'.repeat(4000), measurements: [] })));
  });

  test('authors edit and remove only their own document, and cannot re-point it at another image', async () => {
    await assertSucceeds(setDoc(ref('doctor'), anno('doctor')));
    await assertSucceeds(setDoc(ref('doctor'), anno('doctor', { note: 'updated', keyImage: false })));
    await assertFails(setDoc(ref('radio', `${MEDIA}_${profiles.doctor.uid}`), anno('doctor', { note: 'hijack' })));
    await assertFails(updateDoc(ref('radio', `${MEDIA}_${profiles.doctor.uid}`), { note: 'hijack' }));
    await assertFails(updateDoc(ref('admin', `${MEDIA}_${profiles.doctor.uid}`), { note: 'admin hijack' }));
    await assertFails(setDoc(ref('doctor'), anno('doctor', { mediaId: 'rmed-other' })));
    await assertFails(deleteDoc(ref('radio', `${MEDIA}_${profiles.doctor.uid}`)));
    await assertFails(deleteDoc(ref('admin', `${MEDIA}_${profiles.doctor.uid}`)));
    await assertSucceeds(deleteDoc(ref('doctor')));
  });
});
