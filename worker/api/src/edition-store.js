// Edition numbering and archive records. The live manuscript stays in
// book_sections (one physical copy); retiring an edition snapshots the previous
// content into edition_archives before it is replaced.
//
// Migrations are additive only: CREATE TABLE IF NOT EXISTS plus guarded ALTERs,
// matching the existing ensureAccountSchema/ensurePurchaseSchema pattern.

export const editionSchema = `CREATE TABLE IF NOT EXISTS editions (
  edition_no INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  source TEXT,
  published_at TEXT NOT NULL,
  retired_at TEXT,
  is_live INTEGER NOT NULL DEFAULT 0,
  section_count INTEGER NOT NULL DEFAULT 0,
  paragraph_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS edition_archives (
  edition_no INTEGER PRIMARY KEY,
  sections_json TEXT NOT NULL,
  archived_at TEXT NOT NULL
);`;

const ensured = new WeakSet();

async function tableExists(env, table) {
  const row = await env.OBI_DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
  )
    .bind(table)
    .first()
    .catch(() => null);
  return Boolean(row && row.name);
}

async function addColumn(env, table, column, definition) {
  if (!(await tableExists(env, table))) return;
  const info = await env.OBI_DB.prepare(`PRAGMA table_info(${table})`).bind().all();
  const names = new Set((info.results || []).map((row) => row.name));
  if (names.has(column)) return;
  try {
    await env.OBI_DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).bind().run();
  } catch (error) {
    if (!/duplicate column/i.test(String(error && error.message ? error.message : error))) throw error;
  }
}

/**
 * Ensure the edition tables exist and book_sections/purchases carry the
 * edition number. On a database that predates editions, the current content is
 * recorded as Edition 1 and marked live.
 */
export async function ensureEditions(env) {
  if (!env?.OBI_DB || ensured.has(env.OBI_DB)) return;
  await env.OBI_DB.exec(editionSchema);
  await addColumn(env, "book_sections", "edition_no", "INTEGER NOT NULL DEFAULT 1");
  await addColumn(env, "purchases", "edition_no", "INTEGER NOT NULL DEFAULT 1");
  const existing = await env.OBI_DB.prepare("SELECT COUNT(*) AS n FROM editions").bind().first();
  if (Number(existing?.n || 0) === 0) {
    let editionNo = 1;
    let sections = 0;
    let paragraphs = 0;
    if (await tableExists(env, "book_sections")) {
      const highest = await env.OBI_DB.prepare("SELECT MAX(edition_no) AS n FROM book_sections")
        .bind()
        .first()
        .catch(() => null);
      if (Number(highest?.n) > 0) editionNo = Number(highest.n);
      const counts = await env.OBI_DB.prepare(
        `SELECT COUNT(*) AS sections,
          COALESCE(SUM(json_array_length(paragraphs_json)), 0) AS paragraphs
         FROM book_sections`,
      )
        .bind()
        .first()
        .catch(() => null);
      sections = Number(counts?.sections || 0);
      paragraphs = Number(counts?.paragraphs || 0);
    }
    await env.OBI_DB.prepare(
      `INSERT OR IGNORE INTO editions
        (edition_no,label,source,published_at,retired_at,is_live,section_count,paragraph_count)
       VALUES (?,?,?,?,NULL,1,?,?)`,
    )
      .bind(editionNo, `Edition ${editionNo}`, "legacy", new Date().toISOString(), sections, paragraphs)
      .run();
  }
  ensured.add(env.OBI_DB);
}

export async function liveEdition(env) {
  if (!env?.OBI_DB) return null;
  await ensureEditions(env);
  return env.OBI_DB.prepare(
    "SELECT edition_no,label,published_at,section_count,paragraph_count FROM editions WHERE is_live=1 ORDER BY edition_no DESC LIMIT 1",
  )
    .bind()
    .first();
}

export async function editionList(env) {
  if (!env?.OBI_DB) return [];
  await ensureEditions(env);
  const result = await env.OBI_DB.prepare(
    `SELECT edition_no,label,source,published_at,retired_at,is_live,section_count,paragraph_count
     FROM editions ORDER BY edition_no DESC`,
  )
    .bind()
    .all();
  return result.results || [];
}

export async function editionByNumber(env, editionNo) {
  const number = Number(editionNo);
  if (!Number.isInteger(number) || number <= 0) return null;
  await ensureEditions(env);
  return env.OBI_DB.prepare("SELECT edition_no,label,published_at FROM editions WHERE edition_no=?")
    .bind(number)
    .first();
}
