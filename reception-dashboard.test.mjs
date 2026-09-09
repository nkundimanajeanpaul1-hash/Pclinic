import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const htmlPath = '/home/user/repo3/reception-dashboard.html';
const cssPath = '/home/user/repo3/reception-dashboard-doctor.css';
const jsPath = '/home/user/repo3/reception-dashboard-doctor.js';

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

function sectionBetween(source, start, end) {
  const s = source.indexOf(start);
  assert.notEqual(s, -1, `Missing start marker: ${start}`);
  const e = source.indexOf(end, s);
  assert.notEqual(e, -1, `Missing end marker after ${start}: ${end}`);
  return source.slice(s, e);
}

test('Reception page loads Doctor-parity skin and corrected title', () => {
  assert.match(html, /<title>Reception Dashboard — PClinic<\/title>/);
  assert.match(html, /reception-dashboard-doctor\.css\?v=20260909_RECEPTIONDOCTOR1/);
  assert.match(html, /reception-dashboard-doctor\.js\?v=20260909_RECEPTIONDOCTOR1/);
  assert.match(html, /<body[^>]*class="reception-doctor-shell"/);
});

test('Reception Doctor CSS defines doctor-style workspace and compact quick-actions panel', () => {
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 190px/);
  assert.match(css, /\.reception-doctor-quick-panel/);
  assert.match(css, /\.reception-doctor-quick-card/);
  assert.match(css, /position:\s*sticky;/);
  assert.match(css, /border-radius:\s*999px !important;/);
});

test('Reception Doctor JS injects vertical role-specific quick actions', () => {
  assert.match(js, /receptionDoctorQuickPanel/);
  assert.match(js, /Search patient/);
  assert.match(js, /Register/);
  assert.match(js, /Queue/);
  assert.match(js, /RDV/);
  assert.match(js, /Beds/);
  assert.match(js, /Messages/);
  assert.match(js, /reception-doctor-highlight/);
});

test('Reception exposes a visible common-server Message button and shared message center routing', () => {
  assert.match(html, />\s*<span>Message<\/span>\s*<\/button>/);
  assert.match(html, /function openMessageCenter\(\)\{/);
  assert.match(html, /window\.location\.href='messages\.html'/);
  assert.match(html, /Message Center/);
});

test('Registration flow still drives queue and downstream views', () => {
  const section = sectionBetween(html, 'async function registerPatient(){', '// ─── QUEUE FUNCTIONS ───');
  assert.match(section, /updatePatient\(editingPatientId, patientData\)/);
  assert.match(section, /addPatient\(patientData\)/);
  assert.match(section, /queue = freshPatients\.filter/);
  assert.match(section, /renderQueue\(\);/);
  assert.match(section, /renderRefs\(\);/);
  assert.match(section, /populateAppointmentPatients\(\);/);
  assert.match(section, /populateSurgeryPatients\(\);/);
  assert.match(section, /showView\('queue', getNavBtn\('queue'\)\)/);
});

test('Appointment booking is string-ID safe and still notifies downstream workflows', () => {
  const section = sectionBetween(html, 'async function bookAppointment(){', 'function saveAppointments(){');
  assert.match(section, /findPatientByAnyId\(patientId\)/);
  assert.match(section, /patientId:\s*String\(patientId\)/);
  assert.doesNotMatch(section, /parseInt\(patientId\)/);
  assert.match(section, /updatePatient\(patientId,\{appointments:patientAppointments\}\)/);
  assert.match(section, /writeServerNotification\(/);
  assert.match(section, /sendDoctorNotification\(/);
});

test('Queue rendering keeps reception controls for view, call, triage, vitals, booking, and completion', () => {
  const section = sectionBetween(html, 'function renderQueue(){', 'function renderHistory(){');
  assert.match(section, /queueButton\('view','ti-user-search','View'/);
  assert.match(section, /queueButton\('call','ti-phone-call','Call Patient'/);
  assert.match(section, /queueButton\('triage','ti-first-aid-kit','Triage'/);
  assert.match(section, /queueButton\('vitals','ti-heartbeat','Vitals'/);
  assert.match(section, /queueButton\('rdv','ti-calendar-plus','Book RDV'/);
  assert.match(section, /queueButton\('complete','ti-circle-check','Complete'/);
});

test('Bed admission help text matches the real numbered-bed workflow', () => {
  assert.match(html, /offers real available beds from the Common Server bed registry/i);
  assert.match(html, /assigns that bed to the patient and marks the bed occupied on the Common Server/i);
  assert.doesNotMatch(html, /does not reserve a numbered bed/i);
});

test('Bed workflow uses registry-backed assignment and release', () => {
  const section = sectionBetween(html, 'async function raAdmission(){', 'function raEmergency(){');
  assert.match(section, /listAvailableBeds\(/);
  assert.match(section, /Enter the bed to assign/);
  assert.match(section, /updatePatient\(p\.id,updates\)/);
  assert.match(section, /setDoc\(f\.doc\(db,'beds',bedChoice\.id\), \{ status:'occupied'/);
  assert.match(section, /setDoc\(f\.doc\(db,'beds',heldBed\.bedId\), \{ status:'available'/);
});

test('Referrals view remains wired to common-server patient referral data', () => {
  const section = sectionBetween(html, 'function initRefs(){', '// ─── OPEN PATIENT ───');
  assert.match(section, /function initRefs\(\)/);
  assert.match(section, /String\(patient\.visitType\|\|'\'\)\.toLowerCase\(\)==='referral'/);
  assert.match(section, /function renderRefs\(\)/);
  assert.match(section, /status==='all-patients'/);
  assert.match(section, /allPat=getPatients\(\)\|\|\[\]/);
  assert.match(section, /window\.openPatient\(ref\.id\)/);
  assert.match(section, /No referrals found in the Common Server/);
});

test('Appointment and surgery patient row actions are safe for string IDs', () => {
  assert.ok(html.includes("data-patient-id=\"' + escHtml(appt.patientId) + '\""));
  assert.ok(html.includes("data-patient-id=\"' + escHtml(surg.patientId) + '\""));
  assert.ok(html.includes("window.openPatient(this.getAttribute(\\'data-patient-id\\'))"));
  assert.ok(html.includes("function col(id){return COLORS[colorIndex(id)] || COLORS[0];}"));
});
