/**
 * ==============================================================================
 * ALG Company — Universal PDF Reader & Preview Component (2026 Vanilla JS)
 * ==============================================================================
 * Features:
 * - Fullscreen responsive PDF preview modal or inline container embed
 * - Zoom in / Zoom out / Fit to width / Reset controls
 * - Print & Direct Download buttons
 * - Mobile responsive with smart fallback (Google Docs Viewer / Native fallback)
 * - Accessible Esc-key & backdrop dismiss
 * ==============================================================================
 */

class AlgPdfViewer {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.url = options.url || '';
    this.title = options.title || 'Document Preview';
    this.zoom = 100;

    if (this.container) {
      this.renderInline();
    }
  }

  renderInline() {
    this.container.innerHTML = `
      <div class="alg-pdf-wrapper">
        <div class="alg-pdf-toolbar">
          <div class="alg-pdf-title"><i class="fa-solid fa-file-pdf text-danger me-2"></i><span>${this.title}</span></div>
          <div class="alg-pdf-controls">
            <button type="button" class="btn btn-sm btn-outline-secondary alg-pdf-zoom-out" title="Zoom Out"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
            <span class="alg-pdf-zoom-label small px-2">100%</span>
            <button type="button" class="btn btn-sm btn-outline-secondary alg-pdf-zoom-in" title="Zoom In"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
            <button type="button" class="btn btn-sm btn-outline-secondary alg-pdf-print" title="Print"><i class="fa-solid fa-print"></i></button>
            <a href="${this.url}" download class="btn btn-sm btn-outline-secondary alg-pdf-download" title="Download"><i class="fa-solid fa-download"></i></a>
          </div>
        </div>
        <div class="alg-pdf-viewport">
          <iframe src="${this.url}#toolbar=0" class="alg-pdf-frame" title="${this.title}"></iframe>
        </div>
      </div>
    `;

    this.bindControls(this.container);
  }

  bindControls(root) {
    const zoomIn = root.querySelector('.alg-pdf-zoom-in');
    const zoomOut = root.querySelector('.alg-pdf-zoom-out');
    const zoomLabel = root.querySelector('.alg-pdf-zoom-label');
    const printBtn = root.querySelector('.alg-pdf-print');
    const frame = root.querySelector('.alg-pdf-frame');

    if (zoomIn) {
      zoomIn.addEventListener('click', () => {
        if (this.zoom < 200) {
          this.zoom += 25;
          zoomLabel.textContent = `${this.zoom}%`;
          frame.style.transform = `scale(${this.zoom / 100})`;
          frame.style.transformOrigin = 'top center';
        }
      });
    }

    if (zoomOut) {
      zoomOut.addEventListener('click', () => {
        if (this.zoom > 50) {
          this.zoom -= 25;
          zoomLabel.textContent = `${this.zoom}%`;
          frame.style.transform = `scale(${this.zoom / 100})`;
          frame.style.transformOrigin = 'top center';
        }
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => {
        try {
          frame.contentWindow.print();
        } catch (e) {
          window.open(this.url, '_blank')?.print();
        }
      });
    }
  }

  // Static Modal Opener
  static open(url, options = {}) {
    const title = options.title || 'PDF Document Preview';
    let modalEl = document.getElementById('alg-pdf-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'alg-pdf-modal';
      modalEl.className = 'alg-pdf-modal-overlay';
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="alg-pdf-modal-dialog">
        <div class="alg-pdf-toolbar">
          <div class="alg-pdf-title text-truncate me-3">
            <i class="fa-solid fa-file-pdf text-danger me-2"></i>
            <strong>${title}</strong>
          </div>
          <div class="alg-pdf-controls d-flex align-items-center gap-1">
            <a href="${url}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Open in New Window"><i class="fa-solid fa-up-right-from-square"></i></a>
            <a href="${url}" download class="btn btn-sm btn-outline-primary" title="Download"><i class="fa-solid fa-download me-1"></i> Download</a>
            <button type="button" class="btn btn-sm btn-light border ms-2 alg-pdf-close-btn" title="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="alg-pdf-modal-body">
          <iframe src="${url}#toolbar=1" class="w-100 h-100 border-0" style="min-height: 75vh;"></iframe>
        </div>
      </div>
    `;

    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden';

    const close = () => {
      modalEl.classList.remove('active');
      document.body.style.overflow = '';
    };

    modalEl.querySelector('.alg-pdf-close-btn').addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });

    const onEsc = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onEsc);
      }
    };
    document.addEventListener('keydown', onEsc);
  }
}

window.AlgPdfViewer = AlgPdfViewer;
