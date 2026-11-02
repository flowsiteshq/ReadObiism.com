(() => {
  const $ = id => document.getElementById(id), api = window.OBI_API.fetch;
  const prices = { NGN: 6995, USD: 9.95 };
  const message = text => { $('message').textContent = text; };
  const json = async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Please try again.'); return data; };
  function estimate() { const count = Number($('quantity').value), ngn = $('gateway').value === 'paystack'; $('estimate').textContent = Number.isInteger(count) && count > 0 && count <= 10000 ? `Standard total: ${ngn ? '₦' : '$'}${(count * prices[ngn ? 'NGN' : 'USD']).toLocaleString('en-US', { minimumFractionDigits: ngn ? 0 : 2, maximumFractionDigits: ngn ? 0 : 2 })} ${ngn ? 'NGN' : 'USD'}. Final amount is confirmed at checkout.` : ''; }
  async function account() { try { const res = await api('/api/account/access', { cache: 'no-store' }); if (res.status === 401) { $('sign-in').hidden = false; $('auth-state').textContent = 'Sign in to continue.'; return; } const data = await json(res); if (!data.authenticated) { $('sign-in').hidden = false; $('auth-state').textContent = 'Sign in to continue.'; return; } $('auth-state').textContent = `Signed in as ${data.email}`; $('verify').hidden = !!data.email_verified; $('bulk-form').hidden = !data.email_verified; } catch { $('auth-state').textContent = 'Cannot reach the account service. Please try again later.'; } }
  $('send-code').addEventListener('click', async () => { $('send-code').disabled = true; try { const data = await json(await api('/api/account/verify/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })); message(data.testCode ? `Local test code: ${data.testCode}` : data.message); $('send-code').textContent = 'SEND A NEW CODE'; $('verify-code').focus(); } catch (e) { message(e.message); } finally { $('send-code').disabled = false; } });
  $('verify-form').addEventListener('submit', async event => { event.preventDefault(); try { await json(await api('/api/account/verify/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: $('verify-code').value }) })); message('Email verified.'); await account(); } catch (e) { message(e.message); } });
  $('bulk-form').addEventListener('submit', async event => { event.preventDefault(); $('submit').disabled = true; message('Preparing checkout…'); try { const result = await json(await api('/api/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantity: Number($('quantity').value), provider: $('gateway').value }) })); const url = new URL(result.checkout_url); if (url.protocol !== 'https:' || !['checkout.paystack.com', 'checkout.stripe.com'].includes(url.hostname)) throw new Error('Checkout address could not be verified.'); location.assign(url.href); } catch (e) { message(e.message); $('submit').disabled = false; } });
  $('quantity').addEventListener('input', estimate); $('gateway').addEventListener('change', estimate); estimate();
  api('/api/pricing', { cache: 'no-store' }).then(async response => {
    if (!response.ok) return;
    const data = await response.json();
    for (const code of ['NGN', 'USD']) {
      const amount = Number(data?.[code]?.amount);
      if (Number.isFinite(amount) && amount > 0) prices[code] = amount;
    }
    estimate();
  }).catch(() => {});
  const preview = ['127.0.0.1', 'localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
  if (preview) { $('auth-state').textContent = 'Local design preview. Sign in is required to place an order.'; $('bulk-form').hidden = false; $('submit').disabled = true; } else account();
})();
