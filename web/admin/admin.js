(() => {
  const $ = (id) => document.getElementById(id);
  const sections = {
    overview: ['Overview', 'A clear view of your publication and reader support.'],
    readers: ['Readers', 'Find a reader and review their account and edition access.'],
    purchases: ['Purchases', 'Review recorded purchases and edition statuses.'],
    gifts: ['Gifts & codes', 'Track gift purchases and their redemption status.'],
    bulk: ['Bulk orders', 'Manage editions for groups and organisations.'],
    devices: ['Devices', 'Review device activations linked to purchases.'],
    content: ['Book content', 'Browse the published section catalogue.'],
    transfers: ['Device transfers', 'Review recorded reader device transfers.'],
    payments: ['Payment settings', 'Manage your local payment configuration.'],
  };
  const views = {
    readers: { headers: ['Email', 'Account ID', 'Created', 'Last sign-in', 'Active editions'], fields: ['email', 'id', 'created_at', 'last_signed_in', 'active_editions'], description: 'Search by account email or ID.' },
    purchases: { headers: ['Email', 'Reference', 'Amount', 'Status', 'Recorded'], fields: ['purchaser_email', 'checkout_session_id', 'amount', 'status', 'granted_at'], description: 'Search by purchaser email or payment reference.' },
    gifts: { headers: ['Buyer', 'Recipient', 'Code ending', 'Purchase reference', 'Status', 'Created', 'Redeemed'], fields: ['buyer_email', 'recipient_email', 'code_last4', 'checkout_session_id', 'status', 'created_at', 'redeemed_at'], description: 'Search buyer email, recipient email or purchase reference. Full gift codes are hidden.' },
    devices: { headers: ['Buyer email', 'Purchase reference', 'Binding', 'Recorded'], fields: ['purchaser_email', 'checkout_session_id', 'binding_status', 'claimed_at'], description: 'Search by purchaser email or purchase reference. Gifts awaiting redemption may be unbound.' },
    content: { headers: ['Position', 'Section ID', 'Label', 'Title', 'Type'], fields: ['position', 'section_id', 'label', 'title', 'kind'], description: 'Search section titles or IDs. Reader text is not displayed.' },
    transfers: { headers: ['Reader email', 'Purchase reference', 'Transferred'], fields: ['email', 'checkout_session_id', 'created_at'], description: 'Search reader email or purchase reference. These are reader transfers, not an admin audit log.' },
  };
  const mobile = matchMedia('(max-width: 800px)');
  const menu = document.querySelector('.menu-button');
  const nav = $('navigation');
  let section = 'overview', page = 1, total = 0, query = '', requestId = 0;
  const charts = {};
  const localPaymentEditor = location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname);
  $('local-payment-panel').hidden = !localPaymentEditor;
  $('remote-payment-note').hidden = localPaymentEditor;
  $('payment-environment').textContent = localPaymentEditor
    ? 'Local test Worker only — separate from Cloudflare production.'
    : 'Configuration currently loaded by the connected Worker.';

  function toast(message, error = false) {
    const item = document.createElement('div');
    item.className = 'toast' + (error ? ' toast-error' : '');
    item.textContent = message;
    $('toasts').append(item);
    setTimeout(() => item.remove(), 5000);
  }
  function syncMenu() {
    const open = mobile.matches ? document.body.classList.contains('menu-open') : !document.body.classList.contains('sidebar-collapsed');
    menu.setAttribute('aria-expanded', String(open));
    nav.inert = !open;
  }
  function closeMenu(restoreFocus = false) {
    if (mobile.matches) document.body.classList.remove('menu-open');
    else document.body.classList.add('sidebar-collapsed');
    syncMenu();
    if (restoreFocus) menu.focus();
  }
  menu.addEventListener('click', () => {
    if (mobile.matches) document.body.classList.toggle('menu-open');
    else document.body.classList.toggle('sidebar-collapsed');
    syncMenu();
  });
  document.querySelector('.close-menu').addEventListener('click', () => closeMenu(true));
  document.querySelector('.sidebar-backdrop').addEventListener('click', () => closeMenu(true));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') closeMenu(true); });
  mobile.addEventListener('change', () => { document.body.classList.remove('menu-open', 'sidebar-collapsed'); syncMenu(); });
  syncMenu();

  async function api(path) {
    const response = await fetch('/api/admin/' + path, { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) { location.replace('./login.html'); throw new Error('Session expired.'); }
    if (!response.ok) throw new Error('Could not load dashboard data. Please check the local Worker and try again.');
    return response.json();
  }
  function drawChart(id, config) {
    if (!window.Chart) { $(id + '-text').textContent = 'Chart library unavailable.'; return; }
    charts[id]?.destroy();
    charts[id] = new Chart($(id), config);
  }
  function renderCharts(data) {
    const labels = Array.from({ length: 30 }, (_, i) => {
      const day = new Date(); day.setUTCHours(0, 0, 0, 0); day.setUTCDate(day.getUTCDate() - 29 + i);
      return day.toISOString().slice(0, 10);
    });
    const plot = (id, values, label, color, type) => {
      const counts = new Map(values.map((item) => [item.day, item.total]));
      const series = labels.map((day) => counts.get(day) || 0);
      drawChart(id, { type, data: { labels, datasets: [{ label, data: series, borderColor: color, backgroundColor: type === 'line' ? '#c69c4030' : '#d7b45e', fill: type === 'line', tension: .3, borderRadius: 4, pointRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { maxTicksLimit: 6 } } } } });
      $(id + '-text').textContent = series.reduce((sum, value) => sum + value, 0) + ' in the last 30 days.';
    };
    plot('reader-chart', data.registrations, 'Registrations', '#b58b2a', 'line');
    plot('purchase-chart', data.purchases, 'Purchases', '#b58b2a', 'bar');
    const statuses = data.statuses;
    drawChart('status-chart', { type: 'doughnut', data: { labels: statuses.length ? statuses.map((s) => s.status || 'Unknown') : ['No records'], datasets: [{ data: statuses.length ? statuses.map((s) => s.total) : [1], backgroundColor: statuses.length ? ['#b58b2a', '#253b55', '#a4b4c2', '#d8dfe5'] : ['#edf0f3'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { enabled: statuses.length > 0 } } } });
    $('status-chart-text').textContent = statuses.length ? statuses.map((s) => (s.status || 'Unknown') + ': ' + s.total).join(' · ') : 'No purchase records yet.';
  }
  async function loadOverview() {
    $('updated').textContent = 'LOADING';
    try {
      const data = await api('overview');
      $('stat-readers').textContent = data.totals.readers;
      $('stat-purchases').textContent = data.totals.purchases;
      $('stat-editions').textContent = data.totals.active_editions;
      $('stat-devices').textContent = data.totals.devices;
      $('updated').textContent = 'UPDATED ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      renderCharts(data);
      return true;
    } catch (error) {
      $('updated').textContent = 'DATA UNAVAILABLE';
      ['stat-readers', 'stat-purchases', 'stat-editions', 'stat-devices'].forEach((id) => { $(id).textContent = '—'; });
      Object.values(charts).forEach((chart) => chart.destroy());
      Object.keys(charts).forEach((key) => { delete charts[key]; });
      ['reader-chart-text', 'purchase-chart-text', 'status-chart-text'].forEach((id) => { $(id).textContent = 'Data unavailable.'; });
      toast(error.message, true);
      return false;
    }
  }
  async function loadPaymentStatus() {
    const entries = ['paystack-status', 'stripe-status', 'stripe-webhook-status'];
    entries.forEach((id) => { $(id).textContent = 'Checking…'; $(id).className = 'status'; });
    try {
      const data = await api('payment-status');
      const status = (id, configured) => {
        $(id).textContent = configured ? 'Configured' : 'Not configured';
        $(id).classList.add(configured ? 'online' : 'offline');
      };
      status('paystack-status', data.paystack.secretConfigured);
      status('stripe-status', data.stripe.secretConfigured);
      status('stripe-webhook-status', data.stripe.webhookConfigured);
      return true;
    } catch (error) {
      entries.forEach((id) => { $(id).textContent = 'Unavailable'; $(id).classList.add('offline'); });
      toast(error.message, true);
      return false;
    }
  }
  function format(field, value, record) {
    if (field === 'amount') {
      try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: record.currency }).format(record.amount_cents / 100); }
      catch { return String(record.amount_cents / 100) + ' ' + (record.currency || ''); }
    }
    if (field === 'code_last4') return value ? '••••-' + value : '—';
    if (['created_at', 'last_signed_in', 'granted_at', 'claimed_at', 'redeemed_at'].includes(field)) {
      const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '—';
    }
    return value == null || value === '' ? '—' : String(value);
  }
  async function loadTable() {
    const current = ++requestId, view = views[section], selected = section;
    $('table-message').textContent = 'Loading records…';
    $('table-body').replaceChildren();
    $('previous').disabled = $('next').disabled = true;
    const row = document.createElement('tr');
    view.headers.forEach((label) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; row.append(th); });
    $('table-head').replaceChildren(row);
    try {
      const data = await api(selected + '?' + new URLSearchParams({ q: query, page: String(page) }));
      if (current !== requestId || selected !== section) return;
      total = data.total;
      data.items.forEach((item) => {
        const tr = document.createElement('tr');
        view.fields.forEach((field) => {
          const td = document.createElement('td');
          if (field === 'status' || field === 'binding_status') {
            const badge = document.createElement('span'); badge.className = 'record-status';
            badge.dataset.status = String(item[field] || '').toLowerCase();
            badge.textContent = format(field, item[field], item); td.append(badge);
          } else td.textContent = format(field, item[field], item);
          tr.append(td);
        });
        $('table-body').append(tr);
      });
      $('table-message').textContent = data.items.length ? '' : 'No records found.';
      $('page-info').textContent = total ? `Showing ${(page - 1) * data.pageSize + 1}–${(page - 1) * data.pageSize + data.items.length} of ${total}` : '0 records';
      $('previous').disabled = page <= 1;
      $('next').disabled = page * data.pageSize >= total;
      return true;
    } catch (error) { if (current === requestId) { $('table-message').textContent = error.message; $('page-info').textContent = ''; toast(error.message, true); } return false; }
  }
  function renderSection() {
    const key = location.hash.slice(1).toLowerCase();
    section = Object.hasOwn(sections, key) ? key : 'overview';
    const [title, description] = sections[section];
    $('page-title').textContent = $('breadcrumb').textContent = title;
    $('page-description').textContent = description;
    $('overview').hidden = section !== 'overview';
    $('records').hidden = !views[section];
    $('payment-settings').hidden = section !== 'payments';
    $('feature').hidden = section === 'overview' || section === 'payments' || !!views[section];
    if (section !== 'payments') { $('payment-form').reset(); $('payment-message').textContent = ''; }
    $('feature-heading').textContent = title;
    $('feature-description').textContent = description;
    document.querySelectorAll('[data-section]').forEach((link) => {
      const active = link.dataset.section === section;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (mobile.matches) closeMenu();
    page = 1; query = ''; $('search').value = '';
    if (views[section]) {
      $('records-heading').textContent = title; $('records-description').textContent = views[section].description;
      $('search').placeholder = section === 'content' ? 'Search title or section ID' : 'Search email or reference';
      loadTable();
    }
    if (section === 'overview') loadOverview();
    if (section === 'payments') loadPaymentStatus();
  }
  $('search-form').addEventListener('submit', (event) => { event.preventDefault(); query = $('search').value.trim(); page = 1; loadTable(); });
  $('previous').addEventListener('click', () => { if (page > 1) { page--; loadTable(); } });
  $('next').addEventListener('click', () => { if (page * 10 < total) { page++; loadTable(); } });
  $('refresh').addEventListener('click', async () => {
    const loaded = section === 'overview' ? await loadOverview() : section === 'payments' ? await loadPaymentStatus() : views[section] ? await loadTable() : false;
    if (loaded) toast('Data refreshed.');
  });
  async function checkHealth() {
    const status = $('api-status'); status.textContent = 'Checking…'; status.className = 'status';
    try {
      const response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok || (await response.json()).status !== 'ok') throw new Error();
      status.textContent = 'Responding'; status.classList.add('online');
    } catch { status.textContent = 'Unavailable'; status.classList.add('offline'); }
  }
  $('retry-health').addEventListener('click', checkHealth);
  $('payment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!localPaymentEditor) return;
    const entries = [['PAYSTACK_SECRET_KEY', 'paystack-key'], ['OBI_STRIPE_SECRET_KEY', 'stripe-key'], ['OBI_STRIPE_WEBHOOK_SECRET', 'stripe-webhook-key']];
    const values = Object.fromEntries(entries.map(([name, id]) => [name, $(id).value.trim()]).filter(([, value]) => value));
    if (!Object.keys(values).length) { $('payment-message').textContent = 'Enter at least one test key.'; return; }
    $('save-payment').disabled = true;
    $('payment-message').textContent = 'Saving locally…';
    try {
      const response = await fetch('/api/admin/local-payment-settings', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save local settings.');
      $('payment-form').reset();
      $('payment-message').textContent = data.message;
      toast('Test keys saved locally. Restart the local Worker.');
    } catch (error) {
      $('payment-message').textContent = error.message || 'Could not save local settings.';
      toast('Could not save local settings.', true);
    } finally { $('save-payment').disabled = false; }
  });
  $('sign-out').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      location.replace('./login.html');
    } catch { toast('Could not sign out. Please try again.', true); }
  });
  window.addEventListener('hashchange', renderSection);
  (async () => {
    try {
      const response = await fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !(await response.json()).authenticated) throw new Error();
      document.body.classList.remove('auth-pending'); renderSection(); checkHealth();
    } catch { location.replace('./login.html'); }
  })();
})();
