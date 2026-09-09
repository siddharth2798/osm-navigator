// Cloudflare Pages Function entry point — see lib/aircraft-info-proxy.js
// for the actual logic, shared with worker.js (the plain-Worker deployment
// path this app also supports, since Pages Functions and Workers don't
// discover routes the same way).
import { aircraftInfo } from '../../lib/aircraft-info-proxy.js';

export async function onRequestGet(context) {
  return aircraftInfo(new URL(context.request.url), context.env);
}
