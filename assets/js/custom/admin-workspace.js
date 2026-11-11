(() => {
  const $ = (id) => document.getElementById(id);
  const sections = {
    overview: ['Overview', 'A clear view of your publication and reader support.'],
    readers: ['Readers', 'Find a reader and review their account and edition access.'],
    purchases: ['Purchases', 'Review recorded purchases and edition statuses.'],
    feedback: ['Reader feedback', 'Ratings and comments from readers with active access.'],
    forensics: ['Forensic watermark', 'Decode the invisible copy reference from leaked text.'],
    gifts: ['Gifts & codes', 'Track gift purchases and their redemption status.'],
    bulk: ['Bulk orders', 'Manage editions for groups and organisations.'],
    devices: ['Devices', 'Review device activations linked to purchases.'],
    content: ['Book content', 'Browse the published section catalogue.'],
    transfers: ['Device transfers', 'Review recorded reader device transfers.'],
    features: ['Features', 'Turn public product features on or off.'],
    payments: ['Payment settings', 'Manage your local payment configuration.'],
  };
  const views = {
    readers: { headers: ['Email', 'Account ID', 'Created', 'Last sign-in', 'Active editions', 'Expires', 'Days left', 'Action'], fields: ['email', 'id', 'created_at', 'last_signed_in', 'active_editions', 'next_expiry', 'days_left'], description: 'Search by account email or ID. Expires and days left show the soonest expiry among active editions. Reset sends a recovery email or creates a temporary password shown once.' },
    purchases: { headers: ['Email', 'Reference', 'Amount', 'Source', 'Status', 'Recorded'], fields: ['purchaser_email', 'checkout_session_id', 'amount', 'source', 'status', 'granted_at'], description: 'Search by purchaser email or payment reference. Local bulk tests are labelled separately.' },
    feedback: { headers: ['Reader', 'Purchase reference', 'Rating', 'Comment', 'Submitted', 'Updated'], fields: ['purchaser_email', 'checkout_session_id', 'rating', 'comment', 'created_at', 'updated_at'], description: 'Search reader email, purchase reference or comment. Only readers with active access can submit feedback.' },
    gifts: { headers: ['Buyer', 'Recipient', 'Code ending', 'Purchase reference', 'Status', 'Created', 'Redeemed'], fields: ['buyer_email', 'recipient_email', 'code_last4', 'checkout_session_id', 'status', 'created_at', 'redeemed_at'], description: 'Search buyer email, recipient email or purchase reference. Full gift codes are hidden.' },
    devices: { headers: ['Buyer email', 'Purchase reference', 'Device', 'Binding', 'Recorded'], fields: ['purchaser_email', 'checkout_session_id', 'metadata', 'binding_status', 'claimed_at'], description: 'Search by purchaser email or purchase reference. Gifts awaiting redemption may be unbound. Device metadata is recorded from new claims.' },
    content: { headers: ['Position', 'Section ID', 'Label', 'Title', 'Type'], fields: ['position', 'section_id', 'label', 'title', 'kind'], description: 'Search section titles or IDs. Reader text is not displayed.' },
    transfers: { headers: ['Reader email', 'Purchase reference', 'Device', 'Transferred'], fields: ['email', 'checkout_session_id', 'metadata', 'created_at'], description: 'Search reader email or purchase reference. Device metadata is recorded for each transfer.' },
  };
  const mobile = matchMedia('(max-width: 800px)');
  const menu = document.querySelector('.menu-button');
  const nav = $('navigation');
  const callbackOrder = new URLSearchParams(location.search).get('bulk_order');
  let pendingBulkVerification = /^bulk_[a-f0-9]{32}$/.test(callbackOrder || '') ? callbackOrder : '';
  if (pendingBulkVerification) history.replaceState(null, '', location.pathname + '#bulk');
  let section = 'overview', page = 1, total = 0, query = '', requestId = 0;
  let bulkUnitPrices = {}, bulkGateways = {}, selectedBulkOrder = '', selectedBulkClaims = null, selectedReader = null;
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
  const formatPricingAmount = (amount, code) => {
    try {
      return new Intl.NumberFormat(code === 'NGN' ? 'en-NG' : 'en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: code === 'USD' ? 2 : 0,
        maximumFractionDigits: code === 'USD' ? 2 : 0,
      }).format(amount);
    } catch { return `${code === 'NGN' ? '₦' : '$'}${amount}`; }
  };
  const updatePricingPreview = () => {
    const ngn = Number($('price-ngn').value);
    const usd = Number($('price-usd').value);
    const days = Number($('access-days')?.value || 365);
    const ngnText = Number.isFinite(ngn) && ngn > 0 ? formatPricingAmount(ngn, 'NGN') : '—';
    const usdText = Number.isFinite(usd) && usd > 0 ? formatPricingAmount(usd, 'USD') : '—';
    $('pricing-preview').textContent = `Landing page: ${ngnText} NGN · ${usdText} USD · ${Number.isFinite(days) && days > 0 ? days : 365} days access`;
  };
  async function loadPricing() {
    $('pricing-message').textContent = 'Loading prices…';
    try {
      const data = await api('pricing');
      const pricing = data.pricing || data;
      const ngn = pricing.NGN || {}, usd = pricing.USD || {};
      $('price-ngn').value = ngn.amount ?? '';
      $('price-usd').value = usd.amount ?? '';
      if ($('access-days')) $('access-days').value = pricing.accessDays ?? 365;
      updatePricingPreview();
      $('pricing-message').textContent = '';
      return true;
    } catch (error) {
      $('pricing-message').textContent = error.message;
      toast(error.message, true);
      return false;
    }
  }
  async function loadEditions() {
    const status = $('editions-status');
    const list = $('editions-list');
    if (!status || !list) return false;
    status.textContent = 'Loading edition and subscription status…';
    list.replaceChildren();
    try {
      const data = await api('editions');
      const subs = data.subscriptions || {};
      const live = data.live;
      status.textContent = `Active subscriptions: ${Number(subs.active || 0)} · expiring in 30 days: ${Number(subs.expiring || 0)} · expired: ${Number(subs.expired || 0)} · access duration: ${Number(data.accessDays || 365)} days.`;
      (data.editions || []).forEach((edition) => {
        const row = document.createElement('div');
        row.className = 'payment-status-row';
        const meta = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `${edition.label || `Edition ${edition.edition_no}`}${edition.is_live ? ' (live)' : ' (archived)'}`;
        const detail = document.createElement('p');
        const published = edition.published_at ? new Date(edition.published_at).toLocaleDateString() : '—';
        detail.textContent = `${Number(edition.section_count || 0)} sections · ${Number(edition.paragraph_count || 0)} paragraphs · published ${published}${edition.source ? ` · ${edition.source}` : ''}`;
        meta.append(title, detail);
        const badge = document.createElement('span');
        badge.className = `status ${edition.is_live ? 'on' : ''}`;
        badge.textContent = edition.is_live ? 'Live' : 'Archived';
        row.append(meta, badge);
        list.append(row);
      });
      if (!(data.editions || []).length) status.textContent = live ? `Live edition: ${live.label || live.edition_no}` : 'No edition records found.';
      return true;
    } catch (error) {
      status.textContent = error.message || 'Could not load editions.';
      return false;
    }
  }
  async function loadFeatures() {
    const list = $('feature-list');
    if (!list) return false;
    $('feature-message').textContent = 'Loading features…';
    list.replaceChildren();
    try {
      const response = await window.OBI_API.fetch('/api/admin/features', { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) { location.replace('./login.html'); return false; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load features.');
      (data.features || []).forEach((feature) => {
        const row = document.createElement('div');
        row.className = 'feature-row';
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = feature.label || feature.key;
        const description = document.createElement('p');
        description.textContent = feature.description || '';
        copy.append(title, description);
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(feature.enabled);
        input.setAttribute('aria-label', `${feature.label || feature.key}: ${feature.enabled ? 'on' : 'off'}`);
        input.addEventListener('change', async () => {
          input.disabled = true;
          const next = input.checked;
          try {
            const update = await window.OBI_API.fetch('/api/admin/features', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ key: feature.key, enabled: next }),
            });
            const body = await update.json().catch(() => ({}));
            if (!update.ok) throw new Error(body.error || 'Could not update this feature.');
            feature.enabled = next;
            input.setAttribute('aria-label', `${feature.label || feature.key}: ${next ? 'on' : 'off'}`);
            $('feature-message').textContent = `${feature.label || feature.key} is now ${next ? 'on' : 'off'}.`;
            toast(`${feature.label || feature.key} ${next ? 'enabled' : 'disabled'}.`);
          } catch (error) {
            input.checked = !next;
            $('feature-message').textContent = error.message;
            toast(error.message, true);
          } finally {
            input.disabled = false;
          }
        });
        row.append(copy, input);
        list.append(row);
      });
      $('feature-message').textContent = '';
      return true;
    } catch (error) {
      $('feature-message').textContent = error.message;
      toast(error.message, true);
      return false;
    }
  }
  async function loadProductionBulkOrders() {
    const body = $('production-bulk-body');
    if (!body) return false;
    $('production-bulk-message').textContent = 'Loading production orders…';
    body.replaceChildren();
    try {
      const data = await api('bulk-orders?page=1');
      (data.items || []).forEach((order) => {
        const tr = document.createElement('tr');
        let amount;
        try { amount = new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(order.total_minor / 100); }
        catch { amount = String(order.total_minor / 100) + ' ' + (order.currency || ''); }
        [order.buyer_email, order.id, order.quantity, order.claim_count || order.claimed_seats || 0, amount, order.provider === 'stripe' ? 'Stripe' : 'Paystack', String(order.status || '').replaceAll('_', ' '), format('created_at', order.created_at, order), format('created_at', order.paid_at, order)].forEach((value) => {
          const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        });
        const action = document.createElement('td');
        const view = document.createElement('button');
        view.type = 'button'; view.className = 'outline-button'; view.textContent = 'CLAIMS';
        view.addEventListener('click', () => openBulkClaims(order.id));
        action.append(view); tr.append(action); body.append(tr);
      });
      $('production-bulk-message').textContent = data.items?.length ? '' : 'No production bulk orders yet.';
      return true;
    } catch (error) {
      $('production-bulk-message').textContent = error.message;
      toast(error.message, true);
      return false;
    }
  }
  async function openBulkClaims(orderId) {
    if (!/^bprod_[a-f0-9]{32}$/.test(orderId || '')) return;
    selectedBulkOrder = orderId;
    const panel = $('bulk-claims-panel');
    if (!panel) return;
    panel.hidden = false;
    $('bulk-claims-message').textContent = 'Loading claims…';
    $('bulk-claims-body').replaceChildren();
    try {
      const data = await api('bulk-order?order_id=' + encodeURIComponent(orderId));
      selectedBulkClaims = data;
      const order = data.order || {};
      $('bulk-claims-message').textContent = 'Claims and access controls for this order.';
      $('bulk-claims-summary').textContent = `${order.receipt_email || order.buyer_email || 'Buyer'} · ${order.quantity || 0} copies · ${order.claimed || 0} claimed · ${order.remaining || 0} remaining · ${order.claims_open ? 'claims open' : 'claims closed'}.`;
      $('bulk-claims-alerts').textContent = data.alerts?.length ? '⚠ ' + data.alerts.join(' · ') : 'No duplicate device or network pattern detected.';
      $('bulk-claims-body').replaceChildren();
      (data.claims || []).forEach((claim) => {
        const tr = document.createElement('tr');
        const contact = [claim.phone, claim.email && !String(claim.email).startsWith('phone_') ? claim.email : ''].filter(Boolean).join(' · ') || 'No contact';
        const risk = claim.device_claims > 1 ? `${claim.device_claims} on device` : claim.ip_claims > 1 ? `${claim.ip_claims} on network` : 'OK';
        [claim.email || claim.account_id, contact, claim.reference, claim.device, risk, format('created_at', claim.claimed_at, claim), claim.status].forEach((value) => {
          const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        });
        $('bulk-claims-body').append(tr);
      });
      if (!data.claims?.length) {
        const tr = document.createElement('tr'); const td = document.createElement('td');
        td.colSpan = 7; td.textContent = 'No claims yet.'; tr.append(td); $('bulk-claims-body').append(tr);
      }
      const revoked = Boolean(order.revoked_at);
      $('bulk-pause').disabled = revoked || !order.claims_open;
      $('bulk-resume').disabled = revoked || Boolean(order.claims_open);
      $('bulk-revoke').disabled = revoked;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      $('bulk-claims-message').textContent = error.message;
      toast(error.message, true);
    }
  }
  async function bulkOrderAction(action) {
    if (!selectedBulkOrder) return;
    if (action === 'revoke' && !confirm('Revoke this code? Existing readers will lose access and no new claims will be allowed.')) return;
    const labels = { pause: 'Pausing claims…', resume: 'Resuming claims…', revoke: 'Revoking code…' };
    $('bulk-claims-message').textContent = labels[action] || 'Updating order…';
    try {
      const response = await window.OBI_API.fetch('/api/admin/bulk-order/action', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: selectedBulkOrder, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { location.replace('./login.html'); return; }
      if (!response.ok) throw new Error(data.error || 'Could not update this order.');
      await openBulkClaims(selectedBulkOrder);
      await loadProductionBulkOrders();
      toast(action === 'pause' ? 'New claims paused.' : action === 'resume' ? 'Claims resumed.' : 'Code revoked.');
    } catch (error) {
      $('bulk-claims-message').textContent = error.message;
      toast(error.message, true);
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
  function expiryBadgeStatus(item) {
    if (Number(item.active_editions) < 1) return 'none';
    if (item.next_expiry == null || item.next_expiry === '') return 'none';
    const days = Math.ceil((Date.parse(item.next_expiry) - Date.now()) / 86400000);
    if (days <= 0) return 'expired';
    if (days <= 30) return 'soon';
    if (days <= 90) return 'warn';
    return 'ok';
  }
  function format(field, value, record) {
    if (field === 'next_expiry') {
      if (Number(record.active_editions) < 1) return '—';
      if (value == null || value === '') return 'No expiry';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
    }
    if (field === 'days_left') {
      if (Number(record.active_editions) < 1) return '—';
      if (record.next_expiry == null || record.next_expiry === '') return 'No expiry';
      const days = Math.ceil((Date.parse(record.next_expiry) - Date.now()) / 86400000);
      if (days <= 0) return 'Expired';
      return days === 1 ? '1 day left' : `${days} days left`;
    }
    if (field === 'rating') {
      const labels = { 1: '😞 Not for me', 2: '😕 It was okay', 3: '🙂 Good', 4: '😊 Loved it', 5: '🤩 Transforming' };
      return labels[Number(value)] || '—';
    }
    if (field === 'amount') {
      try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: record.currency }).format(record.amount_cents / 100); }
      catch { return String(record.amount_cents / 100) + ' ' + (record.currency || ''); }
    }
    if (field === 'metadata') {
      try {
        const meta = JSON.parse(value || '{}');
        return [meta.platform, meta.mobile ? 'Mobile' : 'Desktop', meta.country, meta.city].filter(Boolean).join(' · ') || '—';
      } catch { return '—'; }
    }
    if (field === 'code_last4') return value ? '••••-' + value : '—';
    if (['created_at', 'last_signed_in', 'granted_at', 'claimed_at', 'redeemed_at', 'updated_at'].includes(field)) {
      const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '—';
    }
    return value == null || value === '' ? '—' : String(value);
  }
  function openReaderReset(item) {
    selectedReader = item;
    const panel = $('reader-reset-panel');
    if (!panel) return;
    panel.hidden = false;
    $('reader-reset-result').hidden = true;
    $('reader-reset-password').value = '';
    $('reader-reset-message').textContent = 'Choose how to help this reader sign in again.';
    const contact = item.phone || (item.recovery_email ? item.email : 'No recovery email');
    const provider = item.auth_provider ? ` ? ${item.auth_provider}` : '';
    $('reader-reset-summary').textContent = `${item.email || item.id} ? ${contact}${provider}`;
    $('reader-reset-email').disabled = !item.recovery_email;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function resetReaderPassword(mode) {
    if (!selectedReader) return;
    if (mode === 'temporary' && !confirm('Create a temporary password? Existing reader sign-ins will be revoked.')) return;
    $('reader-reset-message').textContent = mode === 'email' ? 'Sending reset email?' : 'Creating temporary password?';
    $('reader-reset-email').disabled = true;
    $('reader-reset-temporary').disabled = true;
    try {
      const response = await window.OBI_API.fetch('/api/admin/readers/password-reset', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: selectedReader.id, mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { location.replace('./login.html'); return; }
      if (!response.ok) throw new Error(data.error || 'Could not reset this reader password.');
      if (mode === 'email') {
        $('reader-reset-message').textContent = data.message || 'Reset email sent.';
        toast('Reset email sent.');
      } else {
        $('reader-reset-message').textContent = data.message || 'Temporary password created.';
        $('reader-reset-password').value = data.temporary_password || '';
        $('reader-reset-result').hidden = !data.temporary_password;
        toast('Temporary password created.');
      }
    } catch (error) {
      $('reader-reset-message').textContent = error.message;
      toast(error.message, true);
    } finally {
      $('reader-reset-email').disabled = !selectedReader?.recovery_email;
      $('reader-reset-temporary').disabled = false;
    }
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
          } else if (field === 'days_left') {
            const status = expiryBadgeStatus(item);
            if (status === 'none') td.textContent = format('days_left', null, item);
            else { const badge = document.createElement('span'); badge.className = 'record-status'; badge.dataset.status = status; badge.textContent = format('days_left', null, item); td.append(badge); }
          } else td.textContent = format(field, item[field], item);
          tr.append(td);
        });
        if (section === 'readers') {
          const action = document.createElement('td');
          action.className = 'reader-action';
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'outline-button'; button.textContent = 'RESET';
          button.addEventListener('click', () => openReaderReset(item));
          action.append(button); tr.append(action);
        }
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
    $('forensics').hidden = section !== 'forensics';
    $('features').hidden = section !== 'features';
    $('feature').hidden = section === 'overview' || section === 'payments' || section === 'bulk' || section === 'forensics' || section === 'features' || !!views[section];
    if (section !== 'payments') { $('payment-form').reset(); $('pricing-form').reset(); $('payment-message').textContent = ''; $('pricing-message').textContent = ''; }
    if (section !== 'readers' && $('reader-reset-panel')) { $('reader-reset-panel').hidden = true; selectedReader = null; }
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
      $('search').placeholder = section === 'content' ? 'Search title or section ID' : section === 'feedback' ? 'Search reader, reference or comment' : 'Search email or reference';
      loadTable();
    }
    if (section === 'overview') loadOverview();
    if (section === 'features') loadFeatures();
    if (section === 'payments') { loadPaymentStatus(); loadPricing(); loadEditions(); }
    if (section === 'bulk') {
      loadProductionBulkOrders();
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
    const loaded = section === 'overview' ? await loadOverview() : section === 'features' ? await loadFeatures() : section === 'payments' ? (await Promise.all([loadPaymentStatus(), loadPricing()])).every(Boolean) : section === 'bulk' ? (await Promise.all([loadBulkOrders(), loadProductionBulkOrders()])).some(Boolean) : views[section] ? await loadTable() : false;
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
  $('bulk-pause').addEventListener('click', () => bulkOrderAction('pause'));
  $('bulk-resume').addEventListener('click', () => bulkOrderAction('resume'));
  $('bulk-revoke').addEventListener('click', () => bulkOrderAction('revoke'));
  $('reader-reset-close')?.addEventListener('click', () => { $('reader-reset-panel').hidden = true; selectedReader = null; });
  $('reader-reset-email')?.addEventListener('click', () => resetReaderPassword('email'));
  $('reader-reset-temporary')?.addEventListener('click', () => resetReaderPassword('temporary'));
  $('reader-reset-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('reader-reset-password').value || ''); toast('Temporary password copied.'); }
    catch { $('reader-reset-password').select(); toast('Select and copy the temporary password.'); }
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
  $('price-ngn').addEventListener('input', updatePricingPreview);
  $('price-usd').addEventListener('input', updatePricingPreview);
  $('pricing-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const ngn = Number($('price-ngn').value);
    const usd = Number($('price-usd').value);
    const accessDays = Number($('access-days')?.value || 365);
    const usdMinor = Math.round(usd * 100);
    if (!Number.isInteger(ngn) || ngn < 1 || ngn > 1000000) { $('pricing-message').textContent = 'Enter a naira amount from 1 to 1,000,000.'; return; }
    if (!Number.isFinite(usd) || usd < 0.01 || usd > 10000 || Math.abs(usd * 100 - usdMinor) > 1e-6) { $('pricing-message').textContent = 'Enter a dollar amount from $0.01 to $10,000.00, using cents only.'; return; }
    if (!Number.isInteger(accessDays) || accessDays < 1 || accessDays > 3650) { $('pricing-message').textContent = 'Enter an access duration from 1 to 3650 days.'; return; }
    $('save-pricing').disabled = true;
    $('pricing-message').textContent = 'Saving…';
    try {
      const response = await window.OBI_API.fetch('/api/admin/pricing', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ngn, usd, accessDays }) });
      if (response.status === 401) { location.replace('./login.html'); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save prices.');
      const pricing = data.pricing || {};
      $('price-ngn').value = pricing.NGN?.amount ?? ngn;
      $('price-usd').value = pricing.USD?.amount ?? usd;
      if ($('access-days')) $('access-days').value = pricing.accessDays ?? accessDays;
      updatePricingPreview();
      $('pricing-message').textContent = 'Saved. The landing page will show these prices and new purchases use this access duration.';
      toast('Edition prices updated.');
      if (typeof loadEditions === 'function') loadEditions();
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
  async function decodeForensic() {
    const input = $('forensic-input'), message = $('forensic-message'), results = $('forensic-results');
    if (!input || !message || !results) return;
    const text = input.value;
    if (!text.trim()) { message.textContent = 'Paste a passage first.'; return; }
    message.textContent = 'Decoding…';
    results.replaceChildren();
    try {
      const response = await window.OBI_API.fetch('/api/admin/forensic', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (response.status === 401) { location.replace('./login.html'); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not decode the watermark.');
      const ids = data.ids || [], matches = data.matches || [];
      message.textContent = ids.length ? `${ids.length} identifier(s) found.` : 'No watermark found in this passage.';
      results.replaceChildren();
      if (!ids.length) {
        const empty = document.createElement('p');
        empty.className = 'forensic-empty';
        empty.textContent = 'No invisible identifier was found. The passage may have been retyped, or an app stripped the zero-width characters.';
        results.append(empty);
        return;
      }
      const label = document.createElement('p');
      label.className = 'forensic-result-label';
      label.textContent = matches.length ? 'MATCHED PURCHASE' : 'UNMATCHED COPY IDENTIFIER';
      results.append(label);
      if (matches.length) {
        matches.forEach((match) => {
          const card = document.createElement('div'); card.className = 'forensic-match';
          const title = document.createElement('strong'); title.textContent = match.purchaser_email || 'Unknown reader';
          const details = document.createElement('small'); details.textContent = `${match.checkout_session_id} · ${format('created_at', match.granted_at, match)}`;
          card.append(title, details); results.append(card);
        });
      } else {
        ids.forEach((id) => {
          const card = document.createElement('div'); card.className = 'forensic-match';
          const title = document.createElement('strong'); title.textContent = 'Unmatched copy identifier';
          const details = document.createElement('small'); details.textContent = id;
          card.append(title, details); results.append(card);
        });
      }
    } catch (error) { message.textContent = error.message || 'Could not decode the watermark.'; toast('Could not decode the watermark.', true); }
  }
  async function loadForensicSample() {
    const input = $('forensic-input'), message = $('forensic-message'), results = $('forensic-results');
    if (!input) return;
    message.textContent = 'Loading a sample…';
    try {
      const response = await window.OBI_API.fetch('/api/admin/forensic/sample', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (response.status === 401) { location.replace('./login.html'); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load a sample.');
      input.value = data.text || '';
      results.replaceChildren();
      message.textContent = 'Sample loaded. Select Decode watermark.';
      input.focus();
    } catch (error) { message.textContent = error.message || 'Could not load a sample.'; toast('Could not load a sample.', true); }
  }
  function clearForensic() {
    const input = $('forensic-input'), message = $('forensic-message'), results = $('forensic-results');
    if (!input) return;
    input.value = '';
    results.replaceChildren();
    message.textContent = '';
    input.focus();
  }
  $('forensic-decode').addEventListener('click', decodeForensic);
  $('forensic-sample').addEventListener('click', loadForensicSample);
  $('forensic-clear').addEventListener('click', clearForensic);
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
