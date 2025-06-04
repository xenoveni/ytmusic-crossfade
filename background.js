// State management
let activeTab1 = null;
let activeTab2 = null;
let crossfadeActive = false;
let currentLeader = 1;
let settings = {
    fadeOutDuration: 15, // seconds
    fadeInDuration: 15, // seconds
    isEnabled: false
};

// Load settings from storage
chrome.storage.sync.get(['fadeOutDuration', 'fadeInDuration', 'isEnabled'], (result) => {
    settings = { ...settings, ...result };
});

// Save settings to storage
function saveSettings() {
    chrome.storage.sync.set(settings);
}

// Find valid YouTube Music tabs (not discarded, correct URL)
async function findYouTubeMusicTabs() {
    const tabs = await chrome.tabs.query({});
    // Only keep valid YouTube Music tabs
    return tabs.filter(tab => tab.url && tab.url.startsWith('https://music.youtube.com/') && !tab.discarded && tab.status === 'complete');
}

// Initialize tabs with detailed logging
async function initializeTabs() {
    const tabs = await findYouTubeMusicTabs();
    if (tabs.length >= 2) {
        activeTab1 = tabs[0].id;
        activeTab2 = tabs[1].id;
        return true;
    }
    activeTab1 = null;
    activeTab2 = null;
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
    }
  } catch (e) {
    // Silent fail - tab might not be accessible
  }
}

// Robust sendMessageToTab with retry mechanism
async function sendMessageToTab(tabId, message, retries = 2) {
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
      
      try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
      } catch (error) {
        // If we have retries left, wait a bit and try again
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
          return sendMessageToTab(tabId, message, retries - 1);
        }
        throw error;
      }
    } else {
      await initializeTabs();
      return null;
    }
  } catch (error) {
    // Don't log errors to avoid cluttering the console
    await initializeTabs();
    return null;
  }
}

// Track the last song title for each tab to detect changes
let lastSongTitles = {};

// Execute crossfade between tabs
async function executeCrossfade(fromTab, toTab, duration) {
    crossfadeActive = true;
    const startTime = Date.now();
    
    // Store the current song title before starting crossfade
    const fromTabInfo = await sendMessageToTab(fromTab, { action: 'getPlaybackInfo' });
    if (fromTabInfo && fromTabInfo.songTitle) {
        lastSongTitles[fromTab] = fromTabInfo.songTitle;
    }
    
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
            const originalSongTitle = lastSongTitles[fromTab] || null;
            
            // Set up a monitoring interval to detect when the song changes automatically
            let songChangeDetectionInterval;
            let detectionAttempts = 0;
            const maxDetectionAttempts = 30; // 15 seconds max (500ms * 30)
            
            songChangeDetectionInterval = setInterval(async () => {
                try {
                    detectionAttempts++;
                    const currentInfoFromTab = await sendMessageToTab(fromTab, { action: 'getPlaybackInfo' });
                    
                    // Check if song has changed
                    if (currentInfoFromTab && currentInfoFromTab.songTitle && 
                        originalSongTitle !== null && 
                        currentInfoFromTab.songTitle !== originalSongTitle) {
                        
                        clearInterval(songChangeDetectionInterval);
                        
                        // Pause the tab now that the song has changed automatically
                        await sendMessageToTab(fromTab, { action: 'pause' });
                        lastSongTitles[fromTab] = currentInfoFromTab.songTitle;
                        
                        // Double-check that pause worked
                        setTimeout(async () => {
                            const verifyInfo = await sendMessageToTab(fromTab, { action: 'getPlaybackInfo' });
                            if (verifyInfo && verifyInfo.isPlaying) {
                                await sendMessageToTab(fromTab, { action: 'pause' });
                            }
                        }, 1000);
                    } 
                    // If both tabs are playing, force pause the fromTab
                    else if (currentInfoFromTab && currentInfoFromTab.isPlaying) {
                        const toTabInfo = await sendMessageToTab(toTab, { action: 'getPlaybackInfo' });
                        if (toTabInfo && toTabInfo.isPlaying) {
                            await sendMessageToTab(fromTab, { action: 'pause' });
                            clearInterval(songChangeDetectionInterval);
                        }
                    }
                    
                    // Give up after max attempts and force pause
                    if (detectionAttempts >= maxDetectionAttempts) {
                        await sendMessageToTab(fromTab, { action: 'pause' });
                        clearInterval(songChangeDetectionInterval);
                    }
                } catch (error) {
                    // Silent fail - continue detection
                }
            }, 500); // Check every 500ms

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
        await initializeTabs();
        return;
    }
    
    try {
        let info1 = await sendMessageToTab(activeTab1, { action: 'getPlaybackInfo' });
        let info2 = await sendMessageToTab(activeTab2, { action: 'getPlaybackInfo' });
        if (!info1 || !info2) return;

        // If both are playing, pause the one that *was* the current leader
        // (This handles the state right after a crossfade or manual double play)
        if (info1.isPlaying && info2.isPlaying) {
            if (currentLeader === 1) { // Tab 1 was the leader that should have faded out
                await sendMessageToTab(activeTab1, { action: 'pause' });
                info1 = await sendMessageToTab(activeTab1, { action: 'getPlaybackInfo' }); // Re-fetch info
            } else { // Tab 2 was the leader that should have faded out (currentLeader === 2)
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
            return; // Neither or both still playing (or both paused)
        }

        const timeUntilEnd = playingInfo.duration - playingInfo.currentTime;
        if (timeUntilEnd <= settings.fadeOutDuration && timeUntilEnd > 0 && !pausedInfo.isPlaying) {
            await executeCrossfade(playingTab, pausedTab, settings.fadeInDuration);
        }
    } catch (error) {
        // Silent fail - will retry on next interval
    }
}

// Start monitoring
setInterval(monitorPlayback, 1000);

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
      } catch (e) {
        // Silent fail - tab might not be accessible
      }
    }
  }
});