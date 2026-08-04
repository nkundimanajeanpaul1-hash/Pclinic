/* ============================================================
   PCLINIC — CLINICAL FILE PAGE BUILDER  (v2)

     pcFilePage.init({ type:'opd', title:'OPD File', fields:[…] })

   Why this exists
   ---------------
   The ten file pages each carried their own ~200-line copy of the
   same history / render / save / print logic. One bug meant ten
   fixes, and they had already drifted apart. Everything shared now
   lives here; a page is just a config object.

   v2 layout rules, from what the browser measured:
     • The page does not scroll. Left pane (work) and right pane
       (document) scroll independently inside a locked viewport.
     • Diagnosis, RDV and Attachments are chips that open a sheet —
       they were the three panels making the column 1660px tall.
     • Print opens a real print window (pcFile.print).
   ============================================================ */
(function () {
    'use strict';

    var CFG = null, P = null, viewing = null, editingId = null;
    var chosenDx = [], files = [], meds = [], rdv = null;

    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function $(s, r) { return (r || document).querySelector(s); }
    function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
    function setVal(id, v) { var e = document.getElementById(id); if (e) e.value = v == null ? '' : v; }
    function longDate(d) {
        return new Date(d).toLocaleDateString('en-GB',
            { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    /* ══════════ BUILD THE PAGE SHELL ══════════ */
    function shell() {
        var c = CFG;

        /* group the fields into panels, in declaration order */
        var panels = [], byName = {};
        c.fields.forEach(function (f) {
            var key = f.panel || c.title;
            if (!byName[key]) { byName[key] = { name: key, icon: f.icon || 'ti-file-text', items: [] }; panels.push(byName[key]); }
            if (f.icon) byName[key].icon = f.icon;
            byName[key].items.push(f);
        });

        function fieldHtml(f) {
            var id = 'f_' + f.id;
            var lbl = '<label class="pcf-lbl" for="' + id + '">' + esc(f.label) + '</label>';
            if (f.kind === 'area') {
                return '<div class="fw">' + lbl + '<textarea id="' + id + '" placeholder="' +
                    esc(f.ph || '') + '"' + (f.rows ? ' rows="' + f.rows + '"' : '') + '></textarea></div>';
            }
            if (f.kind === 'sel') {
                return '<div>' + lbl + '<select class="pcf-in" id="' + id + '">' +
                    (f.options || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') +
                    '</select></div>';
            }
            var type = f.kind === 'date' ? 'date' : 'text';
            return '<div>' + lbl + '<input class="pcf-in" type="' + type + '" id="' + id +
                '" placeholder="' + esc(f.ph || '') + '"></div>';
        }

        /* short fields pair up two-per-row; textareas take the full width */
        function panelHtml(p) {
            var out = '', buf = [];
            function flush() {
                if (!buf.length) return;
                out += buf.length > 1 ? '<div class="pcf-two">' + buf.join('') + '</div>' : buf[0];
                buf = [];
            }
            p.items.forEach(function (f) {
                if (f.kind === 'area') { flush(); out += fieldHtml(f); }
                else { buf.push(fieldHtml(f)); if (buf.length === 2) flush(); }
            });
            flush();
            return '<div class="pcf-panel"><h2><i class="ti ' + p.icon + '"></i> ' + esc(p.name) + '</h2>' + out + '</div>';
        }

        var vitalsPanel = !c.vitals ? '' :
            '<div class="pcf-panel"><h2><i class="ti ti-heartbeat"></i> Vital signs</h2>' +
            '<div class="pcf-row tight">' +
              '<div><label class="pcf-lbl" for="v_bp">BP</label><input class="pcf-in" id="v_bp" placeholder="120/80"></div>' +
              '<div><label class="pcf-lbl" for="v_temp">Temp °C</label><input class="pcf-in" id="v_temp" placeholder="37.0"></div>' +
              '<div><label class="pcf-lbl" for="v_pulse">Pulse</label><input class="pcf-in" id="v_pulse" placeholder="76"></div>' +
              '<div><label class="pcf-lbl" for="v_weight">Weight</label><input class="pcf-in" id="v_weight" placeholder="70kg"></div>' +
            '</div></div>';

        /* Medication is CHOSEN from the shared formulary, not typed blind.
           Each drug carries its own price, so every line bills itself and
           reaches the cashier with the money attached. Free text is still
           allowed — a doctor can add a drug the pharmacy stocks. */
        var rxPanel = !c.rx ? '' :
            '<div class="pcf-panel"><h2><i class="ti ti-pill"></i> Medication' +
              '<span class="count" id="rxCount">0</span></h2>' +
            '<input class="pcf-in" id="rxSearch" placeholder="Search the formulary — e.g. amoxi, para…" autocomplete="off">' +
            '<div class="pcf-dx-list pcf-rx-list" id="rxPick" style="max-height:180px"></div>' +
            '<div class="pcf-files" id="rxList" style="margin-top:10px"></div>' +
            '<div id="rxSafety"></div>' +
            '<div class="tot" id="rxTot" style="display:none;margin-top:9px">' +
              '<span class="l">Medication total</span><span class="v" id="rxTotVal">RWF 0</span></div>' +
            '</div>';

        /* tool chips — the sheets */
        var chips = '';
        if (c.dx)  chips += '<button class="pcf-tool" type="button" id="toolDx" style="--c:#5c2475;--b:#f5eaff">' +
                            '<i class="ti ti-clipboard-list"></i> Diagnosis<span class="n" data-n="0"></span></button>';
        if (c.rdv) chips += '<button class="pcf-tool" type="button" id="toolRdv" style="--c:#1a7a32;--b:#e9f9ee">' +
                            '<i class="ti ti-calendar-plus"></i> <span id="rdvChipLbl">RDV</span></button>';
        if (c.att) chips += '<button class="pcf-tool" type="button" id="toolAtt" style="--c:#7a4500;--b:#fff4e0">' +
                            '<i class="ti ti-paperclip"></i> Attachments<span class="n" data-n="0"></span></button>';

        $('#pcfRoot').innerHTML =
        '<div id="viewHistory">' +
          '<div class="pcf-panel">' +
            '<h2><i class="ti ti-history"></i> ' + esc(c.histTitle || (c.title + ' history')) +
              '<span class="count" id="histCount">0</span></h2>' +
            '<div class="pcf-hist" id="histList"></div>' +
          '</div>' +
          '<div style="margin-top:11px"><button class="pcf-btn primary full" id="btnNew">' +
            '<i class="ti ti-plus"></i> ' + esc(c.newLabel || ('New ' + c.title)) + '</button></div>' +
        '</div>' +

        '<div id="viewFile" style="display:none;flex:1;min-height:0;flex-direction:column;gap:9px">' +
          '<div class="pcf-cmd noprint">' +
            '<button class="pcf-btn sm" id="btnBack"><i class="ti ti-arrow-left"></i> History</button>' +
            '<b class="mode" id="fileMode"></b>' +
            '<span class="spacer"></span>' + chips +
            '<button class="pcf-btn sm" id="btnPrint"><i class="ti ti-printer"></i> Print</button>' +
            '<button class="pcf-btn sm" id="editBtn" style="display:none;background:#fff3cd;color:#856404;border-color:#ffeeba;font-weight:600;"><i class="ti ti-pencil"></i> Edit Visit</button>' +
            '<button class="pcf-btn sm primary" id="saveBtn"><i class="ti ti-device-floppy"></i> Save</button>' +
          '</div>' +
          '<div class="pcf-grid wide" id="fileGrid">' +
            '<div class="pcf-pane noprint" id="workPane">' +
              panels.map(panelHtml).join('') + vitalsPanel + rxPanel +
            '</div>' +
            '<div class="pcf-pane"><div class="pcf-doc" id="doc"></div></div>' +
          '</div>' +
        '</div>';

        $('#btnNew').onclick = newFile;
        $('#btnBack').onclick = backToHistory;
        $('#saveBtn').onclick = saveFile;
        $('#btnPrint').onclick = function () { pcFile.print('#doc', c.docTitle + ' — ' + pcFile.nameOf(P)); };
        if (c.dx)  $('#toolDx').onclick  = openDxSheet;
        if (c.rdv) $('#toolRdv').onclick = openRdvSheet;
        if (c.att) $('#toolAtt').onclick = openAttSheet;
        if (c.rx) {
            $('#rxSearch').addEventListener('input', function () { paintPick(this.value); });
            paintPick('');
        }
    }

    /* ══════════ SHEETS ══════════ */
    function chipCount(sel, n) {
        var el = $(sel); if (!el) return;
        var b = el.querySelector('.n');
        if (b) b.setAttribute('data-n', n);
        el.classList.toggle('has', n > 0);
    }

    function openDxSheet() {
        pcFile.sheet({
            title: 'Diagnosis', icon: 'ti-clipboard-list', done: 'Done',
            build: function (body) {
                body.innerHTML = '<div style="font-size:11.5px;color:var(--tm);margin-bottom:9px">' +
                    'Search the shared list, press Enter for free text, or add a new one so every doctor sees it.</div>' +
                    '<div id="dxHost"></div>';
                pcFile.dxPicker($('#dxHost', body), chosenDx, function (c) {
                    chosenDx = c; chipCount('#toolDx', chosenDx.length); paintDoc();
                });
            },
            onClose: function () { chipCount('#toolDx', chosenDx.length); paintDoc(); }
        });
    }

    function openAttSheet() {
        pcFile.sheet({
            title: 'Attachments', icon: 'ti-paperclip', done: 'Done',
            build: function (body) {
                body.innerHTML = '<div style="font-size:11.5px;color:var(--tm);margin-bottom:9px">' +
                    'Results done elsewhere, referral letters, photos or a short video. ' +
                    'Tap a file to open it.</div><div id="atHost"></div>';
                pcFile.attachments($('#atHost', body), files, function (f) {
                    files = f; chipCount('#toolAtt', files.length); paintDoc();
                });
            },
            onClose: function () { chipCount('#toolAtt', files.length); paintDoc(); }
        });
    }

    function openRdvSheet() {
        pcFile.sheet({
            title: 'RDV — next appointment', icon: 'ti-calendar-plus', done: 'Set appointment',
            build: function (body) {
                body.innerHTML =
                    '<div class="pcf-row">' +
                      '<div><label class="pcf-lbl" for="rdvDate">Date</label>' +
                        '<input class="pcf-in" type="date" id="rdvDate" value="' + esc(rdv ? rdv.date : '') + '"></div>' +
                      '<div style="flex:1.6"><label class="pcf-lbl" for="rdvReason">Reason</label>' +
                        '<input class="pcf-in" id="rdvReason" placeholder="Review results / wound check" value="' +
                        esc(rdv ? rdv.reason : '') + '"></div>' +
                    '</div>' +
                    '<div style="font-size:11.5px;color:var(--tm);margin-top:10px">' +
                    '<i class="ti ti-info-circle"></i> Saving sends this to reception so they can print the slip.</div>';
            },
            onClose: function () {
                var d = val('rdvDate');
                rdv = d ? { date: d, reason: val('rdvReason') || 'Follow-up' } : null;
                var lbl = $('#rdvChipLbl');
                if (lbl) lbl.textContent = rdv
                    ? new Date(rdv.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : 'RDV';
                var chip = $('#toolRdv'); if (chip) chip.classList.toggle('has', !!rdv);
                paintDoc();
            }
        });
    }

    /* ══════════ PRESCRIPTION — PICK, DON'T TYPE ══════════ */
    function money(n) { return 'RWF ' + (Number(n) || 0).toLocaleString('en-US'); }

    function paintPick(q) {
        var host = $('#rxPick'); if (!host || !window.pcCatalog) return;
        q = (q || '').toLowerCase().trim();
        var all = pcCatalog.drugs();
        var list = all.filter(function (d) {
            return !q || (d.name + ' ' + d.strength + ' ' + d.form).toLowerCase().indexOf(q) !== -1;
        }).slice(0, 40);
        var html = list.map(function (d) {
            return '<div class="pcf-rx-item" data-c="' + esc(d.code) + '">' +
                esc(pcCatalog.drugLabel(d)) +
                ' <span style="font-size:10.5px;color:var(--tm)">· ' + esc(d.form) + '</span>' +
                (d.custom ? ' <span style="font-size:9.5px;color:#34c759">·added</span>' : '') +
                '<span style="float:right;font-size:10.5px;font-weight:700;color:var(--tm)">' +
                money(d.price) + '</span></div>';
        }).join('');
        if (q && !list.some(function (d) { return pcCatalog.drugLabel(d).toLowerCase() === q; })) {
            html += '<div class="pcf-rx-item add" data-add="1"><i class="ti ti-plus"></i> ' +
                    'Add “' + esc(val('rxSearch')) + '” to the shared formulary</div>';
        }
        host.innerHTML = html || '<div class="pcf-empty" style="padding:16px">No match</div>';
        host.querySelectorAll('.pcf-rx-item').forEach(function (it) {
            it.onclick = function () {
                if (it.dataset.add) return addCustomDrug(val('rxSearch'));
                var d = pcCatalog.drugs().filter(function (x) { return x.code === it.dataset.c; })[0];
                if (d) doseSheet(d);
            };
        });
    }

    function addCustomDrug(raw) {
        if (!raw) return;
        pcFile.sheet({
            title: 'Add “' + raw + '” to the formulary', icon: 'ti-pill', done: 'Add drug',
            build: function (body) {
                body.innerHTML =
                    '<div style="font-size:11.5px;color:var(--tm);margin-bottom:10px">' +
                    'Every doctor will see this afterwards. The price is what the cashier will charge.</div>' +
                    '<div class="pcf-two">' +
                    '<div><label class="pcf-lbl" for="nd_name">Drug</label>' +
                      '<input class="pcf-in" id="nd_name" value="' + esc(raw) + '"></div>' +
                    '<div><label class="pcf-lbl" for="nd_str">Strength</label>' +
                      '<input class="pcf-in" id="nd_str" placeholder="500mg"></div>' +
                    '<div><label class="pcf-lbl" for="nd_form">Form</label>' +
                      '<input class="pcf-in" id="nd_form" placeholder="tablet"></div>' +
                    '<div><label class="pcf-lbl" for="nd_price">Unit price (RWF)</label>' +
                      '<input class="pcf-in" type="number" id="nd_price" value="0" min="0"></div>' +
                    '</div>';
            },
            onClose: function () {
                var name = val('nd_name'); if (!name) return;
                var e = pcCatalog.addDrug({ name: name, strength: val('nd_str'),
                    form: val('nd_form') || 'tablet', price: parseInt(val('nd_price'), 10) || 0 });
                if (e) { pcToast('“' + name + '” added to the formulary', 'success'); doseSheet(e); }
                setVal('rxSearch', ''); paintPick('');
            }
        });
    }

    /* Chosen a drug — now say how much and for how long. Quantity drives
       the price, so the cashier's figure matches what is dispensed. */
    function doseSheet(d) {
        var detMg = 500;
        var strMatch = (String(d.strength || '') + ' ' + String(d.name || '')).match(/(\d+)\s*(?:mg|g|gr|ml)/i);
        if (strMatch) {
            var valStr = parseInt(strMatch[1], 10);
            if (/g|gr/i.test(strMatch[0]) && !/mg/i.test(strMatch[0])) {
                detMg = valStr * 1000;
            } else {
                detMg = valStr;
            }
        }

        pcFile.sheet({
            title: pcCatalog.drugLabel(d), icon: 'ti-pill', done: 'Add to prescription',
            build: function (body) {
                body.innerHTML =
                    '<div style="font-size:12px;color:var(--tm);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
                    '<span><b>' + esc(d.form || 'tablet') + '</b> · Unit strength: <b>' + detMg + ' mg</b></span>' +
                    '<span><b>' + money(d.price) + '</b> / unit</span>' +
                    '</div>' +
                    '<div class="pcf-two" style="gap:10px;margin-bottom:10px;">' +
                      '<div><label class="pcf-lbl" for="dz_dose_num">Dose per intake</label>' +
                        '<div style="display:flex;gap:6px;">' +
                          '<input class="pcf-in" type="number" id="dz_dose_num" value="' + detMg + '" min="0" style="flex:1;">' +
                          '<select class="pcf-in" id="dz_dose_unit" style="width:75px;">' +
                            '<option value="mg">mg</option>' +
                            '<option value="g">g/gr</option>' +
                            '<option value="pills">pills</option>' +
                          '</select>' +
                        '</div></div>' +
                      '<div><label class="pcf-lbl" for="dz_freq">Frequency</label>' +
                        '<select class="pcf-in" id="dz_freq">' +
                          '<option value="1">OD (Once daily)</option>' +
                          '<option value="2">BID / BD (2× daily)</option>' +
                          '<option value="3" selected>TDS / TID (3× daily)</option>' +
                          '<option value="4">QID / QDS (4× daily)</option>' +
                          '<option value="6">Q4H (6× daily)</option>' +
                          '<option value="4">Q6H (4× daily)</option>' +
                          '<option value="3">Q8H (3× daily)</option>' +
                          '<option value="2">PRN (As needed)</option>' +
                          '<option value="1">STAT (Single dose)</option>' +
                        '</select></div>' +
                      '<div><label class="pcf-lbl" for="dz_dur_days">Duration (days)</label>' +
                        '<input class="pcf-in" type="number" id="dz_dur_days" value="5" min="1"></div>' +
                      '<div><label class="pcf-lbl" for="dz_qty">Quantity to dispense (pills)</label>' +
                        '<input class="pcf-in" type="number" id="dz_qty" value="1" min="1" style="font-weight:700;color:var(--ac);"></div>' +
                    '</div>' +
                    '<div style="margin-bottom:10px;">' +
                      '<label class="pcf-lbl" for="dz_note">Note to pharmacist</label>' +
                      '<input class="pcf-in" id="dz_note" placeholder="After food, substitutions allowed...">' +
                    '</div>' +
                    '<div id="dz_calc_banner" style="margin: 10px 0; padding: 10px 12px; background: var(--acb); border: 1px solid rgba(0,113,227,0.2); border-radius: 8px; font-size: 12.5px; color: var(--ac);"></div>' +
                    '<div class="tot" style="margin-top:11px"><span class="l">Total cash for cashier</span>' +
                    '<span class="v" id="dz_tot">' + money(d.price) + '</span></div>';

                function calc() {
                    var num = parseFloat($('#dz_dose_num', body).value) || 0;
                    var unit = $('#dz_dose_unit', body).value;
                    var freq = parseInt($('#dz_freq', body).value, 10) || 1;
                    var days = parseInt($('#dz_dur_days', body).value, 10) || 1;

                    var pillsPerDose = 1;
                    if (unit === 'mg') {
                        pillsPerDose = Math.ceil(num / (detMg || 500)) || 1;
                    } else if (unit === 'g') {
                        pillsPerDose = Math.ceil((num * 1000) / (detMg || 500)) || 1;
                    } else {
                        pillsPerDose = Math.ceil(num) || 1;
                    }
                    var totalPills = pillsPerDose * freq * days;
                    $('#dz_qty', body).value = totalPills;
                    var totPrice = (d.price || 0) * totalPills;
                    $('#dz_tot', body).textContent = money(totPrice);

                    var freqEl = $('#dz_freq', body);
                    var freqText = freqEl ? freqEl.options[freqEl.selectedIndex].text.split(' ')[0] : 'OD';
                    $('#dz_calc_banner', body).innerHTML =
                        '<b>💡 Auto-calculated:</b> ' + pillsPerDose + ' pill(s)/dose × ' + freqText + ' × ' + days + ' day(s) = <b>' + totalPills + ' pill(s) total</b> · ' + money(totPrice);
                }

                $('#dz_dose_num', body).addEventListener('input', calc);
                $('#dz_dose_unit', body).addEventListener('change', calc);
                $('#dz_freq', body).addEventListener('change', calc);
                $('#dz_dur_days', body).addEventListener('input', calc);

                $('#dz_qty', body).addEventListener('input', function () {
                    var customQty = parseInt(this.value, 10) || 0;
                    $('#dz_tot', body).textContent = money((d.price || 0) * customQty);
                    $('#dz_calc_banner', body).innerHTML =
                        '<b>✏️ Custom quantity:</b> ' + customQty + ' pill(s) · <b>' + money((d.price || 0) * customQty) + '</b> for cashier';
                });

                calc();
            },
            onClose: function () {
                var qty = parseInt(val('dz_qty'), 10) || 1;
                var doseVal = val('dz_dose_num') || '1';
                var doseUnit = val('dz_dose_unit') || 'mg';
                var freqEl = $('#dz_freq');
                var freqText = freqEl ? freqEl.options[freqEl.selectedIndex].text.split(' ')[0] : 'OD';
                var durDays = val('dz_dur_days') || '1';
                var fullDose = doseVal + ' ' + doseUnit + ' (' + freqText + ')';
                var fullDur = durDays + ' days';

                meds.push({ code: d.code, name: pcCatalog.drugLabel(d), form: d.form,
                    dose: fullDose, duration: fullDur,
                    note: val('dz_note') || '', qty: qty, price: d.price });
                setVal('rxSearch', ''); paintPick('');
                renderMeds(); paintDoc();
            }
        });
    }

    function renderMeds() {
        var box = $('#rxList'); if (!box) return;
        box.innerHTML = meds.map(function (m, i) {
            return '<div class="pcf-file"><i class="ti ti-pill"></i><span class="nm"><b>' + esc(m.name) +
                '</b> · ' + esc(m.dose) + ' · ' + esc(m.duration) +
                (m.note ? ' · ' + esc(m.note) : '') + '</span>' +
                '<span class="sz">×' + m.qty + ' · ' + money((m.price || 0) * m.qty) + '</span>' +
                '<button data-i="' + i + '">&times;</button></div>';
        }).join('');
        box.querySelectorAll('button').forEach(function (b) {
            b.onclick = function () { meds.splice(+b.dataset.i, 1); renderMeds(); paintDoc(); };
        });
        var cnt = $('#rxCount'); if (cnt) cnt.textContent = meds.length;
        var tot = meds.reduce(function (s, m) { return s + (m.price || 0) * m.qty; }, 0);
        var tb = $('#rxTot');
        if (tb) { tb.style.display = meds.length ? 'flex' : 'none'; $('#rxTotVal').textContent = money(tot); }
        safety();
    }
    function safety() {
        var box = $('#rxSafety');
        if (!box || !window.pcSafety || !meds.length) { if (box) box.innerHTML = ''; return; }
        var w = pcSafety.check(P, meds.map(function (m) { return m.name; }));
        if (!w.length) {
            box.innerHTML = '<div style="margin-top:10px;padding:9px 12px;border-radius:10px;' +
                'background:#e9f9ee;color:#1a7a32;font-size:12.5px;font-weight:600">' +
                '<i class="ti ti-shield-check"></i> No allergy or interaction warnings.</div>';
            return;
        }
        box.innerHTML = '<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:#ffebe9;' +
            'border:1px solid #ff3b30"><b style="font-size:12px;color:#8a1f1a">⛔ ' + w.length +
            ' warning' + (w.length > 1 ? 's' : '') + '</b><ul style="list-style:none;margin-top:6px">' +
            w.map(function (x) { return '<li style="font-size:12px;padding:2px 0">' + esc(x.text) + '</li>'; }).join('') +
            '</ul></div>';
    }

    /* ══════════ HISTORY ══════════ */
    function renderHistory() {
        var list = pcFile.list(P.id, CFG.type);
        var unit = CFG.histUnit || 'record';
        $('#histCount').textContent = list.length + ' ' + unit + (list.length === 1 ? '' : 's');
        var box = $('#histList');
        if (!list.length) {
            box.innerHTML = '<div class="pcf-empty"><i class="ti ' + (CFG.icon || 'ti-file-text') + '"></i>' +
                'No ' + esc(CFG.title.toLowerCase()) + ' recorded yet.<br>' +
                '<span style="font-size:11px">Start the first one below.</span></div>';
            return;
        }
        box.innerHTML = list.map(function (f, i) {
            var d = new Date(f.at);
            /* Headline is what the visit was about (first field, e.g. the
               presenting complaint); the sub-line carries the diagnoses.
               Showing only one of the two lost information the old OPD
               list used to display. */
            var dxs = (f.diagnoses || []).map(function (x) { return x.name; }).join(', ');
            var head = f.summary || dxs || (f.title || CFG.title);
            var line = (f.summary && dxs) ? dxs
                     : (f.summary ? (f.title || CFG.title) : (dxs ? (f.title || CFG.title) : '—'));
            var extra = [];
            if ((f.attachments || []).length) extra.push('<i class="ti ti-paperclip"></i>' + f.attachments.length);
            if (f.rdv) extra.push('<i class="ti ti-calendar-event"></i>');
            return '<div class="pcf-hrow" data-i="' + i + '">' +
                '<div class="date"><div class="d">' + d.getDate() + '</div>' +
                '<div class="m">' + d.toLocaleDateString('en-GB', { month: 'short' }) + '</div></div>' +
                '<div class="meat"><b>' + esc(head) + '</b><span>' + esc(line) + '</span></div>' +
                '<div class="by">' + esc(f.by || '') + '<br>' +
                d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
                (extra.length ? '<br>' + extra.join(' ') : '') + '</div>' +
                '<i class="ti ti-chevron-right" style="color:#c7c7cc"></i></div>';
        }).join('');
        box.querySelectorAll('.pcf-hrow').forEach(function (r) {
            r.onclick = function () { openFile(list[+r.dataset.i]); };
        });
    }

    function showFileView(on) {
        $('#viewHistory').style.display = on ? 'none' : '';
        $('#viewFile').style.display = on ? 'flex' : 'none';
    }

    function openFile(f) {
        viewing = f;
        showFileView(true);
        $('#fileMode').textContent = 'Viewing ' + longDate(f.at);
        $('#saveBtn').style.display = 'none';
        $('#editBtn').style.display = '';
        $('#editBtn').onclick = function() { editFile(f); };
        $('#workPane').style.display = 'none';
        $('#fileGrid').classList.remove('wide');
        $('#fileGrid').classList.add('single');
        ['#toolDx', '#toolRdv', '#toolAtt'].forEach(function (s) { var e = $(s); if (e) e.style.display = 'none'; });
        paintDoc(f);
    }

    function editFile(f) {
        if (!f) return;
        viewing = null;
        editingId = f.id;
        chosenDx = (f.diagnoses || []).slice();
        files = (f.attachments || []).slice();
        meds = (f.medications || []).slice();
        rdv = f.rdv || null;

        showFileView(true);
        $('#fileMode').textContent = 'Editing ' + CFG.title + ' — ' + longDate(f.at);
        $('#saveBtn').style.display = '';
        $('#editBtn').style.display = 'none';
        $('#workPane').style.display = '';
        $('#fileGrid').classList.add('wide');
        $('#fileGrid').classList.remove('single');
        ['#toolDx', '#toolRdv', '#toolAtt'].forEach(function (s) { var e = $(s); if (e) e.style.display = ''; });

        chipCount('#toolDx', chosenDx.length);
        chipCount('#toolAtt', files.length);

        CFG.fields.forEach(function (fd) {
            setVal('f_' + fd.id, (f.fields || {})[fd.id] || '');
        });

        if (CFG.vitals && f.vitals) {
            setVal('v_bp', f.vitals.bp || '');
            setVal('v_temp', f.vitals.temp || '');
            setVal('v_pulse', f.vitals.pulse || '');
            setVal('v_weight', f.vitals.weight || '');
        }
        if (CFG.rx) renderMeds();
        paintDoc();
        pcToast('Editing ' + CFG.title + '. Make changes and click Save.', 'info');
    }

    function newFile() {
        viewing = null; editingId = null; chosenDx = []; files = []; meds = []; rdv = null;
        showFileView(true);
        $('#fileMode').textContent = 'New ' + CFG.title + ' — ' + longDate(new Date());
        $('#saveBtn').style.display = '';
        $('#editBtn').style.display = 'none';
        $('#workPane').style.display = '';
        $('#fileGrid').classList.add('wide');
        $('#fileGrid').classList.remove('single');
        ['#toolDx', '#toolRdv', '#toolAtt'].forEach(function (s) { var e = $(s); if (e) e.style.display = ''; });
        chipCount('#toolDx', 0); chipCount('#toolAtt', 0);
        var lbl = $('#rdvChipLbl'); if (lbl) lbl.textContent = 'RDV';
        var rc = $('#toolRdv'); if (rc) rc.classList.remove('has');

        CFG.fields.forEach(function (f) { setVal('f_' + f.id, f.value || ''); });

        if (CFG.vitals) {
            var v = (P.vitals && P.vitals.length) ? P.vitals[P.vitals.length - 1] : null;
            setVal('v_bp', v ? (v.bp || v.bloodPressure || '') : '');
            setVal('v_temp', v ? (v.temp || v.temperature || '') : '');
            setVal('v_pulse', v ? (v.pulse || '') : '');
            setVal('v_weight', v ? (v.weight || '') : '');
        }
        if (CFG.rx) renderMeds();
        paintDoc();
        var first = $('#workPane input, #workPane textarea');
        if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 120);
    }

    function backToHistory() {
        viewing = null; editingId = null;
        showFileView(false);
        renderHistory();
    }

    /* ══════════ THE DOCUMENT ══════════ */
    function gather() {
        if (viewing) return viewing;
        var o = {
            id: editingId || null,
            type: CFG.type, patientId: P.id, patientName: pcFile.nameOf(P), title: CFG.title,
            at: new Date().toISOString(), by: pcFile.staff().name || '',
            diagnoses: chosenDx.slice(), medications: meds.slice(),
            attachments: files.map(function (f) {
                return { name: f.name, type: f.type, size: f.size, data: f.data }; }),
            rdv: rdv ? { date: rdv.date, reason: rdv.reason } : null,
            fields: {}
        };
        CFG.fields.forEach(function (f) { o.fields[f.id] = val('f_' + f.id); });
        if (CFG.vitals) o.vitals = { bp: val('v_bp'), temp: val('v_temp'), pulse: val('v_pulse'), weight: val('v_weight') };
        var first = CFG.fields[0];
        /* The history row shows this as a one-line headline. Now that the
           first field can be a whole dictated paragraph (OPD merged the
           chief complaint and the HPI), take just the first sentence or
           ~90 chars so a long entry cannot stretch the row. */
        o.summary = first ? (o.fields[first.id] || '') : '';
        if (o.summary) {
            var flat = o.summary.replace(/\s+/g, ' ').trim();
            var stop = flat.search(/[.!?](\s|$)/);
            if (stop > 0 && stop < 90) flat = flat.slice(0, stop);
            else if (flat.length > 90) flat = flat.slice(0, 90).replace(/\s\S*$/, '') + '…';
            o.summary = flat;
        }
        if (!o.summary && o.diagnoses.length) o.summary = o.diagnoses[0].name;
        return o;
    }

    function paintDoc(f) {
        f = f || gather();
        var d = new Date(f.at);
        var body = CFG.fields.map(function (fd) {
            var v = (f.fields || {})[fd.id];
            if (!v) return '';
            return '<div class="sec"><h4>' + esc(fd.label) + '</h4><p>' + esc(v) + '</p></div>';
        }).join('');

        var vt = f.vitals || {};
        var vs = [vt.bp && ('BP ' + vt.bp), vt.temp && ('Temp ' + vt.temp + '°C'),
                  vt.pulse && ('Pulse ' + vt.pulse), vt.weight && ('Weight ' + vt.weight)]
                 .filter(Boolean).join('   ·   ');
        var vb = vs ? '<div class="sec"><h4>Vital signs</h4><p>' + esc(vs) + '</p></div>' : '';

        var dxb = (f.diagnoses || []).length
            ? '<div class="sec"><h4>Diagnosis</h4><div class="dxrow">' +
              f.diagnoses.map(function (x) {
                  return '<span>' + (x.code ? esc(x.code) + ' · ' : '') + esc(x.name) + '</span>'; }).join('') +
              '</div></div>' : '';

        var rxb = '';
        if ((f.medications || []).length) {
            var mt = f.medications.reduce(function (s, m) { return s + (m.price || 0) * m.qty; }, 0);
            rxb = '<div class="sec"><h4>Medication</h4>' +
                '<table style="width:100%;font-size:12px;border-collapse:collapse">' +
                f.medications.map(function (m, i) {
                    return '<tr><td style="padding:3px 0">' + (i + 1) + '. <b>' + esc(m.name) + '</b> — ' +
                        esc(m.dose) + (m.duration && m.duration !== '—' ? ' × ' + esc(m.duration) : '') +
                        (m.note ? ' (' + esc(m.note) + ')' : '') + '</td>' +
                        '<td style="text-align:right;padding:3px 0;white-space:nowrap">×' + m.qty +
                        (m.price ? ' · ' + money(m.price * m.qty) : '') + '</td></tr>';
                }).join('') +
                (mt ? '<tr><td style="padding-top:6px;border-top:1px solid #ddd;font-weight:800">Total</td>' +
                      '<td style="padding-top:6px;border-top:1px solid #ddd;text-align:right;font-weight:800">' +
                      money(mt) + '</td></tr>' : '') +
                '</table></div>';
        }

        var rdvb = f.rdv
            ? '<div class="sec"><h4>Next appointment (RDV)</h4><p><b>' + longDate(f.rdv.date) +
              '</b> — ' + esc(f.rdv.reason) + '</p></div>' : '';

        var atb = (f.attachments || []).length
            ? '<div class="sec"><h4>Attachments</h4><p>' +
              f.attachments.map(function (a) { return '• ' + esc(a.name); }).join('<br>') + '</p></div>' : '';

        $('#doc').innerHTML =
        '<div class="dh"><div><div class="org">PClinic</div>' +
          '<div class="sub">Hospital Management System<br>Kigali, Rwanda<br>+250 784 446 481</div></div>' +
          '<div class="meta"><div><b>' + esc(CFG.ref) + '-' + esc(P.id) + '-' + d.getFullYear() + '</b></div>' +
          '<div>' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '</div>' +
          '<div>' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '</div></div></div>' +
        '<div class="dtitle">' + esc(CFG.docTitle) + '</div>' +
        '<div class="pinfo">' +
          '<div><span>Patient</span><b>' + esc(pcFile.nameOf(P)) + '</b></div>' +
          '<div><span>File no.</span>' + esc(P.mrn || ('ID ' + P.id)) + '</div>' +
          '<div><span>Age / Sex</span>' + esc(pcFile.age(P.dob)) + (P.gender ? ' · ' + esc(P.gender) : '') + '</div>' +
          '<div><span>District</span>' + esc(P.district || '—') + '</div>' +
          (P.insurance && P.insurance.provider
            ? '<div><span>Insurance</span>' + esc(P.insurance.provider) + '</div>' : '') +
          '<div><span>Recorded by</span>' + esc(f.by || pcFile.staff().name || '') + '</div>' +
        '</div>' +
        (body || '<div class="sec"><p class="none">Nothing recorded yet.</p></div>') +
        vb + dxb + rxb + rdvb + atb +
        '<div class="sig"><div>Patient signature</div><div>' + esc(f.by || pcFile.staff().name || '') +
          '<br>' + esc(CFG.signer || 'Attending Physician') + '</div></div>' +
        '<div class="stamp">PClinic · generated ' + new Date().toLocaleString('en-GB') + '</div>';
    }

    /* ══════════ SAVE ══════════ */
    function saveFile() {
        var rec = gather();
        var any = CFG.fields.some(function (f) { return rec.fields[f.id]; }) ||
                  rec.diagnoses.length || rec.medications.length;
        if (!any) { pcToast('Fill in at least one section', 'error'); return; }

        if (CFG.rx && rec.medications.length && window.pcSafety) {
            var w = pcSafety.check(P, rec.medications.map(function (m) { return m.name; }))
                    .filter(function (x) { return x.level === 'danger'; });
            if (w.length && !confirm('⛔ ' + w.length + ' SERIOUS WARNING' + (w.length > 1 ? 'S' : '') + ':\n\n' +
                w.map(function (x) { return '• ' + x.text; }).join('\n') + '\n\nPrescribe anyway?')) return;
            if (w.length) rec.overrideWarnings = w.map(function (x) { return x.text; });
        }

        if (CFG.vitals && rec.vitals && (rec.vitals.bp || rec.vitals.temp || rec.vitals.pulse || rec.vitals.weight)
            && typeof window.addVitals === 'function') {
            try {
                window.addVitals(P.id, { bp: rec.vitals.bp, temp: rec.vitals.temp,
                    pulse: rec.vitals.pulse, weight: rec.vitals.weight,
                    recordedBy: pcFile.staff().name || '' });
            } catch (e) {}
        }
        if (rec.rdv) pcFile.saveRdv(P, rec.rdv.date, rec.rdv.reason);
        /* Each drug bills itself: the order carries the real unit price and
           quantity, so pcOrders raises a bill and the cashier sees the
           medication with the money in front of them. Previously every
           line went out at price 0 and bill:false — the pharmacy got the
           script but nobody was ever charged. */
        if (CFG.rx && rec.medications.length && window.pcOrders) {
            var rxOrder = pcOrders.create({
                patientId: P.id, patientName: pcFile.nameOf(P), type: 'prescription',
                items: rec.medications.map(function (m) {
                    return { code: m.code || '', name: m.name + '  ' + m.dose +
                             (m.duration && m.duration !== '—' ? '  ×' + m.duration : ''),
                             qty: m.qty, price: m.price || 0 };
                })
            });
            if (rxOrder) { rec.orderId = rxOrder.id; rec.billId = rxOrder.billId; }
            rec.medTotal = rec.medications.reduce(function (s, m) {
                return s + (m.price || 0) * m.qty; }, 0);
        }
        pcFile.save(rec);
        pcToast(CFG.title + ' saved' + (rec.rdv ? ' · RDV sent to reception' : '') +
                (CFG.rx && rec.medications.length ? ' · sent to pharmacy' : ''), 'success');
        setTimeout(backToHistory, 450);
    }

    /* ══════════ INIT ══════════ */
    function init(cfg) {
        CFG = cfg;
        document.title = 'PClinic — ' + cfg.title;
        var sub = $('#appSub'); if (sub) sub.textContent = cfg.sub || cfg.title;

        document.addEventListener('input', function (e) {
            if (e.target.closest('#viewFile') && !viewing) paintDoc();
        });
        // Cmd/Ctrl+S saves, Cmd/Ctrl+P prints the document window
        document.addEventListener('keydown', function (e) {
            if (!(e.metaKey || e.ctrlKey)) return;
            if (e.key === 's') { e.preventDefault(); if ($('#viewFile').style.display !== 'none' && !viewing) saveFile(); }
            if (e.key === 'p') { e.preventDefault(); if ($('#viewFile').style.display !== 'none')
                pcFile.print('#doc', CFG.docTitle + ' — ' + pcFile.nameOf(P)); }
        });

        function runPage(s) {
            if (window.__pcfRan) return;
            window.__pcfRan = true;
            s = s || { name: 'Dr. Mutua', role: 'Doctor' };
            window.currentStaff = s;
            var un = $('#userName'), ua = $('#userAvatar');
            if (un) un.textContent = s.name;
            if (ua) ua.textContent = (s.name || '??').substring(0, 2).toUpperCase();

            window.addEventListener('message', function (e) {
                if (e.data && e.data.type === 'LOAD_PATIENT' && e.data.patient && e.data.patient.id) {
                    try { localStorage.setItem('pclinic_active_patient', String(e.data.patient.id)); } catch (err) {}
                    P = e.data.patient;
                    shell();
                    renderHistory();
                }
            });

            var tries = 0;
            (function wait() {
                P = pcFile.patient();
                if (P) {
                    if (typeof pcFile.renderDemoBar === 'function') {
                        pcFile.renderDemoBar('#pcfRoot', P);
                    }
                    shell();
                    renderHistory();
                    return;
                }
                if (++tries < 20) return setTimeout(wait, 200);
                $('#pcfRoot').innerHTML =
                    '<div class="pcf-panel"><div class="pcf-empty"><i class="ti ti-user-off"></i>' +
                    'No patient selected.<br><span style="font-size:11px">' +
                    'Open this from the doctor dashboard with a patient active.</span><br>' +
                    '<a href="doctor-dashboard.html" class="pcf-btn" style="margin-top:14px;text-decoration:none">' +
                    '<i class="ti ti-layout-dashboard"></i> Go to the dashboard</a></div></div>';
            })();
        }

        requireAuth([]).then(function (s) { runPage(s); }).catch(function () {
            runPage({ name: 'Dr. Mutua', role: 'Doctor' });
        });
        setTimeout(function() {
            if (!window.__pcfRan) runPage({ name: 'Dr. Mutua', role: 'Doctor' });
        }, 600);
    }

    window.pcFilePage = { init: init, paint: paintDoc, patient: function () { return P; } };
})();
