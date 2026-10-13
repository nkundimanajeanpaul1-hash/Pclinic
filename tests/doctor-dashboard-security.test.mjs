// Guards the 2026-10-13 doctor dashboard pass. Each test pins one defect that
// was fixed so a future edit cannot quietly undo it.
//
// Run from a copy of the repo:  node --test doctor-dashboard-security.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(resolve(root, f), 'utf8');

const doctor = read('doctor.js');
const patient = read('doctor-patient.js');
const actionbar = read('doctor-actionbar.js');
const html = read('doctor-dashboard.html');
const rules = read('firestore.rules');

function fnBody(src, name) {
  const at = src.search(new RegExp('function ' + name + '\\s*\\('));
  assert.ok(at !== -1, name + ' is missing');
  return src.slice(at, at + 6000);
}

// ─── PARSING ───
test('the doctor dashboard modules and inline script all parse', () => {
  ['doctor.js', 'doctor-patient.js', 'doctor-actionbar.js'].forEach(function (f) {
    new vm.Script(read(f), { filename: f });
  });
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, 'expected exactly one inline script block');
  new vm.Script(blocks[0][1], { filename: 'doctor-dashboard.html inline' });
});

// ─── ESCAPE CONTEXT ───
// esc()/pcEsc() come from a textContent→innerHTML round trip: they escape
// & < > and never touch quotes, so they are not safe inside a quoted attribute.
const DATA_MODULES = { 'doctor.js': doctor, 'doctor-patient.js': patient, 'doctor-actionbar.js': actionbar };

test('no text-only escaper is used to fill a quoted attribute', () => {
  for (const [file, src] of Object.entries(DATA_MODULES)) {
    const offenders = [];
    src.split('\n').forEach(function (line, n) {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
      const m = line.match(/="\s*'\s*\+\s*(pcEsc|esc)\s*\(/g) || [];
      m.forEach(() => offenders.push(file + ':' + (n + 1) + ' ' + line.trim().slice(0, 110)));
    });
    assert.deepEqual(offenders, [],
      'quoted attributes must be filled by pcAttr()/attr(), not pcEsc()/esc()');
  }
});

test('each module defines a quote-safe attribute escaper', () => {
  assert.match(doctor, /function pcAttr\(value\)/);
  assert.match(patient, /function attr\(v\)/);
  assert.match(actionbar, /function attr\(v\)/);
  for (const fn of [doctor, patient, actionbar]) {
    const q = fn.match(/function (?:pcAttr|attr)\([\s\S]{0,400}?\}/);
    assert.ok(q && q[0].includes('&quot;') && q[0].includes('&#39;'),
      'the attribute escaper must escape both quote characters');
  }
});

// ─── DELEGATED ACTIONS ───
test('rendered data-action names and the dispatch registry agree exactly', () => {
  const used = [...new Set([...doctor.matchAll(/data-action="([A-Za-z_]\w*)"/g)].map(m => m[1]))];
  const declared = doctor.match(/var DOCTOR_ACTIONS = \[([\s\S]*?)\];/);
  assert.ok(declared, 'DOCTOR_ACTIONS registry is missing');
  const listed = [...new Set([...declared[1].matchAll(/'(\w+)'/g)].map(m => m[1]))];
  assert.deepEqual(used.filter(n => !listed.includes(n)), [], 'data-action used with no registered handler');
  assert.deepEqual(listed.filter(n => !used.includes(n)), [], 'handler registered but never rendered');
  listed.forEach(function (name) {
    assert.match(doctor, new RegExp('function ' + name + '\\s*\\('), name + ' must be a global function');
  });
});

test('no rendered button builds an inline handler out of stored data', () => {
  const indexVars = /^(i|idx|ti|ri|n|index|j|k)$/;
  const offenders = [];
  [doctor, patient, actionbar].forEach(function (src) {
    src.split('\n').forEach(function (line, n) {
      if (line.trim().startsWith('//')) return;
      const attrs = line.match(/on(?:click|change|input)="((?:[^"\\]|\\.)*)"/g) || [];
      attrs.forEach(function (raw) {
        const inner = raw.slice(raw.indexOf('"') + 1, -1);
        if (!inner.includes("' +")) return;
        const parts = inner.split("' +").slice(1).map(p => p.trim().split(/[\s,)+]/)[0]).filter(Boolean);
        const bad = parts.filter(p => !indexVars.test(p));
        if (bad.length) offenders.push((n + 1) + ': ' + bad.join(', ') + ' [' + inner.slice(0, 80) + ']');
      });
    });
  });
  assert.deepEqual(offenders, [], 'these handlers interpolate something other than a loop index');
});

