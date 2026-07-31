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
            var v = localStorage.getItem(key(k));
            return v === null ? fallback : JSON.parse(v);
        } catch (e) { return fallback; }
    }

    function write(k, v) {
        try { localStorage.setItem(key(k), JSON.stringify(v)); return true; }
        catch (e) { console.warn('[pclinic] storage full or blocked:', e); return false; }
    }

    function drop(k) { try { localStorage.removeItem(key(k)); } catch (e) {} }


    /* ══════════════════════════════════════════
       1. FAST LOGOUT
       ══════════════════════════════════════════
       The old flow was: confirm() → toast → setTimeout(500ms) →
       await signOut() (a NETWORK round trip) → only then redirect.
       On a slow connection that's several seconds of the user
       clicking "Log out" and nothing visibly happening.

       Firebase persists the sign-out locally the moment it's called,
       so there is no need to await the server before leaving. We
       clear local state, fire signOut() WITHOUT awaiting it, and
       navigate immediately. Sign-out still completes in the
       background; the user just doesn't wait for it.
    */
    function fastLogout(opts) {
        opts = opts || {};

        if (opts.confirm !== false &&
            !window.confirm('Sign out of PClinic?')) return;

        // Visual acknowledgement within the same frame as the click.
        try {
            var veil = document.createElement('div');
            veil.setAttribute('role', 'status');
            veil.style.cssText =
                'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
                'justify-content:center;gap:12px;background:rgba(255,255,255,.92);' +
                '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);' +
                'font:600 14px -apple-system,BlinkMacSystemFont,sans-serif;color:#1c1c1e';
            veil.innerHTML =
                '<span style="width:17px;height:17px;border:2.5px solid rgba(0,0,0,.15);' +
                'border-top-color:#0071e3;border-radius:50%;' +
                'animation:pcSpin .7s linear infinite"></span> Signing out…';
            document.body.appendChild(veil);
        } catch (e) {}

        // Clear per-user local state, but KEEP UI preferences
        // (theme, remembered staff ID) so the next sign-in feels familiar.
        try {
            var keep = ['pclinic-theme', 'pclinic_remember_staffid'];
            Object.keys(localStorage)
                .filter(function (k) { return k.indexOf(NS) === 0; })
                .forEach(function (k) { localStorage.removeItem(k); });
            localStorage.removeItem('pclinic_remember_user');
            Object.keys(sessionStorage).forEach(function (k) {
                if (keep.indexOf(k) === -1) sessionStorage.removeItem(k);
            });
        } catch (e) {}

        // Fire and forget — do NOT await the network.
        try {
            if (window.firebaseAuth && window.firebaseAuthFunctions &&
                window.firebaseAuthFunctions.signOut) {
                window.firebaseAuthFunctions.signOut(window.firebaseAuth)
                    .catch(function () { /* already leaving */ });
            }
        } catch (e) {}

        location.replace('login.html');   // replace() so Back can't re-enter
    }

    window.pclinicLogout = fastLogout;
    window.pcLogout = fastLogout;


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
       6. INIT
       ══════════════════════════════════════════ */
    function init() {
        applyTheme(localStorage.getItem('pclinic-theme') || 'light');
        restoreMarkedFields();
        restoreScroll();

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
