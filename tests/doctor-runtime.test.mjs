// Runs the pure logic from the doctor dashboard modules against a minimal DOM
// shim, so the escaping and row-resolution behaviour is proven rather than
// pattern-matched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = {};
function src(file) {
  if (!cache[file]) cache[file] = readFileSync(resolve(root, file), 'utf8');
  return cache[file];
}

// Pull a top-level `function name(...){...}` out verbatim by matching braces.
function extract(file, name) {
  const text = src(file);
  const at = text.search(new RegExp('^[ \\t]*function ' + name + '\\s*\\(', 'm'));
  assert.ok(at !== -1, name + ' not found in ' + file);
  const open = text.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(at, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

// A text node serialised through innerHTML escapes & < > and nothing else —
// which is precisely why quoted attributes need a separate helper.
function makeDocument() {
  return {
    createElement() {
      const el = { _text: '', style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } };
      Object.defineProperty(el, 'textContent', {
        get: () => el._text,
        set: v => { el._text = v == null ? '' : String(v); }
      });
      Object.defineProperty(el, 'innerHTML', {
        get: () => el._text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        set: v => { el._text = String(v); }
      });
      return el;
    },
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild() {} }
  };
}

function run(file, names, extra) {
  const sandbox = {
    document: makeDocument(),
    console: { log() {}, warn() {}, error() {} },
    localStorage: (() => {
      const store = {};
      return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        _store: store
      };
    })(),
    setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {},
    confirm: () => true, alert: () => {},
    Date, Math, JSON, Number, String, Array, Object, RegExp, Error, Promise, Set, Map,
    encodeURIComponent, isNaN, parseInt, parseFloat
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  names.forEach(n => vm.runInContext(extract(file, n), sandbox));
  return sandbox;
}

// ─── pcEsc vs pcAttr ───
test('pcEsc leaves quotes live, which is why attributes need pcAttr', () => {
  const s = run('doctor.js', ['pcEsc', 'pcAttr']);
  const payload = 'Jane" onclick="alert(1)';
  assert.equal(s.pcEsc(payload), payload, 'pcEsc must not touch quotes');
  assert.ok(!s.pcAttr(payload).includes('"'), 'pcAttr must neutralise the double quote');
  assert.equal(s.pcAttr("a'b"), 'a&#39;b');
  assert.equal(s.pcAttr(null), '');
  assert.equal(s.pcAttr(undefined), '');
  assert.equal(s.pcEsc(null), '');
});

