# PClinic — Radiology ↔ Doctor Linkage & Image Flow Evaluation

**Date:** 2026-08-30
**Scope:** How radiology and doctors are linked, how study images are stored/loaded, and how a doctor actually sees an image.

---

## 1. Executive summary

PClinic has a well-designed, security-conscious radiology pipeline in principle: Firestore is authoritative, all state transitions and report signing go through **trusted callable Cloud Functions**, and image pixels are held in a **private Storage bucket** behind short-lived signed URLs. The doctor and radiology sides are linked through a single **order stream** (`orders` collection), and the doctor views images embedded alongside signed reports in `imaging-results.html`.

However, there is **one blocking defect** and a few structural limitations:

| Severity | Finding |
|----------|---------|
| 🔴 Critical | `admin` is **never imported** in `functions/index.js`, yet `radiologyMediaSign` and `radiologyMediaDelete` call `admin.storage()`. Both functions will throw `ReferenceError: admin is not defined` → **image viewing and image deletion are broken** in production. |
| 🟠 High | There are **two parallel imaging-request paths**. The legacy inline form (`doctor.js` → `submitImagingRequest()`) writes only to the local patient object + a clinical note and **never creates an order** — radiology never sees it. |
| 🟠 High | **No real DICOM/PACS viewer.** The viewer is a stub ("PACS required / not configured"). Only phone-exported JPEG/PNG stills and short MP4/WebM clips are displayed, not actual DICOM studies. |
| 🟡 Medium | `reportPayload()` sets `patientMrn = order.patientId`, so printed reports label the internal ID as the "MRN". |
| 🟢 Low | `radiologyMediaSign`'s viewer allow-list is broader than strictly necessary (includes `lab`, `theater`, `beds`). |

---

## 2. Data model (the spine that links the two sides)

All entities live in Firestore (`pclinic-20d81`, region `africa-south1`):

