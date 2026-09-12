// Thin entry point; real logic is in lib/opencharge-poi.js (shared with worker.js).
import { openChargePoi } from '../../lib/opencharge-poi.js';

export async function onRequestGet(context) {
  return openChargePoi(new URL(context.request.url), context.env);
}
