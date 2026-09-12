// Worker entry point for the Cloudflare Worker + static assets deployment
// (see wrangler.jsonc). Adds a few dynamic API routes; everything else falls
// through to env.ASSETS as a static file.
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
    // Not used by main's app.js, but must stay live here since the
    // personal-branch APK calls this deployed domain (see docs/FLIGHT_TRACKING.md).
    if (url.pathname === '/api/flights') return nearbyFlights(url, env);
    // Note: functions/api/traffic.js and functions/api/places.js are Pages
    // Functions and never run under this plain-Worker deployment — these
    // routes are the ones actually live.
    if (url.pathname === '/api/traffic') return tomtomTrafficFlow(url, env);
    if (url.pathname === '/api/places') return tomtomPlacesSearch(url, env);
    return env.ASSETS.fetch(request);
  },
};
