# PClinic — Clinic & Hospital Information System

PClinic helps doctors, nurses, and clinic staff manage the full patient journey
from a phone, tablet, or desktop — built for low-bandwidth clinic environments
in Rwanda (CHUK-style workflows).

> **Status:** active containment/hardening release. Read [`READ-ME-FIRST.md`](READ-ME-FIRST.md)
> before deploying anything. This system may touch real patient data: never test
> security rules against production, and keep this repository **private**.

## Features

- **Reception** — patient registration, OPD files, appointments, queue, triage
- **Clinical** — doctor & nurse dashboards, clinical/nursing/surgical notes, ward
  rounds, vitals, prescriptions, discharge summaries, medical certificates
- **Laboratory** — lab requests, specimen lifecycle (accession → in progress →
  finalized), critical-result acknowledgment, lab dashboard
- **Radiology** — imaging requests, reporting workflow with server-signed
  immutable final reports, media upload (JPEG/PNG/WebP/GIF/MP4/WebM/DICOM),
  Cornerstone.js **DICOM viewer** with annotations
- **Support services** — pharmacy, inventory, theater (OR schedule), beds,
  physio, ICU surveillance, transfusion/injection/pansement registries
- **Finance & admin** — billing, cashier dashboard, receipts, finance dashboard,
  HR dashboard, audit trail, messaging between departments

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (no build step), Firebase JS SDK v12 via CDN |
| Auth | Firebase Auth — staff log in with a numeric staff ID (`{id}@pclinic.local` internally); session-only persistence |
| Database | Cloud Firestore — `patients/{id}` (monolithic record, split planned), `orders`, `users` profiles, `radiologyMedia` |
| Backend | Cloud Functions v2 (Node 22, `africa-south1`) — 14 callables: lab & radiology state machines, signed media URLs, admin cascades, audit-in-transaction |
| Files | Firebase Storage — write-only from browsers; **all reads go through short-lived signed URLs** minted by `radiologyMediaSign` |
| Hosting | Firebase Hosting (`pclinic-20d81.web.app`) — the single supported deploy channel |
| DICOM | Cornerstone.js + dicomParser, vendored under `vendor/` |

### Security model (summary)

- `firestore.rules`: fail-closed; every staff profile must be explicit
  (`active: true`, validated role); non-clinical roles (HR, cashier, finance,
  inventory) cannot read clinical patient records; ownership fields immutable.
- `storage.rules`: bucket is unreadable directly (`get/list: false`); only
  `radio`/`admin` may upload, with size (25 MB), content-type and path checks.
- Strict CSP + security headers configured in `firebase.json`.
- Audit records are written **in the same transaction** as clinical state changes.

See `SECURITY_SETUP.md` and `EMERGENCY_REMEDIATION.md` for the full model and
incident history.

## Repository layout

```
├── *.html / *.js / *.css     # the web app (served by Firebase Hosting)
├── functions/                # Cloud Functions (callables) + unit tests
├── tests/                    # rules-emulator, client & contract test suites
├── scripts/                  # build/patch helpers (patch-functions-config.cjs)
├── vendor/                   # Cornerstone DICOM viewer libraries
├── firestore.rules           # Firestore security rules
├── storage.rules             # Storage security rules
├── firebase.json             # hosting, headers, rewrites, emulators
└── *.md / *-NOTES.txt        # design notes, setup guides, incident reports
```

## Roles

`admin`, `doctor`, `nurse`, `reception`, `lab`, `pharmacy`, `radio`, `physio`,
`cashier`, `finance`, `hr`, `inventory`, `theater`, `beds`
(admin is implicitly allowed on every gated page).

## Running the tests locally

Requirements: **Node 20**, **JDK 11** (for the Firestore/Functions emulators).

```bash
# Backend unit tests (+ verifies the firebase-functions emulator patch)
npm --prefix functions install
npm --prefix functions run test:verify-patch
npm --prefix functions test

# Client, contract and page test suites
npm --prefix tests install
npm --prefix tests run test:static       # dashboard role contracts
npm --prefix tests run test:files        # clinical file sync
npm --prefix tests run test:results      # imaging results page
npm --prefix tests run test:media        # radiology media client
npm --prefix tests run test:call-errors  # callable error handling

# Emulator suites (decisive for security rules & radiology backend)
npm --prefix tests run test:rules
npm --prefix functions run test:emulator
```

## Deploying

CI (`.github/workflows/firebase-deploy.yml`) runs **all** suites above on every
push to `main` and deploys `hosting,functions,firestore:rules,storage` only when
everything is green. Requires the `FIREBASE_SERVICE_ACCOUNT_PCLINIC_20D81`
repository secret.

Manual deploy (staging project first!):

```bash
firebase deploy --only firestore:rules,functions,hosting,storage
```

> **Uploading files to GitHub does not deploy rules.** Rules only change via
> `firebase deploy` / the CI pipeline. After any deploy that touches shared JS,
> remember the manual `?v=` cache-busting tokens referenced in
> `READ-ME-FIRST.md`.

## Known limitations & roadmap

1. **Monolithic patient document** — demographics, encounters, notes,
   prescriptions, results and billing live in one Firestore doc, forcing broad
   clinical-role update access. Next release: split into explicitly authorized
   collections (see `READ-ME-FIRST.md`).
2. **No build step** — 50+ pages load shared scripts with manual `?v=` cache
   tokens; several JS files exceed 3,000 lines. Planned: ES modules + minimal
   bundler.
3. **Partial XSS hardening** — high-risk rendering paths use safe DOM/text
   handling; remaining `innerHTML` template paths still need a sweep.
4. **Offline mode disabled** — persistent Firestore cache is intentionally off
   for PHI safety; an encrypted, revocable offline store is planned.
5. **PACS/DICOMweb not configured** — the viewer renders uploaded `.dcm` files;
   a real QIDO-RS/WADO-RS endpoint is required for study-series browsing.
