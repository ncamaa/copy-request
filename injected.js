// Injected script for the Copy Detailed Req/Res extension.
//
// This code runs in the page context and patches both fetch and
// XMLHttpRequest to capture details of the most recent network request.
// Each captured entry is posted back to the content script via
// window.postMessage. Sensitive headers (authorization, cookie,
// set-cookie) are redacted automatically. Response bodies and
// request bodies are truncated to prevent the DevTools from hanging
// when extremely large payloads are captured.

(() => {
  const MAX_BODY_CHARS = 200000;
  const REDACT_HEADER_KEYS = ["authorization", "cookie", "set-cookie"];

  /**
   * Truncate a string if it exceeds MAX_BODY_CHARS.
   * @param {string|null|undefined} s
   * @returns {string|null}
   */
  const truncate = (s) => {
    if (s == null) return null;
    const str = String(s);
    return str.length > MAX_BODY_CHARS
      ? str.slice(0, MAX_BODY_CHARS) +
          `\n...[truncated ${str.length - MAX_BODY_CHARS} chars]`
      : str;
  };

  /**
   * Redact sensitive headers.
   * @param {Object} obj
   */
  const redact = (obj) => {
    const out = {};
    for (const k in obj) {
      out[k] = REDACT_HEADER_KEYS.includes(k.toLowerCase())
        ? "[REDACTED]"
        : obj[k];
    }
    return out;
  };

  /**
   * Convert a Headers object to a plain lower‑cased key/value object.
   * @param {Headers} h
   */
  const headersToObj = (h) => {
    const o = {};
    try {
      for (const [k, v] of h.entries()) o[k.toLowerCase()] = v;
    } catch {
      /* ignore */
    }
    return o;
  };

  /**
   * Parse a raw response header string into an object.
   * @param {string} raw
   */
  const parseRawHeaders = (raw) => {
    const out = {};
    if (!raw) return out;
    raw
      .trim()
      .split(/[\r\n]+/)
      .forEach((line) => {
        const i = line.indexOf(":");
        if (i > -1)
          out[line.slice(0, i).trim().toLowerCase()] = line
            .slice(i + 1)
            .trim();
      });
    return out;
  };

  /**
   * Convert a request body into a safe string representation.
   * @param {any} b
   */
  const bodyToString = (b) => {
    if (b == null) return null;
    if (typeof b === "string") return b;
    if (b instanceof URLSearchParams) return b.toString();
    if (b instanceof FormData) {
      const obj = {};
      for (const [k, v] of b.entries()) {
        obj[k] = v instanceof File
          ? `[File name=${v.name} size=${v.size}]`
          : String(v);
      }
      return JSON.stringify(obj);
    }
    if (b instanceof Blob) return `[Blob size=${b.size}]`;
    if (b instanceof ArrayBuffer) return `[ArrayBuffer bytes=${b.byteLength}]`;
    if (b instanceof Document)
      return new XMLSerializer().serializeToString(b);
    try {
      return String(b);
    } catch {
      return "[Unserializable body]";
    }
  };

  /**
   * Compute the path and query from a URL string relative to the current page.
   * @param {string} u
   */
  const pathFrom = (u) => {
    try {
      const url = new URL(u, location.href);
      return url.pathname + (url.search || "");
    } catch {
      return u;
    }
  };

  /**
   * Parse and beautify JSON strings
   * @param {string} str
   */
  const beautifyJson = (str) => {
    if (!str || typeof str !== 'string') return str;
    try {
      const parsed = JSON.parse(str);
      return parsed; // Return the actual object, not stringified
    } catch {
      return str; // Return original if not valid JSON
    }
  };

  /**
   * Post a captured entry to the content script.
   * @param {Object} entry
   */
  const post = (entry) => {
    // Generate a unique ID for this request
    entry.id = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    // Beautify JSON bodies
    if (entry.request?.body) {
      entry.request.body = beautifyJson(entry.request.body);
    }
    if (entry.response?.body) {
      entry.response.body = beautifyJson(entry.response.body);
    }
    
    window.postMessage({ __netCapture__: true, entry }, "*");
  };

  // --- fetch ---
  const realFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init) {
    const startedAt = Date.now();
    const req = new Request(input, init);
    const reqClone = req.clone();
    let reqBody = null;
    try {
      reqBody = await reqClone.text();
    } catch {
      /* ignore */
    }
    const reqHeaders = headersToObj(reqClone.headers);

    let res;
    try {
      res = await realFetch(req);
    } catch (err) {
      post({
        request: {
          method: reqClone.method,
          url: reqClone.url,
          path: pathFrom(reqClone.url),
          headers: redact(reqHeaders),
          body: truncate(reqBody)
        },
        response: { error: String(err) },
        timing: {
          startedAt,
          endedAt: Date.now(),
          durationMs: Date.now() - startedAt
        },
        transport: "fetch"
      });
      throw err;
    }

    const resClone = res.clone();
    let resBody = null;
    try {
      resBody = await resClone.text();
    } catch {
      /* ignore */
    }
    const resHeaders = headersToObj(resClone.headers);

    post({
      request: {
        method: reqClone.method,
        url: reqClone.url,
        path: pathFrom(reqClone.url),
        headers: redact(reqHeaders),
        body: truncate(reqBody)
      },
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: redact(resHeaders),
        body: truncate(resBody)
      },
      timing: {
        startedAt,
        endedAt: Date.now(),
        durationMs: Date.now() - startedAt
      },
      transport: "fetch"
    });
    return res;
  };

  // --- XMLHttpRequest ---
  const RealXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new RealXHR();
    let method = "GET";
    let url = "";
    let startedAt = 0;
    const reqHeaders = {};
    let reqBody = null;

    const _open = xhr.open;
    xhr.open = function (m, u) {
      method = m || "GET";
      url = u || "";
      return _open.apply(xhr, arguments);
    };

    const _setRequestHeader = xhr.setRequestHeader;
    xhr.setRequestHeader = function (k, v) {
      reqHeaders[String(k).toLowerCase()] = String(v);
      return _setRequestHeader.apply(xhr, arguments);
    };

    const _send = xhr.send;
    xhr.send = function (body) {
      startedAt = Date.now();
      reqBody = body;
      xhr.addEventListener("loadend", function () {
        const raw = xhr.getAllResponseHeaders();
        const resHeaders = parseRawHeaders(raw);
        const respBody =
          xhr.responseType === "" || xhr.responseType === "text"
            ? xhr.responseText
            : `[${xhr.responseType} response]`;
        post({
          request: {
            method,
            url,
            path: pathFrom(url),
            headers: redact(reqHeaders),
            body: truncate(bodyToString(reqBody))
          },
          response: {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: redact(resHeaders),
            body: truncate(respBody)
          },
          timing: {
            startedAt,
            endedAt: Date.now(),
            durationMs: Date.now() - startedAt
          },
          transport: "xhr"
        });
      });
      return _send.apply(xhr, arguments);
    };
    return xhr;
  }
  // Attach a reference to the unpatched constructor for debugging if needed.
  PatchedXHR.UNPATCHED = RealXHR;
  window.XMLHttpRequest = PatchedXHR;
})();