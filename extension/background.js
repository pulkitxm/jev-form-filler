import { filePayload } from './files.js';
import { applyFileAnswer } from './forms.js';
import { fillDetails, showProgress } from './fill.js';
import { createCredentialBridge } from './credentials.js';

chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const credentials = createCredentialBridge({ runtime: chrome.runtime, storage: chrome.storage.local });
credentials.listen();
void credentials.sync();

const running = new Set();
const keyFor = tabId => `fill:${tabId}`;
const execute = async (tabId, func, args = []) => {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result.result;
};
async function startFill(tabId) {
  if (running.has(tabId)) return;
  running.add(tabId);
  const publish = async (message, loading, extra = {}) => {
    await chrome.storage.session.set({ [keyFor(tabId)]: { message, loading, ...extra } });
    await execute(tabId, showProgress, [message, loading]).catch(() => {});
  };
  try {
    await publish('Preparing to fill your details…', true);
    await credentials.sync();
    const { profile = {}, sources = [], apiKey } = await chrome.storage.local.get(['profile', 'sources', 'apiKey']);
    const result = await fillDetails({ execute: (func, args) => execute(tabId, func, args), profile, sources, apiKey, progress: message => publish(message, true) });
    await publish(result.message, false, { token: result.token, count: result.count, pending: result.pending });
  } catch (error) {
    await publish(error.message || 'Unable to fill this page.', false);
  } finally { running.delete(tabId); }
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: 'fill-details', title: 'Fill Details', contexts: ['page', 'editable'], documentUrlPatterns: ['http://*/*', 'https://*/*'] }));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'fill-details' && tab?.id) void startFill(tab.id);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || !Number.isInteger(message?.tabId)) return;
  if (message.type === 'FILL_DETAILS') { void startFill(message.tabId); respond({ accepted: true }); }
  if (message.type === 'ATTACH_FILE') {
    void attachChosenFile(message).then(respond, error => respond({ error: error.message }));
    return true;
  }
});
async function attachChosenFile({ tabId, fieldId, fileId }) {
  if (running.has(tabId)) throw new Error('Wait for the current fill to finish.');
  running.add(tabId);
  try {
    const state = (await chrome.storage.session.get(keyFor(tabId)))[keyFor(tabId)];
    const field = state?.pending?.find(field => field.id === fieldId);
    if (!field?.options.some(option => option.id === fileId)) throw new Error('Choose an available file for this field.');
    const result = await execute(tabId, applyFileAnswer, [state.token, fieldId, await filePayload(fileId)]);
    if (result.status !== 'Filled') throw new Error(result.status);
    const next = { ...state, count: (state.count || 0) + 1, pending: state.pending.filter(field => field.id !== fieldId), message: 'File attached. Review the form before submitting.' };
    await chrome.storage.session.set({ [keyFor(tabId)]: next });
    await execute(tabId, showProgress, [next.message, false]);
    return { attached: true };
  } finally { running.delete(tabId); }
}
chrome.tabs.onRemoved.addListener(tabId => { void chrome.storage.session.remove(keyFor(tabId)); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') void chrome.storage.session.remove(keyFor(tabId));
});
