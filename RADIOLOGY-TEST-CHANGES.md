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
