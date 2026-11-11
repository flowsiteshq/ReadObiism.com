(() => {
  const $ = id => document.getElementById(id), api = window.OBI_API.fetch;
  const prices = { NGN: 6995, USD: 9.95 };
  const message = text => { $('message').textContent = text; };
  const json = async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Please try again.'); return data; };
  const notify = (text, type = 'success') => { window.OBI_TOAST?.show(text, type); };
  if (sessionStorage.getItem('obi-ism.verification-email-sent') === '1') {
    sessionStorage.removeItem('obi-ism.verification-email-sent');
    notify('Account created. Verification code sent — check your inbox.', 'success');
  }
  let latestQuote = null, quoteSequence = 0, quoteTimer = null, submitting = false;
  const previewMode = ['127.0.0.1', 'localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
  const formatNgn = minor => new Intl.NumberFormat('en-NG', { style:'currency', currency:'NGN', minimumFractionDigits:2, maximumFractionDigits:2 }).format(minor / 100);
  function estimate() {
    const count = Number($('quantity').value), ngn = $('gateway').value === 'paystack', seq = ++quoteSequence;
    latestQuote = null; clearTimeout(quoteTimer);
    if (!Number.isInteger(count) || count < 1 || count > 10000) { $('estimate').textContent = ''; $('submit').disabled = true; return; }
    if (!ngn) { $('estimate').textContent = `Total: $${(count * prices.USD).toFixed(2)} USD.`; $('submit').disabled = previewMode || submitting; return; }
    $('submit').disabled = true; $('estimate').textContent = 'Calculating Paystack checkout total...';
    quoteTimer = setTimeout(async () => {
      try {
        const quote = await json(await api('/api/paystack/quote?quantity=' + count, { cache:'no-store' }));
        if (seq !== quoteSequence) return;
        if (quote.quantity !== count || !Number.isSafeInteger(quote.total_minor) || !Number.isSafeInteger(quote.fee_minor) || !Number.isSafeInteger(quote.subtotal_minor)) throw new Error('Price unavailable.');
        latestQuote = quote;
        $('estimate').textContent = `Editions ${formatNgn(quote.subtotal_minor)} + processing charge ${formatNgn(quote.fee_minor)} = total ${formatNgn(quote.total_minor)} NGN.`;
        $('submit').disabled = previewMode || submitting;
      } catch { if (seq === quoteSequence) $('estimate').textContent = 'Paystack total is unavailable. Please try again.'; }
    }, 200);
  }
  async function account() { try { const featureData = await json(await api('/api/features', { cache: 'no-store' })); if (featureData.features?.bulk_purchase === false) { $('verify').hidden = true; $('bulk-form').hidden = true; $('auth-state').textContent = 'Bulk purchases are temporarily unavailable.'; message('Bulk purchases are temporarily unavailable. Please check back soon.'); return; } const res = await api('/api/account/access', { cache: 'no-store' }); if (res.status === 401) { $('sign-in').hidden = false; $('auth-state').textContent = 'Sign in to continue.'; return; } const data = await json(res); if (!data.authenticated) { $('sign-in').hidden = false; $('auth-state').textContent = 'Sign in to continue.'; return; } $('auth-state').textContent = `Signed in as ${data.phone || data.email}`; $('verify').hidden = true; $('bulk-form').hidden = false; const buyerEmail = $('buyer-email'); const accountEmail = String(data.email || ''); if (buyerEmail && !buyerEmail.value && !/^phone_[a-f0-9]+@phone\.obiism\.local$/i.test(accountEmail)) buyerEmail.value = accountEmail; } catch { $('auth-state').textContent = 'Cannot reach the account service. Please try again later.'; } }
  $('send-code').addEventListener('click', async () => { $('send-code').disabled = true; try { const data = await json(await api('/api/account/verify/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })); message(data.testCode ? `Local test code: ${data.testCode}` : data.message); notify(data.testCode ? 'Local test code generated.' : 'Verification code sent. Check your inbox.', 'success'); $('send-code').textContent = 'SEND A NEW CODE'; $('verify-code').focus(); } catch (e) { message(e.message); notify(e.message || 'Could not send the verification code.', 'error'); } finally { $('send-code').disabled = false; } });
  $('verify-form').addEventListener('submit', async event => { event.preventDefault(); try { await json(await api('/api/account/verify/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: $('verify-code').value }) })); message('Email verified.'); notify('Email verified successfully.', 'success'); await account(); } catch (e) { message(e.message); notify(e.message || 'Could not verify the code.', 'error'); } });
  $('bulk-form').addEventListener('submit', async event => {
    event.preventDefault();
    const quantity = Number($('quantity').value), provider = $('gateway').value;
    if (provider === 'paystack' && (!latestQuote || latestQuote.quantity !== quantity)) { message('Wait for the Paystack total and review it before continuing.'); return; }
    submitting = true; $('submit').disabled = true; message('Preparing checkout...');
    try {
      const response = await api('/api/bulk', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ email:$('buyer-email').value.trim(), quantity, provider, ...(provider === 'paystack' ? { quoted_total_minor:latestQuote.total_minor } : {}) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { if (result.code === 'price_changed') { estimate(); throw new Error('The Paystack total changed. Review the updated price before continuing.'); } throw new Error(result.error || 'Please try again.'); }
      const url = new URL(result.checkout_url);
      if (url.protocol !== 'https:' || !['checkout.paystack.com','checkout.stripe.com'].includes(url.hostname)) throw new Error('Checkout address could not be verified.');
      location.assign(url.href);
    } catch (e) { message(e.message); notify(e.message || 'Could not start checkout.', 'error'); submitting = false; if (provider !== 'paystack' || latestQuote) $('submit').disabled = false; }
  });
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
  if (previewMode) { $('auth-state').textContent = 'Local design preview. Sign in is required to place an order.'; $('bulk-form').hidden = false; $('submit').disabled = true; } else account();
})();
