# PClinic Emergency Remediation

## Scope of this patch

This patch contains containment changes, not a full production certification.

### Authentication and staff access

- Firebase Auth persistence changed from browser-local to session-only.
- Unified logout signs out, clears PClinic local/session storage, attempts to clear old Firestore IndexedDB, and replaces browser history.
- A 15-minute inactivity logout was added.
- Login clears stale clinical caches and no longer remembers a Staff ID.
- Unauthenticated clinical file pages no longer receive a dummy user.
- Admin password viewing, browser account creation, and permanent staff deletion were removed/disabled.
- Staff status changes are reported successful only after Firestore confirms them.
- The admin page scrubs legacy `initialPassword` fields and overwrites old local staff mirrors without passwords.

### Firestore

- Default deny, explicit active profiles, and a role allowlist.
- Missing `active` is treated as inactive.
- HR, inventory, finance, and cashier are denied monolithic patient records.
- Patient identity/creator fields are immutable after creation.
- Patient deletion is admin-only.
- Unknown patient subcollections are denied; only the existing forms/files path is explicit.
- Media/data-URL fields are rejected.
- Orders, bills, messages, configuration, and the patient counter received tighter rules.
- Client-created audit entries are denied until a trusted backend writes them.
- 13 emulator security tests were added and pass with the Firestore emulator.

### Privacy and data integrity

- Persistent Firestore caching is disabled.
- Firestore snapshots are authoritative; stale browser records are not merged or automatically uploaded.
- New patients and central patient updates are cloud-first and fail visibly when Firestore rejects a write.
- Media, attachment, browser backup/restore, and browser patient CSV export paths are disabled.
- Obsolete public preview/test pages were deleted.
- The patient counter preview no longer consumes an ID repeatedly.

### Clinical safety

- Browser clinical treatment/posology generation is replaced by a fail-closed compatibility stub.
- Dose lookup UI and function source are replaced by disabled stubs.
- The disabled function must still be redeployed or removed in Firebase/Google Cloud if an older version is live.

### Web security

- Wildcard same-origin `postMessage` targets were replaced; message origins are checked.
- High-risk shared, reception, finance, and doctor patient rendering paths use text nodes/escaping.
- Firebase Hosting security headers were added, including frame protection and a transitional CSP.
- The CSP still requires `'unsafe-inline'` because the legacy app has many inline scripts/handlers. Complete XSS remediation and removal of `'unsafe-inline'` remain mandatory.

## Tests performed

- Firestore emulator: **13 passed, 0 failed**.
- Standalone JavaScript syntax: all checked files passed.
- Inline HTML scripts: all 108 extracted scripts passed syntax checks.
- Missing relative assets: none found.
- Duplicate static HTML IDs: none found.
- Wildcard `postMessage(..., '*')`: none found.
- `readAsDataURL`: none remains in deployed HTML/JS.
- Firebase Hosting emulator returned the configured CSP, frame, referrer, permissions, no-sniff, and no-store headers.

The emulator was run with `firebase-tools@13.35.1` in the review environment because its installed JDK was version 11. The checked-in current Firebase CLI requires JDK 21 or newer.

## Required manual actions

Code cannot perform these actions for you:

1. Verify and publish the new Firestore rules in the correct Firebase project.
2. Make the repository private.
3. Determine whether deleted preview values were genuine and rewrite Git history if necessary.
4. Rotate every staff password.
5. Verify no `/users/{uid}` document retains `initialPassword`.
6. Disable/delete orphaned or unknown Firebase Auth users.
7. Clear PClinic site data and close old tabs on every clinic device.
8. Review Auth, Firestore usage, Google Cloud, and GitHub logs for possible unauthorized activity.
9. Disable or redeploy any live clinical AI/dose Cloud Function.
10. Deploy through Firebase Hosting to receive the security headers; GitHub Pages does not use `firebase.json` headers.
11. Confirm Firebase data location, backup location, vendor/legal requirements, and any Rwanda cross-border storage approval.
12. Keep real-patient data entry paused until staging tests, role tests, and an independent review are complete.

## Apply the patch

From a clean clone of the reviewed commit:

```bash
git checkout main
git pull
git apply --check PCLINIC_EMERGENCY_HARDENING.patch
git apply PCLINIC_EMERGENCY_HARDENING.patch
npm --prefix tests install
npm --prefix tests run test:rules
git add -A
git commit -m "Emergency security hardening"
```

Use JDK 21+ with the checked-in Firebase CLI.

## Deploy in controlled stages

```bash
# Authenticate and select a staging project explicitly.
firebase login
firebase use <staging-project-alias>

# Run tests, then deploy rules to staging.
npm --prefix tests run test:rules
firebase deploy --only firestore:rules

# Test every role and logout/cache behavior in staging.
# Then deploy static hosting with headers.
firebase deploy --only hosting
```

Do not use `--force`, and do not deploy to production until you have confirmed the selected project ID.

## Remaining high-priority work

- Build Admin SDK staff provisioning, reset, disable, token revocation, and audit functions.
- Split the monolithic patient document into role-specific collections.
- Complete safe DOM rendering across every dashboard and remove inline event handlers.
- Replace the transitional CSP with a nonce/hash CSP without `'unsafe-inline'`.
- Add server-side immutable audit events.
- Add approved object storage for media.
- Replace whole-document order/bill writes with transactions and explicit state transitions.
- Add end-to-end tests for all roles and multi-device workflows.
- Obtain formal clinical, privacy, security, and regulatory review before restoring decision support or real-patient production use.
