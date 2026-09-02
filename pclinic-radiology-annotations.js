/* PClinic — radiology annotations on the common server
 * ─────────────────────────────────────────────────────────────────────────────
 * Measurements / drawings, key-image flags and a short viewer note made in the
 * imaging workstation (PcDicomViewer) are stored in Firestore so that every
 * clinician who opens the same image sees them again, on any device:
 *
 *   radiologyAnnotations/{mediaId}_{uid}
 *     id, mediaId, orderId, patientId          ← which image / study / patient
 *     byUid, byId, byName, byRole              ← the author (one document per author per image)
 *     measurements: [{ tool, uuid, frame, json }]   ← drawings, serialised by the viewer
 *     keyImage: bool, note: string             ← flag + free text
 *     updatedAt: ISO string, client: 'pcdv/1'
 *
 * Security is in firestore.rules: readers = every clinical role that may read
 * the patient; create/update only by the author (doctor, radio, admin) and only
 * for an image record that really exists; delete only by the author.
 * The image bytes are never touched — a document only describes drawings that
 * sit on top of an image.
 *
 * Exposes window.pcRadioAnnotations = { ready, whenReady, me, canWrite, docId,
 * subscribe, save, sanitizeMeasurements, isEmpty, LIMITS }.
 */
(function () {
    'use strict';

    var COLLECTION = 'radiologyAnnotations';
    var WRITE_ROLES = ['doctor', 'radio', 'admin'];
    var LIMITS = { measurements: 300, note: 4000, json: 60000, text: 500 };
    var TOOLS = ['Length', 'Angle', 'CobbAngle', 'RectangleRoi', 'EllipticalRoi', 'FreehandRoi', 'Bidirectional', 'Probe', 'ArrowAnnotate'];

    function fns() { return window.firebaseFunctions; }
    function db() { return window.firebaseDB; }
    function ready() { var f = fns(); return !!(db() && f && typeof f.onSnapshot === 'function' && typeof f.setDoc === 'function' && typeof f.doc === 'function'); }

    /** Resolves once firebase-config.js has published the Firestore handles (or after 20 s, unresolved backend → ready() stays false). */
    function whenReady() {
        if (ready()) return Promise.resolve(true);
        return new Promise(function (resolve) {
            var done = false; var timer = null, poll = null;
            function finish(ok) { if (done) return; done = true; clearTimeout(timer); clearInterval(poll); window.removeEventListener('firebaseReady', onReady); resolve(!!ok); }
            function onReady() { if (ready()) finish(true); }
            window.addEventListener('firebaseReady', onReady);
            poll = setInterval(function () { if (ready()) finish(true); }, 250);
            timer = setTimeout(function () { finish(ready()); }, 20000);
        });
    }

    /** Who is drawing: uid from Firebase Auth, name / staffId / role from the signed-in staff profile. */
    function me() {
        var auth = window.firebaseAuth, user = auth && auth.currentUser; var staff = window.currentStaff || {};
        return {
            uid: user && user.uid ? String(user.uid) : '',
            staffId: String(staff.staffId || ''),
            name: String(staff.name || (user && user.displayName) || '').slice(0, 120),
            role: String(staff.role || '')
        };
    }
    function canWrite() { var m = me(); return !!m.uid && WRITE_ROLES.indexOf(m.role) !== -1; }
    function docId(mediaId, uid) { return String(mediaId) + '_' + String(uid); }
    function nowIso() { return new Date().toISOString(); }

    /** Keep only well-formed measurement entries; the viewer produces them, but never trust a list blindly. */
    function sanitizeMeasurements(list) {
        var out = [];
        (Array.isArray(list) ? list : []).forEach(function (m) {
            if (!m || typeof m !== 'object') return;
            var tool = String(m.tool || ''); if (TOOLS.indexOf(tool) === -1) return;
            var json = typeof m.json === 'string' ? m.json : ''; if (!json || json.length > LIMITS.json) return;
            try { var parsed = JSON.parse(json); if (!parsed || typeof parsed !== 'object') return; } catch (e) { return; }
            var frame = Number(m.frame); if (!Number.isFinite(frame) || frame < 0) frame = 0;
            var uuid = String(m.uuid || '').slice(0, 64) || ('m' + Math.random().toString(36).slice(2, 10));
            if (out.length < LIMITS.measurements) out.push({ tool: tool, uuid: uuid, frame: Math.floor(frame), json: json });
        });
        return out;
    }
    function isEmpty(entry) { return !(entry && ((entry.measurements && entry.measurements.length) || entry.keyImage || String(entry.note || '').trim())); }

    /**
     * Live list of every author's annotations for one study (orderId).
     * cb(rows, error) — rows: [{id, mediaId, byUid, byName, measurements, keyImage, note, updatedAt, …}].
     * Returns an unsubscribe function. Works before the backend is ready (subscribes when it is).
     */
    function subscribe(orderId, cb) {
        var stopped = false, stop = null;
        whenReady().then(function (ok) {
            if (stopped) return;
            if (!ok) { cb([], new Error('The common server is not connected.')); return; }
            var f = fns();
            try {
                var q = f.query(f.collection(db(), COLLECTION), f.where('orderId', '==', String(orderId)));
                stop = f.onSnapshot(q, function (snap) {
                    var rows = [];
                    snap.forEach(function (d) { var data = d.data() || {}; rows.push(Object.assign({}, data, { id: d.id, measurements: sanitizeMeasurements(data.measurements), keyImage: !!data.keyImage, note: String(data.note || '') })); });
                    rows.sort(function (a, b) { return String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')); });
                    cb(rows, null);
                }, function (error) { cb([], error); });
            } catch (error) { cb([], error); }
        });
        return function () { stopped = true; if (stop) { try { stop(); } catch (e) {} stop = null; } };
    }

    /**
     * Write (or remove, when everything is empty) the caller's document for one image.
     * entry = { mediaId, orderId, patientId, measurements, keyImage, note }
     * Resolves { id, deleted, at }.
     */
    async function save(entry) {
        if (!entry || !entry.mediaId || !entry.orderId) throw new Error('Nothing to save: the image is not registered on the server.');
        if (!ready()) throw new Error('The common server is not connected. Check the internet connection and sign in again.');
        var who = me();
        if (!who.uid) throw new Error('Sign in again to save drawings.');
        if (WRITE_ROLES.indexOf(who.role) === -1) throw new Error('Drawings are saved for doctors and radiology only (your role: ' + (who.role || 'unknown') + ').');
        var f = fns(); var id = docId(entry.mediaId, who.uid); var ref = f.doc(db(), COLLECTION, id);
        var clean = {
            id: id,
            mediaId: String(entry.mediaId),
            orderId: String(entry.orderId),
            patientId: String(entry.patientId == null ? '' : entry.patientId),
            measurements: sanitizeMeasurements(entry.measurements),
            keyImage: !!entry.keyImage,
            note: String(entry.note || '').slice(0, LIMITS.note),
            byUid: who.uid, byId: who.staffId, byName: who.name, byRole: who.role,
            updatedAt: nowIso(),
            client: 'pcdv/1'
        };
        if (isEmpty(clean)) {
            try { await f.deleteDoc(ref); } catch (e) { if (!/not.?found|no document/i.test(String(e && e.message))) throw friendly(e); }
            return { id: id, deleted: true, at: clean.updatedAt };
        }
        try { await f.setDoc(ref, clean); } catch (e) { throw friendly(e); }
        return { id: id, deleted: false, at: clean.updatedAt };
    }
    function friendly(e) {
        var msg = String((e && e.message) || e || '');
        if (/permission|insufficient/i.test(msg)) return new Error('The server refused the save (permission). Deploy the updated firestore.rules, and check the image record exists.');
        if (/offline|unavailable|network|failed to fetch/i.test(msg)) return new Error('No connection to the common server — the drawing stays on screen; retry when online.');
        return new Error(msg || 'The save failed.');
    }

    window.pcRadioAnnotations = {
        COLLECTION: COLLECTION, LIMITS: LIMITS, WRITE_ROLES: WRITE_ROLES.slice(), TOOLS: TOOLS.slice(),
        ready: ready, whenReady: whenReady, me: me, canWrite: canWrite, docId: docId,
        subscribe: subscribe, save: save, sanitizeMeasurements: sanitizeMeasurements, isEmpty: isEmpty
    };
})();
