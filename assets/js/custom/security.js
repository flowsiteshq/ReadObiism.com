(() => {
  const api = window.OBI_API.fetch;
  const state = document.getElementById("security-state");
  const form = document.getElementById("security-form");
  const currentPassword = document.getElementById("current-password");
  const newPassword = document.getElementById("new-password");
  const confirmPassword = document.getElementById("confirm-password");
  const submit = document.getElementById("submit");
  const message = document.getElementById("message");
  const readerLink = document.getElementById("reader-link");
  const notify = (text, type = "success") => window.OBI_TOAST?.show(text, type);
  const setMessage = (text) => { message.textContent = text || ""; };

  async function load() {
    try {
      const response = await api("/api/account/access", { cache: "no-store" });
      if (response.status === 401) {
        state.textContent = "Sign in to manage your password. If you have forgotten it, use the password reset link instead.";
        form.hidden = true;
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authenticated) {
        state.textContent = "Sign in to manage your password.";
        form.hidden = true;
        return;
      }
      const identity = data.phone || data.email || "your account";
      state.textContent = `You are signed in as ${identity}. Changing your password signs out other sessions.`;
      form.hidden = false;
      readerLink.hidden = !data.access;
      readerLink.href = data.sessionId
        ? `/reader?session_id=${encodeURIComponent(data.sessionId)}`
        : "/reader";
      currentPassword.focus();
    } catch {
      state.textContent = "Cannot reach the account service. Please try again later.";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (newPassword.value.length < 8) {
      setMessage("Enter a new password of at least 8 characters.");
      return;
    }
    if (newPassword.value !== confirmPassword.value) {
      setMessage("The new passwords do not match.");
      return;
    }
    setMessage("");
    submit.disabled = true;
    submit.textContent = "UPDATING...";
    try {
      const response = await api("/api/account/password/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword.value,
          new_password: newPassword.value,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not change the password.");
      form.reset();
      setMessage("Password changed. Other signed-in sessions were signed out.");
      notify("Password changed successfully.", "success");
    } catch (error) {
      setMessage(error.message || "Could not change the password.");
      notify(error.message || "Could not change the password.", "error");
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'CHANGE PASSWORD <svg class="arrow-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>';
    }
  });

  load();
})();
