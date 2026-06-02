// ═══════════════════════════════════════════════════════════════════
//  Claude Usage Tracker — content.js
//  Injects stat line inside Claude's own input box (native look)
// ═══════════════════════════════════════════════════════════════════

const STAT_LINE_ID = 'claude-tracker-stat-line';

// Injected Pre-Send Tokenizer global pasted text tracker
let pastedTextLength = 0;

// Inject CSS for the Pre-Send Tokenizer Pulsating alert
(function() {
  if (document.getElementById('ctb-pulse-styles')) return;
  const style = document.createElement('style');
  style.id = 'ctb-pulse-styles';
  style.textContent = `
    @keyframes ctb-pulse-alert-anim {
      0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
      100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }
    .ctb-pulse-alert {
      animation: ctb-pulse-alert-anim 1.5s infinite !important;
      border: 1px solid rgba(239, 68, 68, 0.4) !important;
    }
  `;
  document.head.appendChild(style);
})();

const barState = {
  sessionPercent: 0,
  contextPercent: null,   // null = N/A until first REST API call
  contextTokens: null,   // estimated token count for tooltip
  resetsAt: null,   // unix timestamp (seconds)
};

let countdownTimer = null;
let mountInterval = null;

// ── Peak hours detection ────────────────────────────────────────────
// Peak = weekdays 1pm–7pm UTC

function isPeakHours() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  return utcDay >= 1 && utcDay <= 5 && utcHour >= 13 && utcHour < 19;
}

// ── Context color by token count (research-backed thresholds) ───────
// 0–30k: Green (fresh), 30–50k: Yellow (caution),
// 50–70k: Orange (degrading), 70k+: Red (heavy rot)

function contextColorByTokens(tokens) {
  if (tokens == null) return '#3a7bd5';
  if (tokens < 30000)  return '#22c55e'; // green
  if (tokens < 50000)  return '#eab308'; // yellow
  if (tokens < 70000)  return '#f97316'; // orange
  return '#ef4444';                      // red
}

function contextHealthTip(tokens) {
  if (tokens == null) return '';
  const tok = tokens.toLocaleString();
  if (tokens < 30000)
    return `🟢 Context fresh — best quality\n~${tok} / 200,000 tokens`;
  if (tokens < 50000)
    return `🟡 Context filling — reasoning may slow\n~${tok} / 200,000 tokens`;
  if (tokens < 70000)
    return `🟠 Quality degrading — consider new chat for complex tasks\n~${tok} / 200,000 tokens`;
  return `🔴 Heavy context rot — start new chat recommended\n~${tok} / 200,000 tokens`;
}

// ── Smart Context Warning Toast ──────────────────────────────────────

let toastState = { warnedOrange: false, warnedRed: false, currentConvId: null };

function checkContextToast(tokens) {
  if (tokens == null) return;
  const match = window.location.pathname.match(/\/chat\/([^/]+)/);
  const convId = match ? match[1] : null;
  if (!convId) return;

  if (toastState.currentConvId !== convId) {
    toastState = { warnedOrange: false, warnedRed: false, currentConvId: convId };
  }

  if (tokens >= 70000 && !toastState.warnedRed) {
    showToast('Heavy context rot detected. Starting a new chat is highly recommended.');
    toastState.warnedRed = true;
    toastState.warnedOrange = true;
  } else if (tokens >= 50000 && tokens < 70000 && !toastState.warnedOrange) {
    showToast('Context getting heavy. Consider a new chat for complex tasks.');
    toastState.warnedOrange = true;
  }
}

