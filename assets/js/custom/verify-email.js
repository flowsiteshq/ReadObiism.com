(() => {
  const api = window.OBI_API.fetch;
  const state = document.getElementById("verify-state");
  const send = document.getElementById("send-code");
  const form = document.getElementById("verify-form");
  const code = document.getElementById("verify-code");
  const message = document.getElementById("message");
  let account = null;
  const setMessage = (text) => { message.textContent = text; };
  const notify = (text, type = "success") => { window.OBI_TOAST?.show(text, type); };
  const registrationNotice = sessionStorage.getItem("obi-ism.verification-email-sent");
  if (registrationNotice === "1") {
    sessionStorage.removeItem("obi-ism.verification-email-sent");
    notify("Account created. Verification code sent — check your inbox.", "success");
  }

  async function load() {
    try {
      const response = await api("/api/account/access", { cache: "no-store" });
      if (response.status === 401) {
        state.textContent = "Sign in to verify your email address.";
        send.disabled = true;
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authenticated) {
        state.textContent = "Sign in to verify your email address.";
        send.disabled = true;
        return;
      }
      account = data;
      if (data.email_verified) {
        state.textContent = `Your email (${data.email}) is already verified.`;
        send.disabled = true;
        form.hidden = true;
        return;
      }
      state.textContent = `We will send an 8-digit code to ${data.email}.`;
      form.hidden = false;
      send.disabled = false;
    } catch {
      state.textContent = "Cannot reach the account service. Please try again later.";
    }
  }

  send.addEventListener("click", async () => {
    send.disabled = true;
    setMessage("Sending your verification code…");
    try {
      const response = await api("/api/account/verify/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send the code.");
      setMessage(data.testCode ? `Local test code: ${data.testCode}` : "Code sent. Check your inbox and spam folder.");
      notify(data.testCode ? "Local test code generated." : "Verification code sent. Check your inbox.", "success");
      form.hidden = false;
      code.focus();
    } catch (error) {
      setMessage(error.message || "Could not send the code.");
      notify(error.message || "Could not send the verification code.", "error");
    } finally {
      send.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("Verifying…");
    try {
      const response = await api("/api/account/verify/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not verify the code.");
      state.textContent = `Your email (${account?.email || ""}) is verified.`;
      form.hidden = true;
      send.disabled = true;
      setMessage("Email verified. You can close this page or continue to your edition.");
      notify("Email verified successfully.", "success");
    } catch (error) {
      setMessage(error.message || "Could not verify the code.");
      notify(error.message || "Could not verify the code.", "error");
    }
  });

  load();
})();
