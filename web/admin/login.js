(() => {
  const form = document.getElementById('login-form');
  const message = document.getElementById('message');
  const button = document.getElementById('submit');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    message.hidden = true;
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: form.email.value, password: form.password.value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sign in failed.');
      location.replace('./');
    } catch (error) {
      message.textContent = error.message || 'Could not connect. Check the local Worker and try again.';
      message.hidden = false;
      button.disabled = false;
    }
  });
})();