function showToast(message) {
  const existing = document.getElementById('ctb-toast');
  if (existing) existing.remove();

  const toast = el('div',
    'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
    'background:rgba(20,20,20,0.85);backdrop-filter:blur(10px);color:#e4e4e7;' +
    'padding:12px 20px;border-radius:12px;font-size:13px;font-family:Inter,sans-serif;' +
    'border:1px solid rgba(255,255,255,0.08);box-shadow:0 10px 30px rgba(0,0,0,0.5);' +
    'z-index:9999;opacity:0;transition:opacity 0.4s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);' +
    'display:flex;align-items:center;gap:8px;'
  );
  toast.id = 'ctb-toast';
  toast.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="#eab308"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg> <span>${message}</span>`;

  document.body.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, -10px)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 0)';
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// ── Pre-Send Tokenizer (Panic Preventer) ─────────────────────────────
// Estimates characters to tokens (RAG shows average code/prose density is 3.5 chars per token).
// Science-backed reasoning degradation thresholds:
// <4k = Peak (Green), 4k-8k = Multi-hop decay (Yellow), 8k-32k = Attention Dilution (Orange), >32k = Severe rot (Red)

function updateDraftTokenIndicator(charCount) {
  const badge = document.getElementById('ctb-draft-badge');
  if (!badge) return;

  // RAG research density multiplier (3.5 chars per token for code/mixed input)
  const tokens = Math.round(charCount / 3.5);

  // Hidden when draft is very small to avoid UI clutter
  if (charCount < 200) {
    badge.style.display = 'none';
    return;
  }

  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.gap = '4px';

  let color, bg, text, pulseClass = false;
  
  if (tokens < 4000) {
    color = '#22c55e'; // Green (Safe)
    bg = 'rgba(34, 197, 94, 0.1)';
    text = `Draft: ~${tokens.toLocaleString()}`;
  } else if (tokens < 8000) {
    color = '#eab308'; // Yellow (Warning: reasoning decays)
    bg = 'rgba(234, 179, 8, 0.1)';
    text = `⚠️ Draft: ~${tokens.toLocaleString()}`;
  } else if (tokens < 32000) {
    color = '#f97316'; // Orange (Attention degrades / Lost in middle risk)
    bg = 'rgba(249, 115, 22, 0.1)';
    text = `⚠️ Draft: ~${tokens.toLocaleString()}`;
  } else {
    color = '#ef4444'; // Red (Severe reasoning compression / limit waste regret)
    bg = 'rgba(239, 68, 68, 0.15)';
    text = `⚠️ DRAFT CRITICAL: ~${tokens.toLocaleString()}!`;
    pulseClass = true;
  }

  badge.textContent = text;
  badge.style.color = color;
  badge.style.background = bg;
  badge.style.border = `1px solid ${color}33`;

  if (pulseClass) {
    badge.classList.add('ctb-pulse-alert');
  } else {
    badge.classList.remove('ctb-pulse-alert');
  }
}

// ── DOM helpers ────────────────────────────────────────────────────

function el(tag, styles, classes) {
  const e = document.createElement(tag);
  if (styles) e.style.cssText = styles;
  if (classes) e.classList.add(...classes);
  return e;
}

function makeProgressBar(fillId) {
  const track = el('div',
    'width:72px;height:3px;border-radius:2px;overflow:hidden;flex-shrink:0;',
    ['bg-bg-200']
  );
  const fill = el('div',
    'height:100%;width:0%;background:#3a7bd5;border-radius:2px;' +
    'transition:width 0.4s ease,background 0.3s ease;'
  );
  fill.id = fillId;
  track.appendChild(fill);
  return { track, fill };
}

function makeMetricGroup(label, pctId, fillId, trackId) {
  const group = el('div', 'display:flex;align-items:center;gap:5px;flex-shrink:0;');

  const lbl = el('span',
    'text-transform:uppercase;letter-spacing:0.05em;opacity:0.65;flex-shrink:0;'
  );
  lbl.textContent = label;

  const pct = el('span',
    'color:#3a7bd5;font-weight:600;min-width:30px;text-align:right;flex-shrink:0;'
  );
  pct.id = pctId;
  pct.textContent = '—';

  const { track, fill } = makeProgressBar(fillId);
  if (trackId) track.id = trackId;

  group.appendChild(lbl);
  group.appendChild(pct);
  group.appendChild(track);
  return group;
}

// ── Copy button (Feature 4: Conversation Export) ───────────────────

function makeCopyButton() {
  const btn = el('span',
    'cursor:pointer;opacity:0.6;flex-shrink:0;padding:2px 4px;user-select:none;transition:all 0.2s;' +
    'display:flex;align-items:center;justify-content:center;border-radius:4px;'
  );
  btn.id = 'ctb-copy-btn';
  btn.title = 'Copy conversation';
  const copyIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
  const checkIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#22c55e"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`;
  const crossIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#ef4444"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>`;
  btn.innerHTML = copyIcon;

  btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.background = 'rgba(255,255,255,0.1)'; });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    if (!btn._copying) btn.style.opacity = '0.6';
  });

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (btn._copying) return;
    btn._copying = true;

    try {
      const pathMatch = window.location.pathname.match(/\/chat\/([^/]+)/);
      if (!pathMatch) {
        btn.textContent = '❌';
        setTimeout(() => { btn.textContent = '📋'; btn._copying = false; }, 1500);
        return;
      }
      const convId = pathMatch[1];

      // orgId: 3-source fallback chain
      const statLine = document.getElementById(STAT_LINE_ID);
      let orgId = statLine?.dataset?.orgId || window.__ctb_orgId || null;

      // Fallback: URL regex
      if (!orgId) {
        const m = window.location.href.match(/\/organizations\/([^/]+)\//);
        if (m) orgId = m[1];
      }

      // Fallback: chrome.storage (set when injected.js broadcasts claude-org-id)
      if (!orgId) {
        orgId = await new Promise(resolve => {
          chrome.storage.local.get('savedOrgId', d => resolve(d.savedOrgId || null));
        });
      }

      if (!orgId) {
        btn.innerHTML = crossIcon;
        setTimeout(() => { btn.innerHTML = copyIcon; btn._copying = false; }, 1500);
        return;
      }

      const url =
        `/api/organizations/${orgId}/chat_conversations/${convId}` +
        `?tree=true&rendering_mode=messages&render_all_tools=true`;

      const resp = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      // Build Markdown export
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      });
      const header = `# Chat Export — Claude AI\n**Exported:** ${dateStr} | **Conversation ID:** ${convId}\n`;

      const lines = [];
      for (const msg of (data.chat_messages || [])) {
        const isHuman = msg.sender === 'human';
        const heading = isHuman ? '## 👤 Human' : '## 🤖 Claude';
        const blocks = Array.isArray(msg.content) ? msg.content : [];
        const text = blocks
          .filter(b => b.type === 'text' && typeof b.text === 'string')
          .map(b => b.text)
          .join('\n')
          .trim();
        if (text) lines.push(`${heading}\n\n${text}`);
      }

      const fullText = header + '\n---\n\n' + lines.join('\n\n---\n\n');

      // Try modern clipboard API first, fallback to execCommand
      try {
        await navigator.clipboard.writeText(fullText);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = fullText;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }

      btn.innerHTML = checkIcon;
      btn.style.opacity = '1';
      setTimeout(() => {
        btn.innerHTML = copyIcon;
        btn.style.opacity = '0.6';
        btn._copying = false;
      }, 2000);

    } catch (err) {
      console.error('[Claude Usage Tracker] Copy failed:', err);
      btn.innerHTML = crossIcon;
      setTimeout(() => { btn.innerHTML = copyIcon; btn._copying = false; }, 1500);
    }
  });

  btn.addEventListener('pointerdown', e => e.stopPropagation());
  return btn;
}

