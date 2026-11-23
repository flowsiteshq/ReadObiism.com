(() => {
  const container = document.getElementById("blog-edition-content");
  if (!container) return;
  async function mount() {
    try {
      const response = await fetch("/index.html", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not load the edition.");
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const preface = page.getElementById("preface");
      const edition = page.getElementById("edition");
      if (!preface || !edition || !edition.querySelector("#buy-edition")) throw new Error("Could not load the edition.");
      container.replaceChildren(document.importNode(preface, true), document.importNode(edition, true));
      const script = document.createElement("script");
      script.src = "/assets/js/custom/landing-analytics-20261123.js";
      script.onerror = () => {
        const status = document.getElementById("purchase-status");
        const button = document.getElementById("buy-edition");
        if (button) button.disabled = true;
        if (status) status.textContent = "Checkout could not load. Please purchase from the OBI-ISM website.";
      };
      document.body.append(script);
      const editionLink = document.querySelector(".blog-header a[href='/#edition']");
      if (editionLink) editionLink.href = "#edition";
      if (location.hash === "#edition" || location.hash === "#preface") {
        document.querySelector(location.hash)?.scrollIntoView();
      }
    } catch {
      container.innerHTML = '<div class="article-wrap"><p>We could not load the preface and edition here.</p><p><a href="/#edition">Read and purchase on the OBI-ISM website →</a></p></div>';
    }
  }
  void mount();
})();