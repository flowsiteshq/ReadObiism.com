/**
 * ==============================================================================
 * ALG Company — Global Command Palette Engine (Ctrl+K / Cmd+K)
 * ==============================================================================
 * Supports:
 * - Keyboard navigation (Up / Down / Enter / Esc)
 * - Quick action execution and page navigation
 * - Dynamic command registration for cloned applications
 * ==============================================================================
 */

class AlgCommandPalette {
  constructor() {
    this.commands = [];
    this.selectedIndex = 0;
    this.overlay = null;
    this.input = null;
    this.list = null;

    this.initDefaultCommands();
    this.createDom();
    this.attachListeners();
  }

  initDefaultCommands() {
    this.commands = [
      { id: 'dash', title: 'Dashboard Overview', subtitle: 'View system analytics & metrics', icon: 'fa-solid fa-chart-pie', action: () => window.location.href = '../dashboard/index.html' },
      { id: 'leads', title: 'Lead Submissions', subtitle: 'Review inquiries & contact submissions', icon: 'fa-solid fa-address-book', action: () => window.location.href = '../dashboard/leads.html' },
      { id: 'tables', title: 'Data Records & Tables', subtitle: 'Filter and export company users & data', icon: 'fa-solid fa-table', action: () => window.location.href = '../dashboard/tables.html' },
      { id: 'settings', title: 'Project Settings', subtitle: 'Configure brand colors, API endpoints & keys', icon: 'fa-solid fa-sliders', action: () => window.location.href = '../dashboard/settings.html' },
      { id: 'components', title: 'UI Component Gallery', subtitle: 'Explore buttons, cards, badges & design tokens', icon: 'fa-solid fa-layer-group', action: () => window.location.href = '../components.html' },
      { id: 'theme', title: 'Toggle Theme (Dark / Light)', subtitle: 'Switch between light and dark display modes', icon: 'fa-solid fa-circle-half-stroke', action: () => window.algStore?.toggleTheme() },
      { id: 'logout', title: 'Sign Out / Logout', subtitle: 'End session and clear auth credentials', icon: 'fa-solid fa-right-from-bracket', action: () => window.algApi?.logout() },
    ];
  }

  register(cmd) {
    this.commands.push(cmd);
  }

  createDom() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'alg-cmd-overlay';
    this.overlay.innerHTML = `
      <div class="alg-cmd-modal" role="dialog" aria-modal="true">
        <div class="d-flex align-items-center border-bottom px-3">
          <i class="fa-solid fa-magnifying-glass text-secondary me-2"></i>
          <input type="text" class="alg-cmd-input" placeholder="Type a command or search (e.g. settings, leads, theme)..." autocomplete="off" />
          <span class="badge bg-light text-secondary border px-2 py-1 small">ESC</span>
        </div>
        <ul class="alg-cmd-list"></ul>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.input = this.overlay.querySelector('.alg-cmd-input');
    this.list = this.overlay.querySelector('.alg-cmd-list');
  }

  attachListeners() {
    // Keyboard Shortcut (Ctrl+K or Cmd+K)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.open();
      }
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Input search filter
    this.input.addEventListener('input', () => {
      this.selectedIndex = 0;
      this.render();
    });

    // Keyboard navigation in list
    this.input.addEventListener('keydown', (e) => {
      const items = this.getFilteredCommands();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % items.length;
        this.render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
        this.render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[this.selectedIndex]) {
          this.execute(items[this.selectedIndex]);
        }
      }
    });
  }

  getFilteredCommands() {
    const query = this.input.value.toLowerCase().trim();
    if (!query) return this.commands;
    return this.commands.filter(c =>
      c.title.toLowerCase().includes(query) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(query))
    );
  }

  render() {
    const items = this.getFilteredCommands();
    if (items.length === 0) {
      this.list.innerHTML = `<li class="p-4 text-center text-secondary small">No commands found for "${this.input.value}".</li>`;
      return;
    }

    this.list.innerHTML = items.map((cmd, idx) => `
      <li class="alg-cmd-item ${idx === this.selectedIndex ? 'selected' : ''}" data-index="${idx}">
        <div class="d-flex align-items-center gap-3">
          <i class="${cmd.icon} text-secondary fs-5" style="width: 24px;"></i>
          <div>
            <div class="fw-semibold text-truncate">${cmd.title}</div>
            <div class="text-secondary small text-truncate">${cmd.subtitle || ''}</div>
          </div>
        </div>
        <i class="fa-solid fa-arrow-turn-down fa-rotate-90 text-secondary small opacity-50"></i>
      </li>
    `).join('');

    this.list.querySelectorAll('.alg-cmd-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        this.execute(items[idx]);
      });
    });
  }

  execute(cmd) {
    this.close();
    try { cmd.action(); } catch (err) { console.error('[AlgCommandPalette] Error:', err); }
  }

  open() {
    this.overlay.classList.add('active');
    this.input.value = '';
    this.selectedIndex = 0;
    this.render();
    setTimeout(() => this.input.focus(), 50);
  }

  close() {
    this.overlay.classList.remove('active');
  }

  isOpen() {
    return this.overlay.classList.contains('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.algCommandPalette = new AlgCommandPalette();
  window.cmdk = {
    open: () => window.algCommandPalette.open(),
    close: () => window.algCommandPalette.close()
  };
});
