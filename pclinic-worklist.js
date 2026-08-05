/* ============================================================
   PCLINIC — DEPARTMENT WORKLIST
   Renders the live order queue into a department dashboard.

   Load after pclinic-orders.js, then call once:

     pcWorklist.mount({
        dept:   'lab',                  // lab | radiology | pharmacy | ...
        target: '#abTbody',             // tbody or container to fill
        mode:   'table'                 // 'table' | 'cards'
     });

   Before this, every department dashboard showed hardcoded rows. A
   doctor's request went into the patient record and no screen ever
   read it. This is the receiving end of that pipe.
   ============================================================ */
(function () {
    'use strict';

    var mounts = [];

    function esc(v) {
        var d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    function ago(iso) {
        var s = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (s < 60)    return 'just now';
        if (s < 3600)  return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    function prioBadge(p) {
        var map = {
            stat:    ['#ffebe9', '#8a1f1a', 'STAT'],
            urgent:  ['#fff4e0', '#7a4500', 'URGENT'],
            routine: ['#f2f2f4', '#8e8e93', 'Routine']
        };
        var c = map[p] || map.routine;
        return '<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:30px;' +
               'background:' + c[0] + ';color:' + c[1] + ';letter-spacing:.03em">' + c[2] + '</span>';
    }

    function statusBadge(s) {
        var map = {
            pending:       ['#fff4e0', '#7a4500'],
            'in-progress': ['#eaf2ff', '#0071e3'],
            completed:     ['#e9f9ee', '#1a7a32'],
            cancelled:     ['#ffebe9', '#8a1f1a']
        };
        var c = map[s] || map.pending;
        return '<span class="pc-ostatus" style="font-size:9.5px;font-weight:700;padding:3px 9px;' +
               'border-radius:30px;background:' + c[0] + ';color:' + c[1] + '">' + esc(s) + '</span>';
    }

    /* ── Render one order as a table row ── */
    function rowHTML(o) {
        var items = (o.items || []).map(function (i) { return i.name; }).join(', ');
        return '' +
        '<tr data-order="' + esc(o.id) + '" style="transition:background .2s">' +
          '<td style="white-space:nowrap">' +
            '<div style="font-weight:600">' + esc(o.patientName || 'Patient ' + o.patientId) + '</div>' +
            '<div style="font-size:10.5px;color:var(--tm,#8e8e93)">ID ' + esc(o.patientId) + '</div>' +
          '</td>' +
          '<td>' + esc(items || '—') + (o.notes ? '<div style="font-size:10.5px;color:var(--tm,#8e8e93);margin-top:2px">' + esc(o.notes) + '</div>' : '') + '</td>' +
          '<td>' + prioBadge(o.priority) + '</td>' +
          '<td style="white-space:nowrap">' +
            '<div>' + esc(o.orderedBy || '—') + '</div>' +
            '<div style="font-size:10.5px;color:var(--tm,#8e8e93)">' + ago(o.orderedAt) + '</div>' +
          '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '<td style="white-space:nowrap;text-align:right">' + actionsHTML(o) + '</td>' +
        '</tr>';
    }

    function actionsHTML(o) {
        var btn = 'style="height:27px;padding:0 11px;border-radius:8px;border:.5px solid rgba(0,0,0,.08);' +
                  'font-family:inherit;font-size:11.5px;font-weight:600;cursor:pointer;margin-left:5px"';
        if (o.status === 'pending') {
            return '<button ' + btn + ' onclick="pcWorklist.start(\'' + o.id + '\')">Start</button>' +
                   '<button ' + btn + ' onclick="pcWorklist.reject(\'' + o.id + '\')">Reject</button>';
        }
        if (o.status === 'in-progress') {
            return '<button ' + btn + ' style="height:27px;padding:0 11px;border-radius:8px;border:0;' +
                   'background:#34c759;color:#fff;font-family:inherit;font-size:11.5px;font-weight:600;cursor:pointer" ' +
                   'onclick="pcWorklist.finish(\'' + o.id + '\')">Complete</button>';
        }
        return '<span style="font-size:11px;color:var(--tm,#8e8e93)">' +
               esc(o.completedBy || o.cancelReason || '—') + '</span>';
    }

    /* ── Render one order as a card (pharmacy style) ── */
    function cardHTML(o) {
        var items = (o.items || []).map(function (i) {
            return '<div style="font-size:12.5px;padding:2px 0">• ' + esc(i.name) +
                   (i.qty > 1 ? ' <b>×' + i.qty + '</b>' : '') + '</div>';
        }).join('');
        return '' +
        '<div data-order="' + esc(o.id) + '" style="padding:13px 15px;border-radius:12px;' +
             'border:.5px solid rgba(0,0,0,.08);background:#fff;margin-bottom:9px;' +
             'box-shadow:0 1px 3px rgba(0,0,0,.05)">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">' +
            '<div><div style="font-weight:700;font-size:13px">' + esc(o.patientName || 'Patient ' + o.patientId) + '</div>' +
            '<div style="font-size:10.5px;color:#8e8e93">' + esc(o.orderedBy) + ' · ' + ago(o.orderedAt) + '</div></div>' +
            '<div style="display:flex;gap:5px;align-items:center">' + prioBadge(o.priority) + statusBadge(o.status) + '</div>' +
          '</div>' + items +
          (o.notes ? '<div style="font-size:11.5px;color:#8e8e93;margin-top:6px;font-style:italic">' + esc(o.notes) + '</div>' : '') +
          '<div style="margin-top:10px;text-align:right">' + actionsHTML(o) + '</div>' +
        '</div>';
    }

    function emptyHTML(mode, dept, cols) {
        var msg = '<div style="text-align:center;padding:34px 16px;color:#8e8e93;font-size:12.5px">' +
                  '<div style="font-size:30px;opacity:.3;margin-bottom:8px">📭</div>' +
                  'No pending requests.<br><span style="font-size:11px">' +
                  'New ' + esc(dept) + ' orders from doctors appear here automatically.</span></div>';
        return mode === 'table' ? '<tr><td colspan="' + cols + '">' + msg + '</td></tr>' : msg;
    }

    /* ── Paint one mount ── */
    function paint(m) {
        var el = document.querySelector(m.target);
        if (!el) return;
        var orders = window.pcOrders
            ? pcOrders.list({ dept: m.dept }).filter(function (o) {
                  return m.showAll ? true : o.status !== 'cancelled';
              })
            : [];

        // pending first, then by priority, then newest
        var rank = { stat: 0, urgent: 1, routine: 2 };
        orders.sort(function (a, b) {
            if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
            var pr = (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
            if (pr) return pr;
            return new Date(b.orderedAt) - new Date(a.orderedAt);
        });

        if (!orders.length) {
            el.innerHTML = emptyHTML(m.mode, m.dept, m.cols || 6);
        } else {
            el.innerHTML = orders.map(m.mode === 'table' ? rowHTML : cardHTML).join('');
        }

        // live pending badge, if the page has one
        if (m.badge) {
            var b = document.querySelector(m.badge);
            if (b) {
                var n = orders.filter(function (o) { return o.status === 'pending'; }).length;
                b.textContent = n;
                b.style.display = n ? '' : 'none';
            }
        }
    }

    function repaintAll() { mounts.forEach(paint); }

    /* ── Public API ── */
    var api = {
        mount: function (cfg) {
            if (!cfg || !cfg.dept || !cfg.target) return;
            cfg.mode = cfg.mode || 'table';
            mounts.push(cfg);
            paint(cfg);
        },

        refresh: repaintAll,

        start: function (id) {
            pcOrders.update(id, { status: 'in-progress' });
            if (window.pcToast) pcToast('Marked in progress', 'info');
        },

        finish: function (id) {
            var o = pcOrders.list().filter(function (x) { return x.id === id; })[0];
            pcOrders.complete(id, null);
            if (window.pcToast) pcToast('Completed — doctor notified', 'success');
            // Tell the ordering doctor their result is ready
            if (o && window.pcMessages) {
                pcMessages.send({
                    text: 'Results ready for ' + (o.patientName || 'patient') + ' — ' +
                          (o.items || []).map(function (i) { return i.name; }).join(', '),
                    toRoles: ['doctor'],
                    toStaffId: o.orderedById || null,
                    category: 'result',
                    patientId: o.patientId,
                    patientName: o.patientName
                });
            }
        },

        reject: function (id) {
            var why = window.prompt('Reason for rejecting this request?');
            if (why === null) return;
            var o = pcOrders.list().filter(function (x) { return x.id === id; })[0];
            pcOrders.cancel(id, why || 'rejected');
            if (window.pcToast) pcToast('Request rejected', 'warning');
            if (o && window.pcMessages) {
                pcMessages.send({
                    text: 'Request REJECTED for ' + (o.patientName || 'patient') + ' — ' + (why || 'no reason given'),
                    toRoles: ['doctor'],
                    toStaffId: o.orderedById || null,
                    category: 'result',
                    priority: 'urgent',
                    patientId: o.patientId
                });
            }
        },

        pendingFor: function (dept) {
            return window.pcOrders ? pcOrders.pending(dept) : 0;
        }
    };

    window.pcWorklist = api;

    window.addEventListener('ordersUpdated', repaintAll);
    document.addEventListener('DOMContentLoaded', repaintAll);
    setInterval(repaintAll, 20000);   // catch cross-tab changes

    console.log('📋 PClinic worklist ready');
})();
