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
        if (document.getElementById('pcHandoff')) return;

        var css = document.createElement('style');
        css.textContent = `
        #pcHandoff{display:flex;align-items:center;gap:11px;flex-wrap:wrap;padding:9px 16px;
            background:rgba(0,113,227,.06);border-bottom:.5px solid rgba(0,0,0,.07);
            font-family:var(--f,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);font-size:12px;
            position:sticky;top:0;z-index:400;
            -webkit-backdrop-filter:saturate(180%) blur(18px);backdrop-filter:saturate(180%) blur(18px)}
        #pcHandoff .av{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;
            font-size:10px;font-weight:800;color:#fff;background:linear-gradient(135deg,#0071e3,#af52de);flex-shrink:0}
        #pcHandoff .nm{font-weight:800;font-size:13.5px;color:var(--tp,#1c1c1e)}
        #pcHandoff .pill{padding:3px 10px;border-radius:30px;background:#fff;
            border:.5px solid rgba(0,0,0,.07);font-size:11px;font-weight:600;color:var(--ts,#3a3a3c)}
        #pcHandoff .allergy{background:#ffebe9;color:#8a1f1a;border-color:transparent}
        #pcHandoff .back{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:30px;
            padding:0 14px;border-radius:9px;border:.5px solid rgba(0,0,0,.1);background:#fff;
            color:var(--tp,#1c1c1e);font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;
            text-decoration:none;transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s}
        #pcHandoff .back:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.12)}
        [data-theme="dark"] #pcHandoff{background:rgba(0,113,227,.12)}
        [data-theme="dark"] #pcHandoff .pill,[data-theme="dark"] #pcHandoff .back{background:#2c2c2e;color:#f5f5f7}
        @media print{#pcHandoff{display:none!important}}
        @media(max-width:640px){#pcHandoff{padding:8px 12px;gap:7px;font-size:11px}
            #pcHandoff .back span{display:none}}`;
        document.head.appendChild(css);

        var a = age(p.dob);
        var v = (p.vitals && p.vitals.length) ? p.vitals[p.vitals.length - 1] : null;
        var al = p.allergies || [];
        if (typeof al === 'string') al = al.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);

        var bar = document.createElement('div');
        bar.id = 'pcHandoff';
        bar.innerHTML =
            '<span class="av">' + esc(name(p).substring(0, 2).toUpperCase()) + '</span>' +
            '<span class="nm">' + esc(name(p)) + '</span>' +
            (a != null ? '<span class="pill">' + a + ' yrs</span>' : '') +
            (p.gender ? '<span class="pill">' + esc(p.gender) + '</span>' : '') +
            '<span class="pill">' + esc(p.mrn || ('ID ' + p.id)) + '</span>' +
            (v && (v.bp || v.bloodPressure) ? '<span class="pill">BP ' + esc(v.bp || v.bloodPressure) + '</span>' : '') +
            (v && (v.temp || v.temperature) ? '<span class="pill">T ' + esc(v.temp || v.temperature) + '</span>' : '') +
            (al.length ? '<span class="pill allergy"><i class="ti ti-alert-triangle"></i> ' + al.map(esc).join(', ') + '</span>' : '') +
            '<a class="back" href="doctor-dashboard.html"><i class="ti ti-arrow-left"></i> <span>Back to Doctor</span></a>';

        var host = document.querySelector('.pc-topbar, .topbar, header');
        if (host && host.parentNode) host.parentNode.insertBefore(bar, host.nextSibling);
        else document.body.insertBefore(bar, document.body.firstChild);

        window.pcHandoffPatient = p;
        window.dispatchEvent(new CustomEvent('pcHandoffReady', { detail: p }));
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
