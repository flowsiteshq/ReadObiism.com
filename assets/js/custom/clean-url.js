// Canonicalise old root-level .html URLs in the browser. Clean URLs are
// rewritten by Cloudflare; this also fixes old bookmarks and shared links.
(() => {
  const pages = new Set([
    "login", "reader", "redeem", "gift-confirmation", "bulk", "bulk-redeem",
    "bulk-confirmation", "verify-email", "terms", "privacy", "refund", "delete-account", "404",
  ]);
  const path = location.pathname;
  const match = path.match(/^\/([A-Za-z0-9_-]+)\.html$/);
  let clean = "";
  if (path === "/index.html") clean = "/";
  else if (match && pages.has(match[1])) clean = "/" + match[1];
  if (clean) history.replaceState(history.state, "", clean + location.search + location.hash);
})();
