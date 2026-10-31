
    (() => {
      const app = document.getElementById("app");
      const apiFetch = window.OBI_API.fetch;
      const params = new URLSearchParams(location.search);
      let sessionId = params.get("session_id");
      const validSession = (value) => typeof value === "string" && /^(cs_[A-Za-z0-9_]{12,255}|obi_[a-z0-9]{16,64})$/.test(value);
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
      const newToken = () => {
        const bytes = crypto.getRandomValues(new Uint8Array(48));
        return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
      };
      const fail = (message, retry = false) => {
        app.className = "access-state";
        app.innerHTML = `<div class="panel"><h1>Access <span style="color:#d5ac47">required</span></h1><p>${message}</p>${retry ? '<button class="retry" id="retry">RETRY ACCESS →</button>' : '<button class="retry" id="return">RETURN TO OBI-ISM →</button>'}</div>`;
        const button = document.getElementById(retry ? "retry" : "return");
        button.addEventListener("click", () => retry ? start() : location.assign("index.html"));
      };
      const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
      const offerTransfer = (deviceToken) => {
        app.className = "access-state";
        app.innerHTML = `<div class="panel"><h1>Move your <span style="color:#d5ac47">edition</span></h1><p>Your edition is active in another browser or device. Sign in to your account, then verify your purchase email to move it here.</p><button class="retry" id="send-code" type="button">SEND VERIFICATION CODE →</button><p id="transfer-status" aria-live="polite"></p><form id="transfer-form" hidden><label for="transfer-code">Eight-digit code</label><br><input id="transfer-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required style="font:inherit;padding:12px;margin-top:12px;max-width:100%"><br><button class="retry" type="submit">MOVE EDITION →</button></form><p><a href="login.html" style="color:#d5ac47">SIGN IN TO YOUR ACCOUNT</a></p></div>`;
        const status = document.getElementById("transfer-status");
        const send = document.getElementById("send-code");
        const form = document.getElementById("transfer-form");
        let challengeId = "";
        send.addEventListener("click", async () => {
          send.disabled = true;
          status.textContent = "Sending your verification code…";
          try {
            const response = await apiFetch("/api/reader/transfer/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, device_token: deviceToken }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || "Could not start verification.");
            challengeId = body.challengeId;
            form.hidden = false;
            status.textContent = body.message;
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
        app.className = "reader-shell";
        app.innerHTML = `<header class="reader-bar"><p class="brand">OBI–<span>ISM</span></p><div class="reader-bar-actions"><button class="chapter-toggle" id="chapter-toggle" type="button" aria-controls="chapter-sidebar" aria-expanded="false">☰ &nbsp; CHAPTERS</button><p class="secure">PRIVATE EDITION<br>ONE DEVICE · READ ONLY</p></div></header><section class="book"><button class="toc-backdrop" id="toc-backdrop" type="button" aria-label="Close chapters" hidden></button><nav class="toc" id="chapter-sidebar" aria-label="Table of contents"><div class="toc-header"><h2>CONTENTS</h2><button class="toc-close" id="toc-close" type="button" aria-label="Close chapters">CLOSE ×</button></div><div id="contents"></div></nav><article class="reading" id="reading"></article></section>`;
        const contents = document.getElementById("contents");
        const reading = document.getElementById("reading");
        const sidebar = document.getElementById("chapter-sidebar");
        const toggle = document.getElementById("chapter-toggle");
        const closeButton = document.getElementById("toc-close");
        const backdrop = document.getElementById("toc-backdrop");
        const mobile = window.matchMedia("(max-width: 820px)");
        const setSidebar = (open, restoreFocus = false) => {
          sidebar.hidden = mobile.matches && !open;
          backdrop.hidden = !mobile.matches || !open;
          toggle.setAttribute("aria-expanded", String(mobile.matches && open));
          if (mobile.matches && open) closeButton.focus();
          else if (mobile.matches && restoreFocus) toggle.focus();
        };
        setSidebar(false);
        toggle.addEventListener("click", () => setSidebar(true));
        closeButton.addEventListener("click", () => setSidebar(false, true));
        backdrop.addEventListener("click", () => setSidebar(false, true));
        mobile.addEventListener("change", () => setSidebar(false));
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && mobile.matches && !sidebar.hidden) setSidebar(false, true);
        });
        const show = async (index) => {
          current = Math.min(Math.max(index, 0), chapters.length - 1);
          const metadata = chapters[current];
          contents.innerHTML = chapters.map((item, itemIndex) => `<button data-chapter="${itemIndex}" aria-current="${itemIndex === current}"><small>${escape(item.label)}</small>${escape(item.title)}</button>`).join("");
          contents.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { setSidebar(false, true); void show(Number(button.dataset.chapter)); window.scrollTo({ top: 0, behavior: "smooth" }); }));
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
      async function start() {
        // No ?session_id in the URL? Recover it from the signed-in account so a
        // bookmark or a fresh visit still opens the purchased edition.
        if (!validSession(sessionId)) {
          try {
            const access = await apiFetch("/api/account/access", { cache: "no-store" });
            if (access.ok) sessionId = (await access.json()).sessionId;
          } catch { /* fall through to the access screen */ }
        }
        if (!validSession(sessionId)) return fail("Please sign in, or complete checkout from the OBI-ISM website, to open the reader.");
        const tokenKey = `obi-ism.reader-device.${sessionId}`;
        let deviceToken = localStorage.getItem(tokenKey);
        if (!deviceToken) { deviceToken = newToken(); localStorage.setItem(tokenKey, deviceToken); }
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
            return fail(claim.body.error || "We could not authorize this reader.", claim.status === 404);
          }
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
  