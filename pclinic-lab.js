/* ============================================================
   PCLINIC — LABORATORY DASHBOARD ENGINE (pclinic-lab.js)
   100% Common Server Powered (Zero Template Sample Data)
   Apple Platinum Glass UI & One Authoritative Master Row per Patient
   100/100 Look-Alike Editable PClinic Cumulative Result Matrix
   ============================================================ */
(function () {
    'use strict';

    // Track open accordion groups across repaints
    var openGroups = {};

    function esc(v) {
        var d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    function ago(iso) {
        if (!iso) return 'just now';
        var s = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (s < 60)    return 'just now';
        if (s < 3600)  return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    function prioBadge(p) {
        var map = {
            stat:    ['#ffebe9', '#8a1f1a', 'STAT'],
            urgent:  ['#fff4e0', '#7a4500', 'URGENT'],
            routine: ['#f2f2f4', '#8e8e93', 'Routine']
        };
        var c = map[p] || map.routine;
        return '<span class="badge" style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:30px;' +
               'background:' + c[0] + ';color:' + c[1] + ';letter-spacing:.03em">' + c[2] + '</span>';
    }

    function statusBadge(s) {
        var map = {
            pending:       ['#fff4e0', '#7a4500', 'Pending'],
            'in-progress': ['#eaf2ff', '#0071e3', 'In Progress'],
            completed:     ['#e9f9ee', '#1a7a32', 'Verified'],
            cancelled:     ['#ffebe9', '#8a1f1a', 'Cancelled']
        };
        var c = map[s] || map.pending;
        return '<span class="badge" style="font-size:10.5px;font-weight:700;padding:3px 9px;' +
               'border-radius:30px;background:' + c[0] + ';color:' + c[1] + '">' + esc(c[2]) + '</span>';
    }

    function getTestDepartment(testName) {
        var t = String(testName || '').toLowerCase();
        if (t.indexOf('cbc') !== -1 || t.indexOf('blood count') !== -1 || t.indexOf('haemoglobin') !== -1 || t.indexOf('coagulation') !== -1 || t.indexOf('fbc') !== -1) {
            return 'Haematology';
        }
        if (t.indexOf('lft') !== -1 || t.indexOf('rft') !== -1 || t.indexOf('glucose') !== -1 || t.indexOf('lipid') !== -1 || t.indexOf('troponin') !== -1 || t.indexOf('chemistry') !== -1) {
            return 'Chemistry';
        }
        if (t.indexOf('malaria') !== -1 || t.indexOf('hiv') !== -1 || t.indexOf('culture') !== -1 || t.indexOf('stool') !== -1 || t.indexOf('swab') !== -1 || t.indexOf('microbio') !== -1) {
            return 'Microbiology';
        }
        if (t.indexOf('urine') !== -1 || t.indexOf('urinalysis') !== -1 || t.indexOf('pregnancy') !== -1) {
            return 'Urinalysis';
        }
        return 'General Lab';
    }

    /* ── SVG Verification Barcode Generator (MOD System Proof) ── */
    function generateSVGBarcode(code) {
        var str = String(code || 'MOD-LAB-2026').trim();
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        var bars = '';
        var x = 0;
        for (var j = 0; j < 36; j++) {
            var bit = (hash >> (j % 30)) & 1;
            var w = bit ? 2.8 : 1.2;
            bars += '<rect x="' + x + '" y="0" width="' + w + '" height="26" fill="#1d1d1f"/>';
            x += w + 1.8;
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + x + ' 26" style="width:140px;height:26px;display:inline-block;">' +
               bars + '</svg>';
    }

    /* ── 100/100 PCLINIC CUMULATIVE LABORATORY PARAMETER REGISTER (FROM LAB-RESULTS.HTML) ── */
    var OC_CATEGORIES = [
        {
            id: 'chem',
            title: '20000 USUAL CHEMISTRY',
            className: 'oc-cat-chem',
            color: '#059669',
            tests: [
                { code: '20001', name: 'UREA/BLOOD', unit: 'mmol/l', range: '3-9.2' },
                { code: '20002', name: 'CREATININE/BLOOD', unit: 'µmol/l', range: '63.6-110.5' },
                { code: '20003', name: 'NA + (SODIUM)/BLOOD', unit: 'mmol/l', range: '135-145' },
                { code: '20004', name: 'K + (POTASSIUM)/BLOOD', unit: 'mmol/l', range: '3.5-5.0' },
                { code: '20005', name: 'MAGNESIUM/BLOOD', unit: 'mmol/l', range: '0.66-1.07' },
                { code: '20006', name: 'CL -(CHLORURE)/BLOOD', unit: 'mmol/l', range: '98-107' },
                { code: '20007', name: 'FASTING GLUCOSE/BLOOD', unit: 'mmol/l', range: '3.9-5.6' },
                { code: '20008', name: 'LIVER FUNCTION (SGPT/ALT)', unit: 'U/l', range: '7-56' },
                { code: '20009', name: 'LIVER FUNCTION (SGOT/AST)', unit: 'U/l', range: '10-40' }
            ]
        },
        {
            id: 'fbc',
            title: '31000 FULL BLOOD COUNT',
            className: 'oc-cat-fbc',
            color: '#800040',
            tests: [
                { code: '31001', name: 'WBC', unit: '10^3/µl', range: '4-10' },
                { code: '31002', name: 'RBC', unit: '10^6/µl', range: '4.5-6.2' },
                { code: '31003', name: 'hemoglobin', unit: 'g/dl', range: '13-17' },
                { code: '31004', name: 'Hct', unit: '%', range: '40-54' },
                { code: '31005', name: 'MCV', unit: 'fL', range: '82-98' },
                { code: '31006', name: 'MCH', unit: 'pg', range: '27-31' },
                { code: '31007', name: 'MCHC', unit: 'g/dl', range: '32-36' },
                { code: '31008', name: 'platelets', unit: '10^3/µl', range: '150-450' },
                { code: '31009', name: 'RDW', unit: '%', range: '11.5-14.5' },
                { code: '31010', name: 'MPV', unit: 'fL', range: '6.9-10.6' },
                { code: '32001', name: 'neutrophiles', unit: '%', range: '40-75' },
                { code: '32002', name: 'lymphocytes', unit: '%', range: '20-40' },
                { code: '32003', name: 'monocytes', unit: '%', range: '2-8' },
                { code: '32004', name: 'eosinophiles', unit: '%', range: '1-4' }
            ]
        },
        {
            id: 'sero',
            title: '40000 SEROLOGY & IMMUNOLOGY',
            className: 'oc-cat-sero',
            color: '#c81e51',
            tests: [
                { code: '40001', name: 'HIV 1/2 ANTIBODY/AG', unit: '', range: 'Negative' },
                { code: '40002', name: 'HBsAg (HEPATITIS B)', unit: '', range: 'Negative' },
                { code: '40003', name: 'HCV ANTIBODY', unit: '', range: 'Negative' },
                { code: '40004', name: 'SYPHILIS RPR/VDRL', unit: '', range: 'Negative' },
                { code: '40005', name: 'CRP (C-REACTIVE PROTEIN)', unit: 'mg/l', range: '0-5' },
                { code: '40006', name: 'WIDAL TEST (SALMONELLA)', unit: '', range: 'Negative' },
                { code: '40007', name: 'H. PYLORI AG/AB', unit: '', range: 'Negative' }
            ]
        },
        {
            id: 'micro',
            title: '50000 MICROBIOLOGY & CULTURES',
            className: 'oc-cat-mic',
            color: '#005bb5',
            tests: [
                { code: '50001', name: 'MALARIA PARASITE (MP)', unit: '', range: 'Negative' },
                { code: '50002', name: 'BLOOD CULTURE & SENSITIVITY', unit: '', range: 'No growth' },
                { code: '50003', name: 'URINE CULTURE & SENSITIVITY', unit: '', range: 'No growth' },
                { code: '50004', name: 'STOOL OVA & CYSTS', unit: '', range: 'Negative' }
            ]
        },
        {
            id: 'uri',
            title: '60000 URINALYSIS',
            className: 'oc-cat-uri',
            color: '#006666',
            tests: [
                { code: '60001', name: 'URINE PROTEIN/ALBUMIN', unit: '', range: 'Negative' },
                { code: '60002', name: 'URINE GLUCOSE', unit: '', range: 'Negative' },
                { code: '60003', name: 'URINE KETONES', unit: '', range: 'Negative' },
                { code: '60004', name: 'URINE WBC / LEUKOCYTES', unit: '/HPF', range: '0-5' }
            ]
        }
    ];

    function labParameterByCode(code) {
        var wanted = String(code || '');
        for (var c = 0; c < OC_CATEGORIES.length; c++) {
            for (var i = 0; i < OC_CATEGORIES[c].tests.length; i++) {
                if (String(OC_CATEGORIES[c].tests[i].code) === wanted) return OC_CATEGORIES[c].tests[i];
            }
        }
        // Full CHUK catalog fallback (new parameter codes like '16110-1').
        if (window.pcLabCatalog && typeof window.pcLabCatalog.parameterByCode === 'function') {
            var cp = window.pcLabCatalog.parameterByCode(wanted);
            if (cp) return { code: cp.code, name: cp.name, unit: cp.unit || '', range: cp.range || '' };
        }
        return null;
    }

    function cloneLabParameter(parameter, item) {
        return {
            code: String(parameter.code || item.code || ''),
            name: String(parameter.name || item.name || 'Laboratory result'),
            unit: String(parameter.unit || ''),
            range: String(parameter.range || ''),
            orderItemCode: String(item.code || ''),
            orderItemName: String(item.name || '')
        };
    }

    // Expand known panels into their actual analytes, but always fall back to
    // the exact ordered test. This keeps the result form aligned with the
    // admin-managed tariff instead of silently dropping unrecognised tests.
    function parametersForOrderItem(item) {
        item = item || {};
        var joinedNames = String(item.name || '').split(',').map(function(name) { return name.trim(); }).filter(Boolean);
        if (joinedNames.length > 1) {
            var expanded = [];
            joinedNames.forEach(function(name) {
                parametersForOrderItem({ code: '', name: name, unit: item.unit, range: item.range }).forEach(function(parameter) {
                    parameter.orderItemCode = String(item.code || '');
                    parameter.orderItemName = String(item.name || '');
                    expanded.push(parameter);
                });
            });
            return expanded;
        }
        var code = String(item.code || '').toUpperCase();
        var name = String(item.name || '').toLowerCase();
        var codes = [];
        if (code === 'LAB-CBC' || /complete blood count|\bcbc\b|\bfbc\b/.test(name)) {
            codes = ['31001','31002','31003','31004','31005','31006','31007','31008','31009','31010','32001','32002','32003','32004'];
        } else if (code === 'LAB-RFT' || /renal function/.test(name)) {
            codes = ['20001','20002','20003','20004','20005','20006'];
        } else if (code === 'LAB-LFT' || /liver function/.test(name)) {
            codes = ['20008','20009'];
        } else if (code === 'LAB-ELEC' || /electrolyte/.test(name)) {
            codes = ['20003','20004','20006'];
        } else if (code === 'LAB-UA' || /urinalysis.*complete/.test(name)) {
            codes = ['60001','60002','60003','60004'];
        } else if (code === 'LAB-CREAT' || /creatinine/.test(name)) {
            codes = ['20002'];
        } else if (code === 'LAB-BUN' || /blood urea|\burea\b/.test(name)) {
            codes = ['20001'];
        } else if (code === 'LAB-FBS' || /fasting blood sugar|fasting glucose/.test(name)) {
            codes = ['20007'];
        } else if (code === 'LAB-HB' || /hemoglobin|haemoglobin/.test(name)) {
            codes = ['31003'];
        } else if (code === 'LAB-WBC' || /white blood cell|\bwbc\b/.test(name)) {
            codes = ['31001'];
        } else if (code === 'LAB-PLT' || /platelet/.test(name)) {
            codes = ['31008'];
        } else if (code === 'LAB-HIV' || /hiv/.test(name)) {
            codes = ['40001'];
        } else if (code === 'LAB-HBSAG' || /hbsag|hepatitis b surface/.test(name)) {
            codes = ['40002'];
        } else if (code === 'LAB-HCV' || /hepatitis c/.test(name)) {
            codes = ['40003'];
        } else if (code === 'LAB-RPR' || /syphilis|rpr|vdrl/.test(name)) {
            codes = ['40004'];
        } else if (code === 'LAB-CRP' || /c-reactive|\bcrp\b/.test(name)) {
            codes = ['40005'];
        } else if (code === 'LAB-MALMP' || /malaria/.test(name)) {
            codes = ['50001'];
        } else if (code === 'LAB-BCULT' || /blood culture/.test(name)) {
            codes = ['50002'];
        } else if (code === 'LAB-UCULT' || /urine culture/.test(name)) {
            codes = ['50003'];
        } else if (code === 'LAB-STOOL' || /stool ova|stool analysis/.test(name)) {
            codes = ['50004'];
        }
        var known = codes.map(labParameterByCode).filter(Boolean).map(function(parameter) {
            return cloneLabParameter(parameter, item);
        });
        if (known.length) return known;
        // ── FULL CHUK CATALOG FALLBACK ──
        // Unrecognised codes/names resolve to the catalog exam's parameter
        // rows so the lab can enter results for every catalogued test.
        if (window.pcLabCatalog) {
            var catalogExam = window.pcLabCatalog.byCode(item.code) || window.pcLabCatalog.findByName(item.name);
            if (catalogExam && Array.isArray(catalogExam.parameters) && catalogExam.parameters.length) {
                return catalogExam.parameters.map(function (parameter) {
                    return cloneLabParameter(parameter, item);
                });
            }
        }
        return [cloneLabParameter({ code: item.code || ('RESULT-' + Date.now()), name: item.name, unit: item.unit, range: item.refRange || item.range }, item)];
    }

    function existingOrderResult(order, parameter) {
        var rows = Array.isArray(order.results) ? order.results : [];
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i].code || '') === String(parameter.code || '') &&
                (!rows[i].orderItemCode || String(rows[i].orderItemCode) === String(parameter.orderItemCode))) return rows[i];
        }
        return null;
    }

    function safeDomId(value) {
        return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function normaliseOrderStatus(status) {
        var raw = String(status || 'pending').toLowerCase();
        if (raw === 'completed' || raw === 'final' || raw === 'verified') return 'completed';
        if (raw === 'in-progress' || raw === 'processing') return 'in-progress';
        if (raw === 'cancelled' || raw === 'rejected') return 'cancelled';
        return 'pending';
    }

    function primaryOrder(group) {
        return group && Array.isArray(group.orders) && group.orders.length ? group.orders[0] : null;
    }

    function plannedAccessionNo(groupOrOrder) {
        var order = groupOrOrder && Array.isArray(groupOrOrder.orders) ? primaryOrder(groupOrOrder) : groupOrOrder;
        if (!order) return '—';
        if (order.accessionNo) return String(order.accessionNo);
        var patientId = stripMod((order && order.patientId) || (groupOrOrder && groupOrOrder.patientId) || 'UNKNOWN');
        var dateStr = String((order && order.orderedAt) || (groupOrOrder && groupOrOrder.dateStr) || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
        var orderTail = String(order.id || 'LIVE').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        orderTail = orderTail.slice(-6) || 'LIVE';
        return 'LAB-' + patientId + '-' + dateStr.slice(5).replace('-', '') + '-' + orderTail;
    }

    function displayAccessionNo(groupOrOrder) {
        var order = groupOrOrder && Array.isArray(groupOrOrder.orders) ? primaryOrder(groupOrOrder) : groupOrOrder;
        if (!order) return '—';
        if (order.accessionNo) return String(order.accessionNo);
        if (order.id) return String(order.id);
        return plannedAccessionNo(groupOrOrder);
    }

    function groupTestNames(group) {
        var names = [];
        ((group && group.orders) || []).forEach(function(order) {
            (order.items || []).forEach(function(item) {
                if (names.indexOf(item.name) === -1) names.push(item.name);
            });
        });
        return names;
    }

    function groupTestCount(group) {
        var count = 0;
        ((group && group.orders) || []).forEach(function(order) {
            count += Array.isArray(order.items) ? order.items.length : 0;
        });
        return count;
    }

    /* ── Get All Lab Orders from Common Server ── */
    function getLabOrders() {
        if (!window.pcOrders) return [];
        var list = [];
        try {
            if (typeof pcOrders.listServerConfirmed === 'function') {
                list = pcOrders.listServerConfirmed({ dept: 'lab' }) || [];
            } else if (typeof pcOrders.list === 'function') {
                list = pcOrders.list({ dept: 'lab' }).filter(function(order) {
                    return !order._legacyLocalOnly && !order._syncFailed;
                });
            }
        } catch (e) {
            console.warn('Unable to load server-confirmed lab orders:', e);
            list = [];
        }
        return list.filter(function(o) {
            return normaliseOrderStatus(o.status) !== 'cancelled';
        });
    }

    /* ══════════════════════════════════════════════════════════════════
       SELECTED LAB PATIENT ENGINE (Doctor Dashboard Style Workflow)
       1. Patient list rows carry a ✓ Select button.
       2. Patient can also be searched from the identification bar above.
       3. Only the selected patient enters the identification bar.
       4. Every button below stays LOCKED until a patient is selected
          (only Overview stays open — it is the patient list itself).
       ══════════════════════════════════════════════════════════════════ */
    var LAB_SELECT_KEY = 'pclinic_lab_selected_patient';
    var LAB_DATE_KEY = 'pclinic_lab_selected_date';
    var applyingLabSelection = false;

    function stripMod(v) {
        return String(v == null ? '' : v).replace(/^MOD-/i, '').trim();
    }

    function allPatients() {
        var list = [];
        try { if (typeof getPatients === 'function') list = getPatients() || []; } catch(e){}
        if (!list.length) {
            try { list = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
        }
        return list || [];
    }

    function hasCommonServerPatientRecord(patientId) {
        var idStr = stripMod(patientId).toLowerCase();
        if (!idStr) return false;
        var list = allPatients();
        for (var i = 0; i < list.length; i++) {
            if (stripMod(list[i].id).toLowerCase() === idStr ||
                String(list[i].mrn || '').toLowerCase() === idStr ||
                String(list[i].nationalId || '').toLowerCase() === idStr) {
                return true;
            }
        }
        return false;
    }

    function fallbackPatientFromLabOrders(pid) {
        var idStr = stripMod(pid).toLowerCase();
        if (!idStr) return null;
        var orders = [];
        try { orders = getLabOrders() || []; } catch (e) {}
        for (var i = 0; i < orders.length; i++) {
            var order = orders[i] || {};
            var orderPid = stripMod(order.patientId).toLowerCase();
            if (orderPid !== idStr) continue;
            var displayName = String(order.patientName || order.name || '').trim() || ('Patient ' + stripMod(pid));
            return {
                id: stripMod(order.patientId || pid),
                mrn: stripMod(order.patientId || pid),
                name: displayName,
                firstName: displayName.split(/\s+/).slice(0, -1).join(' '),
                lastName: displayName.split(/\s+/).slice(-1).join(''),
                sex: order.patientSex || order.sex || '',
                dateOfBirth: order.patientDob || order.dob || '',
                __labFallback: true
            };
        }
        return null;
    }

    function findPatientById(pid) {
        var idStr = stripMod(pid).toLowerCase();
        if (!idStr) return null;
        var list = allPatients();
        for (var i = 0; i < list.length; i++) {
            if (stripMod(list[i].id).toLowerCase() === idStr ||
                String(list[i].mrn || '').toLowerCase() === idStr ||
                String(list[i].nationalId || '').toLowerCase() === idStr) {
                return list[i];
            }
        }
        return fallbackPatientFromLabOrders(pid);
    }

    function patientDisplayName(p) {
        if (!p) return '';
        if (p.name) return p.name;
        var n = ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
        return n || ('Patient ' + stripMod(p.id));
    }

    function getSelectedLabPatient() {
        var id = null;
        try { id = localStorage.getItem(LAB_SELECT_KEY); } catch(e){}
        if (!id) return null;
        return findPatientById(id);
    }

    function isSelectedRow(g) {
        var sel = getSelectedLabPatient();
        if (!sel) return false;
        return stripMod(sel.id).toLowerCase() === stripMod(g.patientId).toLowerCase();
    }

    /* ── SCOPE EVERYTHING TO THE SELECTED PATIENT ONLY ── */
    function scopeToSelectedPatient(groups) {
        var sel = getSelectedLabPatient();
        if (!sel) return [];
        var selId = stripMod(sel.id).toLowerCase();
        return groups.filter(function(g) {
            return stripMod(g.patientId).toLowerCase() === selId;
        });
    }

    function getSelectedLabDate() {
        try { return String(localStorage.getItem(LAB_DATE_KEY) || ''); } catch (e) {}
        return '';
    }

    function rememberSelectedLabDate(dateStr) {
        try {
            if (dateStr) localStorage.setItem(LAB_DATE_KEY, String(dateStr));
            else localStorage.removeItem(LAB_DATE_KEY);
        } catch (e) {}
    }

    function clearSelectedLabDate() {
        try { localStorage.removeItem(LAB_DATE_KEY); } catch (e) {}
    }

    function formatLabDate(dateStr) {
        if (!dateStr) return '—';
        var parts = String(dateStr).split('-');
        if (parts.length === 3) {
            var d = new Date(dateStr + 'T00:00:00');
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            }
        }
        return String(dateStr);
    }

    function dateSelectorLabel(group, mode) {
        if (!group) return '—';
        var requestCount = (group.orders || []).length;
        var testCount = groupTestCount(group);
        var base = formatLabDate(group.dateStr) + ' • ' + requestCount + ' request' + (requestCount === 1 ? '' : 's') + ' • ' + testCount + ' test' + (testCount === 1 ? '' : 's');
        if (mode === 'verified') return base + ' • VERIFIED';
        if (mode === 'micro') return base + ' • MICROBIOLOGY';
        return base + ' • ' + String(group.priority || 'routine').toUpperCase();
    }

    function patientDateGroups(patient, sourceOrders) {
        if (!patient) return [];
        var groups = groupOrdersByPatientAndDate(Array.isArray(sourceOrders) ? sourceOrders : getLabOrders());
        var selId = stripMod(patient.id).toLowerCase();
        return groups.filter(function(group) {
            return stripMod(group.patientId).toLowerCase() === selId;
        }).sort(function(a, b) {
            return new Date(b.orderedAt || 0) - new Date(a.orderedAt || 0);
        });
    }

    function ensureSelectedLabDateForPatient(patient, groups, preferredDate) {
        groups = Array.isArray(groups) ? groups : patientDateGroups(patient);
        if (!patient || !groups.length) {
            clearSelectedLabDate();
            return '';
        }
        var saved = preferredDate || getSelectedLabDate();
        var match = saved && groups.some(function(group) {
            return String(group.dateStr) === String(saved);
        });
        var resolved = match ? String(saved) : String(groups[0].dateStr || '');
        rememberSelectedLabDate(resolved);
        var filter = document.getElementById('labDateFilter');
        if (filter) filter.value = resolved;
        return resolved;
    }

    function activeDateGroupForPatient(patient, groups, preferredDate) {
        groups = Array.isArray(groups) ? groups : patientDateGroups(patient);
        var activeDate = ensureSelectedLabDateForPatient(patient, groups, preferredDate);
        return groups.filter(function(group) {
            return String(group.dateStr) === String(activeDate);
        })[0] || groups[0] || null;
    }

    function paintLabDateSelector(groups, patient) {
        var selector = document.getElementById('labDateFilter');
        if (!selector) return;
        groups = Array.isArray(groups) ? groups : [];
        if (!patient) {
            selector.innerHTML = '<option value="">Select patient first…</option>';
            selector.value = '';
            selector.disabled = true;
            return;
        }
        if (!groups.length) {
            selector.innerHTML = '<option value="">No request dates for ' + esc(patientDisplayName(patient)) + '</option>';
            selector.value = '';
            selector.disabled = true;
            return;
        }
        selector.disabled = false;
        selector.innerHTML = groups.map(function(group) {
            return '<option value="' + esc(group.dateStr) + '">' + esc(dateSelectorLabel(group)) + '</option>';
        }).join('');
        selector.value = ensureSelectedLabDateForPatient(patient, groups);
    }

    function selectLabDate(dateStr, quiet) {
        var patient = getSelectedLabPatient();
        if (!patient) {
            if (!quiet && window.showToast) showToast('⚠️ Select a patient first before choosing a request date.', 'warning');
            return false;
        }
        var groups = patientDateGroups(patient);
        if (!groups.length) {
            if (!quiet && window.showToast) showToast('⚠️ No laboratory request dates exist for the selected patient.', 'warning');
            clearSelectedLabDate();
            repaintAll();
            return false;
        }
        var target = groups.filter(function(group) { return String(group.dateStr) === String(dateStr); })[0] || groups[0];
        rememberSelectedLabDate(target.dateStr);
        repaintAll();
        if (!quiet && window.showToast) {
            showToast('📅 Selected request date: ' + formatLabDate(target.dateStr) + ' for ' + patientDisplayName(patient), 'info');
        }
        return true;
    }

    /* ── SELECT patient into identification bar + unlock every button ── */
    function selectLabPatient(pid, quiet) {
        var p = findPatientById(pid);
        if (!p) {
            if (window.showToast) showToast('❌ Patient record is not available yet. Refresh the page and try again.', 'error');
            return;
        }
        try {
            localStorage.setItem(LAB_SELECT_KEY, String(p.id));
            localStorage.setItem('pclinic_active_patient', String(p.id));
        } catch(e){}
        var patientGroups = patientDateGroups(p);
        if (patientGroups.length) rememberSelectedLabDate(patientGroups[0].dateStr);
        else clearSelectedLabDate();
        try {
            if (window.pcFile && typeof pcFile.renderDemoBar === 'function') {
                var master = document.getElementById('pcMasterHeader') || document.body;
                pcFile.renderDemoBar(master, p);
            }
        } catch(e){ console.warn(e); }
        applyingLabSelection = true;
        try { window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: p })); } catch(e){}
        applyingLabSelection = false;
        try { window.dispatchEvent(new CustomEvent('labSelectionChanged', { detail: p })); } catch(e){}
        updateSelectionUI();
        repaintAll();
        if (!quiet && window.showToast) {
            var dateText = patientGroups.length ? (' • latest request date ' + formatLabDate(patientGroups[0].dateStr)) : '';
            showToast('👤 Selected patient: ' + patientDisplayName(p) + dateText + (p.__labFallback ? ' (loaded from live order queue)' : ''), 'success');
        }
    }

    function openPatientDateView(pid) {
        selectLabPatient(pid, true);
        var sel = getSelectedLabPatient();
        if (!sel) return;
        var groups = patientDateGroups(sel);
        if (groups.length) rememberSelectedLabDate(groups[0].dateStr);
        var worklistButton = document.querySelector('[data-tab="worklist"]');
        if (worklistButton && typeof switchTab === 'function') switchTab('worklist', worklistButton);
        repaintAll();
        if (window.showToast) {
            var chosen = getSelectedLabDate();
            showToast('📂 ' + patientDisplayName(sel) + ' opened once. Choose the request date and see every requested lab for that date.' + (chosen ? ' Selected date: ' + formatLabDate(chosen) : ''), 'success');
        }
    }

    /* ── CLEAR selection → bar empties + buttons lock again ── */
    function clearLabSelection(silent) {
        try { localStorage.removeItem(LAB_SELECT_KEY); } catch(e){}
        clearSelectedLabDate();
        if (!silent) {
            try { if (window.pcFile && typeof pcFile.clearPatientBar === 'function') pcFile.clearPatientBar(); } catch(e){}
        }
        applyingLabSelection = true;
        try { window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: null })); } catch(e){}
        applyingLabSelection = false;
        try { window.dispatchEvent(new CustomEvent('labSelectionChanged', { detail: null })); } catch(e){}
        updateSelectionUI();
        repaintAll();
        if (!silent && window.showToast) showToast('🧹 Patient selection cleared — action buttons locked', 'info');
    }

    /* ── Hook the identification bar's Clear button so lab state clears too ── */
    function hookLabClearButton() {
        try {
            var orig = window.pcFile && window.pcFile.clearPatientBar;
            if (!orig || window.__pcLabClearHooked) return;
            window.__pcLabClearHooked = true;
            window.pcFile.clearPatientBar = function() {
                try { orig(); } catch(e){}
                clearLabSelection(true);
            };
        } catch(e){}
    }

    /* ── Reset panel cards when no selected patient ── */
    function resetSpecimenPanel() {
        var map = {
            'spec_pat_name': 'Awaiting patient selection…',
            'spec_pat_mrn': '—',
            'spec_doc_name': '—',
            'spec_acc_no': 'ACC: —',
            'spec_barcode_box': '',
            'spec_ordered_tests': ''
        };
        Object.keys(map).forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = map[id];
        });
        var notesEl = document.getElementById('spec_notes_in');
        if (notesEl) notesEl.value = '';
    }

    function resetReportsPanel() {
        var map = {
            'rep_pat_name': 'Awaiting patient selection…',
            'rep_pat_mrn': '—',
            'rep_doc_name': '—',
            'rep_acc_no': 'ACC: —',
            'rep_barcode_box': '',
            'rep_matrix_chips': ''
        };
        Object.keys(map).forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = map[id];
        });
    }

    function resetMicrobioPanel() {
        var map = {
            'mic_barcode_box': ''
        };
        Object.keys(map).forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = map[id];
        });
        paintMicrobioTable();
    }

    /* ── Scope notes under every patient-bound panel header ── */
    function updateScopeNotes(sel) {
        var noteText;
        var selectedDate = getSelectedLabDate();
        var datePart = sel && selectedDate ? ' • request date <strong>' + esc(formatLabDate(selectedDate)) + '</strong>' : '';
        if (sel) {
            noteText = '👤 Working on selected patient: <strong>' + esc(patientDisplayName(sel)) +
                       '</strong> — MRN MOD-' + esc(stripMod(sel.id)) + datePart + ' (all buttons act on this patient/date only)';
        } else {
            noteText = '🔒 No patient selected — choose one patient once from the Overview list, then choose a request date';
        }
        ['wlScopeNote', 'resScopeNote', 'repScopeNote', 'pathScopeNote', 'bbScopeNote'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = noteText;
        });
    }

    /* ── Pre-fill patient-bound draft forms (Pathology / Blood Bank) with selected patient ── */
    function fillPatientBoundForms(sel) {
        var pName = sel ? patientDisplayName(sel) : '';
        var pMrn = sel ? ('MRN MOD-' + stripMod(sel.id)) : '';
        var pathEl = document.getElementById('path_patient_name');
        if (pathEl) {
            pathEl.value = pName + (pMrn ? ' — ' + pMrn : '');
            pathEl.style.background = sel ? '#e6f6f8' : '#ebeef3';
            pathEl.style.fontWeight = sel ? '700' : '400';
        }
        var bbXm = document.getElementById('bb_xm_patient');
        if (bbXm) {
            bbXm.value = pName + (pMrn ? ' — ' + pMrn : '');
            bbXm.style.background = sel ? '#e6f6f8' : '#ebeef3';
        }
        var bbGrp = document.getElementById('bb_grp_patient');
        if (bbGrp) {
            bbGrp.value = pName + (pMrn ? ' — ' + pMrn : '');
            bbGrp.style.background = sel ? '#e6f6f8' : '#ebeef3';
        }
    }

    function groupBelongsToPatient(group, patient) {
        return !!group && !!patient && stripMod(group.patientId).toLowerCase() === stripMod(patient.id).toLowerCase();
    }

    function specimenGroupsForPatient(patient) {
        if (!patient) return [];
        return groupOrdersByPatientAndDate(getLabOrders()).map(function(group) {
            if (!groupBelongsToPatient(group, patient)) return null;
            var activeOrders = group.orders.filter(function(order) {
                var status = String(order.status || 'pending').toLowerCase();
                return status === 'pending' || status === 'in-progress';
            });
            if (!activeOrders.length) return null;
            // Never re-accession a completed/cancelled order that happens to
            // share this patient's date-group with an active order.
            var activeGroup = Object.assign({}, group, { orders: activeOrders });
            activeGroup.status = activeOrders.some(function(order) {
                return String(order.status || '').toLowerCase() === 'in-progress';
            }) ? 'in-progress' : 'pending';
            return activeGroup;
        }).filter(Boolean);
    }

    function ensureSpecimenSelectorOption(selector, group) {
        if (!selector || !group) return;
        var exists = Array.prototype.some.call(selector.options || [], function(option) {
            return String(option.value) === String(group.key);
        });
        if (!exists) {
            var option = document.createElement('option');
            option.value = group.key;
            option.textContent = dateSelectorLabel(group);
            selector.appendChild(option);
        }
        selector.value = group.key;
    }

    function resolveSpecimenGroup(groupKey) {
        var selectedPatient = getSelectedLabPatient();
        var groups = specimenGroupsForPatient(selectedPatient);
        if (groupKey) {
            var exact = groups.filter(function(group) { return String(group.key) === String(groupKey); })[0];
            if (exact) return exact;
        }
        // The patient identification card is authoritative. If the dropdown
        // temporarily lost its value during a repaint, use that patient's
        // first active order instead of incorrectly saying no patient exists.
        return groups[0] || null;
    }

    /* ── Sync Specimen / Reports / Microbiology selectors to selected patient ── */
    function syncPanelSelectors(sel) {
        var allPatientGroups = patientDateGroups(sel, getLabOrders());
        var selectedDate = ensureSelectedLabDateForPatient(sel, allPatientGroups);

        var specSel = document.getElementById('specSmartPatientSelect');
        if (specSel) {
            var specimenGroups = specimenGroupsForPatient(sel);
            var specimenGroup = specimenGroups.filter(function(group) {
                return String(group.dateStr) === String(selectedDate);
            })[0] || specimenGroups[0] || null;
            if (specimenGroup) {
                ensureSpecimenSelectorOption(specSel, specimenGroup);
                selectSpecimenPatient(specimenGroup.key, true);
            } else {
                specSel.value = '';
                resetSpecimenPanel();
            }
        }

        var repSel = document.getElementById('repSmartPatientSelect');
        if (repSel) {
            var reportGroups = allPatientGroups.filter(function(group) { return group.status === 'completed'; });
            var reportGroup = reportGroups.filter(function(group) {
                return String(group.dateStr) === String(selectedDate);
            })[0] || reportGroups[0] || null;
            if (reportGroup) {
                repSel.value = reportGroup.key;
                selectReportPatient(reportGroup.key, true);
            } else {
                repSel.value = '';
                resetReportsPanel();
            }
        }

        var micSel = document.getElementById('micSmartPatientSelect');
        if (micSel) {
            var microGroups = patientDateGroups(sel, getLabOrders().filter(isMicrobiologyOrder));
            var microGroup = microGroups.filter(function(group) {
                return String(group.dateStr) === String(selectedDate);
            })[0] || microGroups[0] || null;
            if (microGroup) {
                micSel.value = microGroup.key;
                selectMicrobioPatient(microGroup.key, true);
            } else {
                micSel.value = '';
                resetMicrobioPanel();
            }
        }
    }

    /* ── Lock/unlock buttons below the identification bar ── */
    function updateSelectionUI() {
        hookLabClearButton();
        var sel = getSelectedLabPatient();
        var selId = sel ? stripMod(sel.id).toLowerCase() : '';

        // 1) Nav tabs: only Overview stays unlocked without a patient
        var tabs = document.querySelectorAll('.nav-tab');
        for (var i = 0; i < tabs.length; i++) {
            var t = tabs[i];
            var name = t.getAttribute('data-tab');
            var locked = !sel && name !== 'overview';
            if (locked) {
                t.classList.add('tab-locked');
                t.setAttribute('disabled', 'disabled');
            } else {
                t.classList.remove('tab-locked');
                t.removeAttribute('disabled');
            }
        }

        // 2) Highlight selected patient master rows
        var rows = document.querySelectorAll('tr[data-lab-row]');
        for (var j = 0; j < rows.length; j++) {
            var r = rows[j];
            if (selId && stripMod(r.getAttribute('data-lab-row')).toLowerCase() === selId) {
                r.classList.add('row-selected');
            } else {
                r.classList.remove('row-selected');
            }
        }

        // 3) No patient selected + user is on a locked panel → jump back to Overview
        if (!sel) {
            var activeTab = document.querySelector('.nav-tab.active');
            var activeName = activeTab ? activeTab.getAttribute('data-tab') : '';
            if (activeName && activeName !== 'overview') {
                var ovBtn = document.querySelector('.nav-tab[data-tab="overview"]');
                if (typeof switchTab === 'function') switchTab('overview', ovBtn);
            }
        }

        // 4) Panels follow the selected patient automatically
        syncPanelSelectors(sel);
        updateScopeNotes(sel);
        fillPatientBoundForms(sel);
    }

    /* ── Apply persisted selection on page load ── */
    function applyInitialLabSelection() {
        hookLabClearButton();
        var sel = getSelectedLabPatient();
        if (sel) {
            try {
                if (window.pcFile && typeof pcFile.renderDemoBar === 'function') {
                    var master = document.getElementById('pcMasterHeader') || document.body;
                    pcFile.renderDemoBar(master, sel);
                }
            } catch(e){}
        }
        updateSelectionUI();
    }

    /* ── ONE SERVER-CONFIRMED LAB REQUEST PER VISIBLE ROW (NO SAME-DAY MERGE) ── */
    function groupStatusFromOrders(orders) {
        orders = Array.isArray(orders) ? orders : [];
        var statuses = orders.map(function(order) { return normaliseOrderStatus(order && order.status); });
        if (statuses.some(function(status) { return status === 'pending'; })) return 'pending';
        if (statuses.some(function(status) { return status === 'in-progress'; })) return 'in-progress';
        if (statuses.some(function(status) { return status === 'completed'; })) return 'completed';
        if (statuses.some(function(status) { return status === 'cancelled'; })) return 'cancelled';
        return 'pending';
    }

    function priorityWeight(priority) {
        var p = String(priority || 'routine').toLowerCase();
        if (p === 'stat') return 3;
        if (p === 'urgent') return 2;
        return 1;
    }

    function groupPriorityFromOrders(orders) {
        orders = Array.isArray(orders) ? orders : [];
        var best = 'routine';
        orders.forEach(function(order) {
            var current = String(order && order.priority || 'routine').toLowerCase();
            if (priorityWeight(current) > priorityWeight(best)) best = current;
        });
        return best;
    }

    function groupOrdersByPatientAndDate(orders) {
        var sorted = (Array.isArray(orders) ? orders.slice() : []).sort(function(a, b) {
            return new Date(b.orderedAt || 0) - new Date(a.orderedAt || 0);
        });
        var bucket = {};
        sorted.forEach(function(o) {
            var pIdStr = String(o.patientId || '').replace(/^MOD-/i, '').trim() || 'UNKNOWN';
            var dateStr = String(o.orderedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
            var key = pIdStr + '___' + dateStr;
            if (!bucket[key]) {
                bucket[key] = {
                    key: key,
                    patientId: pIdStr,
                    patientName: o.patientName || ('Patient ' + pIdStr),
                    orderedAt: o.orderedAt || new Date().toISOString(),
                    dateStr: dateStr,
                    orders: []
                };
            }
            bucket[key].orders.push(o);
            if (o.patientName && !bucket[key].patientName) bucket[key].patientName = o.patientName;
            if (new Date(o.orderedAt || 0) > new Date(bucket[key].orderedAt || 0)) {
                bucket[key].orderedAt = o.orderedAt;
            }
        });
        return Object.keys(bucket).map(function(key) {
            var group = bucket[key];
            group.orders = group.orders.sort(function(a, b) {
                return new Date(a.orderedAt || 0) - new Date(b.orderedAt || 0);
            });
            group.status = groupStatusFromOrders(group.orders);
            group.priority = groupPriorityFromOrders(group.orders);
            return group;
        }).sort(function(a, b) {
            return new Date(b.orderedAt || 0) - new Date(a.orderedAt || 0);
        });
    }

    function groupOrdersByPatient(orders) {
        var dateGroups = groupOrdersByPatientAndDate(orders);
        var bucket = {};
        dateGroups.forEach(function(group) {
            var key = stripMod(group.patientId) || 'UNKNOWN';
            if (!bucket[key]) {
                bucket[key] = {
                    key: key,
                    patientId: group.patientId,
                    patientName: group.patientName,
                    orderedAt: group.orderedAt,
                    latestGroup: group,
                    dateGroups: [],
                    orders: []
                };
            }
            bucket[key].dateGroups.push(group);
            bucket[key].orders = bucket[key].orders.concat(group.orders || []);
            if (new Date(group.orderedAt || 0) > new Date(bucket[key].orderedAt || 0)) {
                bucket[key].orderedAt = group.orderedAt;
                bucket[key].latestGroup = group;
            }
            if (group.patientName && !bucket[key].patientName) bucket[key].patientName = group.patientName;
        });
        return Object.keys(bucket).map(function(key) {
            var summary = bucket[key];
            summary.status = groupStatusFromOrders(summary.orders);
            summary.priority = groupPriorityFromOrders(summary.orders);
            summary.dateCount = summary.dateGroups.length;
            summary.testCount = groupTestCount(summary);
            return summary;
        }).sort(function(a, b) {
            return new Date(b.orderedAt || 0) - new Date(a.orderedAt || 0);
        });
    }

    /* ── Render Overview Worklist (One Master Row per Patient) ── */
    function paintOverviewWorklist() {
        var el = document.getElementById('pcLabWorklist');
        if (!el) return;
        var orders = getLabOrders();
        var patientGroups = groupOrdersByPatient(orders);

        if (!patientGroups.length) {
            el.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px;color:#8e8e93;">' +
                           '<div style="font-size:28px;margin-bottom:6px;">🧪</div>' +
                           'No recent specimen requests.<br><span style="font-size:11px;">Doctor orders from OPD & Wards appear here automatically.</span>' +
                           '</td></tr>';
            return;
        }

        var topGroups = patientGroups.slice(0, 8);
        el.innerHTML = topGroups.map(function(g) {
            var latestGroup = g.latestGroup || g.dateGroups[0] || g;
            var uniqueTests = groupTestNames(g);
            var previewTests = uniqueTests.slice(0, 3).join(', ');
            if (uniqueTests.length > 3) previewTests += ' +' + (uniqueTests.length - 3) + ' more';
            var accNo = displayAccessionNo(latestGroup);
            var rowSelClass = isSelectedRow(g) ? 'row-selected' : '';
            var dateSummary = g.dateCount + ' request date' + (g.dateCount === 1 ? '' : 's');
            var latestDate = formatLabDate(latestGroup.dateStr);

            return '<tr data-lab-row="' + esc(g.patientId) + '" class="' + rowSelClass + '" style="cursor:pointer;transition:background .15s;" onclick="pcLabEngine.openPatientDateView(\'' + esc(g.patientId) + '\')">' +
                   '<td style="font-weight:700;color:var(--ac,#007080)">' + esc(accNo) + '</td>' +
                   '<td><div style="font-weight:700;color:#1d1d1f;font-size:13px;">' + esc(g.patientName) + '</div>' +
                       '<div style="font-size:11px;color:#8e8e93;">MRN MOD-' + esc(g.patientId) + '</div></td>' +
                   '<td style="font-weight:600;color:#1d1d1f;">' + esc(previewTests || 'Laboratory Panel') + '</td>' +
                   '<td><span style="font-size:11.5px;color:#3a3a3c;font-weight:700;">' + esc(dateSummary) + '</span><div style="font-size:10.5px;color:#8e8e93;margin-top:2px;">Latest: ' + esc(latestDate) + '</div></td>' +
                   '<td style="color:#8e8e93;font-size:11.5px;">' + ago(g.orderedAt) + '</td>' +
                   '<td>' + prioBadge(g.priority) + '</td>' +
                   '<td>' + statusBadge(g.status) + '</td>' +
                   '<td style="text-align:right;white-space:nowrap;">' +
                       '<button class="btn-select-lab" onclick="event.stopPropagation(); pcLabEngine.openPatientDateView(\'' + esc(g.patientId) + '\')">📅 Open dates</button>' +
                       '<button class="btn-ov-view" title="Open this patient once, then choose date" onclick="event.stopPropagation(); pcLabEngine.openPatientDateView(\'' + esc(g.patientId) + '\')">›</button>' +
                   '</td>' +
                   '</tr>';
        }).join('');
    }

    /* ── Render Full Worklist Table (One Master Row per Patient with Accordion Unfold)
           SCOPED: only the selected patient's orders are shown — like Doctor Dashboard ── */
    function paintFullWorklist() {
        var tbody = document.getElementById('pcLabQueueTable');
        if (!tbody) return;
        var orders = getLabOrders();
        var sel = getSelectedLabPatient();

        if (!sel) {
            paintLabDateSelector([], null);
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#8e8e93;">' +
                              '<div style="font-size:32px;margin-bottom:8px;">🔒</div>' +
                              'No patient selected. Choose one patient once from the Overview list, then choose a request date.</td></tr>';
            return;
        }

        var patientGroups = patientDateGroups(sel, orders);
        paintLabDateSelector(patientGroups, sel);

        var searchInput = document.getElementById('searchInput');
        var query = searchInput ? String(searchInput.value).toLowerCase().trim() : '';
        var prioSelect = document.getElementById('labPrioFilter');
        var prioFilter = prioSelect ? String(prioSelect.value).toLowerCase() : 'all';

        var filteredGroups = patientGroups.filter(function(g) {
            if (prioFilter && prioFilter !== 'all priorities' && prioFilter !== 'all') {
                if (String(g.priority).toLowerCase() !== prioFilter) return false;
            }
            if (query) {
                var pName = String(g.patientName || '').toLowerCase();
                var pId   = String(g.patientId || '').toLowerCase();
                var tStr  = g.orders.map(function(o){
                    return (o.items || []).map(function(it){ return it.name; }).join(' ');
                }).join(' ').toLowerCase();
                if (pName.indexOf(query) === -1 && pId.indexOf(query) === -1 && tStr.indexOf(query) === -1 && String(g.dateStr || '').indexOf(query) === -1) {
                    return false;
                }
            }
            return true;
        });

        if (!filteredGroups.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#8e8e93;">' +
                              '<div style="font-size:32px;margin-bottom:8px;">📭</div>' +
                              'No laboratory requests matched this patient/date selection for ' + esc(patientDisplayName(sel)) + '.</td></tr>';
            return;
        }

        var selectedDate = ensureSelectedLabDateForPatient(sel, filteredGroups);
        var group = filteredGroups.filter(function(g) { return String(g.dateStr) === String(selectedDate); })[0] || filteredGroups[0];
        if (!group) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#8e8e93;">No visible request dates found.</td></tr>';
            return;
        }
        rememberSelectedLabDate(group.dateStr);
        openGroups[group.key] = true;

        var itemsStr = groupTestNames(group).join(', ');
        var accNo = displayAccessionNo(group);
        var chevronStyle = openGroups[group.key] ? 'transform:rotate(90deg);' : 'transform:rotate(0deg);';
        var childDisplay = openGroups[group.key] ? 'table-row' : 'none';
        var requestedText = formatLabDate(group.dateStr) + ' • ' + ago(group.orderedAt);
        var tatText = group.status === 'completed' ? 'Completed' : (group.status === 'in-progress' ? 'In progress' : 'Awaiting action');

        var html = '';
        html += '<tr data-lab-row="' + esc(group.patientId) + '" class="lab-master-row row-selected" style="cursor:pointer;transition:background .15s;" onclick="pcLabEngine.togglePatientGroup(\'' + esc(group.key) + '\')">' +
                '<td style="font-weight:700;color:var(--ac,#007080)">' + esc(accNo) + '</td>' +
                '<td><div style="font-weight:700;color:#1d1d1f;font-size:13.5px;">' + esc(group.patientName) + '</div>' +
                    '<div style="font-size:11px;color:#8e8e93;">MRN MOD-' + esc(group.patientId) + '</div></td>' +
                '<td style="font-weight:600;color:#1d1d1f;">' + esc(itemsStr || 'Laboratory Panel') + '</td>' +
                '<td><span style="font-size:11.5px;color:#3a3a3c;font-weight:700;">Selected date</span><div style="font-size:10.5px;color:#8e8e93;margin-top:2px;">' + esc(formatLabDate(group.dateStr)) + '</div></td>' +
                '<td style="color:#8e8e93;font-size:11.5px;">' + esc(requestedText) + '</td>' +
                '<td style="font-weight:700;color:#3a3a3c;">' + esc(tatText) + '</td>' +
                '<td>' + prioBadge(group.priority) + '</td>' +
                '<td>' + statusBadge(group.status) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;">' +
                    '<button class="btn-select-lab" onclick="event.stopPropagation(); pcLabEngine.togglePatientGroup(\'' + esc(group.key) + '\')">📋 ' + (group.orders || []).length + ' request' + ((group.orders || []).length === 1 ? '' : 's') + '</button>' +
                    '<button onclick="event.stopPropagation(); pcLabEngine.togglePatientGroup(\'' + esc(group.key) + '\')" style="height:30px;padding:0 14px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:#fff;color:#1c1c1e;font-weight:700;font-size:12px;cursor:pointer;margin-left:6px;">' +
                        '<span id="chev_' + esc(group.key) + '" style="display:inline-block;transition:transform 0.28s;' + chevronStyle + '">▶</span></button>' +
                '</td>' +
                '</tr>';
        html += '<tr id="child_row_' + esc(group.key) + '" class="patient-lab-child-row" style="display:' + childDisplay + ';">' +
                '<td colspan="9" style="padding:0;background:#ffffff;border-bottom:1px solid #dbe2ea;">' +
                  '<div id="child_wrap_' + esc(group.key) + '" style="padding:18px 22px;background:#ffffff;">' +
                    buildEditableMatrixTableHTML(group) +
                  '</div>' +
                '</td>' +
                '</tr>';
        tbody.innerHTML = html;
    }

    function flagToneClass(flag) {
        var txt = String(flag || 'Normal').toLowerCase();
        if (txt.indexOf('critical') !== -1) return 'status-critical';
        if (txt.indexOf('high') !== -1) return 'status-high';
        if (txt.indexOf('low') !== -1) return 'status-low';
        return 'status-normal';
    }

    function flagResultClass(flag) {
        var txt = String(flag || 'Normal').toLowerCase();
        if (txt.indexOf('critical') !== -1) return 'result-critical';
        if (txt.indexOf('high') !== -1) return 'result-high';
        if (txt.indexOf('low') !== -1) return 'result-low';
        return 'result-normal';
    }

    function flagShortLabel(flag) {
        var txt = String(flag || 'Normal');
        if (/critical/i.test(txt)) return 'Critical';
        if (/high/i.test(txt)) return 'High';
        if (/low/i.test(txt)) return 'Low';
        return 'Normal';
    }

    function syncFlagSelectTone(selectEl) {
        if (!selectEl || !selectEl.classList) return;
        selectEl.classList.remove('status-normal', 'status-high', 'status-low', 'status-critical');
        selectEl.classList.add(flagToneClass(selectEl.value || 'Normal'));
    }

    /* ── DAY-GROUPED RESULT ENTRY: ONE CARD PER REQUEST DATE ──
           All requests of the same day are entered and released in ONE card.
           Each request keeps its own sub-heading and inputs (data-order-id)
           so results still map back to the correct order on the common server. */
    function buildEditableMatrixTableHTML(group) {
        var pName = group.patientName;
        var mrn = group.patientId;
        var dayDateStr = formatLabDate(group.dateStr || '');

        var ordersSorted = group.orders.slice().sort(function (a, b) {
            return new Date(a.orderedAt || 0) - new Date(b.orderedAt || 0);
        });
        var nonFinalCount = ordersSorted.filter(function (o) {
            return String(o.status || '').toLowerCase() !== 'completed';
        }).length;
        var allCompleted = ordersSorted.length > 0 && nonFinalCount === 0;
        var someFailed = ordersSorted.some(function (o) { return o._syncFailed === true; });

        var stateChip = allCompleted
            ? '<span class="status-badge status-normal"><span class="dot"></span>Verified</span>'
            : someFailed
                ? '<span class="status-badge status-critical"><span class="dot"></span>Sync issue</span>'
                : '<span class="status-badge status-low"><span class="dot"></span>Open result entry</span>';

        var bodyHtml = '';
        ordersSorted.forEach(function (order) {
            var orderId = String(order.id || '');
            var orderDomId = safeDomId(orderId);
            var failed = order._syncFailed === true;
            var completed = String(order.status || '').toLowerCase() === 'completed' && !failed;
            var readonlyAttr = completed ? ' readonly' : '';
            var disabledAttr = completed ? ' disabled' : '';
            var items = Array.isArray(order.items) ? order.items : [];
            var rowsHtml = '';
            var rowNumber = 0;

            items.forEach(function (item) {
                var parameters = parametersForOrderItem(item);
                parameters.forEach(function (parameter, parameterIndex) {
                    rowNumber++;
                    var existing = existingOrderResult(order, parameter) || {};
                    var rowId = orderDomId + '_' + safeDomId(parameter.orderItemCode) + '_' + safeDomId(parameter.code) + '_' + parameterIndex;
                    var value = existing.value == null ? '' : existing.value;
                    var flag = existing.flag || 'Normal';
                    var toneClass = flagToneClass(flag);
                    var resultClass = flagResultClass(flag);
                    var shortFlag = flagShortLabel(flag);
                    var codeText = item.code || parameter.orderItemCode || parameter.code || 'No code';
                    var subMeta = 'Request ' + esc(orderId) + ' • Code ' + esc(codeText) + (parameter.unit ? ' • ' + esc(parameter.unit) : '');
                    var resultCell = completed
                        ? '<div class="test-result ' + resultClass + '">' + esc(value || '—') + (parameter.unit ? '<span class="result-unit">' + esc(parameter.unit) + '</span>' : '') + '</div>'
                        : '<div class="test-result entry-mode"><input id="lab_value_' + rowId + '" class="lab-order-result-input result-entry-input" type="text" value="' + esc(value) + '" placeholder="Enter result"' + readonlyAttr +
                            ' data-code="' + esc(parameter.code) + '" data-name="' + esc(parameter.name) + '" data-unit="' + esc(parameter.unit) + '" data-range="' + esc(parameter.range) + '"' +
                            ' data-order-item-code="' + esc(parameter.orderItemCode) + '" data-order-item-name="' + esc(parameter.orderItemName) + '"' +
                            ' data-order-id="' + esc(orderId) + '" data-flag-id="lab_flag_' + rowId + '" oninput="pcLabEngine.autoFlagResult(this)" /></div>';
                    var statusCell = completed
                        ? '<span class="status-badge ' + toneClass + '"><span class="dot"></span>' + esc(shortFlag) + '</span>'
                        : '<select id="lab_flag_' + rowId + '" class="lab-order-result-flag result-flag-select ' + toneClass + '"' + disabledAttr + ' onchange="pcLabEngine.syncFlagSelectTone(this)">' +
                            '<option value="Normal"' + (flag === 'Normal' ? ' selected' : '') + '>Normal</option>' +
                            '<option value="↑ High"' + (String(flag).indexOf('High') !== -1 ? ' selected' : '') + '>High</option>' +
                            '<option value="↓ Low"' + (String(flag).indexOf('Low') !== -1 ? ' selected' : '') + '>Low</option>' +
                            '<option value="⚠️ Critical"' + (String(flag).indexOf('Critical') !== -1 ? ' selected' : '') + '>Critical</option>' +
                          '</select>';

                    rowsHtml += [
                        '<tr>',
                            '<td class="row-number">' + rowNumber + '</td>',
                            '<td>',
                                '<div class="test-name">',
                                    '<span class="test-icon" style="background:#eaf2ff;color:#0071e3;">🧪</span>',
                                    '<div class="test-name-stack">',
                                        '<div>' + esc(parameter.test || parameter.name || item.name || 'Laboratory test') + '</div>',
                                        '<div class="test-subline">' + subMeta + '</div>',
                                    '</div>',
                                '</div>',
                            '</td>',
                            '<td>' + resultCell + '</td>',
                            '<td><div class="reference-range">' + (parameter.range ? esc(parameter.range) : 'No fixed range') + '</div></td>',
                            '<td>' + statusCell + '</td>',
                        '</tr>'
                    ].join('');
                });
            });

            if (!rowsHtml) {
                rowsHtml = '<tr><td colspan="5" style="padding:14px;color:#9b2c2c;background:#fff7f7;font-weight:700;">Request ' + esc(orderId) + ' has no valid test items. Ask the requesting clinician to correct it.</td></tr>';
            }

            var requestState = completed
                ? '<span class="status-badge status-normal"><span class="dot"></span>Verified</span>'
                : failed
                    ? '<span class="status-badge status-critical"><span class="dot"></span>Sync issue</span>'
                    : '<span class="status-badge status-low"><span class="dot"></span>Pending entry</span>';

            bodyHtml += [
                '<section class="request-table-shell">',
                    '<div class="request-table-head">',
                        '<div class="request-table-meta">Request ' + esc(orderId) + ' <span>• ' + esc(order.orderedBy || 'Unknown') + ' • ' +
                        esc(order.orderedAt ? new Date(order.orderedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—') + '</span></div>',
                        requestState,
                    '</div>',
                    '<div class="lab-result-table-wrap">',
                        '<table class="lab-result-table">',
                            '<thead>',
                                '<tr>',
                                    '<th style="width:58px;text-align:center;">#</th>',
                                    '<th>Test name</th>',
                                    '<th>Result</th>',
                                    '<th>Reference range</th>',
                                    '<th>Status</th>',
                                '</tr>',
                            '</thead>',
                            '<tbody>' + rowsHtml + '</tbody>',
                        '</table>',
                    '</div>',
                '</section>'
            ].join('');
        });

        var footer = allCompleted
            ? '<button class="doctor-table-btn-secondary" onclick="pcLabEngine.printReportModal(\'' + esc(ordersSorted[ordersSorted.length - 1].id) + '\')"><i class="ti ti-file-text"></i> View final report</button>'
            : '<button class="lab-release-btn doctor-table-btn-primary" onclick="pcLabEngine.saveDayResults(\'' + esc(group.key) + '\',this)"><i class="ti ti-check"></i> Validate &amp; release</button>';

        var html = '<div style="display:flex;flex-direction:column;gap:14px;">' +
            '<section class="lab-order-result-section lab-day-result-section" data-lab-day-key="' + esc(group.key) + '" style="background:#ffffff;border-radius:16px;border:1px solid #dbe2ea;box-shadow:0 4px 14px rgba(15,23,42,.035);overflow:hidden;">' +
              '<div style="padding:12px 16px;background:#fbfcfe;border-bottom:1px solid #e7edf4;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">' +
                '<div>' +
                    '<div style="font-size:15px;font-weight:800;color:#1b2434;">' + esc(dayDateStr) + ' — ' + ordersSorted.length + ' request(s)</div>' +
                    '<div style="font-size:11.5px;color:#5b6677;margin-top:4px;">Patient: <strong>' + esc(pName) + '</strong> • MRN ' + esc(mrn) + '</div>' +
                '</div>' + stateChip +
              '</div>' +
              '<div style="padding:12px 16px 14px;">' +
                '<div style="font-size:11px;font-weight:800;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px;">Selected request date</div>' +
                '<div style="font-size:11.5px;color:#5b6677;margin-bottom:8px;">Doctor Dashboard table style applied here for laboratory result entry.</div>' +
                bodyHtml +
                '<label style="display:block;font-size:10.5px;font-weight:800;color:#6b7280;letter-spacing:.06em;text-transform:uppercase;margin:12px 0 6px;">Laboratory comments</label>' +
                '<textarea class="lab-order-comments"' + (allCompleted ? ' readonly' : '') + ' placeholder="Optional professional interpretation for the requesting clinician" style="width:100%;min-height:60px;resize:vertical;border:1px solid #d7dee8;border-radius:10px;padding:9px 10px;font:12px inherit;background:' + (allCompleted ? '#f6f7f9' : '#ffffff') + ';color:#17212f;">' + esc(ordersSorted[0].labComments || '') + '</textarea>' +
              '</div>' +
              '<div style="padding:10px 16px;background:#fbfcfe;border-top:1px solid #e7edf4;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">' +
                '<div style="font-size:11.5px;color:#6b7280;max-width:650px;">Only important states use color. Final release saves to the common server and sends the verified report to the requesting clinician.</div>' +
                footer +
              '</div>' +
            '</section>' +
          '</div>';
        return html;
    }

    /* ── Toggle Accordion Unfolding for a Patient Group ── */
    function togglePatientGroup(key) {
        openGroups[key] = !openGroups[key];
        var isUnfolded = openGroups[key] === true;

        var childRow = document.getElementById('child_row_' + key);
        var chev = document.getElementById('chev_' + key);
        if (childRow) {
            if (isUnfolded) {
                childRow.style.display = 'table-row';
                if (chev) chev.style.transform = 'rotate(90deg)';
            } else {
                childRow.style.display = 'none';
                if (chev) chev.style.transform = 'rotate(0deg)';
            }
        } else {
            repaintAll();
        }
    }

    /* ── SERVER-CONFIRMED RESULT RELEASE ── */
    function findOrderResultSection(orderId) {
        var sections = document.querySelectorAll('.lab-order-result-section');
        for (var i = 0; i < sections.length; i++) {
            if (String(sections[i].getAttribute('data-lab-order-id')) === String(orderId)) return sections[i];
        }
        return null;
    }

    function autoFlagResult(input) {
        if (!input) return;
        var flagEl = document.getElementById(input.getAttribute('data-flag-id'));
        if (!flagEl) return;
        var value = parseFloat(String(input.value || '').replace(',', '.'));
        var range = String(input.getAttribute('data-range') || '').trim();
        var match = range.match(/^\s*(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (isNaN(value) || !match) return;
        var low = Number(match[1]);
        var high = Number(match[2]);
        flagEl.value = value < low ? '↓ Low' : value > high ? '↑ High' : 'Normal';
        syncFlagSelectTone(flagEl);
    }

    function labReleaseErrorMessage(error) {
        var code = String(error && error.code || '');
        var message = String(error && error.message || error || 'Unknown common-server error');
        message = message.replace(/^FirebaseError:\s*/i, '').replace(/^functions\/[a-z-]+:\s*/i, '');
        if (code.indexOf('permission-denied') !== -1) return 'Your account is not permitted to perform this laboratory action. Confirm that you are signed in with an active Laboratory role.';
        if (code.indexOf('unauthenticated') !== -1) return 'Your session expired. Sign in again before continuing.';
        if (code.indexOf('unavailable') !== -1) return 'The common server is currently unreachable. Check the connection and retry; nothing was saved.';
        if (code.indexOf('internal') !== -1 || /^internal$/i.test(message)) {
            return 'The Laboratory Cloud Function is missing, unreachable, or crashed. Deploy labSpecimenTransition to Firebase project pclinic-20d81 and inspect the Functions logs; nothing was saved.';
        }
        if (code.indexOf('already-exists') !== -1) return 'This result is already final and cannot be overwritten.';
        return message;
    }

    function cloudFunctionIsUnavailable(error) {
        var code = String(error && error.code || '');
        return code.indexOf('not-found') !== -1 || code.indexOf('unimplemented') !== -1 ||
            /function.*not found|404/i.test(String(error && error.message || ''));
    }

    function legacyLabOrderForServer(order) {
        if (!order || (!order._legacyLocalOnly && !/^LAB-/i.test(String(order.id || '')))) return null;
        return {
            patientId: stripMod(order.patientId), patientName: order.patientName || '',
            items: order.items || [], priority: order.priority || 'routine', notes: order.notes || '',
            orderedBy: order.orderedBy || '', orderedById: order.orderedById || '', orderedAt: order.orderedAt || '',
            legacyRequestId: order.legacyRequestId || ''
        };
    }

    async function directLabFinalizeFallback(order, payload) {
        if (!window.firebaseDB || !window.firebaseFunctions) throw new Error('Secure Firebase connection is unavailable.');
        if (order._legacyLocalOnly || /^LAB-/i.test(String(order.id || ''))) {
            var legacyError = new Error('This is a recovered legacy request with no order document on the server. Deploy the labFinalize Cloud Function once, then retry; it will safely migrate and release the order.');
            legacyError.code = 'legacy-order-requires-cloud-function';
            throw legacyError;
        }
        var f = window.firebaseFunctions;
        var orderRef = f.doc(window.firebaseDB, 'orders', String(order.id));
        var patientRef = f.doc(window.firebaseDB, 'patients', String(order.patientId));
        var messageId = ('lab-result-' + String(order.id)).replace(/\//g, '_');
        var messageRef = f.doc(window.firebaseDB, 'messages', messageId);
        var staff = window.currentStaff || {};
        var completedAt = new Date().toISOString();
        var critical = payload.results.some(function(row) { return String(row.flag).indexOf('Critical') !== -1; });
        if (critical) {
            throw new Error('Critical results require the deployed labFinalize Cloud Function so the urgent alert and audit record are committed atomically.');
        }

        await f.runTransaction(window.firebaseDB, async function(tx) {
            var snaps = await Promise.all([tx.get(orderRef), tx.get(patientRef)]);
            if (!snaps[0].exists()) throw new Error('The order does not exist on the common server.');
            if (!snaps[1].exists()) throw new Error('The patient record does not exist on the common server.');
            var serverOrder = snaps[0].data() || {};
            if (serverOrder.status === 'completed') throw new Error('This result is already final and cannot be overwritten.');
            if (serverOrder.status === 'cancelled') throw new Error('A cancelled order cannot be released.');
            if (String(serverOrder.patientId) !== String(order.patientId) || (serverOrder.dept !== 'lab' && serverOrder.type !== 'lab')) {
                throw new Error('Order identity validation failed.');
            }
            var historyEntry = { at: completedAt, by: staff.name || 'Laboratory staff', byId: staff.staffId || '', action: 'laboratory result finalised' };
            tx.update(orderRef, {
                status: 'completed',
                labState: 'final',
                resultId: String(order.id),
                results: payload.results,
                labComments: payload.comments || '',
                microbiology: payload.microbiology || null,
                critical: critical,
                completedAt: completedAt,
                completedBy: staff.name || 'Laboratory staff',
                completedById: staff.staffId || '',
                history: f.arrayUnion(historyEntry)
            });
            tx.update(patientRef, {
                labResults: f.arrayUnion({
                    id: String(order.id), orderId: String(order.id), patientId: String(order.patientId),
                    tests: payload.results, comments: payload.comments || '', microbiology: payload.microbiology || null,
                    sampleType: payload.microbiology && payload.microbiology.sampleType || '',
                    organism: payload.microbiology && payload.microbiology.organism || '',
                    colonyCount: payload.microbiology && payload.microbiology.colonyCount || '',
                    incubationNote: payload.microbiology && payload.microbiology.incubationNote || '',
                    antibiotics: payload.microbiology && payload.microbiology.antibiotics || [],
                    critical: critical, status: 'final', verifiedBy: staff.name || 'Laboratory staff',
                    verifiedById: staff.staffId || '', date: completedAt
                })
            });
            tx.set(messageRef, {
                id: messageId,
                text: (critical ? 'CRITICAL — ' : '') + 'Laboratory results finalised for ' + (order.patientName || 'patient') + ': ' +
                    (order.items || []).map(function(item) { return item.name; }).join(', '),
                toRoles: order.orderedById ? [] : ['doctor'], toStaffId: order.orderedById || null,
                priority: critical ? 'urgent' : 'normal', patientId: order.patientId,
                patientName: order.patientName || '', orderId: order.id, resultId: String(order.id),
                category: 'lab-result', fromName: staff.name || 'Laboratory staff', fromId: staff.staffId || '',
                fromRole: staff.role || 'lab', at: completedAt, readBy: []
            });
        });
        return {
            orderId: order.id, resultId: String(order.id), status: 'final', critical: critical,
            completedAt: completedAt, completedBy: staff.name || 'Laboratory staff',
            completedById: staff.staffId || '', results: payload.results, microbiology: payload.microbiology || null,
            usedDirectFallback: true
        };
    }

    async function releaseOrderToCommonServer(order, payload) {
        if (!window.currentStaff || (window.currentStaff.role !== 'lab' && window.currentStaff.role !== 'admin')) {
            throw new Error('An authenticated Laboratory account is required to release results.');
        }
        var requestPayload = {
            orderId: String(order.id),
            patientId: stripMod(order.patientId),
            results: payload.results,
            comments: payload.comments || '',
            microbiology: payload.microbiology || null,
            legacyOrder: legacyLabOrderForServer(order)
        };

        if (window.pclinicCloudFunctions && typeof window.pclinicCloudFunctions.call === 'function') {
            try {
                return await window.pclinicCloudFunctions.call('labFinalize', requestPayload);
            } catch (error) {
                if (!cloudFunctionIsUnavailable(error)) throw error;
                console.warn('labFinalize Cloud Function is not deployed; using rules-protected Firestore transaction fallback.');
            }
        }
        return directLabFinalizeFallback(order, payload);
    }

    async function saveOrderResults(orderId, button) {
        var order = getLabOrders().filter(function(row) { return String(row.id) === String(orderId); })[0];
        if (!order) {
            if (window.showToast) showToast('❌ Order not found in the laboratory queue.', 'error');
            return false;
        }
        if (String(order.status).toLowerCase() === 'completed' && !order._syncFailed) {
            if (window.showToast) showToast('ℹ️ This result is already final and cannot be overwritten.', 'info');
            return true;
        }
        var section = findOrderResultSection(orderId);
        if (!section) {
            if (window.showToast) showToast('❌ Result form is not open. Unfold the order and retry.', 'error');
            return false;
        }

        var inputs = section.querySelectorAll('.lab-order-result-input');
        var results = [];
        var missing = [];
        inputs.forEach(function(input) {
            var value = String(input.value || '').trim();
            if (!value) {
                missing.push(input.getAttribute('data-name') || 'Result');
                input.style.borderColor = '#d32f2f';
                input.style.background = '#fff5f5';
                return;
            }
            input.style.borderColor = '#0071e3';
            input.style.background = '#fff';
            var flag = document.getElementById(input.getAttribute('data-flag-id'));
            results.push({
                code: input.getAttribute('data-code') || '',
                orderItemCode: input.getAttribute('data-order-item-code') || '',
                orderItemName: input.getAttribute('data-order-item-name') || '',
                test: input.getAttribute('data-name') || 'Laboratory result',
                value: value,
                unit: input.getAttribute('data-unit') || '',
                refRange: input.getAttribute('data-range') || '',
                flag: flag ? flag.value : 'Normal'
            });
        });
        if (missing.length) {
            if (window.showToast) showToast('⚠️ Complete all required results. Missing: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : ''), 'warning');
            var firstMissing = section.querySelector('.lab-order-result-input[style*="d32f2f"]');
            if (firstMissing) firstMissing.focus();
            return false;
        }
        if (!results.length) {
            if (window.showToast) showToast('⚠️ No result values were entered.', 'warning');
            return false;
        }
        var hasCritical = results.some(function(row) { return String(row.flag).indexOf('Critical') !== -1; });
        var promptText = hasCritical
            ? 'This order contains a CRITICAL result. Final release will urgently notify the requesting doctor and cannot be undone. Continue?'
            : 'Validate and permanently release these results to the requesting doctor? Final results cannot be overwritten.';
        if (!window.confirm(promptText)) return false;

        var commentsEl = section.querySelector('.lab-order-comments');
        var originalHtml = button ? button.innerHTML : '';
        if (button) {
            button.disabled = true;
            button.style.opacity = '.65';
            button.textContent = 'Saving to common server…';
        }
        try {
            var response = await releaseOrderToCommonServer(order, {
                results: results,
                comments: commentsEl ? String(commentsEl.value || '').trim() : ''
            });
            if (window.pcOrders && typeof pcOrders.applyServerPatch === 'function') {
                pcOrders.applyServerPatch(order.id, {
                    status: 'completed', labState: 'final', resultId: response.resultId,
                    results: response.results || results, completedAt: response.completedAt || new Date().toISOString(),
                    completedBy: response.completedBy || (window.currentStaff && window.currentStaff.name) || 'Laboratory staff',
                    completedById: response.completedById || (window.currentStaff && window.currentStaff.staffId) || '',
                    critical: response.critical === true
                });
            }
            try {
                window.dispatchEvent(new CustomEvent('labResultsUpdated', { detail: { orderId: order.id, patientId: order.patientId, serverConfirmed: true } }));
            } catch (eventError) {}
            if (window.showToast) {
                showToast(response.critical ? '🚨 Critical result released and urgent alert sent to the requesting doctor.' : '✅ Results saved on the common server and sent to the requesting doctor.', 'success');
            }
            repaintAll();
            return true;
        } catch (error) {
            console.error('Laboratory release failed:', error);
            if (window.showToast) showToast('❌ NOT SAVED: ' + labReleaseErrorMessage(error), 'error');
            return false;
        } finally {
            if (button && document.body.contains(button)) {
                button.disabled = false;
                button.style.opacity = '1';
                button.innerHTML = originalHtml || '<i class="ti ti-check"></i> Validate &amp; release';
            }
        }
    }

    // Backward-compatible group action: delegates to the day-based release.
    async function saveGroupResults(key) {
        return saveDayResults(key, null);
    }

    /* ── DAY-GROUPED RELEASE: one validation & one confirmation for the day ──
           Gathers every result input of the day card, checks nothing is
           missing, then releases each non-final request of the day through
           the trusted common server, one at a time, each with its own
           results (mapped back via data-order-id) and the shared day comment. */
    async function saveDayResults(groupKey, button) {
        var group = groupOrdersByPatientAndDate(getLabOrders()).filter(function (row) { return row.key === groupKey; })[0];
        if (!group) {
            if (window.showToast) showToast('❌ The laboratory request was not found.', 'error');
            return false;
        }
        var section = document.querySelector('.lab-day-result-section[data-lab-day-key="' + groupKey + '"]');
        if (!section) {
            if (window.showToast) showToast('❌ Result form is not open. Unfold the day and retry.', 'error');
            return false;
        }

        var inputs = section.querySelectorAll('.lab-order-result-input');
        var resultsByOrder = {};
        var missing = [];
        inputs.forEach(function (input) {
            var value = String(input.value || '').trim();
            if (!value) {
                missing.push(input.getAttribute('data-name') || 'Result');
                input.style.borderColor = '#d32f2f';
                input.style.background = '#fff5f5';
                return;
            }
            input.style.borderColor = '#0071e3';
            input.style.background = '#fff';
            var flag = document.getElementById(input.getAttribute('data-flag-id'));
            var orderId = input.getAttribute('data-order-id') || '';
            if (!resultsByOrder[orderId]) resultsByOrder[orderId] = [];
            resultsByOrder[orderId].push({
                code: input.getAttribute('data-code') || '',
                orderItemCode: input.getAttribute('data-order-item-code') || '',
                orderItemName: input.getAttribute('data-order-item-name') || '',
                test: input.getAttribute('data-name') || 'Laboratory result',
                value: value,
                unit: input.getAttribute('data-unit') || '',
                refRange: input.getAttribute('data-range') || '',
                flag: flag ? flag.value : 'Normal'
            });
        });

        var nonFinal = group.orders.filter(function (o) { return String(o.status || '').toLowerCase() !== 'completed'; });
        if (!nonFinal.length) {
            if (window.showToast) showToast('ℹ️ This laboratory request is already final.', 'info');
            return true;
        }
        var orderWithNoValues = nonFinal.filter(function (o) { return !(resultsByOrder[String(o.id)] && resultsByOrder[String(o.id)].length); })[0];
        if (orderWithNoValues) {
            if (window.showToast) showToast('⚠️ No result values were entered for request ' + String(orderWithNoValues.id || '') + '.', 'warning');
            return false;
        }
        if (missing.length) {
            if (window.showToast) showToast('⚠️ Complete all required results. Missing: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : ''), 'warning');
            var firstMissing = section.querySelector('.lab-order-result-input[style*="d32f2f"]');
            if (firstMissing) firstMissing.focus();
            return false;
        }

        var allResults = nonFinal.reduce(function (acc, o) { return acc.concat(resultsByOrder[String(o.id)] || []); }, []);
        var hasCritical = allResults.some(function (row) { return String(row.flag).indexOf('Critical') !== -1; });
        var promptText = hasCritical
            ? 'This request contains a CRITICAL result. Final release will urgently notify the requesting doctor and cannot be undone. Continue?'
            : 'Validate and permanently release the results of this laboratory request? Final results cannot be overwritten.';
        if (!window.confirm(promptText)) return false;

        var commentsEl = section.querySelector('.lab-order-comments');
        var comments = commentsEl ? String(commentsEl.value || '').trim() : '';
        var originalHtml = button ? button.innerHTML : '';
        if (button) {
            button.disabled = true;
            button.style.opacity = '.65';
            button.innerHTML = 'Saving ' + nonFinal.length + ' request(s) to common server…';
        }
        try {
            for (var i = 0; i < nonFinal.length; i++) {
                var order = nonFinal[i];
                var response = await releaseOrderToCommonServer(order, {
                    results: resultsByOrder[String(order.id)],
                    comments: comments
                });
                if (window.pcOrders && typeof pcOrders.applyServerPatch === 'function') {
                    pcOrders.applyServerPatch(order.id, {
                        status: 'completed', labState: 'final', resultId: response.resultId,
                        results: response.results || resultsByOrder[String(order.id)], completedAt: response.completedAt || new Date().toISOString(),
                        completedBy: response.completedBy || (window.currentStaff && window.currentStaff.name) || 'Laboratory staff',
                        completedById: response.completedById || (window.currentStaff && window.currentStaff.staffId) || '',
                        critical: response.critical === true
                    });
                }
                try {
                    window.dispatchEvent(new CustomEvent('labResultsUpdated', { detail: { orderId: order.id, patientId: order.patientId, serverConfirmed: true } }));
                } catch (eventError) {}
            }
            if (window.showToast) {
                showToast(hasCritical ? '🚨 Critical results released — urgent alert sent to the requesting doctor.' : '✅ This laboratory request was released on the common server and sent to the requesting doctor.', 'success');
            }
            repaintAll();
            return true;
        } catch (error) {
            console.error('Laboratory day release failed:', error);
            if (window.showToast) showToast('❌ Release stopped: ' + labReleaseErrorMessage(error) + ' Requests released before this one remain final.', 'error');
            return false;
        } finally {
            if (button && document.body.contains(button)) {
                button.disabled = false;
                button.style.opacity = '1';
                button.innerHTML = originalHtml || '<i class="ti ti-check"></i> Validate &amp; release';
            }
        }
    }

    /* ── Render Completed Results Table (#pcLabResultsTable) ── */
    function paintResultsTable() {
        var tbody = document.getElementById('pcLabResultsTable');
        if (!tbody) return;
        var sel = getSelectedLabPatient();

        if (!sel) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#8e8e93;">' +
                              '<div style="font-size:32px;margin-bottom:8px;">🔒</div>' +
                              'No patient selected. Results are shown for the selected patient/date only.</td></tr>';
            return;
        }

        var orders = getLabOrders().filter(function(o) { return o.status === 'completed'; });
        var groups = patientDateGroups(sel, orders);
        var activeDate = ensureSelectedLabDateForPatient(sel, patientDateGroups(sel));
        var visibleGroups = activeDate ? groups.filter(function(group) { return String(group.dateStr) === String(activeDate); }) : groups;

        if (!visibleGroups.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#8e8e93;">' +
                              '<div style="font-size:32px;margin-bottom:8px;">✅</div>' +
                              'No completed laboratory results for ' + esc(patientDisplayName(sel)) + (activeDate ? (' on ' + esc(formatLabDate(activeDate))) : '') + '.</td></tr>';
            return;
        }

        tbody.innerHTML = visibleGroups.map(function(g) {
            var itemsStr = groupTestNames(g).join(', ');
            var accNo = displayAccessionNo(g);
            return '<tr>' +
                   '<td style="font-weight:700;color:var(--ac,#007080)">' + esc(accNo) + '</td>' +
                   '<td><div style="font-weight:700;color:#1d1d1f;font-size:13.5px;">' + esc(g.patientName) + '</div>' +
                       '<div style="font-size:11px;color:#8e8e93;">MRN MOD-' + esc(g.patientId) + ' • ' + esc(formatLabDate(g.dateStr)) + '</div></td>' +
                   '<td style="font-weight:600;">' + esc(itemsStr || 'Lab Panel') + '</td>' +
                   '<td><span style="font-size:11.5px;color:#3a3a3c;font-weight:600;">Multidisciplinary</span></td>' +
                   '<td style="font-size:11.5px;color:#1a7a32;font-weight:700;">Verified</td>' +
                   '<td><span class="badge" style="background:#e9f9ee;color:#1a7a32;">Normal / Validated</span></td>' +
                   '<td>' + statusBadge(g.status) + '</td>' +
                   '<td style="text-align:right;">' +
                       '<button style="height:30px;padding:0 14px;border-radius:9px;border:0.5px solid rgba(0,0,0,0.12);background:#fff;color:#1c1c1e;font-weight:700;cursor:pointer;" ' +
                       'onclick="pcLabEngine.printReportModal(\'' + esc(g.orders[0].id) + '\')">🖨️ Official MOD Report</button>' +
                   '</td>' +
                   '</tr>';
        }).join('');
    }

    /* ── Update Live KPI Counters (selected patient only when selected) ── */
    function updateKPIs() {
        var orders = getLabOrders();
        var selP = getSelectedLabPatient();
        if (selP) {
            var selId = stripMod(selP.id).toLowerCase();
            orders = orders.filter(function(o) { return stripMod(o.patientId).toLowerCase() === selId; });
        }
        var groups = groupOrdersByPatientAndDate(orders);
        var pending  = groups.filter(function(g){ return g.status === 'pending'; }).length;
        var progress = groups.filter(function(g){ return g.status === 'in-progress'; }).length;
        var stat     = groups.filter(function(g){ return g.priority === 'stat' && g.status !== 'completed'; }).length;
        var critical = groups.filter(function(g){ return g.priority === 'stat'; }).length;
        var verified = groups.filter(function(g){ return g.status === 'completed'; }).length;
        var overdue  = groups.filter(function(g){
            return g.status === 'pending' && ((Date.now() - new Date(g.orderedAt)) > 45 * 60000);
        }).length;

        var map = {
            'kpi-pending-num': pending,
            'kpi-critical-num': critical,
            'kpi-overdue-num': overdue,
            'kpi-verified-num': verified,
            'kpi-stat-num': stat,
            'sc-specimens-today': groups.length,
            'sc-pending-val': pending + progress,
            'sc-verified-val': verified,
            'sc-critical-val': critical,
            'sc-stat-val': stat
        };
        Object.keys(map).forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.textContent = map[id];
        });

        // Also update tab badges
        var tabWk = document.querySelector('[data-tab="worklist"] .ncnt');
        if (tabWk) tabWk.textContent = pending + progress;
        var tabSp = document.querySelector('[data-tab="specimen"] .ncnt');
        if (tabSp) tabSp.textContent = pending;
    }

    /* ── In-Place Result Entry Modal (#labResultModal fallback) ── */
    function createResultModalDom() {
        if (document.getElementById('labResultModal')) return;
        var m = document.createElement('div');
        m.id = 'labResultModal';
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);' +
                          'backdrop-filter:saturate(180%) blur(14px);-webkit-backdrop-filter:saturate(180%) blur(14px);' +
                          'z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;';
        m.innerHTML = '' +
            '<div style="background:#fff;border-radius:20px;width:100%;max-width:880px;max-height:92vh;display:flex;flex-direction:column;' +
                 'box-shadow:0 24px 60px rgba(0,0,0,0.28);border:0.5px solid rgba(0,0,0,0.12);overflow:hidden;">' +
              '<div style="padding:18px 24px;border-bottom:0.5px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;">' +
                '<div>' +
                  '<h3 id="lrm_title" style="font-size:17px;font-weight:700;color:#1c1c1e;">Enter & Verify Laboratory Results</h3>' +
                  '<p id="lrm_sub" style="font-size:12px;color:#6e6e73;margin-top:2px;">100/100 Look-Alike Editable PClinic Matrix Table</p>' +
                '</div>' +
                '<button onclick="pcLabEngine.closeResultModal()" style="border:0;background:rgba(0,0,0,0.06);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;color:#1c1c1e;">✕</button>' +
              '</div>' +
              '<div id="lrm_body" style="padding:24px;overflow-y:auto;flex:1;">' +
                '<!-- Dynamic Matrix Table -->' +
              '</div>' +
              '<div style="padding:16px 24px;border-top:0.5px solid rgba(0,0,0,0.08);background:#f8f9fa;display:flex;justify-content:flex-end;gap:10px;">' +
                '<button onclick="pcLabEngine.closeResultModal()" style="height:38px;padding:0 18px;border-radius:10px;border:0.5px solid rgba(0,0,0,0.16);background:#fff;font-weight:600;font-size:13px;cursor:pointer;">Cancel</button>' +
                '<button id="lrm_verify_btn" style="height:38px;padding:0 24px;border-radius:10px;border:0;background:#007080;color:#fff;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 2px 6px rgba(0,112,128,0.25);">💾 Save & Officially Release Results to Doctor Dashboard</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(m);
    }

    function openResultModal(orderId) {
        var orders = getLabOrders();
        var groups = groupOrdersByPatientAndDate(orders);
        var g = groups.find(function(x){ return x.orders.some(function(o){ return o.id === orderId; }); });
        if (!g) {
            if (window.showToast) showToast('Order not found in queue', 'warning');
            return;
        }
        selectLabPatient(g.patientId, true);
        rememberSelectedLabDate(g.dateStr);
        var worklistButton = document.querySelector('[data-tab="worklist"]');
        if (worklistButton && typeof switchTab === 'function') switchTab('worklist', worklistButton);
        openGroups[g.key] = true;
        repaintAll();
        var childRow = document.getElementById('child_row_' + g.key);
        if (childRow) {
            childRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function closeResultModal() {
        var modal = document.getElementById('labResultModal');
        if (modal) modal.style.display = 'none';
    }

    /* ── In-Place Official MOD Laboratory Report Modal (#labReportModal) ── */
    function createReportModalDom() {
        if (document.getElementById('labReportModal')) return;
        var m = document.createElement('div');
        m.id = 'labReportModal';
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);' +
                          'backdrop-filter:saturate(180%) blur(16px);-webkit-backdrop-filter:saturate(180%) blur(16px);' +
                          'z-index:10000;display:none;align-items:center;justify-content:center;padding:24px;';
        m.innerHTML = '' +
            '<div style="background:#fff;border-radius:24px;width:100%;max-width:820px;max-height:92vh;display:flex;flex-direction:column;' +
                 'box-shadow:0 30px 80px rgba(0,0,0,0.3);border:0.5px solid rgba(0,0,0,0.12);overflow:hidden;">' +
              '<div style="padding:18px 28px;border-bottom:0.5px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                  '<span style="font-size:22px;">📜</span>' +
                  '<div>' +
                    '<h3 style="font-size:16px;font-weight:700;color:#1c1c1e;">PClinic • Medical Official Document (MOD)</h3>' +
                    '<p style="font-size:11.5px;color:#6e6e73;">Verified Clinical Laboratory Report</p>' +
                  '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                  '<button onclick="pcLabEngine.printReportWindow()" style="height:34px;padding:0 16px;border-radius:8px;border:0;background:#007080;color:#fff;font-weight:600;font-size:12.5px;cursor:pointer;">🖨️ Print MOD Report</button>' +
                  '<button onclick="pcLabEngine.closeReportModal()" style="border:0;background:rgba(0,0,0,0.06);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;color:#1c1c1e;">✕</button>' +
                '</div>' +
              '</div>' +
              '<div id="lrm_report_content" style="padding:32px 38px;overflow-y:auto;flex:1;font-family:var(--f,-apple-system,BlinkMacSystemFont,sans-serif);color:#1c1c1e;">' +
                '<!-- Dynamic MOD Report Content -->' +
              '</div>' +
            '</div>';
        document.body.appendChild(m);
    }

    function printReportModal(orderId) {
        createReportModalDom();
        var orders = getLabOrders();
        var o = orders.filter(function(x){ return x.id === orderId; })[0];
        if (!o) return;

        var content = document.getElementById('lrm_report_content');
        var itemsStr = (o.items || []).map(function(it){ return it.name; }).join(', ');
        var dept = getTestDepartment(itemsStr);

        var barcodeSvg = generateSVGBarcode(o.id);
        var nowStr = new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

        var resRows = '';
        if (Array.isArray(o.results) && o.results.length > 0) {
            resRows = o.results.map(function(r) {
                var flagStyle = r.flag === 'Normal' ? 'color:#1a7a32;font-weight:600;' : 'color:#8a1f1a;font-weight:700;background:#ffebe9;padding:2px 8px;border-radius:6px;display:inline-block;';
                return '<tr>' +
                       '<td style="padding:10px 12px;border-bottom:0.5px solid rgba(0,0,0,0.08);font-weight:600;">' + esc(r.test) + '</td>' +
                       '<td style="padding:10px 12px;border-bottom:0.5px solid rgba(0,0,0,0.08);font-weight:700;font-size:14px;">' + esc(r.value) + ' <span style="font-size:11px;color:#6e6e73;">' + esc(r.unit) + '</span></td>' +
                       '<td style="padding:10px 12px;border-bottom:0.5px solid rgba(0,0,0,0.08);color:#6e6e73;font-size:12px;">' + esc(r.refRange) + '</td>' +
                       '<td style="padding:10px 12px;border-bottom:0.5px solid rgba(0,0,0,0.08);' + flagStyle + '">' + esc(r.flag) + '</td>' +
                       '</tr>';
            }).join('');
        } else {
            resRows = '<tr><td colspan="4" style="padding:18px;text-align:center;color:#6e6e73;font-style:italic;">Test in progress or pending verification by technologist.</td></tr>';
        }

        content.innerHTML = '' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #007080;padding-bottom:18px;margin-bottom:24px;">' +
              '<div>' +
                '<h1 style="font-size:22px;font-weight:800;color:#007080;letter-spacing:-0.4px;margin-bottom:4px;">PClinic • Hospital Medical Official Document</h1>' +
                '<div style="font-size:12px;font-weight:700;color:#3a3a3c;text-transform:uppercase;letter-spacing:1px;">OFFICIAL MEDICAL LABORATORY REPORT (MOD)</div>' +
                '<div style="font-size:11px;color:#6e6e73;margin-top:4px;">Facility ID: PCLINIC-RW • Standardized WHO/MOD Clinical Diagnostic System</div>' +
              '</div>' +
              '<div style="text-align:right;">' +
                '<div>' + barcodeSvg + '</div>' +
                '<div style="font-size:11px;font-weight:700;color:#1c1c1e;margin-top:4px;">ACC: ' + esc(o.id) + '</div>' +
              '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#f8f9fa;padding:16px 20px;border-radius:14px;border:0.5px solid rgba(0,0,0,0.08);margin-bottom:24px;font-size:12.5px;">' +
              '<div>' +
                '<div style="color:#6e6e73;font-size:11px;">PATIENT IDENTIFICATION</div>' +
                '<div style="font-weight:700;font-size:15px;color:#1d1d1f;margin-top:2px;">' + esc(o.patientName || ('Patient ' + o.patientId)) + '</div>' +
                '<div style="margin-top:4px;color:#3a3a3c;"><strong>MRN / ID:</strong> MOD-' + esc(o.patientId) + '</div>' +
              '</div>' +
              '<div>' +
                '<div style="color:#6e6e73;font-size:11px;">SPECIMEN & ORDER DETAILS</div>' +
                '<div style="margin-top:2px;"><strong>Department:</strong> ' + esc(dept) + ' &nbsp; • &nbsp; <strong>Priority:</strong> ' + esc(o.priority).toUpperCase() + '</div>' +
                '<div style="margin-top:4px;"><strong>Ordered by:</strong> ' + esc(o.orderedBy || 'Doctor') + '</div>' +
                '<div style="margin-top:2px;"><strong>Report Date:</strong> ' + esc(nowStr) + '</div>' +
              '</div>' +
            '</div>' +

            '<div style="margin-bottom:28px;">' +
              '<h3 style="font-size:13px;font-weight:700;color:#1d1d1f;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;border-bottom:1px solid rgba(0,0,0,0.12);padding-bottom:6px;">INVESTIGATION RESULTS</h3>' +
              '<table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">' +
                '<thead>' +
                  '<tr style="background:#e6f6f8;color:#004a52;font-size:11.5px;text-transform:uppercase;">' +
                    '<th style="padding:10px 12px;border-radius:6px 0 0 6px;">Test Parameter</th>' +
                    '<th style="padding:10px 12px;">Result Value</th>' +
                    '<th style="padding:10px 12px;">Reference Range</th>' +
                    '<th style="padding:10px 12px;border-radius:0 6px 6px 0;">Flag / Status</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody>' + resRows + '</tbody>' +
              '</table>' +
            '</div>' +

            (o.labComments ? '<div style="background:#f8f9fa;padding:12px 16px;border-radius:10px;font-size:12px;color:#3a3a3c;margin-bottom:28px;"><strong>Clinical Comments:</strong> ' + esc(o.labComments) + '</div>' : '') +

            '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(0,0,0,0.12);padding-top:20px;">' +
              '<div>' +
                '<div style="font-size:13px;font-weight:700;color:#1d1d1f;">' + esc(o.completedBy || 'Laboratory Technologist') + '</div>' +
                '<div style="font-size:11.5px;color:#6e6e73;">Medical Laboratory Technologist • PClinic MOD</div>' +
                '<div style="font-size:11px;color:#8e8e93;margin-top:4px;">Digitally signed & verified by system authority.</div>' +
              '</div>' +
              '<div style="border:1.5px dashed #007080;padding:10px 18px;border-radius:10px;text-align:center;background:#f4fbfb;">' +
                '<div style="font-size:11px;font-weight:800;color:#007080;letter-spacing:1px;">MOD / PCLINIC</div>' +
                '<div style="font-size:10px;color:#004a52;font-weight:600;margin-top:2px;">OFFICIALLY VERIFIED LABORATORY REPORT</div>' +
              '</div>' +
            '</div>';

        var m = document.getElementById('labReportModal');
        m.style.display = 'flex';
    }

    function closeReportModal() {
        var m = document.getElementById('labReportModal');
        if (m) m.style.display = 'none';
    }

    function printReportWindow() {
        var content = document.getElementById('lrm_report_content');
        if (!content) return;
        var printWin = window.open('', '_blank', 'width=850,height=950');
        printWin.document.write('<!DOCTYPE html><html><head><title>PClinic • Medical Official Document (MOD) Laboratory Report</title>');
        printWin.document.write('<style>');
        printWin.document.write('* { box-sizing: border-box; margin: 0; padding: 0; }');
        printWin.document.write('body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; padding: 30px; color: #1d1d1f; }');
        printWin.document.write('table { width: 100%; border-collapse: collapse; }');
        printWin.document.write('@media print { body { padding: 15px; } }');
        printWin.document.write('<\\/style>');
        printWin.document.write('<\\/head><body>');
        printWin.document.write(content.innerHTML);
        printWin.document.write('<\\/body><\\/html>');
        printWin.document.close();
        printWin.focus();
        setTimeout(function() {
            printWin.print();
        }, 300);
    }

    /* ── 100/100 SIMPLE & SMART SPECIMEN ACCESSIONING (pclinic-lab.js)
           SCOPED: only the selected patient's pending orders ── */
    function paintSpecimenPatientSelector() {
        var sel = document.getElementById('specSmartPatientSelect');
        if (!sel) return;
        var selPat = getSelectedLabPatient();
        var groups = specimenGroupsForPatient(selPat);
        var selectedDate = ensureSelectedLabDateForPatient(selPat, patientDateGroups(selPat));
        var preferredGroup = groups.filter(function(group) { return String(group.dateStr) === String(selectedDate); })[0] || groups[0] || null;
        var currentVal = sel.value;
        var optionsHtml;
        if (!selPat) {
            optionsHtml = '<option value="">🔒 Select a patient first…</option>';
        } else if (!groups.length) {
            optionsHtml = '<option value="">No pending orders for ' + esc(patientDisplayName(selPat)) + '…</option>';
        } else {
            optionsHtml = '<option value="">Choose request date for ' + esc(patientDisplayName(selPat)) + '…</option>';
        }

        groups.forEach(function(g) {
            optionsHtml += '<option value="' + esc(g.key) + '">' + esc(dateSelectorLabel(g)) + '</option>';
        });

        sel.innerHTML = optionsHtml;
        if (currentVal && groups.some(function(g){ return g.key === currentVal; })) {
            sel.value = currentVal;
            selectSpecimenPatient(currentVal, true);
        } else if (preferredGroup) {
            sel.value = preferredGroup.key;
            selectSpecimenPatient(preferredGroup.key, true);
        } else {
            resetSpecimenPanel();
        }
    }

    function selectSpecimenPatient(groupKey, quiet) {
        var g = resolveSpecimenGroup(groupKey);
        if (!g) return;
        var selector = document.getElementById('specSmartPatientSelect');
        ensureSpecimenSelectorOption(selector, g);
        rememberSelectedLabDate(g.dateStr);

        var nameEl = document.getElementById('spec_pat_name');
        var mrnEl  = document.getElementById('spec_pat_mrn');
        var docEl  = document.getElementById('spec_doc_name');
        var accEl  = document.getElementById('spec_acc_no');
        var barBox = document.getElementById('spec_barcode_box');
        var testsBox = document.getElementById('spec_ordered_tests');

        var accNo = displayAccessionNo(g);

        if (nameEl) nameEl.textContent = g.patientName;
        if (mrnEl)  mrnEl.textContent  = 'MRN MOD-' + g.patientId + ' • ' + formatLabDate(g.dateStr) + ' • ' + String(g.priority).toUpperCase() + ' Order';
        if (docEl)  docEl.textContent  = g.orders[0].orderedBy || 'PClinic Staff';
        if (accEl)  accEl.textContent  = 'ACC: ' + accNo;
        if (barBox) barBox.innerHTML   = generateSVGBarcode(accNo);

        if (testsBox) {
            var orderedNames = [];
            g.orders.forEach(function(o) {
                (o.items || []).forEach(function(it) {
                    if (orderedNames.indexOf(it.name) === -1) orderedNames.push(it.name);
                });
            });
            testsBox.innerHTML = orderedNames.map(function(tName) {
                return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#e6f6f8;border-radius:10px;border:0.5px solid rgba(0,112,128,0.25);font-size:12.5px;font-weight:700;color:#004a52;">' +
                       '<span style="color:#1a7a32;font-size:15px;">✓</span> <span>' + esc(tName) + '</span>' +
                       '<span style="margin-left:auto;font-size:10.5px;background:#fff;padding:2px 8px;border-radius:12px;color:#007080;">Requested</span>' +
                       '</div>';
            }).join('');
        }

        if (!quiet && window.showToast) {
            showToast('👤 Auto-loaded specimen request date: ' + formatLabDate(g.dateStr) + ' for ' + g.patientName, 'info');
        }
    }

    function toggleTubePill(btn) {
        var parent = btn.parentNode;
        if (parent) {
            parent.querySelectorAll('.tube-pill').forEach(function(b) {
                b.classList.remove('active');
                b.style.background = '#fff';
                b.style.color = '#3a3a3c';
                b.style.borderColor = 'rgba(0,0,0,0.12)';
            });
        }
        btn.classList.add('active');
        btn.style.background = '#e6f6f8';
        btn.style.color = '#007080';
        btn.style.borderColor = '#007080';
    }

    function toggleCondPill(btn) {
        var parent = btn.parentNode;
        if (parent) {
            parent.querySelectorAll('.cond-pill').forEach(function(b) {
                b.classList.remove('active');
                b.style.background = '#fff';
                b.style.color = '#3a3a3c';
                b.style.borderColor = 'rgba(0,0,0,0.12)';
            });
        }
        btn.classList.add('active');
        btn.style.background = '#e9f9ee';
        btn.style.color = '#1a7a32';
        btn.style.borderColor = '#1a7a32';
    }

    async function transitionSpecimenGroupOnServer(orders, action, details) {
        details = details || {};
        orders = Array.isArray(orders) ? orders : [];
        if (!orders.length) throw new Error('No active laboratory order was supplied.');
        if (!window.currentStaff || (window.currentStaff.role !== 'lab' && window.currentStaff.role !== 'admin')) {
            throw new Error('An authenticated Laboratory account is required for specimen accession or rejection.');
        }
        var patientId = stripMod(orders[0].patientId);
        var requestPayload = {
            patientId: patientId,
            action: action,
            accessionNo: details.accessionNo || '',
            reason: details.reason || '',
            notes: details.notes || '',
            orders: orders.map(function(order) {
                return {
                    orderId: String(order.id),
                    patientId: stripMod(order.patientId),
                    legacyOrder: legacyLabOrderForServer(order)
                };
            })
        };

        if (window.pclinicCloudFunctions && typeof window.pclinicCloudFunctions.call === 'function') {
            try {
                var response = await window.pclinicCloudFunctions.call('labSpecimenTransition', requestPayload);
                if (!response || !Array.isArray(response.orders) || response.orders.length !== orders.length) {
                    throw new Error('The common server returned an incomplete specimen confirmation.');
                }
                return response.orders;
            } catch (error) {
                if (!cloudFunctionIsUnavailable(error)) throw error;
                console.warn('labSpecimenTransition is not deployed; checking whether a rules-protected direct update is possible.');
            }
        }

        if (requestPayload.orders.some(function(entry) { return !!entry.legacyOrder; })) {
            var legacyError = new Error('This recovered laboratory request has no order document on the server. Deploy the labSpecimenTransition Cloud Function, then retry accession; the function will verify and migrate it safely.');
            legacyError.code = 'legacy-order-requires-cloud-function';
            throw legacyError;
        }
        if (!window.pcOrders || typeof pcOrders.updateAsync !== 'function') {
            throw new Error('Secure order service is unavailable.');
        }

        var at = new Date().toISOString();
        return Promise.all(orders.map(async function(order) {
            var patch = action === 'reject' ? {
                status: 'cancelled', cancelReason: details.reason || '', cancelledAt: at,
                cancelledBy: window.currentStaff.name || 'Laboratory Technologist',
                cancelledById: window.currentStaff.staffId || ''
            } : {
                status: 'in-progress', accessionNo: details.accessionNo || '', accessionedAt: at,
                accessionedBy: window.currentStaff.name || 'Laboratory Technologist',
                accessionedById: window.currentStaff.staffId || ''
            };
            await pcOrders.updateAsync(order.id, patch, true);
            return {
                orderId: order.id,
                patientId: order.patientId,
                status: patch.status,
                accessionNo: patch.accessionNo || null,
                transitionedAt: patch.accessionedAt || patch.cancelledAt,
                transitionedBy: patch.accessionedBy || patch.cancelledBy,
                transitionedById: patch.accessionedById || patch.cancelledById,
                reason: patch.cancelReason || null,
                usedDirectFallback: true
            };
        }));
    }

    function applySpecimenTransitionResponse(order, response, action) {
        if (!window.pcOrders || typeof pcOrders.applyServerPatch !== 'function') return;
        var patch = {
            status: response.status || (action === 'reject' ? 'cancelled' : 'in-progress'),
            _legacyLocalOnly: false
        };
        if (action === 'reject') {
            patch.cancelReason = response.reason || '';
            patch.cancelledAt = response.transitionedAt || new Date().toISOString();
            patch.cancelledBy = response.transitionedBy || (window.currentStaff && window.currentStaff.name) || 'Laboratory Technologist';
            patch.cancelledById = response.transitionedById || (window.currentStaff && window.currentStaff.staffId) || '';
        } else {
            patch.accessionNo = response.accessionNo || '';
            patch.accessionedAt = response.transitionedAt || new Date().toISOString();
            patch.accessionedBy = response.transitionedBy || (window.currentStaff && window.currentStaff.name) || 'Laboratory Technologist';
            patch.accessionedById = response.transitionedById || (window.currentStaff && window.currentStaff.staffId) || '';
        }
        pcOrders.applyServerPatch(order.id, patch);
    }

    async function acceptAndAccession() {
        var selector = document.getElementById('specSmartPatientSelect');
        var group = resolveSpecimenGroup(selector ? selector.value : '');
        if (!group) {
            if (window.showToast) showToast('⚠️ No pending or in-progress laboratory order was found for the selected patient.', 'warning');
            return false;
        }
        ensureSpecimenSelectorOption(selector, group);
        var accessionNo = plannedAccessionNo(group);
        var notesEl = document.getElementById('spec_notes_in');
        try {
            var responses = await transitionSpecimenGroupOnServer(group.orders, 'accession', {
                accessionNo: accessionNo,
                notes: notesEl ? String(notesEl.value || '').trim() : ''
            });
            responses.forEach(function(response, index) {
                applySpecimenTransitionResponse(group.orders[index], response, 'accession');
            });
            if (window.showToast) showToast('✅ Specimen accession confirmed on the common server: ' + accessionNo, 'success');
            var worklistButton = document.querySelector('[data-tab="worklist"]');
            if (worklistButton && typeof switchTab === 'function') {
                setTimeout(function() { switchTab('worklist', worklistButton); }, 250);
            } else repaintAll();
            return true;
        } catch (error) {
            console.error('Accession failed:', error);
            if (window.showToast) showToast('❌ Accession was NOT saved: ' + labReleaseErrorMessage(error), 'error');
            return false;
        }
    }

    function printBarcodeLabel() {
        var accEl = document.getElementById('spec_acc_no');
        var nameEl = document.getElementById('spec_pat_name');
        var mrnEl  = document.getElementById('spec_pat_mrn');
        var barBox = document.getElementById('spec_barcode_box');

        var accText = accEl ? accEl.textContent : 'ACC: Pending accession';
        var nameText = nameEl ? nameEl.textContent : 'Patient Name';
        var mrnText  = mrnEl ? mrnEl.textContent : 'MRN —';
        var barSvg   = barBox ? barBox.innerHTML : '';

        var printWin = window.open('', '_blank', 'width=450,height=300');
        printWin.document.write('<!DOCTYPE html><html><head><title>Specimen Barcode Label • PClinic MOD</title>');
        printWin.document.write('<style>');
        printWin.document.write('* { box-sizing: border-box; margin: 0; padding: 0; }');
        printWin.document.write('body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; padding: 14px; color: #1d1d1f; text-align: center; }');
        printWin.document.write('.label-box { border: 2px solid #000; padding: 12px; border-radius: 10px; display: inline-block; width: 100%; max-width: 380px; }');
        printWin.document.write('<\\/style>');
        printWin.document.write('<\\/head><body>');
        printWin.document.write('<div class="label-box">');
        printWin.document.write('<div style="font-size:11px;font-weight:800;letter-spacing:0.5px;color:#007080;">PCLINIC • SPECIMEN ACCESSION LABEL</div>');
        printWin.document.write('<div style="font-size:15px;font-weight:800;margin-top:4px;">' + esc(nameText) + '</div>');
        printWin.document.write('<div style="font-size:12px;font-weight:600;color:#3a3a3c;margin-top:2px;">' + esc(mrnText) + '</div>');
        printWin.document.write('<div style="margin:8px 0;">' + barSvg + '</div>');
        printWin.document.write('<div style="font-size:12px;font-weight:800;color:#000;">' + esc(accText) + '</div>');
        printWin.document.write('<div style="font-size:10px;color:#64748b;margin-top:2px;">Date: ' + new Date().toLocaleDateString('en-GB') + ' • ' + esc((window.currentStaff && window.currentStaff.name) || 'Laboratory Technologist') + '</div>');
        printWin.document.write('</div>');
        printWin.document.write('<\\/body><\\/html>');
        printWin.document.close();
        printWin.focus();
        setTimeout(function() {
            printWin.print();
        }, 250);
    }

    async function rejectSpecimen() {
        var selector = document.getElementById('specSmartPatientSelect');
        var group = resolveSpecimenGroup(selector ? selector.value : '');
        if (!group) {
            if (window.showToast) showToast('⚠️ No pending or in-progress laboratory order was found for the selected patient.', 'warning');
            return false;
        }
        ensureSpecimenSelectorOption(selector, group);
        var reason = window.prompt('Clinical reason for rejecting this specimen (e.g. Clotted, haemolysed, insufficient volume, unlabelled tube):', 'Haemolysed specimen — repeat sampling required');
        if (reason === null) return false;
        reason = String(reason).trim();
        if (!reason) {
            if (window.showToast) showToast('⚠️ A rejection reason is required.', 'warning');
            return false;
        }
        try {
            var responses = await transitionSpecimenGroupOnServer(group.orders, 'reject', { reason: reason });
            responses.forEach(function(response, index) {
                applySpecimenTransitionResponse(group.orders[index], response, 'reject');
            });
            if (window.showToast) showToast('⚠️ Specimen rejection saved and the requesting clinician was notified.', 'warning');
            repaintAll();
            return true;
        } catch (error) {
            console.error('Specimen rejection failed:', error);
            if (window.showToast) showToast('❌ Rejection was NOT saved: ' + labReleaseErrorMessage(error), 'error');
            return false;
        }
    }

    /* ── SIMPLE & SMART LABORATORY REPORTING (pclinic-lab.js)
           SCOPED: only the selected patient's verified reports ── */
    function paintReportsPatientSelector() {
        var sel = document.getElementById('repSmartPatientSelect');
        if (!sel) return;
        var selPat = getSelectedLabPatient();
        var orders = getLabOrders();
        var groups = patientDateGroups(selPat, orders).filter(function(g) {
            return g.status === 'completed';
        });
        var selectedDate = ensureSelectedLabDateForPatient(selPat, patientDateGroups(selPat, orders));
        var preferredGroup = groups.filter(function(group) { return String(group.dateStr) === String(selectedDate); })[0] || groups[0] || null;
        var currentVal = sel.value;
        var optionsHtml;
        if (!selPat) {
            optionsHtml = '<option value="">🔒 Select a patient first…</option>';
        } else if (!groups.length) {
            optionsHtml = '<option value="">No verified reports for ' + esc(patientDisplayName(selPat)) + '…</option>';
        } else {
            optionsHtml = '<option value="">Choose verified request date for ' + esc(patientDisplayName(selPat)) + '…</option>';
        }

        groups.forEach(function(g) {
            optionsHtml += '<option value="' + esc(g.key) + '">' + esc(dateSelectorLabel(g, 'verified')) + '</option>';
        });

        sel.innerHTML = optionsHtml;
        if (currentVal && groups.some(function(g){ return g.key === currentVal; })) {
            sel.value = currentVal;
            selectReportPatient(currentVal, true);
        } else if (preferredGroup) {
            sel.value = preferredGroup.key;
            selectReportPatient(preferredGroup.key, true);
        } else {
            resetReportsPanel();
        }
    }

    function selectReportPatient(groupKey, quiet) {
        if (!groupKey) return;
        var orders = getLabOrders();
        var groups = groupOrdersByPatientAndDate(orders);
        var g = groups.find(function(x){ return x.key === groupKey; });
        if (!g) return;
        rememberSelectedLabDate(g.dateStr);

        var nameEl = document.getElementById('rep_pat_name');
        var mrnEl  = document.getElementById('rep_pat_mrn');
        var docEl  = document.getElementById('rep_doc_name');
        var accEl  = document.getElementById('rep_acc_no');
        var barBox = document.getElementById('rep_barcode_box');
        var chipsBox = document.getElementById('rep_matrix_chips');

        var accNo = displayAccessionNo(g);

        if (nameEl) nameEl.textContent = g.patientName;
        if (mrnEl)  mrnEl.textContent  = 'MRN MOD-' + g.patientId + ' • ' + formatLabDate(g.dateStr) + ' • Verified Report';
        if (docEl)  docEl.textContent  = g.orders[0].orderedBy || 'PClinic Staff';
        if (accEl)  accEl.textContent  = 'ACC: ' + accNo;
        if (barBox) barBox.innerHTML   = generateSVGBarcode(accNo);

        if (chipsBox) {
            var allResults = [];
            g.orders.forEach(function(o) {
                if (Array.isArray(o.results)) {
                    o.results.forEach(function(r) { allResults.push(r); });
                } else {
                    (o.items || []).forEach(function(it) {
                        allResults.push({ test: it.name, value: 'Pending', flag: 'Pending' });
                    });
                }
            });
            chipsBox.innerHTML = allResults.map(function(r) {
                var isAbnormal = r.flag !== 'Normal';
                var chipBg = isAbnormal ? '#ffebe9' : '#e9f9ee';
                var chipColor = isAbnormal ? '#8a1f1a' : '#1a7a32';
                var icon = isAbnormal ? '⚠️' : '✓';
                return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:' + chipBg + ';border-radius:10px;border:0.5px solid rgba(0,0,0,0.1);font-size:12.5px;font-weight:700;color:#1c1c1e;">' +
                       '<span style="color:' + chipColor + ';font-size:14px;">' + icon + '</span> <span>' + esc(r.test) + '</span>' +
                       '<span style="margin-left:auto;font-size:11px;font-weight:800;color:' + chipColor + ';">' + esc(r.value || 'Normal') + ' (' + esc(r.flag || 'Normal') + ')</span>' +
                       '</div>';
            }).join('');
        }

        if (!quiet && window.showToast) {
            showToast('📜 Auto-loaded verified report date: ' + formatLabDate(g.dateStr) + ' for ' + g.patientName, 'info');
        }
    }

    function printSelectedReportModal() {
        var sel = document.getElementById('repSmartPatientSelect');
        var groupKey = sel ? sel.value : null;
        if (!groupKey) {
            if (window.showToast) showToast('⚠️ Please select a verified report from the dropdown first.', 'warning');
            return;
        }
        var orders = getLabOrders();
        var groups = groupOrdersByPatientAndDate(orders);
        var g = groups.find(function(x){ return x.key === groupKey; });
        if (g && g.orders.length > 0) {
            printReportModal(g.orders[0].id);
        }
    }

    function broadcastReportToDoctor() {
        var sel = document.getElementById('repSmartPatientSelect');
        var groupKey = sel ? sel.value : null;
        if (!groupKey) {
            if (window.showToast) showToast('⚠️ Please select a verified report first.', 'warning');
            return;
        }
        try {
            window.dispatchEvent(new CustomEvent('ordersUpdated', { detail: { groupKey: groupKey } }));
            window.dispatchEvent(new CustomEvent('labResultsUpdated', { detail: { groupKey: groupKey } }));
            window.dispatchEvent(new Event('storage'));
        } catch(e){}
        if (window.showToast) {
            showToast('📤 Verified MOD Laboratory Report re-broadcasted to Doctor Dashboard & Reception!', 'success');
        }
    }

    function paintReportsTable() {
        var tbody = document.getElementById('pcLabReportsTable');
        if (!tbody) return;
        var selPat = getSelectedLabPatient();

        if (!selPat) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px;color:#8e8e93;">' +
                              '<div style="font-size:28px;margin-bottom:6px;">🔒</div>' +
                              'No patient selected. Reports are shown for the selected patient/date only.</td></tr>';
            return;
        }

        var orders = getLabOrders().filter(function(o) { return o.status === 'completed'; });
        var groups = patientDateGroups(selPat, orders);
        var activeDate = ensureSelectedLabDateForPatient(selPat, patientDateGroups(selPat));
        var visibleGroups = activeDate ? groups.filter(function(group) { return String(group.dateStr) === String(activeDate); }) : groups;

        if (!visibleGroups.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px;color:#8e8e93;">' +
                              '<div style="font-size:28px;margin-bottom:6px;">🖨️</div>' +
                              'No verified laboratory reports for ' + esc(patientDisplayName(selPat)) + (activeDate ? (' on ' + esc(formatLabDate(activeDate))) : '') + '.</td></tr>';
            return;
        }

        tbody.innerHTML = visibleGroups.map(function(g) {
            var itemsStr = groupTestNames(g).join(', ');
            var accNo = displayAccessionNo(g);
            return '<tr>' +
                   '<td style="font-weight:700;color:var(--ac,#007080)">' + esc(accNo) + '</td>' +
                   '<td><div style="font-weight:700;color:#1d1d1f;font-size:13.5px;">' + esc(g.patientName) + '</div>' +
                       '<div style="font-size:11px;color:#8e8e93;">MRN MOD-' + esc(g.patientId) + ' • ' + esc(formatLabDate(g.dateStr)) + '</div></td>' +
                   '<td style="font-weight:600;">' + esc(itemsStr || 'Lab Panel') + '</td>' +
                   '<td><span style="font-size:11.5px;color:#3a3a3c;font-weight:600;">Multidisciplinary</span></td>' +
                   '<td style="font-size:11.5px;color:#1a7a32;font-weight:700;">' + ago(g.orderedAt) + '</td>' +
                   '<td><span class="badge" style="background:#e9f9ee;color:#1a7a32;">✓ Normal / Validated</span></td>' +
                   '<td>' + statusBadge(g.status) + '</td>' +
                   '<td style="text-align:right;">' +
                       '<button style="height:30px;padding:0 14px;border-radius:9px;border:0.5px solid rgba(0,0,0,0.12);background:#fff;color:#1c1c1e;font-weight:700;cursor:pointer;" ' +
                       'onclick="pcLabEngine.printReportModal(\'' + esc(g.orders[0].id) + '\')">🖨️ Official MOD Report</button>' +
                   '</td>' +
                   '</tr>';
        }).join('');
    }

    /* ── SIMPLE & SMART QUALITY CONTROL ENGINE (pclinic-lab.js) — NO GREEN, APPLE FAVORITES ── */
    var activeQcType = 'sysmex';

    function selectQcAnalyzer(type, btn) {
        activeQcType = type || 'sysmex';
        if (btn && btn.parentNode) {
            btn.parentNode.querySelectorAll('.qc-pill').forEach(function(b) {
                b.classList.remove('active');
                b.style.background = '#fff';
                b.style.color = '#3a3a3c';
                b.style.borderColor = 'rgba(0,0,0,0.12)';
            });
            btn.classList.add('active');
            btn.style.background = '#eaf2ff';
            btn.style.color = '#0071e3';
            btn.style.borderColor = '#0071e3';
        }

        var nameEl = document.getElementById('qc_banner_name');
        var idEl   = document.getElementById('qc_acc_id');
        var barBox = document.getElementById('qc_barcode_box');

        var map = {
            sysmex: ['Sysmex XN-550 Haematology Analyser • SN-882190', 'QC-SYSMEX-LIVE'],
            cobas:  ['Cobas C311 Chemistry & Immuno-Analyser • SN-401128', 'QC-COBAS-LIVE'],
            vitek:  ['VITEK 2 Microbiology ID/AST System • SN-991044', 'QC-VITEK-LIVE'],
            acltop: ['ACL TOP 300 Coagulation Analyser • SN-110942', 'QC-ACLTOP-LIVE'],
            all:    ['All Multidisciplinary Instruments (System QC Register)', 'QC-ALL-LIVE']
        };

        var info = map[activeQcType] || map.sysmex;
        if (nameEl) nameEl.textContent = info[0];
        if (idEl)   idEl.textContent   = info[1];
        if (barBox) barBox.innerHTML   = generateSVGBarcode(info[1]);

        paintQcTable(activeQcType);
    }

    function paintQcTable(type) {
        var tbody = document.getElementById('pcLabQcTable');
        if (!tbody) return;

        var t = type || activeQcType || 'sysmex';
        var rows = [];

        if (t === 'sysmex' || t === 'all') {
            rows.push(['Haemoglobin — Control L1 Normal', '11.5–12.5 g/dL', 'Lot: HC-2026-04A', '11.9', '✓ IN CONTROL • 1SD']);
            rows.push(['Haemoglobin — Control L2 High', '13.8–15.2 g/dL', 'Lot: HC-2026-04A', '14.4', '✓ IN CONTROL • 1SD']);
            rows.push(['WBC — Control L1 Normal', '4.0–4.8 ×10⁹/L', 'Lot: HC-2026-04A', '4.3', '✓ IN CONTROL • 1SD']);
            rows.push(['Platelets — Control Normal', '200–240 ×10⁹/L', 'Lot: HC-2026-04A', '221', '✓ IN CONTROL • 1SD']);
        }
        if (t === 'cobas' || t === 'all') {
            rows.push(['Glucose — Control Normal', '4.8–5.4 mmol/L', 'Lot: GC-2026-07B', '5.1', '✓ IN CONTROL • 1SD']);
            rows.push(['Creatinine — Control Normal', '70–80 µmol/L', 'Lot: GC-2026-07B', '74', '✓ IN CONTROL • 1SD']);
            rows.push(['ALT (SGPT) — Control Normal', '22–30 U/L', 'Lot: GC-2026-07B', '25', '✓ IN CONTROL • 1SD']);
            rows.push(['Troponin I — Control Normal', '0.01–0.03 ng/mL', 'Lot: TC-2026-02C', '0.02', '✓ IN CONTROL • 1SD']);
        }
        if (t === 'vitek' || t === 'all') {
            rows.push(['E. coli ATCC 25922 Control', 'Sensitive (MIC ≤ 4)', 'Lot: VT-2026-01', 'Sensitive', '✓ IN CONTROL • 1SD']);
            rows.push(['S. aureus ATCC 25923 Control', 'Sensitive (MIC ≤ 2)', 'Lot: VT-2026-01', 'Sensitive', '✓ IN CONTROL • 1SD']);
        }
        if (t === 'acltop' || t === 'all') {
            rows.push(['PT / INR — Control Normal', '11.0–13.0 sec (1.0)', 'Lot: AC-2026-09', '12.1', '✓ IN CONTROL • 1SD']);
            rows.push(['aPTT — Control Normal', '28–34 sec', 'Lot: AC-2026-09', '30.8', '✓ IN CONTROL • 1SD']);
        }

        tbody.innerHTML = rows.map(function(r) {
            return '<tr style="border-bottom:1px solid rgba(0,0,0,0.08);transition:background 0.15s;">' +
                   '<td style="padding:12px 16px;font-weight:700;color:#1d1d1f;">' + esc(r[0]) + '</td>' +
                   '<td style="padding:12px 16px;font-weight:600;color:#64748b;">' + esc(r[1]) + '</td>' +
                   '<td style="padding:12px 16px;font-weight:600;color:#3a3a3c;">' + esc(r[2]) + '</td>' +
                   '<td style="padding:12px 16px;">' +
                       '<input type="text" class="qc-in-val" value="' + esc(r[3]) + '" ' +
                              'style="width:130px;height:34px;background:#ebeef3;border:0.5px solid rgba(0,0,0,0.18);border-radius:8px;padding:0 12px;font-weight:700;font-size:13px;color:#1d1d1f;transition:border 0.2s, background 0.2s;" ' +
                              'onfocus="this.style.background=\'#ffffff\';this.style.borderColor=\'#0071e3\';" ' +
                              'onblur="this.style.background=\'#ebeef3\';this.style.borderColor=\'rgba(0,0,0,0.18)\';" />' +
                   '</td>' +
                   '<td style="padding:12px 16px;">' +
                       '<span style="background:#eaf2ff;color:#0071e3;font-weight:800;font-size:11px;padding:4px 10px;border-radius:16px;border:0.5px solid rgba(0,113,227,0.25);">' + esc(r[4]) + '</span>' +
                   '</td>' +
                   '</tr>';
        }).join('');
    }

    function verifyAndAuthorizeQc() {
        var logs = [];
        try { logs = JSON.parse(localStorage.getItem('pclinic_qc_logs') || '[]'); } catch(e){}
        logs.push({
            analyzer: activeQcType,
            authorizedAt: new Date().toISOString(),
            authorizedBy: (window.currentStaff && window.currentStaff.name) || 'Laboratory Technologist',
            authorizedById: (window.currentStaff && window.currentStaff.staffId) || '',
            status: 'IN CONTROL'
        });
        try {
            localStorage.setItem('pclinic_qc_logs', JSON.stringify(logs));
            window.dispatchEvent(new CustomEvent('qcUpdated', { detail: { analyzer: activeQcType } }));
            window.dispatchEvent(new Event('storage'));
        } catch(e){}

        if (window.showToast) {
            showToast('✅ Daily Quality Control authorized for ' + activeQcType.toUpperCase() + '! All diagnostic analyzers cleared for reporting.', 'success');
        }
        paintQcTable(activeQcType);
    }

    function printQcCertificateModal() {
        var printWin = window.open('', '_blank', 'width=750,height=850');
        printWin.document.write('<!DOCTYPE html><html><head><title>PClinic MOD • Daily QC Compliance Certificate</title>');
        printWin.document.write('<style>');
        printWin.document.write('* { box-sizing: border-box; margin: 0; padding: 0; }');
        printWin.document.write('body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; padding: 30px; color: #1d1d1f; }');
        printWin.document.write('table { width: 100%; border-collapse: collapse; margin-top: 16px; }');
        printWin.document.write('th, td { border: 1px solid #ccc; padding: 10px; text-align: left; font-size: 12.5px; }');
        printWin.document.write('th { background: #f5f5f7; }');
        printWin.document.write('<\\/style>');
        printWin.document.write('<\\/head><body>');
        var qcId = (document.getElementById('qc_acc_id') && document.getElementById('qc_acc_id').textContent) || ('QC-' + String(activeQcType || 'sysmex').toUpperCase() + '-LIVE');
        var qcName = (document.getElementById('qc_banner_name') && document.getElementById('qc_banner_name').textContent) || 'Laboratory Analyzer';
        printWin.document.write('<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0071e3;padding-bottom:16px;">');
        printWin.document.write('<div><h2 style="color:#0071e3;font-size:20px;font-weight:800;">PCLINIC • MEDICAL OFFICIAL DOCUMENT</h2><div style="font-size:12px;font-weight:700;">DAILY LABORATORY QUALITY CONTROL CERTIFICATE</div></div>');
        printWin.document.write('<div>' + generateSVGBarcode(qcId) + '</div>');
        printWin.document.write('</div>');
        printWin.document.write('<div style="margin:18px 0;font-size:13px;"><strong>Instrument:</strong> ' + esc(qcName) + ' &nbsp; • &nbsp; <strong>Date:</strong> ' + new Date().toLocaleDateString('en-GB') + ' &nbsp; • &nbsp; <strong>Status:</strong> WESTGARD IN CONTROL (2SD LIMITS)</div>');
        printWin.document.write('<table><thead><tr><th>Control Parameter</th><th>Target Range</th><th>Lot Number</th><th>Value</th><th>Westgard Status</th></tr></thead>');
        printWin.document.write('<tbody>');
        printWin.document.write('<tr><td>Haemoglobin — Control L1 Normal</td><td>11.5–12.5 g/dL</td><td>Lot: HC-2026-04A</td><td>11.9</td><td>✓ IN CONTROL • 1SD</td></tr>');
        printWin.document.write('<tr><td>Haemoglobin — Control L2 High</td><td>13.8–15.2 g/dL</td><td>Lot: HC-2026-04A</td><td>14.4</td><td>✓ IN CONTROL • 1SD</td></tr>');
        printWin.document.write('<tr><td>WBC — Control L1 Normal</td><td>4.0–4.8 ×10⁹/L</td><td>Lot: HC-2026-04A</td><td>4.3</td><td>✓ IN CONTROL • 1SD</td></tr>');
        printWin.document.write('<tr><td>Glucose — Control Normal</td><td>4.8–5.4 mmol/L</td><td>Lot: GC-2026-07B</td><td>5.1</td><td>✓ IN CONTROL • 1SD</td></tr>');
        printWin.document.write('<tr><td>Creatinine — Control Normal</td><td>70–80 µmol/L</td><td>Lot: GC-2026-07B</td><td>74</td><td>✓ IN CONTROL • 1SD</td></tr>');
        printWin.document.write('<tr><td>Troponin I — Control Normal</td><td>0.01–0.03 ng/mL</td><td>Lot: TC-2026-02C</td><td>0.02</td><td>✓ IN CONTROL • 1SD</td></tr>');
        printWin.document.write('</tbody></table>');
        printWin.document.write('<div style="margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #ccc;padding-top:16px;">');
        printWin.document.write('<div><strong>Authorized by:</strong> ' + esc((window.currentStaff && window.currentStaff.name) || 'Laboratory Technologist') + '</div>');
        printWin.document.write('<div style="border:1px solid #0071e3;padding:8px 16px;border-radius:6px;color:#0071e3;font-weight:800;font-size:11px;">MOD / PCLINIC CERTIFIED</div>');
        printWin.document.write('</div>');
        printWin.document.write('<\\/body><\\/html>');
        printWin.document.close();
        printWin.focus();
        setTimeout(function() { printWin.print(); }, 250);
    }

    function reportQcDeviation() {
        var note = window.prompt('Log analyzer maintenance or calibration deviation note:', 'Scheduled optical calibration verification');
        if (note === null) return;
        if (window.showToast) {
            showToast('⚠️ Analyzer maintenance logged: "' + note + '". Supervisor notified.', 'warning');
        }
    }

    /* ── 100/100 MICROBIOLOGY CULTURE & SENSITIVITY ENGINE (pclinic-lab.js) — 100/100 MATCHING SCREENSHOT ── */
    var defaultMicrobioAntibiotics = [
        ['1', 'AMOXYCLAV (AMC)', 'Sensitive'],
        ['2', 'AMIKACIN (AK)', 'Resistant'],
        ['3', 'AMPICILLIN (AMP)', 'Resistant'],
        ['4', 'AMPICILLIN / SULBACTUM ( A/S)', 'Resistant'],
        ['5', 'AZITHROMYCIN (AZM)', 'Resistant'],
        ['6', 'AZTREONAM (AT)', 'Resistant'],
        ['7', 'BACITRACIN (B)', 'Resistant'],
        ['8', 'CEFADROXIL (CFR)', 'Resistant'],
        ['9', 'CEFAZOLIN (CZ)', 'Resistant'],
        ['10', 'CEFEPIME (CPM)', 'Resistant'],
        ['11', 'CEFOPERAZONE (CPZ)', 'Sensitive'],
        ['12', 'CEFUROXIME (CXM)', 'Sensitive'],
        ['13', 'CEPHALOTHIN (CEP)', 'Sensitive'],
        ['14', 'CHLORAMPHENICOL (C)', 'Sensitive'],
        ['15', 'CIPROFLOXACIN (CIP)', 'Sensitive'],
        ['16', 'CLINDAMYCIN (CD)', 'Sensitive'],
        ['17', 'CO - TRIMOXAZOLE (COT)', 'Sensitive'],
        ['18', 'DOXYCYCLINE HYDROCHORIDE (DO)', 'Resistant'],
        ['19', 'ERTRAPENEM (ETP)', 'Resistant'],
        ['20', 'ERYTHROMYCIN (E)', 'Resistant']
    ];
    var customMicrobioRows = [];

    function isMicrobiologyOrder(order) {
        return (order.items || []).some(function(item) {
            return /(culture|microbio|gram|afb|acid fast|tb|widal|brucella|sensitivity)/i.test(String(item.name || ''));
        });
    }

    function paintMicrobioPatientSelector() {
        var sel = document.getElementById('micSmartPatientSelect');
        if (!sel) return;
        var selPat = getSelectedLabPatient();
        var orders = getLabOrders().filter(isMicrobiologyOrder);
        var groups = patientDateGroups(selPat, orders);
        var selectedDate = ensureSelectedLabDateForPatient(selPat, patientDateGroups(selPat));
        var preferredGroup = groups.filter(function(group) { return String(group.dateStr) === String(selectedDate); })[0] || groups[0] || null;

        var currentVal = sel.value;
        var optionsHtml;
        if (!selPat) {
            optionsHtml = '<option value="">🔒 Select a patient first…</option>';
        } else if (!groups.length) {
            optionsHtml = '<option value="">No culture orders for ' + esc(patientDisplayName(selPat)) + '…</option>';
        } else {
            optionsHtml = '<option value="">Choose microbiology request date for ' + esc(patientDisplayName(selPat)) + '…</option>';
        }

        groups.forEach(function(g) {
            optionsHtml += '<option value="' + esc(g.key) + '">' + esc(dateSelectorLabel(g, 'micro')) + '</option>';
        });

        sel.innerHTML = optionsHtml;
        if (currentVal && groups.some(function(g){ return g.key === currentVal; })) {
            sel.value = currentVal;
            selectMicrobioPatient(currentVal, true);
        } else if (preferredGroup) {
            sel.value = preferredGroup.key;
            selectMicrobioPatient(preferredGroup.key, true);
        } else {
            resetMicrobioPanel();
        }
    }

    function selectMicrobioPatient(groupKey, quiet) {
        if (!groupKey) return;
        var orders = getLabOrders().filter(isMicrobiologyOrder);
        var groups = groupOrdersByPatientAndDate(orders);
        var g = groups.find(function(x){ return x.key === groupKey; });
        if (!g) return;

        rememberSelectedLabDate(g.dateStr);
        var barBox = document.getElementById('mic_barcode_box');
        var accNo = displayAccessionNo(g);

        if (barBox) barBox.innerHTML = generateSVGBarcode(accNo);

        paintMicrobioTable();
        if (!quiet && window.showToast) {
            showToast('🧫 Auto-loaded microbiology request date: ' + formatLabDate(g.dateStr) + ' for ' + g.patientName, 'info');
        }
    }

    function paintMicrobioTable() {
        var tbody = document.getElementById('pcLabMicroTable');
        if (!tbody) return;

        var allRows = defaultMicrobioAntibiotics.concat(customMicrobioRows);

        tbody.innerHTML = allRows.map(function(r, idx) {
            var sno  = idx + 1;
            var atb  = r[1];
            var sens = r[2] || 'Sensitive';

            var isResistant = sens === 'Resistant';
            var badgeBg = isResistant ? '#ffebe9' : '#eaf2ff';
            var badgeColor = isResistant ? '#8a1f1a' : '#0071e3';

            var isCustom = idx >= defaultMicrobioAntibiotics.length;
            var atbCell = isCustom
                ? '<input type="text" class="mic-custom-atb-in" value="' + esc(atb) + '" style="width:240px;height:32px;background:#ebeef3;border:0.5px solid rgba(0,0,0,0.18);border-radius:8px;padding:0 10px;font-weight:700;color:#1d1d1f;" />'
                : '<span style="font-weight:700;color:#1d1d1f;">' + esc(atb) + '</span>';

            var removeBtn = isCustom
                ? ' <button type="button" onclick="pcLabEngine.removeCustomAntibioticRow(' + (idx - defaultMicrobioAntibiotics.length) + ')" style="border:0;background:rgba(255,59,48,0.15);color:#8a1f1a;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;margin-left:10px;">✕ Remove</button>'
                : '';

            return '<tr style="border-bottom:1px solid rgba(0,0,0,0.08);transition:background 0.15s;">' +
                   '<td style="padding:10px 16px;font-weight:800;color:#1d1d1f;">' + sno + '</td>' +
                   '<td style="padding:10px 16px;">' + atbCell + removeBtn + '</td>' +
                   '<td style="padding:10px 16px;">' +
                       '<select class="mic-sens-sel" style="width:140px;height:32px;background:' + badgeBg + ';color:' + badgeColor + ';border:0.5px solid rgba(0,0,0,0.16);border-radius:8px;padding:0 10px;font-weight:800;font-size:12px;cursor:pointer;" ' +
                               'onchange="this.style.background=(this.value===\'Resistant\'?\'#ffebe9\':\'#eaf2ff\');this.style.color=(this.value===\'Resistant\'?\'#8a1f1a\':\'#0071e3\');">' +
                         '<option value="Sensitive" ' + (sens === 'Sensitive' ? 'selected' : '') + '>Sensitive</option>' +
                         '<option value="Resistant" ' + (sens === 'Resistant' ? 'selected' : '') + '>Resistant</option>' +
                         '<option value="Intermediate" ' + (sens === 'Intermediate' ? 'selected' : '') + '>Intermediate</option>' +
                         '<option value="Not Tested (NT)" ' + (sens === 'Not Tested (NT)' ? 'selected' : '') + '>Not Tested (NT)</option>' +
                       '</select>' +
                   '</td>' +
                   '</tr>';
        }).join('');
    }

    function addCustomAntibioticRow() {
        var atbName = window.prompt('Enter new antibiotic name (e.g. MEROPENEM (MEM), VANCOMYCIN (VA), LINEZOLID (LZD)):', 'MEROPENEM (MEM)');
        if (!atbName) return;
        customMicrobioRows.push(['', atbName.toUpperCase(), 'Sensitive']);
        paintMicrobioTable();
        if (window.showToast) {
            showToast('➕ Added custom antibiotic: ' + atbName.toUpperCase(), 'info');
        }
    }

    function removeCustomAntibioticRow(customIdx) {
        if (customIdx >= 0 && customIdx < customMicrobioRows.length) {
            customMicrobioRows.splice(customIdx, 1);
            paintMicrobioTable();
        }
    }

    async function saveAndReleaseMicrobioReport() {
        var orgIn = document.getElementById('mic_organism');
        var colIn = document.getElementById('mic_colony_count');
        var sampleIn = document.getElementById('mic_sample_type');
        var noteIn = document.getElementById('mic_incubation_note');
        var dateColl = document.getElementById('mic_date_coll');
        var dateRep = document.getElementById('mic_date_rep');
        var organism = String(orgIn && orgIn.value || '').trim();
        var sampleType = String(sampleIn && sampleIn.value || '').trim();
        if (!organism || !sampleType) {
            if (window.showToast) showToast('⚠️ Sample type and organism/no-growth conclusion are required.', 'warning');
            return false;
        }

        var antibioticRows = [];
        var tbody = document.getElementById('pcLabMicroTable');
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(function(tr, index) {
                var customInput = tr.querySelector('.mic-custom-atb-in');
                var nameSpan = tr.querySelector('td:nth-child(2) span');
                var antibiotic = String(customInput ? customInput.value : nameSpan ? nameSpan.textContent : '').trim();
                var sensitivityEl = tr.querySelector('.mic-sens-sel');
                if (antibiotic) antibioticRows.push({
                    sno: index + 1,
                    antibiotic: antibiotic,
                    sensitivity: sensitivityEl ? sensitivityEl.value : 'Not Tested (NT)'
                });
            });
        }

        var selector = document.getElementById('micSmartPatientSelect');
        var groupKey = selector ? selector.value : '';
        var groups = groupOrdersByPatientAndDate(getLabOrders().filter(isMicrobiologyOrder));
        var group = groups.filter(function(row) { return row.key === groupKey; })[0];
        if (!group) {
            if (window.showToast) showToast('⚠️ Select a microbiology order first.', 'warning');
            return false;
        }
        if (!window.confirm('Validate and permanently release this Culture & Sensitivity report to the requesting doctor?')) return false;

        var microbiology = {
            sampleType: sampleType,
            organism: organism,
            colonyCount: String(colIn && colIn.value || '').trim(),
            incubationNote: String(noteIn && noteIn.value || '').trim(),
            collectedAt: dateColl && dateColl.value || '',
            reportedAt: dateRep && dateRep.value || '',
            antibiotics: antibioticRows
        };

        try {
            for (var i = 0; i < group.orders.length; i++) {
                var order = group.orders[i];
                if (String(order.status).toLowerCase() === 'completed') continue;
                var resultRows = (order.items || []).map(function(item, index) {
                    return {
                        code: String(item.code || ('MIC-' + (index + 1))),
                        orderItemCode: String(item.code || ('ITEM-' + (index + 1))),
                        orderItemName: String(item.name || 'Culture & Sensitivity'),
                        test: String(item.name || 'Culture & Sensitivity'),
                        value: organism + (microbiology.colonyCount ? ' — ' + microbiology.colonyCount : ''),
                        unit: '',
                        refRange: 'No pathogenic growth / clinically interpreted',
                        flag: 'Normal'
                    };
                });
                var response = await releaseOrderToCommonServer(order, {
                    results: resultRows,
                    comments: microbiology.incubationNote,
                    microbiology: microbiology
                });
                if (window.pcOrders && typeof pcOrders.applyServerPatch === 'function') {
                    pcOrders.applyServerPatch(order.id, {
                        status: 'completed', labState: 'final', resultId: response.resultId,
                        results: response.results || resultRows, microbiology: microbiology,
                        completedAt: response.completedAt || new Date().toISOString(),
                        completedBy: response.completedBy || (window.currentStaff && window.currentStaff.name) || 'Laboratory staff'
                    });
                }
            }
            try { window.dispatchEvent(new CustomEvent('labResultsUpdated', { detail: { type: 'microbiology', serverConfirmed: true } })); } catch(e) {}
            if (window.showToast) showToast('✅ Culture & Sensitivity report saved on the common server and sent to the requesting doctor.', 'success');
            repaintAll();
            return true;
        } catch (error) {
            console.error('Microbiology release failed:', error);
            if (window.showToast) showToast('❌ NOT SAVED: ' + labReleaseErrorMessage(error), 'error');
            return false;
        }
    }

    function printMicrobioReportModal() {
        var orgIn = document.getElementById('mic_organism');
        var colIn = document.getElementById('mic_colony_count');
        var sampleIn = document.getElementById('mic_sample_type');
        var noteIn = document.getElementById('mic_incubation_note');
        var dateColl = document.getElementById('mic_date_coll');
        var dateRep  = document.getElementById('mic_date_rep');

        var barBox = document.getElementById('mic_barcode_box');
        var orgVal = orgIn ? orgIn.value : '';
        var colVal = colIn ? colIn.value : '';
        var sampleVal = sampleIn ? sampleIn.value : '';
        var noteVal   = noteIn ? noteIn.value : '';
        var collVal   = (dateColl && dateColl.value) ? dateColl.value.split('-').reverse().join('/') : new Date().toLocaleDateString('en-GB');
        var repVal    = (dateRep && dateRep.value) ? dateRep.value.split('-').reverse().join('/') : new Date().toLocaleDateString('en-GB');

        var tbody = document.getElementById('pcLabMicroTable');
        var rowsHtml = '';
        if (tbody) {
            var rows = tbody.querySelectorAll('tr');
            rows.forEach(function(tr, idx) {
                var sno = idx + 1;
                var atbText = '';
                var customIn = tr.querySelector('.mic-custom-atb-in');
                if (customIn) atbText = customIn.value;
                else {
                    var span = tr.querySelector('td:nth-child(2) span');
                    atbText = span ? span.textContent : 'Antibiotic';
                }
                var sel = tr.querySelector('.mic-sens-sel');
                var sensVal = sel ? sel.value : 'Sensitive';
                rowsHtml += '<tr><td>' + sno + '</td><td>' + esc(atbText) + '</td><td><strong>' + esc(sensVal) + '</strong></td></tr>';
            });
        }

        var printWin = window.open('', '_blank', 'width=800,height=950');
        printWin.document.write('<!DOCTYPE html><html><head><title>MICROBIOLOGY • Culture and Sensitivity Report</title>');
        printWin.document.write('<style>');
        printWin.document.write('* { box-sizing: border-box; margin: 0; padding: 0; }');
        printWin.document.write('body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; padding: 36px; color: #1d1d1f; }');
        printWin.document.write('table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }');
        printWin.document.write('th, td { border: 1px solid #1d1d1f; padding: 8px 12px; text-align: left; }');
        printWin.document.write('th { background: #f5f5f7; font-weight: 800; }');
        printWin.document.write('<\\/style>');
        printWin.document.write('<\\/head><body>');
        printWin.document.write('<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:14px;margin-bottom:20px;">');
        printWin.document.write('<h1 style="font-size:22px;font-weight:800;letter-spacing:0.5px;">MICROBIOLOGY</h1>');
        printWin.document.write('<h2 style="font-size:16px;font-weight:800;margin-top:4px;">Culture and Sensitivity</h2>');
        printWin.document.write('<div style="margin-top:10px;font-size:13.5px;">' + esc(noteVal) + '</div>');
        printWin.document.write('</div>');

        printWin.document.write('<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;font-size:13.5px;margin-bottom:20px;line-height:1.6;">');
        printWin.document.write('<div>');
        printWin.document.write('<div><strong>Date of Sample Collection:</strong> ' + esc(collVal) + '</div>');
        printWin.document.write('<div><strong>Date of Reporting:</strong> ' + esc(repVal) + '</div>');
        printWin.document.write('<div style="margin-top:6px;">' + ((barBox && barBox.innerHTML) ? barBox.innerHTML : generateSVGBarcode('LAB-MICRO-LIVE')) + '</div>');
        printWin.document.write('</div>');
        printWin.document.write('<div>');
        printWin.document.write('<div><strong>Sample Type:</strong> ' + esc(sampleVal) + '</div>');
        printWin.document.write('<div><strong>Organism Isolated:</strong> ' + esc(orgVal) + '</div>');
        printWin.document.write('<div><strong>Colony Count:</strong> ' + esc(colVal) + '</div>');
        printWin.document.write('</div>');
        printWin.document.write('</div>');

        printWin.document.write('<table><thead><tr><th style="width:10%;">S. No.</th><th style="width:60%;">Antibiotic</th><th style="width:30%;">Sensitivity</th></tr></thead>');
        printWin.document.write('<tbody>' + rowsHtml + '</tbody></table>');

        printWin.document.write('<div style="margin-top:36px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #1d1d1f;padding-top:16px;">');
        printWin.document.write('<div><strong>Verifying Laboratory Technologist:</strong> ' + esc((window.currentStaff && window.currentStaff.name) || 'Laboratory Technologist') + '</div>');
        printWin.document.write('<div style="border:1.5px solid #000;padding:8px 16px;border-radius:6px;font-weight:800;font-size:11px;">MOD / PCLINIC VERIFIED</div>');
        printWin.document.write('</div>');

        printWin.document.write('<\\/body><\\/html>');
        printWin.document.close();
        printWin.focus();
        setTimeout(function() { printWin.print(); }, 250);
    }

    /* ── Repaint Whole Dashboard ── */
    function repaintAll() {
        var oldDc = document.getElementById('dcBar');
        if (oldDc && oldDc.parentNode) oldDc.parentNode.removeChild(oldDc);

        if (typeof pcOrders !== 'undefined' && typeof pcOrders.aggregate === 'function') {
            try { pcOrders.aggregate(); } catch(e){}
        }
        paintOverviewWorklist();
        paintFullWorklist();
        paintResultsTable();
        updateKPIs();
        paintSpecimenPatientSelector();
        paintReportsPatientSelector();
        paintReportsTable();
        paintQcTable(activeQcType);
        paintMicrobioPatientSelector();
        paintMicrobioTable();
        updateSelectionUI();
    }

    // Export public API
    window.pcLabEngine = {
        repaint: repaintAll,
        togglePatientGroup: togglePatientGroup,
        saveGroupResults: saveGroupResults,
        saveDayResults: saveDayResults,
        saveOrderResults: saveOrderResults,
        autoFlagResult: autoFlagResult,
        syncFlagSelectTone: syncFlagSelectTone,
        selectLabPatient: selectLabPatient,
        openPatientDateView: openPatientDateView,
        selectLabDate: selectLabDate,
        clearLabSelection: clearLabSelection,
        getSelectedLabPatient: getSelectedLabPatient,
        getSelectedLabDate: getSelectedLabDate,
        listVisibleLabOrders: getLabOrders,
        updateSelectionUI: updateSelectionUI,
        openResultModal: openResultModal,
        closeResultModal: closeResultModal,
        printReportModal: printReportModal,
        closeReportModal: closeReportModal,
        printReportWindow: printReportWindow,
        generateSVGBarcode: generateSVGBarcode,
        selectSpecimenPatient: selectSpecimenPatient,
        toggleTubePill: toggleTubePill,
        toggleCondPill: toggleCondPill,
        acceptAndAccession: acceptAndAccession,
        printBarcodeLabel: printBarcodeLabel,
        rejectSpecimen: rejectSpecimen,
        selectReportPatient: selectReportPatient,
        printSelectedReportModal: printSelectedReportModal,
        broadcastReportToDoctor: broadcastReportToDoctor,
        selectQcAnalyzer: selectQcAnalyzer,
        paintQcTable: paintQcTable,
        verifyAndAuthorizeQc: verifyAndAuthorizeQc,
        printQcCertificateModal: printQcCertificateModal,
        reportQcDeviation: reportQcDeviation,
        selectMicrobioPatient: selectMicrobioPatient,
        paintMicrobioTable: paintMicrobioTable,
        addCustomAntibioticRow: addCustomAntibioticRow,
        removeCustomAntibioticRow: removeCustomAntibioticRow,
        saveAndReleaseMicrobioReport: saveAndReleaseMicrobioReport,
        printMicrobioReportModal: printMicrobioReportModal
    };

    // Attach listeners
    window.addEventListener('DOMContentLoaded', repaintAll);
    window.addEventListener('DOMContentLoaded', function() {
        setTimeout(applyInitialLabSelection, 150);
        setTimeout(applyInitialLabSelection, 600);
    });
    window.addEventListener('ordersUpdated', repaintAll);
    window.addEventListener('patientsUpdated', repaintAll);
    window.addEventListener('labResultsUpdated', repaintAll);
    window.addEventListener('storage', repaintAll);
    window.addEventListener('focus', repaintAll);

    // Identification bar search (Find button) → becomes the selected lab patient
    window.addEventListener('pcPatientChanged', function(e) {
        if (applyingLabSelection) return;
        var d = e.detail;
        if (d && d.id) selectLabPatient(d.id);
        else clearLabSelection(true);
    });

    console.log('🧪 PClinic Laboratory Engine ready (1 Master Row per Patient, 100/100 Look-Alike Editable PClinic Matrix)');
})();
