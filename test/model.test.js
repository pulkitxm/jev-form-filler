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
        assert.ok(state.evidence.some(item => item.sources.some(source => source.context.includes('Former employer'))));
      }
      const choice = options.find(([, item]) => state.evidence.some(evidence => evidence.value === item.value && evidence.current)) || options[0];
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
test('explicit structured identity survives without an unnecessary model decision', async () => {
  const { inferProfile } = await import('../extension/model.js');
  const profile = await inferProfile([{ url: 'https://portfolio.test/', candidates: [{ kind: 'name', value: 'Alex Morgan', structured: true }, { kind: 'twitter', value: 'https://x.com/alex_example', structured: true }] }], { decideImpl: async () => { throw new Error('Explicit identity should not require inference'); } });
  assert.equal(profile.name.value, 'Alex Morgan');
  assert.equal(profile.twitter.value, 'https://x.com/alex_example');
});
test('long profile context is split into bounded requests and low-confidence profile drafts stay reviewable', async () => {
  const { inferProfile } = await import('../extension/model.js');
  const candidates = Array.from({ length: 60 }, (_, index) => ({ kind: 'company', value: `Company ${index}`, context: `Employment history ${index} ` + 'context '.repeat(170) }));
  let calls = 0;
  const profile = await inferProfile([{ url: 'https://portfolio.test/', candidates }], { decideImpl: async (key, state, questions) => {
    calls++;
    assert.ok(JSON.stringify({ state, questions }).length < 25000);
    return Object.fromEntries(Object.keys(questions).map(id => [id, { choice: 'c0', confidence: .6 }]));
  } });
  assert.ok(calls > 1);
  assert.equal(profile.company.value, 'Company 0');
  assert.equal(profile.company.confidence, .6);
});
test('arbitrary form fields retrieve source facts and location components without a saved key', async () => {
  const { suggestAnswers } = await import('../extension/model.js');
  const source = { url: 'https://portfolio.test', candidates: [
    { kind: 'location', value: 'Bengaluru, Karnataka, India', context: 'Home location of Alex Morgan' },
    { kind: 'Degree', value: 'BSc Computer Science', context: 'Alex graduated with this degree.' }
  ] };
  const fields = [{ id: 'city', label: 'City', type: 'text' }, { id: 'state', label: 'State', type: 'text' }, { id: 'degree', label: 'Degree', type: 'text' }];
  const desired = { city: 'Bengaluru', state: 'Karnataka', degree: 'BSc Computer Science' };
  const results = await suggestAnswers(fields, {}, [source], { decideImpl: async (key, state, questions) => {
    assert.ok(state.evidence.some(item => item.context.includes('Home location')));
    return Object.fromEntries(Object.entries(questions).map(([id, question]) => [id, { choice: Object.entries(question.criteria).find(([, choice]) => choice.value === desired[id])[0], confidence: .98 }]));
  } });
  assert.deepEqual(results.map(item => item.answer.value), Object.values(desired));
});
test('excluded sources do not supply new field answers and long answers respect maximum length', () => {
  const sources = [{ excluded: true, candidates: [{ kind: 'city', value: 'Paris' }] }, { url: 'https://a.test', candidates: [{ kind: 'Degree', value: 'A very long degree description' }] }];
  assert.deepEqual(answerCandidates({ label: 'City', type: 'text', maxLength: 4 }, {}, sources), []);
});
test('unlisted fields extract exact source phrases with bounded choices, not generated text', async () => {
  const { extractSourceAnswer } = await import('../extension/model.js');
  const source = { url: 'https://portfolio.test', candidates: [{ kind: 'passage', value: 'I graduated from Cedar Valley University with a degree in computer science.' }] };
  const answer = await extractSourceAnswer({ label: 'University attended', type: 'text' }, {}, [source], { decideImpl: async (key, state, questions) => {
    if (questions.passage) return { passage: { choice: 'c0', confidence: .98 } };
    if (questions.start) return { start: { choice: Object.entries(questions.start.criteria).find(([, item]) => item.word === 'Cedar')[0], confidence: .98 } };
    return { end: { choice: Object.entries(questions.end.criteria).find(([, item]) => item === 'Cedar Valley University')[0], confidence: .98 } };
  } });
  assert.equal(answer.value, 'Cedar Valley University');
  assert.equal(answer.source, source.url);
  assert.ok(source.candidates[0].value.includes(answer.value));
});
test('profile field matching preserves compound keys and accepts case variations', async () => {
  const { profileCandidates } = await import('../extension/model.js');
  assert.equal(profileCandidates('postalCode', [{ kind: 'postalCode', value: '560001' }])[0].value, '560001');
  assert.equal(profileCandidates('companyWebsite', [{ kind: 'companyWebsite', value: 'https://company.test/' }])[0].value, 'https://company.test/');
  assert.equal(profileCandidates('city', [{ kind: 'City', value: 'Bengaluru' }])[0].value, 'Bengaluru');
});
