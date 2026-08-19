# PClinic Lab → Doctor → Cashier workflow repair

## Scope

This repair replaces the optimistic browser-only workflow with server-confirmed Firebase callable operations.

Confirmed path:

1. A signed-in doctor or nurse selects configured Lab tests.
2. `labCreateRequest` validates the patient and server tariff.
3. One lowercase `pending` Lab order and one linked pending Cashier bill are committed atomically.
4. Lab receives the Firestore order through the existing live order subscription.
5. `labTransition` accepts or rejects the specimen and records the authenticated Lab staff member.
6. `labReleaseResult` writes the final result, completes the order, appends the patient result, notifies the requester, and audits the release atomically.
7. Doctor/Nurse patient synchronization receives the completed order and patient result.
8. Cashier receives the Firestore bill through the existing live bill subscription.
9. `billingRecordPayment` records partial or full payment, recalculates the balance, issues an idempotent receipt, and audits the payment atomically.

## Required Firebase configuration

- Functions region: `africa-south1`
- Functions runtime: Node.js 22
- Firestore must contain `config/tariff` with an `items` array.
- Every requestable Lab tariff item must have:
  - a unique non-empty `code`
  - `dept: "lab"`
  - a non-empty `name`
  - a positive whole-number RWF `price`
- Custom, missing, and zero-price tests fail closed and do not create an order or bill.

## Trusted callable functions

- `labCreateRequest`
- `labTransition`
- `labReleaseResult`
- `billingRecordPayment`

## Security behavior

- Browser clients cannot directly create Lab orders or Lab bills.
- Browser clients cannot directly transition Lab orders or write final Lab results.
- Cashier/Finance browser clients cannot directly alter bill balances.
- Firestore is authoritative; patient arrays no longer generate fallback orders or invoices.
- Final results use the authenticated Lab staff profile; no technologist identity is hardcoded.
- The microbiology form contains no prefilled organism, colony-count, incubation, or susceptibility results.
- Retries use stable request/payment identifiers to prevent duplicate orders, bills, results, and payments.

## Verification coverage

The project includes fictional-data tests for:

- Doctor and Nurse request authorization
- atomic order and bill creation
- lowercase status values
- idempotent request retry
- Lab specimen acceptance
- result release and patient-result persistence
- Doctor-readable final result rules
- pending, partial, and paid bill behavior
- idempotent payment retry
- unauthorized-role rejection
- zero-price and unconfigured-test rejection
- direct browser-write denial
- existing Radiology workflow regression coverage

## Deployment status

These files repair the project source only. They have not been deployed to the live Firebase project, and no live patient data was accessed during development or testing.
