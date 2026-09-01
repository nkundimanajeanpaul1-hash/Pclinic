# DICOM Viewer — Deploy & Test Guide

A shared **Weasis-style DICOM viewer** is now embedded in **both** the radiology
image-entry page (`radio-dashboard.html`) and the doctor's image-result page
(`imaging-results.html`), so the two look 100% identical. It pulls study media
from the common Firebase server (`pclinic-20d81`).

## What was added / changed

| File | Change |
|------|--------|
| `pclinic-dicom-viewer.css` | **NEW** — Weasis dark workstation theme |
| `pclinic-dicom-viewer.js` | **NEW** — viewer logic (cornerstone + dicom-parser) |
| `pclinic-radiology-media.js` | accept DICOM `.dcm` uploads |
| `storage.rules` | allow `application/dicom` + `.dcm` ext |
| `firestore.rules` | allow `application/dicom` MIME in `safeMediaWrite` |
| `radio-dashboard.html` / `.js` | include viewer + "Open DICOM viewer" button in the Images sheet |
| `imaging-results.html` | include viewer + "Open DICOM viewer" button |
| `cors.json` | **NEW** — CORS config so the browser can fetch DICOM bytes |

## Viewer features (all working)

- Window/Level (left-drag), Pan (middle/right-drag), Zoom (wheel)
- Zoom in/out, Fit, Rotate 90°, Flip, Invert, Reset
- Frame stepping (Prev/Next) for multi-frame DICOM
- Live bottom status bar: `Frame`, `Zoom`, `Window/Level`, `Pixel`
- Left "DICOM Explorer" panel with patient search + study list
- Right "Study Info" panel
- Upload button (radiology side only) accepts DICOM + images/video

## Deploy steps (run in your project folder)

```bash
cd /Volumes/AMASOMO/pclinic-website/hospital

# 1. Firestore + Storage rules (DICOM acceptance)
firebase deploy --only firestore:rules,storage

# 2. CORS — required, or the browser cannot fetch DICOM bytes
gsutil cors set cors.json gs://pclinic-20d81.firebasestorage.app
# (if gsutil is missing: gcloud components install gsutil, or use
#  gcloud storage --buckets... the console: Cloud Storage → bucket →
#  Permissions → CORS configuration → paste cors.json)

# 3. Hosting (the updated HTML/JS/CSS)
firebase deploy --only hosting
```

> The Cloud Functions (`radiologyMediaSign`) are unchanged and already sign
> signed URLs for all media types including `.dcm`, so no function redeploy is
> strictly required.

## Notes / limits

- **Compressed DICOM** (JPEG/JPEG2000/RLE transfer syntaxes) is detected and
  reported with a clear message; only uncompressed DICOM (the common
  X-ray/CT/MR/US default) is decoded in-browser for now.
- 25 MB per-file limit still applies (Storage rule + client check).
- The doctor's existing thumbnail grid (from `pcRadioMedia.mount`) remains;
  the new "Open DICOM viewer" button opens the full dark viewer.
