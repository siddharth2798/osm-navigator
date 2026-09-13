// Thin entry point; real logic is in lib/tomtom-places-proxy.js (shared with worker.js).
import { tomtomPlacesSearch } from '../../lib/tomtom-places-proxy.js';

export async function onRequestGet(context) {
  return tomtomPlacesSearch(new URL(context.request.url), context.env);
}
