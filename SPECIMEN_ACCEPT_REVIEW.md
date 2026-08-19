# PClinic specimen acceptance failure — review and correction

Reviewed: 17 August 2026

## Root cause

The **Accept & Accession Specimen** button is wired correctly in the browser, but its required backend is absent.

### Confirmation from the supplied browser log

The Cloudflare Pages site reports a CORS failure for the function URL. A direct check of both `OPTIONS` and `POST` on that exact URL still returns HTTP **404** with no CORS headers. The browser therefore describes the failed preflight as “blocked by CORS,” but the underlying problem is that `labSpecimenTransition` has **not been deployed at that URL**. Uploading the web files or ZIP to GitHub/Cloudflare Pages does not deploy Firebase Functions; the Firebase CLI deployment below is still required.

The supplied log also exposed a separate rendering error at `pclinic-lab.js:890`: `readonly` was declared inside the parameter callback and then referenced by the order-level comments field outside that callback. The updated bundle defines `readonlyAttr` and `disabledAttr` at order scope, eliminating the repeated `ReferenceError`.

1. `pclinic-lab.js:1598-1604` calls the Firebase callable function named `labSpecimenTransition`.
2. The repository's original `functions/index.js` exported only radiology functions; it did not export `labSpecimenTransition`.
3. A direct POST check to the configured `africa-south1` endpoint returned HTTP **404**, confirming that the callable is not deployed in Firebase project `pclinic-20d81`.
4. The client catches that 404 and attempts a direct Firestore fallback. That fallback works only for a real `orders/{orderId}` document.
5. Many doctor-dashboard request paths (`doctor.js:4311-4338` and `doctor.js:4663-4692`) write only `patients/{patientId}.labRequests`. The lab dashboard reconstructs these as `_legacyLocalOnly` orders. For those requests, `pclinic-lab.js:1611-1614` intentionally refuses the direct fallback and throws an error requiring `labSpecimenTransition`.

This is why the barcode appears in the UI but clicking Accept does not persist `status: "in-progress"`: drawing the barcode is local UI work; accessioning is a separate server write, and its server function is missing.

## Repository inconsistency

`LABORATORY_SETUP.md` and `REPLACE_INSTRUCTIONS.txt` say the following functions exist:

- `labSpecimenTransition`
- `labFinalize`
- `labAcknowledgeCritical`

The original `functions/index.js` exported none of them. The instructions also list `functions/lab-domain.cjs` and `functions/test/lab-domain.test.cjs`, but those files were missing. This looks like an incomplete replacement/upload in which a radiology-only `functions/index.js` replaced, rather than merged with, the laboratory backend.

## Correction included in this workspace

The accompanying patch adds:

- `exports.labSpecimenTransition` to `functions/index.js` without removing the radiology functions.
- Active Laboratory/Admin account authorization.
- Atomic patient/order validation and grouped transition.
- `pending -> in-progress` specimen accession with accession number, time, staff identity, notes, history, and audit log.
- Atomic rejection with a required reason and clinician notification.
- Safe migration of a verified legacy `patient.labRequests` entry into a real `orders/{orderId}` document.
- Idempotent retries, duplicate-order protection, patient/order identity checks, and legacy-order ID verification.
- `functions/lab-domain.cjs` plus unit tests.
- The `pclinic-lab.js` worklist repaint fix for the out-of-scope `readonly` variable.
- An explicit callable CORS setting for the Cloudflare-hosted dashboard and a clearer error when the backend is missing or crashes.

The browser already expects the response shape returned by this function, so no button-handler rewrite is required for this failure.

## Apply and deploy

From the project root:

```bash
git apply specimen-accept-fix.patch
cd functions
npm ci
npm test
node --check index.js
cd ..

firebase login
firebase use pclinic-20d81
firebase deploy --only functions:labSpecimenTransition --project pclinic-20d81
firebase functions:list --project pclinic-20d81
```

The final command must list `labSpecimenTransition` in region `africa-south1`. If deployment fails, do not retest the button yet—copy the complete Firebase CLI error because the endpoint will remain 404 until deployment succeeds.

Use Node.js 22 for the Functions project, as specified in `functions/package.json` and `firebase.json`.

Do **not** use the existing documentation command that also names `labFinalize` and `labAcknowledgeCritical` until those two exports are restored; Firebase cannot deploy function names that are absent from `functions/index.js`.

Firestore rules do not need a change for this callable because it authorizes the staff profile itself and writes through the Admin SDK. Deploy the current rules separately if production is not already using them:

```bash
firebase deploy --only firestore:rules
```

If the web files currently deployed are older than this repository, deploy hosting and then hard-refresh the browser:

```bash
firebase deploy --only hosting
```

## Verify after deployment

1. Confirm `users/{firebaseAuthUid}` contains:
   - `active: true`
   - `role: "lab"` (or `"admin"`)
   - a string `staffId`
2. Sign in as Laboratory staff.
3. Select a patient with a pending request.
4. Open **Specimen** and click **Accept & Accession Specimen**.
5. Confirm Firestore `orders/{orderId}` now has:
   - `status: "in-progress"`
   - `accessionNo`
   - `accessionedAt`
   - `accessionedBy`
   - `accessionedById`
6. For an old reconstructed request, confirm the real `orders/LAB-LEGACY-...` document was created and the matching `patients/{patientId}.labRequests[]` entry changed to `In-Progress`.
7. Confirm the dashboard moves the order into Worklist and shows **In Progress**.

## Tests run

- Eight function unit tests passed (four laboratory and four radiology).
- `node --check` passed for the modified backend and the existing lab/order browser scripts.
- The `labSpecimenTransition` export was successfully loaded after `npm ci`.
- The repository-wide static suite still reports a pre-existing, unrelated issue: `radio-dashboard.html` loads `auth-guard.js` but does not invoke it.

## Additional recommended cleanup

1. Consolidate every doctor laboratory-request submission path so it awaits `pcOrders.createAsync(...)`. New requests should create a real order immediately instead of relying on legacy reconstruction.
2. Restore and test `labFinalize` and `labAcknowledgeCritical`, or correct the documentation that currently claims they exist.
3. Replace the current hash-drawn SVG with a scanner-standard barcode implementation (for example Code 128). The current SVG is a visual hash, not a guaranteed scanner-decodable barcode.
4. Make accession numbers globally unique. The current `LAB-{patientId}-{MMDD}` format can repeat across years and repeat collections.
