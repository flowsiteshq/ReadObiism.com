// One-time extraction for the copied reader and authentication page.
// The original worktree remains the visual/behavioral reference.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const plans = [{ page: "login", styleCount: 1 }, { page: "reader", styleCount: 2 }].map(({ page, styleCount }) => {
  const path = join(root, `${page}.html`);
  const html = readFileSync(path, "utf8");
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (styles.length !== styleCount || scripts.length !== 1) throw new Error(`Unexpected inline markup in ${page}; nothing changed.`);
  if (styles.some((style) => /url\s*\(/i.test(style[1]))) throw new Error(`CSS URLs in ${page} need review; nothing changed.`);
  const outputs = styles.map((style, index) => ({ path: join(root, "assets", "css", "pages", `${page}-${index + 1}.css`), content: style[1] }));
  outputs.push({ path: join(root, "assets", "js", "pages", `${page}.js`), content: scripts[0][1] });
  if (outputs.some((output) => existsSync(output.path))) throw new Error(`Extracted files for ${page} already exist; nothing changed.`);
  let updated = html;
  styles.forEach((style, index) => { updated = updated.replace(style[0], `<link rel="stylesheet" href="assets/css/pages/${page}-${index + 1}.css">`); });
  updated = updated.replace(scripts[0][0], `<script src="assets/js/pages/${page}.js"></script>`);
  return { path, outputs, updated };
});
for (const plan of plans) {
  for (const output of plan.outputs) {
    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, output.content, { encoding: "utf8", flag: "wx" });
  }
  writeFileSync(plan.path, plan.updated, "utf8");
}
console.log("Extracted reader and sign-in CSS and JS; original content and order retained.");