// ── Build stat line ────────────────────────────────────────────────
// Layout: [SESSION group]  [⚡PEAK? Resets in Xh Xm]  [CHAT CONTEXT group] [📋]

function createStatLine() {
  const line = el('div',
    'display:flex;align-items:center;justify-content:space-between;' +
    'padding:6px 12px;margin: 4px 0;',
    ['text-xs', 'text-text-400']
  );
  line.id = STAT_LINE_ID;
  line.style.borderTop = '1px solid rgba(255,255,255,0.06)';
  line.style.fontFamily = 'Inter, -apple-system, sans-serif';

  // Prevent pointer events from reaching Claude's React handlers
  line.addEventListener('pointerdown', (e) => e.stopPropagation());

  // Left — SESSION
  line.appendChild(makeMetricGroup('Session', 'ctb-s-pct', 'ctb-s-fill'));

  // Center — Peak indicator + Reset countdown
  const centerWrap = el('span', 'display:flex;align-items:center;gap:4px;flex-shrink:0;');

  const peak = el('span',
    'color:#ef4444;font-weight:700;letter-spacing:0.05em;display:none;font-size:10px;' +
    'padding:1px 4px;background:rgba(239,68,68,0.1);border-radius:4px;'
  );
  peak.id = 'ctb-peak';
  peak.textContent = '⚡PEAK';
  centerWrap.appendChild(peak);

  const reset = el('span', 'display:flex;align-items:center;gap:4px;opacity:0.6;white-space:nowrap;font-size:11px;');
  reset.id = 'ctb-reset';
  const resetIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;
  reset.innerHTML = `${resetIcon} <span>—</span>`;
  centerWrap.appendChild(reset);

  // Injected Pre-Send Tokenizer Badge (directly inside centerWrap)
  const draftBadge = el('span',
    'display:none;align-items:center;gap:3px;font-weight:700;font-size:10px;' +
    'padding:2px 6px;border-radius:6px;transition:all 0.2s ease;'
  );
  draftBadge.id = 'ctb-draft-badge';
  centerWrap.appendChild(draftBadge);

  line.appendChild(centerWrap);

  // Right — CHAT CONTEXT (with tooltip track id for token count)
  const ctxGroup = makeMetricGroup('Chat Context', 'ctb-c-pct', 'ctb-c-fill', 'ctb-c-track');
  const ctxPct = ctxGroup.querySelector('#ctb-c-pct');
  if (ctxPct) { ctxPct.textContent = 'N/A'; ctxPct.style.color = '#3a7bd5'; }
  line.appendChild(ctxGroup);

  // Copy button
  line.appendChild(makeCopyButton());

  return line;
}

