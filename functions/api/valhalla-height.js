import { valhallaProxy } from '../../lib/valhalla-proxy.js';

export async function onRequestPost(context) {
  return valhallaProxy('height', context.request, context.env);
}
