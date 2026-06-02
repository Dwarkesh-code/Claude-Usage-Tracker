const STORAGE_KEYS = ['sessionUsage', 'chatContextPercent', 'chatContextTokens', 'sessionHistory'];

const SESSION_PEAK_PERCENT = 70;
const TIME_PEAK_THRESHOLD_SECONDS = 2 * 3600;
const UPDATE_INTERVAL_MS = 10 * 1000;

let cachedSessionUsage = null;
let cachedChatContextPercent = 0;
let cachedChatContextTokens = null;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Token-based context color (matches content.js thresholds)
function contextColorByTokens(tokens) {
  if (tokens == null) return '#3e90f2';
  if (tokens < 30000)  return '#22c55e'; // green
  if (tokens < 50000)  return '#eab308'; // yellow
  if (tokens < 70000)  return '#f97316'; // orange
  return '#ef4444';                      // red
}

function formatResetIn(secondsLeft) {
  if (secondsLeft == null || Number.isNaN(secondsLeft)) return '—';
  const s = Math.max(0, Math.floor(secondsLeft));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function isPeakHours() {
  const now = new Date();
  const h = now.getUTCHours();
  const d = now.getUTCDay();
  return d >= 1 && d <= 5 && h >= 13 && h < 19;
}

function computeTraffic(sessionPercent, secondsLeft) {
  const isPeakBySession = sessionPercent >= SESSION_PEAK_PERCENT;
  const isPeakByTime =
    secondsLeft != null && secondsLeft <= TIME_PEAK_THRESHOLD_SECONDS;
  return isPeakBySession || isPeakByTime || isPeakHours() ? 'PEAK' : 'OFF-PEAK';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(text);
}

function setProgress(fillId, percent) {
  const el = document.getElementById(fillId);
  if (el) el.style.width = `${clamp(percent, 0, 100)}%`;
}

function renderUI() {
  const utilization = cachedSessionUsage?.utilization;
  const resetsAt = cachedSessionUsage?.resets_at;

  const sessionPercent =
    utilization == null ? 0 : clamp(Math.round(utilization * 100), 0, 100);

  const secondsLeft =
    resetsAt == null ? null : resetsAt - Math.floor(Date.now() / 1000);

  const traffic = computeTraffic(sessionPercent, secondsLeft);

  setText('session-percent', `${sessionPercent}%`);

  // Traffic badge: toggle off-peak class
  const trafficEl = document.getElementById('traffic-indicator');
  if (trafficEl) {
    trafficEl.textContent = traffic;
    if (traffic === 'PEAK') {
      trafficEl.classList.remove('off-peak');
    } else {
      trafficEl.classList.add('off-peak');
    }
  }

  setText('reset-in', formatResetIn(secondsLeft));

  // Urgency: class-based for reset-in, color for inline style fallback
  const resetInEl = document.getElementById('reset-in');
  if (resetInEl) {
    if (secondsLeft != null && secondsLeft < 1800) {
      resetInEl.classList.add('urgent');
      resetInEl.style.color = '#ff4c4c';
    } else {
      resetInEl.classList.remove('urgent');
      resetInEl.style.color = '#3e90f2';
    }
  }

  // Context: "14k / 200k" token format + token-based color
  const tokens = cachedChatContextTokens;
  let contextDisplay;
  if (!tokens) {
    contextDisplay = '— / 200k';
  } else if (tokens >= 1000) {
    contextDisplay = Math.round(tokens / 1000) + 'k / 200k';
  } else {
    contextDisplay = tokens + ' / 200k';
  }
  setText('chat-context-percent', contextDisplay);

  // Color context value by token count
  const ctxValEl = document.getElementById('chat-context-percent');
  if (ctxValEl) {
    ctxValEl.style.color = contextColorByTokens(tokens);
  }

  const chatContextPercent = clamp(
    Number(cachedChatContextPercent) || 0,
    0,
    100
  );

  setProgress('session-progress-fill', sessionPercent);
  setProgress('chat-context-progress-fill', chatContextPercent);

  // Color context progress fill by token count
  const ctxFill = document.getElementById('chat-context-progress-fill');
  if (ctxFill) {
    ctxFill.style.background = contextColorByTokens(tokens);
  }
}

function loadInitial() {
  chrome.storage.local.get(STORAGE_KEYS, (data) => {
    cachedSessionUsage = data.sessionUsage ?? null;
    cachedChatContextPercent = Number(data.chatContextPercent) || 0;
    cachedChatContextTokens = data.chatContextTokens ?? null;
    renderUI();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadInitial();
  renderPeakHours();
  loadSessionHistory();
  initSettings();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.sessionUsage) {
      cachedSessionUsage = changes.sessionUsage.newValue ?? null;
    }
    if (changes.chatContextPercent) {
      cachedChatContextPercent = Number(changes.chatContextPercent.newValue) || 0;
    }
    if (changes.chatContextTokens) {
      cachedChatContextTokens = changes.chatContextTokens.newValue ?? null;
    }
    if (changes.sessionHistory) {
      renderSessionHistory(changes.sessionHistory.newValue || []);
    }

    renderUI();
  });

  setInterval(() => {
    renderUI();
  }, UPDATE_INTERVAL_MS);
});


