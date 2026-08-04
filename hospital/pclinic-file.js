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
        var idx = all.findIndex(function(x) { return String(x.id) === String(rec.id); });
        if (idx !== -1) {
            all[idx] = rec;
        } else {
            all.unshift(rec);
        }
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
        bar.innerHTML =
        '<button type="button" onclick="if(window.pcVitals) window.pcVitals.open();" class="fb-btn" style="--c:#e11d48;--b:#ffe4e6;cursor:pointer;border:none;" title="Open Vital Signs"><i class="ti ti-heart-rate-monitor"></i><span>Vital Signs</span></button>' +
        A.map(function (a) {
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

    /* ══════════ OPENCLINIC GA COMPLETE PATIENT IDENTIFICATION BAR & WARD REGISTRY ══════════ */
    function renderPatientIdentificationBar(targetEl, p) {
        var el = targetEl;
        if (!el) return;
        p = p || {};
        var barId = 'pc_common_demo_bar';
        var old = document.getElementById(barId);
        if (old && old.parentNode) old.parentNode.removeChild(old);

        // Clear any existing duplicate banner or department
        if (el.classList && (el.classList.contains('oc-demo-bar') || el.id === 'dcCtx')) {
            el.innerHTML = '';
        }

        var isCleared = !!p._cleared;
        var name = isCleared ? '' : ((p.lastName || 'TEKEREZA').toUpperCase());
        var first = isCleared ? '' : ((p.firstName || 'GASPARD').toUpperCase());
        var natId = isCleared ? '' : (p.nationalId || '1 1986 8 0064652 0 14');
        var mrn = isCleared ? '' : (p.mrn || p.id || '655055');
        var dobStr = isCleared ? '' : (p.dob ? new Date(p.dob).toLocaleDateString('en-GB') : '07/01/1986');
        var ageStr = isCleared ? '' : (p.dob ? (new Date().getFullYear() - new Date(p.dob).getFullYear()) + ' years' : '40 years 7 months');
        var sex = isCleared ? '' : (p.gender || 'Male');
        var dept = isCleared ? '' : ((p.department || 'SURGERY WARD 7').toUpperCase());
        var arch = isCleared ? '' : (p.archiveCode || 'ARCH-2026-655');
        var pid = isCleared ? '' : (p.id || '655055');
        var ins = isCleared ? 'RSSB / RAMA' : (p.insurance || 'RSSB / RAMA');

        var div = document.createElement('div');
        div.id = barId;
        div.className = 'oc-demo-bar noprint';
        div.innerHTML =
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
                '<div class="demo-row"><span class="demo-lbl">Family name</span><input type="text" class="demo-input" id="ocSearchFamily" placeholder="e.g. NSHUTI..." value="' + esc(name) + '" /></div>' +
                '<div class="demo-row"><span class="demo-lbl">Nat ID/PP</span><input type="text" class="demo-input" id="ocSearchNatId" placeholder="e.g. 1 1986..." value="' + esc(natId) + '" /></div>' +
                '<div class="demo-row">' +
                    '<span class="demo-lbl">Department</span>' +
                    '<div style="display:flex;gap:4px;width:68%;align-items:center;">' +
                        '<button type="button" class="demo-btn" onclick="pcFile.openWardPicker()" title="Browse Patients by Ward / Department" style="padding:5px 10px;font-size:11px;white-space:nowrap;">🏥 Ward</button>' +
                        '<input type="text" class="demo-input readonly" id="ocDepartment" readonly value="' + esc(dept) + '" style="width:100%;" placeholder="Department..." />' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
                '<div class="demo-row"><span class="demo-lbl">Firstname</span><input type="text" class="demo-input" id="ocSearchFirst" placeholder="e.g. DJUMA..." value="' + esc(first) + '" /></div>' +
                '<div class="demo-row"><span class="demo-lbl">Record number</span><input type="text" class="demo-input" id="ocSearchMrn" placeholder="e.g. MRN 1003..." value="' + esc(mrn) + '" /></div>' +
                '<div class="demo-row" style="justify-content:flex-start;padding-top:4px;">' +
                    '<span class="demo-status-pills">' +
                        '<span title="Insurance Status">🟢 ' + esc(ins) + '</span>' +
                        '<span title="Ward Department">🏥 ' + esc(dept) + '</span>' +
                        '<span title="Demographics">👤 ' + esc(sex ? (sex.charAt(0).toUpperCase() + ' · ' + ageStr) : '-') + '</span>' +
                    '</span>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
                '<div class="demo-row"><span class="demo-lbl">Date of birth</span><input type="text" class="demo-input readonly" readonly value="' + esc(dobStr) + '" style="width:55%;" placeholder="DD/MM/YYYY" /><span style="font-size:11px;font-weight:700;color:#5f6368;">' + (sex ? '(' + esc(sex) + ' - ' + esc(ageStr) + ')' : '') + '</span></div>' +
                '<div class="demo-row"><span class="demo-lbl">Archive code</span><input type="text" class="demo-input readonly" id="ocArchiveCode" readonly value="' + esc(arch) + '" placeholder="Archive..." /></div>' +
                '<div class="demo-row"><span class="demo-lbl">Insurance/RSSB</span>' +
                    '<select class="demo-input" id="ocInsurance">' +
                        '<option value="RSSB / RAMA"' + (ins === 'RSSB / RAMA' ? ' selected' : '') + '>RSSB / RAMA</option>' +
                        '<option value="MUTUELLE DE SANTE"' + (ins === 'MUTUELLE DE SANTE' ? ' selected' : '') + '>MUTUELLE DE SANTE</option>' +
                        '<option value="MMI"' + (ins === 'MMI' ? ' selected' : '') + '>MMI</option>' +
                        '<option value="RADIANT"' + (ins === 'RADIANT' ? ' selected' : '') + '>RADIANT</option>' +
                        '<option value="PRIVATE / CASH"' + (ins === 'PRIVATE / CASH' ? ' selected' : '') + '>PRIVATE / CASH</option>' +
                    '</select></div>' +
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
                '<div class="demo-row"><span class="demo-lbl">Person ID</span><input type="text" class="demo-input" id="ocSearchId" placeholder="e.g. 1003..." value="' + esc(pid) + '" /></div>' +
                '<div class="demo-btn-group">' +
                    '<button type="button" class="demo-btn" onclick="pcFile.searchPatientRegistry()">Find</button>' +
                    '<button type="button" class="demo-btn clear-btn" onclick="pcFile.clearPatientBar()">Clear</button>' +
                '</div>' +
            '</div>';

        if (el.firstChild) {
            el.insertBefore(div, el.firstChild);
        } else {
            el.appendChild(div);
        }

        // 🌟 SMART iOS 18 + PIXEL 9 PRO FEATURE: Pressing ENTER inside any input field instantly triggers search! 🌟
        ['ocSearchFamily', 'ocSearchFirst', 'ocSearchNatId', 'ocSearchMrn', 'ocSearchId'].forEach(function(id) {
            var inputEl = document.getElementById(id);
            if (inputEl) {
                inputEl.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        pcFile.searchPatientRegistry();
                    }
                });
            }
        });
    }
/* ══════════ EXPORTS ══════════ */
    window.pcFile = {
        patient: patient, nameOf: nameOf, age: age, esc: esc, uid: uid, staff: staff,
        allDx: allDx, addDx: addDx, dxPicker: dxPicker,
        attachments: attachments, saveRdv: saveRdv,
        save: saveFile, list: listFiles,
        actionBar: actionBar, sheet: sheet, print: printDoc,
        renderDemoBar: renderPatientIdentificationBar,
        searchFromDemoBar: searchPatientRegistry,
        openWardPicker: openWardPicker,
        clearPatientBar: clearPatientBar,
        read: read, write: write
    };

    function boot() { actionBar(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    console.log('📁 PClinic file engine ready');
})();
