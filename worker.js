// Worker entry point for the "plain Cloudflare Worker + static assets"
// deployment path (see wrangler.jsonc). This app is a static site with no
// build step — the only reason a Worker script exists at all is to add the
// one dynamic route below; every other request falls straight through to
// env.ASSETS, unchanged from pure static-asset serving (assets are matched
// before this fetch handler ever runs, per the default `run_worker_first:
// false`, so nothing here can shadow a real static file).
import { resolveMapsUrl } from './lib/resolve-maps-url.js';
import { openChargePoi } from './lib/opencharge-poi.js';
import { valhallaProxy } from './lib/valhalla-proxy.js';
import { nearbyFlights } from './lib/flights-proxy.js';
import { tomtomTrafficFlow } from './lib/tomtom-traffic-proxy.js';
import { tomtomPlacesSearch } from './lib/tomtom-places-proxy.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/resolve-maps-url') return resolveMapsUrl(url);
    if (url.pathname === '/api/opencharge-poi') return openChargePoi(url, env);
    if (url.pathname === '/api/valhalla-route') return valhallaProxy('route', request, env);
    if (url.pathname === '/api/valhalla-height') return valhallaProxy('height', request, env);
    if (url.pathname === '/api/valhalla-trace_attributes') return valhallaProxy('trace_attributes', request, env);
    // Not used by main's own app.js (the flight-tracking overlay itself is
    // personal/flight-tracking-only, see docs/FLIGHT_TRACKING.md) — this
    // route only needs to live here because Cloudflare's Git-integration
    // deploy watches this branch. The APK built from that branch calls this
    // exact deployed domain via CONFIG.RESOLVE_MAPS_URL_BASE, so the route
    // has to actually exist on whatever's live, regardless of which
    // branch's UI code calls it.
    if (url.pathname === '/api/flights') return nearbyFlights(url, env);
    // Confirmed live (curl against the deployed *.workers.dev domain) that
    // these two 404'd — functions/api/traffic.js and functions/api/places.js
    // are Cloudflare PAGES Functions, but this app is deployed as a plain
    // Worker (see wrangler.jsonc's `main`), which never executes functions/
    // at all. TomTom live traffic and the Places fallback have never
    // actually reached TomTom on this deployment, web or native, regardless
    // of CONFIG.TOMTOM_FEATURES_ENABLED/the Settings toggle being on.
    if (url.pathname === '/api/traffic') return tomtomTrafficFlow(url, env);
    if (url.pathname === '/api/places') return tomtomPlacesSearch(url, env);
    return env.ASSETS.fetch(request);
  },
};
