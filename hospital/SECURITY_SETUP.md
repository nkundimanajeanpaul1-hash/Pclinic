# PClinic — Security Setup Guide

Follow these steps **in order**. Steps 1–3 are one-time setup you do in the
Firebase Console. Step 4 is how you create staff logins going forward
(only needs the console once, for your very first admin — after that,
you can create everyone else from inside the app).

---

## 1. Enable Firebase Authentication (Email/Password)

1. Go to https://console.firebase.google.com/u/0/project/pclinic-20d81/authentication
2. Click **Get started** (if you haven't already enabled Authentication).
3. Under **Sign-in method**, enable the **Email/Password** provider.
   (Staff will type a numeric ID like `41054` on the login screen, but
   behind the scenes the app turns that into `41054@pclinic.local` — a
   fake email Firebase Auth needs internally. Staff never see this.)

---

## 2. Replace your Firestore Security Rules

1. Go to https://console.firebase.google.com/u/0/project/pclinic-20d81/firestore/rules
2. Delete everything in the box and paste the contents of `firestore.rules`
   (included in this project folder).
3. Click **Publish**.

This replaces the old "allow everyone until Aug 29, 2026" rule with:
- Only **logged-in, active** staff can read/write patient records.
- Only **admins** can view the staff list or create/deactivate accounts.
- Everything else is denied by default.

---

## 3. Create your first Admin account (one-time, via Console)

Because the in-app "Add Staff" tool itself requires you to already be
logged in as an admin, you need to create the **very first** admin account
by hand:

1. Go to https://console.firebase.google.com/u/0/project/pclinic-20d81/authentication/users
2. Click **Add user**.
3. For **Email**, enter your chosen numeric Staff ID followed by
   `@pclinic.local` — for example, if your ID is `10001`, enter:
   `10001@pclinic.local`
4. Set a password (at least 6 characters) — this is what you'll type
   alongside `10001` on the login page.
5. Click **Add user**. Firebase will show a new **User UID** (a long
   string like `aB3xY...`) — copy it.
6. Go to https://console.firebase.google.com/u/0/project/pclinic-20d81/firestore/data
7. Create a collection called `users` (if it doesn't exist).
8. Add a new document, and **set the Document ID to the User UID you copied**.
9. Add these fields to the document:
   | Field | Type | Value |
   |---|---|---|
   | `staffId` | string | `10001` |
   | `name` | string | Your name, e.g. `Jean Paul` |
   | `role` | string | `admin` |
   | `active` | boolean | `true` |
10. Save.

You can now log in at `login.html` with Staff ID `10001` and the password
you set.

---

## 4. Create everyone else from inside the app

Once logged in as admin:
1. Go to **Admin Dashboard → Staff & User Management**.
2. Fill in **Full Name**, a unique numeric **Staff ID**, a temporary
   **Password**, and pick their **Role**.
3. Click **Create Login**.

This creates a real Firebase Auth account and a matching profile in
Firestore automatically — no console work needed. You (or they) can
share the Staff ID + password with the staff member so they can log in.

To **deactivate** someone (e.g. they leave), click **Deactivate** next to
their name in the staff table — this instantly blocks them from logging
in or using the app, without deleting their account/history.

---

## Notes & limitations

- **Password resets**: there's currently no self-service "forgot password"
  flow wired up (numeric IDs have no real email to send a reset link to).
  For now, an admin should deactivate + recreate the account, or we can
  build an admin-triggered password-reset feature next if you want it.
- **Full account deletion**: the "Deactivate" button blocks access but
  doesn't delete the underlying Firebase Auth account (deleting it fully
  requires a small backend function using the Firebase Admin SDK, which
  we can add later if needed).
- **Rules review**: patient records are currently readable/writable by
  *any* active staff member regardless of role. If you want finer control
  later (e.g. only doctors/nurses can edit clinical notes, only pharmacy
  can dispense), that's possible but requires restructuring some data
  into sub-collections — let me know if you want to tackle that next.
