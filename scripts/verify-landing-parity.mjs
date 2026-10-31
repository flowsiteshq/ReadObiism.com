// Verify that the initial extraction changed only the placement of CSS and JS.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useSharedApi } from "./web-api-refactor.mjs";
const project = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(project, "..", "readobiism-site", "index.html"), "utf8");
const copied = readFileSync(join(project, "web", "index.html"), "utf8");
const css = readFileSync(join(project, "web", "assets", "css", "pages", "landing.css"), "utf8");
const js = readFileSync(join(project, "web", "assets", "js", "pages", "landing.js"), "utf8");
const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
if (!styleMatch || !scriptMatch || styleMatch[1] !== css || useSharedApi(scriptMatch[1]) !== js) throw new Error("Extracted CSS or JS differs beyond the shared API-client refactor.");
const expected = source.replace(styleMatch[0], '<link rel="stylesheet" href="assets/css/pages/landing.css">')
  .replace(scriptMatch[0], '<script src="assets/js/obi-api.js"></script><script src="assets/js/pages/landing.js"></script>');
if (copied !== expected) throw new Error("Landing HTML differs beyond the reviewed CSS and JS extraction.");
console.log("Landing matches the current source apart from extraction and the shared API client.");
