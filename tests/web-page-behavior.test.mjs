import { test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const landing = readFileSync(new URL("../web/assets/js/pages/landing.js", import.meta.url), "utf8");
const login = readFileSync(new URL("../web/assets/js/pages/login.js", import.meta.url), "utf8");
const reader = readFileSync(new URL("../web/assets/js/pages/reader.js", import.meta.url), "utf8");

function elements() {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) {
      const handlers = {};
      const attributes = {};
      nodes.set(id, {
        value: "", textContent: "", innerHTML: "", hidden: false, disabled: false,
        classList: { toggle() {} },
        addEventListener: (event, callback) => { handlers[event] = callback; },
        setAttribute: (name, value) => { attributes[name] = value; },
        getAttribute: (name) => attributes[name],
        querySelectorAll: () => [],
        focus() {},
        click: () => handlers.click?.(),
      });
    }
    return nodes.get(id);
  };
  return { get, document: { getElementById: get, querySelector: get, addEventListener() {} } };
}

test("landing preserves currency and gift choices and sends the selected currency", async () => {
  const { get, document } = elements();
  const calls = [];
  const redirects = [];
  const storage = new Map();
  // Match the initial aria state declared by the landing-page markup.
  get("currency-ngn").setAttribute("aria-pressed", "true");
  get("currency-usd").setAttribute("aria-pressed", "false");
  const context = {
    document,
    window: { matchMedia: () => ({ matches: true }), OBI_API: { fetch: async (path, options) => {
      calls.push({ path, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ url: "https://checkout.example.test", sessionId: `obi_${"a".repeat(24)}` }) };
    } } },
    navigator: {}, location: { search: "", assign: (url) => redirects.push(url) }, URLSearchParams,
    crypto: { getRandomValues: (bytes) => { bytes.fill(7); return bytes; } },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
  };
  vm.runInNewContext(landing, context);
  expect(get("currency-ngn").getAttribute("aria-pressed")).toBe("true");
  get("currency-usd").click();
  expect(get("purchase-price").textContent).toBe("$9.95");
  expect(get("currency-usd").getAttribute("aria-pressed")).toBe("true");
  get("currency-ngn").click();
  expect(get("purchase-currency").textContent).toBe("NGN");
  expect(get("currency-ngn").getAttribute("aria-pressed")).toBe("true");
  get("currency-usd").click();
  get("mode-gift").click();
  expect(get("gift-fields").hidden).toBe(false);
  get("mode-self").click();
  expect(get("gift-fields").hidden).toBe(true);
  get("purchase-email").value = "reader@example.test";
  await get("buy-edition").click();
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe("/api/checkout");
  expect(calls[0].body.currency).toBe("USD");
  expect(redirects).toEqual(["https://checkout.example.test"]);
  expect(storage.size).toBe(1);
});

test("reader loads a licensed section and opens and closes the mobile sidebar", async () => {
  const { get, document } = elements();
  const sessionId = `obi_${"a".repeat(24)}`;
  const token = "b".repeat(32);
  const calls = [];
  const storage = new Map([[`obi-ism.reader-device.${sessionId}`, token]]);
  const section = { id: "chapter-1", label: "CHAPTER ONE", title: "Sample chapter", kind: "chapter", paragraphs: ["A synthetic test paragraph."] };
  const context = {
    document,
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }), scrollTo() {}, OBI_API: { fetch: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === "/api/reader/claim") return { ok: true, status: 200, json: async () => ({ access: true }) };
      if (path.includes("section_id=")) return { ok: true, status: 200, json: async () => ({ chapter: section }) };
      return { ok: true, status: 200, json: async () => ({ chapters: [section] }) };
    } } },
    location: { search: `?session_id=${sessionId}`, assign() {} }, URLSearchParams,
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  };
  vm.runInNewContext(reader, context);
  await vi.waitFor(() => expect(get("reading").innerHTML).toContain("A synthetic test paragraph."));
  expect(get("chapter-sidebar").hidden).toBe(true);
  get("chapter-toggle").click();
  expect(get("chapter-sidebar").hidden).toBe(false);
  expect(get("chapter-toggle").getAttribute("aria-expanded")).toBe("true");
  get("toc-close").click();
  expect(get("chapter-sidebar").hidden).toBe(true);
  expect(calls.filter((call) => call.path.startsWith("/api/reader?")).every((call) => call.options.headers["x-obi-device-token"] === token)).toBe(true);
});

test("authentication screen switches between sign-in and registration", async () => {
  const { get, document } = elements();
  const calls = [];
  const context = {
    document,
    window: { OBI_API: { fetch: async (path) => { calls.push(path); return { ok: true, json: async () => ({ account: { email: "reader@example.test" }, access: false }) }; } } },
    localStorage: { setItem() {} }, location: { assign() {} },
  };
  vm.runInNewContext(login, context);
  get("create-tab").onclick();
  expect(get("heading").textContent).toBe("Create your account.");
  expect(get("password").autocomplete).toBe("new-password");
  get("email").value = "reader@example.test";
  get("password").value = "example-password";
  await get("form").onsubmit({ preventDefault() {} });
  expect(calls).toEqual(["/api/account/register"]);
  get("sign-tab").onclick();
  expect(get("heading").textContent).toBe("Welcome back.");
  expect(get("password").autocomplete).toBe("current-password");
});
