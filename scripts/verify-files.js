import { chromium } from 'playwright';
import { readFile, cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const temporary = await mkdtemp(join(tmpdir(), 'form-files-check-'));
const extension = join(temporary, 'extension');
await cp(resolve('extension'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('https://forms.test/*');
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(join(temporary, 'profile'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  await context.route('https://forms.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Candidate details</title><form><label>City<input name="city"></label><label>State<input name="state"></label><label>Degree<input name="degree"></label><label>Resume<input name="resume" type="file" accept=".pdf"></label><label>Certificate<input name="certificate" type="file" accept=".txt" multiple></label><button>Submit</button></form><script>window.submissions=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submissions++}</script>' }));
  await context.route('https://api.typesafe.ai/v1/systemone', async route => {
    const body = route.request().postDataJSON();
    assert.equal(JSON.stringify(body).includes('PRIVATE_SYNTHETIC_FILE_BYTES'), false);
    const answers = {};
    for (const [id, question] of Object.entries(body.questions)) {
      let choice = 'skip';
      if (id === 'attachment') {
        choice = Object.entries(question.criteria).find(([, item]) => item.purpose === body.state.field.label)?.[0] || 'skip';
      } else {
        const value = { City: 'Bengaluru', State: 'Karnataka', Degree: 'BSc Computer Science' }[question.instructions.field];
        choice = Object.entries(question.criteria).find(([, item]) => item.value === value)?.[0] || 'skip';
        assert.ok(body.state.evidence.length);
      }
      answers[id] = { choice, confidence: .99 };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answers }) });
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  await worker.evaluate(() => chrome.storage.local.set({ apiKey: 'synthetic-test-key', profile: {}, sources: [{ url: 'https://portfolio.test', candidates: [{ kind: 'location', value: 'Bengaluru, Karnataka, India', context: 'Alex lives in Bengaluru, Karnataka, India.' }, { kind: 'Degree', value: 'BSc Computer Science', context: 'Alex graduated with this degree.' }] }] }));
  const form = await context.newPage();
  await form.goto('https://forms.test/apply');
  const app = await context.newPage();
  await app.goto(`chrome-extension://${id}/app.html?view=files`);
  const extracted = await app.evaluate(async () => {
    const { parseHtml } = await import('./sources.js');
    return parseHtml('<title>Alex profile</title><script type="application/ld+json">{"@type":"Person","name":"Alex Example","address":{"addressLocality":"Bengaluru","addressRegion":"Karnataka","addressCountry":"India","postalCode":"560001"},"alumniOf":{"name":"Cedar Valley University"}}</script><main><dl><dt>Degree</dt><dd>BSc Computer Science</dd><dt>Preferred working hours</dt><dd>09:00 to 17:00</dd></dl></main>', 'https://portfolio.test');
  });
  for (const [kind, value] of Object.entries({ city: 'Bengaluru', state: 'Karnataka', country: 'India', postalCode: '560001', alumniOf: 'Cedar Valley University', Degree: 'BSc Computer Science', 'Preferred working hours': '09:00 to 17:00' })) assert.ok(extracted.candidates.some(item => item.kind === kind && item.value === value));
  async function save(name, purpose, mimeType, preferred = false) {
    await app.locator('#file-upload').setInputFiles({ name, mimeType, buffer: Buffer.from(`PRIVATE_SYNTHETIC_FILE_BYTES ${name}`) });
    await app.locator('#file-purpose').fill(purpose);
    await app.locator('#file-preferred').setChecked(preferred);
    await app.locator('#file-form button').click();
    await app.locator('#files-list').getByText(new RegExp(name.replace('.', '\\.'))).waitFor();
  }
  await save('resume.pdf', 'Resume', 'application/pdf', true);
  await save('certificate-one.txt', 'Certificate', 'text/plain');
  await save('certificate-two.txt', 'Certificate', 'text/plain');
  assert.equal(await app.locator('#files-list .source-row').count(), 3);
  await app.reload();
  await app.locator('#files-list .source-row').nth(2).waitFor();
  await app.screenshot({ path: 'artifacts/files-library.png', fullPage: true });
  const popup = await context.newPage();
  await form.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('#fill').click();
  await popup.getByText(/4 fields filled. 1 left unchanged/).waitFor();
  assert.equal(await form.locator('[name=city]').inputValue(), 'Bengaluru');
  assert.equal(await form.locator('[name=state]').inputValue(), 'Karnataka');
  assert.equal(await form.locator('[name=degree]').inputValue(), 'BSc Computer Science');
  assert.equal(await form.locator('[name=resume]').evaluate(async input => input.files[0].text()), 'PRIVATE_SYNTHETIC_FILE_BYTES resume.pdf');
  assert.equal(await form.locator('[name=certificate]').evaluate(input => input.files.length), 0);
  await popup.getByLabel('File for Certificate').selectOption({ label: 'certificate-two.txt (Certificate)' });
  await popup.getByRole('button', { name: 'Attach file', exact: true }).click();
  await popup.getByText('File attached. Review the form before submitting.', { exact: true }).waitFor();
  assert.equal(await form.locator('[name=certificate]').evaluate(async input => input.files[0].text()), 'PRIVATE_SYNTHETIC_FILE_BYTES certificate-two.txt');
  assert.equal(await form.evaluate(() => window.submissions), 0);
  await form.locator('[name=resume]').setInputFiles({ name: 'manual.pdf', mimeType: 'application/pdf', buffer: Buffer.from('manual choice') });
  await popup.locator('#undo').click();
  await popup.getByText('4 fields restored.', { exact: true }).waitFor();
  assert.equal(await form.locator('[name=certificate]').evaluate(input => input.files.length), 0);
  assert.equal(await form.locator('[name=resume]').evaluate(input => input.files[0].name), 'manual.pdf');
  assert.equal(await form.locator('[name=city]').inputValue(), '');
  await form.goto('https://forms.test/review');
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://forms.test/*' }))[0].id);
  await app.goto(`chrome-extension://${id}/app.html?tab=${tabId}`);
  await app.locator('[data-view="fill"]').click();
  await app.locator('#scan').click();
  await app.locator('#apply').waitFor();
  assert.equal(await app.locator('[data-answer]:checked').count(), 4);
  await app.locator('#apply').click();
  await app.getByText(/4 fields filled. 0 skipped/).waitFor();
  assert.equal(await form.locator('[name=resume]').evaluate(input => input.files[0].name), 'resume.pdf');
  await app.locator('#undo').click();
  await app.getByText(/Restored 4 fields/).waitFor();
  assert.equal(await form.locator('[name=resume]').evaluate(input => input.files.length), 0);
  await app.locator('[data-view="files"]').click();
  await app.getByRole('button', { name: 'Remove file certificate-one.txt', exact: true }).click();
  await app.getByText('File removed from this device.', { exact: true }).waitFor();
  assert.equal(await app.locator('#files-list .source-row').count(), 2);
  const sizeRejected = await app.evaluate(async () => {
    const { saveFile } = await import('./files.js');
    try { await saveFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.txt'), { purpose: 'Example' }); return false; }
    catch (error) { return error.message.includes('10 MB'); }
  });
  assert.equal(sizeRejected, true);
  await app.locator('[data-view="settings"]').click();
  app.once('dialog', dialog => dialog.accept());
  await app.locator('#clear-data').click();
  await app.getByText('All local extension data deleted.', { exact: true }).waitFor();
  assert.equal(await app.evaluate(async () => (await (await import('./files.js')).listFiles()).length), 0);
  console.log('PASS: local file persistence, arbitrary purpose matching, source-derived city/state/degree, exact attached bytes, ambiguous file selection, file-safe undo, deletion, size limit, and complete data clearing.');
} finally {
  await context.close();
  await rm(temporary, { recursive: true, force: true });
}
