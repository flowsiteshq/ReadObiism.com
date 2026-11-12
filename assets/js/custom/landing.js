
(() => {
  const video = document.getElementById("hero-video");
  const motionControl = document.getElementById("motion-control");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const ARROW = '<svg class="arrow-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>';
  const setMotionControl = (playing) => {
    motionControl.textContent = playing ? "PAUSE FILM" : "PLAY FILM";
    motionControl.setAttribute("aria-pressed", String(playing));
  };
  const playVideo = () => video.play().then(() => setMotionControl(true)).catch(() => setMotionControl(false));
  if (!reducedMotion && !saveData) playVideo();
  else setMotionControl(false);
  motionControl.addEventListener("click", () => {
    if (video.paused) playVideo();
    else { video.pause(); setMotionControl(false); }
  });

  const apiFetch = window.OBI_API.fetch;
  const button = document.getElementById("buy-edition");
  const email = document.getElementById("purchase-email");
  const readerName = document.getElementById("reader-name");
  const emailLabel = document.getElementById("purchase-email-label");
  const status = document.getElementById("purchase-status");
  const modeSelf = document.getElementById("mode-self");
  const modeGift = document.getElementById("mode-gift");
  const giftFields = document.getElementById("gift-fields");
  const giftName = document.getElementById("gift-name");
  const giftEmail = document.getElementById("gift-email");
  const giftMessage = document.getElementById("gift-message");
  const giftNoteToggle = document.getElementById("gift-note-toggle");
  const giftNoteField = document.getElementById("gift-note-field");
  const purchaseNote = document.querySelector(".purchase-note");
  const subscriptionNote = document.getElementById("subscription-note");
  const warning = document.getElementById("purchase-warning");
  const warningTitle = document.getElementById("purchase-warning-title");
  const warningText = document.getElementById("purchase-warning-text");
  const warningConfirm = document.getElementById("purchase-warning-confirm");
  const warningCancel = document.getElementById("purchase-warning-cancel");
  const params = new URLSearchParams(location.search);
  let currency = "NGN";
  let featureFlags = null;
  let purchaseMode = params.get("gift") === "1" ? "gift" : "self";
  let pendingCheckout = null;
  let submitting = false;
  let paystackQuote = null;
  const pricing = {
    NGN: { amount: 6995, label: "₦6,995" },
    USD: { amount: 9.95, label: "$9.95" },
  };
  const formatPrice = (amount, code) => {
    try {
      return new Intl.NumberFormat(code === "NGN" ? "en-NG" : "en-US", {
        style: "currency",
        currency: code,
        minimumFractionDigits: code === "USD" ? 2 : 0,
        maximumFractionDigits: code === "USD" ? 2 : 0,
      }).format(amount);
    } catch {
      return `${code === "NGN" ? "₦" : "$"}${amount}`;
    }
  };
  const priceLabel = () => `${pricing[currency].label} ${currency}`;
  const setButtonLabel = (text) => { button.innerHTML = `${text} <span class="arrow">${ARROW}</span>`; };
  const updateStatus = (override) => {
    if (override) { status.textContent = override; return; }
    status.textContent = purchaseMode === "gift"
      ? `${priceLabel()} · One-time gift · One code for your friend.`
      : `${priceLabel()} · One-time payment · You will return directly to your protected reader.`;
  };
  const purchasesEnabled = () => !featureFlags || featureFlags.single_purchase !== false;
  const defaultButtonLabel = () => purchaseMode === "gift" ? "BUY AS A GIFT" : "BUY THE DIGITAL EDITION";
  const resetButton = () => {
    if (submitting) return;
    button.disabled = !purchasesEnabled() || (currency === "NGN" && !paystackQuote);
    setButtonLabel(defaultButtonLabel());
  };
  const restoreStatus = () => {
    if (!purchasesEnabled()) return;
    updateStatus();
  };
  const hideWarning = (reset = true) => {
    if (warning) warning.hidden = true;
    if (warningConfirm) warningConfirm.disabled = false;
    if (warningCancel) warningCancel.disabled = false;
    pendingCheckout = null;
    if (reset) resetButton();
  };
  const setMode = (next) => {
    purchaseMode = next;
    const gift = next === "gift";
    modeSelf.setAttribute("aria-pressed", String(!gift));
    modeGift.setAttribute("aria-pressed", String(gift));
    giftFields.hidden = !gift;
    if (purchaseNote) purchaseNote.hidden = gift;
    emailLabel.textContent = gift ? "YOUR EMAIL (FOR YOUR RECEIPT)" : "EMAIL FOR YOUR RECEIPT";
    setButtonLabel(gift ? "BUY AS A GIFT" : "BUY THE DIGITAL EDITION");
    hideWarning();
    restoreStatus();
  };
  const setCurrency = (next) => {
    currency = next;
    const naira = next === "NGN";

    document.getElementById("purchase-price").textContent = pricing[naira ? "NGN" : "USD"].label;
    document.getElementById("purchase-currency").textContent = naira ? "NGN" : "USD";
    document.getElementById("currency-ngn").setAttribute("aria-pressed", String(naira));
    document.getElementById("currency-usd").setAttribute("aria-pressed", String(!naira));
    hideWarning();
    restoreStatus();
  };
  const applyPricing = (data) => {
    for (const code of ["NGN", "USD"]) {
      if (code === "NGN" && paystackQuote) continue;
      const amount = Number(data?.[code]?.amount);
      if (Number.isFinite(amount) && amount > 0) {
        pricing[code] = {
          amount,
          label: typeof data[code].formatted === "string" && data[code].formatted ? data[code].formatted : formatPrice(amount, code),
        };
      }
    }
    document.getElementById("currency-ngn").textContent = `${pricing.NGN.label} NGN`;
    document.getElementById("currency-usd").textContent = `${pricing.USD.label} USD`;
    document.getElementById("edition-ngn-price").textContent = `${pricing.NGN.label} NGN`;
    document.getElementById("edition-usd-price").textContent = `${pricing.USD.label} USD`;
    const hero = document.getElementById("hero-price");
    if (hero) hero.textContent = `${pricing.USD.label} USD`;
    setCurrency(currency);
  };
  const applyFeatures = (data) => {
    featureFlags = data?.features || data || {};
    const single = featureFlags.single_purchase !== false;
    const gift = featureFlags.gift_purchase !== false;
    const annualSubscription = featureFlags.annual_subscription === true;

    if (subscriptionNote) subscriptionNote.hidden = !annualSubscription;
    if (!single) button.disabled = true;
    else if (!pendingCheckout) resetButton();
    modeGift.disabled = !gift;
    if (!gift && purchaseMode === "gift") setMode("self");
    if (!single) {
      updateStatus("Purchases are temporarily unavailable. Please check back soon.");
    } else if (!gift && purchaseMode === "self") {
      updateStatus();
    }
  };
  const applyAccount = (data) => {
    const accountLink = document.getElementById("account-link");
    const editionLink = document.getElementById("edition-link");
    const heroBookLink = document.getElementById("hero-book-link");
    const note = document.getElementById("signed-in-note");
    if (!accountLink || !editionLink) return;
    const emailAddress = data.phone || data.email || "your account";
    const accountEmail = String(data.email || "");
    if (email && !email.value && !/^phone_[a-f0-9]+@phone\.obiism\.local$/i.test(accountEmail)) {
      email.value = accountEmail;
    }
    if (data.access) {
      accountLink.textContent = "MY BOOK";
      accountLink.href = "/reader";
      accountLink.title = `Signed in as ${emailAddress}`;
      editionLink.innerHTML = `BACK TO BOOK ${ARROW}`;
      editionLink.href = "/reader";
      if (heroBookLink) {
        heroBookLink.href = "/reader";
        heroBookLink.innerHTML = `CONTINUE READING <span class="arrow">${ARROW}</span>`;
      }
      if (note) {
        note.hidden = false;
        note.replaceChildren();
        const signedIn = document.createElement("span");
        signedIn.textContent = `Signed in as ${emailAddress}. Your edition is ready. Buying again creates a separate fresh edition. `;
        const link = document.createElement("a");
        link.href = "/reader";
        link.innerHTML = `BACK TO BOOK ${ARROW}`;
        note.append(signedIn, link);
      }
    } else {
      accountLink.textContent = "MY ACCOUNT";
      accountLink.href = "/verify-email";
      accountLink.title = `Signed in as ${emailAddress}`;
      if (note) {
        note.hidden = false;
        note.textContent = `Signed in as ${emailAddress}. No active edition is linked yet — choose a price below.`;
      }
    }
  };
  document.getElementById("currency-ngn").addEventListener("click", () => setCurrency("NGN"));
  document.getElementById("currency-usd").addEventListener("click", () => setCurrency("USD"));
  modeSelf.addEventListener("click", () => setMode("self"));
  modeGift.addEventListener("click", () => setMode("gift"));
  [email, readerName, giftName, giftEmail, giftMessage].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      if (submitting) return;
      hideWarning();
      restoreStatus();
    });
  });
  giftNoteToggle.addEventListener("click", () => {
    const open = giftNoteField.hidden;
    giftNoteField.hidden = !open;
    giftNoteToggle.setAttribute("aria-expanded", String(open));
    giftNoteToggle.textContent = open ? "− Hide personal note" : "+ Add a personal note";
    if (open) giftMessage.focus();
  });
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const newDeviceToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  };
  // Readable gift code: no 0/O/1/I, so it is safe to read aloud or retype.
  const giftAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const newGiftCode = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const segment = (start) => [...bytes.slice(start, start + 4)].map((byte) => giftAlphabet[byte % giftAlphabet.length]).join("");
    return `OBI-${segment(0)}-${segment(4)}-${segment(8)}`;
  };
  setMode(purchaseMode);
  if (params.get("checkout") === "continue") {
    try {
      const saved = JSON.parse(sessionStorage.getItem("obi-ism.checkout-draft") || "null");
      sessionStorage.removeItem("obi-ism.checkout-draft");
      if (saved) {
        setMode(saved.mode === "gift" ? "gift" : "self");
        setCurrency(saved.currency === "USD" ? "USD" : "NGN");
        if (email) email.value = saved.email || "";
        if (readerName) readerName.value = saved.readerName || "";
        if (giftName) giftName.value = saved.giftName || "";
        if (giftEmail) giftEmail.value = saved.giftEmail || "";
        if (giftMessage) giftMessage.value = saved.giftMessage || "";
        if (giftMessage?.value && giftNoteField?.hidden) giftNoteToggle.click();
        updateStatus("Your account is ready. Review your details to continue checkout.");
      }
    } catch { /* Checkout still works without a saved draft. */ }
  }
  const money = (minor) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  const refreshPaystackQuote = async () => {
    paystackQuote = null;

    resetButton();
    try {
      const response = await apiFetch("/api/paystack/quote?quantity=1", { cache: "no-store" });
      const quote = await response.json();
      if (!response.ok || !Number.isSafeInteger(quote.total_minor) || !Number.isSafeInteger(quote.subtotal_minor) || !Number.isSafeInteger(quote.fee_minor)) throw new Error("Price unavailable");
      paystackQuote = quote;

      pricing.NGN = { amount: quote.unit_minor / 100, label: money(quote.unit_minor) };
      document.getElementById("currency-ngn").textContent = `${pricing.NGN.label} NGN`;
      document.getElementById("edition-ngn-price").textContent = `${pricing.NGN.label} NGN`;
      if (currency === "NGN") { document.getElementById("purchase-price").textContent = pricing.NGN.label; if (!submitting && !pendingCheckout) updateStatus(); }
    } catch { if (currency === "NGN") updateStatus("Paystack checkout is unavailable. Refresh the page and try again."); }
    resetButton();
  };
  void refreshPaystackQuote();
  apiFetch("/api/pricing", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => { if (data) applyPricing(data); })
    .catch(() => {});
  apiFetch("/api/features", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => { if (data) applyFeatures(data); })
    .catch(() => {});
  apiFetch("/api/account/access", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => { if (data?.authenticated) applyAccount(data); })
    .catch(() => {});
  if (params.get("purchase") === "cancelled") {
    updateStatus(params.get("gift") === "1" ? "Gift checkout was cancelled. No payment was made." : "Checkout was cancelled. No payment was made.");
  }
  const saveDraftAndSignIn = () => {
    try {
      sessionStorage.setItem("obi-ism.checkout-draft", JSON.stringify({ mode: purchaseMode, currency, email: email.value.trim(), readerName: readerName?.value || "", giftName: giftName?.value || "", giftEmail: giftEmail?.value || "", giftMessage: giftMessage?.value || "" }));
    } catch { /* The customer can re-enter the form after signing in. */ }
    location.assign("/login?next=checkout");
  };
  const startCheckout = async (confirmDuplicate = false, reviewedTotal = null) => {
    if (submitting) return;
    if (currency === "NGN" && !paystackQuote) { updateStatus("Paystack total is unavailable. Refresh the page and try again."); return; }
    submitting = true;
    button.disabled = true;
    try {
      const account = await apiFetch("/api/account/access", { cache: "no-store" });
      if (account.status === 401) { saveDraftAndSignIn(); return; }
      if (!account.ok) throw new Error("We could not check your account. Please try again.");
    } catch (error) {
      submitting = false; resetButton(); updateStatus(error.message || "We could not check your account. Please try again."); return;
    }
    submitting = false; button.disabled = false;
    if (confirmDuplicate || reviewedTotal !== null) {
      if (warning) warning.hidden = true;
      if (warningConfirm) warningConfirm.disabled = true;
      if (warningCancel) warningCancel.disabled = true;
    }
    const value = email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) { updateStatus("Enter a valid email address to continue to secure checkout."); email.focus(); return; }
    let gift = null;
    if (purchaseMode === "gift") {
      const recipientName = giftName.value.trim();
      const recipientEmail = giftEmail.value.trim();
      if (recipientName.length < 2) { updateStatus("Enter your friend’s name to continue."); giftName.focus(); return; }
      if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) { updateStatus("Enter a valid email address for your friend."); giftEmail.focus(); return; }
      if (recipientEmail.toLowerCase() === value.toLowerCase()) { updateStatus("Use a different email address for your friend."); giftEmail.focus(); return; }
      gift = {
        gift: true,
        gift_code: newGiftCode(),
        recipient_name: recipientName.slice(0, 80),
        recipient_email: recipientEmail,
        gift_message: giftMessage ? giftMessage.value.trim().slice(0, 240) : "",
      };
    }
    if (currency === "NGN" && reviewedTotal !== paystackQuote.total_minor) {
      const summary = paystackQuote.fee_minor > 0 ? `Edition ${money(paystackQuote.subtotal_minor)} + Paystack charge ${money(paystackQuote.fee_minor)} = total ${money(paystackQuote.total_minor)} NGN.` : `Total: ${money(paystackQuote.total_minor)} NGN.`;
      pendingCheckout = { kind: "review", confirmedDuplicate: confirmDuplicate, total: paystackQuote.total_minor };
      if (warning && warningText && warningConfirm) {
        if (warningTitle) warningTitle.textContent = "Review payment";
        warningText.textContent = summary;
        warningConfirm.textContent = "CONTINUE TO PAYSTACK";
        warningConfirm.disabled = false;
        if (warningCancel) warningCancel.disabled = false;
        warning.hidden = false;
        button.disabled = true;
        setButtonLabel("REVIEW BELOW");
        warning.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
        warningConfirm.focus({ preventScroll: true });
      } else if (window.confirm(summary)) return startCheckout(confirmDuplicate, paystackQuote.total_minor);
      else { hideWarning(); updateStatus("Checkout cancelled. No payment was made."); }
      return;
    }
    submitting = true;
    button.disabled = true;
    setButtonLabel(purchaseMode === "gift" ? "OPENING GIFT CHECKOUT…" : "OPENING SECURE CHECKOUT…");
    updateStatus(purchaseMode === "gift" ? "Creating your secure gift checkout…" : "Creating your secure checkout session…");
    try {
      const deviceToken = newDeviceToken();
      const response = await apiFetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: value, device_token: deviceToken, currency, reader_name: readerName ? readerName.value.trim() : "", ...(gift || {}), ...(currency === "NGN" ? { quoted_total_minor: paystackQuote.total_minor } : {}), ...(confirmDuplicate ? { confirm_duplicate: true } : {}) }) });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && body.code === "account_required") { saveDraftAndSignIn(); return; }
      if (response.status === 409 && body.code === "price_changed") {
        submitting = false; hideWarning(); await refreshPaystackQuote(); updateStatus("The Paystack total changed. Review it before continuing."); return;
      }
      if (response.status === 409 && body.requires_confirmation) {
        submitting = false;
        pendingCheckout = { kind: "duplicate", total: reviewedTotal };
        if (warning && warningText && warningConfirm) {
          warningText.textContent = body.warning || body.error || "This email already has an active edition. Continuing will buy a separate fresh edition.";
          if (warningTitle) warningTitle.textContent = gift ? "Another gift edition" : "Another edition";
          warningConfirm.textContent = gift ? "BUY A FRESH GIFT EDITION" : "BUY ANOTHER EDITION";
          warningConfirm.disabled = false;
          if (warningCancel) warningCancel.disabled = false;
          warning.hidden = false;
          button.disabled = true;
          setButtonLabel("CONFIRM BELOW");
          updateStatus(body.warning || body.error || "Confirm below to continue.");
          warning.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
          warningConfirm.focus({ preventScroll: true });
        } else if (window.confirm(body.warning || body.error || "Buy another edition?")) {
          return startCheckout(true, reviewedTotal);
        } else {
          hideWarning();
          updateStatus("Checkout cancelled. No payment was made.");
        }
        return;
      }
      if (!response.ok || !body.url || !/^(cs_[A-Za-z0-9_]{12,255}|obi_[a-z0-9]{16,64})$/.test(body.sessionId || "")) throw new Error(body.error || "Checkout could not be started.");
      if (gift) {
        localStorage.setItem(`obi-ism.gift.${body.sessionId}`, JSON.stringify({
          code: gift.gift_code,
          recipientName: gift.recipient_name,
          recipientEmail: gift.recipient_email,
          message: gift.gift_message,
        }));
      } else {
        localStorage.setItem(`obi-ism.reader-device.${body.sessionId}`, deviceToken);
        if (currency === "NGN" && location.hostname === "127.0.0.1" && location.port === "5514") {
          localStorage.setItem("obi-ism.local-pending-paystack", body.sessionId);
        }
      }
      location.assign(body.url);
    } catch (error) {
      submitting = false;
      hideWarning();
      updateStatus(error.message || "Checkout could not be started. Please try again.");
    }
  };
  button.addEventListener("click", () => startCheckout(false));
  if (warningConfirm) {
    warningConfirm.addEventListener("click", () => {
      if (!pendingCheckout) return;
      const next = pendingCheckout;
      if (next.kind === "review") startCheckout(next.confirmedDuplicate, next.total);
      else if (next.kind === "duplicate") startCheckout(true, next.total);
    });
  }
  if (warningCancel) {
    warningCancel.addEventListener("click", () => {
      submitting = false;
      hideWarning();
      restoreStatus();
    });
  }
})();
