import { inspectForm, applyAnswers } from './forms.js';
import { answerCandidates, answerQuestion, selectedCandidate, decide } from './model.js';

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
  if (!Object.values(profile).some(fact => fact.value)) throw new Error('Save your details in Manage profile first.');
  if (!apiKey) throw new Error('Connect your TypeSafe API key in Manage profile first.');
  await progress('Detecting form fields…');
  const scan = await execute(inspectForm);
  if (!scan.fields.length) throw new Error('No supported form fields found on this page.');
  const chosen = [];
  for (let offset = 0; offset < scan.fields.length; offset += 12) {
    const batch = scan.fields.slice(offset, offset + 12).filter(field => !field.value.trim());
    if (!batch.length) continue;
    await progress(`Finding answers: ${Math.min(offset + 12, scan.fields.length)} of ${scan.fields.length} fields…`);
    const candidates = batch.map(field => answerCandidates(field, profile, sources));
    const questions = Object.fromEntries(batch.map((field, index) => [field.id, answerQuestion(field, candidates[index])]));
    const answers = await decide(apiKey, { profile, purpose: 'Answer only from the profile owner’s evidence. Skip unknowns.' }, questions);
    batch.forEach((field, index) => {
      const answer = selectedCandidate(answers[field.id], candidates[index]);
      if (answer) chosen.push({ id: field.id, value: answer.value });
    });
  }
  await progress('Filling your details…');
  const results = await execute(applyAnswers, [scan.token, chosen]);
  const count = results.filter(result => result.status === 'Filled').length;
  return { token: scan.token, count, message: `${count} fields filled. ${scan.fields.length - count} left unchanged. Review the form before submitting.` };
}
