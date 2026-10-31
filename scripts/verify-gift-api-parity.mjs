// Check that the two gift pages changed only to use the shared API client,
// using the frozen source snapshot in tests/fixtures/web-source.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useSharedApi } from "./web-api-refactor.mjs";
const project = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const page of ["redeem", "gift-confirmation"]) {
  const source = readFileSync(join(project, "tests", "fixtures", "web-source", `${page}.html`), "utf8");
  const actual = readFileSync(join(project, "web", `${page}.html`), "utf8");
  const expected = useSharedApi(source).replace("<script>", '<script src="assets/js/obi-api.js"></script><script>');
  if (actual !== expected) throw new Error(`${page} differs beyond the shared API-client refactor.`);
  console.log(`${page}: source matches except for the shared API client.`);
}
