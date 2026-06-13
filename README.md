<div align="center">

# 🔍 LimitLens

**Real-time Claude.ai session limit & context window monitor**

[![Edge Add-on](https://img.shields.io/badge/Edge_Add--on-v2.1.0-0078d7?logo=microsoft-edge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/oblllhmmeeipboofibdlgmhadidffpmb)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285f4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla_JS-f7df1e?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)

[**Install from Microsoft Edge Store →**](https://microsoftedge.microsoft.com/addons/detail/oblllhmmeeipboofibdlgmhadidffpmb) &nbsp;·&nbsp; [Report a Bug](https://github.com/Dwarkesh-code/LimitLens/issues) &nbsp;·&nbsp; [Request a Feature](https://github.com/Dwarkesh-code/LimitLens/issues)

<!-- Replace with actual screenshot or demo GIF -->
![LimitLens Demo](YOUR_SCREENSHOT_OR_GIF_URL)

</div>

---

## Overview

LimitLens is a lightweight browser extension that injects directly into Claude.ai to give you real-time visibility into your session consumption and context window usage — without any page refreshes.

Power users hitting Claude's message limits mid-conversation know the frustration of being cut off unexpectedly. LimitLens solves that with a clean, non-intrusive progress bar that lives inside the Claude interface and updates with every message.

> **Know exactly where you stand before Claude cuts you off.**

---

## Features

| Feature | Description |
|---------|-------------|
| **Real-Time Session Tracking** | Live percentage display of your message limit consumption. Updates instantly on every response. |
| **Context Window Monitoring** | See how much of the context window your current chat is utilizing. |
| **Peak / Off-Peak Indicator** | Know at a glance whether Claude's servers are under high traffic — this directly affects your rate limits. |
| **Session History Logging** | Automatic session logs stored locally and viewable from the extension popup. |
| **Native UI Integration** | Progress bar injected seamlessly into the Claude interface — not a floating overlay. |

---

## Installation

### ✅ Microsoft Edge Store (Recommended)

Install directly from the Edge Add-ons Store — one click, no setup required.

**[→ Add to Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/oblllhmmeeipboofibdlgmhadidffpmb)**

> Store ID: `0RDCK9G8C2FR` &nbsp;·&nbsp; Version: `2.1.0`

---

### 🛠 Developer Mode (Chrome / Edge)

Run the latest source code locally:

1. Clone or [download this repository](https://github.com/Dwarkesh-code/LimitLens/archive/refs/heads/main.zip) and extract the folder.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable **Developer Mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the extracted folder.
5. Pin LimitLens to your browser toolbar.

---

## How It Works

LimitLens intercepts Claude.ai's internal network responses entirely within the browser. It watches for usage metadata included in Claude's existing API responses and parses it in real-time — no external servers, no polling a third-party API.

**Data flow:**

```
Claude.ai page
      │
  injector.js          ← bridge between extension context and page world
      │
  injected.js          ← runs in page world; intercepts fetch + SSE streams
      │
  content.js           ← receives parsed data; renders UI; writes to storage
      │
  popup_usage.js       ← reads chrome.storage.local; renders popup history
```

| Script | Execution Context | Role |
|--------|------------------|------|
| `injector.js` | Extension context | Dynamically injects `injected.js` into the page world; acts as a message bridge |
| `injected.js` | Page world | Hooks into `fetch` and parses Server-Sent Event (SSE) streams to extract usage data |
| `content.js` | Content script | Receives parsed data via `window.postMessage`; renders the progress bar; persists sessions |
| `popup_usage.js` | Extension popup | Reads persisted history from `chrome.storage.local`; renders the popup UI |

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Manifest V3** | Extension architecture — required for Chrome/Edge store compliance |
| **Vanilla JavaScript** | Core logic — zero external dependencies, minimal footprint |
| **Server-Sent Events (SSE)** | Intercepting Claude's streaming token responses |
| **REST API interception** | Fallback parsing for non-streaming responses |
| **`MutationObserver`** | Detecting Claude UI changes and new chat turns |
| **`chrome.storage.local`** | Cross-tab persistence of session history |

---

## Privacy

LimitLens is built with a local-only architecture:

- ✅ **No external servers.** Zero network requests are made by the extension itself.
- ✅ **No analytics or telemetry.** No tracking pixels, no usage reporting.
- ✅ **Conversation content is never read.** The extension only reads usage metadata from response headers.
- ✅ **All data stays in your browser.** Session history is stored in `chrome.storage.local` — on your device only.

---

## Contributing

Contributions are welcome. If you find a bug or want to suggest a feature, please [open an issue](https://github.com/Dwarkesh-code/LimitLens/issues).

For pull requests:

```bash
# Fork the repo, then:
git checkout -b feature/your-feature-name
git commit -m "feat: describe your change"
git push origin feature/your-feature-name
# Open a Pull Request
```

---

## Browser Support

| Browser | Status |
|---------|--------|
| Microsoft Edge | ✅ Available on Edge Add-ons Store |
| Google Chrome | ✅ Supported via Developer Mode |
| Firefox | 🔄 Manifest included (`manifest_firefox.json`) — store submission pending |
| Safari | 🔄 Build script included (`build_safari.sh`) — in progress |

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Author

Built by **Dwarkesh**

[![GitHub](https://img.shields.io/badge/GitHub-Dwarkesh--code-181717?logo=github&logoColor=white)](https://github.com/Dwarkesh-code)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-dwarkesh--code-0077b5?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/dwarkesh-code)
[![Discord](https://img.shields.io/badge/Discord-dwarkesh__code-5865f2?logo=discord&logoColor=white)](https://discord.com/users/dwarkesh_code)
