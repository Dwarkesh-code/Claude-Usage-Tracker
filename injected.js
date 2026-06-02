(function () {
  'use strict';

  const COMPLETION_ENDPOINT   = /\/completion$/;
  const CONV_ID_PATTERN       = /\/chat_conversations\/([^/]+)\/completion/;
  const ORG_ID_PATTERN        = /\/organizations\/([^/]+)\//;
  const CONTEXT_WINDOW_TOKENS = 200000;

  const originalFetch = window.fetch.bind(window);

  // ── Saved IDs (persist across SPA navigation) ─────────────────────
  let savedOrgId  = null;
  let savedConvId = null;

  // ── Extract orgId directly from page URL ───────────────────────────

  function extractOrgIdFromPage() {
    try {
      const m = window.location.href.match(/\/organizations\/([^/]+)\//);
      return m ? m[1] : null;
    } catch { return null; }
  }

  // Try to capture orgId immediately from the current URL
  savedOrgId = extractOrgIdFromPage();

  function log(...args) {
    console.log('[Claude Usage Tracker]', ...args);
  }

  // ── URL helpers ────────────────────────────────────────────────────

  function getRequestInfo(input, init) {
    if (input instanceof Request) {
      return { url: input.url, method: (init?.method || input.method || 'GET').toUpperCase() };
    }
    return { url: String(input), method: (init?.method || 'GET').toUpperCase() };
  }

  function isCompletionRequest(url, method) {
    if (method !== 'POST') return false;
    try {
      return COMPLETION_ENDPOINT.test(new URL(url, window.location.origin).pathname);
    } catch { return false; }
  }

  function extractConvId(url) {
    try {
      const m = new URL(url, window.location.origin).pathname.match(CONV_ID_PATTERN);
      return m ? m[1] : null;
    } catch { return null; }
  }

  function extractOrgId(url) {
    try {
      const m = new URL(url, window.location.origin).pathname.match(ORG_ID_PATTERN);
      return m ? m[1] : null;
    } catch { return null; }
  }

  // ── Dispatchers ────────────────────────────────────────────────────

  function dispatchUsageData(usage) {
    document.dispatchEvent(new CustomEvent('claude-usage-data', { detail: usage }));
    log('Dispatched claude-usage-data', usage);
  }

  function dispatchContextData(contextPercent, contextTokens) {
    document.dispatchEvent(new CustomEvent('claude-context-data', {
      detail: { contextPercent, contextTokens }
    }));
    log('Dispatched claude-context-data', contextPercent + '%', '~' + contextTokens + ' tokens');
  }

  // ── REST API — context tracking ───────────────────────────────────
  // BUG FIX: Use block.text directly — no recursion needed.
  // The API response has text directly at block.text, not nested.

  async function fetchContextFromAPI(orgId, convId) {
    if (!orgId || !convId) return;
    try {
      const url =
        `/api/organizations/${orgId}/chat_conversations/${convId}` +
        `?tree=true&rendering_mode=messages&render_all_tools=true`;
      log('fetchContextFromAPI → GET', url);

      const resp = await originalFetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });

      if (!resp.ok) {
        log('fetchContextFromAPI — HTTP', resp.status, resp.statusText);
        return;
      }

      const data = await resp.json();
      // Debug: log first 500 chars of response
      console.log('[Claude Usage Tracker] API response:', JSON.stringify(data).slice(0, 500));

      const messages = data?.chat_messages;
      if (!Array.isArray(messages)) {
        log('fetchContextFromAPI — unexpected response shape:', Object.keys(data));
        return;
      }

      log('fetchContextFromAPI — messages:', messages.length);

      // FIXED: Direct block.text access — no recursion
      let totalChars = 0;
      for (const msg of messages) {
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && typeof block.text === 'string') {
              totalChars += block.text.length;
            }
          }
        }
        if (Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            if (att.extracted_content) totalChars += att.extracted_content.length;
          }
        }
      }

      const estimatedTokens = Math.round(totalChars / 4);
      const pct = Math.min(100, Math.round((estimatedTokens / CONTEXT_WINDOW_TOKENS) * 100));

      log('fetchContextFromAPI — chars:', totalChars, '| est tokens:', estimatedTokens, '| pct:', pct + '%');
      dispatchContextData(pct, estimatedTokens);

    } catch (err) {
      log('fetchContextFromAPI — error:', err.message || err);
    }
  }

  // ── Proactive fetch on load / SPA navigation ──────────────────────

  function tryFetchContextOnLoad() {
    const match = window.location.pathname.match(/\/chat\/([^/]+)/);
    if (!match) {
      // Not on a chat page — clear context display
      savedConvId = null;
      dispatchContextData(null, null);
      return;
    }
    const convId = match[1];
    // Always keep savedConvId in sync with the URL
    savedConvId = convId;
    if (!savedOrgId) savedOrgId = extractOrgIdFromPage();
    if (savedOrgId && convId) {
      fetchContextFromAPI(savedOrgId, convId);
    } else {
      // orgId not yet available — retry once after 5s
      log('tryFetchContextOnLoad — orgId not yet available, retrying in 5s');
      setTimeout(() => {
        if (!savedOrgId) savedOrgId = extractOrgIdFromPage();
        if (savedOrgId && convId) fetchContextFromAPI(savedOrgId, convId);
      }, 5000);
    }
  }

  // ── Listen for immediate-fetch requests from content.js ───────────
  document.addEventListener('claude-request-context-fetch', () => {
    log('Received immediate context fetch request from content.js');
    tryFetchContextOnLoad();
  });

  // SPA navigation: intercept pushState / replaceState
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    setTimeout(tryFetchContextOnLoad, 300);
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args) {
    originalReplaceState(...args);
    setTimeout(tryFetchContextOnLoad, 300);
  };

  window.addEventListener('popstate', () => {
    setTimeout(tryFetchContextOnLoad, 300);
  });

  // Poll every 30s to keep context fresh
  setInterval(tryFetchContextOnLoad, 30000);

  // ── Per-stream SSE parser ─────────────────────────────────────────

  function createSSEParser(convId) {
    let lineRemainder = '';
    let eventType     = 'message';
    let dataLines     = [];

    function handleEvent(type, data) {
      // Session usage
      const isMessageLimit = type === 'message_limit' || data?.type === 'message_limit';
      if (isMessageLimit) {
        const w5h = data?.message_limit?.windows?.['5h'];
        if (w5h) {
          const { utilization, resets_at } = w5h;
          if (utilization != null && resets_at != null) {
            dispatchUsageData({ utilization, resets_at });
          }
        }
      }

      // message_start: log but do NOT dispatch context — REST API is reliable
      const isMessageStart = type === 'message_start' || data?.type === 'message_start';
      if (isMessageStart) {
        const usage = data?.message?.usage ?? data?.usage ?? null;
        log('message_start usage:', JSON.stringify(usage));
        // NOTE: input_tokens absent in Claude.ai SSE — REST fallback handles context
      }
    }

    function flushEvent() {
      if (dataLines.length === 0) return;
      const raw          = dataLines.join('\n');
      dataLines          = [];
      const capturedType = eventType;
      eventType          = 'message';
      try {
        handleEvent(capturedType, JSON.parse(raw));
      } catch (err) {
        log('SSE parse fail', { type: capturedType, raw: raw.slice(0, 120) });
      }
    }

    function processBuffer(text, flush = false) {
      const combined = (lineRemainder + text).replace(/\r\n/g, '\n');
      const lines    = combined.split('\n');
      lineRemainder  = flush ? '' : (lines.pop() ?? '');

      for (const line of lines) {
        if (line === '')               { flushEvent(); continue; }
        if (line.startsWith('event:')) {
          if (dataLines.length > 0) flushEvent();
          eventType = line.slice(6).trim() || 'message';
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimEnd());
          continue;
        }
      }

      if (flush) {
        if (lineRemainder) {
          const last = lineRemainder;
          lineRemainder = '';
          if (last.startsWith('data:'))   dataLines.push(last.slice(5).trimEnd());
          else if (last.startsWith('event:')) {
            if (dataLines.length > 0) flushEvent();
            eventType = last.slice(6).trim() || 'message';
          }
        }
        flushEvent();
      }
    }

    return { processBuffer };
  }

  async function parseUsageFromStream(stream, convId) {
    if (!stream) return;
    const parser  = createSSEParser(convId);
    const reader  = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.processBuffer(decoder.decode(value, { stream: true }));
      }
      parser.processBuffer('', true);
    } catch (err) {
      log('Stream read error:', err.message);
    } finally {
      try { reader.releaseLock(); } catch { /* ok */ }
    }
  }

  // ── Patched fetch ─────────────────────────────────────────────────

  window.fetch = function (...args) {
    const [input, init]   = args;
    const { url, method } = getRequestInfo(input, init);

    return originalFetch(...args).then((response) => {
      if (!isCompletionRequest(url, method)) return response;

      log('Intercepted:', url, '| status:', response.status);
      const convId = extractConvId(url);
      const orgId  = extractOrgId(url);

      // Save IDs for proactive fetches
      if (orgId)  savedOrgId  = orgId;
      if (convId) savedConvId = convId;

      // Broadcast orgId to content.js (needed for copy button)
      if (orgId) {
        document.dispatchEvent(new CustomEvent('claude-org-id', { detail: { orgId } }));
      }

      if (response.body && typeof response.body.tee === 'function') {
        try {
          const [bodyForPage, bodyForUs] = response.body.tee();

          parseUsageFromStream(bodyForUs, convId)
            .then(() => fetchContextFromAPI(orgId, convId))
            .catch((err) => log('post-stream error:', err.message));

          return new Response(bodyForPage, {
            status:     response.status,
            statusText: response.statusText,
            headers:    response.headers,
          });
        } catch (err) {
          log('tee() failed, using clone():', err.message);
        }
      }

      // Fallback: clone
      try {
        parseUsageFromStream(response.clone().body, convId)
          .then(() => fetchContextFromAPI(orgId, convId))
          .catch((err) => log('post-stream error:', err.message));
      } catch (err) {
        log('clone() failed:', err.message);
      }

      return response;
    });
  };

  log('fetch interceptor installed ✓');

  // Initial load attempt (orgId may not be available yet — will retry after first completion)
  setTimeout(tryFetchContextOnLoad, 500);

})();
