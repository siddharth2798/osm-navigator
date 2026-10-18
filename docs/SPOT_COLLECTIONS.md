# Secret spot collections

A **collection** is a hidden, community-edited map layer — "Secret eats" is the first, but a collection is just a
row in a database plus a keyword, so viewpoints, EV-friendly cafés, hidden trails, etc. need no code.

Typing a collection's **keyword** into the search bar (optionally `<keyword> near <place>`) opens it: spots appear as
pins and clusters, tapping one shows a popup with its name, type, the contributor's note and an *Open in Google
Maps* link, and anyone who knows the keyword can add or report spots.

This is the one feature that needs a server-side database, so it is **opt-in**: without the setup below the app is
unchanged and nothing about it is visible. See [PRIVACY.md](PRIVACY.md) for exactly what is stored.

## How the keyword works (and what it does not protect)

- The keyword is a **Worker secret** named `SPOT_KEYWORD_<ID>` (id in capitals — `SPOT_KEYWORD_FOOD` for the
  collection `food`). It is never written to the database. Change it any time with
  `wrangler secret put SPOT_KEYWORD_FOOD`; devices that knew the old keyword lose access immediately.
- Every read and write sends the keyword in a request header, and the Worker checks it. Without it the spots cannot
  be fetched.
- So that ordinary searches never leave the device, the app downloads a small public **manifest** of salted hashes
  and checks what you type against it locally. Only a match contacts the server.
- **This is a shared password, not strong security.** Anyone who knows the keyword can see and add spots, and the
  public hash can be brute-forced offline, so use a phrase that is not a dictionary word (several words is best).
  It is meant for a friends-and-family map, not for anything that must stay confidential.
- Browsers that unlocked a collection remember its keyword in `localStorage` (so it can be reopened from **Saved →
  Secret maps**). "Forget" removes it.

## Try it locally (no Cloudflare account needed)

```sh
npm run dev:spots            # http://localhost:8080
```

This serves the app and runs the real API over an in-memory database seeded with a demo **Secret eats** collection
around Fort Kochi (Node 22.13+; everything resets when you stop it). The demo keyword is **`secret eats`** — change it
with `DEMO_KEYWORD="my phrase" npm run dev:spots`, or the port with `PORT=9000`.

Then, in the search box:

1. Type `secret eats` → an **Open Secret eats** row appears (or press **Enter** to open it straight away).
2. Or type `secret eats near Fort Kochi` — the map opens there. (Place lookups use the public Nominatim service, which
   rate-limits, so if it does not fly there just zoom the map to Kochi yourself.)
3. Tap a pin for the popup (name, type, note, **Open in Google Maps**), use the filter chips, the list button, and the
   orange **+** button to add a spot.
4. Try the owner importer against it: `ADMIN_TOKEN=dev node scripts/import-spots.mjs places.json --collection food --api http://localhost:8080`.

Typing anything else is just a normal search; the keyword is only recognised in the main search box.

## Setting it up (Cloudflare Worker deployment)

Worker deployments only (not Pages Functions, not GitHub Pages).

1. Create the database and note its id:
   `wrangler d1 create osm-navigator-spots`
2. In `wrangler.jsonc`, add the `d1_databases` block with the id from step 1. **The binding must be named exactly
   `DB`.** `wrangler d1 create` may offer to add the binding for you under another name (e.g. `osm_navigator_spots`);
   if so, rename it, or every `/api/spots` route answers `501 Spot collections are not enabled`. Also leave out
   `"remote": true`, which would make `wrangler dev` use your production database.
3. Create the tables: `wrangler d1 migrations apply DB --remote`
4. Create a collection: copy `seeds/food.example.sql` to `seeds/food.local.sql` (gitignored),
   edit the title / icon / colour / categories, then
   `wrangler d1 execute DB --remote --file=seeds/food.local.sql`
   (Seeds live outside `migrations/` because `migrations apply` runs every `.sql` file in that folder.)
5. Set the keyword: `wrangler secret put SPOT_KEYWORD_FOOD`
6. Set the owner token used for moderation and bulk import: `wrangler secret put ADMIN_TOKEN`
7. Optional: `wrangler secret put SPOT_SALT` (any random string) to vary the published hash salt per deployment, and
   `wrangler secret put IP_SALT` to vary the abuse-limiting hash.
8. `wrangler deploy`

For `wrangler dev`, put `SPOT_KEYWORD_FOOD=...` and `ADMIN_TOKEN=...` in `.dev.vars` (gitignored) and run
`wrangler d1 migrations apply DB --local`.

Set `SPOTS_ENABLED: false` in `config.js` to switch the client side off entirely.

## Adding a new collection

Only SQL and a secret — no code:

```sql
INSERT INTO collections (id, title, icon, color, categories_json, created_at)
VALUES ('views', 'Hidden views', '🌄', '#2b8a3e',
  '[{"id":"sunrise","label":"Sunrise","emoji":"🌅"},{"id":"trail","label":"Trail","emoji":"🥾"}]',
  CAST(strftime('%s','now') AS INTEGER) * 1000);
```

then `wrangler secret put SPOT_KEYWORD_VIEWS`. Categories drive the filter chips and the type picker in the add form.
A collection with no keyword secret (or one shorter than 3 characters) is disabled and invisible.

## Owner tools

All of these need `Authorization: Bearer <ADMIN_TOKEN>`; there is deliberately no admin UI.

**Bulk import** — from a JSON file or a list of Google Maps links:

```sh
# places.json: [{ "name": "Dhe Puttu", "category": "restaurant", "note": "Go before 1pm", "lat": 9.9669, "lon": 76.2431 },
#               { "maps": "https://www.google.com/maps/place/Pai+Brothers/@9.97,76.28,17z/…", "category": "restaurant" }]
# links.txt:    one Google Maps link per line, optionally  `link | category | note`   (# starts a comment)

node scripts/import-spots.mjs places.json --collection food --dry-run            # preview, nothing sent
ADMIN_TOKEN=… node scripts/import-spots.mjs places.json --collection food --api https://<your-worker>
ADMIN_TOKEN=… node scripts/import-spots.mjs links.txt --collection food --api https://<your-worker> --category street-food
```

Each entry needs coordinates (`lat`/`lon`) or a Google Maps link; with a link the name is read from it unless you
give one. Short `maps.app.goo.gl` links are followed to find the coordinates; if that fails (Google sometimes shows
an interstitial), open the link in a browser and paste the full address-bar URL, or add `lat`/`lon`. Duplicates (same
name within ~50 m) and invalid entries are skipped and listed — the rest are still added. Up to 200 per request; the
script batches larger files for you. It talks to `POST /api/spots/import?c=<collection>`.

**Moderation** — `PATCH /api/spots/<id>` with `{"status":"hidden"|"active","name":…,"note":…}` and
`DELETE /api/spots/<id>`. Three reports from different devices hide a spot automatically; restoring it clears its
reports. To find a spot id: `wrangler d1 execute DB --remote --command "select id,name,report_count,status from spots order by report_count desc limit 20"`.

## Limits (in `lib/spots-api.js`)

20 additions per device per day, 5 reports per hour, names ≤ 80 characters, notes ≤ 500, one report per device per
spot, ≤ 500 spots per map request, map requests limited to a ~4° box (zoomed out far enough, the app asks you to zoom
in). Spot text is stored as plain data and always rendered as text, never as HTML.

## Android Auto

The car's *Where to?* search also recognises the keyword and lists the nearest spots (read-only — adding and
reporting happen on the phone). Details in [ANDROID.md](ANDROID.md).
