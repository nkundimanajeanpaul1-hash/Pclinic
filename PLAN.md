# PClinic — what is missing, and the order to fix it

Measured 2026-08-30 07:45 UTC. Nothing here is inferred from memory; every
status below was probed against the live project or the live repository.

## Current state

| Layer | Status | Evidence |
|---|---|---|
| Frontend on GitHub Pages | ✅ live | `radio-dashboard.html` → 200 |
| Lab Cloud Functions | ✅ deployed | `labFinalize` → 401 (rejects anonymous, as designed) |
| Radiology Cloud Functions (5) | ❌ not deployed | `radiologyTransition` → 404 |
| Radiology media functions (2) | ❌ not deployed | `radiologyMediaSign` → 404 |
| Firestore `radiologyMedia` rules | ❌ not deployed | repo has the rule; the project was never given it |
| Storage bucket | ❌ does not exist | `.../b/pclinic-20d81.appspot.com` → 404 |
| Firebase Hosting | ❌ unprovisioned | `pclinic-20d81.web.app/__/firebase/init.js` → 404 |
| CI pipeline | ❌ not in repo | `.github/workflows/deploy.yml` absent at `a258093` |
| All round 2–6 code | ✅ merged | 18/18 files byte-identical to the tested tree |
| Round 8 self-test | ❌ not in repo | `pclinic-selftest.js` absent |

So: **the code is finished and correct. The infrastructure behind it is absent.**
Every user-visible symptom — studies stuck at `pending`, no image upload, no
report writer — traces to the four ❌ rows above, and all four are fixed by the
same action.

## The one unknown that decides everything

**Is `pclinic-20d81` on the Blaze plan?**

Cloud Functions *and* Storage both require Blaze. If the project is on the free
Spark plan, `firebase deploy --only functions` will fail no matter what the code
says, and no amount of further development changes that. This cannot be probed
externally — it needs the console. Check it before anything else.

```
Firebase console → pclinic-20d81 → (bottom left) Usage and billing
```

## Path A — Blaze is available (expected)

One-time, in this order. Each step has a gate; do not continue past a failed gate.

**Step 1 — Enable billing + APIs** (console)
Blaze plan, then confirm these are *enabled*: Cloud Functions, Cloud Run,
Cloud Firestore, Firebase Storage.
`GATE: `firebase deploy --only functions` no longer refuses on billing.`

**Step 2 — Create the bucket** (console → Storage → Get started)
This creates `pclinic-20d81.appspot.com`. The CLI writes rules to a bucket, it
cannot make one.
`GATE:`
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://storage.googleapis.com/storage/v1/b/pclinic-20d81.appspot.com
# want 200
```

**Step 3 — Install the pipeline**
Add `Pclinic-round9-ci-and-selftest-2026-08-30.zip` (CI workflow, its README,
and `pclinic-selftest.js`) to the repo. Then per `.github/workflows/README.md`:
a deploy service account with the four listed roles, workload identity, and the
two Actions secrets.
`GATE: Actions → "Test and deploy" runs and the test job is green.`

**Step 4 — Deploy**
Either push anything to `main`, or run the workflow manually, or skip CI for now
with `firebase deploy --only firestore:rules,storage,functions,hosting`.
`GATE (this is the real proof, not the CLI exit code):`
```bash
for f in radiologyTransition radiologySaveDraft radiologyFinalize radiologyAddendum \
         radiologyAcknowledgeCritical radiologyMediaSign radiologyMediaDelete; do
  printf "%-30s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    https://africa-south1-pclinic-20d81.cloudfunctions.net/$f -H 'Content-Type: application/json' -d '{"data":{}}')"
done
# want 401 on all seven. 404 = still not routable.
```

**Step 5 — Prove it in the app**
Signed in as radiology, on the live Pages URL, run `window.__pcSelfTest()`.
Then: click a pending worklist row → the identification bar flips to 👤; press
Start study → status moves to `in progress`; click Images → attach a JPEG →
it appears on the doctor's Radiology results page and opens.

## Path B — Blaze is NOT available

Then the current architecture cannot work as designed, and the honest options are:

1. **Stay on Spark, drop the media feature.** Firestore rules + GitHub Pages do
   work without Blaze. But Cloud Functions are impossible, which means no
   signed radiology transitions, no server-signed reports, and no signed media
   URLs. The radiology workflow cannot function; the reception/lab-reads/billing
   parts that only need Firestore keep working.
2. **Move the backend to a free host** — a small Node service on Render/Fly/Railway
   with a Firestore Admin SDK connection. This is a real rewrite of the callable
   layer and a new trust boundary; it needs its own security review before any
   patient data touches it. Not a weekend job.
3. **Use a clinic Google Cloud account with billing** and keep Firebase on it.
   Usually the cheapest correct answer: a few dollars a month at this usage.

Do not attempt to store images as base64 in Firestore to dodge the bucket. That
is exactly what `firestore.rules` refuses, and for good reason: it puts clinical
images in a document that 14 roles can read, blows the 1 MiB document limit, and
cannot be access-controlled per file.

## Then, in this order, the security backlog

| # | Item | Why it is still open |
|---|---|---|
| 1 | Make the repo private | `"private": false` while patient-data logic is public. READ-ME-FIRST step 7, open since 2026-08-19 |
| 2 | Rotate staff passwords, purge `initialPassword` | Only 3 references remain (all scrub logic), but the live documents need checking |
| 3 | Hosting + CSP headers | Deployed only once hosting exists; GitHub Pages never sends `firebase.json` headers. Cached JS is `max-age=600`, so a stale script self-heals in ~10 min — the `?v=` tokens are a shortcut, not a requirement |
| 4 | API-key referrer restriction | **Not verified.** My forged-referrer probe used a malformed path and returned 404 both ways, which proves nothing. Check: Google Cloud → APIs & Services → Credentials → that key → Application restrictions |
| 5 | `'unsafe-inline'` removal | 1,249 inline `on*=` handlers still mandate it |
| 6 | Split the monolithic patient document | Round-6 `radiologyMedia` is the first properly-scoped collection; the pattern generalises |
| 7 | Delete `origin/local-backup` | 0 commits ahead, 86 behind; dead weight and a source of confusion |

## What I need from you

Answer one question and everything else follows: **is the project on Blaze?**
If yes, do steps 1–3 and I will take it from the failure log of step 4.
If no, say so and I will scope Path B properly rather than hand you a plan that
cannot execute.
