/* ============================================================
   PCLINIC — DOCTOR ACTION BAR  (v2)

   1. Split-name search — First name / Family name as separate
      boxes, so "Doe" finds the family without matching a first
      name, and either order works.
   2. Patient strip carries insurance, district and current
      location, with a location picker: choose Theatre and every
      patient there lists by date.
   3. Documents menu — medical certificate, sick leave, medical
      report, hospitalisation certificate, transfer, referral.
   4. Notes menu — OPD file, clinical, surgical, nursing, ward round.
   5. No duplicates — one Lab Request on the page, not one on the
      bar and another in the tab strip.
   ============================================================ */
(function () {
    'use strict';

    var $ = function (s, r) { return (r || document).querySelector(s); };
    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function P() { return (window.pcPatient && window.pcPatient.get()) || window.currentPatient || null; }
    function need(w) {
        var p = P();
        if (!p) { if (window.pcPatient) return window.pcPatient.require(w);
                  if (window.pcToast) pcToast('Select a patient first', 'error'); return null; }
        return p;
    }
    function go(page) {
        var p = need(); if (!p) return;
        if (window.pcPatient) return window.pcPatient.open(page);
        location.href = page + '?patient=' + encodeURIComponent(p.id);
    }
    function legacy(fn) {
        if (!need()) return;
        if (typeof window[fn] === 'function') { try { window[fn](P()); } catch (e) { window[fn](); } }
        else if (window.pcToast) pcToast('Not available here', 'info');
    }
    function tab(name) {
        if (!need()) return;
        var el = document.querySelector('[data-tab="' + name + '"]');
        if (el) el.click(); else if (window.pcToast) pcToast('Tab not found', 'info');
    }
    function media(kind) {
        if (!need()) return;
        var i = document.getElementById(kind === 'video' ? 'videoInput' : 'photoInput');
        if (i) return i.click();
        go('opd-file.html');
    }

    window.dcLab     = function () { go('lab-request.html'); };
    window.dcImaging = function () { go('imaging-request.html'); };
    window.dcRx      = function () { go('prescription.html'); };

    /* ══════════ LOCATIONS ══════════ */
    var LOCATIONS = [
        { id:'OPD',       label:'OPD',            icon:'ti-door-enter' },
        { id:'Ward',      label:'Ward',           icon:'ti-bed' },
        { id:'Theatre',   label:'Theatre',        icon:'ti-scissors' },
        { id:'Emergency', label:'Emergency',      icon:'ti-ambulance' },
        { id:'ICU',       label:'ICU',            icon:'ti-heartbeat' },
        { id:'Maternity', label:'Maternity',      icon:'ti-baby-carriage' },
        { id:'Physio',    label:'Physiotherapy',  icon:'ti-accessible' },
        { id:'Lab',       label:'Laboratory',     icon:'ti-test-pipe' },
        { id:'Radiology', label:'Radiology',      icon:'ti-radioactive' },
        { id:'Pharmacy',  label:'Pharmacy',       icon:'ti-pill' },
        { id:'Discharged',label:'Discharged',     icon:'ti-door-exit' }
    ];

    /* ══════════ BAR DEFINITION — each action appears ONCE ══════════ */
    var ACTIONS = [
        { id:'patient',  label:'Patient',   icon:'ti-user-search', grp:'util',  always:true, run:openPatientSearch },
        { id:'documents',label:'Documents', icon:'ti-file-text',   grp:'file',  menu:[
            { label:'Medical Certificate',      icon:'ti-certificate',       run:function(){ go('medical-certificate.html'); } },
            { label:'Sick Leave',               icon:'ti-bed',               run:function(){ go('sick-leave.html'); } },
            { label:'Medical Report',           icon:'ti-report-medical',    run:function(){ go('medical-report.html'); } },
            { label:'Hospitalisation Cert.',    icon:'ti-building-hospital', run:function(){ go('hospitalization-certificate.html'); } },
            { label:'Transfer Form',            icon:'ti-arrows-exchange',   run:function(){ legacy('openTransferModal'); } },
            { label:'Referral Letter',          icon:'ti-send',              run:function(){ go('referral.html'); } },
            { label:'Discharge Summary',        icon:'ti-door-exit',         run:function(){ go('discharge-summary.html'); } }
        ]},
        { id:'notes',    label:'Notes',     icon:'ti-notes',       grp:'file',  menu:[
            { label:'OPD File',        icon:'ti-folder-open',        run:function(){ go('opd-file.html'); } },
            { label:'Clinical Note',   icon:'ti-notes',              run:function(){ go('clinical-note.html'); } },
            { label:'Surgical Note',   icon:'ti-scissors',           run:function(){ go('surgical-note.html'); } },
            { label:'Nursing Note',    icon:'ti-heart-rate-monitor', run:function(){ go('nursing-note.html'); } },
            { label:'Procedure Note',  icon:'ti-stethoscope',        run:function(){ go('procedure-note.html'); } },
            { label:'Ward Round',      icon:'ti-bed',                run:function(){ go('ward-round.html'); } },
            { label:'Admission Form',  icon:'ti-file-plus',          run:function(){ go('admission-form.html'); } },
            { label:'Patient History', icon:'ti-history',            run:function(){ if (window.dpOpenHistory) dpOpenHistory(); } }
        ]},
        { id:'labreq',   label:'Lab Request',     icon:'ti-test-pipe',      grp:'order', run:function(){ go('lab-request.html'); } },
        { id:'labres',   label:'Lab Result',      icon:'ti-chart-bar',      grp:'order', run:function(){ go('lab-results.html'); } },
        /* One Imaging button that asks which you want, instead of two
           buttons the doctor had to tell apart at a glance. */
        { id:'imaging',  label:'Imaging',         icon:'ti-radioactive',    grp:'order', menu:[
            { label:'Imaging Request', icon:'ti-radioactive', run:function(){ go('imaging-request.html'); } },
            { label:'Imaging Results', icon:'ti-photo-scan',  run:function(){ go('imaging-results.html'); } }
        ]},
        { id:'rx',       label:'Prescription',    icon:'ti-pill',           grp:'order', run:function(){ go('prescription.html'); } },
        { id:'proc',     label:'Procedure',       icon:'ti-stethoscope',    grp:'order', run:function(){ if (window.dcProc) dcProc(); } },
        { id:'vitals',   label:'Vitals',          icon:'ti-heartbeat',      grp:'clin',  run:function(){ if (window.pcVitals) pcVitals.open(); else legacy('viewAllVitals'); } },
        { id:'media',    label:'Media',           icon:'ti-photo',          grp:'media', menu:[
            { label:'Photos', icon:'ti-photo', run:function(){ media('photo'); } },
            { label:'Video',  icon:'ti-video', run:function(){ media('video'); } }
        ]},
        { id:'bill',     label:'Bill',      icon:'ti-receipt',        grp:'money', run:function(){ go('billing.html'); } },
        { id:'orders',   label:'My Orders', icon:'ti-clipboard-list', grp:'money', run:function(){ if (window.dcMyOrders) dcMyOrders(); } },
        { id:'messages', label:'Messages',  icon:'ti-mail',           grp:'money', run:function(){ location.href = 'messages.html'; }, badge:'dcUnread' },
        { id:'print',    label:'Print',     icon:'ti-printer',        grp:'util',  run:function(){ window.print(); }, always:true }
    ];

    var GRP = { order:{c:'#0071e3',b:'#eaf2ff'}, clin:{c:'#1a7a32',b:'#e9f9ee'},
                file:{c:'#5c2475',b:'#f5eaff'},  media:{c:'#7a4500',b:'#fff4e0'},
                money:{c:'#8a1f1a',b:'#ffebe9'}, util:{c:'#3a3a3c',b:'#ffffff'} };

    /* ══════════ 5. REMOVE DUPLICATES FROM THE TAB STRIP ══════════ */
    // Anything reachable from the bar should not also sit in the tabs.
    function dedupeTabs() {
        var onBar = {};
        ACTIONS.forEach(function (a) {
            onBar[a.label.toLowerCase()] = 1;
            (a.menu || []).forEach(function (m) { onBar[m.label.toLowerCase()] = 1; });
        });
        // These tab labels duplicate a bar action under a different wording
        var alias = {
            'ward round':'notes', 'imaging request':'labreq', 'image result':'imgres',
            'lab results':'labres', 'prescription':'rx', 'admission':'admit',
            'clinical notes':'notes', 'surgical notes':'notes'
        };
        document.querySelectorAll('.nav-tab').forEach(function (t) {
            var label = t.textContent.trim().toLowerCase();
            if (!label) return;
            if (onBar[label] || alias[label]) {
                t.dataset.pcDuplicate = '1';
                t.style.display = 'none';
            }
        });
    }

    /* ══════════ 1 + 2. PATIENT SEARCH WITH LOCATION ══════════ */
    function openPatientSearch(preLoc) {
        var all = [];
        try { if (typeof getPatients === 'function') all = getPatients() || []; } catch (e) {}

        var ov = document.createElement('div');
        ov.className = 'ab-ov';
        ov.innerHTML =
          '<div class="ab-mod" role="dialog" aria-modal="true">' +
            '<button class="ab-close" aria-label="Close"><i class="ti ti-x"></i></button>' +
            '<h3><i class="ti ti-user-search"></i> Find Patient</h3>' +
            '<div class="ab-srow">' +
              '<div><label>First name</label><input id="abF" placeholder="John" autocomplete="off"></div>' +
              '<div><label>Family name</label><input id="abL" placeholder="Doe" autocomplete="off"></div>' +
            '</div>' +
            '<div class="ab-srow">' +
              '<div><label>File no. / phone</label><input id="abM" placeholder="MRN 1001" autocomplete="off"></div>' +
              '<div><label>Location</label><select id="abLoc"><option value="all">All locations</option>' +
                LOCATIONS.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.label) + '</option>'; }).join('') +
              '</select></div>' +
            '</div>' +
            '<div class="ab-chips" id="abChips"></div>' +
            '<div class="ab-count" id="abCount"></div>' +
            '<div class="ab-list" id="abList"></div>' +
          '</div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add('open'); });

        function close() { ov.classList.remove('open'); setTimeout(function () { ov.remove(); }, 220); }
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        $('.ab-close', ov).onclick = close;
        document.addEventListener('keydown', function h(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', h); }
        });

        // Quick location chips
        var chips = $('#abChips', ov);
        chips.innerHTML = '<button class="ab-chip on" data-l="all">All</button>' +
            LOCATIONS.slice(0, 6).map(function (l) {
                return '<button class="ab-chip" data-l="' + esc(l.id) + '">' +
                       '<i class="ti ' + l.icon + '"></i> ' + esc(l.label) + '</button>';
            }).join('');
        chips.addEventListener('click', function (e) {
            var b = e.target.closest('.ab-chip'); if (!b) return;
            chips.querySelectorAll('.ab-chip').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
            $('#abLoc', ov).value = b.dataset.l;
            draw();
        });

        function draw() {
            var f = $('#abF', ov).value.toLowerCase().trim();
            var l = $('#abL', ov).value.toLowerCase().trim();
            var m = $('#abM', ov).value.toLowerCase().trim();
            var loc = $('#abLoc', ov).value;

            var rows = all.filter(function (p) {
                if (f && String(p.firstName || '').toLowerCase().indexOf(f) === -1) return false;
                if (l && String(p.lastName  || '').toLowerCase().indexOf(l) === -1) return false;
                if (m) {
                    var hay = (String(p.mrn || '') + ' ' + String(p.phone || '')).toLowerCase();
                    if (hay.indexOf(m) === -1) return false;
                }
                if (loc !== 'all') {
                    var where = String(p.location || p.department || 'OPD').toLowerCase();
                    if (where !== loc.toLowerCase()) return false;
                }
                return true;
            }).sort(function (a, b) {
                // most recently arrived at that location first
                var ad = a.locationSince || a.registered || '';
                var bd = b.locationSince || b.registered || '';
                return String(bd).localeCompare(String(ad));
            });

            $('#abCount', ov).textContent = rows.length + ' patient' + (rows.length === 1 ? '' : 's') +
                (loc !== 'all' ? ' in ' + loc : '') + (rows.length ? ' · newest first' : '');

            var box = $('#abList', ov);
            if (!rows.length) {
                box.innerHTML = '<div class="ab-empty">' +
                    (all.length ? 'No patient matches those filters.' : 'No patients registered yet.') + '</div>';
                return;
            }
            box.innerHTML = rows.slice(0, 80).map(function (p) {
                var al = p.allergies || [];
                if (typeof al === 'string') al = al.split(/[,;]/).filter(Boolean);
                var since = p.locationSince || p.registered;
                var d = since ? new Date(since) : null;
                return '<button class="ab-row" data-id="' + esc(p.id) + '">' +
                  '<span class="ab-av">' + esc((p.firstName || p.name || '?').substring(0, 2).toUpperCase()) + '</span>' +
                  '<span class="ab-nm"><b>' + esc(p.lastName || '') + '</b>' +
                  '<span>' + esc(p.firstName || '') + ' · ' + esc(p.mrn || ('ID ' + p.id)) + '</span></span>' +
                  '<span class="ab-loc"><i class="ti ti-map-pin"></i> ' + esc(p.location || p.department || 'OPD') + '</span>' +
                  (d ? '<span class="ab-dt">' + d.toLocaleDateString('en-GB', { day:'numeric', month:'short' }) + '</span>' : '') +
                  (al.length ? '<span class="ab-al" title="Allergies"><i class="ti ti-alert-triangle"></i></span>' : '') +
                  '<i class="ti ti-chevron-right" style="color:#c7c7cc"></i></button>';
            }).join('');
            box.querySelectorAll('.ab-row').forEach(function (b) {
                b.onclick = function () {
                    if (window.pcPatient) pcPatient.set(b.dataset.id);
                    else if (typeof selectPatient === 'function') selectPatient(parseInt(b.dataset.id, 10));
                    close();
                };
            });
        }

        ['abF','abL','abM'].forEach(function (id) { $('#' + id, ov).addEventListener('input', draw); });
        $('#abLoc', ov).addEventListener('change', function () {
            chips.querySelectorAll('.ab-chip').forEach(function (x) {
                x.classList.toggle('on', x.dataset.l === $('#abLoc', ov).value);
            });
            draw();
        });

        if (preLoc) { $('#abLoc', ov).value = preLoc; }
        draw();
        setTimeout(function () { $('#abF', ov).focus(); }, 130);
    }
    window.abFindPatient = openPatientSearch;

    /* ══════════ DROPDOWN MENUS ══════════ */
    function showMenu(btn, items) {
        closeMenus();
        if (!need()) return;
        var m = document.createElement('div');
        m.className = 'ab-menu';
        m.innerHTML = items.map(function (it, i) {
            return '<button data-i="' + i + '"><i class="ti ' + it.icon + '"></i> ' + esc(it.label) + '</button>';
        }).join('');
        document.body.appendChild(m);
        var r = btn.getBoundingClientRect();
        m.style.left = Math.min(r.left, window.innerWidth - 250) + 'px';
        m.style.top  = (r.bottom + 6) + 'px';
        requestAnimationFrame(function () { m.classList.add('open'); });
        m.querySelectorAll('button').forEach(function (b) {
            b.onclick = function () { closeMenus(); items[+b.dataset.i].run(); };
        });
        setTimeout(function () {
            document.addEventListener('click', closeMenus, { once: true });
        }, 10);
    }
    function closeMenus() {
        document.querySelectorAll('.ab-menu').forEach(function (m) { m.remove(); });
    }

    /* ══════════ BUILD ══════════ */
    function build() {
        var bar = $('#dcBar');
        if (!bar) return;
        bar.dataset.rebuilt = '1';
        bar.innerHTML = '';
        var last = null;
        ACTIONS.forEach(function (a) {
            if (last && last !== a.grp) bar.appendChild(Object.assign(document.createElement('span'), { className:'ab-sep' }));
            last = a.grp;
            var g = GRP[a.grp] || GRP.util;
            var b = document.createElement('button');
            b.className = 'ab-btn' + (a.always ? ' ab-always' : '');
            b.dataset.act = a.id; b.title = a.label;
            b.style.setProperty('--c', g.c); b.style.setProperty('--b', g.b);
            b.innerHTML = '<i class="ti ' + a.icon + '"></i><span>' + esc(a.label) + '</span>' +
                (a.menu ? '<i class="ti ti-chevron-down" style="font-size:11px;opacity:.6"></i>' : '') +
                (a.badge ? '<span class="ab-badge" id="' + a.badge + '">0</span>' : '');
            b.onclick = a.menu
                ? function (e) { e.stopPropagation(); showMenu(b, a.menu); }
                : a.run;
            bar.appendChild(b);
        });
        syncEnabled();
        dedupeTabs();
    }

    function syncEnabled() {
        var on = !!P();
        document.querySelectorAll('#dcBar .ab-btn').forEach(function (b) {
            if (!b.classList.contains('ab-always')) b.classList.toggle('ab-off', !on);
        });
    }

    /* ══════════ 2. RICHER PATIENT STRIP ══════════ */
    function enrichStrip() {
        var el = $('#dcCtx'); if (!el) return;
        var p = P();
        if (!p) return;                       // doctor-patient.js renders the empty state
        if (el.dataset.enrichedFor === String(p.id)) return;
        el.dataset.enrichedFor = String(p.id);

        // Append the extra facts doctor-patient.js does not carry
        var extra = [];
        if (p.insurance && p.insurance.provider) {
            extra.push('<span class="pill ins"><i class="ti ti-shield-check"></i> ' + esc(p.insurance.provider) +
                       (p.insurance.policyNumber ? ' · ' + esc(p.insurance.policyNumber) : '') + '</span>');
        } else {
            extra.push('<span class="pill none">Cash patient</span>');
        }
        if (p.district) extra.push('<span class="pill"><i class="ti ti-map-pin"></i> ' + esc(p.district) +
                                   (p.sector ? ', ' + esc(p.sector) : '') + '</span>');
        var loc = p.location || p.department || 'OPD';
        extra.push('<button class="pill locbtn" onclick="abFindPatient(\'' + esc(loc) + '\')" ' +
                   'title="Show everyone in ' + esc(loc) + '"><i class="ti ti-building-hospital"></i> ' +
                   esc(loc) + '</button>');
        extra.push('<button class="pill locbtn" onclick="abFindPatient()" title="Search patients">' +
                   '<i class="ti ti-search"></i></button>');

        var spacer = el.querySelector('span[style*="flex:1"]');
        var frag = document.createElement('span');
        frag.className = 'ab-extra';
        frag.style.cssText = 'display:contents';
        frag.innerHTML = extra.join('');
        if (spacer) el.insertBefore(frag, spacer); else el.appendChild(frag);
    }

    /* ══════════ HIDE THE OLD CARD ══════════ */
    function hideCard() {
        if (!window.__pcCardHidden && typeof window.displayPatientFile === 'function') {
            window.__pcCardHidden = true;
            var orig = window.displayPatientFile;
            window.displayPatientFile = function () {
                try { orig.apply(this, arguments); } catch (e) {}
                var c = document.getElementById('patientFileContainer');
                if (c) c.style.display = 'none';
            };
        }
        var c = document.getElementById('patientFileContainer');
        if (c) c.style.display = 'none';
    }

    /* ══════════ STYLES ══════════ */
    var css = document.createElement('style');
    css.textContent = `
    #dcBar{display:flex!important;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 14px}
    .ab-sep{width:1px;height:20px;background:rgba(0,0,0,.1);margin:0 3px;flex-shrink:0}
    [data-theme="dark"] .ab-sep{background:rgba(255,255,255,.12)}
    .ab-btn{position:relative;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;
        border-radius:9px;border:.5px solid rgba(0,0,0,.07);background:var(--b);color:var(--c);
        font-family:inherit;font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;
        box-shadow:0 1px 2px rgba(0,0,0,.05),inset 0 1px 0 rgba(255,255,255,.7);overflow:hidden;
        -webkit-tap-highlight-color:transparent;
        transition:transform .28s cubic-bezier(.34,1.56,.64,1),box-shadow .28s,opacity .2s,filter .2s}
    .ab-btn i{font-size:14px;flex-shrink:0}
    .ab-btn:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 4px 12px rgba(0,0,0,.14)}
    .ab-btn:active{transform:scale(.94);transition-duration:.08s}
    .ab-btn::after{content:'';position:absolute;inset:0;border-radius:inherit;
        background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.5) 48%,transparent 66%);
        transform:translateX(-130%);opacity:0;pointer-events:none;transition:transform .65s,opacity .3s}
    .ab-btn:hover::after{transform:translateX(130%);opacity:1}
    .ab-btn.ab-off{opacity:.34;filter:grayscale(.7);pointer-events:none}
    [data-theme="dark"] .ab-btn{border-color:rgba(255,255,255,.09)}
    .ab-badge{min-width:16px;height:16px;border-radius:8px;background:#ff3b30;color:#fff;
        font-size:9.5px;font-weight:800;display:none;align-items:center;justify-content:center;padding:0 4px}

    .ab-menu{position:fixed;z-index:9800;min-width:238px;padding:6px;border-radius:13px;
        background:var(--s1,#fff);border:.5px solid rgba(0,0,0,.1);
        box-shadow:0 14px 44px rgba(0,0,0,.24);opacity:0;transform:translateY(-6px) scale(.97);
        transition:opacity .2s,transform .24s cubic-bezier(.34,1.56,.64,1)}
    .ab-menu.open{opacity:1;transform:none}
    .ab-menu button{width:100%;display:flex;align-items:center;gap:10px;padding:9px 11px;border:0;
        background:none;border-radius:9px;font-family:inherit;font-size:12.5px;font-weight:500;
        color:var(--tp,#1c1c1e);cursor:pointer;text-align:left;transition:background .18s}
    .ab-menu button:hover{background:var(--acb,#eaf2ff);color:var(--ac,#0071e3)}
    .ab-menu button i{font-size:15px;opacity:.75;flex-shrink:0}

    #dcCtx .pill.ins{background:#e9f9ee;color:#1a7a32;border-color:transparent;font-weight:700}
    #dcCtx .pill.locbtn{cursor:pointer;border:.5px solid var(--ac,#0071e3);color:var(--ac,#0071e3);
        background:var(--acb,#eaf2ff);font-weight:700;
        transition:transform .22s cubic-bezier(.34,1.56,.64,1)}
    #dcCtx .pill.locbtn:hover{transform:translateY(-1px) scale(1.04)}

    .ab-ov{position:fixed;inset:0;z-index:9600;background:rgba(2,10,24,.55);
        -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:center;
        justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .22s}
    .ab-ov.open{opacity:1;pointer-events:auto}
    .ab-mod{position:relative;width:100%;max-width:620px;max-height:84vh;display:flex;flex-direction:column;
        background:var(--s1,#fff);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.4);padding:20px 22px;
        transform:translateY(14px) scale(.97);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
    .ab-ov.open .ab-mod{transform:none}
    .ab-mod h3{font-size:16px;font-weight:800;display:flex;align-items:center;gap:9px;margin-bottom:13px;padding-right:36px}
    .ab-close{position:absolute;top:14px;right:16px;width:32px;height:32px;border-radius:50%;border:0;
        background:rgba(0,0,0,.06);color:#666;cursor:pointer;display:grid;place-items:center;transition:all .2s}
    .ab-close:hover{background:rgba(0,0,0,.13);transform:rotate(90deg)}
    .ab-srow{display:flex;gap:10px;margin-bottom:9px}.ab-srow>div{flex:1}
    .ab-srow label{display:block;font-size:10px;font-weight:700;color:var(--tm,#8e8e93);
        text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
    .ab-srow input,.ab-srow select{width:100%;height:34px;padding:0 11px;border-radius:9px;
        border:.5px solid rgba(0,0,0,.12);background:var(--s1,#fff);color:var(--tp,#1c1c1e);
        font-family:inherit;font-size:13px;outline:none}
    .ab-srow input:focus,.ab-srow select:focus{border-color:#0071e3;box-shadow:0 0 0 4px rgba(0,113,227,.15)}
    .ab-chips{display:flex;gap:5px;flex-wrap:wrap;margin:4px 0 8px}
    .ab-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:30px;
        border:.5px solid rgba(0,0,0,.1);background:var(--s1,#fff);font-family:inherit;font-size:11px;
        font-weight:600;color:var(--ts,#3a3a3c);cursor:pointer;transition:all .22s cubic-bezier(.34,1.56,.64,1)}
    .ab-chip:hover{transform:translateY(-1px)}
    .ab-chip.on{background:#0071e3;color:#fff;border-color:transparent}
    .ab-count{font-size:11px;color:var(--tm,#8e8e93);margin-bottom:7px;font-weight:600}
    .ab-list{overflow-y:auto;flex:1;margin:0 -6px;padding:0 6px}
    .ab-row{width:100%;display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:11px;
        border:.5px solid rgba(0,0,0,.07);background:var(--s1,#fff);cursor:pointer;margin-bottom:5px;
        font-family:inherit;text-align:left;transition:all .2s cubic-bezier(.34,1.56,.64,1)}
    .ab-row:hover{background:#eaf2ff;border-color:#0071e3;transform:translateX(3px)}
    .ab-av{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;
        font-size:10px;font-weight:800;color:#fff;background:linear-gradient(135deg,#0071e3,#af52de)}
    .ab-nm{flex:1;min-width:0;display:flex;flex-direction:column}
    .ab-nm b{font-size:13px;letter-spacing:-.2px}
    .ab-nm span{font-size:11px;color:#8e8e93}
    .ab-loc{font-size:10.5px;font-weight:700;color:#0071e3;background:#eaf2ff;padding:3px 9px;
        border-radius:30px;white-space:nowrap}
    .ab-dt{font-size:10.5px;color:#8e8e93;white-space:nowrap}
    .ab-al{color:#ff3b30;font-size:14px}
    .ab-empty{text-align:center;padding:30px;color:#8e8e93;font-size:12.5px}
    [data-theme="dark"] .ab-row{background:#2c2c2e;border-color:rgba(255,255,255,.08)}

    /* Patient name styling — gradient, weight, tracking */
    #dcCtx .dp-ava,#pcHandoff .av{box-shadow:0 2px 8px rgba(0,113,227,.3)}
    #dcCtx .nm,#pcHandoff .nm{font-size:15px;font-weight:800;letter-spacing:-.35px;
        background:linear-gradient(135deg,#0071e3,#af52de);
        -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
        padding-right:2px}
    [data-theme="dark"] #dcCtx .nm,[data-theme="dark"] #pcHandoff .nm{
        background:linear-gradient(135deg,#60a5fa,#c084fc);
        -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .patient-name,td .pname{font-weight:700;letter-spacing:-.2px}

    #patientFileContainer{display:none!important}
    .nav-tab[data-pc-duplicate]{display:none!important}
    @media(max-width:1200px){.ab-btn span{display:none}.ab-btn{padding:0 9px}.ab-btn i{font-size:16px}}
    @media(max-width:640px){#dcBar{padding:7px 10px;gap:5px}.ab-sep{display:none}
        .ab-srow{flex-direction:column;gap:7px}}
    @media print{#dcBar,#dcCtx{display:none!important}}`;
    document.head.appendChild(css);

    /* ══════════ INIT ══════════ */
    function init() {
        var tries = 0;
        (function wait() {
            if ($('#dcBar')) { build(); hideCard(); enrichStrip(); return; }
            if (++tries < 30) setTimeout(wait, 200);
        })();
        window.addEventListener('pcPatientChanged', function () {
            syncEnabled(); hideCard();
            var el = $('#dcCtx'); if (el) delete el.dataset.enrichedFor;
            setTimeout(enrichStrip, 60);
        });
        setInterval(function () { hideCard(); dedupeTabs(); enrichStrip(); }, 2500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.pcActionBar = { rebuild: build, actions: ACTIONS, locations: LOCATIONS, search: openPatientSearch };
    console.log('🧰 Action bar v2 — ' + ACTIONS.length + ' actions, no duplicates');
})();
