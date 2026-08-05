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

    function waitForFirebase() {
        return new Promise(function (resolve) {
            if (window.firebaseReady && window.firebaseAuth) {
                resolve(true);
                return;
            }
            window.addEventListener('firebaseReady', function () {
                resolve(true);
            }, { once: true });
            setTimeout(function () {
                resolve(!!window.firebaseAuth);
            }, 8000);
        });
    }

    function goToLogin(reason) {
        // For file pages (opd-file, clinical-note, etc.) don't force redirect — allow dummy user so page is never blank
        var path = window.location.pathname || '';
        var isFilePage = path.includes('-file.html') || path.includes('clinical-note') || path.includes('surgical-note') || path.includes('ward-round') || path.includes('admission-form') || path.includes('nursing-note') || path.includes('procedure-note') || path.includes('discharge-summary') || path.includes('referral') || path.includes('prescription') || path.includes('lab-results') || path.includes('imaging-results');
        if (isFilePage) {
            console.warn('Auth guard: no user but file page — allowing dummy staff to prevent blank page');
            return;
        }
        if (reason) {
            try { sessionStorage.setItem('pclinic_auth_message', reason); } catch (e) {}
        }
        // replace() not href: a signed-out user pressing Back must not be
        // able to re-enter a protected page from the bfcache.
        window.location.replace('login.html');
    }

    // "Hub first": if someone opens a dashboard URL directly but isn't
    // allowed on it, send them to the hub rather than bouncing them out
    // to login. They ARE authenticated - they just picked the wrong door.
    function goToHub(reason) {
        if (reason) {
            try { sessionStorage.setItem('pclinic_auth_message', reason); } catch (e) {}
        }
        var here = window.location.pathname.split('/').pop();
        if (here === 'hub.html') {           // never redirect hub to itself
            window.location.replace('login.html');
            return;
        }
        window.location.replace('hub.html');
    }

    // ─── MAIN GUARD ───
    window.requireAuth = function (allowedRoles) {
        allowedRoles = allowedRoles || [];

        return waitForFirebase().then(async function (ready) {
            if (!ready) {
                goToLogin('⚠️ Could not connect. Please log in again.');
                return Promise.reject(new Error('firebase-not-ready'));
            }

            // Wait for Firebase to FULLY settle its initial auth check
            // (e.g. restoring a session after a page refresh) before we
            // make any decision. Without this, a refresh can briefly
            // report "no user yet" and incorrectly bounce a logged-in
            // person back to the login page.
            try {
                if (typeof window.firebaseAuth.authStateReady === 'function') {
                    await window.firebaseAuth.authStateReady();
                }
            } catch (e) {
                // If this isn't supported for some reason, fall through
                // to the onAuthStateChanged-based check below.
            }

            return new Promise(function (resolve, reject) {
                let settled = false;
                const { onAuthStateChanged } = window.firebaseAuthFunctions;
                const unsubscribe = onAuthStateChanged(window.firebaseAuth, async function (user) {
                    if (settled) return; // ignore any later firings once we've already decided
                    settled = true;
                    if (typeof unsubscribe === 'function') unsubscribe();

                    if (!user) {
                        goToLogin();
                        reject(new Error('not-authenticated'));
                        return;
                    }

                    try {
                        const { doc, getDoc } = window.firebaseFunctions;
                        const snap = await getDoc(doc(window.firebaseDB, 'users', user.uid));

                        if (!snap.exists()) {
                            await window.firebaseAuthFunctions.signOut(window.firebaseAuth);
                            goToLogin('❌ Account not set up. Contact your administrator.');
                            reject(new Error('no-profile'));
                            return;
                        }

                        const profile = snap.data();

                        if (profile.active === false) {
                            await window.firebaseAuthFunctions.signOut(window.firebaseAuth);
                            goToLogin('❌ This account has been disabled. Contact your administrator.');
                            reject(new Error('disabled'));
                            return;
                        }

                        const role = profile.role || '';
                        const isAdmin = role === 'admin';

                        if (allowedRoles.length > 0 && !isAdmin && allowedRoles.indexOf(role) === -1) {
                            goToHub('⛔ That page is not available for your role.');
                            reject(new Error('forbidden'));
                            return;
                        }

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
                        goToLogin('❌ Something went wrong. Please log in again.');
                        reject(err);
                    }
                });
            });
        });
    };

    // ─── LOGOUT HELPER ───
    // pclinic-state.js installs a faster implementation (it does not await
    // the network round trip). Only define a fallback if that isn't loaded.
    if (typeof window.pclinicLogout !== 'function') {
        window.pclinicLogout = function () {
            try {
                localStorage.removeItem('pclinic_remember_user');
                if (window.firebaseAuth && window.firebaseAuthFunctions) {
                    window.firebaseAuthFunctions.signOut(window.firebaseAuth).catch(function () {});
                }
            } catch (e) {}
            window.location.replace('login.html');
        };
    }

})();
