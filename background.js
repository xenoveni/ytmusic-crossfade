// State management
let activeTab1 = null;
let activeTab2 = null;
let crossfadeActive = false;
let currentLeader = 1;
let settings = {
    fadeDuration: 15, // seconds
    triggerTime: 15, // seconds before end
    isEnabled: false
};

// --- State tracking for log-on-change ---
let lastActiveTabs = [];
let lastPlaybackInfo = {};
let lastCrossfadeStep = {};

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

function logIfChanged(label, value, lastValueRef) {
  const valueStr = JSON.stringify(value);
  if (lastValueRef.current !== valueStr) {
    console.log(label, value);
    lastValueRef.current = valueStr;
  }
}

// Load settings from storage
chrome.storage.sync.get(['fadeDuration', 'triggerTime', 'isEnabled'], (result) => {
    settings = { ...settings, ...result };
    console.log('Loaded settings:', settings);
});

// Save settings to storage
function saveSettings() {
    chrome.storage.sync.set(settings);
    console.log('Saved settings:', settings);
}

// Find valid YouTube Music tabs (not discarded, correct URL)
async function findYouTubeMusicTabs() {
    const tabs = await chrome.tabs.query({});
    // Only keep valid YouTube Music tabs
    const validTabs = tabs.filter(tab => tab.url && tab.url.startsWith('https://music.youtube.com/') && !tab.discarded && tab.status === 'complete');
    // Only log all open tabs and detected tabs if they change
    if (!arraysEqual(validTabs.map(tab => tab.id), lastActiveTabs)) {
      console.log('Detected valid YouTube Music tabs:', validTabs.map(tab => ({id: tab.id, url: tab.url, status: tab.status, discarded: tab.discarded})));
      lastActiveTabs = validTabs.map(tab => tab.id);
    }
    return validTabs;
}

// Initialize tabs with detailed logging
async function initializeTabs() {
    const tabs = await findYouTubeMusicTabs();
    if (tabs.length >= 2) {
        const newActiveTabs = [tabs[0].id, tabs[1].id];
        if (!arraysEqual(newActiveTabs, [activeTab1, activeTab2])) {
          console.log('Active tabs set:', newActiveTabs[0], newActiveTabs[1]);
        }
        activeTab1 = newActiveTabs[0];
        activeTab2 = newActiveTabs[1];
        return true;
    }
    activeTab1 = null;
    activeTab2 = null;
    console.warn('Not enough valid YouTube Music tabs found. Tabs:', tabs);
    return false;
}

// Check if a tab is valid and ready
async function isTabValid(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        return tab && !tab.discarded && tab.status === 'complete' && tab.url && tab.url.startsWith('https://music.youtube.com/');
    } catch (e) {
        return false;
    }
}

// Helper to ensure content script is injected
async function ensureContentScript(tabId, url) {
  try {
    if (url && url.startsWith('https://music.youtube.com/')) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      console.log('Ensured content script in tab', tabId);
    }
  } catch (e) {
    console.warn('Could not ensure content script in tab', tabId, e);
  }
}

// Robust sendMessageToTab: always check and inject if needed
async function sendMessageToTab(tabId, message) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (
      tab &&
      tab.url &&
      tab.url.startsWith('https://music.youtube.com/') &&
      !tab.discarded &&
      tab.status === 'complete'
    ) {
      await ensureContentScript(tabId, tab.url);
      // Only log sending message if message/action changes
      // (optional: can keep this always visible for debugging)
      // console.log('Sending message to tab', tabId, message);
      const response = await chrome.tabs.sendMessage(tabId, message);
      // Only log response if it changes
      if (message.action === 'getPlaybackInfo') {
        const last = lastPlaybackInfo[tabId] || null;
        if (JSON.stringify(response) !== JSON.stringify(last)) {
          console.log('Playback info for tab', tabId, response);
          lastPlaybackInfo[tabId] = response;
        }
      }
      return response;
    } else {
      await initializeTabs();
      return null;
    }
  } catch (error) {
    console.error(`Error sending message to tab ${tabId}:`, error);
    await initializeTabs();
    return null;
  }
}

