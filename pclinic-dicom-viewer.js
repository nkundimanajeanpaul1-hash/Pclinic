/* ============================================================
   PCLINIC — DICOM VIEWER (Weasis-style)  —  pclinic-dicom-viewer.js
   ------------------------------------------------------------
   One shared, self-contained viewer used by BOTH the radiology
   image-entry page and the doctor's image-result page, so the two
   look identical. Loads study media from the common Firebase
   server (metadata via pcRadioMedia.listFor, pixels via signed
   URLs from pcRadioMedia.urlsFor) and renders:

     • DICOM (.dcm) files — decoded in-browser with dicom-parser +
       cornerstone-core: window/level, zoom, pan, invert, rotate,
       flip, frame stepping, and a live pixel readout.
     • JPEG / PNG / WebP — plain image with zoom/pan.
     • MP4 / WebM — plain video with native controls.

   cornerstone + dicom-parser are loaded on demand from a CDN
   (no bundler in this app), so this file stays plain-script safe.
   ============================================================ */
(function () {
    'use strict';

    var CORNERSTONE_URL = 'https://unpkg.com/cornerstone-core@2.6.1/dist/cornerstone.min.js';
    var DICOMPARSER_URL = 'https://unpkg.com/dicom-parser@1.8.21/dist/dicomParser.min.js';

    var root = null;          // overlay DOM
    var centerEl = null;      // the .dv-center viewport element (always present)
    var enabledElement = null;// cornerstone-enabled canvas wrapper
    var enablePromise = null; // resolves when cornerstone.enable() is done
    var currentItem = null;   // the media record being displayed
    var currentImage = null;  // cornerstone image object (dicom)
    var currentFrame = 0;
    var totalFrames = 1;
    var activeTool = 'wl';    // 'wl' | 'pan' | 'zoom'
    var imageSet = [];        // { item, meta } list for the left tree
    var filteredSet = [];
    var libsPromise = null;
    var drag = null;
    var onMove = null;       // window mousemove handler (removed on close)
    var onUp = null;         // window mouseup handler (removed on close)
    var plainEl = null;       // <img>/<video> for non-dicom

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function svgIcon(paths) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('fill', 'none');
        s.setAttribute('stroke', 'currentColor');
        s.setAttribute('stroke-width', '2');
        s.setAttribute('stroke-linecap', 'round');
        s.setAttribute('stroke-linejoin', 'round');
        (paths || []).forEach(function (d) {
            var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            s.appendChild(p);
        });
        return s;
    }

    /* ── lib loading ─────────────────────────────────────────── */
    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src; s.async = true;
            s.onload = resolve; s.onerror = function () { reject(new Error('Failed to load ' + src)); };
            document.head.appendChild(s);
        });
    }
    function ensureLibs() {
        if (libsPromise) return libsPromise;
        libsPromise = Promise.resolve()
            .then(function () { if (!window.dicomParser) return loadScript(DICOMPARSER_URL); })
            .then(function () { if (!window.cornerstone) return loadScript(CORNERSTONE_URL); });
        return libsPromise;
    }

    function toast(msg, ok) {
        if (root) {
            var t = el('div', 'dv-toast' + (ok ? ' ok' : ''), msg);
            root.appendChild(t);
            setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
        } else if (window.pcToast) {
            window.pcToast(String(msg || ''), ok ? 'success' : 'error', 5000);
        } else if (window.sharedShowToast) {
            window.sharedShowToast(String(msg || ''), ok ? 'success' : 'error', 5000);
        }
    }

    /* ── DICOM decode (uncompressed, single/multi-frame) ─────── */
    function parseDicomImage(arrayBuffer, orderId, frameIndex) {
        var dicomParser = window.dicomParser;
        var byteArray = new Uint8Array(arrayBuffer);
        var dataSet = dicomParser.parseDicom(byteArray);
        var px = dataSet.elements.x7fe00010;
        if (!px) throw new Error('DICOM has no pixel data.');
        if (px.encapsulatedPixelData) {
            throw new Error('This DICOM uses a compressed transfer syntax and cannot be decoded here yet.');
        }

        var rows = dataSet.uint16('x00280010') || 0;
        var columns = dataSet.uint16('x00280011') || 0;
        var bitsAllocated = dataSet.uint16('x00280100') || 16;
        var samplesPerPixel = dataSet.uint16('x00280002') || 1;
        var pixelRepresentation = dataSet.uint16('x00280103') || 0; // 0 unsigned, 1 signed
        var photometric = (dataSet.string('x00280004') || '').toUpperCase();
        var numFrames = dataSet.intString('x00280008') || 1;

        if (!rows || !columns) throw new Error('DICOM header is missing rows/columns.');

        var frameSize = rows * columns * samplesPerPixel * (bitsAllocated / 8);
        var frame = Math.max(0, Math.min(frameIndex || 0, numFrames - 1));
        var dataOffset = px.dataOffset;
        if (px.basicOffsetTable && px.basicOffsetTable.length) {
            var base = px.dataOffset + px.basicOffsetTable.length * 4;
            dataOffset = base + (px.basicOffsetTable[frame] || 0);
        } else {
            dataOffset = px.dataOffset + frame * frameSize;
        }

        var color = samplesPerPixel === 3 && (photometric === 'RGB' || photometric === 'YBR_FULL' || photometric === 'YBR_FULL_422');
        var len = rows * columns * samplesPerPixel;
        var view = new DataView(byteArray.buffer, byteArray.byteOffset + dataOffset, frameSize);
        var pixelData, minPixelValue, maxPixelValue;

        if (color) {
            if (photometric !== 'RGB') throw new Error('Only RGB colour DICOM is supported here.');
            var rgb = new Uint8Array(len);
            for (var i = 0; i < len; i++) rgb[i] = view.getUint8(i);
            pixelData = rgb;
            minPixelValue = 0; maxPixelValue = 255;
        } else if (bitsAllocated === 8) {
            var u8 = new Uint8Array(len);
            for (var j = 0; j < len; j++) u8[j] = view.getUint8(j);
            pixelData = u8;
            minPixelValue = 0; maxPixelValue = 255;
        } else {
            var sixteen = pixelRepresentation ? new Int16Array(len) : new Uint16Array(len);
            for (var k = 0; k < len; k++) {
                sixteen[k] = pixelRepresentation ? view.getInt16(k * 2, true) : view.getUint16(k * 2, true);
            }
            pixelData = sixteen;
            if (pixelRepresentation) { minPixelValue = -32768; maxPixelValue = 32767; }
            else { minPixelValue = 0; maxPixelValue = 65535; }
        }

        var slope = dataSet.floatString('x00281053');
        var intercept = dataSet.floatString('x00281052');
        if (slope == null) slope = 1;
        if (intercept == null) intercept = 0;

        var wc = parseFirstFloat(dataSet.string('x00281050'));
        var ww = parseFirstFloat(dataSet.string('x00281051'));
        if (wc == null) wc = (maxPixelValue - minPixelValue) / 2;
        if (ww == null) ww = (maxPixelValue - minPixelValue);

        var rowSpacing = parseFirstFloat(dataSet.string('x00280030'));
        var colSpacing = parseFirstFloat(dataSet.string('x00280009'));

        return {
            imageId: 'pcdicom-' + orderId + '-' + frame,
            minPixelValue: minPixelValue, maxPixelValue: maxPixelValue,
            slope: slope, intercept: intercept,
            windowCenter: wc, windowWidth: ww,
            getPixelData: function () { return pixelData; },
            rows: rows, columns: columns, height: rows, width: columns,
            color: color, rgba: false,
            columnPixelSpacing: colSpacing || 1, rowPixelSpacing: rowSpacing || 1,
            invert: false, sizeInBytes: pixelData.byteLength,
            frame: frame, numFrames: numFrames,
            _parseMeta: function () {
                return {
                    rows: rows, columns: columns, bitsAllocated: bitsAllocated,
                    samplesPerPixel: samplesPerPixel, photometric: photometric,
                    slope: slope, intercept: intercept, numFrames: numFrames
                };
            }
        };
    }
    function parseFirstFloat(str) {
        if (str == null) return null;
        var first = String(str).split('\\')[0].trim();
        if (!first) return null;
        var v = parseFloat(first);
        return isNaN(v) ? null : v;
    }

    /* ── data: fetch media from the common server ────────────── */
    function fetchMedia(order, cb) {
        var listP = window.pcRadioMedia && window.pcRadioMedia.listFor
            ? window.pcRadioMedia.listFor(order.id) : Promise.resolve([]);
        // The URL call is kept separate from the metadata call on purpose: when it
        // fails (function not deployed, signing not permitted, session expired…)
        // the study list must still render and each file must carry the REASON,
        // so the viewer can say what is wrong instead of guessing.
        var urlP = (window.pcRadioMedia && window.pcRadioMedia.urlsFor
            ? Promise.resolve().then(function () { return window.pcRadioMedia.urlsFor(order.id); })
            : Promise.resolve({ items: [] })
        ).then(function (out) { return out || { items: [] }; })
         .catch(function (e) { return { items: [], error: 'sign-call-failed', reason: (e && e.message) || String(e) }; });
        Promise.all([listP, urlP]).then(function (res) {
            var meta = res[0] || [];
            var out = res[1] || {};
            var signed = out.items || [];
            var callProblem = out.error === 'backend-unavailable'
                ? 'The common server is not connected (sign in and wait for Firebase to connect).'
                : (out.error ? String(out.reason || out.error) : '');
            if (out.signing === 'token-fallback' && out.signingProblem && !window.__pcSigningNoteShown) {
                window.__pcSigningNoteShown = true;
                console.warn('[pclinic] radiologyMediaSign is serving download-token links because signed URLs failed: ' + out.signingProblem +
                    ' — grant roles/iam.serviceAccountTokenCreator to the Cloud Functions service account to restore 10-minute links.');
            }
            var byId = {};
            signed.forEach(function (s) { byId[String(s.id)] = s; });
            var set = meta.map(function (m) {
                var hit = byId[String(m.id)] || null;
                var problem = '';
                if (hit && hit.url) problem = '';
                else if (hit && hit.reason) problem = String(hit.reason);
                else if (hit && hit.error) {
                    // Older deployments of radiologyMediaSign return only a bare code.
                    problem = hit.error === 'object-unavailable'
                        ? 'The server could not produce a link for this file (older radiologyMediaSign build: usually the signBlob permission is missing on the Cloud Functions service account). Deploy the updated functions to get the automatic fallback.'
                        : String(hit.error);
                }
                else if (callProblem) problem = callProblem;
                else if (signed.length || out.count === 0) problem = 'The signing service returned no entry for this file — its record may not match its stored object (radiology/' + order.id + '/' + m.id + '.' + (m.ext || '?') + ').';
                else problem = 'The signing service returned nothing for this study.';
                return { meta: m, signed: hit && hit.url ? hit : null, id: String(m.id), problem: problem };
            });
            cb(null, set);
        }).catch(function (e) { cb(e, []); });
    }

    function isDicom(item) {
        var m = item.meta || {};
        var mime = String(m.mime || (item.signed && item.signed.mime) || '').toLowerCase();
        var name = String(m.fileName || m.id || '').toLowerCase();
        return mime === 'application/dicom' || mime.indexOf('dicom') >= 0 || name.slice(-4) === '.dcm';
    }
    function isVideo(item) {
        var m = item.meta || {};
        return String(m.kind) === 'video' || /^video\//.test(String(m.mime || ''));
    }

    /* ── cornerstone display ─────────────────────────────────── */
    function clearCornerstone() {
        // Remove any cornerstone canvas wrapper left in the viewport.
        var center = root.querySelector('.dv-center');
        if (!center) return;
        Array.prototype.forEach.call(center.querySelectorAll('.cornerstone-canvas-wrapper, canvas'), function (n) {
            if (n.parentNode) n.parentNode.removeChild(n);
        });
        if (window.cornerstone && enabledElement) {
            try { window.cornerstone.disable(enabledElement); } catch (e) {}
        }
        enabledElement = null;
        enablePromise = null;
        currentImage = null;
    }
    function clearPlain() {
        if (plainEl && plainEl.parentNode) plainEl.parentNode.removeChild(plainEl);
        plainEl = null;
        clearCornerstone();
        var overlay = root.querySelector('.dv-overlay-msg');
        if (overlay) overlay.remove();
    }
    function showPlain(tag, src) {
        clearPlain();
        var center = root.querySelector('.dv-center');
        plainEl = el(tag, 'dv-plain');
        if (tag === 'img') plainEl.src = src; else { plainEl.src = src; plainEl.controls = true; }
        center.appendChild(plainEl);
        updateStatusPlain();
    }
    function updateStatusPlain() {
        setStatus('Frame', '—');
        setStatus('Zoom', '100%');
        setStatus('Window/Level', '—');
        setStatus('Pixel', '—');
    }

    // Lazily load cornerstone + dicom-parser and enable the viewport element.
    // Called only when a DICOM is actually opened, so the viewer frame itself
    // never depends on the CDN.
    function ensureEnabled() {
        if (enablePromise) return enablePromise;
        var center = root.querySelector('.dv-center');
        enablePromise = ensureLibs().then(function () {
            return window.cornerstone.enable(center);
        }).then(function (e) {
            enabledElement = e;
            return e;
        });
        return enablePromise;
    }

    function displayDicom(item, url) {
        clearPlain();
        var overlay = root.querySelector('.dv-overlay-msg');
        if (overlay) overlay.remove();
        var center = root.querySelector('.dv-center');
        var loading = el('div', 'dv-loading', 'Loading image engine…');
        center.appendChild(loading);

        var gotBuf = fetch(url).then(function (resp) {
            if (!resp.ok) throw new Error('Could not fetch image data (' + resp.status + ').');
            return resp.arrayBuffer();
        });
        var gotEngine = ensureEnabled();

        Promise.all([gotBuf, gotEngine]).then(function (res) {
            if (loading.parentNode) loading.parentNode.removeChild(loading);
            var image = parseDicomImage(res[0], (currentOrder && currentOrder.id) || 'study', 0);
            currentImage = image;
            totalFrames = image.numFrames || 1; currentFrame = 0;
            return window.cornerstone.displayImage(enabledElement, image);
        }).then(function () {
            updateStatus();
        }).catch(function (e) {
            if (loading.parentNode) loading.parentNode.removeChild(loading);
            showOverlayMessage('Could not display this image\n' + e.message);
        });
    }

    function displayItem(item) {
        currentItem = item;
        currentImage = null;
        var url = item.signed && item.signed.url;
        if (!url) {
            clearPlain();
            showOverlayMessage('This file is registered but cannot be displayed.\n' +
                (item.problem || 'The signing service returned no URL for it.') +
                '\n\nFile: ' + String((item.meta && item.meta.fileName) || item.id));
            markActive(item.id);
            renderMeta(item);
            return;
        }
        if (isDicom(item)) { displayDicom(item, url); }
        else if (isVideo(item)) { showPlain('video', url); }
        else { showPlain('img', url); }
        markActive(item.id);
        renderMeta(item);
    }

    function showOverlayMessage(text) {
        var center = root.querySelector('.dv-center');
        var existing = center.querySelector('.dv-overlay-msg');
        if (!existing) {
            existing = el('div', 'dv-overlay-msg');
            center.appendChild(existing);
        }
        existing.textContent = text;
        updateStatusPlain();
    }

    function renderMeta(item) {
        var box = root.querySelector('.dv-meta');
        box.replaceChildren();
        var m = item.meta || {};
        var rows = [
            ['File', String(m.fileName || m.id || '')],
            ['Type', isDicom(item) ? 'DICOM' : (isVideo(item) ? 'Video' : 'Image')],
            ['Size', ((Number(m.bytes) || 0) / 1048576).toFixed(2) + ' MB'],
            ['MIME', String(m.mime || '')],
            ['Uploaded', m.at ? new Date(m.at).toLocaleString('en-GB') : '—'],
            ['By', String(m.byName || '')]
        ];
        rows.forEach(function (r) {
            var row = el('div', 'dv-row');
            row.appendChild(el('span', 'k', r[0]));
            row.appendChild(el('span', 'v', r[1]));
            box.appendChild(row);
        });
        if (currentImage && currentImage._parseMeta) {
            var mm = currentImage._parseMeta();
            [['Dimensions', mm.columns + ' × ' + mm.rows],
             ['Bits', String(mm.bitsAllocated)],
             ['Photometric', mm.photometric],
             ['Frames', String(mm.numFrames)]].forEach(function (r) {
                var row = el('div', 'dv-row');
                row.appendChild(el('span', 'k', r[0]));
                row.appendChild(el('span', 'v', r[1]));
                box.appendChild(row);
            });
        }
    }

    /* ── left tree ──────────────────────────────────────────── */
    // Weasis-style explorer: the patient, then EVERY study passed in
    // openOpts.studies (the current one expanded with its images), so the
    // radiographer can move between the patient's studies without leaving
    // the viewer. A single study (the old callers) renders exactly as before.
    function studyLabel(o) {
        var name = (o && (o.study || o.id)) || 'Study';
        var state = o && o.state ? String(o.state).replace('-', ' ') : '';
        return state ? name + ' · ' + state : name;
    }
    function switchStudy(order) {
        if (!order || !currentOrder || String(order.id) === String(currentOrder.id)) return;
        clearPlain();
        currentOrder = order;
        currentItem = null; imageSet = []; filteredSet = [];
        var meta = root.querySelector('.dv-meta'); if (meta) meta.replaceChildren();
        showOverlayMessage('Loading study images…');
        renderTree();
        reload();
    }
    function renderTree() {
        var tree = root.querySelector('.dv-tree');
        tree.replaceChildren();
        var patient = (currentOrder && currentOrder.patientName) || 'Patient';
        var pNode = el('div', 'dv-node patient', patient);
        tree.appendChild(pNode);
        var studies = (openOpts && Array.isArray(openOpts.studies) && openOpts.studies.length) ? openOpts.studies : [];
        var hasCurrent = currentOrder && currentOrder.id;
        if (!hasCurrent && !studies.length) {
            tree.appendChild(el('div', 'dv-empty', 'No imaging study for this patient yet. Images can be attached once a clinician has placed an imaging request.'));
            return;
        }
        // Other studies of the same patient, selectable.
        studies.forEach(function (o) {
            if (hasCurrent && String(o.id) === String(currentOrder.id)) return;
            var n = el('div', 'dv-node study dv-study-pick', studyLabel(o));
            n.setAttribute('data-study-id', String(o.id));
            n.title = 'Open this study';
            n.style.cursor = 'pointer';
            n.onclick = function () { switchStudy(o); };
            tree.appendChild(n);
        });
        if (!hasCurrent) return;
        var sNode = el('div', 'dv-node study active-study', studyLabel(currentOrder));
        sNode.style.color = 'var(--dv-tx)';
        sNode.style.fontWeight = '600';
        tree.appendChild(sNode);
        if (!filteredSet.length) {
            tree.appendChild(el('div', 'dv-empty', 'No images attached to this study.'));
            return;
        }
        filteredSet.forEach(function (item) {
            var m = item.meta || {};
            var node = el('div', 'dv-node series');
            node.setAttribute('data-id', item.id);
            var thumb = el('div', 'dv-thumb');
            if (item.signed && item.signed.url && !isDicom(item) && !isVideo(item)) {
                thumb.style.backgroundImage = 'url("' + item.signed.url + '")';
            } else if (isDicom(item)) { thumb.textContent = 'DCM'; }
            else if (isVideo(item)) { thumb.textContent = '▶'; }
            node.appendChild(thumb);
            node.appendChild(el('div', 'dv-series-name', String(m.fileName || m.id)));
            node.onclick = function () { displayItem(item); };
            tree.appendChild(node);
        });
    }

    function applyFilters() {
        var q = root.querySelector('#dv-search-patient').value.trim().toLowerCase();
        filteredSet = imageSet.filter(function (item) {
            var m = item.meta || {};
            var hay = String((currentOrder && currentOrder.patientName) || '') + ' ' + String(m.fileName || m.id || '');
            return !q || hay.toLowerCase().indexOf(q) >= 0;
        });
        renderTree();
    }

    function markActive(id) {
        Array.prototype.forEach.call(root.querySelectorAll('.dv-node.series'), function (n) {
            n.classList.toggle('active', n.getAttribute('data-id') === String(id));
        });
    }

    /* ── status bar ─────────────────────────────────────────── */
    function setStatus(key, value) {
        var slot = root.querySelector('[data-status="' + key + '"]');
        if (slot) slot.textContent = value;
    }
    function updateStatus() {
        if (currentImage && window.cornerstone && enabledElement) {
            var vp = window.cornerstone.getViewport(enabledElement);
            setStatus('Frame', (currentFrame + 1) + '/' + totalFrames);
            setStatus('Zoom', Math.round((vp.scale || 1) * 100) + '%');
            setStatus('Window/Level', Math.round(vp.voi.windowWidth) + '/' + Math.round(vp.voi.windowCenter * 10) / 10);
        }
    }
    function updatePixel(event) {
        if (!currentImage || !window.cornerstone || !enabledElement) return;
        var rect = enabledElement.getBoundingClientRect();
        var x = event.clientX - rect.left, y = event.clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
            setStatus('Pixel', 'No value - Outside image');
            return;
        }
        try {
            var px = window.cornerstone.getPixels(enabledElement, x, y);
            if (!px || px.length < 1) { setStatus('Pixel', 'No value - Outside image'); return; }
            setStatus('Pixel', px[0]);
        } catch (e) { setStatus('Pixel', 'No value - Outside image'); }
    }

    /* ── mouse tools ────────────────────────────────────────── */
    function setTool(t) {
        activeTool = t;
        Array.prototype.forEach.call(root.querySelectorAll('[data-tool]'), function (b) {
            b.classList.toggle('active', b.getAttribute('data-tool') === t);
        });
        if (centerEl) centerEl.style.cursor = t === 'wl' ? 'crosshair' : (t === 'pan' ? 'grab' : 'ns-resize');
    }
    function bindTools(target) {
        centerEl = target;
        target.addEventListener('mousedown', function (e) {
            if (!currentImage && !plainEl) return;
            drag = { x: e.clientX, y: e.clientY, button: e.button, vp: null };
            if (currentImage && window.cornerstone) drag.vp = window.cornerstone.getViewport(enabledElement);
        });
        onMove = function (e) {
            if (!root) return;
            updatePixel(e);
            if (!drag) return;
            var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            if (currentImage && window.cornerstone) {
                var vp = window.cornerstone.getViewport(enabledElement);
                if (activeTool === 'wl' && drag.button === 0) {
                    vp.voi.windowWidth = Math.max(1, (drag.vp.voi.windowWidth || 1) + dy);
                    vp.voi.windowCenter = (drag.vp.voi.windowCenter || 0) + dx;
                } else if (activeTool === 'pan' || drag.button === 1 || drag.button === 2) {
                    vp.translation.x = (drag.vp.translation.x || 0) + dx;
                    vp.translation.y = (drag.vp.translation.y || 0) + dy;
                } else if (activeTool === 'zoom' && drag.button === 0) {
                    vp.scale = Math.max(0.1, Math.min(20, (drag.vp.scale || 1) * (1 + dy / 200)));
                }
                window.cornerstone.setViewport(enabledElement, vp);
            } else if (plainEl) {
                var s = parseFloat(plainEl.dataset.scale) || 1;
                plainEl.dataset.tx = ((parseFloat(plainEl.dataset.tx) || 0) + dx) + 'px';
                plainEl.dataset.ty = ((parseFloat(plainEl.dataset.ty) || 0) + dy) + 'px';
                applyPlainTransform(plainEl, s);
            }
            updateStatus();
        };
        onUp = function () { drag = null; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        target.addEventListener('wheel', function (e) {
            e.preventDefault();
            if (currentImage && window.cornerstone) {
                var vp = window.cornerstone.getViewport(enabledElement);
                var f = e.deltaY < 0 ? 1.1 : 0.9;
                vp.scale = Math.max(0.1, Math.min(20, (vp.scale || 1) * f));
                window.cornerstone.setViewport(enabledElement, vp);
            } else if (plainEl) {
                var s = (parseFloat(plainEl.dataset.scale) || 1) * (e.deltaY < 0 ? 1.1 : 0.9);
                s = Math.max(0.2, Math.min(10, s));
                plainEl.dataset.scale = s;
                applyPlainTransform(plainEl, s);
            }
            updateStatus();
        }, { passive: false });
    }
    function applyPlainTransform(img, s) {
        img.style.transform = 'translate(' + (parseFloat(img.dataset.tx) || 0) + 'px,' +
            (parseFloat(img.dataset.ty) || 0) + 'px) scale(' + s + ')';
    }

    /* ── toolbar actions ────────────────────────────────────── */
    function doReset() {
        if (currentImage) { window.cornerstone.reset(enabledElement); updateStatus(); }
        else if (plainEl) { plainEl.style.transform = ''; plainEl.dataset.scale = 1; }
    }
    function doInvert() {
        if (!currentImage) return;
        var vp = window.cornerstone.getViewport(enabledElement);
        vp.invert = !vp.invert;
        window.cornerstone.setViewport(enabledElement, vp);
    }
    function doRotate() {
        if (!currentImage) return;
        var vp = window.cornerstone.getViewport(enabledElement);
        vp.rotation = ((vp.rotation || 0) + 90) % 360;
        window.cornerstone.setViewport(enabledElement, vp);
    }
    function doFlip() {
        if (!currentImage) return;
        var vp = window.cornerstone.getViewport(enabledElement);
        vp.hflip = !vp.hflip;
        window.cornerstone.setViewport(enabledElement, vp);
    }
    function stepFrame(delta) {
        if (!currentImage || totalFrames <= 1) { toast('This is a single-frame image.'); return; }
        var next = Math.max(0, Math.min(totalFrames - 1, currentFrame + delta));
        if (next === currentFrame) return;
        currentFrame = next;
        // re-parse the same item at the new frame index
        var item = currentItem;
        ensureEnabled().then(function () {
            return fetch(item.signed.url).then(function (r) { return r.arrayBuffer(); });
        }).then(function (buf) {
            currentImage = parseDicomImage(buf, (currentOrder && currentOrder.id) || 'study', currentFrame);
            return window.cornerstone.displayImage(enabledElement, currentImage);
        }).then(function () { updateStatus(); }).catch(function (e) { toast(e.message); });
    }
    function doFit() { doReset(); }

    function zoomBy(delta) {
        if (!currentImage) return;
        var vp = window.cornerstone.getViewport(enabledElement);
        vp.scale = Math.max(0.1, Math.min(20, (vp.scale || 1) + delta));
        window.cornerstone.setViewport(enabledElement, vp);
        updateStatus();
    }

    /* ── upload (radio / entry mode) ────────────────────────── */
    function doUpload() {
        if (!currentOrder || !currentOrder.id) {
            toast('No imaging study to attach images to — a clinician must place an imaging request for this patient first.');
            return;
        }
        var input = el('input');
        input.type = 'file'; input.multiple = true;
        input.accept = (window.pcRadioMedia && window.pcRadioMedia.ACCEPT ? window.pcRadioMedia.ACCEPT : '') + ',.dcm,application/dicom';
        input.style.display = 'none';
        root.appendChild(input);
        input.onchange = function () {
            var files = Array.prototype.slice.call(input.files || []);
            input.remove();
            if (!files.length) return;
            if (!window.pcRadioMedia) { toast('The media module did not load.'); return; }
            var ok = 0, problems = [];
            var run = Promise.resolve();
            files.forEach(function (file) {
                run = run.then(function () {
                    return window.pcRadioMedia.upload(currentOrder, file).then(function () { ok++; })
                        .catch(function (e) { problems.push((file.name || 'file') + ': ' + (e && e.message)); });
                });
            });
            run.then(function () {
                if (ok) toast(ok + ' file(s) attached.', true);
                if (problems.length) toast('⚠️ ' + problems.join(' · '));
                reload();
            });
        };
        input.click();
    }

    /* ── build / open ───────────────────────────────────────── */
    var currentOrder = null;
    var openOpts = null;

    function buildUI() {
        root = el('div');
        root.id = 'pcdv-root';

        // top bar
        var top = el('div', 'dv-top');
        var title = el('div', 'dv-title');
        title.appendChild(el('span', 'dv-logo', 'P'));
        title.appendChild(document.createTextNode('PClinic DICOM Viewer'));
        top.appendChild(title);
        top.appendChild(el('span', 'dv-sub', 'Radiology imaging'));
        top.appendChild(el('span', 'dv-sep'));
        top.appendChild(tool('wl', 'Window/Level', setTool, svgIcon(['M12 3v18', 'M3 12h18'])));
        top.appendChild(tool('pan', 'Pan', setTool, svgIcon(['M12 19l7-7-7-7', 'M5 12h14'])));
        top.appendChild(tool('zoom', 'Zoom', setTool, svgIcon(['M11 3a8 8 0 100 16 8 8 0 000-16z', 'M21 21l-4.35-4.35'])));
        top.appendChild(el('span', 'dv-sep'));
        top.appendChild(toolBtn('Zoom in', function () { zoomBy(0.2); }, svgIcon(['M11 3a8 8 0 100 16 8 8 0 000-16z', 'M8 11h6', 'M11 8v6'])));
        top.appendChild(toolBtn('Zoom out', function () { zoomBy(-0.2); }, svgIcon(['M11 3a8 8 0 100 16 8 8 0 000-16z', 'M8 11h6'])));
        top.appendChild(toolBtn('Fit', doFit, svgIcon(['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'])));
        top.appendChild(el('span', 'dv-sep'));
        top.appendChild(toolBtn('Rotate', doRotate, svgIcon(['M3 12a9 9 0 109-9', 'M3 3v6h6'])));
        top.appendChild(toolBtn('Flip', doFlip, svgIcon(['M4 3h16v18H4z', 'M4 12h16'])));
        top.appendChild(toolBtn('Invert', doInvert, svgIcon(['M12 3a9 9 0 100 18 9 9 0 000-18z'])));
        top.appendChild(el('span', 'dv-sep'));
        top.appendChild(toolBtn('Prev', function () { stepFrame(-1); }, svgIcon(['M15 18l-6-6 6-6'])));
        top.appendChild(toolBtn('Next', function () { stepFrame(1); }, svgIcon(['M9 18l6-6-6-6'])));
        top.appendChild(el('span', 'dv-sep'));
        top.appendChild(toolBtn('Reset', doReset, svgIcon(['M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8', 'M3 3v5h5'])));
        top.appendChild(el('span', 'dv-spacer'));
        if (openOpts && openOpts.canManage) {
            top.appendChild(tool('upload', 'Upload', null, svgIcon(['M12 3v12', 'M7 10l5-5 5 5', 'M5 21h14'])));
            top.querySelector('[data-tool="upload"]').classList.add('primary');
            top.querySelector('[data-tool="upload"]').onclick = doUpload;
        }
        top.appendChild(toolBtn('Close', close, svgIcon(['M18 6L6 18', 'M6 6l12 12'])));
        root.appendChild(top);

        // main
        var main = el('div', 'dv-main');
        var left = el('div', 'dv-left');
        left.appendChild(el('div', 'dv-panel-title', 'DICOM Explorer'));
        var search = el('div', 'dv-search');
        var s1 = el('div', 'dv-sbox');
        s1.appendChild(svgIcon(['M11 3a8 8 0 100 16 8 8 0 000-16z', 'M21 21l-4.35-4.35']));
        var inp1 = el('input'); inp1.id = 'dv-search-patient'; inp1.placeholder = 'Search patient…';
        s1.appendChild(inp1); search.appendChild(s1);
        var s2 = el('div', 'dv-sbox');
        s2.appendChild(svgIcon(['M11 3a8 8 0 100 16 8 8 0 000-16z', 'M21 21l-4.35-4.35']));
        var inp2 = el('input'); inp2.placeholder = 'Search tags…';
        s2.appendChild(inp2); search.appendChild(s2);
        left.appendChild(search);
        left.appendChild(el('div', 'dv-tree'));
        main.appendChild(left);

        var center = el('div', 'dv-center');
        center.appendChild(el('div', 'dv-overlay-msg', 'Loading study images…'));
        main.appendChild(center);

        var right = el('div', 'dv-right');
        right.appendChild(el('div', 'dv-panel-title', 'Study Info'));
        right.appendChild(el('div', 'dv-meta'));
        main.appendChild(right);

        root.appendChild(main);

        // bottom status bar
        var bottom = el('div', 'dv-bottom');
        var addStatus = function (label, id) {
            var span = el('span');
            span.appendChild(document.createTextNode(label + ': '));
            var b = el('b', null, '—');
            b.setAttribute('data-status', id);
            span.appendChild(b);
            bottom.appendChild(span);
            return b;
        };
        addStatus('Frame', 'Frame');
        addStatus('Zoom', 'Zoom');
        addStatus('Window/Level', 'Window/Level');
        addStatus('Pixel', 'Pixel');
        root.appendChild(bottom);

        document.body.appendChild(root);

        inp1.addEventListener('input', applyFilters);

        // Bind mouse tools to the center element right away (works for plain
        // images/video too). Cornerstone is enabled lazily in displayDicom().
        bindTools(center);
    }

    function tool(key, label, handler, icon) {
        var b = el('button', 'dv-tool');
        b.setAttribute('data-tool', key);
        b.appendChild(icon);
        b.appendChild(el('span', null, label));
        if (handler) b.onclick = function () { handler(key); };
        return b;
    }
    function toolBtn(label, handler, icon) {
        var b = el('button', 'dv-tool');
        b.appendChild(icon);
        b.appendChild(el('span', null, label));
        b.onclick = handler;
        return b;
    }

    function reload() {
        if (!currentOrder || !currentOrder.id) {
            // Patient-only open: the frame is up, there is just nothing to fetch.
            imageSet = []; filteredSet = [];
            renderTree();
            showOverlayMessage('No imaging study for this patient yet.\nImages can be attached once a clinician has placed an imaging request.');
            return;
        }
        fetchMedia(currentOrder, function (err, set) {
            if (err) { toast('Could not load images: ' + err.message); showOverlayMessage('Could not load study images\n' + err.message); return; }
            imageSet = set;
            applyFilters();
            var overlay = root.querySelector('.dv-overlay-msg');
            if (!set.length) {
                if (overlay) overlay.textContent = 'No images attached to this study yet.';
            } else {
                if (overlay) overlay.remove();
                displayItem(set[0]);
            }
        });
    }

    function close() {
        if (window.cornerstone && enabledElement) { try { window.cornerstone.disable(enabledElement); } catch (e) {} }
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null; enabledElement = null; enablePromise = null; currentImage = null; currentItem = null; plainEl = null; drag = null;
        window.removeEventListener('keydown', onKey);
        if (onMove) window.removeEventListener('mousemove', onMove);
        if (onUp) window.removeEventListener('mouseup', onUp);
        onMove = null; onUp = null;
    }
    function onKey(e) {
        if (e.key === 'Escape') close();
    }

    function open(order, opts) {
        if (root) close();
        currentOrder = order || {};
        openOpts = opts || {};
        imageSet = []; filteredSet = []; currentFrame = 0; totalFrames = 1;
        // Build the UI immediately — the dark viewer frame must appear the
        // instant the button is clicked, with no wait on the CDN imaging
        // libraries. Those load lazily only when a DICOM is actually opened.
        buildUI();
        window.addEventListener('keydown', onKey);
        reload();
    }

    window.PcDicomViewer = { open: open, close: close, isOpen: function () { return !!root; }, parseDicomImage: parseDicomImage, preload: function () { return ensureLibs().catch(function () {}); } };

    // Preload the imaging libraries in the background as soon as this script
    // loads, so the first "Add radiology result" click opens the viewer
    // immediately instead of waiting on the CDN fetch then.
    ensureLibs().catch(function () {});
})();
