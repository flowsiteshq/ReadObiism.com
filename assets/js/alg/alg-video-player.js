/**
 * ==============================================================================
 * ALG Company — Universal Modern Video Player (2026 Vanilla JS)
 * ==============================================================================
 * Sleek, brand-styled HTML5 video player with:
 * - Scrubber progress bar with buffered range & hover seek
 * - Glow play/pause center action trigger
 * - Playback rate selector (0.5x to 2.0x)
 * - Picture-in-Picture (PiP) support
 * - Fullscreen toggle with auto-hide controls
 * - Keyboard shortcuts (Space, M, F, Arrows)
 * ==============================================================================
 */

class AlgVideoPlayer {
  constructor(element, options = {}) {
    this.container = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.container) return;

    this.src = options.src || this.container.getAttribute('data-src') || '';
    this.poster = options.poster || this.container.getAttribute('data-poster') || '';
    this.autoplay = options.autoplay || false;
    this.controlsTimeout = null;

    this.init();
  }

  init() {
    this.container.classList.add('alg-player-wrapper');
    this.container.innerHTML = `
      <video class="alg-player-video" poster="${this.poster}" ${this.autoplay ? 'autoplay' : ''} preload="metadata">
        ${this.src ? `<source src="${this.src}" type="video/mp4" />` : ''}
        Your browser does not support HTML5 video.
      </video>
      <div class="alg-player-big-play" role="button" aria-label="Play Video">
        <i class="fa-solid fa-play"></i>
      </div>
      <div class="alg-player-controls">
        <div class="alg-player-timeline" role="slider" aria-label="Seek Video">
          <div class="alg-player-buffered"></div>
          <div class="alg-player-progress"></div>
        </div>
        <div class="alg-player-bottom-bar">
          <div class="d-flex align-items-center gap-3">
            <button type="button" class="alg-player-btn alg-player-toggle" title="Play/Pause (Space)"><i class="fa-solid fa-play"></i></button>
            <div class="d-flex align-items-center gap-2">
              <button type="button" class="alg-player-btn alg-player-mute" title="Mute (M)"><i class="fa-solid fa-volume-high"></i></button>
              <input type="range" class="alg-player-volume" min="0" max="1" step="0.05" value="1" title="Volume" />
            </div>
            <div class="alg-player-time small">00:00 / 00:00</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <select class="form-select form-select-sm alg-player-speed" title="Speed" style="width: 75px; height: 30px; padding: 2px 8px; font-size: 0.8rem; background-color: rgba(255,255,255,0.15); color: #fff; border-color: rgba(255,255,255,0.2);">
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1" selected>1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
            <button type="button" class="alg-player-btn alg-player-pip d-none d-sm-inline-flex" title="Picture in Picture"><i class="fa-solid fa-clone"></i></button>
            <button type="button" class="alg-player-btn alg-player-fullscreen" title="Fullscreen (F)"><i class="fa-solid fa-expand"></i></button>
          </div>
        </div>
      </div>
    `;

    this.video = this.container.querySelector('.alg-player-video');
    this.bigPlay = this.container.querySelector('.alg-player-big-play');
    this.playBtn = this.container.querySelector('.alg-player-toggle');
    this.muteBtn = this.container.querySelector('.alg-player-mute');
    this.volumeSlider = this.container.querySelector('.alg-player-volume');
    this.timeDisplay = this.container.querySelector('.alg-player-time');
    this.timeline = this.container.querySelector('.alg-player-timeline');
    this.progressBar = this.container.querySelector('.alg-player-progress');
    this.bufferedBar = this.container.querySelector('.alg-player-buffered');
    this.speedSelect = this.container.querySelector('.alg-player-speed');
    this.pipBtn = this.container.querySelector('.alg-player-pip');
    this.fullscreenBtn = this.container.querySelector('.alg-player-fullscreen');
    this.controls = this.container.querySelector('.alg-player-controls');

    this.bindEvents();
  }

  bindEvents() {
    const togglePlay = () => {
      if (this.video.paused) {
        this.video.play();
        this.container.classList.add('playing');
        this.playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        this.bigPlay.classList.add('d-none');
      } else {
        this.video.pause();
        this.container.classList.remove('playing');
        this.playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        this.bigPlay.classList.remove('d-none');
      }
    };

    this.bigPlay.addEventListener('click', togglePlay);
    this.playBtn.addEventListener('click', togglePlay);
    this.video.addEventListener('click', togglePlay);

    // Timeline progress update
    this.video.addEventListener('timeupdate', () => {
      const current = this.video.currentTime;
      const duration = this.video.duration || 0;
      const percent = duration > 0 ? (current / duration) * 100 : 0;
      this.progressBar.style.width = `${percent}%`;
      this.timeDisplay.textContent = `${this.formatTime(current)} / ${this.formatTime(duration)}`;
    });

    // Buffered progress
    this.video.addEventListener('progress', () => {
      if (this.video.buffered.length > 0) {
        const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
        const duration = this.video.duration || 0;
        const percent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;
        this.bufferedBar.style.width = `${percent}%`;
      }
    });

    // Seek click
    this.timeline.addEventListener('click', (e) => {
      const rect = this.timeline.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      this.video.currentTime = pos * this.video.duration;
    });

    // Volume
    this.volumeSlider.addEventListener('input', (e) => {
      this.video.volume = e.target.value;
      this.video.muted = (this.video.volume === 0);
      this.updateMuteIcon();
    });

    this.muteBtn.addEventListener('click', () => {
      this.video.muted = !this.video.muted;
      this.updateMuteIcon();
    });

    // Speed
    this.speedSelect.addEventListener('change', (e) => {
      this.video.playbackRate = parseFloat(e.target.value);
    });

    // Picture in Picture
    if (document.pictureInPictureEnabled) {
      this.pipBtn.addEventListener('click', async () => {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else {
            await this.video.requestPictureInPicture();
          }
        } catch (e) {
          console.warn('[AlgVideoPlayer] PiP failed', e);
        }
      });
    } else {
      this.pipBtn.classList.add('d-none');
    }

    // Fullscreen
    this.fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        this.container.requestFullscreen?.() || this.container.webkitRequestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    // Auto-hide controls on mouse idle
    this.container.addEventListener('mousemove', () => {
      this.controls.style.opacity = '1';
      clearTimeout(this.controlsTimeout);
      this.controlsTimeout = setTimeout(() => {
        if (!this.video.paused) {
          this.controls.style.opacity = '0';
        }
      }, 2500);
    });

    // Keyboard controls
    this.container.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      if (e.key === 'm') { e.preventDefault(); this.muteBtn.click(); }
      if (e.key === 'f') { e.preventDefault(); this.fullscreenBtn.click(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.video.currentTime += 5; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.video.currentTime -= 5; }
    });
  }

  updateMuteIcon() {
    if (this.video.muted || this.video.volume === 0) {
      this.muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    } else if (this.video.volume < 0.5) {
      this.muteBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
    } else {
      this.muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    }
  }

  formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min < 10 ? '0' : ''}${min}:${sec < 10 ? '0' : ''}${sec}`;
  }
}

window.AlgVideoPlayer = AlgVideoPlayer;
