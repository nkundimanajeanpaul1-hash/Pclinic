'use strict';

/*
 * functions/radiology-media.cjs — how a browser gets to read ONE study image.
 *
 * Preferred: a short-lived signed URL (file.getSignedUrl). On Cloud Functions
 * the Admin SDK has no private key, so signing goes through the IAM Credentials
 * API and needs the runtime service account to hold
 * roles/iam.serviceAccountTokenCreator on itself. When that role is missing,
 * getSignedUrl throws ("Permission 'iam.serviceAccounts.signBlob' denied…")
 * and — before this module existed — every image silently came back with no
 * URL at all: the viewer listed the file but showed "No view URL for this
 * file yet", even though the upload had succeeded.
 *
 * Fallback: a Firebase download token stored in the object's own metadata
 * (firebaseStorageDownloadTokens — exactly what the client SDK's
 * getDownloadURL() uses). It needs only storage.objects.update, which the
 * runtime account already has because it deletes objects there. Token links
 * do not expire by themselves, so the result names its mode and carries the
 * signing error; the client logs how to restore 10-minute signed links.
 *
 * Pure enough to unit-test with a stub File (see test/radiology-media.test.cjs).
 */

const { randomUUID } = require('node:crypto');

function tokenUrl(bucketName, path, token) {
  return 'https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(bucketName) +
    '/o/' + encodeURIComponent(path) + '?alt=media&token=' + encodeURIComponent(token);
}

function errorText(error) {
  return String((error && error.message) || error || 'unknown error').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * Resolve a readable URL for one stored object.
 *
 * @param {object} file   @google-cloud/storage File (getSignedUrl / getMetadata / setMetadata, .name, .bucket.name)
 * @param {object} [opts] { bucketName, expiresInSeconds = 600, skipSigning = '' | '<earlier error>', now }
 * @returns {Promise<{url:string, mode:'signed'|'token', signError?:string} |
 *                   {error:'object-missing'|'object-unavailable', reason:string, signError?:string}>}
 */
async function viewUrlFor(file, opts) {
  const o = opts || {};
  const bucketName = String(o.bucketName || (file && file.bucket && file.bucket.name) || '');
  const path = String((file && file.name) || '');
  const expiresInSeconds = Number(o.expiresInSeconds) || 600;
  let signError = o.skipSigning ? String(o.skipSigning) : '';

  if (!signError) {
    try {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: (o.now || Date.now()) + expiresInSeconds * 1000,
      });
      if (url) return { url: String(url), mode: 'signed' };
      signError = 'getSignedUrl returned no URL';
    } catch (error) {
      signError = errorText(error);
    }
  }

  // Signing is not available on this deployment: fall back to a download token.
  try {
    const [meta] = await file.getMetadata();
    const existing = String((meta && meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || '')
      .split(',').map((t) => t.trim()).filter(Boolean)[0];
    let token = existing;
    if (!token) {
      token = randomUUID();
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
    return { url: tokenUrl(bucketName, path, token), mode: 'token', signError };
  } catch (error) {
    const code = Number(error && error.code);
    if (code === 404) {
      return {
        error: 'object-missing',
        reason: 'The file is registered but the object ' + path + ' is not in bucket ' + bucketName +
          ' — the upload did not complete. Remove it from the study and upload it again.',
        signError,
      };
    }
    return {
      error: 'object-unavailable',
      reason: 'signed link: ' + signError + ' | token link: ' + errorText(error),
      signError,
    };
  }
}

module.exports = { viewUrlFor, tokenUrl, errorText };
