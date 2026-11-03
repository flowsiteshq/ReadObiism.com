(() => {
  const api = window.OBI_API.fetch;
  const emailAuth = document.getElementById("email-auth");
  const phoneAuth = document.getElementById("phone-auth");
  const phoneJump = document.getElementById("show-phone");
  const emailJump = document.getElementById("show-email");
  const phoneForm = document.getElementById("phone-form");
  const phoneSubmit = document.getElementById("phone-submit");
  const phoneSwitch = document.getElementById("phone-switch");
  const phoneHeading = document.getElementById("phone-heading");
  const phonePassword = document.getElementById("phone-password");
  const phoneMessage = (text) => { document.getElementById("phone-message").textContent = text; };
  const params = new URLSearchParams(location.search);
  const next = params.get("next");
  const seat = params.get("seat");
  const destinations = { "bulk-redeem": "bulk-/redeem", bulk: "/bulk", "bulk-confirmation": "/bulk-confirmation" };
  let mode = "login";

  function setMode(nextMode) {
    mode = nextMode;
    const create = mode === "register";
    phoneHeading.textContent = create ? "Create a phone account." : "Sign in with your phone.";
    phoneSubmit.textContent = create ? "CREATE PHONE ACCOUNT →" : "SIGN IN WITH PHONE →";
    phoneSwitch.textContent = create ? "Already have a phone account? Sign in" : "Create a phone account";
    phonePassword.autocomplete = create ? "new-password" : "current-password";
    phoneMessage("");
  }

  function showPhone() {
    emailAuth.hidden = true;
    phoneAuth.hidden = false;
    document.getElementById("phone").focus();
  }

  function showEmail() {
    phoneAuth.hidden = true;
    emailAuth.hidden = false;
    document.getElementById("email").focus();
  }

  function continueAfterSignIn(body) {
    if (body.token) localStorage.setItem("obi-ism.session-token", body.token);
    if (next === "bulk-redeem") {
      location.assign("bulk-/redeem" + (seat ? "?seat=" + encodeURIComponent(seat) : ""));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(destinations, next)) {
      location.assign(destinations[next]);
      return;
    }
    if (body.access && body.sessionId) {
      location.assign("/reader?session_id=" + encodeURIComponent(body.sessionId));
      return;
    }
    if (body.access) {
      location.assign("/reader");
      return;
    }
    phoneMessage("Account ready. Return to the website to buy an edition, or enter your group activation code.");
  }

  async function submit() {
    const phone = document.getElementById("phone").value.trim();
    const password = phonePassword.value;
    if (!phone) { phoneMessage("Enter your phone number."); return; }
    if (password.length < 8) { phoneMessage("Enter a password of at least 8 characters."); return; }
    const original = phoneSubmit.textContent;
    phoneSubmit.disabled = true;
    phoneSubmit.textContent = "WORKING…";
    phoneMessage("");
    try {
      const response = await api(mode === "register" ? "/api/account/phone/register" : "/api/account/phone/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not complete phone sign-in.");
      continueAfterSignIn(body);
    } catch (error) {
      phoneMessage(error.message || "Could not complete phone sign-in.");
    } finally {
      phoneSubmit.disabled = false;
      phoneSubmit.textContent = original;
    }
  }

  phoneJump.addEventListener("click", (event) => { event.preventDefault(); showPhone(); });
  emailJump.addEventListener("click", (event) => { event.preventDefault(); showEmail(); });
  phoneSwitch.addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));
  phoneForm.addEventListener("submit", (event) => { event.preventDefault(); void submit(); });
  setMode("login");
})();
