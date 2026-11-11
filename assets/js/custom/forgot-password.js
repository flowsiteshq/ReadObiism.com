(() => {
  const api = window.OBI_API.fetch;
  const emailForm = document.getElementById("forgot-form");
  const resetForm = document.getElementById("reset-form");
  const emailInput = document.getElementById("email");
  const codeInput = document.getElementById("code");
  const newPassword = document.getElementById("new-password");
  const confirmPassword = document.getElementById("confirm-password");
  const send = document.getElementById("send-code");
  const reset = document.getElementById("reset-submit");
  const message = document.getElementById("message");
  const resetMessage = document.getElementById("reset-message");
  const resetLabel = document.getElementById("reset-email-label");
  const heading = document.getElementById("heading");
  const sub = document.getElementById("sub");
  let email = "";

  const setMessage = (element, text) => {
    element.textContent = text || "";
  };
  const notify = (text, type = "success") => window.OBI_TOAST?.show(text, type);
  const validEmail = (value) => /^\S+@\S+\.\S+$/.test(value);

  function showReset(nextEmail, notice = "") {
    email = nextEmail;
    emailForm.hidden = true;
    resetForm.hidden = false;
    heading.textContent = "Choose a new password.";
    sub.textContent = "Enter the 8-digit code from your email, then set a new password.";
    resetLabel.textContent = "RESET CODE SENT TO " + email;
    setMessage(message, "");
    setMessage(resetMessage, notice);
    codeInput.focus();
  }

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = emailInput.value.trim().toLowerCase();
    if (!validEmail(value)) {
      setMessage(message, "Enter a valid email address.");
      return;
    }
    setMessage(message, "");
    send.disabled = true;
    send.textContent = "SENDING...";
    try {
      const response = await api("/api/account/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send the reset code.");
      showReset(value, data.testCode ? `Local test code: ${data.testCode}` : "");
      notify(
        data.testCode
          ? "Local test code generated."
          : "If an account exists for that email, a reset code has been sent.",
        "success",
      );
      if (data.testCode) codeInput.value = data.testCode;
    } catch (error) {
      setMessage(message, error.message || "Could not send the reset code.");
      notify(error.message || "Could not send the reset code.", "error");
    } finally {
      send.disabled = false;
      send.innerHTML = 'SEND RESET CODE <svg class="arrow-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>';
    }
  });

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = codeInput.value.replace(/\D/g, "");
    if (code.length !== 8) {
      setMessage(resetMessage, "Enter the 8-digit code from your email.");
      return;
    }
    if (newPassword.value.length < 8) {
      setMessage(resetMessage, "Enter a new password of at least 8 characters.");
      return;
    }
    if (newPassword.value !== confirmPassword.value) {
      setMessage(resetMessage, "The new passwords do not match.");
      return;
    }
    setMessage(resetMessage, "");
    reset.disabled = true;
    reset.textContent = "RESETTING...";
    try {
      const response = await api("/api/account/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, password: newPassword.value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not reset the password.");
      if (data.token) localStorage.setItem("obi-ism.session-token", data.token);
      setMessage(resetMessage, "Password updated. Signing you in...");
      notify("Password updated.", "success");
      const next = data.access && data.sessionId
        ? `/reader?session_id=${encodeURIComponent(data.sessionId)}`
        : "/login";
      setTimeout(() => location.assign(next), 900);
    } catch (error) {
      setMessage(resetMessage, error.message || "Could not reset the password.");
      notify(error.message || "Could not reset the password.", "error");
      reset.disabled = false;
      reset.innerHTML = 'RESET PASSWORD <svg class="arrow-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>';
    }
  });

  const params = new URLSearchParams(location.search);
  const pending = (params.get("email") || "").trim().toLowerCase();
  if (validEmail(pending)) {
    emailInput.value = pending;
    showReset(pending, "Enter the code from your email. It expires in 10 minutes.");
  }
})();
