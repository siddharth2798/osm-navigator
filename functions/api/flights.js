// Cloudflare Pages Function entry point — see lib/flights-proxy.js for the
// actual logic, shared with worker.js (the plain-Worker deployment path
// this app also supports, since Pages Functions and Workers don't discover
// routes the same way).
import { nearbyFlights } from '../../lib/flights-proxy.js';

export async function onRequestGet(context) {
  return nearbyFlights(new URL(context.request.url), context.env);
}
