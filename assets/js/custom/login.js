(() => {
  const apiFetch = window.OBI_API.fetch;
  const ARROW = '<svg class="arrow-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>';
  let mode = "login";
  const form = document.getElementById("form");
  const submit = document.getElementById("submit");
  const message = document.getElementById("message");
  const heading = document.getElementById("heading");
  const sub = document.getElementById("sub");
  const sign = document.getElementById("sign-tab");
  const create = document.getElementById("create-tab");
  const identifier = document.getElementById("identifier");
  const password = document.getElementById("password");
  const forgot = document.getElementById("forgot-password");
  const params = new URLSearchParams(location.search);
  const destinations = {
    "bulk-redeem": "bulk-/redeem",
    bulk: "/bulk",
    "bulk-confirmation": "/bulk-confirmation",
    security: "/security",
  };

  const setMode = (next) => {
    mode = next;
    const creating = mode === "register";
    sign.classList.toggle("active", !creating);
    create.classList.toggle("active", creating);
    heading.textContent = creating ? "Create your account." : "Welcome back.";
    sub.textContent = creating
      ? "Create an account before purchase so your edition can be restored securely. Your password is stored as a one-way hash."
      : "Sign in to continue to your protected edition. Your account remembers your access; your original device remains the only authorized reader.";
    submit.innerHTML = creating ? `CREATE ACCOUNT ${ARROW}` : `SIGN IN ${ARROW}`;
    password.autocomplete = creating ? "new-password" : "current-password";
    if (forgot) forgot.hidden = creating;
    message.textContent = "";
  };

  sign.onclick = () => setMode("login");
  create.onclick = () => setMode("register");

  form.onsubmit = async (event) => {
    event.preventDefault();
    message.textContent = "";
    submit.disabled = true;
    submit.textContent = "WORKING…";
    const value = identifier.value.trim();
    if (!value) {
      message.textContent = "Enter your email or phone number.";
      submit.disabled = false;
      submit.innerHTML = mode === "login" ? `SIGN IN ${ARROW}` : `CREATE ACCOUNT ${ARROW}`;
      return;
    }
    const isEmail = value.includes("@");
    const endpoint = mode === "login"
      ? (isEmail ? "/api/account/login" : "/api/account/phone/login")
      : (isEmail ? "/api/account/register" : "/api/account/phone/register");
    const payload = isEmail
      ? { email: value, password: password.value }
      : { phone: value, password: password.value };
    try {
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "We could not complete that request.");
      if (!body.account || (!body.account.email && !body.account.phone)) {
        throw new Error("The sign-in service returned an invalid response. Please try again.");
      }
      if (body.token) localStorage.setItem("obi-ism.session-token", body.token);
      const next = params.get("next");
      const seat = params.get("seat");
      const pending = location.hostname === "127.0.0.1" && location.port === "5514"
        ? localStorage.getItem("obi-ism.local-pending-paystack")
        : "";
      if (next === "bulk-redeem") {
        location.assign("bulk-/redeem" + (seat ? "?seat=" + encodeURIComponent(seat) : ""));
        return;
      }
      if (Object.prototype.hasOwnProperty.call(destinations, next)) {
        location.assign(destinations[next]);
        return;
      }
      if (body.access && body.sessionId) {
        location.assign(`/reader?session_id=${encodeURIComponent(body.sessionId)}`);
        return;
      }
      if (body.access) {
        location.assign("/reader");
        return;
      }
      if (/^obi_[a-z0-9]{16,64}$/.test(pending || "")) {
        location.assign(`/reader?session_id=${encodeURIComponent(pending)}`);
        return;
      }
      message.textContent = "Signed in, but no active edition was found for this account. Return to the website to complete checkout.";
    } catch (error) {
      message.textContent = error instanceof TypeError
        ? "Cannot reach the sign-in service. Please try again."
        : (error.message || "We could not complete that request.");
    } finally {
      submit.disabled = false;
      submit.innerHTML = mode === "login" ? `SIGN IN ${ARROW}` : `CREATE ACCOUNT ${ARROW}`;
    }
  };

  setMode("login");
})();
