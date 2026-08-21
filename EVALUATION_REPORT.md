# PClinic — Evaluation: Lab Request Submission Denied

**Date:** 2026-08-21 · **Repo:** nkundimanajeanpaul1-hash/Pclinic (commit d2b3c72)
**Symptom:** Submitting a lab request shows
*"❌ Failed to submit lab request: The order was not accepted by the common server.
Check your connection and staff permissions, then retry."*

---

## 1. Where the error comes from (exact trace)

That exact sentence exists in **one place** in the whole codebase:

- `lab-request.html` → `submitLabRequest()` (line ~1269) calls
  `window.pcOrders.createAsync({...})` → `createOrderAsync()` in `pclinic-orders.js` (line ~574)
- `createOrder()` builds the order locally, then `trackedSync('orders', id, order)` →
  `sync()` does a **direct browser write** `setDoc(db, 'orders', orderId, payload)`.
- If Firestore **rejects** the write, `sync()` resolves `false` →
  `createOrderAsync` throws the toast above.

**Critical clue — the patient write succeeded.** `submitLabRequest()` writes the request into
the patient document *first* (`updatePatient(id, {labRequests})`), and only creates the order
after that is confirmed. `updatePatient` fail-closes (`savePatientToFirebase_FIELD_ONLY`
returns `false` on a denied write, with its *own* error message). Since the user's toast is the
**order** message, we know: connection OK, auth OK, profile readable/active, role allowed to
update patients — but the `orders/{id}` write was **denied by the live Firestore rules**.

## 2. What I verified by running the code

| Check | Result |
|---|---|
| Error string unique to `createOrderAsync` | ✅ confirmed |
| Repo rules allow the exact client payload | ✅ **20/20 emulator tests pass** — see §3 |
| Live client == repo client | ✅ downloaded from the deployed site (GitHub Pages): `pclinic-orders.js`, `lab-request.html`, `auth-guard.js`, `firebase-config.js`, `pclinic-state.js`, `patient-data.js`, `pclinic-catalog.js` are **byte-identical** to the repo |
| Firebase Hosting (`pclinic-20d81.web.app`) | ❌ not deployed — "Site Not Found"; the app is served from **GitHub Pages** |
| Ancient "allow everyone" rules still live? | ❌ anonymous REST probes → 403 everywhere, so an auth-required ruleset is deployed |
| `functions` unit tests | ✅ lab-domain 4/4 pass (radiology test file is missing — see D2) |

## 3. Emulator verification of the rules (the decisive test)

