(() => {
  const api = window.OBI_API.fetch;
  const $ = (id) => document.getElementById(id);
  const local = location.hostname === '127.0.0.1' && location.port === '5514';
  async function checkAccount() {
    try {
      const response = await api('/api/account/access', { cache: 'no-store' });
      if (response.status === 401) {
        $('auth-state').textContent = 'Sign in to your reader account to activate your edition.';
        $('sign-in').hidden = false;
        return;
      }
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data.authenticated) throw new Error();
      $('auth-state').textContent = 'Signed in as ' + data.email;
      $('bulk-form').hidden = false;
    } catch { $('auth-state').textContent = 'Could not reach the account service. Please refresh.'; }
  }
  function newDevice() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  async function deviceKey(code) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    return 'obi-ism.bulk-device.' + [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  $('bulk-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = $('code').value.trim().toUpperCase();
    if (!/^OBI-BULK-(?:[A-F0-9]{48}|[A-F0-9]{32})$/.test(code) || (code.length === 41 && !local)) { $('message').textContent = 'Enter the full activation code.'; return; }
    $('submit').disabled = true;
    $('message').textContent = 'Activating your edition…';
    try {
      const key = await deviceKey(code);
      let device = localStorage.getItem(key);
      if (!device) { device = newDevice(); localStorage.setItem(key, device); }
      const response = await api(code.length === 41 && local ? '/api/bulk/local/redeem' : '/api/bulk/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, device_token: device }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not activate the edition.');
      localStorage.setItem('obi-ism.reader-device.' + data.session_id, device);
      location.assign('reader.html?session_id=' + encodeURIComponent(data.session_id));
    } catch (error) { $('message').textContent = error.message || 'Could not activate the edition.'; $('submit').disabled = false; }
  });
  checkAccount();
})();
