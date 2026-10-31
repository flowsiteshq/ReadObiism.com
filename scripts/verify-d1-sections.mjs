/**
 * Verifies that D1 has the complete manuscript before launch testing.
 *
 * Usage:
 *   node scripts/verify-d1-sections.mjs           # remote (production D1)
 *   node scripts/verify-d1-sections.mjs --local   # local wrangler D1
 *
 * Exits non-zero when sections are missing or any section has no paragraphs.
 * It never prints manuscript text, only section ids and byte sizes.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const database = "obi-ism-payments";
const local = process.argv.includes("--local");
const targetFlag = local ? "--local" : "--remote";

function expectedSectionIds() {
  const source = readFileSync(join(projectRoot, "lib", "book-data.ts"), "utf8");
  const ids = [...source.matchAll(/"id":\s*"([^"]+)"/g)].map((match) => match[1]);
  return [...new Set(ids)];
}

function runWrangler(sql) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  // A file avoids Windows shell argument splitting on spaces and semicolons.
  const queryPath = join(projectRoot, ".wrangler", "verify-d1-sections.sql");
  mkdirSync(dirname(queryPath), { recursive: true });
  writeFileSync(queryPath, sql, "utf8");
  const result = spawnSync(
    command,
    ["--yes", "wrangler", "d1", "execute", database, targetFlag, "--json", "--file", queryPath],
    { cwd: projectRoot, encoding: "utf8", shell: process.platform === "win32", timeout: 180_000 },
  );

  if (result.error) throw new Error(`Could not start wrangler: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "wrangler exited without output").trim());
  }

  const output = `${result.stdout || ""}`.trim();
  const jsonStart = output.search(/[[{]/);
  if (jsonStart < 0) throw new Error(`Unexpected wrangler output: ${output.slice(0, 300)}`);

  let parsed;
  try {
    parsed = JSON.parse(output.slice(jsonStart));
  } catch {
    throw new Error(`Could not parse wrangler JSON output: ${output.slice(0, 300)}`);
  }

  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const rows = first?.results ?? first?.result?.[0]?.results ?? [];
  if (!Array.isArray(rows)) throw new Error("Wrangler returned no result rows.");
  return rows;
}

const expectedIds = expectedSectionIds();
if (!expectedIds.length) {
  console.error("Could not read section ids from lib/book-data.ts.");
  process.exit(1);
}

let rows;
try {
  rows = runWrangler("SELECT section_id, length(paragraphs_json) AS bytes FROM book_sections ORDER BY position ASC;");
} catch (error) {
  console.error(`D1 verification failed (${local ? "local" : "remote"}): ${error.message}`);
  console.error(`\nCheck that you are authenticated and that ${database} exists.`);
  process.exit(1);
}

const byId = new Map(rows.map((row) => [row.section_id, Number(row.bytes ?? 0)]));
const missing = expectedIds.filter((id) => !byId.has(id));
const empty = [...byId.entries()].filter(([, bytes]) => bytes <= 2).map(([id]) => id);
const unexpected = [...byId.keys()].filter((id) => !expectedIds.includes(id));

console.log(`D1 book_sections (${local ? "local" : "remote"}): ${byId.size} rows, ${expectedIds.length} expected.`);
for (const id of expectedIds) {
  const bytes = byId.get(id);
  console.log(`  ${bytes === undefined ? "MISSING" : empty.includes(id) ? "EMPTY  " : "ok     "} ${id}${bytes === undefined ? "" : ` (${bytes.toLocaleString()} bytes)`}`);
}

if (missing.length || empty.length || unexpected.length) {
  if (missing.length) console.error(`\nMissing sections: ${missing.join(", ")}`);
  if (empty.length) console.error(`\nSections without paragraphs: ${empty.join(", ")}`);
  if (unexpected.length) console.error(`\nUnexpected rows: ${unexpected.join(", ")}`);
  console.error("\nSeed the manuscript before launch testing:");
  console.error("  pnpm seed:book");
  console.error(`  npx wrangler d1 execute ${database} ${targetFlag} --file .wrangler/book-sections.seed.sql`);
  process.exit(1);
}

console.log("\nAll manuscript sections are present and populated.");
