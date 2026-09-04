/* ============================================================
   PCLINIC — LAB DASHBOARD LIVE PATCHES
   Removes demo placeholders, adds server-backed QC/pathology/blood bank,
   and exposes a targeted admin cleanup action for template data.
   ============================================================ */
(function () {
    'use strict';

    var PATHOLOGY_FILE_ID = 'lab-pathology-report';
    var BLOODBANK_XMATCH_FILE_ID = 'lab-bloodbank-crossmatch';
    var BLOODBANK_GROUP_FILE_ID = 'lab-bloodbank-grouping';
    var QC_COLLECTION = 'labQcLogs';
    var BLOOD_INVENTORY_COLLECTION = 'bloodBankInventory';
    var qcStateCache = Object.create(null);
    var maintenanceButtonMounted = false;
    var patchInstalled = false;

    function fns() {
        return window.firebaseFunctions || {};
    }

    function dbReady() {
        return !!(window.firebaseDB && window.firebaseFunctions && window.currentStaff);
    }

    function currentStaff() {
        return window.currentStaff || { name: 'Laboratory User', staffId: '', role: '' };
    }

    function selectedPatient() {
        return window.pcLabEngine && typeof window.pcLabEngine.getSelectedLabPatient === 'function'
            ? window.pcLabEngine.getSelectedLabPatient()
            : null;
    }

    function stripMod(v) {
        return String(v == null ? '' : v).replace(/^MOD-/i, '').trim();
    }

    function patientName(patient) {
        if (!patient) return '';
        return patient.name || ((patient.firstName || '') + ' ' + (patient.lastName || '')).trim() || ('Patient ' + stripMod(patient.id));
    }

    function patientMrn(patient) {
        if (!patient) return 'MRN —';
        return 'MRN ' + String(patient.mrn || stripMod(patient.id) || '—');
    }

    function initials(name) {
        var clean = String(name || '').trim();
        if (!clean) return 'LU';
        var bits = clean.split(/\s+/).filter(Boolean).slice(0, 2);
        return bits.map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'LU';
    }

    function todayIso() {
        var d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 10);
    }

    function toLocalDateTimeValue(date) {
        var d = date ? new Date(date) : new Date();
        if (isNaN(d.getTime())) d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function setHtml(id, html) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    function setValue(id, value) {
        var el = document.getElementById(id);
        if (el) el.value = value == null ? '' : String(value);
    }

    function getValue(id) {
        var el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    }

    function showToast(msg, type, duration) {
        if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', duration || 3500);
    }

    function fileRef(patientId, fileId) {
        var doc = fns().doc;
        return doc(window.firebaseDB, 'patients', String(patientId), 'files', fileId);
    }

    function qcDocRef(analyzer) {
        var doc = fns().doc;
        return doc(window.firebaseDB, QC_COLLECTION, 'qc-' + todayIso() + '-' + String(analyzer || 'sysmex'));
    }

    function listLabOrders() {
        if (!window.pcOrders || typeof window.pcOrders.list !== 'function') return [];
        return window.pcOrders.list({ dept: 'lab' }).filter(function (order) {
            return String(order && order.status || '').toLowerCase() !== 'cancelled';
        });
    }

    function orderTimestamp(order) {
        return String(order && (order.orderedAt || order.createdAt || order.updatedAt) || '');
    }

    function orderDateKey(order) {
        var raw = orderTimestamp(order);
        var d = raw ? new Date(raw) : new Date();
        if (isNaN(d.getTime())) d = new Date();
        return d.toISOString().slice(0, 10);
    }

    function groupLabOrders(orders, filterFn) {
        var map = Object.create(null);
        (orders || []).forEach(function (order) {
            if (!order || !order.patientId) return;
            if (typeof filterFn === 'function' && !filterFn(order)) return;
            var patientId = stripMod(order.patientId);
            var key = patientId + '__' + orderDateKey(order);
            if (!map[key]) {
                map[key] = {
                    key: key,
                    patientId: patientId,
                    patientName: order.patientName || ('Patient ' + patientId),
                    orderedAt: orderTimestamp(order),
                    dateStr: orderDateKey(order),
                    priority: String(order.priority || 'routine').toLowerCase(),
                    orders: []
                };
            }
            map[key].orders.push(order);
            var status = String(order.status || 'pending').toLowerCase();
            if (status === 'in-progress') map[key].status = 'in-progress';
            else if (!map[key].status) map[key].status = status;
            if (String(order.priority || '').toLowerCase() === 'stat') map[key].priority = 'stat';
            if (!map[key].orderedAt || new Date(orderTimestamp(order)) < new Date(map[key].orderedAt)) {
                map[key].orderedAt = orderTimestamp(order);
            }
        });
        return Object.keys(map).map(function (key) { return map[key]; });
    }

    function resolveGroup(groupKey, filterFn) {
        var groups = groupLabOrders(listLabOrders(), filterFn);
        for (var i = 0; i < groups.length; i++) {
            if (String(groups[i].key) === String(groupKey)) return groups[i];
        }
        return null;
    }

    function isMicrobiologyOrder(order) {
        return (order.items || []).some(function (item) {
            return /(culture|microbio|gram|afb|acid fast|tb|widal|brucella|sensitivity)/i.test(String(item && item.name || ''));
        });
    }

    function deriveSampleType(group) {
        var items = [];
        (group && group.orders || []).forEach(function (order) {
            (order.items || []).forEach(function (item) { items.push(item || {}); });
        });
        for (var i = 0; i < items.length; i++) {
            if (items[i].sampleType) return String(items[i].sampleType);
        }
        var text = items.map(function (item) { return String(item.name || ''); }).join(' ').toLowerCase();
        if (text.indexOf('urine') !== -1) return 'Urine';
        if (text.indexOf('stool') !== -1) return 'Stool';
        if (text.indexOf('sputum') !== -1) return 'Sputum';
        if (text.indexOf('swab') !== -1) return 'Swab';
        if (text.indexOf('csf') !== -1) return 'CSF';
        if (text.indexOf('blood') !== -1) return 'Blood';
        return '';
    }

    function latestCompletedOrder(group) {
        var completed = (group && group.orders || []).filter(function (order) {
            return String(order.status || '').toLowerCase() === 'completed';
        });
        if (!completed.length) return null;
        completed.sort(function (a, b) {
            return new Date(orderTimestamp(b)).getTime() - new Date(orderTimestamp(a)).getTime();
        });
        return completed[0];
    }

    function updateLiveStaffLabels() {
        var staff = currentStaff();
        setText('labUserName', staff.name || 'Laboratory User');
        setText('labUserInitials', initials(staff.name));
        setText('spec_received_by', (staff.name || 'Laboratory User') + (staff.staffId ? ' • Staff ID ' + staff.staffId : ''));
        setText('rep_verified_by', (staff.name || 'Laboratory User') + (staff.staffId ? ' • Staff ID ' + staff.staffId : ''));
        setText('mic_verified_by', (staff.name || 'Laboratory User') + (staff.staffId ? ' • Staff ID ' + staff.staffId : ''));
        setText('qc_verified_by', (staff.name || 'Laboratory User') + (staff.staffId ? ' • Staff ID ' + staff.staffId : ''));
        if (document.getElementById('bb_performed_by')) {
            setValue('bb_performed_by', staff.name || 'Laboratory User');
        }
        if (document.getElementById('path_pathologist') && !getValue('path_pathologist')) {
            setValue('path_pathologist', staff.name || '');
        }
    }

    function updateScopeNotes() {
        var patient = selectedPatient();
        var note = patient
            ? '👤 Working on selected patient: <strong>' + escapeHtml(patientName(patient)) + '</strong> — ' + escapeHtml(patientMrn(patient)) + ' (all actions are limited to this patient)'
            : '🔒 No patient selected — choose one from the Overview list (✓ Select) or search in the identification bar above';
        ['wlScopeNote', 'resScopeNote', 'repScopeNote', 'pathScopeNote', 'bbScopeNote'].forEach(function (id) {
            setHtml(id, note);
        });
    }

    function primePatientDefaults() {
        var patient = selectedPatient();
        if (!patient) return;
        setValue('path_patient_name', patientName(patient) + ' — ' + patientMrn(patient));
        setValue('bb_xm_patient', patientName(patient) + ' — ' + patientMrn(patient));
        setValue('bb_grp_patient', patientName(patient) + ' — ' + patientMrn(patient));
        if (!getValue('path_case_id')) {
            setValue('path_case_id', 'PATH-' + todayIso().replace(/-/g, '') + '-' + stripMod(patient.id));
        }
        if (!getValue('path_specimen_date')) setValue('path_specimen_date', todayIso());
        if (!getValue('path_report_date')) setValue('path_report_date', todayIso());
        if (!getValue('bb_request_at')) setValue('bb_request_at', toLocalDateTimeValue());
        if (!getValue('bb_required_by')) {
            setValue('bb_required_by', toLocalDateTimeValue(Date.now() + (3 * 60 * 60 * 1000)));
        }
        if (!getValue('bb_issued_at')) setValue('bb_issued_at', toLocalDateTimeValue());
    }

    function populateSpecimenDisplay() {
        var patient = selectedPatient();
        if (!patient) {
            setText('spec_pat_mrn', 'MRN — • No active order selected');
            return;
        }
        var selector = document.getElementById('specSmartPatientSelect');
        if (!selector || !selector.value) return;
        var group = resolveGroup(selector.value);
        if (!group) return;
        setText('spec_pat_name', group.patientName || patientName(patient));
        setText('spec_pat_mrn', patientMrn(patient) + ' • ' + String(group.priority || 'routine').toUpperCase() + ' order');
    }

    function updateReportPreview() {
        var patient = selectedPatient();
        var selector = document.getElementById('repSmartPatientSelect');
        if (!patient || !selector || !selector.value) {
            setText('rep_pat_mrn', 'MRN — • No verified report selected');
            setText('rep_tat_text', 'TAT will appear after a verified report is selected.');
            setText('rep_status_badge', 'Awaiting verified report');
            return;
        }
        var group = resolveGroup(selector.value);
        if (!group) return;
        var firstCompleted = latestCompletedOrder(group);
        var completedAt = firstCompleted && (firstCompleted.completedAt || firstCompleted.updatedAt || firstCompleted.orderedAt);
        var startedAt = firstCompleted && (firstCompleted.accessionedAt || firstCompleted.orderedAt || firstCompleted.createdAt);
        var tat = '';
        if (completedAt && startedAt) {
            var mins = Math.max(1, Math.round((new Date(completedAt) - new Date(startedAt)) / 60000));
            tat = mins + ' min';
        }
        setText('rep_pat_name', group.patientName || patientName(patient));
        setText('rep_pat_mrn', patientMrn(patient) + ' • Verified report');
        setText('rep_tat_text', tat ? ('TAT: ' + tat + ' • Server-confirmed result release') : 'Verified on the common server');
        var badge = document.getElementById('rep_status_badge');
        if (badge) {
            badge.textContent = firstCompleted ? 'Verified on common server' : 'Awaiting verified report';
            badge.style.background = firstCompleted ? '#e9f9ee' : '#f5f5f7';
            badge.style.color = firstCompleted ? '#1a7a32' : '#3a3a3c';
        }
    }

    function updateReportCounters() {
        var groups = groupLabOrders(listLabOrders());
        var awaiting = groups.filter(function (group) {
            return group.status === 'completed';
        }).length;
        var badge = document.getElementById('repAwaitingReleaseBadge');
        if (badge) badge.textContent = awaiting + ' verified report' + (awaiting === 1 ? '' : 's');
        var tab = document.getElementById('labReportsTabCount');
        if (tab) tab.textContent = awaiting;
    }

    function updateKpiSubtext() {
        var groups = groupLabOrders(listLabOrders());
        var pending = groups.filter(function (group) { return group.status === 'pending'; }).length;
        var progress = groups.filter(function (group) { return group.status === 'in-progress'; }).length;
        var verified = groups.filter(function (group) { return group.status === 'completed'; }).length;
        var critical = groups.filter(function (group) { return String(group.priority || '').toLowerCase() === 'stat'; }).length;
        var statOpen = groups.filter(function (group) {
            return String(group.priority || '').toLowerCase() === 'stat' && group.status !== 'completed';
        }).length;
        setText('labSpecimenTabCount', groups.length);
        setText('labWorklistTabCount', pending + progress);
        setText('sc-specimens-sub', groups.length ? 'Live order groups from common server' : 'No live laboratory orders yet');
        setText('sc-pending-sub', (pending + progress) ? ((pending + progress) + ' active request' + ((pending + progress) === 1 ? '' : 's')) : 'No pending laboratory work');
        setText('sc-verified-sub', verified ? (verified + ' server-confirmed result set' + (verified === 1 ? '' : 's')) : 'No verified results yet');
        setText('sc-critical-sub', critical ? (critical + ' STAT / critical order group' + (critical === 1 ? '' : 's')) : 'No critical orders currently flagged');
        setText('sc-stat-sub', statOpen ? (statOpen + ' STAT request' + (statOpen === 1 ? '' : 's') + ' still open') : 'No open STAT requests');
    }

    function neutralizeMicrobiologyInputs(group) {
        var completed = latestCompletedOrder(group);
        var micro = completed && completed.microbiology ? completed.microbiology : null;
        setValue('mic_sample_type', micro && micro.sampleType ? micro.sampleType : deriveSampleType(group));
        setValue('mic_organism', micro && micro.organism ? micro.organism : '');
        setValue('mic_colony_count', micro && micro.colonyCount ? micro.colonyCount : '');
        setValue('mic_incubation_note', micro && micro.incubationNote ? micro.incubationNote : '');
        setValue('mic_date_coll', micro && micro.collectedAt ? String(micro.collectedAt).slice(0, 10) : todayIso());
        setValue('mic_date_rep', micro && micro.reportedAt ? String(micro.reportedAt).slice(0, 10) : todayIso());

        var sensitivities = Object.create(null);
        if (micro && Array.isArray(micro.antibiotics)) {
            micro.antibiotics.forEach(function (row) {
                if (row && row.antibiotic) sensitivities[String(row.antibiotic).trim().toUpperCase()] = row.sensitivity || 'Not Tested (NT)';
            });
        }
        var tbody = document.getElementById('pcLabMicroTable');
        if (!tbody) return;
        Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr) {
            var nameCell = tr.querySelector('td:nth-child(2)');
            if (!nameCell) return;
            var input = nameCell.querySelector('input');
            var label = input ? input.value : nameCell.textContent;
            var key = String(label || '').replace(/✕ Remove/i, '').trim().toUpperCase();
            var select = tr.querySelector('.mic-sens-sel');
            if (select) {
                select.value = sensitivities[key] || 'Not Tested (NT)';
                select.dispatchEvent(new Event('change'));
            }
        });
    }

    async function renderBloodBankInventory() {
        var tbody = document.getElementById('bbInventoryTable');
        if (!tbody) return;
        if (!window.firebaseDB || !window.firebaseFunctions) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#8e8e93;">Connect to Firebase to load blood bank inventory.</td></tr>';
            return;
        }
        try {
            var collection = fns().collection;
            var getDocs = fns().getDocs;
            var snap = await getDocs(collection(window.firebaseDB, BLOOD_INVENTORY_COLLECTION));
            if (!snap.size) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#8e8e93;">No live blood bank inventory records yet.</td></tr>';
                return;
            }
            var rows = [];
            snap.forEach(function (docSnap) {
                var row = docSnap.data() || {};
                rows.push(row);
            });
            rows.sort(function (a, b) {
                return String(a.product || '').localeCompare(String(b.product || '')) || String(a.group || '').localeCompare(String(b.group || ''));
            });
            tbody.innerHTML = rows.map(function (row) {
                var units = Number(row.units || 0);
                var status = row.status || (units <= 1 ? 'Critical — reorder' : units <= 3 ? 'Low — monitor' : 'Adequate');
                var klass = /critical/i.test(status) ? 'b-red' : /low/i.test(status) ? 'b-org' : 'b-grn';
                return '<tr>' +
                    '<td>' + escapeHtml(row.product || 'Unknown product') + '</td>' +
                    '<td>' + escapeHtml(row.group || '—') + '</td>' +
                    '<td style="font-weight:600;">' + escapeHtml(units) + '</td>' +
                    '<td>' + escapeHtml(row.expiry || '—') + '</td>' +
                    '<td><span class="badge ' + klass + '">' + escapeHtml(status) + '</span></td>' +
                    '</tr>';
            }).join('');
        } catch (error) {
            console.error('Blood bank inventory load failed:', error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#8e8e93;">Live blood bank inventory is unavailable right now.</td></tr>';
        }
    }

    function escapeHtml(value) {
        var d = document.createElement('div');
        d.textContent = value == null ? '' : String(value);
        return d.innerHTML;
    }

    function pathologyPayload(status) {
        var patient = selectedPatient();
        if (!patient) throw new Error('Select a patient first.');
        return {
            id: PATHOLOGY_FILE_ID,
            patientId: String(patient.id),
            patientMrn: String(patient.mrn || stripMod(patient.id)),
            patientName: patientName(patient),
            title: 'Pathology Report',
            category: 'pathology',
            status: status,
            formData: {
                caseId: getValue('path_case_id'),
                specimenType: getValue('path_specimen_type'),
                site: getValue('path_site'),
                clinician: getValue('path_clinician'),
                specimenDate: getValue('path_specimen_date'),
                macroscopicExam: getValue('path_macro'),
                microscopicExam: getValue('path_micro'),
                specialStains: getValue('path_stains'),
                immunohistochemistry: getValue('path_ihc'),
                diagnosis: getValue('path_diagnosis'),
                icdoCode: getValue('path_icdo'),
                comment: getValue('path_comment'),
                pathologist: getValue('path_pathologist'),
                reportDate: getValue('path_report_date')
            }
        };
    }

    function applyPathologyPayload(data) {
        var formData = data && data.formData ? data.formData : {};
        setValue('path_case_id', formData.caseId || '');
        setValue('path_specimen_type', formData.specimenType || '');
        setValue('path_site', formData.site || '');
        setValue('path_clinician', formData.clinician || '');
        setValue('path_specimen_date', formData.specimenDate || todayIso());
        setValue('path_macro', formData.macroscopicExam || '');
        setValue('path_micro', formData.microscopicExam || '');
        setValue('path_stains', formData.specialStains || '');
        setValue('path_ihc', formData.immunohistochemistry || '');
        setValue('path_diagnosis', formData.diagnosis || '');
        setValue('path_icdo', formData.icdoCode || '');
        setValue('path_comment', formData.comment || '');
        setValue('path_pathologist', formData.pathologist || currentStaff().name || '');
        setValue('path_report_date', formData.reportDate || todayIso());
    }

    async function loadPathologyDraft() {
        var patient = selectedPatient();
        primePatientDefaults();
        if (!patient || !window.firebaseDB || !window.firebaseFunctions) return;
        try {
            var getDoc = fns().getDoc;
            var snap = await getDoc(fileRef(patient.id, PATHOLOGY_FILE_ID));
            if (snap.exists()) applyPathologyPayload(snap.data());
        } catch (error) {
            console.error('Pathology draft load failed:', error);
        }
    }

    async function savePathology(status) {
        if (!dbReady()) throw new Error('Secure server connection is unavailable.');
        var payload = pathologyPayload(status);
        if (!payload.formData.diagnosis && status === 'final') {
            throw new Error('A final pathology report requires a diagnosis.');
        }
        var setDoc = fns().setDoc;
        var serverTimestamp = fns().serverTimestamp;
        await setDoc(fileRef(payload.patientId, PATHOLOGY_FILE_ID), {
            id: payload.id,
            patientId: payload.patientId,
            title: payload.title,
            category: payload.category,
            status: payload.status,
            patientName: payload.patientName,
            patientMrn: payload.patientMrn,
            formData: payload.formData,
            updatedAt: serverTimestamp(),
            updatedBy: currentStaff().name || 'Laboratory User',
            updatedById: currentStaff().staffId || ''
        }, { merge: true });
        return payload;
    }

    async function savePathologyDraft() {
        try {
            await savePathology('draft');
            showToast('💾 Pathology draft saved on the common server.', 'success');
            return true;
        } catch (error) {
            console.error(error);
            showToast('❌ ' + error.message, 'error');
            return false;
        }
    }

    async function issuePathologyReport() {
        try {
            await savePathology('final');
            showToast('📤 Pathology report issued on the common server.', 'success');
            return true;
        } catch (error) {
            console.error(error);
            showToast('❌ ' + error.message, 'error');
            return false;
        }
    }

    function bloodBankCrossmatchPayload(status) {
        var patient = selectedPatient();
        if (!patient) throw new Error('Select a patient first.');
        return {
            id: BLOODBANK_XMATCH_FILE_ID,
            patientId: String(patient.id),
            patientMrn: String(patient.mrn || stripMod(patient.id)),
            patientName: patientName(patient),
            title: 'Blood Bank Crossmatch',
            category: 'bloodbank',
            status: status,
            formData: {
                requestAt: getValue('bb_request_at'),
                patientGroup: getValue('bb_patient_group'),
                unitsRequested: getValue('bb_units_requested'),
                productType: getValue('bb_product_type'),
                clinicalIndication: getValue('bb_clinical_indication'),
                requestingClinician: getValue('bb_requesting_clinician'),
                requiredBy: getValue('bb_required_by'),
                compatibilityTest: getValue('bb_compatibility_test'),
                donorUnits: getValue('bb_donor_units'),
                performedBy: getValue('bb_performed_by'),
                issuedAt: getValue('bb_issued_at'),
                notes: getValue('bb_notes')
            }
        };
    }

    function applyBloodBankCrossmatch(data) {
        var formData = data && data.formData ? data.formData : {};
        setValue('bb_request_at', formData.requestAt || toLocalDateTimeValue());
        setValue('bb_patient_group', formData.patientGroup || 'Unknown — test first');
        setValue('bb_units_requested', formData.unitsRequested || '');
        setValue('bb_product_type', formData.productType || 'Whole blood');
        setValue('bb_clinical_indication', formData.clinicalIndication || '');
        setValue('bb_requesting_clinician', formData.requestingClinician || '');
        setValue('bb_required_by', formData.requiredBy || toLocalDateTimeValue(Date.now() + (3 * 60 * 60 * 1000)));
        setValue('bb_compatibility_test', formData.compatibilityTest || 'Pending');
        setValue('bb_donor_units', formData.donorUnits || '');
        setValue('bb_performed_by', formData.performedBy || currentStaff().name || '');
        setValue('bb_issued_at', formData.issuedAt || toLocalDateTimeValue());
        setValue('bb_notes', formData.notes || '');
    }

    function bloodGroupPayload() {
        var patient = selectedPatient();
        if (!patient) throw new Error('Select a patient first.');
        return {
            id: BLOODBANK_GROUP_FILE_ID,
            patientId: String(patient.id),
            patientMrn: String(patient.mrn || stripMod(patient.id)),
            patientName: patientName(patient),
            title: 'Blood Grouping',
            category: 'bloodbank',
            status: 'final',
            formData: {
                accession: getValue('bb_group_accession'),
                antiA: getValue('bb_anti_a'),
                antiB: getValue('bb_anti_b'),
                antiD: getValue('bb_anti_d'),
                result: getValue('bb_group_result'),
                comments: getValue('bb_group_comments')
            }
        };
    }

    function applyBloodGroup(data) {
        var formData = data && data.formData ? data.formData : {};
        setValue('bb_group_accession', formData.accession || '');
        setValue('bb_anti_a', formData.antiA || 'Positive (agglutination)');
        setValue('bb_anti_b', formData.antiB || 'Negative');
        setValue('bb_anti_d', formData.antiD || 'Positive (agglutination)');
        setValue('bb_group_result', formData.result || 'O Rh(D) Positive');
        setValue('bb_group_comments', formData.comments || '');
    }

    async function loadBloodBankDrafts() {
        var patient = selectedPatient();
        primePatientDefaults();
        if (!patient || !window.firebaseDB || !window.firebaseFunctions) return;
        try {
            var getDoc = fns().getDoc;
            var crossmatchSnap = await getDoc(fileRef(patient.id, BLOODBANK_XMATCH_FILE_ID));
            if (crossmatchSnap.exists()) applyBloodBankCrossmatch(crossmatchSnap.data());
            var groupingSnap = await getDoc(fileRef(patient.id, BLOODBANK_GROUP_FILE_ID));
            if (groupingSnap.exists()) applyBloodGroup(groupingSnap.data());
        } catch (error) {
            console.error('Blood bank draft load failed:', error);
        }
    }

    async function saveBloodBankRecord(status) {
        if (!dbReady()) throw new Error('Secure server connection is unavailable.');
        var payload = bloodBankCrossmatchPayload(status);
        if (!payload.formData.unitsRequested) throw new Error('Units requested is required.');
        var setDoc = fns().setDoc;
        var serverTimestamp = fns().serverTimestamp;
        await setDoc(fileRef(payload.patientId, BLOODBANK_XMATCH_FILE_ID), {
            id: payload.id,
            patientId: payload.patientId,
            title: payload.title,
            category: payload.category,
            status: payload.status,
            patientName: payload.patientName,
            patientMrn: payload.patientMrn,
            formData: payload.formData,
            updatedAt: serverTimestamp(),
            updatedBy: currentStaff().name || 'Laboratory User',
            updatedById: currentStaff().staffId || ''
        }, { merge: true });
        return payload;
    }

    async function saveBloodBankRequest() {
        try {
            await saveBloodBankRecord('draft');
            showToast('💾 Blood bank request saved on the common server.', 'success');
            return true;
        } catch (error) {
            console.error(error);
            showToast('❌ ' + error.message, 'error');
            return false;
        }
    }

    async function issueBloodUnits() {
        try {
            await saveBloodBankRecord('issued');
            showToast('🩸 Blood unit issue saved on the common server.', 'success');
            return true;
        } catch (error) {
            console.error(error);
            showToast('❌ ' + error.message, 'error');
            return false;
        }
    }

    async function saveBloodGrouping() {
        try {
            if (!dbReady()) throw new Error('Secure server connection is unavailable.');
            var payload = bloodGroupPayload();
            var setDoc = fns().setDoc;
            var serverTimestamp = fns().serverTimestamp;
            await setDoc(fileRef(payload.patientId, BLOODBANK_GROUP_FILE_ID), {
                id: payload.id,
                patientId: payload.patientId,
                title: payload.title,
                category: payload.category,
                status: payload.status,
                patientName: payload.patientName,
                patientMrn: payload.patientMrn,
                formData: payload.formData,
                updatedAt: serverTimestamp(),
                updatedBy: currentStaff().name || 'Laboratory User',
                updatedById: currentStaff().staffId || ''
            }, { merge: true });
            showToast('✅ Blood group saved on the common server.', 'success');
            return true;
        } catch (error) {
            console.error(error);
            showToast('❌ ' + error.message, 'error');
            return false;
        }
    }

    function activeQcAnalyzer() {
        return window.__pcLabActiveQcType || 'sysmex';
    }

    function collectQcRowsFromDom() {
        var tbody = document.getElementById('pcLabQcTable');
        if (!tbody) return [];
        return Array.prototype.map.call(tbody.querySelectorAll('tr'), function (tr) {
            var cells = tr.querySelectorAll('td');
            var input = tr.querySelector('.qc-in-val');
            var statusBadge = tr.querySelector('td:last-child span');
            return {
                name: cells[0] ? cells[0].textContent.trim() : '',
                targetRange: cells[1] ? cells[1].textContent.trim() : '',
                lot: cells[2] ? cells[2].textContent.trim() : '',
                value: input ? String(input.value || '').trim() : '',
                status: statusBadge ? statusBadge.textContent.trim() : 'Awaiting QC entry'
            };
        });
    }

    function applyQcRows(rows) {
        var tbody = document.getElementById('pcLabQcTable');
        if (!tbody) return;
        var renderedRows = tbody.querySelectorAll('tr');
        Array.prototype.forEach.call(renderedRows, function (tr, index) {
            var row = rows[index] || null;
            var input = tr.querySelector('.qc-in-val');
            var statusBadge = tr.querySelector('td:last-child span');
            if (input) input.value = row && row.value ? row.value : '';
            if (statusBadge) {
                statusBadge.textContent = row && row.status ? row.status : 'Awaiting QC entry';
                if (!row || !row.status || /awaiting/i.test(row.status)) {
                    statusBadge.style.background = '#f5f5f7';
                    statusBadge.style.color = '#3a3a3c';
                    statusBadge.style.border = '0.5px solid rgba(0,0,0,0.12)';
                } else if (/maintenance|deviation/i.test(row.status)) {
                    statusBadge.style.background = '#fff4e0';
                    statusBadge.style.color = '#b85d00';
                    statusBadge.style.border = '0.5px solid rgba(255,149,0,0.25)';
                } else {
                    statusBadge.style.background = '#eaf2ff';
                    statusBadge.style.color = '#0071e3';
                    statusBadge.style.border = '0.5px solid rgba(0,113,227,0.25)';
                }
            }
        });
    }

    async function loadQcState(analyzer) {
        if (!window.firebaseDB || !window.firebaseFunctions) {
            applyQcRows([]);
            setText('qc_banner_shift', 'Connect to Firebase to load QC records');
            return;
        }
        try {
            var getDoc = fns().getDoc;
            var snap = await getDoc(qcDocRef(analyzer));
            if (!snap.exists()) {
                qcStateCache[analyzer] = null;
                applyQcRows([]);
                setText('qc_banner_shift', 'Awaiting today\'s QC authorization');
                return;
            }
            var data = snap.data() || {};
            qcStateCache[analyzer] = data;
            applyQcRows(Array.isArray(data.rows) ? data.rows : []);
            if (data.note) {
                setText('qc_banner_shift', 'Maintenance note logged: ' + data.note);
            } else if (data.authorizedAt) {
                setText('qc_banner_shift', 'Authorized ' + String(data.authorizedAt).replace('T', ' ').slice(0, 16) + ' by ' + (data.authorizedBy || 'Laboratory staff'));
            } else {
                setText('qc_banner_shift', 'Live QC record loaded from common server');
            }
        } catch (error) {
            console.error('QC load failed:', error);
            applyQcRows([]);
            setText('qc_banner_shift', 'Unable to load today\'s QC record');
        }
    }

    async function verifyAndAuthorizeQc() {
        try {
            if (!dbReady()) throw new Error('Secure server connection is unavailable.');
            var rows = collectQcRowsFromDom();
            var hasValue = rows.some(function (row) { return !!row.value; });
            if (!hasValue) throw new Error('Enter at least one QC value before authorization.');
            rows = rows.map(function (row) {
                return {
                    name: row.name,
                    targetRange: row.targetRange,
                    lot: row.lot,
                    value: row.value,
                    status: row.value ? 'Authorized — within entered range' : 'Awaiting QC entry'
                };
            });
            var setDoc = fns().setDoc;
            var serverTimestamp = fns().serverTimestamp;
            var analyzer = activeQcAnalyzer();
            await setDoc(qcDocRef(analyzer), {
                id: 'qc-' + todayIso() + '-' + analyzer,
                analyzer: analyzer,
                date: todayIso(),
                status: 'authorized',
                rows: rows,
                authorizedAt: new Date().toISOString(),
                authorizedBy: currentStaff().name || 'Laboratory User',
                authorizedById: currentStaff().staffId || '',
                updatedAt: serverTimestamp()
            }, { merge: true });
            qcStateCache[analyzer] = { rows: rows, authorizedAt: new Date().toISOString(), authorizedBy: currentStaff().name || 'Laboratory User' };
            applyQcRows(rows);
            setText('qc_banner_shift', 'Authorized ' + todayIso() + ' by ' + (currentStaff().name || 'Laboratory User'));
            showToast('✅ Daily Quality Control saved on the common server.', 'success');
            return true;
        } catch (error) {
            console.error('QC save failed:', error);
            showToast('❌ ' + error.message, 'error');
            return false;
        }
    }

    function printQcCertificateModal() {
        var title = document.getElementById('qc_banner_name');
        var printWin = window.open('', '_blank', 'width=750,height=850');
        if (!printWin) return;
        var rows = collectQcRowsFromDom();
        printWin.document.write('<!DOCTYPE html><html><head><title>PClinic • Daily QC Certificate</title>');
        printWin.document.write('<style>*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;padding:30px;color:#1d1d1f}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:10px;text-align:left;font-size:12.5px}th{background:#f5f5f7}.meta{margin:18px 0;font-size:13px}.chip{display:inline-block;border:1px solid #0071e3;color:#0071e3;padding:8px 16px;border-radius:6px;font-weight:800;font-size:11px}</style>');
        printWin.document.write('</head><body>');
        printWin.document.write('<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0071e3;padding-bottom:16px;">');
        printWin.document.write('<div><h2 style="color:#0071e3;font-size:20px;font-weight:800;">PCLINIC • DAILY LABORATORY QUALITY CONTROL</h2><div style="font-size:12px;font-weight:700;">COMMON SERVER CERTIFICATE</div></div>');
        if (window.pcLabEngine && typeof window.pcLabEngine.generateSVGBarcode === 'function') {
            printWin.document.write('<div>' + window.pcLabEngine.generateSVGBarcode('QC-' + todayIso() + '-' + activeQcAnalyzer().toUpperCase()) + '</div>');
        }
        printWin.document.write('</div>');
        printWin.document.write('<div class="meta"><strong>Instrument:</strong> ' + escapeHtml(title ? title.textContent : activeQcAnalyzer()) + ' &nbsp; • &nbsp; <strong>Date:</strong> ' + escapeHtml(todayIso()) + ' &nbsp; • &nbsp; <strong>Authorized by:</strong> ' + escapeHtml(currentStaff().name || 'Laboratory User') + '</div>');
        printWin.document.write('<table><thead><tr><th>Control Parameter</th><th>Target Range</th><th>Lot Number</th><th>Entered Value</th><th>Status</th></tr></thead><tbody>');
        rows.forEach(function (row) {
            printWin.document.write('<tr><td>' + escapeHtml(row.name) + '</td><td>' + escapeHtml(row.targetRange) + '</td><td>' + escapeHtml(row.lot) + '</td><td>' + escapeHtml(row.value || '—') + '</td><td>' + escapeHtml(row.status || 'Awaiting QC entry') + '</td></tr>');
        });
        printWin.document.write('</tbody></table>');
        printWin.document.write('<div style="margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #ccc;padding-top:16px;"><div><strong>Authorized by:</strong> ' + escapeHtml(currentStaff().name || 'Laboratory User') + '</div><div class="chip">PCLINIC CERTIFIED</div></div>');
        printWin.document.write('</body></html>');
        printWin.document.close();
        printWin.focus();
        setTimeout(function () { printWin.print(); }, 250);
    }

    async function reportQcDeviation() {
        var note = window.prompt('Log analyzer maintenance or calibration deviation note:', 'Scheduled calibration verification');
        if (note === null) return false;
        note = String(note || '').trim();
        if (!note) {
            showToast('⚠️ A maintenance note is required.', 'warning');
            return false;
        }
        try {
            if (!dbReady()) throw new Error('Secure server connection is unavailable.');
            var setDoc = fns().setDoc;
            var serverTimestamp = fns().serverTimestamp;
            var analyzer = activeQcAnalyzer();
            await setDoc(qcDocRef(analyzer), {
                id: 'qc-' + todayIso() + '-' + analyzer,
                analyzer: analyzer,
                date: todayIso(),
                status: 'maintenance',
                note: note,
                rows: collectQcRowsFromDom(),
                updatedAt: serverTimestamp(),
                updatedBy: currentStaff().name || 'Laboratory User',
                updatedById: currentStaff().staffId || ''
            }, { merge: true });
            setText('qc_banner_shift', 'Maintenance note logged: ' + note);
            showToast('⚠️ Analyzer maintenance note saved on the common server.', 'warning');
            return true;
        } catch (error) {
            console.error('QC maintenance note failed:', error);
            showToast('❌ ' + error.message, 'error');
            return false;
        }
    }

    async function runTemplateCleanup(dryRun) {
        if (!window.pclinicCloudFunctions || typeof window.pclinicCloudFunctions.call !== 'function') {
            throw new Error('Cloud Functions are unavailable.');
        }
        return window.pclinicCloudFunctions.call('adminPurgeTemplateData', {
            dryRun: dryRun !== false,
            confirm: dryRun === false ? 'PURGE_TEMPLATE_DATA' : ''
        });
    }

    function mountMaintenanceButton() {
        if (maintenanceButtonMounted) return;
        if (!window.currentStaff || window.currentStaff.role !== 'admin') return;
        var host = document.querySelector('.kpis');
        if (!host) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kpi kpi-red';
        btn.style.border = '0.5px dashed rgba(255,59,48,0.45)';
        btn.innerHTML = '<i class="ti ti-broom"></i> Purge template data';
        btn.onclick = async function () {
            try {
                var preview = await runTemplateCleanup(true);
                var total = Number(preview.deletedPatients || 0) + Number(preview.updatedPatients || 0) + Number(preview.deletedOrders || 0) + Number(preview.deletedBills || 0);
                if (!total) {
                    showToast('✅ No matching template/demo records were found on the common server.', 'success', 5000);
                    return;
                }
                var ok = window.confirm(
                    'Targeted cleanup found:\n' +
                    '• Patients to delete: ' + (preview.deletedPatients || 0) + '\n' +
                    '• Patients to scrub: ' + (preview.updatedPatients || 0) + '\n' +
                    '• Orders to delete: ' + (preview.deletedOrders || 0) + '\n' +
                    '• Bills to delete: ' + (preview.deletedBills || 0) + '\n\n' +
                    'Proceed with permanent cleanup?'
                );
                if (!ok) return;
                var result = await runTemplateCleanup(false);
                showToast('🧹 Template/demo cleanup finished: ' + (result.deletedPatients || 0) + ' patients, ' + (result.updatedPatients || 0) + ' scrubbed, ' + (result.deletedOrders || 0) + ' orders, ' + (result.deletedBills || 0) + ' bills.', 'success', 7000);
                if (window.pcLabEngine && typeof window.pcLabEngine.repaint === 'function') window.pcLabEngine.repaint();
            } catch (error) {
                console.error('Template cleanup failed:', error);
                showToast('❌ Template cleanup failed: ' + (error && error.message || error), 'error', 7000);
            }
        };
        host.appendChild(btn);
        maintenanceButtonMounted = true;
    }

    function runPostRepaintRefresh() {
        updateLiveStaffLabels();
        updateScopeNotes();
        primePatientDefaults();
        populateSpecimenDisplay();
        updateReportPreview();
        updateReportCounters();
        updateKpiSubtext();
        renderBloodBankInventory();
        mountMaintenanceButton();
    }

    function refreshMicrobiologyFromSelection() {
        var selector = document.getElementById('micSmartPatientSelect');
        if (!selector || !selector.value) {
            setValue('mic_sample_type', '');
            setValue('mic_organism', '');
            setValue('mic_colony_count', '');
            setValue('mic_incubation_note', '');
            setValue('mic_date_coll', todayIso());
            setValue('mic_date_rep', todayIso());
            var emptyTbody = document.getElementById('pcLabMicroTable');
            if (emptyTbody) {
                Array.prototype.forEach.call(emptyTbody.querySelectorAll('.mic-sens-sel'), function (select) {
                    select.value = 'Not Tested (NT)';
                    select.dispatchEvent(new Event('change'));
                });
            }
            return;
        }
        var group = resolveGroup(selector.value, isMicrobiologyOrder);
        if (!group) return;
        neutralizeMicrobiologyInputs(group);
    }

    function installEnginePatches() {
        if (patchInstalled || !window.pcLabEngine) return false;
        patchInstalled = true;
        window.__pcLabActiveQcType = 'sysmex';
        var engine = window.pcLabEngine;

        var originalRepaint = engine.repaint;
        engine.repaint = function () {
            var result = originalRepaint.apply(this, arguments);
            setTimeout(runPostRepaintRefresh, 0);
            setTimeout(refreshMicrobiologyFromSelection, 0);
            setTimeout(function () { loadQcState(activeQcAnalyzer()); }, 0);
            setTimeout(loadPathologyDraft, 0);
            setTimeout(loadBloodBankDrafts, 0);
            return result;
        };

        var originalSelectSpecimenPatient = engine.selectSpecimenPatient;
        engine.selectSpecimenPatient = function () {
            var result = originalSelectSpecimenPatient.apply(this, arguments);
            setTimeout(populateSpecimenDisplay, 0);
            return result;
        };

        var originalSelectReportPatient = engine.selectReportPatient;
        engine.selectReportPatient = function () {
            var result = originalSelectReportPatient.apply(this, arguments);
            setTimeout(updateReportPreview, 0);
            return result;
        };

        var originalSelectMicrobioPatient = engine.selectMicrobioPatient;
        engine.selectMicrobioPatient = function () {
            var result = originalSelectMicrobioPatient.apply(this, arguments);
            setTimeout(refreshMicrobiologyFromSelection, 0);
            return result;
        };

        var originalPaintMicrobioTable = engine.paintMicrobioTable;
        engine.paintMicrobioTable = function () {
            var result = originalPaintMicrobioTable.apply(this, arguments);
            setTimeout(refreshMicrobiologyFromSelection, 0);
            return result;
        };

        var originalSelectQcAnalyzer = engine.selectQcAnalyzer;
        engine.selectQcAnalyzer = function (type) {
            window.__pcLabActiveQcType = type || 'sysmex';
            var result = originalSelectQcAnalyzer.apply(this, arguments);
            setTimeout(function () { loadQcState(activeQcAnalyzer()); }, 0);
            setTimeout(updateLiveStaffLabels, 0);
            return result;
        };

        var originalPaintQcTable = engine.paintQcTable;
        engine.paintQcTable = function () {
            var result = originalPaintQcTable.apply(this, arguments);
            setTimeout(function () { loadQcState(activeQcAnalyzer()); }, 0);
            return result;
        };

        engine.verifyAndAuthorizeQc = verifyAndAuthorizeQc;
        engine.printQcCertificateModal = printQcCertificateModal;
        engine.reportQcDeviation = reportQcDeviation;
        engine.savePathologyDraft = savePathologyDraft;
        engine.issuePathologyReport = issuePathologyReport;
        engine.saveBloodBankRequest = saveBloodBankRequest;
        engine.issueBloodUnits = issueBloodUnits;
        engine.saveBloodGrouping = saveBloodGrouping;

        window.pcLabMaintenance = {
            purgeTemplateData: runTemplateCleanup,
            loadBloodBankInventory: renderBloodBankInventory,
            loadQcState: loadQcState,
            loadPathologyDraft: loadPathologyDraft,
            loadBloodBankDrafts: loadBloodBankDrafts
        };

        setTimeout(function () {
            runPostRepaintRefresh();
            refreshMicrobiologyFromSelection();
            loadQcState(activeQcAnalyzer());
            loadPathologyDraft();
            loadBloodBankDrafts();
        }, 0);
        return true;
    }

    function boot() {
        if (installEnginePatches()) return;
        setTimeout(boot, 120);
    }

    document.addEventListener('DOMContentLoaded', function () {
        updateLiveStaffLabels();
        updateScopeNotes();
        primePatientDefaults();
        refreshMicrobiologyFromSelection();
        boot();
    });

    window.addEventListener('pclinicStaffReady', function () {
        updateLiveStaffLabels();
        mountMaintenanceButton();
        runPostRepaintRefresh();
        loadQcState(activeQcAnalyzer());
        loadPathologyDraft();
        loadBloodBankDrafts();
    });
})();