test('dynamic markup is built with DOM APIs, not concatenated script strings', () => {
  // addCustomLabTest / addModalCustomTest used to write <input value="x">
  // <button onclick="removeCustomTest('x')"> and then eval it back into existence.
  const code = doctor.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\beval\s*\(/, 'eval() must not return');
  assert.doesNotMatch(code, /new Function\s*\(/);
  assert.match(doctor, /function addCustomLabTest[\s\S]{0,4000}?document\.createElement\('input'\)/,
    'custom lab tests must be built with createElement');
  assert.doesNotMatch(doctor, /function addCustomLabTest[\s\S]{0,4000}?\.innerHTML\s*=\s*'/,
    'custom lab test rows must not be assembled as HTML');
});

// ─── AUTH GATE ───
test('dashboard data loads only after the auth guard resolves', () => {
  assert.match(html, /requireAuth\(\['doctor'\]\)/);
  assert.match(doctor, /document\.addEventListener\('pclinicStaffReady'/);
  assert.match(doctor, /doctorAuthorized = true;\s*\n?\s*bootDoctorDashboard\(\);/,
    'bootDoctorDashboard() must run only from the authorized event');
  const boot = fnBody(doctor, 'bootDoctorDashboard');
  assert.match(boot, /loadPatients\(\)/);
  // No data load at column zero, i.e. outside any function body.
  const topLevel = doctor.split('\n').filter(l => /^(loadPatients|loadTheaterList|debouncedUpdateSchedule)\(\);/.test(l));
  assert.deepEqual(topLevel, [], 'data must not load before authorization');
});

test('tab restoration is whitelisted against the real tab names', () => {
  assert.match(doctor, /var DOCTOR_TABS = \[[\s\S]*?\];/);
  const tabs = [...doctor.match(/var DOCTOR_TABS = \[([\s\S]*?)\];/)[1].matchAll(/'(\w[\w-]*)'/g)].map(m => m[1]);
  const rendered = [...new Set([...html.matchAll(/data-tab="([\w-]+)"/g)].map(m => m[1]))];
  rendered.forEach(t => assert.ok(tabs.includes(t), 'DOCTOR_TABS is missing the rendered tab ' + t));
  assert.match(doctor, /DOCTOR_TABS\.indexOf\(savedTab\)/, 'a stored tab must be validated before use');
});

// ─── STALE-INDEX ACTIONS ───
test('note and vital rows are resolved from a render snapshot, not a live index', () => {
  for (const pair of [['notesRows', 'noteRowAt'], ['vitalsRows', 'vitalRowAt']]) {
    assert.match(doctor, new RegExp('var ' + pair[0] + ' = '), pair[0] + ' snapshot is missing');
    assert.match(doctor, new RegExp('function ' + pair[1] + '\\('), pair[1] + ' resolver is missing');
    assert.match(doctor, new RegExp('function ' + pair[1] + '\\([^)]*\\)\\s*\\{[^}]*return null'),
      pair[1] + ' must return null when the snapshot belongs to another patient');
  }
  ['printNote', 'deleteNote', 'deleteVital', 'editVital'].forEach(function (name) {
    const body = fnBody(doctor, name);
    assert.match(body, new RegExp('noteRowAt|vitalRowAt'), name + ' must resolve through the snapshot');
  });
  assert.match(fnBody(doctor, 'deleteNote'), /indexOf\(note\)/,
    'deleteNote must confirm the note is still attached to the patient');
});

test('theater entries are addressed by id so the date filter cannot shift a cancel', () => {
  const body = fnBody(doctor, 'renderTheaterList');
  assert.match(body, /data-action="removeTheaterEntry" data-arg0="' \+ pcAttr\(t\.id\)/);
  assert.doesNotMatch(body, /onclick="removeTheaterEntry\(/);
  assert.match(fnBody(doctor, 'removeTheaterEntry'), /String\(t\.id\) === String\(surgeryId\)/);
});

// ─── NO INVENTED DATA ───
test('the patient list never falls back to invented patients', () => {
  assert.doesNotMatch(doctor, /function loadSamplePatients/, 'the fake patient fallback must be gone');
  assert.doesNotMatch(doctor, /John', lastName: 'Kamau/);
  assert.match(doctor, /function showPatientsUnavailable/);
  assert.match(fnBody(doctor, 'loadPatients'), /showPatientsUnavailable\(\)/);
});

test('the notification panel ships no invented clinical alerts', () => {
  // Five demo notifications, one of them a "Critical vitals alert", sat in the
  // markup until the Firestore listener replaced them — and stayed forever if
  // the query was refused. A clinician cannot tell the difference.
  const panel = html.match(/id="notifList">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(panel, 'notifList panel markup is missing');
  assert.doesNotMatch(panel[1], /notif-item/, 'the panel must not ship pre-filled rows');
  assert.doesNotMatch(html, /Lab results ready for|Critical vitals alert|Prescription dispensed for/);
  assert.doesNotMatch(html, /Patient #10|Dr\. Ochieng/);
  assert.match(html, /id="notifCount"[^>]*display:none[^>]*>0</, 'the unread badge must start empty');
  assert.match(read('pclinic-notifications.js'), /count\.style\.display=unread>0\?'block':'none'/,
    'the badge must hide itself when nothing is unread');
  assert.match(read('pclinic-notifications.js'), /textContent='No server notifications'/,
    'an empty inbox must say so instead of showing nothing');
});

test('element ids on the page are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const dupes = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  assert.deepEqual(dupes, [], 'duplicate ids: ' + dupes.join(', '));
});

test('the patient status filter offers the statuses the dashboard actually uses', () => {
  const options = [...html.matchAll(/<option value="(\w+)">/g)].map(m => m[1]);
  for (const status of ['critical', 'pending_review', 'ready_discharge']) {
    assert.match(doctor, new RegExp("status === '" + status + "'"), 'the dashboard uses ' + status);
    assert.ok(options.includes(status), status + ' is not selectable in the patient list filter');
  }
});

// ─── PERSISTENCE ───
test('theater bookings are written to the shared collection, not a scratch pad', () => {
  const body = fnBody(doctor, 'addTheaterEntry');
  assert.match(body, /setDoc\([\s\S]*?'theaterSurgeries', booking\.id\)/);
  assert.match(body, /status: 'scheduled'/, 'rules only allow a doctor to create a scheduled booking');
  assert.match(body, /createdById: theaterStaffId\(\)/);
  assert.match(body, /Not sent to the Operating Theater/, 'the doctor must be told when the write did not happen');
  assert.match(fnBody(doctor, 'loadTheaterList'), /onSnapshot\([\s\S]*?'theaterSurgeries'/);
  const theaterRules = rules.match(/match \/theaterSurgeries\/\{surgeryId\} \{([\s\S]*?)\n    \}/);
  assert.ok(theaterRules, 'theaterSurgeries rules block is missing');
  assert.match(theaterRules[1], /allow create: if hasRole\(\['doctor'\]\)/);
  assert.match(theaterRules[1], /get\('status', ''\) == 'scheduled'/,
    'a doctor may only create a Scheduled booking — the UI must match');
});

test('custom diagnoses, medications and exams survive a reload', () => {
  assert.match(doctor, /var CUSTOM_DIAGNOSES_KEY = 'pclinic_custom_diagnoses'/);
  assert.match(doctor, /var CUSTOM_MEDICATIONS_KEY = 'pclinic_custom_medications'/);
  assert.match(fnBody(doctor, 'addCustomDiagnosis'), /saveCustomDiagnoses\(\)/);
  assert.match(fnBody(doctor, 'addCustomMedication'), /saveCustomMedications\(\)/);
  assert.match(doctor, /localStorage\.setItem\('customImagingExams', JSON\.stringify\(customExams\)\)/,
    'custom imaging exams must be persisted');
  assert.match(doctor, /JSON\.parse\(localStorage\.getItem\('customImagingExams'\)/,
    'and read back on the next paint');
});

test('adding a diagnosis writes it to the server instead of only the in-memory object', () => {
  assert.match(doctor, /function persistDiagnoses\(\)/);
  const update = fnBody(doctor, 'persistDiagnoses');
  assert.match(update, /updatePatient\(currentPatient\.id,\s*\{[\s\S]*?diagnoses:/);
  const add = fnBody(doctor, 'addDiagnosis');
  assert.match(add, /persistDiagnoses\(\)/);
  assert.match(add, /if \(!currentPatient\)/, 'a diagnosis needs a selected patient');
  assert.match(fnBody(doctor, 'addCustomDiagnosis'), /persistDiagnoses\(\)/);
});

// ─── ELEMENT LOOKUPS ───
test('the vitals strip tolerates pages that do not render it', () => {
  const body = fnBody(doctor, 'updateDoctorVitals');
  assert.doesNotMatch(body, /document\.getElementById\('docVital[A-Za-z]+'\)\./,
    'a missing vitals element used to throw and abort the calling action');
  assert.match(doctor, /function docVitalSet\(/);
  assert.match(doctor, /function docVitalStatus\(/);
});

test('pop-up blockers are reported instead of crashing the print path', () => {
  const writers = doctor.split('\n').filter(l => /document\.write\(/.test(l) && !l.trim().startsWith('//'));
  assert.ok(writers.length >= 4, 'expected the print helpers to still exist');
  ['printPrescription', 'printNote', 'printLabRequest'].forEach(function (name) {
    assert.match(fnBody(doctor, name), /Please allow pop-ups to print/);
  });
});

test('printed documents escape every stored field', () => {
  const blocks = [...doctor.matchAll(/(?:var|const) printContent =([\s\S]{0,2600}?);/g)].map(m => m[1]);
  assert.ok(blocks.length >= 4, 'expected the print builders to still exist');
  blocks.forEach(function (b, n) {
    const raw = (b.match(/'\s*\+\s*((?:patient|rx|req|note|round|t|currentPatient)\.[\w.]+|(?:patientName|medication|dosage|frequency|duration|instructions|department|reason|notes|mrn|fromDoctor|toDoctor|transferType|status|quantity))(?!\s*\()/g) || [])
      .filter(x => !/pcEsc|new Date|Date\.now|\.length/.test(x));
    assert.deepEqual(raw, [], 'print block ' + (n + 1) + ' interpolates unescaped data: ' + raw.join(', '));
  });
});

// ─── CACHE BUSTING ───
test('every changed module is cache-busted on every page that loads it', () => {
  // Hosting sends no Cache-Control for .js, so an unlabelled tag keeps serving
  // the previous copy to returning staff after an upload.
  const changed = ['doctor.js', 'doctor-patient.js', 'doctor-actionbar.js', 'pclinic-notifications.js'];
  const pages = readdirSync(root).filter(f => f.endsWith('.html'));
  let checked = 0;
  pages.forEach(function (page) {
    const src = read(page);
    changed.forEach(function (mod) {
      const tag = src.match(new RegExp('<script[^>]+\\bsrc="' + mod.replace(/\./g, '\\.') + '(\\?v=([\\w.-]+))?"'));
      if (!tag) return;
      checked++;
      assert.ok(tag[2], mod + ' is loaded by ' + page + ' without a ?v= label');
    });
  });
  assert.ok(checked >= 6, 'expected the changed modules to be referenced, found ' + checked);
  const label = html.match(/doctor\.js\?v=([\w-]+)/);
  assert.ok(label, 'doctor.js must be cache-busted on doctor-dashboard.html');
  assert.equal(html.match(/doctor-patient\.js\?v=/).length, 1);
});

// ─── KPI CARDS vs THE LIST THEY OPEN ───
test('the overview cards and their modals share a single cohort definition', () => {
  ['updateKPIs', 'getAdmittedPatients', 'getReviewPatients', 'getCriticalPatients', 'getDischargePatients'].forEach(function (name) {
    assert.match(fnBody(doctor, name), /getPatientCohorts\(/, name + ' must read the shared cohorts');
  });
  // Each cohort predicate may exist in exactly one place; a second copy is how the
  // cards and the modal drifted apart (a statusless patient was counted admitted
  // by the card but filtered out of the list it opened).
  [
    ['review', /p\.status === 'pending_review'/g],
    ['discharge', /p\.status === 'ready_discharge'/g],
    ['admitted', /\(p\.status \|\| 'active'\) === 'active'/g],
    ['critical pain', /v\.painScore && parseInt\(v\.painScore\) > 7/g]
  ].forEach(function (pair) {
    const hits = doctor.match(pair[1]) || [];
    assert.equal(hits.length, 1, 'the ' + pair[0] + ' predicate must live once, in getPatientCohorts — found ' + hits.length);
  });
  assert.match(doctor, /function getPatientCohorts\(/);
});
