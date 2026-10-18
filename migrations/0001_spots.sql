-- Secret spot collections (see docs/SPOT_COLLECTIONS.md). Apply with:
--   wrangler d1 migrations apply DB --local     (dev)
--   wrangler d1 migrations apply DB --remote    (production)

CREATE TABLE IF NOT EXISTS collections (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  icon            TEXT NOT NULL DEFAULT '📍',
  color           TEXT NOT NULL DEFAULT '#e8590c',
  -- The collection's keyword is deliberately NOT stored here: it is the Worker secret SPOT_KEYWORD_<ID>
  -- (e.g. SPOT_KEYWORD_FOOD), so it can be changed with `wrangler secret put` and never lands in a database dump.
  -- JSON array of { "id": "street-food", "label": "Street food", "emoji": "🌮" }
  categories_json TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spots (
  id            TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  name          TEXT NOT NULL,
  lat           REAL NOT NULL,
  lon           REAL NOT NULL,
  category      TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  url           TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'hidden'
  report_count  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  author_hash   TEXT NOT NULL                      -- daily-salted hash of the IP, for rate limiting only
);

CREATE INDEX IF NOT EXISTS idx_spots_area ON spots (collection_id, status, lat, lon);
CREATE INDEX IF NOT EXISTS idx_spots_author ON spots (author_hash, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id            TEXT PRIMARY KEY,
  spot_id       TEXT NOT NULL REFERENCES spots(id),
  reporter_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (spot_id, reporter_hash)
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports (reporter_hash, created_at);
