/**
 * ==============================================================================
 * ALG Company — Universal File & Media Upload Component (2026 Vanilla JS)
 * ==============================================================================
 * Supports:
 * - Single & Multi-file drag & drop queue
 * - Direct backend syncing with ALG API routes:
 *     - 'media':  /api/media/upload.php (single file + folder)
 *     - 'images': /api/media/upload-images.php (multiple images)
 *     - 'avatar': /api/users/upload-avatar.php (profile avatar)
 *     - 'bulk':   /api/media/bulk-upload.php (bulk media)
 * - Per-file thumbnail preview, size calculation, progress indicator
 * - Auto JWT Bearer authorization from localStorage
 * - Toast notifications on completion
 * ==============================================================================
 */

class AlgUploader {
  constructor(options = {}) {
    this.container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;

    this.mode = options.mode || 'media'; // 'media' | 'images' | 'avatar' | 'bulk'
    this.folder = options.folder || 'general';
    this.multiple = options.multiple ?? (this.mode === 'images' || this.mode === 'bulk');
    this.maxFileSize = options.maxFileSize || 15728640; // 15MB
    this.allowedTypes = options.allowedTypes || (this.mode === 'avatar' || this.mode === 'images'
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : ['image/*', 'application/pdf', '.csv', '.xlsx', '.docx', '.zip']);

    this.compress = options.compress !== false; // enabled by default for images
    this.compressOptions = Object.assign({ maxWidth: 1920, maxHeight: 1920, quality: 0.85 }, options.compressOptions);
    this.onSuccess = options.onSuccess || (() => {});
    this.onError = options.onError || (() => {});
    this.queue = [];

    if (this.container) {
      this.init();
      if (options.initialFiles && Array.isArray(options.initialFiles)) {
        this.loadExisting(options.initialFiles);
      }
    }
  }

  resolveEndpoint() {
    const endpoints = {
      media: '/media/upload.php',
      images: '/media/upload-images.php',
      avatar: '/users/upload-avatar.php',
      bulk: '/media/bulk-upload.php'
    };
    const path = endpoints[this.mode] || '/media/upload.php';
    return window.ALG_CONFIG?.resolveUrl ? window.ALG_CONFIG.resolveUrl(path) : path;
  }

  init() {
    this.container.innerHTML = `
      <div class="alg-uploader-wrapper">
        <div class="alg-dropzone" role="button" tabindex="0">
          <input type="file" class="d-none alg-file-input" ${this.multiple ? 'multiple' : ''} accept="${this.allowedTypes.join(',')}" />
          <div class="alg-dropzone-icon mb-2"><i class="fa-solid fa-cloud-arrow-up fs-1 text-primary"></i></div>
          <div class="fw-bold mb-1">Drag &amp; drop files here, or <span class="text-primary text-decoration-underline">browse</span></div>
          <div class="text-secondary small">
            ${this.mode === 'avatar' ? 'Square image recommended (JPG, PNG, WebP) up to 5MB' : 'Supports images, documents, PDF, CSV, ZIP up to 15MB'}
          </div>
        </div>
        <div class="alg-upload-queue mt-3 d-none">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="small fw-bold text-secondary">Upload Queue (<span class="alg-queue-count">0</span>)</span>
            <button type="button" class="btn btn-sm btn-primary alg-upload-all-btn d-none">
              <i class="fa-solid fa-upload me-1"></i> Upload All
            </button>
          </div>
          <div class="alg-queue-list d-flex flex-column gap-2"></div>
        </div>
      </div>
    `;

    this.dropzone = this.container.querySelector('.alg-dropzone');
    this.fileInput = this.container.querySelector('.alg-file-input');
    this.queueContainer = this.container.querySelector('.alg-upload-queue');
    this.queueCount = this.container.querySelector('.alg-queue-count');
    this.queueList = this.container.querySelector('.alg-queue-list');
    this.uploadAllBtn = this.container.querySelector('.alg-upload-all-btn');

    this.bindEvents();
  }

