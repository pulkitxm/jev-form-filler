import { inspectForm, applyAnswers, undoAnswers } from './forms.js';
import { answerCandidates, answerQuestion, selectedCandidate, decide } from './model.js';
import { createCredentialBridge } from './credentials.js';

const $ = selector => document.querySelector(selector);
let tabId;
let state;
let busy = false;
const status = message => { $('#status').textContent = message; };
const execute = async (func, args = []) => {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result.result;
};
async function run(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('footer button').forEach(button => { button.disabled = true; });
  try { await action(); } catch (error) { status(error.message || 'Unable to read this page. Open a regular webpage and try again.'); }
  finally { busy = false; document.querySelectorAll('footer button').forEach(button => { button.disabled = false; }); }
}
async function persist() {
  await execute((token, popup) => {
    const session = globalThis.__jevFormSession;
    if (session?.token === token && session.url === location.href) session.popup = popup;
  }, [state.scan.token, state]);
}
function render() {
  $('#page').textContent = state.scan.title || 'Current form';
  $('#answers').replaceChildren();
  for (const item of state.items) {
    const card = document.createElement('div');
    card.className = 'answer';
    const label = document.createElement('label');
    label.className = 'heading';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.checked;
    checkbox.disabled = state.filled;
    label.append(checkbox, document.createTextNode(item.field.label));
    const input = document.createElement(item.field.type === 'select' ? 'select' : item.field.type === 'textarea' ? 'textarea' : 'input');
    input.className = 'value';
    input.setAttribute('aria-label', `Answer for ${item.field.label}`);
    if (item.field.type === 'select') for (const option of item.field.options) input.add(new Option(option.label, option.value));
    input.value = item.value;
    input.disabled = state.filled;
    const note = document.createElement('small');
    note.textContent = item.field.value ? 'Already has a value. Select only to replace it.' : item.answer ? `Source: ${item.answer.source || 'Saved profile'}` : 'No supported answer. Enter one to include it.';
    checkbox.onchange = () => { item.checked = checkbox.checked; void persist().catch(error => status(error.message)); };
    input.onchange = () => { item.value = input.value; item.checked = Boolean(input.value); checkbox.checked = item.checked; void persist().catch(error => status(error.message)); };
    card.append(label, input, note);
    $('#answers').append(card);
  }
  $('#fill').hidden = state.filled || !state.items.length;
  $('#undo').hidden = !state.filled;
  $('#scan').hidden = false;
}
async function scan() {
  $('#fill').hidden = true;
  $('#undo').hidden = true;
  $('#answers').replaceChildren();
  const { profile = {}, sources = [], apiKey } = await chrome.storage.local.get(['profile', 'sources', 'apiKey']);
  if (!Object.values(profile).some(fact => fact.value)) throw new Error('Open Manage profile and save your profile first.');
  if (!apiKey) throw new Error('Open Manage profile to connect your TypeSafe API key.');
  status('Reading the current form…');
  const form = await execute(inspectForm);
  state = { scan: form, items: [], filled: false };
  $('#page').textContent = form.title;
  if (!form.fields.length) throw new Error('No supported form fields found. Embedded frames and custom controls are not supported yet.');
  for (let offset = 0; offset < form.fields.length; offset += 12) {
    status(`Finding answers for ${Math.min(offset + 12, form.fields.length)} of ${form.fields.length} fields…`);
    const batch = form.fields.slice(offset, offset + 12);
    const candidates = batch.map(field => answerCandidates(field, profile, sources));
    const questions = Object.fromEntries(batch.map((field, index) => [field.id, answerQuestion(field, candidates[index])]));
    const answers = await decide(apiKey, { profile, purpose: 'Answer only from the profile owner’s evidence. Skip unknowns.' }, questions);
    state.items.push(...batch.map((field, index) => {
      const answer = selectedCandidate(answers[field.id], candidates[index]);
      return { field, answer, value: answer?.value || '', checked: Boolean(answer && !field.value) };
    }));
  }
  await persist();
  render();
  status('Review your answers, then fill the selected fields.');
}
$('#manage').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL(`app.html${tabId ? `?tab=${tabId}` : ''}`) });
$('#scan').onclick = () => run(scan);
$('#fill').onclick = () => run(async () => {
  const chosen = state.items.filter(item => item.checked).map(item => ({ id: item.field.id, value: item.value }));
  if (!chosen.length) { status('Select at least one answer to fill.'); return; }
  const results = await execute(applyAnswers, [state.scan.token, chosen]);
  const filled = results.filter(result => result.status === 'Filled').length;
  state.filled = filled > 0;
  await persist();
  render();
  status(`${filled} fields filled. ${results.length - filled} skipped. Review the form before submitting.`);
});
$('#undo').onclick = () => run(async () => {
  const count = await execute(undoAnswers, [state.scan.token]);
  state.filled = false;
  await persist();
  render();
  status(`${count} fields restored.`);
});
void run(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  if (!tabId || !/^https?:/.test(tab.url || '')) throw new Error('Open a form on a webpage, then click the extension icon.');
  $('#scan').hidden = false;
  const bridge = createCredentialBridge({ runtime: chrome.runtime, storage: chrome.storage.local });
  await bridge.sync();
  state = await execute(() => {
    const session = globalThis.__jevFormSession;
    return session?.url === location.href && [...session.elements.values()].every(entry => entry.node.isConnected) ? session.popup : null;
  });
  if (state) { render(); status(state.filled ? 'Your answers are filled. You can undo them here.' : 'Review your answers, then fill the selected fields.'); }
  else await scan();
});
