// Cloudflare Pages Function entry point — see lib/opencharge-poi.js for the
// actual logic, shared with worker.js (the plain-Worker deployment path
// this app also supports, since Pages Functions and Workers don't discover
// routes the same way).
import { openChargePoi } from '../../lib/opencharge-poi.js';

export async function onRequestGet(context) {
  return openChargePoi(new URL(context.request.url), context.env);
}
