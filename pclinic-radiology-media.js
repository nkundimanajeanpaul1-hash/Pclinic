/* ============================================================
   PCLINIC — RADIOLOGY STUDY MEDIA (images / web video)
   ------------------------------------------------------------
   Attached to one radiology order. Bytes go to the private Cloud
   Storage bucket; Firestore keeps only metadata; pixels come back
   as short-lived signed URLs minted by the radiologyMediaSign
   callable, so nothing in the app ever holds a public object URL.

   Upload uses the Storage JSON API over the already-signed-in
   Firebase user token (window.firebaseAuth). The Firebase SDK is
   loaded per page as ES modules from gstatic (see
   firebase-config.js), and the app has no bundler, so reaching for
   firebase-storage.js here would mean a second module graph. REST
   keeps this file plain script-tag code.

   Requires, in order:
     1. Firebase Storage enabled on the project (creates the bucket)
     2. firebase deploy --only storage,firestore:rules,functions
   Without (1) every upload reports the bucket-missing error below.
   ============================================================ */
(function () {
    'use strict';

    var MAX_BYTES = 25 * 1024 * 1024;
    var ALLOWED = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
        'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm',
        'application/dicom': 'dcm'
    };
    // Bucket name lives in firebase-config.js (firebaseApp.options.storageBucket).
    // New Firebase projects use the `firebasestorage.app` domain; the legacy
    // `appspot.com` alias only exists on older projects. Reading it from the live
    // config keeps upload and signing pointed at the same bucket, so they can
    // never drift apart again.
    function bucketName() {
        try {
            var configured = window.firebaseApp && window.firebaseApp.options &&
                window.firebaseApp.options.storageBucket;
            if (configured) return String(configured);
        } catch (e) { /* fall through to default */ }
        return 'pclinic-20d81.firebasestorage.app';
    }

    // Firebase Storage mints a download token for every object uploaded through
    // its endpoint and returns it in the upload response (`downloadTokens`). We
    // keep it IN MEMORY ONLY, for this page session, so the person who just
    // uploaded an image sees it at once even while the signing function on the
    // server is unavailable. Never written to Firestore (the record schema is
    // fixed by firestore.rules) and never persisted on the device.
    var localUrls = {};
    function rememberLocalUrl(mediaId, path, uploaded) {
        try {
            var tok = uploaded && uploaded.downloadTokens ? String(uploaded.downloadTokens).split(',')[0].trim() : '';
            if (!tok) return '';
            var url = 'https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(bucketName()) +
                '/o/' + encodeURIComponent(path) + '?alt=media&token=' + encodeURIComponent(tok);
            localUrls[String(mediaId)] = url;
            return url;
        } catch (e) { return ''; }
    }

    function nowIso() { return new Date().toISOString(); }
    function uid(prefix) {
        return (prefix || 'med') + '-' + Date.now().toString(36) + '-' +
            Math.random().toString(36).slice(2, 8);
    }
    function say(message, kind) {
        if (window.pcToast) window.pcToast(message, kind || 'info', 8000);
        else if (window.sharedShowToast) window.sharedShowToast(message, kind || 'info', 8000);
    }
    function fns() { return window.firebaseFunctions; }
    function db() { return window.firebaseDB; }

    function backendReady() {
        return !!(db() && fns() && window.firebaseAuth && window.pclinicCloudFunctions);
    }

    /* ── client-side gate, mirrored by storage.rules and firestore.rules ── */
    function inspect(file) {
        if (!file) return { ok: false, reason: 'No file was selected.' };
        var mime = String(file.type || '').toLowerCase();
        // Some operating systems report DICOM files with an empty MIME type.
        // Recognise them by their .dcm extension so real studies can be viewed.
        var name = String(file.name || '').toLowerCase();
        if (!mime && name.slice(-4) === '.dcm') mime = 'application/dicom';
        if (!Object.prototype.hasOwnProperty.call(ALLOWED, mime)) {
            return {
                ok: false,
                reason: 'Only these formats are accepted: ' + Object.keys(ALLOWED).join(', ') +
                    ', plus DICOM (.dcm). A file of type ' + (mime || 'unknown') +
                    ' cannot be displayed here.'
            };
        }
        if (!(file.size > 0)) return { ok: false, reason: 'The file is empty.' };
        if (file.size > MAX_BYTES) {
            return {
                ok: false,
                reason: 'The file is ' + (file.size / 1048576).toFixed(1) +
                    ' MB; the limit is 25 MB. Export a smaller JPEG/PNG or a short clip.'
            };
        }
        return { ok: true, mime: mime, ext: ALLOWED[mime], kind: mime.indexOf('video/') === 0 ? 'video' : 'image' };
    }

    /* ── storage over REST ──────────────────────────────────────── */
    async function idToken() {
        var user = window.firebaseAuth.currentUser;
        if (!user) throw new Error('Your session expired. Sign in again before uploading.');
        return user.getIdToken();
    }

    function objectPath(orderId, mediaId, ext) {
        return 'radiology/' + orderId + '/' + mediaId + '.' + ext;
    }

    async function putObject(path, file, token) {
        // Uploads go to the Firebase Storage endpoint (firebasestorage.googleapis.com),
        // NOT the Google Cloud Storage JSON API (storage.googleapis.com). Only the
        // Firebase endpoint accepts a Firebase Auth ID token and enforces
        // storage.rules; the GCS JSON API expects a Google OAuth2 access token and
        // would reject the upload with 401. uploadType=media sends the bytes in a
        // single POST, which is fine at the 25 MB cap.
        var url = 'https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(bucketName()) +
            '/o?name=' + encodeURIComponent(path) + '&uploadType=media';
        var response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': file.type },
            body: file
        });
        if (!response.ok) {
            var detail = '';
            try { detail = (await response.text()).slice(0, 300); } catch (e) {}
            // A single-shot media upload is rejected by the GCS CORS preflight in
            // some regions; a resumable session is the documented workaround, so
            // retry once that way before reporting failure.
            if (response.status === 400 && /CORS|origin|preflight/i.test(detail)) {
                return putObjectResumable(path, file, token);
            }
            if (response.status === 404) {
                throw new Error('Firebase Storage is not enabled on project pclinic-20d81 yet. Open the Firebase console → Storage → Get started, then retry.');
            }
            throw new Error('Storage rejected the file (' + response.status + '). ' + detail);
        }
        return response.json();
    }

    async function putObjectResumable(path, file, token) {
        // Resumable fallback, on the same Firebase Storage endpoint, for regions
        // where a single-shot media upload trips the CORS preflight. start
        // initiates the session; the Location header returns a URL to PUT the
        // bytes to. The session URL already carries its own upload token, so the
        // body PUT needs no Authorization header.
        var start = await fetch(
            'https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(bucketName()) +
            '/o?uploadType=resumable&name=' + encodeURIComponent(path),
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Length': String(file.size),
                    'X-Upload-Content-Type': file.type
                },
                body: JSON.stringify({ name: path, contentType: file.type })
            });
        if (!start.ok) throw new Error('Could not start the upload (' + start.status + ').');
        var sessionUri = start.headers.get('location');
        if (!sessionUri) throw new Error('The storage service did not return an upload session.');
        var send = await fetch(sessionUri, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file
        });
        if (!send.ok) throw new Error('The upload did not complete (' + send.status + ').');
        return send.json();
    }

    /* ── cloud calls ────────────────────────────────────────────── */
    async function call(name, data) {
        if (!window.pclinicCloudFunctions || typeof window.pclinicCloudFunctions.call !== 'function') {
            throw new Error('The radiology backend is not reachable. Deploy the Cloud Functions first.');
        }
        try {
            return await window.pclinicCloudFunctions.call(name, data || {});
        } catch (error) {
            throw new Error(error && error.message ? error.message : 'The study media request failed.');
        }
    }

    /* ── public API ─────────────────────────────────────────────── */
    var media = {
        MAX_BYTES: MAX_BYTES,
        ACCEPT: Object.keys(ALLOWED).join(','),
        inspect: inspect,
        objectPath: objectPath,

        /** Upload one file and register it against the order. */
        async upload(order, file) {
            if (!order || !order.id) throw new Error('Select a study in the worklist first.');
            if (!backendReady()) throw new Error('Sign in and wait for the common server to connect, then retry.');
            var check = inspect(file);
            if (!check.ok) throw new Error(check.reason);

            var mediaId = uid('rmed');
            var path = objectPath(String(order.id), mediaId, check.ext);
            var token = await idToken();
            var uploaded = await putObject(path, file, token);

            var record = {
                id: mediaId,
                orderId: String(order.id),
                patientId: String(order.patientId == null ? '' : order.patientId),
                fileName: String(file.name || 'study').slice(0, 240),
                mime: check.mime,
                kind: check.kind,
                bytes: file.size,
                storagePath: path,
                ext: check.ext,
                sha256: '',
                at: nowIso(),
                byUid: window.firebaseAuth.currentUser.uid,
                byId: String((window.currentStaff && window.currentStaff.staffId) || ''),
                byName: String((window.currentStaff && window.currentStaff.name) || ''),
                byRole: String((window.currentStaff && window.currentStaff.role) || '')
            };
            try {
                await fns().setDoc(fns().doc(db(), 'radiologyMedia', mediaId), record);
            } catch (error) {
                // The object exists but is not registered: nothing can ever sign it,
                // so remove it rather than leaking an orphan file in the bucket.
                try {
                    await fetch('https://firebasestorage.googleapis.com/v0/b/' +
                        encodeURIComponent(bucketName()) + '/o/' + encodeURIComponent(path), {
                        method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
                    });
                } catch (cleanupError) { /* best effort */ }
                throw new Error('The file uploaded but the record was rejected: ' +
                    ((error && error.message) || 'permission problem') +
                    '. Deploy the updated firestore.rules, then retry.');
            }
            rememberLocalUrl(mediaId, path, uploaded);
            window.dispatchEvent(new CustomEvent('pcRadiologyMediaChanged', { detail: record }));
            return record;
        },

        /** URL of a file uploaded in THIS page session (memory only), else ''. */
        localUrlFor(mediaId) { return localUrls[String(mediaId)] || ''; },

        /** Signed, short-lived view URLs for one order. */
        async urlsFor(orderId) {
            if (!backendReady()) return { items: [], error: 'backend-unavailable' };
            return call('radiologyMediaSign', { orderId: String(orderId) });
        },

        /** Metadata only — safe to render without touching storage. */
        async listFor(orderId) {
            if (!db() || !fns()) return [];
            try {
                var snap = await fns().getDocs(fns().query(
                    fns().collection(db(), 'radiologyMedia'),
                    fns().where('orderId', '==', String(orderId))));
                var rows = [];
                snap.forEach(function (docSnap) { rows.push(Object.assign({ id: docSnap.id }, docSnap.data())); });
                return rows.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
            } catch (error) {
                console.warn('[pclinic] radiology media list failed:', error && error.message);
                return [];
            }
        },

        /** Undo the uploader's own mistaken upload (object + record). */
        async remove(record) {
            if (!record || !record.id) throw new Error('Nothing selected to remove.');
            if (record.byUid && window.firebaseAuth.currentUser &&
                record.byUid !== window.firebaseAuth.currentUser.uid) {
                throw new Error('Only the person who uploaded a file can remove it.');
            }
            var result = await call('radiologyMediaDelete', { mediaId: String(record.id) });
            window.dispatchEvent(new CustomEvent('pcRadiologyMediaChanged', {
                detail: { removed: record.id, order: result && result.orderId }
            }));
            return result;
        },

        /**
         * Small panel used by the worklist row and the results page. Renders with
         * metadata alone; thumbnails appear only once signed URLs come back, so a
         * page still works when the functions are not deployed yet.
         */
        async mount(host, order, options) {
            if (!host) return null;
            options = options || {};
            host.replaceChildren();
            var wrap = document.createElement('div');
            wrap.className = 'pc-media-panel';
            var title = document.createElement('div');
            title.textContent = 'Study media — ' + (order && order.study ? order.study : (order && order.id) || '');
            title.style.cssText = 'font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#6e6e73;margin:6px 0';
            wrap.appendChild(title);
            var grid = document.createElement('div');
            grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start';
            wrap.appendChild(grid);
            var note = document.createElement('div');
            note.style.cssText = 'font-size:11px;color:#6e6e73;margin-top:6px';
            wrap.appendChild(note);
            host.appendChild(wrap);

            var rows = await media.listFor(order && order.id);
            if (!rows.length) {
                note.textContent = 'No images or clips attached to this study yet.';
            } else {
                note.textContent = rows.length + ' file(s), ' +
                    (rows.reduce(function (t, r) { return t + (Number(r.bytes) || 0); }, 0) / 1048576).toFixed(1) +
                    ' MB total. Thumbnails open through a short-lived signed URL.';
            }
            rows.forEach(function (row) {
                var tile = document.createElement('div');
                tile.style.cssText = 'width:132px;border:1px solid #d2d2d7;border-radius:10px;padding:6px;background:#fff';
                var body = document.createElement('div');
                body.style.cssText = 'height:96px;display:flex;align-items:center;justify-content:center;background:#f5f5f7;border-radius:7px;overflow:hidden;font-size:11px;color:#6e6e73;text-align:center';
                body.textContent = row.kind === 'video' ? 'Video' : 'Loading…';
                tile.appendChild(body);
                var cap = document.createElement('div');
                cap.style.cssText = 'font-size:10px;color:#1d1d1f;margin-top:5px;word-break:break-all';
                cap.textContent = String(row.fileName || row.id).slice(0, 44);
                tile.appendChild(cap);
                var meta = document.createElement('div');
                meta.style.cssText = 'font-size:10px;color:#6e6e73';
                meta.textContent = ((Number(row.bytes) || 0) / 1048576).toFixed(1) + ' MB · ' +
                    new Date(row.at).toLocaleDateString('en-GB') + ' · ' + (row.byName || '');
                tile.appendChild(meta);
                var rowActions = document.createElement('div');
                rowActions.style.cssText = 'display:flex;gap:6px;margin-top:5px';
                var open = document.createElement('button');
                open.type = 'button';
                open.textContent = 'Open';
                open.style.cssText = 'font:inherit;font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid #d2d2d7;background:#fff;cursor:pointer';
                rowActions.appendChild(open);
                if (options.canManage) {
                    var del = document.createElement('button');
                    del.type = 'button';
                    del.textContent = 'Remove';
                    del.style.cssText = open.style.cssText + ';color:#b42318';
                    del.onclick = function () {
                        if (!window.confirm('Remove this file from the study? Only your own uploads can be removed.')) return;
                        media.remove(row).then(function () { media.mount(host, order, options); })
                            .catch(function (error) { say('⚠️ ' + error.message, 'error'); });
                    };
                    rowActions.appendChild(del);
                }
                tile.appendChild(rowActions);
                grid.appendChild(tile);

                open.onclick = function () {
                    open.disabled = true;
                    media.urlsFor(order.id).then(function (out) {
                        var hit = ((out && out.items) || []).filter(function (i) { return String(i.id) === String(row.id); })[0];
                        if (!hit || !hit.url) {
                            var why = (hit && (hit.reason || hit.error)) || (out && out.error === 'backend-unavailable'
                                ? 'the common server is not connected' : 'the signing service returned no entry for this file');
                            say('This image cannot be opened: ' + why, 'warning');
                            return;
                        }
                        if (row.kind === 'video') {
                            body.replaceChildren();
                            var video = document.createElement('video');
                            video.src = hit.url; video.controls = true;
                            video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';
                            body.appendChild(video);
                        } else {
                            body.replaceChildren();
                            var img = document.createElement('img');
                            img.src = hit.url; img.alt = String(row.fileName || 'study image');
                            img.style.cssText = 'width:100%;height:100%;object-fit:contain';
                            body.appendChild(img);
                        }
                        // The signed URL is time-limited and must not linger in history.
                        history.replaceState(null, '', location.pathname + location.search);
                    }).catch(function (error) {
                        say('⚠️ ' + error.message, 'error');
                    }).finally(function () { open.disabled = false; });
                };
            });
            return { refresh: function () { return media.mount(host, order, options); } };
        }
    };

    window.pcRadioMedia = media;
})();
