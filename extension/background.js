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
    await publish(result.message, false, { token: result.token, count: result.count });
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
  if (sender.id !== chrome.runtime.id || sender.tab || message?.type !== 'FILL_DETAILS' || !Number.isInteger(message.tabId)) return;
  void startFill(message.tabId);
  respond({ accepted: true });
});
chrome.tabs.onRemoved.addListener(tabId => { void chrome.storage.session.remove(keyFor(tabId)); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') void chrome.storage.session.remove(keyFor(tabId));
});
