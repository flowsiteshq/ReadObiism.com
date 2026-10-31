import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const serviceWorker = readFileSync(join(root, "public", "sw.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"));
const html = readFileSync(join(root, "app", "+html.tsx"), "utf8");

describe("PWA content boundaries", () => {
  it("returns before handling any /api request", () => {
    const guard = serviceWorker.indexOf('url.pathname.startsWith("/api/")');
    const firstHandler = serviceWorker.indexOf("event.respondWith");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstHandler);
  });

  it("does not persist chapter text in browser storage", () => {
    expect(serviceWorker).not.toContain("localStorage");
    expect(serviceWorker).not.toContain("indexedDB");
  });

  it("ships an offline fallback and installable manifest", () => {
    expect(serviceWorker).toContain('"/offline.html"');
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
  });

  it("hides reading content from print and registers the shell worker", () => {
    expect(html).toContain("@media print");
    expect(html).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(html).toContain('rel="manifest"');
  });
});
