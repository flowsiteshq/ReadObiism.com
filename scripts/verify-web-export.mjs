import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const textExtensions = new Set([".js", ".css", ".html", ".json", ".txt", ".xml"]);
const manuscriptSentinels = [
  "The most dangerous person in any room is the one everyone forgot was watching.",
  "THE HIDDEN ARCHITECTURE OF A REMARKABLE LIFE",
  "Trust is a currency. It compounds or it deflates. There is no third option.",
  "What you do in the unobserved moment is who you are. Everything else is marketing.",
];
const failures = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    const name = relative(dist, path);
    if (path.endsWith(".map")) failures.push(`Source map emitted: ${name}`);
    if (!textExtensions.has(extname(path))) continue;
    const contents = readFileSync(path, "utf8");
    if (contents.includes("sourceMappingURL=")) failures.push(`Source-map reference emitted: ${name}`);
    for (const sentinel of manuscriptSentinels) {
      if (contents.includes(sentinel)) failures.push(`Manuscript text emitted in ${name}: ${sentinel.slice(0, 48)}…`);
    }
  }
}

for (const required of ["index.html", "manifest.json", "sw.js", "offline.html"]) {
  try {
    statSync(join(dist, required));
  } catch {
    failures.push(`Missing PWA file: dist/${required}`);
  }
}

walk(dist);
if (failures.length) {
  console.error(`Web export verification failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Web export verified: no source maps or sampled manuscript paragraphs; PWA files present.");
