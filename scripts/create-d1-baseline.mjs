// Generate the initial review-only D1 schema from the current Worker.
// This command never connects to a database or overwrites an existing file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const project = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(project, "database", "migrations", "0001_local_schema_baseline.sql");
if (existsSync(output)) throw new Error("Baseline already exists; no file was changed.");
const worker = readFileSync(join(project, "dashboard-worker.js"), "utf8");
const matches = [...worker.matchAll(/const schema = `([\s\S]*?)`;/g)];
if (matches.length !== 1) throw new Error("Worker schema was not found uniquely; no file was changed.");
const header = "-- REVIEW ONLY: extracted from local Worker source, not verified against production.\n-- Do not apply to an existing production database without an approved baseline and backup.\n";
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${header}${matches[0][1].trim()}\n`, { encoding: "utf8", flag: "wx" });
console.log("Generated local schema baseline. No database was contacted.");
