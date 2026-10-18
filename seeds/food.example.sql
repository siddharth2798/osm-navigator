-- Example: create a collection. Copy this file to seeds/food.local.sql (gitignored), edit the values, then run:
--   wrangler d1 execute DB --remote --file=seeds/food.local.sql
-- (This lives in seeds/, not migrations/, on purpose: `wrangler d1 migrations apply` runs every .sql file in
-- migrations/, and a seed must only run once, when you choose.)
--
-- A collection's keyword is NOT in the database. Set it as a Worker secret named SPOT_KEYWORD_<ID in capitals>,
-- e.g. for id 'food':
--   wrangler secret put SPOT_KEYWORD_FOOD        (type the keyword when prompted; at least 3 characters)
-- Change the keyword any time by running that command again — devices that knew the old one lose access.
-- Until the secret exists the collection is disabled (invisible in the app).
-- For `wrangler dev`, put  SPOT_KEYWORD_FOOD=your keyword  in .dev.vars (already gitignored).

INSERT INTO collections (id, title, icon, color, categories_json, created_at)
VALUES (
  'food',
  'Secret eats',
  '🍜',
  '#e8590c',
  '[{"id":"street-food","label":"Street food","emoji":"🌮"},{"id":"restaurant","label":"Restaurant","emoji":"🍽️"},{"id":"cafe","label":"Café","emoji":"☕"},{"id":"bakery","label":"Bakery","emoji":"🥐"},{"id":"dessert","label":"Dessert","emoji":"🍨"}]',
  CAST(strftime('%s','now') AS INTEGER) * 1000
);
