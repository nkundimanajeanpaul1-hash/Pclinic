# Reception remediation deployment

## Required deployment order

1. Deploy `firestore.rules` first:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Upload/deploy all changed web files.
3. Sign in once as Reception. The first successful patient synchronization rebuilds the restricted `billingPatientDirectory` for existing patients.
4. Configure authoritative bed documents in Firestore collection `beds` using a Beds/Admin account or approved migration.

## Bed document schema

Collection: `beds`; document ID equals `id`.

```json
{
  "id": "ICU-1",
  "ward": "ICU",
  "bedNumber": "ICU-1",
  "status": "available",
  "patientId": "",
  "patientName": "",
  "updatedById": "53001"
}
```

Allowed statuses: `available`, `occupied`, `reserved`, `maintenance`, `unavailable`.

Reception, Nurse, Beds and Theater can read. Only Beds/Admin can change records. Reception shows no beds rather than simulated data when the collection is empty or unavailable.

## New collections

- `billingPatientDirectory`: restricted identity and payer fields for Cashier/Finance. No clinical notes, National ID, phone or diagnosis.
- `notifications`: server-backed role/staff notifications.
- `beds`: authoritative bed registry.

## Tests executed

```bash
cd tests
npm ci
npm run test:all
```

Expected result:

- 8 dashboard/schema role-contract tests pass.
- 23 Firestore emulator tests pass.
- Reception, Doctor, Cashier, Nurse, Beds and Theater role boundaries are tested using isolated authenticated emulator contexts.

## Important live verification

Automated emulator tests do not replace a deployed multi-browser acceptance test. After deployment, use real non-production accounts for Reception, Doctor, Cashier, Nurse, Beds and Theater and verify:

- Reception creates/edits a patient and Cashier sees only the restricted billing identity.
- Reception appointment appears as a server notification for the intended Doctor.
- Reception surgery appears for Theater.
- Beds changes appear live on Reception and Beds dashboards.
- Denied roles cannot read full patient records or modify beds.
- Appointment/surgery confirm and cancel show success only after Firestore accepts the write.
