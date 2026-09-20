import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchText } from '../extension/sources.js';
test('source fetches omit credentials and refuse redirects', async () => {
  const value = await fetchText('https://example.test', { fetchImpl: async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    return new Response('Synthetic source');
  } });
  assert.equal(value, 'Synthetic source');
});
test('source size is enforced on received bytes', async () => {
  await assert.rejects(fetchText('https://example.test', { fetchImpl: async () => new Response('a'.repeat(2_000_001)) }), /2 MB/);
});
test('inaccessible source errors offer an open-page fallback', async () => {
  await assert.rejects(fetchText('https://example.test', { fetchImpl: async () => new Response('', { status: 403 }) }), /Import open page/);
});
