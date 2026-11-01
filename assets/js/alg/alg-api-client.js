/**
 * ALG Company - Central API Client & Auth Engine (v2.0)
 * 
 * Supports both absolute production URLs (e.g. https://api.algorithm.institute/studio/api/community/test-email.php)
 * and relative endpoint paths (e.g. /auth/login.php).
 */

class AlgApiClient {
  constructor() {
    this.config = window.ALG_CONFIG || {
      apiBaseURL: 'https://api.algorithm.institute/studio/api',
      storageTokenKey: 'alg_auth_token',
      storageTokenSessionKey: 'alg_auth_token_session',
      storageUserKey: 'alg_user_data',
      storageBaseURLKey: 'alg_override_api_url',
      storageImpersonationContextKey: 'alg_impersonation_context',
      storageThemeKey: 'alg_schoolos_theme',
      endpoints: { absolute: {}, relative: {} }
    };
  }

  // Retrieve current active Base API URL (localStorage override â†’ config default)
  getBaseURL() {
    return localStorage.getItem(this.config.storageBaseURLKey) || this.config.apiBaseURL;
  }

  // Set or Override Base API URL at runtime (persisted to localStorage)
  setBaseURL(url) {
    if (url) {
      localStorage.setItem(this.config.storageBaseURLKey, url);
    } else {
      localStorage.removeItem(this.config.storageBaseURLKey);
    }
  }

