import { executeForm, framePermissions } from './frame-executor.js';
import { socialKind } from './sources.js';
import { undoAnswers } from './forms.js';

const $ = selector => document.querySelector(selector);
let tabId;
let current;
let requiredOrigins = [];
function render(state) {
  current = state;
  $('#status').textContent = state?.message || 'Fill saved details into the current form.';
  $('#fill').disabled = Boolean(state?.loading);
  $('#fill').textContent = state?.loading ? 'Filling…' : 'Fill Details';
  $('#status').setAttribute('aria-busy', String(Boolean(state?.loading)));
  $('#undo').hidden = !state?.count || state.loading;
  $('#file-choices').replaceChildren();
  for (const field of state?.pending || []) {
    const card = document.createElement('div');
    card.className = 'answer';
    const label = document.createElement('label');
    label.textContent = field.label;
    const select = document.createElement('select');
    select.className = 'value';
    select.setAttribute('aria-label', `File for ${field.label}`);
    select.add(new Option('Choose a saved file', ''));
    for (const file of field.options) select.add(new Option(`${file.name} (${file.purpose})`, file.id));
    const button = document.createElement('button');
    button.textContent = 'Attach file';
    button.disabled = true;
    select.onchange = () => { button.disabled = !select.value; };
    button.onclick = async () => {
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: 'ATTACH_FILE', tabId, fieldId: field.id, fileId: select.value });
        if (result?.error) throw new Error(result.error);
      } catch (error) { $('#status').textContent = error.message; button.disabled = false; }
    };
    const hint = document.createElement('small');
    hint.textContent = field.reason;
    const manage = document.createElement('button');
    manage.className = 'secondary';
    manage.textContent = 'Manage files';
    manage.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL(`app.html?view=files&tab=${tabId}`) });
    label.append(select);
    card.append(label, hint, button, manage);
    $('#file-choices').append(card);
  }
}
$('#import-profile').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL(`app.html?tab=${tabId}&import=1`) });
$('#manage').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL(`app.html${tabId ? `?tab=${tabId}` : ''}`) });
$('#fill').onclick = async () => {
  render({ loading: true, message: 'Preparing to fill your details…' });
  try {
    if (requiredOrigins.length && !await chrome.permissions.request({ origins: requiredOrigins })) throw new Error('Allow access to the embedded form to fill this page.');
    requiredOrigins = [];
    await chrome.runtime.sendMessage({ type: 'FILL_DETAILS', tabId });
  }
  catch (error) { render({ message: error.message }); }
};
$('#undo').onclick = async () => {
  try {
    const restored = await executeForm(tabId, undoAnswers, [current.token]);
    await chrome.storage.session.set({ [`fill:${tabId}`]: { message: `${restored} fields restored.`, loading: false } });
  } catch (error) { render({ message: error.message }); }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[`fill:${tabId}`]) render(changes[`fill:${tabId}`].newValue);
});
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  $('#import-profile').hidden = !socialKind(tab?.url || '');
  if (!tabId || !/^https?:/.test(tab.url || '')) {
    render({ message: 'Open a form on a webpage, then click Fill Details.' });
    $('#fill').disabled = true;
  } else {
    $('#page').textContent = tab.title || 'Current form';
    requiredOrigins = await framePermissions(tabId);
    const state = (await chrome.storage.session.get(`fill:${tabId}`))[`fill:${tabId}`];
    render(state || (requiredOrigins.length ? { message: `Fill Details will request access to the embedded form on ${requiredOrigins.map(origin => new URL(origin).hostname).join(', ')}.` } : undefined));
  }
} catch (error) { render({ message: error.message }); }
