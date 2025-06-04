// DOM Elements
const statusElement = document.getElementById('status');
const enableToggle = document.getElementById('enableToggle');
const fadeOutDurationSlider = document.getElementById('fadeOutDuration');
const fadeOutDurationValue = document.getElementById('fadeOutDurationValue');
const fadeInDurationSlider = document.getElementById('fadeInDuration');
const fadeInDurationValue = document.getElementById('fadeInDurationValue');
const errorElement = document.getElementById('error');

// State
let currentSettings = {
    fadeOutDuration: 15,
    fadeInDuration: 15,
    isEnabled: false
};

// Update status display
function updateStatus(status) {
    if (!status.activeTab1 || !status.activeTab2) {
        statusElement.textContent = 'Need 2 YouTube Music tabs';
        enableToggle.disabled = true;
        showError('Please open exactly 2 YouTube Music tabs');
    } else {
        statusElement.textContent = status.isEnabled ? 'Crossfade Active' : 'Ready';
        enableToggle.disabled = false;
        hideError();
    }
}

// Show error message
function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

// Hide error message
function hideError() {
    errorElement.style.display = 'none';
}

// Update settings display
function updateSettingsDisplay(settings) {
    currentSettings = settings;
    enableToggle.checked = settings.isEnabled;
    fadeOutDurationSlider.value = settings.fadeOutDuration;
    fadeOutDurationValue.textContent = `${settings.fadeOutDuration}s`;
    fadeInDurationSlider.value = settings.fadeInDuration;
    fadeInDurationValue.textContent = `${settings.fadeInDuration}s`;
}

// Save settings
async function saveSettings(settings) {
    try {
        await chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings
        });
    } catch (error) {
        showError('Failed to save settings');
    }
}

// Initialize popup
async function initializePopup() {
    try {
        const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
        updateStatus(status);
        // Backward compatibility: map old settings to new if needed
        if (status.settings && (status.settings.fadeDuration !== undefined || status.settings.triggerTime !== undefined)) {
            status.settings.fadeOutDuration = status.settings.fadeDuration ?? 15;
            status.settings.fadeInDuration = status.settings.triggerTime ?? 15;
        }
        updateSettingsDisplay(status.settings);
    } catch (error) {
        showError('Failed to initialize. Please refresh YouTube Music tabs.');
    }
}

// Event Listeners
enableToggle.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    try {
        await chrome.runtime.sendMessage({
            action: isEnabled ? 'startCrossfade' : 'stopCrossfade'
        });
        currentSettings.isEnabled = isEnabled;
        updateStatus({ ...currentSettings, activeTab1: true, activeTab2: true });
    } catch (error) {
        showError('Failed to toggle crossfade');
        e.target.checked = !isEnabled; // Revert toggle
    }
});

fadeOutDurationSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    fadeOutDurationValue.textContent = `${value}s`;
    currentSettings.fadeOutDuration = value;
    saveSettings(currentSettings);
});

fadeInDurationSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    fadeInDurationValue.textContent = `${value}s`;
    currentSettings.fadeInDuration = value;
    saveSettings(currentSettings);
});

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', initializePopup);