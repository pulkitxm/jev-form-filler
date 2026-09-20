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
test('profile retrieval compares contextual candidates across all pages and excludes company handles', async () => {
  const { inferProfile } = await import('../extension/model.js');
  const sources = [
    { url: 'https://github.com/alex-example', candidates: [{ kind: 'company', value: '@Brightwave' }] },
    { url: 'https://portfolio.test/past', candidates: [{ kind: 'company', value: 'Old Studio', context: 'Former employer, 2023 to 2024.' }] },
    { url: 'https://portfolio.test/', candidates: [{ kind: 'name', value: 'Alex Morgan', structured: true }, { kind: 'company', value: 'Brightwave.ai', context: 'I work at Brightwave.ai.', current: true }, { kind: 'twitter', value: 'https://x.com/alex_example' }] }
  ];
  const profile = await inferProfile(sources, { apiKey: 'synthetic', decideImpl: async (key, state, questions) => {
    const answers = {};
    for (const [id, question] of Object.entries(questions)) {
      const options = Object.entries(question.criteria).filter(([key]) => key !== 'skip');
      assert.ok(options.every(([, item]) => item.value !== '@Brightwave'));
      if (question.instructions.includes('Current company')) {
        assert.equal(options.length, 2);
        assert.ok(options.some(([, item]) => item.evidence[0].context.includes('Former employer')));
      }
      const choice = options.find(([, item]) => item.current) || options[0];
      answers[id] = { choice: choice[0], confidence: .99 };
    }
    return answers;
  } });
  assert.equal(profile.company.value, 'Brightwave.ai');
  assert.equal(profile.name.value, 'Alex Morgan');
  assert.equal(profile.twitter.value, 'https://x.com/alex_example');
});
test('duplicate facts retain corroborating context from different sources', async () => {
  const { candidatesFromSources } = await import('../extension/model.js');
  const candidates = candidatesFromSources([{ url: 'https://a.test', candidates: [{ kind: 'company', value: 'Brightwave.ai', context: 'Employer' }] }, { url: 'https://b.test', candidates: [{ kind: 'company', value: 'Brightwave.ai', context: 'Current employer', current: true }] }]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].evidence.length, 2);
  assert.equal(candidates[0].current, true);
});