// ── Anchor detection ───────────────────────────────────────────────

function getChatAreaAnchor() {
  const chatInput = document.querySelector('[data-testid="chat-input"]');
  if (!chatInput) return null;
  const container = chatInput.closest('.flex.flex-col.gap-3');
  if (!container) return null;
  return container.querySelector('.flex.w-full.items-center') || null;
}

function mountStatLine() {
  if (document.getElementById(STAT_LINE_ID)) return;
  const anchor = getChatAreaAnchor();
  if (!anchor) return;
  anchor.after(createStatLine());
  updateStatLine();
}

// ── Render ─────────────────────────────────────────────────────────

function tickCountdown() {
  const resetEl = document.getElementById('ctb-reset');
  const peakEl  = document.getElementById('ctb-peak');

  const resetIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;

  if (resetEl) {
    if (!barState.resetsAt) {
      resetEl.innerHTML = `${resetIcon} <span>—</span>`;
      resetEl.style.color = '';
      resetEl.style.opacity = '0.6';
    } else {
      const sec = Math.max(0, Math.floor(barState.resetsAt - Date.now() / 1000));

      if (sec === 0) {
        try {
          const entry = {
            date: Date.now(),
            maxUsage: barState.sessionPercent,
            peak: isPeakHours(),
          };
          chrome.storage.local.get('sessionHistory', (d) => {
            const history = d.sessionHistory || [];
            history.unshift(entry);
            chrome.storage.local.set({ sessionHistory: history.slice(0, 10) });
          });
        } catch { /* ok */ }

        barState.sessionPercent = 0;
        barState.resetsAt       = null;
        try { chrome.storage.local.remove('sessionUsage'); } catch { /* ok */ }
        resetEl.innerHTML = `${resetIcon} <span>—</span>`;
        resetEl.style.color    = '';
        resetEl.style.opacity  = '0.6';
        updateStatLine();
        return;
      }

      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      
      let timeText = '';
      if      (h > 0) timeText = `${h}h ${m}m`;
      else if (m > 0) timeText = `${m}m ${s}s`;
      else            timeText = `${s}s`;
      
      resetEl.innerHTML = `${resetIcon} <span>${timeText}</span>`;

      if (sec < 1800) {
        resetEl.style.color   = '#ef4444';
        resetEl.style.opacity = '1';
      } else {
        resetEl.style.color   = '#3b82f6';
        resetEl.style.opacity = '0.8';
      }
    }
  }

  if (peakEl) {
    peakEl.style.display = isPeakHours() ? 'inline' : 'none';
  }
}

function updateStatLine() {
  // Session
  const sFill = document.getElementById('ctb-s-fill');
  const sPctEl = document.getElementById('ctb-s-pct');
  if (sFill && sPctEl) {
    const sPct = Math.min(100, Math.max(0, barState.sessionPercent));
    const sColor = sPct >= 80 ? '#d93838' : '#3a7bd5';
    sFill.style.width = sPct + '%';
    sFill.style.background = sColor;
    sPctEl.textContent = sPct + '%';
    sPctEl.style.color = sColor;
  }

  // Chat Context — token-based color thresholds (research-backed)
  const cFill = document.getElementById('ctb-c-fill');
  const cPctEl = document.getElementById('ctb-c-pct');
  const cTrack = document.getElementById('ctb-c-track');
  if (cFill && cPctEl) {
    if (barState.contextPercent != null) {
      const cPct = Math.min(100, Math.max(0, barState.contextPercent));
      const tokens = barState.contextTokens;
      const cColor = contextColorByTokens(tokens);
      cFill.style.width = cPct + '%';
      cFill.style.background = cColor;
      cPctEl.style.color = cColor;

      // Display as "12k / 200k" format
      const tokStr = (tokens == null)
        ? cPct + '%'
        : (tokens >= 1000 ? Math.round(tokens / 1000) + 'k' : String(tokens));
      cPctEl.textContent = tokStr + ' / 200k';

      // Health tooltip on context track
      if (cTrack) {
        cTrack.title = contextHealthTip(tokens) || '';
      }
      // Check for toast notifications
      checkContextToast(tokens);
    } else {
      cFill.style.width = '0%';
      cPctEl.textContent = 'N/A';
      cPctEl.style.color = '#3b82f6';
      if (cTrack) cTrack.title = '';
    }
  }

  tickCountdown();
}

