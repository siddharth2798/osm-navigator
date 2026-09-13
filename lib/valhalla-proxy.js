// Proxies POST requests to a self-hosted Valhalla instance so its real address isn't shipped to the client.
// The address comes from SELF_HOSTED_VALHALLA_URL, a Cloudflare secret/variable set per deployment.
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

export async function valhallaProxy(action, request, env) {
  const upstreamBase = env && env.SELF_HOSTED_VALHALLA_URL;
  if (!upstreamBase) {
    return new Response(JSON.stringify({ error: 'SELF_HOSTED_VALHALLA_URL is not set on this deployment.' }), { status: 501, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  }
  const body = await request.text();
  try {
    const res = await fetch(`${upstreamBase}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    if (!res.ok) console.error('[valhalla-proxy] self-hosted Valhalla returned HTTP', res.status, 'for action', action);
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    console.error('[valhalla-proxy] failed to reach the self-hosted Valhalla server -', err.message);
    return new Response(JSON.stringify({ error: 'Could not reach the self-hosted Valhalla server.' }), { status: 502, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  }
}
