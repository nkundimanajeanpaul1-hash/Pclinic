# Reception remediation deployment

## Required deployment order

1. Deploy `firestore.rules` first:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Deploy the hosting files (includes the new `beds-setup.html`):
   ```bash
   firebase deploy --only hosting
   ```
3. Sign in once as Reception. The first successful patient synchronization rebuilds the restricted `billingPatientDirectory` for existing patients.
4. Configure authoritative bed documents in Firestore collection `beds` — the easiest way is the new **`beds-setup.html`** page (Beds or Admin login), which creates ward bed ranges in bulk, shows the live registry, and (Admin only) can delete all beds.

## This round's changes (counter-referral, real bed assignment, server messages, staffId doctors)

- **Counter-referral list**: `markCounterReferral()` (patient modal button "↩️ Counter-Referral") now writes `counterReferral: true` plus `counterReferralDate/Note/By/ById` to the patient document; "Counter-Referral" in the Referrals view lists every patient marked on the common server and can clear the mark.
- **Admission reserves a real bed**: `raAdmission()` lists available/reserved beds from `beds`, prompts for a bed choice, then updates the patient (`queueStatus: 'admitted'`, inpatient location taxonomy, `bed: {ward, number, bedId, assignedAt}`) and marks the bed `occupied` with `patientId`/`patientName` (merged write). Discharge releases the bed back to `available`.
- **Beds rules** (deploy BEFORE hosting): Reception and Nurse may now assign/release a bed — `status` only to `available`/`occupied`/`reserved`, and `ward`/`bedNumber` are immutable. Beds/Admin keep full control (create, `maintenance`/`unavailable`, delete). Theater read-only, unchanged.
- **Staff profiles readable for selection**: `users` now allows `get` to any active staff member and `list` to active `reception`, `doctor`, `nurse`, `theater`, `beds` and `hr` (plus Admin), so Reception can load doctors by immutable `staffId`. Profiles contain only `staffId`/`name`/`role`/`active` — no email or phone is exposed.
- **Doctor selection by staffId**: the appointment doctor dropdown is populated from `users` (role `doctor`, active) showing staff names with IDs; the appointment stores `doctorStaffId` and the notification is written with `toStaffId`, so the exact doctor receives it on their dashboard. Falls back to the previous static name list if Firebase is unavailable or no doctor profiles exist.
- **Appointment department upgraded** to the 4-level location taxonomy (`Outpatient/Inpatient → Surgical/Non-surgical → specialty`), grouped in the select; stored via `PCLINIC_DEPTS.deptPath(...)` like every other department value.
- **Messages inbox reads the server**: `raMessages()` now reads the `notifications` collection for the logged-in role (`toRoles` array-contains) and the logged-in staffId (`toStaffId` ==), dedupes, sorts by time, distinguishes unread from read, and offers "Mark all as read" (`read: true` + `readAt`).
- **New page `beds-setup.html`**: Beds/Admin configure the `beds` registry in bulk (ward name + prefix + start number + count), view the live registry grouped by ward with status badges, and Admin can delete all beds.

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

Reception, Nurse, Beds and Theater can read. Beds/Admin have full control (all statuses). Reception and Nurse may assign (`occupied`) or release (`available`) a bed, may keep it `reserved`, and cannot rename its ward/bed number or set `maintenance`/`unavailable`. Reception shows no beds rather than simulated data when the collection is empty or unavailable (and points to `beds-setup.html`).

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
- 24 Firestore emulator tests pass (including "bed registry: operational roles read; Reception/Nurse assign/release; Beds full control" and "clinical roles can read staff profiles (for staffId selection); non-clinical roles cannot list").
- Reception, Doctor, Cashier, Nurse, Beds and Theater role boundaries are tested using isolated authenticated emulator contexts.

## Important live verification

Automated emulator tests do not replace a deployed multi-browser acceptance test. After deployment, use real non-production accounts for Reception, Doctor, Cashier, Nurse, Beds and Theater and verify:

- Reception creates/edits a patient and Cashier sees only the restricted billing identity.
- Reception appointment appears as a server notification for the intended Doctor.
- Reception surgery appears for Theater.
- Beds changes appear live on Reception and Beds dashboards.
- Denied roles cannot read full patient records or modify beds.
- Appointment/surgery confirm and cancel show success only after Firestore accepts the write.

## Post-deploy verification for this round

1. Sign in as **Beds or Admin** and open `beds-setup.html`; create at least two wards (e.g. `ICU` and `Ward A`) and confirm the live registry shows them.
2. As **Reception**: admit a patient — the bed list should offer only available/reserved beds; after choosing one, the Beds tab shows that bed **occupied** and the patient's location shows the inpatient taxonomy (e.g. `Inpatient - Non-surgical - General Medicine (OPD) - Ward`).
3. As **Reception**: discharge that patient — the bed returns to **available** and the patient's `bed` field is cleared.
4. As **Reception**: open a patient and press **↩️ Counter-Referral** (with an optional note), then open the **Counter-Referral** list in Referrals — the patient appears with date, note and status; the modal button becomes **↩️ Clear Counter-Referral**.
5. As **Reception**: open **Messages** — it must show server notifications addressed to the Reception role or staffId (not just locally sent ones), unread vs read styling, and **Mark all as read** must persist.
6. As **Reception**: book an appointment — the department select is grouped into OPD/Inpatient × Surgical/Non-surgical specialties, and the doctor select shows active doctor staff names **with staff IDs**. Verify the target doctor's dashboard receives a notification (delivered via `toStaffId`).
7. As **Nurse**: try to assign and release a bed (allowed), and try to set a bed to `maintenance` (must be denied). As **Theater**: bed reads work but any bed write is denied. As **Cashier/Finance**: `users` listing is denied.
