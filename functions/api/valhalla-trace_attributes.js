import { valhallaProxy } from '../../lib/valhalla-proxy.js';

export async function onRequestPost(context) {
  return valhallaProxy('trace_attributes', context.request, context.env);
}
