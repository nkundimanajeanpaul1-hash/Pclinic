/* ──────────────────────────────────────────────
   PCLINIC — SHARED JAVASCRIPT (Polish Phase)
   ────────────────────────────────────────────── */

(function() {
    'use strict';

    // ─── DARK MODE ───
    function toggleDarkMode() {
        const html = document.documentElement;
        const body = document.body;
        const isDark = html.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        // Also toggle .dark-mode on body for inline styles that use .dark-mode
        body.classList.toggle('dark-mode', newTheme === 'dark');
        localStorage.setItem('pclinic-theme', newTheme);
        updateThemeIcon();
        showToast(isDark ? '☀️ Light mode enabled' : '🌙 Dark mode enabled', 'info');
    }

    function initTheme() {
        const saved = localStorage.getItem('pclinic-theme') || 'light';
        const isDark = saved === 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        // Also add .dark-mode to body for inline styles
        document.body.classList.toggle('dark-mode', isDark);
        updateThemeIcon();
    }

    function updateThemeIcon() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const icons = document.querySelectorAll('.theme-toggle i');
        icons.forEach(icon => {
            icon.className = isDark ? 'ti ti-moon-stars' : 'ti ti-sun';
        });
    }

    // ─── TOAST (Enhanced) ───
    function showToast(message, type = 'info', duration = 3500) {
        const container = document.getElementById('toastContainer');
        if (!container) {
            // Create container if it doesn't exist
            const newContainer = document.createElement('div');
            newContainer.id = 'toastContainer';
            newContainer.className = 'toast-container';
            document.body.appendChild(newContainer);
            return showToast(message, type, duration);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span> ${message}`;
        container.appendChild(toast);

        // Trigger show animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto-remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, duration);

        return toast;
    }

    // ─── FULL PAGE LOADING ───
    function showPageLoading(text = 'Loading...') {
        let overlay = document.getElementById('pageLoadingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'pageLoadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="spinner-large"></div>
                <div class="loading-text" id="loadingText">${text}</div>
            `;
            document.body.appendChild(overlay);
        }
        document.getElementById('loadingText').textContent = text;
        overlay.classList.add('show');
    }

    function hidePageLoading() {
        const overlay = document.getElementById('pageLoadingOverlay');
        if (overlay) overlay.classList.remove('show');
    }

    // ─── KEYBOARD SHORTCUTS HELP ───
    function showShortcuts() {
        let modal = document.getElementById('shortcutsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'shortcutsModal';
            modal.className = 'shortcuts-modal';
            modal.innerHTML = `
                <div class="shortcuts-content">
                    <h2>⌨️ Keyboard Shortcuts</h2>
                    <div class="shortcut-grid">
                        <div class="shortcut-item"><span>Switch views</span><kbd>Ctrl+1-9</kbd></div>
                        <div class="shortcut-item"><span>Search</span><kbd>Ctrl+F</kbd></div>
                        <div class="shortcut-item"><span>Save form</span><kbd>Ctrl+S</kbd></div>
                        <div class="shortcut-item"><span>Cancel</span><kbd>Esc</kbd></div>
                        <div class="shortcut-item"><span>Print</span><kbd>Ctrl+P</kbd></div>
                        <div class="shortcut-item"><span>Toggle Dark Mode</span><kbd>Ctrl+D</kbd></div>
                        <div class="shortcut-item"><span>Show shortcuts</span><kbd>Ctrl+/</kbd></div>
                        <div class="shortcut-item"><span>Logout</span><kbd>Ctrl+L</kbd></div>
                    </div>
                    <button class="close-shortcuts" onclick="closeShortcuts()">Close</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.classList.add('show');
    }

    function closeShortcuts() {
        const modal = document.getElementById('shortcutsModal');
        if (modal) modal.classList.remove('show');
    }

    // ─── REAL-TIME CLOCK ───
    function initClock() {
        const clockEl = document.getElementById('realtimeClock');
        if (!clockEl) return;

        function updateClock() {
            const now = new Date();
            const options = {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            };
            clockEl.textContent = now.toLocaleDateString('en-US', options);
        }

        updateClock();
        setInterval(updateClock, 1000);
    }

    // ─── BREADCRUMB ───
    function updateBreadcrumb(pageName) {
        const breadcrumb = document.getElementById('breadcrumb');
        if (!breadcrumb) return;
        const currentPath = window.location.pathname.split('/').pop();
        const pageTitle = pageName || currentPath.replace('.html', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        breadcrumb.innerHTML = `
            <a href="hub.html">🏥 Hub</a>
            <span class="separator">›</span>
            <span class="current">${pageTitle}</span>
        `;
    }

    // ─── GLOBAL KEYBOARD SHORTCUTS ───
    function initGlobalShortcuts() {
        document.addEventListener('keydown', function(e) {
            // Ctrl+D → Dark Mode
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                toggleDarkMode();
            }
            // Ctrl+/ → Show shortcuts
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                showShortcuts();
            }
            // Ctrl+L → Logout
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                if (confirm('Are you sure you want to sign out?')) {
                    localStorage.removeItem('pclinic_remember_user');
                    window.location.href = 'login.html';
                }
            }
            // Escape → Close shortcuts
            if (e.key === 'Escape') {
                closeShortcuts();
            }
        });
    }

    // ─── HAPTIC FEEDBACK (mobile) ───
    function hapticFeedback() {
        if (navigator.vibrate) navigator.vibrate(8);
    }

    // ─── INIT ───
    function initShared() {
        initTheme();
        initClock();
        initGlobalShortcuts();

        // Add theme toggle to all pages
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleDarkMode);
        }

        // Attach haptic feedback to clickable elements
        document.addEventListener('click', function(e) {
            const target = e.target.closest('.nav-tab, .btn-p, .btn-s, .module-card, .kpi, .tb-btn, .user-chip, .pc-btn, .ab, .cat-pill, .tbtn, .ntab, .bbtn');
            if (target) hapticFeedback();
        });

        console.log('🏥 PClinic — Shared Polish Features Loaded');
        console.log('📌 Shortcuts: Ctrl+D (Dark Mode), Ctrl+/ (Help), Ctrl+L (Logout)');
    }

    // ─── TABLE ROW DELETE (shared utility for static placeholder tables) ───
    function deleteRow(btn) {
        const row = btn && btn.closest('tr');
        if (!row) return;
        const label = (row.cells && row.cells[0] ? row.cells[0].textContent.trim() : '') || 'Row';
        const tbody = row.parentElement;
        row.remove();
        showToast('🗑️ ' + label + ' removed', 'info');
        if (tbody && tbody.tagName === 'TBODY' && tbody.querySelectorAll('tr').length === 0) {
            const cols = (tbody.closest('table')?.querySelectorAll('thead th') || []).length || 1;
            const empty = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = cols;
            td.style.cssText = 'text-align:center; color:#888; padding:18px;';
            td.textContent = 'No records';
            empty.appendChild(td);
            tbody.appendChild(empty);
        }
    }

    // ─── EXPOSE TO GLOBAL ───
    // Kept under its own name too, so a later page-level showToast can
    // delegate here without accidentally recursing into itself.
    window.deleteRow = deleteRow;
    window.sharedShowToast = showToast;
    window.showToast = showToast;
    window.toggleDarkMode = toggleDarkMode;
    window.initTheme = initTheme;
    window.showShortcuts = showShortcuts;
    window.closeShortcuts = closeShortcuts;
    window.showPageLoading = showPageLoading;
    window.hidePageLoading = hidePageLoading;
    window.updateBreadcrumb = updateBreadcrumb;
    window.initClock = initClock;
    window.hapticFeedback = hapticFeedback;

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initShared);
    } else {
        initShared();
    }

})();

// Global topbar & breadcrumb removal across all clinical pages
(function() {
    function nukeOldHeaders() {
        var oldHeaders = document.querySelectorAll('.topbar, .top-bar, .app-header, .header, #header, header.topbar, .top-header, .breadcrumb, #breadcrumb, .header-breadcrumb');
        for (var i=0; i<oldHeaders.length; i++) {
            if (oldHeaders[i] && oldHeaders[i].parentNode) oldHeaders[i].parentNode.removeChild(oldHeaders[i]);
        }
    }
    nukeOldHeaders();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', nukeOldHeaders);
    }
    setTimeout(nukeOldHeaders, 50);
    setTimeout(nukeOldHeaders, 300);
})();
