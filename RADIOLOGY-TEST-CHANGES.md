# PClinic — radiology test suite restored (D2) + two defects it exposed

## How to apply (read before extracting)

Extract this zip **into your `Pclinic` project root** — the same folder that
contains `index.html`, `functions/` and `tests/`. It overwrites 6 files and adds
4; it deletes nothing.

```bash
cd Pclinic
unzip -o Pclinic-radiology-tests-2026-08-27.zip
```

**Before extracting, check whether you have local edits to `firebase.json` or
`functions/package.json`.** Both are replaced whole. To see your version's
differences against the repo:

```bash
git diff --stat firebase.json functions/package.json     # if your copy is a git checkout
```

If you edited them by hand, merge those edits back after extracting. Nothing
else in this package touches runtime behaviour.

Then install, so the emulator compatibility patch is applied:

```bash
npm --prefix functions install
npm --prefix tests install
```

`functions install` prints
`[pclinic] Patched firebase-functions functions.config() for the 13.x emulator.`
If it does not, `npm --prefix functions run test:verify-patch` will tell you.

**Do not deploy `functions/index.js` from this package unless you also want the
error-code fix (D9) live** — it is a behaviour change to the six radiology /
acknowledge callables, and it must be redeployed together with the rules.

## What is in the zip

| File | In / New |
|---|---|
| `functions/test/radiology-domain.test.cjs` | **new** — 8 unit tests for the pure state machine and validation layer |
| `functions/test/radiology-integration.test.cjs` | **new** — 10 emulator tests for the five `radiology*` callables |
| `scripts/patch-functions-config.cjs` | **new** — makes firebase-tools 13.x + firebase-functions 7 work (D8) |
| `RADIOLOGY-TEST-CHANGES.md` | **new** — this file |
| `functions/index.js` | replaced — D9: `invalid-argument` instead of `internal` on bad payloads |
| `functions/package.json` | replaced — `test:unit` resolves, adds `postinstall` / `test:verify-patch` / `test:emulator`, two devDeps |
| `functions/package-lock.json` | replaced — regenerated for those devDeps |
| `firebase.json` | replaced — Functions emulator pinned to `127.0.0.1:5001` |
| `READ-ME-FIRST.md` | replaced — deploy sequence now includes `test:verify-patch` |
| `EVALUATION_REPORT.md` | replaced — D2 closed, D8 + D9 recorded, §8 added |

## Verified on a pristine clone (Node 20, JDK 11, firebase-tools 13.35.1)

The package was extracted over a fresh `git clone` of `main`, then everything was
run from there. Before extraction:

```
npm --prefix functions test → Could not find 'functions/test/radiology-domain.test.cjs'
```

After extraction, with `npm install` in both folders:

```
npm --prefix functions run test:verify-patch → OK (patch applied by postinstall)
npm --prefix functions test                  → 12 tests, 12 pass, 0 fail
npm --prefix functions run test:emulator     → 10 tests, 10 pass, 0 fail
npm --prefix tests run test:static           →  8 tests,  8 pass, 0 fail
npm --prefix tests run test:rules            → 24 tests, 24 pass, 0 fail
```

`firebase.json` was re-parsed after extraction to confirm the hosting block
survived the replace: `public: "."`, CSP header present, emulator ports
`8080` / `5001`. Every file in the zip was byte-compared against the tested
tree.

## Two things worth knowing

1. **`npm --prefix tests run test:rules` never executes `functions/index.js`.** A rules-only
   green run proves nothing about the callables — that is how D8 stayed invisible.
2. **D8 was the blocker, not the missing test file.** Even with the test present, every
   callable died with `Your function was killed because it raised an unhandled error`
   because the 13.x emulator runtime calls the `functions.config()` API that
   firebase-functions v7 removed. Upgrading to `firebase-tools@15` would also fix it but
   forces JDK 21 on the clinic machines for the Firestore emulator.

