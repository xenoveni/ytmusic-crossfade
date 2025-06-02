# Changelog - YouTube Music Crossfade Extension

## Latest Updates (June 2025)

### UI/UX
- Redesigned popup with a modern dark theme and rounded corners for a professional look.
- Updated controls: 'Fade Duration' and 'Trigger Time' replaced with 'Fade Out Duration' and 'Fade In Duration'.
- Improved slider styling and accessibility for dark mode.

### Functionality
- Robust selector updates for all YouTube Music player elements (play/pause, volume, time, progress bar, song title) to match the June 2025 DOM.
- Song title extraction now uses the correct selector for the currently playing track, ensuring accurate display and crossfade logic.
- Added fallback and logging for progress bar detection.
- Improved content script initialization and error handling for SPA navigation and dynamic DOM changes.

### Settings & State
- Settings and popup logic updated to use new fade in/out duration options.
- Backward compatibility for users with old settings.

### General
- Improved logging and debugging output for easier troubleshooting.
- All code and UI changes tested and verified on the latest YouTube Music interface.

## Errors Encountered & Fixes Applied

### 1. Content Script Not Injected in Existing Tabs
- **Error:** Extension did not work unless YouTube Music tabs were refreshed after install/update.
- **Fix:** Added programmatic injection of content script using `chrome.scripting.executeScript` on install/update and on tab updates.

### 2. Content Script Injected Multiple Times
- **Error:** `Uncaught SyntaxError: Identifier 'YouTubeMusicController' has already been declared`.
- **Fix:** Added a guard (`window.__ytmusic_crossfade_injected`) and wrapped the script in an IIFE to prevent double injection.

### 3. Illegal Return Statement
- **Error:** `Uncaught SyntaxError: Illegal return statement` due to top-level `return;` in content script.
- **Fix:** Moved guard and logic inside an IIFE so `return;` is valid.

### 4. Content Script Not Responding to Messages
- **Error:** Background script received `null` for playback info; crossfade never triggered.
- **Fix:** Added MutationObserver in content script to robustly initialize controller after SPA navigation.

### 5. Unchecked runtime.lastError: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received
- **Error:** Content script returned `true` from message listener but did not always call `sendResponse`.
- **Fix:** Ensured message listener never returns `true` and always calls `sendResponse` synchronously.

### 6. Repeated/Spammy Logs
- **Error:** Console was spammed with repeated logs for tab detection and assignment.
- **Fix:** (Planned) Add throttling or state-change-only logging to reduce log spam.

### 7. Playback Info Still Null / No Crossfade
- **Error:** Even with valid tabs, playback info was `null` and crossfade did not trigger.
- **Fix:** (Planned) Ensure content script is always initialized and ready, and that messaging is robust.

### 8. Content Script Not Initializing Controller in SPA/All Frames
- **Error:** Content script loaded but controller not initialized; no message listener, no crossfade.
- **Fix:**
  - Added frame and URL logging at the top of content.js to debug which frames the script is running in.
  - Improved waitForElements to log all selector results on every attempt.
  - Added a fallback controller initialization after 3 seconds to ensure the controller is always set up.
  - Updated manifest.json to use `"all_frames": true` and `"run_at": "document_idle"` for robust SPA support.

---

**Before applying any new fix, review this changelog to avoid repeating mistakes or reintroducing old bugs.** 