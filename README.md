# Copy Detailed Req/Res Chrome Extension

This extension makes it easy to capture the details of the last network request
(method, path, headers, body) and corresponding response in any tab. It
patches `fetch` and `XMLHttpRequest` in the page context to record this data
and adds a context menu item to copy the most recent request/response to your
clipboard.

## Installation

1. **Clone or download this repository**. It contains the manifest and JavaScript
   files that make up the extension.
2. Open Google Chrome (or Chromium) and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top‑right corner.
4. Click **Load unpacked** and select the folder containing this extension's
   files (the one that includes `manifest.json`).
5. The extension should now appear in your list of installed extensions.

## Usage

This extension provides **two ways** to copy network request details:

### Method 1: DevTools Panel (New!)
1. **Open DevTools** (F12 or right-click → Inspect)
2. **Navigate to the "Copy Req/Res" tab** in DevTools
3. **Perform actions** on the website that trigger network requests
4. **Click on any request** in the panel list to copy its details to clipboard

### Method 2: Context Menu (Original)
1. Navigate to any website and perform an action that triggers a network
   request (e.g. clicking a button or submitting a form). Only requests that
   occur *after* the page loads will be captured.
2. Right‑click anywhere on the page and choose **"Copy detailed req/res"** from
   the context menu.
3. The extension copies a JSON object representing the **last** network request
   and response to your clipboard.

Both methods copy a detailed JSON object that you can paste into an editor or
share with an AI assistant for debugging.

## What gets captured?

- The HTTP method and full URL of the request.
- The path (including query parameters) relative to the current origin.
- Request headers and body. Sensitive headers such as `authorization`,
  `cookie`, and `set‑cookie` are automatically redacted.
- Response status, status text, headers, and body. Binary or streaming
  responses are represented by a descriptive placeholder.
- Timing information (start time, end time, and duration).

Large bodies are truncated to 200,000 characters to avoid freezing the
DevTools panel. You can adjust this threshold by changing `MAX_BODY_CHARS`
in `injected.js`.

## Security considerations

Because this extension patches network APIs in the page context, it can see
requests made by the page. Do not install or run this extension on sites
you do not trust. The extension redacts authorization and cookie headers by
default, but you can further customize the list of headers to redact by
editing `REDACT_HEADER_KEYS` in `injected.js`.