// Cloudflare Pages Function entry point — see lib/airport-weather-proxy.js
// for the actual logic, shared with worker.js (the plain-Worker deployment
// path this app also supports, since Pages Functions and Workers don't
// discover routes the same way).
import { airportWeather } from '../../lib/airport-weather-proxy.js';

export async function onRequestGet(context) {
  return airportWeather(new URL(context.request.url), context.env);
}
