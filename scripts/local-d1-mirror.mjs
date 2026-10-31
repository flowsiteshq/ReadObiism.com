// One-way LOCAL D1 -> dedicated local MariaDB mirror for phpMyAdmin inspection.
// This is never used by the app as a source of truth and never contacts Cloudflare.
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const d1Directory = join(project, ".wrangler", "rebuild-state", "v3", "d1", "miniflare-D1DatabaseObject");
const mirrorName = "obi_d1_local_mirror";
const markerName = "__obi_mirror_status";
const mode = process.argv.includes("--schema-only") ? "schema" : process.argv.includes("--with-data") ? "data" : "";
const once = process.argv.includes("--once");
if (!mode) throw new Error("Choose --schema-only or --with-data explicitly.");
const allowedArgs = new Set(["--schema-only", "--with-data", "--once"]);
if (process.argv.slice(2).some((arg) => !allowedArgs.has(arg)) || (process.argv.includes("--schema-only") && process.argv.includes("--with-data"))) throw new Error("Usage: node scripts/local-d1-mirror.mjs (--schema-only | --with-data) [--once]");

const sqliteFiles = readdirSync(d1Directory).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
if (sqliteFiles.length !== 1) throw new Error(`Expected exactly one local rebuild D1 file in ${d1Directory}; found ${sqliteFiles.length}. No database changed.`);
const sourcePath = join(d1Directory, sqliteFiles[0]);
const ident = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsupported database identifier: ${name}`);
  return `\`${name}\``;
};
const connection = await mysql.createConnection({
  host: "127.0.0.1", port: 3306,
  user: process.env.OBI_MIRROR_MYSQL_USER || "root",
  password: process.env.OBI_MIRROR_MYSQL_PASSWORD || "",
  multipleStatements: false,
});
let refreshing = false;

