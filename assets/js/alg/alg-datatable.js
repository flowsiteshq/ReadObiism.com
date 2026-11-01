/**
 * ==============================================================================
 * ALG Company — Universal Data Table Engine (2026 Vanilla JS)
 * ==============================================================================
 * Standard enterprise table engine supporting:
 * - Instant client-side filtering & search
 * - Clickable column sorting (ASC/DESC)
 * - Pagination controls & page size selector
 * - Multi-row selection & bulk action toolbars
 * - Built-in CSV export
 * - Empty & loading skeleton states
 * ==============================================================================
 */

class AlgDataTable {
  constructor(options = {}) {
    this.tableId = options.tableId;
    this.table = document.getElementById(this.tableId);
    this.url = options.url || null;
    this.data = options.data || [];
    this.filteredData = [...this.data];
    this.columns = options.columns || []; // [{ key: 'id', title: 'ID', sortable: true, render: fn }]
    this.pageSize = options.pageSize || 10;
    this.currentPage = 1;
    this.sortKey = options.initialSortKey || null;
    this.sortOrder = options.initialSortOrder || 'desc';
    this.selectedRows = new Set();
    this.bulkActions = options.bulkActions || []; // [{ label: 'Delete', class: 'btn-danger', action: fn }]
    this.onRowClick = options.onRowClick || null;

    if (this.table) {
      this.init();
    }
  }

  init() {
    this.wrapTable();
    this.bindSearch();
    this.renderHeaders();
    if (this.url) {
      this.fetchFromUrl();
    } else {
      this.sortAndPaginate();
    }
  }

