
    (() => {
      const app = document.getElementById("app");
      const apiFetch = window.OBI_API.fetch;
      const showReaderNotice = (text) => {
        const note = document.createElement("p");
        note.className = "reader-lock-note";
        note.setAttribute("role", "status");
        note.textContent = text;
        document.body.append(note);
        setTimeout(() => note.remove(), 4200);
      };
      const selectionInReading = () => {
        const selection = window.getSelection();
        const node = selection?.anchorNode;
        const element = node?.nodeType === 1 ? node : node?.parentElement;
        return Boolean(element?.closest?.(".reading"));
      };
      document.addEventListener("contextmenu", (event) => {
        if (event.target.closest?.(".reading")) {
          event.preventDefault();
          showReaderNotice("This edition is licensed to you. Copying and screenshots are not permitted.");
        }
      });
      document.addEventListener("copy", (event) => {
        if (selectionInReading()) {
          event.preventDefault();
          showReaderNotice("Copying is disabled. This copy is licensed to you.");
        }
      });
      document.addEventListener("cut", (event) => {
        if (selectionInReading()) {
          event.preventDefault();
          showReaderNotice("Cutting is disabled for this edition.");
        }
      });
      document.addEventListener("dragstart", (event) => {
        if (event.target.closest?.(".reading")) {
          event.preventDefault();
          showReaderNotice("Dragging text out of this edition is disabled.");
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "PrintScreen") showReaderNotice("Screenshots are traceable to this licensed copy.");
      });
      window.addEventListener("beforeprint", () => showReaderNotice("Printing is disabled for this edition."));
      const params = new URLSearchParams(location.search);
      let sessionId = params.get("session_id");
      let currentDeviceToken = "";
      const validSession = (value) => typeof value === "string" && /^(cs_[A-Za-z0-9_]{12,255}|obi_[a-z0-9]{16,64})$/.test(value);
      // Keep the payment return reference in this tab for refresh/retry, then
      // remove payment parameters from the address bar and current history entry.
      const pendingKey = "obi-ism.reader-return";
      let pendingReturn = null;
      try {
        if (validSession(sessionId)) {
          sessionStorage.setItem(pendingKey, sessionId);
          pendingReturn = sessionId;
          params.delete("session_id"); params.delete("trxref"); params.delete("reference");
          const query = params.toString();
          history.replaceState(history.state, "", location.pathname + (query ? "?" + query : "") + (location.hash || ""));
        } else {
          pendingReturn = sessionStorage.getItem(pendingKey);
        }
      } catch { /* Keep the original URL if tab storage or history is unavailable. */ }
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
      const newToken = () => {
        const bytes = crypto.getRandomValues(new Uint8Array(48));
        return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
      };
      const fail = (message, retry = false, signIn = false) => {
        app.className = "access-state";
        app.innerHTML = `<div class="panel"><h1>Access <span style="color:#d5ac47">required</span></h1><p>${message}</p>${retry ? '<button class="retry" id="retry">RETRY ACCESS →</button>' : signIn ? '<button class="retry" id="return">SIGN IN →</button>' : '<button class="retry" id="return">RETURN TO OBI-ISM →</button>'}</div>`;
        const button = document.getElementById(retry ? "retry" : "return");
        button.addEventListener("click", () => retry ? start() : location.assign(signIn ? "login.html" : "index.html"));
      };
      const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
      const offerTransfer = (deviceToken) => {
        app.className = "access-state";
        app.innerHTML = `<div class="panel"><h1>Move your <span style="color:#d5ac47">edition</span></h1><p>Your edition is active in another browser or device. Confirm your account password, then verify the email code to move it here. The old device will lose access.</p><label for="transfer-password" style="display:block;color:#d5ac47;font-size:9px;font-weight:800;letter-spacing:.15em;margin:18px 0 7px">CONFIRM YOUR ACCOUNT PASSWORD</label><input id="transfer-password" type="password" autocomplete="current-password" minlength="8" required style="font:inherit;padding:12px;max-width:100%;width:100%;border:1px solid #4b463b;border-radius:7px;background:#1b1f18;color:#fff"><button class="retry" id="send-code" type="button">SEND VERIFICATION CODE →</button><p id="transfer-status" aria-live="polite"></p><form id="transfer-form" hidden><label for="transfer-code">Eight-digit code</label><br><input id="transfer-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required style="font:inherit;padding:12px;margin-top:12px;max-width:100%"><br><button class="retry" type="submit">MOVE EDITION →</button></form><p style="color:#9f988a;font-size:11px;line-height:1.5">One active device. Transfers are limited to one every 7 days and three per 180 days.</p><p><a href="login.html" style="color:#d5ac47">SIGN IN TO YOUR ACCOUNT</a></p></div>`;
        const status = document.getElementById("transfer-status");
        const send = document.getElementById("send-code");
        const form = document.getElementById("transfer-form");
        const password = document.getElementById("transfer-password");
        let challengeId = "";
        send.addEventListener("click", async () => {
          const confirmed = password.value;
          if (!confirmed) { status.textContent = "Confirm your account password first."; password.focus(); return; }
          send.disabled = true;
          status.textContent = "Sending your verification code…";
          try {
            const response = await apiFetch("/api/reader/transfer/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, device_token: deviceToken, password: confirmed }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || "Could not start verification.");
            challengeId = body.challengeId;
            form.hidden = false;
            status.textContent = body.localTest === true && location.hostname === '127.0.0.1' && /^\d{8}$/.test(body.testCode || '')
              ? `Local test only — no email was sent. Your verification code is ${body.testCode}.`
              : body.message;
            send.textContent = "SEND A NEW CODE";
            document.getElementById("transfer-code").focus();
          } catch (error) { status.textContent = error.message || "Could not start verification."; }
          finally { send.disabled = false; }
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const button = form.querySelector("button");
          button.disabled = true;
          status.textContent = "Verifying your code…";
          try {
            const response = await apiFetch("/api/reader/transfer/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challenge_id: challengeId, code: document.getElementById("transfer-code").value.trim(), device_token: deviceToken }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || "Could not move your edition.");
            await start();
          } catch (error) { status.textContent = error.message || "Could not move your edition."; }
          finally { button.disabled = false; }
        });
      };
      const render = (edition, loadSection) => {
        let current = 0;
        const chapters = edition.chapters.filter((chapter) => chapter.kind !== "part");
        const sectionCache = new Map();
        const license = edition.license || {};
        const mark = license.email
          ? `<p class="license-mark" aria-hidden="true">LICENSED TO ${escape(license.email)}${license.reference ? ` · ${escape(license.reference)}` : ""}${license.device ? ` · ${escape(license.device)}` : ""}</p>`
          : "";
        const licenseField = license.email
          ? `<div class="license-field" aria-hidden="true"><span>${escape(license.email)} · ${escape(license.reference)}</span></div>`
          : "";
        const licenseCard = license.email
          ? `<div class="toc-license"><p>THIS COPY IS LICENSED TO</p><strong>${escape(license.email)}</strong><small>${escape(license.reference)}${license.device ? ` · ${escape(license.device)}` : ""}</small>${license.granted_at ? `<small>Activated ${escape(new Date(license.granted_at).toLocaleDateString())}</small>` : ""}<small class="toc-license-note">Screenshots are traceable to this copy.</small></div>`
          : "";
        app.className = "reader-shell";
        app.innerHTML = `<header class="reader-bar"><p class="brand">OBI–<span>ISM</span></p><div class="reader-bar-actions"><button class="chapter-toggle" id="chapter-toggle" type="button" aria-controls="chapter-sidebar" aria-expanded="false">☰ &nbsp; CHAPTERS</button><button class="feedback-button" id="feedback-open" type="button">✦ &nbsp; FEEDBACK</button><p class="secure">PRIVATE EDITION<br>ONE DEVICE · READ ONLY</p></div></header><section class="book"><button class="toc-backdrop" id="toc-backdrop" type="button" aria-label="Close chapters" hidden></button><nav class="toc" id="chapter-sidebar" aria-label="Table of contents"><div class="toc-header"><h2>CONTENTS</h2><button class="toc-close" id="toc-close" type="button" aria-label="Close chapters">CLOSE ×</button></div><div id="contents"></div>${licenseCard}</nav><article class="reading" id="reading"></article></section>${licenseField}${mark}`;
        document.getElementById("feedback-open")?.addEventListener("click", openFeedback);
        const contents = document.getElementById("contents");
        const reading = document.getElementById("reading");
        const sidebar = document.getElementById("chapter-sidebar");
        const toggle = document.getElementById("chapter-toggle");
        const closeButton = document.getElementById("toc-close");
        const backdrop = document.getElementById("toc-backdrop");
        const book = app.querySelector(".book");
        const bar = app.querySelector(".reader-bar");
        const mobile = window.matchMedia("(max-width: 820px)");
        const setSidebar = (open, restoreFocus = false) => {
          sidebar.hidden = !open;
          backdrop.hidden = !mobile.matches || !open;
          book.classList.toggle("toc-collapsed", !open);
          document.body.classList.toggle("reader-toc-open", mobile.matches && open);
          toggle.setAttribute("aria-expanded", String(open));
          if (mobile.matches && open) closeButton.focus();
          else if (mobile.matches && restoreFocus) toggle.focus();
        };
        const syncBarHeight = () => document.documentElement.style.setProperty("--reader-header-height", `${bar.getBoundingClientRect().height}px`);
        syncBarHeight();
        if (typeof ResizeObserver !== "undefined") new ResizeObserver(syncBarHeight).observe(bar);
        setSidebar(!mobile.matches);
        toggle.addEventListener("click", () => setSidebar(sidebar.hidden));
        closeButton.addEventListener("click", () => setSidebar(false, true));
        backdrop.addEventListener("click", () => setSidebar(false, true));
        mobile.addEventListener("change", () => setSidebar(!mobile.matches));
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && mobile.matches && !sidebar.hidden) setSidebar(false, true);
          if (event.key !== "Tab" || !mobile.matches || sidebar.hidden) return;
          const controls = [...sidebar.querySelectorAll("button:not([disabled])")];
          if (!controls.length) return;
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        });
        const show = async (index) => {
          current = Math.min(Math.max(index, 0), chapters.length - 1);
          const metadata = chapters[current];
          contents.innerHTML = chapters.map((item, itemIndex) => `<button data-chapter="${itemIndex}" aria-current="${itemIndex === current}"><small>${escape(item.label)}</small>${escape(item.title)}</button>`).join("");
          contents.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { if (mobile.matches) setSidebar(false, true); void show(Number(button.dataset.chapter)); window.scrollTo({ top: 0, behavior: "smooth" }); }));
          reading.innerHTML = `<p class="chapter-label">${escape(metadata.label)}</p><h1>${escape(metadata.title)}</h1><p>Loading this licensed section…</p>`;
          try {
            let chapter = sectionCache.get(metadata.id);
            if (!chapter) {
              chapter = await loadSection(metadata.id);
              sectionCache.set(metadata.id, chapter);
            }
            if (chapters[current].id !== metadata.id) return;
            reading.innerHTML = `<div class="notice">This is your protected OBI-ISM edition. Access is tied to this purchase and this device. Copying and sharing controls are intentionally limited.</div><p class="chapter-label">${escape(chapter.label)}</p><h1>${escape(chapter.title)}</h1>${chapter.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("")}<nav class="chapter-nav"><button id="previous" ${current === 0 ? "disabled" : ""}>← PREVIOUS</button><button id="next" ${current === chapters.length - 1 ? "disabled" : ""}>NEXT →</button></nav><p class="footer-note">OBI-ISM: Building a Just Society Through Character · Protected browser edition</p>`;
            document.getElementById("previous").addEventListener("click", () => void show(current - 1));
            document.getElementById("next").addEventListener("click", () => void show(current + 1));
            document.title = `${chapter.title} — OBI-ISM`;
          } catch {
            if (chapters[current].id === metadata.id) reading.innerHTML = `<p class="chapter-label">${escape(metadata.label)}</p><h1>${escape(metadata.title)}</h1><p>We could not load this section. Reconnect and try again.</p><button id="retry-section">RETRY SECTION</button>`;
            document.getElementById("retry-section")?.addEventListener("click", () => void show(current));
          }
        };
        void show(0);
      };
      function openFeedback() {
        if (!sessionId || !currentDeviceToken) return;
        document.querySelector(".feedback-modal")?.remove();
        const options = [[1, "😞", "Not for me"], [2, "😕", "It was okay"], [3, "🙂", "Good"], [4, "😊", "Loved it"], [5, "🤩", "Transforming"]];
        const modal = document.createElement("div");
        modal.className = "feedback-modal";
        modal.innerHTML = `<div class="feedback-backdrop" data-feedback-close></div><section class="feedback-card" role="dialog" aria-modal="true" aria-labelledby="feedback-title" tabindex="-1"><button class="feedback-close" type="button" data-feedback-close aria-label="Close feedback">×</button><p class="feedback-eyebrow">YOUR READING EXPERIENCE</p><h2 id="feedback-title">How did this edition feel?</h2><p class="feedback-intro">Choose the face that matches your experience. Your feedback goes privately to the OBI-ISM team.</p><div class="feedback-emojis" role="radiogroup" aria-label="Rate the book">${options.map(([value, emoji, label]) => `<button type="button" class="feedback-emoji" data-rating="${value}" role="radio" aria-checked="false"><span aria-hidden="true">${emoji}</span><small>${label}</small></button>`).join("")}</div><label class="feedback-label" for="feedback-comment">Anything you want to tell us? <span>Optional</span></label><textarea id="feedback-comment" maxlength="1000" rows="4" placeholder="What stayed with you? What could be better?"></textarea><div class="feedback-meta"><span id="feedback-count">0 / 1000</span><span id="feedback-message" role="status" aria-live="polite"></span></div><button class="feedback-submit" id="feedback-submit" type="button" disabled>SHARE MY FEEDBACK →</button><p class="feedback-note">Only readers with active access can submit feedback. Your comment is private to the OBI-ISM team.</p></section>`;
        document.body.append(modal);
        const card = modal.querySelector(".feedback-card");
        const submit = modal.querySelector("#feedback-submit");
        const comment = modal.querySelector("#feedback-comment");
        const count = modal.querySelector("#feedback-count");
        const message = modal.querySelector("#feedback-message");
        let rating = 0;
        const close = () => { document.removeEventListener("keydown", onKey); modal.remove(); document.getElementById("feedback-open")?.focus(); };
        const setRating = (value) => {
          rating = value;
          modal.querySelectorAll(".feedback-emoji").forEach((button) => {
            const selected = Number(button.dataset.rating) === value;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-checked", String(selected));
          });
          submit.disabled = !rating;
        };
        modal.querySelectorAll("[data-feedback-close]").forEach((element) => element.addEventListener("click", close));
        modal.querySelectorAll(".feedback-emoji").forEach((button) => button.addEventListener("click", () => setRating(Number(button.dataset.rating))));
        comment.addEventListener("input", () => { count.textContent = `${comment.value.length} / 1000`; });
        const onKey = (event) => { if (event.key === "Escape") { document.removeEventListener("keydown", onKey); close(); } };
        document.addEventListener("keydown", onKey);
        card.focus();
        apiFetch(`/api/reader/feedback?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store", headers: { "x-obi-device-token": currentDeviceToken } })
          .then((response) => response.ok ? response.json() : null)
          .then((data) => {
            if (!data?.feedback) return;
            setRating(Number(data.feedback.rating));
            comment.value = data.feedback.comment || "";
            count.textContent = `${comment.value.length} / 1000`;
            message.textContent = "You can update your feedback.";
          })
          .catch(() => {});
        submit.addEventListener("click", async () => {
          if (!rating) return;
          submit.disabled = true;
          message.textContent = "Saving…";
          try {
            const response = await apiFetch("/api/reader/feedback", {
              method: "POST",
              headers: { "content-type": "application/json", "x-obi-device-token": currentDeviceToken },
              body: JSON.stringify({ session_id: sessionId, device_token: currentDeviceToken, rating, comment: comment.value }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Could not save feedback.");
            card.innerHTML = `<button class="feedback-close" type="button" data-feedback-close aria-label="Close feedback">×</button><div class="feedback-thanks"><span aria-hidden="true">🤩</span><p class="feedback-eyebrow">THANK YOU</p><h2>Your feedback matters.</h2><p>Your rating and comment have been shared privately with the OBI-ISM team.</p><button class="feedback-submit" type="button" data-feedback-close>CLOSE</button></div>`;
            card.querySelectorAll("[data-feedback-close]").forEach((element) => element.addEventListener("click", close));
            card.focus();
          } catch (error) {
            message.textContent = error.message || "Could not save feedback.";
            submit.disabled = false;
          }
        });
      }

      async function start() {
        // No ?session_id in the URL? Recover it from the signed-in account so a
        // bookmark or a fresh visit still opens the purchased edition.
        if (!validSession(sessionId)) {
          try {
            const access = await apiFetch("/api/account/access", { cache: "no-store" });
            if (access.ok) sessionId = (await access.json()).sessionId;
          } catch { /* fall through to the access screen */ }
        }
        if (!validSession(sessionId) && validSession(pendingReturn)) sessionId = pendingReturn;
        if (!validSession(sessionId)) return fail("Please sign in to your account to open your edition.", false, true);
        const tokenKey = `obi-ism.reader-device.${sessionId}`;
        let deviceToken = localStorage.getItem(tokenKey);
        if (!deviceToken) { deviceToken = newToken(); localStorage.setItem(tokenKey, deviceToken); }
        currentDeviceToken = deviceToken;
        localStorage.setItem("obi-ism.last-session", sessionId);
        const claimOnce = async () => {
          const response = await apiFetch("/api/reader/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, device_token: deviceToken }) });
          return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
        };
        try {
          let claim = await claimOnce();
          // Stripe/Paystack webhooks can land a moment after the redirect back.
          for (let attempt = 0; attempt < 4 && claim.status === 404; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            claim = await claimOnce();
          }
          if (!claim.ok) {
            if (claim.status === 409 && !/gift/i.test(claim.body.error || "")) return offerTransfer(deviceToken);
            if (claim.status === 429) {
              const seconds = Number(claim.body.retryAfter);
              const wait = Number.isFinite(seconds) && seconds > 0 ? ` Please wait about ${Math.ceil(seconds / 60)} minute(s) before retrying.` : " Please wait a moment before retrying.";
              return fail("Too many attempts." + wait, true);
            }
            return fail(claim.body.error || "We could not authorize this reader.", claim.status === 404);
          }
          if (location.hostname === "127.0.0.1" && location.port === "5514" && localStorage.getItem("obi-ism.local-pending-paystack") === sessionId) localStorage.removeItem("obi-ism.local-pending-paystack");
          const reader = await apiFetch(`/api/reader?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store", headers: { "x-obi-device-token": deviceToken } });
          if (!reader.ok) { const body = await reader.json().catch(() => ({})); return fail(body.error || "We could not load this protected edition.", reader.status === 403 || reader.status === 404); }
          const edition = await reader.json();
          const loadSection = async (sectionId) => {
            const response = await apiFetch(`/api/reader?session_id=${encodeURIComponent(sessionId)}&section_id=${encodeURIComponent(sectionId)}`, { cache: "no-store", headers: { "x-obi-device-token": deviceToken } });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || !body.chapter) throw new Error(body.error || "Section unavailable");
            return body.chapter;
          };
          render(edition, loadSection);
        } catch { fail("A secure connection is required to open the reader.", true); }
      }
      start();
    })();
  