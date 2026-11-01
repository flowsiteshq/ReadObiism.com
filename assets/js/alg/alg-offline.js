/**
 * ==============================================================================
 * ALG Company — Offline Connectivity & PWA Sync Engine (2026)
 * ==============================================================================
 * Listens for network drop / online restoration:
 * - Shows sticky offline indicator when network drops (handling Status 0)
 * - Automatically notifies user upon reconnection
 * ==============================================================================
 */

class AlgOfflineDetector {
  constructor() {
    this.banner = null;
    this.init();
  }

  init() {
    window.addEventListener('offline', () => this.handleOffline());
    window.addEventListener('online', () => this.handleOnline());

    if (!navigator.onLine) {
      this.handleOffline();
    }
  }

  handleOffline() {
    if (!this.banner) {
      this.banner = document.createElement('div');
      this.banner.className = 'bg-dark text-white py-2 px-3 small text-center fixed-bottom shadow';
      this.banner.style.zIndex = '1100';
      this.banner.innerHTML = `
        <i class="fa-solid fa-wifi-slash text-warning me-2"></i>
        <span>You are currently working offline. Reconnecting to internet...</span>
      `;
      document.body.appendChild(this.banner);
    }
  }

  handleOnline() {
    if (this.banner) {
      this.banner.remove();
      this.banner = null;
      window.algToast?.success("Internet connection restored. Back online!");
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.algOfflineDetector = new AlgOfflineDetector();
});
