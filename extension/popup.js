import { undoAnswers } from './forms.js';

const $ = selector => document.querySelector(selector);
let tabId;
let current;
function render(state) {
  current = state;
  $('#status').textContent = state?.message || 'Fill saved details into the current form.';
  $('#fill').disabled = Boolean(state?.loading);
  $('#fill').textContent = state?.loading ? 'Filling…' : 'Fill Details';
  $('#status').setAttribute('aria-busy', String(Boolean(state?.loading)));
  $('#undo').hidden = !state?.count || state.loading;
}
$('#manage').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL(`app.html${tabId ? `?tab=${tabId}` : ''}`) });
$('#fill').onclick = async () => {
  render({ loading: true, message: 'Preparing to fill your details…' });
  try { await chrome.runtime.sendMessage({ type: 'FILL_DETAILS', tabId }); }
  catch (error) { render({ message: error.message }); }
};
$('#undo').onclick = async () => {
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: undoAnswers, args: [current.token] });
    await chrome.storage.session.set({ [`fill:${tabId}`]: { message: `${result.result} fields restored.`, loading: false } });
  } catch (error) { render({ message: error.message }); }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[`fill:${tabId}`]) render(changes[`fill:${tabId}`].newValue);
});
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  if (!tabId || !/^https?:/.test(tab.url || '')) {
    render({ message: 'Open a form on a webpage, then click Fill Details.' });
    $('#fill').disabled = true;
  } else {
    $('#page').textContent = tab.title || 'Current form';
    render((await chrome.storage.session.get(`fill:${tabId}`))[`fill:${tabId}`]);
  }
} catch (error) { render({ message: error.message }); }
