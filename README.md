<div align="center">
  <h1>🚀 Claude Usage Tracker</h1>
  <p><strong>A powerful, real-time browser extension to monitor your Claude.ai session limits and context window usage.</strong></p>

  [![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/Dwarkesh-code/Claude-Usage-Tracker)
  [![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Firefox-lightgrey.svg)](#)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-success.svg)](#)
</div>

<br />

Are you a power user constantly hitting Claude's message limits? **Claude Usage Tracker** is a lightweight, zero-overhead browser extension that injects directly into the Claude.ai interface to give you real-time insights into your session consumption, context window usage, and server traffic (Peak/Off-Peak). 

Never get caught off-guard by the dreaded *"You have reached your message limit"* warning again.

---

## ✨ Features

* 📊 **Real-Time Session Tracking:** Monitor your exact message limit consumption as a dynamic percentage. Updates instantly as you chat, without requiring page refreshes.
* 🧠 **Context Window Monitoring:** Keep an eye on how much of the context window your current chat is utilizing. Stop wasting prompts on overloaded contexts!
* 🚦 **Peak Hours Indicator:** Instantly know if Claude's servers are experiencing high traffic (Peak vs Off-Peak), which affects your message limits.
* 🕒 **Session History Logging:** Automatically logs your recent sessions and usage statistics right within the extension popup.
* 🎨 **Native UI Integration:** Injects a clean, non-intrusive progress bar UI seamlessly into the Claude chat interface.

---

## 📸 Screenshots

*(Add your extension screenshots here! Create an `assets` folder, upload images, and replace these placeholder links)*

| Popup Dashboard | In-App Tracker |
|:---:|:---:|
| <img src="https://via.placeholder.com/300x400.png?text=Popup+Screenshot" width="250" /> | <img src="https://via.placeholder.com/400x300.png?text=In-App+UI+Screenshot" width="350" /> |

---

## 🛠️ Installation Guide

Currently, this extension is available via manual installation (Developer Mode). 

### For Google Chrome / Microsoft Edge:
1. **Download the code:** Click the green `Code` button and select `Download ZIP`, or download the pre-compiled `chrome_edge_extension.zip` from the `dist` folder.
2. **Extract:** Unzip the downloaded file to a folder on your computer.
3. **Open Extensions:** In your browser, navigate to `chrome://extensions/` (for Chrome) or `edge://extensions/` (for Edge).
4. **Enable Developer Mode:** Toggle the **Developer mode** switch in the top right corner.
5. **Load Extension:** Click the **Load unpacked** button in the top left and select the folder you extracted in Step 2.
6. **Pin it:** Click the puzzle piece icon in your browser toolbar and pin the extension for easy access!

---

## 🏗️ Architecture & Tech Stack

Built with modern web standards to ensure zero performance degradation on Claude.ai.

* **Manifest V3:** Fully compliant with the latest browser extension security and performance standards.
* **Content Scripts & DOM Injection:** Securely bridges the gap between the isolated extension environment and the Claude web app using custom injector scripts.
* **Vanilla JavaScript:** No bloated frameworks. Pure ES6+ JS for maximum speed.
* **HTML5/CSS3:** Clean, modern, and responsive popup interface.

---

## 🔒 Privacy First

Your privacy is paramount. **Claude Usage Tracker is 100% local.** 
- No tracking pixels.
- No analytics.
- No remote servers.
- Your chat data never leaves your browser. 

The extension only reads network responses related to usage limits strictly within the browser context.

---

## 👨‍💻 About the Author

Built by **Dwarkesh** — a 16-year-old developer. This entire project was built using **"Vibe Coding"** (AI-assisted programming). I architected the logic, structure, and design completely through advanced prompt engineering without writing the code manually, showcasing the power of modern AI workflows!

* **GitHub:** [@Dwarkesh-code](https://github.com/Dwarkesh-code)

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Dwarkesh-code/Claude-Usage-Tracker/issues).

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
