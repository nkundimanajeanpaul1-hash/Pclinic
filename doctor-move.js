/* ============================================================
   PCLINIC — MOVE / EDIT PATIENT
   Closes the gap between displaying demography+location and being
   able to SET them.

   Before this, doctor-actionbar.js showed district, sector and
   location on the strip, and the finder could filter by location —
   but nothing in the app ever wrote those fields. Registration did
   not collect them and setPatientLocation() was never called, so in
   a real deployment every patient showed "OPD" and a blank district
   forever.

   Adds:
     • Move patient — OPD / Ward / Theatre / ICU / … with a reason,
       recorded in locationHistory with who and when.
     • Edit details — first name, family name, district, sector,
       cell, national ID, insurance.
   ============================================================ */
(function () {
    'use strict';

    var $ = function (s, r) { return (r || document).querySelector(s); };
    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function P() { return (window.pcPatient && window.pcPatient.get()) || window.currentPatient || null; }

    var LOCS = (window.pcActionBar && window.pcActionBar.locations) || [
        { id:'OPD', label:'OPD', icon:'ti-door-enter' },
        { id:'Ward', label:'Ward', icon:'ti-bed' },
        { id:'Theatre', label:'Theatre', icon:'ti-scissors' },
        { id:'Emergency', label:'Emergency', icon:'ti-ambulance' },
        { id:'ICU', label:'ICU', icon:'ti-heartbeat' },
        { id:'Maternity', label:'Maternity', icon:'ti-baby-carriage' },
        { id:'Physio', label:'Physiotherapy', icon:'ti-accessible' },
        { id:'Lab', label:'Laboratory', icon:'ti-test-pipe' },
        { id:'Radiology', label:'Radiology', icon:'ti-radioactive' },
        { id:'Pharmacy', label:'Pharmacy', icon:'ti-pill' },
        { id:'Discharged', label:'Discharged', icon:'ti-door-exit' }
    ];

    var DISTRICTS = ['Bugesera','Burera','Gakenke','Gasabo','Gatsibo','Gicumbi','Gisagara','Huye',
        'Kamonyi','Karongi','Kayonza','Kicukiro','Kirehe','Muhanga','Musanze','Ngoma','Ngororero',
        'Nyabihu','Nyagatare','Nyamagabe','Nyamasheke','Nyanza','Nyarugenge','Nyaruguru','Rubavu',
        'Ruhango','Rulindo','Rusizi','Rutsiro','Rwamagana'];

    var INSURERS = ['', 'RSSB', 'Mutuelle de Santé', 'MMI', 'Radiant', 'Britam', 'Sanlam', 'Prime', 'Other'];

    /* ══════════ shared modal shell ══════════ */
    function modal(html, onOpen) {
        var ov = document.createElement('div');
        ov.className = 'mv-ov';
        ov.innerHTML = '<div class="mv-mod" role="dialog" aria-modal="true">' +
                       '<button class="mv-x" aria-label="Close"><i class="ti ti-x"></i></button>' + html + '</div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add('open'); });
        function close() { ov.classList.remove('open'); setTimeout(function () { ov.remove(); }, 220); }
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        $('.mv-x', ov).onclick = close;
        document.addEventListener('keydown', function h(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', h); }
        });
        if (onOpen) onOpen(ov, close);
        return { el: ov, close: close };
    }

    /* ══════════ MOVE PATIENT ══════════ */
    function movePatient() {
        var p = P();
        if (!p) { if (window.pcPatient) pcPatient.require('move a patient'); return; }
        var here = p.location || p.department || 'OPD';

        modal(
            '<h3><i class="ti ti-arrows-exchange"></i> Move Patient</h3>' +
            '<div class="mv-sub">' + esc(p.name || (p.firstName + ' ' + p.lastName)) +
                ' · currently in <b>' + esc(here) + '</b></div>' +
            '<label class="mv-lbl">Move to</label>' +
            '<div class="mv-grid" id="mvGrid">' +
                LOCS.map(function (l) {
                    return '<button class="mv-loc' + (l.id === here ? ' cur' : '') + '" data-l="' + esc(l.id) + '"' +
                           (l.id === here ? ' disabled' : '') + '>' +
                           '<i class="ti ' + l.icon + '"></i> ' + esc(l.label) +
                           (l.id === here ? '<span class="mv-now">now</span>' : '') + '</button>';
                }).join('') +
            '</div>' +
            '<label class="mv-lbl">Reason / note <span style="text-transform:none;font-weight:400">(optional)</span></label>' +
            '<input class="mv-in" id="mvNote" placeholder="e.g. for elective surgery">' +
            '<div id="mvHist"></div>',
            function (ov, close) {
                // Recent movement history — useful context before moving again
                var h = (p.locationHistory || []).slice(-4).reverse();
                if (h.length) {
                    $('#mvHist', ov).innerHTML =
                        '<label class="mv-lbl">Recent movements</label>' +
                        h.map(function (x) {
                            return '<div class="mv-hrow"><b>' + esc(x.from || '—') + ' → ' + esc(x.to) + '</b>' +
                                   '<span>' + new Date(x.at).toLocaleString('en-GB',
                                        { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) +
                                   ' · ' + esc(x.by || '') + '</span></div>';
                        }).join('');
                }
                $('#mvGrid', ov).addEventListener('click', function (e) {
                    var b = e.target.closest('.mv-loc');
                    if (!b || b.disabled) return;
                    var to = b.dataset.l;
                    var note = $('#mvNote', ov).value.trim();
                    if (typeof window.setPatientLocation === 'function') {
                        Promise.resolve(window.setPatientLocation(p.id, to, note)).then(function () {
                            if (window.pcPatient) pcPatient.set(p.id, { silent: true });
                            refreshStrip();
                            if (window.pcToast) pcToast('Moved to ' + to, 'success');
                            // Tell the receiving department
                            if (window.pcMessages) {
                                var roleOf = { Theatre:'theater', Lab:'lab', Radiology:'radio',
                                               Pharmacy:'pharmacy', Physio:'physio', Ward:'nurse',
                                               ICU:'nurse', Maternity:'nurse', Emergency:'nurse' };
                                var r = roleOf[to];
                                if (r) pcMessages.send({
                                    text: (p.name || 'Patient') + ' has been moved to ' + to +
                                          (note ? ' — ' + note : ''),
                                    toRoles: [r], category: 'transfer',
                                    patientId: p.id, patientName: p.name || ''
                                });
                            }
                            close();
                        });
                    } else if (window.pcToast) pcToast('Location system unavailable', 'error');
                });
            });
    }

    /* ══════════ EDIT DETAILS ══════════ */
    function editPatient() {
        var p = P();
        if (!p) { if (window.pcPatient) pcPatient.require('edit details'); return; }
        var ins = p.insurance || {};

        modal(
            '<h3><i class="ti ti-user-edit"></i> Patient Details</h3>' +
            '<div class="mv-sub">' + esc(p.mrn || ('ID ' + p.id)) + '</div>' +
            '<div class="mv-row">' +
                '<div><label class="mv-lbl">First name</label>' +
                '<input class="mv-in" id="edF" value="' + esc(p.firstName || '') + '"></div>' +
                '<div><label class="mv-lbl">Family name</label>' +
                '<input class="mv-in" id="edL" value="' + esc(p.lastName || '') + '"></div>' +
            '</div>' +
            '<div class="mv-row">' +
                '<div><label class="mv-lbl">Phone</label>' +
                '<input class="mv-in" id="edPh" value="' + esc(p.phone || '') + '"></div>' +
                '<div><label class="mv-lbl">National ID</label>' +
                '<input class="mv-in" id="edNid" value="' + esc(p.nationalId || '') + '"></div>' +
            '</div>' +
            '<div class="mv-row">' +
                '<div><label class="mv-lbl">District</label>' +
                '<input class="mv-in" id="edD" list="mvDist" value="' + esc(p.district || '') + '">' +
                '<datalist id="mvDist">' + DISTRICTS.map(function (d) {
                    return '<option value="' + d + '">'; }).join('') + '</datalist></div>' +
                '<div><label class="mv-lbl">Sector</label>' +
                '<input class="mv-in" id="edS" value="' + esc(p.sector || '') + '"></div>' +
                '<div><label class="mv-lbl">Cell</label>' +
                '<input class="mv-in" id="edC" value="' + esc(p.cell || '') + '"></div>' +
            '</div>' +
            '<div class="mv-row">' +
                '<div><label class="mv-lbl">Insurer</label>' +
                '<select class="mv-in" id="edIns">' + INSURERS.map(function (i) {
                    return '<option value="' + esc(i) + '"' +
                           (i === (ins.provider || '') ? ' selected' : '') + '>' +
                           (i || '— none / cash —') + '</option>'; }).join('') + '</select></div>' +
                '<div><label class="mv-lbl">Policy number</label>' +
                '<input class="mv-in" id="edPol" value="' + esc(ins.policyNumber || '') + '"></div>' +
            '</div>' +
            '<label class="mv-lbl">Allergies <span style="text-transform:none;font-weight:400">(comma separated)</span></label>' +
            '<input class="mv-in" id="edAl" value="' +
                esc(Array.isArray(p.allergies) ? p.allergies.join(', ') : (p.allergies || '')) + '">' +
            '<button class="mv-save" id="edSave"><i class="ti ti-device-floppy"></i> Save changes</button>',
            function (ov, close) {
                $('#edSave', ov).onclick = function () {
                    var f = $('#edF', ov).value.trim(), l = $('#edL', ov).value.trim();
                    if (!f && !l) { if (window.pcToast) pcToast('A name is required', 'error'); return; }
                    var al = $('#edAl', ov).value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
                    var patch = {
                        firstName: f, lastName: l, name: (f + ' ' + l).trim(),
                        phone: $('#edPh', ov).value.trim(),
                        nationalId: $('#edNid', ov).value.trim(),
                        district: $('#edD', ov).value.trim(),
                        sector: $('#edS', ov).value.trim(),
                        cell: $('#edC', ov).value.trim(),
                        allergies: al,
                        insurance: Object.assign({}, ins, {
                            provider: $('#edIns', ov).value,
                            policyNumber: $('#edPol', ov).value.trim()
                        })
                    };
                    if (typeof window.updatePatient !== 'function') {
                        if (window.pcToast) pcToast('Cannot save — data layer missing', 'error'); return;
                    }
                    Promise.resolve(window.updatePatient(p.id, patch)).then(function () {
                        if (window.pcPatient) pcPatient.set(p.id, { silent: true });
                        refreshStrip();
                        if (window.pcToast) pcToast('Details updated', 'success');
                        close();
                    });
                };
            });
    }

    // Force the context strip to redraw with the new values
    function refreshStrip() {
        var el = $('#dcCtx');
        if (el) delete el.dataset.enrichedFor;
        window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: P() }));
    }

    /* ══════════ ADD TO THE ACTION BAR ══════════ */
    function inject() {
        var bar = $('#dcBar');
        if (!bar || $('#mvBtn')) return;
        var patientBtn = bar.querySelector('.ab-btn[data-act="patient"]');
        if (!patientBtn) return;

        function mk(id, label, icon, fn) {
            var b = document.createElement('button');
            b.className = 'ab-btn'; b.id = id; b.dataset.act = id;
            b.title = label;
            b.style.setProperty('--c', '#3a3a3c');
            b.style.setProperty('--b', '#ffffff');
            b.innerHTML = '<i class="ti ' + icon + '"></i><span>' + label + '</span>';
            b.onclick = fn;
            return b;
        }
        var move = mk('mvBtn', 'Move', 'ti-arrows-exchange', movePatient);
        var edit = mk('edBtn', 'Edit', 'ti-user-edit', editPatient);
        patientBtn.parentNode.insertBefore(edit, patientBtn.nextSibling);
        patientBtn.parentNode.insertBefore(move, edit.nextSibling);
        syncOff();
    }
    function syncOff() {
        var on = !!P();
        ['mvBtn', 'edBtn'].forEach(function (id) {
            var b = document.getElementById(id);
            if (b) b.classList.toggle('ab-off', !on);
        });
    }

    /* ══════════ STYLES ══════════ */
    var css = document.createElement('style');
    css.textContent = `
    .mv-ov{position:fixed;inset:0;z-index:9700;background:rgba(2,10,24,.55);
        -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:center;
        justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .22s}
    .mv-ov.open{opacity:1;pointer-events:auto}
    .mv-mod{position:relative;width:100%;max-width:600px;max-height:86vh;overflow-y:auto;
        background:var(--s1,#fff);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.4);padding:20px 22px;
        transform:translateY(14px) scale(.97);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
    .mv-ov.open .mv-mod{transform:none}
    .mv-mod h3{font-size:16px;font-weight:800;display:flex;align-items:center;gap:9px;padding-right:36px}
    .mv-sub{font-size:11.5px;color:var(--tm,#8e8e93);margin:3px 0 12px}
    .mv-x{position:absolute;top:14px;right:16px;width:32px;height:32px;border-radius:50%;border:0;
        background:rgba(0,0,0,.06);color:#666;cursor:pointer;display:grid;place-items:center;transition:all .2s}
    .mv-x:hover{background:rgba(0,0,0,.13);transform:rotate(90deg)}
    .mv-lbl{display:block;font-size:10px;font-weight:700;color:var(--tm,#8e8e93);text-transform:uppercase;
        letter-spacing:.04em;margin:12px 0 5px}
    .mv-in{width:100%;height:34px;padding:0 11px;border-radius:9px;border:.5px solid rgba(0,0,0,.12);
        background:var(--s1,#fff);color:var(--tp,#1c1c1e);font-family:inherit;font-size:13px;outline:none}
    .mv-in:focus{border-color:#0071e3;box-shadow:0 0 0 4px rgba(0,113,227,.15)}
    .mv-row{display:flex;gap:9px}.mv-row>div{flex:1;min-width:0}
    .mv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:7px}
    .mv-loc{position:relative;display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:10px;
        border:.5px solid rgba(0,0,0,.09);background:var(--s1,#fff);cursor:pointer;font-family:inherit;
        font-size:12.5px;font-weight:600;color:var(--tp,#1c1c1e);
        transition:all .24s cubic-bezier(.34,1.56,.64,1)}
    .mv-loc:hover:not(:disabled){background:#eaf2ff;border-color:#0071e3;color:#0071e3;
        transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,113,227,.18)}
    .mv-loc:disabled{opacity:.55;cursor:default;background:#f2f2f4}
    .mv-loc i{font-size:15px;opacity:.8}
    .mv-now{position:absolute;top:5px;right:7px;font-size:8.5px;font-weight:800;color:#1a7a32;
        background:#e9f9ee;padding:1px 6px;border-radius:20px;text-transform:uppercase}
    .mv-hrow{display:flex;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:8px;
        background:#f7f7f9;margin-bottom:4px;font-size:11.5px}
    .mv-hrow span{color:#8e8e93;white-space:nowrap}
    .mv-save{width:100%;height:38px;margin-top:16px;border:0;border-radius:10px;cursor:pointer;
        background:linear-gradient(180deg,#3d94ff,#0071e3);color:#fff;font-family:inherit;font-size:13px;
        font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;
        box-shadow:0 4px 14px rgba(0,113,227,.3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
    .mv-save:hover{transform:translateY(-2px)}
    .mv-save:active{transform:scale(.97)}
    [data-theme="dark"] .mv-loc{background:#2c2c2e;border-color:rgba(255,255,255,.08);color:#f5f5f7}
    [data-theme="dark"] .mv-hrow{background:#2c2c2e}
    @media(max-width:560px){.mv-row{flex-direction:column;gap:0}}`;
    document.head.appendChild(css);

    /* ══════════ INIT ══════════ */
    function init() {
        var tries = 0;
        (function wait() {
            if ($('#dcBar') && $('.ab-btn[data-act="patient"]')) { inject(); return; }
            if (++tries < 40) setTimeout(wait, 200);
        })();
        window.addEventListener('pcPatientChanged', function () { setTimeout(function () { inject(); syncOff(); }, 40); });
        setInterval(inject, 3000);   // the bar can be rebuilt
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.pcMove = { move: movePatient, edit: editPatient, locations: LOCS };
    console.log('🚚 Move / edit patient ready');
})();
