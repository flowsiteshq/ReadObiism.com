(() => {
  const menu = document.querySelector('.menu-button');
  const sidebar = document.getElementById('navigation');
  const backdrop = document.querySelector('.sidebar-backdrop');
  const close = document.querySelector('.close-menu');
  const mobile = matchMedia('(max-width: 800px)');
  const feedback = document.getElementById('auth-feedback');
  function syncMenu() {
    const open = mobile.matches ? document.body.classList.contains('menu-open') : !document.body.classList.contains('sidebar-collapsed');
    menu.setAttribute('aria-expanded', String(open));
    sidebar.inert = !open;
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
  close.addEventListener('click', () => closeMenu(true));
  backdrop.addEventListener('click', () => closeMenu(true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') closeMenu(true);
  });
  mobile.addEventListener('change', () => {
    document.body.classList.remove('menu-open', 'sidebar-collapsed');
    syncMenu();
  });
  syncMenu();
  const local = location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname);
  document.getElementById('environment-label').textContent = local ? 'Local data' : 'Live data';
  async function authenticate() {
    feedback.hidden = true;
    try {
      const response = await window.OBI_API.fetch('/api/admin/session', { cache: 'no-store' });
      if (response.status === 401) { location.replace('/admin/login.html'); return; }
      if (!response.ok) throw new Error('Service unavailable');
      const data = await response.json();
      if (!data.authenticated) { location.replace('/admin/login.html'); return; }
      document.body.classList.remove('auth-pending');
    } catch {
      feedback.hidden = false;
    }
  }
  document.getElementById('auth-retry').addEventListener('click', authenticate);
  document.getElementById('sign-out').addEventListener('click', async () => {
    try {
      const response = await window.OBI_API.fetch('/api/admin/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out failed');
      location.replace('/admin/login.html');
    } catch {
      feedback.querySelector('p').textContent = 'Could not sign out. Please try again.';
      feedback.hidden = false;
    }
  });
  void authenticate();
})();