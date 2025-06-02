// DOM Elements
const statusElement = document.getElementById('status');
const enableToggle = document.getElementById('enableToggle');
const fadeDurationSlider = document.getElementById('fadeDuration');
const fadeDurationValue = document.getElementById('fadeDurationValue');
const triggerTimeSlider = document.getElementById('triggerTime');
const triggerTimeValue = document.getElementById('triggerTimeValue');
const errorElement = document.getElementById('error');

// State
let currentSettings = {
    fadeDuration: 15,
    triggerTime: 15,
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
    fadeDurationSlider.value = settings.fadeDuration;
    fadeDurationValue.textContent = `${settings.fadeDuration}s`;
    triggerTimeSlider.value = settings.triggerTime;
    triggerTimeValue.textContent = `${settings.triggerTime}s`;
}

// Save settings
async function saveSettings(settings) {
    try {
        await chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        showError('Failed to save settings');
    }
}

// Initialize popup
async function initializePopup() {
    try {
        const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
        updateStatus(status);
        updateSettingsDisplay(status.settings);
    } catch (error) {
        console.error('Error initializing popup:', error);
        showError('Failed to initialize');
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
        console.error('Error toggling crossfade:', error);
        showError('Failed to toggle crossfade');
        e.target.checked = !isEnabled; // Revert toggle
    }
});

fadeDurationSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    fadeDurationValue.textContent = `${value}s`;
    currentSettings.fadeDuration = value;
    saveSettings(currentSettings);
});

triggerTimeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    triggerTimeValue.textContent = `${value}s`;
    currentSettings.triggerTime = value;
    saveSettings(currentSettings);
});

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', initializePopup); 