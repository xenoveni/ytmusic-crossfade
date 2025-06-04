(function() {
  if (window.__ytmusic_crossfade_injected) {
    // Already injected, do nothing
    return;
  }
  window.__ytmusic_crossfade_injected = true;

  // Initialize the controller when the DOM is ready
  let ytMusicController = null;
  let initializationAttempts = 0;
  const MAX_INITIALIZATION_ATTEMPTS = 5;

  // Helper function to find the YouTube Music audio element
  function getYtmusicAudio() {
    // Try multiple selector strategies to find the audio element
    const selectors = [
      'audio',
      'video',
      '#movie_player audio',
      '#movie_player video'
    ];
    
    // Try direct selectors
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    
    // Try inside shadow roots
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar && playerBar.shadowRoot) {
      const audio = playerBar.shadowRoot.querySelector('audio');
      if (audio) return audio;
    }
    
    // Try inside any shadow root on the page
    const allElems = document.querySelectorAll('*');
    for (const el of allElems) {
      if (el.shadowRoot) {
        const audio = el.shadowRoot.querySelector('audio');
        if (audio) return audio;
      }
    }
    
    return null;
  }

  // Main controller class for YouTube Music
  class YouTubeMusicController {
    constructor() {
      this.audio = getYtmusicAudio();
      this.playerBar = document.querySelector('tp-yt-paper-slider') || 
                      document.querySelector('#progress-bar') || 
                      document.querySelector('.ytmusic-player-bar');
      this.volumeSlider = document.querySelector('#volume-slider') || 
                         document.querySelector('tp-yt-paper-slider[role="slider"][aria-label*="Volume"]') ||
                         document.querySelector('tp-yt-paper-slider[role="slider"][aria-valuetext*="Volume"]');
      this.playPauseButton = document.querySelector('#play-pause-button') || 
                            document.querySelector('tp-yt-paper-icon-button[aria-label*="Play"]') ||
                            document.querySelector('tp-yt-paper-icon-button[aria-label*="Pause"]') ||
                            document.querySelector('button[aria-label*="Play"]') ||
                            document.querySelector('button[aria-label*="Pause"]');
      this.nextButton = document.querySelector('.next-button') ||
                       document.querySelector('tp-yt-paper-icon-button[aria-label="Next"]') ||
                       document.querySelector('button[aria-label="Next"]');
      
      // Set up message listener
      this.setupMessageListener();
    }

    // Get current playback information
    getPlaybackInfo() {
      try {
        // Get current time and duration
        let currentTime = 0;
        let duration = 0;
        let isPlaying = false;
        let songTitle = null;
        
        // Get time info from audio element if available
        if (this.audio) {
          currentTime = this.audio.currentTime;
          duration = this.audio.duration;
          isPlaying = !this.audio.paused;
        }
        
        // Get song title from the player
        const titleElement = document.querySelector('.title.ytmusic-player-bar') || 
                            document.querySelector('.title') ||
                            document.querySelector('yt-formatted-string.title.style-scope.ytmusic-player-bar') ||
                            document.querySelector('span.title.style-scope.ytmusic-player-bar');
        if (titleElement) {
          songTitle = titleElement.textContent.trim();
        }
        
        // If we couldn't determine isPlaying from audio element, try from play/pause button
        if (isPlaying === undefined && this.playPauseButton) {
          // Check aria-label or title attribute to determine state
          const buttonState = this.playPauseButton.getAttribute('aria-label') || 
                             this.playPauseButton.getAttribute('title') || '';
          isPlaying = buttonState.includes('Pause');
        }
        
        return {
          currentTime,
          duration,
          isPlaying,
          songTitle
        };
      } catch (error) {
        return {
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          songTitle: null
        };
      }
    }

    // Set volume (0-100)
    setVolume(volume) {
      try {
        // Ensure volume is between 0-100
        volume = Math.max(0, Math.min(100, volume));
        
        // Try to set volume directly on audio element first
        if (this.audio) {
          this.audio.volume = volume / 100;
        }
        
        // If volume slider exists, try to set it as well for UI consistency
        if (this.volumeSlider) {
          // Different types of sliders might need different approaches
          if (typeof this.volumeSlider.value !== 'undefined') {
            // Standard slider
            this.volumeSlider.value = volume;
          } else if (typeof this.volumeSlider.setAttribute === 'function') {
            // Some sliders use attributes
            this.volumeSlider.setAttribute('value', volume);
            this.volumeSlider.setAttribute('aria-valuenow', volume);
          }
          
          // Dispatch input event to ensure the UI updates
          const event = new Event('input', { bubbles: true });
          this.volumeSlider.dispatchEvent(event);
          this.volumeSlider.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        return true;
      } catch (error) {
        return false;
      }
    }

    // Play
    play() {
      try {
        // Try direct audio element play first
        if (this.audio && this.audio.paused) {
          this.audio.play().catch(() => {
            // If direct play fails, try clicking the play button
            if (this.playPauseButton) {
              this.playPauseButton.click();
            }
          });
        } else if (this.playPauseButton) {
          // Always click the play button regardless of current state
          // YouTube Music's UI will handle toggling correctly
          this.playPauseButton.click();
          
          // Verify play worked after a short delay
          setTimeout(() => {
            if (this.audio && this.audio.paused) {
              // Try one more time if it didn't work
              this.playPauseButton.click();
            }
          }, 300);
        }
        return true;
      } catch (error) {
        return false;
      }
    }

    // Pause
    pause() {
      try {
        // Try direct audio element pause first
        if (this.audio && !this.audio.paused) {
          this.audio.pause();
        } else if (this.playPauseButton) {
          // Always click the play/pause button regardless of current state
          // YouTube Music's UI will handle toggling correctly
          this.playPauseButton.click();
          
          // Verify pause worked after a short delay
          setTimeout(() => {
            if (this.audio && !this.audio.paused) {
              // Try one more time if it didn't work
              this.playPauseButton.click();
            }
          }, 300);
        }
        return true;
      } catch (error) {
        return false;
      }
    }

    // Next track
    nextTrack() {
      try {
        if (this.nextButton) {
          this.nextButton.click();
          return true;
        }
        return false;
      } catch (error) {
        return false;
      }
    }

    // Set up message listener for communication with background script
    setupMessageListener() {
      try {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          switch (message.action) {
            case 'getPlaybackInfo':
              sendResponse(this.getPlaybackInfo());
              break;
            case 'setVolume':
              sendResponse(this.setVolume(message.volume));
              break;
            case 'play':
              sendResponse(this.play());
              break;
            case 'pause':
              sendResponse(this.pause());
              break;
            case 'next':
              sendResponse(this.nextTrack());
              break;
            default:
              sendResponse({ error: 'Unknown action' });
          }
          return true; // Keep the message channel open for async responses
        });
      } catch (error) {
        // If we can't set up the listener, try again after a delay
        setTimeout(() => this.setupMessageListener(), 1000);
      }
    }
  }

  // Initialize controller when DOM is ready
  function initializeController() {
    // Use MutationObserver to wait for player elements to be available
    const observer = new MutationObserver((mutations, obs) => {
      const audio = getYtmusicAudio();
      const playPauseButton = document.querySelector('#play-pause-button') || 
                             document.querySelector('tp-yt-paper-icon-button[aria-label*="Play"]') ||
                             document.querySelector('tp-yt-paper-icon-button[aria-label*="Pause"]');
      
      if (audio || playPauseButton) {
        ytMusicController = new YouTubeMusicController();
        obs.disconnect(); // Stop observing once we've initialized
      } else {
        initializationAttempts++;
        if (initializationAttempts >= MAX_INITIALIZATION_ATTEMPTS) {
          obs.disconnect();
          // Final attempt with whatever elements are available
          ytMusicController = new YouTubeMusicController();
        }
      }
    });
    
    // Start observing
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Fallback initialization after 3 seconds if observer doesn't trigger
    setTimeout(() => {
      if (!ytMusicController) {
        ytMusicController = new YouTubeMusicController();
      }
    }, 3000);
  }

  // Start initialization when the page is loaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initializeController();
  } else {
    document.addEventListener('DOMContentLoaded', initializeController);
  }

  // Ensure message listener is set up even if controller initialization fails
  setTimeout(() => {
    if (!ytMusicController) {
      try {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          // Create controller on demand if it doesn't exist yet
          if (!ytMusicController) {
            ytMusicController = new YouTubeMusicController();
          }
          sendResponse({ received: true, action: message.action });
          return true;
        });
      } catch (error) {
        // Silent fail - will retry on next message
      }
    }
  }, 5000);
})();