function startCountdown() {
  if (countdownTimer) return;
  countdownTimer = setInterval(tickCountdown, 1000);
}

// ── Storage restore on load ────────────────────────────────────────

function loadFromStorage() {
  console.log('[Claude Tracker] loadFromStorage running...');
  chrome.storage.local.get(['sessionUsage', 'savedOrgId'], (data) => {
    console.log('[Claude Tracker] Loaded session data:', data.sessionUsage);
    if (data.sessionUsage?.utilization != null) {
      const resetsAt = data.sessionUsage.resets_at ?? null;
      const nowSec   = Date.now() / 1000;

      // ── Agar reset time already past ho gayi → session expire ──
      if (resetsAt && resetsAt <= nowSec) {
        barState.sessionPercent = 0;
        barState.resetsAt       = null;
        try { chrome.storage.local.remove('sessionUsage'); } catch { /* ok */ }
      } else {
        barState.sessionPercent = Math.round(data.sessionUsage.utilization * 100);
        barState.resetsAt       = resetsAt;
      }
    }
    if (data.savedOrgId && !window.__ctb_orgId) {
      window.__ctb_orgId = data.savedOrgId;
    }
    const convMatch = window.location.pathname.match(/\/chat\/([^/]+)/);
    if (!convMatch) {
      barState.contextPercent = null;
      barState.contextTokens  = null;
      updateStatLine();
      return;
    }
    const convId = convMatch[1];
    chrome.storage.local.get(ctxKey(convId), (ctx) => {
      const entry = ctx[ctxKey(convId)];
      if (entry) {
        barState.contextPercent = entry.percent;
        barState.contextTokens  = entry.tokens ?? null;
      } else {
        barState.contextPercent = null;
        barState.contextTokens  = null;
      }
      updateStatLine();
    });
  });
}

// ── Event listeners: MAIN world → ISOLATED world ──────────────────

document.addEventListener('claude-usage-data', (event) => {
  try {
    const { utilization, resets_at } = event.detail || {};
    if (utilization == null) return;
    barState.sessionPercent = Math.round(utilization * 100);
    barState.resetsAt = resets_at ?? null;
    updateStatLine();
    chrome.storage.local.set({
      sessionUsage: { utilization, resets_at, last_updated: Date.now() },
    });
  } catch (err) {
    if (String(err?.message).includes('Extension context invalidated')) cleanupAll();
    else throw err;
  }
});

// ── Per-chat context storage helpers ─────────────────────────────

function ctxKey(convId) { return 'ctx_' + convId; }

function cleanOldContextEntries() {
  chrome.storage.local.get(null, (all) => {
    const cutoff = Date.now() - (3 * 24 * 60 * 60 * 1000); // 3 days
    const toDelete = Object.keys(all).filter(k => {
      if (!k.startsWith('ctx_')) return false;
      return !all[k].timestamp || all[k].timestamp < cutoff;
    });
    if (toDelete.length) chrome.storage.local.remove(toDelete);
  });
}

document.addEventListener('claude-context-data', (event) => {
  try {
    const { contextPercent, contextTokens } = event.detail || {};
    if (contextPercent == null) return;
    barState.contextPercent = contextPercent;
    barState.contextTokens = contextTokens ?? null;
    updateStatLine();
    const convMatch = window.location.pathname.match(/\/chat\/([^/]+)/);
    if (!convMatch) return;
    const convId = convMatch[1];
    chrome.storage.local.set({
      [ctxKey(convId)]: { percent: contextPercent, tokens: contextTokens ?? null, timestamp: Date.now() }
    });
    cleanOldContextEntries();
  } catch (err) {
    if (String(err?.message).includes('Extension context invalidated')) cleanupAll();
    else throw err;
  }
});

