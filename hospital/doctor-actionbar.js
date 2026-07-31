/* ============================================================
   PCLINIC — DOCTOR ACTION BAR
   Four changes requested after review:

   1. Lab Request (and Imaging) open the REAL full forms —
      lab-request.html has 64 tests across 8 categories. The small
      composer popup was a poor substitute, so it is retired.

   2. All 14 patient-card buttons (OPD File, Transfer, Lab Request,
      Lab Result, Imaging Request, Image Result, Vitals, Surgery,
      Prescription, Ward Round, Photos, Video, Print, Close) move up
      onto the bar alongside Messages, My Orders, Procedure and Bill.

   3. The patient card is removed — everything it offered is now above.

   4. Patient names are styled properly: avatar, weight, tracking.
   ============================================================ */
(function () {
    'use strict';

    var $ = function (s, r) { return (r || document).querySelector(s); };
    function P() { return (window.pcPatient && window.pcPatient.get()) || window.currentPatient || null; }
    function need(what) {
        var p = P();
        if (!p) {
            if (window.pcPatient) return window.pcPatient.require(what);
            if (window.pcToast) pcToast('Select a patient first', 'error');
            return null;
        }
        return p;
    }
    function go(page) {
        var p = need(); if (!p) return;
        if (window.pcPatient) return window.pcPatient.open(page);
        location.href = page + '?patient=' + encodeURIComponent(p.id);
    }

    /* ══════════════ 1. REAL FORMS, NOT POPUPS ══════════════ */
    // lab-request.html carries 64 tests in 8 categories. Retire the
    // cut-down composer and send people to the actual form.
    window.dcLab     = function () { go('lab-request.html'); };
    window.dcImaging = function () { go('imaging-request.html'); };
    window.dcRx      = function () { go('prescription.html'); };

    /* ══════════════ 2. ALL CARD ACTIONS, ON THE BAR ══════════════ */
    var ACTIONS = [
        { id:'opd',      label:'OPD File',        icon:'ti-folder-open',       grp:'file',  run:function(){ go('opd_file.html'); } },
        { id:'transfer', label:'Transfer',        icon:'ti-arrows-exchange',   grp:'file',  run:function(){ legacy('openTransferModal'); } },
        { id:'labreq',   label:'Lab Request',     icon:'ti-test-pipe',         grp:'order', run:function(){ go('lab-request.html'); } },
        { id:'labres',   label:'Lab Result',      icon:'ti-chart-bar',         grp:'order', run:function(){ go('lab-results.html'); } },
        { id:'imgreq',   label:'Imaging Request', icon:'ti-radioactive',       grp:'order', run:function(){ go('imaging-request.html'); } },
        { id:'imgres',   label:'Image Result',    icon:'ti-photo-scan',        grp:'order', run:function(){ go('imaging-results.html'); } },
        { id:'rx',       label:'Prescription',    icon:'ti-pill',              grp:'order', run:function(){ go('prescription.html'); } },
        { id:'proc',     label:'Procedure',       icon:'ti-stethoscope',       grp:'order', run:function(){ if (window.dcProc) dcProc(); } },
        { id:'vitals',   label:'Vitals',          icon:'ti-heartbeat',         grp:'clin',  run:function(){ legacy('viewAllVitals'); } },
        { id:'ward',     label:'Ward Round',      icon:'ti-bed',               grp:'clin',  run:function(){ go('ward-round.html'); } },
        { id:'surgery',  label:'Surgery',         icon:'ti-scissors',          grp:'clin',  run:function(){ tab('surgery'); } },
        { id:'note',     label:'Note',            icon:'ti-notes',             grp:'clin',  run:function(){ if (window.dpOpenNote) dpOpenNote(); } },
        { id:'history',  label:'History',         icon:'ti-history',           grp:'clin',  run:function(){ if (window.dpOpenHistory) dpOpenHistory(); } },
        { id:'photos',   label:'Photos',          icon:'ti-photo',             grp:'media', run:function(){ media('photo'); } },
        { id:'video',    label:'Video',           icon:'ti-video',             grp:'media', run:function(){ media('video'); } },
        { id:'bill',     label:'Bill',            icon:'ti-receipt',           grp:'money', run:function(){ go('billing.html'); } },
        { id:'orders',   label:'My Orders',       icon:'ti-clipboard-list',    grp:'money', run:function(){ if (window.dcMyOrders) dcMyOrders(); } },
        { id:'messages', label:'Messages',        icon:'ti-mail',              grp:'money', run:function(){ location.href = 'messages.html'; }, badge:'dcUnread' },
        { id:'print',    label:'Print',           icon:'ti-printer',           grp:'util',  run:function(){ window.print(); } },
        { id:'patient',  label:'Patient',         icon:'ti-user-search',       grp:'util',  run:function(){ if (window.dpPick) dpPick(); }, always:true }
    ];

    function legacy(fn) {
        if (!need()) return;
        if (typeof window[fn] === 'function') { try { window[fn](P()); } catch (e) { window[fn](); } }
        else if (window.pcToast) pcToast('Not available on this page', 'info');
    }
    function tab(name) {
        if (!need()) return;
        var el = document.querySelector('[data-tab="' + name + '"]');
        if (el) el.click();
        else if (window.pcToast) pcToast('Tab not found', 'info');
    }
    function media(kind) {
        var p = need(); if (!p) return;
        var inp = document.getElementById(kind === 'video' ? 'videoInput' : 'photoInput');
        if (inp) return inp.click();
        go('opd_file.html');
    }

    var GRP = {
        order: { c:'#0071e3', b:'#eaf2ff' },
        clin:  { c:'#1a7a32', b:'#e9f9ee' },
        file:  { c:'#5c2475', b:'#f5eaff' },
        media: { c:'#7a4500', b:'#fff4e0' },
        money: { c:'#8a1f1a', b:'#ffebe9' },
        util:  { c:'#3a3a3c', b:'#ffffff' }
    };

    function build() {
        var bar = $('#dcBar');
        if (!bar || bar.dataset.rebuilt) return;
        bar.dataset.rebuilt = '1';
        bar.innerHTML = '';

        var last = null;
        ACTIONS.forEach(function (a) {
            if (last && last !== a.grp) {
                var sep = document.createElement('span');
                sep.className = 'ab-sep';
                bar.appendChild(sep);
            }
            last = a.grp;

            var g = GRP[a.grp] || GRP.util;
            var b = document.createElement('button');
            b.className = 'ab-btn' + (a.always ? ' ab-always' : '');
            b.dataset.act = a.id;
            b.title = a.label;
            b.style.setProperty('--c', g.c);
            b.style.setProperty('--b', g.b);
            b.innerHTML = '<i class="ti ' + a.icon + '"></i><span>' + a.label + '</span>' +
                (a.badge ? '<span class="ab-badge" id="' + a.badge + '">0</span>' : '');
            b.onclick = a.run;
            bar.appendChild(b);
        });

        if (window.pollUnread) try { window.pollUnread(); } catch (e) {}
        syncEnabled();
    }

    // Grey out everything that needs a patient, until one is chosen.
    function syncEnabled() {
        var on = !!P();
        document.querySelectorAll('#dcBar .ab-btn').forEach(function (b) {
            if (b.classList.contains('ab-always')) return;
            b.classList.toggle('ab-off', !on);
        });
    }

    /* ══════════════ 3. REMOVE THE PATIENT CARD ══════════════ */
    function hideCard() {
        // Everything the card offered now lives on the bar. Neutralise the
        // renderer rather than deleting it, so any caller still works.
        if (!window.__pcCardHidden && typeof window.displayPatientFile === 'function') {
            window.__pcCardHidden = true;
            var orig = window.displayPatientFile;
            window.displayPatientFile = function () {
                try { orig.apply(this, arguments); } catch (e) {}
                var c = document.getElementById('patientFileContainer');
                if (c) c.style.display = 'none';
            };
        }
        ['patientFileContainer', 'patientFile', 'patient-file-card'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    /* ══════════════ 4. STYLES ══════════════ */
    var css = document.createElement('style');
    css.textContent = `
    /* Action bar — wraps to as many rows as it needs */
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
    [data-theme="dark"] .ab-btn{border-color:rgba(255,255,255,.09);
        box-shadow:0 1px 2px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)}

    .ab-badge{min-width:16px;height:16px;border-radius:8px;background:#ff3b30;color:#fff;
        font-size:9.5px;font-weight:800;display:none;align-items:center;justify-content:center;padding:0 4px}

    /* 4. Patient name styling */
    #dcCtx .dp-ava,#pcHandoff .av{box-shadow:0 2px 8px rgba(0,113,227,.3)}
    #dcCtx .nm,#pcHandoff .nm{
        font-size:15px;font-weight:800;letter-spacing:-.35px;
        background:linear-gradient(135deg,#0071e3,#af52de);
        -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
        padding-right:2px}
    [data-theme="dark"] #dcCtx .nm,[data-theme="dark"] #pcHandoff .nm{
        background:linear-gradient(135deg,#60a5fa,#c084fc);
        -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}

    /* Patient table names */
    .patient-name,td .pname,#patientTableBody td:first-child{font-weight:700;letter-spacing:-.2px}

    /* Card stays hidden */
    #patientFileContainer{display:none!important}

    @media(max-width:1100px){.ab-btn span{display:none}.ab-btn{padding:0 9px}.ab-btn i{font-size:16px}}
    @media(max-width:640px){#dcBar{padding:7px 10px;gap:5px}.ab-sep{display:none}}
    @media print{#dcBar,#dcCtx{display:none!important}}`;
    document.head.appendChild(css);

    /* ══════════════ INIT ══════════════ */
    function init() {
        var tries = 0;
        (function wait() {
            if ($('#dcBar')) { build(); hideCard(); return; }
            if (++tries < 30) setTimeout(wait, 200);
        })();

        window.addEventListener('pcPatientChanged', function () { syncEnabled(); hideCard(); });
        setInterval(hideCard, 2000);   // the legacy renderer can re-show it
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.pcActionBar = { rebuild: function () { var b = $('#dcBar'); if (b) { delete b.dataset.rebuilt; build(); } },
                           actions: ACTIONS };
    console.log('🧰 Doctor action bar ready — ' + ACTIONS.length + ' actions');
})();
