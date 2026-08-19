# PClinic Security Setup — Emergency Baseline

## 1. Stop and verify

Do not resume real-patient data entry until all items below are complete.

- Confirm which Firestore rules are currently published in Firebase Console.
- Confirm every legitimate staff profile has `active: true`, a valid role, and a numeric `staffId`.
- Confirm at least one administrator can sign in before publishing the new rules.
- Preserve relevant logs before cleanup if unauthorized access may have occurred.

## 2. Deploy the rules safely

The checked-in `firestore.rules` defaults to deny and removes date-based public access.
It also makes missing `active` fields inactive by default.

Run against a staging/demo project:

```bash
npm --prefix tests install
npm --prefix tests run test:rules
```

Then deploy with explicit confirmation:

```bash
firebase deploy --only firestore:rules
```

Uploading a rules file to GitHub does not publish it to Firebase.

## 3. Clean up credentials

The old release stored `initialPassword` in Firestore and `pclinic_staff` in browser storage.

1. Rotate every staff password through an authorized administrator.
2. In Firestore `/users`, delete the `initialPassword` **field** from every document. Do not delete the user profile document.
3. Clear PClinic site data on every clinic device.
4. Disable unknown and orphaned Firebase Auth users.
5. Never share passwords through screenshots, chat, spreadsheets, or GitHub.

The patched admin page also attempts one-time removal of `initialPassword` when an administrator loads the staff table, but manual verification is still required.

## 4. Staff lifecycle during emergency mode

Browser-side account creation and permanent deletion are disabled.

Until an Admin SDK backend is deployed, create/reset/disable accounts only through the authorized Firebase administrative process. For a manually created profile, use the Firebase Auth UID as the Firestore document ID and these fields:

| Field | Type | Example |
|---|---|---|
| `staffId` | string | `10001` |
| `name` | string | `Authorized Staff Name` |
| `role` | string | `admin` |
| `active` | boolean | `true` |
| `createdAt` | timestamp | server/current timestamp |
| `createdBy` | string | authorized administrator ID |

Allowed roles are: `admin`, `doctor`, `nurse`, `reception`, `lab`, `pharmacy`, `radio`, `physio`, `cashier`, `finance`, `hr`, `inventory`, `theater`, and `beds`.

Use **Deactivate** rather than deleting a profile. The next backend must use Firebase Admin SDK to create users, reset passwords, disable Auth accounts, revoke sessions, update claims, and write audit events atomically.

## 5. Device cleanup

On every clinic device:

1. Close all PClinic tabs.
2. Clear site data for the PClinic origin, including local storage and IndexedDB.
3. Reopen one tab and sign in.
4. Verify logout returns to the login page and browser Back does not reopen patient data.
5. Use managed devices with screen lock, disk encryption, separate user profiles, and remote wipe.

Persistent/offline clinical caching is disabled in this emergency release.

## 6. Features intentionally disabled

These remain disabled until a reviewed replacement exists:

- clinical AI treatment/dose recommendations;
- patient images, attachments, and videos;
- browser backup/restore and patient CSV exports;
- browser-side staff creation, password viewing, and permanent deletion.

## 7. Required next phase

- Admin SDK account-management backend with App Check and rate limiting;
- server-side immutable audit events;
- split patient data model with per-role field/collection access;
- Firebase Storage with content, size, malware, retention, and role controls;
- strict CSP and completion of the XSS remediation across every page;
- multi-device conflict testing or a formally designed encrypted offline store;
- backups, restore drills, monitoring, incident response, and independent testing.

This guide is technical guidance, not legal advice. If exposure may have occurred, involve the clinic's data-protection and legal/compliance leads immediately.
