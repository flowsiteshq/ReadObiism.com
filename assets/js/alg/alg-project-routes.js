// OBI routes use the ALG router's project configuration interface.
window.OBI_DASHBOARD_VIEWS = {
  dashboard: 'overview', overview: 'overview', readers: 'records', purchases: 'records',
  gifts: 'records', bulk: 'bulk-workspace', devices: 'records', content: 'records',
  transfers: 'records', payments: 'payment-settings',
};
window.ALG_ROUTES = Object.fromEntries(Object.entries(window.OBI_DASHBOARD_VIEWS).map(
  ([name, view]) => [name, { file: `views/${view}.html`, title: 'OBI-ISM administration' }],
));
window.ALG_ALIASES = {};
window.ALG_REDIRECTS = {};
window.ALG_PROJECT = { platformRoutes: [], schoolRoutes: [] };
