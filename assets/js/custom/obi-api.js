// Shared browser API connection for the public website and reader.
// Production and the local proxy use the same origin. Other loopback previews
// use the explicitly configured local proxy; no live API is selected locally.
(() => {
  const base = (location.protocol === "http:" && ["127.0.0.1", "localhost"].includes(location.hostname) && location.port !== "5514")
    ? "http://127.0.0.1:5514"
    : "";
  const apiFetch = (path, options = {}) => {
    const token = localStorage.getItem("obi-ism.session-token");
    return fetch(`${base}${path}`, {
      ...options,
      credentials: "include",
      headers: { ...(options.headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  };
  window.OBI_API = Object.freeze({ fetch: apiFetch });
})();