  async fetchFromUrl() {
    this.renderSkeleton();
    try {
      let resolvedUrl = this.url;
      if (window.ALG_CONFIG?.resolveUrl && !this.url.startsWith('http')) {
        resolvedUrl = window.ALG_CONFIG.resolveUrl(this.url);
      }
      const token = localStorage.getItem('alg_auth_token');
      const headers = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(resolvedUrl, { headers });
      const json = await res.json();
      const rows = json.data?.users || json.data?.leads || json.data?.items || json.data || (Array.isArray(json) ? json : []);
      this.data = Array.isArray(rows) ? rows : [];
      this.filteredData = [...this.data];
      this.sortAndPaginate();
    } catch (err) {
      console.error('[AlgDataTable] Failed to fetch data from URL:', err);
      let tbody = this.table.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="${this.columns.length + 1}" class="text-center py-5 text-danger">
              <i class="fa-solid fa-triangle-exclamation fs-2 mb-2 d-block"></i>
              Failed to load remote data. <button class="btn btn-sm btn-outline-danger ms-2" onclick="location.reload()">Retry</button>
            </td>
          </tr>
        `;
      }
    }
  }

  reload() {
    if (this.url) {
      this.fetchFromUrl();
    } else {
      this.sortAndPaginate();
    }
  }

  renderSkeleton(count = 5) {
    let tbody = this.table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      this.table.appendChild(tbody);
    }
    const cols = this.columns.length + 1;
    tbody.innerHTML = Array.from({ length: count }, () => `
      <tr>
        <td style="width: 40px;"><div class="alg-skeleton" style="width: 18px; height: 18px; border-radius: 4px;"></div></td>
        ${Array.from({ length: cols - 1 }, () => `
          <td><div class="alg-skeleton" style="width: ${Math.floor(Math.random() * 40 + 50)}%; height: 14px; border-radius: 4px;"></div></td>
        `).join('')}
      </tr>
    `).join('');
  }


  wrapTable() {
    // Inject search & controls toolbar above table
    const wrapper = document.createElement('div');
    wrapper.className = 'alg-datatable-container mb-4';

    this.table.parentNode.insertBefore(wrapper, this.table);

    // Controls HTML
    wrapper.innerHTML = `
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div class="d-flex align-items-center gap-2">
          <div class="position-relative" style="max-width: 260px; flex: 1;">
            <i class="fa-solid fa-magnifying-glass position-absolute top-50 start-0 translate-middle-y ms-3 text-secondary" style="pointer-events: none; z-index: 4; font-size: 0.825rem;"></i>
            <input type="text" class="form-control form-control-sm ps-5 alg-dt-search" placeholder="Search records..." style="border-radius: 9999px;" />
          </div>
          <select class="form-select form-select-sm alg-dt-pagesize" style="width: 80px;">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary alg-dt-export">
            <i class="fa-solid fa-file-export me-1"></i> Export CSV
          </button>
        </div>
      </div>
      <div class="alg-bulk-toolbar d-none">
        <div><span class="fw-bold alg-bulk-count">0</span> rows selected</div>
        <div class="d-flex gap-2 alg-bulk-buttons"></div>
      </div>
      <div class="table-responsive bg-white rounded shadow-sm border">
      </div>
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 alg-dt-footer">
        <div class="text-secondary small alg-dt-info">Showing 0 to 0 of 0 entries</div>
        <nav><ul class="pagination pagination-sm mb-0 alg-dt-pagination"></ul></nav>
      </div>
    `;

    const responsiveContainer = wrapper.querySelector('.table-responsive');
    responsiveContainer.appendChild(this.table);

    this.container = wrapper;
    this.searchInput = wrapper.querySelector('.alg-dt-search');
    this.pageSizeSelect = wrapper.querySelector('.alg-dt-pagesize');
    this.exportBtn = wrapper.querySelector('.alg-dt-export');
    this.bulkToolbar = wrapper.querySelector('.alg-bulk-toolbar');
    this.bulkCount = wrapper.querySelector('.alg-bulk-count');
    this.bulkButtons = wrapper.querySelector('.alg-bulk-buttons');
    this.infoDiv = wrapper.querySelector('.alg-dt-info');
    this.paginationUl = wrapper.querySelector('.alg-dt-pagination');

    // Attach bulk action buttons
    this.bulkActions.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-sm ${b.class || 'btn-primary'}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => b.action(Array.from(this.selectedRows)));
      this.bulkButtons.appendChild(btn);
    });

    this.exportBtn.addEventListener('click', () => this.exportCsv());
    this.pageSizeSelect.addEventListener('change', (e) => {
      this.pageSize = parseInt(e.target.value);
      this.currentPage = 1;
      this.sortAndPaginate();
    });
  }

  bindSearch() {
    this.searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      this.filteredData = this.data.filter(row => {
        return Object.values(row).some(val =>
          String(val).toLowerCase().includes(q)
        );
      });
      this.currentPage = 1;
      this.sortAndPaginate();
    });
  }

  renderHeaders() {
    let thead = this.table.querySelector('thead');
    if (!thead) {
      thead = document.createElement('thead');
      this.table.appendChild(thead);
    }

    const tr = document.createElement('tr');
    tr.className = 'table-light text-secondary small text-uppercase';

    // Checkbox column
    const thCheck = document.createElement('th');
    thCheck.style.width = '40px';
    thCheck.innerHTML = '<input type="checkbox" class="form-check-input alg-dt-select-all" />';
    thCheck.querySelector('input').addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
    tr.appendChild(thCheck);

    this.columns.forEach(col => {
      const th = document.createElement('th');
      th.className = col.sortable !== false ? 'cursor-pointer user-select-none' : '';
      th.innerHTML = `
        ${col.title}
        ${col.sortable !== false ? '<i class="fa-solid fa-sort ms-1 opacity-50"></i>' : ''}
      `;

      if (col.sortable !== false) {
        th.addEventListener('click', () => this.handleSort(col.key));
      }
      tr.appendChild(th);
    });

    thead.innerHTML = '';
    thead.appendChild(tr);
  }

  handleSort(key) {
    if (this.sortKey === key) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortOrder = 'asc';
    }
    this.sortAndPaginate();
  }

  sortAndPaginate() {
    if (this.sortKey) {
      this.filteredData.sort((a, b) => {
        let valA = a[this.sortKey] ?? '';
        let valB = b[this.sortKey] ?? '';
        if (typeof valA === 'string') {
          return this.sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return this.sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    }

    const total = this.filteredData.length;
    const totalPages = Math.ceil(total / this.pageSize) || 1;
    this.currentPage = Math.min(this.currentPage, totalPages);

    const start = (this.currentPage - 1) * this.pageSize;
    const pageRows = this.filteredData.slice(start, start + this.pageSize);

    this.renderBody(pageRows);
    this.renderFooter(start, start + pageRows.length, total, totalPages);
    this.updateBulkToolbar();
  }

  renderBody(rows) {
    let tbody = this.table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      this.table.appendChild(tbody);
    }

    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${this.columns.length + 1}" class="text-center py-5 text-secondary">
            <i class="fa-solid fa-folder-open fs-2 mb-2 d-block opacity-50"></i>
            No matching records found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const rowId = row.id || JSON.stringify(row);
      const isChecked = this.selectedRows.has(rowId);

      const cells = this.columns.map(col => {
        const val = row[col.key];
        const content = typeof col.render === 'function' ? col.render(val, row) : (val ?? '');
        return `<td>${content}</td>`;
      }).join('');

      return `
        <tr data-row-id='${rowId}' class="${isChecked ? 'table-active' : ''}">
          <td><input type="checkbox" class="form-check-input alg-dt-row-check" ${isChecked ? 'checked' : ''} /></td>
          ${cells}
        </tr>
      `;
    }).join('');

    // Row checkbox events
    tbody.querySelectorAll('.alg-dt-row-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const tr = e.target.closest('tr');
        const rId = tr.getAttribute('data-row-id');
        if (e.target.checked) {
          this.selectedRows.add(rId);
          tr.classList.add('table-active');
        } else {
          this.selectedRows.delete(rId);
          tr.classList.remove('table-active');
        }
        this.updateBulkToolbar();
      });
    });
  }

  toggleSelectAll(checked) {
    this.filteredData.forEach(row => {
      const rId = row.id || JSON.stringify(row);
      if (checked) this.selectedRows.add(rId);
      else this.selectedRows.delete(rId);
    });
    this.sortAndPaginate();
  }

  updateBulkToolbar() {
    const count = this.selectedRows.size;
    if (count > 0) {
      this.bulkToolbar.classList.remove('d-none');
      this.bulkCount.textContent = count;
    } else {
      this.bulkToolbar.classList.add('d-none');
    }
  }

  renderFooter(start, end, total, totalPages) {
    this.infoDiv.textContent = `Showing ${total > 0 ? start + 1 : 0} to ${end} of ${total} entries`;

    let html = `
      <li class="page-item ${this.currentPage <= 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${this.currentPage - 1}">Prev</a>
      </li>
    `;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= this.currentPage - 1 && p <= this.currentPage + 1)) {
        html += `
          <li class="page-item ${p === this.currentPage ? 'active' : ''}">
            <a class="page-link" href="#" data-page="${p}">${p}</a>
          </li>
        `;
      }
    }

    html += `
      <li class="page-item ${this.currentPage >= totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${this.currentPage + 1}">Next</a>
      </li>
    `;

    this.paginationUl.innerHTML = html;
    this.paginationUl.querySelectorAll('.page-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const p = parseInt(e.target.dataset.page);
        if (p >= 1 && p <= totalPages) {
          this.currentPage = p;
          this.sortAndPaginate();
        }
      });
    });
  }

  setData(newData) {
    this.data = newData || [];
    this.filteredData = [...this.data];
    this.selectedRows.clear();
    this.sortAndPaginate();
  }

  exportCsv(filename = 'export.csv') {
    if (this.data.length === 0) return;
    const headers = this.columns.map(c => `"${c.title}"`).join(',');
    const rows = this.filteredData.map(r =>
      this.columns.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
    );

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

window.AlgDataTable = AlgDataTable;
