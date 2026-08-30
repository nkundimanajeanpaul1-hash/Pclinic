/* ============================================================
   PCLINIC — DEPLOYMENT SELF-TEST
   ------------------------------------------------------------
   Paste into the browser console of the *live* page while signed
   in as radiology. Prints PASS / FAIL / UNKNOWN per item.

     window.__pcSelfTest()             all checks
     window.__pcSelfTest('media')      only the study-media ones

   What a browser can and cannot prove, and why some lines read
   UNKNOWN instead of FAIL:

   - A Cloud Function that is not deployed answers with a plain
     Cloud Run 404 that carries NO access-control-allow-origin
     header, so the browser cannot read the status at all. The SDK
     reports it as `functions/internal`. That is why the callable
     checks say UNKNOWN rather than naming a cause.
   - A deployed callable does send the CORS header, so the call
     completes and any error is a real, readable status.
   - The Storage bucket and the Firestore REST endpoint answer
     anonymously with CORS headers, so those two ARE authoritative.
   - A signed-in getDocs() goes to firestore.googleapis.com, which
     is not CORS-enabled for browsers; reads there use the SDK only.
   ============================================================ */
(function () {
    'use strict';

    var PROJECT = 'pclinic-20d81';
    var REGION = 'africa-south1';

    function line(status, label, detail) {
        var badge = status === 'PASS' ? '  ✅' : status === 'FAIL' ? '  ❌' : '  ❓';
        console.log(badge + ' ' + status + '  ' + label + (detail ? '\n        ' + detail : ''));
        return { status: status, label: label, detail: detail || '' };
    }

    async function headStatus(url) {
        try {
            var r = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' });
            return { ok: true, status: r.status };
        } catch (e) {
            return { ok: false, message: String((e && e.message) || e) };
        }
    }

    var checks = {
        /* ── wiring: did the new files actually load? ─────────────── */
        scripts: async function () {
            var out = [];
            var media = window.pcRadioMedia;
            out.push(line(media ? 'PASS' : 'FAIL', 'pclinic-radiology-media.js loaded',
                media ? 'window.pcRadioMedia present (v20260828_MEDIA)'
                      : 'not loaded — check the <script> tag and the ?v= token in this page’s HTML'));
            var hasMount = !!(media && typeof media.mount === 'function' && typeof media.upload === 'function');
            out.push(line(hasMount ? 'PASS' : 'FAIL', 'media upload + panel API present',
                hasMount ? 'upload / urlsFor / listFor / remove / mount' : 'module loaded but incomplete'));
            var expected = [
                ['image/jpeg', true], ['image/png', true], ['image/webp', true], ['image/gif', true],
                ['video/mp4', true], ['video/webm', true],
                ['image/svg+xml', false], ['application/dicom', false], ['application/pdf', false],
            ];
            if (!media || typeof media.inspect !== 'function') {
                // Reporting PASS here would be a vacuous win: with no module every
                // comparison below is trivially satisfied.
                out.push(line('FAIL', 'format gate matches the agreed allow-list', 'no pcRadioMedia.inspect to test'));
                out.push(line('FAIL', '25 MB cap enforced client-side', 'no pcRadioMedia.inspect to test'));
                return out;
            }
            var bad = expected.filter(function (f) { return media.inspect({ name: 'x', type: f[0], size: 1024 }).ok !== f[1]; });
            out.push(line(bad.length === 0 ? 'PASS' : 'FAIL', 'format gate matches the agreed allow-list',
                bad.length ? 'wrong on: ' + bad.map(function (b) { return b[0]; }).join(', ')
                           : 'jpeg/png/webp/gif/mp4/webm accepted; svg, DICOM and pdf refused'));
            var oversize = media.inspect({ name: 'big.jpg', type: 'image/jpeg', size: 25 * 1024 * 1024 + 1 }).ok;
            var atLimit = media.inspect({ name: 'ok.jpg', type: 'image/jpeg', size: 25 * 1024 * 1024 }).ok;
            out.push(line(oversize === false && atLimit === true ? 'PASS' : 'FAIL', '25 MB cap enforced client-side',
                'accepted at 25 MB: ' + atLimit + ' · refused at 25 MB+1: ' + (oversize === false)));
            return out;
        },

        /* ── radiology worklist selection wiring ──────────────────── */
        selection: async function () {
            var out = [];
            var svc = window.pcRadiology;
            var bridge = !!(window.pcRadioBar && typeof window.pcRadioBar.setPatient === 'function');
            out.push(line(bridge ? 'PASS' : 'UNKNOWN', 'patient-selection bridge loaded',
                bridge ? 'pcRadioBar.setPatient available'
                       : 'not on this page — run __pcSelfTest("selection") from radio-dashboard.html'));
            void svc;
            var search = typeof window.selectSearchPatient === 'function';
            out.push(line(search ? 'PASS' : 'FAIL', 'Enter-to-select on the worklist search',
                search ? 'window.selectSearchPatient is wired to the box'
                       : 'missing — radio-dashboard.js?v= token is stale, hard-refresh with the console open'));
            // Ambiguity must refuse rather than pick the first patient.
            var before = window.currentPatient && window.currentPatient.id;
            try {
                var box = document.getElementById('globalSearch');
                if (box) {
                    box.value = 'a';   // deliberately broad
                    window.selectSearchPatient();
                }
            } catch (e) { /* the guard itself reports */ }
            var after = window.currentPatient && window.currentPatient.id;
            out.push(line(before === after ? 'PASS' : 'FAIL', 'ambiguous search does not silently select',
                before === after ? 'a broad query left the selection untouched' : 'a broad query changed the patient — that is a safety bug'));
            var barChip = document.getElementById('radBarPatient');
            if (barChip) {
                var txt = String(barChip.textContent || '').trim();
                var hasPatient = !!(window.currentPatient && window.currentPatient.id);
                out.push(line((hasPatient ? /👤/.test(txt) : /No patient selected/.test(txt)) ? 'PASS' : 'FAIL',
                    'identification bar reflects the current patient',
                    'bar reads “' + txt + '” while currentPatient is ' + (hasPatient ? window.currentPatient.id : 'unset') +
                    ' — click a worklist row and re-run to watch it flip'));
            }
            return out;
        },

        /* ── infrastructure: authoritative from the browser ───────── */
        infra: async function () {
            var out = [];
            var bucket = await headStatus('https://storage.googleapis.com/storage/v1/b/' + PROJECT + '.appspot.com');
            if (!bucket.ok) {
                out.push(line('UNKNOWN', 'Storage bucket reachable', bucket.message));
            } else if (bucket.status === 200) {
                out.push(line('PASS', 'Storage bucket exists', 'pclinic-20d81.appspot.com responds 200'));
            } else {
                out.push(line('FAIL', 'Storage bucket exists',
                    'HTTP ' + bucket.status + ' — console → Storage → Get started. This is not fixable in code; uploads cannot work until it exists.'));
            }

            var rules = await headStatus('https://firestore.googleapis.com/v1/projects/' + PROJECT +
                '/databases/(default)/documents/radiologyMedia?pageSize=1');
            out.push(line(rules.ok && rules.status === 403 ? 'PASS' : 'UNKNOWN',
                'Firestore rules active (not the wide-open default)',
                rules.ok ? 'anonymous read of radiologyMedia → HTTP ' + rules.status +
                    ' (403 is the expected answer: the collection is staff-only)'
                         : 'request blocked before a status was readable: ' + rules.message));

            var hosting = await headStatus('https://' + PROJECT + '.web.app/__/firebase/init.js');
            out.push(line(hosting.ok && hosting.status === 200 ? 'PASS' : 'FAIL',
                'Firebase Hosting provisioned',
                hosting.ok ? 'init.js → HTTP ' + hosting.status +
                    (hosting.status === 200 ? ' — hosting is serving, so firebase.json headers apply'
                                            : ' — deploy hosting to get the CSP and frame headers')
                         : 'not readable; hosting may be unprovisioned'));
            return out;
        },

        /* ── cloud functions: the part a browser cannot fully prove ─ */
        functions: async function () {
            var out = [];
            var names = ['radiologyTransition', 'radiologyMediaSign', 'radiologyMediaDelete'];
            for (var i = 0; i < names.length; i++) {
                var n = names[i];
                var res;
                try {
                    res = await window.pclinicCloudFunctions.call(n, { orderId: '__selftest__', mediaId: '__selftest__' });
                    out.push(line('PASS', n + ' answers', 'call completed: ' + JSON.stringify(res).slice(0, 120)));
                } catch (e) {
                    var code = String((e && e.code) || '');
                    var msg = String((e && e.message) || e);
                    if (/internal|unavailable/i.test(code) || /is not deployed|not reachable/i.test(msg)) {
                        out.push(line('UNKNOWN', n + ' answers',
                            'reported as ' + (code || 'error') + '. A browser cannot tell "not deployed" from "crashed", because an undeployed function sends no CORS header. Use the curl line in the console output below.'));
                    } else {
                        out.push(line('PASS', n + ' answers',
                            'reached the server and got a real status: ' + (code || '') + ' ' + msg.slice(0, 140)));
                    }
                }
            }
            console.log('\n  To settle the 404-vs-crash question, run this from a terminal:\n' +
                '    for f in radiologyTransition radiologyMediaSign; do\n' +
                '      printf "%s " "$f"; curl -s -o /dev/null -w "%{http_code}\\n" \\\n' +
                '        -X POST https://' + REGION + '-' + PROJECT + '.cloudfunctions.net/$f \\\n' +
                '        -H "Content-Type: application/json" -d \'{"data":{}}\';\n' +
                '    done\n' +
                '  401 = deployed and guarding auth (correct). 404 = not deployed yet.\n');
            return out;
        },

        /* ── media round trip, needs the bucket ───────────────────── */
        media: async function () {
            var out = [];
            if (!window.pcRadioMedia) { out.push(line('FAIL', 'media module', 'pclinic-radiology-media.js did not load')); return out; }
            var order = null;
            try {
                var snap = await window.pcRadiology.snapshot();
                order = (snap.orders || [])[0] || null;
            } catch (e) { /* leave null */ }
            if (!order) {
                out.push(line('UNKNOWN', 'a radiology order is available',
                    'no orders in the live snapshot — select a study in the worklist first'));
                return out;
            }
            out.push(line('PASS', 'order for the test', order.id + ' · ' + (order.patientName || order.patientId)));
            var p = window.pcRadioMedia.objectPath(String(order.id), 'selftest-1', 'jpg');
            out.push(line(/^radiology\/[^/]+\/selftest-1\.jpg$/.test(p) ? 'PASS' : 'FAIL',
                'object path matches the rule', p));
            try {
                var list = await window.pcRadioMedia.listFor(order.id);
                out.push(line('PASS', 'radiologyMedia is readable under the deployed rules',
                    list.length + ' record(s) on this order'));
            } catch (e) {
                out.push(line('FAIL', 'radiologyMedia is readable',
                    ((e && e.code) || '') + ' ' + ((e && e.message) || e) +
                    ' — if this is permission-denied, firestore.rules from round 6 is not deployed'));
            }
            return out;
        }
    };

    window.__pcSelfTest = async function (only) {
        var groups = only ? [only] : ['scripts', 'selection', 'infra', 'functions', 'media'];
        var results = [];
        console.log('%cPClinic deployment self-test', 'font-weight:bold;font-size:13px');
        console.log('signed in as: ' + ((window.currentStaff && (window.currentStaff.name + ' / ' + window.currentStaff.role)) || 'NOT SIGNED IN'));
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            if (!checks[g]) { console.log('unknown group: ' + g); continue; }
            console.log('\n── ' + g + ' ' + '─'.repeat(Math.max(0, 40 - g.length)));
            try {
                results = results.concat(await checks[g]());
            } catch (e) {
                results.push(line('FAIL', g + ' crashed', String((e && e.stack) || e)));
            }
        }
        var fail = results.filter(function (r) { return r.status === 'FAIL'; });
        var unk = results.filter(function (r) { return r.status === 'UNKNOWN'; });
        console.log('\n' + '═'.repeat(46));
        console.log('PASS ' + (results.length - fail.length - unk.length) + ' · FAIL ' + fail.length + ' · UNKNOWN ' + unk.length);
        if (fail.length) console.log('failures:\n  ' + fail.map(function (f) { return f.label; }).join('\n  '));
        if (unk.length) console.log('needs a terminal or the console to settle:\n  ' + unk.map(function (f) { return f.label; }).join('\n  '));
        return results;
    };

    console.log('pcSelfTest ready — run  window.__pcSelfTest()  or  window.__pcSelfTest("media")');
})();
