# YouTube Music Crossfade Google Chrome Extension (Still in Development)

A modern Chrome extension for seamless, professional crossfading between two YouTube Music tabs. Enjoy DJ-style transitions, smart timing, and a beautiful dark-themed UI.

---

## 🚀 Overview

**YouTube Music Crossfade** brings DJ-quality crossfading to your browser. It automatically manages two YouTube Music tabs, smoothly fading out the end of one song while fading in the next—just like a pro DJ. The extension features a modern, dark-themed popup UI with intuitive controls for fade durations and real-time status.

---

## ✨ Features

- **Automatic Crossfading**: Seamlessly transitions between two YouTube Music tabs
- **Modern Dark UI**: Beautiful, accessible popup with rounded corners and smooth controls
- **Fade In/Out Control**: Independently set fade out and fade in durations (5–30 seconds)
- **Smart Song Detection**: Robust DOM selectors ensure accurate playback and song info
- **Persistent Settings**: Your preferences are saved between sessions
- **Error Handling**: Graceful handling of tab changes, navigation, and YouTube Music updates

---

## 🛠️ How It Works

1. **Tab Management**: The extension detects and manages exactly two YouTube Music tabs.
2. **Playback Monitoring**: It monitors the current song's progress in the active tab.
3. **Crossfade Trigger**: When the song nears its end (based on your settings), the extension:
   - Starts the next tab at 0% volume
   - Fades out the current tab while fading in the next
   - Pauses and advances the old tab after the crossfade
4. **Role Reversal**: The process repeats, always keeping your music flowing.

All controls and logic are handled via robust content scripts and a background service worker, ensuring reliability even as YouTube Music's interface evolves.

---

## 🧑‍💻 Tech Stack

- **Manifest V3 Chrome Extension**
- **JavaScript (ES2022+)**
- **Modern CSS (Dark Theme, Flexbox, Custom Sliders)**
- **Robust DOM selectors for YouTube Music (June 2025)**

---

## ⚡ Setup & Installation

1. **Clone or Download** this repository:
   ```sh
   git clone https://github.com/xenoveni/ytmusic-crossfade.git
   cd ytmusic-crossfade
   ```
2. **Open Chrome** and go to `chrome://extensions/`
3. **Enable Developer Mode** (top right)
4. **Click "Load unpacked"** and select the extension directory

---

## 🎛️ Usage

1. **Open two YouTube Music tabs** (each with a playlist or song)
2. **Click the extension icon** in your Chrome toolbar
3. **Configure your settings**:
   - **Fade Out Duration**: How long to fade out the current song (5–30s)
   - **Fade In Duration**: How long to fade in the next song (5–30s)
   - **Enable Crossfade**: Toggle automatic crossfading on/off
4. **Enjoy seamless, DJ-style transitions!**

---

## ⚙️ Configuration & Options

- **Fade Out Duration**: Controls how quickly the current song fades out
- **Fade In Duration**: Controls how quickly the next song fades in
- **Settings are saved** and restored automatically

---

## 🩺 Troubleshooting

- **Not working?**
  - Make sure you have exactly two YouTube Music tabs open
  - Refresh both tabs after installing or updating the extension
  - Ensure both tabs are playing music (not paused)
  - If you see errors, check the Chrome extension console for logs
- **Song info or controls missing?**
  - YouTube Music updates its UI frequently; this extension uses robust selectors, but if something breaks, update to the latest version or report an issue

---

## 🤝 Contributing

Pull requests and issues are welcome! Please:
- Use clear commit messages
- Test your changes on the latest YouTube Music UI
- Describe any UI/UX or selector changes in your PR

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details. 
