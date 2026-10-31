// Shared browser API connection for the public website and reader.
// Production and the local proxy use the same origin. Five Server's legacy
// preview on port 5500 talks to the local Worker directly.
(() => {
  const base = (["127.0.0.1", "localhost"].includes(location.hostname) && location.port === "5500")
    ? "http://127.0.0.1:8787"
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
