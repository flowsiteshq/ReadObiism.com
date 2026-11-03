
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
      let activeLicense = {};
      const readerState = new Map();
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
        activeLicense = license;
        const displayName = license.name || license.email;
        const mark = license.email
          ? `<p class="license-mark" aria-hidden="true">LICENSED TO ${escape(displayName)}${license.reference ? ` · ${escape(license.reference)}` : ""}${license.device ? ` · ${escape(license.device)}` : ""}</p>`
          : "";
        const licenseField = license.email
          ? `<div class="license-field" aria-hidden="true"><span>${escape(displayName)} · ${escape(license.edition || license.reference)}</span></div>`
          : "";
        const licenseCard = license.email
          ? `<div class="toc-license"><p>THIS COPY IS LICENSED TO</p><strong>${escape(displayName)}</strong>${license.name && license.email ? `<small>${escape(license.email)}</small>` : ""}<small>${license.edition ? `${escape(license.edition)} · ` : ""}${escape(license.reference)}${license.device ? ` · ${escape(license.device)}` : ""}</small>${license.granted_at ? `<small>Activated ${escape(new Date(license.granted_at).toLocaleDateString())}</small>` : ""}<button class="certificate-button" type="button" data-certificate-open>VIEW CERTIFICATE →</button><small class="toc-license-note">Screenshots are traceable to this copy.</small></div>`
          : "";
        app.className = "reader-shell";
        app.innerHTML = `<header class="reader-bar"><p class="brand">OBI–<span>ISM</span></p><div class="reader-bar-actions"><button class="chapter-toggle" id="chapter-toggle" type="button" aria-controls="chapter-sidebar" aria-expanded="false">☰ &nbsp; CHAPTERS</button><button class="feedback-button" id="feedback-open" type="button">✦ &nbsp; FEEDBACK</button><p class="secure">PRIVATE EDITION<br>ONE DEVICE · READ ONLY</p></div></header><section class="book"><button class="toc-backdrop" id="toc-backdrop" type="button" aria-label="Close chapters" hidden></button><nav class="toc" id="chapter-sidebar" aria-label="Table of contents"><div class="toc-header"><h2>CONTENTS</h2><button class="toc-close" id="toc-close" type="button" aria-label="Close chapters">CLOSE ×</button></div><div id="contents"></div>${licenseCard}</nav><article class="reading" id="reading"></article></section>${licenseField}${mark}`;
        document.getElementById("feedback-open")?.addEventListener("click", openFeedback);
        document.querySelector("[data-certificate-open]")?.addEventListener("click", openCertificate);
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
        const markToc = () => {
          contents.querySelectorAll("button").forEach((button) => {
            const state = readerState.get(chapters[Number(button.dataset.chapter)]?.id);
            const flags = button.querySelector(".toc-flags");
            if (flags) flags.textContent = `${state?.bookmark ? "★" : ""}${state?.note ? "✎" : ""}`;
          });
        };
        const updateProgress = () => {
          const metadata = chapters[current];
          if (!metadata || !reading) return;
          const rect = reading.getBoundingClientRect();
          const progress = Math.max(0, Math.min(1, (window.scrollY + window.innerHeight - (rect.top + window.scrollY)) / Math.max(1, rect.height)));
          const state = readerState.get(metadata.id) || { section_id: metadata.id, bookmark: 0, note: "", progress: 0 };
          state.progress = progress;
          readerState.set(metadata.id, state);
          const label = document.getElementById("chapter-progress");
          if (label) label.textContent = `${Math.round(progress * 100)}%`;
          if (Date.now() - lastProgressSave > 2500) {
            lastProgressSave = Date.now();
            void saveReaderState(metadata.id, { progress });
          }
        };
        const show = async (index, restoreProgress = 0) => {
          current = Math.min(Math.max(index, 0), chapters.length - 1);
          const metadata = chapters[current];
          contents.innerHTML = chapters.map((item, itemIndex) => `<button data-chapter="${itemIndex}" aria-current="${itemIndex === current}"><small>${escape(item.label)}</small>${escape(item.title)}<span class="toc-flags" aria-hidden="true"></span></button>`).join("");
          contents.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { if (mobile.matches) setSidebar(false, true); void show(Number(button.dataset.chapter)); window.scrollTo({ top: 0, behavior: "smooth" }); }));
          markToc();
          reading.innerHTML = `<p class="chapter-label">${escape(metadata.label)}</p><h1>${escape(metadata.title)}</h1><p>Loading this licensed section…</p>`;
          try {
            let chapter = sectionCache.get(metadata.id);
            if (!chapter) {
              chapter = await loadSection(metadata.id);
              sectionCache.set(metadata.id, chapter);
            }
            if (chapters[current].id !== metadata.id) return;
            const state = readerState.get(chapter.id) || { section_id: chapter.id, bookmark: 0, note: "", progress: 0 };
            readerState.set(chapter.id, state);
            reading.innerHTML = `<div class="notice">This is your protected OBI-ISM edition. Access is tied to this purchase and this device. Copying and sharing controls are intentionally limited.</div><div class="chapter-tools"><button class="chapter-tool" id="bookmark-toggle" type="button" aria-pressed="false">☆ SAVE</button><button class="chapter-tool" id="note-toggle" type="button">✎ NOTE</button><span class="chapter-progress" id="chapter-progress">0%</span></div><p class="chapter-label">${escape(chapter.label)}</p><h1>${escape(chapter.title)}</h1>${chapter.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("")}<nav class="chapter-nav"><button id="previous" ${current === 0 ? "disabled" : ""}>← PREVIOUS</button><button id="next" ${current === chapters.length - 1 ? "disabled" : ""}>NEXT →</button></nav><p class="footer-note">OBI-ISM: Building a Just Society Through Character · Protected browser edition</p>`;
            const bookmarkToggle = document.getElementById("bookmark-toggle");
            const noteToggle = document.getElementById("note-toggle");
            const progressLabel = document.getElementById("chapter-progress");
            const syncTools = () => {
              bookmarkToggle.textContent = state.bookmark ? "★ SAVED" : "☆ SAVE";
              bookmarkToggle.setAttribute("aria-pressed", String(Boolean(state.bookmark)));
              noteToggle.textContent = state.note ? "✎ NOTE •" : "✎ NOTE";
              if (progressLabel) progressLabel.textContent = `${Math.round(Number(state.progress || 0) * 100)}%`;
            };
            syncTools();
            bookmarkToggle.addEventListener("click", async () => {
              state.bookmark = state.bookmark ? 0 : 1;
              syncTools(); markToc();
              await saveReaderState(chapter.id, { bookmark: state.bookmark });
            });
            noteToggle.addEventListener("click", () => openNote(chapter.id, state.note || "", (note) => {
              state.note = note; syncTools(); markToc();
            }));
            document.getElementById("previous").addEventListener("click", () => void show(current - 1));
            document.getElementById("next").addEventListener("click", () => void show(current + 1));
            document.title = `${chapter.title} — OBI-ISM`;
            updateProgress();
            if (restoreProgress > 0) {
              requestAnimationFrame(() => {
                const top = reading.getBoundingClientRect().top + window.scrollY;
                window.scrollTo(0, top + restoreProgress * Math.max(0, reading.offsetHeight - window.innerHeight));
              });
            }
          } catch {
            if (chapters[current].id === metadata.id) reading.innerHTML = `<p class="chapter-label">${escape(metadata.label)}</p><h1>${escape(metadata.title)}</h1><p>We could not load this section. Reconnect and try again.</p><button id="retry-section">RETRY SECTION</button>`;
            document.getElementById("retry-section")?.addEventListener("click", () => void show(current));
          }
        };
        let lastProgressSave = 0;
        let scrollTick = false;
        window.addEventListener("scroll", () => {
          if (scrollTick) return;
          scrollTick = true;
          requestAnimationFrame(() => { scrollTick = false; updateProgress(); });
        }, { passive: true });
        const loadReaderState = async () => {
          try {
            const response = await apiFetch(`/api/reader/state?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store", headers: { "x-obi-device-token": currentDeviceToken } });
            if (response.ok) {
              const data = await response.json();
              (data.items || []).forEach((item) => readerState.set(item.section_id, item));
              const index = data.last ? chapters.findIndex((chapter) => chapter.id === data.last.section_id) : -1;
              if (index >= 0) { await show(index, Number(data.last.progress) || 0); return; }
            }
          } catch { /* local reading still works */ }
          await show(0);
        };
        void loadReaderState();
      };
      function openCertificate() {
        const license = activeLicense;
        if (!license.email) return;
        document.querySelector(".certificate-modal")?.remove();
        const name = license.name || license.email;
        const issued = license.granted_at
          ? new Date(license.granted_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
          : new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
        const modal = document.createElement("div");
        modal.className = "feedback-modal certificate-modal";
        modal.innerHTML = `<div class="feedback-backdrop" data-certificate-close></div><section class="certificate-card" role="dialog" aria-modal="true" aria-labelledby="certificate-title" tabindex="-1"><button class="feedback-close" type="button" data-certificate-close aria-label="Close certificate">×</button><p class="certificate-eyebrow">OBI–ISM · LICENSED EDITION</p><div class="certificate-ornament" aria-hidden="true">✦</div><h2 id="certificate-title">Certificate of Licensed Reading</h2><p class="certificate-lead">This certifies that</p><p class="certificate-name">${escape(name)}</p>${license.name && license.email ? `<p class="certificate-email">${escape(license.email)}</p>` : ""}<p class="certificate-lead">is the licensed reader of the complete digital edition of</p><p class="certificate-book">Building a Just Society Through Character</p><div class="certificate-details"><div><span>EDITION</span><strong>${escape(license.edition || license.reference)}</strong></div><div><span>COPY REFERENCE</span><strong>${escape(license.reference || "—")}</strong></div><div><span>ACTIVATED</span><strong>${escape(issued)}</strong></div><div><span>DEVICE</span><strong>${escape(license.device || "Registered reader")}</strong></div></div><p class="certificate-note">This is a personal, traceable licence. The edition is bound to one active device and may be moved only through the verified transfer process.</p><div class="certificate-signature"><span>OBI–<i>ISM</i></span><small>PEOPLE · PRINCIPLES · PROGRESS</small></div><button class="feedback-submit" id="certificate-download" type="button">DOWNLOAD CERTIFICATE →</button></section>`;
        document.body.append(modal);
        const card = modal.querySelector(".certificate-card");
        const close = () => { document.removeEventListener("keydown", onKey); modal.remove(); };
        const onKey = (event) => { if (event.key === "Escape") { document.removeEventListener("keydown", onKey); close(); } };
        modal.querySelectorAll("[data-certificate-close]").forEach((element) => element.addEventListener("click", close));
        document.addEventListener("keydown", onKey);
        card.focus();
        modal.querySelector("#certificate-download")?.addEventListener("click", () => {
          const xml = (value) => String(value ?? "").replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[character]));
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#f8f3e8"/><rect x="34" y="34" width="932" height="632" fill="none" stroke="#c69b38" stroke-width="2"/><rect x="48" y="48" width="904" height="604" fill="none" stroke="#e2d6c1" stroke-width="1"/><text x="500" y="120" text-anchor="middle" font-family="Georgia,serif" font-size="54" font-weight="700" letter-spacing="-3" fill="#10130f">OBI–<tspan fill="#a87918">ISM</tspan></text><text x="500" y="152" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" letter-spacing="4" fill="#8b6a1c">LICENSED EDITION</text><text x="500" y="235" text-anchor="middle" font-family="Georgia,serif" font-size="38" font-weight="700" fill="#10130f">Certificate of Licensed Reading</text><text x="500" y="285" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#5f584c">This certifies that</text><text x="500" y="340" text-anchor="middle" font-family="Georgia,serif" font-size="40" font-weight="700" fill="#10130f">${xml(name)}</text>${license.name && license.email ? `<text x="500" y="370" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#746c5f">${xml(license.email)}</text>` : ""}<text x="500" y="415" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#5f584c">is the licensed reader of the complete digital edition of</text><text x="500" y="450" text-anchor="middle" font-family="Georgia,serif" font-size="26" font-style="italic" fill="#17140e">Building a Just Society Through Character</text><text x="250" y="530" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" letter-spacing="2" fill="#8b6a1c">EDITION</text><text x="250" y="555" text-anchor="middle" font-family="Georgia,serif" font-size="22" fill="#10130f">${xml(license.edition || license.reference)}</text><text x="500" y="530" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" letter-spacing="2" fill="#8b6a1c">COPY REFERENCE</text><text x="500" y="555" text-anchor="middle" font-family="Georgia,serif" font-size="22" fill="#10130f">${xml(license.reference || "—")}</text><text x="750" y="530" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" letter-spacing="2" fill="#8b6a1c">ACTIVATED</text><text x="750" y="555" text-anchor="middle" font-family="Georgia,serif" font-size="18" fill="#10130f">${xml(issued)}</text><text x="500" y="625" text-anchor="middle" font-family="Georgia,serif" font-size="22" font-weight="700" fill="#10130f">OBI–<tspan fill="#a87918">ISM</tspan></text></svg>`;
          const blob = new Blob([svg], { type: "image/svg+xml" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `OBI-ISM-certificate-${license.reference || "licensed"}.svg`;
          link.style.display = "none";
          document.body.append(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        });
      }

      async function saveReaderState(sectionId, patch) {
        if (!sessionId || !currentDeviceToken || !sectionId) return null;
        try {
          const response = await apiFetch("/api/reader/state", {
            method: "POST",
            headers: { "content-type": "application/json", "x-obi-device-token": currentDeviceToken },
            body: JSON.stringify({ session_id: sessionId, device_token: currentDeviceToken, section_id: sectionId, ...patch }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.state) return null;
          readerState.set(data.state.section_id, data.state);
          return data.state;
        } catch { return null; }
      }

      function openNote(sectionId, note, onSave) {
        if (!sectionId) return;
        document.querySelector(".note-modal")?.remove();
        const modal = document.createElement("div");
        modal.className = "feedback-modal note-modal";
        modal.innerHTML = `<div class="feedback-backdrop" data-note-close></div><section class="feedback-card note-card" role="dialog" aria-modal="true" aria-labelledby="note-title" tabindex="-1"><button class="feedback-close" type="button" data-note-close aria-label="Close note">×</button><p class="feedback-eyebrow">PRIVATE NOTE</p><h2 id="note-title">A note for this chapter.</h2><p class="feedback-intro">Only you can see this note. It stays with your licensed copy.</p><textarea id="note-text" maxlength="4000" rows="6" placeholder="What do you want to remember?"></textarea><div class="feedback-meta"><span id="note-count">0 / 4000</span><span id="note-message" class="feedback-message" role="status" aria-live="polite"></span></div><button class="feedback-submit" id="note-save" type="button">SAVE NOTE →</button></section>`;
        document.body.append(modal);
        const card = modal.querySelector(".note-card");
        const textarea = modal.querySelector("#note-text");
        const count = modal.querySelector("#note-count");
        const message = modal.querySelector("#note-message");
        const save = modal.querySelector("#note-save");
        textarea.value = note || "";
        count.textContent = `${textarea.value.length} / 4000`;
        const close = () => { document.removeEventListener("keydown", onKey); modal.remove(); };
        modal.querySelectorAll("[data-note-close]").forEach((element) => element.addEventListener("click", close));
        const onKey = (event) => { if (event.key === "Escape") { document.removeEventListener("keydown", onKey); close(); } };
        document.addEventListener("keydown", onKey);
        textarea.addEventListener("input", () => { count.textContent = `${textarea.value.length} / 4000`; });
        save.addEventListener("click", async () => {
          save.disabled = true;
          message.textContent = "Saving…";
          const state = await saveReaderState(sectionId, { note: textarea.value });
          if (!state) { message.textContent = "Could not save the note."; save.disabled = false; return; }
          onSave(state.note || "");
          document.removeEventListener("keydown", onKey);
          close();
          showReaderNotice("Note saved.");
        });
        card.focus();
        textarea.focus();
      }

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
  