// Cloudflare Pages Function entry point — see lib/resolve-maps-url.js for
// the actual logic, shared with worker.js (the plain-Worker deployment path
// this app also supports, since Pages Functions and Workers don't discover
// routes the same way).
import { resolveMapsUrl } from '../../lib/resolve-maps-url.js';

export async function onRequestGet(context) {
  return resolveMapsUrl(new URL(context.request.url));
}
