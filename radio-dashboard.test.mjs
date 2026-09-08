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
const SHARED = readFileSync(resolve(ROOT, 'pclinic-file.js'), 'utf8');

test('radio dashboard now loads the doctor-style skin and parity fix layer while keeping the shared radiology stack', () => {
  assert.match(HTML, /radio-dashboard-doctor\.css\?v=20260908_RADIODOCTORPARITY3/);
  assert.match(HTML, /pclinic-file\.js\?v=20260908_FILES_RADIODOCTORPARITY3/);
  assert.match(HTML, /radio-dashboard-fixes\.js\?v=20260908_RADIODOCTORPARITY3/);
  assert.match(HTML, /<body class="radio-doctor-shell">/);
  assert.match(HTML, /id="pcMasterHeader" class="pc-master-header"/);
  assert.match(HTML, /class="body content-area radio-content-area"/);
  assert.match(HTML, /class="radio-doctor-overview"/);
  assert.match(HTML, /radio-overview-quick-panel/);
  assert.match(HTML, /radio-quick-actions/);
  assert.match(HTML, /class="qa-card" onclick="radioQuickAction\('select'\)"/);
  assert.match(HTML, /class="qa-card" onclick="radioQuickAction\('viewer'\)"/);
  assert.match(HTML, /class="qa-card" onclick="radioQuickAction\('report'\)"/);
  assert.match(HTML, /class="kpi-num" id="kpiPendingN"/);
  assert.match(HTML, /pclinic-radiology\.js\?v=20260828_MEDIA/);
  assert.match(HTML, /pclinic-radiology-media\.js\?v=20260902_MEDIAURL2/);
  assert.match(HTML, /pclinic-radiology-annotations\.js\?v=20260902_ANNOT/);
  assert.match(HTML, /radio-dashboard\.js\?v=20260908_WORKSTATION_PARITY3/);
  assert.match(JS, /window\.requireAuth\(\['radio'\]\)/);
  assert.match(JS, /window\.pcFile\.renderDemoBar/);
});

test('radio dashboard doctor CSS remaps the old radiology shell into the doctor-style chrome and stacked shared bars', () => {
  assert.match(CSS, /body\.radio-doctor-shell #pcMasterHeader,/);
  assert.match(CSS, /display: flex !important;/);
  assert.match(CSS, /body\.radio-doctor-shell #dcBar\.dc-bar,/);
  assert.match(CSS, /body\.radio-doctor-shell #dcBar \.ab-btn \{/);
  assert.match(CSS, /body\.radio-doctor-shell #tb2 \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.t2tab \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.srow \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.sw \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.kpi \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.kpi-num \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.radio-doctor-overview \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.radio-overview-side \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.radio-quick-actions \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.qa-card \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.qa-label \{/);
  assert.match(CSS, /body\.radio-doctor-shell \.content-area,/);
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
    "Search patient by name, MRN, or accession — press Enter to select",
    "Today's studies",
    'Awaiting review',
    'Reports released',
    'STAT queue',
    'Request policy',
    'Image viewer',
    'Report writer',
    'Imaging request workflow',
    'Shared clinical workflow',
    '⚡ Quick Actions',
    'Select patient',
    'Print report',
    'Help',
    'Settings',
    'Select patient / study from Today\'s worklist to unlock viewer and reporting.',
    'Common Server sync: orders, reports and alerts update live.',
    'Open Today\'s Worklist',
    'Radiology reports',
    'Sign &amp; Release Report',
    'Once signed, the report is saved to the Common Server and the referring clinician is notified in the shared clinical workflow.'
  ]) {
    assert.ok(HTML.includes(token), 'Missing radiology wording token: ' + token);
  }
});

test('radio dashboard logic keeps doctor-style secondary labels and polished empty-state copy', () => {
  for (const token of [
    "Today's imaging queue",
    'Imaging request workflow',
    "Open this study from Today's worklist to continue the workflow.",
    'No imaging requests are waiting right now.',
    'No imaging activity has been recorded yet today.',
    'No radiology reports are ready yet. Signed reports remain available in the patient record.',
    'Common Server synced',
    'Reports released today',
    'Direct clinician follow-up pending',
    'No STAT studies waiting',
    'Select patient from the identification bar',
    'Radiology workspace connected to the secure Common Server.',
    'window.radioRefreshWorkspace = function ()',
    'function newestActionableOrderFor(patient)',
    'function newestReportReadyOrderFor(patient)',
    'window.radioQuickAction = function (action)',
    "notify('Select patient first from the identification bar.'",
    "notify(\"Open an acquired study from Today's worklist first.\"",
    "openMediaSheet(viewerOrder, currentPatient)",
    'window.openShortcuts()',
    'window.radioOpenSettings()'
  ]) {
    assert.ok(JS.includes(token), 'Missing radiology JS token: ' + token);
  }
  assert.match(JS, /item\.innerHTML = '<i class="ti ' \+ tab\.icon \+ '"><\/i>' \+ tab\.label;/);
});

test('shared radiology action bar wording matches the tighter doctor-style radiology shell', () => {
  assert.ok(SHARED.includes('data-rad-view="worklist"'), 'missing radiology worklist action');
  assert.ok(SHARED.includes("Today\\'s worklist<span class=\"ab-badge\" id=\"radBarWorkCnt\""), 'missing tighter worklist action label');
  assert.ok(SHARED.includes('data-rad-view="signed"'), 'missing radiology reports action');
  assert.ok(SHARED.includes('Radiology reports<span class="ab-badge" id="radBarSignedCnt"'), 'missing tighter radiology reports action label');
  assert.ok(SHARED.includes('Open DICOM to add radiology result'), 'missing viewer entry label');
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
