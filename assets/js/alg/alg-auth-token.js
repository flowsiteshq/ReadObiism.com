/**
 * ==============================================================================
 * ALG School OS — Auth Token & Impersonation Engine
 * ==============================================================================
 * Dual-token auth with impersonation support for platform roles.
 *
 * Token modes:
 *   "local"   — persistent token in localStorage (remember me / long-lived)
 *   "session" — temporary token in sessionStorage (impersonation / incognito)
 *   "none"    — not authenticated
 *
 * Impersonation flow:
 *   1. product_admin clicks "Impersonate" on an org
 *   2. A handoff key is generated and stored in localStorage
 *   3. The org's dashboard URL is opened with ?impk=<key>
 *   4. This script picks up the key, swaps the token, and cleans the URL
 *
 * Usage:
 *   ALG.auth.getToken()                    -> current token string
 *   ALG.auth.getMode()                     -> "local" | "session" | "none"
 *   ALG.auth.isImpersonating()             -> boolean
 *   ALG.auth.setToken(token, user, mode)   -> store token + user
 *   ALG.auth.clear()                       -> wipe all auth state
 *   ALG.auth.consumeImpersonation()        -> call once on boot
 * ==============================================================================
 */

class AlgAuthToken {
  constructor() {
    this.localKey = 'alg_auth_token';
    this.sessionKey = 'alg_auth_token_session';
    this.userKey = 'alg_user_data';
    this.refreshKey = 'alg_refresh_token';
    this.impersonationContextKey = 'alg_impersonation_context';
    this.impersonationHandoffPrefix = 'alg_impersonation_handoff_';
    this.activeOrgKey = 'alg_active_org_context';

    this.token = null;
    this.mode = 'none';
    this.user = null;
    this.impersonationContext = null;
    this.activeOrgContext = null;

    this._hydrate();
  }

  // ── Hydration ──────────────────────────────────────────────────────────────

