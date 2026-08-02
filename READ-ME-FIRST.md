# Upload these 21 files to `hospital/`

You already uploaded the new `index.html` — but **not the two images it needs**,
so the home page is currently broken: plain navy background, no logo.

Everything in this folder goes into the **`hospital/`** folder of your repo,
the same place you uploaded `index.html`. Do not create a subfolder.

---

## Step 1 — Fix the broken home page (do this first, 1 minute)

The two urgent files are:

- `hero-reception.jpg` — the background photo
- `logo-nav.png` — your PClinic logo

**How:**
1. Go to https://github.com/nkundimanajeanpaul1-hash/Pclinic/tree/main/hospital
2. Click **Add file** → **Upload files**
3. Drag in `hero-reception.jpg` and `logo-nav.png`
4. Commit message: `Add landing page images`
5. Click **Commit changes**

Reload the page — the background and logo will appear.

---

## Step 2 — Upload the rest (the actual bug fixes)

None of the Tier 1 / Tier 2 fixes are on GitHub yet. I checked:

| Fix | Status on GitHub right now |
|---|---|
| Sync race in `patient-data.js` | ❌ still the old broken version |
| `deleteRow()` in admin dashboard | ❌ still missing — buttons still throw |
| Verified `firestore.rules` | ❌ still the old draft with the lockout bug |
| Unified dark-mode key (16 files) | ❌ not uploaded |

**How:** same as above — drag in **all remaining 19 files** at once.

Commit message:
```
Tier 1 + 2: security rules, sync fix, deleteRow, unified theme
```

GitHub replaces files with the same name automatically. You do **not**
need to delete anything first.

---

## Full file list (21)

**Images (2) — urgent**
`hero-reception.jpg`, `logo-nav.png`

**Security (2)**
`firestore.rules`, `SECURITY_SETUP.md`

**Bug fixes (17)**
`patient-data.js`, `admin-dashboard.html`, `hub.html`,
`Finance-dashboard.html`, `appointments.html`, `beds-dashboard.html`,
`cashier-dashboard.html`, `doctor-dashboard.html`, `imaging-results.html`,
`lab-results.html`, `nurse-dashboard.html`, `opd_file.html`,
`pharmacy-dashboard.html`, `physio-dashboard.html`, `queue.html`,
`radio-dashboard.html`, `reception-dashboard.html`

> `doctor-dashboard.html` is 489 KB. If the upload stalls, do it on its own.

---

## Files I did NOT include

These are unchanged on GitHub, so there is no reason to re-upload them:
`auth-guard.js`, `firebase-config.js`, `shared.js`, `styles.css`,
`login.html`, `logo.png`, and 9 other HTML pages.

Also not included: `PClinic-Evaluation.md`, `TIER-1-2-COMPLETE.md`,
`HOW-TO-PUSH.md`, the `tests/` folder, and `scripts/`. Useful to you,
but not needed for the app to run. Upload them later if you want the
audit trail in the repo.

---

## ⚠️ Two things to deal with after uploading

### 1. Your repository is PUBLIC

Anyone can read your code, including `firebase-config.js`. The API key
itself is fine to expose (Firebase web keys are public identifiers), but
a public health-system repo invites scrutiny you probably don't want yet.

**Settings → General → scroll to Danger Zone → Change visibility → Private**

### 2. The rules still are not published to Firebase

Uploading `firestore.rules` to GitHub does **nothing** to your database.
It's just a text file until you publish it:

1. https://console.firebase.google.com/u/0/project/pclinic-20d81/firestore/rules
2. Delete everything in the editor
3. Paste the full contents of `firestore.rules`
4. **Publish**

Until then, the old *"allow everyone until Aug 29 2026"* rule is live and
your patient data is readable and writable by anyone on the internet.

**After publishing:** log in as a non-admin staff member and open a
patient record. If it loads, you're good. If you get a permission error,
tell me and I'll debug it.
