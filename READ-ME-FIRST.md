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

## Important remaining limitation

The current patient document is still monolithic. Several clinical roles must retain broad update access for the existing app to function. The next release must split demographics, encounters, notes, prescriptions, results, and billing into explicitly authorized collections.

## Deploy rules with Firebase CLI

```bash
npm --prefix functions install
npm --prefix functions test
npm --prefix functions run test:emulator
npm --prefix tests install
npm --prefix tests run test:static
npm --prefix tests run test:rules
firebase deploy --only firestore:rules,functions,hosting
```

Use a staging Firebase project first. Never test security rules against production patient data.

See `SECURITY_SETUP.md` and `EMERGENCY_REMEDIATION.md` for the complete process.
