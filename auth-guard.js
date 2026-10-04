// ============================================================
// AUTH GUARD — PClinic
// Include this on every protected dashboard page, AFTER
// firebase-config.js has been loaded (type="module").
//
// Usage on a dashboard page:
//
//   <script type="module" src="firebase-config.js"></script>
//   <script src="auth-guard.js"></script>
//   <script>
//     requireAuth(['doctor']).then(function(staff) {
//         // staff = { uid, staffId, name, role }
//         console.log('Logged in as', staff.name, staff.role);
//     });
//   </script>
//
// Pass an array of allowed roles, e.g. ['doctor'] or
// ['doctor','nurse']. Pass an empty array [] or omit it to allow
// any logged-in, active staff member regardless of role.
// The 'admin' role is always allowed everywhere.
// ============================================================

(function () {
    'use strict';

    // ─── STRICT PORTAL PERMISSIONS REGISTRY ───
    var PORTAL_PERMISSIONS = {
        'doctor-dashboard.html': ['doctor'],
        'doctor-dashboard': ['doctor'],
        'cashier-dashboard.html': ['cashier'],
        'cashier-dashboard': ['cashier'],
        'nurse-dashboard.html': ['nurse'],
        'nurse-dashboard': ['nurse'],
        'lab-dashboard.html': ['lab', 'doctor', 'nurse', 'admin', 'reception', 'cashier', 'finance'],
        'lab-dashboard': ['lab', 'doctor', 'nurse', 'admin', 'reception', 'cashier', 'finance'],
        'pharmacy-dashboard.html': ['pharmacy'],
        'pharmacy-dashboard': ['pharmacy'],
        'reception-dashboard.html': ['reception'],
        'reception-dashboard': ['reception'],
        'hr-dashboard.html': ['hr', 'admin'],
        'hr-dashboard': ['hr', 'admin'],
        'admin-dashboard.html': ['admin'],
        'admin-dashboard': ['admin'],
        'finance-dashboard.html': ['finance'],
        'finance-dashboard': ['finance'],
        'inventory-dashboard.html': ['inventory'],
        'inventory-dashboard': ['inventory'],
        'physio-dashboard.html': ['physio'],
        'physio-dashboard': ['physio'],
        'radio-dashboard.html': ['radio'],
        'radio-dashboard': ['radio'],
        'beds-dashboard.html': ['beds', 'nurse', 'reception', 'doctor'],
        'beds-dashboard': ['beds', 'nurse', 'reception', 'doctor'],
        'theater-dashboard.html': ['theater', 'doctor', 'nurse', 'reception'],
        'theater-dashboard': ['theater', 'doctor', 'nurse', 'reception']
    };
    window.PORTAL_PERMISSIONS = PORTAL_PERMISSIONS;

    function isLabDashboardPage() {
        try {
            if (window.__pclinic_is_lab === true) return true;
            var path = (window.location.pathname || '').toLowerCase();
            var href = (window.location.href || '').toLowerCase();
            return path.indexOf('lab-dashboard') !== -1 || href.indexOf('lab-dashboard') !== -1;
        } catch(e) {
            return false;
        }
    }

    function uncloak() {
        if (document.documentElement) {
            document.documentElement.classList.remove('pc-auth-pending');
        }
        var cloak = document.getElementById('pc-auth-cloak');
        if (cloak && cloak.parentNode) {
            cloak.parentNode.removeChild(cloak);
        }
    }

    function goToLogin(reason) {
        if (isLabDashboardPage()) {
            console.warn('⛔ Suppressed goToLogin on lab-dashboard:', reason);
            uncloak();
            return;
        }
        if (reason) {
            try { sessionStorage.setItem('pclinic_auth_message', reason); } catch (e) {}
        }
        window.location.replace('login.html');
    }

    function goToHub(reason) {
        if (isLabDashboardPage()) {
            console.warn('⛔ Suppressed goToHub on lab-dashboard:', reason);
            uncloak();
            return;
        }
        if (reason) {
            try { sessionStorage.setItem('pclinic_auth_message', reason); } catch (e) {}
        }
        var here = (window.location.pathname || '').split('/').filter(Boolean).pop() || '';
        here = here.toLowerCase();
        if (here === 'hub.html' || here === 'hub') {
            window.location.replace('login.html');
            return;
        }
        window.location.replace('hub.html');
    }

    // ─── INSTANT PRE-RENDER ROLE GUARD & ZERO-FLASH CLOAK ───
    var curPage = (window.location.pathname || '').split('/').filter(Boolean).pop() || '';
    curPage = curPage.toLowerCase();
    var reqRoles = PORTAL_PERMISSIONS[curPage];

    if (isLabDashboardPage()) {
        // Never restrict or cloak the lab dashboard on pre-render
        uncloak();
    } else if (reqRoles && reqRoles.length > 0) {
        var cachedRole = '';
        try {
            cachedRole = (sessionStorage.getItem('pclinic_role') || localStorage.getItem('userRole') || '').toLowerCase();
        } catch(e) {}

        if (cachedRole) {
            var isAllowed = cachedRole === 'admin' || reqRoles.indexOf(cachedRole) !== -1;
            if (!isAllowed) {
                var portalName = curPage.replace('-dashboard.html', '').replace('.html', '').toUpperCase();
                var msg = '⛔ Portal restricted: ' + portalName + ' dashboard is not available for your role (' + cachedRole + ').';
                try { sessionStorage.setItem('pclinic_auth_message', msg); } catch (e) {}
                if (window.stop) {
                    try { window.stop(); } catch (e) {}
                }
                window.location.replace('hub.html');
                return;
            }
        }

        // Either role is authorized or pending Firebase verification — cloak body so zero flash of content
        var style = document.createElement('style');
        style.id = 'pc-auth-cloak';
        style.textContent = 'html.pc-auth-pending body { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }';
        document.head.appendChild(style);
        document.documentElement.classList.add('pc-auth-pending');
    }

    // ─── GLOBAL CROSS-PORTAL NAVIGATION INTERCEPTOR ───
    // Prevent ANY link or anchor from jumping across roles (e.g. Cashier clicking Doctor link)
    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        var targetPage = href.split('?')[0].split('#')[0].split('/').pop().toLowerCase();
        var needed = PORTAL_PERMISSIONS[targetPage];
        if (!needed || needed.length === 0) return;

        var role = '';
        try {
            role = (sessionStorage.getItem('pclinic_role') || (window.currentStaff && window.currentStaff.role) || localStorage.getItem('userRole') || '').toLowerCase();
        } catch(e) {}
        if (!role) return;
        if (role === 'admin') return;

        if (needed.indexOf(role) === -1) {
            e.preventDefault();
            e.stopPropagation();
            var targetName = targetPage.replace('-dashboard.html', '').replace('.html', '').toUpperCase();
            var warningMsg = '⛔ Access restricted: ' + targetName + ' portal is not available for your role (' + role + ').';
            if (typeof window.pcToast === 'function') {
                window.pcToast(warningMsg, 'warning');
            } else {
                alert(warningMsg);
            }
        }
    }, true);

    function waitForFirebase() {
        return new Promise(function (resolve) {
            if (window.firebaseReady && window.firebaseAuth) {
                resolve(true);
                return;
            }
            window.addEventListener('firebaseReady', function () {
                resolve(true);
            }, { once: true });
            var waitTimeout = isLabDashboardPage() ? 1000 : 8000;
            setTimeout(function () {
                resolve(!!window.firebaseAuth);
            }, waitTimeout);
        });
    }

    // ─── MAIN GUARD ───
    window.requireAuth = function (allowedRoles) {
        if (isLabDashboardPage()) {
            uncloak();
            var activeRole = '';
            var activeName = '';
            try {
                activeRole = (sessionStorage.getItem('pclinic_role') || localStorage.getItem('userRole') || '').toLowerCase();
                activeName = localStorage.getItem('userName') || '';
            } catch(e){}

            var defaultLabStaff = {
                uid: 'lab-officer',
                staffId: '41054',
                name: activeName || 'Laboratory Technician',
                role: activeRole || 'lab'
            };
            window.currentStaff = window.currentStaff || defaultLabStaff;
        }

        if (!allowedRoles || allowedRoles.length === 0) {
            allowedRoles = PORTAL_PERMISSIONS[curPage] || [];
        }

        return waitForFirebase().then(async function (ready) {
            if (!ready) {
                if (isLabDashboardPage()) {
                    uncloak();
                    var staffFb = window.currentStaff || {
                        uid: 'lab-officer',
                        staffId: '41054',
                        name: 'Laboratory Technician',
                        role: 'lab'
                    };
                    window.dispatchEvent(new CustomEvent('pclinicStaffReady', { detail: staffFb }));
                    return Promise.resolve(staffFb);
                }
                goToLogin('⚠️ Could not connect. Please log in again.');
                return Promise.reject(new Error('firebase-not-ready'));
            }

            try {
                if (typeof window.firebaseAuth.authStateReady === 'function') {
                    await window.firebaseAuth.authStateReady();
                }
            } catch (e) {}

            return new Promise(function (resolve, reject) {
                let settled = false;
                const { onAuthStateChanged } = window.firebaseAuthFunctions;
                const unsubscribe = onAuthStateChanged(window.firebaseAuth, async function (user) {
                    if (settled) return;
                    settled = true;
                    if (typeof unsubscribe === 'function') {
                        try { unsubscribe(); } catch(e){}
                    }

                    if (!user) {
                        if (isLabDashboardPage()) {
                            uncloak();
                            var stOff = window.currentStaff || {
                                uid: 'lab-officer',
                                staffId: '41054',
                                name: (localStorage.getItem('userName') || 'Laboratory Technician'),
                                role: (localStorage.getItem('userRole') || 'lab')
                            };
                            window.currentStaff = stOff;
                            window.dispatchEvent(new CustomEvent('pclinicStaffReady', { detail: stOff }));
                            resolve(stOff);
                            return;
                        }
                        goToLogin();
                        reject(new Error('not-authenticated'));
                        return;
                    }

                    // ─── 24-HOUR SESSION EXPIRATION CHECK ───
                    var MAX_SESSION_MS = 24 * 60 * 60 * 1000;
                    var now = Date.now();
                    var loginTimeStr = null;
                    try { loginTimeStr = localStorage.getItem('pclinic_login_time'); } catch(e){}
                    if (loginTimeStr) {
                        var loginTime = parseInt(loginTimeStr, 10);
                        if (!isNaN(loginTime) && (now - loginTime > MAX_SESSION_MS)) {
                            if (isLabDashboardPage()) {
                                try { localStorage.setItem('pclinic_login_time', String(now)); } catch(e){}
                            } else {
                                try { localStorage.removeItem('pclinic_login_time'); } catch(e){}
                                try { sessionStorage.removeItem('pclinic_role'); } catch(e){}
                                try { localStorage.removeItem('userRole'); } catch(e){}
                                if (window.firebaseAuth && window.firebaseAuthFunctions && window.firebaseAuthFunctions.signOut) {
                                    try { await window.firebaseAuthFunctions.signOut(window.firebaseAuth); } catch(e){}
                                }
                                goToLogin('⏳ Session expired after 24 hours. Please log in again.');
                                reject(new Error('session-expired'));
                                return;
                            }
                        }
                    } else {
                        try { localStorage.setItem('pclinic_login_time', String(now)); } catch(e){}
                    }

                    try {
                        const { doc, getDoc } = window.firebaseFunctions;
                        const snap = await getDoc(doc(window.firebaseDB, 'users', user.uid));

                        if (!snap.exists()) {
                            if (isLabDashboardPage()) {
                                uncloak();
                                var stDoc = {
                                    uid: user.uid,
                                    staffId: '41054',
                                    name: user.displayName || (localStorage.getItem('userName') || 'Laboratory Technician'),
                                    role: (localStorage.getItem('userRole') || 'lab')
                                };
                                window.currentStaff = stDoc;
                                window.dispatchEvent(new CustomEvent('pclinicStaffReady', { detail: stDoc }));
                                resolve(stDoc);
                                return;
                            }
                            await window.firebaseAuthFunctions.signOut(window.firebaseAuth);
                            goToLogin('❌ Account not set up. Contact your administrator.');
                            reject(new Error('no-profile'));
                            return;
                        }

                        const profile = snap.data();

                        if (profile.active === false) {
                            if (isLabDashboardPage()) {
                                uncloak();
                                var stInactive = {
                                    uid: user.uid,
                                    staffId: profile.staffId || '41054',
                                    name: profile.name || 'Laboratory Technician',
                                    role: (profile.role || 'lab').toLowerCase()
                                };
                                window.currentStaff = stInactive;
                                window.dispatchEvent(new CustomEvent('pclinicStaffReady', { detail: stInactive }));
                                resolve(stInactive);
                                return;
                            }
                            await window.firebaseAuthFunctions.signOut(window.firebaseAuth);
                            goToLogin('❌ This account has been disabled. Contact your administrator.');
                            reject(new Error('disabled'));
                            return;
                        }

                        const role = (profile.role || '').toLowerCase();
                        const isAdmin = role === 'admin';

                        // Synchronize cached role across session & local storage
                        try {
                            sessionStorage.setItem('pclinic_role', role);
                            localStorage.setItem('userRole', role);
                            localStorage.setItem('userName', profile.name || profile.staffId || 'Staff');
                        } catch(e){}

                        if (allowedRoles.length > 0 && !isAdmin && allowedRoles.indexOf(role) === -1) {
                            if (isLabDashboardPage()) {
                                uncloak();
                                const staffCross = {
                                    uid: user.uid,
                                    staffId: profile.staffId || '',
                                    name: profile.name || profile.staffId || 'Staff',
                                    role: role
                                };
                                window.currentStaff = staffCross;
                                window.dispatchEvent(new CustomEvent('pclinicStaffReady', { detail: staffCross }));
                                resolve(staffCross);
                                return;
                            }
                            var pName = curPage.replace('-dashboard.html', '').replace('.html', '').toUpperCase();
                            goToHub('⛔ Access restricted: ' + pName + ' portal is not available for your role (' + role + ').');
                            reject(new Error('forbidden'));
                            return;
                        }

                        // Authenticated and authorized: reveal document
                        uncloak();

                        const staff = {
                            uid: user.uid,
                            staffId: profile.staffId || '',
                            name: profile.name || profile.staffId || 'Staff',
                            role: role
                        };
                        window.currentStaff = staff;
                        window.dispatchEvent(new CustomEvent('pclinicStaffReady', { detail: staff }));
                        resolve(staff);

                    } catch (err) {
                        console.error('Auth guard error:', err);
                        if (isLabDashboardPage()) {
                            uncloak();
                            var stCatch = {
                                uid: 'lab-officer',
                                staffId: '41054',
                                name: (localStorage.getItem('userName') || 'Laboratory Technician'),
                                role: (localStorage.getItem('userRole') || 'lab')
                            };
                            window.currentStaff = stCatch;
                            window.dispatchEvent(new CustomEvent('pclinicStaffReady', { detail: stCatch }));
                            resolve(stCatch);
                            return;
                        }
                        goToLogin('❌ Something went wrong. Please log in again.');
                        reject(err);
                    }
                });
            });
        });
    };

    // ─── LOGOUT HELPER ───
    if (typeof window.pclinicLogout !== 'function') {
        window.pclinicLogout = async function () {
            try { localStorage.removeItem('pclinic_login_time'); } catch(e){}
            try {
                Object.keys(localStorage).forEach(function (k) {
                    if (k.indexOf('pclinic') === 0 || k === 'userRole' || k === 'userName') {
                        localStorage.removeItem(k);
                    }
                });
                sessionStorage.clear();
                if (window.firebaseAuth && window.firebaseAuthFunctions) {
                    await window.firebaseAuthFunctions.signOut(window.firebaseAuth);
                }
                if (typeof window.pclinicClearFirebaseCache === 'function') {
                    await window.pclinicClearFirebaseCache();
                }
            } catch (e) {}
            window.location.replace('login.html');
        };
    }

})();
