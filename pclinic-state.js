/* ============================================================
   PCLINIC — SHARED STATE, AUTOSAVE & FAST LOGOUT
   Load AFTER auth-guard.js, on every page:

     <script src="pclinic-state.js"></script>

   Provides:
     • pclinicLogout()        instant sign-out, no artificial delay
     • pcRemember(key, el)    input value survives refresh
     • pcTab(group, name)     active tab survives refresh
     • pcAutosave(...)        debounced draft saving + indicator
     • pcToast(msg, type)     consistent toasts
   ============================================================ */
(function () {
    'use strict';

    var NS = 'pclinic:';                 // namespace for all stored keys
    var PAGE = location.pathname.split('/').pop().replace('.html', '') || 'index';

    function key(k) { return NS + PAGE + ':' + k; }

    function read(k, fallback) {
        try {
            var v = sessionStorage.getItem(key(k));
            return v === null ? fallback : JSON.parse(v);
        } catch (e) { return fallback; }
    }

    function write(k, v) {
        try { sessionStorage.setItem(key(k), JSON.stringify(v)); return true; }
        catch (e) { console.warn('[pclinic] storage full or blocked:', e); return false; }
    }

    function drop(k) { try { sessionStorage.removeItem(key(k)); } catch (e) {} }


    /* ══════════════════════════════════════════
       1. SECURE LOGOUT AND CLINICAL CACHE CLEARING
       ══════════════════════════════════════════ */
    function clearSensitiveBrowserState() {
        // Keep only non-identifying display preferences. Staff IDs, patient
        // data, drafts, orders, bills, media and local staff mirrors are
        // removed. PClinic must never use localStorage as a clinical database.
        var allowedPreferences = {
            'pclinic-theme': true,
            'pclinic-lang': true,
            'pclinic-compact': true,
            'pclinic-fontsize': true
        };
        try {
            Object.keys(localStorage).forEach(function (k) {
                var isPClinicKey = k.indexOf('pclinic') === 0 ||
                    k === 'userRole' || k === 'userName' ||
                    k === 'darkMode' || k === 'opd_dark_mode';
                if (isPClinicKey && !allowedPreferences[k]) {
                    localStorage.removeItem(k);
                }
            });
        } catch (e) {}
        try { sessionStorage.clear(); } catch (e) {}
    }

    var logoutInProgress = false;
    async function secureLogout(opts) {
        opts = opts || {};
        if (logoutInProgress) return false;
        if (opts.confirm !== false && !window.confirm('Sign out of PClinic?')) return false;
        logoutInProgress = true;

        try {
            var veil = document.createElement('div');
            veil.setAttribute('role', 'status');
            veil.style.cssText =
                'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
                'justify-content:center;gap:12px;background:rgba(255,255,255,.94);' +
                '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);' +
                'font:600 14px -apple-system,BlinkMacSystemFont,sans-serif;color:#1c1c1e';
            var spinner = document.createElement('span');
            spinner.style.cssText =
                'width:17px;height:17px;border:2.5px solid rgba(0,0,0,.15);' +
                'border-top-color:#0071e3;border-radius:50%;animation:pcSpin .7s linear infinite';
            veil.appendChild(spinner);
            veil.appendChild(document.createTextNode(' Signing out securely…'));
            document.body.appendChild(veil);
        } catch (e) {}

        clearSensitiveBrowserState();

        var tasks = [];
        try {
            if (window.firebaseAuth && window.firebaseAuthFunctions && window.firebaseAuthFunctions.signOut) {
                tasks.push(window.firebaseAuthFunctions.signOut(window.firebaseAuth));
            }
        } catch (e) {}
        try {
            if (typeof window.pclinicClearFirebaseCache === 'function') {
                tasks.push(window.pclinicClearFirebaseCache());
            }
        } catch (e) {}

        // Do not hang forever on a bad network, but give local sign-out and
        // IndexedDB cleanup a chance to complete before navigation.
        try {
            await Promise.race([
                Promise.allSettled(tasks),
                new Promise(function (resolve) { setTimeout(resolve, 1800); })
            ]);
        } catch (e) {}

        location.replace('login.html');
        return true;
    }

    window.pclinicClearSensitiveState = clearSensitiveBrowserState;
    window.pclinicLogout = secureLogout;
    window.pcLogout = secureLogout;

    // Shared clinical terminals lock after 15 minutes without interaction.
    var idleTimer = null;
    function resetIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(function () { secureLogout({ confirm: false }); }, 15 * 60 * 1000);
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (eventName) {
        document.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

    /* ══════════════════════════════════════════
       2. REFRESH-STABLE STATE
       ══════════════════════════════════════════
       Previously only doctor-dashboard remembered its active tab.
       Everywhere else, F5 dumped you back to the first tab and wiped
       whatever you had typed. These helpers make that survive.
    */

    // Remember the active tab for a named group.
    function pcTab(group, name) {
        if (name === undefined) return read('tab:' + group, null);
        write('tab:' + group, name);
        return name;
    }

    // Keep an input/select/textarea's value across reloads.
    function pcRemember(id, el) {
        el = el || document.getElementById(id);
        if (!el) return;

        var saved = read('field:' + id, null);
        if (saved !== null && saved !== '') {
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!saved;
            else el.value = saved;
        }
        var ev = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio')
            ? 'change' : 'input';
        el.addEventListener(ev, function () {
            write('field:' + id, (el.type === 'checkbox' || el.type === 'radio')
                ? el.checked : el.value);
        });
    }

    // Opt-in bulk restore: any element with data-pc-remember.
    function restoreMarkedFields() {
        document.querySelectorAll('[data-pc-remember]').forEach(function (el) {
            var id = el.getAttribute('data-pc-remember') || el.id;
            if (id) pcRemember(id, el);
        });
    }

    // Restore scroll position — refresh shouldn't jump you to the top
    // of a long patient list.
    function restoreScroll() {
        var y = read('scroll', 0);
        if (y > 0) window.scrollTo(0, y);
        var t = null;
        window.addEventListener('scroll', function () {
            clearTimeout(t);
            t = setTimeout(function () { write('scroll', window.scrollY); }, 250);
        }, { passive: true });
    }


    /* ══════════════════════════════════════════
       3. AUTOSAVE
       ══════════════════════════════════════════
       pcAutosave({ id, getData, onRestore, interval })
       Saves a draft locally on a debounce, shows a small indicator,
       and offers to restore it next time the page opens.
    */
    var indicator = null;

    function ensureIndicator() {
        if (indicator) return indicator;
        indicator = document.createElement('div');
        indicator.className = 'pc-autosave';
        indicator.innerHTML = '<span class="sdot"></span><span class="stxt">Saved</span>';
        document.body.appendChild(indicator);
        return indicator;
    }

    function flashSaved(state, text) {
        var el = ensureIndicator();
        el.querySelector('.stxt').textContent = text || (state === 'saving' ? 'Saving…' : 'Saved');
        el.classList.toggle('saving', state === 'saving');
        el.classList.add('show');
        clearTimeout(el._t);
        if (state !== 'saving') {
            el._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
        }
    }

    function pcAutosave(cfg) {
        cfg = cfg || {};
        var id       = cfg.id || 'draft';
        var getData  = cfg.getData;
        var interval = cfg.interval || 1200;
        if (typeof getData !== 'function') return;

        var timer = null;

        function save() {
            var data;
            try { data = getData(); } catch (e) { return; }
            if (data === undefined || data === null) return;
            flashSaved('saving');
            var ok = write('draft:' + id, { at: Date.now(), data: data });
            flashSaved(ok ? 'saved' : 'error', ok ? 'Saved' : 'Could not save');
        }

        function schedule() { clearTimeout(timer); timer = setTimeout(save, interval); }

        // Offer to restore a previous draft
        var prev = read('draft:' + id, null);
        if (prev && prev.data && typeof cfg.onRestore === 'function') {
            var mins = Math.round((Date.now() - prev.at) / 60000);
            var when = mins < 1 ? 'just now' : mins + ' min ago';
            setTimeout(function () {
                if (window.confirm('Restore your unsaved work from ' + when + '?')) {
                    cfg.onRestore(prev.data);
                    flashSaved('saved', 'Draft restored');
                } else {
                    drop('draft:' + id);
                }
            }, 400);
        }

        document.addEventListener('input', schedule, true);
        document.addEventListener('change', schedule, true);
        // Last-chance save when the tab is hidden or closed
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') save();
        });
        window.addEventListener('pagehide', save);

        return {
            save: save,
            clear: function () { drop('draft:' + id); },
            data: function () { var d = read('draft:' + id, null); return d && d.data; }
        };
    }


    /* ══════════════════════════════════════════
       4. TOAST
       ══════════════════════════════════════════ */
    function pcToast(msg, type) {
        var wrap = document.querySelector('.pc-toasts');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'pc-toasts';
            document.body.appendChild(wrap);
        }
        var t = document.createElement('div');
        t.className = 'pc-toast ' + (type || 'info');
        var icon = type === 'success' ? '✅' : type === 'error' ? '❌'
                 : type === 'warning' ? '⚠️' : 'ℹ️';
        t.innerHTML = '<span>' + icon + '</span><span></span>';
        t.lastChild.textContent = msg;          // textContent = no XSS
        wrap.appendChild(t);
        setTimeout(function () {
            t.classList.add('out');
            setTimeout(function () { t.remove(); }, 300);
        }, 3200);
    }


    /* ══════════════════════════════════════════
       5. THEME (single canonical key)
       ══════════════════════════════════════════ */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body && document.body.classList.toggle('dark-mode', theme === 'dark');
        try { localStorage.setItem('pclinic-theme', theme); } catch (e) {}
        var i = document.getElementById('themeIcon');
        if (i) i.className = theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
    }
    function pcToggleTheme() {
        var next = document.documentElement.getAttribute('data-theme') === 'dark'
            ? 'light' : 'dark';
        applyTheme(next);
        return next;
    }


    /* ══════════════════════════════════════════
       6. APPLE INTERACTIONS
       ══════════════════════════════════════════ */

    // Pointer-tracked tilt. Any .pc-tilt element leans slightly toward the
    // cursor and carries a highlight that follows it. Values are written as
    // CSS custom properties so the animation stays on the compositor.
    function initTilt() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!window.matchMedia('(hover: hover)').matches) return;   // skip touch

        var MAX = 4;               // degrees — subtle; more feels gimmicky
        var frame = null;

        document.addEventListener('pointermove', function (e) {
            var el = e.target.closest && e.target.closest('.pc-tilt');
            if (!el) return;
            if (frame) return;
            frame = requestAnimationFrame(function () {
                frame = null;
                var r = el.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width;
                var py = (e.clientY - r.top) / r.height;
                el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
                el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
                el.style.setProperty('--ry', ((px - 0.5) * MAX * 2).toFixed(2) + 'deg');
                el.style.setProperty('--rx', ((0.5 - py) * MAX * 2).toFixed(2) + 'deg');
            });
        }, { passive: true });

        document.addEventListener('pointerleave', function (e) {
            var el = e.target.closest && e.target.closest('.pc-tilt');
            if (!el) return;
            el.style.setProperty('--rx', '0deg');
            el.style.setProperty('--ry', '0deg');
        }, true);
    }

    // iOS-style ripple from the exact tap point.
    function initRipple() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        document.addEventListener('pointerdown', function (e) {
            var el = e.target.closest &&
                     e.target.closest('.pc-btn, .pc-iconbtn, .pc-chip, .pc-seg button');
            if (!el) return;
            var r = el.getBoundingClientRect();
            var d = Math.max(r.width, r.height) * 2;
            var sp = document.createElement('span');
            sp.style.cssText =
                'position:absolute;border-radius:50%;pointer-events:none;' +
                'width:' + d + 'px;height:' + d + 'px;' +
                'left:' + (e.clientX - r.left - d / 2) + 'px;' +
                'top:'  + (e.clientY - r.top  - d / 2) + 'px;' +
                'background:radial-gradient(circle,rgba(255,255,255,.6),transparent 62%);' +
                'transform:scale(0);opacity:.9;' +
                'transition:transform .55s cubic-bezier(.2,.7,.3,1),opacity .55s ease';
            if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
            el.appendChild(sp);
            requestAnimationFrame(function () {
                sp.style.transform = 'scale(1)';
                sp.style.opacity = '0';
            });
            setTimeout(function () { sp.remove(); }, 620);
        }, { passive: true });
    }

    // Light haptic on supported devices — the iOS tap feel.
    function initHaptics() {
        if (!navigator.vibrate) return;
        document.addEventListener('pointerdown', function (e) {
            if (e.target.closest &&
                e.target.closest('.pc-btn,.pc-iconbtn,.pc-chip,.pc-card,.module-card,.stat-card')) {
                navigator.vibrate(7);
            }
        }, { passive: true });
    }

    /* ══════════════════════════════════════════
       7. INIT
       ══════════════════════════════════════════ */
    function init() {
        applyTheme(localStorage.getItem('pclinic-theme') || 'light');
        restoreMarkedFields();
        restoreScroll();
        initTilt();
        initRipple();
        initHaptics();

        // Ctrl+L → fast logout
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                fastLogout();
            }
        });
    }

    // Expose
    window.pcTab       = pcTab;
    window.pcRemember  = pcRemember;
    window.pcAutosave  = pcAutosave;
    window.pcToast     = pcToast;
    window.pcToggleTheme = pcToggleTheme;
    window.pcApplyTheme  = applyTheme;
    window.pcStore     = { read: read, write: write, drop: drop, key: key };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
})();
