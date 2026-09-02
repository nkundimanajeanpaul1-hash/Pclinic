/* ═══════════════════════════════════════════════════════════════════
   PClinic DICOM Workstation  (pclinic-dicom-viewer.js)

   A Weasis-style viewer for study images on the common server:
     • left  : DICOM Explorer (patient → study → files, search patient, search tags)
     • top   : tool bar (W/L, pan, zoom, layout, sync, measure, rotate, invert,
               presets, cine, export, upload…)
     • centre: 1–4 viewports (cornerstone), corner overlays, scale bar,
               orientation letters, cine bar
     • right : vertical tabs → Display · Image Tools · Draw & Measure · Study info · Report

   Two ways to use it (same code, same look):
     PcDicomViewer.open(order, opts)      modal over a dashboard (radiology)
     PcDicomViewer.mount(hostEl, opts)    full page (doctor: imaging-results.html)

   Data (all from the common server, nothing stored on the device):
     files     window.pcRadioMedia.listFor(orderId)   (Firestore radiologyMedia)
     pixels    window.pcRadioMedia.urlsFor(orderId)   (radiologyMediaSign → URL)
               window.pcRadioMedia.localUrlFor(id)    (this session's own upload)
     studies   opts.studies || window.pcRadiology.snapshot().orders for the patient
     report    window.pcRadiology.reportForOrder / addendaForReport / alertForReport
     upload    window.pcRadioMedia.upload / remove     (opts.canManage only)

   Decoding: cornerstone + cornerstoneWADOImageLoader, self-hosted in vendor/
   (uncompressed, RLE, JPEG baseline, JPEG-LS, JPEG 2000, HTJ2K, multi-frame).
   PNG/JPEG/WebP go through a small colour image loader so every tool works on
   them too. MP4/WebM play in a <video> element.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    /* ── configuration ─────────────────────────────────────────── */
    var OWN_SRC = (function () { try { return (document.currentScript && document.currentScript.src) || ''; } catch (e) { return ''; } })();
    var VENDOR = (OWN_SRC ? OWN_SRC.replace(/[^\/]*$/, '') : '') + 'vendor/';
    var VTAG = (function () { var m = /[?&]v=([^&]+)/.exec(OWN_SRC); return m ? '?v=' + m[1] : ''; })();
    var LIBS = ['hammer.min.js', 'cornerstone.min.js', 'cornerstoneMath.min.js', 'dicomParser.min.js', 'cornerstoneWADOImageLoader.bundle.min.js', 'cornerstoneTools.min.js'];

    var MEASURE_TOOLS = ['Length', 'Angle', 'CobbAngle', 'RectangleRoi', 'EllipticalRoi', 'FreehandRoi', 'Bidirectional', 'Probe', 'ArrowAnnotate'];
    var LEFT_TOOLS = { wl: 'Wwwc', wlregion: 'WwwcRegion', pan: 'Pan', zoom: 'Zoom', magnify: 'Magnify', rotate: 'Rotate', length: 'Length', angle: 'Angle', cobb: 'CobbAngle', rect: 'RectangleRoi', ellipse: 'EllipticalRoi', freehand: 'FreehandRoi', bidir: 'Bidirectional', probe: 'Probe', arrow: 'ArrowAnnotate', eraser: 'Eraser', scroll: 'StackScroll' };
    var TOOL_LABEL = { Wwwc: 'Window/Level', WwwcRegion: 'W/L region', Pan: 'Pan', Zoom: 'Zoom', Magnify: 'Magnify', Rotate: 'Rotate', Length: 'Ruler', Angle: 'Angle', CobbAngle: 'Cobb angle', RectangleRoi: 'Rectangle ROI', EllipticalRoi: 'Ellipse ROI', FreehandRoi: 'Freehand ROI', Bidirectional: 'Bidirectional', Probe: 'Probe', ArrowAnnotate: 'Arrow / text', Eraser: 'Eraser', StackScroll: 'Scroll' };

    var PRESETS = {
        CT: [['Brain', 80, 40], ['Subdural', 300, 100], ['Stroke', 40, 40], ['Soft tissue', 400, 40], ['Abdomen', 350, 50], ['Liver', 150, 30], ['Lung', 1500, -600], ['Mediastinum', 350, 50], ['Bone', 2500, 480], ['Spine', 1800, 400]],
        MR: [['Default', null, null], ['T1 brain', 600, 300], ['T2 brain', 1200, 600]],
        PT: [['PET', 5, 2.5], ['PET wide', 10, 5]],
        default: [['Default', null, null], ['Full range', 'full', 'full'], ['Bone (CR)', 2500, 1500], ['Soft (CR)', 1200, 600]]
    };
    var COLORMAPS = [['gray', 'Grey'], ['hotIron', 'Hot iron'], ['hot', 'Hot'], ['cool', 'Cool'], ['jet', 'Jet'], ['bone', 'Bone'], ['pet', 'PET'], ['spectral', 'Spectral']];

    // Compact DICOM dictionary for the tag browser (common attributes).
    var DICT = {
        x00020002: 'Media Storage SOP Class UID', x00020003: 'Media Storage SOP Instance UID', x00020010: 'Transfer Syntax UID', x00020012: 'Implementation Class UID', x00020013: 'Implementation Version Name',
        x00080005: 'Specific Character Set', x00080008: 'Image Type', x00080016: 'SOP Class UID', x00080018: 'SOP Instance UID', x00080020: 'Study Date', x00080021: 'Series Date', x00080022: 'Acquisition Date', x00080023: 'Content Date', x00080030: 'Study Time', x00080031: 'Series Time', x00080032: 'Acquisition Time', x00080033: 'Content Time', x00080050: 'Accession Number', x00080060: 'Modality', x00080064: 'Conversion Type', x00080070: 'Manufacturer', x00080080: 'Institution Name', x00080081: 'Institution Address', x00080090: 'Referring Physician', x00081010: 'Station Name', x00081030: 'Study Description', x0008103e: 'Series Description', x00081040: 'Institutional Department', x00081050: 'Performing Physician', x00081060: 'Reading Physician', x00081070: 'Operator', x00081090: 'Manufacturer Model', x00082111: 'Derivation Description',
        x00100010: 'Patient Name', x00100020: 'Patient ID', x00100030: 'Patient Birth Date', x00100040: 'Patient Sex', x00101010: 'Patient Age', x00101020: 'Patient Size', x00101030: 'Patient Weight', x00102000: 'Medical Alerts', x00102110: 'Allergies', x00104000: 'Patient Comments',
        x00180010: 'Contrast/Bolus Agent', x00180015: 'Body Part Examined', x00180050: 'Slice Thickness', x00180060: 'KVP', x00180088: 'Spacing Between Slices', x00181000: 'Device Serial Number', x00181020: 'Software Versions', x00181030: 'Protocol Name', x00181150: 'Exposure Time', x00181151: 'X-Ray Tube Current', x00181152: 'Exposure', x00181164: 'Imager Pixel Spacing', x00181405: 'Relative X-Ray Exposure', x00185100: 'Patient Position', x00185101: 'View Position',
        x0020000d: 'Study Instance UID', x0020000e: 'Series Instance UID', x00200010: 'Study ID', x00200011: 'Series Number', x00200012: 'Acquisition Number', x00200013: 'Instance Number', x00200020: 'Patient Orientation', x00200032: 'Image Position (Patient)', x00200037: 'Image Orientation (Patient)', x00200052: 'Frame of Reference UID', x00200060: 'Laterality', x00201041: 'Slice Location', x00204000: 'Image Comments',
        x00280002: 'Samples per Pixel', x00280004: 'Photometric Interpretation', x00280006: 'Planar Configuration', x00280008: 'Number of Frames', x00280010: 'Rows', x00280011: 'Columns', x00280030: 'Pixel Spacing', x00280034: 'Pixel Aspect Ratio', x00280100: 'Bits Allocated', x00280101: 'Bits Stored', x00280102: 'High Bit', x00280103: 'Pixel Representation', x00280106: 'Smallest Pixel Value', x00280107: 'Largest Pixel Value', x00281050: 'Window Center', x00281051: 'Window Width', x00281052: 'Rescale Intercept', x00281053: 'Rescale Slope', x00281054: 'Rescale Type', x00281055: 'Window Explanation', x00282110: 'Lossy Image Compression', x00282112: 'Lossy Compression Ratio', x00282114: 'Lossy Compression Method',
        x00321060: 'Requested Procedure Description', x00400244: 'Performed Procedure Start Date', x00400254: 'Performed Procedure Description', x7fe00010: 'Pixel Data'
    };

    /* ── small helpers ─────────────────────────────────────────── */
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function svg(paths, extra) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24');
        (paths || []).forEach(function (d) { var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); });
        (extra || []).forEach(function (e) { var n = document.createElementNS('http://www.w3.org/2000/svg', e[0]); Object.keys(e[1]).forEach(function (k) { n.setAttribute(k, e[1][k]); }); s.appendChild(n); });
        return s;
    }
    var ICON = {
        explorer: [['M4 5h16v14H4z'], [['path', { d: 'M9 5v14' }]]], upload: [['M12 16V4', 'M7 9l5-5 5 5', 'M5 20h14']], download: [['M12 4v12', 'M7 11l5 5 5-5', 'M5 20h14']],
        wl: [['M12 3a9 9 0 1 0 0 18V3z'], [['circle', { cx: 12, cy: 12, r: 9 }]]], pan: [['M12 3v18', 'M3 12h18', 'M9 6l3-3 3 3', 'M9 18l3 3 3-3', 'M6 9l-3 3 3 3', 'M18 9l3 3-3 3']],
        zoom: [['M21 21l-5.2-5.2', 'M11 8v6', 'M8 11h6'], [['circle', { cx: 11, cy: 11, r: 7 }]]], zoomin: [['M21 21l-5.2-5.2', 'M11 8v6', 'M8 11h6'], [['circle', { cx: 11, cy: 11, r: 7 }]]], zoomout: [['M21 21l-5.2-5.2', 'M8 11h6'], [['circle', { cx: 11, cy: 11, r: 7 }]]],
        fit: [['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5']], layout: [['M4 4h16v16H4z', 'M12 4v16', 'M4 12h16']], sync: [['M4 12a8 8 0 0 1 14-5', 'M18 3v4h-4', 'M20 12a8 8 0 0 1-14 5', 'M6 21v-4h4']],
        reset: [['M4 12a8 8 0 1 0 2.3-5.7', 'M4 4v5h5']], ruler: [['M3 17L17 3l4 4L7 21z', 'M7 13l2 2', 'M10 10l2 2', 'M13 7l2 2']], angle: [['M4 20L20 4', 'M4 20h16', 'M12 20a8 8 0 0 0-2.3-5.7']],
        roi: [['M4 4h16v16H4z']], ellipse: [[], [['ellipse', { cx: 12, cy: 12, rx: 9, ry: 6 }]]], freehand: [['M4 14c2-8 6-8 8-3s6 4 8-4']], bidir: [['M3 12h18', 'M12 3v18', 'M6 9l-3 3 3 3', 'M18 9l3 3-3 3']],
        probe: [['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4'], [['circle', { cx: 12, cy: 12, r: 3 }]]], arrow: [['M4 20L20 4', 'M11 4h9v9']], text: [['M5 6h14', 'M12 6v13']], eraser: [['M7 21h12', 'M5 15l9-9 5 5-6 6H8z']],
        trash: [['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3']], magnify: [['M21 21l-4.8-4.8'], [['circle', { cx: 10.5, cy: 10.5, r: 6.5 }], ['circle', { cx: 10.5, cy: 10.5, r: 2.5 }]]],
        rotate: [['M20 12a8 8 0 1 1-2.3-5.7', 'M20 4v5h-5']], flip: [['M12 3v18', 'M5 7l4 5-4 5V7z', 'M19 7l-4 5 4 5V7z']], invert: [['M12 3a9 9 0 0 1 0 18z'], [['circle', { cx: 12, cy: 12, r: 9 }]]],
        presets: [['M4 6h16', 'M4 12h10', 'M4 18h6'], [['circle', { cx: 18, cy: 12, r: 2 }], ['circle', { cx: 14, cy: 18, r: 2 }]]], cine: [['M8 5v14l11-7z']], prev: [['M15 6l-6 6 6 6']], next: [['M9 6l6 6-6 6']],
        full: [['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5', 'M4 4l6 6', 'M20 4l-6 6', 'M4 20l6-6', 'M20 20l-6-6']], close: [['M6 6l12 12', 'M18 6L6 18']], search: [['M21 21l-5.2-5.2'], [['circle', { cx: 11, cy: 11, r: 7 }]]],
        display: [['M4 5h16v11H4z', 'M9 20h6', 'M12 16v4']], tools: [['M14 7l3 3', 'M4 20l7-7', 'M14 4l6 6-8 8-6-6z']], draw: [['M4 20l4-1 11-11-3-3L5 16z', 'M13 7l3 3']], info: [['M12 8h.01', 'M12 11v6'], [['circle', { cx: 12, cy: 12, r: 9 }]]], report: [['M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 12h6', 'M9 16h6']],
        camera: [['M4 8h4l2-3h4l2 3h4v11H4z'], [['circle', { cx: 12, cy: 13, r: 3.5 }]]], print: [['M6 9V3h12v6', 'M6 18H4v-9h16v9h-2', 'M6 14h12v7H6z']], key: [['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z']]
    };
    function icon(name) { var d = ICON[name] || ICON.info; return svg(d[0], d[1]); }
    function fmtDate(v) { if (!v) return ''; var d = (typeof v === 'object' && v.seconds) ? new Date(v.seconds * 1000) : new Date(v); if (isNaN(d)) return String(v); return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    function fmtDateTime(v) { if (!v) return '—'; var d = (typeof v === 'object' && v.seconds) ? new Date(v.seconds * 1000) : new Date(v); if (isNaN(d)) return String(v); return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    function dcmDate(s) { s = String(s || '').trim(); return /^\d{8}$/.test(s) ? s.slice(6, 8) + '/' + s.slice(4, 6) + '/' + s.slice(0, 4) : s; }
    function dcmTime(s) { s = String(s || '').trim(); return /^\d{4}/.test(s) ? s.slice(0, 2) + ':' + s.slice(2, 4) : s; }
    function dcmName(s) { return String(s || '').replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function nameOf(p) { if (!p) return ''; return String(p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || ('Patient ' + (p.mrn || p.id || ''))).trim(); }
    function ageOf(dob) { if (!dob) return ''; var d = new Date(dob); if (isNaN(d)) return ''; var n = new Date(); var a = n.getFullYear() - d.getFullYear(); var m = n.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--; return (a >= 0 && a < 130) ? a + 'y' : ''; }
    function sexOf(p) { var g = String((p && (p.gender || p.sex)) || '').trim().toUpperCase(); return g ? g[0] : ''; }
    function bytesOf(n) { n = Number(n) || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B'; }
    function studyLabel(s) { return String((s && (s.study || s.name)) || 'Imaging study'); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function firstFloat(s) { var m = /-?\d+(\.\d+)?/.exec(String(s || '')); return m ? parseFloat(m[0]) : null; }
    function niceStep(maxLen, unitsPerPx) { var cands = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000]; var best = cands[0]; for (var i = 0; i < cands.length; i++) { if (cands[i] / unitsPerPx <= maxLen) best = cands[i]; } return best; }

    /* ── library loading (vendor/, no CDN) ─────────────────────── */
    var libsPromise = null;
    function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.async = false; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('Could not load ' + src.split('/').pop())); }; document.head.appendChild(s); }); }
    function ensureLibs() {
        if (libsPromise) return libsPromise;
        libsPromise = LIBS.reduce(function (p, name) { return p.then(function () { return loadScript(VENDOR + name + VTAG); }); }, Promise.resolve()).then(function () {
            var cs = window.cornerstone, cst = window.cornerstoneTools, wado = window.cornerstoneWADOImageLoader;
            if (!cs || !cst || !wado || !window.dicomParser) throw new Error('Imaging libraries did not initialise.');
            wado.external.cornerstone = cs; wado.external.dicomParser = window.dicomParser;
            try {
                wado.webWorkerManager.initialize({ maxWebWorkers: Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1)), startWebWorkersOnDemand: true, taskConfiguration: { decodeTask: { initializeCodecsOnStartup: false } } });
            } catch (e) { console.warn('[pclinic viewer] web workers unavailable:', e && e.message); }
            wado.configure({ useWebWorkers: true, decodeConfig: { convertFloatPixelDataToInt: false } });
            cst.external.cornerstone = cs; cst.external.Hammer = window.Hammer; cst.external.cornerstoneMath = window.cornerstoneMath;
            cst.init({ showSVGCursors: true, globalToolSyncEnabled: true, mouseEnabled: true, touchEnabled: true });
            // A measurement dragged past the image edge is clamped to the edge (like Weasis),
            // not silently thrown away (cornerstone's default deleteIfHandleOutsideImage).
            try { var gc = cst.getModule('globalConfiguration').configuration; gc.deleteIfHandleOutsideImage = false; gc.preventHandleOutsideImage = true; gc.clickProximity = 8; gc.touchProximity = 14; } catch (e) {}
            ['Wwwc', 'WwwcRegion', 'Pan', 'Zoom', 'ZoomMouseWheel', 'StackScrollMouseWheel', 'StackScroll', 'Magnify', 'Rotate', 'Length', 'Angle', 'CobbAngle', 'RectangleRoi', 'EllipticalRoi', 'FreehandRoi', 'Bidirectional', 'Probe', 'ArrowAnnotate', 'Eraser', 'PanMultiTouch', 'ZoomTouchPinch', 'StackScrollMultiTouch'].forEach(function (n) {
                var T = cst[n + 'Tool']; if (!T) return;
                var cfg = {};
                if (n === 'ArrowAnnotate') cfg.configuration = { getTextCallback: function (cb) { var t = window.prompt('Annotation text:'); cb(t == null ? '' : t); }, changeTextCallback: function (data, evt, cb) { var t = window.prompt('Annotation text:', data.text || ''); if (t != null) cb(t); } };
                if (n === 'Magnify') cfg.configuration = { magnifySize: 260, magnificationLevel: 3 };
                if (n === 'Length' || n === 'Bidirectional' || n === 'Angle' || n === 'CobbAngle') cfg.configuration = { drawHandlesOnHover: true, hideHandlesIfMoving: false };
                cst.addTool(T, cfg);
            });
            cst.toolStyle.setToolWidth(2); cst.toolColors.setToolColor('#ffd400'); cst.toolColors.setActiveColor('#4a9eff');
            cst.textStyle.setFont('12px ui-monospace, Menlo, Consolas, monospace'); cst.textStyle.setBackgroundColor('rgba(0,0,0,.55)');
            // Colour (PNG/JPEG/WebP) images: a tiny loader so every cornerstone tool works on them.
            cs.registerImageLoader('pcimg', loadColorImage);
            return true;
        });
        libsPromise.catch(function () { libsPromise = null; });
        return libsPromise;
    }
    function loadColorImage(imageId) {
        var url = imageId.slice('pcimg:'.length);
        var promise = fetch(url, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(function (blob) {
            return new Promise(function (res, rej) { var img = new Image(); var ourl = URL.createObjectURL(blob); img.onload = function () { URL.revokeObjectURL(ourl); res(img); }; img.onerror = function () { URL.revokeObjectURL(ourl); rej(new Error('Not an image the browser can decode.')); }; img.src = ourl; });
        }).then(function (img) {
            var w = img.naturalWidth, h = img.naturalHeight;
            var c = document.createElement('canvas'); c.width = w; c.height = h; var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
            var rgba = ctx.getImageData(0, 0, w, h).data;
            return {
                imageId: imageId, minPixelValue: 0, maxPixelValue: 255, slope: 1, intercept: 0, windowCenter: 128, windowWidth: 256,
                render: window.cornerstone.renderColorImage, getPixelData: function () { return rgba; }, getCanvas: function () { return c; }, getImage: function () { return img; },
                rows: h, columns: w, height: h, width: w, color: true, rgba: true, columnPixelSpacing: undefined, rowPixelSpacing: undefined, invert: false, sizeInBytes: w * h * 4
            };
        });
        return { promise: promise, cancelFn: function () {} };
    }

    /* ── media model ──────────────────────────────────────────── */
    function isDicom(item) { var m = item.meta || {}; var mime = String(m.mime || '').toLowerCase(); var name = String(m.fileName || '').toLowerCase(); return mime === 'application/dicom' || mime.indexOf('dicom') >= 0 || name.slice(-4) === '.dcm' || String(m.ext || '').toLowerCase() === 'dcm'; }
    function isVideo(item) { var m = item.meta || {}; return String(m.kind) === 'video' || /^video\//.test(String(m.mime || '')); }

    // Metadata + URLs for one study, each file carrying the REASON when there is no URL.
    function fetchMedia(order, cb) {
        var M = window.pcRadioMedia;
        var listP = M && M.listFor ? Promise.resolve().then(function () { return M.listFor(order.id); }) : Promise.resolve([]);
        var urlP = (M && M.urlsFor ? Promise.resolve().then(function () { return M.urlsFor(order.id); }) : Promise.resolve({ items: [] }))
            .then(function (out) { return out || { items: [] }; })
            .catch(function (e) { return { items: [], error: 'sign-call-failed', reason: (e && e.message) || String(e) }; });
        Promise.all([listP, urlP]).then(function (res) {
            var meta = res[0] || [], out = res[1] || {}, signed = out.items || [];
            var callProblem = out.error === 'backend-unavailable' ? 'The common server is not connected (sign in and wait for Firebase to connect).' : (out.error ? String(out.reason || out.error) : '');
            if (out.signing === 'token-fallback' && out.signingProblem && !window.__pcSigningNoteShown) { window.__pcSigningNoteShown = true; console.warn('[pclinic] radiologyMediaSign serves download-token links because signed URLs failed: ' + out.signingProblem + ' — grant roles/iam.serviceAccountTokenCreator to the Cloud Functions service account to restore 10-minute links.'); }
            var byId = {}; signed.forEach(function (s) { byId[String(s.id)] = s; });
            var set = meta.map(function (m) {
                var hit = byId[String(m.id)] || null, local = false;
                if (!(hit && hit.url) && M && typeof M.localUrlFor === 'function') { var lu = M.localUrlFor(m.id); if (lu) { hit = { id: String(m.id), url: lu, mode: 'local' }; local = true; } }
                var problem = '';
                if (hit && hit.url) problem = '';
                else if (hit && hit.reason) problem = String(hit.reason);
                else if (hit && hit.error) problem = hit.error === 'object-unavailable'
                    ? 'The image is stored safely, but the Cloud Function "radiologyMediaSign" running in Firebase is still the previous version and is not allowed to create image links.\nThis is server-side: uploading web files to GitHub / Hosting cannot fix it. Do ONE of these once:\n  • from the project folder run:  firebase deploy --only functions\n  • or in Google Cloud console → IAM, give the functions service account the role "Service Account Token Creator".'
                    : String(hit.error);
                else if (callProblem) problem = callProblem;
                else if (signed.length || out.count === 0) problem = 'The signing service returned no entry for this file — its record may not match its stored object (radiology/' + order.id + '/' + m.id + '.' + (m.ext || '?') + ').';
                else problem = 'The signing service returned nothing for this study.';
                return { id: String(m.id), meta: m, signed: hit && hit.url ? hit : null, url: hit && hit.url ? hit.url : '', problem: problem, local: local, imageIds: null, frames: 1, image: null, kind: isVideo({ meta: m }) ? 'video' : (isDicom({ meta: m }) ? 'dicom' : 'image') };
            });
            set.sort(function (a, b) { return String(a.meta.at || '').localeCompare(String(b.meta.at || '')); });
            cb(null, set);
        }).catch(function (e) { cb(e, []); });
    }

    function studiesForPatient(patient) {
        var R = window.pcRadiology; if (!patient || !R || typeof R.snapshot !== 'function') return [];
        var snap = R.snapshot() || {}; var keys = [patient.id, patient.mrn].filter(function (v) { return v != null && String(v) !== ''; }).map(String);
        var mine = (snap.orders || []).filter(function (o) { return (o.dept === 'radiology' || o.type === 'imaging') && keys.indexOf(String(o.patientId || '')) !== -1 && R.stateOf(o) !== 'cancelled'; });
        mine.sort(function (a, b) { return ms(b.orderedAt) - ms(a.orderedAt); });
        return mine.map(function (o) { return { id: String(o.id), study: ((o.items || []).map(function (i) { return i.name || ''; }).filter(Boolean).join(', ')) || 'Imaging study', patientName: o.patientName || nameOf(patient), patientId: o.patientId, state: R.stateOf(o), orderedAt: o.orderedAt, priority: o.priority || '', modality: o.modality || '' }; });
        function ms(v) { if (!v) return 0; if (typeof v.toMillis === 'function') return v.toMillis(); if (v.seconds) return v.seconds * 1000; return new Date(v).getTime() || 0; }
    }
    function findPatient(id) { var list = []; try { list = (typeof window.getPatients === 'function' ? window.getPatients() : []) || []; } catch (e) {} for (var i = 0; i < list.length; i++) { if (String(list[i].id) === String(id) || String(list[i].mrn) === String(id)) return list[i]; } return null; }

    /* ── orientation / scale helpers ──────────────────────────── */
    var OPP = { L: 'R', R: 'L', A: 'P', P: 'A', H: 'F', F: 'H' };
    function dirLabel(v) { // DICOM LPS unit vector → up to 3 letters, strongest first
        var ax = [[Math.abs(v[0]), v[0] < 0 ? 'R' : 'L'], [Math.abs(v[1]), v[1] < 0 ? 'A' : 'P'], [Math.abs(v[2]), v[2] < 0 ? 'F' : 'H']];
        ax.sort(function (a, b) { return b[0] - a[0]; }); var out = '';
        for (var i = 0; i < 3; i++) { if (ax[i][0] > 0.2) out += ax[i][1]; } return out;
    }
    function baseOrientation(ds) {
        if (!ds) return null;
        var iop = String(ds.string('x00200037') || '').split('\\').map(parseFloat);
        if (iop.length === 6 && !iop.some(isNaN)) { var row = dirLabel(iop.slice(0, 3)), col = dirLabel(iop.slice(3, 6)); return { right: row, left: opp(row), bottom: col, top: opp(col) }; }
        var po = String(ds.string('x00200020') || '').split('\\').map(function (s) { return s.trim(); });
        if (po.length === 2 && po[0] && po[1]) return { right: po[0], left: opp(po[0]), bottom: po[1], top: opp(po[1]) };
        return null;
        function opp(s) { return s.split('').map(function (c) { return OPP[c] || c; }).join(''); }
    }
    function rotateOrientation(o, vp) {
        if (!o) return null; var r = { top: o.top, right: o.right, bottom: o.bottom, left: o.left };
        if (vp.hflip) { var t = r.left; r.left = r.right; r.right = t; }
        if (vp.vflip) { var t2 = r.top; r.top = r.bottom; r.bottom = t2; }
        var steps = ((Math.round((vp.rotation || 0) / 90) % 4) + 4) % 4;
        for (var i = 0; i < steps; i++) { r = { top: r.left, right: r.top, bottom: r.right, left: r.bottom }; }
        return r;
    }

    /* ── measurement description ──────────────────────────────── */
    function describeMeasurement(tool, d, image) {
        var mm = image && image.rowPixelSpacing; var u = mm ? 'mm' : 'px', u2 = mm ? 'mm²' : 'px²';
        function n(v, p) { return (v == null || isNaN(v)) ? '—' : Number(v).toFixed(p == null ? 1 : p); }
        var st = d.cachedStats || {};
        switch (tool) {
            case 'Length': return n(d.length) + ' ' + u;
            case 'Bidirectional': return 'L ' + n(d.longestDiameter) + ' × S ' + n(d.shortestDiameter) + ' ' + u;
            case 'Angle': case 'CobbAngle': return n(d.rAngle) + '°';
            case 'RectangleRoi': case 'EllipticalRoi': return 'Area ' + n(st.area, mm ? 1 : 0) + ' ' + u2 + ' · mean ' + n(st.mean) + (image && image.intercept === -1024 ? ' HU' : '') + ' ± ' + n(st.stdDev) + ' · min ' + n(st.min, 0) + ' · max ' + n(st.max, 0);
            case 'FreehandRoi': return 'Area ' + n(d.area, mm ? 1 : 0) + ' ' + u2 + (d.meanStdDev ? ' · mean ' + n(d.meanStdDev.mean) + ' ± ' + n(d.meanStdDev.stdDev) : '');
            case 'Probe': return (st.x != null ? ('x' + st.x + ' y' + st.y + ' · ') : '') + 'value ' + (st.mo != null ? n(st.mo, 0) : (st.storedPixels ? String(st.storedPixels[0]) : '—')) + (image && image.intercept === -1024 ? ' HU' : '');
            case 'ArrowAnnotate': return d.text ? '“' + d.text + '”' : '(no text)';
            default: return '';
        }
    }

    /* ══════════════════════════════════════════════════════════════
       The workstation
       ══════════════════════════════════════════════════════════════ */
    var root = null, host = null, mode = 'modal', openOpts = {};
    var patient = null, studies = [], currentStudy = null, mediaByStudy = {}, currentItem = null;
    var viewports = [], activeVp = 0, layoutSpec = [1, 1], syncOn = false, synchronizers = null;
    var leftTool = 'Wwwc', wheelMode = 'scroll', overlaysOn = true, scaleOn = true, orientOn = true, interpOff = false;
    var explorerTab = 'studies', explorerOpen = true, sidePanel = null, cine = { on: false, fps: 15 };
    var onKeyBound = null, onResizeBound = null, dragItem = null, pointerVp = null, toastTimer = null, menuEl = null, docClickBound = null, onFsBound = null;

    function $(sel) { return root ? root.querySelector(sel) : null; }
    function toast(msg, kind) { if (!root) return; var old = $('.dv-toast'); if (old) old.remove(); var t = el('div', 'dv-toast' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : ''), msg); root.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, kind === 'err' ? 9000 : 4200); }
    function setStatus(k, v) { var n = $('.dv-status-bar [data-st="' + k + '"] b'); if (n) n.textContent = v == null ? '—' : String(v); }
    function cs() { return window.cornerstone; } function cst() { return window.cornerstoneTools; }

    /* ── build ─────────────────────────────────────────────────── */
    function build() {
        root = el('div', 'pcdv' + (mode === 'inline' ? ' dv-inline' : ''));
        root.id = 'pcdv-root'; root.setAttribute('role', 'application'); root.setAttribute('aria-label', 'PClinic DICOM workstation');
        if (mode === 'modal') {
            var title = el('div', 'dv-title'); title.appendChild(el('div', 'dv-logo', 'P')); title.appendChild(el('b', null, 'PClinic DICOM Viewer')); title.appendChild(el('span', 'dv-sub', 'Radiology imaging')); title.appendChild(el('div', 'dv-spacer'));
            var x = el('button', 'dv-close', '✕ Close'); x.onclick = close; title.appendChild(x); root.appendChild(title);
        }
        root.appendChild(buildToolbar());
        var body = el('div', 'dv-body'); root.appendChild(body);
        body.appendChild(buildExplorer());
        var center = el('div', 'dv-center'); body.appendChild(center);
        var strip = el('div', 'dv-tabstrip'); var tab = el('div', 'dv-tab active'); tab.appendChild(el('span', 'dv-ico')); tab.appendChild(el('span', null, 'Image Viewer')); var tx = el('button', 'dv-tab-x', '×'); tx.title = 'Clear all viewports'; tx.onclick = clearAllViewports; tab.appendChild(tx); strip.appendChild(tab); strip.appendChild(el('div', 'dv-spacer'));
        var undock = el('button', 'dv-winbtn'); undock.title = 'Open in a new window'; undock.appendChild(icon('full')); undock.onclick = openInWindow; strip.appendChild(undock);
        center.appendChild(strip);
        var grid = el('div', 'dv-grid'); center.appendChild(grid);
        var cineBar = el('div', 'dv-cine'); center.appendChild(cineBar); buildCineBar(cineBar);
        body.appendChild(buildSide());
        root.appendChild(buildStatusBar());
        applyLayout(layoutSpec[0], layoutSpec[1]);
    }

    function tb(name, label, title, onClick, opts) {
        opts = opts || {}; var b = el('button', 'dv-tb' + (opts.primary ? ' dv-primary' : '') + (opts.iconOnly ? ' dv-iconly' : '') + (opts.mid ? ' dv-mid' : '')); b.type = 'button'; b.title = title || label; b.setAttribute('aria-label', title || label);
        if (opts.tool) b.setAttribute('data-tool', opts.tool); if (opts.id) b.setAttribute('data-id', opts.id);
        b.appendChild(icon(name)); if (label) b.appendChild(el('span', 'dv-tb-label', label)); if (opts.menu) b.appendChild(el('span', 'dv-caret'));
        b.onclick = function (e) { onClick(e, b); }; return b;
    }
    function sep() { return el('span', 'dv-sep'); }
    function buildToolbar() {
        var t = el('div', 'dv-toolbar'); t.setAttribute('role', 'toolbar');
        t.appendChild(tb('explorer', 'Explorer', 'Show / hide the DICOM explorer', toggleExplorer, { id: 'explorer', mid: true }));
        t.appendChild(tb('download', 'Export', 'Export: screenshot, original file, print', function (e, b) { openMenu(b, exportMenu()); }, { menu: true }));
        t.appendChild(sep());
        t.appendChild(tb('wl', 'Window/Level', 'Window / level (drag). Right-click for presets', function () { setLeftTool('Wwwc'); }, { tool: 'Wwwc' }));
        t.appendChild(tb('pan', 'Pan', 'Pan (drag). Middle mouse always pans', function () { setLeftTool('Pan'); }, { tool: 'Pan' }));
        t.appendChild(tb('zoom', 'Zoom', 'Zoom (drag). Right mouse / pinch always zooms', function () { setLeftTool('Zoom'); }, { tool: 'Zoom' }));
        t.appendChild(tb('zoomin', '', 'Zoom in', function () { zoomBy(1.25); }));
        t.appendChild(tb('zoomout', '', 'Zoom out', function () { zoomBy(0.8); }));
        t.appendChild(tb('fit', 'Fit', 'Fit to window', fitToWindow, { iconOnly: true }));
        t.appendChild(sep());
        t.appendChild(tb('layout', 'Layout', 'Viewport layout', function (e, b) { openMenu(b, layoutMenu()); }, { menu: true }));
        t.appendChild(tb('sync', 'Sync', 'Synchronise zoom/pan and window/level between viewports', toggleSync, { id: 'sync', iconOnly: true }));
        t.appendChild(tb('reset', 'Reset', 'Reset view (zoom, pan, W/L, rotation)', resetView, { iconOnly: true }));
        t.appendChild(sep());
        t.appendChild(tb('ruler', 'Ruler', 'Length measurement', function () { setLeftTool('Length'); }, { tool: 'Length' }));
        t.appendChild(tb('angle', 'Angle', 'Angle measurement', function () { setLeftTool('Angle'); }, { tool: 'Angle', mid: true }));
        t.appendChild(tb('roi', 'ROI', 'Region of interest: rectangle, ellipse, freehand, bidirectional, Cobb', function (e, b) { openMenu(b, roiMenu()); }, { menu: true, id: 'roi' }));
        t.appendChild(tb('probe', 'Probe', 'Pixel value probe', function () { setLeftTool('Probe'); }, { tool: 'Probe', iconOnly: true }));
        t.appendChild(tb('arrow', 'Arrow', 'Arrow with text annotation', function () { setLeftTool('ArrowAnnotate'); }, { tool: 'ArrowAnnotate', mid: true }));
        t.appendChild(tb('trash', 'Delete', 'Delete measurements', function (e, b) { openMenu(b, deleteMenu()); }, { menu: true, mid: true }));
        t.appendChild(sep());
        t.appendChild(tb('magnify', 'Magnify', 'Magnifying glass (drag)', function () { setLeftTool('Magnify'); }, { tool: 'Magnify', iconOnly: true }));
        t.appendChild(tb('rotate', 'Rotate', 'Rotate / flip', function (e, b) { openMenu(b, rotateMenu()); }, { menu: true }));
        t.appendChild(tb('flip', 'Flip', 'Flip horizontally', function () { flip('h'); }, { iconOnly: true }));
        t.appendChild(tb('invert', 'Invert', 'Invert grey scale', invert, { id: 'invert', iconOnly: true }));
        t.appendChild(tb('presets', 'Presets', 'Window / level presets and colour maps', function (e, b) { openMenu(b, presetMenu()); }, { menu: true }));
        t.appendChild(sep());
        t.appendChild(tb('cine', 'Cine', 'Cine loop (multi-frame / series)', toggleCine, { id: 'cine' }));
        t.appendChild(tb('prev', '', 'Previous frame / image (←)', function () { step(-1); }));
        t.appendChild(tb('next', '', 'Next frame / image (→)', function () { step(1); }));
        t.appendChild(sep());
        t.appendChild(tb('full', 'Full screen', 'Full screen (F)', toggleFullscreen, { id: 'full', iconOnly: true }));
        if (openOpts.canManage) { t.appendChild(tb('upload', 'Upload', 'Attach images or DICOM files to this study', doUpload, { primary: true, id: 'upload' })); }
        return t;
    }

    function buildExplorer() {
        var ex = el('aside', 'dv-explorer'); ex.setAttribute('aria-label', 'DICOM explorer');
        var head = el('div', 'dv-exp-head'); head.appendChild(el('span', null, 'DICOM Explorer')); head.appendChild(el('div', 'dv-spacer'));
        var refresh = el('button'); refresh.title = 'Reload from the common server'; refresh.appendChild(icon('reset')); refresh.onclick = function () { reloadStudy(currentStudy, true); }; head.appendChild(refresh);
        var hide = el('button', null, '▾'); hide.title = 'Hide explorer'; hide.onclick = toggleExplorer; head.appendChild(hide); ex.appendChild(head);
        ex.appendChild(searchBox('Search patient…', 'patient')); ex.appendChild(searchBox('Search tags…', 'tags'));
        var tabs = el('div', 'dv-exp-tabs'); [['studies', 'Studies'], ['tags', 'DICOM tags']].forEach(function (t) { var b = el('button', t[0] === explorerTab ? 'active' : '', t[1]); b.onclick = function () { explorerTab = t[0]; renderExplorer(); }; b.setAttribute('data-extab', t[0]); tabs.appendChild(b); }); ex.appendChild(tabs);
        ex.appendChild(el('div', 'dv-tree')); ex.appendChild(el('div', 'dv-tags')); ex.appendChild(el('div', 'dv-patient-results'));
        return ex;
    }
    function searchBox(placeholder, kind) {
        var w = el('div', 'dv-search'); w.appendChild(icon('search')); var i = el('input'); i.type = 'search'; i.placeholder = placeholder; i.setAttribute('data-search', kind); i.autocomplete = 'off'; w.appendChild(i);
        var x = el('button', 'dv-x', '×'); x.title = 'Clear'; x.onclick = function () { i.value = ''; i.dispatchEvent(new Event('input')); }; w.appendChild(x);
        i.addEventListener('input', function () { if (kind === 'patient') renderPatientSearch(i.value); else { explorerTab = i.value.trim() ? 'tags' : 'studies'; renderExplorer(); } });
        i.addEventListener('keydown', function (e) { if (e.key === 'Escape') { i.value = ''; i.dispatchEvent(new Event('input')); i.blur(); } e.stopPropagation(); });
        return w;
    }

    function buildSide() {
        var side = el('div', 'dv-side');
        var panel = el('section', 'dv-panel'); panel.setAttribute('aria-label', 'Side panel'); var ph = el('div', 'dv-panel-head'); ph.appendChild(el('span', 'dv-panel-title', '')); ph.appendChild(el('div', 'dv-spacer')); var pc = el('button', null, '✕'); pc.title = 'Close panel'; pc.onclick = function () { openSidePanel(null); }; ph.appendChild(pc); panel.appendChild(ph); panel.appendChild(el('div', 'dv-panel-body')); side.appendChild(panel);
        var tabs = el('nav', 'dv-sidetabs'); tabs.setAttribute('aria-label', 'Panels');
        [['display', 'Display', 'display'], ['tools', 'Image Tools', 'tools'], ['draw', 'Draw & Measure', 'draw'], ['info', 'Study Info', 'info'], ['report', 'Report', 'report']].forEach(function (t) {
            var b = el('button', 'dv-stab'); b.setAttribute('data-stab', t[0]); b.title = t[1]; var ic = el('span', 'dv-stab-ico'); ic.appendChild(icon(t[2])); b.appendChild(ic); b.appendChild(el('span', 'dv-stab-lbl', t[1]));
            var pin = el('span', 'dv-pin'); pin.appendChild(el('i')); pin.appendChild(el('i', 't')); b.appendChild(pin);
            b.onclick = function () { openSidePanel(sidePanel === t[0] ? null : t[0]); }; tabs.appendChild(b);
        });
        side.appendChild(tabs); return side;
    }
    function buildStatusBar() {
        var s = el('div', 'dv-status-bar');
        [['patient', 'Patient'], ['study', 'Study'], ['file', 'File'], ['tool', 'Tool'], ['pix', 'Pixel']].forEach(function (k) { var sp = el('span', k[0] === 'pix' ? 'dv-opt' : ''); sp.setAttribute('data-st', k[0]); sp.appendChild(document.createTextNode(k[1] + ': ')); sp.appendChild(el('b', null, '—')); s.appendChild(sp); });
        s.appendChild(el('div', 'dv-spacer')); var sv = el('span', 'dv-save'); sv.setAttribute('data-st', 'save'); sv.appendChild(el('b', null, '')); s.appendChild(sv);
        return s;
    }
    function buildCineBar(bar) {
        var play = el('button'); play.setAttribute('data-cine', 'play'); play.appendChild(icon('cine')); play.title = 'Play / pause (space)'; play.onclick = toggleCinePlay; bar.appendChild(play);
        var prev = el('button'); prev.appendChild(icon('prev')); prev.onclick = function () { step(-1); }; bar.appendChild(prev);
        var range = el('input'); range.type = 'range'; range.min = 0; range.max = 0; range.value = 0; range.setAttribute('data-cine', 'range'); range.oninput = function () { gotoFrame(parseInt(range.value, 10)); }; bar.appendChild(range);
        var next = el('button'); next.appendChild(icon('next')); next.onclick = function () { step(1); }; bar.appendChild(next);
        var lbl = el('span', null, '1 / 1'); lbl.setAttribute('data-cine', 'label'); bar.appendChild(lbl);
        var fps = el('input', 'dv-fps'); fps.type = 'number'; fps.min = 1; fps.max = 60; fps.value = cine.fps; fps.title = 'Frames per second'; fps.onchange = function () { cine.fps = clamp(parseInt(fps.value, 10) || 15, 1, 60); if (cine.playing) { stopClip(); playClip(); } }; bar.appendChild(fps); bar.appendChild(el('span', null, 'fps'));
    }

    /* ── viewports / layout ────────────────────────────────────── */
    function applyLayout(rows, cols) {
        layoutSpec = [rows, cols]; var grid = $('.dv-grid'); if (!grid) return;
        grid.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)'; grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
        var want = rows * cols;
        while (viewports.length > want) { var v = viewports.pop(); destroyViewport(v); }
        while (viewports.length < want) viewports.push(createViewport(viewports.length));
        viewports.forEach(function (v) { grid.appendChild(v.el); });
        if (activeVp >= want) activeVp = 0; markActiveViewport(); if (cs()) viewports.forEach(function (v) { if (v.enabled) { try { cs().resize(v.host, true); } catch (e) {} } });
        setTimeout(function () { viewports.forEach(function (v) { if (v.enabled) { try { cs().resize(v.host, true); } catch (e) {} } }); }, 30);
    }
    function createViewport(index) {
        var v = { index: index, el: el('div', 'dv-vp'), host: null, enabled: false, item: null, imageIds: [], frame: 0, video: null, hint: null, plain: null };
        v.el.setAttribute('data-vp', index); v.el.tabIndex = 0;
        v.host = el('div', 'dv-canvas-host'); v.el.appendChild(v.host);
        ['tl', 'tr', 'bl', 'br'].forEach(function (c) { v.el.appendChild(el('div', 'dv-ov ' + c)); });
        ['n', 's', 'w', 'e'].forEach(function (c) { v.el.appendChild(el('div', 'dv-orient ' + c)); });
        var sc = el('div', 'dv-scale'); sc.appendChild(el('div', 'dv-scale-lbl', '')); var bar = el('div', 'dv-scale-bar'); for (var i = 1; i < 10; i++) { var t = el('i', i === 5 ? 'm' : ''); t.style.top = (i * 10) + '%'; bar.appendChild(t); } sc.appendChild(bar); v.el.appendChild(sc);
        v.hint = el('div', 'dv-hint'); v.hint.textContent = index === 0 ? 'Select a study or an image in the DICOM Explorer.' : 'Drop an image here, or click to make this viewport active and pick a thumbnail.'; v.el.appendChild(v.hint);
        v.el.addEventListener('pointerdown', function () { setActiveViewport(v.index); }, true);
        v.el.addEventListener('dragover', function (e) { if (dragItem) { e.preventDefault(); v.el.classList.add('dv-drop'); } });
        v.el.addEventListener('dragleave', function () { v.el.classList.remove('dv-drop'); });
        v.el.addEventListener('drop', function (e) { e.preventDefault(); v.el.classList.remove('dv-drop'); if (dragItem) { setActiveViewport(v.index); displayItem(dragItem, v); dragItem = null; } });
        v.el.addEventListener('wheel', function (e) { if (!v.item || v.imageIds.length > 1 || wheelMode !== 'scroll') return; e.preventDefault(); setActiveViewport(v.index); stepFile(e.deltaY > 0 ? 1 : -1); }, { passive: false });
        v.el.addEventListener('mousemove', function (e) { pointerVp = v; updatePixelReadout(v, e); });
        v.el.addEventListener('mouseleave', function () { setStatus('pix', '—'); });
        v.el.addEventListener('dblclick', function () { if (viewports.length > 1) { toggleMaximise(v); } });
        return v;
    }
    function destroyViewport(v) { try { if (v.enabled && cs()) { cst().clearToolState(v.host, 'stack'); cs().disable(v.host); } } catch (e) {} if (v.el.parentNode) v.el.parentNode.removeChild(v.el); }
    function setActiveViewport(i) { if (i === activeVp) return; activeVp = i; markActiveViewport(); refreshPanels(); }
    function markActiveViewport() { viewports.forEach(function (v, i) { v.el.classList.toggle('active', i === activeVp && viewports.length > 1); }); }
    function vp() { return viewports[activeVp] || viewports[0]; }
    var maximised = null;
    function toggleMaximise(v) { var grid = $('.dv-grid'); if (maximised) { viewports.forEach(function (x) { x.el.style.display = ''; }); applyLayout(maximised[0], maximised[1]); maximised = null; } else { maximised = layoutSpec.slice(); viewports.forEach(function (x) { x.el.style.display = x === v ? '' : 'none'; }); grid.style.gridTemplateRows = '1fr'; grid.style.gridTemplateColumns = '1fr'; setTimeout(function () { try { cs().resize(v.host, true); } catch (e) {} }, 20); } }
    function clearAllViewports() { viewports.forEach(function (v) { clearViewport(v); }); refreshPanels(); }
    function clearViewport(v) {
        stopClip(); if (v.video) { try { v.video.pause(); } catch (e) {} v.video.remove(); v.video = null; }
        if (v.plain) { v.plain.remove(); v.plain = null; }
        if (v.enabled && cs()) { try { cst().clearToolState(v.host, 'stack'); MEASURE_TOOLS.forEach(function (t) { cst().clearToolState(v.host, t); }); cs().disable(v.host); } catch (e) {} v.enabled = false; }
        v.item = null; v.imageIds = []; v.frame = 0; v.el.classList.remove('dv-no-ov'); v.hint.textContent = 'Empty viewport.'; v.hint.style.display = ''; clearOverlays(v);
        var pre = v.el.querySelector('.dv-prelim'); if (pre) pre.remove(); var ld = v.el.querySelector('.dv-loading'); if (ld) ld.remove();
    }
    function clearOverlays(v) { v.el.querySelectorAll('.dv-ov').forEach(function (o) { o.textContent = ''; }); v.el.querySelectorAll('.dv-orient').forEach(function (o) { o.textContent = ''; }); var s = v.el.querySelector('.dv-scale'); if (s) s.style.display = 'none'; }

    /* ── displaying an item ────────────────────────────────────── */
    function displayItem(item, target) {
        var v = target || vp(); if (!item) return;
        currentItem = item; setActiveViewport(v.index); clearViewport(v); v.item = item; v.hint.style.display = 'none';
        markThumbActive(item.id); setStatus('file', item.meta.fileName || item.id);
        if (item.kind !== 'video' && v.item.study && v.item.study.id !== (currentStudy && currentStudy.id)) { /* item belongs to another study: keep explorer in step */ selectStudy(item.study, { keepViewport: true }); }
        if (!item.url) { v.hint.style.display = ''; v.hint.innerHTML = ''; var b = el('b', null, 'This file is registered but cannot be displayed.'); v.hint.appendChild(b); v.hint.appendChild(document.createTextNode('\n' + (item.problem || 'The signing service returned no URL for it.') + '\n\nFile: ' + String(item.meta.fileName || item.id))); refreshPanels(); return; }
        if (item.kind === 'video') { var vid = el('video', 'dv-plain'); vid.controls = true; vid.src = item.url; vid.playsInline = true; v.el.insertBefore(vid, v.hint); v.video = vid; v.el.classList.add('dv-no-ov'); drawTextOverlays(v); refreshPanels(); return; }
        var loading = el('div', 'dv-loading', item.kind === 'dicom' ? 'Decoding DICOM…' : 'Loading image…'); v.el.appendChild(loading);
        ensureLibs().then(function () { return resolveImageIds(item); }).then(function (ids) {
            if (v.item !== item) return; // user moved on
            v.imageIds = ids; v.frame = 0;
            if (!v.enabled) { cs().enable(v.host, { renderer: 'webgl' }); v.enabled = true; wireViewportEvents(v); }
            cst().addStackStateManager(v.host, ['stack', 'playClip']); cst().clearToolState(v.host, 'stack');
            cst().addToolState(v.host, 'stack', { currentImageIdIndex: 0, imageIds: ids });
            return cs().loadAndCacheImage(ids[0]).then(function (image) {
                if (v.item !== item) return; item.image = image; item.frames = ids.length;
                cs().displayImage(v.host, image); var vpState = cs().getDefaultViewportForImage(v.host, image); if (interpOff) vpState.pixelReplication = true; cs().setViewport(v.host, vpState);
                applyBindings(); loading.remove(); v.host.style.width = v.host.style.height = '100%';
                cs().resize(v.host, true); drawTextOverlays(v); updateCineBar(v); ensureThumb(item, image); refreshPanels();
                if (item.local) toast('Showing the copy you just uploaded. Others will see it once the server link service is updated.', 'ok');
            });
        }).catch(function (e) {
            loading.remove(); if (v.item !== item) return;
            var msg = (e && e.message) || (e && e.error && e.error.message) || String(e);
            if (/Failed to fetch|NetworkError|CORS|TypeError/i.test(msg)) {
                // Storage bucket CORS not set → the browser may show the image but not read its pixels. Degrade gracefully.
                if (item.kind === 'image') { var img = el('img', 'dv-plain'); img.src = item.url; img.alt = item.meta.fileName || ''; v.el.insertBefore(img, v.hint); v.plain = img; v.el.classList.add('dv-no-ov'); toast('Shown as a plain image: the storage bucket has no CORS rule for this site, so measurements and window/level are unavailable. See the notes (gsutil cors set).', 'err'); refreshPanels(); return; }
                msg = 'The image bytes could not be read by script. Storage bucket CORS must allow this site (see notes: gsutil cors set cors.json gs://…).';
            }
            v.hint.style.display = ''; v.hint.textContent = 'Could not display this image.\n' + msg; refreshPanels();
        });
    }
    function resolveImageIds(item) {
        if (item.imageIds) return Promise.resolve(item.imageIds);
        if (item.kind === 'image') { item.imageIds = ['pcimg:' + item.url]; return Promise.resolve(item.imageIds); }
        return fetch(item.url, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('Could not fetch the DICOM file (HTTP ' + r.status + ').'); return r.arrayBuffer(); }).then(function (buf) {
            var base = window.cornerstoneWADOImageLoader.wadouri.fileManager.add(new Blob([buf]));
            var ds = null; try { ds = window.dicomParser.parseDicom(new Uint8Array(buf), { untilTag: 'x7fe00010' }); } catch (e) { try { ds = window.dicomParser.parseDicom(new Uint8Array(buf)); } catch (e2) {} }
            item.dataSet = ds; var n = (ds && parseInt(ds.string('x00280008'), 10)) || 1; if (!(n > 0)) n = 1;
            var ids = []; for (var i = 0; i < n; i++) ids.push(n > 1 ? base + '?frame=' + i : base);
            item.imageIds = ids; item.frames = n; return ids;
        });
    }
    function wireViewportEvents(v) {
        v.host.addEventListener('cornerstoneimagerendered', function (e) { v.lastViewport = e.detail.viewport; syncFrameFromStack(v); drawTextOverlays(v); });
        v.host.addEventListener('cornerstonenewimage', function (e) { syncFrameFromStack(v); if (v.item) v.item.image = e.detail.image; updateCineBar(v); });
        // Refresh the Draw & Measure list when a measurement is added/finished/removed —
        // NOT on every 'modified' during the drag: rebuilding the panel mid-drag steals
        // the pointer from the tool and the half-drawn ROI is discarded.
        // 'measurementadded' fires on mousedown, before the drag: the list must not be
        // touched until the pointer is released (cornerstone-tools discards a new ROI
        // whose 'measurementadded' handler causes a re-layout / cancels its drag).
        var panelTimer = null; function refreshDrawPanel() { clearTimeout(panelTimer); panelTimer = setTimeout(function () { if (sidePanel === 'draw') renderPanel(); }, 120); }
        ['cornerstonetoolsmeasurementcompleted', 'cornerstonetoolsmeasurementremoved', 'cornerstonetoolsmouseup', 'cornerstonetoolstouchend', 'cornerstonetoolsmouseclick', 'cornerstonetoolstap'].forEach(function (ev) { v.host.addEventListener(ev, refreshDrawPanel); });
        v.host.addEventListener('cornerstonetoolsmeasurementadded', function (e) { var d = e.detail && e.detail.measurementData; if (d && !d._pcSeq) d._pcSeq = ++measureSeq; });
    }
    function syncFrameFromStack(v) { try { var st = cst().getToolState(v.host, 'stack'); if (st && st.data && st.data[0]) { var idx = st.data[0].currentImageIdIndex || 0; if (v.imageIds.length > 1) { var cur = cs().getImage(v.host); var i2 = cur ? v.imageIds.indexOf(cur.imageId) : -1; v.frame = i2 >= 0 ? i2 : idx; } else v.frame = 0; } } catch (e) {} }
    function currentImage(v) { v = v || vp(); if (!v || !v.enabled) return null; try { return cs().getImage(v.host); } catch (e) { return null; } }
    function dataSetOf(item) { if (!item) return null; if (item.dataSet) return item.dataSet; if (item.image && item.image.data) return item.image.data; return null; }

    /* ── overlays ──────────────────────────────────────────────── */
    function drawTextOverlays(v) {
        var item = v.item; var o = { tl: v.el.querySelector('.dv-ov.tl'), tr: v.el.querySelector('.dv-ov.tr'), bl: v.el.querySelector('.dv-ov.bl'), br: v.el.querySelector('.dv-ov.br') };
        if (!item) { clearOverlays(v); return; }
        var ds = dataSetOf(item); var image = currentImage(v); var vs = null; try { vs = v.enabled ? cs().getViewport(v.host) : null; } catch (e) {}
        var pName = (ds && dcmName(ds.string('x00100010'))) || nameOf(patient) || String(item.meta.patientName || '');
        var pid = (ds && ds.string('x00100020')) || (patient && (patient.mrn || patient.id)) || item.meta.patientId || '';
        var dob = ds ? dcmDate(ds.string('x00100030')) : (patient && patient.dob ? fmtDate(patient.dob) : ''); var sex = (ds && ds.string('x00100040')) || sexOf(patient);
        var age = (ds && ds.string('x00101010')) || (patient && ageOf(patient.dob)) || '';
        o.tl.textContent = [pName.toUpperCase(), pid ? 'ID ' + pid : '', [dob, sex, age].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
        var st = item.study || currentStudy || {}; var sdesc = (ds && (ds.string('x00081030') || ds.string('x0008103e'))) || studyLabel(st);
        var sdate = ds && ds.string('x00080020') ? dcmDate(ds.string('x00080020')) + ' ' + dcmTime(ds.string('x00080030')) : (st.orderedAt ? fmtDate(st.orderedAt) : '');
        var modality = (ds && ds.string('x00080060')) || (item.kind === 'dicom' ? '' : item.kind === 'video' ? 'VIDEO' : 'IMG'); var inst = (ds && ds.string('x00080080')) || '';
        var series = ds ? [ds.string('x0008103e'), ds.string('x00180015'), ds.string('x00185101')].filter(Boolean).join(' · ') : '';
        o.tr.textContent = [sdesc.toUpperCase(), sdate, [modality, inst].filter(Boolean).join(' · '), series].filter(Boolean).join('\n');
        var lines = [];
        if (image) {
            var frames = v.imageIds.length || 1; lines.push('Frame: ' + ((v.frame || 0) + 1) + ' / ' + frames);
            lines.push('Zoom: ' + (vs ? Math.round(vs.scale * 100) : 100) + '%');
            if (vs && vs.voi && !image.color) lines.push('Window/Level: ' + Math.round(vs.voi.windowWidth) + '/' + Math.round(vs.voi.windowCenter));
            else if (vs && vs.voi) lines.push('Window/Level: ' + Math.round(vs.voi.windowWidth) + '/' + Math.round(vs.voi.windowCenter));
            if (vs && vs.rotation) lines.push('Rotation: ' + vs.rotation + '°' + (vs.hflip ? ' H' : '') + (vs.vflip ? ' V' : ''));
        } else if (item.kind === 'video') { lines.push('Video'); }
        o.bl.textContent = lines.join('\n');
        var br = []; if (image) { br.push(image.columns + ' × ' + image.rows + (image.color ? ' RGB' : (ds && ds.uint16('x00280100') ? ' · ' + ds.uint16('x00280101') + ' bit' : ''))); if (image.rowPixelSpacing) br.push('Pixel ' + Number(image.rowPixelSpacing).toFixed(3) + ' mm'); }
        br.push(String(item.meta.fileName || '')); if (item.meta.byName) br.push('by ' + item.meta.byName + (item.meta.at ? ' · ' + fmtDateTime(item.meta.at) : '')); o.br.textContent = br.join('\n');
        // orientation letters
        var ori = (orientOn && vs && ds) ? rotateOrientation(baseOrientation(ds), vs) : null;
        v.el.querySelector('.dv-orient.n').textContent = ori ? ori.top : ''; v.el.querySelector('.dv-orient.s').textContent = ori ? ori.bottom : ''; v.el.querySelector('.dv-orient.w').textContent = ori ? ori.left : ''; v.el.querySelector('.dv-orient.e').textContent = ori ? ori.right : '';
        // scale bar
        var sc = v.el.querySelector('.dv-scale');
        if (scaleOn && image && vs && vs.scale > 0) {
            var maxLen = Math.max(60, Math.min(160, v.el.clientHeight * 0.3)); var mm = image.rowPixelSpacing; var lenUnits, unitsPerPx, unit;
            if (mm) { unitsPerPx = mm / vs.scale; lenUnits = niceStep(maxLen, unitsPerPx); unit = lenUnits >= 10 ? (lenUnits / 10) + ' cm' : lenUnits + ' mm'; }
            else { unitsPerPx = 1 / vs.scale; lenUnits = niceStep(maxLen, unitsPerPx); unit = lenUnits + ' pix'; }
            var px = lenUnits / unitsPerPx; sc.style.display = ''; sc.querySelector('.dv-scale-lbl').textContent = unit; sc.querySelector('.dv-scale-bar').style.height = Math.round(px) + 'px';
        } else sc.style.display = 'none';
        // preliminary banner
        var pre = v.el.querySelector('.dv-prelim'); var rep = reportFor(item.study || currentStudy); var wantBanner = !!item && item.kind !== 'video' && !(rep && rep.status === 'final');
        if (wantBanner && !pre) { pre = el('div', 'dv-prelim', 'Preliminary — no signed report yet'); v.el.appendChild(pre); } else if (!wantBanner && pre) pre.remove();
        v.el.querySelectorAll('.dv-ov').forEach(function (n) { n.classList.toggle('dv-hidden', !overlaysOn); });
    }
    function updatePixelReadout(v, e) {
        var image = currentImage(v); if (!image || !v.enabled) return;
        try { var p = cs().pageToPixel(v.host, e.pageX, e.pageY); var x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= image.columns || y >= image.rows) { setStatus('pix', '—'); return; }
            var px = image.getPixelData(); var txt;
            if (image.color) { var i = (y * image.columns + x) * 4; txt = x + ',' + y + ' = RGB ' + px[i] + ' ' + px[i + 1] + ' ' + px[i + 2]; }
            else { var sp = px[y * image.columns + x]; var mo = sp * (image.slope || 1) + (image.intercept || 0); txt = x + ',' + y + ' = ' + Math.round(mo) + (image.intercept === -1024 ? ' HU' : ''); }
            setStatus('pix', txt); } catch (err) {}
    }

    /* ── tools ─────────────────────────────────────────────────── */
    function setLeftTool(name) {
        leftTool = name; if (cst() && viewports.some(function (v) { return v.enabled; })) applyBindings();
        root.querySelectorAll('.dv-tb[data-tool]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tool') === name); });
        var roiBtn = $('.dv-tb[data-id="roi"]'); if (roiBtn) roiBtn.classList.toggle('active', ['RectangleRoi', 'EllipticalRoi', 'FreehandRoi', 'Bidirectional', 'CobbAngle'].indexOf(name) !== -1);
        setStatus('tool', TOOL_LABEL[name] || name); if (sidePanel === 'tools' || sidePanel === 'draw') renderPanel();
    }
    function applyBindings() {
        var T = cst(); if (!T) return;
        Object.keys(LEFT_TOOLS).forEach(function (k) { var n = LEFT_TOOLS[k]; if (n !== leftTool && n !== 'Pan' && n !== 'Zoom') { try { T.setToolPassive(n); } catch (e) {} } });
        // Tool OPTIONS are merged in by setToolActive (not by addTool), so the edge policy
        // travels with every activation: a measurement dragged past the image edge is
        // clamped to the edge (Weasis behaviour), never silently discarded.
        var EDGE = { deleteIfHandleOutsideImage: false, preventHandleOutsideImage: true };
        try { T.setToolActive(leftTool, Object.assign({ mouseButtonMask: 1 }, EDGE)); } catch (e) {}
        try { T.setToolActive('Pan', { mouseButtonMask: leftTool === 'Pan' ? 1 | 4 : 4 }); } catch (e) {}
        try { T.setToolActive('Zoom', { mouseButtonMask: leftTool === 'Zoom' ? 1 | 2 : 2 }); } catch (e) {}
        MEASURE_TOOLS.forEach(function (m) { if (m !== leftTool) { try { T.setToolPassive(m, EDGE); } catch (e) {} } });
        try { if (wheelMode === 'zoom') { T.setToolDisabled('StackScrollMouseWheel'); T.setToolActive('ZoomMouseWheel', {}); } else { T.setToolDisabled('ZoomMouseWheel'); T.setToolActive('StackScrollMouseWheel', {}); } } catch (e) {}
        try { T.setToolActive('PanMultiTouch', {}); T.setToolActive('ZoomTouchPinch', {}); T.setToolActive('StackScrollMultiTouch', {}); } catch (e) {}
    }
    function withViewport(fn) { var v = vp(); if (!v || !v.enabled) return; var s = cs().getViewport(v.host); fn(s, v); cs().setViewport(v.host, s); }
    function zoomBy(f) { withViewport(function (s) { s.scale = clamp(s.scale * f, 0.05, 40); }); }
    function fitToWindow() { var v = vp(); if (!v || !v.enabled) return; var img = currentImage(v); if (!img) return; var s = cs().getViewport(v.host); var d = cs().getDefaultViewportForImage(v.host, img); s.scale = d.scale; s.translation = { x: 0, y: 0 }; cs().setViewport(v.host, s); }
    function resetView() { var v = vp(); if (!v || !v.enabled) return; cs().reset(v.host); var s = cs().getViewport(v.host); s.pixelReplication = interpOff; cs().setViewport(v.host, s); updateInvertButton(); }
    function rotate(deg) { withViewport(function (s) { s.rotation = ((s.rotation || 0) + deg + 360) % 360; }); }
    function flip(axis) { withViewport(function (s) { if (axis === 'h') s.hflip = !s.hflip; else s.vflip = !s.vflip; }); }
    function invert() { withViewport(function (s) { s.invert = !s.invert; }); updateInvertButton(); }
    function updateInvertButton() { var b = $('.dv-tb[data-id="invert"]'); var v = vp(); var on = false; try { on = !!(v && v.enabled && cs().getViewport(v.host).invert); } catch (e) {} if (b) b.classList.toggle('active', on); }
    function applyPreset(ww, wc) {
        var v = vp(); if (!v || !v.enabled) return; var img = currentImage(v); if (!img) return;
        withViewport(function (s) {
            if (ww === 'full') { var px = img.getPixelData(); var mn = Infinity, mx = -Infinity; for (var i = 0; i < px.length; i += 7) { if (px[i] < mn) mn = px[i]; if (px[i] > mx) mx = px[i]; } var lo = mn * (img.slope || 1) + (img.intercept || 0), hi = mx * (img.slope || 1) + (img.intercept || 0); s.voi = { windowWidth: Math.max(1, hi - lo), windowCenter: (hi + lo) / 2 }; }
            else if (ww == null) { s.voi = { windowWidth: img.windowWidth, windowCenter: img.windowCenter }; }
            else s.voi = { windowWidth: ww, windowCenter: wc };
        });
    }
    function setColormap(id) { withViewport(function (s) { s.colormap = id === 'gray' ? undefined : id; }); }
    function step(delta) { var v = vp(); if (!v || !v.item) return; if (v.imageIds.length > 1) gotoFrame(clamp((v.frame || 0) + delta, 0, v.imageIds.length - 1)); else stepFile(delta); }
    function stepFile(delta) { var v = vp(); var list = studyMedia(currentStudy); if (!v || !v.item || !list.length) return; var i = list.indexOf(v.item); var n = clamp(i + delta, 0, list.length - 1); if (n !== i) displayItem(list[n], v); }
    function gotoFrame(i) { var v = vp(); if (!v || !v.enabled || !v.imageIds.length) return; i = clamp(i, 0, v.imageIds.length - 1); if (i === v.frame) return; var st = cst().getToolState(v.host, 'stack'); if (st && st.data && st.data[0]) st.data[0].currentImageIdIndex = i; v.frame = i; cs().loadAndCacheImage(v.imageIds[i]).then(function (img) { if (v.frame !== i) return; if (v.item) v.item.image = img; cs().displayImage(v.host, img); updateCineBar(v); }).catch(function (e) { toast('Frame ' + (i + 1) + ': ' + (e && e.message || e), 'err'); }); }
    function updateCineBar(v) { var bar = $('.dv-cine'); if (!bar) return; var n = v && v.imageIds ? v.imageIds.length : 1; bar.querySelector('[data-cine="range"]').max = Math.max(0, n - 1); bar.querySelector('[data-cine="range"]').value = v ? (v.frame || 0) : 0; bar.querySelector('[data-cine="label"]').textContent = ((v && v.frame || 0) + 1) + ' / ' + n; }
    function toggleCine() { cine.on = !cine.on; $('.dv-cine').classList.toggle('on', cine.on); $('.dv-tb[data-id="cine"]').classList.toggle('active', cine.on); if (!cine.on) stopClip(); else updateCineBar(vp()); }
    function toggleCinePlay() { if (cine.playing) stopClip(); else playClip(); }
    function playClip() { var v = vp(); if (!v || !v.enabled) return; if (v.imageIds.length <= 1) { toast('This is a single-frame image — cine plays multi-frame files (ultrasound, fluoroscopy).'); return; } try { cst().playClip(v.host, cine.fps); cine.playing = true; $('.dv-cine [data-cine="play"]').classList.add('active'); } catch (e) { toast('Cine: ' + e.message, 'err'); } }
    function stopClip() { if (!cine.playing) return; try { viewports.forEach(function (v) { if (v.enabled) cst().stopClip(v.host); }); } catch (e) {} cine.playing = false; var b = $('.dv-cine [data-cine="play"]'); if (b) b.classList.remove('active'); }
    function toggleSync() {
        syncOn = !syncOn; $('.dv-tb[data-id="sync"]').classList.toggle('active', syncOn); var T = cst(); if (!T) return;
        if (synchronizers) { synchronizers.forEach(function (s) { try { s.destroy(); } catch (e) {} }); synchronizers = null; }
        if (syncOn) { synchronizers = [new T.Synchronizer('cornerstoneimagerendered', T.panZoomSynchronizer), new T.Synchronizer('cornerstoneimagerendered', T.wwwcSynchronizer)]; viewports.forEach(function (v) { if (v.enabled) synchronizers.forEach(function (s) { s.add(v.host); }); }); toast('Viewports synchronised (zoom, pan, window/level).', 'ok'); }
    }
    function deleteMeasurements(which) {
        var v = vp(); if (!v || !v.enabled) return; var T = cst(); var removed = 0;
        MEASURE_TOOLS.forEach(function (t) { var st = T.getToolState(v.host, t); if (!st || !st.data) return; if (which === 'all') { removed += st.data.length; T.clearToolState(v.host, t); } else { st.data.slice().forEach(function (d) { if (d.active) { T.removeToolState(v.host, t, d); removed++; } }); } });
        cs().updateImage(v.host); if (sidePanel === 'draw') renderPanel(); toast(removed ? removed + ' measurement' + (removed === 1 ? '' : 's') + ' removed.' : (which === 'all' ? 'No measurements on this image.' : 'Select a measurement first (click it), then delete.'));
    }
    var measureSeq = 0;
    function measurementsOf(v) { var out = []; var T = cst(); if (!T || !v || !v.enabled) return out; MEASURE_TOOLS.forEach(function (t) { var st = T.getToolState(v.host, t); if (st && st.data) st.data.forEach(function (d, i) { if (!d._pcSeq) d._pcSeq = ++measureSeq; out.push({ tool: t, data: d, index: i }); }); }); out.sort(function (a, b) { return a.data._pcSeq - b.data._pcSeq; }); return out; }

    /* ── menus ─────────────────────────────────────────────────── */
    function openMenu(anchor, items) {
        closeMenu(); menuEl = el('div', 'dv-menu'); menuEl.setAttribute('role', 'menu');
        items.forEach(function (it) {
            if (it === '-') { menuEl.appendChild(el('div', 'dv-msep')); return; } if (it.header) { menuEl.appendChild(el('div', 'dv-mh', it.header)); return; }
            var b = el('button', 'dv-mi' + (it.active ? ' active' : '')); b.setAttribute('role', 'menuitem'); if (it.icon) b.appendChild(icon(it.icon)); b.appendChild(el('span', null, it.label)); if (it.k) b.appendChild(el('span', 'dv-k', it.k));
            b.onclick = function () { closeMenu(); it.run(); }; menuEl.appendChild(b);
        });
        document.body.appendChild(menuEl); var r = anchor.getBoundingClientRect(); menuEl.style.left = Math.min(r.left, window.innerWidth - menuEl.offsetWidth - 8) + 'px'; menuEl.style.top = (r.bottom + 4) + 'px';
        docClickBound = function (e) { if (menuEl && !menuEl.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeMenu(); }; setTimeout(function () { document.addEventListener('pointerdown', docClickBound, true); }, 0);
    }
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } if (docClickBound) { document.removeEventListener('pointerdown', docClickBound, true); docClickBound = null; } }
    function layoutMenu() { return [{ header: 'Viewports' }].concat([[1, 1, '1 × 1'], [1, 2, '1 × 2'], [2, 1, '2 × 1'], [2, 2, '2 × 2'], [1, 3, '1 × 3'], [2, 3, '2 × 3']].map(function (l) { return { label: l[2], icon: 'layout', active: layoutSpec[0] === l[0] && layoutSpec[1] === l[1], run: function () { maximised = null; applyLayout(l[0], l[1]); } }; })).concat(['-', { label: 'Compare: current study side by side', icon: 'sync', run: compareSideBySide }]); }
    function roiMenu() { return [{ header: 'Region of interest' }, { label: 'Rectangle ROI (area, mean ± SD)', icon: 'roi', active: leftTool === 'RectangleRoi', run: function () { setLeftTool('RectangleRoi'); } }, { label: 'Ellipse ROI', icon: 'ellipse', active: leftTool === 'EllipticalRoi', run: function () { setLeftTool('EllipticalRoi'); } }, { label: 'Freehand ROI', icon: 'freehand', active: leftTool === 'FreehandRoi', run: function () { setLeftTool('FreehandRoi'); } }, '-', { header: 'Distances & angles' }, { label: 'Bidirectional (long × short axis)', icon: 'bidir', active: leftTool === 'Bidirectional', run: function () { setLeftTool('Bidirectional'); } }, { label: 'Cobb angle', icon: 'angle', active: leftTool === 'CobbAngle', run: function () { setLeftTool('CobbAngle'); } }, { label: 'W/L from region', icon: 'wl', active: leftTool === 'WwwcRegion', run: function () { setLeftTool('WwwcRegion'); } }]; }
    function deleteMenu() { return [{ label: 'Delete selected measurement', icon: 'trash', k: 'Del', run: function () { deleteMeasurements('selected'); } }, { label: 'Delete all measurements on this image', icon: 'trash', run: function () { deleteMeasurements('all'); } }, '-', { label: 'Eraser tool (click a measurement)', icon: 'eraser', active: leftTool === 'Eraser', run: function () { setLeftTool('Eraser'); } }]; }
    function rotateMenu() { return [{ label: 'Rotate 90° clockwise', icon: 'rotate', k: 'R', run: function () { rotate(90); } }, { label: 'Rotate 90° counter-clockwise', icon: 'rotate', k: '⇧R', run: function () { rotate(-90); } }, { label: 'Rotate 180°', icon: 'rotate', run: function () { rotate(180); } }, '-', { label: 'Flip horizontal', icon: 'flip', k: 'H', run: function () { flip('h'); } }, { label: 'Flip vertical', icon: 'flip', k: 'V', run: function () { flip('v'); } }, '-', { label: 'Free rotate (drag tool)', icon: 'rotate', active: leftTool === 'Rotate', run: function () { setLeftTool('Rotate'); } }, { label: 'Reset orientation', icon: 'reset', run: function () { withViewport(function (s) { s.rotation = 0; s.hflip = false; s.vflip = false; }); } }]; }
    function presetMenu() {
        var img = currentImage(); var ds = dataSetOf(vp() && vp().item); var mod = (ds && ds.string('x00080060')) || ''; var list = PRESETS[mod] || PRESETS.default; if (mod === 'CT') list = [['Default', null, null], ['Full range', 'full', 'full']].concat(list);
        var items = [{ header: 'Window / level' + (mod ? ' · ' + mod : '') }].concat(list.map(function (p) { return { label: p[0] + (typeof p[1] === 'number' ? '  (W ' + p[1] + ' / L ' + p[2] + ')' : ''), icon: 'presets', run: function () { applyPreset(p[1], p[2]); } }; }));
        items.push('-'); items.push({ header: 'Colour map' }); COLORMAPS.forEach(function (c) { items.push({ label: c[1], icon: 'display', run: function () { setColormap(c[0]); } }); });
        items.push('-'); items.push({ label: 'Invert', icon: 'invert', k: 'I', run: invert }); if (!img) items.unshift({ label: '(load an image first)', run: function () {} });
        return items;
    }
    function exportMenu() { return [{ label: 'Screenshot (PNG, with measurements)', icon: 'camera', run: exportScreenshot }, { label: 'Download original file', icon: 'download', run: downloadOriginal }, { label: 'Print image', icon: 'print', run: printImage }, '-', { label: 'Copy study summary', icon: 'report', run: copySummary }]; }

    /* ── export ────────────────────────────────────────────────── */
    function compositeCanvas(v) {
        var en = cs().getEnabledElement(v.host); var src = en.canvas; var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; var ctx = c.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0);
        var ratio = src.width / Math.max(1, v.host.clientWidth); ctx.font = Math.round(12 * ratio) + 'px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3 * ratio;
        function block(text, x, y, right, bottom) { var lines = String(text || '').split('\n'); var lh = 15 * ratio; lines.forEach(function (l, i) { var w = ctx.measureText(l).width; var yy = bottom ? y - (lines.length - 1 - i) * lh : y + i * lh; ctx.fillText(l, right ? x - w : x, yy); }); }
        var ovs = v.el.querySelectorAll('.dv-ov'); if (overlaysOn) { block(ovs[0].textContent, 10 * ratio, 20 * ratio); block(ovs[1].textContent, c.width - 10 * ratio, 20 * ratio, true); block(ovs[2].textContent, 10 * ratio, c.height - 12 * ratio, false, true); block(ovs[3].textContent, c.width - 10 * ratio, c.height - 12 * ratio, true, true); }
        return c;
    }
    function exportScreenshot() { var v = vp(); if (!v || !v.enabled) { toast('Load an image first.'); return; } try { var c = compositeCanvas(v); c.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (nameOf(patient) || 'study').replace(/\s+/g, '_') + '_' + (v.item.meta.fileName || 'image').replace(/\.[^.]+$/, '') + '.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); toast('Screenshot saved.', 'ok'); }, 'image/png'); } catch (e) { toast('Screenshot failed: ' + e.message, 'err'); } }
    function downloadOriginal() { var v = vp(); if (!v || !v.item || !v.item.url) { toast('Load an image first.'); return; } var it = v.item; fetch(it.url).then(function (r) { return r.blob(); }).then(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = it.meta.fileName || (it.id + '.' + (it.meta.ext || 'bin')); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }).catch(function () { window.open(it.url, '_blank', 'noopener'); }); }
    function printImage() { var v = vp(); if (!v || !v.enabled) { toast('Load an image first.'); return; } var c = compositeCanvas(v); var w = window.open('', '_blank', 'width=900,height=1000'); if (!w) { toast('Allow pop-ups to print.', 'err'); return; } w.document.write('<!DOCTYPE html><html><head><title>PClinic — ' + (nameOf(patient) || 'Study image') + '</title><style>body{margin:0;background:#fff;font:12px sans-serif;color:#111}img{max-width:100%;display:block;margin:0 auto}h1{font-size:14px;margin:10px 12px}</style></head><body><h1>' + esc(nameOf(patient)) + ' · ' + esc(studyLabel(currentStudy)) + ' · ' + esc(v.item.meta.fileName || '') + '</h1><img src="' + c.toDataURL('image/png') + '"></body></html>'); w.document.close(); setTimeout(function () { w.focus(); w.print(); }, 300); }
    function copySummary() { var rep = reportFor(currentStudy); var txt = [nameOf(patient) + (patient && patient.mrn ? ' · MRN ' + patient.mrn : ''), studyLabel(currentStudy) + (currentStudy && currentStudy.orderedAt ? ' · ' + fmtDate(currentStudy.orderedAt) : ''), rep ? ('Report (' + rep.status + '): ' + (rep.impression || rep.findings || '')) : 'No signed report yet.', 'Files: ' + studyMedia(currentStudy).map(function (m) { return m.meta.fileName; }).join(', ')].join('\n'); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Summary copied.', 'ok'); }, function () { window.prompt('Copy:', txt); }); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    /* ── explorer rendering ────────────────────────────────────── */
    function studyMedia(study) { return (study && mediaByStudy[study.id]) ? mediaByStudy[study.id].set : []; }
    function renderExplorer() {
        if (!root) return; var tree = $('.dv-tree'), tags = $('.dv-tags'); root.querySelectorAll('[data-extab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-extab') === explorerTab); });
        tree.style.display = explorerTab === 'studies' ? '' : 'none'; tags.style.display = explorerTab === 'tags' ? '' : 'none';
        if (explorerTab === 'tags') renderTags();
        tree.replaceChildren();
        if (!patient) { var e0 = el('div', 'dv-empty'); e0.innerHTML = '<b>No patient selected.</b><br>Search a patient above, or select one in the identification bar.'; tree.appendChild(e0); return; }
        var pn = el('div', 'dv-node patient'); var pr = el('div', 'dv-row'); pr.appendChild(el('span', 'dv-tw', '▾')); pr.appendChild(el('span', 'dv-lbl', nameOf(patient).toUpperCase())); pr.appendChild(el('span', 'dv-meta', (patient.mrn || patient.id || '') + ' ' + [sexOf(patient), ageOf(patient.dob)].filter(Boolean).join(' '))); pn.appendChild(pr); tree.appendChild(pn);
        if (!studies.length) { var e1 = el('div', 'dv-empty'); e1.innerHTML = '<b>No imaging study for this patient yet.</b><br>Images can be attached once a clinician has placed an imaging request.'; tree.appendChild(e1); return; }
        studies.forEach(function (s) {
            var isCur = currentStudy && currentStudy.id === s.id; var sn = el('div', 'dv-node study' + (isCur ? ' active' : '')); var sr = el('div', 'dv-row'); sr.appendChild(el('span', 'dv-tw', isCur ? '▾' : '▸'));
            sr.appendChild(el('span', 'dv-lbl', studyLabel(s) + (s.orderedAt ? ' · ' + fmtDate(s.orderedAt) : ''))); if (s.state) sr.appendChild(el('span', 'dv-pill ' + s.state, s.state)); sr.onclick = function () { selectStudy(s); }; sn.appendChild(sr);
            if (isCur) {
                var rec = mediaByStudy[s.id];
                if (!rec || rec.loading) sn.appendChild(el('div', 'dv-empty', 'Loading files…'));
                else if (rec.error) { var er = el('div', 'dv-empty'); er.textContent = 'Could not load images: ' + rec.error; sn.appendChild(er); }
                else if (!rec.set.length) { var em = el('div', 'dv-empty'); em.innerHTML = '<b>No images attached to this study yet.</b>' + (openOpts.canManage ? '<br>Use <b>Upload</b> in the tool bar to attach JPEG/PNG or DICOM files.' : ''); sn.appendChild(em); }
                else {
                    var th = el('div', 'dv-thumbs');
                    rec.set.forEach(function (item) {
                        var t = el('div', 'dv-thumb' + (currentItem && currentItem.id === item.id ? ' active' : '')); t.setAttribute('data-id', item.id); t.title = (item.meta.fileName || item.id) + (item.meta.byName ? '\nby ' + item.meta.byName : '') + (item.meta.at ? '\n' + fmtDateTime(item.meta.at) : '') + (item.problem ? '\n⚠ ' + item.problem.split('\n')[0] : ''); t.draggable = true;
                        if (item.thumb) { t.appendChild(item.thumb.cloneNode(true)); } else if (item.kind === 'image' && item.url) { t.style.backgroundImage = 'url("' + item.url + '")'; } else t.textContent = item.kind === 'video' ? '▶' : item.kind === 'dicom' ? 'DCM' : '?';
                        if (!item.url) t.textContent = '⚠'; if (item.frames > 1) t.appendChild(el('span', 'dv-fr', item.frames + 'f'));
                        t.appendChild(el('span', 'dv-tn', item.meta.fileName || item.id)); t.onclick = function () { displayItem(item); }; t.ondragstart = function (e) { dragItem = item; e.dataTransfer.setData('text/plain', item.id); }; t.ondragend = function () { dragItem = null; };
                        if (openOpts.canManage) { t.oncontextmenu = function (e) { e.preventDefault(); openMenu(t, [{ label: 'Open in active viewport', icon: 'display', run: function () { displayItem(item); } }, { label: 'Download', icon: 'download', run: function () { displayItem(item); setTimeout(downloadOriginal, 300); } }, '-', { label: 'Remove this file from the study', icon: 'trash', run: function () { removeItem(item); } }]); }; }
                        th.appendChild(t);
                    }); sn.appendChild(th);
                }
            }
            tree.appendChild(sn);
        });
    }
    function markThumbActive(id) { root.querySelectorAll('.dv-thumb').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-id') === String(id)); }); }
    function ensureThumb(item, image) { if (item.thumb || !image || !cs().renderToCanvas) return; try { var c = document.createElement('canvas'); var s = 96 / Math.max(image.width, image.height); c.width = Math.max(1, Math.round(image.width * s)); c.height = Math.max(1, Math.round(image.height * s)); cs().renderToCanvas(c, image); item.thumb = c; var t = root.querySelector('.dv-thumb[data-id="' + item.id + '"]'); if (t) { t.textContent = ''; t.style.backgroundImage = ''; t.appendChild(c.cloneNode(true)); if (item.frames > 1) t.appendChild(el('span', 'dv-fr', item.frames + 'f')); t.appendChild(el('span', 'dv-tn', item.meta.fileName || item.id)); } } catch (e) {} }
    function renderPatientSearch(q) {
        var box = $('.dv-patient-results'); if (!box) return; box.replaceChildren(); q = String(q || '').trim().toLowerCase(); if (q.length < 2) { box.style.display = 'none'; return; }
        var list = []; try { list = (typeof window.getPatients === 'function' ? window.getPatients() : []) || []; } catch (e) {}
        var hits = list.filter(function (p) { return (nameOf(p) + ' ' + (p.mrn || '') + ' ' + (p.id || '') + ' ' + (p.nationalId || '')).toLowerCase().indexOf(q) !== -1; }).slice(0, 12);
        box.style.display = ''; box.className = 'dv-patient-results dv-tree'; box.style.flex = '0 0 auto'; box.style.maxHeight = '40%'; box.style.borderBottom = '1px solid var(--dv-line)';
        if (!hits.length) { box.appendChild(el('div', 'dv-empty', 'No patient matches “' + q + '”.')); return; }
        box.appendChild(el('div', 'dv-exp-head', hits.length + ' patient' + (hits.length === 1 ? '' : 's')));
        hits.forEach(function (p) { var r = el('div', 'dv-row'); r.style.padding = '6px 8px'; r.appendChild(el('span', 'dv-lbl', nameOf(p))); r.appendChild(el('span', 'dv-meta', 'MRN ' + (p.mrn || p.id || ''))); r.onclick = function () { box.style.display = 'none'; var inp = $('[data-search="patient"]'); if (inp) inp.value = ''; selectPatient(p, { announce: true }); }; box.appendChild(r); });
    }
    function renderTags() {
        var box = $('.dv-tags'); box.replaceChildren(); var q = String(($('[data-search="tags"]') || {}).value || '').trim().toLowerCase();
        var item = vp() && vp().item; var ds = dataSetOf(item);
        if (!item) { box.appendChild(el('div', 'dv-empty', 'Load an image to browse its DICOM tags.')); return; }
        if (!ds) { var rows = [['File', item.meta.fileName], ['Type', item.kind], ['MIME', item.meta.mime], ['Size', bytesOf(item.meta.bytes)], ['Uploaded', fmtDateTime(item.meta.at)], ['By', item.meta.byName]]; box.appendChild(el('div', 'dv-empty', 'Not a DICOM file — no DICOM tags. File record:')); rows.forEach(function (r) { var t = el('div', 'dv-tag'); t.appendChild(el('span', 'dv-tk', r[0])); t.appendChild(el('span', 'dv-tv', String(r[1] || '—'))); box.appendChild(t); }); return; }
        var keys = Object.keys(ds.elements).sort(); var n = 0;
        keys.forEach(function (k) {
            var e = ds.elements[k]; var tag = '(' + k.slice(1, 5).toUpperCase() + ',' + k.slice(5, 9).toUpperCase() + ')'; var name = DICT[k] || (k.slice(1, 3) === '00' && k.slice(5, 7) === '00' ? 'Group Length' : 'Private / other'); var val;
            if (k === 'x7fe00010') val = '[pixel data, ' + bytesOf(e.length) + ']'; else if (e.items) val = '[sequence, ' + e.items.length + ' item' + (e.items.length === 1 ? '' : 's') + ']'; else if (e.length > 128) val = '[' + bytesOf(e.length) + ']'; else { try { val = ds.string(k); } catch (err) { val = ''; } if (val == null || val === '') { try { if (e.length === 2) val = String(ds.uint16(k)); else if (e.length === 4) val = String(ds.uint32(k)); } catch (err2) {} } if (val == null) val = ''; if (/[^\x20-\x7e\\]/.test(val)) val = '[binary, ' + e.length + ' B]'; }
            var hay = (tag + ' ' + name + ' ' + val).toLowerCase(); if (q && hay.indexOf(q) === -1) return; n++;
            var row = el('div', 'dv-tag'); var left = el('span'); left.appendChild(el('span', 'dv-tk', tag)); left.appendChild(document.createTextNode(' ')); left.appendChild(el('span', 'dv-tn', name)); row.appendChild(left); row.appendChild(el('span', 'dv-tv' + (/^-?[\d.\\]+$/.test(val) ? ' dv-num' : ''), val)); box.appendChild(row);
        });
        if (!n) box.appendChild(el('div', 'dv-empty', 'No tag matches “' + q + '”.'));
    }

    /* ── side panels ───────────────────────────────────────────── */
    function openSidePanel(name) { sidePanel = name; $('.dv-panel').classList.toggle('open', !!name); root.querySelectorAll('.dv-stab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-stab') === name); }); if (name) renderPanel(); setTimeout(function () { viewports.forEach(function (v) { if (v.enabled) { try { cs().resize(v.host, true); } catch (e) {} } }); }, 30); }
    function refreshPanels() { if (sidePanel) renderPanel(); if (explorerTab === 'tags') renderTags(); updateInvertButton(); }
    function renderPanel() {
        var body = $('.dv-panel-body'), title = $('.dv-panel-title'); if (!body) return; body.replaceChildren();
        var v = vp(); var img = currentImage(v); var item = v && v.item; var vs = null; try { vs = v && v.enabled ? cs().getViewport(v.host) : null; } catch (e) {}
        function sec(t) { var s = el('div', 'dv-sec'); if (t) s.appendChild(el('h4', null, t)); body.appendChild(s); return s; }
        function chip(parent, label, active, run, cls) { var c = el('button', 'dv-chip' + (active ? ' active' : '') + (cls ? ' ' + cls : ''), label); c.onclick = run; parent.appendChild(c); return c; }
        function toggle(parent, label, on, run) { var r = el('div', 'dv-toggle'); r.appendChild(el('span', null, label)); var sw = el('button', 'dv-sw' + (on ? ' on' : '')); sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.onclick = function () { run(!on); renderPanel(); }; r.appendChild(sw); parent.appendChild(r); }
        function field(parent, label, min, max, val, stepv, oninput, fmt) { var f = el('div', 'dv-field dv-two'); f.appendChild(el('label', null, label)); var i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = stepv || 1; i.value = val; var out = el('span', 'dv-val', fmt ? fmt(val) : String(val)); i.oninput = function () { oninput(parseFloat(i.value)); out.textContent = fmt ? fmt(parseFloat(i.value)) : i.value; }; f.appendChild(i); f.appendChild(out); parent.appendChild(f); }
        if (sidePanel === 'display') {
            title.textContent = 'Display';
            var s1 = sec('Window / level'); var row = el('div', 'dv-btnrow'); s1.appendChild(row); var ds = dataSetOf(item); var mod = (ds && ds.string('x00080060')) || ''; var list = PRESETS[mod] || PRESETS.default; if (mod === 'CT') list = [['Default', null, null], ['Full range', 'full', 'full']].concat(list);
            list.forEach(function (p) { chip(row, p[0], false, function () { applyPreset(p[1], p[2]); renderPanel(); }); });
            if (vs && vs.voi && img) { var range = img.color ? 512 : Math.max(4096, Math.abs(vs.voi.windowWidth) * 2); field(s1, 'Width', 1, range, Math.round(vs.voi.windowWidth), 1, function (x) { withViewport(function (s) { s.voi.windowWidth = x; }); }); field(s1, 'Level', Math.round(-range / 2), Math.round(range), Math.round(vs.voi.windowCenter), 1, function (x) { withViewport(function (s) { s.voi.windowCenter = x; }); }); }
            var s2 = sec('Colour map'); var r2 = el('div', 'dv-btnrow'); s2.appendChild(r2); COLORMAPS.forEach(function (c) { chip(r2, c[1], vs && ((vs.colormap || 'gray') === c[0] || (vs.colormap && vs.colormap.getId && vs.colormap.getId() === c[0])), function () { setColormap(c[0]); renderPanel(); }); });
            var s3 = sec('Image'); toggle(s3, 'Invert grey scale', !!(vs && vs.invert), function () { invert(); }); toggle(s3, 'Smooth interpolation', !interpOff, function (on) { interpOff = !on; viewports.forEach(function (x) { if (x.enabled) { var st = cs().getViewport(x.host); st.pixelReplication = interpOff; cs().setViewport(x.host, st); } }); });
            var s4 = sec('Overlays'); toggle(s4, 'Patient / study text', overlaysOn, function (on) { overlaysOn = on; viewports.forEach(drawTextOverlays); }); toggle(s4, 'Scale bar', scaleOn, function (on) { scaleOn = on; viewports.forEach(drawTextOverlays); }); toggle(s4, 'Orientation letters', orientOn, function (on) { orientOn = on; viewports.forEach(drawTextOverlays); });
            if (vs) { var s5 = sec('Orientation'); var r5 = el('div', 'dv-btnrow'); s5.appendChild(r5); chip(r5, '↻ 90°', false, function () { rotate(90); }); chip(r5, '↺ 90°', false, function () { rotate(-90); }); chip(r5, 'Flip H', !!vs.hflip, function () { flip('h'); renderPanel(); }); chip(r5, 'Flip V', !!vs.vflip, function () { flip('v'); renderPanel(); }); chip(r5, 'Reset', false, function () { resetView(); renderPanel(); }); }
        } else if (sidePanel === 'tools') {
            title.textContent = 'Image Tools';
            var t1 = sec('Left mouse / one finger'); var r1 = el('div', 'dv-btnrow'); t1.appendChild(r1); ['Wwwc', 'Pan', 'Zoom', 'Magnify', 'Rotate', 'StackScroll', 'WwwcRegion'].forEach(function (n) { chip(r1, TOOL_LABEL[n], leftTool === n, function () { setLeftTool(n); }); });
            var t2 = sec('Mouse wheel / two fingers'); var r22 = el('div', 'dv-btnrow'); t2.appendChild(r22); chip(r22, 'Scroll frames / images', wheelMode === 'scroll', function () { wheelMode = 'scroll'; applyBindings(); renderPanel(); }); chip(r22, 'Zoom', wheelMode === 'zoom', function () { wheelMode = 'zoom'; applyBindings(); renderPanel(); });
            var t3 = sec('Fixed bindings'); t3.appendChild(el('div', 'dv-note', 'Middle mouse: pan · Right mouse: zoom · Pinch: zoom · Two-finger drag: pan · Double-click a viewport: maximise / restore · Keys: ← → frames, + − zoom, R rotate, H/V flip, I invert, F full screen, Del delete selected measurement, Space cine, Esc close.'));
            var t4 = sec('Viewports'); var r4 = el('div', 'dv-btnrow'); t4.appendChild(r4); [[1, 1], [1, 2], [2, 1], [2, 2]].forEach(function (l) { chip(r4, l[0] + ' × ' + l[1], layoutSpec[0] === l[0] && layoutSpec[1] === l[1], function () { maximised = null; applyLayout(l[0], l[1]); renderPanel(); }); }); toggle(t4, 'Synchronise zoom / pan / W-L', syncOn, function () { toggleSync(); });
            var t5 = sec('Reset'); var r55 = el('div', 'dv-btnrow'); t5.appendChild(r55); chip(r55, 'Reset this viewport', false, resetView); chip(r55, 'Reset all viewports', false, function () { viewports.forEach(function (x) { if (x.enabled) cs().reset(x.host); }); }); chip(r55, 'Clear all viewports', false, function () { clearAllViewports(); renderPanel(); }, 'danger');
        } else if (sidePanel === 'draw') {
            title.textContent = 'Draw & Measure';
            var d1 = sec('Tools'); var rd = el('div', 'dv-btnrow'); d1.appendChild(rd); ['Length', 'Angle', 'CobbAngle', 'RectangleRoi', 'EllipticalRoi', 'FreehandRoi', 'Bidirectional', 'Probe', 'ArrowAnnotate', 'Eraser'].forEach(function (n) { chip(rd, TOOL_LABEL[n], leftTool === n, function () { setLeftTool(n); }); });
            var d2 = sec('Measurements on this image'); var ms = measurementsOf(v);
            if (!item) d2.appendChild(el('div', 'dv-note', 'Load an image first.')); else if (!ms.length) d2.appendChild(el('div', 'dv-note', 'None yet. Pick a tool above and draw on the image. Click a drawing to select it; drag its handles to adjust.'));
            else { var lst = el('div', 'dv-mlist'); ms.forEach(function (m, i) { var r = el('div', 'dv-mi-row' + (m.data.active ? ' active' : '')); var ic = el('span', 'dv-mi-ico'); ic.appendChild(icon({ Length: 'ruler', Angle: 'angle', CobbAngle: 'angle', RectangleRoi: 'roi', EllipticalRoi: 'ellipse', FreehandRoi: 'freehand', Bidirectional: 'bidir', Probe: 'probe', ArrowAnnotate: 'arrow' }[m.tool] || 'draw')); r.appendChild(ic); var tx = el('span', 'dv-mi-txt'); tx.appendChild(el('b', null, (i + 1) + '. ' + TOOL_LABEL[m.tool])); tx.appendChild(el('span', null, describeMeasurement(m.tool, m.data, img))); r.appendChild(tx); var del = el('button', 'dv-mi-del', '✕'); del.title = 'Delete'; del.onclick = function () { cst().removeToolState(v.host, m.tool, m.data); cs().updateImage(v.host); renderPanel(); }; r.appendChild(del); r.onclick = function (e) { if (e.target === del) return; ms.forEach(function (o) { o.data.active = o === m; }); cs().updateImage(v.host); renderPanel(); }; lst.appendChild(r); }); d2.appendChild(lst); var rr = el('div', 'dv-btnrow'); rr.style.marginTop = '8px'; d2.appendChild(rr); chip(rr, 'Delete all', false, function () { deleteMeasurements('all'); }, 'danger'); }
            var d3 = sec('Units'); d3.appendChild(el('div', 'dv-note', img && img.rowPixelSpacing ? 'Pixel spacing ' + Number(img.rowPixelSpacing).toFixed(3) + ' mm — lengths in mm, areas in mm².' + (img.intercept === -1024 ? ' CT values in HU.' : '') : 'No pixel spacing in this file — lengths are in pixels, areas in px². (Plain JPEG/PNG exports never carry calibration.)'));
            var d4 = sec('Saving'); d4.appendChild(el('div', 'dv-note', 'Saving measurements and key images to the common server arrives in the next update; for now export a screenshot to keep them.'));
        } else if (sidePanel === 'info') {
            title.textContent = 'Study Info'; var kv = el('div', 'dv-kv'); body.appendChild(kv);
            function k(a, b) { if (b == null || b === '') return; kv.appendChild(el('span', 'k', a)); kv.appendChild(el('span', 'v', String(b))); }
            k('Patient', nameOf(patient)); k('MRN / ID', patient && (patient.mrn || patient.id)); k('Sex / age', patient && [sexOf(patient), ageOf(patient.dob)].filter(Boolean).join(' · ')); k('DOB', patient && patient.dob ? fmtDate(patient.dob) : '');
            if (currentStudy) { k('Study', studyLabel(currentStudy)); k('Requested', currentStudy.orderedAt ? fmtDateTime(currentStudy.orderedAt) : ''); k('Status', currentStudy.state); k('Priority', currentStudy.priority); k('Order id', currentStudy.id); k('Files', studyMedia(currentStudy).length); }
            if (item) { var ds2 = dataSetOf(item); k('File', item.meta.fileName); k('Type', item.kind.toUpperCase()); k('MIME', item.meta.mime); k('Size', bytesOf(item.meta.bytes)); k('Uploaded', fmtDateTime(item.meta.at)); k('By', item.meta.byName); if (ds2) { k('Modality', ds2.string('x00080060')); k('Description', ds2.string('x00081030')); k('Series', ds2.string('x0008103e')); k('Body part', ds2.string('x00180015')); k('View', ds2.string('x00185101')); k('Institution', ds2.string('x00080080')); k('Manufacturer', [ds2.string('x00080070'), ds2.string('x00081090')].filter(Boolean).join(' ')); k('Acquired', ds2.string('x00080020') ? dcmDate(ds2.string('x00080020')) + ' ' + dcmTime(ds2.string('x00080030')) : ''); k('Matrix', ds2.uint16('x00280011') + ' × ' + ds2.uint16('x00280010')); k('Frames', item.frames); k('Bits', ds2.uint16('x00280101') + '/' + ds2.uint16('x00280100')); k('Pixel spacing', ds2.string('x00280030') || ds2.string('x00181164')); k('Photometric', ds2.string('x00280004')); k('Transfer syntax', ds2.string('x00020010')); k('Accession', ds2.string('x00080050')); k('Study UID', ds2.string('x0020000d')); k('SOP UID', ds2.string('x00080018')); } if (img) k('Displayed', img.columns + ' × ' + img.rows); if (item.mode) k('Link', item.signed && item.signed.mode); }
            var b2 = el('div', 'dv-btnrow'); b2.style.marginTop = '12px'; body.appendChild(b2); var bt = el('button', 'dv-chip', 'Browse all DICOM tags'); bt.onclick = function () { explorerTab = 'tags'; if (!explorerOpen) toggleExplorer(); renderExplorer(); }; b2.appendChild(bt);
        } else if (sidePanel === 'report') {
            title.textContent = 'Report'; var rep = reportFor(currentStudy); var wrap = el('div', 'dv-report'); body.appendChild(wrap);
            if (!currentStudy) { wrap.appendChild(el('div', 'dv-note', 'Select a study.')); return; }
            wrap.appendChild(el('div', null, studyLabel(currentStudy) + (currentStudy.orderedAt ? ' · ' + fmtDate(currentStudy.orderedAt) : '')));
            if (!rep) { var st0 = el('span', 'dv-status none', 'No report yet'); wrap.appendChild(st0); wrap.appendChild(el('p', 'dv-note', 'Radiology has not written a report for this study. Images shown are preliminary.')); return; }
            wrap.appendChild(el('span', 'dv-status ' + (rep.status === 'final' ? 'final' : 'draft'), rep.status === 'final' ? 'Final · signed' : 'Draft — not signed'));
            if (rep.critical) { var al = alertFor(rep); wrap.appendChild(el('div', 'dv-crit', '⚠ Critical result' + (rep.notifiedTo ? ' · notified ' + rep.notifiedTo : '') + (al && al.acknowledged ? ' · acknowledged' : ''))); }
            [['Indication', rep.indication], ['Technique', rep.technique], ['Comparison', rep.comparison], ['Findings', rep.findings], ['Impression', rep.impression]].forEach(function (f) { if (!f[1]) return; wrap.appendChild(el('h5', null, f[0])); wrap.appendChild(el('pre', null, f[1])); });
            var add = addendaFor(rep); if (add.length) { wrap.appendChild(el('h5', null, 'Addenda')); add.forEach(function (a) { wrap.appendChild(el('pre', null, (a.text || a.body || '') + '\n— ' + (a.byName || a.signedByName || '') + ' · ' + fmtDateTime(a.at || a.signedAt))); }); }
            wrap.appendChild(el('div', 'dv-sig', (rep.status === 'final' ? 'Signed by ' + (rep.signedByName || rep.byName || 'Radiology') + ' · ' + fmtDateTime(rep.signedAt || rep.finalizedAt || rep.updatedAt) : 'Last saved ' + fmtDateTime(rep.updatedAt || rep.savedAt))));
            if (rep.status === 'final' && typeof openOpts.onPrintReport === 'function') { var pb = el('button', 'dv-chip', 'Print / PDF'); pb.style.marginTop = '10px'; pb.onclick = function () { openOpts.onPrintReport(rep); }; wrap.appendChild(pb); }
        }
    }
    function reportFor(study) { var R = window.pcRadiology; if (!study || !R || typeof R.reportForOrder !== 'function') return null; try { return R.reportForOrder(study.id) || null; } catch (e) { return null; } }
    function addendaFor(rep) { var R = window.pcRadiology; if (!rep || !R || typeof R.addendaForReport !== 'function') return []; try { return R.addendaForReport(rep.id) || []; } catch (e) { return []; } }
    function alertFor(rep) { var R = window.pcRadiology; if (!rep || !R || typeof R.alertForReport !== 'function') return null; try { return R.alertForReport(rep.id) || null; } catch (e) { return null; } }

    /* ── patient / study selection ─────────────────────────────── */
    function selectPatient(p, opts) {
        opts = opts || {}; patient = p || null; setStatus('patient', patient ? nameOf(patient) + (patient.mrn ? ' · ' + patient.mrn : '') : '—');
        var live = studiesForPatient(patient);
        if (openOpts.studies && openOpts.studies.length && !opts.recompute) {
            // Studies handed in by the dashboard, enriched with what the live snapshot knows (date, priority).
            studies = openOpts.studies.map(function (s) { var hit = live.filter(function (l) { return String(l.id) === String(s.id); })[0]; return Object.assign({}, hit || {}, s, { study: s.study || (hit && hit.study) || 'Imaging study' }); });
        } else studies = live;
        if (opts.recompute) openOpts.studies = null;
        currentStudy = null; currentItem = null; clearAllViewports(); activeVp = 0; markActiveViewport(); explorerTab = 'studies'; var tq = $('[data-search="tags"]'); if (tq) tq.value = ''; renderExplorer();
        if (patient && !studies.length && vp()) { vp().hint.style.display = ''; vp().hint.innerHTML = ''; vp().hint.appendChild(el('b', null, 'No imaging study for this patient yet.')); vp().hint.appendChild(document.createTextNode('\nImages can be attached once a clinician has placed an imaging request.')); }
        if (!patient && vp()) { vp().hint.style.display = ''; vp().hint.textContent = 'Select a patient in the identification bar or search one in the DICOM Explorer.'; }
        if (opts.announce) {
            // Patient chosen INSIDE the workstation → identification bar + page follow (one truth).
            try { if (window.pcFile && typeof window.pcFile.renderDemoBar === 'function') { var master = document.getElementById('pcMasterHeader') || document.body; window.pcFile.renderDemoBar(master, patient || { _cleared: true, id: '', mrn: '', lastName: '', firstName: '', nationalId: '', department: '', dob: '', gender: '', archiveCode: '' }); } } catch (e) {}
            try { if (patient && patient.id) localStorage.setItem('pclinic_active_patient', String(patient.id)); else localStorage.removeItem('pclinic_active_patient'); } catch (e) {}
            if (typeof openOpts.onPatientChange === 'function') openOpts.onPatientChange(patient);
            try { window.dispatchEvent(new CustomEvent('pcPatientChanged', { detail: patient })); } catch (e) {}
        }
        if (openOpts.orderId && studies.length) { var want = studies.filter(function (x) { return String(x.id) === String(openOpts.orderId); })[0]; if (want) { openOpts.orderId = null; selectStudy(want); return; } }
        if (studies.length) selectStudy(studies[0]);
    }
    function selectStudy(study, opts) {
        opts = opts || {}; if (!study) return; currentStudy = study; setStatus('study', studyLabel(study)); if (!opts.keepViewport) { currentItem = null; }
        renderExplorer(); if (sidePanel) renderPanel();
        reloadStudy(study, false, function (set) { if (!opts.keepViewport && set.length && !(vp() && vp().item && vp().item.study === study)) displayItem(set[0]); else if (!set.length) showNoImagesHint(study); });
    }
    function switchStudy(study) { selectStudy(study); }
    function reloadStudy(study, force, done) {
        if (!study) { if (done) done([]); return; }
        var rec = mediaByStudy[study.id]; if (rec && !force && !rec.error) { if (rec.loading) { rec.waiters.push(done); return; } if (done) done(rec.set); return; }
        rec = mediaByStudy[study.id] = { loading: true, set: (rec && rec.set) || [], error: '', waiters: done ? [done] : [] }; renderExplorer();
        fetchMedia(study, function (err, set) {
            rec.loading = false; if (err) { rec.error = (err && err.message) || String(err); } else { set.forEach(function (it) { it.study = study; var old = (rec.set || []).filter(function (o) { return o.id === it.id; })[0]; if (old) { it.imageIds = old.imageIds; it.frames = old.frames; it.thumb = old.thumb; it.dataSet = old.dataSet; it.image = old.image; } }); rec.set = set; }
            renderExplorer(); var w = rec.waiters; rec.waiters = []; w.forEach(function (fn) { if (fn) fn(rec.set); });
            if (!err && !set.length && currentStudy === study) showNoImagesHint(study);
        });
    }
    function showNoImagesHint(study) {
        var v = vp(); if (!v || v.item) return;
        v.hint.style.display = ''; v.hint.innerHTML = ''; v.hint.appendChild(el('b', null, 'No images attached to this study yet.'));
        v.hint.appendChild(document.createTextNode(openOpts.canManage ? '\nUse Upload in the tool bar to attach JPEG/PNG or DICOM files to ' + studyLabel(study) + '.' : '\nRadiology has not uploaded images for ' + studyLabel(study) + ' yet.'));
    }
    function compareSideBySide() { var list = studyMedia(currentStudy); if (list.length < 2) { toast('Compare needs at least two images in the study.'); return; } maximised = null; applyLayout(1, 2); displayItem(list[0], viewports[0]); displayItem(list[1], viewports[1]); }

    /* ── upload / remove (radiology) ───────────────────────────── */
    function doUpload() {
        if (!openOpts.canManage) return; if (!currentStudy || !currentStudy.id) { toast('No imaging study to attach images to — a clinician must place an imaging request for this patient first.', 'err'); return; }
        if (!window.pcRadioMedia) { toast('The media module did not load.', 'err'); return; }
        var input = el('input'); input.type = 'file'; input.multiple = true; input.accept = (window.pcRadioMedia.ACCEPT || '') + ',.dcm,application/dicom'; input.style.display = 'none'; root.appendChild(input);
        input.onchange = function () {
            var files = Array.prototype.slice.call(input.files || []); input.remove(); if (!files.length) return;
            var study = currentStudy; var ok = 0, problems = []; var sv = $('.dv-status-bar .dv-save'); sv.classList.add('busy'); sv.querySelector('b').textContent = 'Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…'; toast('Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' to ' + studyLabel(study) + '…');
            var run = Promise.resolve(); files.forEach(function (f) { run = run.then(function () { return window.pcRadioMedia.upload({ id: study.id, patientId: study.patientId || (patient && patient.id) }, f).then(function () { ok++; }).catch(function (e) { problems.push((f.name || 'file') + ': ' + (e && e.message)); }); }); });
            run.then(function () { sv.classList.remove('busy'); sv.querySelector('b').textContent = ok ? ok + ' file' + (ok === 1 ? '' : 's') + ' attached' : ''; if (ok) toast(ok + ' file' + (ok === 1 ? '' : 's') + ' attached.', 'ok'); if (problems.length) toast('⚠️ ' + problems.join(' · '), 'err'); reloadStudy(study, true, function (set) { var newest = set[set.length - 1]; if (ok && newest) displayItem(newest); }); });
        };
        input.click();
    }
    function removeItem(item) { if (!openOpts.canManage || !window.pcRadioMedia || !window.pcRadioMedia.remove) return; if (!window.confirm('Remove "' + (item.meta.fileName || item.id) + '" from this study?\nOnly the person who uploaded it can remove it.')) return; window.pcRadioMedia.remove(item.meta).then(function () { toast('File removed.', 'ok'); viewports.forEach(function (v) { if (v.item === item) clearViewport(v); }); reloadStudy(item.study || currentStudy, true); }).catch(function (e) { toast('Could not remove: ' + (e && e.message), 'err'); }); }

    /* ── misc UI ───────────────────────────────────────────────── */
    function toggleExplorer() { var ex = $('.dv-explorer'); var phone = window.matchMedia('(max-width: 820px)').matches; if (phone) { ex.classList.toggle('dv-open'); explorerOpen = ex.classList.contains('dv-open'); } else { explorerOpen = !explorerOpen; ex.classList.toggle('dv-hidden', !explorerOpen); } $('.dv-tb[data-id="explorer"]').classList.toggle('active', explorerOpen); setTimeout(function () { viewports.forEach(function (v) { if (v.enabled) { try { cs().resize(v.host, true); } catch (e) {} } }); }, 30); }
    function toggleFullscreen() { var target = mode === 'inline' ? root : root; try { if (document.fullscreenElement) document.exitFullscreen(); else if (target.requestFullscreen) target.requestFullscreen(); else document.body.classList.toggle('pcdv-fullpage'); } catch (e) { document.body.classList.toggle('pcdv-fullpage'); } }
    function openInWindow() { var url = 'imaging-results.html' + (patient ? '?patient=' + encodeURIComponent(patient.id) : '') + (currentStudy ? (patient ? '&' : '?') + 'order=' + encodeURIComponent(currentStudy.id) : ''); window.open(url, '_blank', 'noopener,width=1400,height=900'); }
    function onKey(e) {
        if (!root) return; var tag = (e.target && e.target.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        var k = e.key;
        if (k === 'Escape') { if (menuEl) { closeMenu(); return; } if (mode === 'modal') close(); return; }
        if (k === 'ArrowLeft' || k === 'ArrowUp') { step(-1); e.preventDefault(); } else if (k === 'ArrowRight' || k === 'ArrowDown') { step(1); e.preventDefault(); }
        else if (k === '+' || k === '=') zoomBy(1.25); else if (k === '-') zoomBy(0.8); else if (k === '0') fitToWindow();
        else if (k === 'r') rotate(90); else if (k === 'R') rotate(-90); else if (k === 'h' || k === 'H') flip('h'); else if (k === 'v' || k === 'V') flip('v'); else if (k === 'i' || k === 'I') invert(); else if (k === 'f' || k === 'F') toggleFullscreen();
        else if (k === ' ') { if (cine.on) { toggleCinePlay(); e.preventDefault(); } } else if (k === 'Delete' || k === 'Backspace') { deleteMeasurements('selected'); e.preventDefault(); }
        else if (k === 'w' || k === 'W') setLeftTool('Wwwc'); else if (k === 'p' || k === 'P') setLeftTool('Pan'); else if (k === 'z' || k === 'Z') setLeftTool('Zoom'); else if (k === 'l' || k === 'L') setLeftTool('Length'); else if (k === 'a' || k === 'A') setLeftTool('Angle'); else if (k === 'm' || k === 'M') setLeftTool('Magnify');
    }
    function onResize() {
        if (mode === 'inline' && host && root) {
            // Height = viewport − everything above the workstation (the PClinic header grows
            // after load when pclinic-file.js injects the menus, hence the ResizeObserver below).
            var top = host.getBoundingClientRect().top + (window.scrollY || 0);
            root.style.setProperty('--dv-top', Math.max(0, Math.round(top)) + 'px');
        }
        viewports.forEach(function (v) { if (v.enabled) { try { cs().resize(v.host, true); } catch (e) {} } });
    }
    var headerObserver = null;
    function watchHeader() {
        if (headerObserver || typeof ResizeObserver !== 'function') return;
        var hdr = document.getElementById('pcMasterHeader'); if (!hdr) return;
        headerObserver = new ResizeObserver(function () { onResize(); }); headerObserver.observe(hdr);
    }

    /* ── lifecycle ─────────────────────────────────────────────── */
    function start(opts) {
        openOpts = opts || {}; build();
        onKeyBound = onKey; window.addEventListener('keydown', onKeyBound); onResizeBound = onResize; window.addEventListener('resize', onResizeBound);
        onFsBound = function () { var b = $('.dv-tb[data-id="full"]'); if (b) b.classList.toggle('active', !!document.fullscreenElement); onResize(); }; document.addEventListener('fullscreenchange', onFsBound);
        setLeftTool(leftTool); if (openOpts.canManage) $('.dv-tb[data-id="explorer"]').classList.add('active'); else $('.dv-tb[data-id="explorer"]').classList.add('active');
        ensureLibs().catch(function (e) { toast('Imaging libraries: ' + (e && e.message), 'err'); });
    }
    function open(order, opts) {
        if (root) close(); mode = 'modal'; start(opts);
        document.body.appendChild(root); document.body.style.overflow = 'hidden';
        var p = (opts && opts.patient) || (order && order.patientId ? findPatient(order.patientId) : null) || (window.currentPatient || null);
        if (!p && order && (order.patientName || order.patientId)) p = { id: String(order.patientId || ''), mrn: String(order.patientId || ''), name: order.patientName || '' };
        if (opts && opts.studies && opts.studies.length) openOpts.studies = opts.studies;
        selectPatient(p);
        if (order && order.id) { var s = studies.filter(function (x) { return String(x.id) === String(order.id); })[0]; if (!s) { s = { id: String(order.id), study: order.study || order.name || 'Imaging study', patientName: order.patientName || '', patientId: order.patientId, state: order.state || '' }; studies.unshift(s); } selectStudy(s); }
        setTimeout(onResize, 50);
    }
    function mount(hostEl, opts) {
        if (root) close(); mode = 'inline'; host = typeof hostEl === 'string' ? document.querySelector(hostEl) : hostEl; if (!host) throw new Error('mount(): host element not found');
        start(opts); host.replaceChildren(); host.appendChild(root); onResize(); watchHeader(); setTimeout(onResize, 400); setTimeout(onResize, 1500);
        if (opts && opts.patient) selectPatient(opts.patient); else renderExplorer();
        if (opts && opts.orderId && studies.length) { var s = studies.filter(function (x) { return String(x.id) === String(opts.orderId); })[0]; if (s) selectStudy(s); }
        return api;
    }
    function setPatient(p) { if (!root) return; if ((p && p.id) === (patient && patient.id) && p) return; openOpts.studies = null; selectPatient(p, { recompute: true }); }
    function refreshStudies() { if (!root || !patient) return; var keep = currentStudy && currentStudy.id; openOpts.studies = null; studies = studiesForPatient(patient); renderExplorer(); var s = studies.filter(function (x) { return x.id === keep; })[0]; if (s) { currentStudy = s; renderExplorer(); if (sidePanel) renderPanel(); viewports.forEach(drawTextOverlays); } else if (studies.length && !currentStudy) selectStudy(studies[0]); }
    function close() {
        if (!root) return; stopClip(); closeMenu(); viewports.forEach(function (v) { try { if (v.enabled && cs()) { cst().clearToolState(v.host, 'stack'); cs().disable(v.host); } } catch (e) {} }); viewports = [];
        if (synchronizers) { synchronizers.forEach(function (s) { try { s.destroy(); } catch (e) {} }); synchronizers = null; syncOn = false; }
        if (root.parentNode) root.parentNode.removeChild(root); root = null; host = null; patient = null; studies = []; currentStudy = null; currentItem = null; mediaByStudy = {}; sidePanel = null; maximised = null; cine.on = false;
        if (onKeyBound) window.removeEventListener('keydown', onKeyBound); if (onResizeBound) window.removeEventListener('resize', onResizeBound); if (onFsBound) document.removeEventListener('fullscreenchange', onFsBound); onKeyBound = onResizeBound = onFsBound = null;
        if (headerObserver) { try { headerObserver.disconnect(); } catch (e) {} headerObserver = null; }
        if (mode === 'modal') document.body.style.overflow = ''; document.body.classList.remove('pcdv-fullpage');
    }
    var api = { open: open, mount: mount, close: close, isOpen: function () { return !!root; }, setPatient: setPatient, refreshStudies: refreshStudies, selectStudy: function (id) { var s = studies.filter(function (x) { return String(x.id) === String(id); })[0]; if (s) selectStudy(s); }, switchStudy: switchStudy, preload: function () { return ensureLibs(); }, current: function () { return { patient: patient, study: currentStudy, item: vp() && vp().item, tool: leftTool, layout: layoutSpec.slice() }; }, _internal: { describeMeasurement: describeMeasurement, baseOrientation: baseOrientation, rotateOrientation: rotateOrientation, niceStep: niceStep, dirLabel: dirLabel } };
    window.PcDicomViewer = api;
    // Warm the libraries while the user is still on the dashboard, so the first click opens instantly.
    if (!window.__pcdvNoPreload) { var warm = function () { try { if ('requestIdleCallback' in window) requestIdleCallback(function () { ensureLibs().catch(function () {}); }); else setTimeout(function () { ensureLibs().catch(function () {}); }, 1500); } catch (e) {} }; if (document.readyState === 'complete') warm(); else window.addEventListener('load', warm); }
})();