test('a stored value cannot break out of a data-arg attribute', () => {
  const s = run('doctor.js', ['pcAttr']);
  const rendered = '<button data-arg0="' + s.pcAttr('" onmouseover="x') + '">';
  assert.doesNotMatch(rendered, / onmouseover="/, 'the injected handler must not survive');
  assert.match(rendered, /&quot;/);
});

// ─── render-snapshot resolvers ───
test('noteRowAt refuses a row from another patient or a stale render', () => {
  const s = run('doctor.js', ['noteRowAt']);
  s.notesRows = { patientId: '7', list: [{ id: 'n1', note: 'first' }] };
  assert.deepEqual(s.noteRowAt('7', 0), { id: 'n1', note: 'first' });
  assert.equal(s.noteRowAt('8', 0), null, 'a different patient must never resolve a row');
  assert.equal(s.noteRowAt('7', 5), null, 'an out-of-range index must resolve to nothing');
  assert.deepEqual(s.noteRowAt('7', '0'), { id: 'n1', note: 'first' }, 'data-args arrive as strings');
});

test('vitalRowAt behaves the same way', () => {
  const s = run('doctor.js', ['vitalRowAt']);
  s.vitalsRows = { patientId: '7', list: [{ id: 'v1', pulse: 80 }, { id: 'v2', pulse: 90 }] };
  assert.deepEqual(s.vitalRowAt('7', 1), { id: 'v2', pulse: 90 });
  assert.equal(s.vitalRowAt('9', 1), null);
  assert.equal(s.vitalRowAt('7', -1), null);
});

// ─── theater rules contract ───
test('a booking carries the author staff id that firestore.rules requires', () => {
  const s = run('doctor.js', ['theaterStaffId', 'theaterStaffName', 'theaterUid']);
  s.currentStaff = { staffId: '55201', name: "Dr. O'Neil", role: 'doctor' };
  assert.equal(s.theaterStaffId(), '55201');
  assert.equal(s.theaterStaffName(), "Dr. O'Neil");
  const id = s.theaterUid();
  assert.match(id, /^srg-/);
  assert.notEqual(id, s.theaterUid(), 'two bookings must not collide on one id');
});

test('theaterStaffId falls back to the uid so the create is never rejected on an empty author', () => {
  const s = run('doctor.js', ['theaterStaffId', 'theaterStaffName']);
  s.currentStaff = { uid: 'abc123', name: 'Dr. Who' };
  assert.equal(s.theaterStaffId(), 'abc123');
  assert.equal(s.theaterStaffName(), 'Dr. Who');
  delete s.currentStaff;
  assert.equal(s.theaterStaffId(), '');
  assert.equal(s.theaterStaffName(), 'PClinic Staff');
});

// ─── sibling modules ───
for (const file of ['doctor-patient.js', 'doctor-actionbar.js']) {
  test(file + ' attr() is quote-safe while esc() stays text-only', () => {
    const s = run(file, ['attr', 'esc']);
    assert.ok(!s.attr('x" y').includes('"'), 'attr() must escape the double quote');
    assert.equal(s.attr("x'y"), 'x&#39;y');
    assert.equal(s.esc('a"b'), 'a"b', 'esc() keeps its text-only contract');
    assert.equal(s.attr(null), '');
  });
}

// ─── vitals strip tolerance ───
test('updateDoctorVitals does not throw when the strip markup is absent', () => {
  // Every getElementById in the shim returns null, matching doctor-dashboard.html,
  // which has no docVital* elements.
  const s = run('doctor.js', ['docVitalEl', 'docVitalSet', 'docVitalStatus', 'pcEsc', 'updateDoctorVitals']);
  assert.doesNotThrow(() => s.updateDoctorVitals({ vitals: [{ pulse: 88 }] }));
  assert.doesNotThrow(() => s.updateDoctorVitals(null));
  assert.doesNotThrow(() => s.updateDoctorVitals({ vitals: [] }));
});

// ─── patient status labels ───
test('pcSafeStatus keeps the statuses the KPI cards count', () => {
  const s = run('doctor.js', ['pcSafeStatus']);
  // 'inactive' used to be the catch-all, so an awaiting-review patient read as
  // Inactive in the table while still being counted by the Review KPI.
  assert.equal(s.pcSafeStatus('pending_review'), 'Awaiting review');
  assert.equal(s.pcSafeStatus('ready_discharge'), 'Ready for discharge');
  assert.equal(s.pcSafeStatus('critical'), 'Critical');
  assert.equal(s.pcSafeStatus('active'), 'Active');
  assert.equal(s.pcSafeStatus(undefined), 'active');
  assert.equal(s.pcSafeStatus(''), 'active');
  assert.ok(s.pcSafeStatus('anything-else') !== 'inactive', 'an unknown status must not be relabelled');
});

// ─── KPI cards vs the list they open ───
test('a KPI count always matches the patients its modal lists', () => {
  const patients = [
    { firstName: 'No', lastName: 'Status', department: 'Triage' },                       // status absent
    { firstName: 'Active', lastName: 'One', status: 'active' },
    { firstName: 'Review', lastName: 'One', status: 'pending_review' },
    { firstName: 'Discharge', lastName: 'One', status: 'ready_discharge' },
    { firstName: 'Critical', lastName: 'One', status: 'active', priority: 'critical' },
    { firstName: 'Pain', lastName: 'One', status: 'admitted', vitals: [{ painScore: '9' }] },
    { firstName: 'Gone', lastName: 'One', status: 'discharged' }
  ];
  const s = run('doctor.js', ['getPatientCohorts', 'getAdmittedPatients', 'getReviewPatients', 'getCriticalPatients', 'getDischargePatients'],
    { getPatients: () => patients });

  const cohorts = s.getPatientCohorts();
  assert.equal(cohorts.admitted.length, 3, 'the statusless patient counts as admitted, the discharged one does not');
  assert.equal(cohorts.review.length, 1);
  assert.equal(cohorts.critical.length, 2, 'priority critical and pain>7 both count');
  assert.equal(cohorts.discharge.length, 1);

  // The cards show these numbers and the modal shows these rows, so the two must
  // never be computed by different predicates.
  assert.equal(s.getAdmittedPatients().length, cohorts.admitted.length);
  assert.equal(s.getReviewPatients().length, cohorts.review.length);
  assert.equal(s.getCriticalPatients().length, cohorts.critical.length);
  assert.equal(s.getDischargePatients().length, cohorts.discharge.length);

  assert.equal(getPatientCountOf(s, 'Admitted', 'No Status'), 1, 'the statusless patient must appear in the list');
  assert.equal(getPatientCountOf(s, 'Critical', 'Pain One'), 1, 'the high-pain patient must appear in the critical list');
});

function getPatientCountOf(s, which, name) {
  const rows = s['get' + which + 'Patients']();
  return rows.filter(r => r[0] === name).length;
}
