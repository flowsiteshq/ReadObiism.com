/**
 * ==============================================================================
 * ALG Company — Reactive State Store (2026 Vanilla JS Architecture)
 * ==============================================================================
 * Zero-dependency lightweight reactive state management:
 * - Reactive state proxy with subscriber callbacks
 * - Multi-tenant organization switching (School OS / SaaS ready)
 * - User authentication & permission storage
 * - Dark / Light / System theme engine with DOM persistence
 * ==============================================================================
 */

class AlgStore {
  constructor() {
    this.subscribers = {};

    // Hydrate from auth token module if available (dual-token + impersonation)
    const authToken = window.algAuthToken;
    const authUser = authToken ? authToken.getUser() : null;
    const authMode = authToken ? authToken.getMode() : 'none';

    // Initial state with localStorage rehydration
    this.state = {
      user: authUser || this.getStorageJson('alg_user_data', null),
      token: authToken ? authToken.getToken() : (localStorage.getItem('alg_auth_token') || null),
      authMode: authMode,
      isImpersonating: authToken ? authToken.isImpersonating() : false,
      refreshToken: localStorage.getItem('alg_refresh_token') || null,
      permissions: this.getStorageJson('alg_user_permissions', []),
      currentOrg: this.getStorageJson('alg_active_org', { id: 1, name: 'ALG Institute Studio', slug: 'alg-studio' }),
      theme: localStorage.getItem('alg_schoolos_theme') || localStorage.getItem('alg_theme') || 'light',
      unreadNotificationsCount: 0,
      cart: this.getStorageJson('alg_cart_items', []),
    };

    // Apply saved theme immediately on boot
    this.applyTheme(this.state.theme);
  }

  getStorageJson(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Subscribe to state property changes
   * @param {string} key Property name ('user', 'theme', 'currentOrg', etc.)
   * @param {Function} callback Function invoked with (newValue, oldValue)
   */
  subscribe(key, callback) {
    if (!this.subscribers[key]) {
      this.subscribers[key] = [];
    }
    this.subscribers[key].push(callback);
    // Immediately invoke with current state
    if (this.state[key] !== undefined) {
      callback(this.state[key], undefined);
    }
    // Return unsubscribe function
    return () => {
      this.subscribers[key] = this.subscribers[key].filter(cb => cb !== callback);
    };
  }

  /**
   * Update state property and notify all subscribers
   */
  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;

    // Sync persistent keys
    if (key === 'user') localStorage.setItem('alg_user_data', JSON.stringify(value));
    if (key === 'token') localStorage.setItem('alg_auth_token', value || '');
    if (key === 'refreshToken') localStorage.setItem('alg_refresh_token', value || '');
    if (key === 'permissions') localStorage.setItem('alg_user_permissions', JSON.stringify(value));
    if (key === 'currentOrg') localStorage.setItem('alg_active_org', JSON.stringify(value));
    if (key === 'theme') {
      localStorage.setItem('alg_theme', value);
      this.applyTheme(value, true);
    }

    if (this.subscribers[key]) {
      this.subscribers[key].forEach(cb => {
        try { cb(value, oldValue); } catch (err) { console.error('[AlgStore] Subscriber error:', err); }
      });
    }

    // Global CustomEvent for decoupled components
    window.dispatchEvent(new CustomEvent('alg:state_change', { detail: { key, value, oldValue } }));
  }

  get(key) {
    return this.state[key];
  }

  /**
   * Multi-Tenant Organization Switcher
   */
  switchOrg(orgId, orgName = 'Selected Organization', orgSlug = '') {
    const newOrg = { id: parseInt(orgId), name: orgName, slug: orgSlug };
    this.set('currentOrg', newOrg);
    window.dispatchEvent(new CustomEvent('alg:org_switched', { detail: newOrg }));
  }

  /**
   * Theme Engine: Light, Dark, System (With Smooth Transition Engine)
   */
  applyTheme(theme, isExplicit = false) {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    const updateDOM = () => {
      document.documentElement.classList.toggle('dark-mode', isDark);
      document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      if (document.body) {
        document.body.classList.toggle('dark-mode', isDark);
        document.body.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
        document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
      }

      // Update theme toggle icons smoothly
      document.querySelectorAll('.js-theme-icon, [data-theme-icon], [onclick*="toggleTheme"] i').forEach(icon => {
        if (isDark) {
          icon.classList.remove('fa-moon', 'fa-circle-half-stroke');
          icon.classList.add('fa-sun');
        } else {
          icon.classList.remove('fa-sun', 'fa-circle-half-stroke');
          icon.classList.add('fa-moon');
        }
      });
    };

    // Use browser View Transitions if available for buttery-smooth morph, fallback to CSS interpolation
    if (isExplicit && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => updateDOM());
    } else if (isExplicit || document.readyState === 'complete') {
      document.documentElement.classList.add('theme-transitioning');
      updateDOM();
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 500);
    } else {
      updateDOM();
    }
  }

  toggleTheme() {
    const nextTheme = this.state.theme === 'dark' ? 'light' : 'dark';
    this.set('theme', nextTheme);
  }

  /**
   * Clear session on logout
   */
  clearAuth() {
    // Use auth token module for full cleanup (dual-token + impersonation)
    if (window.algAuthToken) {
      window.algAuthToken.clear();
    }
    this.set('user', null);
    this.set('token', null);
    this.set('authMode', 'none');
    this.set('isImpersonating', false);
    this.set('refreshToken', null);
    this.set('permissions', []);
    localStorage.removeItem('alg_auth_token');
    localStorage.removeItem('alg_auth_token_session');
    localStorage.removeItem('alg_refresh_token');
    localStorage.removeItem('alg_user_data');
    localStorage.removeItem('alg_user_permissions');
    localStorage.removeItem('alg_impersonation_context');
  }
}

window.algStore = new AlgStore();