## Still open from the earlier evaluation

- **D5/D6** — the app is served from GitHub Pages, so the CSP, `X-Frame-Options`,
  `Referrer-Policy` and `Permissions-Policy` headers in `firebase.json` are never sent;
  the repository is still public (`"private": false`) while `READ-ME-FIRST.md` step 7
  requires it to be private.
- **`'unsafe-inline'`** — 1,249 inline `on*="…"` handlers keep it mandatory.
- **D7** — monolithic patient document.

## Suggested commit message

```
Add radiology test suites; fix emulator compatibility and error codes

- functions/test/radiology-domain.test.cjs: 8 unit tests for the radiology
  state machine, field limits and the deterministic rad_<orderId> id
- functions/test/radiology-integration.test.cjs: 10 emulator tests for
  radiologyTransition/SaveDraft/Finalize/Addendum/AcknowledgeCritical,
  covering signature trust, report immutability, idempotent retries,
  critical-alert routing, role/inactive/unsigned denial, and the rule
  denials that keep callables as the only write path (closes D2)
- scripts/patch-functions-config.cjs: firebase-tools 13.x calls the
  functions.config() API removed in firebase-functions 7, which killed every
  callable in the emulator; patch makes it tolerant so test:emulator runs on
  the clinic's JDK 11 (closes D8)
- functions/index.js: wrap cleanText validation in the radiology and
  acknowledge callables so bad payloads return invalid-argument like the lab
  callables already do, instead of internal (closes D9)
- functions/package.json + lock: runnable test:unit, postinstall,
  test:verify-patch, test:emulator
- firebase.json: pin the Functions emulator port used by test:emulator
- READ-ME-FIRST.md, EVALUATION_REPORT.md: document the new commands and findings
```

---

# Round 2 (same day) — cross-computer file records

**Symptom:** an imaging request (or certificate/note form) is visible on the
computer that created it — and radiology's worklist shows the order — but it is
missing on every other computer.

**Cause:** `saveFile()` pushed to `patients/{id}/files` but nothing read it back.
`listFiles()` is `localStorage.getItem('pclinic_files')` only. Radiology sees the
request because `pcOrders.create()` writes `orders` with `dept:'radiology'` and
`pclinic-radiology.js:107` runs a real Firestore query.

**Changed:** `pclinic-file.js` (server merge + honest write reporting + retry),
`imaging-request.html` and `pclinic-filepage.js` (repaint on `pcFilesUpdated`),
`tests/pclinic-file-sync.test.mjs` (new, 6 tests, runs the real shipping module),
`tests/firestore.rules.test.mjs` (+2 tests), `tests/package.json` (`test:files`),
50 pages for the cache-buster only.

**`firestore.rules` is unchanged** — the reads were already permitted; only the
client was missing the download.

**Deploy:** upload `pclinic-file.js`, `pclinic-filepage.js` and the 51 pages
together so the `?v=20260827_FILES` tokens match.

---

# Round 3 (2026-08-28) — radiology reports page

**Reported as:** "this error" on the imaging-results page —
*"Image display requires an approved PACS/DICOMweb connection…"*

**Finding:** that notice is not an error. It is unconditional static markup at
`imaging-results.html:32`, so it renders for every patient whether or not
anything is wrong. The real risk was that the panel below it can show "no
reports" for three unrelated reasons, one of them a silent infrastructure
failure.

Fixed in `imaging-results.html`:

1. **Errors are shown instead of hidden.** The whole boot ran inside
   `.catch(function(){})`, and `pcRadiology.init()` rethrows on failure — so a
   dead Firestore subscription (permissions, offline, bad config) looked exactly
   like an empty queue. `initError` is now tracked and rendered with the machine
   reason plus a **Try again** button, and the subscription is attached *before*
   `init()` so a failed start still reaches the screen.
