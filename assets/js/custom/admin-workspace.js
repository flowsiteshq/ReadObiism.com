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
    purchases: { headers: ['Email', 'Reference', 'Amount', 'Source', 'Status', 'Recorded'], fields: ['purchaser_email', 'checkout_session_id', 'amount', 'source', 'status', 'granted_at'], description: 'Search by purchaser email or payment reference. Local bulk tests are labelled separately.' },
    gifts: { headers: ['Buyer', 'Recipient', 'Code ending', 'Purchase reference', 'Status', 'Created', 'Redeemed'], fields: ['buyer_email', 'recipient_email', 'code_last4', 'checkout_session_id', 'status', 'created_at', 'redeemed_at'], description: 'Search buyer email, recipient email or purchase reference. Full gift codes are hidden.' },
    devices: { headers: ['Buyer email', 'Purchase reference', 'Binding', 'Recorded'], fields: ['purchaser_email', 'checkout_session_id', 'binding_status', 'claimed_at'], description: 'Search by purchaser email or purchase reference. Gifts awaiting redemption may be unbound.' },
    content: { headers: ['Position', 'Section ID', 'Label', 'Title', 'Type'], fields: ['position', 'section_id', 'label', 'title', 'kind'], description: 'Search section titles or IDs. Reader text is not displayed.' },
    transfers: { headers: ['Reader email', 'Purchase reference', 'Transferred'], fields: ['email', 'checkout_session_id', 'created_at'], description: 'Search reader email or purchase reference. These are reader transfers, not an admin audit log.' },
  };
  const mobile = matchMedia('(max-width: 800px)');
  const menu = document.querySelector('.menu-button');
  const nav = $('navigation');
  const callbackOrder = new URLSearchParams(location.search).get('bulk_order');
  let pendingBulkVerification = /^bulk_[a-f0-9]{32}$/.test(callbackOrder || '') ? callbackOrder : '';
  if (pendingBulkVerification) history.replaceState(null, '', location.pathname + '#bulk');
  let section = 'overview', page = 1, total = 0, query = '', requestId = 0;
  let bulkUnitPrices = {}, bulkGateways = {};
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
    let response;
    try { response = await window.OBI_API.fetch('/api/admin/' + path, { credentials: 'same-origin', cache: 'no-store' }); }
    catch { throw new Error('Cannot connect to the local service. Start the local Worker and web proxy, then try again.'); }
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
  async function loadPricing() {
    $('pricing-message').textContent = 'Loading prices…';
    try {
      const data = await api('pricing');
      const pricing = data.pricing || data;
      const ngn = pricing.NGN || {}, usd = pricing.USD || {};
      $('price-ngn').value = ngn.amount ?? '';
      $('price-usd').value = usd.amount ?? '';
      $('pricing-message').textContent = ngn.formatted && usd.formatted
        ? `Live: ${ngn.formatted} NGN · ${usd.formatted} USD`
        : 'Prices loaded.';
      return true;
    } catch (error) {
      $('pricing-message').textContent = error.message;
      toast(error.message, true);
      return false;
    }
  }
  async function loadBulkOrders() {
    $('bulk-list-message').textContent = 'Loading…';
    $('bulk-orders-body').replaceChildren();
    try {
      const response = await window.OBI_API.fetch('/api/admin/bulk-local', { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) { location.replace('./login.html'); return false; }
      if (response.status === 404) {
        $('bulk-list-message').textContent = 'Local bulk testing is not enabled for this Worker.';
        $('bulk-create-button').disabled = true;
        $('bulk-payment-button').disabled = true;
        $('bulk-payments-empty').textContent = 'Local bulk testing is not enabled for this Worker.';
        return false;
      }
      if (!response.ok) throw new Error('Could not load test orders.');
      const data = await response.json();
      bulkUnitPrices = data.unitPrices || {};
      bulkGateways = data.gateways || {};
      updateBulkTotal();
      $('bulk-create-button').disabled = false;
      data.items.forEach((order) => {
        const tr = document.createElement('tr');
        [order.id, '••••-' + order.code_last4, order.quantity, order.used, Math.max(0, order.quantity - order.used), 'Local test', format('created_at', order.created_at, order)].forEach((value) => {
          const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        });
        $('bulk-orders-body').append(tr);
      });
      $('bulk-list-message').textContent = data.items.length ? '' : 'No local test orders yet.';
      $('bulk-payments-body').replaceChildren();
      (data.payments || []).forEach((payment) => {
        const tr = document.createElement('tr');
        const amount = new Intl.NumberFormat(undefined, { style: 'currency', currency: payment.currency }).format(payment.total_minor / 100);
        const approval = payment.discount_percentage ? payment.discount_percentage + '% · ' + payment.approval_note + ' (' + payment.approved_by + ')' : 'Standard';
        [payment.buyer_email, payment.provider === 'stripe' ? 'Stripe' : 'Paystack', payment.quantity, amount, approval, payment.status.replaceAll('_', ' '), format('created_at', payment.created_at, payment)].forEach((value) => {
          const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        });
        const cell = document.createElement('td'), button = document.createElement('button');
        button.type = 'button'; button.className = 'outline-button';
        button.textContent = payment.status === 'paid' ? 'Show code' : 'Check payment';
        button.disabled = payment.status === 'initialization_failed';
        button.addEventListener('click', () => verifyBulkPayment(payment.id, button));
        cell.append(button); tr.append(cell); $('bulk-payments-body').append(tr);
      });
      $('bulk-payments-empty').textContent = data.payments?.length ? '' : 'No bulk test payments yet.';
      return true;
    } catch (error) { $('bulk-list-message').textContent = error.message; $('bulk-payments-empty').textContent = error.message; toast(error.message, true); return false; }
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
    $('bulk-workspace').hidden = section !== 'bulk';
    $('feature').hidden = section === 'overview' || section === 'payments' || section === 'bulk' || !!views[section];
    if (section !== 'payments') { $('payment-form').reset(); $('pricing-form').reset(); $('payment-message').textContent = ''; $('pricing-message').textContent = ''; }
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
    if (section === 'payments') { loadPaymentStatus(); loadPricing(); }
    if (section === 'bulk') {
      loadBulkOrders();
      if (pendingBulkVerification) {
        const id = pendingBulkVerification; pendingBulkVerification = '';
        verifyBulkPayment(id);
      }
    }
  }
  $('search-form').addEventListener('submit', (event) => { event.preventDefault(); query = $('search').value.trim(); page = 1; loadTable(); });
  $('previous').addEventListener('click', () => { if (page > 1) { page--; loadTable(); } });
  $('next').addEventListener('click', () => { if (page * 10 < total) { page++; loadTable(); } });
  $('refresh').addEventListener('click', async () => {
    const loaded = section === 'overview' ? await loadOverview() : section === 'payments' ? (await Promise.all([loadPaymentStatus(), loadPricing()])).every(Boolean) : section === 'bulk' ? await loadBulkOrders() : views[section] ? await loadTable() : false;
    if (loaded) toast('Data refreshed.');
  });
  async function checkHealth() {
    const status = $('api-status'); status.textContent = 'Checking…'; status.className = 'status';
    try {
      const response = await window.OBI_API.fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok || (await response.json()).status !== 'ok') throw new Error();
      status.textContent = 'Responding'; status.classList.add('online');
    } catch { status.textContent = 'Unavailable'; status.classList.add('offline'); }
  }
  $('retry-health').addEventListener('click', checkHealth);
  $('bulk-create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const quantity = Number($('bulk-quantity').value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) { $('bulk-create-message').textContent = 'Enter a whole number from 1 to 1000.'; return; }
    $('bulk-create-button').disabled = true;
    $('bulk-create-message').textContent = 'Creating local test order…';
    $('bulk-code-result').hidden = true;
    try {
      const response = await window.OBI_API.fetch('/api/admin/bulk-local', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantity }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create test order.');
      $('bulk-code').value = data.code;
      $('bulk-code-result').hidden = false;
      $('bulk-create-message').textContent = 'Local test order created. This is not a paid purchase.';
      await loadBulkOrders();
      toast('Local test order created.');
    } catch (error) { $('bulk-create-message').textContent = error.message; toast('Could not create test order.', true); }
    finally { $('bulk-create-button').disabled = false; }
  });
  $('bulk-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('bulk-code').value); toast('Test code copied.'); }
    catch { $('bulk-code').select(); toast('Select and copy the test code.'); }
  });
  function updateBulkTotal() {
    const provider = $('bulk-gateway').value;
    const currency = provider === 'stripe' ? 'USD' : 'NGN';
    const unit = Number(bulkUnitPrices[currency]) || 0;
    const configured = bulkGateways[provider] === true;
    const name = provider === 'stripe' ? 'Stripe' : 'Paystack';
    $('bulk-unit-price').textContent = unit ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(unit / 100) + ' per copy · test mode only' : 'Price unavailable';
    $('bulk-gateway-status').textContent = configured ? name + ' test key is configured.' : name + ' test key is not configured. Add it in Payment settings.';
    $('bulk-payment-button').disabled = !configured || !unit;
    const quantity = Number($('bulk-paid-quantity').value);
    const discounted = $('bulk-pricing').value === 'discount';
    const percentage = Number($('bulk-discount').value);
    $('bulk-discount-fields').hidden = !discounted;
    const validDiscount = !discounted || (Number.isInteger(percentage) && percentage >= 1 && percentage <= 99);
    const effectiveUnit = discounted && validDiscount ? Math.round(unit * (100 - percentage) / 100) : unit;
    $('bulk-test-total').textContent = unit && validDiscount && Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000
      ? 'Price per copy: ' + new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(effectiveUnit / 100) + ' · Test total: ' + new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(effectiveUnit * quantity / 100)
      : '';
  }
  $('bulk-paid-quantity').addEventListener('input', updateBulkTotal);
  $('bulk-gateway').addEventListener('change', updateBulkTotal);
  $('bulk-pricing').addEventListener('change', updateBulkTotal);
  $('bulk-discount').addEventListener('input', updateBulkTotal);
  async function verifyBulkPayment(id, button) {
    if (button) button.disabled = true;
    $('bulk-payment-message').textContent = 'Checking the test payment with its gateway…';
    try {
      const response = await window.OBI_API.fetch('/api/admin/bulk-local/verify', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not verify the test payment.');
      if (data.status !== 'paid') {
        $('bulk-payment-message').textContent = data.message || 'Payment is not confirmed yet.';
        return;
      }
      $('bulk-code').value = data.code;
      $('bulk-code-result').hidden = false;
      $('bulk-payment-message').textContent = 'Test payment confirmed. Your shared test code is ready.';
      $('bulk-code-result').scrollIntoView({ behavior: 'smooth', block: 'center' });
      await loadBulkOrders();
      toast('Test payment confirmed.');
    } catch (error) { $('bulk-payment-message').textContent = error.message; toast('Could not verify test payment.', true); }
    finally { if (button) button.disabled = false; }
  }
  $('bulk-payment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('bulk-buyer-email').value.trim(), quantity = Number($('bulk-paid-quantity').value);
    const provider = $('bulk-gateway').value;
    if (!['paystack', 'stripe'].includes(provider) || !/^\S+@\S+\.\S+$/.test(email) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) { $('bulk-payment-message').textContent = 'Choose a gateway, enter a valid email and a quantity from 1 to 1000.'; return; }
    const discount = $('bulk-pricing').value === 'discount' ? { percentage: Number($('bulk-discount').value), note: $('bulk-approval-note').value.trim(), confirmed: $('bulk-approval-confirm').checked } : null;
    if (discount && (!Number.isInteger(discount.percentage) || discount.percentage < 1 || discount.percentage > 99 || discount.note.length < 3 || discount.note.length > 200 || !discount.confirmed)) { $('bulk-payment-message').textContent = 'Enter a whole discount from 1 to 99%, an approval note and confirmation.'; return; }
    $('bulk-payment-button').disabled = true;
    $('bulk-payment-message').textContent = 'Opening test checkout…';
    try {
      const response = await window.OBI_API.fetch('/api/admin/bulk-local/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, quantity, provider, discount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start the test checkout.');
      const checkout = new URL(data.checkout_url);
      const expectedHost = provider === 'stripe' ? 'checkout.stripe.com' : 'checkout.paystack.com';
      if (checkout.protocol !== 'https:' || checkout.hostname !== expectedHost) throw new Error('Unexpected checkout address.');
      location.assign(checkout.href);
    } catch (error) { $('bulk-payment-message').textContent = error.message; toast('Could not start test checkout.', true); updateBulkTotal(); }
  });
  $('pricing-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const ngn = Number($('price-ngn').value);
    const usd = Number($('price-usd').value);
    const usdMinor = Math.round(usd * 100);
    if (!Number.isInteger(ngn) || ngn < 1 || ngn > 1000000) { $('pricing-message').textContent = 'Enter a whole Naira price from ₦1 to ₦1,000,000.'; return; }
    if (!Number.isFinite(usd) || usd < 0.01 || usd > 10000 || Math.abs(usd * 100 - usdMinor) > 1e-6) { $('pricing-message').textContent = 'Enter a Dollar price from $0.01 to $10,000 with at most two decimals.'; return; }
    $('save-pricing').disabled = true;
    $('pricing-message').textContent = 'Saving…';
    try {
      const response = await window.OBI_API.fetch('/api/admin/pricing', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ngn, usd }) });
      if (response.status === 401) { location.replace('./login.html'); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save prices.');
      const pricing = data.pricing || {};
      $('price-ngn').value = pricing.NGN?.amount ?? ngn;
      $('price-usd').value = pricing.USD?.amount ?? usd;
      $('pricing-message').textContent = `Saved. Live: ${pricing.NGN.formatted} NGN · ${pricing.USD.formatted} USD`;
      toast('Edition prices updated.');
    } catch (error) {
      $('pricing-message').textContent = error.message || 'Could not save prices.';
      toast('Could not save prices.', true);
    } finally { $('save-pricing').disabled = false; }
  });
  $('payment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!localPaymentEditor) return;
    const entries = [['PAYSTACK_SECRET_KEY', 'paystack-key'], ['OBI_STRIPE_SECRET_KEY', 'stripe-key'], ['OBI_STRIPE_WEBHOOK_SECRET', 'stripe-webhook-key']];
    const values = Object.fromEntries(entries.map(([name, id]) => [name, $(id).value.trim()]).filter(([, value]) => value));
    if (!Object.keys(values).length) { $('payment-message').textContent = 'Enter at least one test key.'; return; }
    $('save-payment').disabled = true;
    $('payment-message').textContent = 'Saving locally…';
    try {
      const response = await window.OBI_API.fetch('/api/admin/local-payment-settings', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
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
      const response = await window.OBI_API.fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      location.replace('./login.html');
    } catch { toast('Could not sign out. Please try again.', true); }
  });
  window.addEventListener('hashchange', renderSection);
  (async () => {
    try {
      const response = await window.OBI_API.fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !(await response.json()).authenticated) throw new Error();
      document.body.classList.remove('auth-pending'); renderSection(); checkHealth();
    } catch { location.replace('./login.html'); }
  })();
})();
