import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsFile, matchFiles } from '../extension/files.js';
const file = (id, purpose, extra = {}) => ({ id, name: `${id}.pdf`, type: 'application/pdf', size: 200, purpose, description: '', ...extra });
test('file acceptance supports extensions, MIME wildcards and arbitrary file formats', () => {
  assert.equal(acceptsFile({ accept: '.PDF,.docx' }, file('resume', 'Resume')), true);
  assert.equal(acceptsFile({ accept: 'image/*' }, file('photo', 'Headshot', { name: 'photo.jpg', type: '' })), true);
  assert.equal(acceptsFile({ accept: '.blend' }, file('model', '3D work sample', { name: 'model.blend', type: '' })), true);
  assert.equal(acceptsFile({ accept: 'image/*' }, file('resume', 'Resume')), false);
});
test('ambiguous file versions require selection unless a default is saved', async () => {
  const fields = [{ id: 'file0', label: 'Degree certificate', type: 'file', value: '', accept: '.pdf' }];
  const decideImpl = async () => ({ attachment: { choice: 'c0', confidence: .99 } });
  const files = [file('one', 'Degree certificate'), file('two', 'Degree certificate')];
  const ambiguous = await matchFiles(fields, files, { apiKey: 'test', decideImpl });
  assert.equal(ambiguous.selected.length, 0);
  assert.equal(ambiguous.pending[0].options.length, 2);
  const preferred = await matchFiles(fields, [files[0], { ...files[1], preferred: true }], { apiKey: 'test', decideImpl });
  assert.equal(preferred.selected[0].fileId, 'two');
});
test('file matching sends metadata only and skips uncertain or already populated uploads', async () => {
  const files = [{ ...file('portfolio', 'Architecture drawings'), blob: 'PRIVATE_BYTES' }];
  let calls = 0;
  const result = await matchFiles([{ id: 'f', label: 'Architecture drawings', value: '' }, { id: 'existing', value: 'already.pdf' }], files, { apiKey: 'test', decideImpl: async (key, state, questions) => {
    calls++;
    assert.equal(JSON.stringify({ state, questions }).includes('PRIVATE_BYTES'), false);
    return { attachment: { choice: 'c0', confidence: .6 } };
  } });
  assert.equal(calls, 1);
  assert.equal(result.selected.length, 0);
  assert.equal(result.pending.length, 1);
});
