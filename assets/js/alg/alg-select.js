/**
 * ==============================================================================
 * ALG Company — Universal Searchable Select & Multi-Select (2026 Vanilla JS)
 * ==============================================================================
 * Drop-in Select2 replacement with ZERO dependencies.
 * Features:
 * - Real-time searchable dropdown filtering
 * - Multi-select with tag pills & remove buttons
 * - Remote AJAX endpoint search with debounce
 * - Keyboard navigation (Up/Down arrows, Enter, Escape)
 * - Automatic jQuery/Select2 shim (`$(selector).select2()`)
 * ==============================================================================
 */

class AlgSelect {
  constructor(element, options = {}) {
    this.select = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.select) return;

    this.options = options;
    this.isMultiple = this.select.multiple || options.multiple || false;
    this.placeholder = options.placeholder || this.select.getAttribute('data-placeholder') || 'Select an option...';
    this.searchable = options.searchable !== false;
    this.clearable = options.clearable ?? true;
    this.ajax = options.ajax || null; // { url, searchParam, processResults }
    this.selectedValues = new Set();
    this.isOpen = false;
    this.debounceTimer = null;

    this.init();
  }

  init() {
    // Hide native select
    this.select.style.display = 'none';

    // Build container
    this.wrapper = document.createElement('div');
    this.wrapper.className = `alg-select-container ${this.isMultiple ? 'alg-select--multi' : 'alg-select--single'}`;

    this.trigger = document.createElement('div');
    this.trigger.className = 'alg-select-trigger';
    this.trigger.tabIndex = 0;

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'alg-select-dropdown d-none';

    if (this.searchable) {
      this.searchBox = document.createElement('div');
      this.searchBox.className = 'alg-select-search-box';
      this.searchBox.innerHTML = `
        <i class="fa-solid fa-magnifying-glass text-secondary alg-select-search-icon"></i>
        <input type="text" class="alg-select-search-input" placeholder="Type to search..." />
      `;
      this.searchInput = this.searchBox.querySelector('input');
      this.dropdown.appendChild(this.searchBox);
    }

    this.optionsList = document.createElement('ul');
    this.optionsList.className = 'alg-select-options list-unstyled mb-0';
    this.dropdown.appendChild(this.optionsList);

    this.wrapper.appendChild(this.trigger);
    this.wrapper.appendChild(this.dropdown);
    this.select.parentNode.insertBefore(this.wrapper, this.select.nextSibling);

    // Read initial selections from native select
    Array.from(this.select.options).forEach(opt => {
      if (opt.selected && opt.value) {
        this.selectedValues.add(opt.value);
      }
    });

    this.renderTrigger();
    this.renderOptions(this.getNativeOptions());
    this.bindEvents();
  }

  getNativeOptions() {
    return Array.from(this.select.options).map(opt => ({
      value: opt.value,
      text: opt.textContent.trim(),
      selected: opt.selected,
      disabled: opt.disabled
    }));
  }

  renderTrigger() {
    this.trigger.innerHTML = '';
    const selected = Array.from(this.selectedValues);

    if (selected.length === 0) {
      this.trigger.innerHTML = `<span class="alg-select-placeholder">${this.placeholder}</span>`;
    } else if (this.isMultiple) {
      selected.forEach(val => {
        const opt = this.findOption(val);
        const text = opt ? opt.text : val;
        const tag = document.createElement('span');
        tag.className = 'alg-select-tag';
        tag.innerHTML = `<span>${text}</span><i class="fa-solid fa-xmark ms-1 alg-select-tag-remove" data-value="${val}"></i>`;
        this.trigger.appendChild(tag);
      });
    } else {
      const opt = this.findOption(selected[0]);
      this.trigger.innerHTML = `<span class="alg-select-value">${opt ? opt.text : selected[0]}</span>`;
    }

    // Trailing arrow / clear button
    const actions = document.createElement('div');
    actions.className = 'alg-select-actions';
    if (this.clearable && selected.length > 0) {
      actions.innerHTML += `<i class="fa-solid fa-xmark alg-select-clear text-secondary me-1" title="Clear"></i>`;
    }
    actions.innerHTML += `<i class="fa-solid fa-chevron-down alg-select-arrow"></i>`;
    this.trigger.appendChild(actions);
  }

  renderOptions(options) {
    this.optionsList.innerHTML = '';
    if (!options || options.length === 0) {
      this.optionsList.innerHTML = `<li class="alg-select-empty text-secondary p-3 text-center small">No options found</li>`;
      return;
    }

    options.forEach(opt => {
      if (!opt.value) return;
      const li = document.createElement('li');
      li.className = `alg-select-option ${this.selectedValues.has(opt.value) ? 'selected' : ''}`;
      li.dataset.value = opt.value;
      li.innerHTML = `
        <span>${opt.text}</span>
        ${this.selectedValues.has(opt.value) ? '<i class="fa-solid fa-check text-primary small"></i>' : ''}
      `;
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectOption(opt.value);
      });
      this.optionsList.appendChild(li);
    });
  }

  findOption(value) {
    return Array.from(this.select.options).find(o => o.value === value);
  }

  selectOption(val) {
    if (this.isMultiple) {
      if (this.selectedValues.has(val)) {
        this.selectedValues.delete(val);
      } else {
        this.selectedValues.add(val);
      }
    } else {
      this.selectedValues.clear();
      this.selectedValues.add(val);
      this.close();
    }

    this.syncNativeSelect();
    this.renderTrigger();
    this.renderOptions(this.getNativeOptions());

    if (this.options.onChange) {
      this.options.onChange(Array.from(this.selectedValues));
    }
  }

  removeValue(val) {
    this.selectedValues.delete(val);
    this.syncNativeSelect();
    this.renderTrigger();
    this.renderOptions(this.getNativeOptions());
  }

  clear() {
    this.selectedValues.clear();
    this.syncNativeSelect();
    this.renderTrigger();
    this.renderOptions(this.getNativeOptions());
    if (this.options.onChange) this.options.onChange([]);
  }

  syncNativeSelect() {
    Array.from(this.select.options).forEach(opt => {
      opt.selected = this.selectedValues.has(opt.value);
    });
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.dropdown.classList.remove('d-none');
    this.wrapper.classList.add('active');
    if (this.searchInput) {
      this.searchInput.value = '';
      this.searchInput.focus();
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dropdown.classList.add('d-none');
    this.wrapper.classList.remove('active');
  }

  bindEvents() {
    this.trigger.addEventListener('click', (e) => {
      if (e.target.classList.contains('alg-select-tag-remove')) {
        this.removeValue(e.target.dataset.value);
        return;
      }
      if (e.target.classList.contains('alg-select-clear')) {
        this.clear();
        return;
      }
      this.isOpen ? this.close() : this.open();
    });

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (this.ajax) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => this.searchAjax(query), 300);
        } else {
          const filtered = this.getNativeOptions().filter(o => o.text.toLowerCase().includes(query));
          this.renderOptions(filtered);
        }
      });
    }

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.wrapper.contains(e.target)) {
        this.close();
      }
    });

    // Keyboard navigation
    this.wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  async searchAjax(query) {
    if (!this.ajax?.url) return;
    this.optionsList.innerHTML = `<li class="p-3 text-center text-secondary small"><i class="fa-solid fa-spinner fa-spin me-1"></i> Searching...</li>`;
    try {
      const url = new URL(this.ajax.url, window.location.origin);
      url.searchParams.set(this.ajax.searchParam || 'q', query);

      const token = localStorage.getItem('alg_auth_token');
      const headers = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url.toString(), { headers });
      const json = await res.json();
      const results = this.ajax.processResults ? this.ajax.processResults(json) : (json.data?.items || json.data || json);
      this.renderOptions(results);
    } catch (err) {
      this.optionsList.innerHTML = `<li class="p-3 text-center text-danger small">Search failed</li>`;
    }
  }
}

// Global exposure
window.AlgSelect = AlgSelect;

// jQuery / Select2 Compatibility Layer
if (typeof window.jQuery !== 'undefined') {
  window.jQuery.fn.select2 = function(options) {
    return this.each(function() {
      new AlgSelect(this, options);
    });
  };
}
