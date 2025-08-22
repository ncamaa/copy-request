// Background service worker for the Copy Detailed Req/Res extension.
//
// This script registers a context menu item on installation and, when clicked,
// sends a message to the active tab asking the content script to copy the
// most recently captured network request/response to the clipboard.

chrome.runtime.onInstalled.addListener(() => {
  // Create the main context menu item
  chrome.contextMenus.create({
    id: "copy-detailed-req-res",
    title: "Copy detailed req/res",
    contexts: ["all"]
  });
  
  // Create a parent menu for recent requests
  chrome.contextMenus.create({
    id: "copy-recent-requests",
    title: "Copy recent requests",
    contexts: ["all"]
  });
  
  // Create a submenu item for the last request
  chrome.contextMenus.create({
    id: "copy-last-request",
    parentId: "copy-recent-requests",
    title: "📤 Last request",
    contexts: ["all"]
  });
});

// Function to update the recent requests submenu
async function updateRecentRequestsMenu(tabId) {
  try {
    // Remove all dynamic menu items first
    await chrome.contextMenus.removeAll();
    
    // Recreate the base menu items
    chrome.contextMenus.create({
      id: "copy-detailed-req-res",
      title: "Copy detailed req/res (last)",
      contexts: ["all"]
    });
    
    chrome.contextMenus.create({
      id: "copy-recent-requests",
      title: "Copy recent requests",
      contexts: ["all"]
    });
    
    // Try to get recent entries from content script
    let response = null;
    try {
      response = await chrome.tabs.sendMessage(tabId, { type: "GET_RECENT_ENTRIES" });
    } catch (err) {
      console.log("Content script not ready yet, will show default menu");
    }
    
    if (response?.ok && response.entries?.length > 0) {
      response.entries.forEach((entry, index) => {
        const url = entry.url.length > 50 ? entry.url.substring(0, 50) + "..." : entry.url;
        const title = `${entry.method} ${url} (${entry.status})`;
        
        chrome.contextMenus.create({
          id: `copy-entry-${entry.id}`,
          parentId: "copy-recent-requests",
          title: title,
          contexts: ["all"]
        });
      });
    } else {
      chrome.contextMenus.create({
        id: "no-requests",
        parentId: "copy-recent-requests",
        title: "No requests captured yet",
        contexts: ["all"],
        enabled: false
      });
    }
  } catch (err) {
    console.warn("Could not update recent requests menu:", err);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    let messageType;
    let messageData = {};
    
    if (info.menuItemId === "copy-detailed-req-res") {
      messageType = "COPY_LAST_ENTRY";
    } else if (info.menuItemId.startsWith("copy-entry-")) {
      messageType = "COPY_ENTRY_BY_ID";
      messageData.entryId = info.menuItemId.replace("copy-entry-", "");
    } else {
      return; // Unknown menu item
    }

    // Try to send message to content script
    await chrome.tabs.sendMessage(tab.id, { type: messageType, ...messageData });
  } catch (e) {
    // If the content script hasn't yet injected, try injecting it on demand.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      // After injection, try again.
      let messageType = info.menuItemId === "copy-detailed-req-res" ? "COPY_LAST_ENTRY" : "COPY_ENTRY_BY_ID";
      let messageData = {};
      if (info.menuItemId.startsWith("copy-entry-")) {
        messageData.entryId = info.menuItemId.replace("copy-entry-", "");
      }
      await chrome.tabs.sendMessage(tab.id, { type: messageType, ...messageData });
    } catch (err) {
      console.warn("Could not copy entry:", err);
    }
  }
});

// Update context menu when tab becomes active
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateRecentRequestsMenu(activeInfo.tabId);
});

// Update context menu when tab is updated (page reload, navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    await updateRecentRequestsMenu(tabId);
  }
});

// Handle messages from content scripts (for DevTools panel communication)
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "NETWORK_REQUEST_CAPTURED") {
    // Forward to DevTools panel if it exists
    // Note: DevTools panels receive these messages automatically via chrome.runtime.onMessage
    // This is mainly for logging and potential future features
    console.log("Network request captured:", message.data?.request?.url);
    
    // Update context menu when a new request is captured (with small delay)
    if (sender.tab?.id) {
      setTimeout(async () => {
        await updateRecentRequestsMenu(sender.tab.id);
      }, 100); // Small delay to ensure content script has processed the request
    }
  }
});