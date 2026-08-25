# Reception Dashboard — Functional Evaluation
**Date:** 2026-08-25 · **Scope:** `reception-dashboard.html` + its JS modules · **Mode:** Common Server (Firebase `pclinic-20d81` / `patients`)

## Overall verdict
**Functioning well for core operations, with a few real gaps.**
All critical patient operations (register, queue, appointments, surgery, triage, vitals, transfer, admission, discharge, billing requests, notifications) are **server-backed** — data lands in Firestore and is visible to Doctor/Cashier/Nurse dashboards. The weak spots are mostly *list/view actions that filter by text search missing fields*, and a handful of buttons that are informational-only by design.

**Score: ~85/100 functional** (was ~75 before this evaluation's fixes).

---

## ✅ Working correctly (server-backed — verified in code)

| Function | How it works | Server write |
|---|---|---|
| **New Patient Registration** (4-step Tahoe wizard) | Full validation (Rwanda 16-digit Nat ID, +250 phone, email, pediatric guardian rules), duplicate check by Nat ID + phone, auto MRN, insurance % defaults (RSSB/RAMA 15%, Mutuelle 10%, MMI 15%, self 100%) | ✅ `addPatient` → Firestore + billing directory sync |
| **Edit patient** (Select to Edit) | Loads all fields incl. the new 4-level location; saves via update | ✅ `updatePatient` |
| **Unified search** (one bar, top) | Searches name/MRN/ID/phone/Nat ID/guardian ID/birth cert/district + doctor schedules; drives the active table | ✅ reads server data |
| **Queue** | Priority-sorted, real waiting time (no fake random), View/Call/Triage/Vitals/Book RDV/Complete | ✅ call, triage, vitals, complete all write to server |
| **Triage** | Sets priority critical/high/medium/low | ✅ |
| **Vitals** | BP "120/80" parsed to systolic/diastolic, pulse, temp | ✅ `addVitals` |
| **Referrals** | Referral In/Out, status filter incl. **All patients (entire system)**, priority filter, search | ✅ Referral Out writes `visitType`/`referralSource` |
| **Appointments (RDV)** | Select patient → date/time/dept/doctor/priority; confirm/cancel; **server notification to doctor** | ✅ appointment stored on patient + `notifications` doc |
| **Surgery booking** | Patient/date/time/procedure/surgeon/theater; confirm/cancel; **server notification to Theater** | ✅ |
| **History / All patients** | Date filters (today/yesterday/7d/months), status, **grouped 4-level department filter**, today/yesterday counters | ✅ reads server |
| **Reports** | Gender/insurance/dept/district/visit/date/age diagrams + filtered table; quick buttons (Cardio/OPD/Gyne now use taxonomy values) | ✅ reads server |
| **Precise location** (new) | Registration, filters, patient popup, Move, Admission all use Inpatient/OPD → Surgical/Non-surgical → Specialty → Unit; legacy records auto-parsed | ✅ structured fields saved |
| **Move / Transfer** (now taxonomy) | Prompt accepts `Inpatient - Surgery - Cardiothoracic - ICU` (typos like `cardiothoracis`, `cardiotho` recognized) → saves path + structured fields | ✅ |
| **Admission / Discharge** (now taxonomy) | Admission sets `inpatient` + `ward` unit and rewrites location path; Discharge sets inactive + `dischargedAt` | ✅ |
| **Beds view** | Read-only from authoritative `beds` collection — **no simulated availability** | ✅ read |
| **Billing request → Cashier** | Sends server notification with MRN to cashier role | ✅ |
| **Notify doctor / My messages** | `notifications` collection (role-targeted, rules-compliant) | ✅ |
| **Insurance filters** (RSSB/Mutuelle/MMI) | Now actually list the patients (search haystack fixed) | ✅ |
| **Ambulance / Emergency / HC-CHUK / Counter quick lists** | Counts were right but tables were empty → **fixed** (search now includes arrivalMode, visitType, referralSource, insurance, priority, status…) | ✅ |
| **AI Reception Assistant** | Rule-based workflow answers (registration, RDV, beds, insurance, emergency…) — honest about not being a real AI provider | n/a |
| **Activity feed, stats aside, dark mode, keyboard shortcuts, print** | Cosmetic/local | n/a |

## 🔧 Fixed during this evaluation (commit `489723b`)
1. **Quick-filter buttons showed empty tables** — History search did not include `visitType`, `arrivalMode`, `referralSource`, insurance provider, `queueStatus`, `priority`, `status`, `sector/cell`, `personId`, `archiveCode`, `bloodGroup`, `allergies`. Buttons (Ambulance, Emergency, CHUK, RSSB, Mutuelle, MMI) showed the right *count* in the toast but an *empty list*. Now the list matches the count.
2. **Move/Transfer used old flat departments** (free text "General/Cardiology/…") — now accepts and saves the precise 4-level location (with typo tolerance), keeping tracing consistent.
3. **Admission wrote plain "Ward"** — now marks the patient `Inpatient` + unit `Ward` and rewrites the location path (e.g. `Inpatient - Surgery - Cardiothoracic Surgery - Ward`).
4. **Referrals "Export" button was fake** (toasted "exported" without exporting anything) — replaced with the same locked/honest message used by History/Reports exports.

## ⚠️ Missing / not yet functional (honest list)
1. **Counter-Referral list is effectively dead** — it searches history for the text "counter", but nothing in the system *writes* a counter-referral marker. Needs a small workflow decision: when reception books the return visit, save e.g. `counterReferral: true`. (Currently: only useful if a name/text literally contains "counter".)
2. **Beds are not linked to admission** — Admission marks the patient "Inpatient/Ward" but does **not** reserve a numbered bed in the `beds` collection (no transactional bed reservation). A patient can be "admitted" while the bed registry shows the ward full. Needs a bed-selection step + reserved status write (production task).
3. **`beds` collection must be configured** in production — if empty, Beds tab shows "No authoritative bed records" (by design, no fake beds).
4. **"My Orders"** shows a count from `getAllBills()` — Reception may be denied by Firestore rules on the `bills` collection, so this can always show 0. Cosmetic only.
5. **Messages view** reads *local* notifications (localStorage) rather than the server `notifications` collection — server notifications are *sent* by reception fine, but reception's own inbox view is local-only.
6. **raEdit opens an arbitrary (first) patient**, not "the last one" — works but confusing; the proper path is Search → View → Edit.
7. **Appointment department** still uses the old flat list (General/Cardiology/…) while patient location uses the new taxonomy — appointment records won't carry the 4-level path yet.
8. **Doctor selection by display name** — appointments/notifications target `doctor` by name string; production should switch to immutable `doctorStaffId`.
9. **Old patient records** have free-text departments only — the new filters handle this via alias parsing, but structured backfill (one-time sync) would make reports cleaner.
10. **Exports locked by design** (History/Reports/Referrals) — intentional security posture, not a bug.
11. **Not yet done:** real multi-browser testing with Reception/Doctor/Cashier accounts; `billingPatientDirectory` backfill for pre-existing patients (happens automatically on next Reception sync of those patients).

## 🔒 Production deployment still required
```bash
firebase login
firebase use pclinic-20d81
firebase deploy --only firestore:rules   # FIRST (new collections: billingPatientDirectory, beds, notifications)
firebase deploy --only hosting
```

## Test evidence
- `node --check`: all inline scripts + all loaded JS files — **pass**
- 225 HTML IDs, no duplicates; all local resources resolve — **pass**
- Location taxonomy: 15 matching tests + 8 free-text parse tests (incl. user's exact examples and typos) — **pass**
- `npm run test:all` (static + Firestore rules emulators): 8 + 23 tests — **pass** (previous session, see `RECEPTION_TEST_RESULTS.txt`)
