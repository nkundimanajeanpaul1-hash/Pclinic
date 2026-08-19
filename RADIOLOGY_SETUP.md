# PClinic Radiology Workflow Setup

## What this release makes functional

- Firestore-backed real-time imaging worklist across devices.
- Controlled state machine: pending → in progress → acquired → reporting → reported.
- Cancellation with a required reason.
- Stable, reopenable draft per imaging order.
- Server-side final signing, order completion, clinician notification and audit event.
- Immutable final reports.
- Signed, versioned addenda instead of editing final reports.
- Structured critical-result notification and requesting-clinician acknowledgment.
- Final report display in the doctor imaging-results page.
- Server-backed signed-report history and printing.
- No clinical report storage in `localStorage`.

## Intentional PACS limitation

The old fake image stack was removed. The viewer now states **PACS not configured**.
A real image viewer requires an approved DICOMweb endpoint providing QIDO-RS and WADO-RS, normally through Orthanc or another PACS. Do not place PACS credentials in frontend JavaScript or GitHub.

## Default access policy

- Doctors, nurses and reception workflows create imaging orders.
- Radiology staff process orders, complete acquisition, draft and finalise reports.
- Radiology browser clients cannot directly mutate orders or reports.
- Trusted callable functions perform transitions and signing atomically.
- Doctors, nurses and radiology staff may read final reports.
- Only the requesting clinician (or admin) may acknowledge a critical result.

## New Firestore collections

- `radiologyReports/{reportId}` — one stable draft/final report per imaging order.
- `radiologyAddenda/{addendumId}` — immutable signed addenda.
- `criticalAlerts/{reportId}` — critical notification and acknowledgment state.
- `auditLog/{entryId}` — server-created immutable workflow events.

Existing imaging orders remain in `orders/{orderId}` and gain `radiologyState`, acquisition timestamps and `reportId`.

## New callable functions

All functions deploy in `africa-south1`:

- `radiologyTransition`
- `radiologySaveDraft`
- `radiologyFinalize`
- `radiologyAddendum`
- `radiologyAcknowledgeCritical`

Firebase Functions normally requires the Firebase project to use the Blaze billing plan. Set budget alerts and least-privilege account access before deployment.

## Install and test

Use Node.js 22 for Functions and JDK 21+ for the current Firestore emulator.

```bash
npm --prefix functions install
npm --prefix functions test
npm --prefix functions run test:emulator
npm --prefix tests install
npm --prefix tests run test:static
npm --prefix tests run test:rules
```

Expected checks:

- Functions domain tests: 4 passing.
- Server workflow emulator integration tests: 3 passing.
- Firestore rules: 16 passing.
- Static HTML/JavaScript checks: all passing.

## Deploy to staging first

```bash
npx firebase-tools@15.27.0 login --no-localhost

npx firebase-tools@15.27.0 deploy \
  --project <STAGING_PROJECT_ID> \
  --only firestore:rules,functions,hosting
```

Test the complete workflow with fictional patients before production deployment.

## Required staging scenarios

1. Doctor creates an imaging order.
2. Radiology sees the order on another browser/device.
3. Radiology starts the study.
4. Radiology marks acquisition complete.
5. Draft is saved, page refreshed and draft reopened.
6. Opening a second patient clears the first patient's report content.
7. Wrong-patient report attempts are blocked by both browser and backend.
8. Final signing requires findings and impression.
9. A final report becomes read-only and cannot be overwritten.
10. Doctor sees the final report on the imaging-results page.
11. Addendum is appended without changing the original final report.
12. Critical report requires a verbal notification recipient.
13. Only the requesting clinician can acknowledge the critical alert.
14. Failed backend writes never show a success message.
15. Logout clears browser clinical state.

## Existing legacy radiology reports

Previous reports stored only in browser `pclinic_files` are not automatically uploaded or migrated. Previous Firestore documents under `patients/{patientId}/files` also are not automatically copied into `radiologyReports`.

Do not run an automatic migration against real patient data without a reviewed mapping, backup, test project and rollback plan.

## Connecting a PACS later

Provide only non-secret technical details to the implementation team:

- PACS product and version.
- DICOMweb base URL.
- QIDO-RS/WADO-RS availability.
- Network location and CORS policy.
- Authentication method.
- Study/series UID mapping.

Credentials must be stored in an approved server-side secret manager, never in the repository.
