/**
 * ALG Router - Generic Config-Driven SPA Router (Boilerplate)
 * Asset Path: assets/js/alg/alg-router.js
 *
 * The layout shell lives in the page (sidebar/topbar) and is rendered once.
 * This router swaps only the <main> content per route. Routes come from:
 * - Base defaults (dashboard, profile, settings)
 * - Project config: window.ALG_ROUTES, window.ALG_ALIASES, window.ALG_REDIRECTS, window.ALG_PROJECT
 */
(function () {
  'use strict';

  var BASE_ROUTES = {
    dashboard: { file: 'views/dashboard.html', title: 'Dashboard' },
    profile: { file: 'views/profile.html', title: 'Profile' },
    settings: { file: 'views/settings.html', title: 'Settings' },
    'not-found': { file: 'views/404.html', title: 'Not Found' }
  };

  var PROJECT_ROUTES = (window.ALG_ROUTES) || {};
  var ROUTES = Object.assign({}, BASE_ROUTES, PROJECT_ROUTES);

  var ALIASES = (window.ALG_ALIASES) || {};
  var REDIRECTS = (window.ALG_REDIRECTS) || {};
  var ALG_PROJECT = (window.ALG_PROJECT) || {};

  var main = document.getElementById('main-content');
  var loading = document.getElementById('alg-route-loading');
  var errorBox = document.getElementById('alg-route-error');
  var loadToken = 0;

  var ASSET_BUILD = String(Date.now());

  window.ALG_VIEW_INIT = window.ALG_VIEW_INIT || {};

  function getRoleDefaultRoute() {
    var user = null;
    try { user = JSON.parse(localStorage.getItem('alg_user_data') || 'null'); } catch (e) {}
    var role = String(user ? (user.role || user.userRole || '') : '').toLowerCase();
    var isPlatform = role === 'super_admin' || role === 'product_admin';
    var impersonating = false;
    try {
      if (window.algAuthToken && typeof window.algAuthToken.isImpersonating === 'function') {
        impersonating = !!window.algAuthToken.isImpersonating();
      }
    } catch (e) {}
    if (isPlatform && !impersonating && ALG_PROJECT.platformRoutes && ALG_PROJECT.platformRoutes.length) {
      for (var i = 0; i < ALG_PROJECT.platformRoutes.length; i++) {
        if (ROUTES[ALG_PROJECT.platformRoutes[i]]) return ALG_PROJECT.platformRoutes[i];
      }
    }
    if (user && (user.is_teaching_staff === true || role === 'teacher' || role === 'form_teacher') && ROUTES['teacher-dashboard']) {
      return 'teacher-dashboard';
    }
    if (role === 'student' && ROUTES['student-dashboard']) return 'student-dashboard';
    if (role === 'parent' && ROUTES['parent-dashboard']) return 'parent-dashboard';
    if ((role === 'school_admin' || role === 'school_owner') && ROUTES['school-dashboard']) return 'school-dashboard';
    if (ROUTES.dashboard) return 'dashboard';
    var keys = Object.keys(ROUTES);
    return keys.length ? keys[0] : 'dashboard';
  }

  function isPlatformAdmin() {
    var user = null;
    try { user = JSON.parse(localStorage.getItem('alg_user_data') || 'null'); } catch (e) {}
    var role = String(user ? (user.role || user.userRole || '') : '').toLowerCase();
    return role === 'super_admin' || role === 'product_admin';
  }

  function isImpersonating() {
    try {
      if (window.algAuthToken && typeof window.algAuthToken.isImpersonating === 'function') {
        return !!window.algAuthToken.isImpersonating();
      }
    } catch (e) {}
    try {
      var raw = localStorage.getItem('alg_impersonation_context');
      return !!(raw && raw !== 'null' && raw !== '{}');
    } catch (e) {}
    return false;
  }

  function isAllowed(routeConf, routeName) {
    var rbac = window.algRbac || window.AlgRbac;
    var PLATFORM = ALG_PROJECT.platformRoutes || [];
    var SCHOOL = ALG_PROJECT.schoolRoutes || [];
    var isPlatform = isPlatformAdmin();
    var impersonating = isImpersonating();

    if (PLATFORM.length) {
      if (!isPlatform && PLATFORM.indexOf(routeName) !== -1) return false;
      if (isPlatform && !impersonating && SCHOOL.indexOf(routeName) !== -1) return false;
      if (isPlatform && impersonating && PLATFORM.indexOf(routeName) !== -1) return false;
    }

    if (!rbac) {
      if (window.algPlanGate && typeof window.algPlanGate.routeAllowed === 'function' && routeName) {
        return window.algPlanGate.routeAllowed(routeName);
      }
      return true;
    }

    if (routeConf && routeConf.roles) {
      var roleList = String(routeConf.roles).split(',').map(function (r) { return r.trim().toLowerCase(); });
      var user = null;
      try { user = JSON.parse(localStorage.getItem('alg_user_data') || 'null'); } catch (e) {}
      var role = String(user ? (user.role || user.userRole || '') : '').toLowerCase();
      var roles = [];
      if (role) roles.push(role);
      if (user && Array.isArray(user.roles)) user.roles.forEach(function (r) { if (r) roles.push(String(r).toLowerCase()); });
      if (user && Array.isArray(user.extra_roles)) user.extra_roles.forEach(function (r) { if (r) roles.push(String(r).toLowerCase()); });
      var hasRole = roles.some(function (r) { return roleList.indexOf(r) !== -1; });
      if (!hasRole && roleList.length) return false;
    }

    if (routeConf && routeConf.permission && typeof rbac.can === 'function') {
      if (!rbac.can(routeConf.permission)) return false;
    }

    if (window.algPlanGate && typeof window.algPlanGate.routeAllowed === 'function' && routeName) {
      return window.algPlanGate.routeAllowed(routeName);
    }
    return true;
  }

  function currentRoute() {
    var raw = (location.hash || '').replace(/^#\/?/, '').toLowerCase();
    var name = raw.split('?')[0].split('/')[0];
    name = ALIASES[name] || name;
    if (REDIRECTS[name]) return REDIRECTS[name];
    if (name === '' || !ROUTES[name]) {
      var preferred = getRoleDefaultRoute();
      if (ROUTES[preferred] && isAllowed(ROUTES[preferred], preferred)) return preferred;
      var keys = Object.keys(ROUTES);
      for (var i = 0; i < keys.length; i++) {
        if (isAllowed(ROUTES[keys[i]], keys[i])) return keys[i];
      }
      return 'dashboard';
    }
    return name;
  }

  function setActiveRoute(name) {
    document.querySelectorAll('.navbar-sidebar li.active, .navbar-mobile li.active').forEach(function (li) {
      li.classList.remove('active');
    });
    var selector = '.navbar-sidebar a[href="#/' + name + '"], .navbar-mobile a[href="#/' + name + '"]';
    document.querySelectorAll(selector).forEach(function (link) {
      var li = link.closest('li');
      if (!li) return;
      li.classList.add('active');
      var subList = li.closest('.navbar__sub-list, .navbar-mobile-sub__list');
      if (subList) {
        subList.classList.add('open');
        subList.style.display = 'block';
        var parentLi = subList.closest('.has-sub');
        if (parentLi) {
          parentLi.classList.add('active');
          var arrow = parentLi.querySelector('.js-arrow');
          if (arrow) arrow.classList.add('open');
        }
      }
    });
  }

  function triggerViewInitializers(routeName) {
    try { if (typeof window.initGlobal === 'function') window.initGlobal(); } catch (e) {}
    var inits = window.ALG_VIEW_INIT || {};
    var fns = [];
    if (Array.isArray(inits[routeName])) fns = fns.concat(inits[routeName]);
    if (Array.isArray(inits['*'])) fns = fns.concat(inits['*']);
    for (var i = 0; i < fns.length; i++) {
      try { if (typeof fns[i] === 'function') fns[i](routeName); } catch (e) {}
    }
    try { if (window.__coolReinit) window.__coolReinit(); } catch (e) {}
    try { if (window.ALG && window.ALG.avatar && window.ALG.avatar.init) window.ALG.avatar.init(); } catch (e) {}
    try { if (window.algRbac && window.algRbac.scanDom) window.algRbac.scanDom(); } catch (e) {}
    try { if (window.algPlanGate && window.algPlanGate.scanDom) window.algPlanGate.scanDom(); } catch (e) {}
  }

  function executeViewScripts(container, routeName) {
    if (!container) return;
    var scripts = container.querySelectorAll('script');
    scripts.forEach(function (oldScript) {
      var newScript = document.createElement('script');
      Array.prototype.forEach.call(oldScript.attributes, function (attr) {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      if (oldScript.src) {
        var srcAttr = oldScript.getAttribute('src') || '';
        var cleanSrc = srcAttr.replace(/([?&])v=[^&]*/, '').replace(/\?$/, '');
        newScript.setAttribute('src', cleanSrc + (cleanSrc.indexOf('?') === -1 ? '?' : '&') + 'v=' + ASSET_BUILD);
        newScript.onload = function () { triggerViewInitializers(routeName); };
      }
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
    triggerViewInitializers(routeName);
  }

  function afterMount(routeName) {
    try {
      if (window.algModal && window.algModal.closeAll) window.algModal.closeAll();
      document.querySelectorAll('.modal-backdrop').forEach(function (b) { b.remove(); });
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');
    } catch (e) {}
    try { executeViewScripts(main, routeName); } catch (e) {}
    try { triggerViewInitializers(routeName); } catch (e) {}
    try { if (window.initCounters) initCounters(); } catch (e) {}
    try { if (window.initModernProgressBars) initModernProgressBars(); } catch (e) {}
    try { if (window.initLightbox) initLightbox(); } catch (e) {}
    try { if (window.refreshUserIdentity) window.refreshUserIdentity(); } catch (e) {}
    try { if (window.ALG && window.ALG.richEditor && window.ALG.richEditor.scan) window.ALG.richEditor.scan(main); } catch (e) {}
    window.scrollTo(0, 0);
  }

  function load(name, preserveUrl) {
    name = ALIASES[name] || name;
    if (REDIRECTS[name]) { location.hash = '#/' + REDIRECTS[name]; return; }
    if (!ROUTES[name]) name = getRoleDefaultRoute();

    var conf = ROUTES[name];
    if (!isAllowed(conf, name)) {
      var target = getRoleDefaultRoute();
      if (target !== name) {
        history.replaceState(null, '', '#/' + target);
        load(target, true);
        return;
      }
    }

    var token = ++loadToken;
    if (loading) loading.hidden = false;
    if (errorBox) errorBox.hidden = true;

    fetch(conf.file + (conf.file.indexOf('?') === -1 ? '?' : '&') + 'v=' + ASSET_BUILD)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
      .then(function (html) {
        if (token !== loadToken) return;
        if (loading) loading.hidden = true;
        if (!main) return;
        main.innerHTML = html;
        document.title = conf.title || name;
        setActiveRoute(name);
        afterMount(name);
      })
      .catch(function () {
        if (token !== loadToken) return;
        if (loading) loading.hidden = true;
        if (errorBox && main) {
          main.innerHTML = '';
          errorBox.hidden = false;
        }
        document.title = 'Error';
      });

    if (!preserveUrl && ('#/' + name) !== location.hash) {
      history.replaceState(null, '', '#/' + name);
    }
  }

  function navigate(name) {
    name = ALIASES[name] || name;
    if (ROUTES[name] && location.hash !== '#/' + name) {
      location.hash = '#/' + name;
    } else {
      load(name, true);
    }
  }

  window.addEventListener('hashchange', function () { load(currentRoute(), true); });

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var m = href.match(/^([a-z0-9_-]+)\.html(#.*)?$/i);
    if (m) {
      var nm = (ALIASES[m[1].toLowerCase()] || m[1].toLowerCase());
      if (ROUTES[nm]) {
        e.preventDefault();
        navigate(nm);
      }
    }
  });

  function initialRoute() { load(currentRoute(), true); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialRoute);
  } else {
    initialRoute();
  }

  window.ALG_ROUTER = {
    navigate: navigate,
    getRoute: currentRoute,
    routes: ROUTES,
    load: load
  };
})();
