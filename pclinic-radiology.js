/* ============================================================
   PCLINIC — CENTRAL RADIOLOGY SERVICE
   Firestore is authoritative. No reports are stored in localStorage.
   Finalisation, transitions, addenda and critical acknowledgements use
   trusted callable backend functions.
   ============================================================ */
(function () {
    'use strict';

    var state = {
        ready: false,
        staff: null,
        orders: [],
        reports: [],
        addenda: [],
        alerts: [],
        error: null
    };
    var listeners = [];
    var unsubscribers = [];
    var loaded = { orders: false, reports: false, addenda: false, alerts: false };
    var initPromise = null;

    function cloneState() {
        return {
            ready: state.ready,
            staff: state.staff,
            orders: state.orders.slice(),
            reports: state.reports.slice(),
            addenda: state.addenda.slice(),
            alerts: state.alerts.slice(),
            error: state.error
        };
    }

    function emit() {
        var snapshot = cloneState();
        listeners.slice().forEach(function (listener) {
            try { listener(snapshot); } catch (error) { console.error('Radiology listener error:', error); }
        });
        window.dispatchEvent(new CustomEvent('radiologyUpdated', { detail: snapshot }));
    }

    function waitForFirebase() {
        if (window.firebaseReady && window.firebaseDB && window.firebaseFunctions) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { reject(new Error('Firebase did not initialize.')); }, 10000);
            window.addEventListener('firebaseReady', function () { clearTimeout(timer); resolve(); }, { once: true });
        });
    }

    function mapSnapshot(snapshot) {
        var rows = [];
        snapshot.forEach(function (documentSnapshot) {
            rows.push(Object.assign({ id: documentSnapshot.id }, documentSnapshot.data() || {}));
        });
        return rows;
    }

    function millis(value) {
        if (!value) return 0;
        if (typeof value.toMillis === 'function') return value.toMillis();
        if (value.seconds) return value.seconds * 1000;
        var parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function deriveState(order) {
        if (!order) return 'pending';
        var valid = ['pending', 'in-progress', 'acquired', 'reporting', 'reported', 'cancelled'];
        if (valid.indexOf(order.radiologyState) !== -1) return order.radiologyState;
        if (order.status === 'cancelled') return 'cancelled';
        if (order.status === 'completed') return 'reported';
        if (order.status === 'in-progress') return 'in-progress';
        return 'pending';
    }

    function subscribeCollection(reference, assign, sort) {
        var stop = window.firebaseFunctions.onSnapshot(reference, function (snapshot) {
            var rows = mapSnapshot(snapshot);
            if (sort) rows.sort(sort);
            state[assign] = rows;
            loaded[assign] = true;
            state.ready = loaded.orders && loaded.reports && loaded.addenda && loaded.alerts;
            state.error = null;
            emit();
        }, function (error) {
            state.error = error;
            console.error('Radiology Firestore subscription failed:', assign, error);
            // Drop the memoised init so a later init() (the report page's
            // "Try again") really resubscribes; otherwise the error is permanent.
            try { stop(); } catch (e) {}
            emit();
        });
        unsubscribers.push(stop);
    }

    async function init(options) {
        options = options || {};
        if (initPromise) {
            if (options.staff) state.staff = options.staff;
            return initPromise;
        }
        initPromise = (async function () {
            await waitForFirebase();
            state.staff = options.staff || window.currentStaff || null;
            var f = window.firebaseFunctions;
            var db = window.firebaseDB;
            subscribeCollection(
                f.query(f.collection(db, 'orders'), f.where('dept', '==', 'radiology')),
                'orders',
                function (a, b) { return millis(b.orderedAt) - millis(a.orderedAt); }
            );
            subscribeCollection(
                f.collection(db, 'radiologyReports'),
                'reports',
                function (a, b) { return millis(b.signedAt || b.updatedAt) - millis(a.signedAt || a.updatedAt); }
            );
            subscribeCollection(
                f.collection(db, 'radiologyAddenda'),
                'addenda',
                function (a, b) { return millis(b.signedAt) - millis(a.signedAt); }
            );
            subscribeCollection(
                f.collection(db, 'criticalAlerts'),
                'alerts',
                function (a, b) { return millis(b.notifiedAt) - millis(a.notifiedAt); }
            );
            state.ready = false;
            emit();
            return cloneState();
        })().catch(function (error) {
            state.error = error;
            state.ready = false;
            initPromise = null;
            emit();
            throw error;
        });
        return initPromise;
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return function () {};
        listeners.push(listener);
        listener(cloneState());
        return function () {
            var index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
        };
    }

    function stop() {
        unsubscribers.splice(0).forEach(function (unsubscribe) {
            try { unsubscribe(); } catch (error) {}
        });
        initPromise = null;
        loaded = { orders: false, reports: false, addenda: false, alerts: false };
        state.ready = false;
    }

    // Mirrors labReleaseErrorMessage() in pclinic-lab.js. The callable SDK rejects
    // with the bare platform code, so a missing function used to surface as a toast
    // reading only "internal" — which told the radiographer nothing and hid the fact
    // that the fix is a deploy, not a retry.
    function cloudCallErrorMessage(error, name) {
        var code = String((error && error.code) || '');
        var message = String((error && error.message) || error || 'Unknown common-server error');
        message = message.replace(/^FirebaseError:\s*/i, '').replace(/^functions\/[a-z-]+:\s*/i, '');
        if (code.indexOf('permission-denied') !== -1) {
            return 'Your staff profile is not permitted to perform this radiology action. Confirm you are signed in with an active Radiology role.';
        }
        if (code.indexOf('unauthenticated') !== -1) {
            return 'Your session expired. Sign in again before continuing.';
        }
        if (code.indexOf('unavailable') !== -1 || /Failed to fetch|NetworkError|ERR_/i.test(message)) {
            return 'The common server is unreachable from this computer. Check the connection and retry; nothing was saved.';
        }
        if (code.indexOf('internal') !== -1 || /^internal$/i.test(message)) {
            return name + ' is not deployed, is unreachable, or crashed on the server. Run `firebase deploy --only functions` for project pclinic-20d81 and read the Cloud Run log for this request; nothing was saved.';
        }
        if (code.indexOf('not-found') !== -1 || code.indexOf('unimplemented') !== -1) {
            return name + ' does not exist in Firebase project pclinic-20d81. Deploy the functions before using this workflow.';
        }
        return message;
    }

    function cloudCall(name, payload) {
        if (!window.pclinicCloudFunctions || typeof window.pclinicCloudFunctions.call !== 'function') {
            return Promise.reject(new Error('Secure radiology backend is not available. Deploy Firebase Functions first.'));
        }
        return window.pclinicCloudFunctions.call(name, payload).catch(function (error) {
            var friendly = cloudCallErrorMessage(error, name);
            var wrapped = new Error(friendly);
            wrapped.code = (error && error.code) || 'functions/internal';
            wrapped.cause = error;
            throw wrapped;
        });
    }

    function orderById(id) {
        return state.orders.find(function (order) { return String(order.id) === String(id); }) || null;
    }

    function reportById(id) {
        return state.reports.find(function (report) { return String(report.id) === String(id); }) || null;
    }

    function reportForOrder(orderId) {
        return state.reports.find(function (report) { return String(report.orderId) === String(orderId); }) || null;
    }

    function addendaForReport(reportId) {
        return state.addenda.filter(function (item) { return String(item.reportId) === String(reportId); });
    }

    function alertForReport(reportId) {
        return state.alerts.find(function (item) { return String(item.reportId) === String(reportId); }) || null;
    }

    window.pcRadiology = Object.freeze({
        init: init,
        _callErrorMessageForTests: cloudCallErrorMessage,
        stop: stop,
        subscribe: subscribe,
        snapshot: cloneState,
        stateOf: deriveState,
        orderById: orderById,
        reportById: reportById,
        reportForOrder: reportForOrder,
        addendaForReport: addendaForReport,
        alertForReport: alertForReport,
        transition: function (orderId, action, reason) {
            return cloudCall('radiologyTransition', { orderId: orderId, action: action, reason: reason || '' });
        },
        saveDraft: function (orderId, report) {
            return cloudCall('radiologySaveDraft', { orderId: orderId, report: report });
        },
        finalize: function (orderId, report) {
            return cloudCall('radiologyFinalize', { orderId: orderId, report: report });
        },
        addAddendum: function (reportId, text, reason) {
            return cloudCall('radiologyAddendum', { reportId: reportId, text: text, reason: reason });
        },
        acknowledgeCritical: function (reportId) {
            return cloudCall('radiologyAcknowledgeCritical', { reportId: reportId });
        }
    });
})();
