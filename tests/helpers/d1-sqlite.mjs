// Minimal Cloudflare D1 stand-in backed by Node's built-in SQLite, so tests exercise the real SQL and the real
// migration file instead of a hand-written mock. Implements only what lib/spots-api.js uses:
// prepare().bind().first()/all()/run() and batch().
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const MIGRATION = new URL('../../migrations/0001_spots.sql', import.meta.url);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }

  async run() {
    this.db.prepare(this.sql).run(...this.params);
    return { success: true };
  }
}

export function createTestD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(MIGRATION, 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        for (const s of statements) await s.run();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return statements.map(() => ({ success: true }));
    },
  };
}
