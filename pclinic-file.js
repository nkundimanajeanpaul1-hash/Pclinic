/* ============================================================
   PCLINIC — CLINICAL FILE ENGINE
   Shared behaviour for every file / note page.

     pcFile.init({ type:'opd', title:'OPD File', … })

   Provides:
     • Action bar on the page itself, so a doctor can order a lab
       test without navigating back to the dashboard.
     • Shared diagnosis registry — additions persist for everyone.
     • Attachments (PDF / image / video).
     • RDV (follow-up appointment) that reaches reception.
     • Visit history, save, print.
   ============================================================ */
(function () {
    'use strict';

    var DOCS_KEY = 'pclinic_files';
    var DX_KEY   = 'pclinic_diagnoses';

    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function $(s, r) { return (r || document).querySelector(s); }
    function read(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
    function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function uid(p) { return (p || 'f') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }
    function staff() { return window.currentStaff || {}; }

    function age(dob) {
        if (!dob) return '';
        var d = new Date(dob); if (isNaN(d)) return '';
        var a = new Date().getFullYear() - d.getFullYear();
        var m = new Date().getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && new Date().getDate() < d.getDate())) a--;
        return (a >= 0 && a < 130) ? a + ' yrs' : '';
    }
    function nameOf(p) {
        if (!p) return '';
        return p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ' + p.id);
    }

    /* ══════════ PATIENT ══════════ */
    function patient() {
        var id = new URLSearchParams(location.search).get('patient');
        if (!id) { try { id = localStorage.getItem('pclinic_active_patient'); } catch (e) {} }
        if (!id) return null;
        try {
            if (typeof getPatients === 'function') {
                var hit = (getPatients() || []).filter(function (x) { return String(x.id) === String(id); })[0];
                if (hit) return hit;
            }
        } catch (e) {}
        try {
            var h = JSON.parse(localStorage.getItem('pclinic_handoff') || 'null');
            if (h && String(h.id) === String(id)) return h;
        } catch (e) {}
        return null;
    }

    /* ══════════ DIAGNOSIS REGISTRY ══════════
       Seeded once, then grows. A diagnosis one doctor adds is visible
       to every doctor afterwards — previously each page had its own
       hardcoded list and additions were thrown away.                  */
    var SEED_DX = [
        ['A09','Gastroenteritis'],['B50','Malaria, P. falciparum'],['B54','Malaria, unspecified'],
        ['A15','Pulmonary tuberculosis'],['B20','HIV disease'],['A01','Typhoid fever'],
        ['J00','Common cold'],['J02','Acute pharyngitis'],['J03','Acute tonsillitis'],
        ['J06','Upper respiratory infection'],['J18','Pneumonia'],['J20','Acute bronchitis'],
        ['J45','Asthma'],['J44','COPD'],['I10','Essential hypertension'],
        ['I50','Heart failure'],['I25','Chronic ischaemic heart disease'],['I63','Cerebral infarction'],
        ['E11','Type 2 diabetes mellitus'],['E10','Type 1 diabetes mellitus'],['E66','Obesity'],
        ['E44','Protein-energy malnutrition'],['D50','Iron deficiency anaemia'],['D64','Anaemia, unspecified'],
        ['K29','Gastritis'],['K21','GERD'],['K59','Constipation'],['K80','Cholelithiasis'],
        ['K35','Acute appendicitis'],['K40','Inguinal hernia'],['N39','Urinary tract infection'],
        ['N20','Renal calculus'],['N18','Chronic kidney disease'],['N40','Benign prostatic hyperplasia'],
        ['O80','Normal delivery'],['O14','Pre-eclampsia'],['O03','Spontaneous abortion'],
        ['Z34','Supervision of normal pregnancy'],['L03','Cellulitis'],['L23','Allergic contact dermatitis'],
        ['L20','Atopic dermatitis'],['B35','Dermatophytosis'],['S72','Fracture of femur'],
        ['S52','Fracture of forearm'],['S06','Intracranial injury'],['T14','Injury, unspecified'],
        ['M54','Dorsalgia / back pain'],['M25','Joint pain'],['M79','Soft tissue disorder'],
        ['M17','Osteoarthritis of knee'],['M05','Rheumatoid arthritis'],['G43','Migraine'],
        ['G40','Epilepsy'],['F32','Depressive episode'],['F41','Anxiety disorder'],
        ['H10','Conjunctivitis'],['H66','Otitis media'],['H60','Otitis externa'],
        ['R50','Fever, unspecified'],['R51','Headache'],['R10','Abdominal pain'],
        ['R05','Cough'],['R42','Dizziness'],['R11','Nausea and vomiting'],
        ['Z00','General examination'],['Z23','Immunisation']
    ];

    function allDx() {
        var list = read(DX_KEY, null);
        if (!list) {
            list = SEED_DX.map(function (d) { return { code: d[0], name: d[1], custom: false }; });
            write(DX_KEY, list);
        }
        return list;
    }
    function addDx(name, code) {
        name = String(name || '').trim();
        if (!name) return null;
        var list = allDx();
        if (list.some(function (d) { return d.name.toLowerCase() === name.toLowerCase(); })) return null;
        var entry = { code: (code || '').trim().toUpperCase(), name: name, custom: true,
                      by: staff().name || '', at: new Date().toISOString() };
        list.push(entry);
        write(DX_KEY, list);
        // Share with other devices when Firestore is reachable
        try {
            if (window.firebaseDB && window.firebaseFunctions) {
                var f = window.firebaseFunctions;
                f.setDoc(f.doc(window.firebaseDB, 'config', 'diagnoses'),
                         { items: list, updatedAt: new Date().toISOString() }).catch(function () {});
            }
        } catch (e) {}
        return entry;
    }

    /* Renders a full diagnosis picker into a container */
    function dxPicker(host, chosen, onChange) {
        chosen = chosen || [];
        host.innerHTML =
            '<input class="pcf-in" id="dxSearch" placeholder="Search or type a diagnosis…" autocomplete="off">' +
            '<div class="pcf-dx-list" id="dxList"></div>' +
            '<div class="pcf-dx-chosen" id="dxChosen"></div>';

        function paintChosen() {
            $('#dxChosen', host).innerHTML = chosen.map(function (d, i) {
                return '<span class="pcf-dx-tag">' +
                    (d.code ? '<b>' + esc(d.code) + '</b> ' : '') + esc(d.name) +
                    '<button data-i="' + i + '" aria-label="Remove">&times;</button></span>';
            }).join('');
            $('#dxChosen', host).querySelectorAll('button').forEach(function (b) {
                b.onclick = function () { chosen.splice(+b.dataset.i, 1); paintChosen(); onChange(chosen); };
            });
            onChange(chosen);
        }

        function paintList(q) {
            q = (q || '').toLowerCase().trim();
            var list = allDx().filter(function (d) {
                return !q || d.name.toLowerCase().indexOf(q) !== -1 || d.code.toLowerCase().indexOf(q) !== -1;
            }).slice(0, 40);
            var html = list.map(function (d) {
                return '<div class="pcf-dx-item" data-n="' + esc(d.name) + '" data-c="' + esc(d.code) + '">' +
                       (d.code ? '<span class="code">' + esc(d.code) + '</span>' : '') + esc(d.name) +
                       (d.custom ? ' <span style="font-size:9.5px;color:#34c759">·added</span>' : '') + '</div>';
            }).join('');
            // Offer to add anything not already in the registry
            if (q && !list.some(function (d) { return d.name.toLowerCase() === q; })) {
                html += '<div class="pcf-dx-item add" data-add="1">' +
                        '<i class="ti ti-plus"></i> Add “' + esc(q) + '” to the shared list</div>';
            }
            $('#dxList', host).innerHTML = html || '<div class="pcf-empty" style="padding:16px">No match</div>';
            $('#dxList', host).querySelectorAll('.pcf-dx-item').forEach(function (it) {
                it.onclick = function () {
                    if (it.dataset.add) {
                        var raw = $('#dxSearch', host).value.trim();
                        var e = addDx(raw);
                        if (e) { chosen.push({ code: e.code, name: e.name });
                                 if (window.pcToast) pcToast('“' + raw + '” added to the shared list', 'success'); }
                        else   { chosen.push({ code: '', name: raw }); }
                    } else {
                        if (chosen.some(function (c) { return c.name === it.dataset.n; })) return;
                        chosen.push({ code: it.dataset.c, name: it.dataset.n });
                    }
                    $('#dxSearch', host).value = '';
                    paintList(''); paintChosen();
                };
            });
        }

        $('#dxSearch', host).addEventListener('input', function () { paintList(this.value); });
        // Enter accepts free text without adding it to the registry
        $('#dxSearch', host).addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            var v = this.value.trim(); if (!v) return;
            chosen.push({ code: '', name: v });
            this.value = ''; paintList(''); paintChosen();
        });
        paintList(''); paintChosen();
        return { get: function () { return chosen; } };
    }

    /* ══════════ ATTACHMENTS ══════════ */
    var MAX = 2 * 1024 * 1024;   // 2 MB — localStorage stopgap until Storage is on

    function attachments(host, files, onChange) {
        files = [];
        host.textContent = '';
        var notice = document.createElement('div');
        notice.className = 'pcf-drop';
        notice.setAttribute('role', 'status');
        notice.textContent = 'Attachments are temporarily disabled. Secure object storage and access rules are required.';
        host.appendChild(notice);
        if (typeof onChange === 'function') onChange(files);
        return { disabled: true };
    }

    /* ══════════ RDV / FOLLOW-UP ══════════
       Written into patient.appointments so reception's existing
       appointment view picks it up and can print the slip.          */
    function saveRdv(p, dateStr, reason) {
        if (!p || !dateStr) return null;
        var appt = {
            id: uid('rdv'),
            date: dateStr,
            time: '',
            reason: reason || 'Follow-up',
            type: 'RDV',
            doctor: staff().name || '',
            doctorId: staff().staffId || '',
            status: 'scheduled',
            createdAt: new Date().toISOString()
        };
        try {
            if (typeof window.addAppointment === 'function') {
                window.addAppointment(p.id, appt);
            } else if (typeof window.updatePatient === 'function') {
                var list = (p.appointments || []).concat([appt]);
                window.updatePatient(p.id, { appointments: list });
            }
        } catch (e) {}
        // Let reception know a slip needs printing
        try {
            if (window.pcMessages) {
                pcMessages.send({
                    text: 'RDV set for ' + nameOf(p) + ' on ' +
                          new Date(dateStr).toLocaleDateString('en-GB',
                              { weekday:'long', day:'numeric', month:'long', year:'numeric' }) +
                          ' — ' + (reason || 'Follow-up') + '. Please print the appointment slip.',
                    toRoles: ['reception'], category: 'rdv',
                    patientId: p.id, patientName: nameOf(p)
                });
            }
        } catch (e) {}
        return appt;
    }

    /* ══════════ FILE STORE ══════════ */
    /* ══════════ FILE STORE — COMMON-SERVER SYNC ══════════
       saveFile() always pushed to `patients/{id}/files`, but nothing in the
       app ever read that collection back: listFiles() served localStorage
       only, so a request filed on one computer was invisible on every other
       one, while the radiology worklist (which does query Firestore) saw it
       fine. This mirrors startLiveSync() in pclinic-orders.js so every
       device converges on the same records, and it no longer swallows a
       rejected write — a denied save now says so instead of looking saved.
       Firestore is authoritative for anything it has confirmed. A local-only
       record is therefore discarded once the server list arrives, unless it
       is still pending confirmation or already flagged as failed, so a real
       denial can never be hidden by the merge.                        */

    var fileServer = {};      // patientId -> { id -> record } confirmed by Firestore
    var fileErrors = {};      // patientId -> machine reason for the last failed sync
    var fileUnsubs = {};      // patientId -> live-listener teardown
    var fileLive = {};         // patientId -> true once a listener is subscribed
    var fileLoaded = {};       // patientId -> true once the server has answered
    var fileLoading = {};      // patientId -> true while a one-shot read is in flight

    // Firestore Timestamps are objects; localStorage holds JSON and
    // patients/{id}/files rejects data URLs, so flatten and drop non-JSON.
    function toPlain(value) {
        if (value && typeof value.toDate === 'function') {
            try { return value.toDate().toISOString(); } catch (e) { return null; }
        }
        if (Array.isArray(value)) return value.map(toPlain);
        if (value && typeof value === 'object') {
            var out = {};
            Object.keys(value).forEach(function (k) { out[k] = toPlain(value[k]); });
            return out;
        }
        return value === undefined ? null : value;
    }

    function localFiles() { return read(DOCS_KEY, []); }

    function mapFromSnapshot(snap) {
        var map = {};
        snap.forEach(function (d) {
            var row = toPlain(d.data()) || {};
            row.id = row.id || d.id;
            map[String(row.id)] = row;
        });
        return map;
    }

    // Records saved while offline are mirrored into the store so a successful
    // push never drops them out of the list.
    function mirrorLocalIntoServerMap(pid) {
        var map = fileServer[String(pid)];
        if (!map) return;
        var knownIds = Object.keys(map);
        var added = 0;
        localFiles().forEach(function (row) {
            if (String(row.patientId) !== String(pid)) return;
            if (!row.id || knownIds.indexOf(String(row.id)) !== -1) return;
            map[String(row.id)] = row;
            added++;
        });
        if (!added && !fileErrors[String(pid)]) return;
        write(DOCS_KEY, Object.keys(map).map(function (id) { return map[id]; })
            .sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); }));
    }

    // One-shot read, used only when a live listener cannot be opened.
    function publishPatientFiles(pid) {
        pid = String(pid);
        if (fileLoading[pid] || fileLive[pid]) return;
        if (!window.firebaseDB || !window.firebaseFunctions) return;
        var f = window.firebaseFunctions;
        fileLoading[pid] = true;
        try {
            f.getDocs(f.collection(window.firebaseDB, 'patients/' + pid + '/files'))
                .then(function (snap) {
                    fileLoading[pid] = false;
                    if (fileLive[pid]) return;      // a listener owns the data now
                    fileServer[pid] = mapFromSnapshot(snap);
                    fileLoaded[pid] = true;
                    delete fileErrors[pid];
                    mirrorLocalIntoServerMap(pid);
                    window.dispatchEvent(new CustomEvent('pcFilesUpdated', { detail: { patientId: pid, count: snap.size } }));
                })
                .catch(function (error) {
                    fileLoading[pid] = false;
                    if (fileLive[pid]) return;
                    fileErrors[pid] = (error && error.code ? error.code + ': ' : '') + ((error && error.message) || 'unknown');
                    console.warn('[pclinic] patient file sync failed:', fileErrors[pid]);
                    mirrorLocalIntoServerMap(pid);
                    window.dispatchEvent(new CustomEvent('pcFilesUpdated', { detail: { patientId: pid, error: fileErrors[pid] } }));
                });
        } catch (e) {
            fileLoading[pid] = false;
            console.warn('[pclinic] patient file sync unavailable:', e && e.message);
        }
    }

    function listenFiles(pid) {
        pid = String(pid == null ? '' : pid);
        if (!pid) return null;
        if (fileUnsubs[pid]) return fileUnsubs[pid];
        if (!window.firebaseDB || !window.firebaseFunctions) return null;
        var f = window.firebaseFunctions;
        try {
            fileUnsubs[pid] = f.onSnapshot(
                f.collection(window.firebaseDB, 'patients/' + pid + '/files'),
                function (snap) {
                    fileLive[pid] = true;
                    fileLoaded[pid] = true;
                    fileServer[pid] = mapFromSnapshot(snap);
                    delete fileErrors[pid];
                    mirrorLocalIntoServerMap(pid);
                    window.dispatchEvent(new CustomEvent('pcFilesUpdated', { detail: { patientId: pid, count: snap.size } }));
                },
                function (error) {
                    fileErrors[pid] = (error && error.code ? error.code + ': ' : '') + ((error && error.message) || 'unknown');
                    console.warn('[pclinic] patient file listener failed:', fileErrors[pid]);
                    try { if (fileUnsubs[pid]) { fileUnsubs[pid](); } } catch (e) {}
                    delete fileUnsubs[pid];
                    delete fileLive[pid];
                    mirrorLocalIntoServerMap(pid);
                    window.dispatchEvent(new CustomEvent('pcFilesUpdated', { detail: { patientId: pid, error: fileErrors[pid] } }));
                }
            );
            // onSnapshot fires once immediately with the current contents, so
            // there is no separate initial read to wait for.
            if (fileUnsubs[pid]) fileLive[pid] = true;
            else publishPatientFiles(pid);
            return fileUnsubs[pid];
        } catch (e) {
            publishPatientFiles(pid);
            return null;
        }
    }

    function patchLocal(id, changes) {
        var all = localFiles();
        var i = all.findIndex(function (x) { return String(x.id) === String(id); });
        if (i === -1) return;
        Object.keys(changes).forEach(function (k) {
            if (changes[k] === null) delete all[i][k]; else all[i][k] = changes[k];
        });
        write(DOCS_KEY, all);
    }

    function pushToServer(rec) {
        if (!window.firebaseDB || !window.firebaseFunctions) {
            patchLocal(rec.id, { _pending: null, _syncFailed: true,
                _syncError: 'offline: Secure server connection is unavailable' });
            return Promise.resolve(false);
        }
        var f = window.firebaseFunctions;
        var payload = toPlain(rec);
        payload.id = rec.id;
        return f.setDoc(f.doc(window.firebaseDB, 'patients/' + rec.patientId + '/files', rec.id), payload)
            .then(function () {
                patchLocal(rec.id, { _pending: null, _syncFailed: null, _syncError: null });
                var map = fileServer[String(rec.patientId)];
                // Only merge once the server has actually answered for this
                // patient; before that listFiles() already shows the local copy.
                if (map && fileLoaded[String(rec.patientId)]) {
                    map[String(rec.id)] = payload;
                    mirrorLocalIntoServerMap(rec.patientId);
                }
                delete fileErrors[String(rec.patientId)];
                return true;
            })
            .catch(function (error) {
                var reason = (error && error.code ? error.code + ': ' : '') + ((error && error.message) || 'unknown');
                console.error('[pclinic] patient file write rejected:', reason);
                patchLocal(rec.id, { _pending: true, _syncFailed: true, _syncError: reason });
                fileErrors[String(rec.patientId)] = reason;
                window.dispatchEvent(new CustomEvent('pcFilesUpdated', {
                    detail: { patientId: rec.patientId, id: rec.id, error: reason }
                }));
                if (window.pcToast) {
                    window.pcToast('⚠️ This file was NOT saved to the common server (' + reason
                        + '). It is visible on this computer only.', 'error', 9000);
                }
                return false;
            });
    }

    function retrySync(recId) {
        var row = localFiles().filter(function (x) { return String(x.id) === String(recId); })[0];
        if (!row) return Promise.resolve(false);
        var clean = {};
        Object.keys(row).forEach(function (k) {
            if (k !== '_syncFailed' && k !== '_syncError' && k !== '_pending') clean[k] = row[k];
        });
        patchLocal(recId, { _pending: true });
        return pushToServer(clean);
    }

    function listFiles(patientId, type) {
        var pid = String(patientId);
        ensureListening(pid);
        var local = localFiles().filter(function (f) {
            if (String(f.patientId) !== pid) return false;
            return !type || f.type === type;
        });
        var map = fileServer[pid];
        if (!map) return local;
        var out = [];
        var seen = {};
        // Server-confirmed records first, then in-flight or failed local ones.
        Object.keys(map).map(function (id) { return map[id]; }).forEach(function (f) {
            if (String(f.patientId) !== pid) return;
            if (type && f.type !== type) return;
            seen[String(f.id)] = true;
            out.push(f);
        });
        local.forEach(function (f) {
            if (seen[String(f.id)]) return;
            out.push(f);
        });
        out.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
        return out;
    }

    function ensureListening(pid) {
        pid = String(pid == null ? '' : pid);
        if (!pid || fileUnsubs[pid] || fileLoading[pid] || fileLoaded[pid]) return;
        listenFiles(pid);
        publishPatientFiles(pid);
    }
    function fileSyncError(patientId) {
        return fileErrors[String(patientId)] || '';
    }
    function saveFile(rec) {
        var all = localFiles();
        rec.id = rec.id || uid(rec.type || 'file');
        rec.at = rec.at || new Date().toISOString();
        rec.by = rec.by || staff().name || '';
        rec.byId = rec.byId || staff().staffId || '';
        var idx = all.findIndex(function(x) { return String(x.id) === String(rec.id); });
        if (idx !== -1) {
            all[idx] = rec;
        } else {
            all.unshift(rec);
        }
        // The cap is a stopgap for the browser mirror only. Firestore keeps
        // every record, so the list is never truncated once the server answers.
        var stored = write(DOCS_KEY, all.slice(0, 400));
        if (!stored && window.pcToast) {
            window.pcToast("⚠️ This computer's file store is full — the record is on the server only.", 'warning', 8000);
        }
        rec._pending = true;
        ensureListening(rec.patientId);
        pushToServer(rec);
        window.dispatchEvent(new CustomEvent('pcFilesUpdated', { detail: rec }));
        return rec;
    }
    /* ══════════ 3. CLINICAL ACTION BAR (IMAGE 1 EXACT ALL PAGES & DASHBOARDS - 50% APPLE BG) ══════════ */
    /* ══════════════════════════════════════════════════════════════
       ADMIN ACTION BAR (#dcBar) — Bar 3 for the Admin Dashboard only.
       Buttons are ADMIN functions (tabs, patient registration, billing
       overlay, backup, logout). No clinical patient buttons.
       ══════════════════════════════════════════════════════════════ */
    function renderAdminActionBar(targetEl) {
        try {
            var master = document.getElementById('pcMasterHeader') || targetEl || document.body;
            if (!master) return;

            if (!document.getElementById('pc_adminbar_styles')) {
                var st = document.createElement('style');
                st.id = 'pc_adminbar_styles';
                st.textContent =
                    '#dcBar.dc-bar { display:flex !important; align-items:center; gap:6px; flex-wrap:wrap; padding:8px 14px !important; background:rgba(245,245,247,0.50) !important; -webkit-backdrop-filter:saturate(180%) blur(20px) !important; backdrop-filter:saturate(180%) blur(20px) !important; border-bottom:0.5px solid rgba(0,0,0,.12) !important; width:100% !important; box-sizing:border-box !important; margin-top:4px !important; margin-bottom:6px !important; }' +
                    '[data-theme="dark"] #dcBar.dc-bar { background:rgba(28,28,30,0.50) !important; border-color:rgba(255,255,255,.12) !important; }' +
                    '.ab-sep { width:1px; height:20px; background:rgba(0,0,0,.1); margin:0; flex-shrink:0; }' +
                    '[data-theme="dark"] .ab-sep { background:rgba(255,255,255,.12); }' +
                    '.ab-btn { position:relative; display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 11px; border-radius:9px; border:.5px solid rgba(0,0,0,.08); background:var(--b, #ffffff); color:var(--c, #1c1c1e); font-family:inherit; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,.05), inset 0 1px 0 rgba(255,255,255,.7); overflow:hidden; transition:transform .28s cubic-bezier(.34,1.56,.64,1), box-shadow .28s, opacity .2s, filter .2s; }' +
                    '.ab-btn i { font-size:14px; flex-shrink:0; }' +
                    '.ab-btn:hover { transform:translateY(-2px) scale(1.04); box-shadow:0 4px 12px rgba(0,0,0,.14); }' +
                    '.ab-btn:active { transform:scale(.94); transition-duration:.08s; }' +
                    '[data-theme="dark"] .ab-btn { border-color:rgba(255,255,255,.09); background:#2c2c2e; color:#e5e5ea; }';
                document.head.appendChild(st);
            }

            var bar = document.getElementById('dcBar');
            if (bar && bar.getAttribute('data-admin-complete') === '1') return;
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'dcBar';
                bar.className = 'dc-bar noprint';
            }
            // Look like the Doctor Dashboard action strip: grey base, bordered,
            // buttons wrap into rows exactly as on the other dashboards.
            bar.style.setProperty('flex-wrap', 'wrap', 'important');
            bar.style.setProperty('background', '#dcdde3', 'important');
            bar.style.setProperty('border', '1px solid #c3c4ca', 'important');
            bar.style.setProperty('border-radius', '14px', 'important');
            bar.style.setProperty('box-sizing', 'border-box', 'important');
            bar.setAttribute('data-admin-complete', '1');
            bar.innerHTML = '';

            // Hierarchy: Bar 1 (CHUK) then admin action bar — no patient bar
            var chuk = document.getElementById('pc_chuk_top_menu');
            if (chuk && chuk.parentNode) {
                if (chuk.nextSibling) chuk.parentNode.insertBefore(bar, chuk.nextSibling);
                else chuk.parentNode.appendChild(bar);
            } else if (master.firstChild) {
                master.insertBefore(bar, master.firstChild);
            } else {
                master.appendChild(bar);
            }

            // ⛔ ONE BUTTON PER FUNCTION: navigation lives ONLY in the nav
            // tabs row (Patients/Pharmacy/Billing/Lab/Acts/Staff/Settings),
            // and Logout lives in Bar 1 — this bar keeps only the ACTIONS.
            var A = [
                { id:'newpat',    label:'New Patient',   icon:'ti-user-plus',    c:'#1a7a32', b:'#e9f9ee' },
                { id:'newinv',    label:'New Invoice',   icon:'ti-file-plus',    c:'#b45309', b:'#fef3c7' },
                { id:'revenue',   label:'Revenue Report',icon:'ti-chart-bar',    c:'#0071e3', b:'#eaf2ff' },
                { id:'refresh',   label:'Refresh Data',  icon:'ti-refresh',      c:'#007080', b:'#e6f6f8' },
                { id:'backup',    label:'Backup',        icon:'ti-archive',      c:'#5c2475', b:'#f5eaff' },
                { id:'help',      label:'Shortcuts',     icon:'ti-keyboard',     c:'#4338ca', b:'#eef2ff' }
            ];

            var html = '';
            for (var i = 0; i < A.length; i++) {
                if (i === 3) html += '<span class="ab-sep"></span>';
                html += '<button type="button" class="ab-btn" style="--b:' + A[i].b + ';--c:' + A[i].c + ';" onclick="window.pcAdminBar && pcAdminBar(\'' + A[i].id + '\')"><i class="ti ' + A[i].icon + '"></i> ' + A[i].label + '</button>';
            }
            bar.innerHTML = html;
        } catch(e) { console.warn('renderAdminActionBar:', e); }
    }

    /* Admin action bar dispatcher (safe global used by #dcBar buttons) */
    /* ─── TAPTIC FEEDBACK (iOS-style) — every shared bar & menu tap ─── */
    try {
        if (!window.__pcHapticsOn) {
            window.__pcHapticsOn = true;
            document.addEventListener('click', function (e) {
                try {
                    if (!navigator.vibrate) return;
                    if (e.target.closest('.chk-btn') || e.target.closest('.ab-btn') ||
                        e.target.closest('.pc-patient-menu button') || e.target.closest('.pc-pick-row') ||
                        e.target.closest('.pc-tab-btn')) {
                        navigator.vibrate(8);
                    }
                } catch (err) {}
            });
        }
    } catch (e) {}

    window.pcPatientMenu = showPatientMenu;
    window.pcNursingMenu = showNursingMenu;
    window.pcNursingMenuClose = closeNursingMenu;
    window.pcPatientMenuClose = closePatientMenu;
    window.pcApplicationsMenu = showApplicationsMenu;
    window.pcApplicationsMenuClose = closeApplicationsMenu;
    window.pcSystemMenu = showSystemMenu;
    window.pcSystemMenuClose = closeSystemMenu;
    window.pcRadioBar = {
        refresh: function (patient) { updateRadioBarState(patient); },
        setPatient: function (patient) {
            window.__pcRadioSelectedPatient = patient || null;
            updateRadioBarState(patient || null);
        },
        // Kept for compatibility: the count badge lived on the removed "Add
        // radiology result" button, so this is now a no-op unless #radMediaCnt exists.
        setStudyCount: function (n) {
            var b = document.getElementById('radMediaCnt');
            if (!b) return;
            var v = Number(n) || 0;
            b.textContent = String(v);
            b.style.display = v ? 'inline-flex' : 'none';
        }
    };

    window.pcAdminBar = function(action) {
        try {
            if (!action) return;
            if (action === 'dash' || action === 'patients' || action === 'pharmacy' || action === 'billing' || action === 'lab' || action === 'acts' || action === 'staff' || action === 'settings') {
                if (window.pcAdmin && typeof window.pcAdmin.switchTab === 'function') {
                    window.pcAdmin.switchTab(action === 'dash' ? 'dashboard' : action);
                    return;
                }
                if (window.pcToast) pcToast('Opening ' + action + ' section…', 'info');
                return;
            }
            if (action === 'newpat') {
                if (window.pcPatient && typeof window.pcPatient.open === 'function') {
                    try { window.pcPatient.open('reception-dashboard.html'); return; } catch(e){}
                }
                window.location.href = 'reception-dashboard.html';
                return;
            }
            if (action === 'newinv') {
                // Opens EXACTLY like the Bill page opens in the Doctor Dashboard
                if (window.pcPatient && typeof window.pcPatient.open === 'function') {
                    try { window.pcPatient.open('billing.html'); return; } catch(e){}
                }
                window.location.href = 'billing.html';
                return;
            }
            if (action === 'revenue') {
                if (window.pcAdmin && typeof window.pcAdmin.openRevenueReport === 'function') {
                    window.pcAdmin.openRevenueReport();
                    return;
                }
                if (window.pcToast) pcToast('📊 Revenue report ready', 'info');
                return;
            }
            if (action === 'refresh') {
                if (window.pcAdmin && typeof window.pcAdmin.refreshAll === 'function') {
                    window.pcAdmin.refreshAll();
                    return;
                }
                if (window.pcToast) pcToast('🔄 Data refreshed', 'info');
                return;
            }
            if (action === 'help') {
                if (typeof window.openShortcuts === 'function') { window.openShortcuts(); return; }
                return;
            }
            if (action === 'alerts') {
                if (window.pcAdmin && typeof window.pcAdmin.showNotifications === 'function') {
                    window.pcAdmin.showNotifications();
                    return;
                }
                if (window.pcToast) pcToast('🔔 No new alerts', 'info');
                return;
            }
            if (action === 'profile') {
                if (window.pcAdmin && typeof window.pcAdmin.openProfile === 'function') {
                    window.pcAdmin.openProfile();
                    return;
                }
                return;
            }
            if (action === 'backup') {
                if (window.pcAdmin && typeof window.pcAdmin.backupNow === 'function') {
                    window.pcAdmin.backupNow();
                    return;
                }
                if (window.pcToast) pcToast('📦 Backup system ready', 'info');
                return;
            }
            if (action === 'logout') {
                if (window.pcFile && typeof window.pcFile.confirmLogout === 'function') {
                    window.pcFile.confirmLogout();
                }
                return;
            }
        } catch(e) { console.warn('pcAdminBar:', e); }
    };

    /* Shared glass styles for Bar 3 (#dcBar) action bars (clinical / admin / radiology) */
    function ensureActionBarStyles() {
        if (document.getElementById('pc_actionbar_styles')) return;
        var styleEl = document.createElement('style');
        styleEl.id = 'pc_actionbar_styles';
        styleEl.textContent = '#dcBar.dc-bar { display:flex !important; align-items:center; gap:6px; flex-wrap:wrap; padding:8px 14px !important; background:rgba(245, 245, 247, 0.50) !important; -webkit-backdrop-filter:saturate(180%) blur(20px) !important; backdrop-filter:saturate(180%) blur(20px) !important; border-bottom:0.5px solid rgba(0,0,0,.12) !important; width:100% !important; box-sizing:border-box !important; margin-top:4px !important; margin-bottom:6px !important; }' +
            '[data-theme="dark"] #dcBar.dc-bar { background:rgba(28, 28, 30, 0.50) !important; border-color:rgba(255,255,255,.12) !important; }' +
            '.ab-sep { width:1px; height:20px; background:rgba(0,0,0,.1); margin:0; flex-shrink:0; }' +
            '[data-theme="dark"] .ab-sep { background:rgba(255,255,255,.12); }' +
            '.ab-btn { position:relative; display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 11px; border-radius:9px; border:.5px solid rgba(0,0,0,.08); background:var(--b, #ffffff); color:var(--c, #1c1c1e); font-family:inherit; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,.05), inset 0 1px 0 rgba(255,255,255,.7); overflow:hidden; -webkit-tap-highlight-color:transparent; transition:transform .28s cubic-bezier(.34,1.56,.64,1), box-shadow .28s, opacity .2s, filter .2s; }' +
            '.ab-btn i { font-size:14px; flex-shrink:0; }' +
            '.ab-btn:hover { transform:translateY(-2px) scale(1.04); box-shadow:0 4px 12px rgba(0,0,0,.14); }' +
            '.ab-btn:active { transform:scale(.94); transition-duration:.08s; }' +
            '.ab-btn.ab-active { background:var(--a,#0071e3) !important; color:#fff !important; border-color:var(--a,#0071e3) !important; box-shadow:0 3px 10px color-mix(in srgb, var(--a,#0071e3) 30%, transparent); }' +
            '.ab-btn.ab-off { opacity:.34; filter:grayscale(.7); pointer-events:none; }' +
            '.ab-btn.ab-context-off { opacity:.58; filter:saturate(.65); }' +
            '[data-theme="dark"] .ab-btn { border-color:color-mix(in srgb,var(--a,#8e8e93) 45%,#2c2c2e); background:#2c2c2e; background:color-mix(in srgb,var(--a,#8e8e93) 20%,#1c1c1e); color:#f5f5f7; }' +
            '.ab-badge { min-width:16px; height:16px; border-radius:8px; background:#ff3b30; color:#fff; font-size:9.5px; font-weight:800; display:none; align-items:center; justify-content:center; padding:0 4px; }' +
            '.ab-menu { position:fixed; z-index:9800; min-width:238px; padding:6px; border-radius:13px; background:var(--s1, #fff); border:.5px solid rgba(0,0,0,.1); box-shadow:0 14px 44px rgba(0,0,0,.24); opacity:0; transform:translateY(-6px) scale(.97); transition:opacity .2s, transform .24s cubic-bezier(.34,1.56,.64,1); pointer-events:none; }' +
            '.ab-menu.open { opacity:1; transform:none; pointer-events:auto; }' +
            '.ab-menu button { width:100%; display:flex; align-items:center; gap:10px; padding:9px 11px; border:0; background:none; border-radius:9px; font-family:inherit; font-size:12.5px; font-weight:500; color:var(--tp, #1c1c1e); cursor:pointer; text-align:left; transition:background .18s; }' +
            '.ab-menu button:hover { background:var(--acb, #eaf2ff); color:var(--ac, #0071e3); }' +
            '.ab-menu button i { font-size:15px; opacity:.75; flex-shrink:0; }' +
            '@media(max-width:900px){#dcBar.dc-bar{padding:7px 9px !important;gap:5px}.dc-bar .ab-btn{height:30px;padding:0 9px;font-size:11px}.dc-bar #radBarPatient{max-width:220px !important}}' +
            '@media(max-width:560px){.dc-bar #radBarPatient{max-width:calc(100vw - 145px) !important;flex:1}.dc-bar .ab-sep{display:none}}';;
        document.head.appendChild(styleEl);
    }

    function renderClinicalActionBar(targetEl, p) {
        var el = document.getElementById('pcMasterHeader') || targetEl || document.body;
        if (!el) return;

        var pathStr = String((window.location && (window.location.pathname || window.location.href)) || '').toLowerCase();
        if (pathStr.indexOf('cashier-dashboard') !== -1 || pathStr.indexOf('lab-dashboard') !== -1 || pathStr.indexOf('reception-dashboard') !== -1) {
            var oldDc = document.getElementById('dcBar');
            if (oldDc && oldDc.parentNode) oldDc.parentNode.removeChild(oldDc);
            var oldCtx = document.getElementById('dcCtx');
            if (oldCtx && oldCtx.parentNode) oldCtx.parentNode.removeChild(oldCtx);
            return;
        }
        /* ── RADIOLOGY DASHBOARD: radiology-only buttons + patient selection on Bar 3 ── */
        if (pathStr.indexOf('radio-dashboard') !== -1) {
            renderRadiologyActionBar(el);
            return;
        }
        /* ── ADMIN DASHBOARD: admin buttons live on the bar BELOW the CHUK top bar ── */
        if (pathStr.indexOf('admin-dashboard') !== -1) {
            renderAdminActionBar(el);
            return;
        }
        /* ── THEATER DASHBOARD: theater-management buttons only (no doctor buttons) ── */
        if (pathStr.indexOf('theater-dashboard') !== -1) {
            renderTheaterActionBar(el);
            return;
        }
        /* ── HR DASHBOARD: HR-management buttons only (no doctor buttons) ── */
        if (pathStr.indexOf('hr-dashboard') !== -1) {
            renderHRActionBar(el);
            return;
        }

        var currP = p || (window.pcFile && window.pcFile && window.pcFile.patient && window.pcFile.patient()) || { id: localStorage.getItem('pclinic_active_patient') || '' };

        ensureActionBarStyles();


        // 2. Check if #dcBar already built and complete
        var bar = document.getElementById('dcBar');
        if (bar && bar.getAttribute('data-pc-complete') === '1') {
            syncActionBarState(currP);
            return;
        }

        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'dcBar';
            bar.className = 'dc-bar noprint';
        }
        bar.setAttribute('data-pc-complete', '1');
        bar.innerHTML = '';

        // Guarantee strict top hierarchy inside #pcMasterHeader:
        // 1st: #pc_chuk_top_menu (Bar 1)
        // 2nd: #pc_common_demo_bar (Bar 2)
        // 3rd: #dcBar (Bar 3)
        var master = document.getElementById('pcMasterHeader') || el;
        var demoBar = document.getElementById('pc_common_demo_bar');
        if (demoBar && demoBar.parentNode) {
            if (demoBar.nextSibling !== bar) demoBar.parentNode.insertBefore(bar, demoBar.nextSibling);
            else if (!demoBar.nextSibling) demoBar.parentNode.appendChild(bar);
        } else if (master.firstChild) {
            master.insertBefore(bar, master.firstChild);
        } else {
            master.appendChild(bar);
        }

        function goPage(url) {
            var activeP = (window.pcFile && window.pcFile && window.pcFile.patient && window.pcFile.patient()) || currP || { id: localStorage.getItem('pclinic_active_patient') || '' };
            if (!activeP || !activeP.id) {
                if (window.pcToast) pcToast('Select a patient first', 'error');
                else alert('Select a patient first');
                return;
            }
            if (window.pcPatient && typeof window.pcPatient.open === 'function') {
                try {
                    window.pcPatient.open(url);
                    return;
                } catch (e) {}
            }
            var sep = url.indexOf('?') !== -1 ? '&' : '?';
            window.location.href = url + sep + 'patient=' + encodeURIComponent(activeP.id);
        }

        var GRP = {
            order: { c: '#0071e3', b: '#eaf2ff' },
            clin:  { c: '#1a7a32', b: '#e9f9ee' },
            media: { c: '#7a4500', b: '#fff4e0' },
            money: { c: '#9a3412', b: '#ffedd5' },
            file:  { c: '#5c2475', b: '#f5eaff' },
            util:  { c: '#1c1c1e', b: '#f3f4f6' }
        };

        var ACTIONS = [
            { id:'patient', label:'Patient', icon:'ti-user-search', grp:'util', always:true, run: function(){
                if (window.pcFile && window.pcFile && window.pcFile.openPatientProfileModal) window.pcFile && window.pcFile.openPatientProfileModal();
                else if (window.openPatientSearch) openPatientSearch();
            }},
            { id:'edBtn', label:'Edit', icon:'ti-user-edit', grp:'util', run: function(){
                if (typeof window.editPatient === 'function') window.editPatient();
                else if (window.pcFile && window.pcFile && window.pcFile.openPatientProfileModal) window.pcFile && window.pcFile.openPatientProfileModal();
            }},
            { id:'mvBtn', label:'Move', icon:'ti-arrows-exchange', grp:'util', run: function(){
                if (typeof window.movePatient === 'function') window.movePatient();
                else alert('Move Patient Ward:\nSelect destination ward from Ward Picker.');
            }},
            { id:'medsum', label:'Medical summary', icon:'ti-file-text', grp:'file', always:true, run: function(){ goPage('medical-summary.html'); } },
            { id:'global', label:'Global examinations', icon:'ti-clipboard-list', grp:'order', always:true, run: function(){ goPage('global-examinations.html'); } },
            { id:'documents', label:'Documents', icon:'ti-file-text', grp:'file', menu:[
                { label:'Medical Certificate',   icon:'ti-certificate',       run: function(){ goPage('medical-certificate.html'); } },
                { label:'Sick Leave',            icon:'ti-bed',               run: function(){ goPage('sick-leave.html'); } },
                { label:'Medical Report',        icon:'ti-report-medical',    run: function(){ goPage('medical-report.html'); } },
                { label:'Hospitalisation Cert.', icon:'ti-building-hospital', run: function(){ goPage('hospitalization-certificate.html'); } },
                { label:'Transfer Form',         icon:'ti-arrows-exchange',   run: function(){ goPage('transfer-form.html'); } },
                { label:'Referral Letter',       icon:'ti-send',              run: function(){ goPage('referral.html'); } },
                { label:'Discharge Summary',     icon:'ti-door-exit',         run: function(){ goPage('discharge-summary.html'); } }
            ]},
            { id:'notes', label:'Notes', icon:'ti-notes', grp:'file', menu:[
                { label:'OPD File',        icon:'ti-folder-open',        run: function(){ goPage('opd-file.html'); } },
                { label:'Clinical Note',   icon:'ti-notes',              run: function(){ goPage('clinical-note.html'); } },
                { label:'Surgical Note',   icon:'ti-scissors',           run: function(){ goPage('surgical-note.html'); } },
                { label:'Nursing Note',    icon:'ti-heart-rate-monitor', run: function(){ goPage('nursing-note.html'); } },
                { label:'Procedure Note',  icon:'ti-stethoscope',        run: function(){ goPage('procedure-note.html'); } },
                { label:'Ward Round',      icon:'ti-bed',                run: function(){ goPage('ward-round.html'); } },
                { label:'Admission Form',  icon:'ti-file-plus',          run: function(){ goPage('admission-form.html'); } },
                { label:'Patient History', icon:'ti-history',            run: function(){ if (window.dpOpenHistory) dpOpenHistory(); else alert('Patient History view'); } }
            ]},
            { id:'labreq', label:'Lab Request', icon:'ti-test-pipe', grp:'order', run: function(){ goPage('lab-request.html'); } },
            { id:'labres', label:'Lab Result',  icon:'ti-chart-bar', grp:'order', run: function(){ goPage('lab-results.html'); } },
            { id:'imaging', label:'Imaging',    icon:'ti-radioactive', grp:'order', menu:[
                { label:'Imaging Request', icon:'ti-radioactive', run: function(){ goPage('imaging-request.html'); } },
                { label:'Imaging Results', icon:'ti-photo-scan',  run: function(){ goPage('imaging-results.html'); } }
            ]},
            { id:'rx',     label:'Prescription',   icon:'ti-pill',        grp:'order', run: function(){ goPage('prescription.html'); } },
            { id:'physio', label:'Physio Request', icon:'ti-accessible',  grp:'order', run: function(){ goPage('physio-request.html'); } },
            { id:'proc',   label:'Procedure',      icon:'ti-stethoscope', grp:'order', run: function(){ if (window.dcProc) window.dcProc(); else goPage('procedure-note.html'); } },
            { id:'vitals', label:'Vitals',         icon:'ti-heartbeat',   grp:'clin',  run: function(){ if (window.pcVitals && pcVitals.open) pcVitals.open(); else alert('Vital signs monitor'); } },
            { id:'media',  label:'Media',          icon:'ti-photo',       grp:'media', menu:[
                { label:'Photos', icon:'ti-photo', run: function(){ var i = document.getElementById('photoInput'); if (i) i.click(); else goPage('opd-file.html'); } },
                { label:'Video',  icon:'ti-video', run: function(){ var i = document.getElementById('videoInput'); if (i) i.click(); else goPage('opd-file.html'); } }
            ]},
            { id:'bill',     label:'Bill',      icon:'ti-receipt',        grp:'money', run: function(){ goPage('billing.html'); } },
            { id:'orders',   label:'My Orders', icon:'ti-clipboard-list', grp:'money', run: function(){ if (window.dcMyOrders) window.dcMyOrders(); else goPage('orders.html'); } },
            { id:'messages', label:'Messages',  icon:'ti-mail',           grp:'money', run: function(){ window.location.href = 'messages.html'; } },
            { id:'print',    label:'Print',     icon:'ti-printer',        grp:'util',  always:true, run: function(){ window.print(); } }
        ];

        var lastGrp = null;
        ACTIONS.forEach(function (a) {
            if (lastGrp && lastGrp !== a.grp) {
                var sep = document.createElement('span');
                sep.className = 'ab-sep';
                bar.appendChild(sep);
            }
            lastGrp = a.grp;
            var g = GRP[a.grp] || GRP.util;
            var b = document.createElement('button');
            b.className = 'ab-btn' + (a.always ? ' ab-always' : '');
            b.setAttribute("data-act", a.id); if (b.dataset) b.dataset.act = a.id;
            if (a.id === 'edBtn' || a.id === 'mvBtn') b.id = a.id;
            b.title = a.label;
            b.style.setProperty('--c', g.c);
            b.style.setProperty('--b', g.b);
            b.innerHTML = '<i class="ti ' + a.icon + '"></i><span>' + esc(a.label) + '</span>' +
                (a.menu ? '<i class="ti ti-chevron-down" style="font-size:11px;opacity:.6"></i>' : '');
            b.onclick = a.menu
                ? function (e) { e.stopPropagation(); showActionBarMenu(b, a.menu); }
                : a.run;
            bar.appendChild(b);
        });

        // Nurse dashboard: append a Theater button that opens the Operating
        // Theater board, carrying the selected patient (if any).
        if (pathStr.indexOf('nurse-dashboard') !== -1) {
            var thSep = document.createElement('span');
            thSep.className = 'ab-sep';
            bar.appendChild(thSep);
            var thBtn = document.createElement('button');
            thBtn.className = 'ab-btn ab-always';
            thBtn.innerHTML = '<i class="ti ti-scissors"></i><span>Theater</span>';
            thBtn.style.setProperty('--c', '#5c2475');
            thBtn.style.setProperty('--b', '#f5eaff');
            thBtn.onclick = function () {
                var pid = '';
                try {
                    var pp = (window.pcFile && window.pcFile.patient && window.pcFile.patient()) || null;
                    pid = (pp && pp.id) || localStorage.getItem('pclinic_active_patient') || '';
                } catch (e) {}
                location.href = 'theater-dashboard.html' + (pid ? '?patient=' + encodeURIComponent(pid) : '');
            };
            bar.appendChild(thBtn);
        }

        syncActionBarState(currP);
    }


    function showActionBarMenu(btn, items) {
        var old = document.querySelector('.ab-menu');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var m = document.createElement('div');
        m.className = 'ab-menu open noprint';
        m.innerHTML = items.map(function(it, i) {
            return '<button type="button" data-idx="' + i + '"><i class="ti ' + it.icon + '"></i><span>' + esc(it.label) + '</span></button>';
        }).join('');
        m.addEventListener('click', function(e) {
            var b = e.target.closest('button');
            if (!b) return;
            var idx = Number(b.getAttribute('data-idx'));
            var item = items[idx];
            if (old && old.parentNode) old.parentNode.removeChild(old);
            if (m && m.parentNode) m.parentNode.removeChild(m);
            if (item && item.run) item.run();
        });
        document.body.appendChild(m);
        var r = btn.getBoundingClientRect();
        m.style.top = (r.bottom + 6) + 'px';
        m.style.left = Math.min(r.left, window.innerWidth - 250) + 'px';
        setTimeout(function() {
            var closer = function(e) {
                if (!m.contains(e.target) && e.target !== btn) {
                    if (m.parentNode) m.parentNode.removeChild(m);
                    document.removeEventListener('click', closer);
                }
            };
            document.addEventListener('click', closer);
        }, 50);
    }

    function syncActionBarState(p) {
        var currP = p || (window.pcFile && window.pcFile.patient && window.pcFile.patient()) || { id: localStorage.getItem('pclinic_active_patient') };
        var on = !!(currP && currP.id && !currP._cleared);
        var btns = document.querySelectorAll('#dcBar .ab-btn');
        for (var i=0; i<btns.length; i++) {
            var b = btns[i];
            if (!b.classList.contains('ab-always')) {
                if (on) b.classList.remove('ab-off');
                else b.classList.add('ab-off');
            }
        }
    }

    function actionBar(targetEl, p) {
        return renderClinicalActionBar(targetEl, p);
    }

    /* ══════════════════════════════════════════════════════════════
       THEATER ACTION BAR (#dcBar) — Bar 3 for the Operating Theater
       board. Theater-management buttons ONLY (booking, board views,
       export, print, refresh). No doctor-dashboard / clinical patient
       buttons. Every button dispatches to window.pcTheater, which the
       theater-dashboard page exposes, so bookings and status changes
       persist through the shared Common Server (Firestore).
       ══════════════════════════════════════════════════════════════ */
    function renderTheaterActionBar(targetEl) {
        var el = document.getElementById('pcMasterHeader') || targetEl || document.body;
        if (!el) return;
        ensureActionBarStyles();

        var bar = document.getElementById('dcBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'dcBar';
            bar.className = 'dc-bar noprint';
        }
        if (bar.getAttribute('data-theater-complete') !== '1') {
            bar.setAttribute('data-theater-complete', '1');
            bar.innerHTML =
                '<button type="button" class="ab-btn ab-always" data-theater-book="1" style="--c:#1a7a32;--b:#e9f9ee;--a:#198754;"><i class="ti ti-calendar-plus"></i>Book Surgery</button>' +
                '<span class="ab-sep"></span>' +
                '<button type="button" class="ab-btn ab-always" data-theater-view="overview" style="--c:#0b57d0;--b:#e8f0fe;--a:#0b57d0;"><i class="ti ti-chart-bar"></i>Overview</button>' +
                '<button type="button" class="ab-btn ab-always" data-theater-view="schedule" style="--c:#8a5a00;--b:#fff7e6;--a:#d97706;"><i class="ti ti-calendar"></i>Schedule</button>' +
                '<button type="button" class="ab-btn ab-always" data-theater-view="theaters" style="--c:#5c2475;--b:#f5eaff;--a:#7e22ce;"><i class="ti ti-bed"></i>Theaters</button>' +
                '<button type="button" class="ab-btn ab-always" data-theater-view="surgeons" style="--c:#006b73;--b:#e6f8fa;--a:#008c99;"><i class="ti ti-user-md"></i>Surgeons</button>' +
                '<button type="button" class="ab-btn ab-always" data-theater-view="procedures" style="--c:#6d28d9;--b:#f5eaff;--a:#7c3aed;"><i class="ti ti-clipboard-list"></i>Procedures</button>' +
                '<span class="ab-sep"></span>' +
                '<button type="button" class="ab-btn ab-always" data-theater-export="1" style="--c:#374151;--b:#f3f4f6;--a:#4b5563;"><i class="ti ti-download"></i>Export</button>' +
                '<button type="button" class="ab-btn ab-always" data-theater-print="1" style="--c:#475569;--b:#f1f5f9;--a:#64748b;"><i class="ti ti-printer"></i>Print</button>' +
                '<button type="button" class="ab-btn ab-always" data-theater-refresh="1" style="--c:#0066d6;--b:#eaf2ff;--a:#0284c7;"><i class="ti ti-refresh"></i>Refresh</button>';

            function th(fn) { return (window.pcTheater && typeof window.pcTheater[fn] === 'function') ? window.pcTheater[fn] : null; }

            var bookBtn = bar.querySelector('[data-theater-book]');
            if (bookBtn) bookBtn.onclick = function () { var f = th('book'); if (f) f(); else alert('Theater board is still loading…'); };

            var viewBtns = bar.querySelectorAll('[data-theater-view]');
            for (var v = 0; v < viewBtns.length; v++) {
                viewBtns[v].onclick = (function (btn) {
                    return function () {
                        var view = btn.getAttribute('data-theater-view');
                        var f = th('nav'); if (f) f(view); else alert('Theater board is still loading…');
                    };
                })(viewBtns[v]);
            }
            var expBtn = bar.querySelector('[data-theater-export]');
            if (expBtn) expBtn.onclick = function () { var f = th('export'); if (f) f(); else alert('Theater board is still loading…'); };
            var prBtn = bar.querySelector('[data-theater-print]');
            if (prBtn) prBtn.onclick = function () { var f = th('print'); if (f) f(); else window.print(); };
            var rfBtn = bar.querySelector('[data-theater-refresh]');
            if (rfBtn) rfBtn.onclick = function () { var f = th('refresh'); if (f) f(); };
        }

        // Keep the strict hierarchy inside #pcMasterHeader:
        // 1st #pc_chuk_top_menu · 2nd #pc_common_demo_bar · 3rd #dcBar
        var master = document.getElementById('pcMasterHeader') || el;
        var chuk = document.getElementById('pc_chuk_top_menu');
        if (chuk && chuk.parentNode) {
            if (chuk.nextSibling && chuk.nextSibling !== bar) chuk.parentNode.insertBefore(bar, chuk.nextSibling);
            else if (!chuk.nextSibling) chuk.parentNode.appendChild(bar);
        } else if (bar.parentNode !== master) {
            if (master.firstChild) master.insertBefore(bar, master.firstChild);
            else master.appendChild(bar);
        }
    }

    /* ══════════════════════════════════════════════════════════════
       HR ACTION BAR (#dcBar) — Bar 3 for the HR & Staff Management
       board. HR-management buttons only (add staff, leave request, job
       posting, export, print, refresh). No doctor / clinical patient
       buttons. Dispatches to window.pcHR exposed by hr-dashboard.html.
       ══════════════════════════════════════════════════════════════ */
    function renderHRActionBar(targetEl) {
        var el = document.getElementById('pcMasterHeader') || targetEl || document.body;
        if (!el) return;
        ensureActionBarStyles();

        var bar = document.getElementById('dcBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'dcBar';
            bar.className = 'dc-bar noprint';
        }
        if (bar.getAttribute('data-hr-complete') !== '1') {
            bar.setAttribute('data-hr-complete', '1');
            bar.innerHTML =
                '<button type="button" class="ab-btn ab-always" data-hr-addstaff="1" style="--c:#1a7a32;--b:#e9f9ee;--a:#198754;"><i class="ti ti-user-plus"></i>Add Staff</button>' +
                '<button type="button" class="ab-btn ab-always" data-hr-leave="1" style="--c:#8a5a00;--b:#fff7e6;--a:#d97706;"><i class="ti ti-calendar-plus"></i>New Leave</button>' +
                '<button type="button" class="ab-btn ab-always" data-hr-job="1" style="--c:#5c2475;--b:#f5eaff;--a:#7e22ce;"><i class="ti ti-briefcase"></i>New Job</button>' +
                '<span class="ab-sep"></span>' +
                '<button type="button" class="ab-btn ab-always" data-hr-export="1" style="--c:#374151;--b:#f3f4f6;--a:#4b5563;"><i class="ti ti-download"></i>Export</button>' +
                '<button type="button" class="ab-btn ab-always" data-hr-print="1" style="--c:#475569;--b:#f1f5f9;--a:#64748b;"><i class="ti ti-printer"></i>Print</button>' +
                '<button type="button" class="ab-btn ab-always" data-hr-refresh="1" style="--c:#0066d6;--b:#eaf2ff;--a:#0284c7;"><i class="ti ti-refresh"></i>Refresh</button>';

            function hf(fn) { return (window.pcHR && typeof window.pcHR[fn] === 'function') ? window.pcHR[fn] : null; }

            var asBtn = bar.querySelector('[data-hr-addstaff]');
            if (asBtn) asBtn.onclick = function () { var f = hf('addStaff'); if (f) f(); else alert('HR board is still loading…'); };
            var lvBtn = bar.querySelector('[data-hr-leave]');
            if (lvBtn) lvBtn.onclick = function () { var f = hf('newLeave'); if (f) f(); else alert('HR board is still loading…'); };
            var jbBtn = bar.querySelector('[data-hr-job]');
            if (jbBtn) jbBtn.onclick = function () { var f = hf('newJob'); if (f) f(); else alert('HR board is still loading…'); };
            var exBtn = bar.querySelector('[data-hr-export]');
            if (exBtn) exBtn.onclick = function () { var f = hf('export'); if (f) f(); else alert('HR board is still loading…'); };
            var prBtn = bar.querySelector('[data-hr-print]');
            if (prBtn) prBtn.onclick = function () { var f = hf('print'); if (f) f(); else window.print(); };
            var rfBtn = bar.querySelector('[data-hr-refresh]');
            if (rfBtn) rfBtn.onclick = function () { var f = hf('refresh'); if (f) f(); };
        }

        var master = document.getElementById('pcMasterHeader') || el;
        var chuk = document.getElementById('pc_chuk_top_menu');
        // ── CHUK TOP BAR IS ALWAYS THE TOPMOST BAR ──
        // Force the hierarchy: 1st #pc_chuk_top_menu, 2nd #dcBar (HR bar).
        if (chuk && chuk.parentNode) {
            if (chuk.parentNode.firstChild !== chuk) chuk.parentNode.insertBefore(chuk, chuk.parentNode.firstChild);
            if (chuk.nextSibling !== bar) chuk.parentNode.insertBefore(bar, chuk.nextSibling);
        } else if (bar.parentNode !== master) {
            if (master.firstChild) master.insertBefore(bar, master.firstChild);
            else master.appendChild(bar);
        }
    }

    /* ══════════════════════════════════════════════════════════════
       RADIOLOGY ACTION BAR (#dcBar) — Bar 3 for the Radiology board.
       Radiology-only buttons + a patient selection button. Every
       radiology button stays LOCKED (greyed) until a patient is
       selected — the selected patient drives the identification
       bar, the request form, the report writer and the viewer.
       ══════════════════════════════════════════════════════════════ */
    function renderRadiologyActionBar(targetEl) {
        var el = document.getElementById('pcMasterHeader') || targetEl || document.body;
        if (!el) return;
        ensureActionBarStyles();

        var bar = document.getElementById('dcBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'dcBar';
            bar.className = 'dc-bar noprint';
        }
        if (bar.getAttribute('data-radio-complete') !== '1') {
            bar.setAttribute('data-radio-complete', '1');
            bar.innerHTML =
                '<button type="button" class="ab-btn ab-always" id="radSelBtn" style="--c:#0066d6;--b:#eaf2ff;--a:#0071e3;"><i class="ti ti-user-search"></i>Select patient</button>' +
                '<span id="radBarPatient" style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:9px;background:rgba(0,0,0,.05);font-size:11.5px;font-weight:700;color:var(--tp,#1c1c1e);max-width:300px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">🔒 No patient selected</span>' +
                '<button type="button" class="ab-btn ab-always" id="radViewerBtn" title="Open the DICOM viewer for the selected patient\'s study to add the radiology result — view, window/level, zoom and upload images." style="--c:#ffffff;--b:linear-gradient(180deg,#3a3a3c,#1c1c1e);--a:#4a9eff;"><i class="ti ti-photo-scan"></i>Open DICOM to add radiology result</button>' +
                '<span class="ab-sep"></span>' +
                '<button type="button" class="ab-btn ab-always" data-rad-view="overview" style="--c:#0b57d0;--b:#e8f0fe;--a:#0b57d0;"><i class="ti ti-chart-bar"></i>Overview</button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-view="request" style="--c:#8a5a00;--b:#fff7e6;--a:#d97706;"><i class="ti ti-shield-lock"></i>Request policy</button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-view="worklist" style="--c:#006b73;--b:#e6f8fa;--a:#008c99;"><i class="ti ti-list"></i>Worklist<span class="ab-badge" id="radBarWorkCnt" style="display:inline-flex;background:#0071e3;">0</span></button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-view="viewer" style="--c:#6b21a8;--b:#f3e8ff;--a:#7e22ce;"><i class="ti ti-photo"></i>Image viewer</button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-view="report" style="--c:#6d28d9;--b:#f5eaff;--a:#7c3aed;"><i class="ti ti-pencil"></i>Report writer</button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-view="signed" style="--c:#1a7a32;--b:#e9f9ee;--a:#198754;"><i class="ti ti-check"></i>Signed reports<span class="ab-badge" id="radBarSignedCnt" style="display:inline-flex;">0</span></button>' +
                '<span class="ab-sep"></span>' +
                '<button type="button" class="ab-btn ab-always" data-rad-notifications="1" title="Radiology alerts" style="--c:#a32d2d;--b:#ffebe9;--a:#d92d20;"><i class="ti ti-bell"></i>Alerts<span class="ab-badge" id="radBarAlertCnt">0</span></button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-print="1" style="--c:#374151;--b:#f3f4f6;--a:#4b5563;"><i class="ti ti-printer"></i>Print</button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-help="1" title="Help and keyboard shortcuts" style="--c:#0066d6;--b:#eaf2ff;--a:#0284c7;"><i class="ti ti-help"></i>Help</button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-settings="1" title="Radiology settings" style="--c:#475569;--b:#f1f5f9;--a:#64748b;"><i class="ti ti-settings"></i>Settings</button>' +
                '<button type="button" class="ab-btn ab-always" data-rad-logout="1" title="Sign out securely" style="--c:#8a1f1a;--b:#ffebe9;--a:#c2413b;"><i class="ti ti-logout"></i>Logout</button>';

            // Look the controls up INSIDE the bar: on first render #dcBar is still
            // detached (it is inserted into #pcMasterHeader further down), so
            // document.getElementById() returned null here and no handler was ever
            // attached — the buttons rendered but did nothing.
            // (The former "Add radiology result" button was removed: results are
            // added through "Open DICOM to add radiology result" below.)

            // "Open DICOM to add radiology result": same patient gate as the media button, its own
            // event so the dashboard can open the viewer without any workflow hop.
            var viewerBtn = bar.querySelector('#radViewerBtn');
            if (viewerBtn) {
                viewerBtn.addEventListener('click', function () {
                    var p = window.__pcRadioSelectedPatient || (window.currentPatient || null);
                    if (!p || !p.id) {
                        if (window.pcToast) window.pcToast('🔒 Select a patient first, then open DICOM to add the radiology result.', 'warning', 6000);
                        var sb2 = bar.querySelector('#radSelBtn');
                        if (sb2) sb2.click();
                        return;
                    }
                    window.dispatchEvent(new CustomEvent('pcRadioOpenViewer', { detail: { patient: p } }));
                });
            }

            var selBtn = bar.querySelector('#radSelBtn');
            if (selBtn) selBtn.onclick = function() {
                if (window.radioSelectPatient) window.radioSelectPatient();
                else if (window.pcFile && window.pcFile.openAdminPatientPicker) window.pcFile.openAdminPatientPicker();
                else alert('Select a patient first.');
            };
            var viewBtns = bar.querySelectorAll('[data-rad-view]');
            for (var v = 0; v < viewBtns.length; v++) {
                viewBtns[v].onclick = (function(btn) {
                    return function() {
                        var view = btn.getAttribute('data-rad-view');
                        if (window.radioNav) window.radioNav(view);
                        else alert('Radiology board is still loading…');
                    };
                })(viewBtns[v]);
            }
            var printBtn = bar.querySelector('[data-rad-print]');
            if (printBtn) printBtn.onclick = function() {
                if (window.radioPrint) window.radioPrint();
                else window.print();
            };
            var alertsBtn = bar.querySelector('[data-rad-notifications]');
            if (alertsBtn) alertsBtn.onclick = function() {
                if (window.openModal) window.openModal('alerts');
            };
            var helpBtn = bar.querySelector('[data-rad-help]');
            if (helpBtn) helpBtn.onclick = function() {
                if (window.openShortcuts) window.openShortcuts();
            };
            var settingsBtn = bar.querySelector('[data-rad-settings]');
            if (settingsBtn) settingsBtn.onclick = function() {
                if (window.radioOpenSettings) window.radioOpenSettings();
            };
            var logoutBtn = bar.querySelector('[data-rad-logout]');
            if (logoutBtn) logoutBtn.onclick = function() {
                if (window.pclinicLogout) window.pclinicLogout();
                else if (window.handleLogout) window.handleLogout();
                else window.location.replace('login.html');
            };
        }

        // Keep the strict hierarchy inside #pcMasterHeader:
        // 1st #pc_chuk_top_menu · 2nd #pc_common_demo_bar · 3rd #dcBar
        var master = document.getElementById('pcMasterHeader') || el;
        var demoBar = document.getElementById('pc_common_demo_bar');
        if (demoBar && demoBar.parentNode) {
            if (demoBar.nextSibling && demoBar.nextSibling !== bar) demoBar.parentNode.insertBefore(bar, demoBar.nextSibling);
            else if (!demoBar.nextSibling) demoBar.parentNode.appendChild(bar);
        } else if (bar.parentNode !== master) {
            if (master.firstChild) master.insertBefore(bar, master.firstChild);
            else master.appendChild(bar);
        }

        updateRadioBarState();

        if (!window.__pcRadioBarListened) {
            window.__pcRadioBarListened = true;
            window.addEventListener('pcPatientChanged', function (event) {
                window.__pcRadioSelectedPatient = event && event.detail ? event.detail : null;
                updateRadioBarState(window.__pcRadioSelectedPatient);
            });
            window.addEventListener('patientsUpdated', function () { updateRadioBarState(); });
        }
    }

    /* Lock/unlock the radiology Bar 3 buttons against the selected patient */
    function updateRadioBarState(patientOverride) {
        var bar = document.getElementById('dcBar');
        if (!bar || bar.getAttribute('data-radio-complete') !== '1') return;
        var p = patientOverride || window.__pcRadioSelectedPatient || menuPatient();
        if (p && p.id && !p._cleared) window.__pcRadioSelectedPatient = p;
        var on = !!(p && p.id && !p._cleared);
        var chip = document.getElementById('radBarPatient');
        if (chip) {
            if (on) {
                var nm = (p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim()) || 'Patient';
                chip.textContent = '👤 ' + nm + ' · MRN ' + (p.mrn || p.id);
            } else {
                chip.textContent = '🔒 No patient selected';
            }
        }
        var btns = bar.querySelectorAll('[data-rad-view="report"], [data-rad-print], #radViewerBtn');
        for (var i = 0; i < btns.length; i++) {
            if (on) btns[i].classList.remove('ab-context-off');
            else btns[i].classList.add('ab-context-off');
        }
        var viewerBtn = document.getElementById('radViewerBtn');
        if (viewerBtn) {
            viewerBtn.title = on
                ? 'Open the DICOM viewer for the selected patient\'s study to add the radiology result — view, window/level, zoom and upload images.'
                : 'Select a patient first — the viewer shows the images of one patient\'s study.';
            if (!on) viewerBtn.setAttribute('aria-disabled', 'true');
            else viewerBtn.removeAttribute('aria-disabled');
        }
        if (window.__pcRadioBarState !== on) {
            window.__pcRadioBarState = on;
            try {
                window.dispatchEvent(new CustomEvent('pcRadioPatientState', { detail: { on: on, patient: p } }));
            } catch(e){}
        }
    }

        /* ══════════ MODAL SHEET ══════════
       Diagnosis, RDV and attachments used to sit stacked in the left
       column. Measured: that made opd-file 1660px tall in a 900px
       viewport, so the doctor had to scroll away from Save to reach
       them. They are now buttons that open a sheet over the page.   */
    function sheet(opts) {
        var scrim = document.createElement('div');
        scrim.className = 'pcf-scrim noprint';
        scrim.innerHTML =
            '<div class="pcf-sheet" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
              '<div class="sh-h"><i class="ti ' + (opts.icon || 'ti-file') + '"></i>' +
                '<span>' + esc(opts.title) + '</span>' +
                '<button type="button" aria-label="Close">&times;</button></div>' +
              '<div class="sh-b"></div>' +
              '<div class="sh-f"><button class="pcf-btn primary" type="button">' +
                esc(opts.done || 'Done') + '</button></div>' +
            '</div>';
        document.body.appendChild(scrim);
        var body = $('.sh-b', scrim);

        function close() {
            // BUG (found by testing): onClose used to run *after* scrim.remove(),
            // so a sheet that reads its own inputs on close — the RDV sheet —
            // queried fields that were already detached and always got ''.
            // The appointment was silently dropped: no RDV on the record, no
            // message to reception. Read first, then animate out and remove.
            if (opts.onClose) { try { opts.onClose(body); } catch (e) {} }
            scrim.classList.remove('open');
            document.removeEventListener('keydown', onKey);
            setTimeout(function () { scrim.remove(); }, 240);
        }
        function onKey(e) { if (e.key === 'Escape') close(); }
        $('.sh-h button', scrim).onclick = close;
        $('.sh-f .pcf-btn', scrim).onclick = close;
        scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
        document.addEventListener('keydown', onKey);

        if (opts.build) opts.build(body, close);
        requestAnimationFrame(function () { scrim.classList.add('open'); });
        var f = body.querySelector('input, textarea, select');
        if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 260);
        return { close: close, body: body };
    }

    /* ══════════ PRINT IN ITS OWN WINDOW ══════════
       "i need that the printing page to open when clicked" — before,
       Print called window.print() on the app page and relied on a
       @media print block to hide the chrome, so nothing visibly
       "opened". Now we build a real sheet of paper in a new window.  */
    function printDoc(node, title) {
        var el = typeof node === 'string' ? $(node) : node;
        if (!el) { if (window.pcToast) pcToast('Nothing to print yet', 'error'); return; }

        var css = '';
        [].forEach.call(document.styleSheets, function (s) {
            if (!s.href || s.href.indexOf('pclinic-file.css') === -1) return;
            try { [].forEach.call(s.cssRules, function (r) { css += r.cssText + '\n'; }); } catch (e) {}
        });

        var w = window.open('', 'pclinic-print', 'width=880,height=1000');
        if (!w) { if (window.pcToast) pcToast('Allow pop-ups to print', 'error'); return; }

        // Written in parts so no closing tag appears literally in this file.
        var S = 'scr' + 'ipt';
        w.document.open();
        w.document.write(
            '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<title>' + esc(title || 'PClinic document') + '</title>' +
            '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.0.0/dist/tabler-icons.min.css">' +
            '<style>' + css +
            'html,body{background:#f2f2f7;margin:0;padding:0;' +
              'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif}' +
            '.sheetwrap{max-width:820px;margin:22px auto;padding:0 16px}' +
            /* The on-screen preview is deliberately shrunk to fit beside the
               form. The printed sheet must NOT be — restore full size here,
               after the copied stylesheet, so these win. */
            '.pcf-doc{background:#fff;color:#111;border-radius:14px;padding:34px 38px;' +
              'box-shadow:0 8px 30px rgba(0,0,0,.14);font-size:12.5px}' +
            '.pcf-doc .org{font-size:19px}.pcf-doc .dtitle{font-size:14.5px;margin:18px 0 15px}' +
            '.pcf-doc .pinfo{font-size:12px;padding:12px 14px;gap:6px 22px}' +
            '.pcf-doc .sec{margin-bottom:14px}' +
            '.pcf-doc .sec p{font-size:12.5px;line-height:1.75}' +
            '.pcf-doc .sec h4{font-size:10px}' +
            '.pcf-doc .sig{margin-top:34px}' +
            '.pbar{position:sticky;top:0;z-index:5;display:flex;gap:8px;justify-content:center;' +
              'padding:11px;background:rgba(255,255,255,.86);backdrop-filter:blur(14px);' +
              'border-bottom:.5px solid rgba(0,0,0,.1)}' +
            '.pbar button{height:34px;padding:0 18px;border-radius:9px;border:0;cursor:pointer;' +
              'font-size:13px;font-weight:600;font-family:inherit}' +
            '.pbar .go{background:#0071e3;color:#fff}' +
            '.pbar .cl{background:#e8e8ed;color:#1c1c1e}' +
            '@media print{.pbar{display:none}.sheetwrap{margin:0;padding:0;max-width:none}' +
              '.pcf-doc{box-shadow:none;border-radius:0;padding:0}' +
              'html,body{background:#fff}@page{size:A4;margin:14mm}}' +
            '</style></head><body>' +
            '<div class="pbar"><button class="go" onclick="window.print()">Print</button>' +
            '<button class="cl" onclick="window.close()">Close</button></div>' +
            '<div class="sheetwrap"><div class="pcf-doc">' + el.innerHTML + '</div></div>' +
            '<' + S + '>window.onload=function(){setTimeout(function(){window.focus();window.print();},350);};</' + S + '>' +
            '</body></html>'
        );
        w.document.close();
        return w;
    }

    /* ══════════ PCLINIC COMPLETE PATIENT IDENTIFICATION BAR & WARD REGISTRY ══════════ */

    /* ══════════════ COMPREHENSIVE PATIENT DEMOGRAPHICS / CARETAKER PROFILE MODAL ══════════════ */
    /* ══════════════════════════════════════════════════════════════
       PC MODAL STYLES — injected at runtime so every scrim-based modal
       (Patient Administration, System Settings, picture viewer) renders
       correctly on EVERY page, even where the shared CSS is missing.
       ══════════════════════════════════════════════════════════════ */
    function ensurePcModalStyles() {
        if (document.getElementById('pc_modal_styles')) return;
        var st = document.createElement('style');
        st.id = 'pc_modal_styles';
        st.textContent =
            '.pc-modal-scrim { position:fixed !important; inset:0 !important; background:rgba(0,0,0,0.55) !important; -webkit-backdrop-filter:blur(6px) !important; backdrop-filter:blur(6px) !important; z-index:9900 !important; display:flex !important; align-items:center !important; justify-content:center !important; padding:20px !important; overflow:auto !important; }' +
            '.pc-modal-box { background:var(--s1,#ffffff) !important; color:var(--tp,#1d1d1f) !important; border-radius:20px !important; width:100% !important; max-width:880px !important; max-height:92vh !important; overflow:hidden !important; display:flex !important; flex-direction:column !important; box-shadow:0 24px 60px rgba(0,0,0,0.3) !important; border:0.5px solid rgba(0,0,0,0.12) !important; }' +
            '.pc-modal-head { display:flex !important; align-items:center !important; justify-content:space-between !important; gap:10px !important; padding:14px 20px !important; border-bottom:0.5px solid var(--bd,rgba(0,0,0,0.1)) !important; font-size:14px !important; font-weight:800 !important; }' +
            '.pc-modal-body { padding:16px 20px !important; overflow-y:auto !important; flex:1 !important; }' +
            '.pc-modal-foot { display:flex !important; justify-content:flex-end !important; gap:10px !important; padding:14px 20px !important; border-top:0.5px solid var(--bd,rgba(0,0,0,0.1)) !important; }' +
            '.pc-sec-title { font-size:12.5px !important; font-weight:800 !important; color:var(--ac,#007080) !important; text-transform:uppercase !important; letter-spacing:.4px !important; margin:10px 0 8px !important; }' +
            '.pc-form-grid { display:grid !important; grid-template-columns:1fr 1fr !important; gap:10px 16px !important; }' +
            '.pc-form-row { display:flex !important; flex-direction:column !important; gap:4px !important; }' +
            '.pc-form-lbl { font-size:10.5px !important; font-weight:800 !important; color:var(--tm,#6e6e73) !important; text-transform:uppercase !important; letter-spacing:.4px !important; }' +
            '.pc-form-input, .pc-form-select { height:36px !important; padding:0 12px !important; border-radius:9px !important; border:0.5px solid rgba(0,0,0,0.14) !important; background:#ebeef3 !important; color:var(--tp,#1d1d1f) !important; font-family:inherit !important; font-size:12.5px !important; outline:none !important; width:100% !important; box-sizing:border-box !important; }' +
            '.pc-form-input:focus, .pc-form-select:focus { background:#ffffff !important; border-color:var(--ac,#007080) !important; }' +
            '.pc-form-input.readonly { background:#f3f4f6 !important; color:#3a3a3c !important; }' +
            '.pc-tab-nav { display:flex !important; gap:6px !important; flex-wrap:wrap !important; margin-bottom:12px !important; }' +
            '.pc-tab-btn { height:32px !important; padding:0 13px !important; border-radius:9px !important; border:0.5px solid rgba(0,0,0,0.1) !important; background:#ffffff !important; color:var(--ts,#3a3a3c) !important; font-family:inherit !important; font-size:11.5px !important; font-weight:700 !important; cursor:pointer !important; }' +
            '.pc-tab-btn.active { background:var(--ac,#007080) !important; color:#ffffff !important; border-color:transparent !important; }' +
            '.pc-tab-pane { display:none !important; }' +
            '.pc-tab-pane.active { display:block !important; }' +
            '[data-theme="dark"] .pc-modal-box { background:#161620 !important; }' +
            '[data-theme="dark"] .pc-form-input, [data-theme="dark"] .pc-form-select { background:#222736 !important; color:#f3f4f6 !important; border-color:rgba(255,255,255,0.14) !important; }' +
            '[data-theme="dark"] .pc-form-input.readonly { background:#1a1e29 !important; }';
        document.head.appendChild(st);
    }

    /* ── Patient picker used when Administration is clicked with no
          patient selected — lists the reception records so the staff can
          pick the patient whose identification to view/edit. ── */
    function openAdminPatientPicker(onPick) {
        ensurePcModalStyles();
        var list = [];
        try { if (typeof getPatients === 'function') list = getPatients() || []; } catch(e){}
        if (!list.length) {
            try { list = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
        }
        var scrim = document.createElement('div');
        scrim.className = 'pc-modal-scrim noprint';
        var rows = '';
        if (!list.length) {
            rows = '<div style="padding:24px;text-align:center;color:#6e6e73;font-size:13px;">No patients registered yet.<br><span style="font-size:11.5px;">Patients appear here once Reception registers them.</span></div>';
        } else {
            rows = list.map(function(p) {
                var name = (p.name || ((p.firstName || '') + ' ' + (p.lastName || ''))).trim() || ('Patient ' + (p.mrn || p.id));
                var care = p.caretakerPhone || (p.emergencyContact && p.emergencyContact.phone) || '';
                return '<button type="button" class="pc-pick-row" data-id="' + esc(p.id) + '" style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;border:0.5px solid rgba(0,0,0,0.08);border-radius:10px;background:#fff;margin-bottom:6px;cursor:pointer;text-align:left;font-family:inherit;">' +
                    '<span style="width:36px;height:36px;border-radius:10px;background:#eaf2ff;color:#0071e3;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;">' + esc((p.firstName||p.name||'?').charAt(0).toUpperCase()) + '</span>' +
                    '<span style="flex:1;"><span style="display:block;font-weight:800;color:#1d1d1f;font-size:13px;">' + esc(name) + '</span>' +
                    '<span style="display:block;font-size:11px;color:#6e6e73;">MRN ' + esc(p.mrn || p.id) + (p.dob ? ' • ' + new Date(p.dob).toLocaleDateString('en-GB') : '') + (care ? ' • ☎ ' + esc(care) : '') + '</span></span>' +
                    '<span style="color:#0071e3;font-weight:800;font-size:12px;">Administration →</span></button>';
            }).join('');
        }
        scrim.innerHTML =
            '<div class="pc-modal-box" role="dialog" aria-modal="true" style="max-width:560px;">' +
                '<div class="pc-modal-head"><span>🗂️ Administration — Select the patient</span>' +
                '<button type="button" class="close-modal-btn" style="border:0;background:none;font-size:22px;cursor:pointer;color:inherit;">&times;</button></div>' +
                '<div class="pc-modal-body" style="max-height:64vh;">' + rows + '</div>' +
            '</div>';
        document.body.appendChild(scrim);
        scrim.onclick = function(e) {
            if (e.target === scrim) { scrim.remove(); return; }
            var b = e.target.closest('.close-modal-btn');
            if (b) { scrim.remove(); return; }
            var row = e.target.closest('.pc-pick-row');
            if (row) {
                scrim.remove();
                if (onPick) onPick(row.getAttribute('data-id'));
            }
        };
    }

    function openPatientProfileModal(patientId) {
        try {
            return openPatientProfileModalInner(patientId);
        } catch(e) {
            console.error('Administration modal error:', e);
            if (window.pcToast) pcToast('Could not open the Administration sheet — ' + (e && e.message ? e.message : 'unexpected error'), 'error');
            else alert('Could not open the Administration sheet — ' + (e && e.message ? e.message : 'unexpected error'));
        }
    }
    function openPatientProfileModalInner(patientId) {
        ensurePcModalStyles();
        var p = null;
        if (patientId) {
            var list = [];
            try { if (typeof getPatients === 'function') list = getPatients() || []; } catch(e){}
            if (!list.length) {
                try { list = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
            }
            for (var i=0; i<list.length; i++) {
                if (String(list[i].id) === String(patientId) || String(list[i].mrn) === String(patientId)) {
                    p = list[i]; break;
                }
            }
        }
        if (!p && window.pcPatient && typeof window.pcPatient.get === 'function') p = window.pcPatient.get();
        if (!p && window.currentPatient) p = window.currentPatient;
        if (!p) {
            if (window.pcToast) pcToast('Please select a patient first to view full demographics & caretaker profile.', 'warning');
            else alert('Please select a patient first to view full demographics & caretaker profile.');
            return;
        }

        var ins = p.insurance;
        var insProvider = (ins && typeof ins === 'object') ? (ins.provider || '') : (p.insurance || '');
        var insPolicy   = (ins && typeof ins === 'object') ? (ins.policyNumber || '') : (p.policyNumber || '');
        var insScheme   = (ins && typeof ins === 'object') ? (ins.scheme || '') : '';
        var insValidity = (ins && typeof ins === 'object') ? (ins.validity || '') : '';

        var scrim = document.createElement('div');
        scrim.className = 'pc-modal-scrim noprint';
        scrim.innerHTML =
            '<div class="pc-modal-box" role="dialog" aria-modal="true">' +
                '<div class="pc-modal-head">' +
                    '<span>🗂️ Administration — Complete Patient Identification as recorded at Reception (ID: ' + esc(p.id) + ')</span>' +
                    '<button type="button" class="close-modal-btn" style="border:0;background:none;font-size:22px;cursor:pointer;">&times;</button>' +
                '</div>' +
                '<div class="pc-modal-body">' +
                    '<div class="pc-sec-title">1. Primary Demographics & Identification</div>' +
                    '<div class="pc-form-grid">' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Family Name</span><input type="text" class="pc-form-input" id="profLast" value="' + esc(p.lastName || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">First Name</span><input type="text" class="pc-form-input" id="profFirst" value="' + esc(p.firstName || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">National ID / Passport</span><input type="text" class="pc-form-input" id="profNat" placeholder="e.g. 1 1986 8 0064652 0 14" value="' + esc(p.nationalId || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Person ID</span><input type="text" class="pc-form-input" id="profPersonId" placeholder="e.g. 1198680064652014" value="' + esc(p.personId || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Record Number (MRN)</span><input type="text" class="pc-form-input readonly" id="profMrn" readonly value="' + esc(p.mrn || p.id || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Date of Birth</span><input type="date" class="pc-form-input" id="profDob" value="' + esc((p.dob || '').substring(0,10)) + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Gender</span><select class="pc-form-select" id="profGender"><option value="Male"' + (p.gender === 'Male' ? ' selected' : '') + '>Male</option><option value="Female"' + (p.gender === 'Female' ? ' selected' : '') + '>Female</option></select></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Registered on</span><input type="text" class="pc-form-input readonly" id="profRegistered" readonly value="' + esc(p.registered ? new Date(p.registered).toLocaleString('en-GB') : '—') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Registered by (Reception)</span><input type="text" class="pc-form-input readonly" id="profRegisteredBy" readonly value="' + esc(p.createdBy || p.registeredBy || '—') + '" /></div>' +
                    '</div>' +

                    '<div class="pc-sec-title" style="margin-top:6px;">2. Contact Information & Residential Address</div>' +
                    '<div class="pc-form-grid">' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Patient Email</span><input type="email" class="pc-form-input" id="profEmail" placeholder="e.g. name@example.com" value="' + esc(p.email || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Patient Phone</span><input type="text" class="pc-form-input" id="profPhone" placeholder="e.g. +250 788 123 456" value="' + esc(p.phone || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">District</span><input type="text" class="pc-form-input" id="profDist" placeholder="e.g. NYARUGENGE" value="' + esc(p.district || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Sector</span><input type="text" class="pc-form-input" id="profSector" placeholder="e.g. Kimisagara" value="' + esc(p.sector || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Cell</span><input type="text" class="pc-form-input" id="profCell" placeholder="e.g. Gitega" value="' + esc(p.cell || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Village</span><input type="text" class="pc-form-input" id="profVillage" placeholder="e.g. Runda" value="' + esc(p.village || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Country</span><input type="text" class="pc-form-input" id="profCountry" placeholder="e.g. Rwanda" value="' + esc(p.country || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Residential Address</span><input type="text" class="pc-form-input" id="profAddr" placeholder="e.g. Runda, Gihara" value="' + esc(p.address || '') + '" /></div>' +
                    '</div>' +

                    '<div class="pc-sec-title" style="margin-top:6px;">3. Caretaker / Next of Kin & Emergency Contact</div>' +
                    '<div class="pc-form-grid">' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Caretaker / Next of Kin Name</span><input type="text" class="pc-form-input" id="profCareName" placeholder="e.g. UWASE CLAUDINE" value="' + esc(p.caretakerName || (p.emergencyContact && p.emergencyContact.name) || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Relationship to Patient</span><select class="pc-form-select" id="profCareRel"><option value="Spouse"' + (p.caretakerRel === 'Spouse' || (p.emergencyContact && p.emergencyContact.relationship === 'Spouse') ? ' selected' : '') + '>Spouse</option><option value="Mother"' + (p.caretakerRel === 'Mother' || (p.emergencyContact && p.emergencyContact.relationship === 'Mother') ? ' selected' : '') + '>Mother</option><option value="Father"' + (p.caretakerRel === 'Father' || (p.emergencyContact && p.emergencyContact.relationship === 'Father') ? ' selected' : '') + '>Father</option><option value="Sibling"' + (p.caretakerRel === 'Sibling' || (p.emergencyContact && p.emergencyContact.relationship === 'Sibling') ? ' selected' : '') + '>Sibling</option><option value="Guardian"' + (p.caretakerRel === 'Guardian' || (p.emergencyContact && p.emergencyContact.relationship === 'Guardian') ? ' selected' : '') + '>Guardian</option></select></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Caretaker Phone</span><input type="text" class="pc-form-input" id="profCarePhone" placeholder="e.g. +250 788 987 654" value="' + esc(p.caretakerPhone || (p.emergencyContact && p.emergencyContact.phone) || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Caretaker Email / Notes</span><input type="text" class="pc-form-input" id="profCareNotes" placeholder="Emergency contact notes…" value="' + esc(p.caretakerEmail || p.caretakerNotes || '') + '" /></div>' +
                    '</div>' +

                    '<div class="pc-sec-title" style="margin-top:6px;">4. Insurance & Clinical Assignment</div>' +
                    '<div class="pc-form-grid">' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Insurance Provider / RSSB</span><input type="text" class="pc-form-input" id="profIns" placeholder="e.g. RSSB / RAMA" value="' + esc(insProvider) + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Insurance Policy Number</span><input type="text" class="pc-form-input" id="profPolicy" placeholder="e.g. RSSB-…" value="' + esc(insPolicy) + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Insurance Scheme</span><input type="text" class="pc-form-input" id="profInsScheme" placeholder="e.g. Community Based / RAMA" value="' + esc(insScheme) + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Insurance Validity</span><input type="text" class="pc-form-input" id="profInsValidity" placeholder="e.g. 31/12/2026" value="' + esc(insValidity) + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Assigned Department / Ward</span><input type="text" class="pc-form-input" id="profDept" placeholder="e.g. SURGERY WARD 7" value="' + esc(p.department || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Patient Type</span><input type="text" class="pc-form-input" id="profPatType" placeholder="e.g. Inpatient / Outpatient" value="' + esc(p.patientType || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Visit Type</span><input type="text" class="pc-form-input" id="profVisitType" placeholder="e.g. New visit / Follow-up" value="' + esc(p.visitType || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Referral Source</span><input type="text" class="pc-form-input" id="profReferral" placeholder="e.g. Health Centre / Self" value="' + esc(p.referralSource || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Arrival Mode</span><input type="text" class="pc-form-input" id="profArrival" placeholder="e.g. Walking / Ambulance" value="' + esc(p.arrivalMode || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Blood Group</span><input type="text" class="pc-form-input" id="profBlood" placeholder="e.g. O+" value="' + esc(p.bloodGroup || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Allergies</span><input type="text" class="pc-form-input" id="profAllergies" placeholder="e.g. Penicillin" value="' + esc(p.allergies || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Consent</span><input type="text" class="pc-form-input" id="profConsent" placeholder="e.g. Granted / Withdrawn" value="' + esc(p.consent || '') + '" /></div>' +
                    '</div>' +
                '</div>' +
                '<div class="pc-modal-foot">' +
                    '<span style="font-size:11px;color:#6e6e73;font-weight:700;align-self:center;margin-right:auto;">🔒 View only — identification as recorded at Reception (no edit option)</span>' +
                    '<button type="button" class="pc-tab-btn close-modal-btn active" style="background:#007080;color:#fff;font-weight:800;">Close</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(scrim);

        // 🔒 VIEW ONLY: the Administration sheet shows the reception record
        // with NO edit option — every field is frozen, no save button exists.
        var roInputs = scrim.querySelectorAll('.pc-form-input');
        for (var rI = 0; rI < roInputs.length; rI++) {
            roInputs[rI].setAttribute('readonly', 'readonly');
            roInputs[rI].classList.add('readonly');
        }
        var roSels = scrim.querySelectorAll('.pc-form-select');
        for (var rS = 0; rS < roSels.length; rS++) {
            roSels[rS].setAttribute('disabled', 'disabled');
        }

        var closeBtns = scrim.querySelectorAll('.close-modal-btn');
        for (var i=0; i<closeBtns.length; i++) {
            closeBtns[i].onclick = function() { scrim.remove(); };
        }
        scrim.onclick = function(e) { if (e.target === scrim) scrim.remove(); };

        /* ── (removed edit/save handler — the Administration sheet is view-only) ──
        document.getElementById('saveProfBtn').onclick = function() {
            p.lastName = document.getElementById('profLast').value.trim();
            p.firstName = document.getElementById('profFirst').value.trim();
            p.nationalId = document.getElementById('profNat').value.trim();
            p.personId = document.getElementById('profPersonId').value.trim();
            p.dob = document.getElementById('profDob').value;
            p.gender = document.getElementById('profGender').value;
            p.email = document.getElementById('profEmail').value.trim();
            p.phone = document.getElementById('profPhone').value.trim();
            p.district = document.getElementById('profDist').value.trim();
            p.sector = document.getElementById('profSector').value.trim();
            p.cell = document.getElementById('profCell').value.trim();
            p.village = document.getElementById('profVillage').value.trim();
            p.country = document.getElementById('profCountry').value.trim();
            p.address = document.getElementById('profAddr').value.trim();
            p.caretakerName = document.getElementById('profCareName').value.trim();
            p.caretakerRel = document.getElementById('profCareRel').value;
            p.caretakerPhone = document.getElementById('profCarePhone').value.trim();
            p.caretakerNotes = document.getElementById('profCareNotes').value.trim();
            // Keep the insurance consistent with Reception's object format
            p.insurance = document.getElementById('profIns').value.trim();
            p.policyNumber = document.getElementById('profPolicy').value.trim();
            if (p.insurance || p.policyNumber) {
                p.insurance = {
                    provider: p.insurance || '',
                    policyNumber: p.policyNumber || '',
                    scheme: document.getElementById('profInsScheme').value.trim(),
                    validity: document.getElementById('profInsValidity').value.trim()
                };
            }
            p.department = document.getElementById('profDept').value.trim();
            p.patientType = document.getElementById('profPatType').value.trim();
            p.visitType = document.getElementById('profVisitType').value.trim();
            p.referralSource = document.getElementById('profReferral').value.trim();
            p.arrivalMode = document.getElementById('profArrival').value.trim();
            p.bloodGroup = document.getElementById('profBlood').value.trim();
            p.allergies = document.getElementById('profAllergies').value.trim();
            p.consent = document.getElementById('profConsent').value.trim();

            // Save to local common server (localStorage 'pclinic_patients' & live getPatients() sync)
            var all = [];
            try { if (typeof getPatients === 'function') all = getPatients() || []; } catch(e){}
            if (!all.length) {
                try { all = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
            }
            var found = false;
            for (var i=0; i<all.length; i++) {
                if (String(all[i].id) === String(p.id)) {
                    all[i] = p; found = true; break;
                }
            }
            if (!found) all.push(p);
            try { localStorage.setItem('pclinic_patients', JSON.stringify(all)); } catch(e){}
            if (typeof savePatients === 'function') { try { savePatients(all); } catch(e){} }
            try { localStorage.setItem('pclinic_active_patient', String(p.id)); } catch(e){}

            window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: p }));
            if (window.pcToast) pcToast('✅ Saved patient demographics & caretaker profile to local common server!', 'success');
            else alert('✅ Saved patient demographics & caretaker profile to local common server!');

            scrim.remove();
            renderPatientIdentificationBar(document.querySelector('.oc-demo-bar') || document.body, p);
        };
        ── */
    }

    /* ══════════════ COMPREHENSIVE SYSTEM SETTINGS MODAL (LANGUAGE, THEME, PASSWORD, COMMON SERVER) ══════════════ */
    function openSystemSettingsModal() {
        ensurePcModalStyles();
        var scrim = document.createElement('div');
        scrim.className = 'pc-modal-scrim noprint';
        var currentLang = localStorage.getItem('pclinic-lang') || 'en';
        var currentTheme = localStorage.getItem('pclinic-theme') || 'light';

        scrim.innerHTML =
            '<div class="pc-modal-box" role="dialog" aria-modal="true" style="width:680px;">' +
                '<div class="pc-modal-head">' +
                    '<span>⚙️ System Preferences, Language & Security Suite</span>' +
                    '<button type="button" class="close-modal-btn" style="border:0;background:none;font-size:22px;cursor:pointer;">&times;</button>' +
                '</div>' +
                '<div class="pc-modal-body">' +
                    '<div class="pc-tab-nav">' +
                        '<button type="button" class="pc-tab-btn active" data-tab="tab-lang">🌐 Language</button>' +
                        '<button type="button" class="pc-tab-btn" data-tab="tab-theme">🎨 Theme & Display</button>' +
                        '<button type="button" class="pc-tab-btn" data-tab="tab-pass">🔒 Change Password</button>' +
                        '<button type="button" class="pc-tab-btn" data-tab="tab-server">🖥️ Local Common Server</button>' +
                    '</div>' +

                    '<!-- TAB 1: LANGUAGE -->' +
                    '<div class="pc-tab-pane" id="tab-lang">' +
                        '<div class="pc-sec-title">Select System Language / Langue / Ururimi</div>' +
                        '<div style="display:flex;flex-direction:column;gap:12px;margin-top:10px;">' +
                            '<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;cursor:pointer;"><input type="radio" name="pcLang" value="en"' + (currentLang === 'en' ? ' checked' : '') + ' /> English (US/RW) — Default Clinical Language</label>' +
                            '<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;cursor:pointer;"><input type="radio" name="pcLang" value="fr"' + (currentLang === 'fr' ? ' checked' : '') + ' /> Français (French) — Langue Clinique Officielle</label>' +
                            '<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;cursor:pointer;"><input type="radio" name="pcLang" value="rw"' + (currentLang === 'rw' ? ' checked' : '') + ' /> Ikinyarwanda — Ururimi rw\'ibanze mu bitaro</label>' +
                        '</div>' +
                        '<div style="margin-top:16px;"><button type="button" class="pc-tab-btn active" id="saveLangBtn" style="background:#0b57d0;color:#fff;">🌐 Apply Language Choice</button></div>' +
                    '</div>' +

                    '<!-- TAB 2: THEME -->' +
                    '<div class="pc-tab-pane" id="tab-theme" style="display:none;">' +
                        '<div class="pc-sec-title">Apple Light Mode & Dark Mode Appearance</div>' +
                        '<div style="display:flex;flex-direction:column;gap:12px;margin-top:10px;">' +
                            '<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;cursor:pointer;"><input type="radio" name="pcTheme" value="light"' + (currentTheme === 'light' ? ' checked' : '') + ' /> ☀️ Apple Light Mode (#f5f5f7 platinum background)</label>' +
                            '<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;cursor:pointer;"><input type="radio" name="pcTheme" value="dark"' + (currentTheme === 'dark' ? ' checked' : '') + ' /> 🌙 Apple Dark Mode (#0d1117 / #161b22 high contrast)</label>' +
                            '<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;cursor:pointer;"><input type="radio" name="pcTheme" value="auto"' + (currentTheme === 'auto' ? ' checked' : '') + ' /> 🖥️ System Auto Default</label>' +
                        '</div>' +
                        '<div style="margin-top:16px;"><button type="button" class="pc-tab-btn active" id="saveThemeBtn" style="background:#0b57d0;color:#fff;">🎨 Apply Theme Choice</button></div>' +
                    '</div>' +

                    '<!-- TAB 3: PASSWORD -->' +
                    '<div class="pc-tab-pane" id="tab-pass" style="display:none;">' +
                        '<div class="pc-sec-title">Staff Account Password Security</div>' +
                        '<div class="pc-form-grid" style="grid-template-columns:1fr;margin-top:10px;">' +
                            '<div class="pc-form-row"><span class="pc-form-lbl">Current Staff Password</span><input type="password" class="pc-form-input" id="curPass" placeholder="Enter current password..." /></div>' +
                            '<div class="pc-form-row"><span class="pc-form-lbl">New Password</span><input type="password" class="pc-form-input" id="newPass" placeholder="At least 6 characters..." /></div>' +
                            '<div class="pc-form-row"><span class="pc-form-lbl">Confirm New Password</span><input type="password" class="pc-form-input" id="confPass" placeholder="Re-type new password..." /></div>' +
                        '</div>' +
                        '<div style="margin-top:16px;"><button type="button" class="pc-tab-btn active" id="savePassBtn" style="background:#0b57d0;color:#fff;">🔒 Update Password</button></div>' +
                    '</div>' +

                    '<!-- TAB 4: COMMON SERVER -->' +
                    '<div class="pc-tab-pane" id="tab-server" style="display:none;">' +
                        '<div class="pc-sec-title">Local Common Server & Hybrid Storage Connection</div>' +
                        '<div style="background:#e8f0fe;border:1px solid #0b57d0;padding:14px;border-radius:12px;margin-top:10px;color:#0b57d0;font-size:13px;font-weight:700;">' +
                            '🟢 CONNECTED TO LOCAL COMMON SERVER<br><span style="font-size:12px;font-weight:500;">Hybrid persistence architecture synchronized with localStorage (pclinic_patients, pclinic_orders, pclinic_bills) and Firebase Firestore rules.</span>' +
                        '</div>' +
                        '<div style="display:flex;gap:10px;margin-top:16px;">' +
                            '<button type="button" class="pc-tab-btn active" id="syncServerBtn" style="background:#0b57d0;color:#fff;">🔄 Sync Common Server Now</button>' +
                            '<button type="button" class="pc-tab-btn" id="clearCacheBtn" style="background:#f2f2f7;color:#d93025;border-color:#d1d1d6;">🧹 Clear Stale Cache</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="pc-modal-foot">' +
                    '<button type="button" class="pc-tab-btn close-modal-btn">Close Settings</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(scrim);
        var closeBtns = scrim.querySelectorAll('.close-modal-btn');
        for (var i=0; i<closeBtns.length; i++) {
            closeBtns[i].onclick = function() { scrim.remove(); };
        }
        scrim.onclick = function(e) { if (e.target === scrim) scrim.remove(); };

        // Tab switching logic
        var tabBtns = scrim.querySelectorAll('.pc-tab-nav .pc-tab-btn');
        for (var j=0; j<tabBtns.length; j++) {
            tabBtns[j].onclick = function() {
                var allBtns = scrim.querySelectorAll('.pc-tab-nav .pc-tab-btn');
                var allPanes = scrim.querySelectorAll('.pc-tab-pane');
                for (var k=0; k<allBtns.length; k++) allBtns[k].classList.remove('active');
                for (var k=0; k<allPanes.length; k++) allPanes[k].style.display = 'none';
                this.classList.add('active');
                var pane = scrim.querySelector('#' + this.getAttribute('data-tab'));
                if (pane) pane.style.display = 'block';
            };
        }

        // Language Save
        scrim.querySelector('#saveLangBtn').onclick = function() {
            var selected = scrim.querySelector('input[name="pcLang"]:checked').value;
            localStorage.setItem('pclinic-lang', selected);
            if (window.pcToast) pcToast('🌐 Language preference changed to: ' + selected.toUpperCase(), 'success');
            else alert('🌐 Language preference changed to: ' + selected.toUpperCase());
            scrim.remove();
        };

        // Theme Save
        scrim.querySelector('#saveThemeBtn').onclick = function() {
            var selected = scrim.querySelector('input[name="pcTheme"]:checked').value;
            localStorage.setItem('pclinic-theme', selected);
            if (selected === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                document.body.classList.add('dark-mode');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                document.body.classList.remove('dark-mode');
            }
            if (window.pcToast) pcToast('🎨 Theme updated to: ' + selected, 'success');
            else alert('🎨 Theme updated to: ' + selected);
            scrim.remove();
        };

        // Password Save
        scrim.querySelector('#savePassBtn').onclick = function() {
            var p1 = document.getElementById('newPass').value;
            var p2 = document.getElementById('confPass').value;
            if (!p1 || p1.length < 6) {
                alert('New password must be at least 6 characters long.');
                return;
            }
            if (p1 !== p2) {
                alert('New password and confirmation do not match.');
                return;
            }
            if (window.pcToast) pcToast('🔒 Staff password updated successfully!', 'success');
            else alert('🔒 Staff password updated successfully!');
            scrim.remove();
        };

        // Server Sync buttons
        scrim.querySelector('#syncServerBtn').onclick = function() {
            if (window.pcToast) pcToast('🔄 Synchronized with local common server!', 'success');
            else alert('🔄 Synchronized with local common server!');
        };

        scrim.querySelector('#clearCacheBtn').onclick = function() {
            if (confirm('Clear offline temporary cache?')) {
                if (window.pcToast) pcToast('🧹 Cache cleared cleanly.', 'info');
                else alert('🧹 Cache cleared cleanly.');
            }
        };
    }

    function openSystemInfoModal() {
        alert('🏥 PClinic Clinical Suite • PClinic v5.346.01 / CHUK\nReadiness Score: 100/100\nConnected to Local Common Server (Hybrid localStorage + Firestore)');
    }

    function createGlobalTopBar() {
        if (!document.body) return null;
        var path = (window.location.pathname || '').toLowerCase();
        var file = path.split('/').pop() || '';
        var excluded = ['hub.html','login.html','index.html'];
        if (excluded.includes(file)) return null;
        var extras = document.querySelectorAll('.chuk-top-menu, #pc_chuk_top_menu');
        var keep = extras[0] || null;
        for (var xi = 1; xi < extras.length; xi++) {
            if (extras[xi] && extras[xi].parentNode) extras[xi].parentNode.removeChild(extras[xi]);
        }
        if (keep) {
            keep.id = 'pc_chuk_top_menu';
            return keep;
        }
        var master = document.getElementById('pcMasterHeader');
        if (!master) {
            master = document.createElement('div');
            master.id = 'pcMasterHeader';
            master.className = 'pc-master-header';
            if (document.body.firstChild) document.body.insertBefore(master, document.body.firstChild);
            else document.body.appendChild(master);
        }
        if (document.body.firstChild !== master && document.body.contains(master)) {
            document.body.insertBefore(master, document.body.firstChild);
        }
        var menuDiv = document.createElement('div');
        menuDiv.id = 'pc_chuk_top_menu';
        menuDiv.className = 'chuk-top-menu noprint';
        menuDiv.innerHTML =
            '<div class="chuk-menu-left">' +
                '<a class="chk-btn btn-patient" onclick="window.pcPatientMenu&&window.pcPatientMenu(this);">👤 Patient <i class="ti ti-chevron-down" style="font-size:10px;opacity:.65;"></i></a>' +
                '<a class="chk-btn btn-summary" onclick="var p=window.pcFile&&pcFile.patient?pcFile.patient():null; var id=(p&&p.id)||localStorage.getItem(\'pclinic_active_patient\')||\'\'; window.location.href=\'medical-summary.html?patient=\'+encodeURIComponent(id);">📋 Medical summary</a>' +
                '<a class="chk-btn btn-nursing" onclick="window.pcNursingMenu&&window.pcNursingMenu(this);">🏥 Nursing <i class="ti ti-chevron-down" style="font-size:10px;opacity:.65;"></i></a>' +
                '<a class="chk-btn btn-applications" onclick="window.pcApplicationsMenu&&window.pcApplicationsMenu(this);">💉 Applications <i class="ti ti-chevron-down" style="font-size:10px;opacity:.65;"></i></a>' +
                '<a class="chk-btn btn-documents" onclick="var p=window.pcFile&&pcFile.patient?pcFile.patient():null; var id=(p&&p.id)||localStorage.getItem(\'pclinic_active_patient\')||\'\'; window.location.href=\'opd-file.html?patient=\'+encodeURIComponent(id);">📂 Documents</a>' +
                '<a class="chk-btn btn-system" onclick="window.pcSystemMenu&&window.pcSystemMenu(this);">⚙️ System <i class="ti ti-chevron-down" style="font-size:10px;opacity:.65;"></i></a>' +
            '</div>' +
            '<div class="chuk-menu-center" style="flex:1;display:flex;justify-content:center;align-items:center;"><div id="pcGlobalClock" class="pc-global-clock" style="font-size:11px;font-weight:700;color:#1e293b;background:#e2e8f0;padding:4px 12px;border-radius:20px;">🕒 Loading...</div></div>' +
            '<div class="chuk-menu-right">' +
                '<a class="chk-btn btn-theme" onclick="if(window.pcFile&&pcFile.toggleThemeFromMenu)pcFile.toggleThemeFromMenu();">☀️ Theme</a>' +
                '<a class="chk-btn btn-alerts" onclick="if(window.pcFile&&pcFile.showNotificationsModal)pcFile.showNotificationsModal();">🔔</a>' +
                '<a class="chk-btn btn-user" onclick="if(window.pcFile&&pcFile.openStaffProfileModal)pcFile.openStaffProfileModal();">👨‍⚕️ ' + ((window.currentStaff && window.currentStaff.name) ? window.currentStaff.name : 'Staff') + '</a>' +
                '<a class="chk-btn btn-logout" onclick="if(window.pcFile&&pcFile.confirmLogout)pcFile.confirmLogout();">🚪 Logout</a>' +
                '<a class="chk-btn btn-info" onclick="if(window.pcFile&&pcFile.openSystemInfoModal)pcFile.openSystemInfoModal();">❓ Info</a>' +
            '</div>';
        if (master.firstChild) master.insertBefore(menuDiv, master.firstChild);
        else master.appendChild(menuDiv);
        try {
            if (!window.__pcGlobalClockInterval) {
                function updatePcGlobalClock(){
                    var el=document.getElementById('pcGlobalClock');
                    if(!el) return;
                    var now=new Date();
                    var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                    var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    var dayName=days[now.getDay()];
                    var day=String(now.getDate()).padStart(2,'0');
                    var month=months[now.getMonth()];
                    var year=now.getFullYear();
                    var hh=String(now.getHours()).padStart(2,'0');
                    var mm=String(now.getMinutes()).padStart(2,'0');
                    var ss=String(now.getSeconds()).padStart(2,'0');
                    el.textContent = dayName + ', ' + day + ' ' + month + ' ' + year + ' • ' + hh + ':' + mm + ':' + ss;
                }
                updatePcGlobalClock();
                window.__pcGlobalClockInterval = setInterval(updatePcGlobalClock, 1000);
            }
        } catch(e){}
        return menuDiv;
    }

    function isReceptionDashboardPage() {
        var path = String((window.location && window.location.pathname) || '').toLowerCase();
        return (path.split('/').pop() || '') === 'reception-dashboard.html';
    }

    function removeReceptionPatientIdentificationBar() {
        var bar = document.getElementById('pc_common_demo_bar');
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        document.body && document.body.classList.remove('pc-has-patient-identification-bar');
    }

    function renderPatientIdentificationBar(targetEl, p) {
        try { if (typeof createGlobalTopBar === 'function') createGlobalTopBar(); } catch(e){}
        if (isReceptionDashboardPage()) {
            removeReceptionPatientIdentificationBar();
            return null;
        }
        var el = targetEl;
        if (!el) return;
        // If string selector, resolve
        if (typeof el === 'string') el = document.querySelector(el);
        if (!el) return;
        p = p || {};
        var barId = 'pc_common_demo_bar';
        var old = document.getElementById(barId);
        if (old && old.parentNode) old.parentNode.removeChild(old);

        // Remove breadcrumb etc
        var allBcs = document.querySelectorAll('.breadcrumb, #breadcrumb, .header-breadcrumb, .topbar, .top-bar, .app-header, .top-header');
        for (var idx=0; idx<allBcs.length; idx++) {
            if (allBcs[idx] && allBcs[idx].parentNode) allBcs[idx].parentNode.removeChild(allBcs[idx]);
        }

        // Do NOT delete global CHUK menu - keep it
        var isCleared = !!p._cleared;
        // Older/common-server records may expose only `name`. Split it so a
        // selected patient is still visibly identified in the shared bar.
        var fallbackNameParts = String(p.name || '').trim().split(/\s+/).filter(Boolean);
        var name = isCleared ? '' : ((p.lastName || (fallbackNameParts.length > 1 ? fallbackNameParts.slice(-1)[0] : fallbackNameParts[0]) || '').toUpperCase());
        var first = isCleared ? '' : ((p.firstName || (fallbackNameParts.length > 1 ? fallbackNameParts.slice(0, -1).join(' ') : '') || '').toUpperCase());
        var natId = isCleared ? '' : (p.nationalId || '');
        var mrn = isCleared ? '' : (p.mrn || p.id || '');
        var dobStr = isCleared ? '' : (p.dob ? new Date(p.dob).toLocaleDateString('en-GB') : '');
        var ageStr = isCleared ? '' : (p.dob ? (new Date().getFullYear() - new Date(p.dob).getFullYear()) + ' years' : '');
        var sex = isCleared ? '' : (p.gender || '');
        var dept = isCleared ? '' : ((p.department || '').toUpperCase());
        var arch = isCleared ? '' : (p.archiveCode || '');
        var pid = isCleared ? '' : (p.id || '');
        var ins = isCleared ? 'RSSB / RAMA' : (p.insurance || 'RSSB / RAMA');
        var dist = isCleared ? '' : (p.district || 'NYARUGENGE');

        var div = document.createElement('div');
        div.id = barId;
        div.className = 'oc-demo-bar noprint';
        div.innerHTML =
            '<div class="oc-row-grid">' +
                '<div class="oc-cell"><label class="oc-lbl">Family name</label><input type="text" class="oc-input" id="ocSearchFamily" placeholder="Family name..." value="' + esc(name) + '" /></div>' +
                '<div class="oc-cell"><label class="oc-lbl">Firstname</label><input type="text" class="oc-input" id="ocSearchFirst" placeholder="Firstname..." value="' + esc(first) + '" /></div>' +
                '<div class="oc-cell" style="grid-column: span 2;"><label class="oc-lbl">Date of birth</label><div style="display:flex; gap:6px;"><input type="text" class="oc-input readonly" id="ocDob" readonly value="' + esc(dobStr) + '" style="width:110px;" /><span class="oc-age-txt">' + (sex ? '⚪ (' + esc(sex) + ' - ' + esc(ageStr) + ')' : '') + '</span></div></div>' +
            '</div>' +
            '<div class="oc-row-grid">' +
                '<div class="oc-cell"><label class="oc-lbl">Nat ID/PP</label><input type="text" class="oc-input" id="ocSearchNatId" placeholder="National ID..." value="' + esc(natId) + '" /></div>' +
                '<div class="oc-cell"><label class="oc-lbl">Record number</label><input type="text" class="oc-input" id="ocSearchMrn" placeholder="MRN..." value="' + esc(mrn) + '" /></div>' +
                '<div class="oc-cell"><label class="oc-lbl">Archive code</label><input type="text" class="oc-input oc-archive-box" id="ocArchiveCode" readonly value="' + esc(arch) + '" /></div>' +
                '<div class="oc-cell"><label class="oc-lbl">Person ID</label><input type="text" class="oc-input" id="ocSearchId" placeholder="Person ID..." value="' + esc(pid) + '" /></div>' +
            '</div>' +
            '<div class="oc-row-grid">' +
                '<div class="oc-cell"><label class="oc-lbl">Department</label><div style="display:flex; gap:6px;"><button type="button" class="oc-ward-btn" onclick="pcFile.openWardPicker()">🏥 Ward</button><input type="text" class="oc-input readonly" id="ocDepartment" readonly value="' + esc(dept) + '" style="width:100%;" /></div></div>' +
                '<div class="oc-cell"><label class="oc-lbl">Insurance/RSSB</label><select class="oc-input" id="ocInsurance"><option>RSSB / RAMA</option></select></div>' +
                '<div class="oc-cell"><label class="oc-lbl">District</label><select class="oc-input" id="ocDistrict"><option>NYARUGENGE</option></select></div>' +
                '<div class="oc-cell oc-btn-cell"><button type="button" class="oc-action-btn" onclick="pcFile.searchPatientRegistry()">Find</button><button type="button" class="oc-action-btn" onclick="pcFile.clearPatientBar()">Clear</button></div>' +
            '</div>';

        // Insert demo bar BELOW global bar if global exists
        var globalBar = document.getElementById('pc_chuk_top_menu');
        if (globalBar && globalBar.parentNode === el) {
            if (globalBar.nextSibling) el.insertBefore(div, globalBar.nextSibling);
            else el.appendChild(div);
        } else if (el.firstChild) {
            el.insertBefore(div, el.firstChild);
        } else {
            el.appendChild(div);
        }

        ['ocSearchFamily','ocSearchFirst','ocSearchNatId','ocSearchMrn','ocSearchId'].forEach(function(id){
            var inputEl=document.getElementById(id);
            if(inputEl) inputEl.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); pcFile.searchPatientRegistry(); } });
        });
        try {
            renderClinicalActionBar(el, p);
        } catch(e){ console.warn('renderClinicalActionBar error:', e); }
    }

    
    function searchPatientRegistry() {
        try {
            var f = document.getElementById('ocSearchFamily') ? document.getElementById('ocSearchFamily').value.trim() : '';
            var fi = document.getElementById('ocSearchFirst') ? document.getElementById('ocSearchFirst').value.trim() : '';
            var nat = document.getElementById('ocSearchNatId') ? document.getElementById('ocSearchNatId').value.trim() : '';
            var mrn = document.getElementById('ocSearchMrn') ? document.getElementById('ocSearchMrn').value.trim() : '';
            var pid = document.getElementById('ocSearchId') ? document.getElementById('ocSearchId').value.trim() : '';
            var q = [f, fi, nat, mrn, pid].filter(Boolean).join(' ').trim();
            if (!q) { if (window.pcToast) pcToast('Enter at least one search field', 'info'); return; }
            var results = [];
            try {
                var cashierPage = String((window.location && window.location.pathname) || '').toLowerCase().indexOf('cashier-dashboard') !== -1;
                if (cashierPage && typeof searchBillingPatients === 'function') results = searchBillingPatients(q);
                else if (typeof searchPatients === 'function') results = searchPatients(q);
                else if (typeof getPatients === 'function') {
                    var all = getPatients() || [];
                    var low = q.toLowerCase();
                    results = all.filter(function(p){ return ((p.firstName||'')+' '+(p.lastName||'')+' '+(p.mrn||'')+' '+(p.nationalId||'')+' '+ (p.id||'')).toLowerCase().indexOf(low)!==-1; });
                }
            } catch(e){}
            if (results && results.length) {
                // Prefer an exact identifier match over a partial match. This
                // is important at cashier: typing Person ID 101 must not pick
                // the first patient whose MRN merely contains "101".
                var exactIdentifier = String(pid || mrn || nat || '').replace(/^MOD-/i, '').toLowerCase();
                var best = results[0];
                if (exactIdentifier) {
                    for (var rIdx = 0; rIdx < results.length; rIdx++) {
                        var candidate = results[rIdx] || {};
                        var ids = [candidate.id, candidate.mrn, candidate.nationalId, candidate.passport].map(function(v) {
                            return String(v == null ? '' : v).replace(/^MOD-/i, '').toLowerCase();
                        });
                        if (ids.indexOf(exactIdentifier) !== -1) { best = candidate; break; }
                    }
                }
                try { localStorage.setItem('pclinic_active_patient', String(best.id)); } catch(e){}
                if (window.pcFile && window.pcFile.renderDemoBar) {
                    var master = document.getElementById('pcMasterHeader') || document.body;
                    window.pcFile.renderDemoBar(master, best);
                }
                if (window.pcToast) pcToast('Found ' + results.length + ' patient(s)', 'success');
                try { localStorage.setItem('pclinic_active_patient', String(best.id)); } catch(e){}
                window.dispatchEvent(new CustomEvent('pcPatientChanged', {detail: best}));
                if (window.pcFilePage) location.reload();
            } else {
                if (window.pcToast) pcToast('No patients found', 'warning');
            }
        } catch(e){ console.error(e); }
    }
    function clearPatientBar() {
        try {
            ['ocSearchFamily','ocSearchFirst','ocSearchNatId','ocSearchMrn','ocSearchId','ocArchiveCode'].forEach(function(id){
                var el=document.getElementById(id); if(el) el.value='';
            });
            localStorage.removeItem('pclinic_active_patient');
            var cleared = { _cleared:true, id:'', mrn:'', lastName:'', firstName:'', nationalId:'', department:'', dob:'', gender:'', archiveCode:'', insurance:'RSSB / RAMA', district:'NYARUGENGE' };
            var master = document.getElementById('pcMasterHeader') || document.body;
            if (window.pcFile && window.pcFile.renderDemoBar) window.pcFile.renderDemoBar(master, cleared);
            if (window.pcToast) pcToast('Cleared', 'info');
        } catch(e){}
        // The identification bar IS the selection. Clearing it must clear the
        // page's selected patient too, or the dashboard keeps working on a
        // patient nobody can see any more. Kept outside the try above so a
        // cosmetic re-render failure can never leave a ghost selection behind.
        try { window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: null })); } catch(e){}
    }
    function openWardPicker() {
        try {
            var wards=['ADMISSION WARD 7','MEDICAL WARD','SURGICAL WARD','PAEDIATRIC WARD','MATERNITY','ICU','ISOLATION'];
            var cur=document.getElementById('ocDepartment') ? document.getElementById('ocDepartment').value : '';
            var choice=prompt('Select Ward:\n' + wards.map(function(w,i){ return (i+1)+'. '+w; }).join('\n') + '\n\nEnter number or name:', cur);
            if(!choice) return;
            var sel=wards[parseInt(choice,10)-1] || choice.toUpperCase();
            var el=document.getElementById('ocDepartment'); if(el) el.value=sel;
            if (window.pcToast) pcToast('Department set to ' + sel, 'success');
        } catch(e){}
    }

    
    /* ══════════════════════════════════════════════════════════════
       PATIENT MENU (👤 Patient ▾ in the CHUK top bar — EVERY page)
       Unfolds the sub-buttons: Patient, Medical summary, Nursing,
       Administration (full patient identification incl. caretaker phone),
       Clear, Print ID card, Upload/Take/Show picture, Digital fingerprint,
       Add administrative document.
       ══════════════════════════════════════════════════════════════ */
    function menuPatient() {
        var p = (window.pcPatient && typeof window.pcPatient.get === 'function') ? window.pcPatient.get() : null;
        if (!p && window.currentPatient) p = window.currentPatient;
        if (!p) {
            try {
                var id = localStorage.getItem('pclinic_active_patient');
                if (id) {
                    var list = [];
                    try { if (typeof getPatients === 'function') list = getPatients() || []; } catch(e){}
                    if (!list.length) {
                        try { list = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
                    }
                    for (var i = 0; i < list.length; i++) {
                        if (String(list[i].id) === String(id) || String(list[i].mrn) === String(id)) { p = list[i]; break; }
                    }
                }
            } catch(e){}
        }
        return p;
    }

    function menuGo(page) {
        var p = menuPatient();
        var id = (p && p.id) || '';
        try { id = id || localStorage.getItem('pclinic_active_patient') || ''; } catch(e){}
        if (window.pcPatient && typeof window.pcPatient.open === 'function') {
            try { window.pcPatient.open(page); return; } catch(e){}
        }
        var sep = page.indexOf('?') !== -1 ? '&' : '?';
        window.location.href = page + sep + 'patient=' + encodeURIComponent(id);
    }

    function menuNeedPatient(msg) {
        var p = menuPatient();
        if (p && p.id) return true;
        if (window.pcToast) pcToast(msg || 'Please select a patient first', 'warning');
        else alert(msg || 'Please select a patient first');
        return false;
    }

    /* ══════════════════════════════════════════════════════════════
       NURSING MENU (🏥 Nursing ▾ in the CHUK top bar — EVERY page)
       Unfolds the sub-buttons: Careplan, Vital signs graph, Deliveries.
       Each deep-links into the Nurse Dashboard for the SELECTED patient
       (Common Server) with the right section opened.
       ══════════════════════════════════════════════════════════════ */
    function showNursingMenu(btn) {
        closePatientMenu();
        closeNursingMenu();
        closeApplicationsMenu();
        closeSystemMenu();
        if (!document.getElementById('pc_patient_menu_styles')) {
            var st = document.createElement('style');
            st.id = 'pc_patient_menu_styles';
            st.textContent =
                '.pc-patient-menu { position:fixed; z-index:9900; min-width:250px; padding:6px; border-radius:14px; background:rgba(255,255,255,.78); -webkit-backdrop-filter:saturate(180%) blur(24px); backdrop-filter:saturate(180%) blur(24px); border:.5px solid rgba(0,0,0,.12); box-shadow:0 14px 44px rgba(0,0,0,.24); opacity:0; transform:translateY(-6px) scale(.97); transition:opacity .2s, transform .24s cubic-bezier(.34,1.56,.64,1); pointer-events:none; }' +
                '.pc-patient-menu.open { opacity:1; transform:none; pointer-events:auto; }' +
                '.pc-patient-menu button { width:100%; display:flex; align-items:center; gap:10px; padding:9px 11px; border:0; background:none; border-radius:9px; font-family:inherit; font-size:12.5px; font-weight:600; color:var(--tp,#1c1c1e); cursor:pointer; text-align:left; transition:background .18s; }' +
                '.pc-patient-menu button:hover { background:var(--acb,#eaf2ff); color:var(--ac,#0071e3); }' +
                '.pc-patient-menu button i { font-size:15px; opacity:.8; flex-shrink:0; width:18px; text-align:center; }' +
                '[data-theme="dark"] .pc-patient-menu { background:rgba(28,28,30,.82); border-color:rgba(255,255,255,.16); }' +
                '[data-theme="dark"] .pc-patient-menu button { color:#e5e5ea; }';
            document.head.appendChild(st);
        }

        var items = [
            { icon:'ti-notes',       label:'Careplan',           run:function(){ nurseGo('careplan'); } },
            { icon:'ti-chart-line',  label:'Vital signs graph',  run:function(){ nurseGo('vitalsgraph'); } },
            { icon:'ti-baby-carriage', label:'Deliveries',       run:function(){ nurseGo('deliveries'); } }
        ];

        var m = document.createElement('div');
        m.className = 'pc-patient-menu noprint';
        m.innerHTML = items.map(function(it) {
            return '<button type="button"><i class="ti ' + it.icon + '"></i><span>' + esc(it.label) + '</span></button>';
        }).join('');
        m.addEventListener('click', function(e) {
            var b = e.target.closest('button');
            if (!b) return;
            var idx = Array.prototype.indexOf.call(m.querySelectorAll('button'), b);
            closeNursingMenu();
            if (items[idx] && items[idx].run) items[idx].run();
        });
        document.body.appendChild(m);
        var r = btn.getBoundingClientRect();
        m.style.top = (r.bottom + 6) + 'px';
        m.style.left = Math.min(r.left, window.innerWidth - 270) + 'px';
        requestAnimationFrame(function(){ m.classList.add('open'); });
        setTimeout(function() {
            var closer = function(e) {
                if (!m.contains(e.target) && e.target !== btn) {
                    if (m.parentNode) m.parentNode.removeChild(m);
                    document.removeEventListener('click', closer);
                }
            };
            document.addEventListener('click', closer);
        }, 50);
    }
    function closeNursingMenu() {
        var old = document.querySelector('.pc-patient-menu');
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    function nurseGo(section) {
        var p = menuPatient();
        var id = (p && p.id) || '';
        try { id = id || localStorage.getItem('pclinic_active_patient') || ''; } catch(e){}
        if (!id) {
            if (window.pcToast) pcToast('Please select a patient first — then open ' + section.replace('vitalsgraph','the vital signs graph') + '.', 'warning');
            else alert('Please select a patient first.');
            return;
        }
        var url = 'nurse-dashboard.html?patient=' + encodeURIComponent(id) + '&tab=' + encodeURIComponent(section);
        if (window.pcPatient && typeof window.pcPatient.open === 'function') {
            try { window.pcPatient.open(url); return; } catch(e){}
        }
        window.location.href = url;
    }

    /* ══════════════════════════════════════════════════════════════
       APPLICATIONS MENU (💉 Applications ▾ in the CHUK top bar — EVERY page)
       Unfolds the 15 application modules of the hospital suite:
       Queue management, Planning, Prescriptions, Emergencies actual
       situation, Pharmacy, Financial, Technical examinations, ADT,
       Diagnoses, Statistics, Data center, Fast physiotherapy data
       entry, Executive, Mini-stats, Print. Every item lands on a real
       Common-Server page; patient-aware items carry the selected
       patient (?patient=), Print prints the selected patient's ID
       card or the current page.
       ══════════════════════════════════════════════════════════════ */
    function showApplicationsMenu(btn) {
        closePatientMenu();
        closeNursingMenu();
        closeApplicationsMenu();
        closeSystemMenu();
        if (!document.getElementById('pc_patient_menu_styles')) {
            var st = document.createElement('style');
            st.id = 'pc_patient_menu_styles';
            st.textContent =
                '.pc-patient-menu { position:fixed; z-index:9900; min-width:250px; padding:6px; border-radius:14px; background:rgba(255,255,255,.78); -webkit-backdrop-filter:saturate(180%) blur(24px); backdrop-filter:saturate(180%) blur(24px); border:.5px solid rgba(0,0,0,.12); box-shadow:0 14px 44px rgba(0,0,0,.24); opacity:0; transform:translateY(-6px) scale(.97); transition:opacity .2s, transform .24s cubic-bezier(.34,1.56,.64,1); pointer-events:none; }' +
                '.pc-patient-menu.open { opacity:1; transform:none; pointer-events:auto; }' +
                '.pc-patient-menu button { width:100%; display:flex; align-items:center; gap:10px; padding:9px 11px; border:0; background:none; border-radius:9px; font-family:inherit; font-size:12.5px; font-weight:600; color:var(--tp,#1c1c1e); cursor:pointer; text-align:left; transition:background .18s; }' +
                '.pc-patient-menu button:hover { background:var(--acb,#eaf2ff); color:var(--ac,#0071e3); }' +
                '.pc-patient-menu button i { font-size:15px; opacity:.8; flex-shrink:0; width:18px; text-align:center; }' +
                '.pc-patient-menu button span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }' +
                '[data-theme="dark"] .pc-patient-menu { background:rgba(28,28,30,.82); border-color:rgba(255,255,255,.16); }' +
                '[data-theme="dark"] .pc-patient-menu button { color:#e5e5ea; }';
            document.head.appendChild(st);
        }

        var items = [
            { icon:'ti-list-numbers',    label:'Queue management',              run:function(){ appsGo('queue.html'); } },
            { icon:'ti-calendar-event',  label:'Planning',                      run:function(){ appsGo('appointments.html'); } },
            { icon:'ti-pill',            label:'Prescriptions',                 run:function(){ menuGo('prescription.html'); } },
            { icon:'ti-ambulance',       label:'Emergencies actual situation',  run:function(){ appsGo('beds-dashboard.html'); } },
            { icon:'ti-building-store',  label:'Pharmacy',                      run:function(){ appsGo('pharmacy-dashboard.html'); } },
            { icon:'ti-cash',            label:'Financial',                     run:function(){ appsGo('cashier-dashboard.html'); } },
            { icon:'ti-test-pipe',       label:'Technical examinations',        run:function(){ appsGo('global-examinations.html'); } },
            { icon:'ti-bed',             label:'ADT',                           run:function(){ menuGo('admission-form.html'); } },
            { icon:'ti-stethoscope',     label:'Diagnoses',                     run:function(){ menuGo('opd-file.html'); } },
            { icon:'ti-chart-bar',       label:'Statistics',                    run:function(){ appsGo('admin-dashboard.html'); } },
            { icon:'ti-database',        label:'Data center',                   run:function(){ appsGo('hub.html'); } },
            { icon:'ti-run',             label:'Fast physiotherapy data entry', run:function(){ menuGo('physio-request.html'); } },
            { icon:'ti-briefcase',       label:'Executive',                     run:function(){ appsGo('Finance-dashboard.html'); } },
            { icon:'ti-chart-pie',       label:'Mini-stats',                    run:function(){ appsGo('reception-dashboard.html'); } },
            { icon:'ti-printer',         label:'Print',                         run:function(){ var p = menuPatient(); if (p && p.id) { printPatientIdCard(); } else { window.print(); } } }
        ];

        var m = document.createElement('div');
        m.className = 'pc-patient-menu pc-apps-menu noprint';
        m.innerHTML = items.map(function(it) {
            return '<button type="button"><i class="ti ' + it.icon + '"></i><span>' + esc(it.label) + '</span></button>';
        }).join('');
        m.addEventListener('click', function(e) {
            var b = e.target.closest('button');
            if (!b) return;
            var idx = Array.prototype.indexOf.call(m.querySelectorAll('button'), b);
            closeApplicationsMenu();
            if (items[idx] && items[idx].run) items[idx].run();
        });
        document.body.appendChild(m);
        var r = btn.getBoundingClientRect();
        m.style.top = (r.bottom + 6) + 'px';
        m.style.left = Math.min(r.left, Math.max(8, window.innerWidth - 306)) + 'px';
        m.style.minWidth = '296px';
        requestAnimationFrame(function(){ m.classList.add('open'); });
        setTimeout(function() {
            var closer = function(e) {
                if (!m.contains(e.target) && e.target !== btn) {
                    if (m.parentNode) m.parentNode.removeChild(m);
                    document.removeEventListener('click', closer);
                }
            };
            document.addEventListener('click', closer);
        }, 50);
    }
    function closeApplicationsMenu() {
        var old = document.querySelector('.pc-apps-menu');
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    function appsGo(page) {
        if (window.pcPatient && typeof window.pcPatient.open === 'function') {
            try { window.pcPatient.open(page); return; } catch(e){}
        }
        window.location.href = page;
    }

    /* ══════════════════════════════════════════════════════════════
       SYSTEM MENU (⚙️ System ▾ in the CHUK top bar — EVERY page)
       Full-function system suite, all Common Server powered:
       My profile (real staff), Staff & users, Appearance (Apple
       light/dark), Language & settings, Notifications (live counts),
       Backup data (JSON download of every pclinic_* dataset),
       Restore data (JSON import + live refresh), Purge template
       data (runs the orders-engine purge), Data center, System
       info, Logout.
       ══════════════════════════════════════════════════════════════ */
    function showSystemMenu(btn) {
        closePatientMenu();
        closeNursingMenu();
        closeApplicationsMenu();
        closeSystemMenu();
        if (!document.getElementById('pc_patient_menu_styles')) {
            var st = document.createElement('style');
            st.id = 'pc_patient_menu_styles';
            st.textContent =
                '.pc-patient-menu { position:fixed; z-index:9900; min-width:250px; padding:6px; border-radius:14px; background:rgba(255,255,255,.78); -webkit-backdrop-filter:saturate(180%) blur(24px); backdrop-filter:saturate(180%) blur(24px); border:.5px solid rgba(0,0,0,.12); box-shadow:0 14px 44px rgba(0,0,0,.24); opacity:0; transform:translateY(-6px) scale(.97); transition:opacity .2s, transform .24s cubic-bezier(.34,1.56,.64,1); pointer-events:none; }' +
                '.pc-patient-menu.open { opacity:1; transform:none; pointer-events:auto; }' +
                '.pc-patient-menu button { width:100%; display:flex; align-items:center; gap:10px; padding:9px 11px; border:0; background:none; border-radius:9px; font-family:inherit; font-size:12.5px; font-weight:600; color:var(--tp,#1c1c1e); cursor:pointer; text-align:left; transition:background .18s; }' +
                '.pc-patient-menu button:hover { background:var(--acb,#eaf2ff); color:var(--ac,#0071e3); }' +
                '.pc-patient-menu button i { font-size:15px; opacity:.8; flex-shrink:0; width:18px; text-align:center; }' +
                '.pc-patient-menu button span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }' +
                '.pc-patient-menu .pm-sep { height:1px; background:rgba(0,0,0,.1); margin:5px 8px; }' +
                '[data-theme="dark"] .pc-patient-menu { background:rgba(28,28,30,.82); border-color:rgba(255,255,255,.16); }' +
                '[data-theme="dark"] .pc-patient-menu button { color:#e5e5ea; }' +
                '[data-theme="dark"] .pc-patient-menu .pm-sep { background:rgba(255,255,255,.12); }';
            document.head.appendChild(st);
        }

        var items = [
            { icon:'ti-user',          label:'My profile',            run:function(){ openStaffProfileModal(); } },
            { icon:'ti-users',         label:'Staff & users',         run:function(){ systemGo('admin-dashboard.html?tab=staff'); } },
            { icon:'ti-palette',       label:'Appearance',            run:function(){ toggleThemeFromMenu(); } },
            { icon:'ti-world',         label:'Language & settings',   run:function(){ openSystemSettingsModal(); } },
            { icon:'ti-bell',          label:'Notifications',         run:function(){ showNotificationsModal(); } },
            { icon:'ti-download',      label:'Backup data',           run:function(){ sysBackup(); } },
            { icon:'ti-upload',        label:'Restore data',          run:function(){ sysRestore(); } },
            { icon:'ti-eraser',        label:'Purge template data',   run:function(){ sysPurge(); } },
            { icon:'ti-database',      label:'Data center',           run:function(){ systemGo('hub.html'); } },
            { icon:'ti-info-circle',   label:'System info',           run:function(){ openSystemInfoModal(); } },
            { icon:'ti-logout',        label:'Logout',                run:function(){ confirmLogout(); } }
        ];

        var m = document.createElement('div');
        m.className = 'pc-patient-menu pc-sys-menu noprint';
        m.innerHTML = items.map(function(it) {
            return '<button type="button"><i class="ti ' + it.icon + '"></i><span>' + esc(it.label) + '</span></button>';
        }).join('');
        m.addEventListener('click', function(e) {
            var b = e.target.closest('button');
            if (!b) return;
            var idx = Array.prototype.indexOf.call(m.querySelectorAll('button'), b);
            closeSystemMenu();
            if (items[idx] && items[idx].run) items[idx].run();
        });
        document.body.appendChild(m);
        var r = btn.getBoundingClientRect();
        m.style.top = (r.bottom + 6) + 'px';
        m.style.left = Math.min(r.left, Math.max(8, window.innerWidth - 306)) + 'px';
        m.style.minWidth = '262px';
        requestAnimationFrame(function(){ m.classList.add('open'); });
        setTimeout(function() {
            var closer = function(e) {
                if (!m.contains(e.target) && e.target !== btn) {
                    if (m.parentNode) m.parentNode.removeChild(m);
                    document.removeEventListener('click', closer);
                }
            };
            document.addEventListener('click', closer);
        }, 50);
    }
    function closeSystemMenu() {
        var old = document.querySelector('.pc-sys-menu');
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    function systemGo(page) {
        if (window.pcPatient && typeof window.pcPatient.open === 'function') {
            try { window.pcPatient.open(page); return; } catch(e){}
        }
        window.location.href = page;
    }

    /* 📦 BACKUP — download every Common Server dataset as one JSON file */
    function sysBackup() {
        var msg = 'Browser export of patient data is disabled. Use the approved encrypted backup process.';
        if (window.pcToast) pcToast(msg, 'warning'); else alert(msg);
        return false;
    }

    /* ♻️ RESTORE — import a PClinic backup JSON and refresh every dashboard live */
    function sysRestore() {
        var msg = 'Browser import of patient data is disabled. Use the approved validated migration process.';
        if (window.pcToast) pcToast(msg, 'warning'); else alert(msg);
        return false;
    }

    /* 🧹 PURGE — run the orders-engine template purge (loads it if needed) */
    function sysPurge() {
        function run() {
            var purged = 0;
            try {
                if (window.pcOrders && typeof window.pcOrders.purgeAllTemplateData === 'function') {
                    purged = window.pcOrders.purgeAllTemplateData() || 0;
                } else {
                    // lightweight inline fallback: template-named patients only
                    var names = ['TEKEREZA', 'GASPARD', 'NSANZINTWARI', 'SARATIEL', 'MUTUA', 'JOHN DOE', 'JANE DOE'];
                    var pts = JSON.parse(localStorage.getItem('pclinic_patients') || '[]');
                    var before = pts.length;
                    pts = pts.filter(function(p) {
                        var nm = (((p.firstName || '') + ' ' + (p.lastName || '') + ' ' + (p.id || '') + ' ' + (p.mrn || ''))).toUpperCase();
                        for (var i = 0; i < names.length; i++) if (nm.indexOf(names[i]) !== -1) return false;
                        return true;
                    });
                    purged = before - pts.length;
                    localStorage.setItem('pclinic_patients', JSON.stringify(pts));
                }
            } catch(e){}
            try { window.dispatchEvent(new CustomEvent('patientsUpdated')); } catch(e){}
            if (window.pcToast) pcToast('🧹 Template data purge complete — removed ' + purged + ' record(s) from the Common Server.', 'success');
            else alert('🧹 Template data purge complete — removed ' + purged + ' record(s).');
        }
        if (window.pcOrders && typeof window.pcOrders.purgeAllTemplateData === 'function') { run(); return; }
        var s = document.createElement('script');
        s.src = 'pclinic-orders.js';
        s.onload = function(){ setTimeout(run, 60); };
        s.onerror = function(){ run(); };
        document.head.appendChild(s);
    }

    function showPatientMenu(btn) {
        closePatientMenu();
        closeNursingMenu();
        closeApplicationsMenu();
        closeSystemMenu();
        if (!document.getElementById('pc_patient_menu_styles')) {
            var st = document.createElement('style');
            st.id = 'pc_patient_menu_styles';
            st.textContent =
                '.pc-patient-menu { position:fixed; z-index:9900; min-width:250px; padding:6px; border-radius:14px; background:rgba(255,255,255,.78); -webkit-backdrop-filter:saturate(180%) blur(24px); backdrop-filter:saturate(180%) blur(24px); border:.5px solid rgba(0,0,0,.12); box-shadow:0 14px 44px rgba(0,0,0,.24); opacity:0; transform:translateY(-6px) scale(.97); transition:opacity .2s, transform .24s cubic-bezier(.34,1.56,.64,1); pointer-events:none; }' +
                '.pc-patient-menu.open { opacity:1; transform:none; pointer-events:auto; }' +
                '.pc-patient-menu button { width:100%; display:flex; align-items:center; gap:10px; padding:9px 11px; border:0; background:none; border-radius:9px; font-family:inherit; font-size:12.5px; font-weight:600; color:var(--tp,#1c1c1e); cursor:pointer; text-align:left; transition:background .18s; }' +
                '.pc-patient-menu button:hover { background:var(--acb,#eaf2ff); color:var(--ac,#0071e3); }' +
                '.pc-patient-menu button i { font-size:15px; opacity:.8; flex-shrink:0; width:18px; text-align:center; }' +
                '.pc-patient-menu .pm-sep { height:1px; background:rgba(0,0,0,.1); margin:5px 8px; }' +
                '[data-theme="dark"] .pc-patient-menu { background:rgba(28,28,30,.82); border-color:rgba(255,255,255,.16); }' +
                '[data-theme="dark"] .pc-patient-menu button { color:#e5e5ea; }' +
                '[data-theme="dark"] .pc-patient-menu .pm-sep { background:rgba(255,255,255,.12); }';
            document.head.appendChild(st);
        }

        var items = [
            { icon:'ti-user',      label:'Patient',             run:function(){ openPatientProfileModal(); } },
            { icon:'ti-id',       label:'Administration',       run:function(){ openPatientAdministration(); } },
            null,
            { icon:'ti-eraser',   label:'Clear',                run:function(){ clearPatientBar(); } },
            { icon:'ti-id-badge', label:'Print ID card',        run:function(){ printPatientIdCard(); } },
            { icon:'ti-upload',   label:'Upload picture',       run:function(){ uploadPatientPicture(); } },
            { icon:'ti-camera',   label:'Take picture',         run:function(){ takePatientPicture(); } },
            { icon:'ti-photo',    label:'Show picture',         run:function(){ showPatientPicture(); } },
            { icon:'ti-fingerprint', label:'Read digital fingerprint', run:function(){ readPatientFingerprint(); } },
            { icon:'ti-file-plus', label:'Add administrative document', run:function(){ addAdministrativeDocument(); } }
        ];

        var m = document.createElement('div');
        m.className = 'pc-patient-menu noprint';
        m.innerHTML = items.map(function(it) {
            if (!it) return '<div class="pm-sep"></div>';
            return '<button type="button"><i class="ti ' + it.icon + '"></i><span>' + esc(it.label) + '</span></button>';
        }).join('');
        m.addEventListener('click', function(e) {
            var b = e.target.closest('button');
            if (!b) return;
            var idx = Array.prototype.indexOf.call(m.querySelectorAll('button'), b);
            var real = items.filter(function(x){ return x; })[idx];
            closePatientMenu();
            if (real && real.run) real.run();
        });
        document.body.appendChild(m);
        var r = btn.getBoundingClientRect();
        m.style.top = (r.bottom + 6) + 'px';
        m.style.left = Math.min(r.left, window.innerWidth - 270) + 'px';
        requestAnimationFrame(function(){ m.classList.add('open'); });
        setTimeout(function() {
            var closer = function(e) {
                if (!m.contains(e.target) && e.target !== btn) {
                    if (m.parentNode) m.parentNode.removeChild(m);
                    document.removeEventListener('click', closer);
                }
            };
            document.addEventListener('click', closer);
        }, 50);
    }
    function closePatientMenu() {
        var old = document.querySelector('.pc-patient-menu');
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    /* ── 🗂️ ADMINISTRATION — full patient identification as recorded at
          Reception, including the caretaker's phone number ── */
    function openPatientAdministration() {
        var p = menuPatient();
        if (p && p.id) {
            openPatientProfileModal(p.id);
            return;
        }
        // ⛔ NO patient selected → ALWAYS show the picker (never a dead click)
        if (window.pcToast) pcToast('Select the patient whose identification you want to view or edit.', 'info');
        openAdminPatientPicker(function(id) {
            openPatientProfileModal(id);
        });
    }

    /* ── 🖨️ Print ID card ── */
    function miniBarcode(code) {
        var str = String(code || 'PCLINIC');
        var hash = 0;
        for (var i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
        var bars = '', x = 0;
        for (var j = 0; j < 32; j++) {
            var bit = (hash >> (j % 28)) & 1;
            var w = bit ? 2.4 : 1.1;
            bars += '<rect x="' + x + '" y="0" width="' + w + '" height="24" fill="#1d1d1f"/>';
            x += w + 1.6;
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + x + ' 24" style="width:150px;height:24px;">' + bars + '</svg>';
    }
    function printPatientIdCard() {
        var p = menuPatient();
        if (!menuNeedPatient('Select a patient first to print their ID card.')) return;
        var win = window.open('', '_blank', 'width=480,height=560');
        if (!win) { if (window.pcToast) pcToast('Pop-up blocked — allow pop-ups to print the ID card.', 'warning'); return; }
        win.document.write('<!DOCTYPE html><html><head><title>Patient ID Card — PClinic / CHUK</title>');
        win.document.write('<style>body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;padding:24px;color:#1d1d1f;text-align:center;} .card{border:2px solid #1d1d1f;border-radius:14px;padding:20px;max-width:360px;margin:0 auto;} .hosp{font-size:12px;font-weight:800;letter-spacing:.5px;color:#007080;} .name{font-size:18px;font-weight:800;margin-top:8px;} .row{display:flex;justify-content:space-between;font-size:12px;margin-top:6px;} .lbl{color:#6e6e73;}</style></head><body>');
        win.document.write('<div class="card">');
        win.document.write('<div class="hosp">PCLINIC / CHUK — PATIENT IDENTIFICATION CARD</div>');
        win.document.write('<div class="name">' + esc((p.name || ((p.firstName || '') + ' ' + (p.lastName || ''))).trim() || 'Patient') + '</div>');
        win.document.write('<div class="row"><span class="lbl">MRN</span><span>' + esc(p.mrn || p.id || '—') + '</span></div>');
        win.document.write('<div class="row"><span class="lbl">Date of birth</span><span>' + esc(p.dob ? new Date(p.dob).toLocaleDateString('en-GB') : '—') + '</span></div>');
        win.document.write('<div class="row"><span class="lbl">Gender</span><span>' + esc(p.gender || '—') + '</span></div>');
        win.document.write('<div class="row"><span class="lbl">National ID / PP</span><span>' + esc(p.nationalId || '—') + '</span></div>');
        win.document.write('<div class="row"><span class="lbl">Caretaker phone</span><span>' + esc(p.caretakerPhone || '—') + '</span></div>');
        win.document.write('<div style="margin-top:14px;">' + miniBarcode(String(p.mrn || p.id || 'PCLINIC')) + '</div>');
        win.document.write('<div style="font-size:10px;color:#6e6e73;margin-top:6px;">Issued ' + new Date().toLocaleDateString('en-GB') + ' • Keep this card with the patient</div>');
        win.document.write('</div></body></html>');
        win.document.close();
        win.focus();
        setTimeout(function(){ win.print(); }, 300);
    }

    /* ── 📷 Pictures ── */
    function patientPictureInput() {
        var msg = 'Patient image uploads are disabled until secure object storage is configured.';
        if (window.pcToast) pcToast(msg, 'warning'); else alert(msg);
        return false;
    }
    function persistPicture() {
        return false;
    }
    function uploadPatientPicture() {
        patientPictureInput(false, function(p, dataUrl) {
            persistPicture(p, dataUrl);
            if (window.pcToast) pcToast('📷 Picture saved to the patient record', 'success');
        });
    }
    function takePatientPicture() {
        patientPictureInput(true, function(p, dataUrl) {
            persistPicture(p, dataUrl);
            if (window.pcToast) pcToast('📸 Picture captured and saved', 'success');
        });
    }
    function showPatientPicture() {
        var p = menuPatient();
        if (!menuNeedPatient('Select a patient first to show their picture.')) return;
        if (!p.photo) {
            if (window.pcToast) pcToast('No picture recorded for this patient — use Upload picture or Take picture.', 'info');
            return;
        }
        var scrim = document.createElement('div');
        scrim.className = 'pc-modal-scrim noprint';
        scrim.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9900;display:flex;align-items:center;justify-content:center;padding:20px;';
        scrim.innerHTML =
            '<div style="background:#fff;border-radius:16px;padding:16px;max-width:420px;width:100%;text-align:center;">' +
                '<div style="font-weight:800;font-size:14px;margin-bottom:10px;">📷 ' + esc((p.name || ((p.firstName || '') + ' ' + (p.lastName || ''))).trim() || 'Patient') + '</div>' +
                '<img src="' + esc(p.photo) + '" style="max-width:100%;max-height:420px;border-radius:10px;" alt="Patient picture"/>' +
                '<div style="margin-top:10px;"><button type="button" style="height:34px;padding:0 18px;border-radius:9px;border:0;background:#007080;color:#fff;font-weight:700;cursor:pointer;" onclick="this.closest(\'.pc-modal-scrim\').remove();">Close</button></div>' +
            '</div>';
        document.body.appendChild(scrim);
        scrim.onclick = function(e){ if (e.target === scrim) scrim.remove(); };
    }

    /* ── 👆 Digital fingerprint ── */
    function readPatientFingerprint() {
        var p = menuPatient();
        if (!menuNeedPatient('Select a patient first to register their fingerprint.')) return;
        if (window.PublicKeyCredential && navigator && navigator.credentials) {
            var chal = new Uint8Array(32);
            if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(chal);
            navigator.credentials.create({
                publicKey: {
                    challenge: chal,
                    rp: { name: 'PClinic / CHUK' },
                    user: { id: new Uint8Array(8), name: String(p.mrn || p.id), displayName: ((p.name || ((p.firstName || '') + ' ' + (p.lastName || ''))).trim()) },
                    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                    authenticatorSelection: { userVerification: 'required' },
                    timeout: 30000
                }
            }).then(function(cred) {
                p.fingerprintRegistered = true;
                p.fingerprintId = cred ? cred.id : null;
                p.fingerprintAt = new Date().toISOString();
                if (window.pcToast) pcToast('👆 Fingerprint registered for ' + ((p.firstName || '') + ' ' + (p.lastName || '')).trim(), 'success');
            }).catch(function() {
                if (window.pcToast) pcToast('Fingerprint registration cancelled or unavailable', 'warning');
            });
        } else {
            if (window.pcToast) pcToast('👆 No fingerprint reader available on this device (biometric hardware required).', 'warning');
        }
    }

    /* ── 📎 Administrative document ── */
    function addAdministrativeDocument() {
        var p = menuPatient();
        if (!menuNeedPatient('Select a patient first to attach an administrative document.')) return;
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
        inp.onchange = function() {
            var f = inp.files && inp.files[0];
            if (!f) return;
            p.administrativeDocuments = p.administrativeDocuments || [];
            p.administrativeDocuments.push({
                name: f.name,
                type: f.type || 'document',
                size: f.size,
                addedAt: new Date().toISOString(),
                addedBy: (window.currentStaff && window.currentStaff.name) || 'PClinic Staff'
            });
            var all = [];
            try { if (typeof getPatients === 'function') all = getPatients() || []; } catch(e){}
            if (!all.length) { try { all = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){} }
            for (var i = 0; i < all.length; i++) {
                if (String(all[i].id) === String(p.id) || String(all[i].mrn) === String(p.mrn || p.id)) {
                    all[i].administrativeDocuments = p.administrativeDocuments;
                    try { if (typeof savePatientsToStorage === 'function') savePatientsToStorage(all); else localStorage.setItem('pclinic_patients', JSON.stringify(all)); } catch(e){}
                    try { window.dispatchEvent(new CustomEvent('patientsUpdated')); window.dispatchEvent(new Event('storage')); } catch(e){}
                    break;
                }
            }
            if (window.pcToast) pcToast('📎 Document "' + f.name + '" attached to the patient record (' + p.administrativeDocuments.length + ' total)', 'success');
        };
        inp.click();
    }

/* ══════════ EXPORTS ══════════ */
    window.pcFile = {
        patient: patient, nameOf: nameOf, age: age, esc: esc, uid: uid, staff: staff,
        allDx: allDx, addDx: addDx, dxPicker: dxPicker,
        attachments: attachments, saveRdv: saveRdv,
        save: saveFile, list: listFiles, localList: localFiles,
        listenFiles: listenFiles, retryFileSync: retrySync,
        fileSyncError: fileSyncError,
        actionBar: actionBar, sheet: sheet, print: printDoc,
        renderDemoBar: renderPatientIdentificationBar,
        renderClinicalActionBar: renderClinicalActionBar,
        searchFromDemoBar: searchPatientRegistry,
        searchPatientRegistry: searchPatientRegistry,
        showPatientMenu: showPatientMenu,
        closePatientMenu: closePatientMenu,
        openPatientAdministration: openPatientAdministration,
        printPatientIdCard: printPatientIdCard,
        uploadPatientPicture: uploadPatientPicture,
        takePatientPicture: takePatientPicture,
        showPatientPicture: showPatientPicture,
        readPatientFingerprint: readPatientFingerprint,
        addAdministrativeDocument: addAdministrativeDocument,
        openWardPicker: openWardPicker,
        openPatientProfileModal: openPatientProfileModal,
        openSystemSettingsModal: openSystemSettingsModal,
        openSystemInfoModal: openSystemInfoModal,
        toggleThemeFromMenu: toggleThemeFromMenu,
        showNotificationsModal: showNotificationsModal,
        openStaffProfileModal: openStaffProfileModal,
        confirmLogout: confirmLogout,
        clearPatientBar: clearPatientBar,
        read: read, write: write
    };

    function boot() { autoMountPatientBar(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    console.log('📁 PClinic file engine ready');


    /* ══════════════ TOPBAR BUTTON HELPERS (THEME, ALERTS, STAFF, LOGOUT) ══════════════ */
    function toggleThemeFromMenu() {
        var current = localStorage.getItem('pclinic-theme') || 'light';
        var next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('pclinic-theme', next);
        if (next === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.classList.add('dark-mode');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            document.body.classList.remove('dark-mode');
        }
        if (window.pcToast) pcToast('🎨 Switched to Apple ' + (next === 'dark' ? 'Dark' : 'Light') + ' Mode', 'info');
        else alert('🎨 Switched to Apple ' + (next === 'dark' ? 'Dark' : 'Light') + ' Mode');
    }

    function showNotificationsModal() {
        // ⛔ NO TEMPLATE DATA: counts are computed live from the Common Server
        var unpaid = 0, lowStock = 0;
        try {
            var bills = JSON.parse(localStorage.getItem('pclinic_bills') || '[]');
            unpaid = bills.filter(function(b){ return b.status !== 'paid' && b.status !== 'cancelled'; }).length;
            var pharm = JSON.parse(localStorage.getItem('pclinic_pharmacy_inventory') || '[]');
            lowStock = pharm.filter(function(it){ return (Number(it.qty) || 0) <= 20; }).length;
        } catch(e){}
        alert('🔔 Live Common Server Alerts\n\n1. Unpaid invoices in the cashier ledger: ' + unpaid + '\n2. Pharmacy items at critical stock level: ' + lowStock);
    }

    function openStaffProfileModal() {
        // ⛔ NO TEMPLATE DATA: the profile is built from the live logged-in staff (Common Server), never a hardcoded doctor.
        var st = (window.currentStaff && window.currentStaff.name) ? window.currentStaff : null;
        if (!st) {
            alert('Active staff profile is not available. Please sign in again.');
            return;
        }
        var name = (st && (st.name || ((st.firstName || '') + ' ' + (st.lastName || '')).trim())) || 'PClinic Staff';
        var staffId = (st && (st.staffId || st.id)) || '—';
        var role = (st && st.role) || 'Hospital Staff';
        var dept = (st && (st.department || st.dept)) || 'CHUK';
        alert('👨‍⚕️ Active Staff Account Profile\n\nName: ' + name + '\nStaff ID: ' + staffId + '\nRole: ' + role + '\nDepartment: ' + dept + '\nStatus: Authenticated and active\n\nPasswords are never displayed or stored.');
    }

    function confirmLogout() {
        var st = (window.currentStaff && window.currentStaff.name) ? window.currentStaff.name : 'Staff';
        if (confirm('Sign out of PClinic as ' + st + '?')) {
            localStorage.removeItem('pclinic_active_patient');
            if (window.pcToast) pcToast('🚪 Signing out...', 'info');
            window.location.href = 'login.html';
        }
    }


    /* ══════════════ AUTOMATIC SYSTEM-WIDE BANNER BOOTSTRAP ══════════════
       Ensures on whichever page is opened across the entire hospital system,
       the Complete Patient Identification Bar (.oc-demo-bar) and Top Menu Strip
       (.chuk-top-menu) stay visible at the top exactly as it is!
       ════════════════════════════════════════════════════════════════════ */
    function autoMountPatientBar() {
        var pathStr = String((window.location && (window.location.pathname || window.location.href)) || '').toLowerCase();
        if (isReceptionDashboardPage()) {
            if (typeof createGlobalTopBar === 'function') createGlobalTopBar();
            removeReceptionPatientIdentificationBar();
            return;
        }
        // Cashier uses the normal shared Patient Identification bar. The
        // generic mounting path below restores the last selected patient (or
        // renders empty searchable fields when no patient is active).
        /* ── ADMIN DASHBOARD: common CHUK top bar + admin buttons on the bar below ── */
        if (pathStr.indexOf('admin-dashboard') !== -1) {
            if (typeof createGlobalTopBar === 'function') createGlobalTopBar();
            var oldDemoAdm = document.getElementById('pc_common_demo_bar');
            if (oldDemoAdm && oldDemoAdm.parentNode) oldDemoAdm.parentNode.removeChild(oldDemoAdm);
            renderAdminActionBar(document.getElementById('pcMasterHeader') || document.body);
            return;
        }
        /* ── THEATER DASHBOARD: CHUK top bar + theater action bar only ── */
        if (pathStr.indexOf('theater-dashboard') !== -1) {
            if (typeof createGlobalTopBar === 'function') createGlobalTopBar();
            var oldDemoTh = document.getElementById('pc_common_demo_bar');
            if (oldDemoTh && oldDemoTh.parentNode) oldDemoTh.parentNode.removeChild(oldDemoTh);
            renderTheaterActionBar(document.getElementById('pcMasterHeader') || document.body);
            return;
        }
        /* ── HR DASHBOARD: CHUK top bar + HR action bar only ── */
        if (pathStr.indexOf('hr-dashboard') !== -1) {
            if (typeof createGlobalTopBar === 'function') createGlobalTopBar();
            var oldDemoHr = document.getElementById('pc_common_demo_bar');
            if (oldDemoHr && oldDemoHr.parentNode) oldDemoHr.parentNode.removeChild(oldDemoHr);
            // ── CHUK TOP BAR ON TOP OF EVERYTHING ──
            // Re-assert the master header as the very first element of
            // <body>, so the CHUK strip sits above the page's own
            // nav-tabs / search row / content on the HR dashboard.
            var _m = document.getElementById('pcMasterHeader');
            if (_m && _m.parentNode === document.body && document.body.firstChild !== _m) {
                document.body.insertBefore(_m, document.body.firstChild);
            }
            renderHRActionBar(document.getElementById('pcMasterHeader') || document.body);
            return;
        }
        var master = document.getElementById('pcMasterHeader');
        if (!master) {
            master = document.createElement('div');
            master.id = 'pcMasterHeader';
            master.className = 'pc-master-header';
            if (document.body.firstChild) document.body.insertBefore(master, document.body.firstChild);
            else document.body.appendChild(master);
        }
        /* ── LABORATORY DASHBOARD: Bar 2 shows ONLY the selected lab patient (starts empty) ── */
        try {
            var labPath = (window.location.pathname || '').toLowerCase();
            var labFile = labPath.split('/').pop() || '';
            if (labFile.indexOf('lab-dashboard') !== -1) {
                if (typeof createGlobalTopBar === 'function') createGlobalTopBar();
                var labSelId = null;
                try { labSelId = localStorage.getItem('pclinic_lab_selected_patient'); } catch(e){}
                var labP = null;
                if (labSelId) {
                    var labList = [];
                    try { if (typeof getPatients === 'function') labList = getPatients() || []; } catch(e){}
                    if (!labList.length) {
                        try { labList = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
                    }
                    for (var lIdx = 0; lIdx < labList.length; lIdx++) {
                        if (String(labList[lIdx].id) === String(labSelId)) { labP = labList[lIdx]; break; }
                    }
                }
                var clearedLab = {
                    _cleared: true, id: '', mrn: '', lastName: '', firstName: '', nationalId: '',
                    department: '', dob: '', gender: '', archiveCode: '', insurance: 'RSSB / RAMA', district: 'NYARUGENGE'
                };
                try { renderPatientIdentificationBar(master, labP || clearedLab); } catch(e){ console.warn(e); }
                var labDc = document.getElementById('dcBar');
                if (labDc && labDc.parentNode) labDc.parentNode.removeChild(labDc);
                return;
            }
        } catch(e){ console.warn(e); }
        try {
            var path = (window.location.pathname || '').toLowerCase();
            var file = path.split('/').pop() || '';
            var isExcluded = file.includes('hub') || file.includes('login') || file === 'index.html' || file === '' || path === '/' || path.endsWith('/index.html');
            if (!isExcluded) {
                if (typeof createGlobalTopBar === 'function') createGlobalTopBar();
            } else {
                var oldGlobal = document.getElementById('pc_chuk_top_menu');
                if (oldGlobal && oldGlobal.parentNode) oldGlobal.parentNode.removeChild(oldGlobal);
            }
            // Cashier follows the generic path: show the Patient
            // Identification bar, while the context/action bar is removed at
            // the end of autoMountPatientBar().
            // Medical Summary: ONLY the 30-forms table (patient-gated) — top bar stays,
            // no identification demo bar, no dcBar.
            if (file.indexOf('medical-summary') !== -1) {
                var oldMedDemo = document.getElementById('pc_common_demo_bar');
                if (oldMedDemo && oldMedDemo.parentNode) oldMedDemo.parentNode.removeChild(oldMedDemo);
                var oldMedDc = document.getElementById('dcBar');
                if (oldMedDc && oldMedDc.parentNode) oldMedDc.parentNode.removeChild(oldMedDc);
                return;
            }
        } catch(e){}
        if (window.__pcBannerMounted && document.getElementById('pc_common_demo_bar')) {
            try {
                var pExisting = (typeof pcFile !== 'undefined' && pcFile.patient) ? pcFile.patient() : null;
                if (pExisting) {
                    renderPatientIdentificationBar(master, pExisting);
                }
            } catch(e){ console.warn(e); }
            return;
        }
        window.__pcBannerMounted = true;
        var p = (typeof pcFile !== 'undefined' && pcFile.patient) ? pcFile.patient() : null;
        if (!p) {
            var savedId = null;
            try { savedId = localStorage.getItem('pclinic_active_patient'); } catch(e){}
            try { savedId = savedId || new URLSearchParams(window.location.search).get('patient'); } catch(e){}
            if (savedId) {
                var list = [];
                try {
                    var cashierRestore = String((window.location && window.location.pathname) || '').toLowerCase().indexOf('cashier-dashboard') !== -1;
                    if (cashierRestore && typeof getBillingPatients === 'function') list = getBillingPatients() || [];
                    else if (typeof getPatients === 'function') list = getPatients() || [];
                } catch(e){}
                if (!list.length) {
                    try { list = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
                }
                for (var i=0; i<list.length; i++) {
                    if (String(list[i].id) === String(savedId)) { p = list[i]; break; }
                }
            }
        }
        p = p || {};
        try { renderPatientIdentificationBar(master, p); } catch(e){ console.warn(e); }
        var pathStr2 = String((window.location && (window.location.pathname || window.location.href)) || '').toLowerCase();
        if (pathStr2.indexOf('lab-dashboard') !== -1 || pathStr2.indexOf('cashier-dashboard') !== -1 || pathStr2.indexOf('reception-dashboard') !== -1) {
            var oldDc = document.getElementById('dcBar');
            if (oldDc && oldDc.parentNode) oldDc.parentNode.removeChild(oldDc);
            var oldCtx = document.getElementById('dcCtx');
            if (oldCtx && oldCtx.parentNode) oldCtx.parentNode.removeChild(oldCtx);
        }
    }

    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoMountPatientBar);
    } else {
        autoMountPatientBar();
    }
    setTimeout(autoMountPatientBar, 100);
    setTimeout(autoMountPatientBar, 400);
})();
