// Apply the API-client consolidation only after all five files pass preflight.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useSharedApi } from "./web-api-refactor.mjs";
const web = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const external = ["landing", "login", "reader"];
const inline = ["redeem", "gift-confirmation"];
const writes = [];
for (const name of external) {
  const path = join(web, "assets", "js", "pages", `${name}.js`);
  const pagePath = join(web, `${name === "landing" ? "index" : name}.html`);
  const page = readFileSync(pagePath, "utf8");
  const marker = `<script src="assets/js/pages/${name}.js"></script>`;
  if (page.split(marker).length !== 2 || page.includes('src="assets/js/obi-api.js"')) throw new Error(`Unexpected script markup in ${name}.`);
  writes.push([path, useSharedApi(readFileSync(path, "utf8"))]);
  writes.push([pagePath, page.replace(marker, `<script src="assets/js/obi-api.js"></script>${marker}`)]);
}
for (const name of inline) {
  const path = join(web, `${name}.html`);
  const page = readFileSync(path, "utf8");
  if (page.split("<script>").length !== 2 || page.includes('src="assets/js/obi-api.js"')) throw new Error(`Unexpected script markup in ${name}.`);
  writes.push([path, useSharedApi(page).replace("<script>", '<script src="assets/js/obi-api.js"></script><script>')]);
}
for (const [path, content] of writes) writeFileSync(path, content, "utf8");
console.log("Five pages now use the same browser API client.");
