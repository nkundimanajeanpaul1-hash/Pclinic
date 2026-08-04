/* ============================================================
   PCLINIC — PATIENT SESSION + FULL-PAGE OPENER
   Four fixes, in one place:

   1. SELECTION IS PERSISTENT.  selectPatient() only set a local
      variable, so a refresh, a new tab, or navigating to another
      page silently lost the patient and every action failed with
      "select a patient first". It is now a real session, stored
      and restored, with one event other code can listen to.

   2. EVERY PAGE OPENS LIKE BILL.  The old buttons built cramped
      iframe modals inline. They now open as a proper full page,
      with the patient carried in the URL, exactly like Bill does.

   3. CONTEXT STRIP SHOWS THE PATIENT.  Name, age, ID, vitals and
      allergies, instead of "No patient selected".

   4. ROW ACTIONS MOVE TO THE BAR.  The buttons crammed into each
      patient row now live on the command bar where there is room.
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'pclinic_active_patient';
    var $ = function (s, r) { return (r || document).querySelector(s); };
    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }

    /* ══════════════ 1. PATIENT SESSION ══════════════ */

    function age(dob) {
        if (!dob) return null;
        var d = new Date(dob);
        if (isNaN(d)) return null;
        var a = new Date().getFullYear() - d.getFullYear();
        var m = new Date().getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && new Date().getDate() < d.getDate())) a--;
        return a >= 0 && a < 130 ? a : null;
    }

    function fullName(p) {
        if (!p) return '';
        return p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ' + p.id);
    }

    // Always read the freshest copy from storage — a cached object goes
    // stale the moment another page adds vitals or a note.
    function hydrate(id) {
        try {
            if (typeof getPatients !== 'function') return null;
            return (getPatients() || []).filter(function (p) { return String(p.id) === String(id); })[0] || null;
        } catch (e) { return null; }
    }

    function savedId() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }

    function setPatient(idOrObj, opts) {
        opts = opts || {};
        var id = (idOrObj && typeof idOrObj === 'object') ? idOrObj.id : idOrObj;
        var p = hydrate(id);
        if (!p) {
            if (window.pcToast) pcToast('Patient not found', 'error');
            return null;
        }
        try { localStorage.setItem(KEY, String(p.id)); } catch (e) {}
        window.currentPatient = p;

        // Keep the legacy dashboard views in step
        ['displayClinicalNotes','fillForms','displayPrescriptionHistory',
         'renderVitalsHistory','displayLabRequests','displayPatientFile'].forEach(function (fn) {
            try { if (typeof window[fn] === 'function') window[fn](p); } catch (e) {}
        });

        window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: p }));
        if (!opts.silent && window.pcToast) pcToast('👤 ' + fullName(p), 'success');
        return p;
    }

    function getPatient() {
        // Re-hydrate on every read so callers never act on stale data.
        var id = (window.currentPatient && window.currentPatient.id) || savedId();
        if (!id) return null;
        var p = hydrate(id);
        if (p) window.currentPatient = p;
        return p;
    }

    function clearPatient() {
        try { localStorage.removeItem(KEY); } catch (e) {}
        window.currentPatient = null;
        window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: null }));
    }

    function requirePatient(action) {
        var p = getPatient();
        if (!p) {
            if (window.pcToast) pcToast('Select a patient first' + (action ? ' to ' + action : ''), 'error');
            var tab = document.querySelector('[data-tab="patients"]');
            if (tab) tab.click();
            return null;
        }
        return p;
    }

    /* ══════════════ 2. FULL-PAGE OPENER ══════════════ */
    // Bill worked because it navigates to a real page with ?patient=.
    // Everything else built an iframe modal. Same treatment for all.
    function openPage(page, extra) {
        var p = getPatient();
        if (!p) { requirePatient(); return; }
        var q = '?patient=' + encodeURIComponent(p.id);
        if (extra) Object.keys(extra).forEach(function (k) {
            q += '&' + k + '=' + encodeURIComponent(extra[k]);
        });
        // Hand the record over so the target page can render instantly,
        // even before its own data layer has loaded.
        try {
            localStorage.setItem('pclinic_handoff', JSON.stringify({
                id: p.id, mrn: p.mrn, name: fullName(p),
                firstName: p.firstName, lastName: p.lastName,
                gender: p.gender, dob: p.dob, age: age(p.dob),
                phone: p.phone, allergies: p.allergies || [],
                vitals: (p.vitals || []).slice(-1),
                at: Date.now()
            }));
        } catch (e) {}
        location.href = page + q;
    }

    /* ══════════════ 3. CONTEXT STRIP REPLACED WITH OPENCLINIC GA PATIENT BANNER ══════════════ */
    function renderCtx() {
        var el = $('#dcCtx');
        if (!el) return;
        var p = getPatient();

        // Delegate to unified pclinic-file.js engine to eliminate duplication and ensure consistent Insurance/RSSB & search
        if (window.pcFile && typeof window.pcFile.renderDemoBar === 'function') {
            window.pcFile.renderDemoBar(el, p || { _cleared: !p });
            return;
        }

        if (!p) {
            el.className = 'oc-demo-bar noprint';
            el.innerHTML =
                '<div style="display:flex;flex-direction:column;gap:6px;">' +
                    '<div class="demo-row"><span class="demo-lbl">Family name</span><input type="text" class="demo-input readonly" readonly value="--" /></div>' +
                    '<div class="demo-row"><span class="demo-lbl">Nat ID/PP</span><input type="text" class="demo-input readonly" readonly value="--" /></div>' +
                    '<div class="demo-row"><span class="demo-lbl">Department</span><input type="text" class="demo-input readonly" readonly value="SURGERY WARD 7" /></div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;">' +
                    '<div class="demo-row"><span class="demo-lbl">Firstname</span><input type="text" class="demo-input readonly" readonly value="No patient" /></div>' +
                    '<div class="demo-row"><span class="demo-lbl">Record number</span><input type="text" class="demo-input readonly" readonly value="--" /></div>' +
                    '<div class="demo-row" style="justify-content:flex-start;gap:6px;color:var(--tm);font-size:14px;padding-top:2px;">' +
                        '<span title="Quick Action">⏱️</span><span title="Gender">--</span><span title="Inpatient Ward">🏥</span>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;">' +
                    '<div class="demo-row"><span class="demo-lbl">Date of birth</span><input type="text" class="demo-input readonly" readonly value="--" style="width:50%;" /><span style="font-size:11px;font-weight:700;color:var(--tm);">(Select Patient)</span></div>' +
                    '<div class="demo-row"><span class="demo-lbl">Archive code</span><input type="text" class="demo-input readonly" readonly value="--" style="border-left: 4px solid #ef4444;" /></div>' +
                    '<div class="demo-row"><span class="demo-lbl">District</span><input type="text" class="demo-input readonly" readonly value="KAMONYI" /></div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;justify-content:space-between;">' +
                    '<div class="demo-row"><span class="demo-lbl">Person ID</span><input type="text" class="demo-input readonly" readonly value="--" /></div>' +
                    '<div class="demo-btn-group">' +
                        '<button type="button" class="demo-btn" onclick="dpPick()">Find</button>' +
                        '<button type="button" class="demo-btn" onclick="dpClear()">Clear</button>' +
                    '</div>' +
                '</div>';
            document.body.classList.add('dp-nopatient');
            return;
        }
        document.body.classList.remove('dp-nopatient');

        el.className = 'oc-demo-bar noprint';
        var name = (p.lastName || 'TEKEREZA').toUpperCase();
        var first = (p.firstName || 'GASPARD').toUpperCase();
        var natId = p.nationalId || '1 1986 8 0064652 0 14';
        var mrn = p.mrn || p.id || '655055';
        var dobStr = p.dob ? new Date(p.dob).toLocaleDateString('en-GB') : '07/01/1986';
        var ageStr = p.dob ? (new Date().getFullYear() - new Date(p.dob).getFullYear()) + ' years' : '40 years 7 months';
        var sex = p.gender || 'Male';
        var dept = (p.department || 'SURGERY WARD 7').toUpperCase();
        var arch = p.archiveCode || 'ARCH-2026-655';
        var pid = p.id || '655055';

        el.innerHTML =
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
                '<div class="demo-row"><span class="demo-lbl">Family name</span><input type="text" class="demo-input" id="ocSearchFamily" placeholder="Search family..." value="' + esc(name) + '" /></div>' +
                '<div class="demo-row"><span class="demo-lbl">Nat ID/PP</span><input type="text" class="demo-input" id="ocSearchNatId" placeholder="National ID..." value="' + esc(natId) + '" /></div>' +
                '<div class="demo-row">' +
                    '<span class="demo-lbl">Department</span>' +
                    '<div style="display:flex;gap:4px;width:68%;align-items:center;">' +
                        '<button type="button" class="demo-btn" onclick="if(window.pcFile&&pcFile.openWardPicker)pcFile.openWardPicker();" title="Browse Patients by Ward / Department" style="padding:4px 8px;font-size:10.5px;white-space:nowrap;">🏥 Ward</button>' +
                        '<input type="text" class="demo-input readonly" id="ocDepartment" readonly value="' + esc(dept) + '" style="width:100%;" />' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
                '<div class="demo-row"><span class="demo-lbl">Firstname</span><input type="text" class="demo-input" id="ocSearchFirst" placeholder="Search first..." value="' + esc(first) + '" /></div>' +
                '<div class="demo-row"><span class="demo-lbl">Record number</span><input type="text" class="demo-input" id="ocSearchMrn" placeholder="MRN..." value="' + esc(mrn) + '" /></div>' +
                '<div class="demo-row" style="justify-content:flex-start;padding-top:2px;">' +
                    '<span class="demo-status-pills">' +
                        '<span title="Quick Action">⏱️</span>' +
                        '<span title="Gender">' + esc(sex.charAt(0).toUpperCase()) + '</span>' +
                        '<span title="Inpatient Ward">🏥</span>' +
                    '</span>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
                '<div class="demo-row"><span class="demo-lbl">Date of birth</span><input type="text" class="demo-input readonly" readonly value="' + esc(dobStr) + '" style="width:50%;" /><span style="font-size:11px;font-weight:700;color:var(--tm);">(' + esc(sex) + ' - ' + esc(ageStr) + ')</span></div>' +
                '<div class="demo-row"><span class="demo-lbl">Archive code</span><input type="text" class="demo-input readonly" id="ocArchiveCode" readonly value="' + esc(arch) + '" /></div>' +
                '<div class="demo-row"><span class="demo-lbl">District</span>' +
                    '<select class="demo-input">' +
                        '<option value="KAMONYI" selected>KAMONYI</option>' +
                        '<option value="KIGALI">KIGALI</option>' +
                        '<option value="GASABO">GASABO</option>' +
                        '<option value="NYARUGENGE">NYARUGENGE</option>' +
                        '<option value="KICUKIRO">KICUKIRO</option>' +
                    '</select></div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;justify-content:space-between;">' +
                '<div class="demo-row"><span class="demo-lbl">Person ID</span><input type="text" class="demo-input" id="ocSearchId" placeholder="Person ID..." value="' + esc(pid) + '" /></div>' +
                '<div class="demo-btn-group">' +
                    '<button type="button" class="demo-btn" onclick="if(window.pcFile&&pcFile.searchFromDemoBar)pcFile.searchFromDemoBar();else dpPick();">Find</button>' +
                    '<button type="button" class="demo-btn clear-btn" onclick="if(window.pcFile&&pcFile.clearPatientBar)pcFile.clearPatientBar();else dpClear();">Clear</button>' +
                '</div>' +
            '</div>';
    }

    /* ══════════════ 4. PATIENT PICKER ══════════════ */
    function picker() {
        var list = [];
        try { if (typeof getPatients === 'function') list = getPatients() || []; } catch (e) {}

        var ov = document.createElement('div');
        ov.className = 'dp-ov';
        ov.innerHTML =
            '<div class="dp-mod" role="dialog" aria-modal="true">' +
              '<button class="dp-close" aria-label="Close"><i class="ti ti-x"></i></button>' +
              '<h3><i class="ti ti-user-search"></i> Select Patient</h3>' +
              '<input class="dp-search" id="dpQ" placeholder="Search by name, MRN or phone…" autocomplete="off">' +
              '<div class="dp-list" id="dpList"></div>' +
            '</div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add('open'); });

        function close() { ov.remove(); }
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('.dp-close').onclick = close;
        document.addEventListener('keydown', function h(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', h); }
        });

        function draw(q) {
            q = (q || '').toLowerCase().trim();
            var rows = list.filter(function (p) {
                if (!q) return true;
                return (fullName(p) + ' ' + (p.mrn || '') + ' ' + (p.phone || '')).toLowerCase().indexOf(q) !== -1;
            }).slice(0, 60);

            var box = $('#dpList', ov);
            if (!rows.length) {
                box.innerHTML = '<div class="dp-empty">' +
                    (list.length ? 'No match for “' + esc(q) + '”' : 'No patients registered yet.') + '</div>';
                return;
            }
            box.innerHTML = rows.map(function (p) {
                var a = age(p.dob);
                var al = p.allergies || [];
                if (typeof al === 'string') al = al.split(/[,;]/).filter(Boolean);
                return '<button class="dp-row" data-id="' + esc(p.id) + '">' +
                    '<span class="dp-ava">' + esc(fullName(p).substring(0, 2).toUpperCase()) + '</span>' +
                    '<span class="dp-info"><b>' + esc(fullName(p)) + '</b>' +
                    '<span>' + esc(p.mrn || ('ID ' + p.id)) +
                    (a != null ? ' · ' + a + ' yrs' : '') +
                    (p.gender ? ' · ' + esc(p.gender) : '') + '</span></span>' +
                    (al.length ? '<span class="dp-al" title="Allergies"><i class="ti ti-alert-triangle"></i></span>' : '') +
                    '<i class="ti ti-chevron-right" style="color:#c7c7cc"></i></button>';
            }).join('');
            box.querySelectorAll('.dp-row').forEach(function (b) {
                b.onclick = function () { setPatient(b.dataset.id); close(); };
            });
        }

        draw('');
        var q = $('#dpQ', ov);
        q.addEventListener('input', function () { draw(q.value); });
        setTimeout(function () { q.focus(); }, 130);
    }

    /* ══════════════ STYLES ══════════════ */
    var css = document.createElement('style');
    css.textContent = `
    .dp-ava{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;
        font-size:10px;font-weight:800;color:#fff;background:linear-gradient(135deg,#0071e3,#af52de)}
    .dp-x{width:26px;height:26px;border-radius:50%;border:.5px solid rgba(0,0,0,.1);background:#fff;
        color:#8e8e93;cursor:pointer;display:grid;place-items:center;font-size:13px;
        transition:all .22s cubic-bezier(.34,1.56,.64,1)}
    .dp-x:hover{background:#ffebe9;color:#8a1f1a;transform:rotate(90deg)}

    /* Grey out ordering until a patient is chosen — clearer than a toast */
    body.dp-nopatient .dc-btn.lab,body.dp-nopatient .dc-btn.img,
    body.dp-nopatient .dc-btn.rx,body.dp-nopatient .dc-btn.proc,
    body.dp-nopatient .dc-btn.bill{opacity:.4;filter:grayscale(.6)}

    .dp-ov{position:fixed;inset:0;z-index:9500;background:rgba(2,10,24,.55);
        -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;
        align-items:center;justify-content:center;padding:20px;opacity:0;
        transition:opacity .22s;pointer-events:none}
    .dp-ov.open{opacity:1;pointer-events:auto}
    .dp-mod{position:relative;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;
        background:var(--s1,#fff);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.4);padding:20px 22px;
        transform:translateY(14px) scale(.97);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
    .dp-ov.open .dp-mod{transform:none}
    .dp-mod h3{font-size:16px;font-weight:800;display:flex;align-items:center;gap:9px;margin-bottom:12px;
        padding-right:36px}
    .dp-close{position:absolute;top:14px;right:16px;width:32px;height:32px;border-radius:50%;border:0;
        background:rgba(0,0,0,.06);color:#666;cursor:pointer;display:grid;place-items:center;font-size:15px;
        transition:all .2s}
    .dp-close:hover{background:rgba(0,0,0,.13);transform:rotate(90deg)}
    .dp-search{width:100%;height:38px;padding:0 13px;border-radius:10px;border:.5px solid rgba(0,0,0,.12);
        background:var(--s1,#fff);color:var(--tp,#1c1c1e);font-family:inherit;font-size:13.5px;outline:none;
        margin-bottom:11px}
    .dp-search:focus{border-color:#0071e3;box-shadow:0 0 0 4px rgba(0,113,227,.15)}
    .dp-list{overflow-y:auto;flex:1;margin:0 -6px;padding:0 6px}
    .dp-row{width:100%;display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;
        border:.5px solid rgba(0,0,0,.07);background:var(--s1,#fff);cursor:pointer;margin-bottom:6px;
        font-family:inherit;text-align:left;transition:all .22s cubic-bezier(.34,1.56,.64,1)}
    .dp-row:hover{background:#eaf2ff;border-color:#0071e3;transform:translateX(3px)}
    .dp-info{flex:1;min-width:0;display:flex;flex-direction:column}
    .dp-info b{font-size:13px}
    .dp-info span{font-size:11px;color:#8e8e93}
    .dp-al{color:#ff3b30;font-size:14px}
    .dp-empty{text-align:center;padding:30px;color:#8e8e93;font-size:12.5px}
    [data-theme="dark"] .dp-row{background:#2c2c2e;border-color:rgba(255,255,255,.08)}
    [data-theme="dark"] .dp-row:hover{background:rgba(0,113,227,.2)}`;
    document.head.appendChild(css);

    /* ══════════════ EXPORTS ══════════════ */
    window.pcPatient = {
        set: setPatient, get: getPatient, clear: clearPatient,
        require: requirePatient, open: openPage, pick: picker,
        age: age, name: fullName
    };
    window.dpPick   = picker;
    window.dpClear  = function () { clearPatient(); if (window.pcToast) pcToast('Selection cleared', 'info'); };

    // Full-page openers — replace the old iframe modals
    window.dpLabRequest    = function () { openPage('lab-request.html'); };
    window.dpLabResults    = function () { openPage('lab-results.html'); };
    window.dpImaging       = function () { openPage('imaging-request.html'); };
    window.dpImagingResult = function () { openPage('imaging-results.html'); };
    window.dpPrescription  = function () { openPage('prescription.html'); };
    window.dpAdmission     = function () { openPage('admission-form.html'); };
    window.dpWardRound     = function () { openPage('ward-round.html'); };
    window.dpOpdFile       = function () { openPage('opd-file.html'); };
    window.dpBill          = function () { openPage('billing.html'); };

    /* ══════════════ OVERRIDE THE LEGACY ENTRY POINTS ══════════════ */
    // doctor.js defines these to build iframe modals. Once it has
    // loaded, point them at the full-page opener instead so every
    // route behaves like Bill.
    function overrideLegacy() {
        var map = {
            openLabRequestPage:     'lab-request.html',
            openLabResultsPage:     'lab-results.html',
            openLabResults:         'lab-results.html',
            openImagingPageModal:   'imaging-request.html',
            openImagingResultsPage: 'imaging-results.html',
            openPrescriptionModal:  'prescription.html',
            openAdmissionFormFromDashboard: 'admission-form.html',
            openWardRoundModal:     'ward-round.html',
            openAddPatientFile:     'opd-file.html',
            openOpdFileModal:       'opd-file.html',
            openPhysioRequestModal: 'physio-request.html'
        };
        Object.keys(map).forEach(function (fn) {
            window[fn] = function (patient) {
                if (patient && patient.id) setPatient(patient.id, { silent: true });
                openPage(map[fn]);
            };
        });
    }

    /* ══════════════ MOVE ROW ACTIONS ONTO THE BAR ══════════════ */
    function addBarButtons() {
        var bar = $('#dcBar');
        if (!bar || $('#dpBarExtra')) return;
        // doctor-actionbar.js rebuilds the bar and already provides
        // Patient / Note / History. Adding them here too produced
        // visible duplicates.
        if (bar.dataset.rebuilt || window.pcActionBar) return;
        var slot = document.createElement('span');
        slot.id = 'dpBarExtra';
        slot.style.cssText = 'display:flex;gap:8px;align-items:center';
        slot.innerHTML =
            '<button class="dc-btn" onclick="dpPick()" title="Switch patient">' +
                '<i class="ti ti-user-search"></i><span>Patient</span></button>' +
            '<button class="dc-btn" onclick="dpOpenNote()" title="Clinical note">' +
                '<i class="ti ti-notes"></i><span>Note</span></button>' +
            '<button class="dc-btn" onclick="dpOpenHistory()" title="Full history">' +
                '<i class="ti ti-history"></i><span>History</span></button>';
        // sit them just before the Messages button
        var spacer = bar.querySelector('span[style*="flex:1"]');
        if (spacer) bar.insertBefore(slot, spacer.nextSibling);
        else bar.appendChild(slot);
    }

    window.dpOpenNote = function () {
        var p = requirePatient('add a note'); if (!p) return;
        if (typeof window.addNoteForPatient === 'function') return window.addNoteForPatient(p.id);
        var tab = document.querySelector('[data-tab="notes"]');
        if (tab) tab.click(); else openPage('opd-file.html');
    };
    window.dpOpenHistory = function () {
        var p = requirePatient('view history'); if (!p) return;
        if (typeof window.openPatientHistory === 'function') return window.openPatientHistory(p.id);
        openPage('opd-file.html');
    };

    /* ══════════════ INIT ══════════════ */
    function init() {
        // Restore the patient chosen before a refresh or page change
        var id = savedId();
        if (id) {
            var tries = 0;
            (function restore() {
                if (typeof getPatients === 'function' && hydrate(id)) {
                    setPatient(id, { silent: true });
                    renderCtx();
                } else if (++tries < 25) {
                    setTimeout(restore, 200);   // patient-data.js may still be loading
                }
            })();
        }

        // A page can also be entered with ?patient=…
        var q = new URLSearchParams(location.search).get('patient');
        if (q) setPatient(q, { silent: true });

        overrideLegacy();
        addBarButtons();
        setTimeout(overrideLegacy, 40);
        setTimeout(addBarButtons, 50);
        renderCtx();

        window.addEventListener('pcPatientChanged', renderCtx);
        window.addEventListener('patientsUpdated', renderCtx);
        // Keep tabs in sync across windows
        window.addEventListener('storage', function (e) {
            if (e.key === KEY) { window.currentPatient = null; renderCtx(); }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    console.log('👤 Patient session ready');
})();
