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
        files = files || [];
        host.innerHTML =
            '<div class="pcf-drop" id="atDrop">' +
                '<i class="ti ti-cloud-upload"></i>' +
                '<b>Add a file</b>' +
                '<span>PDF, photo or video · max 2 MB each</span>' +
            '</div>' +
            '<input type="file" id="atInput" multiple hidden ' +
                'accept=".pdf,image/*,video/*">' +
            '<div class="pcf-files" id="atList"></div>';

        function paint() {
            $('#atList', host).innerHTML = files.map(function (f, i) {
                var ic = f.type && f.type.indexOf('pdf') !== -1 ? 'ti-file-type-pdf'
                       : f.type && f.type.indexOf('video') !== -1 ? 'ti-video' : 'ti-photo';
                return '<div class="pcf-file"><i class="ti ' + ic + '"></i>' +
                    '<span class="nm">' + esc(f.name) + '</span>' +
                    '<span class="sz">' + (f.size / 1024).toFixed(0) + ' KB</span>' +
                    (f.data ? '<button data-v="' + i + '" title="Open">👁</button>' : '') +
                    '<button data-i="' + i + '" title="Remove">&times;</button></div>';
            }).join('');
            $('#atList', host).querySelectorAll('button[data-i]').forEach(function (b) {
                b.onclick = function () { files.splice(+b.dataset.i, 1); paint(); onChange(files); };
            });
            $('#atList', host).querySelectorAll('button[data-v]').forEach(function (b) {
                b.onclick = function () {
                    var f = files[+b.dataset.v];
                    var w = window.open('');
                    if (!w) return;
                    if (f.type.indexOf('pdf') !== -1) w.document.write('<iframe src="' + f.data + '" style="width:100%;height:100vh;border:0"></iframe>');
                    else if (f.type.indexOf('video') !== -1) w.document.write('<video src="' + f.data + '" controls style="max-width:100%"></video>');
                    else w.document.write('<img src="' + f.data + '" style="max-width:100%">');
                };
            });
            onChange(files);
        }

        function take(list) {
            [].slice.call(list).forEach(function (file) {
                if (file.size > MAX) {
                    if (window.pcToast) pcToast(file.name + ' is too large (max 2 MB)', 'error');
                    return;
                }
                var r = new FileReader();
                r.onload = function (e) {
                    files.push({ name: file.name, type: file.type, size: file.size,
                                 data: e.target.result, at: new Date().toISOString(),
                                 by: staff().name || '' });
                    paint();
                };
                r.readAsDataURL(file);
            });
        }

        $('#atDrop', host).onclick = function () { $('#atInput', host).click(); };
        $('#atInput', host).onchange = function () { take(this.files); this.value = ''; };
        ['dragenter','dragover'].forEach(function (ev) {
            $('#atDrop', host).addEventListener(ev, function (e) {
                e.preventDefault(); this.classList.add('over'); });
        });
        ['dragleave','drop'].forEach(function (ev) {
            $('#atDrop', host).addEventListener(ev, function (e) {
                e.preventDefault(); this.classList.remove('over');
                if (ev === 'drop' && e.dataTransfer) take(e.dataTransfer.files); });
        });
        paint();
        return { get: function () { return files; } };
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
    function saveFile(rec) {
        var all = read(DOCS_KEY, []);
        rec.id = rec.id || uid(rec.type || 'file');
        rec.at = rec.at || new Date().toISOString();
        rec.by = rec.by || staff().name || '';
        rec.byId = rec.byId || staff().staffId || '';
        all.unshift(rec);
        write(DOCS_KEY, all.slice(0, 400));
        try {
            if (window.firebaseDB && window.firebaseFunctions) {
                var f = window.firebaseFunctions;
                f.setDoc(f.doc(window.firebaseDB, 'patients/' + rec.patientId + '/files', rec.id), rec)
                 .catch(function () {});
            }
        } catch (e) {}
        window.dispatchEvent(new CustomEvent('pcFilesUpdated', { detail: rec }));
        return rec;
    }
    function listFiles(patientId, type) {
        return read(DOCS_KEY, []).filter(function (f) {
            if (String(f.patientId) !== String(patientId)) return false;
            return !type || f.type === type;
        });
    }

    /* ══════════ ACTION BAR ON FILE PAGES ══════════
       Every file page was a dead end — you had to go Back to order
       anything. This puts the same actions on the page itself.      */
    function actionBar() {
        if ($('#pcFileBar')) return;
        var p = patient();
        var bar = document.createElement('div');
        bar.id = 'pcFileBar';
        bar.className = 'noprint';
        var A = [
            ['lab-request.html',      'Lab Request',     'ti-test-pipe',   '#0071e3', '#eaf2ff'],
            ['imaging-request.html',  'Imaging',         'ti-radioactive', '#7a4500', '#fff4e0'],
            ['prescription.html',     'Prescription',    'ti-pill',        '#1a7a32', '#e9f9ee'],
            ['opd-file.html',         'OPD File',        'ti-folder-open', '#5c2475', '#f5eaff'],
            ['clinical-note.html',    'Clinical Note',   'ti-notes',       '#5c2475', '#f5eaff'],
            ['ward-round.html',       'Ward Round',      'ti-bed',         '#1a7a32', '#e9f9ee'],
            ['billing.html',          'Bill',            'ti-receipt',     '#8a1f1a', '#ffebe9'],
            ['messages.html',         'Messages',        'ti-mail',        '#8a1f1a', '#ffebe9']
        ];
        var here = location.pathname.split('/').pop();
        bar.innerHTML = A.map(function (a) {
            var on = a[0] === here;
            return '<a href="' + a[0] + (p ? '?patient=' + p.id : '') + '" class="fb-btn' +
                   (on ? ' cur' : '') + '" style="--c:' + a[3] + ';--b:' + a[4] + '" title="' + a[1] + '">' +
                   '<i class="ti ' + a[2] + '"></i><span>' + a[1] + '</span></a>';
        }).join('') +
        '<span style="flex:1"></span>' +
        '<a href="doctor-dashboard.html" class="fb-btn" style="--c:#3a3a3c;--b:#fff">' +
        '<i class="ti ti-layout-dashboard"></i><span>Dashboard</span></a>';

        var css = document.createElement('style');
        css.textContent = `
        #pcFileBar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 18px;
            background:var(--glass-bg);-webkit-backdrop-filter:var(--glass-blur);
            backdrop-filter:var(--glass-blur);border-bottom:.5px solid var(--glass-brd);
            position:sticky;top:0;z-index:70}
        .fb-btn{display:inline-flex;align-items:center;gap:6px;height:31px;padding:0 11px;border-radius:9px;
            border:.5px solid rgba(0,0,0,.07);background:var(--b);color:var(--c);text-decoration:none;
            font-size:11.5px;font-weight:600;white-space:nowrap;
            box-shadow:0 1px 2px rgba(0,0,0,.05),inset 0 1px 0 rgba(255,255,255,.7);
            transition:transform .26s cubic-bezier(.34,1.56,.64,1),box-shadow .26s}
        .fb-btn:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 4px 12px rgba(0,0,0,.14)}
        .fb-btn:active{transform:scale(.94)}
        .fb-btn.cur{outline:2px solid currentColor;outline-offset:-2px}
        .fb-btn i{font-size:14px}
        @media(max-width:1000px){.fb-btn span{display:none}.fb-btn{padding:0 9px}}
        @media print{#pcFileBar{display:none!important}}`;
        document.head.appendChild(css);

        var host = $('#pcHandoff') || $('.pc-headerbar') || $('.pc-topbar');
        if (host && host.parentNode) host.parentNode.insertBefore(bar, host.nextSibling);
        else document.body.insertBefore(bar, document.body.firstChild);
    }

    /* ══════════ EXPORTS ══════════ */
    window.pcFile = {
        patient: patient, nameOf: nameOf, age: age, esc: esc, uid: uid, staff: staff,
        allDx: allDx, addDx: addDx, dxPicker: dxPicker,
        attachments: attachments, saveRdv: saveRdv,
        save: saveFile, list: listFiles,
        actionBar: actionBar,
        read: read, write: write
    };

    function boot() { actionBar(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    console.log('📁 PClinic file engine ready');
})();
