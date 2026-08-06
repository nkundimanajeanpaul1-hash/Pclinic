/* ============================================================
   PCLINIC — DOCTOR COMMAND BAR
   Adds the "requests first" layer to the doctor dashboard:

     • A pinned command bar directly under the header — every
       primary action one tap away, before any tabs.
     • Order composers (Lab, Imaging, Procedure) that write to the
       shared order stream, so requests actually reach departments.
     • Prescription safety gate: allergy + interaction check runs
       BEFORE anything is saved.
     • Live patient context strip so vitals/allergies stay visible.
     • Autosave on every composer.

   Loads after doctor.js and reuses its currentPatient.
   ============================================================ */
(function () {
    'use strict';

    var $ = function (s, r) { return (r || document).querySelector(s); };
    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function money(n) { return 'RWF ' + (Number(n) || 0).toLocaleString('en-US'); }
    function patient() {
        return (window.pcPatient && window.pcPatient.get())
            || window.currentPatient || null;
    }

    function needPatient() {
        if (!patient()) {
            if (window.pcToast) pcToast('Select a patient first', 'error');
            else alert('Select a patient first');
            return true;
        }
        return false;
    }

    /* ══════════════ STYLES ══════════════ */
    var css = document.createElement('style');
    css.textContent = `
    /* ── Command bar ── */
    .dc-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 16px;
        background:var(--glass-bg,rgba(255,255,255,.55));
        -webkit-backdrop-filter:var(--glass-blur,saturate(180%) blur(20px));
        backdrop-filter:var(--glass-blur,saturate(180%) blur(20px));
        border-bottom:.5px solid var(--glass-brd,rgba(255,255,255,.65));
        position:sticky;top:0;z-index:60}
    .dc-btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border-radius:10px;
        border:.5px solid rgba(0,0,0,.08);background:#fff;color:var(--tp,#1c1c1e);
        font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;
        box-shadow:0 1px 3px rgba(0,0,0,.07),inset 0 1px 0 rgba(255,255,255,.9);
        transition:transform .3s cubic-bezier(.34,1.56,.64,1),box-shadow .3s,background .25s;
        -webkit-tap-highlight-color:transparent;position:relative;overflow:hidden}
    .dc-btn:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 4px 14px rgba(0,0,0,.13)}
    .dc-btn:active{transform:scale(.95);transition-duration:.09s}
    .dc-btn i{font-size:15px}
    .dc-btn.lab{color:#5c2475;background:#f5eaff}
    .dc-btn.img{color:#7a4500;background:#fff4e0}
    .dc-btn.rx{color:#1a7a32;background:#e9f9ee}
    .dc-btn.proc{color:#0071e3;background:#eaf2ff}
    .dc-btn.bill{color:#8a1f1a;background:#ffebe9}
    .dc-btn.primary{background:linear-gradient(180deg,#3d94ff,#0071e3);color:#fff;border-color:transparent;
        box-shadow:0 4px 14px rgba(0,113,227,.32),inset 0 1px 0 rgba(255,255,255,.4)}
    [data-theme="dark"] .dc-btn{background:#2c2c2e;color:#f5f5f7;border-color:rgba(255,255,255,.1)}

    /* ── Patient context strip ── */
    .dc-ctx{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 16px;font-size:12px;
        background:rgba(0,113,227,.05);border-bottom:.5px solid rgba(0,0,0,.06)}
    #dcCtx.dc-ctx:has(.oc-demo-bar),
    #dcCtx.dc-ctx.has-oc-demo-bar{display:block;padding:0;background:transparent;border-bottom:0}
    .dc-ctx .nm{font-weight:800;font-size:13.5px}
    .dc-ctx .pill{padding:3px 10px;border-radius:30px;background:#fff;border:.5px solid rgba(0,0,0,.07);
        font-size:11px;font-weight:600}
    .dc-ctx .allergy{background:#ffebe9;color:#8a1f1a;border-color:transparent}
    .dc-ctx .none{color:var(--tm,#8e8e93)}
    [data-theme="dark"] .dc-ctx{background:rgba(0,113,227,.1)}
    [data-theme="dark"] .dc-ctx .pill{background:#2c2c2e;color:#f5f5f7}

    /* ── Composer modal ── */
    .dc-ov{position:fixed;inset:0;z-index:9000;background:rgba(2,10,24,.55);
        -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
        display:flex;align-items:center;justify-content:center;padding:20px;
        opacity:0;pointer-events:none;transition:opacity .25s}
    .dc-ov.open{opacity:1;pointer-events:auto}
    .dc-mod{width:100%;max-width:640px;max-height:88vh;overflow-y:auto;background:var(--s1,#fff);
        border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.4);padding:20px 22px 18px;
        transform:translateY(14px) scale(.97);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
    .dc-ov.open .dc-mod{transform:none}
    .dc-mod h3{font-size:16px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:9px;
        margin-bottom:3px;padding-right:36px}
    .dc-mod .sub{font-size:11.5px;color:var(--tm,#8e8e93);margin-bottom:14px}
    .dc-x{position:absolute;top:14px;right:16px;width:32px;height:32px;border-radius:50%;border:0;
        background:rgba(0,0,0,.06);color:#666;font-size:16px;cursor:pointer;display:grid;place-items:center;
        transition:all .2s}
    .dc-x:hover{background:rgba(0,0,0,.13);transform:rotate(90deg)}
    .dc-mod{position:relative}
    .dc-lbl{display:block;font-size:10.5px;font-weight:700;color:var(--tm,#8e8e93);
        text-transform:uppercase;letter-spacing:.05em;margin:12px 0 6px}
    .dc-in,.dc-mod select,.dc-mod textarea{width:100%;padding:9px 11px;border-radius:9px;
        border:.5px solid rgba(0,0,0,.1);background:var(--s1,#fff);color:var(--tp,#1c1c1e);
        font-family:inherit;font-size:13px;outline:none}
    .dc-mod textarea{min-height:64px;resize:vertical}
    .dc-in:focus,.dc-mod select:focus,.dc-mod textarea:focus{border-color:#0071e3;box-shadow:0 0 0 4px rgba(0,113,227,.15)}
    .dc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:7px;max-height:230px;
        overflow-y:auto;padding:3px}
    .dc-opt{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:9px;
        border:.5px solid rgba(0,0,0,.08);background:var(--s1,#fff);cursor:pointer;font-size:12.5px;
        transition:all .22s cubic-bezier(.34,1.56,.64,1)}
    .dc-opt:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .dc-opt input{width:16px;height:16px;accent-color:#0071e3;cursor:pointer;flex-shrink:0;margin:0}
    .dc-opt.on{background:#eaf2ff;border-color:#0071e3}
    .dc-opt .pr{margin-left:auto;font-size:11px;font-weight:700;color:#0071e3;white-space:nowrap}
    .dc-prio{display:inline-flex;padding:3px;gap:2px;border-radius:10px;background:rgba(120,120,128,.14)}
    .dc-prio button{border:0;background:transparent;font-family:inherit;font-size:12px;font-weight:700;
        color:var(--ts,#3a3a3c);padding:6px 14px;border-radius:8px;cursor:pointer;transition:all .25s}
    .dc-prio button.on{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12)}
    .dc-prio button[data-p="stat"].on{background:#ff3b30;color:#fff}
    .dc-prio button[data-p="urgent"].on{background:#ff9500;color:#fff}
    .dc-tot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:11px;
        border-top:.5px dashed rgba(0,0,0,.12);font-size:15px;font-weight:800}
    .dc-tot span:last-child{color:#0071e3}
    .dc-act{display:flex;gap:9px;margin-top:14px}
    .dc-act .dc-btn{flex:1;justify-content:center;height:38px}

    /* ── Safety warnings ── */
    .dc-warn{margin:12px 0;border-radius:11px;overflow:hidden;border:1px solid}
    .dc-warn.danger{border-color:#ff3b30;background:#ffebe9}
    .dc-warn.warn{border-color:#ff9500;background:#fff4e0}
    .dc-warn h4{font-size:12px;font-weight:800;padding:9px 12px;display:flex;align-items:center;gap:7px}
    .dc-warn.danger h4{background:#ff3b30;color:#fff}
    .dc-warn.warn h4{background:#ff9500;color:#fff}
    .dc-warn ul{list-style:none;padding:9px 12px;margin:0}
    .dc-warn li{font-size:12.5px;line-height:1.55;padding:3px 0}

    @media(max-width:720px){
        .dc-bar{padding:8px 12px;gap:6px}
        .dc-btn{height:32px;padding:0 11px;font-size:11.5px}
        .dc-btn span{display:none}
        .dc-btn i{font-size:16px}
        .dc-ctx{padding:7px 12px;gap:9px;font-size:11px}
    }`;
    document.head.appendChild(css);

    /* ══════════════ MODAL SHELL ══════════════ */
    var ov = document.createElement('div');
    ov.className = 'dc-ov';
    ov.innerHTML = '<div class="dc-mod" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(ov);
    var mod = ov.firstChild;

    // Close on backdrop click, ✕ and Escape — all three, every time.
    ov.addEventListener('click', function (e) { if (e.target === ov) closeDC(); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && ov.classList.contains('open')) closeDC();
    });

    function openDC(html) {
        mod.innerHTML = '<button class="dc-x" onclick="dcClose()" aria-label="Close">' +
                        '<i class="ti ti-x"></i></button>' + html;
        ov.classList.add('open');
        var f = mod.querySelector('input,select,textarea');
        if (f) setTimeout(function () { f.focus(); }, 120);
    }
    function closeDC() { ov.classList.remove('open'); }
    window.dcClose = closeDC;

    /* ══════════════ ORDER COMPOSER ══════════════ */
    function composer(cfg) {
        if (needPatient()) return;
        var p = patient();
        var items = window.pcTariff ? pcTariff.byDept(cfg.dept) : [];
        var opts = items.map(function (t) {
            return '<label class="dc-opt"><input type="checkbox" value="' + esc(t.code) + '" ' +
                   'data-price="' + t.price + '" data-name="' + esc(t.name) + '">' +
                   '<span>' + esc(t.name) + '</span>' +
                   '<span class="pr">' + money(t.price) + '</span></label>';
        }).join('');

        openDC(
            '<h3><i class="ti ' + cfg.icon + '"></i> ' + cfg.title + '</h3>' +
            '<div class="sub">' + esc(p.name || (p.firstName + ' ' + p.lastName)) +
                ' · ' + esc(p.mrn || ('ID ' + p.id)) + '</div>' +
            '<label class="dc-lbl">Select ' + cfg.noun + '</label>' +
            '<div class="dc-grid" id="dcOpts">' + (opts || '<div style="color:#8e8e93;font-size:12.5px;padding:10px">No items in the price list for this department.</div>') + '</div>' +
            '<label class="dc-lbl">Priority</label>' +
            '<div class="dc-prio" id="dcPrio">' +
                '<button class="on" data-p="routine">Routine</button>' +
                '<button data-p="urgent">Urgent</button>' +
                '<button data-p="stat">STAT</button>' +
            '</div>' +
            '<label class="dc-lbl">Clinical notes for the department</label>' +
            '<textarea id="dcNotes" data-pc-remember="dcNotes_' + cfg.dept + '" ' +
                'placeholder="Relevant history, suspected diagnosis…"></textarea>' +
            '<div class="dc-tot"><span>Total</span><span id="dcTotal">RWF 0</span></div>' +
            '<div class="dc-act">' +
                '<button class="dc-btn" onclick="dcClose()"><i class="ti ti-x"></i> Cancel</button>' +
                '<button class="dc-btn primary" id="dcSend"><i class="ti ti-send"></i> Send Request</button>' +
            '</div>'
        );

        var prio = 'routine';
        $('#dcPrio').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            $('#dcPrio').querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on'); prio = b.dataset.p;
        });

        function recalc() {
            var t = 0;
            mod.querySelectorAll('#dcOpts input:checked').forEach(function (c) {
                t += Number(c.dataset.price) || 0;
            });
            $('#dcTotal').textContent = money(t);
        }
        $('#dcOpts').addEventListener('change', function (e) {
            var l = e.target.closest('.dc-opt');
            if (l) l.classList.toggle('on', e.target.checked);
            recalc();
        });
        if (window.pcRemember) pcRemember('dcNotes_' + cfg.dept, $('#dcNotes'));

        $('#dcSend').onclick = function () {
            var sel = [].slice.call(mod.querySelectorAll('#dcOpts input:checked'));
            if (!sel.length) { pcToast('Select at least one ' + cfg.noun.replace(/s$/, ''), 'error'); return; }
            var order = pcOrders.create({
                patientId: p.id,
                patientName: p.name || (p.firstName + ' ' + p.lastName),
                type: cfg.type,
                priority: prio,
                notes: $('#dcNotes').value.trim(),
                items: sel.map(function (c) {
                    return { code: c.value, name: c.dataset.name, price: Number(c.dataset.price) };
                })
            });
            if (!order) { pcToast('Could not send the request', 'error'); return; }
            try { pcStore.drop('field:dcNotes_' + cfg.dept); } catch (e) {}
            closeDC();
            pcToast(cfg.sent + ' sent · ' + money(order.total) + ' billed', 'success');
        };
    }

    /* ══════════════ PRESCRIPTION (with safety gate) ══════════════ */
    function prescribe() {
        if (needPatient()) return;
        var p = patient();
        var allergies = p.allergies || [];
        if (typeof allergies === 'string') allergies = allergies.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);

        openDC(
            '<h3><i class="ti ti-pill"></i> New Prescription</h3>' +
            '<div class="sub">' + esc(p.name || '') + ' · ' + esc(p.mrn || ('ID ' + p.id)) + '</div>' +
            (allergies.length
                ? '<div class="dc-warn danger" style="margin-top:8px"><h4><i class="ti ti-alert-triangle"></i> Known allergies</h4>' +
                  '<ul><li>' + allergies.map(esc).join('</li><li>') + '</li></ul></div>'
                : '<div style="font-size:11.5px;color:#8e8e93;margin:8px 0">No allergies recorded for this patient.</div>') +
            '<label class="dc-lbl">Medication</label>' +
            '<input class="dc-in" id="dcDrug" placeholder="e.g. Amoxicillin 500mg" data-pc-remember="dcDrug">' +
            '<div style="display:flex;gap:9px">' +
                '<div style="flex:1"><label class="dc-lbl">Dose &amp; frequency</label>' +
                '<input class="dc-in" id="dcDose" placeholder="1 tab TDS"></div>' +
                '<div style="flex:1"><label class="dc-lbl">Duration</label>' +
                '<input class="dc-in" id="dcDur" placeholder="7 days"></div>' +
                '<div style="width:88px"><label class="dc-lbl">Qty</label>' +
                '<input class="dc-in" id="dcQty" type="number" min="1" value="21"></div>' +
            '</div>' +
            '<div id="dcAdded" style="margin-top:12px"></div>' +
            '<button class="dc-btn" id="dcAdd" style="margin-top:9px;width:100%;justify-content:center">' +
                '<i class="ti ti-plus"></i> Add to prescription</button>' +
            '<div id="dcSafety"></div>' +
            '<label class="dc-lbl">Notes to pharmacy</label>' +
            '<textarea id="dcRxNotes" data-pc-remember="dcRxNotes" placeholder="Take after food…"></textarea>' +
            '<div class="dc-act">' +
                '<button class="dc-btn" onclick="dcClose()"><i class="ti ti-x"></i> Cancel</button>' +
                '<button class="dc-btn primary" id="dcRxSend"><i class="ti ti-send"></i> Send to Pharmacy</button>' +
            '</div>'
        );

        var drugs = [];
        if (window.pcRemember) { pcRemember('dcDrug', $('#dcDrug')); pcRemember('dcRxNotes', $('#dcRxNotes')); }

        function renderDrugs() {
            var box = $('#dcAdded');
            if (!drugs.length) { box.innerHTML = ''; runSafety(); return; }
            box.innerHTML = drugs.map(function (d, i) {
                return '<div style="display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:9px;' +
                       'background:#f2f2f4;margin-bottom:6px;font-size:12.5px">' +
                       '<b>' + esc(d.name) + '</b><span style="color:#8e8e93">' + esc(d.dose) + ' · ' + esc(d.duration) + '</span>' +
                       '<span style="margin-left:auto;font-weight:700">×' + d.qty + '</span>' +
                       '<button onclick="dcRmDrug(' + i + ')" style="border:0;background:none;color:#ff3b30;' +
                       'cursor:pointer;font-size:15px">&times;</button></div>';
            }).join('');
            runSafety();
        }
        window.dcRmDrug = function (i) { drugs.splice(i, 1); renderDrugs(); };

        // ── The safety gate ──
        function runSafety() {
            var box = $('#dcSafety');
            if (!drugs.length || !window.pcSafety) { box.innerHTML = ''; return; }
            var w = pcSafety.check(p, drugs.map(function (d) { return d.name; }));
            if (!w.length) {
                box.innerHTML = '<div style="margin:12px 0;padding:9px 12px;border-radius:10px;background:#e9f9ee;' +
                                'color:#1a7a32;font-size:12.5px;font-weight:600">' +
                                '<i class="ti ti-shield-check"></i> No allergy or interaction warnings.</div>';
                return;
            }
            var danger = w.filter(function (x) { return x.level === 'danger'; });
            var warn   = w.filter(function (x) { return x.level !== 'danger'; });
            box.innerHTML =
                (danger.length ? '<div class="dc-warn danger"><h4><i class="ti ti-alert-octagon"></i> ' +
                    danger.length + ' serious warning' + (danger.length > 1 ? 's' : '') + '</h4><ul><li>' +
                    danger.map(function (x) { return esc(x.text); }).join('</li><li>') + '</li></ul></div>' : '') +
                (warn.length ? '<div class="dc-warn warn"><h4><i class="ti ti-alert-triangle"></i> ' +
                    warn.length + ' caution</h4><ul><li>' +
                    warn.map(function (x) { return esc(x.text); }).join('</li><li>') + '</li></ul></div>' : '');
        }

        $('#dcAdd').onclick = function () {
            var n = $('#dcDrug').value.trim();
            if (!n) { pcToast('Enter a medication', 'error'); $('#dcDrug').focus(); return; }
            drugs.push({
                name: n,
                dose: $('#dcDose').value.trim() || '—',
                duration: $('#dcDur').value.trim() || '—',
                qty: parseInt($('#dcQty').value, 10) || 1
            });
            $('#dcDrug').value = ''; $('#dcDose').value = ''; $('#dcDur').value = '';
            try { pcStore.drop('field:dcDrug'); } catch (e) {}
            renderDrugs();
            $('#dcDrug').focus();
        };

        $('#dcRxSend').onclick = function () {
            if (!drugs.length) { pcToast('Add at least one medication', 'error'); return; }
            var w = window.pcSafety ? pcSafety.check(p, drugs.map(function (d) { return d.name; })) : [];
            var danger = w.filter(function (x) { return x.level === 'danger'; });
            // Hard stop on a danger-level finding — must be consciously overridden.
            if (danger.length && !window.confirm(
                    '⛔ ' + danger.length + ' SERIOUS WARNING' + (danger.length > 1 ? 'S' : '') + ':\n\n' +
                    danger.map(function (x) { return '• ' + x.text; }).join('\n') +
                    '\n\nPrescribe anyway? This will be recorded.')) return;

            var order = pcOrders.create({
                patientId: p.id,
                patientName: p.name || (p.firstName + ' ' + p.lastName),
                type: 'prescription',
                notes: $('#dcRxNotes').value.trim(),
                bill: false,
                items: drugs.map(function (d) {
                    return { name: d.name + '  ' + d.dose + '  ×' + d.duration, qty: d.qty, price: 0 };
                })
            });
            if (danger.length) {
                pcOrders.update(order.id, { overrideWarnings: danger.map(function (x) { return x.text; }) });
            }
            try { pcStore.drop('field:dcRxNotes'); } catch (e) {}
            closeDC();
            pcToast('Prescription sent to pharmacy', 'success');
        };
    }

    /* ══════════════ PATIENT CONTEXT STRIP ══════════════ */
    function renderCtx() {
        // doctor-patient.js owns a richer version of this strip (age,
        // phone, pulse, weight, clear button). If it is loaded, let it
        // render and do not fight over the same element.
        if (window.pcPatient && window.dpPick) return;
        var el = $('#dcCtx'); if (!el) return;
        var p = patient();
        if (!p) {
            el.innerHTML = '<span class="none"><i class="ti ti-user-off"></i> No patient selected — ' +
                           'choose one from All Patients to enable ordering.</span>';
            return;
        }
        var v = (p.vitals && p.vitals.length) ? p.vitals[p.vitals.length - 1] : null;
        var al = p.allergies || [];
        if (typeof al === 'string') al = al.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);

        el.innerHTML =
            '<span class="nm">' + esc(p.name || (p.firstName + ' ' + p.lastName)) + '</span>' +
            '<span class="pill">' + esc(p.mrn || ('ID ' + p.id)) + '</span>' +
            (p.gender ? '<span class="pill">' + esc(p.gender) + '</span>' : '') +
            (p.dob ? '<span class="pill">' + esc(p.dob) + '</span>' : '') +
            (v ? '<span class="pill">BP ' + esc(v.bp || v.bloodPressure || '—') + '</span>' +
                 '<span class="pill">T ' + esc(v.temp || v.temperature || '—') + '</span>' +
                 (v.weight ? '<span class="pill">Wt ' + esc(v.weight) + '</span>' : '')
               : '<span class="pill none">No vitals recorded</span>') +
            (al.length ? '<span class="pill allergy"><i class="ti ti-alert-triangle"></i> ' +
                         al.map(esc).join(', ') + '</span>'
                       : '<span class="pill none">No known allergies</span>');
    }

    /* ══════════════ MOUNT ══════════════ */
    function mount() {
        if ($('#dcBar')) return;
        var tabs = document.querySelector('.nav-tabs') || document.querySelector('#breadcrumb') || document.body;
        if (!tabs) return;

        var ctx = document.createElement('div');
        ctx.className = 'dc-ctx noprint'; ctx.id = 'dcCtx';

        var bar = document.createElement('div');
        bar.className = 'dc-bar noprint'; bar.id = 'dcBar';
        bar.innerHTML = '';

        tabs.parentNode.insertBefore(bar, tabs);
        tabs.parentNode.insertBefore(ctx, bar);
        renderCtx();
        pollUnread();
    }

    function pollUnread() {
        var b = $('#dcUnread'); if (!b || !window.pcMessages) return;
        var n = pcMessages.unread();
        b.textContent = n;
        b.style.display = n ? 'inline-flex' : 'none';
    }

    /* ══════════════ MY ORDERS ══════════════ */
    function myOrders() {
        var me = (window.currentStaff || {}).staffId;
        var list = window.pcOrders ? pcOrders.list().filter(function (o) { return o.orderedById === me; }) : [];
        var rows = list.slice(0, 40).map(function (o) {
            var cols = { pending: '#7a4500', 'in-progress': '#0071e3', completed: '#1a7a32', cancelled: '#8a1f1a' };
            return '<div style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;' +
                   'background:#f7f7f9;margin-bottom:6px;font-size:12.5px">' +
                   '<div style="flex:1"><b>' + esc(o.patientName) + '</b>' +
                   '<div style="font-size:11px;color:#8e8e93">' +
                   esc((o.items || []).map(function (i) { return i.name; }).join(', ')) + '</div></div>' +
                   '<span style="font-size:10px;font-weight:800;color:' + (cols[o.status] || '#666') + '">' +
                   esc(o.status.toUpperCase()) + '</span></div>';
        }).join('');
        openDC('<h3><i class="ti ti-clipboard-list"></i> My Orders</h3>' +
               '<div class="sub">Everything you have requested, newest first</div>' +
               (rows || '<div style="color:#8e8e93;padding:20px;text-align:center">No orders yet.</div>'));
    }

    /* ══════════════ PUBLIC ══════════════ */
    window.dcLab = function () {
        composer({ dept:'lab', type:'lab', title:'Lab Request', icon:'ti-test-pipe',
                   noun:'tests', sent:'Lab request' });
    };
    window.dcImaging = function () {
        composer({ dept:'radiology', type:'imaging', title:'Imaging Request', icon:'ti-radioactive',
                   noun:'studies', sent:'Imaging request' });
    };
    window.dcProc = function () {
        composer({ dept:'procedure', type:'procedure', title:'Procedure', icon:'ti-stethoscope',
                   noun:'procedures', sent:'Procedure order' });
    };
    window.dcRx = prescribe;
    // Kept reachable for the safety-gate tests and as a quick inline
    // alternative; the bar itself now opens the full forms.
    window.__composerRx  = prescribe;
    window.__composerLab = function(){ composer({dept:'lab',type:'lab',title:'Lab Request',icon:'ti-test-pipe',noun:'tests',sent:'Lab request'}); };
    window.__composerImg = function(){ composer({dept:'radiology',type:'imaging',title:'Imaging Request',icon:'ti-radioactive',noun:'studies',sent:'Imaging request'}); };
    window.dcMyOrders = myOrders;
    window.dcBill = function () {
        var p = patient();
        location.href = 'billing.html' + (p ? '?patient=' + p.id : '');
    };
    window.dcRefreshContext = renderCtx;

    /* ══════════════ INIT ══════════════ */
    function init() {
        mount();
        setInterval(pollUnread, 15000);
        window.addEventListener('messagesUpdated', pollUnread);
        window.addEventListener('patientsUpdated', renderCtx);
        // currentPatient is set by doctor.js; poll briefly so the strip follows it
        var last = null;
        setInterval(function () {
            var id = patient() ? patient().id : null;
            if (id !== last) { last = id; renderCtx(); }
        }, 700);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    console.log('🩺 Doctor command bar ready');
})();