document.addEventListener('claude-org-id', (event) => {
  try {
    const { orgId } = event.detail || {};
    if (!orgId) return;
    const statLine = document.getElementById(STAT_LINE_ID);
    if (statLine) statLine.dataset.orgId = orgId;
    window.__ctb_orgId = orgId;
    chrome.storage.local.set({ savedOrgId: orgId });
  } catch { /* ok */ }
});

// ═══════════════════════════════════════════════════════════════════
//  EXISTING: DOM-based input tracking
// ═══════════════════════════════════════════════════════════════════

let inputObserver = null;
let watchedInput = null;

function findInput() {
  return document.querySelector('div[data-testid="chat-input"]');
}

// Detects if there are active file or paste attachment bubbles in Claude's input container
function hasAttachments(input) {
  const container = input.closest('.flex.flex-col') || input.parentElement;
  if (!container) return false;

  const text = container.textContent || "";
  // Check for common paste/file attachment text markers
  if (text.includes("PASTED") || text.includes("PDF") || text.includes("TXT") || text.includes("document") || text.includes("csv") || text.includes("xlsx")) {
    return true;
  }

  // Double check divs inside the container that aren't the editor or the bottom buttons bar
  const divs = container.querySelectorAll('div');
  for (const d of divs) {
    if (d === input) continue;
    if (d.textContent?.includes('PASTED') || d.querySelector('img') || d.querySelector('svg')) {
      // Avoid matches inside the bottom toolbar
      if (!d.closest('.flex.w-full.items-center')) {
        return true;
      }
    }
  }
  return false;
}

function handlePaste(e) {
  try {
    const text = e.clipboardData.getData('text');
    if (text) {
      pastedTextLength = text.length;
      // Trigger instant save and update
      const input = e.target;
      setTimeout(() => saveCharCount(input), 50);
    }
  } catch (err) {
    console.error('[Claude Tracker] Clipboard paste error:', err);
  }
}

function saveCharCount(input) {
  try {
    const parts = [];
    for (const p of input.querySelectorAll('p')) {
      if (p.children.length === 1 && p.children[0].tagName === 'BR') continue;
      const text = p.innerText;
      if (!text.trim()) continue;
      parts.push(text);
    }
    const typedLen = parts.length === 0 ? 0 : parts.join('').length;
    
    // If the input editor is completely empty AND there are no active attachment chips,
    // we reset the pasted length count to 0.
    if (typedLen === 0 && !hasAttachments(input)) {
      pastedTextLength = 0;
    }

    const totalLen = typedLen + pastedTextLength;
    chrome.storage.local.set({ charCount: totalLen });
    
    // Trigger real-time input estimation updates
    updateDraftTokenIndicator(totalLen);
  } catch (err) {
    if (String(err?.message).includes('Extension context invalidated')) cleanupAll();
    else throw err;
  }
}

function bindToInput(input) {
  if (watchedInput === input) return;
  if (inputObserver) { inputObserver.disconnect(); inputObserver = null; }
  
  watchedInput = input;
  
  // Listen to paste events directly on the input box
  input.removeEventListener('paste', handlePaste);
  input.addEventListener('paste', handlePaste);
  
  // Observe the parent container instead of just the input box!
  // This lets us detect when Claude creates attachment chips or when they are deleted.
  const parentContainer = input.closest('.flex.flex-col') || input;
  inputObserver = new MutationObserver(() => saveCharCount(input));
  inputObserver.observe(parentContainer, { subtree: true, childList: true, characterData: true });
  
  saveCharCount(input);
}

function tryBind() {
  const input = findInput();
  if (input) {
    bindToInput(input);
  } else {
    watchedInput = null;
    if (inputObserver) { inputObserver.disconnect(); inputObserver = null; }
  }
}

tryBind();
const bodyObserver = new MutationObserver(tryBind);
bodyObserver.observe(document.body, { childList: true, subtree: true });

