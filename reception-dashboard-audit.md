# Reception Dashboard Audit — 2026-09-09

Target: `/home/user/repo3/reception-dashboard.html`

## Scope completed
1. Reception-only bug audit and fixes
2. Doctor-dashboard visual parity refinement pass
3. Dedicated Reception regression tests
4. Shared common-server messaging upgrade with Reception entry button

## Confirmed defects fixed
- Corrected title typo from `PClini` to `PClinic`.
- Updated stale admission/help copy so it reflects the real numbered-bed workflow now implemented by `raAdmission()`.
- Removed risky `parseInt(patientId)` assumptions in appointment and surgery booking flows.
- Normalized patient lookup with `findPatientByAnyId()` so Reception works with numeric IDs, string IDs, and mixed server/client ID shapes.
- Hardened appointment/surgery list row actions so `View Patient` works safely for string IDs.
- Replaced numeric-only avatar color indexing with string-safe `colorIndex()` / `col()` handling.

## Doctor-style visual parity pass added
- Added `reception-dashboard-doctor.css` for a tighter Doctor-style shell/workspace presentation.
- Added `reception-dashboard-doctor.js` to inject a small vertical Reception quick-actions card in the right-side aside.
- Refined command bar, workspace width, panel/cards, tables, forms, badges, and responsive behavior to better match the Doctor dashboard feel.
- Added a visible `Message` button in the Reception action row.
- Fixed command-bar overflow/z-index so Communication dropdowns open in front of the patient list.
- The shared common-server Message Center now opens from Reception as a front popup modal with an embedded `messages.html` view, plus a fallback “Open Full Page” action.

## Shared common-server messaging upgrade
- Upgraded `messages.html` from role-only compose to a real staff message center.
- Added **Specific Staff** mode so Reception can choose one exact doctor, admin, nurse, or other staff member before sending.
- Added **Role Broadcast** mode with options like **All Doctors** and **All Nurses**.
- Added reply-to-sender flow so a response goes back to the person who started the direct message.
- Extended `pclinic-orders.js` shared message sync so sent items also round-trip from Firestore, not only incoming inbox items.
- Updated `firestore.rules` so message senders can read their own server-stored messages while unrelated staff still cannot.

## Dedicated tests added
- `tests/reception-dashboard.test.mjs`
- `tests/messages-page.test.mjs`
- updated `tests/firestore.rules.test.mjs`

Coverage includes:
- registration flow wiring
- appointment flow wiring and string-ID safety
- queue actions
- bed workflow copy + registry-backed admission/discharge markers
- referrals view wiring
- Doctor-style Reception skin assets

## Validation to run
- `node -c /home/user/repo3/reception-dashboard-doctor.js`
- `node --test --test-force-exit /home/user/repo3/tests/reception-dashboard.test.mjs`
- `node --test --test-force-exit /home/user/repo3/tests/dashboard-role-contracts.test.mjs`
