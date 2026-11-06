import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { reindexSearchIndex, searchContent } from '../dashboard-worker.js';

function database() {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    exec: async (sql) => raw.exec(sql),
    prepare(sql) {
      const api = {
        sql,
        args: [],
        bind(...args) { api.args = args; return api; },
        first: async () => raw.prepare(sql).get(...api.args) || null,
        all: async () => ({ results: raw.prepare(sql).all(...api.args) }),
        run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...api.args).changes) } }),
      };
      return api;
    },
    batch: async (statements) => {
      raw.exec('BEGIN');
      try {
        const result = statements.map((statement) => ({
          meta: { changes: Number(raw.prepare(statement.sql).run(...statement.args).changes) },
        }));
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

test('reindexSearchIndex populates the search index from book_sections', async () => {
  const db = database();
  const env = { OBI_DB: db };
  await db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(section_id, paragraph_index UNINDEXED, content, tokenize = 'unicode61')`);
  await db.exec(`CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL)`);
  await db.exec(`INSERT INTO book_sections (position, section_id, label, title, kind, paragraphs_json) VALUES (1, 'sec1', '1', 'Introduction', 'chapter', '["The love of neighbor is the foundation of justice.", "We must build a society rooted in character.", "This edition explores the principles of a just society."]')`);
  await db.exec(`INSERT INTO book_sections (position, section_id, label, title, kind, paragraphs_json) VALUES (2, 'sec2', '2', 'Principles', 'chapter', '["Justice requires courage and integrity.", "Love your neighbor as yourself."]')`);

  const result = await reindexSearchIndex(env);
  assert.equal(result.inserted, 5);

  const count = await db.prepare('SELECT COUNT(*) AS n FROM search_index').first();
  assert.equal(Number(count.n), 5);
});

test('searchContent returns matches with highlighted snippets', async () => {
  const db = database();
  const env = { OBI_DB: db };
  await db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(section_id, paragraph_index UNINDEXED, content, tokenize = 'unicode61')`);
  await db.exec(`CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL)`);
  await db.exec(`INSERT INTO book_sections (position, section_id, label, title, kind, paragraphs_json) VALUES (1, 'sec1', '1', 'Introduction', 'chapter', '["The love of neighbor is the foundation of justice.", "We must build a society rooted in character."]')`);
  await db.exec(`INSERT INTO book_sections (position, section_id, label, title, kind, paragraphs_json) VALUES (2, 'sec2', '2', 'Principles', 'chapter', '["Justice requires courage and integrity."]')`);
  await reindexSearchIndex(env);

  const result = await searchContent(env, 'love', null);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].section_id, 'sec1');
  assert.equal(result.matches[0].section_title, 'Introduction');
  assert.match(result.matches[0].snippet, /love/);
});

test('searchContent returns empty matches for no results', async () => {
  const db = database();
  const env = { OBI_DB: db };
  await db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(section_id, paragraph_index UNINDEXED, content, tokenize = 'unicode61')`);
  await db.exec(`CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL)`);
  await db.exec(`INSERT INTO book_sections (position, section_id, label, title, kind, paragraphs_json) VALUES (1, 'sec1', '1', 'Introduction', 'chapter', '["The love of neighbor is the foundation of justice."]')`);
  await reindexSearchIndex(env);

  const result = await searchContent(env, 'nonexistent', null);
  assert.equal(result.matches.length, 0);
});

test('searchContent returns empty matches for empty query', async () => {
  const db = database();
  const env = { OBI_DB: db };
  await db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(section_id, paragraph_index UNINDEXED, content, tokenize = 'unicode61')`);

  const result = await searchContent(env, '', null);
  assert.equal(result.matches.length, 0);
});

test('reindexSearchIndex clears old content before reindexing', async () => {
  const db = database();
  const env = { OBI_DB: db };
  await db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(section_id, paragraph_index UNINDEXED, content, tokenize = 'unicode61')`);
  await db.exec(`CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL)`);
  await db.exec(`INSERT INTO book_sections (position, section_id, label, title, kind, paragraphs_json) VALUES (1, 'sec1', '1', 'Old', 'chapter', '["old content"]')`);
  await reindexSearchIndex(env);

  await db.exec(`DELETE FROM book_sections WHERE section_id = 'sec1'`);
  await db.exec(`INSERT INTO book_sections (position, section_id, label, title, kind, paragraphs_json) VALUES (1, 'sec1', '1', 'New', 'chapter', '["new content here"]')`);
  await reindexSearchIndex(env);

  const result = await searchContent(env, 'new', null);
  assert.equal(result.matches.length, 1);
  assert.match(result.matches[0].snippet, /new/);

  const oldResult = await searchContent(env, 'old', null);
  assert.equal(oldResult.matches.length, 0);
});
