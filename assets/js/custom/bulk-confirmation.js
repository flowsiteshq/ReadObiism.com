(() => {
  const $ = (id) => document.getElementById(id);
  const api = window.OBI_API.fetch;
  const incoming = new URLSearchParams(location.search).get("order");
  if (/^bprod_[a-f0-9]{32}$/.test(incoming || "")) sessionStorage.setItem("obi-ism.pending-bulk-order", incoming);
  if (location.search) history.replaceState(null, "", location.pathname);
  const order = sessionStorage.getItem("obi-ism.pending-bulk-order");
  let seats = [];
  const message = (text) => { $("message").textContent = text; };
  const statusLabel = (status) => ({ available: "Available", claimed: "Claimed", revoked: "Revoked" }[status] || status);

  function downloadCsv() {
    const rows = [
      ["Seat", "Status", "Recipient name", "Recipient email", "Recipient phone", "Claim link"],
      ...seats.map((seat) => [seat.seat_no, statusLabel(seat.status), seat.recipient_label, seat.recipient_email, seat.recipient_phone, seat.link]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `OBI-ISM-seats-${order}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderSeats(data) {
    const panel = $("seat-panel");
    const list = $("seat-list");
    if (!panel || !list) return;
    panel.hidden = !seats.length;
    list.replaceChildren();
    if (data?.limited) {
      const note = document.createElement("p");
      note.className = "fine";
      note.textContent = `Individual links are shown for the first ${data.max_individual} copies. Use the shared code for the remaining copies.`;
      list.append(note);
    }
    seats.slice(0, 100).forEach((seat) => {
      const card = document.createElement("article");
      card.className = "seat-card";
      const heading = document.createElement("div");
      heading.className = "seat-heading";
      const title = document.createElement("strong");
      title.textContent = `Seat ${seat.seat_no}`;
      const badge = document.createElement("span");
      badge.className = "seat-status";
      badge.dataset.status = seat.status;
      badge.textContent = statusLabel(seat.status);
      heading.append(title, badge);

      const linkRow = document.createElement("div");
      linkRow.className = "seat-link-row";
      const input = document.createElement("input");
      input.readOnly = true;
      input.value = seat.link || "Link unavailable";
      input.setAttribute("aria-label", `Seat ${seat.seat_no} claim link`);
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "outline-button";
      copy.textContent = "Copy";
      copy.disabled = !seat.link;
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(seat.link); message("Seat link copied."); }
        catch { input.select(); message("Select the link to copy it."); }
      });
      linkRow.append(input, copy);

      const assign = document.createElement("div");
      assign.className = "seat-assign";
      const label = document.createElement("input");
      label.placeholder = "Recipient name";
      label.value = seat.recipient_label || "";
      label.maxLength = 80;
      const email = document.createElement("input");
      email.type = "email";
      email.placeholder = "Recipient email (optional)";
      email.value = seat.recipient_email || "";
      const phone = document.createElement("input");
      phone.type = "tel";
      phone.placeholder = "WhatsApp/phone (optional)";
      phone.value = seat.recipient_phone || "";
      const assignButton = document.createElement("button");
      assignButton.type = "button";
      assignButton.className = "outline-button";
      assignButton.textContent = "Save recipient";
      assignButton.disabled = seat.status === "claimed";
      assignButton.addEventListener("click", async () => {
        assignButton.disabled = true;
        try {
          const response = await api("/api/bulk/seats/assign", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order_id: order, seat_no: seat.seat_no, label: label.value, email: email.value, phone: phone.value }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "Could not save the recipient.");
          message("Recipient saved.");
          await check(false);
        } catch (error) { message(error.message); assignButton.disabled = false; }
      });
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "text-button";
      revoke.textContent = "Revoke";
      revoke.disabled = seat.status === "revoked";
      revoke.addEventListener("click", async () => {
        revoke.disabled = true;
        try {
          const response = await api("/api/bulk/seats/revoke", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order_id: order, seat_no: seat.seat_no }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "Could not revoke the seat.");
          message("Seat revoked.");
          await check(false);
        } catch (error) { message(error.message); revoke.disabled = false; }
      });
      assign.append(label, email, phone, assignButton, revoke);
      card.append(heading, linkRow, assign);
      list.append(card);
    });
    if (seats.length > 100) {
      const note = document.createElement("p");
      note.className = "fine";
      note.textContent = "The first 100 seats are shown. Download the CSV for every seat link.";
      list.append(note);
    }
    $("seat-csv").hidden = !seats.length;
  }

  async function check(showMessage = true) {
    $("retry").hidden = true;
    if (showMessage) message("Checking your order…");
    if (!/^bprod_[a-f0-9]{32}$/.test(order || "")) {
      message("No order was found. Return to the website to start a purchase.");
      return;
    }
    try {
      const access = await api("/api/account/access", { cache: "no-store" });
      const account = await access.json().catch(() => ({}));
      if (access.status === 401 || (access.ok && !account.authenticated)) {
        message("Sign in to the account that placed this order.");
        $("sign-in").hidden = false;
        return;
      }
      if (!access.ok) throw new Error("Cannot reach the account service. Please try again later.");
      if (!account.email_verified) {
        message("Verify your account email before recovering this order.");
        $("retry").hidden = false;
        return;
      }
      const response = await api("/api/bulk/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: order }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not verify this order.");
      if (data.status !== "paid" || !data.code) {
        message(data.message || "Payment is not confirmed yet. Please check again.");
        $("retry").hidden = false;
        return;
      }
      $("shared-code").value = data.code;
      $("code-panel").hidden = Boolean(data.seats?.length);
      message(data.seats?.length
        ? `Payment confirmed. ${data.seats.length} individual seat links are ready below.`
        : `Payment confirmed. Your code has ${data.quantity} editions.`);
      seats = data.seats || [];
      renderSeats(data);
    } catch (error) {
      message(error.message || "Could not verify this order.");
      $("retry").hidden = false;
    }
  }

  $("retry").addEventListener("click", () => check());
  $("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("shared-code").value); message("Code copied."); }
    catch { $("shared-code").select(); message("Select the code to copy it."); }
  });
  $("seat-csv").addEventListener("click", downloadCsv);
  check();
})();
