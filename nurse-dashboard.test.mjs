import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(resolve(ROOT, 'nurse-dashboard.html'), 'utf8');
const FIX = readFileSync(resolve(ROOT, 'nurse-dashboard-fixes.js'), 'utf8');
const CSS = readFileSync(resolve(ROOT, 'nurse-dashboard-doctor.css'), 'utf8');

test('nurse dashboard loads the dedicated fix layer and the doctor-style skin while keeping nurse auth', () => {
  assert.match(HTML, /nurse-dashboard-fixes\.js\?v=20260908_NURSEFIX_NURSEONLYBUTTONS/);
  assert.match(HTML, /nurse-dashboard-doctor\.css\?v=20260907_DOCTORSKIN_MEDLOGRX/);
  assert.match(HTML, /requireAuth\(\['nurse'\]\)/);
  assert.match(HTML, /pclinic-orders\.js/);
  assert.match(HTML, /pclinic-catalog\.js/);
  assert.match(HTML, /pclinic-lab-catalog\.js/);
  assert.match(HTML, /id="pcMasterHeader"/);
  assert.match(HTML, /nurse-doctor-overview/);
  assert.match(HTML, /nurse-overview-main-card/);
  assert.match(HTML, /nurse-overview-side-card/);
  assert.doesNotMatch(HTML, /id="patientCard"/);
  assert.match(CSS, /\.nav-tabs \{/);
  assert.match(CSS, /\.nurse-doctor-overview \{/);
  assert.match(CSS, /\.modal-overlay \{/);
  assert.match(CSS, /\.wtbl,\n\.bill-table \{/);
});

test('the KPI details modal is present and wired for queue, waiting, urgent, seen and CPN due', () => {
  for (const id of ['modalOverlay', 'modalTitle', 'modalBody', 'kpiQueue', 'kpiWaiting', 'kpiUrgent', 'kpiSeen', 'kpiCpnDue']) {
    assert.match(HTML, new RegExp(`id=["']${id}["']`), id + ' missing');
  }
  assert.match(FIX, /buildModalRows\(type\)/);
  for (const type of ['queue', 'waiting', 'urgent', 'seen', 'cpn-due']) {
    assert.match(FIX, new RegExp(`['"]${type}['"]`), type + ' modal type missing');
  }
});

test('triage opens the Vitals page first when vitals are missing, then uses saved vitals without duplicating vital-entry controls', () => {
  for (const id of ['triageVitalsStamp', 'triageVitalsSummary', 'triageSuggestedCategory', 'triageConditionGrid', 'triageFinalPreview', 'saveTriageBtn']) {
    assert.match(HTML, new RegExp(`id=["']${id}["']`), id + ' missing');
  }
  for (const text of ['Active bleeding', 'In active labor', 'Seizure']) {
    assert.match(HTML, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(HTML, /id="triageAirway"/);
  assert.doesNotMatch(HTML, /id="triageBreathing"/);
  assert.doesNotMatch(HTML, /id="triageCirculation"/);
  assert.doesNotMatch(HTML, /id="triageGCS"/);
  assert.doesNotMatch(HTML, /id="triageComplaint"/);
  assert.match(FIX, /function patientHasSavedVitals\(patient\)/);
  assert.match(FIX, /function triageVitalsInterpretation\(patient\)/);
  assert.match(FIX, /function triageAssessment\(patient\)/);
  assert.match(FIX, /function showVitalsRequiredPrompt\(\)/);
  assert.match(FIX, /Vital Signs page opened first/);
  assert.match(FIX, /legacySwitchTab\('vitals', document\.querySelector\('\[data-tab="vitals"\]'\)\)/);
  assert.match(FIX, /showVitalsRequiredPrompt\(\)/);
  assert.match(FIX, /basedOnVitals:/);
  assert.match(FIX, /triageCategory:/);
});

test('CPN panel is now ANC / CPN with maternity fields, file-style layout, history, and preview panes', () => {
  assert.match(HTML, /pclinic-file\.css/);
  for (const id of ['cpnViewFile', 'cpnViewHistory', 'cpnFileGrid', 'cpnDocPreview', 'cpnHistoryList', 'cpnCount', 'cpnVisitNumber', 'cpnPregnancies', 'cpnLmp', 'cpnGestAge', 'cpnEdd', 'cpnRdv', 'cpnTtDose', 'cpnFundalHeight', 'cpnQuickening', 'cpnNotes']) {
    assert.match(HTML, new RegExp(`id=["']${id}["']`), id + ' missing');
  }
  for (const token of ['ANC / CPN File', 'ANC / CPN', 'Number of pregnancy', 'Gestational age', 'Vaccine / tetanus dose given', 'Fundal height', 'Quickening', 'Previous ANC / CPN visits']) {
    assert.match(HTML, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(HTML, /id="cpnSubjective"/);
  assert.doesNotMatch(HTML, /id="cpnObjective"/);
  assert.doesNotMatch(HTML, /id="cpnPlan"/);
  assert.match(CSS, /\.cpn-file-shell/);
  assert.match(CSS, /\.cpn-file-head/);
  assert.match(FIX, /function computeAncFromLmp\(lmp\)/);
  assert.match(FIX, /function syncCpnComputedFields\(patient\)/);
  assert.match(FIX, /function renderCpnDocPreview\(patient\)/);
  assert.match(FIX, /function renderCPNHistory\(patient\)/);
  assert.match(FIX, /function wireCpnPreviewEvents\(\)/);
  assert.match(FIX, /window\.renderCPNHistory = renderCPNHistory/);
  assert.match(FIX, /window\.previewCPNHistory = previewCpnHistory/);
});

test('care plan now uses the doctor OPD file-style layout with live preview, history, and Nursing Note opener', () => {
  for (const id of ['careplanViewFile', 'careplanViewHistory', 'careplanFileGrid', 'careplanWorkPane', 'careplanComposerCard', 'careplanDocPreview', 'careplanAddNewBtn', 'careplanCancelBtn', 'careplanOpenNoteBtn', 'cpPatient', 'cpDateTime', 'cpNurse', 'cpStatus', 'cpBody', 'cpHistoryList', 'cpCount']) {
    assert.match(HTML, new RegExp(`id=["']${id}["']`), id + ' missing');
  }
  for (const legacyId of ['cpProblem', 'cpGoals', 'cpInterventions', 'cpEvalDate']) {
    assert.match(HTML, new RegExp(`id=["']${legacyId}["']`), legacyId + ' compatibility field missing');
  }
  for (const token of ['Nursing Care Plan', 'Active Record', 'History', 'Print', 'Save', 'Care plan context', 'Visit date and time', 'Nurse / Provider', 'Status', 'Nursing care plan', 'New for Today', 'Nursing Care Plan history']) {
    assert.ok(HTML.includes(token), 'Missing care plan token: ' + token);
  }
  assert.match(HTML, /class="pcf-bill-layout cpn-file-shell"/);
  assert.match(HTML, /id="careplanDocPreview"/);
  assert.match(FIX, /function carePlanComposerCard\(\)/);
  assert.match(FIX, /function carePlanDraft\(patient\)/);
  assert.match(FIX, /function renderCarePlanDocPreview\(patient\)/);
  assert.match(FIX, /function previewCarePlanHistory\(recordId\)/);
  assert.match(FIX, /function openNewCarePlan\(\)/);
  assert.match(FIX, /function closeNewCarePlan\(\)/);
  assert.match(FIX, /function carePlanStatusClass\(status\)/);
  assert.match(FIX, /function carePlanSummary\(plan\)/);
  assert.match(FIX, /function updateCarePlanCount\(patient\)/);
  assert.match(FIX, /function renderCarePlanHistory\(patient\)/);
  assert.match(FIX, /function printCarePlanPreview\(\)/);
  assert.match(FIX, /document\.getElementById\('cpBody'\)/);
  assert.match(FIX, /document\.getElementById\('cpDateTime'\)/);
  assert.match(FIX, /appendPatientHistory\('carePlans', entry\)/);
  assert.match(FIX, /source: 'nurse-careplan-simple'/);
  assert.match(FIX, /window\.renderCarePlanHistory = renderCarePlanHistory/);
  assert.match(FIX, /window\.renderCarePlanDocPreview = renderCarePlanDocPreview/);
  assert.match(FIX, /window\.previewCarePlanHistory = previewCarePlanHistory/);
  assert.match(FIX, /window\.openNewCarePlan = openNewCarePlan/);
  assert.match(FIX, /window\.closeNewCarePlan = closeNewCarePlan/);
  assert.match(FIX, /window\.printCarePlanPreview = printCarePlanPreview/);
  assert.match(FIX, /window\.clearCarePlan = clearCarePlan/);
  assert.match(FIX, /function openNursingNoteFromCarePlan\(\)/);
  assert.match(FIX, /window\.openNursingNoteFromCarePlan = openNursingNoteFromCarePlan/);
  assert.match(FIX, /window\.switchTab\('notes', notesBtn\)/);
  assert.match(FIX, /openNewNursingNote\(\)/);
  assert.match(CSS, /#cpHistoryList \.pcf-hrow\.is-selected/);
  assert.match(CSS, /\.notes-simple-status\.active/);
  assert.match(CSS, /\.notes-simple-status\.achieved/);
  assert.match(CSS, /\.notes-simple-status\.discontinued/);
});

test('nursing notes now use the doctor OPD file-style layout with live preview and common-server saving', () => {
  for (const id of ['notesViewFile', 'notesViewHistory', 'notesFileGrid', 'notesWorkPane', 'notesComposerCard', 'notesDocPreview', 'notesAddNewBtn', 'notesCancelBtn', 'notesPatient', 'notesDateTime', 'notesNurse', 'notesStatus', 'notesBody', 'nursingNotesList', 'nursingNoteCount']) {
    assert.match(HTML, new RegExp(`id=["']${id}["']`), id + ' missing');
  }
  for (const oldId of ['notesSubjective', 'notesObjective', 'notesPlan', 'notesEducation', 'notesReview', 'notesWard']) {
    assert.doesNotMatch(HTML, new RegExp(`id=["']${oldId}["']`), oldId + ' should be removed from the notes file page');
  }
  for (const token of ['Nursing Note', 'Active Record', 'History', 'Print', 'Save', 'Nursing note context', 'Visit date and time', 'Nurse / Provider', 'Patient status', 'New for Today', 'Nursing note history']) {
    assert.ok(HTML.includes(token), 'Missing notes token: ' + token);
  }
  assert.match(HTML, /class="pcf-bill-layout cpn-file-shell"/);
  assert.match(HTML, /id="notesDocPreview"/);
  assert.match(FIX, /function notesDraft\(patient\)/);
  assert.match(FIX, /function renderNursingNoteDocPreview\(patient\)/);
  assert.match(FIX, /function previewNursingNoteHistory\(recordId\)/);
  assert.match(FIX, /function openNewNursingNote\(\)/);
  assert.match(FIX, /function closeNewNursingNote\(\)/);
  assert.match(FIX, /function wireNursingNotePreviewEvents\(\)/);
  assert.match(FIX, /function nursingNoteSummary\(note\)/);
  assert.match(FIX, /function renderNursingNotes\(patient\)/);
  assert.match(FIX, /function updateNursingNoteCount\(patient\)/);
  assert.match(FIX, /function printNursingNotePreview\(\)/);
  assert.match(FIX, /document\.getElementById\('notesBody'\)/);
  assert.match(FIX, /appendPatientHistory\('nursingNotes', entry\)/);
  assert.match(FIX, /source: 'nurse-notes-simple'/);
  assert.match(FIX, /Saving nursing note to the Common Server/);
  assert.match(FIX, /window\.renderNursingNoteDocPreview = renderNursingNoteDocPreview/);
  assert.match(FIX, /window\.previewNursingNoteHistory = previewNursingNoteHistory/);
  assert.match(FIX, /window\.printNursingNotePreview = printNursingNotePreview/);
  assert.match(CSS, /#nursingNotesList \.pcf-hrow\.is-selected/);
});

test('medication log now loads doctor prescriptions and records daily administration ticks plus problem comments', () => {
  for (const id of ['medsViewFile', 'medsViewHistory', 'medsPatient', 'medsDate', 'medsNurse', 'medsShift', 'medLogList', 'medRxSourceNote', 'medHistoryList', 'medHistoryCount']) {
    assert.match(HTML, new RegExp(`id=["']${id}["']`), id + ' missing');
  }
  for (const token of ['Medication Administration Log', 'Doctor prescriptions', 'Refresh prescriptions', 'Medication round context', 'Doctor prescriptions from the Common Server appear below', 'Doctor prescriptions to administer', 'Save Medication Log', 'Reload Doctor Prescriptions', 'Medication administration history']) {
    assert.ok(HTML.includes(token), 'Missing med log token: ' + token);
  }
  assert.match(FIX, /function prescriptionRoute\(rx\)/);
  assert.match(FIX, /function prescriptionFrequency\(rx\)/);
  assert.match(FIX, /function normalizeDoctorPrescription\(rx, fallback\)/);
  assert.match(FIX, /function prescriptionFilesForPatient\(patient\)/);
  assert.match(FIX, /function prescriptionsFromFiles\(patient\)/);
  assert.match(FIX, /function activeDoctorPrescriptions\(patient\)/);
  assert.match(FIX, /function medicationDaySlots\(baseDate\)/);
  assert.match(FIX, /function latestMedicationStateMap\(patient, dateStr\)/);
  assert.match(FIX, /function buildMedicationRowHtml\(id, rx, savedState, slots\)/);
  assert.match(FIX, /function renderMedicationLog\(patient\)/);
  assert.match(FIX, /function renderMedicationHistory\(patient\)/);
  assert.match(FIX, /function medicationAdministrationSummary\(med\)/);
  assert.match(FIX, /data-med="route"/);
  assert.match(FIX, /data-med="problem"/);
  assert.match(FIX, /data-med="comment"/);
  assert.match(FIX, /data-med="tick"/);
  assert.match(FIX, /patient && patient\.prescriptions/);
  assert.match(FIX, /window\.pcFile && typeof window\.pcFile\.list === 'function'/);
  assert.match(FIX, /window\.pcFile\.list\(patient\.id, 'prescription'\)/);
  assert.match(FIX, /source: 'prescription-file'/);
  assert.match(FIX, /appendPatientHistory\('medicationLog', entry\)/);
  assert.match(FIX, /source: 'nurse-medication-admin'/);
  assert.match(FIX, /window\.renderMedicationLog = renderMedicationLog/);
  assert.match(FIX, /window\.renderMedicationHistory = renderMedicationHistory/);
  assert.match(FIX, /window\.renderMedHistory = renderMedicationHistory/);
  assert.match(FIX, /window\.updateMedCount = updateMedCount/);
  assert.match(CSS, /\.med-admin-card/);
  assert.match(CSS, /\.med-admin-days/);
  assert.match(CSS, /\.med-admin-problem-grid/);
  assert.match(CSS, /\.med-history-comment/);
});

test('nurse dashboard strips shared non-nurse header and action-bar buttons so nothing there opens doctor or cross-role pages', () => {
  assert.match(FIX, /function isNurseDashboardPage\(\)/);
  assert.match(FIX, /function pruneNurseOnlyControls\(\)/);
  assert.match(FIX, /function observeNurseChrome\(\)/);
  assert.match(FIX, /\['dcBar', 'dcCtx'\]/);
  assert.match(FIX, /\.ab-menu, \.pc-apps-menu, \.pc-patient-menu/);
  assert.match(FIX, /\.btn-summary, \.btn-applications, \.btn-documents, \.btn-system, \.btn-patient, \.btn-nursing, \.btn-alerts, \.btn-info/);
  assert.match(FIX, /left\.innerHTML = '<span class="chk-btn btn-nursing" style="pointer-events:none;cursor:default;opacity:1;">🏥 Nurse Dashboard<\/span>'/);
  assert.match(FIX, /#pc_common_demo_bar \.oc-ward-btn/);
  assert.match(FIX, /pruneNurseOnlyControls\(\);/);
  assert.match(FIX, /observeNurseChrome\(\);/);
});

test('the nurse search and patient-table filtering support name, MRN and patient ID', () => {
  assert.match(FIX, /patientMatchesQuery\(p, query\)/);
  assert.match(FIX, /p && p\.mrn/);
  assert.match(FIX, /p && p\.id/);
  assert.match(FIX, /p && p\.nationalId/);
  assert.match(FIX, /p && p\.phone/);
});

test('selected-patient inputs are clearly synced fields, not fake free-text search boxes', () => {
  assert.match(FIX, /PATIENT_FIELD_IDS = \['triagePatient', 'vitalsPatient', 'cpnPatient', 'fpPatient', 'billPatient', 'labPatient', 'notesPatient', 'medsPatient', 'cpPatient'\]/);
  assert.match(FIX, /el\.readOnly = true/);
  assert.match(FIX, /focusPatientSearch\(\)/);
});

test('nurse patient selection syncs with the shared patient identification bar so only one patient context stays active', () => {
  assert.match(FIX, /function masterHeader\(\) \{[\s\S]*?id = 'pcMasterHeader'/);
  assert.match(FIX, /function syncSharedPatientBar\(patient\)/);
  assert.match(FIX, /localStorage\.setItem\('pclinic_active_patient', String\(patient\.id\)\)/);
  assert.match(FIX, /window\.pcFile && typeof window\.pcFile\.renderDemoBar === 'function'/);
  assert.match(FIX, /window\.dispatchEvent\(new CustomEvent\('pcPatientChanged', \{ detail: patient && !patient\._cleared \? patient : null \}\)\)/);
  assert.match(FIX, /function hideLegacyPatientCard\(\)/);
  assert.match(FIX, /window\.displayPatientCard = function \(\) \{[\s\S]*?hideLegacyPatientCard\(\);/);
  assert.match(FIX, /ti ti-check/, 'Patient list should expose an explicit Select button');
  assert.match(FIX, /keepTab: true/, 'Select button should activate that exact patient without leaving the list');
  assert.match(FIX, /function selectPatient\(id, opts\) \{[\s\S]*?setCurrentPatient\(p\);[\s\S]*?syncSharedPatientBar\(p\);[\s\S]*?refreshPatientUi\(p, !!opts\.quiet\);/, 'Nurse selection must update the global patient bar immediately');
  assert.match(FIX, /window\.addEventListener\('pcPatientChanged', function \(event\) \{[\s\S]*?setCurrentPatient\(fresh\);[\s\S]*?refreshPatientUi\(fresh, true\);[\s\S]*?\} else \{[\s\S]*?setCurrentPatient\(null\);[\s\S]*?hideLegacyPatientCard\(\);/, 'Nurse dashboard must also follow shared-bar patient changes and clear events');
});

test('save actions are async and use the server-confirmed patient update path', () => {
  assert.match(FIX, /async function appendPatientHistory\(fieldName, entry\)/);
  assert.match(FIX, /typeof window\.updatePatient !== 'function'/);
  for (const pair of [
    ['saveVitals', 'vitals'],
    ['saveCPN', 'cpnHistory'],
    ['saveFP', 'fpHistory'],
    ['saveNursingNote', 'nursingNotes'],
    ['saveBill', 'billingHistory'],
    ['saveMedicationLog', 'medicationLog'],
    ['saveCarePlan', 'carePlans'],
    ['saveDelivery', 'deliveries']
  ]) {
    assert.match(FIX, new RegExp(`async function ${pair[0]}\\(`), pair[0] + ' must be async');
    assert.match(FIX, new RegExp(`appendPatientHistory\\('${pair[1]}', entry\\)`), pair[0] + ' must wait for a server-confirmed save path');
  }
  assert.match(FIX, /async function saveTriage\(\)/);
  assert.match(FIX, /window\.updatePatient\(patient\.id, \{[\s\S]*?triage: next,[\s\S]*?priority: assessment\.priority,[\s\S]*?triageLevel: assessment\.level,[\s\S]*?triageColor: assessment\.color,[\s\S]*?triageLabel: assessment\.info\.label,[\s\S]*?triageCategory: triageCategory,[\s\S]*?triagedAt: entry\.timestamp[\s\S]*?\}\)/, 'saveTriage must publish the shared triage category fields for other dashboards');
  assert.match(FIX, /replacePatientHistory\('carePlans', next\)/);
  assert.match(FIX, /replacePatientHistory\('deliveries', next\)/);
});

test('the toast implementation is patched to avoid self-recursion and still delegate to shared toasts when available', () => {
  assert.match(FIX, /function safeToast\(message, type, duration\)/);
  assert.match(FIX, /window\.sharedShowToast/);
  assert.match(FIX, /window\.showToast && window\.showToast !== safeToast/);
  assert.match(FIX, /window\.showToast = safeToast/);
});

test('billing now uses the doctor-style bill layout while keeping the nurse smart catalogue, stock warnings, undo, subtotals, and shared recent bills', () => {
  for (const id of ['billCatalogSearch', 'billCatalogMeta', 'billStockLive', 'billCatalogPreview', 'svcList', 'billKindSwitch', 'billUndoBar', 'billCartWarnings', 'billRows', 'billMedicationSub', 'billConsumableSub', 'billHistoryFilterBar', 'billRecentMeta', 'billList']) {
    assert.match(HTML, new RegExp(`id=["']${id}["']`), id + ' missing');
  }
  for (const token of ['New Bill', 'Create Bill &amp; Send to Cashier', 'Recent Bills', 'Latest common-server bills', 'Click an item to open its details before adding it to the bill', 'Live stock status will appear here']) {
    assert.ok(HTML.includes(token), 'Missing billing token: ' + token);
  }
  assert.match(HTML, /Medications/);
  assert.match(HTML, /Consumables/);
  assert.match(HTML, /<div id="medLogList"><\/div>/);
  assert.match(FIX, /function pharmacyBillingCatalog\(\)/);
  assert.match(FIX, /function billCatalogHost\(\)/);
  assert.match(FIX, /function billStockState\(item, requestedQty\)/);
  assert.match(FIX, /function renderBillCatalogPreview\(key\)/);
  assert.match(FIX, /function openBillItemDetails\(key\)/);
  assert.match(FIX, /function updateBillPreviewWarning\(\)/);
  assert.match(FIX, /function undoRemoveBillRow\(\)/);
  assert.match(FIX, /function recentBillRecords\(\)/);
  assert.match(FIX, /function normalizeBillStatus\(status\)/);
  assert.match(FIX, /function setBillHistoryFilter\(filter, btn\)/);
  assert.match(FIX, /window\.pcBilling && typeof window\.pcBilling\.create === 'function'/);
  assert.match(FIX, /medicationSubtotal:/);
  assert.match(FIX, /consumableSubtotal:/);
  assert.match(FIX, /pcTariff\.byDept\('pharmacy'\)/);
  assert.match(FIX, /localStorage\.getItem\('pclinic_pharmacy_inventory'\)/);
  assert.match(FIX, /function addBillItemFromCatalog\(itemKey, qty\)/);
  assert.match(FIX, /source: 'pharmacy-catalog'/);
  assert.doesNotMatch(FIX, /data-bill="desc"/);
  assert.match(FIX, /ensureMedicationEditorRow\(\)/);
  assert.match(CSS, /\.bill-live-ribbon/);
  assert.match(CSS, /\.bill-catalog-preview/);
  assert.match(CSS, /\.bill-undo-bar/);
  assert.match(CSS, /\.bill-doctor-layout \.bill-page-grid/);
  assert.match(CSS, /\.bill-doctor-layout \.svc-item/);
  assert.match(CSS, /\.badge\.b-pending/);
});

test('family planning no longer preselects a demo method and requires an explicit choice', () => {
  assert.doesNotMatch(HTML, /fp-btn sel/);
  assert.match(FIX, /window\.selectedFpMethod = ''/);
  assert.match(FIX, /Please select a contraceptive method/);
});

test('lab results panel now keeps only the single doctor-style lab result view in nurse while staying read-only and in-place', () => {
  assert.match(HTML, /id="labResultsList"/);
  for (const id of ['labPatient', 'labDate', 'labRequestStatusFilter', 'labRequestCount', 'labRequestsList']) {
    assert.doesNotMatch(HTML, new RegExp(`id=["']${id}["']`), id + ' should be removed');
  }
  for (const token of ['Laboratory — Requests &amp; Verified Results', 'Read-only for the nurse', 'Lab Requests', 'Verified Lab Results', 'Open Cumulative Flow Sheet']) {
    assert.ok(!HTML.includes(token), 'Old lab-shell token should be removed: ' + token);
  }
  assert.match(HTML, /Lab Results/);
  assert.doesNotMatch(HTML, /Haemoglobin<\/div><div class="result-range">13\.0–17\.0 g\/dL/);
  assert.doesNotMatch(HTML, /Potassium<\/div><div class="result-range">3\.5–5\.0 mmol\/L/);
  assert.match(FIX, /function verifiedLabRecords\(patient\)/);
  assert.match(FIX, /function openLabResultsTab\(btn\)/);
  assert.match(FIX, /function openLabResultsFlowSheet\(patient\)/);
  assert.match(FIX, /function nurseLabBuildMatrix\(patient, dateFilter\)/);
  assert.match(FIX, /function nurseLabBuildMicrobiologyReports\(patient, dateFilter\)/);
  assert.match(FIX, /function nurseLabCategories\(\)/);
  assert.match(FIX, /Array\.isArray\(patient\.labResults\)/);
  assert.match(FIX, /localStorage\.getItem\('pclinic_orders'\)/);
  assert.match(FIX, /nurseOcMatrixTable/);
  assert.match(CSS, /\.nurse-lab-results-host/);
  assert.match(CSS, /table\.oc-matrix-table/);
  assert.match(CSS, /\.oc-pending-badge/);
  assert.doesNotMatch(FIX, /window\.open\(/);
  assert.doesNotMatch(FIX, /window\.location\.href = url/);
  assert.match(FIX, /Lab results are shown inside the Nurse dashboard/);
});

test('nursing KPIs are computed from real workflow heuristics, not a hardcoded demo count', () => {
  assert.match(FIX, /function nursingMetrics\(all\)/);
  assert.match(FIX, /function cpnDue\(p\)/);
  assert.match(FIX, /function hasSeenToday\(p\)/);
  assert.match(FIX, /function isUrgentPatient\(p\)/);
  assert.doesNotMatch(HTML, />4<\/span> CPN due/);
});
