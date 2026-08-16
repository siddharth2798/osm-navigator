// Worker entry point for the "plain Cloudflare Worker + static assets"
// deployment path (see wrangler.jsonc). This app is a static site with no
// build step — the only reason a Worker script exists at all is to add the
// one dynamic route below; every other request falls straight through to
// env.ASSETS, unchanged from pure static-asset serving (assets are matched
// before this fetch handler ever runs, per the default `run_worker_first:
// false`, so nothing here can shadow a real static file).
import { resolveMapsUrl } from './lib/resolve-maps-url.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/resolve-maps-url') return resolveMapsUrl(url);
    return env.ASSETS.fetch(request);
  },
};
