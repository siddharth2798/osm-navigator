# Navigator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-siddharth2798%2Fosm--navigator-181717?logo=github)](https://github.com/siddharth2798/osm-navigator)

A personal, self-hosted turn-by-turn navigation web app for driving and walking, built on OpenStreetMap data. Single-user, no accounts, no sync, no server of your own beyond the geocoding/routing services you point it at.

Map rendering is [MapLibre GL JS](https://maplibre.org/) with tiles from [OpenFreeMap](https://openfreemap.org/). Geocoding is [Nominatim](https://nominatim.org/). Routing is [Valhalla](https://valhalla.github.io/valhalla/). Everything else — favorites, recent trips, offline map tiles, the in-progress-trip resume — lives entirely in the browser (IndexedDB / Cache API).

The app itself has a **Help & documentation** screen (the "?" button, bottom-left of the map) covering all of this from a user's perspective.

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/screenshots/search.jpg" alt="Search with category chips"></td>
<td width="50%"><img src="docs/screenshots/directions.jpg" alt="Directions with route alternatives"></td>
</tr>
<tr>
<td align="center">Search &amp; one-tap category chips</td>
<td align="center">Directions with route alternatives</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/place-card.jpg" alt="Place card with weather"></td>
<td width="50%"><img src="docs/screenshots/elevation.jpg" alt="Walk-mode elevation profile"></td>
</tr>
<tr>
<td align="center">Place details &amp; weather at a glance</td>
<td align="center">Walk-mode elevation profile</td>
</tr>
</table>

## Features

- **Search** — typo-tolerant fallback, one-tap category chips (petrol, EV charging, pharmacy, ATM, hospital, food, parking, hotels), "X near me" resolves to your live GPS position.
- **EV charging station details** via Open Charge Map — connector type, power, operator, cost, and an honestly-labeled operational status. Falls back to a plain OSM pin without a configured Open Charge Map key.
- **Paste a Google Maps link** — a full link or `maps.app.goo.gl` short link resolves straight to that place, including places with no street address (Plus Codes decode automatically). Also registers as an Android Share target.
- **Directions** — multi-stop routing (up to 8, drag to reorder), a plain-text "X to Y" shortcut, Drive/Walk/Transit modes, avoid-tolls/avoid-highways. Route cards lead with distance, not Valhalla's time estimate — that estimate has no live traffic behind it.
- **Long-press to pin a place** (4-second press) — fills the search box, or sets it as the destination directly if you're already mid-trip.
- **Your location, always visible** — a live "you are here" marker with a heading wedge, shown automatically as soon as GPS resolves, toggleable from the locate button.
- **Satellite view**, **Home & Work shortcuts**, **elevation profile** for walking routes.
- **Turn-by-turn navigation** — live position arrow, traveled-route dulling, screen stays awake, automatic arrival detection, survives a mid-drive reload, reroutes onto whatever road you actually took. Auto-enters **Picture-in-Picture** on the [Android shell](docs/ANDROID.md) when minimized mid-drive.
- **Voice guidance** — early and near turn prompts scaled to your actual speed, natural phrasing, an on/off toggle, a distinct alert tone on deviation, combined prompts for closely-spaced turns.
- **Weather at a glance**, **search along the route**, **favorites & recent trips**, **offline map tiles**, **shareable route links** (no backend involved), **street-level imagery** via Mapillary when configured.
- Works with the screen off via the [optional Android shell](docs/ANDROID.md).

## Running it

No build step. Clone or copy the folder, serve it as static files, open it in a browser:

```
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

See [docs/SETUP.md](docs/SETUP.md) for configuring your own services and deploying your own copy.

## Documentation

- [Privacy](docs/PRIVACY.md) — what leaves your device, and to whom.
- [Self-hosting & configuration](docs/SETUP.md) — running it, configuring services, deploying, data freshness.
- [The optional Android shell](docs/ANDROID.md) — building, installing, and running the native Android wrapper.
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Known limitations](docs/LIMITATIONS.md)

## Contributing

Bug reports and pull requests are welcome via [GitHub Issues/PRs](https://github.com/siddharth2798/osm-navigator) — see [CONTRIBUTING.md](CONTRIBUTING.md) for scope and what's explicitly out of scope before opening a PR that adds it.

## License

[MIT](LICENSE) — do whatever you want with it, including your own fork with your own services configured.
