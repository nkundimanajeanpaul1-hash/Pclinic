# PLAN — Doctor's Imaging Results page as a full DICOM workstation (Weasis look)

**Status: waiting for your approval. No code has been changed.**
Target page: doctor dashboard → **Imaging Results** (`imaging-results.html`).
Reference: your screenshot (Weasis viewer — left DICOM Explorer, top tool bar, centre "Image Viewer" tab, right "Display / Image Tools / Draw & Measure" tabs, bottom-left Frame / Zoom / Window-Level overlay, scale bar, orientation letter).

---

## 1. What the doctor has today (facts from the code)

| Today | Problem |
|---|---|
| `imaging-results.html` = a light-theme **list of FINAL reports**, each with small image cards | Not a viewer; images appear only after the report is signed |
| Clicking an image opens the small `PcDicomViewer` pop-up (the one radiology uses) | Only 4 tools: Window/Level, Pan, Zoom, Upload. No measure, rotate, flip, invert, layout, presets, tags, export |
| DICOM decoding is hand-written: **uncompressed files only** | Real X-ray/CT files from machines are usually JPEG-Lossless / JPEG-2000 → "cannot be decoded here yet" |
| Viewer libraries are loaded from `unpkg.com` | Blocked by the site's security policy (CSP `script-src 'self'`) on web.app → viewer never fully works there |
| Images come from the common server correctly (Firestore `radiologyMedia` + Storage `radiology/{order}/{file}` + `radiologyMediaSign`) | Doctors are already allowed to read them (rules + function). **Nothing is saved back** by the doctor |

So the data side ("pull from common server") is 80 % there; the **viewer itself must be rebuilt**.

---

## 2. Target — the page, zone by zone (same as your screenshot)

```
┌ PClinic top menu + PATIENT IDENTIFICATION BAR (kept: patient selected here = patient in the viewer, one truth) ┐
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ TOOL BAR  [Open][Export] | [W/L][Pan][Zoom][Wheel] | [Layout][Sync][Reset] | [Ruler][Angle][ROI][Delete] |     │
│           [Magnify][Crosshair] | [Rotate][Flip] | [Invert][Presets] | [Cine ◀ ▶] | [Full screen]              │
├───────────────┬───────────────────────────────────────────────────────────────────────────┬───────────────────┤
│ DICOM EXPLORER│  [Image Viewer ×]                                                         │  ▍Display         │
│ Search patient│  ┌─────────────────────────────────────────────────────────────────────┐  │  ▍Image Tools     │
│ Search tags   │  │ NTIVUGURUZWA Lidivine      L                     Hand X-Ray 02/09/26 │  │  ▍Draw & Measure  │
│               │  │ MRN 1002 · F 25y                                 CR · CHUK           │  │  ▍Report          │
│ ▸ Patient     │  │ 200 pix                                                              │  │  (vertical tabs,  │
│   ▸ Study     │  │ ├─┤                    (image, dark background)                      │  │   open a panel)   │
│     ▸ Series  │  │                                                                      │  │                   │
│       thumbs  │  │ Frame: 1/1                                                            │  │                   │
│               │  │ Zoom: 100%                                        ◆ (series marker)  │  │                   │
│               │  │ Window/Level: 255/127.5                                              │  │                   │
│               │  └─────────────────────────────────────────────────────────────────────┘  │                   │
└───────────────┴───────────────────────────────────────────────────────────────────────────┴───────────────────┘
```

