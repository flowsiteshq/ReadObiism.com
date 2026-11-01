/**
 * ALG Studio Engine - Central Project Configuration
 * 
 * Single source of truth for branding, layout themes, navigation items,
 * feature flags, and API endpoints across marketing and dashboard suites.
 */

window.ALG_CONFIG = {
  appName: "ALG Studio Engine",
  appVersion: "2026.1.0",
  tagline: "Universal Non-React Enterprise Frontend Engine",
  
  // Branding & Asset Paths
  branding: {
    logoDark: "assets/img/logo/logo-black.png",
    logoLight: "assets/img/logo/logo-white.png",
    logoDashboard: "../assets/img/logo/logo-dark.png",
    favicon: "assets/img/favicon.png",
    companyName: "ALG Innovations Institute"
  },

  // Theme & Design Tokens Overrides
  theme: {
    primaryColor: "#4F46E5",
    primaryHover: "#4338CA",
    secondaryColor: "#0EA5E9",
    borderRadius: "0.75rem",
    defaultMode: "light" // 'light' | 'dark' | 'auto'
  },

  // Environment & API Routing Configuration
  api: {
    baseUrl: "http://localhost/alg-company-backend-boilerplate/api",
    timeoutMs: 10000,
    enableMockFallback: true, // Enables local storage mock data when backend API is offline
    headers: {
      "X-Requested-With": "XMLHttpRequest"
    }
  },

  // Central Navigation Registry
  navigation: {
    // Topbar Navigation for Landing / Marketing Pages
    landingHeader: [
      { label: "Landings (17)", href: "#landing", icon: "fa-solid fa-layer-group" },
      { label: "Dashboard Suite", href: "dashboard/index.html", icon: "fa-solid fa-gauge" },
      { label: "Auth Families (50)", href: "dashboard/auth-families.html", icon: "fa-solid fa-user-shield" },
      { label: "Advanced Components", href: "dashboard/advanced-components.html", icon: "fa-solid fa-cubes" },
      { label: "Backend Spec (79-Pt)", href: "#architecture", icon: "fa-solid fa-server" }
    ],

    // Dashboard Sidebar Navigation Items
    dashboardSidebar: [
      { label: "Go to Website", href: "../index.html", icon: "fa-solid fa-globe" },
      {
        label: "Dashboard",
        icon: "fa-solid fa-tachometer-alt",
        children: [
          { label: "Dashboard 1", href: "index.html" },
          { label: "Dashboard 2", href: "index2.html" },
          { label: "Dashboard 3", href: "index3.html" },
          { label: "Dashboard 4", href: "index4.html" }
        ]
      },
      { label: "Charts", href: "chart.html", icon: "fa-solid fa-chart-bar" },
      {
        label: "Tables",
        icon: "fa-solid fa-table",
        children: [
          { label: "Tables", href: "table.html" },
          { label: "Data table", href: "data-table.html" }
        ]
      },
      {
        label: "Forms",
        icon: "fa-regular fa-square-check",
        children: [
          { label: "Forms", href: "form.html" },
          { label: "Setup wizard", href: "wizard.html" }
        ]
      },
      { label: "Calendar", href: "calendar.html", icon: "fa-solid fa-calendar-alt" },
      { label: "Maps", href: "map.html", icon: "fa-solid fa-map-marker-alt" },
      { label: "Inbox", href: "inbox.html", icon: "fa-solid fa-inbox" },
      { label: "Kanban", href: "kanban.html", icon: "fa-solid fa-columns" },
      { label: "Notifications", href: "notifications.html", icon: "fa-regular fa-bell" },
      { label: "Documentation", href: "docs.html", icon: "fa-regular fa-file-lines" },
      { label: "Backend Spec (79-Pt)", href: "../index.html#architecture", icon: "fa-solid fa-server" },
      {
        label: "Account",
        icon: "fa-solid fa-user-gear",
        children: [
          { label: "Profile & settings", href: "profile.html" },
          { label: "Pricing", href: "pricing.html" },
          { label: "Invoice", href: "invoice.html" }
        ]
      },
      {
        label: "Pages",
        icon: "fa-solid fa-copy",
        children: [
          { label: "Auth families", href: "auth-families.html" },
          { label: "Login", href: "login.html" },
          { label: "Register", href: "register.html" },
          { label: "Forgot password", href: "forget-pass.html" },
          { label: "404 not found", href: "404.html" },
          { label: "500 server error", href: "500.html" },
          { label: "Maintenance", href: "maintenance.html" }
        ]
      },
      {
        label: "UI Elements",
        icon: "fa-solid fa-desktop",
        children: [
          { label: "Advanced components", href: "advanced-components.html" },
          { label: "Buttons", href: "button.html" },
          { label: "Badges", href: "badge.html" },
          { label: "Tabs", href: "tab.html" },
          { label: "Cards", href: "card.html" },
          { label: "Alerts", href: "alert.html" },
          { label: "Progress bars", href: "progress-bar.html" },
          { label: "Modals", href: "modal.html" },
          { label: "Switches", href: "switch.html" },
          { label: "Grid system", href: "grid.html" },
          { label: "Font Awesome", href: "fontawesome.html" },
          { label: "Typography", href: "typo.html" }
        ]
      }
    ]
  },

  // Project Feature Toggles
  features: {
    enableCommandPalette: true,
    enableNotifications: true,
    enableThemeToggle: true,
    enableOfflineMode: true,
    enableAnalytics: false
  }
};