  // Resolve any endpoint value â€” absolute URL used as-is, relative appended to base
  resolveEndpoint(endpointOrUrl) {
    if (typeof endpointOrUrl !== 'string') return '';
    if (/^https?:\/\//i.test(endpointOrUrl)) return endpointOrUrl;
    const base = this.getBaseURL().replace(/\/+$/, '');
    const path = endpointOrUrl.startsWith('/') ? endpointOrUrl : '/' + endpointOrUrl;
    return `${base}${path}`;
  }

  // Look up a named endpoint: absolute first, then relative (see alg-config.js)
  endpoint(name, fallback) {
    const abs = (this.config.endpoints?.absolute || {})[name];
    if (abs) return abs;
    const rel = (this.config.endpoints?.relative || {})[name];
    return rel || fallback || '';
  }

  getToken() {
    // Use auth token module if available (dual-token + impersonation)
    if (window.algAuthToken) {
      return window.algAuthToken.getToken();
    }
    return localStorage.getItem(this.config.storageTokenKey);
  }

  setToken(token, user = null, mode = 'local') {
    // Use auth token module if available
    if (window.algAuthToken) {
      window.algAuthToken.setToken(token, user, mode);
      return;
    }
    // Fallback
    if (token) {
      localStorage.setItem(this.config.storageTokenKey, token);
    } else {
      localStorage.removeItem(this.config.storageTokenKey);
    }
    if (user) {
      localStorage.setItem(this.config.storageUserKey, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.config.storageUserKey);
    }
  }

  getUser() {
    // Use auth token module if available
    if (window.algAuthToken) {
      return window.algAuthToken.getUser();
    }
    const raw = localStorage.getItem(this.config.storageUserKey);
    return raw ? JSON.parse(raw) : null;
  }

  isAuthenticated() {
    return !!this.getToken();
  }

  /**
   * Universal Request Handler
   * Accepts full URLs (http/https) OR relative endpoint paths.
   */
  /**
   * Universal Request Handler
   * Comprehensive HTTP status handling for:
   * - Status 0 (Offline, Network Error, CORS block)
   * - Status 200/201 (Success)
   * - Status 400 (Bad Request, Malformed JSON)
   * - Status 401 (Unauthorized, Token Expired with auto cleanup)
   * - Status 403 (Forbidden, Permission Denied)
   * - Status 404 (Not Found)
   * - Status 409 (Conflict, Duplicate Entry)
   * - Status 422 (Validation Error with field extraction)
   * - Status 429 (Rate Limited)
   * - Status 500/502/503 (Internal/Service Errors with Request ID)
   */
  async request(endpointOrUrl, options = {}) {
    const targetURL = this.resolveEndpoint(endpointOrUrl);

    // Separate client-only flags from real fetch() RequestInit options.
    // CRITICAL: `mode` here is OUR token-mode flag ('local'|'session').
    // fetch() also has a `mode` field with its own enum (cors/no-cors/same-origin/
    // navigate) â€” forwarding 'session'/'local' makes fetch() throw, which would
    // surface as a bogus "Network Error (Status 0)". Strip our flags out.
    const {
      silent = false,
      skipAuthRedirect = false,
      mode: _tokenMode,
      ...fetchOptions
    } = options;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...fetchOptions.headers,
    };

    // Let the browser set the multipart boundary when uploading a file.
    if (typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Include impersonation context header when impersonating
    if (window.algAuthToken && window.algAuthToken.isImpersonating()) {
      const ctx = window.algAuthToken.getImpersonationContext();
      if (ctx && ctx.org_id) {
        headers['X-Impersonation-Org'] = String(ctx.org_id);
      }
    } else if (window.algAuthToken && window.algAuthToken.getActiveOrgContext) {
      // School-admin "viewing this campus" context (honoured only within the
      // caller's own branch family server-side).
      const actx = window.algAuthToken.getActiveOrgContext();
      if (actx && actx.org_id) {
        headers['X-Active-Org'] = String(actx.org_id);
      }
    }

    let response = null;
    let data = null;

    try {
      response = await fetch(targetURL, {
        ...fetchOptions,
        headers,
      });
    } catch (networkErr) {
      // HTTP STATUS 0: Network drop, server offline, or CORS blocked
      const errMsg = `Network Error (Status 0): Cannot connect to ${targetURL}. Check server status or CORS.`;
      console.error(`[ALG API Status 0]`, networkErr);
      if (!silent) {
        this.showToast(errMsg, 'error');
      }
      const customErr = new Error(errMsg);
      customErr.status = 0;
      customErr.code = 'NETWORK_ERROR';
      throw customErr;
    }

    // Parse JSON body safely
    try {
      data = await response.json();
    } catch (parseErr) {
      data = {
        success: false,
        status: 'error',
        status_code: response.status,
        message: `HTTP ${response.status} Non-JSON Response from ${targetURL}`
      };
    }

    // Check Success (supports success: true, status: 'success', status_code: 200/201)
    const isSuccess = response.ok && (data.success !== false && data.status !== 'error');

    if (!isSuccess) {
      const statusCode = response.status || data.status_code || 400;
      let userFriendlyMessage = data.message || `Request failed with HTTP status ${statusCode}`;

      // Detailed HTTP Status Code Interception
      switch (statusCode) {
        case 400:
          userFriendlyMessage = data.message || 'Bad Request (400): Invalid request syntax or malformed payload.';
          break;
        case 401:
          userFriendlyMessage = data.message || 'Unauthorized (401): Session expired or authentication required.';
          // Any 401 means the stored session is no longer usable. Clear it.
          this.setToken(null, null);
          if (!skipAuthRedirect) {
            // Give the toast a moment to render, then bounce to sign-in.
            setTimeout(() => this.redirectToLogin(), 1000);
          }
          break;
        case 403:
          userFriendlyMessage = data.message || 'Forbidden (403): You lack permission to perform this action.';
          break;
        case 404:
          userFriendlyMessage = `Endpoint Not Found (404): ${targetURL}`;
          break;
        case 409:
          userFriendlyMessage = data.message || 'Conflict (409): A record with this unique value already exists.';
          break;
        case 422:
          if (data.message && data.message !== 'Validation failed' && data.message !== 'Validation Error' && data.message !== 'Invalid data provided.' && !data.message.startsWith('Validation failed:')) {
            userFriendlyMessage = data.message;
          } else if (data.errors && typeof data.errors === 'object') {
            const firstErr = Array.isArray(data.errors) ? data.errors[0] : Object.values(data.errors)[0];
            const errStr = Array.isArray(firstErr) ? firstErr[0] : firstErr;
            userFriendlyMessage = (typeof errStr === 'string' && errStr.length > 0)
              ? `Validation Error: ${errStr}`
              : (data.message || 'Validation Error (422): Invalid data provided.');
          } else {
            userFriendlyMessage = data.message || 'Validation Error (422): Invalid data provided.';
          }
          break;
        case 429:
          userFriendlyMessage = 'Rate Limit Exceeded (429): Too many requests. Please slow down and try again.';
          break;
        case 500:
        case 502:
        case 503:
          userFriendlyMessage = `Server Error (${statusCode}): ${data.message || 'Internal server issue'}${data.request_id ? ` (Ref: ${data.request_id})` : ''}`;
          break;
      }

      console.error(`[ALG API HTTP ${statusCode}] ${targetURL}:`, data);
      if (!silent) {
        this.showToast(userFriendlyMessage, 'error');
      }

      const apiErr = new Error(userFriendlyMessage);
      apiErr.status = statusCode;
      apiErr.code = data.code || `HTTP_${statusCode}`;
      apiErr.errors = data.errors || null;
      apiErr.requestId = data.request_id || null;
      apiErr.data = data;
      throw apiErr;
    }

    return data;
  }

  // Send Test Email using direct URL (configured under endpoints.absolute.testEmail)
  async sendTestEmail(payload = {}) {
    const url = this.endpoint('testEmail', 'https://api.algorithm.institute/studio/api/community/test-email.php');
    return await this.request(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Redirection Helper
  // returnUrl: a string to return to after login, undefined (auto = current page),
  //            or false to force a clean sign-in with no return target.
  redirectToLogin(returnUrl) {
    let loginUrl = '../auth/login.html';
    if (window.location.pathname.includes('/auth/')) {
      loginUrl = 'login.html';
    }
    let target = null;
    if (returnUrl === false) {
      target = null;
    } else if (typeof returnUrl === 'string' && returnUrl) {
      target = returnUrl;
    } else if (window.location.href && !window.location.href.includes('/auth/')) {
      target = window.location.href;
    }
    if (target) {
      loginUrl += '?redirect=' + encodeURIComponent(target);
    }
    // Replace, never push: the signed-in screen must not remain in Back history.
    window.location.replace(loginUrl);
  }

  // Auth Methods
  async login(email, password, options = {}) {
    const endpoint = this.endpoint('login', '/auth/login.php');
    const res = await this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthRedirect: true,
    });
    const token = res.data?.token || res.data?.access_token || res.token;
    const user = res.data?.user || res.user;
    if (token) {
      this.setToken(token, user, options.mode || 'local');
      if (res.data?.refresh_token) {
        localStorage.setItem('alg_refresh_token', res.data.refresh_token);
      }
      if (user && user.permissions) {
        localStorage.setItem('alg_user_permissions', JSON.stringify(user.permissions));
      }
      if (user && (user.school || user.org_name)) {
        localStorage.setItem('alg_active_org', JSON.stringify({
          id: user.org_id || 1,
          name: user.school || user.org_name || 'School OS',
          slug: user.org_slug || 'school-os'
        }));
      }
      if (!options.silent) {
        this.showToast('Login successful! Redirecting...', 'success');
      }
    }
    return res;
  }

  async validateToken(options = {}) {
    const endpoint = this.endpoint('validateToken', '/auth/validate-token.php');
    return await this.request(endpoint, { method: 'GET', silent: true, ...options });
  }

  // Sign out: revoke the refresh token server-side, clear all state, then redirect.
  async logout() {
    const refreshToken = localStorage.getItem('alg_refresh_token');
    try {
      if (refreshToken) {
        await this.request(this.endpoint('logout', '/auth/logout.php'), {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
          skipAuthRedirect: true,
          silent: true,
        });
      }
    } catch (e) {
      // Sign-out must always succeed locally even if the network call fails.
      console.warn('[ALG API] Logout request failed (continuing local sign-out):', e.message);
    }

    if (window.algAuthToken) {
      window.algAuthToken.clear();
    } else {
      this.setToken(null, null);
    }

    // Shared-device logout: remove every piece of origin storage, not only the
    // auth keys. Student journals, teacher drafts and selected-class state must
    // never survive into the next person's session. Keep only the theme choice.
    let theme = null;
    let apiBase = null;
    try {
      theme = localStorage.getItem('alg_theme') || localStorage.getItem('theme') || null;
      apiBase = localStorage.getItem('alg_override_api_url') || null;
      localStorage.clear();
      sessionStorage.clear();
      if (theme) localStorage.setItem('alg_theme', theme);
      if (apiBase) localStorage.setItem('alg_override_api_url', apiBase);
      // Cross-tab signal after the clear so every other open tab signs out too.
      localStorage.setItem('alg_logout_broadcast', String(Date.now()));
    } catch (e) {
      // Storage may be unavailable in private mode; auth keys were still cleared.
    }

    // Remove the PWA/static cache so a Back gesture cannot resurrect cached
    // private pages from this browser profile.
    try {
      if (window.caches && typeof window.caches.keys === 'function') {
        window.caches.keys().then(function (keys) {
          keys.forEach(function (key) { window.caches.delete(key); });
        }).catch(function () {});
      }
    } catch (e) { /* no-op */ }

    if (window.algToast) {
      window.algToast.info('Signed out. Redirecting to sign in...', 'Session Ended');
    }
    setTimeout(() => {
      this.redirectToLogin(false);
    }, 250);
  }

  // Lead Submission
  async submitLead(formData) {
    const endpoint = this.endpoint('leadsCreate', '/leads/create.php');
    const res = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    this.showToast('Thank you! Your message has been received.', 'success');
    return res;
  }

  // Get Leads (Dashboard) â€” returns the data array
  async getLeads() {
    const endpoint = this.endpoint('leadsList', '/leads/list.php');
    const res = await this.request(endpoint);
    return res.data;
  }

  // Create a lead / admissions applicant â€” returns the created record
  async createLead(payload) {
    const res = await this.request('/leads/create.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Save an access/audit log entry â€” returns the stored entry
  async saveAccessLog(payload) {
    const res = await this.request('/settings/access-log.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Fetch access/audit log entries (recent)
  async getAccessLogs(limit = 100) {
    const qs = new URLSearchParams();
    if (limit) qs.append('limit', limit);
    const q = qs.toString();
    const res = await this.request('/settings/access-log.php' + (q ? '?' + q : ''));
    return res.data;
  }

  // ---- Admissions pipeline (applicants) â€” DB-authoritative ----
  // Returns { summary, stages } meta plus the applicant array.
  async getApplicants() {
    const res = await this.request('/admissions/applications.php?action=list');
    return res.data;
  }

  // Create (no id) or update (id) an applicant. Returns { id, ref }.
  async saveApplicant(payload) {
    const res = await this.request('/admissions/applications.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save', ...(payload || {}) }),
    });
    return res.data;
  }

  // Soft-delete an applicant.
  async deleteApplicant(id) {
    const res = await this.request('/admissions/applications.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
    return res.data;
  }

  // ---- Admissions: application window (org_settings "admissions:config") ----
  // Controls whether the public application form accepts submissions.
  async getAdmissionsSettings() {
    const res = await this.request('/admissions/applications.php?action=settings_get');
    return res.data;
  }

  async saveAdmissionsSettings(config) {
    const res = await this.request('/admissions/applications.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'settings_save', ...(config || {}) }),
    });
    return res.data;
  }

  // ---- Admissions: entrance exams (school console) ----
  // Returns the exam array (each with questionCount, isOpen and result stats).
  async getAdmissionExams() {
    const res = await this.request('/admissions/exam.php?action=list');
    return res.data;
  }

  // Create (no id) or update (id) an exam. Returns { id, examCode }.
  async saveAdmissionExam(payload) {
    const res = await this.request('/admissions/exam.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save', ...(payload || {}) }),
    });
    return res.data;
  }

  async setAdmissionExamStatus(examId, status) {
    const res = await this.request('/admissions/exam.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'set_status', exam_id: examId, status }),
    });
    return res.data;
  }

  async deleteAdmissionExam(id) {
    const res = await this.request('/admissions/exam.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
    return res.data;
  }

  // The paper including correct answers (staff view only).
  async getAdmissionExamQuestions(examId) {
    const res = await this.request(`/admissions/exam.php?action=questions&exam_id=${encodeURIComponent(examId)}`);
    return res.data;
  }

  async saveAdmissionExamQuestion(payload) {
    const res = await this.request('/admissions/exam.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'question_save', ...(payload || {}) }),
    });
    return res.data;
  }

  async deleteAdmissionExamQuestion(id) {
    const res = await this.request('/admissions/exam.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'question_delete', id }),
    });
    return res.data;
  }

  async getAdmissionExamResults(examId) {
    const res = await this.request(`/admissions/exam.php?action=attempts&exam_id=${encodeURIComponent(examId)}`);
    return res.data;
  }

  // Put selected applicants into the "Entrance Exam" stage for one exam.
  async scheduleAdmissionExam(examId, applicantIds) {
    const res = await this.request('/admissions/exam.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'schedule', exam_id: examId, applicant_ids: applicantIds || [] }),
    });
    return res.data;
  }

  // Get Dashboard Statistics â€” returns the data object
  async getDashboardStats() {
    const endpoint = this.endpoint('statsSummary', '/statistics/summary.php');
    const res = await this.request(endpoint);
    return res.data;
  }

  // Get Project Settings (Dashboard)
  async settingsGet(options = {}) {
    const endpoint = this.endpoint('settingsGet', '/settings/get.php');
    const res = await this.request(endpoint, options);
    return res.data;
  }

  // Get current user profile (/auth/me.php)
  async getProfile(options = {}) {
    const endpoint = this.endpoint('authMe', '/auth/me.php');
    const res = await this.request(endpoint, options);
    return res.data;
  }

  // Update current user profile (/auth/me.php)
  async updateProfile(profileData, options = {}) {
    const endpoint = this.endpoint('updateProfile', '/auth/me.php');
    const res = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(profileData),
      ...options
    });
    return res.data;
  }

  // Change Password (/auth/change-password.php)
  async changePassword(passwords, options = {}) {
    const endpoint = this.endpoint('changePassword', '/auth/change-password.php');
    const res = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(passwords),
      ...options
    });
    return res.data;
  }

  // Upload multipart/form-data handler (does not set Content-Type header so browser adds boundary)
  async uploadFile(endpointOrUrl, formData) {
    const targetURL = this.resolveEndpoint(endpointOrUrl);
    const headers = {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Note: getToken() now uses the auth token module (dual-token + impersonation)

    let response = null;
    let data = null;

    try {
      response = await fetch(targetURL, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (networkErr) {
      const errMsg = `Upload Failed (Status 0): Cannot reach ${targetURL}. Check network or file size.`;
      console.error(`[ALG Upload Status 0]`, networkErr);
      this.showToast(errMsg, 'error');
      const err = new Error(errMsg);
      err.status = 0;
      throw err;
    }

    try {
      data = await response.json();
    } catch (parseErr) {
      data = {
        success: false,
        status: 'error',
        status_code: response.status,
        message: `HTTP ${response.status} upload response was not valid JSON.`
      };
    }

    const isSuccess = response.ok && (data.success !== false && data.status !== 'error');
    if (!isSuccess) {
      const statusCode = response.status || data.status_code || 400;
      let errMsg = data.message || `Upload failed (HTTP ${statusCode})`;
      if (statusCode === 413) errMsg = 'File is too large (413). Please upload a smaller file.';
      if (statusCode === 415) errMsg = 'Unsupported file format (415). Please check allowed file types.';
      if (statusCode === 401) errMsg = 'Session expired (401). Please sign in to upload files.';

      console.error(`[ALG Upload HTTP ${statusCode}] ${targetURL}:`, data);
      this.showToast(errMsg, 'error');
      const err = new Error(errMsg);
      err.status = statusCode;
      err.code = data.code || `UPLOAD_HTTP_${statusCode}`;
      err.data = data;
      throw err;
    }

    return data;
  }

  // Upload Profile Avatar (optionally for another user via userId)
  async uploadAvatar(file, userId = null, options = {}) {
    const fd = new FormData();
    fd.append('avatar', file);
    if (userId) fd.append('user_id', String(userId));
    const res = await this.uploadFile('/users/upload-avatar.php', fd);
    if (options.silent !== true) this.showToast('Profile picture updated successfully!', 'success');
    return res.data;
  }

  // Upload Single File or Media
  async uploadMedia(file, folder = 'general') {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    const res = await this.uploadFile('/media/upload.php', fd);
    this.showToast('File uploaded successfully!', 'success');
    return res.data;
  }

  // Upload Single or Multiple Images
  async uploadImages(files, folder = 'images') {
    const fd = new FormData();
    fd.append('folder', folder);
    if (files instanceof FileList || Array.isArray(files)) {
      for (let i = 0; i < files.length; i++) {
        fd.append('images[]', files[i]);
      }
    } else {
      fd.append('image', files);
    }
    const res = await this.uploadFile('/media/upload-images.php', fd);
    this.showToast('Images uploaded successfully!', 'success');
    return res.data;
  }

  // Excel / CSV Bulk User Import
  async importUsers(file, sendWelcome = false) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('send_welcome', sendWelcome ? 'true' : 'false');
    const res = await this.uploadFile('/excel/import-users.php', fd);
    this.showToast(`Imported ${res.data?.imported_count || 0} users successfully!`, 'success');
    return res.data;
  }

  // Initialize Payment (Paystack, Flutterwave, Stripe, PayPal, OPay)
  async initializePayment(provider, amount, currency = 'USD', email = null, metadata = {}) {
    const user = this.getUser();
    const payload = {
      provider,
      amount,
      currency,
      email: email || user?.email || 'customer@alg.company',
      metadata
    };
    const res = await this.request('/payments/initialize.php', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return res.data;
  }

  // Verify Payment Status
  async verifyPayment(reference, provider = null) {
    const res = await this.request(`/payments/verify.php?reference=${encodeURIComponent(reference)}&provider=${encodeURIComponent(provider || '')}`);
    return res.data;
  }

  // ---- Plan Catalog (product-admin managed; read by school onboarding) ----

  // List plans: ?active=1 filters to active plans only
  async getPlans(activeOnly = false) {
    const res = await this.request(`/plans/index.php${activeOnly ? '?active=1' : ''}`);
    return res.data;
  }

  // Fetch a single plan by its code
  async getPlanByCode(code) {
    const res = await this.request(`/plans/index.php?code=${encodeURIComponent(code)}`);
    return res.data;
  }

  // Create or update a plan (product_admin / super_admin only)
  async savePlan(plan) {
    const res = await this.request('/plans/save.php', {
      method: 'POST',
      body: JSON.stringify(plan),
    });
    return res.data;
  }

  // Delete a plan ({ id } or { code }, optional force)
  async deletePlan(payload) {
    const res = await this.request('/plans/delete.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  // Bind the chosen plan to the org + mark onboarding complete (DB-authoritative)
  // `extra` may carry the school's education profile (school_type / levels).
  async saveOnboarding(planCode, orgId = null, extra = {}) {
    const body = planCode ? { plan_code: planCode } : {};
    if (orgId) body.org_id = orgId;
    if (extra && typeof extra === 'object') Object.assign(body, extra);
    const res = await this.request('/organizations/onboarding.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  }

  // ---- School Pricing Overrides (platform-admin managed) ----

  // List schools with their plan + effective (possibly overridden) price.
  async getOrgPricing() {
    const res = await this.request('/pricing/list.php');
    return res.data;
  }

  // Create/update a school's pricing override (super_admin / product_admin only).
  async saveOrgPricing(payload) {
    const res = await this.request('/pricing/save.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  // Clear a school's pricing override (revert to plan list price).
  async deleteOrgPricing(orgId) {
    const res = await this.request('/pricing/delete.php', {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId }),
    });
    return res.data;
  }

  // ---- School Switching (platform admins) ----

  // List schools for the topbar switcher
  async getOrganizations(search = '') {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await this.request(`/organizations/list.php${qs}`);
    return res.data;
  }

  // Switch into a school â€” opens an audited support session server-side
  async impersonateOrganization(orgId, reason = '') {
    const res = await this.request('/organizations/impersonate.php', {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId, reason }),
    });
    return res.data;
  }

  // Exit the school session and log the end of the support session
  async stopImpersonation(orgId = null) {
    const res = await this.request('/organizations/stop-impersonation.php', {
      method: 'POST',
      body: JSON.stringify(orgId ? { org_id: orgId } : {}),
    });
    return res.data;
  }

  // Support-impersonation audit trail
  async getImpersonationLogs(limit = 100) {
    const res = await this.request(`/organizations/impersonation-logs.php?limit=${encodeURIComponent(limit)}`);
    return res.data;
  }

  // ---- Global School-Wide Search (Milestone 10.5) ----

  // Cross-entity lookup (students, staff, parents, classes, invoices).
  // Runs silent so a restricted role can never trigger a stray error toast.
  async searchGlobal(term, params = {}) {
    const qs = new URLSearchParams();
    qs.append('q', term == null ? '' : term);
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    return await this.request(`/search.php?${qs.toString()}`, { silent: true });
  }

  // ---- Audit Log Viewer (Milestone 10.5) ----

  // Paginated + filtered system activity trail (returns { data, meta }).
  async getAuditLogs(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/audit/logs.php${q ? '?' + q : ''}`);
  }

  // One audit record with its decoded before/after state blobs.
  async getAuditLogDetail(id) {
    const res = await this.request(`/audit/logs.php?id=${encodeURIComponent(id)}`);
    return res.data;
  }

  // Download the filtered audit trail CSV with auth headers.
  async downloadAuditCsv(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const url = this.resolveEndpoint('/audit/export.php' + (qs.toString() ? '?' + qs.toString() : ''));

    const headers = { Accept: 'text/csv' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (window.algAuthToken && window.algAuthToken.isImpersonating()) {
      const ctx = window.algAuthToken.getImpersonationContext();
      if (ctx && ctx.org_id) headers['X-Impersonation-Org'] = String(ctx.org_id);
    } else if (window.algAuthToken && window.algAuthToken.getActiveOrgContext) {
      const actx = window.algAuthToken.getActiveOrgContext();
      if (actx && actx.org_id) headers['X-Active-Org'] = String(actx.org_id);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    let filename = 'alg-audit-log.csv';
    const match = /filename="?([^"]+)"?/i.exec(dispo);
    if (match && match[1]) filename = match[1].trim();

    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    return true;
  }

  // ---- Announcements & Digital Forms (Milestone 10.6) ----

  // Action-routed GET helper (read actions carry `action` + filters in the query).
  async _commRead(file, params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/communication/${file}${q ? '?' + q : ''}`);
  }

  // Action-routed POST helper (write actions carry `{ action, ... }` in the body).
  async _commWrite(file, payload = {}) {
    const res = await this.request(`/communication/${file}`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // ---- Announcements ----
  async getAnnouncementsOverview() {
    return await this._commRead('announcements.php', { action: 'overview' });
  }

  async getAnnouncements(params = {}) {
    return await this._commRead('announcements.php', Object.assign({ action: 'list' }, params || {}));
  }

  async getAnnouncement(id) {
    const res = await this._commRead('announcements.php', { action: 'get', id });
    return res.data;
  }

  async saveAnnouncement(payload) {
    return await this._commWrite('announcements.php', Object.assign({ action: 'save' }, payload || {}));
  }

  async submitAnnouncement(id) {
    return await this._commWrite('announcements.php', { action: 'submit', id });
  }

  async approveAnnouncement(id) {
    return await this._commWrite('announcements.php', { action: 'approve', id });
  }

  async rejectAnnouncement(id, reason) {
    return await this._commWrite('announcements.php', { action: 'reject', id, reason });
  }

  async publishAnnouncement(id) {
    return await this._commWrite('announcements.php', { action: 'publish', id });
  }

  async archiveAnnouncement(id) {
    return await this._commWrite('announcements.php', { action: 'archive', id });
  }

  async deleteAnnouncement(id) {
    return await this._commWrite('announcements.php', { action: 'delete', id });
  }

  async markAnnouncementRead(id) {
    return await this._commWrite('announcements.php', { action: 'mark-read', id });
  }

  // ---- Digital Forms ----
  async getFormsOverview() {
    return await this._commRead('forms.php', { action: 'overview' });
  }

  async getForms(params = {}) {
    return await this._commRead('forms.php', Object.assign({ action: 'list' }, params || {}));
  }

  async getForm(id) {
    const res = await this._commRead('forms.php', { action: 'get', id });
    return res.data;
  }

  async getFormResponses(id, params = {}) {
    return await this._commRead('forms.php', Object.assign({ action: 'responses', id }, params || {}));
  }

  async saveForm(payload) {
    return await this._commWrite('forms.php', Object.assign({ action: 'save' }, payload || {}));
  }

  async saveFormField(payload) {
    return await this._commWrite('forms.php', Object.assign({ action: 'field.save' }, payload || {}));
  }

  async deleteFormField(formId, id) {
    return await this._commWrite('forms.php', { action: 'field.delete', form_id: formId, id });
  }

  async reorderFormFields(formId, order) {
    return await this._commWrite('forms.php', { action: 'field.reorder', form_id: formId, order });
  }

  async publishForm(id) {
    return await this._commWrite('forms.php', { action: 'publish', id });
  }

  async approveForm(id) {
    return await this._commWrite('forms.php', { action: 'approve', id });
  }

  async rejectForm(id, reason) {
    return await this._commWrite('forms.php', { action: 'reject', id, reason });
  }

  async closeForm(id) {
    return await this._commWrite('forms.php', { action: 'close', id });
  }

  async archiveForm(id) {
    return await this._commWrite('forms.php', { action: 'archive', id });
  }

  async deleteForm(id) {
    return await this._commWrite('forms.php', { action: 'delete', id });
  }

  async respondToForm(id, answers) {
    return await this._commWrite('forms.php', { action: 'respond', id, answers });
  }

  async reviewFormResponse(submissionId, status, note) {
    return await this._commWrite('forms.php', { action: 'response.review', submission_id: submissionId, status, note });
  }

  // ---- School Operations (Milestone 10.8) ----
  // One shared endpoint (/operations/records.php) backs every campus-operations
  // register. `module` selects the register (transport, library, inventory, ...);
  // reads require operations.view, writes require operations.manage.
  _opsRead(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return this.request(`/operations/records.php${q ? '?' + q : ''}`);
  }
  _opsWrite(payload = {}) {
    return this.request('/operations/records.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async getOpsOverview(module) {
    const res = await this._opsRead({ action: 'overview', module });
    return res.data;
  }
  async getOpsRecords(module, params = {}) {
    const res = await this._opsRead(Object.assign({ action: 'list', module }, params || {}));
    return res.data;
  }
  async getOpsRecord(module, id) {
    const res = await this._opsRead({ action: 'get', module, id });
    return res.data;
  }
  async saveOpsRecord(module, payload = {}) {
    const res = await this._opsWrite(Object.assign({ action: 'save', module }, payload || {}));
    return res.data;
  }
  async deleteOpsRecord(module, id) {
    const res = await this._opsWrite({ action: 'delete', module, id });
    return res.data;
  }
  async getOpsOptions(type, refModule = '') {
    const res = await this._opsRead({ action: 'options', type, ref_module: refModule });
    return res.data;
  }

  // ---- AI Generation (Miss Algorithm) ----
  async generateAi(payload = {}) {
    const res = await this.request('/ai/generate.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Branch / campus network for the caller's school family
  async getBranches(orgId = null) {
    const q = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
    const res = await this.request(`/organizations/branches.php${q}`);
    return res.data;
  }

  // Create or update a branch campus (omit id to create)
  async saveBranch(payload) {
    const res = await this.request('/organizations/branch-save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Promote a branch campus to headquarters
  async setBranchHQ(id) {
    const res = await this.request('/organizations/branch-set-hq.php', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return res.data;
  }

  // Remove a branch campus
  async deleteBranch(id) {
    const res = await this.request('/organizations/branch-delete.php', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return res.data;
  }

  // ---- Staff Directory (school admin) ----

  // List staff across the caller's campus family (returns { data, meta })
  async getStaff(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/staff/list.php${q ? '?' + q : ''}`);
  }

  // Create (no id) or update (id) a staff member
  async saveStaff(payload) {
    const res = await this.request('/staff/save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Soft-decommission a staff member
  async deleteStaff(id) {
    const res = await this.request('/staff/delete.php', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return res.data;
  }

  // Reset password for a staff member and email new credentials
  async resetStaffPassword(id, password = '') {
    const payload = { id };
    if (password) payload.password = password;
    const res = await this.request('/staff/reset-password.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  // Bulk import staff from a CSV FormData payload
  async importStaff(formData) {
    const res = await this.request('/staff/import.php', {
      method: 'POST',
      body: formData,
      silent: true,
    });
    return res.data;
  }

  // Download a staff CSV (kind = 'template' | 'export') with auth headers
  async downloadStaffCsv(kind, params = {}) {
    const endpoint = kind === 'template' ? '/staff/template.php' : '/staff/export.php';
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const url = this.resolveEndpoint(endpoint + (qs.toString() ? '?' + qs.toString() : ''));

    const headers = { Accept: 'text/csv' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (window.algAuthToken && window.algAuthToken.isImpersonating()) {
      const ctx = window.algAuthToken.getImpersonationContext();
      if (ctx && ctx.org_id) headers['X-Impersonation-Org'] = String(ctx.org_id);
    } else if (window.algAuthToken && window.algAuthToken.getActiveOrgContext) {
      const actx = window.algAuthToken.getActiveOrgContext();
      if (actx && actx.org_id) headers['X-Active-Org'] = String(actx.org_id);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    let filename = kind === 'template' ? 'alg-staff-import-template.csv' : 'alg-staff-roster.csv';
    const match = /filename="?([^"]+)"?/i.exec(dispo);
    if (match && match[1]) filename = match[1].trim();

    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    return true;
  }

  // ---- HR Management (Milestone 10.3) ----

  // Generic HR read: /staff/hr.php?action=<action>&<params> (returns { data, meta })
  async hrGet(action, params = {}) {
    const qs = new URLSearchParams();
    qs.append('action', action);
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const res = await this.request(`/staff/hr.php?${qs.toString()}`);
    return res;
  }

  // Generic HR write: POST /staff/hr.php { action, ...payload } (returns { data, meta })
  async hrPost(action, payload = {}) {
    const res = await this.request('/staff/hr.php', {
      method: 'POST',
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
    return res;
  }

  // ---- Bookstore & Inventory Fulfillment (Milestone 10.9) ----

  // Generic Bookstore read: /bookstore.php?action=<action>&<params> (returns { data, meta })
  async bookstoreGet(action, params = {}) {
    const qs = new URLSearchParams();
    qs.append('action', action);
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    return await this.request(`/bookstore.php?${qs.toString()}`);
  }

  // Generic Bookstore write: POST /bookstore.php { action, ...payload } (returns { data, meta })
  async bookstorePost(action, payload = {}) {
    const res = await this.request('/bookstore.php', {
      method: 'POST',
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
    return res;
  }

  // Generic Hostel read: /operations/hostels.php?action=<action>&<params> (returns { data, meta })
  async hostelGet(action, params = {}) {
    const qs = new URLSearchParams();
    qs.append('action', action);
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    return await this.request(`/operations/hostels.php?${qs.toString()}`);
  }

  // Generic Hostel write: POST /operations/hostels.php { action, ...payload } (returns { data, meta })
  async hostelPost(action, payload = {}) {
    return await this.request('/operations/hostels.php', {
      method: 'POST',
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
  }

  // ---- Student Information System â€” Learner Directory (school admin) ----

  // List every student across the caller's campus family (returns { data, meta })
  async getStudents(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/students/list.php${q ? '?' + q : ''}`);
  }

  // Create (no id) or update (id) a student
  async saveStudent(payload) {
    const res = await this.request('/students/save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Capture/revoke guardian consent
  async saveStudentConsent(payload) {
    const res = await this.request('/students/consent.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Archive a student (soft delete)
  async deleteStudent(id) {
    const res = await this.request('/students/delete.php', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return res.data;
  }

  // Reset a learner's portal password and email the new credentials to the
  // learner and/or their guardian (school administrator only).
  async resetStudentPassword(id, password = '') {
    const payload = { id };
    if (password) payload.password = password;
    const res = await this.request('/students/reset-password.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  // Bulk import students from a CSV FormData payload
  async importStudents(formData) {
    const res = await this.request('/students/import.php', {
      method: 'POST',
      body: formData,
      silent: true,
    });
    return res.data;
  }

  // Download a student CSV (kind = 'template' | 'export') with auth headers
  async downloadStudentsCsv(kind, params = {}) {
    const endpoint = kind === 'template' ? '/students/template.php' : '/students/export.php';
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const url = this.resolveEndpoint(endpoint + (qs.toString() ? '?' + qs.toString() : ''));

    const headers = { Accept: 'text/csv' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (window.algAuthToken && window.algAuthToken.isImpersonating()) {
      const ctx = window.algAuthToken.getImpersonationContext();
      if (ctx && ctx.org_id) headers['X-Impersonation-Org'] = String(ctx.org_id);
    } else if (window.algAuthToken && window.algAuthToken.getActiveOrgContext) {
      const actx = window.algAuthToken.getActiveOrgContext();
      if (actx && actx.org_id) headers['X-Active-Org'] = String(actx.org_id);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    let filename = kind === 'template' ? 'alg-student-import-template.csv' : 'alg-student-roster.csv';
    const match = /filename="?([^"]+)"?/i.exec(dispo);
    if (match && match[1]) filename = match[1].trim();

    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    return true;
  }

  // ---- Teacher Portal â€” Faculty & Instructors (school admin) ----

  // List faculty across the caller's campus family (returns { data, meta })
  async getTeachers(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/teachers/list.php${q ? '?' + q : ''}`);
  }

  // Create (no id) or update (id) a faculty member
  async saveTeacher(payload) {
    const res = await this.request('/teachers/save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Archive a faculty member (soft delete)
  async deleteTeacher(id) {
    const res = await this.request('/teachers/delete.php', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return res.data;
  }

  // Bulk import faculty from a CSV FormData payload
  async importTeachers(formData) {
    const res = await this.request('/teachers/import.php', {
      method: 'POST',
      body: formData,
      silent: true,
    });
    return res.data;
  }

  // Download a faculty CSV (kind = 'template' | 'export') with auth headers
  async downloadTeachersCsv(kind, params = {}) {
    const endpoint = kind === 'template' ? '/teachers/template.php' : '/teachers/export.php';
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const url = this.resolveEndpoint(endpoint + (qs.toString() ? '?' + qs.toString() : ''));

    const headers = { Accept: 'text/csv' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (window.algAuthToken && window.algAuthToken.isImpersonating()) {
      const ctx = window.algAuthToken.getImpersonationContext();
      if (ctx && ctx.org_id) headers['X-Impersonation-Org'] = String(ctx.org_id);
    } else if (window.algAuthToken && window.algAuthToken.getActiveOrgContext) {
      const actx = window.algAuthToken.getActiveOrgContext();
      if (actx && actx.org_id) headers['X-Active-Org'] = String(actx.org_id);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    let filename = kind === 'template' ? 'alg-faculty-import-template.csv' : 'alg-faculty-roster.csv';
    const match = /filename="?([^"]+)"?/i.exec(dispo);
    if (match && match[1]) filename = match[1].trim();

    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    return true;
  }

  // ---- Class Management â€” Class Streams, Arms & Form Teachers (school admin) ----

  // List every class arm across the caller's campus family (returns { data, meta })
  async getClasses(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/classes/list.php${q ? '?' + q : ''}`);
  }

  // Create (no id) or update (id) a class arm
  async saveClass(payload) {
    const res = await this.request('/classes/save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Archive a class arm (soft delete)
  async deleteClass(id) {
    const res = await this.request('/classes/delete.php', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return res.data;
  }

  // Fetch one class arm's 360Â° dossier (roster + timetable)
  async getClassDossier(id) {
    const res = await this.request(`/classes/dossier.php?id=${encodeURIComponent(id)}`);
    return res.data;
  }

  // Subject Directory â€” one permission-safe payload. Leadership sees the whole
  // campus family; teachers only see their own class_subjects allocations.
  async getSubjectDirectory(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/classes/directory.php${q ? '?' + q : ''}`);
    return res.data;
  }

  // Subject & teacher allocations per class arm (returns { data, meta })
  async getClassAllocations(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/classes/allocations.php${q ? '?' + q : ''}`);
  }

  // Write subject â†” class â†” teacher allocations for one class arm.
  // payload.action is 'save' | 'set' | 'delete' (see /classes/allocate.php).
  async saveClassAllocation(payload) {
    const res = await this.request('/classes/allocate.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Published weekly timetable for the campus family (returns { data, meta })
  async getClassTimetable(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/classes/timetables.php${q ? '?' + q : ''}`);
  }

  async saveTimetableSlot(payload) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save_slot', ...payload })
    });
  }

  async deleteTimetableSlot(payload) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_slot', ...payload })
    });
  }

  async autoGenerateTimetable(payload) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'auto_generate', ...payload })
    });
  }

  async saveTimetableTemplate(payload = {}) {
    var body = { action: 'save_template' };
    if (payload && payload.template) {
      Object.assign(body, payload);
    } else {
      body.template = payload;
    }
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async clearTimetable(payload) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'clear', ...payload })
    });
  }

  async copyTimetable(payload) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'copy_timetable', ...payload })
    });
  }

  // â”€â”€ Curriculum Schemes of Work â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getSchemeClasses() {
    const res = await this.request('/classes/schemes.php?action=my_classes');
    return res.data;
  }

  async getSchemesOfWork(params = {}) {
    const q = new URLSearchParams(params).toString();
    return await this.request(`/classes/schemes.php${q ? '?' + q : ''}`);
  }

  async saveSchemeEntry(payload) {
    return await this.request('/classes/schemes.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save_entry', ...payload })
    });
  }

  async deleteSchemeEntry(payload) {
    return await this.request('/classes/schemes.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_entry', ...payload })
    });
  }

  async updateSchemeStatus(payload) {
    return await this.request('/classes/schemes.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'update_status', ...payload })
    });
  }

  async autoPopulateScheme(payload) {
    return await this.request('/classes/schemes.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'auto_populate', ...payload })
    });
  }

  async copyScheme(payload) {
    return await this.request('/classes/schemes.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'copy_scheme', ...payload })
    });
  }

  async clearScheme(payload) {
    return await this.request('/classes/schemes.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'clear_scheme', ...payload })
    });
  }

  // Attendance register for one class arm + date (returns { data, meta })
  async getClassAttendance(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/classes/attendance.php${q ? '?' + q : ''}`);
  }

  // Save (upsert) a class arm's attendance marks for a day
  async saveClassAttendance(payload) {
    const res = await this.request('/classes/attendance.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Dispatch (and persist) a notice to a class arm's parents
  async broadcastClassNotice(payload) {
    const res = await this.request('/classes/broadcast.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // ---- Assessments & Results â€” Assessment Hub (school admin/teacher) ----

  // Command Center payload for the Assessment Hub (returns { data, meta }).
  // Optional params: campus_org_id, term_id.
  async getAssessmentHub(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/hub.php${q ? '?' + q : ''}`);
  }

  // ---- Assessments & Results â€” Assessment Setup (school admin) ----

  // Full configuration payload for the Assessment Setup page (returns { data, meta }).
  async getAssessmentSetup(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/setup.php${q ? '?' + q : ''}`);
  }

  // ---- Assessments & Results â€” Question Banks (school admin/teacher) ----

  // Question banks + questions payload (returns { data, meta }).
  async getQuestionBanks(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/banks.php${q ? '?' + q : ''}`);
  }

  // Fetch questions for a specific question bank (used by the studio view).
  // Accepts bank_id and optional params; returns { data: { questions: [...] } }.
  async getQuestions(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/banks.php${q ? '?' + q : ''}`);
  }

  // Create / update / change status / delete a question.
  // payload: { action, id?, bank_id?, type?, stem?, marks?, ... }
  async saveQuestion(payload) {
    return await this.request('/assessments/questions.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Create / update / delete / moderate a question bank.
  // payload: { action, id?, name?, scope?, subject_id?, description?, status?, rejection_reason?, moderation_note?, question_ids? }
  async saveQuestionBank(payload) {
    return await this.request('/assessments/banks.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // ---- Assessments & Results â€” Assessment Library (school admin) ----

  // Full library payload (assessments + supporting lists) for PAGE 4.
  async getAssessmentLibrary(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/library.php${q ? '?' + q : ''}`);
  }

  // Assessment write surface: save / status / delete / restore /
  // section-save / section-delete / assign-save / assign-delete / preview.
  // payload: { action, id?, ... }
  async saveAssessment(payload) {
    return await this.request('/assessments/assessment.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Create / update / toggle / delete an assessment type.
  // payload: { action, id?, name?, reporting_class?, default_mode?, sort_order? }
  async saveAssessmentType(payload) {
    return await this.request('/assessments/types.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Fetch curriculum topics (standard national + custom school topics).
  // Optional params: subject_id, subject_code, class_level, level_tier, term, search
  async getCurriculumTopics(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/topics.php${q ? '?' + q : ''}`);
  }

  // Create a new custom curriculum topic for a subject and school.
  // payload: { name, subject_id?, subject_code?, subject_name?, level_tier?, class_level?, term?, description? }
  async createCurriculumTopic(payload) {
    return await this.request('/assessments/topics.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Alias for createCurriculumTopic
  async createTopic(payload) {
    return await this.createCurriculumTopic(payload);
  }

  // ---- Assessments & Results CBT Exam Delivery (school admin) ----

  // CBT delivery board for PAGE 5 (returns { data, meta }).
  // Optional params: session_id (roster + incidents), attempt_id (answers),
  //                  org_id (platform admin).
  async getCbtDelivery(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/cbt.php${q ? '?' + q : ''}`);
  }

  // CBT write surface: session-save / session-status / session-delete /
  // roster-sync / attempt-save / attempt-status / attempt-restore /
  // incident-save / incident-resolve / release.
  // payload: { action, id?, ... }
  async saveCbtSession(payload) {
    return await this.request('/assessments/cbt-session.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // ---- Assessments & Results â€” Manual Marking & Score Entry ----

  // Score entry board (returns { data, meta }).
  // Optional params: class_id (grid roster + scores),
  //                  assessment_id (detail for review / second marking).
  async getScoreEntry(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/score-entry.php${q ? '?' + q : ''}`);
  }

  // Score entry write surface: save / marker2-save / agree /
  // second-marking / lock / import.
  // payload: { action, assessment_id, entries? | rows? | ... }
  async saveScores(payload) {
    return await this.request('/assessments/scores.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // ---- Assessments & Results â€” Marking & Moderation ----

  // Marking board (returns { data, meta }).
  // Optional params: assessment_id (objective + subjective answers),
  //                  status (task status filter).
  async getMarking(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/marking.php${q ? '?' + q : ''}`);
  }

  // Marking write surface: build-queue / claim / mark / auto-mark /
  // save-answer / moderate / rubric-save / rubric-score /
  // recheck-create / recheck-update.
  // payload: { action, id?, assessment_id?, ... }
  async saveMarkingTask(payload) {
    return await this.request('/assessments/marking-task.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // ---- Assessments & Results â€” Results Engine ----

  // Results board (returns { data, meta }).
  // Optional params: term_id, class_id, student_id (transcript).
  async getResults(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/results.php${q ? '?' + q : ''}`);
  }

  // Results write surface: save-weighting / save-config / save-scheme /
  // save-policy / save-composite / delete-composite / set-component /
  // compute / approve / publish / certificate-generate / certificate-issue /
  // certificate-revoke.
  // payload: { action, ... }
  async saveResults(payload) {
    return await this.request('/assessments/results-save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // ---- Assessments & Results â€” Report Cards (PAGE 9) ----

  // Report cards board (returns { data, meta }).
  // Optional params: term_id, class_id, student_id, org_id (platform).
  async getReportCards(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/report-cards.php${q ? '?' + q : ''}`);
  }

  // Report cards write surface: save-template / delete-template /
  // save-comments / save-affective / generate / regenerate / publish / revoke.
  // payload: { action, ... }
  async saveReportCard(payload) {
    return await this.request('/assessments/report-cards-save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Public authenticity check by token or code (used behind the QR).
  async verifyReportCard(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    return await this.request(`/assessments/report-cards-verify.php?${qs.toString()}`);
  }

  // ---- Assessments & Results â€” Insights & Analytics (PAGE 10) ----

  // Analytics board (returns { data, meta }).
  // Optional params: term_id, class_id, subject_id, org_id (platform).
  async getAssessmentAnalytics(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/analytics.php${q ? '?' + q : ''}`);
  }

  // ---- Assessments & Results â€” My Assessments (PAGE 11) ----

  // The learner/guardian read surface (persona-resolved server-side).
  // Optional params: student_id (parent/staff pick), org_id (platform staff).
  async getMyAssessments(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/my-assessments.php${q ? '?' + q : ''}`);
  }

  // Learner take-flow write surface:
  // start / paper / save-answer / heartbeat / submit.  payload: { action, ... }
  async saveMyAssessment(payload) {
    return await this.request('/assessments/my-assessments-save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // ---- Assignment submissions (assessment-type "Assignment") ----

  // GET my own submissions (mine=1) or every submission for one assessment
  // (assessment_id, staff only â€” requires exams.view).
  async getAssessmentSubmissions(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/submissions.php${q ? '?' + q : ''}`);
  }

  // Submit an assignment (accepts JSON or a FormData with an optional `file`)
  // or grade a submission: { action: 'submit' | 'grade', ... }.
  async saveAssessmentSubmission(payload) {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    const res = await this.request('/assessments/submissions.php', {
      method: 'POST',
      body: isFormData ? payload : JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Public full published report card by token or code (Secured Viewer tab).
  async viewReportCard(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    return await this.request(`/assessments/report-card-view.php?${qs.toString()}`);
  }

  // ---- Assessments & Results â€” Settings & Governance (PAGE 12) ----

  // Governance board (returns { data, meta }): roles + capability matrix,
  // approval pipeline, policies, the canonical show/hide inclusion catalog,
  // anti-cheat / notifications / retention, the audit trail, the publication
  // matrix for a class+term, and the live-preview payload for the Show / hide
  // tab.  Optional params: term_id, class_id, student_id, org_id (platform).
  async getAssessmentSettings(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/assessments/settings.php${q ? '?' + q : ''}`);
  }

  // Governance write surface: save-role-permission / save-policy /
  // save-inclusions / save-anti-cheat / save-notifications / save-retention /
  // publish / unpublish.  payload: { action, ... }
  async saveAssessmentSettings(payload) {
    return await this.request('/assessments/settings-save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Download the class broadsheet CSV with auth headers
  async downloadClassesCsv(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const url = this.resolveEndpoint('/classes/export.php' + (qs.toString() ? '?' + qs.toString() : ''));

    const headers = { Accept: 'text/csv' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (window.algAuthToken && window.algAuthToken.isImpersonating()) {
      const ctx = window.algAuthToken.getImpersonationContext();
      if (ctx && ctx.org_id) headers['X-Impersonation-Org'] = String(ctx.org_id);
    } else if (window.algAuthToken && window.algAuthToken.getActiveOrgContext) {
      const actx = window.algAuthToken.getActiveOrgContext();
      if (actx && actx.org_id) headers['X-Active-Org'] = String(actx.org_id);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    let filename = 'alg-class-broadsheet.csv';
    const match = /filename="?([^"]+)"?/i.exec(dispo);
    if (match && match[1]) filename = match[1].trim();

    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    return true;
  }

  // ---- Parents & Guardians Directory (school admin) ----

  // List every guardian across the caller's campus family (returns { data, meta })
  async getParents(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/parents/list.php${q ? '?' + q : ''}`);
  }

  // Create (no id) or update (id) a guardian, replacing the learner links
  async saveParent(payload) {
    const res = await this.request('/parents/save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Archive a guardian (soft delete)
  async deleteParent(id) {
    const res = await this.request('/parents/delete.php', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return res.data;
  }

  // Reset a guardian's portal password and email the new credentials to their
  // sign-in address (requires users.update on the server).
  async resetParentPassword(id, password = '') {
    const payload = { id };
    if (password) payload.password = password;
    const res = await this.request('/parents/reset-password.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  // Dispatch (and persist) a digest / alert to guardians
  async sendParentDigest(payload) {
    const res = await this.request('/parents/digest.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Download the guardian directory CSV with auth headers
  async downloadParentsCsv(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const url = this.resolveEndpoint('/parents/export.php' + (qs.toString() ? '?' + qs.toString() : ''));

    const headers = { Accept: 'text/csv' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (window.algAuthToken && window.algAuthToken.isImpersonating()) {
      const ctx = window.algAuthToken.getImpersonationContext();
      if (ctx && ctx.org_id) headers['X-Impersonation-Org'] = String(ctx.org_id);
    } else if (window.algAuthToken && window.algAuthToken.getActiveOrgContext) {
      const actx = window.algAuthToken.getActiveOrgContext();
      if (actx && actx.org_id) headers['X-Active-Org'] = String(actx.org_id);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    let filename = 'alg-guardian-directory.csv';
    const match = /filename="?([^"]+)"?/i.exec(dispo);
    if (match && match[1]) filename = match[1].trim();

    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    return true;
  }

  // ---- Role Management & RBAC matrix (school admin + platform) ----
  //
  // School administrators manage the roles and permissions for their own
  // school. The permission matrix is tenant-aware: editing a built-in role
  // creates a per-school override so other schools are unaffected.

  // Full role catalog for the caller's scope (+ permission catalog + modules)
  async getRoles(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/rbac/roles.php${q ? '?' + q : ''}`);
  }

  // The caller's own effective roles + permissions
  async getMyRoles() {
    const res = await this.request('/rbac/roles.php?mine=1');
    return res.data;
  }

  // Create a custom role for the school
  async createRole(payload) {
    const res = await this.request('/rbac/roles.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Update a custom role's metadata (label/description/assignable/key)
  async updateRole(payload) {
    const res = await this.request('/rbac/roles.php', {
      method: 'PUT',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Delete a custom role (optionally force-reassign its holders to 'staff')
  async deleteRole(key, params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/rbac/roles.php${q ? '?' + q : ''}`, {
      method: 'DELETE',
      body: JSON.stringify({ key, ...(params || {}) }),
    });
    return res.data;
  }

  // Flat + grouped permission catalog
  async getPermissionCatalog() {
    const res = await this.request('/rbac/catalog.php');
    return res.data;
  }

  // One role's effective permission set (optionally for a specific org)
  async getRolePermissions(role, params = {}) {
    const qs = new URLSearchParams();
    qs.append('role', role);
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const res = await this.request(`/rbac/permissions.php?${qs.toString()}`);
    return res.data;
  }

  // Save (or reset) a role's permission matrix
  async saveRolePermissions(role, permissions, opts = {}) {
    const body = { role, ...(opts || {}) };
    if (permissions !== undefined && permissions !== null) body.permissions = permissions;
    const res = await this.request('/rbac/permissions.php', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.data;
  }

  // A single user's roles + effective permissions
  async getUserPermissions(userId) {
    const res = await this.request(`/rbac/permissions.php?user_id=${encodeURIComponent(userId)}`);
    return res.data;
  }

  // Set / add / remove roles for a user
  //   payload = { user_id, roles:[...] } | { user_id, role } | { user_id, action:'assign'|'unassign', role }
  async assignUserRoles(payload) {
    const res = await this.request('/rbac/assign.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Save Project Settings (Dashboard Editor) â€” key/value pairs
  async settingsSave(section, key, value) {
    const endpoint = this.endpoint('settingsSave', '/settings/save.php');
    const res = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({ section, key, value }),
    });
    return res.data;
  }

  // ---- Personal API Keys (account settings) ----
  // GET    /api/settings/api-keys.php   list the caller's active keys
  // POST   /api/settings/api-keys.php   { label } -> returns the full key ONCE
  // DELETE /api/settings/api-keys.php?id=  revoke one key
  async getApiKeys() {
    const res = await this.request('/settings/api-keys.php');
    return res.data;
  }
  async createApiKey(label) {
    const res = await this.request('/settings/api-keys.php', {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
    return res.data;
  }
  async revokeApiKey(id) {
    const res = await this.request(`/settings/api-keys.php?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.data;
  }

  // ---- Active Sessions (account settings) ----
  // GET    /api/auth/sessions.php              list active refresh sessions
  // DELETE /api/auth/sessions.php?id=          revoke one session
  // DELETE /api/auth/sessions.php   { all_other: true }
  async getSessions() {
    const res = await this.request('/auth/sessions.php');
    return res.data;
  }
  async revokeSession(id) {
    const res = await this.request(`/auth/sessions.php?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.data;
  }
  async revokeAllOtherSessions() {
    const res = await this.request('/auth/sessions.php', {
      method: 'DELETE',
      body: JSON.stringify({ all_other: true }),
    });
    return res.data;
  }

  // ---- Notification Preferences (account settings) ----
  // GET /api/settings/notifications.php   catalogue + the caller's choices
  // PUT /api/settings/notifications.php   { preferences: [{ channel, category, enabled }] }
  async getNotificationPreferences() {
    const res = await this.request('/settings/notifications.php');
    return res.data;
  }
  async saveNotificationPreferences(preferences) {
    const res = await this.request('/settings/notifications.php', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    });
    return res.data;
  }

  // Identity Numbering â€” read the school's Staff ID / Teacher code /
  // Student Admission Number schemes for the caller's active campus.
  async numberingGet() {
    const endpoint = this.endpoint('numberingGet', '/settings/numbering-get.php');
    const res = await this.request(endpoint);
    return res.data;
  }

  // Identity Numbering â€” persist the schemes.
  // schemes: { student:{format,digits}, staff:{...}, teacher:{...} }
  async numberingSave(schemes) {
    const endpoint = this.endpoint('numberingSave', '/settings/numbering-save.php');
    const res = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({ schemes }),
    });
    return res.data;
  }

  // ---- Academic Setup â€” Years, Terms, Subjects, Departments (school admin) ----
  // Read the active campus' academic configuration + active year/term context.
  async getAcademicSetup() {
    const res = await this.request('/academic/list.php');
    return res.data;
  }

  // Create (no id) or update (id) an academic year.
  // payload = { id?, name, start_date, end_date, active? }
  async saveAcademicYear(payload) {
    return await this.saveAcademicEntity({ type: 'year', ...(payload || {}) });
  }

  // payload = { id?, year_id, name, start_date, end_date, active? }
  async saveAcademicTerm(payload) {
    return await this.saveAcademicEntity({ type: 'term', ...(payload || {}) });
  }

  // payload = { id?, name, code?, department_id? }
  async saveAcademicSubject(payload) {
    return await this.saveAcademicEntity({ type: 'subject', ...(payload || {}) });
  }

  // Batch subjects: subjects = [{ name, department }, ...]
  async saveAcademicSubjects(subjects) {
    return await this.saveAcademicEntity({ type: 'subjects', subjects: subjects || [] });
  }

  // payload = { id?, name, code? }
  async saveAcademicDepartment(payload) {
    return await this.saveAcademicEntity({ type: 'department', ...(payload || {}) });
  }

  async saveAcademicEntity(payload) {
    const res = await this.request('/academic/save.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // Soft-delete an academic entity: type âˆˆ year|term|subject|department
  async deleteAcademicEntity(type, id) {
    const res = await this.request('/academic/delete.php', {
      method: 'POST',
      body: JSON.stringify({ type, id }),
    });
    return res.data;
  }

  // ---- School Profile & Branding (school admin) ----
  async getSchoolProfile() {
    const res = await this.request('/settings/school-profile.php');
    return res.data;
  }

  async saveSchoolProfile(payload) {
    const res = await this.request('/settings/school-profile.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // ---- School Levels (the education bands this campus offers) ----
  // Scoped to the ACTIVE campus (X-Active-Org), so each branch can differ.
  async getSchoolLevels() {
    const res = await this.request('/settings/school-levels.php');
    return res.data;
  }

  // Read ANOTHER campus' levels (e.g. the Classes modal's campus selector).
  async getSchoolLevelsFor(orgId) {
    const res = await this.request('/settings/school-levels.php?org_id=' + encodeURIComponent(orgId));
    return res.data;
  }

  // payload: { school_type?, levels? } â€” omitting levels derives them from type.
  async saveSchoolLevels(payload) {
    const res = await this.request('/settings/school-levels.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.data;
  }

  // ---- School Login Code (short code + QR entry) ----
  async getLoginCode() {
    const res = await this.request('/org/login-code.php');
    return res.data;
  }

  async regenerateLoginCode() {
    const res = await this.request('/org/login-code.php', { method: 'POST', body: JSON.stringify({}) });
    return res.data;
  }

  // PUBLIC â€” resolve a school login/full code to public branding (no auth needed).
  async lookupSchool(code) {
    const res = await this.request('/organizations/lookup.php', {
      method: 'POST',
      body: JSON.stringify({ code }),
      skipAuthRedirect: true,
      silent: true,
    });
    return res.data;
  }

  // Toast UI Notification Helper
  showToast(message, type = 'info') {
    if (typeof Swal !== 'undefined') {
      // Use SweetAlert2 if loaded
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
        title: message,
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true,
      });
      return;
    }

    let container = document.querySelector('.alg-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'alg-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `alg-toast alg-toast-${type}`;
    const brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#1229ad';
    toast.style.borderLeftColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : brandColor;
    const icon = type === 'error' ? '<i class="fa-solid fa-triangle-exclamation text-danger me-2"></i>' : (type === 'success' ? '<i class="fa-solid fa-circle-check text-success me-2"></i>' : '<i class="fa-solid fa-circle-info text-primary me-2"></i>');
    toast.innerHTML = `<span class="d-inline-flex align-items-center">${icon}</span> <div>${message}</div>`;
    
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ===========================================================================
  // School Finance â€” Fee Categories / Items / Discounts / Elections / Invoices
  // ===========================================================================

  // ---- Fee Categories ----
  async getFeeCategories(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/fee-categories.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async saveFeeCategory(payload) {
    return await this.request('/finance/fee-categories.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async deleteFeeCategory(id) {
    return await this.request('/finance/fee-categories.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
  }

  // ---- Fee Items ----
  async getFeeItems(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/fee-items.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async saveFeeItem(payload) {
    return await this.request('/finance/fee-items.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async deleteFeeItem(id) {
    return await this.request('/finance/fee-items.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
  }

  // ---- Fee Discounts ----
  async getFeeDiscounts(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/fee-discounts.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async saveFeeDiscount(payload) {
    return await this.request('/finance/fee-discounts.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async deleteFeeDiscount(id) {
    return await this.request('/finance/fee-discounts.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
  }

  // ---- Student Discounts ----
  async getStudentDiscounts(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/student-discounts.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async saveStudentDiscount(payload) {
    return await this.request('/finance/student-discounts.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async deleteStudentDiscount(id) {
    return await this.request('/finance/student-discounts.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
  }

  // ---- Fee Elections ----
  async getFeeElections(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/fee-elections.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async saveFeeElection(payload) {
    return await this.request('/finance/fee-elections.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async deleteFeeElection(id) {
    return await this.request('/finance/fee-elections.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
  }

  // ---- Invoice Generation ----
  async generateInvoices(payload) {
    return await this.request('/finance/generate-invoices.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async calculateInvoice(studentId, termId, classId = null) {
    return await this.request('/finance/invoice-calculate.php', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, term_id: termId, class_id: classId }),
    });
  }

  // ---- Invoices / Payments / Ledger (tenant-scoped) ----
  async getInvoices(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/invoices.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async getPayments(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/payments.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async createInvoice(payload) {
    return await this.request('/finance/invoices.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async recordPayment(payload) {
    return await this.request('/finance/payments.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async getPaymentProofs(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/payment-proofs.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async submitPaymentProof(payload) {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    return await this.request('/finance/payment-proofs.php', {
      method: 'POST',
      body: isFormData ? payload : JSON.stringify(payload || {}),
      headers: isFormData ? {} : { 'Content-Type': 'application/json' }
    });
  }

  async approvePaymentProof(proofId, payload = {}) {
    return await this.request('/finance/payment-proofs.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'approve', proof_id: proofId }, payload || {})),
    });
  }

  async rejectPaymentProof(proofId, reason = '') {
    return await this.request('/finance/payment-proofs.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'reject', proof_id: proofId, reason: reason }),
    });
  }

  async getLedger(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/ledger.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async voidInvoice(id, orgId = null) {
    const body = { action: 'void', id };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/invoices.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateInvoice(payload) {
    return await this.request('/finance/invoices.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'update' }, payload || {})),
    });
  }

  async getFinanceReport(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/reports.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async getReminderCandidates(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/reminders.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async sendPaymentReminders(invoiceIds, orgId = null) {
    const body = { invoice_ids: Array.isArray(invoiceIds) ? invoiceIds : [] };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/reminders.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getExpenses(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/expenses.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async createExpense(payload) {
    return await this.request('/finance/expenses.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async payExpense(id, orgId = null) {
    const body = { action: 'pay', id };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/expenses.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getBudgets(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/budgets.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async createBudget(payload) {
    return await this.request('/finance/budgets.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'create' }, payload || {})),
    });
  }

  async updateBudget(payload) {
    return await this.request('/finance/budgets.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'update' }, payload || {})),
    });
  }

  async deleteBudget(id, orgId = null) {
    const body = { action: 'delete', id };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/budgets.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Download a finance CSV extract (journal/invoices/payments/expenses) with auth headers.
  async downloadFinanceExport(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const url = this.resolveEndpoint('/finance/export.php' + (qs.toString() ? '?' + qs.toString() : ''));

    const headers = { Accept: 'text/csv' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (window.algAuthToken && window.algAuthToken.isImpersonating()) {
      const ctx = window.algAuthToken.getImpersonationContext();
      if (ctx && ctx.org_id) headers['X-Impersonation-Org'] = String(ctx.org_id);
    } else if (window.algAuthToken && window.algAuthToken.getActiveOrgContext) {
      const actx = window.algAuthToken.getActiveOrgContext();
      if (actx && actx.org_id) headers['X-Active-Org'] = String(actx.org_id);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      let msg = `Export failed (HTTP ${res.status})`;
      try { const j = await res.json(); if (j && j.message) msg = j.message; } catch (e) { }
      throw new Error(msg);
    }

    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    let filename = 'alg-finance-export.csv';
    const match = /filename="?([^"]+)"?/i.exec(dispo);
    if (match && match[1]) filename = match[1].trim();

    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    return filename;
  }

  // ---- Invoice Installment Plans ----
  async getInstallmentPlan(invoiceId, orgId = null) {
    const qs = new URLSearchParams();
    qs.append('invoice_id', invoiceId);
    if (orgId) qs.append('org_id', orgId);
    const res = await this.request(`/finance/installments.php?${qs.toString()}`);
    return res.data;
  }

  async saveInstallmentPlan(payload) {
    return await this.request('/finance/installments.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'plan' }, payload || {})),
    });
  }

  async clearInstallmentPlan(invoiceId, orgId = null) {
    const body = { action: 'clear', invoice_id: invoiceId };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/installments.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getOverdueInstallments(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/installments.php${q ? '?' + q : ''}`);
    return res.data;
  }

  // ---- Bank Reconciliation ----
  async getBankTransactions(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/bank-reconciliation.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async addBankTransaction(payload) {
    return await this.request('/finance/bank-reconciliation.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'add' }, payload || {})),
    });
  }

  async importBankTransactions(transactions, orgId = null) {
    const body = { action: 'import', transactions };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/bank-reconciliation.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async matchBankTransaction(id, matchedType, matchedId, orgId = null) {
    const body = { action: 'match', id, matched_type: matchedType, matched_id: matchedId };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/bank-reconciliation.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async unmatchBankTransaction(id, orgId = null) {
    const body = { action: 'unmatch', id };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/bank-reconciliation.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async deleteBankTransaction(id, orgId = null) {
    const body = { action: 'delete', id };
    if (orgId) body.org_id = orgId;
    return await this.request('/finance/bank-reconciliation.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ---- Procurement & Vendors ----
  async getProcurement(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/procurement.php${q ? '?' + q : ''}`);
    return res.data;
  }

  // Single entry point for every procurement mutation (vendor/request/order/GRN).
  async procurementAction(action, payload = {}) {
    return await this.request('/finance/procurement.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action }, payload || {})),
    });
  }

  // ---- Payroll & Salaries ----
  async getPayroll(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/payroll.php${q ? '?' + q : ''}`);
    return res.data;
  }

  // Single entry point for every payroll mutation (component/assignment/run/payslip).
  async payrollAction(action, payload = {}) {
    return await this.request('/finance/payroll.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action }, payload || {})),
    });
  }

  // ---- Currencies & Tax ----
  async getCurrencies(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/finance/currencies.php${q ? '?' + q : ''}`);
    return res.data;
  }

  // Single entry point for every currency/tax mutation (currency/rate/tax).
  async currenciesAction(action, payload = {}) {
    return await this.request('/finance/currencies.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action }, payload || {})),
    });
  }

  // ---- Class Timetables & Schedule Engine ----
  async getTimetables(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/classes/timetables.php${q ? '?' + q : ''}`);
  }

  async saveTimetableSlot(payload = {}) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'save_slot' }, payload || {})),
    });
  }

  async deleteTimetableSlot(payload = {}) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'delete_slot' }, payload || {})),
    });
  }

  async saveTimetableTemplate(payload = {}) {
    var body = { action: 'save_template' };
    if (payload && payload.template) {
      Object.assign(body, payload);
    } else {
      body.template = payload;
    }
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async autoGenerateTimetable(classId) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'auto_generate', class_id: classId }),
    });
  }

  async clearTimetable(classId) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'clear', class_id: classId }),
    });
  }

  async copyTimetable(payload = {}) {
    return await this.request('/classes/timetables.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: 'copy_timetable' }, payload || {})),
    });
  }

  // ---- Parent & Guardian Portal ----
  async getParentPortalData(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/parents/portal.php${q ? '?' + q : ''}`);
  }

  // Guardian child attendance register (read-only). params: student_id, term_id, month (YYYY-MM)
  async getGuardianAttendance(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/parents/attendance.php${q ? '?' + q : ''}`);
  }

  async parentPayFee(payload = {}) {
    return await this.request('/parents/pay.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async activateParentPortal(payload = {}) {
    return await this.request('/parents/activate.php', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // ---- Student Dashboard & Portal ----
  async getStudentDashboardData(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    return await this.request(`/students/dashboard.php${q ? '?' + q : ''}`);
  }

  // =========================================================================
  // ONE SCHOOL BRAIN & AI INTELLIGENCE (Milestone 11)
  // =========================================================================
  async getSchoolBrainContext() {
    const res = await this.request('/ai/brain-context.php');
    return res.data;
  }

  // ---- Milestone 11: One School Brain / AI Intelligence ----

  async generateAi(messages, options = {}) {
    const res = await this.request('/ai/groq-chat.php', {
      method: 'POST',
      body: JSON.stringify(Object.assign({
        messages,
        provider: options.provider || 'groq',
        temperature: options.temperature || 0.4,
        max_tokens: options.max_tokens || 1024,
        ai_instruction: options.ai_instruction || { role: 'Miss Algorithm', category: '8 ALG Pillars', session: '2026/2027' }
      }, options))
    });
    return res.data;
  }

  // Early Warning & Anomaly Detection (11.2)
  async getEarlyWarnings(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const res = await this.request(`/ai/early-warning.php${q ? '?' + q : ''}`);
    return res.data;
  }

  async getStudentRisk(studentId) {
    const res = await this.request(`/ai/early-warning.php?student_id=${encodeURIComponent(studentId)}`);
    return res.data;
  }

  async scanEarlyWarnings() {
    const res = await this.request(`/ai/early-warning.php?min_score=25&limit=100`);
    return res.data;
  }

  // Principal Weekly AI Digest (11.3)
  async getWeeklyDigest() {
    const res = await this.request(`/ai/weekly-digest.php`);
    return res.data;
  }

  async generateWeeklyDigest() {
    const res = await this.request('/ai/weekly-digest.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'generate' })
    });
    return res.data;
  }

  // Intervention logging (11.2/11.3)
  async logIntervention(warningId, notes) {
    const res = await this.request('/ai/early-warning.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'log_intervention', warning_id: warningId, notes })
    });
    return res.data;
  }

  async dismissEarlyWarning(warningId, reason = '') {
    const res = await this.request('/ai/early-warning.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'dismiss', warning_id: warningId, reason })
    });
    return res.data;
  }

  // AI Usage telemetry (replaces hardcoded USAGE_SEED / PLAN_QUOTA)
  async getAIUsage() {
    const res = await this.request('/ai/usage.php');
    return res.data;
  }

  // Plan catalog (replaces hardcoded PLAN_QUOTA / PLAN_NAME)
  async getPlans(activeOnly = false) {
    const res = await this.request(`/plans/index.php${activeOnly ? '?active=1' : ''}`);
    return res.data;
  }

  // ---- Account Settings: API Keys ----
  async getApiKeys() {
    const res = await this.request('/settings/api-keys.php');
    return res.data;
  }

  async createApiKey(label) {
    const res = await this.request('/settings/api-keys.php', {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
    return res;
  }

  async revokeApiKey(id) {
    const res = await this.request('/settings/api-keys.php?id=' + encodeURIComponent(id), {
      method: 'DELETE',
    });
    return res.data;
  }

  // ---- Account Settings: Active Sessions ----
  async getSessions() {
    const res = await this.request('/auth/sessions.php');
    return res.data;
  }

  async revokeSession(id) {
    const res = await this.request('/auth/sessions.php?id=' + encodeURIComponent(id), {
      method: 'DELETE',
    });
    return res.data;
  }

  async revokeAllOtherSessions() {
    const res = await this.request('/auth/sessions.php', {
      method: 'DELETE',
      body: JSON.stringify({ all_other: true }),
    });
    return res.data;
  }

  // ---- Account Settings: Notification Preferences ----
  async getNotificationPreferences() {
    const res = await this.request('/settings/notifications.php');
    return res.data;
  }

  async saveNotificationPreferences(preferences) {
    const res = await this.request('/settings/notifications.php', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    });
    return res.data;
  }

  // ---- Account Settings: Billing Overview ----
  async getBillingOverview() {
    const res = await this.request('/billing/overview.php');
    return res.data;
  }
}

window.algApi = new AlgApiClient();
