/* ============================================================
   PCLINIC — PATIENT HANDOFF RECEIVER
   Include on any page opened with ?patient=<id>.

   The doctor dashboard now navigates to real pages instead of
   building iframe modals. This picks the patient back up on
   arrival, so the target page opens already loaded — the way the
   billing page does — and shows a header strip plus a Back link.
   ============================================================ */
(function () {
    'use strict';

    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }

    function age(dob) {
        if (!dob) return null;
        var d = new Date(dob); if (isNaN(d)) return null;
        var a = new Date().getFullYear() - d.getFullYear();
        var m = new Date().getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && new Date().getDate() < d.getDate())) a--;
        return (a >= 0 && a < 130) ? a : null;
    }

    function name(p) {
        if (!p) return '';
        return p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ' + p.id);
    }

    function resolve() {
        var id = new URLSearchParams(location.search).get('patient');
        if (!id) { try { id = localStorage.getItem('pclinic_active_patient'); } catch (e) {} }
        if (!id) return null;

        // Prefer the live record; fall back to the handoff snapshot so the
        // page still renders if patient-data.js has not finished loading.
        try {
            if (typeof getPatients === 'function') {
                var hit = (getPatients() || []).filter(function (p) { return String(p.id) === String(id); })[0];
                if (hit) return hit;
            }
        } catch (e) {}
        try {
            var h = JSON.parse(localStorage.getItem('pclinic_handoff') || 'null');
            if (h && String(h.id) === String(id)) return h;
        } catch (e) {}
        return null;
    }

    function strip(p) {
        // Delegate 100% to Complete Patient Identification Bar (.oc-demo-bar) from pclinic-file.js
        if (window.pcFile && typeof window.pcFile.renderDemoBar === 'function') {
            var barContainer = document.getElementById('pc_common_demo_bar');
            if (!barContainer) {
                barContainer = document.createElement('div');
                barContainer.id = 'pc_common_demo_bar';
                barContainer.className = 'oc-demo-bar noprint';
                if (document.body.firstChild) document.body.insertBefore(barContainer, document.body.firstChild);
                else document.body.appendChild(barContainer);
            }
            window.pcFile.renderDemoBar(barContainer, p);
            return;
        }
        // If pcFile not loaded yet, retry shortly
        setTimeout(function() {
            if (window.pcFile && typeof window.pcFile.renderDemoBar === 'function') {
                strip(p);
            }
        }, 120);
        return;
    }

    function boot() {
        var tries = 0;
        (function go() {
            var p = resolve();
            if (p) { strip(p); return; }
            if (++tries < 20) setTimeout(go, 220);
        })();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
