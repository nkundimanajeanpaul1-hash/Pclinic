import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(resolve(ROOT, 'lab-dashboard.html'), 'utf8');
const CSS = readFileSync(resolve(ROOT, 'lab-dashboard-doctor.css'), 'utf8');
const FIX = readFileSync(resolve(ROOT, 'lab-dashboard-fixes.js'), 'utf8');

test('lab dashboard now loads the doctor-style skin and lab parity fix layer while keeping lab auth', () => {
  assert.match(HTML, /lab-dashboard-doctor\.css\?v=20260908_LABDOCTORPARITY5SMALLQAONLY/);
  assert.match(HTML, /pclinic-file\.js\?v=20260908_FILES_NURSEACTIONBAR/);
  assert.match(HTML, /lab-dashboard-fixes\.js\?v=20260908_LABDOCTORPARITY4VISIBLEQA/);
  assert.match(HTML, /<body class="lab-doctor-shell">/);
  assert.match(HTML, /id="pcMasterHeader" class="pc-master-header"/);
  assert.match(HTML, /requireAuth\(\['lab'\]\)/);
  assert.match(HTML, /pclinic-orders\.js/);
  assert.match(HTML, /pclinic-worklist\.js/);
  assert.match(HTML, /pclinic-lab\.js/);
  assert.match(HTML, /pclinic-lab-live\.js/);
  assert.match(HTML, /lab-doctor-overview/);
  assert.match(HTML, /lab-overview-quick-actions/);
  assert.match(HTML, /onclick="labQuickAction\('specimen'\)"/);
  assert.match(HTML, /onclick="labQuickAction\('results'\)"/);
  assert.match(HTML, /onclick="labQuickAction\('reports'\)"/);
});

test('lab dashboard hides its legacy hero chrome and adopts the doctor dashboard shell styling', () => {
  assert.match(CSS, /body\.lab-doctor-shell \.topbar,/);
  assert.match(CSS, /body\.lab-doctor-shell #breadcrumb,/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-smart-shell,/);
  assert.match(CSS, /body\.lab-doctor-shell #labCommandRibbon/);
  assert.match(CSS, /body\.lab-doctor-shell \.nav-tabs \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.nav-tab \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.sub-nav \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.search-row \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.kpi \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.main-panel \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.glass-panel,/);
  assert.match(CSS, /body\.lab-doctor-shell \.wtbl \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.fi,/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-doctor-overview \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-overview-side \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-overview-quick-actions \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.qa-card \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.qa-label \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-doctor-body \{/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-doctor-section-head,/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-doctor-qc-head,/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-doctor-micro-head,/);
  assert.match(CSS, /body\.lab-doctor-shell \.lab-doctor-pill-tabs,/);
  assert.match(CSS, /body\.lab-doctor-shell \.modal-overlay,/);
  assert.match(CSS, /body\.lab-doctor-shell \.toast \{/);
});

test('lab dashboard wording now follows the cleaner doctor-dashboard tone and includes the new quick-actions workflow', () => {
  for (const token of [
    "Today's laboratory queue",
    'Specimen workflow',
    'Select patient / order',
    "Today's worklist",
    'Lab Results',
    'Pathology',
    'Culture workflow • Common Server synced',
    'Common Server sync:',
    'Save & Release Culture Report',
    'Blood Bank',
    'Daily quality control',
    'Lab Reports',
    'Select report',
    'Open &amp; Print Report',
    'Send Report Update',
    'No reports waiting right now. Verified results remain available in the patient record.',
    '⚡ Quick Actions',
    'Focus search and shared bar',
    'Receive and accession',
    'Enter and validate results',
    'Crossmatch and issue',
    'Analyzer status and logs',
    "Select patient / order from Today's worklist or the identification bar to continue the laboratory workflow.",
    'Common Server sync: laboratory orders, validated results and released reports update live.'
  ]) {
    assert.ok(HTML.includes(token), 'Missing lab wording token: ' + token);
  }
});

test('lab dashboard mounts and keeps the shared patient identification bar in sync with the selected lab patient', () => {
  assert.match(FIX, /function masterHeader\(\)/);
  assert.match(FIX, /function currentLabPatient\(\)/);
  assert.match(FIX, /window\.pcLabEngine && typeof window\.pcLabEngine\.getSelectedLabPatient === 'function'/);
  assert.match(FIX, /localStorage\.getItem\('pclinic_lab_selected_patient'\)/);
  assert.match(FIX, /function clearedLabPatient\(\)/);
  assert.match(FIX, /function hideLegacyLabChrome\(\)/);
  assert.match(FIX, /function syncLabSearchUi\(\)/);
  assert.match(FIX, /function notify\(message, tone\)/);
  assert.match(FIX, /function openLabTab\(name\)/);
  assert.match(FIX, /function focusLabSearch\(\)/);
  assert.match(FIX, /function refreshLabQueue\(\)/);
  assert.match(FIX, /function labQuickAction\(action\)/);
  assert.match(FIX, /window\.labQuickAction = labQuickAction/);
  assert.match(FIX, /window\.labRefreshOverviewQueue = function \(\)/);
  assert.match(FIX, /function tagFirstAndTables\(rootId\)/);
  assert.match(FIX, /function applyDoctorParityClasses\(\)/);
  assert.match(FIX, /function queueDoctorParityClasses\(\)/);
  assert.match(FIX, /function wrapLabTabSwitch\(\)/);
  assert.match(FIX, /function ensureSharedLabHeader\(\)/);
  assert.match(FIX, /!window\.pcFile \|\| typeof window\.pcFile\.renderDemoBar !== 'function'/);
  assert.match(FIX, /window\.pcFile\.renderDemoBar\(masterHeader\(\), currentLabPatient\(\) \|\| clearedLabPatient\(\)\)/);
  assert.match(FIX, /tag\(root, 'lab-doctor-body'\)/);
  assert.match(FIX, /tag\(qcKids\[0\], 'lab-doctor-qc-head'\)/);
  assert.match(FIX, /tag\(microKids\[0\], 'lab-doctor-micro-head'\)/);
  assert.match(FIX, /window\.addEventListener\('pcPatientChanged', function \(\) \{ queueSharedLabHeaderSync\(\); queueDoctorParityClasses\(\); \}\)/);
  assert.match(FIX, /window\.addEventListener\('labSelectionChanged', function \(\) \{ queueSharedLabHeaderSync\(\); queueDoctorParityClasses\(\); \}\)/);
  assert.match(FIX, /window\.applyDoctorParityClasses = applyDoctorParityClasses/);
  assert.match(FIX, /window\.ensureSharedLabHeader = ensureSharedLabHeader/);
});
