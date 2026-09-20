import test from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, selectedCandidate, decide, answerCandidates } from '../extension/model.js';
test('rejects credential URLs and executable protocols', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:secret@example.test']) assert.throws(() => safeUrl(url));
  assert.equal(safeUrl('/about#name', 'https://example.test').href, 'https://example.test/about');
});
test('unknown, invalid and uncertain model choices cannot become facts', () => {
  const candidates = [{ value: 'Alex Morgan' }];
  assert.equal(selectedCandidate({ choice: 'c0', confidence: .4 }, candidates), null);
  assert.equal(selectedCandidate({ choice: 'skip', confidence: 1 }, candidates), null);
  for (const answer of [{ choice: 'c99', confidence: 1 }, { choice: 'c0', confidence: 2 }, {}]) assert.throws(() => selectedCandidate(answer, candidates));
  assert.equal(selectedCandidate({ choice: 'c0', confidence: .95 }, candidates).value, 'Alex Morgan');
});
test('TypeSafe authentication failures are actionable and never contain the key', async () => {
  await assert.rejects(decide('secret', {}, {}, { fetchImpl: async () => ({ ok: false, status: 401 }) }), /Replace it in Settings/);
});
test('missing answers fail instead of silently filling', async () => {
  await assert.rejects(decide('test', {}, { name: {} }, { fetchImpl: async () => ({ ok: true, json: async () => ({ answers: {} }) }) }), /incomplete/);
});
test('select candidates retain actual option values', () => {
  assert.deepEqual(answerCandidates({ options: [{ label: 'Choose', value: '' }, { label: 'Remote', value: 'remote' }] }, {}, []), [{ label: 'Remote', value: 'remote', source: 'Profile match' }]);
});
test('abort signals stop TypeSafe work without a fallback answer', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(decide('test', {}, {}, { signal: controller.signal, fetchImpl: async (url, options) => { options.signal.throwIfAborted(); } }), /Stopped/);
});
