chrome.runtime.onInstalled.addListener(() => {
  if (!chrome.sidePanel) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !chrome.sidePanel) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

