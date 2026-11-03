(() => {
  const api = window.OBI_API.fetch;
  const $ = (id) => document.getElementById(id);
  const local = location.hostname === '127.0.0.1' && location.port === '5514';
  const seatToken = new URLSearchParams(location.search).get('seat');
  const isSeat = /^seat_[a-f0-9]{48}$/.test(seatToken || '');
  async function checkAccount() {
    try {
      const response = await api('/api/account/access', { cache: 'no-store' });
      if (response.status === 401) {
        $('auth-state').textContent = 'Sign in to your reader account to activate your edition.';
        const signIn = $('sign-in');
        signIn.hidden = false;
        const link = signIn.querySelector('a');
        if (link) link.href = '/login?next=bulk-redeem' + (isSeat ? '&seat=' + encodeURIComponent(seatToken) : '');
        return;
      }
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data.authenticated) throw new Error();
      $('auth-state').textContent = 'Signed in as ' + (data.phone || data.email);
      if (isSeat) {
        $('bulk-form').hidden = true;
        $('seat-panel').hidden = false;
      } else {
        $('bulk-form').hidden = false;
      }
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
  async function deviceFor(code) {
    const key = await deviceKey(code);
    let device = localStorage.getItem(key);
    if (!device) { device = newDevice(); localStorage.setItem(key, device); }
    return device;
  }
  $('seat-claim').addEventListener('click', async () => {
    $('seat-claim').disabled = true;
    $('seat-message').textContent = 'Activating this seat…';
    try {
      const device = await deviceFor(seatToken);
      const response = await api('/api/bulk/seat/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seat_token: seatToken, device_token: device }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not activate this seat.');
      localStorage.setItem('obi-ism.reader-device.' + data.session_id, device);
      location.assign('/reader?session_id=' + encodeURIComponent(data.session_id));
    } catch (error) { $('seat-message').textContent = error.message; $('seat-claim').disabled = false; }
  });
  $('bulk-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = $('code').value.trim().toUpperCase();
    if (!/^OBI-BULK-(?:[A-F0-9]{48}|[A-F0-9]{32})$/.test(code) || (code.length === 41 && !local)) { $('message').textContent = 'Enter the full activation code.'; return; }
    $('submit').disabled = true;
    $('message').textContent = 'Activating your edition…';
    try {
      const device = await deviceFor(code);
      const response = await api(code.length === 41 && local ? '/api/bulk/local/redeem' : '/api/bulk/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, device_token: device }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not activate the edition.');
      localStorage.setItem('obi-ism.reader-device.' + data.session_id, device);
      location.assign('/reader?session_id=' + encodeURIComponent(data.session_id));
    } catch (error) { $('message').textContent = error.message || 'Could not activate the edition.'; $('submit').disabled = false; }
  });
  checkAccount();
})();
