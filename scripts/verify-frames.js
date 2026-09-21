import { chromium } from 'playwright';
import { readFile, cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const temporary = await mkdtemp(join(tmpdir(), 'form-frames-check-'));
const fixture = await readFile('fixtures/embedded-application.html', 'utf8');
try {
  for (const granted of [false, true]) {
    const extension = join(temporary, `extension-${granted}`);
    await cp(resolve('extension'), extension, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
    manifest.host_permissions.push('https://careers.test/*');
    if (granted) manifest.host_permissions.push('https://jobs.test/*', 'https://hidden.test/*');
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    const context = await chromium.launchPersistentContext(join(temporary, `profile-${granted}`), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    try {
      await context.route('https://careers.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Careers</title><h1>Join our team</h1><iframe title="Application" src="https://jobs.test/role" width="800" height="900"></iframe><iframe hidden src="https://hidden.test/private"></iframe>' }));
      await context.route('https://jobs.test/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
      await context.route('https://hidden.test/**', route => route.fulfill({ contentType: 'text/html', body: '<label>Name<input id="hidden-name"></label>' }));
      let requests = 0;
      await context.route('https://api.typesafe.ai/v1/systemone', async route => {
        requests++;
        const body = route.request().postDataJSON();
        assert.equal(JSON.stringify(body).includes('SYNTHETIC_RESUME_BYTES'), false);
        const answers = {};
        for (const [id, question] of Object.entries(body.questions)) {
          const value = { Name: 'Alex Example', Email: 'alex@example.test', LinkedIn: 'https://www.linkedin.com/in/alex-example/', 'What makes you a great fit for this role?': 'I build accessible web applications.' }[question.instructions.field];
          const choice = id === 'attachment' ? Object.entries(question.criteria).find(([, candidate]) => candidate.purpose === 'Resume')?.[0] : Object.entries(question.criteria).find(([, candidate]) => candidate.value === value)?.[0];
          answers[id] = { choice: choice || 'skip', confidence: .99 };
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answers }) });
      });
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
      const id = new URL(worker.url()).host;
      await worker.evaluate(() => chrome.storage.local.set({ apiKey: 'synthetic-key', sources: [], profile: Object.fromEntries(Object.entries({ name: 'Alex Example', email: 'alex@example.test', linkedin: 'https://www.linkedin.com/in/alex-example/', bio: 'I build accessible web applications.' }).map(([key, value]) => [key, { value, source: 'Entered by you' }])) }));
      const page = await context.newPage();
      await page.goto('https://careers.test/');
      const form = page.frameLocator('iframe[title="Application"]');
      await form.locator('#name').waitFor();
      const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://careers.test/*' }))[0].id);
      const popup = await context.newPage();
      await page.bringToFront();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      const missing = await popup.evaluate(async tabId => (await import('./frame-executor.js')).framePermissions(tabId), tabId);
      assert.deepEqual(missing, granted ? [] : ['https://jobs.test/*']);
      if (!granted) {
        await popup.evaluate(tabId => chrome.runtime.sendMessage({ type: 'FILL_DETAILS', tabId }), tabId);
        await popup.getByText(/Open the extension popup and click Fill Details to allow access/).waitFor();
        assert.equal(await form.locator('#name').inputValue(), '');
        assert.equal(requests, 0);
        continue;
      }
      await popup.evaluate(async () => {
        const { saveFile } = await import('./files.js');
        await saveFile(new File(['SYNTHETIC_RESUME_BYTES'], 'resume.pdf', { type: 'application/pdf' }), { purpose: 'Resume', preferred: true });
      });
      await popup.locator('#fill').click();
      await popup.getByText(/5 fields filled. 1 left unchanged/).waitFor();
      assert.equal(await form.locator('#name').inputValue(), 'Alex Example');
      assert.equal(await form.locator('#email').inputValue(), 'alex@example.test');
      assert.equal(await form.locator('#linkedin').inputValue(), 'https://www.linkedin.com/in/alex-example/');
      assert.equal(await form.locator('#about').inputValue(), 'I build accessible web applications.');
      assert.equal(await form.locator('#company').inputValue(), 'Keep my company');
      assert.equal(await form.locator('#resume').evaluate(async node => node.files[0].text()), 'SYNTHETIC_RESUME_BYTES');
      assert.equal(await page.frameLocator('iframe[hidden]').locator('#hidden-name').inputValue(), '');
      const frame = page.frames().find(frame => frame.url() === 'https://jobs.test/role');
      assert.equal(await frame.evaluate(() => window.submissions), 0);
      assert.deepEqual((await frame.evaluate(() => window.changes)).sort(), ['about', 'email', 'linkedin', 'name', 'resume']);
      await popup.locator('#undo').click();
      await popup.getByText('5 fields restored.', { exact: true }).waitFor();
      assert.equal(await form.locator('#name').inputValue(), '');
      assert.equal(await form.locator('#resume').evaluate(node => node.files.length), 0);
      const scan = await popup.evaluate(async tabId => {
        const { executeForm } = await import('./frame-executor.js');
        const { inspectForm } = await import('./forms.js');
        return executeForm(tabId, inspectForm);
      }, tabId);
      await frame.goto('https://jobs.test/another-application');
      const stale = await popup.evaluate(async ({ tabId, scan }) => {
        const { executeForm } = await import('./frame-executor.js');
        const { applyAnswers } = await import('./forms.js');
        try { await executeForm(tabId, applyAnswers, [scan.token, [{ id: scan.fields[0].id, value: 'Stale answer' }]]); return false; }
        catch { return true; }
      }, { tabId, scan });
      assert.equal(stale, true);
      assert.equal(await form.locator('#name').inputValue(), '');
      await popup.locator('#fill').click();
      await popup.getByText(/5 fields filled. 1 left unchanged/).waitFor();
      assert.equal(await form.locator('#name').inputValue(), 'Alex Example');
      assert.equal(await frame.evaluate(() => window.submissions), 0);
    } finally { await context.close(); }
  }
  console.log('PASS: embedded-origin permissions, cross-origin filling, clipped resume upload, hidden-frame exclusion, change events, existing values, undo, frame navigation, and no submission.');
} finally { await rm(temporary, { recursive: true, force: true }); }