2. **Report matching is tolerant.** `String(r.patientId) === String(patient.id
   || patient.mrn)` silently dropped correctly-signed reports whenever the order
   carried the MRN while the patient object had another internal id. Now matches
   `id` / `mrn` / numeric MRN on either side, so a mismatch is visible rather
   than reported as absence. The empty message names the MRN it checked.
3. **Drafts are announced as drafts.** "No final radiology reports" is replaced
   with "1 draft awaiting final signature by Radiology" when one exists — the
   common real cause of an apparently empty panel.
4. **The notice is conditional.** It shows only when that patient has a report
   or draft, and is hidden on an empty queue.

Also `pclinic-radiology.js`: a failed `onSnapshot` now calls `stop()`, which
clears the memoised `initPromise`. Previously the error was permanent —
re-initialising returned the same rejected promise and the dashboard stayed
empty until a full page reload.

**Tests:** `tests/imaging-results-page.test.mjs` (new, 11 tests) extracts the
page's real inline script and runs it against a minimal DOM — it is what caught
that my first `retryLoad()` never re-rendered on success.
`npm --prefix tests run test:results`.

**Not changed:** no `firestore.rules` edit. `radiologyReports` already allows
`read` for doctor/nurse/radio, so if reports still do not appear, the cause is
`status: 'draft'`, a genuinely absent report, or the rules deployed in the
Firebase project differing from this file.

---

# Round 4–5 (2026-08-28) — "Start study" fails with `internal`

**Actual cause, measured against the live project:**

```
GET/POST https://africa-south1-pclinic-20d81.cloudfunctions.net/labSpecimenTransition
  -> 401 {"error":{"message":"Sign-in is required.","status":"UNAUTHENTICATED"}}   deployed
  .../radiologyTransition            -> 404 "Page not found"   never deployed
  .../radiologySaveDraft             -> 404   never deployed
  .../radiologyFinalize              -> 404   never deployed
  .../radiologyAddendum              -> 404   never deployed
  .../radiologyAcknowledgeCritical   -> 404   never deployed
```

All three laboratory callables are live; **none** of the five radiology ones are.
`REPLACE_INSTRUCTIONS.txt` listed only the three lab functions in its
`--only functions:…` line, so anyone following it deploys the laboratory and
silently skips radiology. Corrected in that file: use
`firebase deploy --only functions,firestore:rules`.

Until those five are deployed, "Start study" cannot move a study out of
`pending`, so no acquisition, report, signature or addendum is possible. There
is no client-side workaround — the state machine is backend-only by design.

**Round 4** wrapped every radiology callable rejection with a readable message,
following `labReleaseErrorMessage()` in `pclinic-lab.js`.

**Round 5** corrected that message, because the first version hedged ("is not
deployed, is unreachable, or crashed") and a reviewer would have redeployed
without reading the log. A missing callable answers with a bare Cloud Run 404,
which the SDK surfaces as `functions/internal` with **no** message, whereas a
crash carries real text — so `cloudCallErrorMessage()` now decides on the raw
string and says "is not deployed to project pclinic-20d81 in africa-south1"
with the exact command and the Cloud Run service name to check.

Two bugs in that first attempt were found by the new tests and fixed:

- the routing test sat *inside* the `code.includes('internal')` branch, so a 404
  arriving with no `code` at all — which is what Cloud Run actually returns —
  skipped it and fell through to the raw-message fallback;
- matching the status word as a substring would have misread ordinary crash text.
  `BARE_STATUS` is anchored with `^…$` on the whole raw string, and a dedicated
  test feeds it `"... (reading 'patientId')"` and `"retry code 404"` to prove a
  real crash stays in the "reached the server but failed to run" branch.

`tests/radiology-call-errors.test.mjs` (9 tests) pins all of it, including that
an unrecognised error is never handed raw HTML to a toast.

`pclinic-radiology.js` changed again in round 5, so the token moved to
`?v=20260828_CALLS` on the three pages that load it.
