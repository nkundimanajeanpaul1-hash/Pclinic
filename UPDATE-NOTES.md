PClinic — Update Package (2026-08-21)
======================================

Files changed during the evaluation of the "lab request denied" error.
Extract this zip into your Pclinic project folder — it will overwrite
the files listed below.

WHAT GOES WHERE
---------------
1) pclinic-orders.js            →  replace the file at the project ROOT
   What changed: the order-upload code no longer swallows the real
   Firestore error. When a write is rejected, the toast now shows the
   machine reason, e.g.
     "The order was not accepted by the common server
      (permission-denied: Missing or insufficient permissions.)."
   This tells you instantly whether it is a rules/permission problem
   or a connection problem. Nothing else changed.

2) tests/firestore.rules.test.mjs  →  replace the file in the tests/ folder
   What changed: added the missing test that verifies a doctor/nurse
   CAN create a lab order with the exact payload the app sends
   (previously untested — the path that was failing in the clinic).

3) tests/package.json           →  NEW file — put it in the tests/ folder
   (was missing, which is why "npm --prefix tests install" never worked).
   Includes working scripts: test:static and test:rules.

4) tests/package-lock.json      →  NEW file — put it in the tests/ folder
   Locks the exact dependency versions (firebase-tools 13.35.1, which
   works with Java 11; firebase-tools v15 requires Java 21).

5) EVALUATION_REPORT.md         →  NEW file — put it at the project ROOT
   Full diagnosis of the lab-request denial and the fix checklist.

VERIFY AFTER REPLACING
----------------------
  cd tests
  npm install
  npm run test:rules

Expected result: 20 tests, 20 pass, 0 fail.

IMPORTANT REMINDER
------------------
The files above do NOT fix the live denial by themselves. The most
likely cause is that the Firestore rules DEPLOYED in your Firebase
project differ from the firestore.rules file in this repo. After
replacing these files:

  1. Re-upload to GitHub Pages (your live site serves the repo files).
  2. Try submitting a lab request again — the toast will now show the
     real reason in parentheses.
  3. If it says "permission-denied": open Firebase Console →
     project pclinic-20d81 → Firestore → Rules, compare with the
     repo's firestore.rules, and deploy:
        firebase deploy --only firestore:rules
  4. Check your own profile document in Firestore → users/{your uid}:
     active: true, role: doctor/nurse/reception, staffId: your number.
