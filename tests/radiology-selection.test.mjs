'use strict';

/*
 * tests/radiology-selection.test.mjs
 *
 * Selecting a study must make that patient the one shown in the identification
 * bar AND the one every action works on. It previously refused outright when the
 * device's local patient mirror did not contain the patient — and that mirror is
 * exactly the thing that does not sync between computers (see
 * pclinic-file-sync.test.mjs), so a study visible in the worklist could be
 * unselectable.
 *
 * These tests evaluate the REAL functions lifted out of radio-dashboard.js, so
 * a future edit that reintroduces the registry dependency fails here rather than
 * in the department.
 *
 * Run:  npm --prefix tests run test:selection
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'radio-dashboard.js'), 'utf8');

/**
 * Pull a real function out of the module by brace matching, and eval it in a
 * sandbox whose helpers the caller supplies. Not a re-implementation: the bytes
 * under test are the shipped ones.
 */
function extract(names, harness = {}) {
  const parts = [];
  for (const name of names) {
    const sig = `function ${name}(`;
    const at = SRC.indexOf(sig);
    assert.notEqual(at, -1, `${name} no longer exists in radio-dashboard.js`);
    const braceAt = SRC.indexOf('{', at);
    let depth = 0, i = braceAt;
    for (; i < SRC.length; i++) {
      if (SRC[i] === '{') depth++;
      else if (SRC[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    parts.push(SRC.slice(at, i));
  }
  const sandbox = {
    String, Number, Boolean, Object, Array, Date, Math, JSON, RegExp, Set, Map, isNaN,
    __calls: [], __setFired: 0,
  };
  // Wired after creation: referencing `sandbox` inside its own object literal is
  // a temporal-dead-zone read and throws.
  sandbox.__h = harness;
  sandbox.notify = (...a) => sandbox.__h.notify && sandbox.__h.notify(...a);
  sandbox.findPatient = (id) => (sandbox.__h.findPatient ? sandbox.__h.findPatient(id) : null);
  sandbox.announceStudyCount = () => { sandbox.__calls.push('count'); };
  sandbox.highlightSelectedStudy = () => { sandbox.__calls.push('highlight'); };
  sandbox.stateOf = (o) => (sandbox.__h.stateOf ? sandbox.__h.stateOf(o) : 'pending');
  sandbox.setActivePatient = (p) => {
    sandbox.currentPatient = p;                        // real module state, shared scope
    sandbox.__setFired++;
  };
  sandbox.radiologyState = sandbox.__h.radiologyState || { orders: [] };
  sandbox.window = sandbox.__h.window || {};
  sandbox.document = sandbox.__h.document || { getElementById: () => null };
  sandbox.timestampMillis = (v) => (v ? Date.parse(v) || 0 : 0);
  vm.createContext(sandbox);
  // Declared in the shared sandbox scope so the extracted bodies assign real
  // module state; declaring them inside the harness object would only give the
  // closure a private copy and every assertion would read a stale null.
  vm.runInContext('var currentPatient = null; var currentOrder = null; var currentReport = null;', sandbox);
  vm.runInContext(parts.join('\n\n') + '\n; this.api = {' + names.join(',') + ' };',
    sandbox, { filename: 'extracted.js' });
  sandbox.api.__state = () => ({ currentPatient: sandbox.currentPatient,
    currentOrder: sandbox.currentOrder, setFired: sandbox.__setFired, calls: sandbox.__calls });
  return sandbox.api;
}

const STUDY = {
  id: 'ord-77', patientId: '1002', patientName: 'Djuma Nshuti',
  dept: 'radiology', type: 'imaging', status: 'pending', priority: 'urgent',
  orderedAt: '2026-08-30T08:00:00.000Z', study: 'Foot X-Ray',
};

test('a study selects its patient from the order alone, with no registry entry', () => {
  const { patientFromOrder } = extract(['patientFromOrder'], {
    findPatient: () => null,                       // the broken-on-other-computers case
  });
  const p = patientFromOrder(STUDY);
  assert.ok(p, 'selection must not depend on the local patient mirror');
  assert.equal(p.id, '1002', 'the real record id is kept so files/sync target the right chart');
  assert.equal(p.mrn, '1002');
  assert.equal(p.name, 'Djuma Nshuti');
  assert.equal(p.firstName, 'Djuma');
  assert.equal(p.lastName, 'Nshuti');
  assert.equal(p._fromOrder, true, 'the bar can tell a derived patient from a registry one');
});

test('a registry patient is preferred over the derived stub', () => {
  const full = { id: '1002', mrn: '1002', firstName: 'Djuma', lastName: 'Nshuti', dob: '2019-01-23', gender: 'Male' };
  const { patientFromOrder } = extract(['patientFromOrder'], { findPatient: () => full });
  assert.equal(patientFromOrder(STUDY), full, 'do not downgrade a known patient to the order stub');
});

test('selecting makes the patient the one to work on, and tells the bar', () => {
  const { selectStudy, __state } = extract(['patientFromOrder', 'selectStudy']);
  const patient = selectStudy(STUDY);
  const st = __state();
  assert.equal(st.setFired, 1, 'setActivePatient must run exactly once per selection');
  assert.equal(st.currentPatient && st.currentPatient.id, '1002',
    'the selected row patient becomes the current patient');
  assert.equal(st.currentOrder && st.currentOrder.id, 'ord-77',
    'and it becomes the study every action works on');
  assert.deepEqual(st.calls, ['highlight', 'count'], 'row highlight and the bar badge must both refresh');
  assert.equal(patient._fromOrder, true);
});

test('re-clicking the same patient does not re-fire the bar', () => {
  const { selectStudy, __state } = extract(['patientFromOrder', 'selectStudy']);
  selectStudy(STUDY);
  selectStudy(STUDY);                                  // same patient, second click
  const st = __state();
  assert.equal(st.setFired, 1, 'the guard must stop a duplicate pcPatientChanged broadcast');
  assert.equal(st.currentOrder.id, 'ord-77', 'but the study itself must still update');
});

test('a study with no patient id is refused loudly, not silently', () => {
  const notes = [];
  const { selectStudy } = extract(['patientFromOrder', 'selectStudy'], {
    findPatient: () => null,
    notify: (m, k) => notes.push({ m: String(m), k }),
    setActivePatient: () => { throw new Error('must not select a patient-less study'); },
    announceStudyCount: () => {}, highlightSelectedStudy: () => {},
    window: {},
  });
  const out = selectStudy({ id: 'ord-x', patientId: '' });
  assert.equal(out, null, 'no patient may be set when the study has no id');
  assert.equal(notes.length, 1, 'the radiographer must be told why');
  assert.match(notes[0].m, /no patient id/i);
  assert.equal(notes[0].k, 'error');
});

test('openOrdersForPatient keeps cancelled studies out but includes pending ones', () => {
  const cancelled = { ...STUDY, id: 'ord-cancelled', status: 'cancelled' };
  const reported = { ...STUDY, id: 'ord-done', status: 'completed', radiologyState: 'reported' };
  const { openOrdersForPatient } = extract(['openOrdersForPatient'], {
    radiologyState: { orders: [STUDY, cancelled, reported] },
    stateOf: (o) => (o.status === 'cancelled' ? 'cancelled' : o.radiologyState || 'pending'),
    timestampMillis: (v) => Date.parse(v) || 0,
  });
  const ids = openOrdersForPatient({ id: '1002' }).map((o) => o.id);
  assert.ok(ids.includes('ord-77'), 'a pending study still needs its image');
  assert.ok(ids.includes('ord-done'), 'a reported study can still receive an addendum image');
  assert.equal(ids.includes('ord-cancelled'), false, 'cancelled studies must not be offered');
});

test('the row click handler is single and no longer blocks on the registry', () => {
  const start = SRC.indexOf('row.appendChild(actions);', SRC.indexOf('function renderWorklist'));
  const window_ = SRC.slice(start, SRC.indexOf('body.appendChild(row);', start));
  const clicks = (window_.match(/addEventListener\('click'/g) || []).length;
  assert.equal(clicks, 1, `the studies row now has ${clicks} click handlers; a duplicate would double-select`);
  assert.match(window_, /selectStudy\(order\)/, 'the row click must go through selectStudy');
  assert.doesNotMatch(window_, /not in the registry/, 'selection must not be blocked by the local mirror');
  assert.doesNotMatch(window_, /renderWorklist\(\)/, 're-rendering mid-click rebuilds the row being clicked');
});

test('the bar still receives the patient so it renders in the identification bar', () => {
  // setActivePatient is what feeds the bar; assert it is still the single channel.
  const body = SRC.slice(SRC.indexOf('function setActivePatient(patient)'), SRC.indexOf('function setActivePatient(patient)') + 900);
  const cut = body.slice(0, body.indexOf('\n        }') + 1);
  assert.match(cut, /window\.pcRadioBar && .*setPatient/, 'the bar must be told on every selection');
  assert.match(cut, /pcPatientChanged/, 'other widgets rely on this event');
  assert.match(cut, /sessionStorage\.setItem\('pclinic_active_patient'/, 'selection must survive a reload');
});
