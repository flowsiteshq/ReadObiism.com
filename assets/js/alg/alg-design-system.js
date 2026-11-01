/**
 * ==============================================================================
 * ALG School OS — Design System Engine
 * ==============================================================================
 * Injects the full dark/light theme CSS variable system into the page.
 * Works alongside brand-tokens.css to provide:
 *   - Dark / Light / System theme with smooth transitions
 *   - CSS variable overrides for all surfaces, text, borders, shadows
 *   - View Transitions API support for buttery-smooth theme morphs
 *   - Theme toggle button with icon rotation
 *   - System preference detection with live updates
 *
 * Usage:
 *   ALG.design.init()                          -> auto-init on DOMContentLoaded
 *   ALG.design.toggleTheme()                    -> flip dark/light
 *   ALG.design.setTheme('dark'|'light'|'system') -> explicit set
 *   ALG.design.getCurrentTheme()                -> 'dark' | 'light' | 'system'
 * ==============================================================================
 */

class AlgDesignSystem {
  constructor() {
    this.themeKey = 'alg_schoolos_theme';
    this.currentTheme = 'light';
    this._mediaQuery = null;
    this._initDone = false;
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  init() {
    if (this._initDone) return;
    this._initDone = true;

    // Read saved theme or detect system preference
    const saved = this._get(this.themeKey);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.currentTheme = saved || (prefersDark ? 'dark' : 'light');

    // Apply immediately
    this._applyTheme(this.currentTheme, false);

    // Listen for system theme changes
    if (window.matchMedia) {
      this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (this._mediaQuery.addEventListener) {
        this._mediaQuery.addEventListener('change', (e) => {
          if (this.currentTheme === 'system') {
            this._applyTheme('system', true);
          }
        });
      }
    }

    // Sync with alg-store if available
    if (window.algStore) {
      window.algStore.state.theme = this.currentTheme;
    }
  }

  // ── Theme Control ──────────────────────────────────────────────────────────

  toggleTheme() {
    const next = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  setTheme(theme) {
    if (!['dark', 'light', 'system'].includes(theme)) return;
    this.currentTheme = theme;
    this._set(this.themeKey, theme);
    this._applyTheme(theme, true);

    // Sync with alg-store
    if (window.algStore) {
      window.algStore.state.theme = theme;
    }
  }

  getCurrentTheme() {
    return this.currentTheme;
  }

  isDark() {
    if (this.currentTheme === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return this.currentTheme === 'dark';
  }

  // ── DOM Application ───────────────────────────────────────────────────────

  _applyTheme(theme, animate) {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const update = () => {
      const root = document.documentElement;
      root.classList.toggle('dark-mode', isDark);
      root.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');

      if (document.body) {
        document.body.classList.toggle('dark-mode', isDark);
        document.body.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
        document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
      }

      // Update theme toggle icons
      document.querySelectorAll('.js-theme-icon, [data-theme-icon], .theme-toggle-btn i, [onclick*="toggleTheme"] i').forEach(icon => {
        if (isDark) {
          icon.classList.remove('fa-moon', 'fa-circle-half-stroke');
          icon.classList.add('fa-sun');
        } else {
          icon.classList.remove('fa-sun', 'fa-circle-half-stroke');
          icon.classList.add('fa-moon');
        }
      });

      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('alg:theme_change', { detail: { theme, isDark } }));
    };

    // Use View Transitions API if available and animation requested
    if (animate && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => update());
    } else if (animate || document.readyState === 'complete') {
      document.documentElement.classList.add('theme-transitioning');
      update();
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 500);
    } else {
      update();
    }
  }

  // ── Storage Helpers ────────────────────────────────────────────────────────

  _get(key) {
    try { return localStorage.getItem(key) || ''; }
    catch { return ''; }
  }

  _set(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
window.algDesign = new AlgDesignSystem();

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.algDesign.init());
} else {
  window.algDesign.init();
}

// Expose on ALG facade
window.ALG = window.ALG || {};
window.ALG.design = window.algDesign;