| Collection | Purpose | Writer |
|------------|---------|--------|
| `orders/{orderId}` | One stream for all departments. Imaging orders carry `type:'imaging'`, `dept:'radiology'`, `patientId`, `orderedById` (doctor's staffId), `orderedBy` (name), `radiologyState`. | Doctor (browser) for creation; **callable** for transitions/finalisation |
| `radiologyReports/{rad_<orderId>}` | One draft/final report per order (deterministic ID via `reportIdForOrder`). | `radiologySaveDraft` / `radiologyFinalize` (callable) |
| `radiologyMedia/{mediaId}` | Metadata for each uploaded image/clip (path, mime, bytes, uploader). **No pixels.** | Radiographer (browser) on upload |
| `radiologyAddenda/{addendumId}` | Addenda on final reports. | `radiologyAddendum` (callable) |
| `criticalAlerts/{reportId}` | Critical-result alerts + acknowledgment state. | `radiologyFinalize` (callable) |
| `messages/{messageId}` | In-app notification to the ordering doctor (`toStaffId: orderedById`, `toRoles:['doctor']`). | Callables |
| `auditLog/{entryId}` | Immutable audit trail of every transition/finalisation/acknowledgement. | Callables |
| **Cloud Storage** (`pclinic-20d81.appspot.com`) | The pixels: `radiology/{orderId}/{mediaId}.{ext}`. Private. | Radiographer (direct REST upload) |

**Linkage key:** the `orderId`. Everything — the report, the media, the alert, the notification — hangs off the same order, and the order carries `patientId` + `orderedById` so the doctor's view can be scoped by patient and the alert can be scoped by ordering clinician.

---

## 3. How the doctor and radiology are linked (step by step)

### 3.1 Doctor creates an imaging request
- The "Imaging Request" button in the patient file calls `openImagingPageModal()` → loads **`imaging-request.html`** in a modal.
- On send, it calls `pcOrders.create({ type:'imaging', patientId, priority, notes, items:[…] })` (`imaging-request.html` `sendRequest()`).
- `createOrder()` in `pclinic-orders.js` resolves `dept` via `DEPT_OF['imaging'] = 'radiology'`, stamps `orderedBy`/`orderedById` from the signed-in staff, sets `status:'pending'`, creates the bill, and syncs to Firestore.

### 3.2 Radiology picks it up
- `radio-dashboard.js` subscribes (in `pclinic-radiology.js` `init()`) to:
  `orders where dept == 'radiology'`, plus `radiologyReports`, `radiologyAddenda`, `criticalAlerts`.
- The worklist is driven by a **state machine** (`radiology-domain.cjs`):
  `pending → in-progress → acquired → reporting → reported` (or `cancelled`).

### 3.3 Workflow state changes (all through callables)
- `radiologyTransition({orderId, action})` with actions `start` / `acquire` / `cancel`.
- The callable re-derives state, validates the transition (`assertTransition`), writes `radiologyState` + audit log, and (on cancel) posts a message to the doctor.

### 3.4 Report writing and finalisation
- `radiologySaveDraft` / `radiologyFinalize` — both enforce:
  - `ensureImagingOrder(order)` (must be `dept==='radiology'` or `type==='imaging'`),
  - `ensurePatientMatch(order, report.patientId)` (order and report patient must match),
  - correct workflow state (`acquired`/`reporting` before signing),
  - final reports require findings + impression (and a verbal-notification recipient if critical).
- `radiologyFinalize` writes the report doc, sets `order.status='completed'`, `order.result={reportId, critical, impression, status:'final'}`, and **sends a `messages` entry to `orderedById`** (the ordering doctor). Critical results additionally create a `criticalAlerts/{reportId}` doc.

### 3.5 Doctor acknowledgement
- `radiologyAcknowledgeCritical` (doctor role only) — only the requesting clinician (or admin) may acknowledge; idempotent on retry.

**Assessment:** The linkage is sound and audited. Patient/order/report identity is checked at every server-side write, and the notification path (messages) is correctly targeted at the ordering doctor.

---

## 4. How images are loaded / stored

### 4.1 Upload (radiology side)
- `pclinic-radiology-media.js` → `pcRadioMedia.upload(order, file)`.
- Validation: MIME must be `image/jpeg|png|webp|gif` or `video/mp4|webm`, size 0 < x ≤ **25 MB**. **DICOM is explicitly rejected** ("must stay in PACS").
- Upload uses the **Storage JSON API over REST** (not the Firebase SDK — the app has no bundler), authenticated with the signed-in user's ID token:
  `PUT https://storage.googleapis.com/storage/v1/b/<bucket>/o?name=radiology/{orderId}/{mediaId}.{ext}&uploadType=media`.
- On success a `radiologyMedia/{mediaId}` metadata record is written. If that Firestore write fails, the object is deleted to avoid orphan files.
- `storage.rules` only allows `radio`/`admin` to write, enforces size/content-type, and enforces the exact `radiology/{orderId}/{mediaId}.{ext}` shape.

### 4.2 Reading / viewing (signed URLs)
- Browsers **never** read the bucket directly (`allow get, list: if false`).
- `pcRadioMedia.urlsFor(orderId)` calls the **`radiologyMediaSign`** callable.
- Server-side, `radiologyMediaSign`:
  1. checks `request.auth` + `mediaViewer(uid)` (profile exists, `active===true`, role in the allow-list),
  2. verifies the order is an imaging order,
  3. reads `radiologyMedia where orderId == orderId`,
  4. for each record, validates the stored `storagePath` is exactly inside that order's own prefix (anti-tamper: a record can't sign another study's object),
  5. mints a **10-minute signed URL** (`getSignedUrl`).
- The client renders thumbnails from metadata, and on "Open" fetches the signed URL and injects an `<img>` or `<video>`.

### 4.3 Deletion
- `pcRadioMedia.remove()` → `radiologyMediaDelete` callable (radio only; uploader-only unless admin), blocks deletion once the study is `reported`.

---

## 5. How the doctor actually sees the image

1. Doctor opens a patient file → "**Image Result**" button (`openImagingResultsPage(patient)`, `doctor.js`).
2. It stores a clean patient snapshot in `localStorage['pclinic_imaging_patient_data']` and opens **`imaging-results.html`** in an iframe, then `postMessage({type:'LOAD_PATIENT', patient})`.
3. `imaging-results.html`:
   - `requireAuth(['doctor','radio','nurse'])`,
   - subscribes to `pcRadiology` (reports/addenda/alerts),
   - resolves the patient (from postMessage, URL `?patient=`, or `sessionStorage`),
   - renders each **final** report (findings/impression/recommendation + addenda),
   - for each report, if it has an `orderId`, calls `pcRadioMedia.mount(host, {id: orderId, study}, {canManage:false})`, which lists media metadata and, on "Open", fetches signed URLs and displays the images/videos **inline alongside the report**.
4. If the report is critical and unacknowledged, a doctor (ordering clinician or admin) sees an "Acknowledge critical result" button wired to `radiologyAcknowledgeCritical`.

**Assessment:** The doctor's image view is correctly scoped by patient and gated by the signed-URL callable. Because `radiologyMediaSign`'s viewer list includes `doctor`, the permission model *intends* for doctors to see the images.

---

## 6. Security model (what's good)

- **No public URLs** — pixels never have a public object URL; signed URLs expire in 10 minutes.
- **Server-side authorization** — `radiologyMediaSign` re-checks the staff profile (existence + `active` + role) on every request, so a deactivated/revoked account can't keep viewing via a cached link.
- **Anti-tamper** — the signer only ever signs objects inside the order's own prefix, matching `storagePath` against the expected `radiology/{orderId}/{id}.{ext}`.
- **Immutable final reports** — final reports are write-denied to browsers; changes must go through addenda (which are also callable-only and audit-logged).
- **Audit trail** — every transition/finalisation/acknowledgement writes an `auditLog` entry with actor, patient, and action.

---

## 7. Findings in detail

### 🔴 7.1 `admin` is undefined → image signing & deletion are broken
`functions/index.js` imports only the modular pieces:

```js
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
```

There is **no** `const admin = require('firebase-admin')` and **no** `const { getStorage } = require('firebase-admin/storage')`. Yet two functions reference `admin`:

- `radiologyMediaSign` — line 884: `const bucket = admin.storage().bucket();`
- `radiologyMediaDelete` — line 944: `await admin.storage().bucket().file(path).delete(...)`

Both will throw `ReferenceError: admin is not defined` at runtime. Consequence: **no signed URLs are ever returned**, so the "Open" button on an image cannot load anything, and media deletion fails. The metadata still renders (it comes from Firestore), so a radiographer can *see* that files exist but the doctor cannot actually view the pixels.

**Fix (one line):**
```js
const { getStorage } = require('firebase-admin/storage');
...
const bucket = getStorage().bucket();
```
(or import `admin = require('firebase-admin')` and keep `admin.storage()`).

### 🟠 7.2 Two imaging-request paths — the legacy one never reaches radiology
- **New path (works):** "Imaging Request" button → `imaging-request.html` → `pcOrders.create({type:'imaging'})` → real order in the stream.
- **Legacy path (broken linkage):** `doctor.js` still contains `submitImagingRequest()` (exposed as `window.submitImaging`), which pushes into `currentPatient.imagingRequests` and a clinical note only. It creates **no `orders` document**, so radiology's worklist (`orders where dept=='radiology'`) never sees it.

If any UI still routes to `submitImagingRequest` (e.g. the inline `tab-imaging` form), doctors can request imaging that silently goes nowhere. Recommend removing/redirecting that path.

### 🟠 7.3 DICOM/PACS is not implemented
The viewer view (`radio-dashboard.js` `updateViewerContext()`, `radioOpenSettings()`) and `imaging-results.html`'s notice both state PACS/DICOMweb is **not configured**. Real CT/MRI/X-ray DICOM studies cannot be displayed; only exported stills and short clips (≤25 MB) are. This is a deliberate product boundary (a phone-first clinic record), but it means "the doctor seeing the image" is limited to snapshots, not diagnostic-quality studies.

### 🟡 7.4 `patientMrn` is populated with the internal patient ID
In `reportPayload()` (`functions/index.js`):
```js
patientMrn: String(order.patientId || ''),
```
Printed reports therefore show the patientId in the MRN slot. Linkage still works (matching uses `patientId`/`patientMrn`/`mrn`), but the document is misleading and should carry the real MRN.

### 🟢 7.5 Signing allow-list is broader than necessary
`mediaViewer()` permits `doctor`, `nurse`, `radio`, `lab`, `theater`, `beds`, and `admin`. `lab`/`theater`/`beds` arguably shouldn't open radiology images. Not a security hole per se (all are authenticated, active staff), but it's wider than the "need to know" minimum.

### 🟢 7.6 Minor consistency notes
- `storage.rules` allows `delete` by any signed-in radio/admin for the object, while Firestore deletion is uploader-only — the callable owns cleanup in practice, so this is benign but slightly looser than the Firestore rule.
- `radiologyMediaSign` returns an `error:'object-unavailable'` item rather than failing the whole call when an object is missing — good resilience.

---

## 8. Recommendations (priority order)

1. **Fix the `admin` import** in `functions/index.js` and redeploy (`firebase deploy --only functions`). This unblocks image viewing end-to-end. Add an integration test that mocks `getStorage`.
2. **Retire the legacy `submitImagingRequest` path** in `doctor.js` (or route it to `pcOrders.create`) so no imaging request can bypass the order stream.
3. **Carry the real MRN** into `reportPayload().patientMrn` (fetch from the `patients/{id}` doc) instead of `patientId`.
4. **Decide and document the PACS boundary** — if DICOM viewing is a goal, integrate a DICOMweb viewer (orthanc/cornerstone.js) rather than overloading the 25 MB JPEG/MP4 path; otherwise, make the "PACS not configured" state a first-class, clearly-labelled limitation.
5. **Tighten `mediaViewer()` roles** to `doctor`, `nurse`, `radio`, `admin` unless `lab`/`theater`/`beds` have a documented need.
6. **Add an end-to-end test** covering: doctor order → radiology acquire → upload image → finalize → doctor opens `imaging-results.html` and receives a signed URL.

---

## 9. Reference map (files → responsibility)

| File | Role |
|------|------|
| `functions/index.js` | All radiology callables (transition, draft/finalize, addendum, ack, media sign/delete) |
| `functions/radiology-domain.cjs` | Pure state machine + validation (unit-testable) |
| `functions/test/radiology-domain.test.cjs`, `radiology-integration.test.cjs` | Backend tests |
| `pclinic-orders.js` | Order/bill/message spine; `DEPT_OF` maps `imaging→radiology` |
| `pclinic-radiology.js` | Client radiology store (Firestore subscriptions + callable wrappers) |
| `pclinic-radiology-media.js` | Image/clip upload + signed-URL viewing (`pcRadioMedia`) |
| `radio-dashboard.html` / `radio-dashboard.js` | Radiology worklist, report writer, media sheet |
| `imaging-request.html` | Doctor's imaging request page (creates the order) |
| `imaging-results.html` | Doctor's report + image viewer page |
| `doctor.js` / `doctor-dashboard.html` | Doctor dashboard; iframe opener for results + legacy imaging form |
| `storage.rules` / `firestore.rules` | Access control for bucket + Firestore |