// Execute crossfade between tabs
async function executeCrossfade(fromTab, toTab, duration) {
    crossfadeActive = true;
    const startTime = Date.now();
    console.log('Starting crossfade from', fromTab, 'to', toTab, 'duration', duration);
    await sendMessageToTab(toTab, { action: 'setVolume', volume: 0 });
    await sendMessageToTab(toTab, { action: 'play' });
    const crossfadeInterval = setInterval(async () => {
        const currentTime = Date.now();
        const progress = Math.min(1, (currentTime - startTime) / (duration * 1000));
        if (progress >= 1) {
            clearInterval(crossfadeInterval);
            await sendMessageToTab(fromTab, { action: 'setVolume', volume: 0 });
            await sendMessageToTab(toTab, { action: 'setVolume', volume: 100 });

            // Get original song title from fromTab
            const originalInfoFromTab = await sendMessageToTab(fromTab, { action: 'getPlaybackInfo' });
            const originalSongTitle = originalInfoFromTab ? originalInfoFromTab.songTitle : null;

            console.log(`Crossfade: Advancing fromTab ${fromTab}. Original song: "${originalSongTitle}"`);
            await sendMessageToTab(fromTab, { action: 'next' });

            let songChanged = false;
            const maxAttempts = 20; // 20 attempts * 500ms = 10 seconds timeout
            let attempts = 0;

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Polling interval
                const currentInfoFromTab = await sendMessageToTab(fromTab, { action: 'getPlaybackInfo' });
                attempts++;

                if (currentInfoFromTab && currentInfoFromTab.songTitle && originalSongTitle !== null && currentInfoFromTab.songTitle !== originalSongTitle) {
                    console.log(`Crossfade: Song in fromTab ${fromTab} changed to "${currentInfoFromTab.songTitle}". Pausing.`);
                    songChanged = true;
                    break;
                } else if (currentInfoFromTab && originalSongTitle === null && currentInfoFromTab.songTitle !== null) {
                    // Case where original song title was null (e.g., tab just loaded, nothing playing)
                    // and now something is playing (even if it's the "first" song after 'next')
                    console.log(`Crossfade: Song in fromTab ${fromTab} appeared as "${currentInfoFromTab.songTitle}" (original was null). Pausing.`);
                    songChanged = true;
                    break;
                } else if (currentInfoFromTab) {
                    console.log(`Crossfade: Polling fromTab ${fromTab} (Attempt ${attempts}/${maxAttempts}): Song title still "${currentInfoFromTab.songTitle}" (Original: "${originalSongTitle}")`);
                } else {
                    console.log(`Crossfade: Polling fromTab ${fromTab} (Attempt ${attempts}/${maxAttempts}): Could not get info.`);
                    // If info is null repeatedly, it might be an issue, but we continue polling for now
                }
            }

            if (songChanged) {
                await sendMessageToTab(fromTab, { action: 'pause' });
                console.log(`Crossfade complete. Tab ${fromTab} advanced and paused. Tab ${toTab} is now leader.`);
            } else {
                console.warn(`Crossfade complete, but song in fromTab ${fromTab} did not change title after ${attempts} attempts (Original: "${originalSongTitle}"). Forcing pause.`);
                await sendMessageToTab(fromTab, { action: 'pause' }); // Fallback: pause anyway
            }

            crossfadeActive = false;
            // currentLeader will be updated by monitorPlayback based on actual play state
            return;
        }
        const fromVolume = Math.round(100 * (1 - progress));
        const toVolume = Math.round(100 * progress);
        if (!crossfadeActive) { // Check if another crossfade has started or was stopped
            clearInterval(crossfadeInterval);
            return;
        }
        await sendMessageToTab(fromTab, { action: 'setVolume', volume: fromVolume });
        await sendMessageToTab(toTab, { action: 'setVolume', volume: toVolume });
    }, 50);
}

