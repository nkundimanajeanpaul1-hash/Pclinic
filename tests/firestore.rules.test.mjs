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
});

describe('laboratory workflow security', () => {
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

describe('patient counter, billing and files', () => {
  test('reception increments counter exactly by one; other roles cannot', async () => {
    await assertSucceeds(setDoc(doc(dbFor('reception'), 'config', 'patientCounter'), { lastId: 1001, updatedAt: 'test' }));
    await assertSucceeds(updateDoc(doc(dbFor('reception'), 'config', 'patientCounter'), { lastId: 1002, updatedAt: 'test2' }));
    await assertFails(updateDoc(doc(dbFor('reception'), 'config', 'patientCounter'), { lastId: 1004, updatedAt: 'bad' }));
    await assertFails(updateDoc(doc(dbFor('doctor'), 'config', 'patientCounter'), { lastId: 1003, updatedAt: 'bad' }));
  });

  test('cashier reads bills but cannot read patients', async () => {
    await assertSucceeds(getDoc(doc(dbFor('cashier'), 'bills', 'bill-1')));
    await assertFails(getDoc(doc(dbFor('cashier'), 'patients', '1001')));
  });

  test('patient files reject embedded data URLs', async () => {
    await assertSucceeds(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'f1'), { id: 'f1', patientId: 1001, type: 'note', attachments: [] }));
    await assertFails(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'f2'), { id: 'f2', patientId: 1001, type: 'photo', data: 'data:image/png;base64,abc' }));
    await assertFails(setDoc(doc(dbFor('doctor'), 'patients', '1001', 'files', 'f3'), { id: 'f3', patientId: 1001, type: 'note', attachments: [{ data: 'data:text/plain;base64,abc' }] }));
  });
});
