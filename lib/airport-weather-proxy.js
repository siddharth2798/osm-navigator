// Shared logic behind "current METAR/TAF weather for an airport" (personal
// flight-tracking overlay's airport info panel) — used by both
// functions/api/airport-weather.js (Cloudflare Pages) and worker.js, same
// split as flights-proxy.js right next to this file.
//
// Backed by aviationweather.gov, the FAA/NOAA's own production API behind
// the US aviation industry's EFBs and briefing tools — free, keyless, and
// far more production-reliable than either flight-position source this app
// uses, so (like flight-route-proxy.js/aircraft-info-proxy.js) there's no
// fallback tier here: no equally-authoritative free+keyless alternative
// exists, and this only fires on a discrete airport-panel open, not a poll.
const METAR_URL = 'https://aviationweather.gov/api/data/metar';
const TAF_URL = 'https://aviationweather.gov/api/data/taf';

// Between flight-route-proxy's 24h (routes barely change) and
// flights-proxy's 10s (live position) — weather genuinely changes over
// tens of minutes, not seconds or days.
const CACHE_TTL_S = 1200; // 20 min

const ICAO_PATTERN = /^[A-Za-z]{4}$/;

const UPSTREAM_HEADERS = { 'User-Agent': 'osm-navigator (personal project; https://github.com/siddharth2798/osm-navigator)' };
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
}

/** Never throws — a failed leg resolves to null so Promise.allSettled's
 * caller can treat "METAR down" and "TAF down" independently: one outage
 * shouldn't hide the other, working half of the panel. */
async function tryFetchJson(url) {
  try {
    const res = await fetch(url, { headers: UPSTREAM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (err) {
    return null;
  }
}

export async function airportWeather(requestUrl, env) {
  const icao = (requestUrl.searchParams.get('icao') || '').trim().toUpperCase();
  if (!ICAO_PATTERN.test(icao)) {
    return jsonResponse({ error: 'icao (4-letter airport code) is required.' }, 400);
  }

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://airport-weather-proxy.internal/metar-taf/${icao}`);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const [metarRaw, tafRaw] = await Promise.all([
    tryFetchJson(`${METAR_URL}?ids=${icao}&format=json`),
    tryFetchJson(`${TAF_URL}?ids=${icao}&format=json`),
  ]);

  if (!metarRaw && !tafRaw) {
    return jsonResponse({ error: 'Could not reach the airport-weather data source.' }, 502);
  }

  const body = {
    icao,
    // fltCat (VFR/MVFR/IFR/LIFR) comes precomputed from aviationweather.gov
    // itself — confirmed live, no client-side flight-category math needed.
    metar: metarRaw ? {
      obsTime: metarRaw.obsTime ?? null,
      rawOb: metarRaw.rawOb ?? null,
      temp: metarRaw.temp ?? null,
      dewp: metarRaw.dewp ?? null,
      wdir: metarRaw.wdir ?? null,
      wspd: metarRaw.wspd ?? null,
      wgst: metarRaw.wgst ?? null,
      visib: metarRaw.visib ?? null,
      altim: metarRaw.altim ?? null,
      wxString: metarRaw.wxString ?? null,
      fltCat: metarRaw.fltCat ?? null,
      clouds: Array.isArray(metarRaw.clouds) ? metarRaw.clouds.map((c) => ({ cover: c.cover ?? null, base: c.base ?? null })) : [],
    } : null,
    taf: tafRaw ? { rawTaf: tafRaw.rawTAF ?? null } : null,
  };

  const response = jsonResponse(body, 200);
  if (cache) {
    const toCache = response.clone();
    toCache.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_S}`);
    await cache.put(cacheKey, toCache);
  }
  return response;
}
