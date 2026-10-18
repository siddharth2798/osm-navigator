# Contributing

This is a personal, single-user navigation app — see the README and [Privacy](docs/PRIVACY.md) for the philosophy. That shapes what kind of contribution fits here.

## Reporting a bug

Open a [GitHub issue](https://github.com/siddharth2798/osm-navigator/issues). Useful things to include:

- What you did, what you expected, what actually happened.
- Browser/OS (or Android shell version) and whether it reproduces on the live deployment or only your own self-hosted instance.
- If it's related to the Google Maps link resolver, the on-screen debug log's contents (open the app with `?debug=resolver` appended to the URL, retry, then copy the panel — see [Troubleshooting](docs/TROUBLESHOOTING.md)).
- Console errors, if any (browser DevTools → Console).

## Proposing a change

Small, focused PRs are easiest to review — a bug fix, a docs correction, a self-contained feature. For anything larger, open an issue first to check it fits the project's scope (below).

There's no build step. `npm test` runs a `node:test` unit suite against the pure logic and server-side proxy modules in `lib/*.js` (see [Running the tests](docs/SETUP.md#running-the-tests)) — run it, and add cases for any `lib/*.js` behavior your PR changes. `app.js` (the DOM-heavy UI layer) has no automated coverage — `node --check app.js` (and any other changed `.js` file) only catches syntax errors; manual testing in a real browser is how that part of the codebase gets verified. Please exercise the feature/fix you're changing before opening a PR.

## Out of scope

This project is deliberately **not** trying to become a multi-user product, and PRs in that direction are likely to be declined regardless of implementation quality:

- **No accounts, no multi-user auth, no login system.** This is a single-user app by design — everything personal lives in your own browser, for exactly one person (you).
- **No hosted SaaS / no first-party backend or database** as a requirement. The server-side pieces are thin proxies (the Google Maps link resolver exists purely because a browser can't follow a cross-origin redirect itself), plus one **optional, off-by-default** exception: [secret spot collections](docs/SPOT_COLLECTIONS.md), which store community-added places in a Cloudflare D1 database. They only exist on a deployment that binds a database; without one the app behaves exactly as a single-user, backend-free app. Any *other* feature that needs its own server-side storage or business logic is still a different kind of project.
- **No telemetry, analytics, or tracking of any kind**, even opt-in/anonymized.

Fixes, self-hosting improvements, new map features (search, routing, navigation UX), and documentation are all welcome and in scope.
