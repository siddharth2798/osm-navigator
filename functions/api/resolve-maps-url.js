// Thin entry point; real logic is in lib/resolve-maps-url.js (shared with worker.js).
import { resolveMapsUrl } from '../../lib/resolve-maps-url.js';

export async function onRequestGet(context) {
  return resolveMapsUrl(new URL(context.request.url));
}