The repo's rules tests never covered **doctor/nurse order creation** — the exact path failing
in the clinic. I added that test (`tests/firestore.rules.test.mjs`, "doctor creates a lab order
exactly as pclinic-orders.js createOrder() does") replicating the exact payload the client
sends (`id`, `orderedById`, `status: 'pending'`, `dept: 'lab'`, items, bill fields, history).

```bash
cd tests && npx firebase emulators:exec --config ../firebase.json \
  --project demo-pclinic --only firestore "node --test firestore.rules.test.mjs"
# Result: # tests 20, # pass 20, # fail 0
```

**Conclusion:** with `firestore.rules` as written in the repo, a doctor/nurse/receptionist
(order-create roles, +admin) *can* create a lab order with the client's exact payload — and
mismatched `id`, `orderedById`, or `status` are correctly denied. **The repo code is
self-consistent; the failure cannot be reproduced with repo rules + repo client.**

## 4. Root cause

The live Firebase project's **deployed Firestore rules do not match the `firestore.rules`
file in the repo** (or live data violates a constraint of the deployed rules). The repo itself
warns about this in `SECURITY_SETUP.md`:

> *"Uploading a rules file to GitHub does not publish it to Firebase."*

Supporting facts: the deploy instructions in `READ-ME-FIRST.md` are broken (§5, D1–D2), so the
rules very likely were never deployed from this file; the clinic serves the app from GitHub
Pages instead of Firebase Hosting, so "releases" are just file uploads with no rules deploy
step; and the toast signature (patient update OK + order create denied) can only be produced
by a live ruleset whose `orders` create is stricter than its `patients` update.

## 5. Confirm in the live project (5-minute checklist)

1. **Firebase Console → project `pclinic-20d81` → Firestore → Rules tab** — compare with the
   repo's `firestore.rules`. If different → that is the bug. Redeploy with
   `firebase deploy --only firestore:rules` (tests pass, see §3).
2. **Browser DevTools → Console** while submitting — look for
   `[pclinic] server write failed:` — the code tells all:
   `permission-denied: Missing or insufficient permissions.` = rules;
   `unavailable` / `Failed to fetch` = network/emulator.
   (After my patch below, the toast itself now shows this reason in parentheses.)
3. **Firestore → `users` collection → your own profile doc** (the Auth UID) — confirm:
   `staffId` is a string matching the logged-in number, `role` is
   `doctor`/`nurse`/`reception`/`admin`, and `active` is `true` (the current rules require
   `active == true` explicitly — a legacy profile without the field is denied).
4. **Network tab** → the failed `firestore.googleapis.com/.../Write` request → response body
   shows the rules condition that evaluated false (line numbers map to the deployed ruleset).

## 6. Defects found & fixed

| # | Defect | Severity | Action |
|---|---|---|---|
| D1 | `tests/` has **no `package.json`** — `npm --prefix tests install` and `npm --prefix tests run test:static/test:rules` from `READ-ME-FIRST.md` cannot work; the rules suite could never run | High | **Fixed** — added `tests/package.json` (rules-unit-testing ^5, firebase ^12, firebase-tools 13.35.1 pinned; v15 needs Java 21, clinic machines usually have 11) |
| D2 | `functions/package.json` `test:unit`/`test:integration` reference **missing** `test/radiology-domain.test.cjs` → `npm --prefix functions test` fails | Medium | Needs the file restored or the script trimmed |
| D3 | Rules tests never tested doctor/nurse **order creation** — the failing path was uncovered | High | **Fixed** — test added (passes) |
| D4 | `sync()` swallows the real Firestore error; `createOrderAsync` throws a generic message so the UI can't distinguish permission-denied from network loss | High | **Fixed** — `pclinic-orders.js` now stores `code + message` in `_syncError` and the toast shows it: *"...not accepted by the common server (permission-denied: Missing or insufficient permissions.)..."* |
| D5 | App is served from GitHub Pages while the README assumes `firebase deploy hosting`; `.firebaserc` points to `pclinic-20d81` but hosting is not deployed there | Medium | Document the real deployment channel (or deploy hosting properly) |
| D6 | Public GitHub repo while `READ-ME-FIRST.md` step 7 requires making it private; client API key is normal for Firebase web apps, but the security docs assume a private repo | Medium | Follow the README: make the repo private |
| D7 | Monolithic patient document forces broad role access (acknowledged in README) | Design | Future: split collections as README plans |

**Note:** `pclinic-sync-race-fix.patch` and `specimen-accept-fix.patch` are already applied in
the current files (the async `submitLabRequest` and the lab-domain imports in
`functions/index.js` match the patch targets) — no action needed.

## 7. Recommended sequence

1. Do the §5 checklist (Console → `[pclinic] server write failed:` gives the definitive code).
2. Fix the live profile doc if `active`/`staffId`/`role` is wrong (Admin SDK or console).
3. Deploy the repo rules: `firebase deploy --only firestore:rules` (emulator suite passes).
4. Re-test end-to-end: doctor submits lab request → `orders` doc appears → lab dashboard
   accessions via `labSpecimenTransition` → results via `labFinalize` → cashier sees the bill.
5. Copy the fixed files back into the repo and re-upload to GitHub Pages:
   `pclinic-orders.js` (better error messages) and `tests/package.json` + the new test.

---

*Files changed in this evaluation copy: `pclinic-orders.js` (D4), `tests/package.json` (D1),
`tests/firestore.rules.test.mjs` (D3). Verified: rules suite 20/20 on Firestore emulator;
lab-domain unit tests 4/4.*
