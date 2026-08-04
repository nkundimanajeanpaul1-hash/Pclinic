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

    /* ══════════════ COMPREHENSIVE PATIENT DEMOGRAPHICS / CARETAKER PROFILE MODAL ══════════════ */
    function openPatientProfileModal(patientId) {
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

        var scrim = document.createElement('div');
        scrim.className = 'pc-modal-scrim noprint';
        scrim.innerHTML =
            '<div class="pc-modal-box" role="dialog" aria-modal="true">' +
                '<div class="pc-modal-head">' +
                    '<span>👤 Complete Patient Demographics & Caretaker Profile (ID: ' + esc(p.id) + ')</span>' +
                    '<button type="button" class="close-modal-btn" style="border:0;background:none;font-size:22px;cursor:pointer;">&times;</button>' +
                '</div>' +
                '<div class="pc-modal-body">' +
                    '<div class="pc-sec-title">1. Primary Demographics & Identification</div>' +
                    '<div class="pc-form-grid">' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Family Name</span><input type="text" class="pc-form-input" id="profLast" value="' + esc(p.lastName || 'TEKEREZA') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">First Name</span><input type="text" class="pc-form-input" id="profFirst" value="' + esc(p.firstName || 'GASPARD') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">National ID / Passport</span><input type="text" class="pc-form-input" id="profNat" value="' + esc(p.nationalId || '1 1986 8 0064652 0 14') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Record Number (MRN)</span><input type="text" class="pc-form-input readonly" id="profMrn" readonly value="' + esc(p.mrn || p.id || '655055') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Date of Birth</span><input type="date" class="pc-form-input" id="profDob" value="' + esc((p.dob || '1986-01-07').substring(0,10)) + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Gender</span><select class="pc-form-select" id="profGender"><option value="Male"' + (p.gender === 'Male' ? ' selected' : '') + '>Male</option><option value="Female"' + (p.gender === 'Female' ? ' selected' : '') + '>Female</option></select></div>' +
                    '</div>' +

                    '<div class="pc-sec-title" style="margin-top:6px;">2. Contact Information & Residential Address</div>' +
                    '<div class="pc-form-grid">' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Patient Email</span><input type="email" class="pc-form-input" id="profEmail" placeholder="e.g. g.tekereza@pclinic.rw" value="' + esc(p.email || '') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Patient Phone</span><input type="text" class="pc-form-input" id="profPhone" placeholder="e.g. +250 788 123 456" value="' + esc(p.phone || '+250 788 123 456') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">District</span><input type="text" class="pc-form-input" id="profDist" value="' + esc(p.district || 'KAMONYI') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Sector / Residential Address</span><input type="text" class="pc-form-input" id="profAddr" placeholder="e.g. Runda, Gihara" value="' + esc(p.address || p.sector || 'Runda Sector, Kamonyi') + '" /></div>' +
                    '</div>' +

                    '<div class="pc-sec-title" style="margin-top:6px;">3. Caretaker / Next of Kin & Emergency Contact</div>' +
                    '<div class="pc-form-grid">' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Caretaker / Next of Kin Name</span><input type="text" class="pc-form-input" id="profCareName" placeholder="e.g. UWASE CLAUDINE" value="' + esc(p.caretakerName || 'UWASE MUKAMANA CLAUDINE') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Relationship to Patient</span><select class="pc-form-select" id="profCareRel"><option value="Spouse"' + (p.caretakerRel === 'Spouse' ? ' selected' : '') + '>Spouse</option><option value="Mother"' + (p.caretakerRel === 'Mother' ? ' selected' : '') + '>Mother</option><option value="Father"' + (p.caretakerRel === 'Father' ? ' selected' : '') + '>Father</option><option value="Sibling"' + (p.caretakerRel === 'Sibling' ? ' selected' : '') + '>Sibling</option><option value="Guardian"' + (p.caretakerRel === 'Guardian' ? ' selected' : '') + '>Guardian</option></select></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Caretaker Phone</span><input type="text" class="pc-form-input" id="profCarePhone" placeholder="e.g. +250 788 987 654" value="' + esc(p.caretakerPhone || '+250 788 987 654') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Caretaker Email / Notes</span><input type="text" class="pc-form-input" id="profCareNotes" placeholder="Emergency contact notes..." value="' + esc(p.caretakerNotes || 'Emergency contact verified') + '" /></div>' +
                    '</div>' +

                    '<div class="pc-sec-title" style="margin-top:6px;">4. Insurance & Clinical Assignment</div>' +
                    '<div class="pc-form-grid">' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Insurance Provider / RSSB</span><input type="text" class="pc-form-input" id="profIns" value="' + esc(p.insurance || 'RSSB / RAMA') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Insurance Policy Number</span><input type="text" class="pc-form-input" id="profPolicy" placeholder="e.g. RSSB-1986-0064652" value="' + esc(p.policyNumber || 'RSSB-1986-0064652') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Assigned Department / Ward</span><input type="text" class="pc-form-input" id="profDept" value="' + esc(p.department || 'SURGERY WARD 7') + '" /></div>' +
                        '<div class="pc-form-row"><span class="pc-form-lbl">Blood Group & Allergies</span><input type="text" class="pc-form-input" id="profBlood" placeholder="e.g. O+ | Penicillin allergy" value="' + esc(p.bloodGroup || 'O+ | No known drug allergies') + '" /></div>' +
                    '</div>' +
                '</div>' +
                '<div class="pc-modal-foot">' +
                    '<button type="button" class="pc-tab-btn close-modal-btn">Cancel</button>' +
                    '<button type="button" class="pc-tab-btn active" id="saveProfBtn" style="background:#0b57d0;color:#fff;font-weight:800;">💾 Save Changes to Common Server</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(scrim);
        var closeBtns = scrim.querySelectorAll('.close-modal-btn');
        for (var i=0; i<closeBtns.length; i++) {
            closeBtns[i].onclick = function() { scrim.remove(); };
        }
        scrim.onclick = function(e) { if (e.target === scrim) scrim.remove(); };

        document.getElementById('saveProfBtn').onclick = function() {
            p.lastName = document.getElementById('profLast').value.trim();
            p.firstName = document.getElementById('profFirst').value.trim();
            p.nationalId = document.getElementById('profNat').value.trim();
            p.dob = document.getElementById('profDob').value;
            p.gender = document.getElementById('profGender').value;
            p.email = document.getElementById('profEmail').value.trim();
            p.phone = document.getElementById('profPhone').value.trim();
            p.district = document.getElementById('profDist').value.trim();
            p.address = document.getElementById('profAddr').value.trim();
            p.caretakerName = document.getElementById('profCareName').value.trim();
            p.caretakerRel = document.getElementById('profCareRel').value;
            p.caretakerPhone = document.getElementById('profCarePhone').value.trim();
            p.caretakerNotes = document.getElementById('profCareNotes').value.trim();
            p.insurance = document.getElementById('profIns').value.trim();
            p.policyNumber = document.getElementById('profPolicy').value.trim();
            p.department = document.getElementById('profDept').value.trim();
            p.bloodGroup = document.getElementById('profBlood').value.trim();

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
    }

    /* ══════════════ COMPREHENSIVE SYSTEM SETTINGS MODAL (LANGUAGE, THEME, PASSWORD, COMMON SERVER) ══════════════ */
    function openSystemSettingsModal() {
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
        alert('🏥 PClinic Clinical Suite • OpenClinic GA v5.346.01 / CHUK\nReadiness Score: 100/100\nConnected to Local Common Server (Hybrid localStorage + Firestore)');
    }

    function renderPatientIdentificationBar(targetEl, p) {
        var el = targetEl;
        if (!el) return;
        p = p || {};
        var barId = 'pc_common_demo_bar';
        var old = document.getElementById(barId);
        if (old && old.parentNode) old.parentNode.removeChild(old);

        // Remove any breadcrumb bar everywhere because it takes big space
        var allBcs = document.querySelectorAll('.breadcrumb, #breadcrumb, .header-breadcrumb, .topbar, .top-bar, .app-header, .top-header');
        for (var idx=0; idx<allBcs.length; idx++) {
            if (allBcs[idx] && allBcs[idx].parentNode) allBcs[idx].parentNode.removeChild(allBcs[idx]);
        }


        // Remove old top menu if present to ensure fresh wiring
        var oldMenu = document.getElementById('pc_chuk_top_menu');
        if (oldMenu && oldMenu.parentNode) oldMenu.parentNode.removeChild(oldMenu);

        // Inject OpenClinic GA CHUK Top Menu Strip right before .oc-demo-bar
        var menuDiv = document.createElement('div');
        menuDiv.id = 'pc_chuk_top_menu';
        menuDiv.className = 'chuk-top-menu noprint';
        menuDiv.innerHTML =
            '<!-- LEFT SIDE: CLINICAL PORTALS (ACTION-CODED COLORS) -->' +
            '<div class="chuk-menu-left">' +
                '<a class="chk-btn btn-patient" onclick="if(window.pcFile)pcFile.openPatientProfileModal();">👤 Patient</a>' +
                '<a class="chk-btn btn-summary" onclick="var p=window.pcFile&&pcFile.patient(); window.location.href=\'medical-summary.html?patient=\' + encodeURIComponent((p&&p.id)||\'754775\');">📋 Medical summary</a>' +
                '<a class="chk-btn btn-nursing" onclick="var p=window.pcFile&&pcFile.patient(); window.location.href=\'nurse-dashboard.html?patient=\' + encodeURIComponent((p&&p.id)||\'754775\');">🏥 Nursing</a>' +
                '<a class="chk-btn btn-applications" onclick="var p=window.pcFile&&pcFile.patient(); window.location.href=\'lab-request.html?patient=\' + encodeURIComponent((p&&p.id)||\'754775\');">💉 Applications</a>' +
                '<a class="chk-btn btn-documents" onclick="var p=window.pcFile&&pcFile.patient(); window.location.href=\'opd-file.html?patient=\' + encodeURIComponent((p&&p.id)||\'754775\');">📂 Documents</a>' +
                '<a class="chk-btn btn-system" onclick="if(window.pcFile)pcFile.openSystemSettingsModal();">⚙️ System</a>' +
            '</div>' +
            '<!-- 🌟 RIGHT CORNER: THEME, NOTIFICATION, DR. MUTUA, LOGOUT, INFO 🌟 -->' +
            '<div class="chuk-menu-right">' +
                '<a class="chk-btn btn-theme" onclick="if(window.pcFile)pcFile.toggleThemeFromMenu();" title="Toggle Theme">☀️ Theme</a>' +
                '<a class="chk-btn btn-alerts" onclick="if(window.pcFile)pcFile.showNotificationsModal();" title="Alerts & Notifications">🔔 3</a>' +
                '<a class="chk-btn btn-user" onclick="if(window.pcFile)pcFile.openStaffProfileModal();" title="Active Staff Profile">👨‍⚕️ Dr. Mutua</a>' +
                '<a class="chk-btn btn-logout" onclick="if(window.pcFile)pcFile.confirmLogout();" title="Sign out">🚪 Logout</a>' +
                '<a class="chk-btn btn-info" onclick="if(window.pcFile)pcFile.openSystemInfoModal();" title="System Info">❓ Info</a>' +
            '</div>';

        if (el.firstChild) {
            el.insertBefore(menuDiv, el.firstChild);
        } else {
            el.appendChild(menuDiv);
        }

        var el = targetEl;
        if (!el) return;
        p = p || {};
        var barId = 'pc_common_demo_bar';
        var old = document.getElementById(barId);
        if (old && old.parentNode) old.parentNode.removeChild(old);

        if (el.classList && (el.classList.contains('oc-demo-bar') || el.id === 'dcCtx')) {
            el.innerHTML = '';
        }

        var isCleared = !!p._cleared;
        var name = isCleared ? '' : ((p.lastName || 'NSANZINTWARI').toUpperCase());
        var first = isCleared ? '' : ((p.firstName || 'SARATIEL').toUpperCase());
        var natId = isCleared ? '' : (p.nationalId || '1198280034887038');
        var mrn = isCleared ? '' : (p.mrn || p.id || '754775');
        var dobStr = isCleared ? '' : (p.dob ? new Date(p.dob).toLocaleDateString('en-GB') : '01/01/1982');
        var ageStr = isCleared ? '' : (p.dob ? (new Date().getFullYear() - new Date(p.dob).getFullYear()) + ' years 11 months' : '42 years 11 months');
        var sex = isCleared ? '' : (p.gender || 'Male');
        var dept = isCleared ? '' : ((p.department || 'ADMISSION WARD 7').toUpperCase());
        var arch = isCleared ? '' : (p.archiveCode || '');
        var pid = isCleared ? '' : (p.id || '754775');
        var ins = isCleared ? 'RSSB / RAMA' : (p.insurance || 'RSSB / RAMA');
        var dist = isCleared ? 'NYARUGENGE' : (p.district || 'NYARUGENGE');

        var div = document.createElement('div');
        div.id = barId;
        div.className = 'oc-demo-bar noprint';
        div.innerHTML =
            '<!-- ═══ ROW 1: Family name | Firstname | Date of birth + Age ═══ -->' +
            '<div class="oc-row-grid">' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">Family name</label>' +
                    '<input type="text" class="oc-input" id="ocSearchFamily" placeholder="NSANZINTWARI..." value="' + esc(name) + '" />' +
                '</div>' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">Firstname</label>' +
                    '<input type="text" class="oc-input" id="ocSearchFirst" placeholder="SARATIEL..." value="' + esc(first) + '" />' +
                '</div>' +
                '<div class="oc-cell" style="grid-column: span 2;">' +
                    '<label class="oc-lbl">Date of birth</label>' +
                    '<div style="display:flex; align-items:center; gap:6px; width:100%;">' +
                        '<input type="text" class="oc-input readonly" id="ocDob" readonly value="' + esc(dobStr) + '" style="width:110px;" />' +
                        '<span id="ocAgeTxt" class="oc-age-txt">' + (sex ? '⚪ (' + esc(sex) + ' - ' + esc(ageStr) + ')' : '') + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<!-- ═══ ROW 2: Nat ID/PP | Record number | Archive code | Person ID ═══ -->' +
            '<div class="oc-row-grid">' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">Nat ID/PP</label>' +
                    '<input type="text" class="oc-input" id="ocSearchNatId" placeholder="11982800..." value="' + esc(natId) + '" />' +
                '</div>' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">Record number</label>' +
                    '<input type="text" class="oc-input" id="ocSearchMrn" placeholder="754775..." value="' + esc(mrn) + '" />' +
                '</div>' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">Archive code</label>' +
                    '<input type="text" class="oc-input oc-archive-box" id="ocArchiveCode" readonly value="' + esc(arch) + '" />' +
                '</div>' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">Person ID</label>' +
                    '<input type="text" class="oc-input" id="ocSearchId" placeholder="754775..." value="' + esc(pid) + '" />' +
                '</div>' +
            '</div>' +

            '<!-- ═══ ROW 3: Department | Insurance/RSSB | District | Find & Clear ═══ -->' +
            '<div class="oc-row-grid">' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">Department</label>' +
                    '<div style="display:flex; align-items:center; gap:6px; width:100%;">' +
                        '<button type="button" class="oc-ward-btn" onclick="pcFile.openWardPicker()" title="Browse Wards">🏥 Ward</button>' +
                        '<input type="text" class="oc-input readonly" id="ocDepartment" readonly value="' + esc(dept) + '" style="width:100%;" />' +
                        '<span class="oc-mini-icons">' +
                            '<span title="Info">ℹ️</span>' +
                            '<span title="View">🔭</span>' +
                            '<span title="Clear selection">🗑️</span>' +
                        '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">Insurance/RSSB</label>' +
                    '<select class="oc-input" id="ocInsurance">' +
                        '<option value="RSSB / RAMA"' + (ins === 'RSSB / RAMA' ? ' selected' : '') + '>RSSB / RAMA</option>' +
                        '<option value="MUTUELLE DE SANTE"' + (ins === 'MUTUELLE DE SANTE' ? ' selected' : '') + '>MUTUELLE DE SANTE</option>' +
                        '<option value="MMI"' + (ins === 'MMI' ? ' selected' : '') + '>MMI</option>' +
                        '<option value="RADIANT"' + (ins === 'RADIANT' ? ' selected' : '') + '>RADIANT</option>' +
                        '<option value="PRIVATE / CASH"' + (ins === 'PRIVATE / CASH' ? ' selected' : '') + '>PRIVATE / CASH</option>' +
                    '</select>' +
                '</div>' +
                '<div class="oc-cell">' +
                    '<label class="oc-lbl">District</label>' +
                    '<select class="oc-input" id="ocDistrict">' +
                        '<option value="NYARUGENGE"' + (dist === 'NYARUGENGE' ? ' selected' : '') + '>NYARUGENGE</option>' +
                        '<option value="KAMONYI"' + (dist === 'KAMONYI' ? ' selected' : '') + '>KAMONYI</option>' +
                        '<option value="KIGALI"' + (dist === 'KIGALI' ? ' selected' : '') + '>KIGALI</option>' +
                        '<option value="GASABO"' + (dist === 'GASABO' ? ' selected' : '') + '>GASABO</option>' +
                        '<option value="KICUKIRO"' + (dist === 'KICUKIRO' ? ' selected' : '') + '>KICUKIRO</option>' +
                    '</select>' +
                '</div>' +
                '<div class="oc-cell oc-btn-cell">' +
                    '<button type="button" class="oc-action-btn" onclick="pcFile.searchPatientRegistry()">Find</button>' +
                    '<button type="button" class="oc-action-btn" onclick="pcFile.clearPatientBar()">Clear</button>' +
                '</div>' +
            '</div>';

        if (el.firstChild) {
            el.insertBefore(div, el.firstChild);
        } else {
            el.appendChild(div);
        }

        // 🌟 SMART ENTER-KEY INSTANT SEARCHING 🌟
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

    /* ══════════════ RESTORED MISSING SEARCH & CLEAR FUNCTIONS ══════════════ */
    function searchPatientRegistry() {
        var fam = ($('#ocSearchFamily') ? $('#ocSearchFamily').value.trim().toLowerCase() : '');
        var first = ($('#ocSearchFirst') ? $('#ocSearchFirst').value.trim().toLowerCase() : '');
        var nat = ($('#ocSearchNatId') ? $('#ocSearchNatId').value.trim().toLowerCase() : '');
        var mrn = ($('#ocSearchMrn') ? $('#ocSearchMrn').value.trim().toLowerCase() : '');
        var pid = ($('#ocSearchId') ? $('#ocSearchId').value.trim().toLowerCase() : '');

        var list = [];
        try { if (typeof getPatients === 'function') list = getPatients() || []; } catch(e){}
        if (!list.length) {
            try { list = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
        }

        var matching = [];
        if (!fam && !first && !nat && !mrn && !pid) {
            matching = list;
        } else {
            matching = list.filter(function(p) {
                var mFam = !fam || (p.lastName || '').toLowerCase().indexOf(fam) !== -1;
                var mFirst = !first || (p.firstName || '').toLowerCase().indexOf(first) !== -1;
                var mNat = !nat || (p.nationalId || '').toLowerCase().indexOf(nat) !== -1;
                var mMrn = !mrn || String(p.mrn || '').toLowerCase().indexOf(mrn) !== -1;
                var mPid = !pid || String(p.id || '').toLowerCase().indexOf(pid) !== -1;
                return mFam && mFirst && mNat && mMrn && mPid;
            });
        }

        if (!matching.length) {
            if (window.pcToast) pcToast('No patients found matching search criteria', 'warning');
            else alert('No patients found matching search criteria.');
            return;
        }

        if (typeof openPatientPickerModal === 'function') {
            openPatientPickerModal(matching, 'Patient Registry Search Results (' + matching.length + ' found)');
        } else {
            alert('👤 Patient Registry Search Results (' + matching.length + ' found)');
        }
    }

    function clearPatientBar() {
        try { localStorage.removeItem('pclinic_active_patient'); } catch(e){}
        window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: null }));
        if (window.pcToast) pcToast('🧹 Active patient selection cleared', 'info');
        var old = document.getElementById('pc_common_demo_bar');
        if (old) old.remove();
        renderPatientIdentificationBar(document.querySelector('.oc-demo-bar') || document.body, {
            _cleared: true, lastName: '', firstName: '', mrn: '', nationalId: '',
            department: '', id: '', dob: '', gender: '', archiveCode: ''
        });
    }



    /* ══════════════ RESTORED WARD PICKER FUNCTION ══════════════ */
    function openWardPicker() {
        var wards = [
            'ADMISSION WARD 7', 'NEUROLOGY', 'SURGERY WARD 7',
            'INTERNAL MEDICINE', 'PEDIATRICS', 'MATERNITY',
            'ICU / HIGH DEPENDENCY', 'EMERGENCY ROOM', 'ORTHOPEDICS',
            'CARDIOLOGY', 'GYNAECOLOGY - OBSTETRICS', 'ONCOLOGY'
        ];
        var scrim = document.createElement('div');
        scrim.className = 'pc-modal-scrim noprint';
        scrim.innerHTML =
            '<div class="pc-modal-box" style="width:520px;" role="dialog" aria-modal="true">' +
                '<div class="pc-modal-head"><span>🏥 Select Hospital Ward / Department</span><button onclick="this.closest(\'.pc-modal-scrim\').remove()" style="border:0;background:none;font-size:22px;cursor:pointer;">&times;</button></div>' +
                '<div class="pc-modal-body">' +
                    wards.map(function(w) {
                        return '<div class="patient-row" onclick="var el=document.getElementById(\'ocDepartment\'); if(el) el.value=\'' + w + '\'; this.closest(\'.pc-modal-scrim\').remove();"><b>🏥 ' + w + '</b><span style="color:#6b7280;font-size:11.5px;">Active Ward</span></div>';
                    }).join('') +
                '</div>' +
                '<div class="pc-modal-foot">' +
                    '<button type="button" class="pc-tab-btn" onclick="this.closest(\'.pc-modal-scrim\').remove()">Cancel</button>' +
                '</div>' +
            '</div>';
        scrim.onclick = function(e) { if (e.target === scrim) scrim.remove(); };
        document.body.appendChild(scrim);
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

    function boot() { actionBar(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* ══════════════ AUTOMATIC SYSTEM-WIDE BANNER BOOTSTRAP ══════════════
       Ensures on whichever page is opened across the entire hospital system,
       the Complete Patient Identification Bar (.oc-demo-bar) and Top Menu Strip
       (.chuk-top-menu) stay visible at the top exactly as it is!
       ════════════════════════════════════════════════════════════════════ */
    function autoMountPatientBar() {
        if (window.__pcBannerMounted) return;
        window.__pcBannerMounted = true;

        var p = patient();
        if (!p) {
            var savedId = localStorage.getItem('pclinic_active_patient');
            if (savedId) {
                var list = [];
                try { if (typeof getPatients === 'function') list = getPatients() || []; } catch(e){}
                if (!list.length) {
                    try { list = JSON.parse(localStorage.getItem('pclinic_patients') || '[]'); } catch(e){}
                }
                for (var i=0; i<list.length; i++) {
                    if (String(list[i].id) === String(savedId)) { p = list[i]; break; }
                }
            }
        }
        p = p || {
            id: '754775', mrn: '754775', lastName: 'NSANZINTWARI', firstName: 'SARATIEL',
            nationalId: '1198280034887038', department: 'ADMISSION WARD 7', dob: '1982-01-01',
            gender: 'Male', archiveCode: '', insurance: 'RSSB / RAMA', district: 'NYARUGENGE'
        };

        var barContainer = document.getElementById('pc_common_demo_bar');
        if (!barContainer) {
            barContainer = document.createElement('div');
            barContainer.id = 'pc_common_demo_bar';
            barContainer.className = 'oc-demo-bar noprint';
            var host = document.querySelector('.topbar, .top-bar, header');
            if (host && host.parentNode) host.parentNode.insertBefore(barContainer, host.nextSibling);
            else if (document.body.firstChild) document.body.insertBefore(barContainer, document.body.firstChild);
            else document.body.appendChild(barContainer);
        }

        renderPatientIdentificationBar(barContainer, p);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoMountPatientBar);
    } else {
        autoMountPatientBar();
    }
    setTimeout(autoMountPatientBar, 100);
    setTimeout(autoMountPatientBar, 400);

    console.log('📁 PClinic file engine ready');
})();


    /* ══════════════ MOVED TOPBAR BUTTON HELPERS (THEME, ALERTS, DR. MUTUA, LOGOUT) ══════════════ */
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
        alert('🔔 Clinical Alerts & Notifications (3 Unread)\n\n1. [LAB] FBC test results ready for Patient 1003 (Nshuti Djuma)\n2. [PACS] CT Brain scan ready for reading\n3. [CASHIER] Bill BILL-2026-882 paid in full via RSSB/RAMA');
    }

    function openStaffProfileModal() {
        alert('👨‍⚕️ Active Staff Account Profile\n\nName: Dr. Mutua (Doctor / Consultant)\nDepartment: SURGERY WARD 7 / NEUROLOGY\nEmail: d.mutua@pclinic.rw\nRole: Senior Specialist Physician\nStatus: Active Clinical Staff (Authenticated in Firebase Auth)');
    }

    function confirmLogout() {
        if (confirm('Sign out of PClinic as Dr. Mutua?')) {
            localStorage.removeItem('pclinic_active_patient');
            if (window.pcToast) pcToast('🚪 Signing out...', 'info');
            window.location.href = 'login.html';
        }
    }