Dark grey theme, same icon groups and order as Weasis, same right-hand vertical tab strip (with the pin / undock icons), same bottom-left overlay text block. One extra right tab **Report** (Weasis has none; the doctor needs the signed report next to the image). Icons redrawn as SVG in the same style (Weasis's own icon files are not copied).

Phone/tablet (PClinic is phone-first): the explorer and right panels become slide-in drawers, tools work with touch (one finger = active tool, pinch = zoom, two fingers = pan).

---

## 3. Features — every one must WORK

| Group | Feature | How it will work |
|---|---|---|
| **Open** | DICOM Explorer: Patient → Study → Series → thumbnails; *Search patient*; *Search tags* (full DICOM tag browser, filter as you type) | Patient list from the common server (`getPatients`), studies = the patient's radiology orders, files = `radiologyMedia` |
| **Decode** | `.dcm` uncompressed, **JPEG-Lossless, JPEG-LS, JPEG-2000, RLE, JPEG baseline**, multi-frame; plus PNG/JPEG/WebP/MP4 that radiology also uploads | cornerstone WADO image loader with its decoders, **self-hosted in `vendor/`** (no CDN → passes CSP, works on LAN/offline once cached) |
| **Window/Level** | drag; presets (Auto, Bone, Lung, Soft tissue, Brain, Abdomen, Inverse); invert; reset | cornerstone-tools `Wwwc`, `WwwcRegion`, presets from modality |
| **Navigate** | Pan, Zoom (drag + wheel + buttons), Fit, 1:1 (100 %), Magnifier, Rotate 90°, Flip H/V, Reset | cornerstone-tools `Pan`, `Zoom`, `ZoomMouseWheel`, `Magnify`, `Rotate` |
| **Frames / series** | Frame slider, wheel scroll through frames or files, **Cine play** with FPS control, Prev/Next | `StackScroll`, `StackScrollMouseWheel`, cine loop |
| **Layout** | 1×1, 1×2, 2×1, 2×2 viewports; drag a series into a viewport; compare two studies (old vs new X-ray) | multiple enabled elements; sync (zoom/pan/W-L) toggle |
| **Draw & Measure** | Length (ruler, mm when pixel spacing exists, else px), Angle, Cobb angle, Rectangle ROI & Ellipse ROI (area, mean ± SD, HU for CT), Probe (pixel value), Arrow + text annotation, Freehand, Bidirectional; select / move / delete one / delete all | cornerstone-tools measurement tools, listed in the **Draw & Measure** panel with live values |
| **Overlays** | Corner texts: patient, ID, DOB/sex, study, date, modality, institution, W/L, zoom, frame; **scale bar** (`200 pix` / `50 mm`); **orientation letters** (L/R/A/P/H/F) from DICOM; toggle overlays on/off | read from DICOM tags; PNG/JPEG show what the record knows |
| **Display panel** | W/L presets, LUT/colour maps (grey, inverse, hot iron), interpolation on/off, overlay toggles | cornerstone viewport options |
| **Image Tools panel** | mouse-button assignment (left / middle / right / wheel → tool) like Weasis, sync options, reset all | cornerstone-tools bindings |
| **Export** | Screenshot PNG (with drawings burned in), download original file, print single image | canvas `toBlob`, signed URL |
| **Report tab** | Final report text, findings, impression, critical alert, addenda, signed by/when; "no report yet" state; print report | existing `pcRadiology` data |
| **Save to common server** (doctor) | **Measurements / annotations, key-image flags and a short viewer note are saved** per image per user, restored when the image is reopened, visible to radiology and other doctors (author shown) | **new Firestore collection `radiologyAnnotations`** (+ rules), auto-save 1 s after each change, "Saved ✓" indicator |
| **Patient truth** | Patient chosen in the explorer = patient in the identification bar, and vice-versa; locked with no patient | same mechanism as radiology (`pcPatientChanged`) |
| **Radiology** | Radiology's "Open DICOM to add radiology result" opens **this same viewer** with Upload / Delete enabled (`canManage`) — one viewer, one code base | replaces the small pop-up |

**Not possible in a browser / out of scope (say now, not later):** 3-D MPR/volume rendering, crosshair *between different series* (needs same-frame-of-reference CT/MR series — can be a later phase), DICOM network (PACS C-FIND / C-MOVE), DICOM print, CD import.

---

## 4. Data flow — pull & save on the common server

```
PULL   patients ───────────────► getPatients()  (common server patient list)
       studies  ───────────────► orders (dept radiology) of that patient  [pcRadiology, live]
       files    ───────────────► radiologyMedia (Firestore, doctors may read)  [pcRadioMedia.listFor]
       pixels   ───────────────► radiologyMediaSign → signed / token URL → Storage  [pcRadioMedia.urlsFor]
       report   ───────────────► radiologyReports / addenda / criticalAlerts  [pcRadiology]
SAVE   drawings, key images, note ─► radiologyAnnotations/{mediaId}_{uid}  (new; owner writes, patient readers read)
       (radiology only) upload/delete images ─► unchanged (Storage + radiologyMedia + radiologyMediaDelete)
```

Nothing is stored on the device except the browser cache of the vendor scripts.

---

## 5. Files

| File | Change |
|---|---|
| `vendor/` **(new)** | cornerstone-core, cornerstone-math, cornerstone-tools, hammer.js, dicom-parser, cornerstone-wado-image-loader (+ decoder workers). ≈ 3 MB once, cached |
| `pclinic-dicom-viewer.js` / `.css` | **rewritten** as the workstation (shell, explorer, tool bar, panels, overlays, layouts, tools, export, annotations) — modal mode for radiology, full-page mode for the doctor |
| `pclinic-radiology-annotations.js` **(new)** | load / save / list annotations & key images (common server) |
| `imaging-results.html` | becomes the full-page workstation under the PClinic header; Report tab; keeps the print-report path |
| `firestore.rules` | add `radiologyAnnotations` (create/update by author: doctor, radio, admin; read: patient readers; no delete of others' work) |
| `firebase.json` | CSP: add `worker-src 'self' blob:` and `'wasm-unsafe-eval'` (decoders); nothing external |
| `radio-dashboard.js` | open the new viewer instead of the pop-up (same button, same gate) |
| `tests/` | unit: annotation model, tag formatter, preset table, rules test for `radiologyAnnotations`; Playwright E2E: open real DICOM (uncompressed + JPEG-Lossless + JPEG-2000 samples), each tool, layout, save → reload → drawings back, doctor read-only vs radiology upload |
| `functions/` | **no change needed** (`radiologyMediaSign` already admits doctor/nurse/radio/lab/theater/beds) |

---

## 6. One-time prerequisites on your Firebase project (I give exact clicks/commands)

1. **Signing role** — the "Service Account Token Creator" step you are doing now (or `firebase deploy --only functions` for the token fallback). Without it no image loads anywhere.
2. **Bucket CORS** — signed URLs are fetched by script (needed to decode DICOM), so the bucket must allow GET from `https://pclinic-20d81.web.app`, `https://pclinic-20d81.firebaseapp.com`, `https://nkundimanajeanpaul1-hash.github.io`. `cors.json` exists; I add the github origin; one command: `gsutil cors set cors.json gs://pclinic-20d81.firebasestorage.app` (or Cloud Shell in the console — no install).
3. `firebase deploy --only firestore:rules,hosting` after the change.

---

## 7. Delivery — two zips, each testable

| Zip | Contains | You can check |
|---|---|---|
| **A — Workstation** | vendor libs, new viewer (all tools, explorer, overlays, layouts, presets, tags, export, cine), doctor page in full-page mode, radiology switched to it, CSP | open any study as doctor & radiology; every tool bar button works on PNG *and* compressed DICOM |
| **B — Save & Report** | annotations/key images/note saved to the common server, Report tab, rules, tests | draw → close → reopen (other browser) → drawings are there with the author's name; report shown next to image |

I test each zip in a real browser (Chromium) against sample DICOM files before sending.

---

## 8. Decisions I need from you (reply "approved" to take my recommendation, or change any line)

| # | Question | My recommendation |
|---|---|---|
| D1 | When may the doctor see images? | **As soon as radiology uploads them**, with a banner "PRELIMINARY — no signed report yet"; report appears when signed. (Today: only after the final report.) |
| D2 | What may the doctor **save** to the common server? | **Measurements/annotations, key-image flags, viewer note** (recommended, no change to storage security). Option: also let doctors save an annotated snapshot as a new image in the study — needs storage/firestore rules to accept doctor uploads; say so if you want it. |
| D3 | One viewer for radiology and doctors? | **Yes** — radiology's DICOM button opens the same workstation with Upload/Delete on. |
| D4 | Libraries self-hosted in `vendor/` (≈ 3 MB once, cached, works offline) vs. keep hand-written viewer (no compressed DICOM, fewer tools)? | **Vendor libraries** — it is the only way to get compressed DICOM and reliable measurement tools. |
| D5 | Full page under the PClinic header (identification bar stays visible, "Full screen" button hides it) vs. a pop-up over the dashboard? | **Full page under the header** — matches your screenshot and keeps "one patient truth". |

After your approval I start with Zip A.
