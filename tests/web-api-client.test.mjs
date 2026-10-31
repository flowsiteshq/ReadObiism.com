import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../web/assets/js/obi-api.js", import.meta.url), "utf8");
function client(hostname, port, token) {
  const requests = [];
  const context = {
    location: { hostname, port }, window: {},
    localStorage: { getItem: (key) => key === "obi-ism.session-token" ? token : null },
    fetch: (url, options) => { requests.push({ url, options }); return Promise.resolve({ ok: true }); },
  };
  vm.runInNewContext(source, context);
  return { api: context.window.OBI_API, requests };
}

test("local proxy and production use same-origin endpoints", async () => {
  for (const [host, port] of [["127.0.0.1", "5513"], ["readobiism.com", ""]]) {
    const { api, requests } = client(host, port, null);
    await api.fetch("/api/health");
    assert.equal(requests[0].url, "/api/health");
    assert.equal(requests[0].options.credentials, "include");
  }
});

test("Five Server routes to the local Worker and preserves request options", async () => {
  const { api, requests } = client("127.0.0.1", "5500", "session-value");
  await api.fetch("/api/reader", { method: "POST", body: "body", headers: { "x-obi-device-token": "device-value" } });
  const request = requests[0];
  assert.equal(request.url, "http://127.0.0.1:8787/api/reader");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body, "body");
  assert.equal(request.options.headers.authorization, "Bearer session-value");
  assert.equal(request.options.headers["x-obi-device-token"], "device-value");
});
