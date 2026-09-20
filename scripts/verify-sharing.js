import { chromium } from 'playwright';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const reader = resolve(process.env.READER_EXTENSION_DIR || '../jev-reader/dist/extension');
const filler = resolve('extension');
const extensionId = async path => {
  const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
  return createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, char => String.fromCharCode(97 + parseInt(char, 16)));
};
const readerId = await extensionId(reader);
const fillerId = await extensionId(filler);
const temporary = await mkdtemp(join(tmpdir(), 'jev-sharing-'));
const paths = `${reader},${filler}`;
const context = await chromium.launchPersistentContext(temporary, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${paths}`, `--load-extension=${paths}`] });
try {
  const app = await context.newPage();
  await app.goto(`chrome-extension://${fillerId}/app.html`);
  await app.getByText('Connect TypeSafe', { exact: true }).waitFor();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${readerId}/popup.html`);
  await popup.locator('#api-key').fill('synthetic-shared-key');
  await popup.locator('#settings-form button[type="submit"]').click();
  await app.getByText('TypeSafe connected', { exact: true }).waitFor();
  assert.equal(await app.evaluate(async () => (await chrome.storage.local.get('apiKey')).apiKey), 'synthetic-shared-key');
  await app.locator('[data-view="settings"]').click();
  await app.locator('#api-key').fill('synthetic-replacement-key');
  await app.getByRole('button', { name: 'Save key', exact: true }).click();
  await app.getByText('API key saved and shared with your Jev extensions.', { exact: true }).waitFor();
  await popup.waitForFunction(async () => (await chrome.storage.local.get('apiKey')).apiKey === 'synthetic-replacement-key');
  await popup.locator('#remove-key').click();
  await app.getByText('Connect TypeSafe', { exact: true }).waitFor();
  assert.equal(await app.evaluate(async () => (await chrome.storage.local.get('apiKey')).apiKey), undefined);
  console.log('PASS: real Reader and Form Filler exchange, replace, and remove a synthetic key; the open workspace updates without reload.');
} finally {
  await context.close();
  await rm(temporary, { recursive: true, force: true });
}
