/**
 * ==============================================================================
 * ALG Company — Toast Notification & Dialog Engine (2026)
 * ==============================================================================
 * Supports:
 * - Programmatic Toasts (success, error, warning, info)
 * - Auto-dismiss with progress duration
 * - Action buttons with callbacks (e.g. "Undo")
 * - Native accessible confirmation dialogs
 * ==============================================================================
 */

class AlgToastManager {
  constructor() {
    this.container = null;
  }

  ensureContainer() {
    if (!this.container || !document.body.contains(this.container)) {
      this.container = document.createElement('div');
      this.container.className = 'alg-toast-container';
      document.body.appendChild(this.container);
    }
  }

  show(message, type = 'info', options = {}) {
    this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = `alg-toast alg-toast--${type}`;
    toast.setAttribute('role', 'alert');

    // Select icon
    let iconClass = 'fa-solid fa-circle-info text-primary';
    if (type === 'success') iconClass = 'fa-solid fa-circle-check text-success';
    if (type === 'error')   iconClass = 'fa-solid fa-circle-xmark text-danger';
    if (type === 'warning') iconClass = 'fa-solid fa-triangle-exclamation text-warning';

    let actionBtnHtml = '';
    if (options.actionText && typeof options.onAction === 'function') {
      actionBtnHtml = `<button type="button" class="btn btn-sm btn-link p-0 ms-2 text-decoration-none fw-bold alg-toast-action">${options.actionText}</button>`;
    }

    toast.innerHTML = `
      <i class="${iconClass} fs-5 mt-1" aria-hidden="true"></i>
      <div class="flex-grow-1">
        <div class="fw-semibold small">${options.title || this.capitalize(type)}</div>
        <div class="text-secondary small mt-0.5">${message}</div>
      </div>
      ${actionBtnHtml}
      <button type="button" class="btn-close btn-close-sm ms-2" aria-label="Close"></button>
    `;

    // Action button handler
    if (options.actionText && options.onAction) {
      toast.querySelector('.alg-toast-action')?.addEventListener('click', () => {
        options.onAction();
        this.dismiss(toast);
      });
    }

    // Close button handler
    toast.querySelector('.btn-close')?.addEventListener('click', () => this.dismiss(toast));

    this.container.appendChild(toast);

    // Auto dismiss timer
    const duration = options.duration || 4500;
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }

    return toast;
  }

  dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 250);
  }

  success(msg, opts = {}) { return this.show(msg, 'success', opts); }
  error(msg, opts = {})   { return this.show(msg, 'error', opts); }
  warning(msg, opts = {}) { return this.show(msg, 'warning', opts); }
  info(msg, opts = {})    { return this.show(msg, 'info', opts); }

  /**
   * Confirmation Dialog Modal
   */
  confirm({ title = 'Are you sure?', message = 'This action cannot be undone.', confirmText = 'Confirm', cancelText = 'Cancel', onConfirm = () => {} }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal fade show';
      modal.style.display = 'block';
      modal.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
      modal.setAttribute('tabindex', '-1');

      modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow-lg" style="border-radius: 12px;">
            <div class="modal-header border-0 pb-0">
              <h5 class="modal-title fw-bold">${title}</h5>
              <button type="button" class="btn-close" aria-label="Close"></button>
            </div>
            <div class="modal-body text-secondary py-3">${message}</div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-sm btn-light px-3 btn-cancel">${cancelText}</button>
              <button type="button" class="btn btn-sm btn-danger px-3 btn-confirm">${confirmText}</button>
            </div>
          </div>
        </div>
      `;

      const close = () => {
        modal.remove();
      };

      modal.querySelector('.btn-close').addEventListener('click', () => { close(); resolve(false); });
      modal.querySelector('.btn-cancel').addEventListener('click', () => { close(); resolve(false); });
      modal.querySelector('.btn-confirm').addEventListener('click', () => {
        close();
        onConfirm();
        resolve(true);
      });

      document.body.appendChild(modal);
    });
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

window.algToast = new AlgToastManager();
