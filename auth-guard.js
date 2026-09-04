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
        // Clinical file pages are protected exactly like dashboards. Never
        // render a dummy user: stale browser caches may contain real PHI.
        if (reason) {
            try { sessionStorage.setItem('pclinic_auth_message', reason); } catch (e) {}
        }
        // replace() not href: a signed-out user pressing Back must not be
        // able to re-enter a protected page from the bfcache.
        window.location.replace('login');
    }

    // "Hub first": if someone opens a dashboard URL directly but isn't
    // allowed on it, send them to the hub rather than bouncing them out
    // to login. They ARE authenticated - they just picked the wrong door.
    function goToHub(reason) {
        if (reason) {
            try { sessionStorage.setItem('pclinic_auth_message', reason); } catch (e) {}
        }
        var here = window.location.pathname.split('/').pop();
        if (here === 'hub.html' || here === 'hub') {           // never redirect hub to itself
            window.location.replace('login');
            return;
        }
        window.location.replace('hub');
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
        window.pclinicLogout = async function () {
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
            window.location.replace('login');
        };
    }

})();
