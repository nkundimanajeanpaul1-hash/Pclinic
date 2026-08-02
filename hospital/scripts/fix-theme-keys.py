#!/usr/bin/env python3
"""
H2 — Unify dark-mode storage onto a single key.

Before: 7 different localStorage keys across 17 files, in two different value
vocabularies ('enabled'/'disabled' vs 'dark'/'light'). Toggling dark mode on
the hub and navigating to the doctor dashboard reverted to light.

After: every page reads/writes 'pclinic-theme' with 'dark'/'light',
matching shared.js (the canonical implementation).

Legacy keys are still READ once as a fallback so no one loses their
preference on upgrade; they are never written again.
"""
import re, pathlib, sys

D = pathlib.Path('/home/user/uploads')
CANON = 'pclinic-theme'

# Legacy keys using the 'enabled'/'disabled' vocabulary
ENABLED_STYLE = {
    'darkMode':                  ['Finance-dashboard.html','admin-dashboard.html','cashier-dashboard.html',
                                  'doctor-dashboard.html','nurse-dashboard.html','pharmacy-dashboard.html',
                                  'radio-dashboard.html'],
    'opd_dark_mode':             ['opd_file.html'],
    'lab_results_dark_mode':     ['lab-results.html'],
    'imaging_results_dark_mode': ['imaging-results.html'],
}
# Legacy keys already using the 'dark'/'light' vocabulary
THEME_STYLE = {
    'pclinic_theme': ['appointments.html','beds-dashboard.html','hub.html','physio-dashboard.html','queue.html'],
    'theme':         ['reception-dashboard.html'],
}

changes = []

def log(f, what):
    changes.append((f, what))

# ── 1. 'enabled'/'disabled' pages ──────────────────────────────
# setItem('darkMode', isDark ? 'enabled' : 'disabled')
#   → setItem('pclinic-theme', isDark ? 'dark' : 'light')
# getItem('darkMode') === 'enabled'
#   → readTheme-style check against 'dark' + legacy fallback
for key, files in ENABLED_STYLE.items():
    for fname in files:
        p = D / fname
        s = p.read_text(encoding='utf-8')
        orig = s

        # writes: ternary form
        s = re.sub(
            r"localStorage\.setItem\(\s*'" + re.escape(key) + r"'\s*,\s*(\w+)\s*\?\s*'enabled'\s*:\s*'disabled'\s*\)",
            lambda m: f"localStorage.setItem('{CANON}', {m.group(1)} ? 'dark' : 'light')",
            s)
        # writes: literal form
        s = s.replace(f"localStorage.setItem('{key}', 'enabled')",
                      f"localStorage.setItem('{CANON}', 'dark')")
        s = s.replace(f"localStorage.setItem('{key}', 'disabled')",
                      f"localStorage.setItem('{CANON}', 'light')")

        # reads: `localStorage.getItem('darkMode') === 'enabled'`
        s = re.sub(
            r"localStorage\.getItem\(\s*'" + re.escape(key) + r"'\s*\)\s*===\s*'enabled'",
            f"(localStorage.getItem('{CANON}') === 'dark' "
            f"|| localStorage.getItem('{key}') === 'enabled')",
            s)

        # reads: `var saved = localStorage.getItem('key');` followed by
        # `saved === 'enabled'` — normalise the captured value instead.
        s = re.sub(
            r"(\b(?:const|let|var)\s+saved\s*=\s*)localStorage\.getItem\(\s*'" + re.escape(key) + r"'\s*\)",
            rf"\1(localStorage.getItem('{CANON}') === 'dark' ? 'enabled' "
            rf": localStorage.getItem('{CANON}') === 'light' ? 'disabled' "
            rf": localStorage.getItem('{key}'))",
            s)

        if s != orig:
            p.write_text(s, encoding='utf-8')
            log(fname, f"{key} → {CANON}")

# ── 2. 'dark'/'light' pages: straight key rename ───────────────
for key, files in THEME_STYLE.items():
    for fname in files:
        p = D / fname
        s = p.read_text(encoding='utf-8')
        orig = s

        s = re.sub(r"localStorage\.setItem\(\s*'" + re.escape(key) + r"'\s*,",
                   f"localStorage.setItem('{CANON}',", s)
        # read with legacy fallback so existing preferences survive
        s = re.sub(r"localStorage\.getItem\(\s*'" + re.escape(key) + r"'\s*\)",
                   f"(localStorage.getItem('{CANON}') || localStorage.getItem('{key}'))", s)

        if s != orig:
            p.write_text(s, encoding='utf-8')
            log(fname, f"{key} → {CANON}")

print(f"Patched {len(changes)} file/key pairs:\n")
for f, w in changes:
    print(f"  {f:<30} {w}")

# ── 3. Verify no stray writes to legacy keys remain ────────────
print("\nVerification — remaining setItem calls to legacy keys:")
bad = 0
for key in list(ENABLED_STYLE) + list(THEME_STYLE):
    for p in sorted(D.glob('*.html')) + sorted(D.glob('*.js')):
        for m in re.finditer(r"localStorage\.setItem\(\s*'" + re.escape(key) + r"'", p.read_text(encoding='utf-8')):
            print(f"  ✗ {p.name}: still writes '{key}'")
            bad += 1
print("  ✓ none — all writes now go to 'pclinic-theme'" if bad == 0 else f"  {bad} remaining")
sys.exit(1 if bad else 0)
