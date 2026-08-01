/* ============================================================
   PCLINIC — DOCTOR DASHBOARD FIXES

   1. "View" / "Open Patient File" → "Select Patient", with clear
      confirmation that the strip above now shows that patient.
   2. Search results appeared BEHIND the bars — z-index 50 sat
      under the command bar (60) and topbar (100).
   3. All Patients now lists everyone, newest registered first,
      when no search is active.
   4. Logout never signed out of Firebase — it only redirected, so
      the session survived and the guard let you straight back in.
   ============================================================ */
(function () {
    'use strict';

    var $ = function (s, r) { return (r || document).querySelector(s); };

    /* ══════════ 4. LOGOUT ══════════
       performLogout() did: showToast → setTimeout 1s → location.href.
       It never called signOut(), so the Firebase session stayed alive
       and auth-guard.js bounced the user straight back in. It also used
       href, leaving the dashboard in history for the Back button.       */
    function fixLogout() {
        window.performLogout = function () {
            if (window.pclinicLogout) return window.pclinicLogout({ confirm: false });
            try {
                if (window.firebaseAuth && window.firebaseAuthFunctions) {
                    window.firebaseAuthFunctions.signOut(window.firebaseAuth).catch(function () {});
                }
                Object.keys(localStorage).forEach(function (k) {
                    if (k.indexOf('pclinic:') === 0) localStorage.removeItem(k);
                });
                localStorage.removeItem('pclinic_active_patient');
                localStorage.removeItem('pclinic_handoff');
            } catch (e) {}
            location.replace('login.html');
        };

        // The confirm dialog is redundant now that pclinicLogout asks,
        // but keep it working if the markup is still present.
        window.toggleLogoutModal = function () {
            var m = document.getElementById('logout-modal');
            if (m) return m.classList.toggle('show');
            if (window.pclinicLogout) window.pclinicLogout();      // asks to confirm
        };
        window.closeLogoutModal = function () {
            var m = document.getElementById('logout-modal');
            if (m) m.classList.remove('show');
        };
    }

    /* ══════════ 1. SELECT PATIENT ══════════ */
    function selectAndConfirm(id) {
        var p = null;
        if (window.pcPatient) p = window.pcPatient.set(id, { silent: true });
        else if (typeof window.selectPatient === 'function') {
            window.selectPatient(parseInt(id, 10));
            p = window.currentPatient;
        }
        if (!p) { if (window.pcToast) pcToast('Could not load that patient', 'error'); return; }

        var name = p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
        if (window.pcToast) pcToast('✅ Selected: ' + name + ' — now shown above', 'success');

        // Draw the eye to the strip so it is obvious what changed
        var ctx = $('#dcCtx');
        if (ctx) {
            ctx.classList.remove('dfx-flash');
            void ctx.offsetWidth;                    // restart the animation
            ctx.classList.add('dfx-flash');
            ctx.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        markSelectedRows(p.id);

        // The legacy selectPatient() opens the patient-file panel and
        // scrolls to it, which covers the patient table — so the list you
        // were choosing from disappears and you cannot pick a second
        // patient without navigating back. The card is retired anyway, so
        // keep the list in view.
        // The legacy selectPatient() hides .main-panel (the patient list)
        // and opens the patient-file card in its place. Since the card is
        // retired and everything lives on the bar now, that just made the
        // list vanish — you could not pick a second patient without
        // navigating away and back. Keep the list on screen.
        setTimeout(function () {
            ['patientFileContainer', 'patientFile', 'patient-file-card'].forEach(function (id) {
                var c = document.getElementById(id);
                if (c) c.style.display = 'none';
            });
            document.querySelectorAll('.main-panel').forEach(function (el) {
                if (getComputedStyle(el).display === 'none') el.style.display = '';
            });
        }, 60);
    }
    window.dfxSelect = selectAndConfirm;

    // Relabel the row buttons and highlight the active row
    function relabelButtons() {
        document.querySelectorAll('#patientTableBody button, .schedule-row button, tr button')
            .forEach(function (b) {
                var txt = (b.textContent || '').trim().toLowerCase();
                var oc  = b.getAttribute('onclick') || '';
                var isSelect = /selectpatient\(/i.test(oc) &&
                               (txt === 'view' || txt.indexOf('open patient file') !== -1 || txt === '');
                if (!isSelect || b.dataset.dfx) return;
                b.dataset.dfx = '1';
                var m = oc.match(/selectPatient\((\d+)\)/);
                if (!m) return;
                b.innerHTML = '<i class="ti ti-user-check"></i> Select Patient';
                b.classList.add('dfx-select');
                b.setAttribute('onclick',
                    'event.stopPropagation();dfxSelect(' + m[1] + ')');
            });
    }

    function markSelectedRows(id) {
        document.querySelectorAll('tr[data-pid], #patientTableBody tr').forEach(function (tr) {
            var oc = (tr.getAttribute('onclick') || '') + (tr.innerHTML.match(/dfxSelect\((\d+)\)/) || [''])[0];
            var hit = oc.indexOf('(' + id + ')') !== -1;
            tr.classList.toggle('dfx-active', hit);
        });
    }

    /* ══════════ 3. ALL PATIENTS — newest first ══════════ */
    function sortNewestFirst() {
        if (typeof window.getPatients !== 'function' || window.__dfxSorted) return;
        window.__dfxSorted = true;
        var orig = window.getPatients;
        window.getPatients = function () {
            var list = orig.apply(this, arguments) || [];
            // Most recently registered at the top. Falls back to id, which
            // increments, so ordering is stable even without a date.
            return list.slice().sort(function (a, b) {
                var ad = (a && (a.registered || a.queueAdded)) || '';
                var bd = (b && (b.registered || b.queueAdded)) || '';
                if (ad !== bd) return String(bd).localeCompare(String(ad));
                return (b && b.id || 0) - (a && a.id || 0);
            });
        };
    }

    // If the table is empty but patients exist, force a render
    function ensureListed() {
        var tb = $('#patientTableBody');
        if (!tb) return;
        var rows = tb.querySelectorAll('tr').length;
        var have = 0;
        try { have = (window.getPatients() || []).length; } catch (e) {}
        if (have && rows === 0 && typeof window.renderPatientTable === 'function') {
            try { window.renderPatientTable(); } catch (e) {}
        }
    }

    /* ══════════ 2 + styling ══════════ */
    var css = document.createElement('style');
    css.textContent = `
    /* 2. Search results were at z-index 50, BELOW the command bar (60)
       and topbar (100), so they rendered behind them. */
    .search-suggestions,
    #suggestions,
    .suggestions,
    .autocomplete-list{
        /* Above the command bar (60) and topbar (100), but BELOW the
           dialogs (9000+) so it never swallows their clicks. */
        z-index:900!important;
        background:var(--s1,#fff)!important;
        box-shadow:0 14px 44px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.12)!important;
        border:.5px solid rgba(0,0,0,.1)!important;
        max-height:min(60vh,430px)!important;
        overflow-y:auto!important;
    }
    /* The search box must also create a stacking context above the bars */
    .search-wrap,.search-row,.search-box{position:relative;z-index:899}

    /* 1. Select Patient button */
    .dfx-select{
        display:inline-flex!important;align-items:center;gap:5px;
        background:linear-gradient(180deg,#3d94ff,#0071e3)!important;color:#fff!important;
        border:0!important;border-radius:8px!important;padding:4px 12px!important;
        font-size:10.5px!important;font-weight:700!important;cursor:pointer;white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,113,227,.3);
        transition:transform .24s cubic-bezier(.34,1.56,.64,1),box-shadow .24s}
    .dfx-select:hover{transform:translateY(-1px) scale(1.05);box-shadow:0 4px 14px rgba(0,113,227,.42)}
    .dfx-select:active{transform:scale(.94)}

    /* Highlight the row whose patient is loaded */
    tr.dfx-active{background:rgba(0,113,227,.09)!important;
        box-shadow:inset 3px 0 0 #0071e3}

    /* Flash the strip so the change is unmistakable */
    @keyframes dfxFlash{
        0%{box-shadow:inset 0 0 0 0 rgba(0,113,227,0)}
        25%{box-shadow:inset 0 0 0 3px rgba(0,113,227,.55);background:rgba(0,113,227,.14)}
        100%{box-shadow:inset 0 0 0 0 rgba(0,113,227,0)}}
    .dfx-flash{animation:dfxFlash 1.1s ease}`;
    document.head.appendChild(css);

    /* ══════════ INIT ══════════ */
    function tick() {
        relabelButtons();
        ensureListed();
        // Guard against the legacy renderer hiding the list again
        document.querySelectorAll('.main-panel').forEach(function (el) {
            if (el.style.display === 'none') el.style.display = '';
        });
    }

    function init() {
        sortNewestFirst();
        fixLogout();
        tick();
        // The patient table re-renders on filter/refresh, so keep relabelling
        setInterval(tick, 1200);
        window.addEventListener('patientsUpdated', function () { setTimeout(tick, 200); });
        window.addEventListener('pcPatientChanged', function (e) {
            if (e.detail && e.detail.id) markSelectedRows(e.detail.id);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // fixLogout again once doctor.js has finished defining its own version
    setTimeout(fixLogout, 800);
    setTimeout(fixLogout, 2500);

    console.log('🔧 Doctor fixes: select-patient, z-index, newest-first, logout');
})();
