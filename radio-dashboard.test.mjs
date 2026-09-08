import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(resolve(ROOT, 'radio-dashboard.html'), 'utf8');
const CSS = readFileSync(resolve(ROOT, 'radio-dashboard-doctor.css'), 'utf8');
const FIX = readFileSync(resolve(ROOT, 'radio-dashboard-fixes.js'), 'utf8');
const JS = readFileSync(resolve(ROOT, 'radio-dashboard.js'), 'utf8');

test('radio dashboard now loads the doctor-style skin and parity fix layer while keeping the shared radiology stack', () => {
  assert.match(HTML, /radio-dashboard-doctor\.css\?v=20260908_RADIODOCTORPARITY1/);
  assert.match(HTML, /pclinic-file\.js\?v=20260908_FILES_NURSEACTIONBAR/);
  assert.match(HTML, /radio-dashboard-fixes\.js\?v=20260908_RADIODOCTORPARITY1/);
  assert.match(HTML, /<body class="radio-doctor-shell">/);
  assert.match(HTML, /id="pcMasterHeader" class="pc-master-header"/);
  assert.match(HTML, /pclinic-radiology\.js\?v=20260828_MEDIA/);
  assert.match(HTML, /pclinic-radiology-media\.js\?v=20260902_MEDIAURL2/);
  assert.match(HTML, /pclinic-radiology-annotations\.js\?v=20260902_ANNOT/);
  assert.match(HTML, /radio-dashboard\.js\?v=20260902_WORKSTATION/);
  assert.match(JS, /window\.requireAuth\(\['radio'\]\)/);
  assert.match(JS, /window\.pcFile\.renderDemoBar/);
});

test('radio dashboard doctor CSS remaps the old radiology shell into the doctor-style chrome', () => {
  assert.match(CSS, /body\.radio-doctor-shell #tb2 \{/);
  assert.match(CSS, /display: flex !important;/);
  assert.match(CSS, /body\.radio-doctor-shell \.t2tab \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.srow \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.sw \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.kpi \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.body \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.sc,/);
  assert.match(CSS, /body\.radio-doctor-shell \.panel,/);
  assert.match(CSS, /body\.radio-doctor-shell \.ph \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.tbl th \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.fi,/);
  assert.match(CSS, /body\.radio-doctor-shell \.viewer-quickbar \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.modal-bg \{/);
  assert.match(CSS, /body\.radio-doctor-shell #gateLock > div \{/);
  assert.match(CSS, /body\.radio-doctor-shell\.dark-mode/);
});

test('radio dashboard wording now follows the cleaner doctor-style tone without breaking radiology workflow labels', () => {
  for (const token of [
    "Today's worklist",
    "Today's imaging queue",
    'Request policy',
    'Image viewer',
    'Report writer',
    'Imaging request workflow',
    'Shared clinical workflow',
    'Open Today\'s Worklist',
    'Radiology reports',
    'Sign &amp; Release Report',
    'Once signed, the report is saved to the Common Server and the referring clinician is notified in the shared clinical workflow.'
  ]) {
    assert.ok(HTML.includes(token), 'Missing radiology wording token: ' + token);
  }
});

test('radio dashboard fix layer keeps the shared patient identification bar and doctor-shell helpers applied', () => {
  assert.match(FIX, /function masterHeader\(\)/);
  assert.match(FIX, /function currentRadioPatient\(\)/);
  assert.match(FIX, /function clearedRadioPatient\(\)/);
  assert.match(FIX, /function ensureSharedRadioHeader\(\)/);
  assert.match(FIX, /window\.pcFile\.renderDemoBar\(host, currentRadioPatient\(\) \|\| clearedRadioPatient\(\)\)/);
  assert.match(FIX, /function showSecondaryNav\(\)/);
  assert.match(FIX, /function syncSearchPlaceholder\(\)/);
  assert.match(FIX, /function applyRadioDoctorParity\(\)/);
  assert.match(FIX, /tag\('\.panel', 'radio-doctor-panel'\)/);
  assert.match(FIX, /tag\('\.viewer-quick-btn', 'radio-doctor-tile'\)/);
  assert.match(FIX, /function wrapSwitchView\(\)/);
  assert.match(FIX, /window\.__radioDoctorSwitchWrapped/);
  assert.match(FIX, /window\.addEventListener\('pcPatientChanged', function \(\) \{/);
  assert.match(FIX, /window\.ensureSharedRadioHeader = ensureSharedRadioHeader/);
  assert.match(FIX, /window\.applyRadioDoctorParity = applyRadioDoctorParity/);
});
