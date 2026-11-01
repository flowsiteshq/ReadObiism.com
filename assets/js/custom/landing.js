
(() => {
  const video = document.getElementById("hero-video");
  const motionControl = document.getElementById("motion-control");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
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
  const params = new URLSearchParams(location.search);
  let currency = "NGN";
  let purchaseMode = params.get("gift") === "1" ? "gift" : "self";
  const priceLabel = () => (currency === "NGN" ? "₦6,995 NGN" : "$9.95 USD");
  const setButtonLabel = (text) => { button.innerHTML = `${text} <span class="arrow">→</span>`; };
  const updateStatus = (override) => {
    if (override) { status.textContent = override; return; }
    status.textContent = purchaseMode === "gift"
      ? `${priceLabel()} · One-time gift · One code for your friend.`
      : `${priceLabel()} · One-time payment · You will return directly to your protected reader.`;
  };
  const setMode = (next) => {
    purchaseMode = next;
    const gift = next === "gift";
    modeSelf.setAttribute("aria-pressed", String(!gift));
    modeGift.setAttribute("aria-pressed", String(gift));
    giftFields.hidden = !gift;
    if (purchaseNote) purchaseNote.hidden = gift;
    emailLabel.textContent = gift ? "YOUR EMAIL (FOR YOUR RECEIPT)" : "EMAIL FOR YOUR PRIVATE EDITION";
    setButtonLabel(gift ? "BUY AS A GIFT" : "BUY THE DIGITAL EDITION");
    updateStatus();
  };
  const setCurrency = (next) => {
    currency = next;
    const naira = next === "NGN";
    document.getElementById("purchase-price").textContent = naira ? "₦6,995" : "$9.95";
    document.getElementById("purchase-currency").textContent = naira ? "NGN" : "USD";
    document.getElementById("currency-ngn").setAttribute("aria-pressed", String(naira));
    document.getElementById("currency-usd").setAttribute("aria-pressed", String(!naira));
    updateStatus();
  };
  document.getElementById("currency-ngn").addEventListener("click", () => setCurrency("NGN"));
  document.getElementById("currency-usd").addEventListener("click", () => setCurrency("USD"));
  modeSelf.addEventListener("click", () => setMode("self"));
  modeGift.addEventListener("click", () => setMode("gift"));
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
  if (params.get("purchase") === "cancelled") {
    updateStatus(params.get("gift") === "1" ? "Gift checkout was cancelled. No payment was made." : "Checkout was cancelled. No payment was made.");
  }
  button.addEventListener("click", async () => {
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
    button.disabled = true;
    const label = button.innerHTML;
    setButtonLabel(purchaseMode === "gift" ? "OPENING GIFT CHECKOUT…" : "OPENING SECURE CHECKOUT…");
    updateStatus(purchaseMode === "gift" ? "Creating your secure gift checkout…" : "Creating your secure checkout session…");
    try {
      const deviceToken = newDeviceToken();
      const response = await apiFetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: value, device_token: deviceToken, currency, ...(gift || {}) }) });
      const body = await response.json().catch(() => ({}));
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
      updateStatus(error.message || "Checkout could not be started. Please try again.");
      button.disabled = false;
      button.innerHTML = label;
    }
  });
})();