  _hydrate() {
    // Session token takes priority (impersonation / incognito)
    const sessionToken = this._get(this.sessionKey);
    if (sessionToken) {
      this.token = sessionToken;
      this.mode = 'session';
      this.impersonationContext = this._getJson(this.impersonationContextKey, null);
      this.activeOrgContext = this._getJson(this.activeOrgKey, null);
      return;
    }

    // Fall back to persistent local token
    const localToken = this._get(this.localKey);
    if (localToken) {
      this.token = localToken;
      this.mode = 'local';
    }

    // A platform admin who switched into a school (without a token swap) keeps
    // the target context across reloads so the scoped view + API header persist.
    this.impersonationContext = this._getJson(this.impersonationContextKey, null);
    this.activeOrgContext = this._getJson(this.activeOrgKey, null);
    this.user = this._getJson(this.userKey, null);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getToken() {
    return this.token;
  }

  getMode() {
    return this.mode;
  }

  getUser() {
    return this.user;
  }

  isAuthenticated() {
    return !!this.token;
  }

  isImpersonating() {
    return !!this.impersonationContext;
  }

  getImpersonationContext() {
    return this.impersonationContext;
  }

  /**
   * Begin a platform-admin school switch ("impersonation").
   * Keeps the caller's own token intact and stores the target school context so
   * the API client attaches the X-Impersonation-Org header on every request.
   * @param {object} context - { org_id, org_name, org_slug, plan_code, ... }
   * @returns {boolean} true when the context was stored
   */
  startImpersonation(context) {
    if (!context || typeof context !== 'object' || !context.org_id) return false;
    this.impersonationContext = context;
    this._setJson(this.impersonationContextKey, context);
    return true;
  }

  /**
   * End the school switch and clear the target context.
   */
  stopImpersonation() {
    this.impersonationContext = null;
    this._remove(this.impersonationContextKey);
  }

  // ── Active campus (school-admin branch view) ───────────────────────────────

  /** The campus a school admin is currently viewing, or null. */
  getActiveOrgContext() {
    return this.activeOrgContext;
  }

  isViewingCampus() {
    return !!this.activeOrgContext;
  }

  /**
   * Select which campus in the caller's own family the workspace should show.
   * The backend only honours this for orgs in the caller's own branch family.
   * @param {object} context - { org_id, org_name, org_slug, is_hq }
   * @returns {boolean} true when the context was stored
   */
  setActiveOrg(context) {
    if (!context || typeof context !== 'object' || !context.org_id) return false;
    this.activeOrgContext = context;
    this._setJson(this.activeOrgKey, context);
    return true;
  }

  clearActiveOrg() {
    this.activeOrgContext = null;
    this._remove(this.activeOrgKey);
  }

  /**
   * Store a token with optional user data.
   * @param {string} token - JWT token
   * @param {object|null} user - User data to persist
   * @param {string} mode - "local" (persistent) or "session" (temporary)
   */
  setToken(token, user = null, mode = 'local') {
    this.token = token || null;
    this.mode = this.token ? mode : 'none';

    if (this.token) {
      if (mode === 'session') {
        this._set(this.sessionKey, this.token);
        this._remove(this.localKey);
      } else {
        this._set(this.localKey, this.token);
        this._remove(this.sessionKey);
        this._remove(this.impersonationContextKey);
        this._remove(this.activeOrgKey);
        this.activeOrgContext = null;
      }
    }

    if (user) {
      this.user = user;
      this._setJson(this.userKey, user);
    } else if (user === null && this.token) {
      // Keep existing user if not explicitly cleared
    } else {
      this.user = null;
      this._remove(this.userKey);
    }
  }

  /**
   * Clear all auth state (logout).
   */
  clear() {
    this.token = null;
    this.mode = 'none';
    this.user = null;
    this.impersonationContext = null;
    this.activeOrgContext = null;

    this._remove(this.localKey);
    this._remove(this.sessionKey);
    this._remove(this.userKey);
    this._remove(this.refreshKey);
    this._remove(this.impersonationContextKey);
    this._remove(this.activeOrgKey);
  }

  // ── Impersonation ──────────────────────────────────────────────────────────

  /**
   * Consume an impersonation handoff from the URL (?impk=<key>).
   * Call this once on boot, before any rendering.
   * @returns {boolean} true if an impersonation was consumed
   */
  consumeImpersonation() {
    const params = new URLSearchParams(window.location.search || '');
    const handoffKey = String(params.get('impk') || '').trim();
    if (!handoffKey) return false;

    const storageKey = this.impersonationHandoffPrefix + handoffKey;
    const raw = localStorage.getItem(storageKey);
    localStorage.removeItem(storageKey);

    if (raw) {
      try {
        const payload = JSON.parse(raw);
        const handoffToken = String(payload?.token || '').trim();
        if (handoffToken) {
          this.setToken(handoffToken, payload?.user || null, 'session');
        }
        if (payload?.context && typeof payload.context === 'object') {
          this.impersonationContext = payload.context;
          this._setJson(this.impersonationContextKey, payload.context);
        }
      } catch {
        this._remove(this.sessionKey);
        this._remove(this.impersonationContextKey);
      }
    }

    // Clean the URL
    params.delete('impk');
    const qs = params.toString();
    const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(null, '', cleanUrl);

    return true;
  }

  /**
   * Create an impersonation handoff for a target org.
   * Stores the token + context in localStorage and returns the URL to navigate to.
   * @param {string} targetUrl - The org's dashboard URL
   * @param {string} token - The impersonation token
   * @param {object} context - The impersonation context (org info, etc.)
   * @param {object|null} user - Optional user data for the impersonated session
   * @returns {string} URL with ?impk=<key> appended
   */
  static createImpersonationHandoff(targetUrl, token, context = {}, user = null) {
    const key = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

    const storageKey = `alg_impersonation_handoff_${key}`;
    localStorage.setItem(storageKey, JSON.stringify({ token, context, user }));

    const separator = targetUrl.includes('?') ? '&' : '?';
    return `${targetUrl}${separator}impk=${key}`;
  }

  // ── Storage Helpers ────────────────────────────────────────────────────────

  _get(key) {
    try { return localStorage.getItem(key) || sessionStorage.getItem(key) || ''; }
    catch { return ''; }
  }

  _set(key, value) {
    try {
      if (this.mode === 'session') sessionStorage.setItem(key, value);
      else localStorage.setItem(key, value);
    } catch {}
  }

  _remove(key) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  }

  _getJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  _setJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
}

// ── Boot: consume impersonation before anything else ─────────────────────────
window.algAuthToken = new AlgAuthToken();
window.algAuthToken.consumeImpersonation();

// Expose on ALG facade
window.ALG = window.ALG || {};
window.ALG.auth = window.algAuthToken;
