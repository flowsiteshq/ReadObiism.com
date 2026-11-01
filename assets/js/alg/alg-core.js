/**
 * ==============================================================================
 * ALG Studio — Universal Core Facade (2026 Non-React Enterprise Architecture)
 * ==============================================================================
 * Developer-friendly unified gateway for all frontend operations:
 *
 *   ALG.api.request('/leads/list.php')    -> API Client with JWT, Refresh & Error Handling
 *   ALG.store.get('user')                 -> Reactive State Store
 *   ALG.store.switchOrg(2, 'School B')    -> Multi-Tenant Organization Switcher
 *   ALG.toast.success('Saved!')           -> Toast Notifications & Modals
 *   ALG.can('users.delete')               -> RBAC Permission Check
 *   ALG.hasRole('admin')                  -> RBAC Role Check
 *   ALG.Form.bind('#myForm', {...})       -> Form Validation & 422 Auto-Binder
 *   new ALG.DataTable({...})              -> Data Table with Search, Sort, Pagination, CSV
 *   new ALG.Uploader({...})               -> Drag-and-Drop Uploader with Progress
 * ==============================================================================
 */

window.ALG = {
  get config() { return window.ALG_CONFIG; },
  get Layout() { return window.ALG ? window.ALG.Layout : null; },
  get MockApi() { return window.ALG ? window.ALG.MockApi : null; },
  get api() { return window.algApi; },
  get store() { return window.algStore; },
  get toast() { return window.algToast; },
  get rbac() { return window.algRbac; },
  get cmd() { return window.algCommandPalette; },
  get DataTable() { return window.AlgDataTable; },
  get Form() { return window.AlgForm; },
  get Uploader() { return window.AlgUploader; },
  get Select() { return window.AlgSelect; },
  get PdfViewer() { return window.AlgPdfViewer; },
  get VideoPlayer() { return window.AlgVideoPlayer; },
  get auth() { return window.algAuthToken; },
  get design() { return window.algDesign; },

  // Shortcuts
  can(permission) {
    return window.algRbac ? window.algRbac.can(permission) : true;
  },

  hasRole(role) {
    return window.algRbac ? window.algRbac.hasRole(role) : true;
  },

  switchOrg(orgId, orgName, orgSlug) {
    window.algStore?.switchOrg(orgId, orgName, orgSlug);
  },

  toggleTheme() {
    if (window.algDesign) window.algDesign.toggleTheme();
    else window.algStore?.toggleTheme();
  },

  isImpersonating() {
    return window.algAuthToken ? window.algAuthToken.isImpersonating() : false;
  }
};
