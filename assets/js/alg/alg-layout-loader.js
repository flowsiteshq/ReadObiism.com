/**
 * ALG Studio Engine - Dynamic Layout Loader Component Engine
 * 
 * Automatically injects, updates, and syncs headers, sidebars, offcanvas drawers,
 * and footers driven by window.ALG_CONFIG. Eliminates navigation code duplication.
 */

(function () {
  'use strict';

  class ALGLayoutLoader {
    constructor() {
      this.config = window.ALG_CONFIG || {};
      this.currentPath = window.location.pathname.split('/').pop() || 'index.html';
    }

    /**
     * Initializes layout placeholders across the DOM
     */
    init() {
      this.renderHeader();
      this.renderOffcanvas();
      this.renderSidebar();
      this.syncActiveStates();
    }

    /**
     * Renders Landing Page Topbar Header if container is present
     */
    renderHeader() {
      const headerContainer = document.querySelector('[data-alg-layout="landing-header"] nav.tp-mobile-menu-active');
      if (!headerContainer) return;

      const items = (this.config.navigation && this.config.navigation.landingHeader) || [];
      if (items.length === 0) return;

      const ulHtml = items.map(item => {
        const isActive = this.currentPath === item.href ? 'class="active"' : '';
        return `<li ${isActive}><a href="${item.href}">${item.label}</a></li>`;
      }).join('');

      headerContainer.innerHTML = `<ul class="d-flex align-items-center text-nowrap mb-0 list-unstyled">${ulHtml}</ul>`;
    }

    /**
     * Renders Mobile Offcanvas Drawer Quick Navigation
     */
    renderOffcanvas() {
      const offcanvasNav = document.querySelector('[data-alg-layout="offcanvas-nav"] nav');
      if (!offcanvasNav) return;

      const items = (this.config.navigation && this.config.navigation.landingHeader) || [];
      if (items.length === 0) return;

      const ulHtml = items.map(item => `<li><a href="${item.href}">${item.label}</a></li>`).join('');
      offcanvasNav.innerHTML = `<ul class="list-unstyled mb-0">${ulHtml}</ul>`;
    }

    /**
     * Renders Dashboard Sidebar Navigation Component (`data-alg-layout="sidebar"`)
     */
    renderSidebar() {
      const sidebarNav = document.querySelector('[data-alg-layout="dashboard-sidebar"] nav.navbar-sidebar');
      if (!sidebarNav) return;

      const items = (this.config.navigation && this.config.navigation.dashboardSidebar) || [];
      if (items.length === 0) return;

      const html = items.map(item => {
        if (item.children && item.children.length > 0) {
          const isChildActive = item.children.some(c => c.href === this.currentPath);
          const activeClass = isChildActive ? 'active has-sub' : 'has-sub';
          const openClass = isChildActive ? 'open' : '';
          const displayStyle = isChildActive ? 'style="display: block;"' : '';

          const childrenHtml = item.children.map(child => {
            const childActive = this.currentPath === child.href ? 'class="active"' : '';
            return `<li ${childActive}><a href="${child.href}">${child.label}</a></li>`;
          }).join('');

          return `
            <li class="${activeClass}">
              <a class="js-arrow ${openClass}" href="#">
                <i class="${item.icon}"></i>${item.label}
              </a>
              <ul class="list-unstyled navbar__sub-list js-sub-list" ${displayStyle}>
                ${childrenHtml}
              </ul>
            </li>
          `;
        } else {
          const isActive = this.currentPath === item.href ? 'class="active"' : '';
          return `
            <li ${isActive}>
              <a href="${item.href}">
                <i class="${item.icon}"></i>${item.label}
              </a>
            </li>
          `;
        }
      }).join('');

      sidebarNav.innerHTML = `<ul class="list-unstyled navbar__list">${html}</ul>`;
    }

    /**
     * Syncs active link visual states dynamically
     */
    syncActiveStates() {
      const allLinks = document.querySelectorAll('a[href]');
      allLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === this.currentPath || (this.currentPath === '' && href === 'index.html')) {
          link.classList.add('active');
          const parentLi = link.closest('li');
          if (parentLi) parentLi.classList.add('active');
        }
      });
    }
  }

  // Bind to global window.ALG API facade
  window.ALG = window.ALG || {};
  window.ALG.Layout = new ALGLayoutLoader();

  document.addEventListener('DOMContentLoaded', () => {
    window.ALG.Layout.init();
  });

})();
