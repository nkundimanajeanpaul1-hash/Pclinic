(function () {
        'use strict';

        const views = ['overview', 'request', 'worklist', 'viewer', 'report', 'signed'];
        let currentPatient = null;
        let currentOrder = null;
        let currentReport = null;
        let requestedPatientId = '';
        let radiologyState = { ready: false, orders: [], reports: [], addenda: [], alerts: [], error: null };
        let unsubscribeRadiology = null;

        function notify(message, type, duration) {
            const fn = window.sharedShowToast || window.showToast;
            if (typeof fn === 'function') fn(String(message || ''), type || 'info', duration || 3500);
            else console.log(message);
        }

        function text(id, value) {
            const element = document.getElementById(id);
            if (element) element.textContent = String(value == null ? '' : value);
        }

        function value(id, next) {
            const element = document.getElementById(id);
            if (element) element.value = String(next == null ? '' : next);
        }

        function timestampMillis(input) {
            if (!input) return 0;
            if (typeof input.toMillis === 'function') return input.toMillis();
            if (input.seconds) return input.seconds * 1000;
            const result = new Date(input).getTime();
            return Number.isFinite(result) ? result : 0;
        }

        function formatDateTime(input) {
            const milliseconds = timestampMillis(input);
            return milliseconds ? new Date(milliseconds).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '—';
        }

        function timeAgo(input) {
            const seconds = Math.floor((Date.now() - timestampMillis(input)) / 1000);
            if (!Number.isFinite(seconds) || seconds < 0) return '—';
            if (seconds < 60) return 'just now';
            if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
            if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
            return formatDateTime(input);
        }

        function nameOf(patient) {
            if (!patient) return 'Patient';
            return String(patient.name || ((patient.firstName || '') + ' ' + (patient.lastName || '')).trim() || ('Patient ' + (patient.mrn || patient.id || '')));
        }

        function findPatient(id) {
            if (id == null || id === '') return null;
            let list = [];
            try { if (typeof window.getPatients === 'function') list = window.getPatients() || []; } catch (error) {}
            return list.find(function (patient) {
                return String(patient.id) === String(id) || String(patient.mrn) === String(id);
            }) || null;
        }

        function modalityOf(order) {
            const source = ((order && order.items) || []).map(function (item) { return item.name || ''; }).join(' ').toLowerCase();
            if (source.includes('mri')) return 'MRI';
            if (source.includes('ct')) return 'CT';
            if (source.includes('ultrasound') || source.includes('doppler')) return 'Ultrasound';
            if (source.includes('mammo')) return 'Mammography';
            if (source.includes('x-ray') || source.includes('xray') || source.includes('radiograph')) return 'X-Ray';
            return 'Imaging';
        }

        function studyOf(order) {
            return ((order && order.items) || []).map(function (item) { return item.name || ''; }).filter(Boolean).join(', ') || 'Imaging study';
        }

        function stateOf(order) {
            return window.pcRadiology ? window.pcRadiology.stateOf(order) : 'pending';
        }

        function activeOrders() {
            return radiologyState.orders.filter(function (order) {
                return ['pending', 'in-progress', 'acquired', 'reporting'].includes(stateOf(order));
            });
        }

        function isToday(input) {
            const milliseconds = timestampMillis(input);
            if (!milliseconds) return false;
            const date = new Date(milliseconds);
            const now = new Date();
            return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
        }

        /* ONE patient, ONE truth.
           setActivePatient() is the only place the selected patient changes.
           It writes, in the same tick: the module state, window.currentPatient,
           the identification bar (name / DOB / MRN / IDs), the action-bar chip,
           and the stored id (session + local, the identification bar restores
           from local). Every other entry point — picker, worklist row, search
           box, the identification bar's own Find/Clear, URL ?patient= — ends
           here, so the bar can never show one patient while another is selected. */
        function writeIdentificationBar(patient) {
            if (!(window.pcFile && typeof window.pcFile.renderDemoBar === 'function')) return;
            var master = document.getElementById('pcMasterHeader') || document.body;
            var payload = patient || { _cleared: true, id: '', mrn: '', lastName: '', firstName: '', nationalId: '', department: '', dob: '', gender: '', archiveCode: '' };
            try { window.pcFile.renderDemoBar(master, payload); } catch (error) { console.warn('identification bar not updated:', error); }
            // renderDemoBar rebuilds the header strip; the action bar must stay
            // directly beneath it, so let the bar module re-anchor and relock.
            if (window.pcRadioBar && window.pcRadioBar.refresh) { try { window.pcRadioBar.refresh(patient || null); } catch (error) {} }
        }

        function setActivePatient(patient) {
            var next = patient && patient.id ? patient : null;
            var changed = String(currentPatient && currentPatient.id || '') !== String(next && next.id || '');
            currentPatient = next;
            window.currentPatient = currentPatient;
            window.__pcRadioSelectedPatient = currentPatient;
            try {
                if (next) { sessionStorage.setItem('pclinic_active_patient', String(next.id)); localStorage.setItem('pclinic_active_patient', String(next.id)); }
                else { sessionStorage.removeItem('pclinic_active_patient'); localStorage.removeItem('pclinic_active_patient'); }
            } catch (error) {}
            // A different patient invalidates the study/report that belonged to the old one.
            if (changed) { currentOrder = null; currentReport = null; }
            writeIdentificationBar(currentPatient);
            window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: currentPatient }));
            if (window.pcRadioBar && window.pcRadioBar.setPatient) window.pcRadioBar.setPatient(currentPatient);
            fillRequestDefaults();
            if (changed) { highlightSelectedStudy(); announceStudyCount(); syncActionBarContext(); }
            if (!currentPatient) showGateLock(true); else showGateLock(false);
        }

        /* Hard gate: nothing patient-related runs without a patient in the
           identification bar. Returns the patient or null (after explaining). */
        function requirePatient(what) {
            if (currentPatient && currentPatient.id) return currentPatient;
            notify('🔒 Select a patient first' + (what ? ' — ' + what + ' works on the patient shown in the identification bar.' : '.'), 'warning', 6000);
            showGateLock(true);
            return null;
        }

        function updateViewerContext() {
            if (currentOrder && currentPatient) {
                text('viewerHead', nameOf(currentPatient) + ' · ' + studyOf(currentOrder));
                text('viewerBadge', modalityOf(currentOrder) + ' · PACS required');
            } else if (currentPatient) {
                text('viewerHead', nameOf(currentPatient) + ' · no study selected');
                text('viewerBadge', 'PACS not configured');
            } else {
                text('viewerHead', 'PACS not configured');
                text('viewerBadge', 'Configuration required');
            }
        }

        function switchView(element, name) {
            if (!views.includes(name)) name = 'overview';
            // "request" is the read-only policy page (it even offers "Select patient"), so it stays open.
            if ((name === 'report' || name === 'viewer') && !requirePatient(name === 'report' ? 'The report writer' : 'The image viewer')) {
                name = 'overview';
                element = document.querySelector('#dcBar [data-rad-view="overview"]');
            } else if (name === 'report' && !currentOrder) {
                notify('Select an acquired study from the worklist before opening the report writer.', 'warning');
                name = 'worklist';
                element = document.querySelector('#dcBar [data-rad-view="worklist"]');
            }
            if (element && element.classList && element.classList.contains('t1tab')) element.classList.add('active');
            document.querySelectorAll('#dcBar [data-rad-view]').forEach(function (control) {
                control.classList.toggle('ab-active', control.getAttribute('data-rad-view') === name);
            });
            views.forEach(function (viewName) {
                const view = document.getElementById('v-' + viewName);
                if (view) view.style.display = viewName === name ? 'block' : 'none';
            });
            if (name === 'overview') renderAll();
            if (name === 'worklist') renderWorklist();
            if (name === 'viewer') updateViewerContext();
            renderSecondaryNavigation(name);
            showGateLock(!currentPatient);
        }
        window.switchView = switchView;

        function renderSecondaryNavigation(name) {
            const labels = {
                overview: ['Dashboard'], request: ['Request policy'], worklist: ['Live queue'],
                viewer: ['PACS configuration'], report: ['Report writer'], signed: ['Reports and drafts']
            };
            const host = document.getElementById('tb2');
            if (!host) return;
            host.replaceChildren();
            (labels[name] || []).forEach(function (label) {
                const item = document.createElement('div');
                item.className = 't2tab active';
                item.textContent = label;
                host.appendChild(item);
            });
        }

        function selectModality(element) {
            document.querySelectorAll('.mod-card').forEach(function (card) { card.classList.remove('sel'); });
            if (element) element.classList.add('sel');
        }
        window.selectModality = selectModality;

        function addCustomStudy() {
            notify('Radiology-side request creation is disabled. Add studies to the approved catalogue through Administration.', 'warning');
        }
        window.addCustomStudy = addCustomStudy;

        function submitRequest() {
            notify('Imaging requests must be created by an authorized clinical workflow.', 'warning');
        }
        window.submitRequest = submitRequest;

        async function transitionOrder(orderId, action) {
            const order = window.pcRadiology && window.pcRadiology.orderById(orderId);
            if (!order) { notify('Order not found.', 'error'); return; }
            // Acting on a study selects its patient: the identification bar must
            // show who this Start/Acquire/Cancel is for before it happens.
            selectStudy(order);
            if (!requirePatient('This study action')) return;
            if (String(order.patientId) !== String(currentPatient.id) && String(order.patientId) !== String(currentPatient.mrn || '\u0000')) {
                notify('Patient/order mismatch — the identification bar shows a different patient. Action blocked.', 'error', 7000); return;
            }
            let reason = '';
            if (action === 'cancel') {
                reason = window.prompt('Reason for cancelling this imaging request?') || '';
                if (!reason.trim()) return;
            }
            try {
                await window.pcRadiology.transition(orderId, action, reason);
                notify(action === 'start' ? 'Study marked in progress.' : action === 'acquire' ? 'Acquisition completed. Report writing is now available.' : 'Request cancelled.', action === 'cancel' ? 'warning' : 'success');
            } catch (error) {
                console.error(error);
                notify((error && error.message) || 'The order transition failed.', 'error', 7000);
            }
        }

        function button(label, className, handler) {
            const control = document.createElement('button');
            control.type = 'button';
            control.className = className || 'btn-s';
            control.textContent = label;
            control.addEventListener('click', function (event) {
                event.stopPropagation();
                handler(control);
            });
            return control;
        }

        function renderWorklist() {
            const body = document.getElementById('worklistBody');
            if (!body) return;
            const modalityFilter = String((document.getElementById('worklistModality') || {}).value || 'all').toLowerCase();
            const priorityFilter = String((document.getElementById('worklistPriority') || {}).value || 'all').toLowerCase();
            const rank = { stat: 0, urgent: 1, routine: 2 };
            const orders = activeOrders().filter(function (order) {
                return (modalityFilter === 'all' || modalityOf(order).toLowerCase() === modalityFilter) &&
                    (priorityFilter === 'all' || String(order.priority || 'routine').toLowerCase() === priorityFilter);
            }).sort(function (a, b) {
                const stateRank = { pending: 0, 'in-progress': 1, acquired: 2, reporting: 3 };
                const stateDifference = (stateRank[stateOf(a)] || 0) - (stateRank[stateOf(b)] || 0);
                if (stateDifference) return stateDifference;
                const priorityDifference = (rank[String(a.priority).toLowerCase()] ?? 2) - (rank[String(b.priority).toLowerCase()] ?? 2);
                return priorityDifference || timestampMillis(a.orderedAt) - timestampMillis(b.orderedAt);
            });
            body.replaceChildren();
            if (!orders.length) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 6;
                cell.style.cssText = 'text-align:center;padding:28px;color:var(--t3)';
                cell.textContent = radiologyState.error ? 'Radiology queue unavailable. Check Firebase permissions and connection.' : 'No active imaging requests.';
                row.appendChild(cell); body.appendChild(row); return;
            }
            announceStudyCount();
            highlightSelectedStudy();
            orders.forEach(function (order) {
                const row = document.createElement('tr');
                const state = stateOf(order);
                const cells = [
                    (order.patientName || 'Patient') + ' · ID ' + String(order.patientId || ''),
                    studyOf(order),
                    String(order.priority || 'routine').toUpperCase(),
                    (order.orderedBy || '—') + ' · ' + timeAgo(order.orderedAt),
                    state.replace('-', ' ')
                ];
                cells.forEach(function (content) { const cell = document.createElement('td'); cell.textContent = content; row.appendChild(cell); });
                const actions = document.createElement('td'); actions.style.whiteSpace = 'nowrap';
                if (state === 'pending') actions.appendChild(button('Start study', 'btn-s', function () { transitionOrder(order.id, 'start'); }));
                if (state === 'in-progress') actions.appendChild(button('Mark acquired', 'btn-p', function () { transitionOrder(order.id, 'acquire'); }));
                if (state === 'acquired' || state === 'reporting') actions.appendChild(button(state === 'reporting' ? 'Continue report' : 'Write report', 'btn-p', function () { openReportFor(order); }));
                actions.appendChild(button('Images', 'btn-s', function () { openMediaSheet(order); }));
                actions.appendChild(button('Cancel', 'btn-s', function () { transitionOrder(order.id, 'cancel'); }));
                row.appendChild(actions);
                // Selecting a study IS selecting its patient: the bar used to update
                // only from the picker, so it could sit on "No patient selected" while
                // a row was plainly in front of you. One handler only — the signed
                // table has its own, and re-rendering here would rebuild this row mid-click.
                row.dataset.studyId = String(order.id);
                row.style.cursor = 'pointer';
                row.addEventListener('click', function () {
                    selectStudy(order);
                });
                row.addEventListener('dblclick', function () {
                    if (state === 'acquired' || state === 'reporting') openReportFor(order);
                });
                body.appendChild(row);
            });
        }

        function filterWorklist() {
            renderWorklist();
        }
        window.filterWorklist = filterWorklist;

        function resetReportForm() {
            ['findingsText', 'impressionText', 'rptComparison', 'rptRecommend', 'rptNotifiedTo'].forEach(function (id) { value(id, ''); });
            const critical = document.getElementById('rptCritical');
            if (critical) critical.checked = false;
            const criticalBox = document.getElementById('criticalBox');
            if (criticalBox) criticalBox.style.display = 'none';
            value('reportStatus', 'draft');
        }

        function fillReportForm(report) {
            if (!report) return;
            value('findingsText', report.findings || '');
            value('impressionText', report.impression || '');
            value('rptComparison', report.comparison || '');
            value('rptRecommend', report.recommendation || '');
            value('rptNotifiedTo', report.criticalNotification && report.criticalNotification.notifiedTo || '');
            const critical = document.getElementById('rptCritical');
            if (critical) critical.checked = report.critical === true;
            const criticalBox = document.getElementById('criticalBox');
            if (criticalBox) criticalBox.style.display = report.critical ? 'flex' : 'none';
            value('reportStatus', report.status === 'final' ? 'final' : 'draft');
        }

        function openReportFor(order) {
            if (!order) return;
            const patient = findPatient(order.patientId);
            if (!patient) {
                currentOrder = null; currentReport = null; setActivePatient(null);
                notify('The order patient could not be loaded. The report writer was not opened.', 'error', 7000);
                return;
            }
            if (String(patient.id) !== String(order.patientId) && String(patient.mrn) !== String(order.patientId)) {
                notify('Patient/order mismatch. Reporting is blocked.', 'error', 7000); return;
            }
            const state = stateOf(order);
            if (!['acquired', 'reporting', 'reported'].includes(state)) {
                notify('Complete image acquisition before writing the report.', 'warning'); return;
            }
            setActivePatient(patient);   // identification bar first …
            currentOrder = order;         // … then the study that belongs to it
            currentReport = window.pcRadiology.reportForOrder(order.id);
            if (currentReport && currentReport.status === 'final') {
                printReportFile(currentReport.id);
                return;
            }
            resetReportForm();
            fillReportForm(currentReport);
            text('rptHead', studyOf(order));
            value('rptPatient', nameOf(patient) + ' — MRN ' + String(patient.mrn || patient.id));
            value('rptAcc', order.id || '');
            value('rptModStudy', studyOf(order));
            value('rptDate', order.acquisitionCompletedAt ? new Date(timestampMillis(order.acquisitionCompletedAt)).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
            value('rptClinician', order.orderedBy || '');
            value('rptIndication', order.notes || '');
            value('rptRadiologist', window.currentStaff && window.currentStaff.name || 'Radiologist');
            const local = new Date(); local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
            value('rptDateTime', local.toISOString().slice(0, 16));
            const mediaHost = document.getElementById('rptMediaHost');
            if (mediaHost) { mediaHost.replaceChildren(); mediaHost.appendChild(buildMediaBlock(order, true)); }
            syncActionBarContext();
            switchView(document.querySelector('#dcBar [data-rad-view="report"]'), 'report');
        }
        window.openReportFor = openReportFor;

        /* Bring an order to a state that can carry a report ('acquired' or
           later) without making the radiographer click through Start/Mark
           acquired first — filing images and a result together is exactly
           what "acquire" means, and the backend is idempotent about it. */
        async function ensureAcquiredForReporting(order) {
            const state = stateOf(order);
            if (state === 'pending') {
                await window.pcRadiology.transition(order.id, 'start');
                await window.pcRadiology.transition(order.id, 'acquire');
                return 'acquired';
            }
            if (state === 'in-progress') {
                await window.pcRadiology.transition(order.id, 'acquire');
                return 'acquired';
            }
            return state;
        }

        /* Single entry point for "Add radiology result": upload images and
           write the report on the same page, for any open study regardless
           of where it currently sits in the workflow. */
        async function openRadiologyResult(order, patient) {
            if (!order) { notify('Select a study first.', 'warning'); return; }
            let nextState;
            try {
                nextState = await ensureAcquiredForReporting(order);
            } catch (error) {
                console.error(error);
                notify((error && error.message) || 'Could not prepare this study for reporting.', 'error', 7000);
                return;
            }
            // The transition just committed on the server; don't wait on the
            // Firestore listener to echo it back before opening the report —
            // stamp the state we know is now true onto the order we already have.
            const live = (window.pcRadiology && window.pcRadiology.orderById(order.id)) || order;
            const ready = Object.assign({}, live, { radiologyState: nextState });
            openReportFor(ready);
        }
        window.openRadiologyResult = openRadiologyResult;

        function collectReport() {
            if (!currentPatient) throw new Error('🔒 No patient in the identification bar. Select the patient first.');
            if (!currentOrder) throw new Error('Select an acquired imaging order first.');
            if (String(currentOrder.patientId) !== String(currentPatient.id) && String(currentOrder.patientId) !== String(currentPatient.mrn)) {
                throw new Error('Patient/order mismatch. Reporting is blocked.');
            }
            return {
                patientId: String(currentOrder.patientId),
                study: studyOf(currentOrder),
                modality: modalityOf(currentOrder),
                studyDate: String((document.getElementById('rptDate') || {}).value || ''),
                indication: String((document.getElementById('rptIndication') || {}).value || '').trim(),
                comparison: String((document.getElementById('rptComparison') || {}).value || '').trim(),
                findings: String((document.getElementById('findingsText') || {}).value || '').trim(),
                impression: String((document.getElementById('impressionText') || {}).value || '').trim(),
                recommendation: String((document.getElementById('rptRecommend') || {}).value || '').trim(),
                critical: Boolean((document.getElementById('rptCritical') || {}).checked),
                notifiedTo: String((document.getElementById('rptNotifiedTo') || {}).value || '').trim()
            };
        }

        function setReportBusy(busy) {
            document.querySelectorAll('#v-report .fa button').forEach(function (control) { control.disabled = busy; });
        }

        async function saveReport(isDraft) {
            let report;
            try { report = collectReport(); }
            catch (error) { notify(error.message, 'error'); return; }
            if (isDraft) value('reportStatus', 'draft');
            if (!isDraft) {
                if (!report.findings) { notify('Findings are required before final signing.', 'warning'); return; }
                if (!report.impression) { notify('Impression is required before final signing.', 'warning'); return; }
                if (report.critical && !report.notifiedTo) { notify('Record who received the verbal critical-result notification.', 'warning'); return; }
                value('reportStatus', 'final');
            }
            setReportBusy(true);
            try {
                const result = isDraft
                    ? await window.pcRadiology.saveDraft(currentOrder.id, report)
                    : await window.pcRadiology.finalize(currentOrder.id, report);
                currentReport = Object.assign({}, report, { id: result.reportId, orderId: currentOrder.id, status: isDraft ? 'draft' : 'final' });
                syncActionBarContext();
                notify(isDraft ? 'Draft saved securely to the Common Server.' : 'Final report signed, order completed and clinician notified.', 'success', 6000);
                if (!isDraft) switchView(document.querySelector('#dcBar [data-rad-view="signed"]'), 'signed');
            } catch (error) {
                console.error(error);
                notify((error && error.message) || 'Report save failed. Nothing was finalised.', 'error', 8000);
            } finally {
                setReportBusy(false);
            }
        }
        window.saveReport = saveReport;

        function signReport() {
            value('reportStatus', 'final');
            saveReport(false);
        }
        window.signReport = signReport;

        async function addAddendum(reportId) {
            const rep = window.pcRadiology && window.pcRadiology.reportById(reportId);
            if (rep) { const owner = findPatient(rep.patientId) || { id: String(rep.patientId), mrn: String(rep.patientMrn || rep.patientId), name: rep.patientName || '' }; if (!currentPatient || String(currentPatient.id) !== String(owner.id)) setActivePatient(owner); }
            if (!requirePatient('An addendum')) return;
            const reason = window.prompt('Reason for this addendum?');
            if (!reason || !reason.trim()) return;
            const addendum = window.prompt('Addendum text:');
            if (!addendum || !addendum.trim()) return;
            try {
                await window.pcRadiology.addAddendum(reportId, addendum, reason);
                notify('Signed addendum created and the requesting clinician was notified.', 'success');
            } catch (error) {
                notify((error && error.message) || 'Addendum creation failed.', 'error', 7000);
            }
        }

        function renderRecent() {
            const body = document.getElementById('recentBody');
            if (!body) return;
            body.replaceChildren();
            const orders = radiologyState.orders.slice(0, 8);
            if (!orders.length) {
                const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 7;
                cell.style.cssText = 'text-align:center;padding:20px;color:var(--t3)'; cell.textContent = 'No imaging requests yet.';
                row.appendChild(cell); body.appendChild(row); return;
            }
            orders.forEach(function (order) {
                const row = document.createElement('tr');
                [order.id, (order.patientName || 'Patient') + ' · ' + String(order.patientId || ''), modalityOf(order), studyOf(order), timeAgo(order.orderedAt), String(order.priority || 'routine').toUpperCase(), stateOf(order)].forEach(function (content) {
                    const cell = document.createElement('td'); cell.textContent = String(content || '—'); row.appendChild(cell);
                });
                row.style.cursor = 'pointer';
                row.addEventListener('click', function () {
                    const state = stateOf(order);
                    if (state === 'acquired' || state === 'reporting' || state === 'reported') openReportFor(order);
                    else notify('Use the worklist actions to progress this study.', 'info');
                });
                body.appendChild(row);
            });
        }

        function renderReports() {
            const body = document.getElementById('signedBody');
            if (!body) return;
            body.replaceChildren();
            if (!radiologyState.reports.length) {
                const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 8;
                cell.style.cssText = 'text-align:center;padding:20px;color:var(--t3)'; cell.textContent = 'No radiology reports have been saved.';
                row.appendChild(cell); body.appendChild(row); return;
            }
            radiologyState.reports.forEach(function (report) {
                const row = document.createElement('tr');
                const signed = report.status === 'final';
                [report.orderId || report.id, report.patientName || ('Patient ' + report.patientId), report.modality || 'Imaging', report.study || 'Study', signed ? formatDateTime(report.signedAt) : formatDateTime(report.updatedAt), signed ? report.signedByName : report.updatedByName, signed ? (report.critical ? 'Critical final' : 'Final') : 'Draft'].forEach(function (content) {
                    const cell = document.createElement('td'); cell.textContent = String(content || '—'); row.appendChild(cell);
                });
                const actions = document.createElement('td');
                if (signed) {
                    actions.appendChild(button('PDF', 'btn-s', function () { printReportFile(report.id); }));
                    actions.appendChild(button('Addendum', 'btn-s', function () { addAddendum(report.id); }));
                } else {
                    actions.appendChild(button('Continue', 'btn-p', function () {
                        const order = window.pcRadiology.orderById(report.orderId);
                        if (order) openReportFor(order); else notify('The linked order is unavailable.', 'error');
                    }));
                }
                row.appendChild(actions); body.appendChild(row);
            });
        }

        function updateKPIs() {
            const active = activeOrders();
            const pending = active.filter(function (order) { return stateOf(order) === 'pending'; });
            const stat = active.filter(function (order) { return String(order.priority).toLowerCase() === 'stat'; });
            const reportedToday = radiologyState.reports.filter(function (report) { return report.status === 'final' && isToday(report.signedAt); });
            const draftCount = radiologyState.reports.filter(function (report) { return report.status === 'draft'; }).length;
            const unacknowledgedCritical = radiologyState.alerts.filter(function (alert) { return alert.acknowledged !== true; });
            const studiesToday = radiologyState.orders.filter(function (order) { return isToday(order.acquisitionStartedAt || order.orderedAt); }).length;
            text('stStudies', studiesToday); text('stStudiesSub', 'Server-confirmed studies');
            text('stPending', pending.length); text('stPendingSub', pending.length ? ('Oldest: ' + timeAgo(pending[pending.length - 1].orderedAt)) : 'Queue clear');
            text('stReported', reportedToday.length); text('stReportedSub', 'Final reports today');
            text('stCritical', unacknowledgedCritical.length); text('stCriticalSub', unacknowledgedCritical.length ? 'Awaiting clinician acknowledgment' : 'None outstanding');
            text('stStat', stat.length); text('stStatSub', stat.length ? 'Active STAT queue' : 'None');
            text('kpiPendingN', pending.length + ' pending'); text('kpiStatN', stat.length + ' STAT');
            text('kpiUnsignedN', draftCount + ' drafts'); text('kpiDoneN', reportedToday.length + ' reported today');
            text('radBarWorkCnt', active.length); text('radBarSignedCnt', draftCount);
            const alertCount = active.length + draftCount + unacknowledgedCritical.length;
            text('radBarAlertCnt', alertCount);
            const workBadge = document.getElementById('radBarWorkCnt'); if (workBadge) workBadge.style.display = 'inline-flex';
            const signedBadge = document.getElementById('radBarSignedCnt'); if (signedBadge) signedBadge.style.display = 'inline-flex';
            const alertBadge = document.getElementById('radBarAlertCnt'); if (alertBadge) alertBadge.style.display = alertCount ? 'inline-flex' : 'none';
            text('signedAwait', draftCount + ' drafts awaiting signature');
        }

        function syncActionBarContext() {
            const reportButton = document.querySelector('#dcBar [data-rad-view="report"]');
            const reportReady = Boolean(currentPatient && currentOrder && ['acquired', 'reporting'].includes(stateOf(currentOrder)));
            if (reportButton) {
                reportButton.classList.toggle('ab-context-off', !reportReady);
                reportButton.title = reportReady ? 'Open the report writer' : 'Select an acquired study from Worklist first';
            }
            const printButton = document.querySelector('#dcBar [data-rad-print]');
            const printReady = Boolean(currentReport && currentReport.status === 'final');
            if (printButton) {
                printButton.classList.toggle('ab-context-off', !printReady);
                printButton.title = printReady ? 'Print the selected final report' : 'Select a final report from Signed reports first';
            }
        }

        function renderAll() {
            updateKPIs(); renderRecent(); renderWorklist(); renderReports(); fillRequestDefaults();
            if (window.pcRadioBar && window.pcRadioBar.refresh) { try { window.pcRadioBar.refresh(currentPatient); } catch (error) {} }
            syncActionBarContext();
        }

        function fillRequestDefaults() {
            text('reqPolicyPatient', currentPatient ? nameOf(currentPatient) + ' — MRN ' + String(currentPatient.mrn || currentPatient.id) : 'No patient selected');
        }

        function setStaffChip() {
            const staff = window.currentStaff || {};
            const name = staff.name || 'Radiologist';
            value('rptRadiologist', name);
        }

        function showGateLock(on) {
            const lock = document.getElementById('gateLock');
            if (!lock) return;
            lock.style.display = on ? 'flex' : 'none';
            if (!on) return;
            // The lock covers the WORK area only. The header (CHUK menu, the
            // identification bar with its Find/Clear, and the action bar with
            // Select patient) stays usable — that is where the patient is chosen.
            const header = document.getElementById('pcMasterHeader');
            const top = header ? Math.ceil(header.getBoundingClientRect().bottom) : 0;
            lock.style.top = top + 'px';
            lock.style.inset = top + 'px 0 0 0';
        }

        window.radioNav = function (view) {
            switchView(document.querySelector('#dcBar [data-rad-view="' + view + '"]'), view);
        };

        window.radioPrint = function () {
            if (!currentReport || currentReport.status !== 'final') {
                notify('Select a final report from Signed reports before printing.', 'warning');
                window.radioNav('signed');
                return;
            }
            printReportFile(currentReport.id);
        };

        window.radioSelectPatient = function () {
            let patients = [];
            try { if (typeof window.getPatients === 'function') patients = window.getPatients() || []; } catch (error) {}
            const scrim = document.createElement('div');
            scrim.className = 'noprint';
            scrim.style.cssText = 'position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px)';
            const dialog = document.createElement('div');
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.style.cssText = 'width:100%;max-width:650px;max-height:82vh;display:flex;flex-direction:column;background:var(--w,#fff);color:var(--t1,#1d1d1f);border:1px solid var(--g2,#ddd);border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.32);overflow:hidden';
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;gap:10px;padding:15px 17px;border-bottom:1px solid var(--g2,#ddd)';
            const heading = document.createElement('div'); heading.style.cssText = 'font-weight:800;font-size:15px;flex:1'; heading.textContent = 'Select patient — Radiology';
            const close = button('Close', 'btn-s', function () { closePicker(); });
            header.appendChild(heading); header.appendChild(close); dialog.appendChild(header);
            const searchWrap = document.createElement('div'); searchWrap.style.cssText = 'padding:12px 16px 8px';
            const search = document.createElement('input');
            search.type = 'search'; search.placeholder = 'Search name, MRN, phone or national ID…'; search.autocomplete = 'off';
            search.style.cssText = 'width:100%;height:40px;border:1px solid var(--g2,#d2d2d7);border-radius:11px;padding:0 13px;background:var(--g0,#f5f5f7);color:inherit;font:13px inherit;outline:none';
            searchWrap.appendChild(search); dialog.appendChild(searchWrap);
            const count = document.createElement('div'); count.style.cssText = 'padding:0 17px 7px;font-size:11px;color:var(--t4,#8e8e93)'; dialog.appendChild(count);
            const results = document.createElement('div'); results.style.cssText = 'padding:0 16px 16px;overflow:auto;min-height:120px'; dialog.appendChild(results);

            function searchable(patient) {
                return [patient.name, patient.firstName, patient.lastName, patient.mrn, patient.id, patient.phone, patient.nationalId, patient.dob, patient.gender, patient.department, patient.location]
                    .map(function (item) { return String(item || '').toLowerCase(); }).join(' ');
            }
            function renderPicker() {
                const query = search.value.trim().toLowerCase();
                const filtered = patients.filter(function (patient) { return !query || searchable(patient).includes(query); });
                results.replaceChildren();
                count.textContent = filtered.length + ' patient' + (filtered.length === 1 ? '' : 's') + ' found';
                if (!filtered.length) {
                    const empty = document.createElement('div'); empty.style.cssText = 'padding:30px;text-align:center;color:var(--t4,#8e8e93)'; empty.textContent = 'No authorized patient matches this search.'; results.appendChild(empty); return;
                }
                filtered.slice(0, 100).forEach(function (patient) {
                    const row = document.createElement('button'); row.type = 'button'; row.className = 'rad-pick-row';
                    row.style.cssText = 'display:flex;align-items:center;gap:12px;width:100%;padding:11px 12px;margin:6px 0;text-align:left;border:1px solid var(--g2,#ddd);border-radius:12px;background:var(--w,#fff);color:inherit;cursor:pointer;font:inherit';
                    const avatar = document.createElement('span'); avatar.style.cssText = 'display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;background:#eaf2ff;color:#0066d6;font-weight:800'; avatar.textContent = (patient.firstName || patient.name || '?').charAt(0).toUpperCase();
                    const details = document.createElement('span'); details.style.cssText = 'display:block;min-width:0;flex:1';
                    const name = document.createElement('strong'); name.style.cssText = 'display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; name.textContent = nameOf(patient);
                    const meta = document.createElement('small'); meta.style.cssText = 'display:block;margin-top:3px;color:var(--t4,#8e8e93);font-size:11px';
                    meta.textContent = 'MRN ' + String(patient.mrn || patient.id || '—') + ' · ' + String(patient.gender || '—') + ' · DOB ' + String(patient.dob || '—') + ' · ' + String(patient.department || patient.location || 'General');
                    details.appendChild(name); details.appendChild(meta);
                    const arrow = document.createElement('span'); arrow.style.cssText = 'color:#0071e3;font-weight:800'; arrow.textContent = 'Select →';
                    row.appendChild(avatar); row.appendChild(details); row.appendChild(arrow);
                    row.addEventListener('click', function () {
                        setActivePatient(patient); currentOrder = null; currentReport = null; closePicker(); renderAll();
                        notify('Selected patient: ' + nameOf(patient), 'success');
                    });
                    results.appendChild(row);
                });
            }
            function onKey(event) { if (event.key === 'Escape') closePicker(); }
            function closePicker() { document.removeEventListener('keydown', onKey); scrim.remove(); }
            search.addEventListener('input', renderPicker);
            scrim.addEventListener('click', function (event) { if (event.target === scrim) closePicker(); });
            document.addEventListener('keydown', onKey);
            scrim.appendChild(dialog); document.body.appendChild(scrim); renderPicker(); setTimeout(function () { search.focus(); }, 50);
        };

        function printReportFile(reportId) {
            const report = window.pcRadiology && window.pcRadiology.reportById(reportId);
            if (!report || report.status !== 'final') { notify('Final saved report not found.', 'warning'); return; }
            // Printing a report selects its patient — the bar shows whose report is printing.
            { const owner = findPatient(report.patientId) || { id: String(report.patientId), mrn: String(report.patientMrn || report.patientId), name: report.patientName || '' }; if (!currentPatient || String(currentPatient.id) !== String(owner.id)) setActivePatient(owner); }
            if (!requirePatient('Printing')) return;
            currentReport = report;
            syncActionBarContext();
            const addenda = window.pcRadiology.addendaForReport(report.id);
            const alert = window.pcRadiology.alertForReport(report.id);
            const popup = window.open('', '_blank', 'width=820,height=950');
            if (!popup) { notify('Pop-up blocked. Allow pop-ups to print reports.', 'warning'); return; }
            function esc(input) { const div = document.createElement('div'); div.textContent = String(input == null ? '' : input); return div.innerHTML; }
            const addendaHtml = addenda.map(function (item) {
                return '<section><h3>Addendum — ' + esc(formatDateTime(item.signedAt)) + '</h3><p><b>Reason:</b> ' + esc(item.reason) + '</p><pre>' + esc(item.text) + '</pre><p>Signed by ' + esc(item.signedByName) + '</p></section>';
            }).join('');
            popup.document.write('<!DOCTYPE html><html><head><title>Radiology Report</title><style>body{font-family:Arial,sans-serif;color:#111;padding:32px;line-height:1.45}header{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px}h1{font-size:20px}h2{font-size:15px;margin-top:20px}h3{font-size:14px}dl{display:grid;grid-template-columns:160px 1fr;gap:6px 12px;font-size:12px}dt{font-weight:bold;color:#555}dd{margin:0}pre{white-space:pre-wrap;font:13px Arial,sans-serif;border:1px solid #ddd;border-radius:8px;padding:12px}section{margin-top:22px;border-top:1px solid #aaa;padding-top:12px}.critical{color:#a00;font-weight:bold}</style></head><body>');
            popup.document.write('<header><h1>PClinic — Radiology Report</h1><div>' + esc(report.status.toUpperCase()) + '</div></header>');
            popup.document.write('<dl><dt>Patient</dt><dd>' + esc(report.patientName) + '</dd><dt>MRN</dt><dd>' + esc(report.patientMrn || report.patientId) + '</dd><dt>Accession</dt><dd>' + esc(report.orderId) + '</dd><dt>Study</dt><dd>' + esc(report.study) + '</dd><dt>Modality</dt><dd>' + esc(report.modality) + '</dd><dt>Study date</dt><dd>' + esc(report.studyDate) + '</dd><dt>Referring clinician</dt><dd>' + esc(report.orderedBy) + '</dd><dt>Clinical indication</dt><dd>' + esc(report.indication) + '</dd></dl>');
            popup.document.write('<h2>Comparison</h2><pre>' + esc(report.comparison || 'None stated') + '</pre><h2>Findings</h2><pre>' + esc(report.findings) + '</pre><h2>Impression</h2><pre>' + esc(report.impression) + '</pre><h2>Recommendation</h2><pre>' + esc(report.recommendation || 'None') + '</pre>');
            if (report.critical) popup.document.write('<p class="critical">CRITICAL RESULT — verbally notified to ' + esc(report.criticalNotification && report.criticalNotification.notifiedTo) + '. Acknowledgment: ' + esc(alert && alert.acknowledged ? 'Acknowledged' : 'Pending') + '</p>');
            popup.document.write('<section><p>Final report signed by <b>' + esc(report.signedByName) + '</b> on ' + esc(formatDateTime(report.signedAt)) + '.</p></section>' + addendaHtml + '</' + 'body></' + 'html>');
            popup.document.close();
            setTimeout(function () { try { popup.focus(); popup.print(); } catch (error) {} }, 250);
        }
        window.printReportFile = printReportFile;

        function generatePDF() {
            if (!currentReport || currentReport.status !== 'final') { notify('Save and finalise the report before generating a PDF.', 'warning'); return; }
            printReportFile(currentReport.id);
        }
        window.generatePDF = generatePDF;

        function openModal(type) {
            let title = '';
            let rows = [];
            if (type === 'alerts') {
                title = 'Radiology alerts';
                activeOrders().forEach(function (order) {
                    rows.push({
                        patientName: order.patientName || ('Patient ' + order.patientId),
                        study: studyOf(order),
                        status: (String(order.priority).toLowerCase() === 'stat' ? 'STAT · ' : '') + stateOf(order).replace('-', ' ')
                    });
                });
                radiologyState.reports.filter(function (report) { return report.status === 'draft'; }).forEach(function (report) {
                    rows.push({ patientName: report.patientName || ('Patient ' + report.patientId), study: report.study || 'Radiology report', status: 'Draft awaiting signature' });
                });
                radiologyState.alerts.filter(function (alert) { return alert.acknowledged !== true; }).forEach(function (alert) {
                    rows.push({ patientName: alert.patientName || ('Patient ' + alert.patientId), study: 'Critical radiology result', status: 'Awaiting clinician acknowledgment' });
                });
            } else if (type === 'pending') {
                title = 'Pending studies';
                rows = activeOrders().filter(function (order) { return stateOf(order) === 'pending'; });
            } else if (type === 'stat') {
                title = 'STAT studies';
                rows = activeOrders().filter(function (order) { return String(order.priority).toLowerCase() === 'stat'; });
            } else if (type === 'unsigned') {
                title = 'Drafts awaiting signature';
                rows = radiologyState.reports.filter(function (report) { return report.status === 'draft'; });
            } else if (type === 'done') {
                title = 'Final reports today';
                rows = radiologyState.reports.filter(function (report) { return report.status === 'final' && isToday(report.signedAt); });
            }
            text('modalTitle', title + ' — ' + rows.length);
            const body = document.getElementById('modalBody');
            if (!body) return;
            body.replaceChildren();
            if (!rows.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:22px;text-align:center;color:var(--t4,#8e8e93)';
                empty.textContent = 'Nothing requires attention.';
                body.appendChild(empty);
            }
            rows.forEach(function (item) {
                const line = document.createElement('div');
                line.style.cssText = 'display:flex;gap:12px;align-items:center;padding:9px 4px;border-bottom:1px solid var(--g2,#eee);font-size:12px';
                const content = document.createElement('span'); content.style.cssText = 'flex:1;min-width:0';
                const patient = document.createElement('strong'); patient.style.display = 'block'; patient.textContent = String(item.patientName || ('Patient ' + (item.patientId || '')));
                const study = document.createElement('small'); study.style.cssText = 'display:block;color:var(--t4,#8e8e93);margin-top:2px'; study.textContent = String(item.study || studyOf(item));
                const status = document.createElement('span'); status.style.cssText = 'font-size:10px;font-weight:800;color:#a32d2d;background:#ffebe9;border-radius:10px;padding:3px 8px'; status.textContent = String(item.status || stateOf(item));
                content.appendChild(patient); content.appendChild(study); line.appendChild(content); line.appendChild(status); body.appendChild(line);
            });
            document.getElementById('modalBg').classList.add('show');
        }
        window.openModal = openModal;
        window.radioOpenSettings = function () {
            text('modalTitle', 'Radiology settings');
            const body = document.getElementById('modalBody');
            if (!body) return;
            body.replaceChildren();
            function setting(title, description, control) {
                const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:11px 3px;border-bottom:1px solid var(--g2,#eee)';
                const copy = document.createElement('div'); copy.style.flex = '1';
                const heading = document.createElement('strong'); heading.style.cssText = 'display:block;font-size:12.5px'; heading.textContent = title;
                const detail = document.createElement('small'); detail.style.cssText = 'display:block;margin-top:3px;color:var(--t4,#8e8e93);font-size:11px'; detail.textContent = description;
                copy.appendChild(heading); copy.appendChild(detail); row.appendChild(copy); if (control) row.appendChild(control); body.appendChild(row);
            }
            const theme = button(document.body.classList.contains('dark-mode') ? 'Use light theme' : 'Use dark theme', 'btn-s', function () { window.toggleDarkMode(); window.radioOpenSettings(); });
            setting('Appearance', 'Theme preference is stored on this device only.', theme);
            const refresh = button('Refresh now', 'btn-s', function () { renderAll(); notify('Radiology data refreshed.', 'success'); });
            setting('Live worklist', 'Orders and reports update in real time from Firestore.', refresh);
            setting('DICOM/PACS', 'Not configured — QIDO-RS and WADO-RS are required for real image viewing.', null);
            setting('Signed-in staff', (window.currentStaff && window.currentStaff.name ? window.currentStaff.name : 'Radiologist') + ' · role ' + (window.currentStaff && window.currentStaff.role || 'radio'), null);
            document.getElementById('modalBg').classList.add('show');
        };
        window.closeModal = function () { var m = document.getElementById('modalBg'); if (m) m.classList.remove('show'); };

        function resolveSearchPatient(query) {
            const text = String(query || '').trim().toLowerCase();
            if (text.length < 2) return null;
            const patients = (window.getPatients ? (window.getPatients() || []) : []);
            const digits = text.replace(/\D/g, '');
            const hit = patients.filter(function (p) {
                const label = (nameOf(p) + ' ' + String(p.mrn || '') + ' ' + String(p.id || '') + ' ' + String(p.nationalId || '')).toLowerCase();
                if (digits && [String(p.id || ''), String(p.mrn || ''), String(p.nationalId || '')].some(function (v) { return v.replace(/\D/g, '') === digits; })) return true;
                return label.indexOf(text) !== -1;
            });
            // Ambiguous is not a selection: picking the first row would attach the
            // wrong patient to a study, which is worse than asking again.
            if (hit.length === 1) return hit[0];
            if (hit.length > 1) { notify(hit.length + ' patients match — add the record number to narrow it down.', 'info', 6000); return null; }
            const byOrder = radiologyState.orders.filter(function (o) {
                return String(o.id || '').toLowerCase().indexOf(text) !== -1 || String(o.patientName || '').toLowerCase().indexOf(text) !== -1;
            });
            if (byOrder.length === 1) return findPatient(byOrder[0].patientId);
            return null;
        }

        window.selectSearchPatient = function () {
            const box = document.getElementById('globalSearch');
            const found = resolveSearchPatient(box && box.value);
            if (!found) { notify('No single patient matches that search.', 'warning'); return; }
            setActivePatient(found);
            renderAll();
            notify('Selected ' + nameOf(found) + ' · MRN ' + String(found.mrn || found.id || ''), 'success');
        };

        window.filterTable = function (query) {
            const needle = String(query || '').toLowerCase();
            document.querySelectorAll('table tbody tr').forEach(function (row) { row.style.display = !needle || row.textContent.toLowerCase().includes(needle) ? '' : 'none'; });
        };

        function syncThemeControl() {
            const dark = document.body.classList.contains('dark-mode');
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        }
        window.toggleDarkMode = function () {
            const dark = !document.body.classList.contains('dark-mode');
            document.body.classList.toggle('dark-mode', dark);
            localStorage.setItem('pclinic-theme', dark ? 'dark' : 'light');
            syncThemeControl();
            notify(dark ? 'Dark theme enabled.' : 'Light theme enabled.', 'info');
        };
        window.openShortcuts = function () { var m = document.getElementById('shortcutsModal'); if (m) m.classList.add('show'); };
        window.closeShortcuts = function () { var m = document.getElementById('shortcutsModal'); if (m) m.classList.remove('show'); };
        window.handleLogout = function () { return window.pclinicLogout ? window.pclinicLogout() : window.location.replace('login.html'); };

        // Retained only so legacy viewer controls fail closed rather than error.
        window.setSlice = window.stepSlice = window.sliderMove = window.togglePlay = window.seekVideo = function () { notify('PACS/DICOMweb is not configured.', 'warning'); };

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { window.closeModal(); window.closeShortcuts(); showGateLock(false); }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); const search = document.getElementById('globalSearch'); if (search) search.focus(); }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); window.toggleDarkMode(); }
            if ((event.ctrlKey || event.metaKey) && /^[1-6]$/.test(event.key)) { event.preventDefault(); window.radioNav(views[Number(event.key) - 1]); }
            if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); window.openShortcuts(); }
        });

        document.addEventListener('DOMContentLoaded', function () {
            if (localStorage.getItem('pclinic-theme') === 'dark') document.body.classList.add('dark-mode');
            syncThemeControl();
            window.requireAuth(['radio']).then(async function (staff) {
                window.currentStaff = staff;
                setStaffChip();
                requestedPatientId = new URLSearchParams(window.location.search).get('patient') || sessionStorage.getItem('pclinic_active_patient') || localStorage.getItem('pclinic_active_patient') || '';
                // Whatever the identification bar restored (pclinic-file.js reads the
                // same stored id) becomes the selection, and vice-versa — one truth.
                const restored = requestedPatientId ? findPatient(requestedPatientId) : null;
                setActivePatient(restored);
                await window.pcRadiology.init({ staff: staff });
                unsubscribeRadiology = window.pcRadiology.subscribe(function (snapshot) {
                    radiologyState = snapshot;
                    if (currentOrder) currentOrder = window.pcRadiology.orderById(currentOrder.id) || currentOrder;
                    if (currentOrder) currentReport = window.pcRadiology.reportForOrder(currentOrder.id) || currentReport;
                    renderAll();
                });
                switchView(document.querySelector('#dcBar [data-rad-view="overview"]'), 'overview');
                notify('Radiology dashboard connected to the secure Common Server.', 'success');
            }).catch(function (error) {
                console.warn('Radiology authentication failed:', error && error.message);
            });
        });

        // The bar's own search (pcFile.searchPatientRegistry) resolves a patient and
        // broadcasts it. Honour that here so searching by name or MRN makes that the
        // current patient everywhere, not just in the bar. The id guard keeps this from
        // re-dispatching pcPatientChanged and ping-ponging with the bar.
        window.addEventListener('pcPatientChanged', function (event) {
            const incoming = event && event.detail;
            if (!incoming || !incoming.id) { if (currentPatient) setActivePatient(null); return; }
            const same = currentPatient && String(currentPatient.id) === String(incoming.id);
            if (same) return;
            const known = findPatient(incoming.id) || incoming;
            if (known) setActivePatient(known);
        });
        window.addEventListener('pcRadiologyMediaChanged', function () {
            if (currentOrder && document.getElementById('mediaHost')) renderMediaPanel(currentOrder);
        });

        /* ── the big bar button: resolve a study, then open the media sheet ── */
        // The registry mirror is device-local and has been shown to lag; a study in
        // front of the radiographer must still be selectable, and the bar must show
        // who it belongs to. Identity fields come from the order, the patientId is
        // the real record id so the files/sync layer queries the right subcollection.
        function patientFromOrder(order) {
            if (!order) return null;
            var known = findPatient(order.patientId);
            if (known) return known;
            var name = String(order.patientName || '').trim();
            var parts = name.split(/\s+/);
            return {
                id: String(order.patientId == null ? '' : order.patientId),
                mrn: String(order.patientId == null ? '' : order.patientId),
                firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '',
                name: name, _fromOrder: true
            };
        }

        function openOrdersForPatient(patient) {
            if (!patient) return [];
            return (radiologyState.orders || []).filter(function (o) {
                if (String(o.patientId || '') !== String(patient.id) &&
                    String(o.patientId || '') !== String(patient.mrn || '\u0000')) return false;
                return stateOf(o) !== 'cancelled';
            }).sort(function (a, b) { return timestampMillis(b.orderedAt) - timestampMillis(a.orderedAt); });
        }

        function selectStudy(order) {
            if (!order) return null;
            var patient = patientFromOrder(order);
            if (!patient.id) { notify('This study has no patient id, so it cannot be selected.', 'error', 7000); return null; }
            if (!currentPatient || String(currentPatient.id) !== String(patient.id)) setActivePatient(patient);
            currentOrder = order;
            currentReport = window.pcRadiology ? window.pcRadiology.reportForOrder(order.id) : null;
            highlightSelectedStudy();
            announceStudyCount();
            return patient;
        }

        function highlightSelectedStudy() {
            var body = document.getElementById('worklistBody');
            if (!body) return;
            Array.prototype.forEach.call(body.querySelectorAll('tr'), function (tr) {
                if (!tr.dataset.studyId) return;
                var on = !!currentOrder && String(tr.dataset.studyId) === String(currentOrder.id);
                tr.style.background = on ? 'rgba(0,113,227,.07)' : '';
                tr.style.boxShadow = on ? 'inset 3px 0 0 #0071e3' : 'none';
            });
        }

        function announceStudyCount() {
            if (window.pcRadioBar && typeof window.pcRadioBar.setStudyCount === 'function') {
                window.pcRadioBar.setStudyCount(currentPatient ? openOrdersForPatient(currentPatient).length : 0);
            }
        }

        /* The bar's "Add radiology result" button (pcRadioAddMedia) was removed:
           results are added through "Open DICOM to add radiology result"
           (pcRadioOpenViewer → handleOpenViewerRequest below). */

        /* ── the bar's "Open DICOM viewer" button ──
           ALWAYS lands in the PClinic DICOM Viewer page. Every study of the
           selected patient (open first, then reported; cancelled excluded) is
           listed in the viewer's explorer; the first one is displayed and the
           others are one click away inside the viewer. A patient with no study
           still gets the viewer, empty, with the reason shown in the viewport —
           never just a toast. */
        function viewerStudiesFor(patient) {
            if (!patient) return [];
            var mine = (radiologyState.orders || []).filter(function (o) {
                return (String(o.patientId || '') === String(patient.id) ||
                        String(o.patientId || '') === String(patient.mrn || '\u0000')) &&
                    stateOf(o) !== 'cancelled';
            });
            var rank = { pending: 0, 'in-progress': 0, acquired: 0, reporting: 0, reported: 1 };
            mine.sort(function (a, b) {
                var r = (rank[stateOf(a)] ?? 2) - (rank[stateOf(b)] ?? 2);
                return r || (timestampMillis(b.orderedAt) - timestampMillis(a.orderedAt));
            });
            return mine.map(function (o) {
                var v = viewerOrderFor(o, patient);
                v.state = stateOf(o);
                return v;
            });
        }

        function handleOpenViewerRequest(event) {
            var patient = (event && event.detail && event.detail.patient) || currentPatient;
            if (!patient || !patient.id) { requirePatient('The DICOM viewer'); return; }
            if (!currentPatient || String(currentPatient.id) !== String(patient.id)) setActivePatient(patient);
            if (!window.PcDicomViewer) { notify('The DICOM viewer did not load. Refresh the page (Ctrl/Cmd+Shift+R).', 'error', 8000); return; }
            var studies = viewerStudiesFor(patient);
            var first = null;
            if (currentOrder && String(currentOrder.patientId) === String(patient.id) && stateOf(currentOrder) !== 'cancelled') {
                first = studies.filter(function (s) { return String(s.id) === String(currentOrder.id); })[0] || null;
            }
            if (!first) first = studies[0] || null;
            if (first) {
                var live = window.pcRadiology && window.pcRadiology.orderById(first.id);
                if (live) selectStudy(live);
            }
            // One workstation for radiology and doctors: radiology opens it with Upload/Remove on.
            window.PcDicomViewer.open(first || { id: '', patientId: patient.id, patientName: nameOf(patient), study: '' }, { canManage: true, studies: studies, patient: patient });
        }
        window.addEventListener('pcRadioOpenViewer', handleOpenViewerRequest);

        /* ── DICOM viewer helpers (used by "Open DICOM to add radiology result") ── */
        function viewerOrderFor(order, patient) {
            return {
                id: String(order && order.id),
                study: studyOf(order),
                patientName: String((order && order.patientName) || nameOf(patient) || ''),
                patientId: order && order.patientId
            };
        }

        function openImageViewer(order, patient) {
            if (!order) { notify('Select a study first.', 'warning'); return; }
            if (patient && patient.id && (!currentPatient || String(currentPatient.id) !== String(patient.id))) setActivePatient(patient);
            if (!requirePatient('The DICOM viewer')) return;
            if (!window.PcDicomViewer) { notify('The DICOM viewer did not load.', 'error', 6000); return; }
            window.PcDicomViewer.open(viewerOrderFor(order, patient), { canManage: true, patient: patient || currentPatient, studies: viewerStudiesFor(patient || currentPatient) });
        }
        window.openImageViewer = openImageViewer;

        function openMediaSheet(order, preferredPatient) {
            if (!order) { notify('Select a study first.', 'warning'); return; }
            var target = preferredPatient || patientFromOrder(order);
            if (!target || !target.id) { notify('This study has no patient id, so nothing can be filed against it.', 'error', 7000); return; }
            selectStudy(order);
            if (!requirePatient('Study media')) return;
            if (window.pcFile && typeof window.pcFile.sheet === 'function') {
                // pcFile.sheet hands the body to opts.build(body, close) — there is
                // no onMount option; passing one would open an empty modal.
                window.pcFile.sheet({
                    title: 'Study media — ' + studyOf(order), icon: 'ti-photo', done: 'Done',
                    // sheet() hands onClose the already-detached body, so it can only
                    // be used to repaint the page behind the modal.
                    onClose: function () { renderWorklist(); announceStudyCount(); },
                    build: function (body, close) {
                        body.appendChild(buildMediaBlock(order, true));
                        const note = document.createElement('div');
                        note.style.cssText = 'font-size:10px;color:#6e6e73;margin-top:8px';
                        note.textContent = 'Close this panel to refresh the worklist counts.';
                        body.appendChild(note);
                    }
                });
                return;
            }
            const host = document.getElementById('mediaHost');
            if (host) { renderMediaPanel(order); host.scrollIntoView({ block: 'nearest' }); return; }
            notify('The media panel is not available on this view.', 'warning');
        }
        window.openMediaSheet = openMediaSheet;

        function buildMediaBlock(order, canManage) {
            const wrap = document.createElement('div');
            wrap.dataset.mediaFor = String(order.id);
            const bar = document.createElement('div');
            bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0';
            wrap.appendChild(bar);
            const viewerBtn = document.createElement('button');
            viewerBtn.type = 'button';
            viewerBtn.textContent = 'Open DICOM viewer';
            viewerBtn.style.cssText = 'font:inherit;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid #d1d1d6;background:#1b1b1b;color:#fff;cursor:pointer';
            viewerBtn.onclick = function () {
                if (window.PcDicomViewer) window.PcDicomViewer.open(viewerOrderFor(order, currentPatient), { canManage: canManage, patient: currentPatient, studies: viewerStudiesFor(currentPatient) });
                else notify('The DICOM viewer did not load.', 'warning');
            };
            bar.appendChild(viewerBtn);
            if (canManage) {
                const pick = document.createElement('input');
                pick.type = 'file'; pick.multiple = true; pick.accept = (window.pcRadioMedia && pcRadioMedia.ACCEPT) || '';
                pick.style.cssText = 'font-size:11px';
                bar.appendChild(pick);
                pick.addEventListener('change', function () { uploadMedia(order, pick); });
            }
            const hint = document.createElement('span');
            hint.style.cssText = 'font-size:10px;color:#6e6e73';
            hint.textContent = 'JPEG / PNG / WebP / GIF / MP4 / WebM / DICOM (.dcm), 25 MB each.';
            bar.appendChild(hint);
            const panel = document.createElement('div');
            panel.className = 'pc-media-host';
            wrap.appendChild(panel);
            if (window.pcRadioMedia) window.pcRadioMedia.mount(panel, order, { canManage: canManage });
            return wrap;
        }

        function renderMediaPanel(order) {
            const panel = document.querySelector('[data-media-for="' + String(order.id) + '"] .pc-media-host');
            if (panel && window.pcRadioMedia) window.pcRadioMedia.mount(panel, order, { canManage: true });
        }

        async function uploadMedia(order, input) {
            if (!window.pcRadioMedia) { notify('The media module did not load.', 'error'); return; }
            if (!requirePatient('Uploading images')) { input.value = ''; return; }
            if (String(order.patientId) !== String(currentPatient.id) && String(order.patientId) !== String(currentPatient.mrn || '\u0000')) {
                notify('This study belongs to a different patient than the one in the identification bar. Upload blocked.', 'error', 8000); input.value = ''; return;
            }
            const files = Array.prototype.slice.call(input.files || []);
            if (!files.length) return;
            let ok = 0; const problems = [];
            for (const file of files) {
                try { await window.pcRadioMedia.upload(order, file); ok++; }
                catch (error) { problems.push((file && file.name ? file.name + ': ' : '') + ((error && error.message) || 'upload failed')); }
            }
            input.value = '';
            if (ok) notify(ok + ' file(s) attached to this study and visible in Radiology results.', 'success', 6000);
            if (problems.length) notify('⚠️ ' + problems.join(' · '), 'error', 12000);
            renderMediaPanel(order);
            announceStudyCount();
        }

        window.addEventListener('patientsUpdated', function () {
            if (!currentPatient && requestedPatientId) {
                const resolved = findPatient(requestedPatientId);
                if (resolved) { setActivePatient(resolved); renderAll(); }
            }
        });
        window.addEventListener('beforeunload', function () { if (unsubscribeRadiology) unsubscribeRadiology(); });
    })();
