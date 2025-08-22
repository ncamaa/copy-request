// Content script for the Copy Detailed Req/Res extension.
//
// Injects a script into the page to patch fetch and XMLHttpRequest in
// the page context. It then listens for messages from that injected
// script to keep track of the most recently captured network request
// details. When the background script sends a COPY_LAST_ENTRY message,
// this script copies the stored entry to the clipboard.

let lastEntry = null;
let allEntries = []; // Store all captured requests
const MAX_STORED_REQUESTS = 100; // Limit to prevent memory issues

// Inject the script that patches fetch/XMLHttpRequest into the page
// context. We cannot patch these APIs directly from the content script
// because it runs in an isolated world.
(function inject() {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("injected.js");
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
  s.remove();
})();

// Listen for network capture messages from the injected script.
window.addEventListener(
  "message",
  (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.__netCapture__ !== true) return;
    
    lastEntry = data.entry;
    
    // Store all entries with a limit
    allEntries.unshift(data.entry);
    if (allEntries.length > MAX_STORED_REQUESTS) {
      allEntries = allEntries.slice(0, MAX_STORED_REQUESTS);
    }
    
    // Also send to DevTools panel if it's open
    chrome.runtime.sendMessage({
      type: "NETWORK_REQUEST_CAPTURED",
      data: data.entry
    }).catch(() => {
      // DevTools panel might not be open, ignore errors
    });
  },
  false
);

// Helper function to copy an entry to clipboard
async function copyEntryToClipboard(entry) {
  if (!entry) {
    throw new Error("No request data to copy");
  }
  
  const payload = {
    capturedAt: entry.capturedAt || new Date().toISOString(),
    ...entry
  };
  
  // Remove the internal ID before copying
  delete payload.id;
  
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
}

// Handle messages from the background script and DevTools
chrome.runtime.onMessage.addListener((_msg, _sender, sendResponse) => {
  (async () => {
    if (_msg && _msg.type === "COPY_LAST_ENTRY") {
      try {
        await copyEntryToClipboard(lastEntry);
        console.log("[copy detailed req/res] Copied last entry to clipboard.");
        sendResponse({ ok: true });
      } catch (err) {
        console.warn("[copy detailed req/res] Clipboard write failed:", err);
        sendResponse({ ok: false, error: String(err) });
      }
    } else if (_msg && _msg.type === "COPY_ENTRY_BY_ID") {
      try {
        const entry = allEntries.find(e => e.id === _msg.entryId);
        await copyEntryToClipboard(entry);
        console.log(`[copy detailed req/res] Copied entry ${_msg.entryId} to clipboard.`);
        sendResponse({ ok: true });
      } catch (err) {
        console.warn("[copy detailed req/res] Clipboard write failed:", err);
        sendResponse({ ok: false, error: String(err) });
      }
    } else if (_msg && _msg.type === "GET_RECENT_ENTRIES") {
      // Return recent entries for context menu
      const recentEntries = allEntries.slice(0, 10).map(entry => ({
        id: entry.id,
        method: entry.request?.method || 'GET',
        url: entry.request?.url || entry.request?.path || 'Unknown',
        status: entry.response?.status || 'Unknown',
        timestamp: entry.capturedAt || new Date().toISOString()
      }));
      sendResponse({ ok: true, entries: recentEntries });
    }
  })();
  // Return true to indicate we will respond asynchronously.
  return true;
});