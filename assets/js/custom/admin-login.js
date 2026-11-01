(() => {
  const form = document.getElementById('login-form');
  const message = document.getElementById('message');
  const button = document.getElementById('submit');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    message.hidden = true;
    try {
      let response;
      try {
        response = await window.OBI_API.fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: form.email.value, password: form.password.value }) });
      } catch { throw new Error('Cannot connect to the local service. Start the local Worker and web proxy, then try again.'); }
      const data = await response.json().catch(() => ({}));
      if (response.status === 429) throw new Error(data.error || 'Too many attempts. Wait a moment and try again.');
      if (response.status >= 500) throw new Error(data.error || 'The sign-in service is unavailable. Check the local Worker and try again.');
      if (!response.ok) throw new Error(data.error || 'Sign in failed. Check your details and try again.');
      location.replace('./');
    } catch (error) {
      message.textContent = error.message || 'Could not connect. Check the local Worker and try again.';
      message.hidden = false;
      button.disabled = false;
    }
  });
})();
