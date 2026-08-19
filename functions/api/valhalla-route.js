import { valhallaProxy } from '../../lib/valhalla-proxy.js';

export async function onRequestPost(context) {
  return valhallaProxy('route', context.request, context.env);
}
