chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.action.onClicked.addListener(async tab => {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`app.html?tab=${tab.id}`) });
});
