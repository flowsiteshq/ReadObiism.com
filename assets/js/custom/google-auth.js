(() => {
  const api = window.OBI_API.fetch;
  const message = (text) => {
    const element = document.getElementById("google-message");
    if (element) element.textContent = text;
  };
  const container = document.getElementById("google-signin");
  const buttonHost = document.getElementById("google-button");
  const params = new URLSearchParams(location.search);
  const next = params.get("next");
  const seat = params.get("seat");
  const destinations = { "bulk-redeem": "bulk-redeem.html", bulk: "bulk.html", "bulk-confirmation": "bulk-confirmation.html" };

  function continueAfterSignIn(body) {
    if (body.token) localStorage.setItem("obi-ism.session-token", body.token);
    if (next === "bulk-redeem") {
      location.assign("bulk-redeem.html" + (seat ? "?seat=" + encodeURIComponent(seat) : ""));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(destinations, next)) {
      location.assign(destinations[next]);
      return;
    }
    if (body.access && body.sessionId) {
      location.assign("reader.html?session_id=" + encodeURIComponent(body.sessionId));
      return;
    }
    if (body.access) {
      location.assign("reader.html");
      return;
    }
    const pending = location.hostname === "127.0.0.1" && location.port === "5514"
      ? localStorage.getItem("obi-ism.local-pending-paystack")
      : "";
    if (/^obi_[a-z0-9]{16,64}$/.test(pending || "")) {
      location.assign("reader.html?session_id=" + encodeURIComponent(pending));
      return;
    }
    message("Signed in with Google, but no active edition was found for this account. Return to the website to complete checkout.");
  }

  async function handleCredential(response) {
    message("Signing you in…");
    try {
      const result = await api("/api/account/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const body = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(body.error || "Google sign-in failed.");
      continueAfterSignIn(body);
    } catch (error) {
      message(error.message || "Google sign-in failed.");
    }
  }

  (async () => {
    try {
      const response = await api("/api/auth/config", { cache: "no-store" });
      if (!response.ok) return;
      const config = await response.json().catch(() => ({}));
      if (!config.googleClientId) return;
      container.hidden = false;
      await new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: handleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      google.accounts.id.renderButton(buttonHost, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 300,
      });
    } catch {
      container.hidden = true;
    }
  })();
})();
