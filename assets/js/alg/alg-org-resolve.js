/**
 * ALG School OS — Org Context Resolver (synchronous boot-time script)
 *
 * Runs in <head> before alg-store.js. Detects which school (org) the user
 * is on from three deployment modes (subdomain / custom-domain / query param),
 * calls the resolve API synchronously, and writes the result to localStorage
 * so alg-store.js hydrates with the correct branding on first paint.
 *
 * In dev (localhost) the resolver falls back to the platform org (id 1).
 * If the API is unreachable, localStorage is left untouched so the app
 * still works offline with the last-resolved or default org.
 */
(function () {
  'use strict';

  var resolveEndpoint = (function () {
    try {
      // Build API root from stored override or config default
      var key = 'alg_override_api_url';
      var base = localStorage.getItem(key) || (window.ALG_CONFIG && window.ALG_CONFIG.apiBaseURL) || 'https://api.algorithm.institute/studio/api';
      return base.replace(/\/+$/, '') + '/org/resolve.php';
    } catch (e) { return null; }
  })();

  if (!resolveEndpoint) return;

  var host = (location.hostname || '').replace(/:\d+$/, '').toLowerCase();
  var urlParam = (new URLSearchParams(location.search)).get('org') || '';

  var isLocalDev = (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.indexOf('.') < 0 ||
    location.protocol === 'file:'
  );

  var customApiOverride = false;
  try {
    customApiOverride = !!localStorage.getItem('alg_override_api_url');
  } catch (e) {}

  // In local dev without explicit API override, initialize active org fallback without making network request
  if (isLocalDev && !customApiOverride) {
    if (!localStorage.getItem('alg_active_org')) {
      var defaultOrg = {
        id: 1,
        name: 'Algorithm Institute',
        slug: urlParam || 'platform',
        mode: 'platform',
        legalName: 'Algorithm Institute Platform'
      };
      try {
        localStorage.setItem('alg_active_org', JSON.stringify(defaultOrg));
      } catch (e) {}
    }
    return;
  }

  // Already resolved this session — skip the call.
  var existing = localStorage.getItem('alg_active_org');
  if (existing && urlParam === '' && host.indexOf('.') < 0) return;

  try {
    var xhr = new XMLHttpRequest();
    var url = resolveEndpoint;
    if (urlParam) {
      url += '?slug=' + encodeURIComponent(urlParam);
    }
    xhr.open('GET', url, false);  // synchronous — blocks <head>
    xhr.send(null);

    if (xhr.status >= 200 && xhr.status < 300) {
      var res = JSON.parse(xhr.responseText);
      if (res.success && res.data) {
        localStorage.setItem('alg_active_org', JSON.stringify(res.data));
      }
    }
  } catch (e) {
    // Network failure / CORS — leave localStorage untouched (offline fallback).
  }
})();