async function initialize() {
  const [databases] = await connection.query("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?", [mirrorName]);
  if (databases.length) {
    const [tables] = await connection.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=?", [mirrorName]);
    if (!tables.some((row) => row.TABLE_NAME === markerName)) throw new Error(`${mirrorName} already exists and is not marked as an OBI local mirror. Nothing was modified.`);
    const [markers] = await connection.query(`SELECT source_kind, sync_mode FROM ${ident(mirrorName)}.${ident(markerName)} WHERE id=1`);
    if (markers.length !== 1 || markers[0].source_kind !== "local-rebuild-d1") throw new Error("Mirror ownership marker is invalid. Nothing was modified.");
    if (markers[0].sync_mode !== mode) throw new Error(`Existing mirror uses ${markers[0].sync_mode} mode. Changing modes requires manual review; nothing was modified.`);
  } else {
    await connection.query(`CREATE DATABASE ${ident(mirrorName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    await connection.query(`CREATE TABLE ${ident(mirrorName)}.${ident(markerName)} (id INTEGER PRIMARY KEY, source_kind VARCHAR(64) NOT NULL, sync_mode VARCHAR(20) NOT NULL, last_sync_utc VARCHAR(32), table_count INTEGER NOT NULL DEFAULT 0, note TEXT)`);
    await connection.execute(`INSERT INTO ${ident(mirrorName)}.${ident(markerName)} (id,source_kind,sync_mode,note) VALUES (1,'local-rebuild-d1',?,'One-way local test mirror; never the live Cloudflare database.')`, [mode]);
  }
}

function readSnapshot() {
  const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    sqlite.exec("BEGIN");
    const tables = sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all();
    const snapshot = tables.map(({ name }) => {
      ident(name);
      const columns = sqlite.prepare(`PRAGMA table_info(${ident(name)})`).all();
      const indexes = sqlite.prepare(`PRAGMA index_list(${ident(name)})`).all();
      const indexed = new Set(columns.filter((col) => col.pk).map((col) => col.name));
      for (const index of indexes) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(index.name)) continue;
        for (const col of sqlite.prepare(`PRAGMA index_info(${ident(index.name)})`).all()) if (col.name) indexed.add(col.name);
      }
      const data = mode === "data" ? sqlite.prepare(`SELECT * FROM ${ident(name)}`).all().map((row) => ({ ...row })) : [];
      return { name, columns, indexed, rows: data };
    });
    sqlite.exec("COMMIT");
    return snapshot;
  } finally { sqlite.close(); }
}

function columnType(column, indexed) {
  const type = String(column.type || "").toUpperCase();
  if (type.includes("INT")) return "BIGINT";
  if (/REAL|FLOA|DOUB/.test(type)) return "DOUBLE";
  if (/BLOB/.test(type)) return "LONGBLOB";
  return indexed.has(column.name) ? "VARCHAR(255)" : "LONGTEXT";
}

async function sync() {
  if (refreshing) return;
  refreshing = true;
  try {
    const snapshot = readSnapshot();
    if (!snapshot.length) throw new Error("The local D1 database has no user tables; the mirror was not refreshed.");
    const [mirrorTables] = await connection.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=?", [mirrorName]);
    const allowedTables = new Set([markerName, ...snapshot.map((table) => table.name)]);
    if (mirrorTables.some((row) => !allowedTables.has(row.TABLE_NAME))) throw new Error("Mirror contains tables absent from local D1. Manual review is required; no table will be dropped.");
    for (const table of snapshot) {
      const columns = table.columns.map((column) => `${ident(column.name)} ${columnType(column, table.indexed)}${column.notnull ? " NOT NULL" : ""}`);
      const primary = table.columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => ident(column.name));
      if (primary.length) columns.push(`PRIMARY KEY (${primary.join(", ")})`);
      await connection.query(`CREATE TABLE IF NOT EXISTS ${ident(mirrorName)}.${ident(table.name)} (${columns.join(", ")}) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
      const [existing] = await connection.query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION", [mirrorName, table.name]);
      const present = new Map(existing.map((column) => [column.COLUMN_NAME, column.DATA_TYPE.toLowerCase()]));
      for (const col of table.columns) {
        const desired = columnType(col, table.indexed).toLowerCase().replace(/\(.*/, "");
        if (!present.has(col.name)) {
          // New columns are nullable in the mirror so existing rows are preserved.
          await connection.query(`ALTER TABLE ${ident(mirrorName)}.${ident(table.name)} ADD COLUMN ${ident(col.name)} ${columnType(col, table.indexed)}`);
        } else if (present.get(col.name) !== desired) {
          throw new Error(`${table.name}.${col.name} has an incompatible mirror type. Manual review is required; no column will be dropped.`);
        }
      }
      const sourceNames = new Set(table.columns.map((col) => col.name));
      if (existing.some((col) => !sourceNames.has(col.COLUMN_NAME))) throw new Error(`${table.name} contains columns absent from local D1. Manual review is required; no column will be dropped.`);
    }
    if (mode === "data") {
      await connection.beginTransaction();
      try {
        for (const table of snapshot) {
          await connection.query(`DELETE FROM ${ident(mirrorName)}.${ident(table.name)}`);
          if (!table.rows.length) continue;
          const names = table.columns.map((column) => column.name);
          const query = `INSERT INTO ${ident(mirrorName)}.${ident(table.name)} (${names.map(ident).join(",")}) VALUES (${names.map(() => "?").join(",")})`;
          for (const row of table.rows) await connection.execute(query, names.map((name) => row[name] instanceof Uint8Array ? Buffer.from(row[name]) : row[name] ?? null));
        }
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
    }
    await connection.execute(`UPDATE ${ident(mirrorName)}.${ident(markerName)} SET sync_mode=?,last_sync_utc=?,table_count=? WHERE id=1`, [mode, new Date().toISOString(), snapshot.length]);
    console.log(`Local D1 mirror refreshed: ${snapshot.length} tables, ${mode === "data" ? "local rows included" : "structure only"}, ${new Date().toLocaleTimeString()}.`);
  } finally { refreshing = false; }
}

try {
  // Avoid concurrent sync processes interleaving updates to the same mirror.
  const [locks] = await connection.query("SELECT GET_LOCK('obi_d1_local_mirror_sync', 0) AS acquired");
  if (Number(locks[0]?.acquired) !== 1) throw new Error("Another local D1 mirror is already running.");
  readSnapshot(); // Validate the source database before creating the mirror.
  await initialize();
  await sync();
  if (once) await connection.end();
  else {
    console.log(`Open phpMyAdmin → ${mirrorName}. Refresh the navigation panel to see updates. Ctrl+C stops syncing.`);
    const timer = setInterval(() => sync().catch((error) => console.error(`Mirror refresh failed: ${error.message}`)), 5000);
    const stop = async () => { clearInterval(timer); await connection.end(); process.exit(0); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }
} catch (error) { await connection.end(); throw error; }