// ── Peak Hours (local timezone) ──────────────────────────────────

function renderPeakHours() {
  const el = document.getElementById('peak-hours-info');
  if (!el) return;

  // Convert UTC peak hours to local timezone
  function utcToLocal(utcHour) {
    const d = new Date();
    d.setUTCHours(utcHour, 0, 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const startLocal = utcToLocal(13);
  const endLocal   = utcToLocal(19);
  const isPeak     = isPeakHours();

  el.innerHTML = `
    <span style="color:${isPeak ? '#ff4c4c' : '#555'}">
      ${isPeak ? '⚡ PEAK NOW' : '✔ OFF-PEAK'}
    </span>
    <span style="color:#444;margin-left:6px;">
      Peak: ${startLocal}–${endLocal} (weekdays)
    </span>
  `;
}

// ── Session History ─────────────────────────────────────────────

function loadSessionHistory() {
  chrome.storage.local.get(['sessionHistory'], (data) => {
    renderSessionHistory(data.sessionHistory || []);
  });
}

function renderSessionHistory(list) {
  const section = document.getElementById('history-section');
  const listEl  = document.getElementById('history-list');
  if (!section || !listEl) return;

  if (!list.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  listEl.innerHTML = '';

  list.slice(0, 5).forEach(entry => {
    const row = document.createElement('div');
    row.className = 'history-item';

    // Date
    const dateEl = document.createElement('span');
    dateEl.style.cssText = 'color:#a1a1aa;font-size:10px;min-width:80px;font-weight:500;';
    const d = new Date(entry.date);
    const isToday = new Date().toDateString() === d.toDateString();
    dateEl.textContent = isToday
      ? 'Today ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    // Mini bar
    const barWrap = document.createElement('div');
    barWrap.style.cssText = 'flex:1;height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.2);';
    const barFill = document.createElement('div');
    const pct = clamp(entry.maxUsage || 0, 0, 100);
    const barColor = pct >= 80 ? '#ef4444' : pct >= 50 ? '#eab308' : '#22c55e';
    barFill.style.cssText = `height:100%;width:${pct}%;background:${barColor};border-radius:2px;box-shadow:0 0 6px ${barColor}66;`;
    barWrap.appendChild(barFill);

    // Percent + peak badge
    const pctEl = document.createElement('span');
    pctEl.style.cssText = `color:${barColor};font-size:11px;font-weight:600;min-width:32px;text-align:right;text-shadow:0 0 8px ${barColor}44;`;
    pctEl.textContent = pct + '%';

    const peakEl = document.createElement('span');
    peakEl.style.cssText = 'font-size:10px;font-weight:700;min-width:35px;text-align:right;';
    peakEl.textContent = entry.peak ? '⚡' : '';
    peakEl.style.color = entry.peak ? '#ef4444' : 'transparent';

    row.appendChild(dateEl);
    row.appendChild(barWrap);
    row.appendChild(pctEl);
    row.appendChild(peakEl);
    listEl.appendChild(row);
  });
}

// ── Settings panel ─────────────────────────────────────────────────

function initSettings() {
  const btnSettings = document.getElementById('btn-settings');
  const btnBack     = document.getElementById('btn-back');
  const mainView    = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');

  btnSettings && btnSettings.addEventListener('click', () => {
    mainView.style.display    = 'none';
    settingsView.style.display = 'block';
  });

  btnBack && btnBack.addEventListener('click', () => {
    settingsView.style.display = 'none';
    mainView.style.display     = 'block';
  });

  // Clear session history
  const btnClearHistory = document.getElementById('s-clear-history');
  btnClearHistory && btnClearHistory.addEventListener('click', () => {
    if (!confirm('Clear all session history?')) return;
    chrome.storage.local.set({ sessionHistory: [] }, () => {
      renderSessionHistory([]);
    });
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
