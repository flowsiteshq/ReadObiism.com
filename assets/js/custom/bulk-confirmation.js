(() => {
  const $ = id => document.getElementById(id), api = window.OBI_API.fetch;
  const incoming = new URLSearchParams(location.search).get('order');
  if (/^bprod_[a-f0-9]{32}$/.test(incoming || '')) sessionStorage.setItem('obi-ism.pending-bulk-order', incoming);
  if (location.search) history.replaceState(null, '', location.pathname);
  const order = sessionStorage.getItem('obi-ism.pending-bulk-order');
  async function check() {
    $('retry').hidden = true; $('message').textContent = 'Checking your order…';
    if (!/^bprod_[a-f0-9]{32}$/.test(order || '')) { $('message').textContent = 'No order was found. Return to the website to start a purchase.'; return; }
    try { const access = await api('/api/account/access', { cache: 'no-store' }); const account = await access.json().catch(() => ({})); if (access.status === 401 || (access.ok && !account.authenticated)) { $('message').textContent = 'Sign in to the account that placed this order.'; $('sign-in').hidden = false; return; } if (!access.ok) throw new Error('Cannot reach the account service. Please try again later.'); if (!account.email_verified) { $('message').textContent = 'Verify your account email before recovering this order.'; $('retry').hidden = false; return; }
      const response = await api('/api/bulk/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: order }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Could not verify this order.'); if (data.status !== 'paid' || !data.code) { $('message').textContent = data.message || 'Payment is not confirmed yet. Please check again.'; $('retry').hidden = false; return; } $('shared-code').value = data.code; $('code-panel').hidden = false; $('message').textContent = `Payment confirmed. Your code has ${data.quantity} editions.`;
    } catch (e) { $('message').textContent = e.message || 'Could not verify this order.'; $('retry').hidden = false; }
  }
  $('retry').addEventListener('click', check); $('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('shared-code').value); $('message').textContent = 'Code copied.'; } catch { $('message').textContent = 'Select the code to copy it.'; $('shared-code').select(); } }); check();
})();
