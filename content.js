// Content script for the Copy Detailed Req/Res extension.
//
// Injects a script into the page to patch fetch and XMLHttpRequest in
// the page context. It then listens for messages from that injected
// script to keep track of the most recently captured network request
// details. When the background script sends a COPY_LAST_ENTRY message,
// this script copies the stored entry to the clipboard.

let lastEntry = null;

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

// Handle messages from the background script. When the user clicks the
// context menu, the background script sends COPY_LAST_ENTRY to this
// content script. We then write the JSON to the clipboard.
chrome.runtime.onMessage.addListener((_msg, _sender, sendResponse) => {
  (async () => {
    if (_msg && _msg.type === "COPY_LAST_ENTRY") {
      if (!lastEntry) {
        console.warn("[copy detailed req/res] No request captured yet.");
        sendResponse({ ok: false });
        return;
      }
      const payload = {
        capturedAt: new Date().toISOString(),
        ...lastEntry
      };
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(payload, null, 2)
        );
        console.log(
          "[copy detailed req/res] Copied last entry to clipboard."
        );
        sendResponse({ ok: true });
      } catch (err) {
        console.warn(
          "[copy detailed req/res] Clipboard write failed:",
          err
        );
        sendResponse({ ok: false, error: String(err) });
      }
    }
  })();
  // Return true to indicate we will respond asynchronously.
  return true;
});