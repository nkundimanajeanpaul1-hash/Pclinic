'use strict';

/*
 * Why this file exists
 * --------------------
 * firebase-tools 13.x (the version pinned in ../tests/package.json, because it
 * is the last line that runs on the JDK 11 installed on the clinic machines)
 * calls the legacy `functions.config()` inside its Cloud Functions emulator
 * runtime on **every** request. firebase-functions v7 removed that API and
 * replaced it with a getter that throws. The result is that every callable
 * dies before your code runs:
 *
 *   ⚠  functions: functions.config() has been removed in firebase-functions v7. ...
 *   ⚠  Your function was killed because it raised an unhandled error.
 *   ⬢  functions: Failed to handle request for function africa-south1-radiologyTransition
 *
 * That is what made `npm --prefix functions run test:emulator` unusable.
 * firebase-tools 15.x dropped the call, but it requires JDK 21 for the
 * Firestore emulator, which the clinic machines do not have.
 *
 * So instead of forcing a Java upgrade, this patch makes the removed legacy
 * accessor *tolerant* (returning the same value firebaseConfig() would, or an
 * empty object) rather than fatal. PClinic's own functions never call
 * functions.config(); only the emulator's startup helper does.
 *
 * The patch is idempotent, verified, and fails loudly if a future
 * firebase-functions release moves the code so it can no longer be checked.
 */

const fs = require('node:fs');
const path = require('node:path');

const MARKER = '/* PClinic compatibility patch: see scripts/patch-functions-config.cjs */';

const TOLERANT_BODY = `
${MARKER}
// functions.config() was removed in firebase-functions v7, but the emulator
// runtime of firebase-tools 13.x still calls it once per request. Returning
// the same value as firebaseConfig() keeps that legacy caller alive instead of
// killing the whole function invocation.
const config = () => {
	try {
		return require_common_config.firebaseConfig() || {};
	} catch (_error) {
		return {};
	}
};
`.trimStart();

function findConfigModule() {
  // Resolved relative to this file, not the caller's cwd: `postinstall` runs
  // from functions/, while a manual run may happen anywhere in the repo.
  const candidates = [
    path.resolve(__dirname, '..', 'functions', 'node_modules', 'firebase-functions', 'lib', 'v1', 'config.js'),
    path.resolve(__dirname, 'node_modules', 'firebase-functions', 'lib', 'v1', 'config.js'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

const CHECK_ONLY = process.argv.includes('--check');

function main() {
  const file = findConfigModule();
  if (CHECK_ONLY) {
    if (!file) {
      console.error('[pclinic] FAIL: firebase-functions is not installed, cannot verify the patch.');
      process.exitCode = 1;
      return;
    }
    if (fs.readFileSync(file, 'utf8').includes(MARKER)) {
      console.log('[pclinic] OK: functions.config() is patched for the 13.x emulator.');
      return;
    }
    console.error('[pclinic] FAIL: the compatibility patch is not applied.');
    console.error('[pclinic] Run: npm --prefix functions install');
    process.exitCode = 1;
    return;
  }
  if (!file) {
    // Dependencies are not installed yet (or firebase-functions is absent).
    // Nothing to patch, and a hard failure here would break `npm install`.
    console.log('[pclinic] firebase-functions/lib/v1/config.js not found - skipping config() patch.');
    return;
  }

  const source = fs.readFileSync(file, 'utf8');

  if (source.includes(MARKER)) {
    console.log('[pclinic] config() compatibility patch already applied.');
    return;
  }

  // The v7 module throws from inside an IIFE assigned to `config`. Replace the
  // whole throwing definition, keeping the exports below intact.
  const throwing = source.match(/const config = \(\(\) => \{\r?\n[\s\S]*?\}\);\r?\n/);
  if (!throwing) {
    console.warn('[pclinic] WARNING: the expected throwing functions.config() was not found in');
    console.warn(`[pclinic] ${file}. The firebase-functions layout may have changed; verify that`);
    console.warn('[pclinic] `npm run test:emulator` starts the emulator, or upgrade firebase-tools.');
    return;
  }

  fs.writeFileSync(file, source.replace(throwing[0], `${TOLERANT_BODY}\n`));
  console.log('[pclinic] Patched firebase-functions functions.config() for the 13.x emulator.');
}

main();
