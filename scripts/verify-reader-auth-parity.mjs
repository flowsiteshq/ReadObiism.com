// Compare extracted styles/scripts and remaining markup with the source pages.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useSharedApi } from "./web-api-refactor.mjs";
const project = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const page of ["login", "reader"]) {
  const source = readFileSync(join(project, "..", "readobiism-site", `${page}.html`), "utf8");
  const copied = readFileSync(join(project, "web", `${page}.html`), "utf8");
  const styles = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!styles.length || scripts.length !== 1) throw new Error(`Unexpected source markup in ${page}.`);
  let expected = source;
  styles.forEach((style, index) => {
    const css = readFileSync(join(project, "web", "assets", "css", "pages", `${page}-${index + 1}.css`), "utf8");
    if (style[1] !== css) throw new Error(`${page} CSS ${index + 1} differs from source.`);
    expected = expected.replace(style[0], `<link rel="stylesheet" href="assets/css/pages/${page}-${index + 1}.css">`);
  });
  const js = readFileSync(join(project, "web", "assets", "js", "pages", `${page}.js`), "utf8");
  if (useSharedApi(scripts[0][1]) !== js) throw new Error(`${page} JavaScript differs beyond the shared API-client refactor.`);
  expected = expected.replace(scripts[0][0], `<script src="assets/js/obi-api.js"></script><script src="assets/js/pages/${page}.js"></script>`);
  if (copied !== expected) throw new Error(`${page} HTML differs beyond extraction paths.`);
  console.log(`${page}: source matches except for extraction and the shared API client.`);
}
