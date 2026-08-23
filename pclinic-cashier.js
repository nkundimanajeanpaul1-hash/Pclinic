/* ============================================================
   PCLINIC — CASHIER & FINANCE BILL FEED
   Renders the live bill queue into the cashier and finance
   dashboards, and gives finance a real revenue summary.

     pcBillFeed.mountCashier('#target');
     pcBillFeed.mountFinance('#target');

   Both boards previously showed hardcoded rows. Bills raised by a
   doctor never reached them.
   ============================================================ */
(function () {
    'use strict';

    var mounts = [];

    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function patientInitials(name) {
        return String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function(part){ return part.charAt(0).toUpperCase(); }).join('') || '?';
    }
    function patientIdentity(name, patientId, meta) {
        return '<div class="cashier-patient-cell">' +
            '<span class="cashier-patient-avatar">' + esc(patientInitials(name)) + '</span>' +
            '<span class="cashier-patient-info"><span class="cashier-patient-name">' + esc(name || 'Patient') + '</span>' +
            '<span class="cashier-patient-meta">' + esc(meta || 'Billing patient') + '<span class="cashier-patient-mrn">MRN ' + esc(patientId || '—') + '</span></span></span></div>';
    }

    /* ─── SVG SYSTEM VERIFICATION BARCODE GENERATOR ─── */
    function generateSVGBarcode(textString) {
        var str = String(textString || 'MOD-VERIFY-0001').toUpperCase();
        var bars = [];
        var x = 4;
        bars.push('<rect x="' + x + '" y="0" width="2" height="38" fill="#1d1d1f"/>'); x += 4;
        bars.push('<rect x="' + x + '" y="0" width="1" height="38" fill="#1d1d1f"/>'); x += 3;

        for (var i = 0; i < str.length; i++) {
            var code = str.charCodeAt(i);
            var w1 = (code % 3) + 1;
            var gap1 = ((code >> 2) % 2) + 2;
            var w2 = ((code >> 3) % 2) + 1;
            var gap2 = ((code >> 1) % 2) + 1;
            
            bars.push('<rect x="' + x + '" y="0" width="' + w1 + '" height="30" fill="#1d1d1f"/>'); x += (w1 + gap1);
            bars.push('<rect x="' + x + '" y="0" width="' + w2 + '" height="30" fill="#1d1d1f"/>'); x += (w2 + gap2);
        }
        bars.push('<rect x="' + x + '" y="0" width="2" height="38" fill="#1d1d1f"/>'); x += 4;
        bars.push('<rect x="' + x + '" y="0" width="3" height="38" fill="#1d1d1f"/>'); x += 5;

        var totalWidth = Math.max(160, x + 4);
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + totalWidth + ' 48" width="100%" height="48" style="max-width:210px; display:block; margin:0 0 0 auto;">' +
               bars.join('') +
               '<text x="' + (totalWidth / 2) + '" y="45" font-family="monospace" font-size="9" font-weight="bold" fill="#1d1d1f" text-anchor="middle" letter-spacing="1">' + esc(str) + '</text>' +
               '</svg>';
    }

    function money(n) { return 'RWF ' + (Number(n) || 0).toLocaleString('en-US'); }
    function when(iso) {
        var s = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    function statusPill(s) {
        var m = {
            pending:   ['#fff4e0', '#7a4500'],
            partial:   ['#eaf2ff', '#0071e3'],
            paid:      ['#e9f9ee', '#1a7a32'],
            cancelled: ['#ffebe9', '#8a1f1a']
        }[s] || ['#f2f2f4', '#8e8e93'];
        return '<span style="font-size:9.5px;font-weight:700;padding:3px 9px;border-radius:30px;' +
               'background:' + m[0] + ';color:' + m[1] + '">' + esc(s) + '</span>';
    }

    /* ── CASHIER: one row per bill, click to open the receipt ── */
    function cashierRow(b) {
        var items = (b.items || []).map(function (i) { return i.name; }).join(', ');
        var btn = 'style="height:27px;padding:0 12px;border-radius:8px;border:0;background:#0071e3;' +
                  'color:#fff;font-family:inherit;font-size:11.5px;font-weight:600;cursor:pointer"';
        return '<tr data-bill="' + esc(b.id) + '" onclick="if(window.selectCashierPatient) selectCashierPatient(\'' + esc(b.patientId) + '\')" style="cursor:pointer">' +
            '<td>' + patientIdentity(b.patientName || 'Patient', b.patientId, (b.number || 'Invoice') + ' · ' + when(b.createdAt)) + '</td>' +
            '<td style="font-size:11.5px;color:#8e8e93">ID ' + esc(b.patientId) + '</td>' +
            '<td style="font-size:11.5px;max-width:230px">' + esc(items || '—') + '</td>' +
            '<td style="font-weight:700;white-space:nowrap">' + money(b.total) +
                '<div style="font-size:9.5px;color:#6e6e73;font-weight:600">Patient ' + esc(b.patientPayPercent != null ? b.patientPayPercent : 100) + '%</div>' +
                (Number(b.insuranceCovered || 0) > 0 ? '<div style="font-size:9.5px;color:#0f766e;font-weight:600">Insurance: ' + money(b.insuranceCovered) + '</div>' : '') +
                (b.balance > 0 && b.paid > 0 ? '<div style="font-size:10.5px;color:#8a1f1a;font-weight:600">' +
                 money(b.balance) + ' due</div>' : '') + '</td>' +
            '<td style="font-size:11.5px">' + esc((b.payments && b.payments.length) ? b.payments[b.payments.length - 1].method : '—') + '</td>' +
            '<td>' + statusPill(b.status) + '</td>' +
            '<td style="font-size:11.5px;color:#8e8e93">' + esc(b.source || '—') + '</td>' +
            '<td style="text-align:right;white-space:nowrap">' +
                '<button ' + btn + ' ' + (b.status === 'paid' ? ('onclick="openCashierReceiptModal(\'' + esc(b.id) + '\')"') : ('onclick="openCashierPaymentModal(\'' + esc(b.id) + '\')"')) + '>' +
                (b.status === 'paid' ? 'Receipt' : 'Take Payment') + '</button></td>' +
        '</tr>';
    }

    /* ── ACCORDION UNFOLD HELPER ── */
    window.togglePatientInvoices = function(key) {
        var row = document.getElementById('child_' + key);
        var icon = document.getElementById('icon_' + key);
        if (!row) return;
        if (row.style.display === 'none' || row.style.display === '') {
            row.style.display = 'table-row';
            if (icon) icon.style.transform = 'rotate(90deg)';
        } else {
            row.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(0deg)';
        }
    };

    /* ── ACCORDION UNFOLD HELPER WITH SMART ANIMATION ── */
    window.togglePatientInvoices = function(key) {
        var row = document.getElementById('child_' + key);
        var icon = document.getElementById('icon_' + key);
        var master = document.getElementById('master_' + key);
        if (!row) return;
        if (row.style.display === 'none' || row.style.display === '') {
            row.style.display = 'table-row';
            row.classList.add('pc-accordion-expand');
            if (icon) icon.style.transform = 'rotate(90deg)';
            if (master) master.style.background = '#eef4fc';
        } else {
            row.style.display = 'none';
            row.classList.remove('pc-accordion-expand');
            if (icon) icon.style.transform = 'rotate(0deg)';
            if (master) master.style.background = '#f8f9fc';
        }
    };

    function paintCashier(m) {
        var el = document.querySelector(m.target);
        if (!el || !window.pcBilling) return;
        try { var _pcB = window.pcBilling || (typeof pcBilling !== 'undefined' ? pcBilling : null); if (_pcB && typeof _pcB.purge === 'function') _pcB.purge(); } catch(e) {}
        var _pcB = window.pcBilling || (typeof pcBilling !== 'undefined' ? pcBilling : null); if (!_pcB) return; var bills = _pcB.list().filter(function (b) { return b.status !== 'cancelled'; });

        // Filter by Search Input (#searchInput)
        var searchEl = document.getElementById('searchInput');
        var query = (searchEl && searchEl.value) ? searchEl.value.toLowerCase().trim() : '';
        if (query) {
            bills = bills.filter(function(b) {
                var matchName = (b.patientName || '').toLowerCase().includes(query);
                var matchId   = String(b.patientId || '').toLowerCase().includes(query);
                var matchNum  = (b.number || '').toLowerCase().includes(query);
                var matchSrc  = (b.source || '').toLowerCase().includes(query);
                return matchName || matchId || matchNum || matchSrc;
            });
        }

        // Filter by Active Status Chip
        var activeChipEl = document.querySelector('.chip.on');
        var activeChip = activeChipEl ? (activeChipEl.getAttribute('data-status') || activeChipEl.textContent.toLowerCase().trim()) : 'all';
        if (activeChip && activeChip !== 'all') {
            bills = bills.filter(function(b) {
                return b.status === activeChip.toLowerCase();
            });
        }

        if (!bills.length) {
            el.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:38px;color:#8e8e93;font-size:12.5px">' +
                '<div style="font-size:32px;opacity:.35;margin-bottom:8px">🧾</div>' +
                '<strong>No hospital bills found in Common Server.</strong><br><span style="font-size:11px">Bills raised by doctors for registered patients appear here automatically. Zero template patients.</span>' +
                '</td></tr>';
            updateKpis();
            return;
        }

        // ── GROUP ALL BILLS BY PATIENT (NO DUPLICATE PATIENT NAMES IN QUEUE) ──
        var groups = {};
        var groupOrder = [];

        bills.forEach(function(b) {
            if (!b) return;
            var pid = String(b.patientId || '').replace(/^MOD-/i, '').trim();
            var pname = String(b.patientName || '').trim();
            var key = (pid || pname.toLowerCase() || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
            if (!groups[key]) {
                groups[key] = {
                    key: key,
                    patientId: pid || b.patientId || '',
                    patientName: pname || 'Patient ID ' + pid,
                    bills: [],
                    totalAmount: 0,
                    totalBalance: 0,
                    totalPaid: 0,
                    source: b.source || 'OPD',
                    createdAt: b.createdAt || new Date().toISOString()
                };
                groupOrder.push(key);
            }
            var g = groups[key];
            g.bills.push(b);
            g.totalAmount += (Number(b.total) || 0);
            var due = (b.balance != null ? Number(b.balance) : Number(b.total)) || 0;
            g.totalBalance += due;
            g.totalPaid += (Number(b.paid) || 0);
            if (new Date(b.createdAt) > new Date(g.createdAt)) {
                g.createdAt = b.createdAt;
                g.source = b.source || g.source;
            }
        });

        // Sort groups: unpaid balance > 0 first, then newest
        groupOrder.sort(function(keyA, keyB) {
            var gA = groups[keyA], gB = groups[keyB];
            var aPaid = gA.totalBalance === 0 ? 1 : 0;
            var bPaid = gB.totalBalance === 0 ? 1 : 0;
            if (aPaid !== bPaid) return aPaid - bPaid;
            return new Date(gB.createdAt) - new Date(gA.createdAt);
        });

        var htmlRows = groupOrder.map(function(key) {
            var g = groups[key];
            if (g.bills.length === 1) {
                return cashierRow(g.bills[0]);
            }

            // Multiple invoices -> Accordion Master Row + Darker Child Table Row
            var masterHtml = '<tr id="master_' + esc(g.key) + '" class="patient-master-row" onclick="if(window.selectCashierPatient) selectCashierPatient(\'' + esc(g.patientId) + '\'); togglePatientInvoices(\'' + esc(g.key) + '\')" style="cursor:pointer; background:#f8f9fc; border-bottom:1px solid rgba(0,0,0,0.08); transition:background 0.28s ease;">' +
                '<td><div style="display:flex;align-items:center;gap:7px;">' +
                    '<i class="ti ti-chevron-right unfold-icon" id="icon_' + esc(g.key) + '" style="transition:transform .28s cubic-bezier(.34,1.56,.64,1);color:#0071e3;font-size:15px;"></i>' +
                    patientIdentity(g.patientName, g.patientId, g.bills.length + ' invoices · Click to unfold') +
                '</div></td>' +
                '<td style="font-size:11.5px; color:#8e8e93;">MOD-' + esc(g.patientId) + '</td>' +
                '<td style="font-size:11.5px; max-width:240px;">' +
                    '<span style="background:rgba(0,113,227,0.12); color:#0071e3; padding:2px 8px; border-radius:6px; font-weight:700; font-size:10.5px;">' +
                        g.bills.length + ' Invoices Combined' +
                    '</span>' +
                    '<div style="font-size:10.5px; color:#666; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
                        esc(g.bills.map(function(b){ return (b.items||[]).map(function(i){ return i.name; }).join(', '); }).join('; ')) +
                    '</div>' +
                '</td>' +
                '<td style="font-weight:800; white-space:nowrap;">' +
                    money(g.totalAmount) +
                    (g.totalBalance > 0 ? '<div style="font-size:10.5px; color:#ef4444; font-weight:700;">' + money(g.totalBalance) + ' total due</div>' : '') +
                '</td>' +
                '<td style="font-size:11.5px;">Multiple</td>' +
                '<td>' + statusPill(g.totalBalance === 0 ? 'paid' : (g.totalPaid > 0 ? 'partial' : 'pending')) + '</td>' +
                '<td style="font-size:11.5px; color:#8e8e93;">' + esc(g.source) + '</td>' +
                '<td style="text-align:right; white-space:nowrap;" onclick="event.stopPropagation();">' +
                    '<button type="button" class="ra-btn ra-blue" onclick="togglePatientInvoices(\'' + esc(g.key) + '\')" style="height:27px; padding:0 12px; font-size:11px; font-weight:700;">' +
                        '📂 Unfold Invoices (' + g.bills.length + ') ⌄' +
                    '</button>' +
                '</td>' +
            '</tr>';

            // SLIGHTLY DARKER, RICH SLATE-GREY APPLE INSET THEME FOR NESTED INVOICES
            var childRows = g.bills.map(function(b) {
                var itemsTxt = (b.items || []).map(function(i) { return i.name; }).join(', ');
                var due = (b.balance != null ? Number(b.balance) : Number(b.total)) || 0;
                var btnAttr = (b.status === 'paid') ?
                    ('onclick="openCashierReceiptModal(\'' + esc(b.id) + '\')"') :
                    ('onclick="openCashierPaymentModal(\'' + esc(b.id) + '\')"');
                return '<tr style="border-bottom:1px solid #cbd5e1; background:#f1f5f9; color:#0f172a; transition:background 0.15s;" onmouseover="this.style.background=\'#e2e8f0\'" onmouseout="this.style.background=\'#f1f5f9\'">' +
                    '<td style="padding:11px 14px; font-weight:800;">' +
                        '<span style="background:#cbd5e1; color:#0f172a; font-family:monospace; font-size:11.5px; font-weight:800; padding:3px 8px; border-radius:6px; border:0.5px solid #94a3b8;">' + esc(b.number || b.id) + '</span>' +
                    '</td>' +
                    '<td style="padding:11px 14px; font-size:11px; color:#334155; font-weight:600;">' + esc(b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-GB') : 'Today') + '</td>' +
                    '<td style="padding:11px 14px; font-size:12px; font-weight:600; color:#0f172a;">' + esc(itemsTxt || 'Clinical Service') + '</td>' +
                    '<td style="padding:11px 14px; font-weight:800; color:#0f172a;">' +
                        money(b.total) +
                        (due > 0 ? '<div style="font-size:10.5px; color:#b91c1c; font-weight:800;">' + money(due) + ' due</div>' : '') +
                    '</td>' +
                    '<td style="padding:11px 14px;">' + statusPill(b.status) + '</td>' +
                    '<td style="padding:11px 14px; text-align:right;" colspan="3">' +
                        '<button type="button" class="ra-btn ' + (b.status === 'paid' ? '' : 'ra-blue') + '" ' + btnAttr + ' style="height:27px; padding:0 14px; font-size:11.5px; font-weight:800; box-shadow:0 2px 6px rgba(0,113,227,0.25);">' +
                            (b.status === 'paid' ? 'Receipt' : 'Take Payment') +
                        '</button>' +
                    '</td>' +
                '</tr>';
            }).join('');

            var childHtml = '<tr id="child_' + esc(g.key) + '" class="patient-child-row" style="display:none; background:#e2e8f0;">' +
                '<td colspan="8" style="padding:18px 26px; background:#e2e8f0; border-bottom:2px solid #0071e3; border-top:1px solid #cbd5e1; box-shadow:inset 0 4px 12px rgba(0,0,0,0.06);">' +
                    '<div style="font-size:12px; font-weight:900; color:#1e293b; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; letter-spacing:0.02em;">' +
                        '<span>📋 INDIVIDUAL INVOICES FOR ' + esc(g.patientName.toUpperCase()) + ' (' + g.bills.length + ' INVOICES):</span>' +
                        '<span style="font-size:11px; color:#475569; font-weight:700;">Click "Take Payment" on any specific invoice below</span>' +
                    '</div>' +
                    '<table style="width:100%; border-collapse:collapse; background:#f1f5f9; border-radius:12px; overflow:hidden; border:1px solid #94a3b8; box-shadow:0 6px 18px rgba(0,0,0,0.08);">' +
                        '<thead>' +
                            '<tr style="background:#cbd5e1; font-size:11px; color:#1e293b; font-weight:800; text-transform:uppercase; border-bottom:1.5px solid #94a3b8;">' +
                                '<th style="padding:10px 14px; text-align:left;">Invoice #</th>' +
                                '<th style="padding:10px 14px; text-align:left;">Date</th>' +
                                '<th style="padding:10px 14px; text-align:left;">Items &amp; Consultation</th>' +
                                '<th style="padding:10px 14px; text-align:left;">Amount Due</th>' +
                                '<th style="padding:10px 14px; text-align:left;">Status</th>' +
                                '<th style="padding:10px 14px; text-align:right;" colspan="3">Action</th>' +
                            '</tr>' +
                        '</thead>' +
                        '<tbody>' +
                            childRows +
                        '</tbody>' +
                    '</table>' +
                '</td>' +
            '</tr>';

            return masterHtml + childHtml;
        }).join('');

        el.innerHTML = htmlRows;
        updateKpis();
    }

    /* ── Live KPI counters, if the page exposes them ── */
    function updateKpis() {
        var _pcB = window.pcBilling || (typeof pcBilling !== 'undefined' ? pcBilling : null);
        if (!_pcB) return;
        var r = _pcB.revenue();
        var all = _pcB.list();
        var unpaid = all.filter(function(b) { return (b.status === 'pending' || b.status === 'partial') && b.status !== 'cancelled'; }).length;
        var paidCount = all.filter(function(b) { return b.status === 'paid'; }).length;
        var claimsCount = all.filter(function(b) { 
            var src = String(b.source || '').toLowerCase();
            var pm  = String((b.payments && b.payments.length) ? b.payments[b.payments.length - 1].method : '').toLowerCase();
            var provider = String(b.insurance && b.insurance.provider ? b.insurance.provider : '').toLowerCase();
            return Number(b.insuranceCovered || 0) > 0 || provider || src.indexOf('rssb') !== -1 || src.indexOf('insurance') !== -1 || pm.indexOf('rssb') !== -1 || pm.indexOf('insurance') !== -1 || pm.indexOf('mutuelle') !== -1;
        }).length;

        set('#pcKpiBilled',      money(r.billed));
        set('#pcKpiCollected',   money(r.collected));
        set('#pcKpiOutstanding', money(r.outstanding));
        set('#pcKpiUnpaid',      unpaid);
        set('#pcKpiCount',       r.count);
        set('#statTotalBills',   all.length);

        // Update Mini KPI Strip (#view_reports)
        set('#pcKpiBilledMini',      money(r.billed));
        set('#pcKpiCollectedMini',   money(r.collected));
        set('#pcKpiOutstandingMini', money(r.outstanding));
        set('#pcKpiUnpaidMini',      unpaid);
        set('#statTotalBillsMini',   all.length);

        // Update Reception-Style Tab Count Badges
        set('#qcnt',      unpaid);
        set('#invcnt',    all.length);
        set('#paycnt',    paidCount);
        set('#claimscnt', claimsCount);
        set('#reportscnt', all.length);
    }
    function set(sel, val) {
        var e = document.querySelector(sel);
        if (e) e.textContent = val;
    }

    /* ── FINANCE: revenue summary panel ── */
    function paintFinance(m) {
        var el = document.querySelector(m.target);
        if (!el || !window.pcBilling) return;
        var r = pcBilling.revenue();
        var methods = Object.keys(r.byMethod || {});
        var card = function (label, value, colour) {
            return '<div style="flex:1;min-width:150px;padding:13px 15px;border-radius:13px;' +
                   'background:var(--glass-bg,#fff);border:.5px solid rgba(0,0,0,.07);' +
                   'box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
                   '<div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;' +
                   'color:#8e8e93">' + esc(label) + '</div>' +
                   '<div style="font-size:19px;font-weight:800;margin-top:3px;color:' + colour + '">' +
                   esc(value) + '</div></div>';
        };
        el.innerHTML =
            '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
                card('Total billed',  money(r.billed),      'var(--tp,#1c1c1e)') +
                card('Collected',     money(r.collected),   '#1a7a32') +
                card('Outstanding',   money(r.outstanding), '#8a1f1a') +
                card('Invoices',      r.count,              'var(--ac,#0071e3)') +
            '</div>' +
            (methods.length
                ? '<div style="padding:13px 15px;border-radius:13px;background:var(--glass-bg,#fff);' +
                  'border:.5px solid rgba(0,0,0,.07)">' +
                  '<div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;' +
                  'color:#8e8e93;margin-bottom:8px">Collected by method</div>' +
                  methods.map(function (k) {
                      var pct = r.collected ? Math.round(r.byMethod[k] / r.collected * 100) : 0;
                      return '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;font-size:12.5px">' +
                             '<span style="width:86px;text-transform:capitalize">' + esc(k) + '</span>' +
                             '<span style="flex:1;height:7px;border-radius:5px;background:#eee;overflow:hidden">' +
                             '<span style="display:block;height:100%;width:' + pct + '%;background:#0071e3"></span></span>' +
                             '<b style="width:110px;text-align:right">' + money(r.byMethod[k]) + '</b></div>';
                  }).join('') + '</div>'
                : '<div style="padding:20px;text-align:center;color:#8e8e93;font-size:12.5px">' +
                  'No payments recorded yet.</div>');
        updateKpis();
    }

    function repaint() {
        mounts.forEach(function (m) {
            (m.kind === 'finance' ? paintFinance : paintCashier)(m);
        });
    }

    window.pcBillFeed = {
        repaintCashier: function() {
            mounts.forEach(function (m) {
                if (m.kind === 'cashier') paintCashier(m);
            });
        },
        mountCashier: function (target) {
            if (!target) return;
            mounts.push({ kind: 'cashier', target: target });
            repaint();
        },
        mountFinance: function (target) {
            if (!target) return;
            mounts.push({ kind: 'finance', target: target });
            repaint();
        },
        refresh: repaint
    };

    window.addEventListener('billsUpdated', repaint);
    window.addEventListener('ordersUpdated', repaint);
    window.addEventListener('storage', repaint);
    window.addEventListener('focus', repaint);
    document.addEventListener('DOMContentLoaded', repaint);
    setInterval(repaint, 20000);

    console.log('💰 PClinic bill feed ready');
})();
