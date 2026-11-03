// Load the OBI dashboard fragments once so existing form state and event
// handlers survive ALG route changes. The API, not this router, authorizes data.
(async () => {
  const views = ['overview', 'records', 'bulk-workspace', 'payment-settings', 'feature'];
  const bank = document.getElementById('obi-view-bank');
  const main = document.getElementById('main-content');
  try {
    const fragments = await Promise.all(views.map(async (name) => {
      const response = await fetch(`views/${name}.html`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load dashboard views.');
      return response.text();
    }));
    bank.innerHTML = fragments.join('\n');
    const mapping = window.OBI_DASHBOARD_VIEWS;
    if (!mapping) throw new Error('Dashboard routes are unavailable.');
    window.addEventListener('obi:route-before', () => {
      while (main.firstChild) bank.appendChild(main.firstChild);
    });
    window.addEventListener('obi:route-mounted', (event) => {
      const view = mapping[event.detail.route] || 'overview';
      // The ALG router fetched the view; use the initialized instance from the
      // bank so its handlers and form state are preserved across navigation.
      main.replaceChildren();
      const section = bank.querySelector(`#${view}`);
      if (!section) throw new Error('Dashboard view is missing.');
      main.append(section);
    });
    const loadScript = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.onload = resolve; script.onerror = reject;
      document.body.append(script);
    });
    await loadScript('../assets/js/custom/dashboard-controller.js?v=20261103-devices');
    await loadScript('../assets/js/alg/obi-router.js');
  } catch {
    document.body.classList.remove('auth-pending');
    main.textContent = 'The dashboard could not load. Please refresh and try again.';
  }
})();
