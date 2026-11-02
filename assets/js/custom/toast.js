(() => {
  if (window.OBI_TOAST) return;
  const ensureContainer = () => {
    let container = document.getElementById("obi-toasts");
    if (!container) {
      container = document.createElement("div");
      container.id = "obi-toasts";
      container.className = "obi-toasts";
      container.setAttribute("role", "status");
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "false");
      document.body.append(container);
    }
    return container;
  };
  const show = (message, type = "success", timeout = 4500) => {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => show(message, type, timeout), { once: true });
      return;
    }
    const container = ensureContainer();
    const toast = document.createElement("div");
    toast.className = `obi-toast obi-toast-${["success", "error", "info"].includes(type) ? type : "info"}`;
    const text = document.createElement("span");
    text.textContent = String(message || "");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "obi-toast-close";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    toast.append(text, close);
    container.append(toast);
    let timer = setTimeout(remove, timeout);
    function remove() {
      clearTimeout(timer);
      toast.classList.add("obi-toast-out");
      setTimeout(() => toast.remove(), 200);
    }
    close.addEventListener("click", remove);
  };
  window.OBI_TOAST = Object.freeze({ show });
})();
