// Thin entry point; real logic is in lib/tomtom-traffic-proxy.js (shared with worker.js).
import { tomtomTrafficFlow } from '../../lib/tomtom-traffic-proxy.js';

export async function onRequestGet(context) {
  return tomtomTrafficFlow(new URL(context.request.url), context.env);
}
