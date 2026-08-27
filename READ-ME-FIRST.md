# PClinic Emergency Security Release — Read First

This branch is a containment release for a clinic project that may contain real patient data.
It is **not** a declaration that the application is production-ready.

## Before using the app

1. Pause real-patient data entry.
2. In Firebase Console, verify the rules that are actually deployed.
3. Run the emulator tests in `tests/`.
4. Publish `firestore.rules` only after the tests pass and you confirm at least one active admin profile exists.
5. Rotate all staff passwords and delete every legacy `initialPassword` field from `/users/{uid}`.
6. Clear PClinic site data on all clinic devices and close every old PClinic tab.
7. Make the GitHub repository private.
8. Review Firebase Auth users and disable unknown/orphaned accounts.

## Controls added in this release

- no date-based or public Firestore access;
- explicit active staff profiles and validated roles;
- HR, inventory, finance, and cashier cannot read monolithic clinical patient documents;
- browser staff creation, password viewing, and permanent deletion are disabled;
- legacy plaintext password fields are scrubbed when an administrator loads the staff table;
- logout signs out of Firebase and clears PClinic browser stores;
- persistent Firestore cache is disabled and old cache cleanup is attempted on logout;
- patient creation and updates fail closed when Firestore does not confirm the write;
- stale local patient records are never automatically uploaded;
- patient media, attachments, browser backup/restore, and CSV patient exports are disabled;
- clinical AI/dose recommendations are disabled;
- wildcard `postMessage` targets were replaced and message origins are checked;
- public obsolete/preview pages were removed;
- high-risk reception and shared UI rendering paths now use safe DOM/text handling;
- the patient-counter preview no longer consumes a Firestore ID every five seconds;
- radiology orders, drafts, final reports, addenda and critical acknowledgments use the central server;
- final radiology reports are signed by trusted backend functions and are immutable;
- the fake image stack was removed and will remain unavailable until an approved PACS/DICOMweb endpoint is configured.

See `RADIOLOGY_SETUP.md` before deploying the radiology workflow.

## Clinical file records are now shared between computers

Until 2026-08-27, `pclinic-file.js` `saveFile()` pushed each request/form record
to `patients/{patientId}/files` but **nothing ever read that collection back**.
`listFiles()` — the only reader used by `imaging-request.html`,
`pclinic-filepage.js` and `medical-summary.html` — served `localStorage`
(`pclinic_files`), so a record was visible only on the computer that created it,
even though radiology's worklist (which does query Firestore) saw the order.

`listFiles()` now merges the server records, `saveFile()` reports a rejected
write instead of swallowing it (`.catch(function () {})` is gone), and failed
records stay visible locally and are retryable via `pcFile.retryFileSync(id)`.

- **No Firestore rules change was needed.** `patients/{id}/files` already had
  `allow read: if patientReader()`; only the client was missing the download.
  `tests/firestore.rules.test.mjs` now pins that: doctor/reception/nurse/radio/
  lab/admin can read a colleague's file record, and cashier/finance/hr cannot.
- **Cache-busting is mandatory for this deploy.** 52 pages reference
  `pclinic-file.js?v=…`; the token is now `v=20260827_FILES`. Upload those pages
  together with `pclinic-file.js` or some browsers keep the old script.
- Firebase Storage is still **not** configured, so image/attachment payloads
  remain disabled by design (`firestore.rules` rejects `data`/`photo`/`video`
  keys on this path). This change shares the *records*, not image bytes.

## Important remaining limitation

The current patient document is still monolithic. Several clinical roles must retain broad update access for the existing app to function. The next release must split demographics, encounters, notes, prescriptions, results, and billing into explicitly authorized collections.

## Deploy rules with Firebase CLI

```bash
npm --prefix functions install
npm --prefix functions run test:verify-patch
npm --prefix functions test
npm --prefix functions run test:emulator
npm --prefix tests install
npm --prefix tests run test:static
npm --prefix tests run test:files
npm --prefix tests run test:rules
firebase deploy --only firestore:rules,functions,hosting
```

`functions install` runs `scripts/patch-functions-config.cjs`, which stops the
13.x Cloud Functions emulator from calling the `functions.config()` API that
firebase-functions v7 removed — without it every callable dies with
`Your function was killed because it raised an unhandled error` and
`test:emulator` cannot run.
If you skip `test:verify-patch` and the patch is missing, expect the emulator
suite to fail for reasons that have nothing to do with your code. `npm test`
also runs it. All four suites pass on Node 20 + JDK 11 (12/8/24 unit, static
and rules tests, 10 for the radiology integration suite).

Use a staging Firebase project first. Never test security rules against production patient data.

See `SECURITY_SETUP.md` and `EMERGENCY_REMEDIATION.md` for the complete process.
