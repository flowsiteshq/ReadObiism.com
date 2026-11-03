(() => {
  const api = window.OBI_API.fetch;
  const message = (text) => {
    const element = document.getElementById("phone-message");
    if (element) element.textContent = text;
  };
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
    message("Account ready. Return to the website to buy an edition, or enter your group activation code.");
  }

  async function submit(path, button) {
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("phone-password").value;
    if (!phone) { message("Enter your phone number."); return; }
    if (password.length < 8) { message("Enter a password of at least 8 characters."); return; }
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "WORKING…";
    message("");
    try {
      const response = await api(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not complete phone sign-in.");
      continueAfterSignIn(body);
    } catch (error) {
      message(error.message || "Could not complete phone sign-in.");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  document.getElementById("phone-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void submit("/api/account/phone/login", document.getElementById("phone-signin"));
  });
  document.getElementById("phone-create").addEventListener("click", () => {
    void submit("/api/account/phone/register", document.getElementById("phone-create"));
  });
})();
