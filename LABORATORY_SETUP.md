# PClinic Laboratory Result Release — Deployment

The laboratory workflow uses callable Cloud Functions for trusted specimen transitions and final result release:

- `labSpecimenTransition` atomically accepts/accessions or rejects the selected patient's active orders.
- `labFinalize` performs the authoritative final-release operation.

## What `labSpecimenTransition` commits atomically

1. Validates the signed-in staff member has the Laboratory role.
2. Validates every submitted order belongs to the selected patient and is still active.
3. Marks the grouped orders `in-progress` with trusted accession attribution, or rejects them with a required reason.
4. Safely materializes legacy `patient.labRequests` only after matching them to the real patient request.
5. Sends specimen-rejection notification to the exact requesting clinician when `orderedById` is available.
6. Writes server-side audit events and returns only after the whole grouped transition commits.

## What `labFinalize` commits atomically

1. Validates the signed-in staff member has the Laboratory role.
2. Validates the laboratory order and patient identity.
3. Requires results for every ordered test item.
4. Creates an immutable `labResults/{orderId}` report.
5. Marks `orders/{orderId}` completed.
6. Appends a compatibility summary to `patients/{patientId}.labResults`.
7. Sends a message to the exact requesting clinician using `orderedById`.
8. Creates `labCriticalAlerts/{orderId}` for critical values.
9. Writes a server-side audit event.
10. Supports verified migration of old patient laboratory requests whose order document was never created.

## Required deployment order

From the project root, using a Firebase account authorized for `pclinic-20d81`:

```bash
firebase login
firebase use pclinic-20d81
firebase deploy --only functions:labSpecimenTransition,functions:labFinalize,functions:labAcknowledgeCritical,firestore:rules
firebase deploy --only hosting
```

You can deploy everything together instead:

```bash
firebase deploy
```

Deploy the functions and rules before testing a recovered legacy request. New, real order documents retain a rules-protected direct fallback while functions propagate. Legacy specimen accession/rejection requires `labSpecimenTransition`, and legacy final release requires `labFinalize`.

## Verification checklist

1. Sign in as a doctor and select a patient explicitly.
2. Submit a laboratory request and confirm the success message says the common-server order was confirmed.
3. Sign in as Laboratory staff on another browser/device.
4. Select the patient, accept the specimen and open Worklist.
5. Enter every required result. Numeric ranges automatically set High/Low; Critical remains an explicit technologist decision.
6. Select **Validate & Release to Requesting Doctor**.
7. Confirm Firestore contains:
   - `orders/{orderId}` with `status: completed`
   - `labResults/{orderId}` with `status: final`
   - `patients/{patientId}.labResults`
   - `messages/lab-result-{orderId}`
   - `auditLog/{generatedId}`
   - `labCriticalAlerts/{orderId}` when a result was flagged Critical
8. Confirm the requesting doctor receives a live result notification and can see the result in the patient’s Lab Results tab.

## Local validation

```bash
cd functions
npm test
node --check index.js
node --check ../pclinic-lab.js
node --check ../pclinic-orders.js
```

Firestore emulator tests require Java 21 or newer.
