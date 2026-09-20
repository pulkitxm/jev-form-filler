import { createCredentialBridge } from './credentials.js';

chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const credentials = createCredentialBridge({ runtime: chrome.runtime, storage: chrome.storage.local });
credentials.listen();
void credentials.sync();
chrome.action.onClicked.addListener(async tab => {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`app.html?tab=${tab.id}`) });
});
