# Privacy

- **No accounts, no sync, no analytics, no telemetry, no tracking scripts, no server-side database.** There's no infrastructure of mine for that data to even go to.
- **Everything personal to you** — favorites, recent trips, Home/Work, offline map tiles, the in-progress-trip resume — **lives only in your own browser**, via IndexedDB and the Cache API. Clearing the site's data deletes all of it, permanently.
- **What leaves your device, and to whom** (only when the feature is used): search text/coordinates → **Nominatim**; route coordinates → **Valhalla** (and **OpenTripPlanner**, if configured); map tile coordinates → your tile host; GPS coordinates → **Open-Meteo** (weather badge) and **Mapillary** (if configured) — both opt-out via `config.js`; a pasted Google Maps link → this app's own tiny Cloudflare Worker, which forwards just that URL to Google.
- The on-screen debug log (see [Troubleshooting](TROUBLESHOOTING.md)) is local and ephemeral — it never transmits anything, and is off by default.
- None of this is enforced against the *services themselves* — a public Nominatim/Valhalla/tile instance run by someone else can log requests like any other web request. [Self-host your own](SETUP.md) if that matters to you.