  bindEvents() {
    this.dropzone.addEventListener('click', () => this.fileInput.click());

    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('dragover');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('dragover');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.addFiles(Array.from(e.dataTransfer.files));
      }
    });

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.addFiles(Array.from(e.target.files));
      }
    });

    this.uploadAllBtn.addEventListener('click', () => {
      this.uploadQueue();
    });
  }

  async addFiles(files) {
    for (const rawFile of files) {
      if (rawFile.size > this.maxFileSize) {
        window.algToast?.error(`${rawFile.name} exceeds max size of ${Math.round(this.maxFileSize / 1048576)}MB.`);
        continue;
      }

      let fileToUpload = rawFile;
      let previewUrl = null;

      if (rawFile.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(rawFile);
        if (this.compress && !rawFile.type.includes('svg') && !rawFile.type.includes('gif')) {
          try {
            fileToUpload = await this.compressImage(rawFile, this.compressOptions);
          } catch (err) {
            console.warn('[AlgUploader] Image compression fallback to raw file:', err);
            fileToUpload = rawFile;
          }
        }
      }

      const id = 'f_' + Math.random().toString(36).substring(2, 9);
      this.queue.push({
        id,
        file: fileToUpload,
        originalFile: rawFile,
        previewUrl,
        status: 'pending',
        progress: 0,
        result: null
      });
    }

    this.renderQueue();

    // In single file mode or avatar mode, auto-upload immediately
    if (!this.multiple || this.queue.length === 1) {
      this.uploadQueue();
    }
  }

  compressImage(file, { maxWidth = 1920, maxHeight = 1920, quality = 0.85 }) {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob((blob) => {
          if (blob && blob.size < file.size) {
            const compressedFile = new File([blob], file.name, {
              type: mime,
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            resolve(file); // keep original if already smaller
          }
        }, mime, quality);
      };
      img.onerror = () => resolve(file);
      img.src = objectUrl;
    });
  }

  loadExisting(files) {
    files.forEach(f => {
      this.queue.push({
        id: 'f_' + Math.random().toString(36).substring(2, 9),
        file: { name: f.name || 'Image', size: f.size || 0 },
        previewUrl: f.url || f.src || '',
        status: 'success',
        progress: 100,
        result: f
      });
    });
    this.renderQueue();
  }

  renderQueue() {
    if (this.queue.length === 0) {
      this.queueContainer.classList.add('d-none');
      return;
    }

    this.queueContainer.classList.remove('d-none');
    this.queueCount.textContent = this.queue.length;

    const hasPending = this.queue.some(f => f.status === 'pending');
    this.uploadAllBtn.classList.toggle('d-none', !hasPending || !this.multiple);

    this.queueList.innerHTML = this.queue.map(item => {
      const returnUrl = item.result?.url || item.result?.path || item.previewUrl;
      const isImg = (item.file.type && item.file.type.startsWith('image/')) || (item.previewUrl && item.previewUrl.length > 0);

      return `
        <div class="alg-queue-item p-2 border rounded bg-white d-flex align-items-center justify-content-between gap-3" id="${item.id}">
          <div class="d-flex align-items-center gap-3 text-truncate" style="max-width: 65%;">
            ${isImg && returnUrl ? `
              <img src="${returnUrl}" alt="${item.file.name}" class="rounded shadow-sm" style="width: 44px; height: 44px; object-fit: cover; border: 1px solid rgba(0,0,0,0.1); flex-shrink: 0;" />
            ` : `
              <div class="d-flex align-items-center justify-content-center bg-light rounded" style="width: 44px; height: 44px; flex-shrink: 0;">
                <i class="${this.getFileIcon(item.file.name)} fs-4 text-primary"></i>
              </div>
            `}
            <div class="text-truncate">
              <div class="fw-semibold small text-truncate">${item.file.name}</div>
              <div class="text-secondary" style="font-size: 0.75rem;">
                ${this.formatSize(item.file.size)}
                ${item.originalFile && item.originalFile.size > item.file.size ? ` <span class="badge bg-success-subtle text-success ms-1">Compressed -${Math.round((1 - item.file.size/item.originalFile.size)*100)}%</span>` : ''}
              </div>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2" style="min-width: 140px; justify-content: flex-end;">
            <div class="alg-item-status small">
              ${item.status === 'uploading' ? `<div class="progress" style="width: 80px; height: 6px;"><div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: ${item.progress}%"></div></div>` : ''}
              ${item.status === 'success' ? `
                <div class="d-flex align-items-center gap-1">
                  <span class="badge bg-success"><i class="fa-solid fa-check me-1"></i>Uploaded</span>
                  ${returnUrl ? `<a href="${returnUrl}" target="_blank" class="btn btn-xs btn-outline-secondary p-1 px-2" style="font-size:0.7rem;" title="View Returned Image"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
                </div>
              ` : ''}
              ${item.status === 'error' ? '<span class="badge bg-danger"><i class="fa-solid fa-xmark me-1"></i>Failed</span>' : ''}
            </div>
            ${item.status === 'pending' ? `<button type="button" class="btn btn-sm btn-link text-danger p-0" onclick="window._algUploaderRemove('${item.id}')"><i class="fa-solid fa-trash-can"></i></button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    window._algUploaderRemove = (id) => {
      this.queue = this.queue.filter(q => q.id !== id);
      this.renderQueue();
    };
  }

  async uploadQueue() {
    const pending = this.queue.filter(q => q.status === 'pending');
    if (pending.length === 0) return;

    for (const item of pending) {
      await this.uploadSingle(item);
    }
  }

  uploadSingle(item) {
    return new Promise((resolve) => {
      item.status = 'uploading';
      this.renderQueue();

      const formData = new FormData();
      const fieldName = this.mode === 'avatar' ? 'avatar' : (this.mode === 'images' ? 'images[]' : 'file');
      formData.append(fieldName, item.file);
      formData.append('folder', this.folder);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.resolveEndpoint(), true);

      const token = localStorage.getItem('alg_auth_token');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          item.progress = Math.round((e.loaded / e.total) * 100);
          this.renderQueue();
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let res = {};
          try { res = JSON.parse(xhr.responseText); } catch (e) {}
          item.status = 'success';
          item.result = res.data || res;
          if (item.result?.url) {
            item.previewUrl = item.result.url;
          }
          window.algToast?.success(`Uploaded ${item.file.name}`);
          this.onSuccess(item.file, item.result);
        } else {
          item.status = 'error';
          let err = {};
          try { err = JSON.parse(xhr.responseText); } catch (e) {}
          window.algToast?.error(err.message || `Failed to upload ${item.file.name}`);
          this.onError(err);
        }
        this.renderQueue();
        resolve();
      };

      xhr.onerror = () => {
        item.status = 'error';
        window.algToast?.error(`Network error uploading ${item.file.name}`);
        this.renderQueue();
        resolve();
      };

      xhr.send(formData);
    });
  }

  getFileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return 'fa-solid fa-file-image';
    if (ext === 'pdf') return 'fa-solid fa-file-pdf text-danger';
    if (['csv', 'xlsx', 'xls'].includes(ext)) return 'fa-solid fa-file-excel text-success';
    if (['doc', 'docx'].includes(ext)) return 'fa-solid fa-file-word text-primary';
    if (['zip', 'rar', 'tar'].includes(ext)) return 'fa-solid fa-file-zipper text-warning';
    return 'fa-solid fa-file-lines';
  }

  formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
}

window.AlgUploader = AlgUploader;

