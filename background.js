// Background service worker for the Copy Detailed Req/Res extension.
//
// This script registers a context menu item on installation and, when clicked,
// sends a message to the active tab asking the content script to copy the
// most recently captured network request/response to the clipboard.

chrome.runtime.onInstalled.addListener(() => {
  // Create a single context menu item available on all pages.
  chrome.contextMenus.create({
    id: "copy-detailed-req-res",
    title: "Copy detailed req/res",
    contexts: ["all"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Ignore clicks on other menu items or if there is no tab ID.
  if (info.menuItemId !== "copy-detailed-req-res" || !tab?.id) return;

  try {
    // Ask the content script to copy the last captured entry.
    await chrome.tabs.sendMessage(tab.id, { type: "COPY_LAST_ENTRY" });
  } catch (e) {
    // If the content script hasn't yet injected, try injecting it on demand.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      // After injection, try again.
      await chrome.tabs.sendMessage(tab.id, { type: "COPY_LAST_ENTRY" });
    } catch (err) {
      console.warn("Could not copy last entry:", err);
    }
  }
});

// Handle messages from content scripts (for DevTools panel communication)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NETWORK_REQUEST_CAPTURED") {
    // Forward to DevTools panel if it exists
    // Note: DevTools panels receive these messages automatically via chrome.runtime.onMessage
    // This is mainly for logging and potential future features
    console.log("Network request captured:", message.data?.request?.url);
  }
});