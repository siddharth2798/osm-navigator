// Cloudflare Pages Function entry point — see lib/flight-route-proxy.js for
// the actual logic, shared with worker.js (the plain-Worker deployment path
// this app also supports, since Pages Functions and Workers don't discover
// routes the same way).
import { flightRoute } from '../../lib/flight-route-proxy.js';

export async function onRequestGet(context) {
  return flightRoute(new URL(context.request.url), context.env);
}
