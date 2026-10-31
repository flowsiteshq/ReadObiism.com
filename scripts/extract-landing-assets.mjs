// One-time, conservative extraction of the copied landing page's inline CSS
// and JavaScript. Refuses to overwrite files or rewrite ambiguous markup.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const page = join(root, "index.html");
const cssPath = join(root, "assets", "css", "pages", "landing.css");
const jsPath = join(root, "assets", "js", "pages", "landing.js");
if (existsSync(cssPath) || existsSync(jsPath)) throw new Error("Extracted files already exist; nothing was changed.");
const html = readFileSync(page, "utf8");
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (styles.length !== 1 || scripts.length !== 1) throw new Error("Expected exactly one inline style and script; nothing was changed.");
if (/url\s*\(/i.test(styles[0][1])) throw new Error("CSS contains URLs requiring review before extraction; nothing was changed.");
const updated = html.replace(styles[0][0], '<link rel="stylesheet" href="assets/css/pages/landing.css">')
  .replace(scripts[0][0], '<script src="assets/js/pages/landing.js"></script>');
mkdirSync(dirname(cssPath), { recursive: true });
mkdirSync(dirname(jsPath), { recursive: true });
writeFileSync(cssPath, styles[0][1], { encoding: "utf8", flag: "wx" });
writeFileSync(jsPath, scripts[0][1], { encoding: "utf8", flag: "wx" });
writeFileSync(page, updated, "utf8");
console.log("Extracted landing CSS and JS without changing their contents or HTML order.");
