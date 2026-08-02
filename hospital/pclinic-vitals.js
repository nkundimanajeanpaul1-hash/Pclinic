/* ============================================================
   PCLINIC — VITALS POPUP

     pcVitals.open()            — show every vital sign recorded
     pcVitals.open({add:true})  — open straight on the "record new" form

   Before this, Vitals was only reachable on the doctor dashboard
   (doctor.js viewAllVitals), it needed a #stat-modal that only that
   page had, and it silently did nothing on any file page. It also
   showed a wall of text with no trend. This is a self-contained
   overlay that works anywhere pclinic-state.js is loaded.
   ============================================================ */
(function () {
    'use strict';

    var STYLE_ID = 'pcVitalsCss';

    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function $(s, r) { return (r || document).querySelector(s); }

    function patient() {
        if (window.pcFile && pcFile.patient) { var p = pcFile.patient(); if (p) return p; }
        if (window.pcPatient && pcPatient.get) { var q = pcPatient.get(); if (q) return q; }
        return window.currentPatient || null;
    }
    function nameOf(p) {
        if (!p) return '';
        return p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ' + p.id);
    }
    function staff() { return window.currentStaff || {}; }

    /* Normalise the several shapes vitals were saved in over time */
    function norm(v) {
        return {
            at:     v.at || v.timestamp || v.date || v.recordedAt || '',
            bp:     v.bp || v.bloodPressure || '',
            temp:   v.temp || v.temperature || '',
            pulse:  v.pulse || v.hr || v.heartRate || '',
            rr:     v.rr || v.respRate || v.respiratoryRate || '',
            spo2:   v.spo2 || v.oxygen || v.spO2 || '',
            weight: v.weight || '',
            height: v.height || '',
            by:     v.recordedBy || v.by || v.nurse || ''
        };
    }

    /* Reference ranges — used only to colour a reading, never to block */
    function flag(kind, raw) {
        var n = parseFloat(String(raw).replace(/[^\d.]/g, ''));
        if (!isFinite(n)) return '';
        if (kind === 'temp')  return n >= 38 ? 'hi' : (n < 35.5 ? 'lo' : '');
        if (kind === 'pulse') return n > 100 ? 'hi' : (n < 60 ? 'lo' : '');
        if (kind === 'rr')    return n > 20 ? 'hi' : (n < 12 ? 'lo' : '');
        if (kind === 'spo2')  return n < 94 ? 'lo' : '';
        if (kind === 'bp') {
            var m = String(raw).match(/(\d+)\s*\/\s*(\d+)/);
            if (!m) return '';
            var s = +m[1], d = +m[2];
            if (s >= 140 || d >= 90) return 'hi';
            if (s < 90 || d < 60) return 'lo';
        }
        return '';
    }

    function css() {
        if (document.getElementById(STYLE_ID)) return;
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent =
        '#pcVitOv{position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,.36);' +
          '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:grid;place-items:center;' +
          'padding:22px;opacity:0;transition:opacity .22s}' +
        '#pcVitOv.open{opacity:1}' +
        '#pcVitOv .card{width:min(760px,100%);max-height:min(80vh,720px);display:flex;flex-direction:column;' +
          'background:var(--s0,#fff);color:var(--tp,#1c1c1e);border:.5px solid var(--glass-brd,rgba(0,0,0,.1));' +
          'border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden;' +
          'translate:0 14px;scale:.96;transition:translate .34s cubic-bezier(.34,1.56,.64,1),scale .34s cubic-bezier(.34,1.56,.64,1)}' +
        '#pcVitOv.open .card{translate:0 0;scale:1}' +
        '#pcVitOv .hd{display:flex;align-items:center;gap:10px;padding:14px 17px;' +
          'border-bottom:.5px solid var(--bd,rgba(0,0,0,.08));flex-shrink:0}' +
        '#pcVitOv .hd b{font-size:14.5px}' +
        '#pcVitOv .hd .who{font-size:11.5px;color:var(--tm,#8e8e93)}' +
        '#pcVitOv .hd i.tt{color:var(--red,#ff3b30);font-size:18px}' +
        '#pcVitOv .x{margin-left:auto;width:28px;height:28px;border-radius:50%;cursor:pointer;' +
          'border:.5px solid var(--bd,rgba(0,0,0,.1));background:var(--s2,#f2f2f4);color:inherit;font-size:15px}' +
        '#pcVitOv .bd{padding:14px 17px;overflow:auto;flex:1;min-height:0}' +
        '#pcVitOv .ft{padding:11px 17px;border-top:.5px solid var(--bd,rgba(0,0,0,.08));' +
          'display:flex;gap:8px;justify-content:flex-end;flex-shrink:0}' +
        '#pcVitOv .btn{height:33px;padding:0 15px;border-radius:9px;cursor:pointer;font-family:inherit;' +
          'font-size:12.5px;font-weight:600;border:.5px solid rgba(0,0,0,.09);background:var(--s1,#fff);color:inherit}' +
        '#pcVitOv .btn.p{background:linear-gradient(180deg,#3d94ff,#0071e3);color:#fff;border-color:transparent}' +
        /* latest reading tiles */
        '#pcVitOv .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:9px;margin-bottom:15px}' +
        '#pcVitOv .tile{padding:11px 12px;border-radius:12px;background:var(--s3,#f7f7f9);' +
          'border:.5px solid rgba(0,0,0,.05)}' +
        '#pcVitOv .tile .k{font-size:9.5px;font-weight:700;text-transform:uppercase;' +
          'letter-spacing:.05em;color:var(--tm,#8e8e93)}' +
        '#pcVitOv .tile .v{font-size:19px;font-weight:800;margin-top:3px;letter-spacing:-.4px}' +
        '#pcVitOv .tile .u{font-size:10.5px;font-weight:600;color:var(--tm,#8e8e93);margin-left:2px}' +
        '#pcVitOv .tile.hi{background:#ffebe9;border-color:rgba(255,59,48,.25)}' +
        '#pcVitOv .tile.hi .v{color:#8a1f1a}' +
        '#pcVitOv .tile.lo{background:#eaf2ff;border-color:rgba(0,113,227,.25)}' +
        '#pcVitOv .tile.lo .v{color:#0043a8}' +
        /* history table */
        '#pcVitOv table{width:100%;border-collapse:collapse;font-size:12px}' +
        '#pcVitOv th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;' +
          'color:var(--tm,#8e8e93);padding:7px 8px;border-bottom:.5px solid var(--bd,rgba(0,0,0,.08));' +
          'position:sticky;top:0;background:var(--s0,#fff)}' +
        '#pcVitOv td{padding:8px;border-bottom:.5px solid rgba(0,0,0,.05)}' +
        '#pcVitOv td.hi{color:#8a1f1a;font-weight:700}' +
        '#pcVitOv td.lo{color:#0043a8;font-weight:700}' +
        '#pcVitOv tr:last-child td{border-bottom:0}' +
        '#pcVitOv .empty{text-align:center;padding:30px 16px;color:var(--tm,#8e8e93);font-size:12.5px}' +
        '#pcVitOv .empty i{font-size:32px;opacity:.3;display:block;margin-bottom:9px}' +
        '#pcVitOv .lbl{display:block;font-size:10px;font-weight:700;text-transform:uppercase;' +
          'letter-spacing:.04em;color:var(--tm,#8e8e93);margin:0 0 4px}' +
        '#pcVitOv .frm{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}' +
        '#pcVitOv .frm input{width:100%;padding:8px 10px;border-radius:9px;font-family:inherit;font-size:12.5px;' +
          'border:.5px solid rgba(0,0,0,.1);background:var(--s1,#fff);color:inherit;outline:none}' +
        '#pcVitOv .frm input:focus{border-color:#0071e3;box-shadow:0 0 0 4px rgba(0,113,227,.15)}' +
        '[data-theme="dark"] #pcVitOv th{background:#0a0a0c}' +
        '@media print{#pcVitOv{display:none!important}}';
        document.head.appendChild(s);
    }

    var openEl = null;

    function close() {
        if (!openEl) return;
        var el = openEl; openEl = null;
        el.classList.remove('open');
        document.removeEventListener('keydown', onKey);
        setTimeout(function () { el.remove(); }, 240);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function rows(p) {
        return (p.vitals || []).map(norm).slice().reverse();
    }

    function tiles(v) {
        var defs = [
            ['bp', 'Blood pressure', v.bp, 'mmHg'],
            ['temp', 'Temperature', v.temp, '°C'],
            ['pulse', 'Pulse', v.pulse, 'bpm'],
            ['rr', 'Resp. rate', v.rr, '/min'],
            ['spo2', 'SpO₂', v.spo2, '%'],
            ['weight', 'Weight', v.weight, '']
        ];
        return defs.filter(function (d) { return d[2]; }).map(function (d) {
            var f = flag(d[0], d[2]);
            return '<div class="tile ' + f + '"><div class="k">' + esc(d[1]) + '</div>' +
                   '<div class="v">' + esc(d[2]) + (d[3] ? '<span class="u">' + d[3] + '</span>' : '') +
                   '</div></div>';
        }).join('');
    }

    function table(list) {
        return '<table><thead><tr><th>When</th><th>BP</th><th>Temp</th><th>Pulse</th>' +
            '<th>RR</th><th>SpO₂</th><th>Weight</th><th>By</th></tr></thead><tbody>' +
            list.map(function (v) {
                var d = v.at ? new Date(v.at) : null;
                function c(kind, val) {
                    if (!val) return '<td>—</td>';
                    return '<td class="' + flag(kind, val) + '">' + esc(val) + '</td>';
                }
                return '<tr><td style="white-space:nowrap">' +
                    (d && !isNaN(d) ? esc(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) +
                        '<div style="font-size:10px;color:#8e8e93">' +
                        esc(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) + '</div>'
                     : '—') + '</td>' +
                    c('bp', v.bp) + c('temp', v.temp) + c('pulse', v.pulse) +
                    c('rr', v.rr) + c('spo2', v.spo2) +
                    '<td>' + esc(v.weight || '—') + '</td>' +
                    '<td style="font-size:11px;color:#8e8e93">' + esc(v.by || '—') + '</td></tr>';
            }).join('') + '</tbody></table>';
    }

    function addForm() {
        var f = [
            ['nv_bp', 'BP', '120/80'], ['nv_temp', 'Temp °C', '37.0'],
            ['nv_pulse', 'Pulse', '76'], ['nv_rr', 'Resp rate', '16'],
            ['nv_spo2', 'SpO₂ %', '98'], ['nv_weight', 'Weight', '70kg']
        ];
        return '<div class="frm">' + f.map(function (x) {
            return '<div><label class="lbl" for="' + x[0] + '">' + esc(x[1]) + '</label>' +
                   '<input id="' + x[0] + '" placeholder="' + esc(x[2]) + '"></div>';
        }).join('') + '</div>';
    }

    function open(opts) {
        opts = opts || {};
        var p = patient();
        if (!p) {
            if (window.pcToast) pcToast('Select a patient first', 'error');
            return null;
        }
        css();
        close();

        var list = rows(p);
        var latest = list[0] || null;
        var adding = !!opts.add;

        var ov = document.createElement('div');
        ov.id = 'pcVitOv';
        ov.className = 'noprint';
        ov.innerHTML =
            '<div class="card" role="dialog" aria-modal="true" aria-label="Vital signs">' +
              '<div class="hd"><i class="ti ti-heartbeat tt"></i>' +
                '<div><b>Vital signs</b>' +
                  '<div class="who">' + esc(nameOf(p)) + ' · ' + list.length +
                  ' record' + (list.length === 1 ? '' : 's') + '</div></div>' +
                '<button class="x" aria-label="Close">&times;</button></div>' +
              '<div class="bd" id="pcVitBody"></div>' +
              '<div class="ft" id="pcVitFoot"></div>' +
            '</div>';
        document.body.appendChild(ov);
        openEl = ov;

        function paint() {
            var body = $('#pcVitBody', ov), foot = $('#pcVitFoot', ov);
            if (adding) {
                body.innerHTML = '<div style="font-size:11.5px;color:var(--tm);margin-bottom:11px">' +
                    'Recording for <b>' + esc(nameOf(p)) + '</b>. Leave anything you did not measure blank.</div>' +
                    addForm();
                foot.innerHTML = '<button class="btn" id="pcVitCancel">Cancel</button>' +
                                 '<button class="btn p" id="pcVitSave">Save reading</button>';
                $('#pcVitCancel', ov).onclick = function () { adding = false; paint(); };
                $('#pcVitSave', ov).onclick = save;
                var first = $('#nv_bp', ov); if (first) setTimeout(function () { first.focus(); }, 120);
                return;
            }
            if (!list.length) {
                body.innerHTML = '<div class="empty"><i class="ti ti-heartbeat"></i>' +
                    'No vital signs recorded for this patient yet.</div>';
            } else {
                body.innerHTML =
                    (latest ? '<div style="font-size:10px;font-weight:700;text-transform:uppercase;' +
                        'letter-spacing:.05em;color:var(--tm);margin-bottom:7px">Latest' +
                        (latest.at ? ' · ' + esc(new Date(latest.at).toLocaleString('en-GB')) : '') +
                        '</div><div class="tiles">' + tiles(latest) + '</div>' : '') +
                    '<div style="font-size:10px;font-weight:700;text-transform:uppercase;' +
                    'letter-spacing:.05em;color:var(--tm);margin:0 0 5px">All readings</div>' +
                    table(list);
            }
            foot.innerHTML = '<button class="btn" id="pcVitClose">Close</button>' +
                             '<button class="btn p" id="pcVitAdd"><i class="ti ti-plus"></i> Record vitals</button>';
            $('#pcVitClose', ov).onclick = close;
            $('#pcVitAdd', ov).onclick = function () { adding = true; paint(); };
        }

        function save() {
            function g(id) { var e = $('#' + id, ov); return e ? e.value.trim() : ''; }
            var rec = { bp: g('nv_bp'), temp: g('nv_temp'), pulse: g('nv_pulse'),
                        rr: g('nv_rr'), spo2: g('nv_spo2'), weight: g('nv_weight') };
            if (!rec.bp && !rec.temp && !rec.pulse && !rec.rr && !rec.spo2 && !rec.weight) {
                if (window.pcToast) pcToast('Enter at least one measurement', 'error');
                return;
            }
            rec.recordedBy = staff().name || '';
            rec.at = new Date().toISOString();
            var ok = false;
            try {
                if (typeof window.addVitals === 'function') { window.addVitals(p.id, rec); ok = true; }
                else if (typeof window.updatePatient === 'function') {
                    window.updatePatient(p.id, { vitals: (p.vitals || []).concat([rec]) }); ok = true;
                }
            } catch (e) {}
            if (!ok) { if (window.pcToast) pcToast('Could not save vitals here', 'error'); return; }
            // Re-read from the store: `p` is a snapshot taken when the popup
            // opened, so it does not contain the row we just wrote. Prefer a
            // fresh lookup by id, and fall back to appending locally.
            var fresh = null;
            try {
                if (typeof getPatients === 'function') {
                    fresh = (getPatients() || []).filter(function (x) {
                        return String(x.id) === String(p.id); })[0] || null;
                }
            } catch (e) {}
            if (fresh) p = fresh;
            else p = Object.assign({}, p, { vitals: (p.vitals || []).concat([rec]) });
            list = rows(p); latest = list[0] || null;
            adding = false; paint();
            if (window.pcToast) pcToast('Vitals recorded', 'success');
            window.dispatchEvent(new CustomEvent('pcVitalsUpdated', { detail: { patientId: p.id } }));
        }

        $('.x', ov).onclick = close;
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        document.addEventListener('keydown', onKey);
        paint();
        requestAnimationFrame(function () { ov.classList.add('open'); });
        return ov;
    }

    window.pcVitals = { open: open, close: close, flag: flag };
})();
