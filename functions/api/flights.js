// Thin entry point; real logic is in lib/flights-proxy.js (shared with worker.js).
import { nearbyFlights } from '../../lib/flights-proxy.js';

export async function onRequestGet(context) {
  return nearbyFlights(new URL(context.request.url), context.env);
}
