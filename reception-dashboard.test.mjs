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
  assert.match(html, /reception-dashboard-doctor\.css\?v=20260909_RECEPTIONDOCTOR4/);
  assert.match(html, /reception-dashboard-doctor\.js\?v=20260909_RECEPTIONDOCTOR1/);
  assert.match(html, /<body[^>]*class="reception-doctor-shell"/);
});

test('Reception Doctor CSS defines doctor-style workspace, compact quick-actions, and front-layer command dropdowns', () => {
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 190px/);
  assert.match(css, /\.reception-doctor-quick-panel/);
  assert.match(css, /\.reception-doctor-quick-card/);
  assert.match(css, /position:\s*sticky;/);
  assert.match(css, /border-radius:\s*999px !important;/);
  assert.match(css, /overflow:\s*visible;/);
  assert.match(css, /z-index:\s*1400 !important;/);
  assert.match(css, /\.message-center-modal \.message-center-sheet/);
  assert.match(css, /width:\s*min\(94vw, 1680px\) !important;/);
  assert.match(css, /height:\s*min\(88vh, 1120px\) !important;/);
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

test('Reception exposes a visible Message button, front popup modal, and embedded message center', () => {
  const modalSection = sectionBetween(html, '<div class="modal-overlay message-center-modal"', '<!-- ===== PATIENT SELECTOR MODAL');
  assert.match(html, />\s*<span>Message<\/span>\s*<\/button>/);
  assert.match(html, /id="messageCenterModal"/);
  assert.match(html, /class="modal-overlay message-center-modal" id="messageCenterModal"/);
  assert.match(html, /class="modal-sheet message-center-sheet"/);
  assert.match(html, /class="modal-header message-center-header"/);
  assert.match(html, /class="modal-title message-center-title"/);
  assert.match(html, /class="modal-body message-center-body"/);
  assert.match(html, /id="messageCenterFrame"/);
  assert.match(html, /function openMessageCenter\(\)\{/);
  assert.match(html, /modal\.classList\.add\('open'\)/);
  assert.match(html, /messages\.html\?embedded=1/);
  assert.match(html, /function closeMessageCenter\(\)\{/);
  assert.match(html, /openMessageCenterWindow\(\)/);
  assert.doesNotMatch(modalSection, /#0f766e|#0ea5a4/);
  assert.match(css, /\.message-center-modal \.message-center-header/);
  assert.match(css, /rgba\(255, 255, 255, 0\.96\)/);
});

test('Reception action bar uses a reduced Apple-style palette instead of many mixed tones', () => {
  const toolsSection = sectionBetween(html, '<div class="rc-tools" aria-label="Reception actions">', '<!-- ===== BODY ===== -->');
  assert.match(toolsSection, /ra-apple-secondary/);
  assert.match(toolsSection, /ra-apple-accent/);
  assert.match(toolsSection, /ra-apple-neutral/);
  assert.match(toolsSection, /ra-apple-danger/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-blue\b/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-blue-dark\b/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-green\b/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-orange\b/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-yellow\b/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-gray\b/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-indigo\b/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-teal\b/);
  assert.doesNotMatch(toolsSection, /ra-btn ra-red\b/);
  assert.match(css, /\.ra-apple-secondary/);
  assert.match(css, /\.ra-apple-accent/);
  assert.match(css, /\.ra-apple-neutral/);
  assert.match(css, /\.ra-apple-danger/);
  assert.match(css, /rgba\(10, 132, 255, 0\.15\)/);
  assert.match(css, /rgba\(255, 59, 48, 0\.14\)/);
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
