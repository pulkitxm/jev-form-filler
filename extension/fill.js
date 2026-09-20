import { listFiles, matchFiles, filePayload } from './files.js';
import { inspectForm, applyAnswers, applyFileAnswer } from './forms.js';
import { suggestAnswers } from './model.js';

export function showProgress(message, loading) {
  let host = document.getElementById('jev-fill-progress');
  if (!host) {
    host = document.createElement('div');
    host.id = 'jev-fill-progress';
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    const panel = document.createElement('div');
    panel.style.cssText = 'font:14px/1.5 system-ui,sans-serif;background:#30234f;color:#fff;padding:16px 20px;border-radius:14px;box-shadow:0 8px 32px #0004;max-width:340px;display:flex;gap:16px;align-items:center';
    const text = document.createElement('span');
    text.setAttribute('role', 'status');
    const close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('aria-label', 'Dismiss fill status');
    close.style.cssText = 'background:transparent;color:inherit;border:0;font:24px system-ui;cursor:pointer';
    close.onclick = () => host.remove();
    panel.append(text, close);
    root.append(panel);
    document.documentElement.append(host);
  }
  host.shadowRoot.querySelector('span').textContent = message;
  host.shadowRoot.querySelector('span').setAttribute('aria-busy', String(loading));
}

export async function fillDetails({ execute, profile, sources, apiKey, progress }) {
  const files = await listFiles();
  if (!Object.values(profile).some(fact => fact.value) && !sources.some(source => !source.excluded) && !files.length) throw new Error('Save your details or files in Manage profile first.');
  await progress('Detecting form fields…');
  const scan = await execute(inspectForm);
  if (!scan.fields.length) throw new Error('No supported form fields found on this page.');
  if (scan.fields.some(field => field.type !== 'file' && !field.value.trim()) && !apiKey) throw new Error('Connect your TypeSafe API key in Manage profile first.');
  const suggestions = await suggestAnswers(scan.fields.filter(field => field.type !== 'file' && !field.value.trim()), profile, sources, { apiKey, onProgress: progress });
  const chosen = suggestions.filter(item => item.answer).map(item => ({ id: item.field.id, value: item.answer.value }));
  await progress('Matching saved files…');
  const attachments = await matchFiles(scan.fields.filter(field => field.type === 'file'), files, { apiKey });
  await progress('Filling your details…');
  const results = await execute(applyAnswers, [scan.token, chosen]);
  for (const attachment of attachments.selected) {
    await progress('Attaching a saved file…');
    results.push(await execute(applyFileAnswer, [scan.token, attachment.id, await filePayload(attachment.fileId)]));
  }
  const count = results.filter(result => result.status === 'Filled').length;
  return { token: scan.token, count, pending: attachments.pending, message: `${count} fields filled. ${scan.fields.length - count} left unchanged. Review the form before submitting.${attachments.pending.length ? ' Open the popup to choose files for remaining uploads.' : ''}` };
}
