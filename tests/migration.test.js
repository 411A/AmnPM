import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

// tgcloud migrate will emit these three additions for the live database. The
// suite normally builds the new schema from scratch, so this test exercises
// the upgrade path on an old-shaped table instead.
test('the retention migration upgrades an existing links table', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE owners (
    owner_key TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  )`);
  db.prepare("INSERT INTO links (state, created_at) VALUES ('active', 100)").run();
  db.prepare("INSERT INTO owners (owner_key, created_at) VALUES ('old-owner', 100)").run();

  db.exec('ALTER TABLE links ADD COLUMN state_at INTEGER NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE links ADD COLUMN last_activity_at INTEGER NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE links ADD COLUMN reminded_at INTEGER NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE owners ADD COLUMN reconciled_at INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE INDEX idx_links_state_activity ON links (state, last_activity_at)');

  const old = db.prepare('SELECT * FROM links').get();
  assert.equal(old.last_activity_at, 0);
  assert.equal(old.reminded_at, 0);
  assert.equal(old.state_at, 0);
  assert.equal(db.prepare('SELECT reconciled_at FROM owners').get().reconciled_at, 0);

  const backfill = db.prepare('UPDATE links SET last_activity_at = ? WHERE last_activity_at = 0').run(500);
  assert.equal(backfill.changes, 1);
  assert.equal(db.prepare('SELECT last_activity_at FROM links').get().last_activity_at, 500);

  db.prepare(`INSERT INTO links (state, state_at, last_activity_at, reminded_at, created_at)
    VALUES ('active', 600, 600, 0, 600)`).run();
  const fresh = db.prepare('SELECT * FROM links ORDER BY id DESC LIMIT 1').get();
  assert.equal(fresh.state_at, 600);
  assert.equal(fresh.last_activity_at, 600);
  assert.equal(fresh.reminded_at, 0);
});
