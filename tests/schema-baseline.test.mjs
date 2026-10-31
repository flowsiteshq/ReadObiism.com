import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const worker = readFileSync(new URL("../dashboard-worker.js", import.meta.url), "utf8");
const baseline = readFileSync(new URL("../database/migrations/0001_local_schema_baseline.sql", import.meta.url), "utf8");

function schemaFor(sql) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(sql);
    return db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all().map((row) => ({ ...row }));
  } finally { db.close(); }
}

test("review baseline creates the same empty schema as the current Worker", () => {
  const matches = [...worker.matchAll(/const schema = `([\s\S]*?)`;/g)];
  expect(matches).toHaveLength(1);
  expect(schemaFor(baseline)).toEqual(schemaFor(matches[0][1]));
});
