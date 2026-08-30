// Cloudflare Pages Function entry point — see lib/tomtom-places-proxy.js
// for the actual logic, shared with worker.js (the plain-Worker deployment
// path this app also supports, since Pages Functions and Workers don't
// discover routes the same way).
import { tomtomPlacesSearch } from '../../lib/tomtom-places-proxy.js';

export async function onRequestGet(context) {
  return tomtomPlacesSearch(new URL(context.request.url), context.env);
}
