(function() {
  if (window.__ytmusic_crossfade_injected) {
    // Already injected, do nothing
    return;
  }
  window.__ytmusic_crossfade_injected = true;

  console.log('YouTubeMusicController content script loaded in frame:', window.location.href, 'top:', window === window.top);

  // MutationObserver-based initialization for SPA support
  function waitForPlayerAndInit() {
    const tryInit = () => {
      const player = document.querySelector('[data-testid="player"]');
      if (player) {
        if (!window.__ytmusic_crossfade_controller) {
          window.__ytmusic_crossfade_controller = new YouTubeMusicController();
          console.log('YouTubeMusicController initialized');
        }
        return true;
      }
      return false;
    };

    if (!tryInit()) {
      const observer = new MutationObserver(() => {
        if (tryInit()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    // Fallback: always try to initialize after 3 seconds
    setTimeout(() => {
      if (!window.__ytmusic_crossfade_controller) {
        window.__ytmusic_crossfade_controller = new YouTubeMusicController();
        console.log('YouTubeMusicController fallback initialized');
      }
    }, 3000);
  }
  waitForPlayerAndInit();

  // YouTube Music player control functions
  class YouTubeMusicController {
    constructor() {
      this.player = null;
      this.volumeSlider = null;
      this.playButton = null;
      this.initialize();
    }

    initialize() {
      // Wait for player elements to be available
      this.waitForElements().then(() => {
        this.setupMessageListener();
      });
    }

    async waitForElements() {
      let attempts = 0;
      while (!this.player || !this.volumeSlider || !this.playButton) {
        // Updated selectors for June 2025 YouTube Music DOM
        this.player = document.querySelector('.ytmusic-player-bar, ytmusic-player-bar-renderer');
        this.volumeSlider = document.querySelector('tp-yt-paper-slider[aria-label="Volume"], .volume-slider, input[type="range"][aria-label="Volume"]');
        this.playButton = document.querySelector('button[title*="Play"], button[title*="Pause"], .play-pause-button, tp-yt-paper-icon-button[title*="Play"], tp-yt-paper-icon-button[title*="Pause"]');
        if (attempts === 5) {
          const allSliders = Array.from(document.querySelectorAll('tp-yt-paper-slider'));
          console.log('All tp-yt-paper-slider elements:', allSliders.map(e => ({ id: e.id, outerHTML: e.outerHTML.slice(0, 200) })));
        }
        console.log('waitForElements attempt', attempts, {
          player: this.player, volumeSlider: this.volumeSlider, playButton: this.playButton
        });
        attempts++;
        if (attempts > 20) {
          console.error('YouTubeMusicController: Could not find player elements after 20 attempts', {
            player: this.player, volumeSlider: this.volumeSlider, playButton: this.playButton
          });
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (this.player && this.volumeSlider && this.playButton) {
        console.log('YouTubeMusicController: Player elements found', {
          player: this.player, volumeSlider: this.volumeSlider, playButton: this.playButton
        });
      }
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('YouTubeMusicController received message:', request);
        let responded = false;
        switch (request.action) {
          case 'getPlaybackInfo':
            const info = this.getPlaybackInfo();
            console.log('getPlaybackInfo response:', info);
            sendResponse(info);
            responded = true;
            break;
          case 'setVolume':
            this.setVolume(request.volume);
            sendResponse({ success: true });
            responded = true;
            break;
          case 'play':
            this.play();
            sendResponse({ success: true });
            responded = true;
            break;
          case 'pause':
            this.pause();
            sendResponse({ success: true });
            responded = true;
            break;
          case 'next':
            this.nextTrack();
            sendResponse({ success: true });
            responded = true;
            break;
        }
        if (!responded) sendResponse({ success: false, error: 'Unknown action' });
        // Do not return true; always respond synchronously
      });
    }

    getPlaybackInfo() {
      // Use the actual selectors from the user's DOM
      const timeDisplay = document.querySelector('span.time-info.style-scope.ytmusic-player-bar')
        || document.querySelector('.time-info, ytmusic-player-bar-renderer .time-info');
      let progressBar = document.querySelector('tp-yt-paper-slider#progress-bar');
      if (!progressBar) {
        // Fallback: first tp-yt-paper-slider in the player bar or only one on the page
        const allSliders = Array.from(document.querySelectorAll('tp-yt-paper-slider'));
        if (allSliders.length === 1) progressBar = allSliders[0];
        if (!progressBar && this.player) {
          progressBar = this.player.querySelector('tp-yt-paper-slider');
        }
        console.log('Progress bar fallback used. All sliders:', allSliders.map(e => ({ id: e.id, outerHTML: e.outerHTML.slice(0, 200) })), 'Selected progressBar:', progressBar);
      }
      // Song title: use the exact selector from the user's screenshot, with fallbacks
      const songTitle =
        document.querySelector('span.title.style-scope.ytmusic-player-bar')?.textContent ||
        document.querySelector('.title.ytmusic-player-bar, .ytmusic-player-bar .title, .title')?.textContent;
      if (!timeDisplay || !progressBar) {
        console.warn('YouTubeMusicController: Missing timeDisplay or progressBar', { timeDisplay, progressBar });
        return {
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          songTitle: 'Unknown'
        };
      }
      // Parse time display (e.g. "1:23 / 3:45")
      const [currentTime, duration] = timeDisplay.textContent.split(' / ').map(time => {
        if (!time) return 0;
        const [minutes, seconds] = time.trim().split(':').map(Number);
        return (minutes || 0) * 60 + (seconds || 0);
      });
      return {
        currentTime,
        duration,
        isPlaying: this.playButton?.getAttribute('title')?.includes('Pause') || this.playButton?.getAttribute('aria-label')?.includes('Pause'),
        songTitle: songTitle || 'Unknown'
      };
    }

    setVolume(level) {
      console.log('Setting volume to', level);
      if (!this.volumeSlider) return;
      // Convert percentage to slider value (0-100)
      const sliderValue = Math.max(0, Math.min(100, level));
      // For input[type=range] sliders
      if (this.volumeSlider.type === 'range') {
        this.volumeSlider.value = sliderValue;
        this.volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
        this.volumeSlider.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      // For tp-yt-paper-slider (Web Components)
      if (typeof this.volumeSlider.value !== 'undefined') {
        this.volumeSlider.value = sliderValue;
        this.volumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
        this.volumeSlider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    play() {
      if (this.playButton && (this.playButton.getAttribute('title')?.includes('Play') || this.playButton.getAttribute('aria-label')?.includes('Play'))) {
        this.playButton.click();
      }
    }

    pause() {
      if (this.playButton && (this.playButton.getAttribute('title')?.includes('Pause') || this.playButton.getAttribute('aria-label')?.includes('Pause'))) {
        this.playButton.click();
      }
    }

    nextTrack() {
      // Next button: try button[title*="Next"], .next-button, or tp-yt-paper-icon-button[title*="Next"]
      const nextButton = document.querySelector('button[title*="Next"], .next-button, tp-yt-paper-icon-button[title*="Next"]');
      if (nextButton) {
        nextButton.click();
      }
    }
  }

})(); 