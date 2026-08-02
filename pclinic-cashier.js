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
        return '<tr data-bill="' + esc(b.id) + '">' +
            '<td><div style="font-weight:600">' + esc(b.patientName || '—') + '</div>' +
                '<div style="font-size:10.5px;color:#8e8e93">' + esc(b.number) + ' · ' + when(b.createdAt) + '</div></td>' +
            '<td style="font-size:11.5px;color:#8e8e93">ID ' + esc(b.patientId) + '</td>' +
            '<td style="font-size:11.5px;max-width:230px">' + esc(items || '—') + '</td>' +
            '<td style="font-weight:700;white-space:nowrap">' + money(b.total) +
                (b.balance > 0 && b.paid > 0 ? '<div style="font-size:10.5px;color:#8a1f1a;font-weight:600">' +
                 money(b.balance) + ' due</div>' : '') + '</td>' +
            '<td style="font-size:11.5px">' + esc((b.payments && b.payments.length) ? b.payments[b.payments.length - 1].method : '—') + '</td>' +
            '<td>' + statusPill(b.status) + '</td>' +
            '<td style="font-size:11.5px;color:#8e8e93">' + esc(b.source || '—') + '</td>' +
            '<td style="text-align:right;white-space:nowrap">' +
                '<button ' + btn + ' onclick="location.href=\'receipt.html?bill=' + esc(b.id) + '\'">' +
                (b.status === 'paid' ? 'Receipt' : 'Take Payment') + '</button></td>' +
        '</tr>';
    }

    function paintCashier(m) {
        var el = document.querySelector(m.target);
        if (!el || !window.pcBilling) return;
        var bills = pcBilling.list().filter(function (b) { return b.status !== 'cancelled'; });
        // unpaid first, then newest
        bills.sort(function (a, b) {
            var ap = a.status === 'paid' ? 1 : 0, bp = b.status === 'paid' ? 1 : 0;
            if (ap !== bp) return ap - bp;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        if (!bills.length) {
            el.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:34px;color:#8e8e93;font-size:12.5px">' +
                '<div style="font-size:30px;opacity:.3;margin-bottom:8px">🧾</div>' +
                'No bills yet.<br><span style="font-size:11px">Bills raised by doctors appear here automatically.</span>' +
                '</td></tr>';
        } else {
            el.innerHTML = bills.map(cashierRow).join('');
        }
        updateKpis();
    }

    /* ── Live KPI counters, if the page exposes them ── */
    function updateKpis() {
        if (!window.pcBilling) return;
        var r = pcBilling.revenue();
        var unpaid = pcBilling.list({ status: 'pending' }).length +
                     pcBilling.list({ status: 'partial' }).length;
        set('#pcKpiBilled',      money(r.billed));
        set('#pcKpiCollected',   money(r.collected));
        set('#pcKpiOutstanding', money(r.outstanding));
        set('#pcKpiUnpaid',      unpaid);
        set('#pcKpiCount',       r.count);
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
    document.addEventListener('DOMContentLoaded', repaint);
    setInterval(repaint, 20000);

    console.log('💰 PClinic bill feed ready');
})();