// Monitor playback and trigger crossfades
async function monitorPlayback() {
    if (!settings.isEnabled || crossfadeActive) return; // Don't monitor if disabled or crossfade is in progress
    if (!activeTab1 || !activeTab2) {
        await initializeTabs();
        return;
    }
    const valid1 = await isTabValid(activeTab1);
    const valid2 = await isTabValid(activeTab2);
    if (!valid1 || !valid2) {
        console.warn('One or both active tabs are invalid. Reinitializing tabs.');
        await initializeTabs();
        return;
    }
    let info1 = await sendMessageToTab(activeTab1, { action: 'getPlaybackInfo' });
    let info2 = await sendMessageToTab(activeTab2, { action: 'getPlaybackInfo' });
    if (!info1 || !info2) return;

    // If both are playing, pause the one that *was* the current leader
    // (This handles the state right after a crossfade or manual double play)
    if (info1.isPlaying && info2.isPlaying) {
        console.log('Both tabs playing. Current (previous) leader was', currentLeader, '. Attempting to pause this previous leader.');
        if (currentLeader === 1) { // Tab 1 was the leader that should have faded out
            console.log('Pausing tab 1 as it was the previous leader.');
            await sendMessageToTab(activeTab1, { action: 'pause' });
            info1 = await sendMessageToTab(activeTab1, { action: 'getPlaybackInfo' }); // Re-fetch info
        } else { // Tab 2 was the leader that should have faded out (currentLeader === 2)
            console.log('Pausing tab 2 as it was the previous leader.');
            await sendMessageToTab(activeTab2, { action: 'pause' });
            info2 = await sendMessageToTab(activeTab2, { action: 'getPlaybackInfo' }); // Re-fetch info
        }
        if (!info1 || !info2) return; // Check again after attempting pause
    }

    let playingTab = null, pausedTab = null, playingInfo = null, pausedInfo = null;

    if (info1.isPlaying && !info2.isPlaying) {
        playingTab = activeTab1;
        pausedTab = activeTab2;
        playingInfo = info1;
        pausedInfo = info2;
        currentLeader = 1; // Update leader
    } else if (info2.isPlaying && !info1.isPlaying) {
        playingTab = activeTab2;
        pausedTab = activeTab1;
        playingInfo = info2;
        pausedInfo = info1;
        currentLeader = 2; // Update leader
    } else {
        console.log('No single playing tab detected after attempting to resolve dual play. info1:', info1, 'info2:', info2);
        return; // Neither or both still playing (or both paused)
    }

    const timeUntilEnd = playingInfo.duration - playingInfo.currentTime;
    if (timeUntilEnd <= settings.triggerTime && timeUntilEnd > 0 && !pausedInfo.isPlaying) {
        console.log('Triggering crossfade from', playingTab, 'to', pausedTab, 'at', timeUntilEnd, 'seconds left');
        await executeCrossfade(playingTab, pausedTab, settings.fadeDuration);
    } else {
        if (timeUntilEnd <= settings.triggerTime && timeUntilEnd > 0 && pausedInfo.isPlaying) {
             console.log('Crossfade skipped: other tab is already playing (this shouldn\'t happen with new logic).');
        }
    }
}

// Start monitoring
setInterval(monitorPlayback, 1000);

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    switch (request.action) {
        case 'getStatus':
            sendResponse({
                activeTab1,
                activeTab2,
                crossfadeActive,
                currentLeader,
                settings
            });
            break;
        case 'updateSettings':
            settings = { ...settings, ...request.settings };
            saveSettings();
            sendResponse({ success: true });
            break;
        case 'startCrossfade':
            settings.isEnabled = true;
            saveSettings();
            sendResponse({ success: true });
            break;
        case 'stopCrossfade':
            settings.isEnabled = false;
            saveSettings();
            sendResponse({ success: true });
            break;
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
    // Only return true if you plan to use sendResponse asynchronously
    // All responses above are synchronous, so do not return true
});

// Listen to tab replacement
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  await initializeTabs();
});

// Listen to tab updates and always ensure content script is injected
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.url && tab.url.startsWith('https://music.youtube.com/')) {
    await ensureContentScript(tabId, tab.url);
    await initializeTabs();
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (tabId === activeTab1 || tabId === activeTab2) {
        await initializeTabs();
    }
});

// Inject content script into all open YouTube Music tabs on install/update
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (
      tab.url &&
      tab.url.startsWith('https://music.youtube.com/') &&
      !tab.discarded &&
      tab.status === 'complete'
    ) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        console.log('Injected content script into tab', tab.id);
      } catch (e) {
        console.warn('Could not inject into tab', tab.id, e);
      }
    }
  }
}); 