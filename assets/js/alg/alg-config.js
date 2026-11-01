/**
 * ===========================================================================
 *  ALG COMPANY — CENTRAL API & PROJECT CONFIGURATION
 * ===========================================================================
 *  THIS IS WHERE YOU TELL THE BOILERPLATE WHICH BACKEND IT TALKS TO.
 *
 *  ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸
 *  STEP 1 — SET apiBaseURL below to your backend root.
 *            e.g. https://api.algorithm.institute/studio/api
 *  STEP 2 — Add any direct absolute endpoints you call "by URL" under
 *            endpoints.absolute (e.g. test-email.php). They are used as-is.
 *  STEP 3 — NEVER hardcode URLs inside page scripts. Import this file FIRST,
 *            then call window.algApi.request(...) or read ALG_CONFIG values.
 *  ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸
 *
 *  Runtime override (no file edit needed for staging/testing):
 *    window.algApi.setBaseURL('https://your-staging-url')  → saved to
 *    localStorage. window.algApi.getBaseURL() resolves in this order:
 *    localStorage override  →  apiBaseURL below.
 *    To clear the override call window.algApi.setBaseURL(null).
 * ===========================================================================
 */
window.ALG_CONFIG = {
  /* -------------------------------------------------------------------------
     BACKEND ROOT URL — paste your API URL here (no trailing slash).
     Relative endpoints below (login, leads, settings...) are appended to it.
     Full absolute URLs (like the test-email endpoint) work as-is.
     ------------------------------------------------------------------------- */
  apiBaseURL: 'https://api.algorithm.institute/studio/api',

  /* -------------------------------------------------------------------------
     PROJECT IDENTITY
     ------------------------------------------------------------------------- */
  appName: 'ALG Company Boilerplate',
  version: '2.1.0',

  /* -------------------------------------------------------------------------
     STORAGE KEYS
     ------------------------------------------------------------------------- */
  storageTokenKey: 'alg_auth_token',
  storageUserKey: 'alg_user_data',
  storageBaseURLKey: 'alg_override_api_url',

  /* -------------------------------------------------------------------------
     ENDPOINTS
     -------------------------------------------------------------------------
     There are two kinds:

       absolute  — complete URLs the backend exposes directly. The client
                   calls them exactly as written (this is the "we use URL to
                   read" pattern you described, e.g. test-email.php).

       relative  — short paths appended to apiBaseURL. If you prefer to call
                   everything by absolute URL, set these to full URLs too;
                   the client accepts both.

     Add any new endpoint here, then use it anywhere in your pages:
         window.ALG_CONFIG.endpoints.absolute.yourThing
     or request it through the client:
         window.algApi.request('https://.../create.php', { method: 'POST', ... })
     ------------------------------------------------------------------------- */
  endpoints: {
    absolute: {
      // Direct production endpoint, called verbatim (not merged with apiBaseURL):
      testEmail: 'https://api.algorithm.institute/studio/api/community/test-email.php',
      // Keep adding your "call by full URL" endpoints here:
      // health: 'https://api.algorithm.institute/studio/api/health.php',
    },

    relative: {
      // 07/08. Full Auth Suite
      login: '/auth/login.php',
      register: '/auth/register.php',
      logout: '/auth/logout.php',
      me: '/auth/me.php',
      refreshToken: '/auth/refresh-token.php',
      forgotPassword: '/auth/forgot-password.php',
      resetPassword: '/auth/reset-password.php',
      changePassword: '/auth/change-password.php',
      verifyEmail: '/auth/verify-email.php',
      otpRequest: '/auth/otp-request.php',
      otpVerify: '/auth/otp-verify.php',

      // 09. User Management & Avatar
      usersList: '/users/list.php',
      usersCreate: '/users/create.php',
      uploadAvatar: '/users/upload-avatar.php',

      // 15/16. Media & Bulk File Upload
      mediaUpload: '/media/upload.php',
      mediaUploadImages: '/media/upload-images.php',
      mediaBulkUpload: '/media/bulk-upload.php',
      mediaList: '/media/list.php',
      mediaDelete: '/media/delete.php',

      // 47/48. Excel / CSV Bulk Management
      excelDownloadTemplate: '/excel/download-template.php',
      excelImportUsers: '/excel/import-users.php',
      excelExportUsers: '/excel/export-users.php',

      // 28/29. Multi-Gateway Payment Engine (Paystack, Flutterwave, Stripe, PayPal, OPay)
      paymentsCheckout: '/payments/checkout.php',
      paymentsInitialize: '/payments/initialize.php',
      paymentsVerify: '/payments/verify.php',
      paymentsHistory: '/payments/history.php',
      paymentsWebhook: '/payments/webhook.php',

      // 08. RBAC Matrix
      rbacRoles: '/rbac/roles.php',
      rbacAssign: '/rbac/assign.php',

      // 17. Email System
      emailSend: '/email/send.php',
      emailBulkSend: '/email/bulk-send.php',
      emailTest: '/email/test-email.php',

      // Leads
      leadsCreate: '/leads/create.php',
      leadsList: '/leads/list.php',

      // Dashboard analytics
      statsSummary: '/statistics/summary.php',

      // Project / brand settings
      settingsGet: '/settings/get.php',
      settingsSave: '/settings/save.php',

      // Community helpers
      testEmail: '/community/test-email.php',
    },
  },

  /* Convenience: resolve any endpoint value (absolute or relative) to a
     fully usable URL — mirrors the logic inside AlgApiClient.request(). */
  resolveUrl: function (endpointOrUrl) {
    if (typeof endpointOrUrl !== 'string') return '';
    if (/^https?:\/\//i.test(endpointOrUrl)) return endpointOrUrl;
    const base = (this.getBaseURL ? this.getBaseURL() : this.apiBaseURL).replace(/\/+$/, '');
    const path = endpointOrUrl.startsWith('/') ? endpointOrUrl : '/' + endpointOrUrl;
    return base + path;
  },
};

/** Live base-URL resolver (localStorage override → config default). */
window.ALG_CONFIG.getBaseURL = function () {
  const key = window.ALG_CONFIG.storageBaseURLKey;
  return localStorage.getItem(key) || window.ALG_CONFIG.apiBaseURL;
};

/** Programmatic override — useful for pointing a project at staging. */
window.ALG_CONFIG.setBaseURL = function (url) {
  const key = window.ALG_CONFIG.storageBaseURLKey;
  if (url) localStorage.setItem(key, url);
  else localStorage.removeItem(key);
};