function scanSession() {
  try {
    const userMessages = document.querySelectorAll('div[data-testid="user-message"]');
    let userTotalChars = 0;
    userMessages.forEach((d) => { userTotalChars += d.innerText.length; });
    const claudeResponses = document.querySelectorAll('div.font-claude-message');
    let claudeTotalChars = 0;
    claudeResponses.forEach((d) => { claudeTotalChars += d.innerText.length; });
    chrome.storage.local.set({
      userMessageCount: userMessages.length,
      userTotalChars,
      claudeTotalChars,
      sessionTotalTokens: Math.round((userTotalChars + claudeTotalChars) / 4),
    });
  } catch (err) {
    if (String(err?.message).includes('Extension context invalidated')) cleanupAll();
    else throw err;
  }
}

const sessionObserver = new MutationObserver(scanSession);
sessionObserver.observe(document.body, { childList: true, subtree: true });
scanSession();

// ── Cleanup ────────────────────────────────────────────────────────

function cleanupAll() {
  if (inputObserver) { inputObserver.disconnect(); inputObserver = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  if (mountInterval) { clearInterval(mountInterval); mountInterval = null; }
  bodyObserver.disconnect();
  sessionObserver.disconnect();
}

// ── MutationObserver: stamp orgId on stat line ─────────────────────

const orgIdStamper = new MutationObserver(() => {
  const statLine = document.getElementById(STAT_LINE_ID);
  if (statLine && window.__ctb_orgId && !statLine.dataset.orgId) {
    statLine.dataset.orgId = window.__ctb_orgId;
  }
});
orgIdStamper.observe(document.body, { childList: true, subtree: true });

// ── Init ───────────────────────────────────────────────────────────

function handleNavChange() {
  console.log('[Claude Tracker] handleNavChange triggered! Path:', window.location.pathname);
  // Reset context for the new page
  barState.contextPercent = null;
  barState.contextTokens  = null;
  
  // Reset pasted text length
  pastedTextLength = 0;
  
  // Hide draft tokenizer badge on navigation change immediately
  const badge = document.getElementById('ctb-draft-badge');
  if (badge) badge.style.display = 'none';

  updateStatLine();

  // Reload session data from storage so it stays in sync across chat switches
  loadFromStorage();

  const convMatch = window.location.pathname.match(/\/chat\/([^/]+)/);
  if (!convMatch) {
    // Not on a chat page — tell injected.js to clear context
    document.dispatchEvent(new CustomEvent('claude-request-context-fetch'));
    return;
  }
  const convId = convMatch[1];
  // Immediately restore cached context while fresh fetch is in-flight
  chrome.storage.local.get(ctxKey(convId), (ctx) => {
    const entry = ctx[ctxKey(convId)];
    if (entry) {
      barState.contextPercent = entry.percent;
      barState.contextTokens  = entry.tokens ?? null;
      updateStatLine();
    }
  });
  // Tell injected.js to fetch fresh context for the new conversation NOW
  document.dispatchEvent(new CustomEvent('claude-request-context-fetch'));
}

let _lastPathname = window.location.pathname;

// Primary: MutationObserver catches DOM changes that accompany SPA nav
const _navObserver = new MutationObserver(() => {
  if (window.location.pathname === _lastPathname) return;
  _lastPathname = window.location.pathname;
  handleNavChange();
});
_navObserver.observe(document.body, { childList: true, subtree: true });

// Backup: setInterval URL poller — catches SPA nav even if MutationObserver misses
setInterval(() => {
  if (window.location.pathname === _lastPathname) return;
  _lastPathname = window.location.pathname;
  handleNavChange();
}, 500);

loadFromStorage();
startCountdown();
mountInterval = setInterval(() => {
  mountStatLine();
}, 600);

// ── Storage Watcher (Real-time sync across tabs/chats) ─────────────

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    // 1. Session Usage Sync
    if (changes.sessionUsage) {
      console.log('[Claude Tracker] onChanged fired! Session usage sync across tabs:', changes.sessionUsage.newValue);
      const newVal = changes.sessionUsage.newValue;
      if (newVal?.utilization != null) {
        const resetsAt = newVal.resets_at ?? null;
        const nowSec = Date.now() / 1000;
        
        if (resetsAt && resetsAt <= nowSec) {
          barState.sessionPercent = 0;
          barState.resetsAt = null;
        } else {
          barState.sessionPercent = Math.round(newVal.utilization * 100);
          barState.resetsAt = resetsAt;
        }
        updateStatLine();
      } else if (!newVal) {
        // Storage se remove ho gaya (e.g. countdown zero hone par)
        barState.sessionPercent = 0;
        barState.resetsAt = null;
        updateStatLine();
      }
    }
  }
});
