'use strict';

/*
 * Unit tests for functions/radiology-media.cjs — the "how does the browser get
 * a URL for a study image" decision.
 *
 * Production incident this guards: uploads succeeded, radiologyMediaSign ran,
 * but getSignedUrl failed (signBlob permission) and every item came back with
 * no url — the viewer showed "No view URL for this file yet".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { viewUrlFor, tokenUrl } = require('../radiology-media.cjs');

function stubFile({ signed, signError, meta, metaError } = {}) {
  const calls = { sign: 0, getMeta: 0, setMeta: [] };
  return {
    calls,
    name: 'radiology/ord-77/rmed-abc.png',
    bucket: { name: 'pclinic-20d81.firebasestorage.app' },
    async getSignedUrl() { calls.sign++; if (signError) throw signError; return [signed]; },
    async getMetadata() { calls.getMeta++; if (metaError) throw metaError; return [meta || {}]; },
    async setMetadata(m) { calls.setMeta.push(m); return [m]; },
  };
}

test('signed URL is used when the runtime may sign', async () => {
  const f = stubFile({ signed: 'https://storage.googleapis.com/x?X-Goog-Signature=abc' });
  const out = await viewUrlFor(f, { expiresInSeconds: 600 });
  assert.equal(out.mode, 'signed');
  assert.match(out.url, /X-Goog-Signature/);
  assert.equal(f.calls.getMeta, 0, 'no metadata round-trip when signing works');
});

test('signBlob denied → falls back to a download-token link and reports why', async () => {
  const err = new Error("Permission 'iam.serviceAccounts.signBlob' denied on resource (or it may not exist).");
  const f = stubFile({ signError: err, meta: { metadata: {} } });
  const out = await viewUrlFor(f, { expiresInSeconds: 600 });
  assert.equal(out.mode, 'token');
  assert.match(out.signError, /signBlob/);
  assert.equal(f.calls.setMeta.length, 1, 'a token must be minted onto the object');
  const token = f.calls.setMeta[0].metadata.firebaseStorageDownloadTokens;
  assert.match(token, /^[0-9a-f-]{36}$/);
  assert.equal(out.url, tokenUrl('pclinic-20d81.firebasestorage.app', 'radiology/ord-77/rmed-abc.png', token));
  assert.match(out.url, /firebasestorage\.googleapis\.com\/v0\/b\/pclinic-20d81\.firebasestorage\.app\/o\/radiology%2Ford-77%2Frmed-abc\.png\?alt=media&token=/);
});

test('an existing download token is reused, never rotated (links already handed out keep working)', async () => {
  const f = stubFile({ signError: new Error('nope'), meta: { metadata: { firebaseStorageDownloadTokens: 'tok-1, tok-2' } } });
  const out = await viewUrlFor(f);
  assert.equal(out.mode, 'token');
  assert.equal(f.calls.setMeta.length, 0);
  assert.match(out.url, /token=tok-1$/);
});

test('skipSigning short-circuits the IAM call once it is known to fail', async () => {
  const f = stubFile({ signed: 'https://would-not-be-used', meta: { metadata: {} } });
  const out = await viewUrlFor(f, { skipSigning: 'earlier: signBlob denied' });
  assert.equal(f.calls.sign, 0);
  assert.equal(out.mode, 'token');
  assert.equal(out.signError, 'earlier: signBlob denied');
});

test('a registered file whose object is missing is reported as object-missing with an actionable reason', async () => {
  const notFound = Object.assign(new Error('No such object'), { code: 404 });
  const f = stubFile({ signError: new Error('signBlob denied'), metaError: notFound });
  const out = await viewUrlFor(f);
  assert.equal(out.error, 'object-missing');
  assert.match(out.reason, /upload did not complete/);
  assert.equal(out.url, undefined);
});

test('any other storage failure keeps both causes in the reason', async () => {
  const f = stubFile({ signError: new Error('signBlob denied'), metaError: Object.assign(new Error('storage.objects.get denied'), { code: 403 }) });
  const out = await viewUrlFor(f);
  assert.equal(out.error, 'object-unavailable');
  assert.match(out.reason, /signBlob denied/);
  assert.match(out.reason, /storage\.objects\.get denied/);
});
