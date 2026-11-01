/**
 * ==============================================================================
 * ALG Company — Frontend RBAC & Permission Guard Engine (2026)
 * ==============================================================================
 * Connects frontend UI to the backend permissions matrix:
 * - Directives: data-permission="users.create", data-role="super_admin,admin"
 * - Programmatic checks: algRbac.can('users.delete'), algRbac.hasRole('admin')
 * - Automatic re-evaluation on login/logout/permission changes
 * ==============================================================================
 */

class AlgRbac {
  constructor() {
    this.init();
  }

  init() {
    // Re-evaluate whenever store updates
    if (window.algStore) {
      window.algStore.subscribe('permissions', () => this.scanDom());
      window.algStore.subscribe('user', () => this.scanDom());
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.scanDom());
    } else {
      this.scanDom();
    }
  }

  getUser() {
    return window.algStore?.get('user') || null;
  }

  getPermissions() {
    const user = this.getUser();
    if (user?.role === 'super_admin' || user?.role === 'product_admin') return ['*'];
    const base = window.algStore?.get('permissions') || user?.permissions || [];
    // Mirror the backend's academic-staff capability grant so an existing
    // session does not need a re-login after the teacher view was enabled.
    if (!(user?.is_teaching_staff === true || user?.is_teaching_staff === 1)) return base;
    return Array.from(new Set(base.concat([
      'classes.mine', 'attendance.update', 'exams.view', 'exams.mine'
    ])));
  }

  /**
   * Check if current user has permission.
   * Supports three wildcard levels:
   *   - '*'          → every permission (super admin)
   *   - 'module.*'   → every action within a module (e.g. 'roles.*')
   *   - exact key    → e.g. 'roles.manage'
   * @param {string} permissionKey e.g. 'users.delete', 'roles.view'
   * @return {boolean}
   */
  can(permissionKey) {
    if (!permissionKey) return false;
    const permissions = this.getPermissions();
    if (permissions.includes('*')) return true;
    if (permissions.includes(permissionKey)) return true;
    // Group wildcard: 'users.*' grants 'users.create', 'users.delete', ...
    const dot = permissionKey.indexOf('.');
    if (dot > 0) {
      const group = permissionKey.slice(0, dot) + '.*';
      if (permissions.includes(group)) return true;
    }
    return false;
  }

  isImpersonating() {
    try {
      if (window.algAuthToken && window.algAuthToken.isImpersonating) {
        return !!window.algAuthToken.isImpersonating();
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem('alg_impersonation_context');
      return !!(raw && raw !== 'null' && raw !== '{}');
    } catch (e) {}
    return false;
  }

  isPlatformAdmin() {
    const user = this.getUser();
    const role = String(user?.role || user?.userRole || '').toLowerCase();
    return role === 'super_admin' || role === 'product_admin';
  }

  /**
   * Check if current user has any of the specified roles.
   * Considers primary role, extra roles, and impersonation context.
   * @param {string|string[]} roles 'admin' or ['super_admin', 'admin']
   * @return {boolean}
   */
  hasRole(roles) {
    const user = this.getUser();
    if (!user) return false;
    const roleList = (Array.isArray(roles) ? roles : roles.split(',')).map(r => r.trim().toLowerCase());
    const primary = String(user.role || '').toLowerCase();
    const fallback = !primary && user.userRole ? String(user.userRole).toLowerCase() : '';
    let owned = [primary, fallback].concat((user.extra_roles || user.extraRoles || []).map(r => String(r).toLowerCase())).filter(Boolean);

    // Academic employees can carry the RBAC role `staff`. For UI navigation and
    // route gates they act as teachers, not as the broad operations-staff role.
    if ((user.is_teaching_staff === true || user.is_teaching_staff === 1) && primary === 'staff') {
      owned = owned.filter(r => r !== 'staff').concat(['teacher']);
    }

    // Form teacher recognition: appointed form teachers receive the 'form_teacher' role
    if (user.is_form_teacher === true || user.is_form_teacher === 1 || user.is_form_teacher === '1' || (Array.isArray(user.roles) && user.roles.includes('form_teacher'))) {
      if (!owned.includes('form_teacher')) owned.push('form_teacher');
    }

    // If platform admin is actively impersonating a school tenant, grant full school administrator view
    if (this.isPlatformAdmin() && this.isImpersonating()) {
      owned = owned.concat(['school_admin', 'school_owner', 'vice_principal']);
    }

    return owned.some(r => roleList.includes(r));
  }

  /**
   * Scan and enforce visibility/state on DOM elements.
   * Evaluates data-permission, data-role, and data-scope ('platform' vs 'school').
   */
  scanDom() {
    const isPlatform = this.isPlatformAdmin();
    const impersonating = this.isImpersonating();

    document.querySelectorAll('[data-permission], [data-role], [data-scope]').forEach(el => {
      const requiredPerm = el.getAttribute('data-permission');
      const roleAttr = el.getAttribute('data-role');
      const scopeAttr = el.getAttribute('data-scope'); // 'platform' | 'school'
      const mode = el.getAttribute('data-permission-mode') || 'hide'; // 'hide' | 'disable'

      const permOk = !requiredPerm || this.can(requiredPerm);
      const roleOk = !roleAttr || this.hasRole(roleAttr);

      // Scope checking:
      // - data-scope="platform": only visible if user is platform admin AND NOT impersonating
      // - data-scope="school": hidden if user is platform admin in platform mode (not impersonating).
      //   Visible when impersonating or when the user is a school persona.
      let scopeOk = true;
      if (scopeAttr === 'platform') {
        scopeOk = isPlatform && !impersonating;
      } else if (scopeAttr === 'school') {
        if (isPlatform && !impersonating) {
          scopeOk = false;
        }
      }

      // Permission "disable" mode: keep the element on screen but inert.
      if (requiredPerm && mode === 'disable') {
        if (!permOk) {
          if (el.tagName === 'A' && el.getAttribute('href') && !el.getAttribute('data-alg-href-stash')) {
            el.setAttribute('data-alg-href-stash', el.getAttribute('href'));
            el.removeAttribute('href');
          }
          el.setAttribute('disabled', 'true');
          el.classList.add('disabled');
          el.style.pointerEvents = 'none';
          el.style.opacity = '0.5';
          el.setAttribute('title', 'Permission required: ' + requiredPerm);
        } else {
          if (el.tagName === 'A' && el.getAttribute('data-alg-href-stash')) {
            el.setAttribute('href', el.getAttribute('data-alg-href-stash'));
            el.removeAttribute('data-alg-href-stash');
          }
          el.removeAttribute('disabled');
          el.classList.remove('disabled');
          el.style.pointerEvents = '';
          el.style.opacity = '';
        }
      }

      // Visibility = permission AND role AND scope
      const hiddenByPerm = !!(requiredPerm && !permOk && mode !== 'disable');
      const hiddenByRole = !!(roleAttr && !roleOk);
      const hiddenByScope = !scopeOk;

      if (hiddenByPerm || hiddenByRole || hiddenByScope) {
        // !important is required because Bootstrap display utilities such as
        // .d-inline-flex and .d-flex also carry !important.
        el.style.setProperty('display', 'none', 'important');
      } else {
        el.style.removeProperty('display');
      }
    });

    // Auto-prune empty submenu groups so headers with 0 visible children are never shown
    document.querySelectorAll('.navbar__list > li.has-sub, .navbar-mobile__list > li.has-sub').forEach(group => {
      if (group.style.display === 'none') return;
      const subList = group.querySelector('.navbar__sub-list, .navbar-mobile-sub__list');
      if (subList) {
        if (subList.hasAttribute('data-content-nav') && !subList.children.length) {
          return;
        }
        const children = Array.from(subList.querySelectorAll(':scope > li'));
        if (children.length > 0) {
          const hasVisible = children.some(c => c.style.display !== 'none');
          if (!hasVisible) {
            group.style.display = 'none';
          }
        }
      }
    });

    // If an active tab button or its parent li was hidden, switch to the first visible tab
    document.querySelectorAll('.nav.nav-pills, .nav.nav-tabs').forEach(tabstrip => {
      const activeLink = tabstrip.querySelector('.nav-link.active');
      if (activeLink) {
        const parentLi = activeLink.closest('li');
        if ((parentLi && parentLi.style.display === 'none') || activeLink.style.display === 'none') {
          activeLink.classList.remove('active');
          const targetSelector = activeLink.getAttribute('data-bs-target');
          if (targetSelector) {
            const targetPane = document.querySelector(targetSelector);
            if (targetPane) targetPane.classList.remove('show', 'active');
          }

          // Find first visible tab link
          const firstVisible = Array.from(tabstrip.querySelectorAll('.nav-link')).find(btn => {
            const p = btn.closest('li');
            return (!p || p.style.display !== 'none') && btn.style.display !== 'none';
          });
          if (firstVisible) {
            try {
              if (window.bootstrap && window.bootstrap.Tab) {
                window.bootstrap.Tab.getOrCreateInstance(firstVisible).show();
              } else {
                firstVisible.click();
              }
            } catch (e) {
              firstVisible.click();
            }
          }
        }
      }
    });
  }
}

window.algRbac = new AlgRbac();
