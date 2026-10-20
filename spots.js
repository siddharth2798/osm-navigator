// Secret spot collections — the browser side (see docs/SPOT_COLLECTIONS.md).
//
// Typing a collection's keyword into the search bar opens a hidden map layer of community-added spots.
// Everything collection-specific (title, colour, categories) comes from the server, so a new collection is a
// database row, not a code change. This module owns its own DOM (banner, filter chips, list sheet, add flow) and
// map layers, and reaches back into app.js only through the helpers passed to createSpots().
import { CONFIG } from './config.js';
import { formatDistance } from './lib/format-utils.js';
import { isSafeHttpUrl } from './lib/text-utils.js';
import {
  bboxAround, googleMapsSpotUrl, haversineM, matchCollection, SPOT_LIMITS, validateSpotDraft,
} from './lib/collections.js';

const UNLOCKED_STORAGE_KEY = 'navigator-spots-unlocked'; // { [collectionId]: { key, title, icon, color } }
const MANIFEST_STORAGE_KEY = 'navigator-spots-manifest'; // last good manifest, so a keyword still matches offline
const MAX_CACHED_SPOTS = 2000;   // per open map, before older pans are dropped
const WORLD_BOX = '-180,-90,180,90';
const FOCUS_NEAR_HALF_DEG = 0.35; // first look for spots within ~40 km of where the user asked about
const FOCUS_MAX_SPOTS = 8;        // frame at most this many of the nearest spots when opening
const FOCUS_EXTRA_M = 15000;      // ...and only those within this much (at least) further than the very nearest one
const FOCUS_ANCHOR_M = 30000;     // include the searched place in the frame only if a spot is this close to it
const FOCUS_FAR_M = 40000;        // beyond this, say that the nearest spots are far away
const FOCUS_MAX_ZOOM = 16;        // never zoom in closer than this when framing
const MANIFEST_RETRY_MS = 30000; // don't hammer a deployment that has no spots API
const ADD_MIN_ZOOM = 15;         // a pin placed from further out than this would be too imprecise to be useful
const POPUP_CLEARANCE_PX = 420;  // search card + banner + chips + a full popup must fit above a pin
const DEFAULT_COLOR = '#e8590c';
const CAR_MAX_RESULTS = 6;       // the car host trims long lists while driving; keep to what it will actually show

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / storage full — non-fatal */ }
}

const $ = (id) => document.getElementById(id);

function svgIcon(path, size = 16, strokeWidth = 2.2) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
const ICON_LIST = '<path d="M8 6 h12 M8 12 h12 M8 18 h12 M4 6 h.01 M4 12 h.01 M4 18 h.01"/>';
const ICON_CLOSE = '<path d="M5 5 L19 19 M19 5 L5 19"/>';
const ICON_EXTERNAL = '<path d="M14 4 h6 v6 M20 4 L10 14 M18 14 v5 a1 1 0 0 1-1 1 H5 a1 1 0 0 1-1-1 V7 a1 1 0 0 1 1-1 h5"/>';

/**
 * @param {object} deps helpers from app.js: map, mapLoad (promise that resolves once the base map has loaded),
 *   showStatus, pushBackLayer, forgetBackLayerIfTop,
 *   goBackInApp, fetchWithTimeout, isNativePlatform, currentLiveLngLat, resolveCurrentLocationAnchor,
 *   geocodePlace(text) -> {lat, lon} | null, showSuggestionList(listEl), hideSuggestionList(listEl),
 *   openDirectionsTo({label, lat, lon}), saveToFavorites({label, lat, lon}), createPinElement(color, label)
 */
export function createSpots(deps) {
  const {
    map, mapLoad, showStatus, pushBackLayer, forgetBackLayerIfTop, goBackInApp, fetchWithTimeout, isNativePlatform,
    currentLiveLngLat, resolveCurrentLocationAnchor, geocodePlace, showSuggestionList, hideSuggestionList,
    openDirectionsTo, saveToFavorites, createPinElement,
  } = deps;

  let manifest = null;
  let manifestPromise = null;
  let manifestFailedAt = 0;
  let active = null;     // the open map: { details, key, spots: Map, category, loadSeq, ... }
  let loadTimer = null;
  let lastLoadErrorAt = 0;
  let lastOpenAt = 0;
  let addState = null;   // the add-a-spot flow: { step: 'place' | 'form', lat, lon, marker, closeFn }
  let listOpen = false;
  let layersReady = false;

  // ---------------------------------------------------------------- API

  const apiBase = () => (isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '');

  async function api(path, { method = 'GET', key, body } = {}) {
    const headers = {};
    if (key) headers['x-collection-key'] = key;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetchWithTimeout(`${apiBase()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    return { ok: res.ok, status: res.status, data };
  }

  /**
   * The public {id, salt, hash} list used to recognise a keyword on this device, so ordinary searches never reach
   * the server. A deployment without the spots API (501/404) resolves to [] and the whole feature stays invisible.
   */
  async function getManifest() {
    if (manifest) return manifest;
    if (!manifestPromise) {
      manifestPromise = (async () => {
        if (Date.now() - manifestFailedAt < MANIFEST_RETRY_MS) return readJson(MANIFEST_STORAGE_KEY, []);
        try {
          const r = await api('/api/spots/manifest');
          if (r.ok && Array.isArray(r.data && r.data.collections)) {
            manifest = r.data.collections;
            writeJson(MANIFEST_STORAGE_KEY, manifest);
            return manifest;
          }
          if (r.status === 501) { manifest = []; return manifest; }
        } catch { /* offline — fall through to the cached copy */ }
        manifestFailedAt = Date.now();
        manifestPromise = null;
        return readJson(MANIFEST_STORAGE_KEY, []);
      })();
    }
    return manifestPromise;
  }

  async function fetchCollection(id, key) {
    try {
      const r = await api(`/api/spots/collection?c=${encodeURIComponent(id)}`, { key });
      return r.ok ? r.data : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- remembered ("unlocked") maps

  const readUnlocked = () => readJson(UNLOCKED_STORAGE_KEY, {});

  function rememberUnlocked(details, key) {
    const all = readUnlocked();
    all[details.id] = { key, title: details.title, icon: details.icon, color: details.color };
    writeJson(UNLOCKED_STORAGE_KEY, all);
  }

  function forgetUnlocked(id) {
    const all = readUnlocked();
    delete all[id];
    writeJson(UNLOCKED_STORAGE_KEY, all);
  }

  // ---------------------------------------------------------------- map layers

  function ensureLayers() {
    if (layersReady) return;
    layersReady = true;
    map.addSource('spots', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 14,
    });
    map.addLayer({
      id: 'spots-cluster',
      type: 'circle',
      source: 'spots',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': DEFAULT_COLOR,
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.94,
      },
    });
    map.addLayer({
      id: 'spots-cluster-count',
      type: 'symbol',
      source: 'spots',
      filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff' },
    });
    map.addLayer({
      id: 'spots-point',
      type: 'circle',
      source: 'spots',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': DEFAULT_COLOR,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 10],
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
      },
    });
    map.addLayer({
      id: 'spots-label',
      type: 'symbol',
      source: 'spots',
      minzoom: 14.5,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-max-width': 8,
        'text-optional': true,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#10151c', 'text-halo-width': 1.6 },
    });

    map.on('click', 'spots-point', (e) => {
      if (!active || addState || !e.features.length) return;
      const spot = active.spots.get(e.features[0].properties.id);
      if (spot) openSpotPopup(spot);
    });
    map.on('click', 'spots-cluster', async (e) => {
      if (!active || addState || !e.features.length) return;
      const feature = e.features[0];
      try {
        const zoom = await map.getSource('spots').getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({ center: feature.geometry.coordinates, zoom: zoom + 0.5 });
      } catch { /* source replaced mid-click — ignore */ }
    });
    ['spots-point', 'spots-cluster'].forEach((layer) => {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    });
    map.on('moveend', () => {
      if (!active) return;
      renderBannerSubtitle(); // "N in view" follows the camera, even when nothing new needs loading
      scheduleLoad();
    });
  }

  function paintCollectionColor(color) {
    ['spots-cluster', 'spots-point'].forEach((id) => map.setPaintProperty(id, 'circle-color', color));
  }

  function categoryOf(spot) {
    const found = active && active.details.categories.find((c) => c.id === spot.category);
    return found || { id: spot.category, label: spot.category, emoji: active ? active.details.icon : '📍' };
  }

  function visibleSpots() {
    if (!active) return [];
    const all = [...active.spots.values()];
    return active.category ? all.filter((s) => s.category === active.category) : all;
  }

  function render() {
    if (!active) return;
    const spots = visibleSpots();
    map.getSource('spots').setData({
      type: 'FeatureCollection',
      features: spots.map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { id: s.id, name: s.name, category: s.category },
      })),
    });
    renderBannerSubtitle();
    if (listOpen) renderList();
  }

  // ---------------------------------------------------------------- loading spots for the viewport

  function scheduleLoad(delay = 350) {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(loadVisibleSpots, delay);
  }

  function boxContains(outer, inner) {
    return outer && inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
  }

  async function loadVisibleSpots() {
    const current = active;
    if (!current) return;
    const b = map.getBounds();
    const view = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    if (boxContains(current.loadedBox, view)) return;

    // Fetch a little beyond the screen so small pans don't trigger another request.
    const padLon = (view[2] - view[0]) * 0.15;
    const padLat = (view[3] - view[1]) * 0.15;
    const box = [
      Math.max(-180, view[0] - padLon), Math.max(-90, view[1] - padLat),
      Math.min(180, view[2] + padLon), Math.min(90, view[3] + padLat),
    ].map((n) => +n.toFixed(5));
    const centre = map.getCenter();

    const seq = ++current.loadSeq;
    current.loading = true;
    renderBannerSubtitle();
    let result;
    try {
      // `near` makes the server keep the closest spots if a very wide view holds more than it will return.
      result = await api(
        `/api/spots?c=${encodeURIComponent(current.details.id)}&bbox=${box.join(',')}&near=${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`,
        { key: current.key },
      );
    } catch {
      result = null;
    }
    if (active !== current || seq !== current.loadSeq) return;
    current.loading = false;

    if (result && result.status === 401) { handleCollectionGone(current); return; } // keyword changed / map removed
    if (!result || !result.ok) {
      if (Date.now() - lastLoadErrorAt > 15000) {
        lastLoadErrorAt = Date.now();
        showStatus('Couldn’t load spots for this area. Check your connection and move the map to retry.', 'error');
      }
      current.loadedBox = null;
      renderBannerSubtitle();
      return;
    }

    const incoming = result.data.spots || [];
    if (current.spots.size + incoming.length > MAX_CACHED_SPOTS) current.spots.clear();
    incoming.forEach((s) => current.spots.set(s.id, s));
    current.truncated = Boolean(result.data.truncated);
    current.loadedBox = current.truncated ? null : box;
    render();
  }

  // ---------------------------------------------------------------- banner, filter chips, list

  /** What the banner says: spots in the current view, and a nudge when the loaded ones are all off-screen. */
  function renderBannerSubtitle() {
    if (!active) return;
    const sub = $('spots-banner-sub');
    if (active.status) { sub.textContent = active.status; return; }
    const loaded = visibleSpots();
    const bounds = map.getBounds();
    const inView = loaded.filter((s) => bounds.contains([s.lon, s.lat])).length;
    if (loaded.length === 0) {
      sub.textContent = active.loading ? 'Loading…' : (active.category ? 'None of this type yet' : 'No spots here yet — add the first one');
    } else if (inView === 0) {
      sub.textContent = 'None in view — zoom out, or open the list';
    } else {
      sub.textContent = `${inView} in view${active.truncated ? ' · zoom in for more' : ''}`;
    }
  }

  function renderBanner() {
    const { details } = active;
    $('spots-banner-icon').textContent = details.icon;
    $('spots-banner-icon').style.background = details.color;
    $('spots-banner-title').textContent = details.title;
    $('spots-banner').classList.remove('hidden');
    renderBannerSubtitle();
    renderChips();
  }

  function renderChips() {
    const row = $('spots-chips');
    row.innerHTML = '';
    const make = (label, id) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + ((active.category || null) === id ? ' active' : '');
      btn.setAttribute('aria-pressed', String((active.category || null) === id));
      btn.textContent = label;
      btn.addEventListener('click', () => {
        active.category = id;
        renderChips();
        render();
      });
      row.appendChild(btn);
    };
    make('All', null);
    active.details.categories.forEach((c) => make(`${c.emoji || ''} ${c.label}`.trim(), c.id));
    row.classList.remove('hidden');
  }

  function listAnchor() {
    const live = currentLiveLngLat();
    if (live) return { lat: live[1], lon: live[0] };
    const c = map.getCenter();
    return { lat: c.lat, lon: c.lng };
  }

  function renderList() {
    const list = $('spots-list');
    const anchor = listAnchor();
    const rows = visibleSpots()
      .map((s) => ({ s, d: haversineM(anchor.lat, anchor.lon, s.lat, s.lon) }))
      .sort((a, b) => a.d - b.d);
    $('spots-list-title').textContent = `${active.details.icon} ${active.details.title}`;
    list.innerHTML = '';
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nothing here yet. Zoom or pan the map, or add the first spot.';
      list.appendChild(li);
      return;
    }
    rows.forEach(({ s, d }) => {
      const cat = categoryOf(s);
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'spots-list-row';
      const emoji = document.createElement('span');
      emoji.className = 'spots-list-emoji';
      emoji.textContent = cat.emoji || active.details.icon;
      const text = document.createElement('span');
      text.className = 'spots-list-text';
      const name = document.createElement('span');
      name.className = 'spots-list-name';
      name.textContent = s.name;
      const meta = document.createElement('span');
      meta.className = 'spots-list-meta';
      meta.textContent = `${cat.label} · ${formatDistance(d)}`;
      text.append(name, meta);
      if (s.note) {
        const note = document.createElement('span');
        note.className = 'spots-list-note';
        note.textContent = s.note;
        text.appendChild(note);
      }
      btn.append(emoji, text);
      btn.addEventListener('click', () => {
        closeList();
        map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 16), duration: 500 });
        openSpotPopup(s);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function openList() {
    if (!active || listOpen) return;
    closePopup();
    listOpen = true;
    renderList();
    $('spots-list-sheet').classList.remove('hidden');
    pushBackLayer(closeListFromBack);
  }
  function closeListFromBack() { closeList(false); }
  function closeList(fromButton = true) {
    if (!listOpen) return;
    listOpen = false;
    $('spots-list-sheet').classList.add('hidden');
    if (fromButton) forgetBackLayerIfTop(closeListFromBack);
  }

  // ---------------------------------------------------------------- spot popup

  function closePopup() {
    if (active && active.popup) active.popup.remove();
  }

  function openSpotPopup(spot) {
    if (!active) return;
    closePopup();
    const popup = new maplibregl.Popup({
      closeButton: true, closeOnClick: true, maxWidth: '290px', offset: 14, className: 'spot-popup',
    }).setLngLat([spot.lon, spot.lat]).setDOMContent(buildPopupContent(spot)).addTo(map);
    const closeFn = () => { popup.remove(); };
    pushBackLayer(closeFn);
    popup.on('close', () => {
      forgetBackLayerIfTop(closeFn);
      if (active && active.popup === popup) active.popup = null;
    });
    active.popup = popup;

    // The popup opens above its pin, which for a pin near the top of the screen is behind the search card.
    const pinY = map.project([spot.lon, spot.lat]).y;
    if (pinY < POPUP_CLEARANCE_PX) map.panBy([0, pinY - POPUP_CLEARANCE_PX], { duration: 250 });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Built from DOM nodes and textContent only: spot text comes from other people.
  function buildPopupContent(spot) {
    const cat = categoryOf(spot);
    const root = el('div', 'spot-card');
    root.appendChild(el('h3', 'spot-card-name', spot.name));

    const badge = el('span', 'spot-card-type', `${cat.emoji || ''} ${cat.label}`.trim());
    badge.style.background = active.details.color;
    root.appendChild(badge);

    if (spot.note) root.appendChild(el('p', 'spot-card-note', spot.note));

    const links = el('div', 'spot-card-links');
    const maps = el('a', 'spot-card-link');
    maps.href = googleMapsSpotUrl(spot.name, spot.lat, spot.lon);
    maps.target = '_blank';
    maps.rel = 'noopener noreferrer';
    maps.innerHTML = `${svgIcon(ICON_EXTERNAL, 14)}<span>Open in Google Maps</span>`;
    links.appendChild(maps);
    if (spot.url && isSafeHttpUrl(spot.url)) {
      const site = el('a', 'spot-card-link');
      site.href = spot.url;
      site.target = '_blank';
      site.rel = 'noopener noreferrer nofollow';
      let host = spot.url;
      try { host = new URL(spot.url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
      site.innerHTML = `${svgIcon(ICON_EXTERNAL, 14)}<span></span>`;
      site.querySelector('span').textContent = host;
      links.appendChild(site);
    }
    root.appendChild(links);

    const actions = el('div', 'spot-card-actions');
    const directions = el('button', 'spot-card-btn primary', 'Directions');
    directions.type = 'button';
    directions.addEventListener('click', () => {
      closePopup();
      openDirectionsTo({ label: spot.name, lat: spot.lat, lon: spot.lon });
    });
    const save = el('button', 'spot-card-btn', 'Save');
    save.type = 'button';
    save.addEventListener('click', () => saveToFavorites({ label: spot.name, lat: spot.lat, lon: spot.lon }));
    const report = el('button', 'spot-card-btn subtle', 'Report');
    report.type = 'button';
    actions.append(directions, save, report);
    root.appendChild(actions);

    // Inline confirm instead of window.confirm(), which blocks the whole page (and the Android WebView).
    const confirm = el('div', 'spot-card-confirm hidden');
    confirm.appendChild(el('span', null, 'Report this spot as wrong or inappropriate?'));
    const yes = el('button', 'spot-card-btn danger', 'Report');
    yes.type = 'button';
    const no = el('button', 'spot-card-btn', 'Keep');
    no.type = 'button';
    confirm.append(yes, no);
    root.appendChild(confirm);
    report.addEventListener('click', () => { actions.classList.add('hidden'); confirm.classList.remove('hidden'); });
    no.addEventListener('click', () => { confirm.classList.add('hidden'); actions.classList.remove('hidden'); });
    yes.addEventListener('click', () => submitReport(spot, yes));
    return root;
  }

  async function submitReport(spot, button) {
    const current = active;
    if (!current) return;
    button.disabled = true;
    try {
      const r = await api(`/api/spots/${encodeURIComponent(spot.id)}/report`, { method: 'POST', key: current.key });
      if (active !== current) return;
      if (r.ok) {
        showStatus('Thanks — reported.', 'success');
        if (r.data && r.data.hidden) { current.spots.delete(spot.id); render(); }
        closePopup();
      } else {
        showStatus((r.data && r.data.error) || 'Couldn’t send that report.', 'error');
        button.disabled = false;
      }
    } catch {
      showStatus('Couldn’t reach the server. Try again in a moment.', 'error');
      button.disabled = false;
    }
  }

  // ---------------------------------------------------------------- adding a spot

  function startAdd() {
    if (!active || addState) return;
    closePopup();
    closeList();
    const closeFn = () => { endAdd(false); };
    addState = { step: 'place', lat: null, lon: null, marker: null, closeFn };
    $('spots-crosshair').classList.remove('hidden');
    $('spots-add-sheet').classList.remove('hidden');
    $('spots-add-place').classList.remove('hidden');
    $('spots-add-form').classList.add('hidden');
    pushBackLayer(closeFn);
    if (map.getZoom() < ADD_MIN_ZOOM) showStatus('Zoom in and move the map so the pin sits exactly on the spot.', 'info');
  }

  function endAdd(fromButton = true) {
    if (!addState) return;
    const { marker, closeFn } = addState;
    if (marker) marker.remove();
    addState = null;
    $('spots-crosshair').classList.add('hidden');
    $('spots-add-sheet').classList.add('hidden');
    $('spots-add-form').reset();
    $('spots-form-error').classList.add('hidden');
    $('spots-add-submit').disabled = false;
    $('spots-add-submit').textContent = 'Add spot';
    map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 250 });
    if (fromButton) forgetBackLayerIfTop(closeFn);
  }

  function renderTypeChoices() {
    const group = $('spots-type');
    group.innerHTML = '';
    active.details.categories.forEach((c) => {
      const label = el('label', 'spots-type-option');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'spots-type';
      input.value = c.id;
      label.append(input, el('span', null, `${c.emoji || ''} ${c.label}`.trim()));
      group.appendChild(label);
    });
  }

  async function useMyLocationForAdd() {
    try {
      const live = currentLiveLngLat();
      const where = live ? { lat: live[1], lon: live[0] } : await resolveCurrentLocationAnchor();
      map.easeTo({ center: [where.lon, where.lat], zoom: Math.max(map.getZoom(), 17), duration: 500 });
    } catch (err) {
      showStatus(err.message, 'error');
    }
  }

  function confirmPlacement() {
    if (!addState) return;
    if (map.getZoom() < ADD_MIN_ZOOM) {
      showStatus('Zoom in a bit more so the pin lands exactly on the spot.', 'info');
      return;
    }
    const c = map.getCenter();
    addState.lat = c.lat;
    addState.lon = c.lng;
    addState.step = 'form';
    renderTypeChoices();
    $('spots-crosshair').classList.add('hidden');
    $('spots-add-place').classList.add('hidden');
    $('spots-add-form').classList.remove('hidden');
    addState.marker = new maplibregl.Marker({ element: createPinElement(active.details.color, 'New spot'), anchor: 'bottom' })
      .setLngLat([c.lng, c.lat]).addTo(map);
    // Keep the pin visible above the sheet that now covers the lower part of the screen.
    map.easeTo({ padding: { bottom: $('spots-add-sheet').offsetHeight, top: 0, left: 0, right: 0 }, center: [c.lng, c.lat], duration: 250 });
    $('spots-name').focus({ preventScroll: true });
  }

  function backToPlacement() {
    if (!addState) return;
    if (addState.marker) { addState.marker.remove(); addState.marker = null; }
    addState.step = 'place';
    $('spots-crosshair').classList.remove('hidden');
    $('spots-add-place').classList.remove('hidden');
    $('spots-add-form').classList.add('hidden');
    map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 250 });
  }

  function showFormError(message) {
    const box = $('spots-form-error');
    box.textContent = message;
    box.classList.remove('hidden');
  }

  async function submitSpot(event) {
    event.preventDefault();
    const current = active;
    if (!current || !addState || addState.step !== 'form') return;
    const chosen = document.querySelector('input[name="spots-type"]:checked');
    const checked = validateSpotDraft({
      name: $('spots-name').value,
      lat: addState.lat,
      lon: addState.lon,
      category: chosen ? chosen.value : '',
      note: $('spots-note').value,
      url: $('spots-url').value,
    }, current.details.categories.map((c) => c.id));
    if (!checked.ok) { showFormError(checked.error); return; }

    $('spots-form-error').classList.add('hidden');
    const submit = $('spots-add-submit');
    submit.disabled = true;
    submit.textContent = 'Adding…';
    try {
      const r = await api(`/api/spots?c=${encodeURIComponent(current.details.id)}`, { method: 'POST', key: current.key, body: checked.value });
      if (active !== current) return;
      if (r.status === 201) {
        const spot = r.data.spot;
        current.spots.set(spot.id, spot);
        // Don't let an active type filter hide the spot the user just added.
        if (current.category && current.category !== spot.category) { current.category = null; renderChips(); }
        endAdd();
        render();
        showStatus('Added — thanks for sharing!', 'success');
        openSpotPopup(spot);
        return;
      }
      showFormError((r.data && r.data.error) || 'Couldn’t add that spot.');
    } catch {
      showFormError('Couldn’t reach the server. Check your connection and try again.');
    }
    submit.disabled = false;
    submit.textContent = 'Add spot';
  }

  // ---------------------------------------------------------------- opening and closing a map

  async function resolveAnchor(placeText) {
    if (placeText) {
      try {
        const place = await geocodePlace(placeText);
        if (place) return { lat: place.lat, lon: place.lon };
      } catch { /* fall through to the user's own location */ }
      showStatus(`Couldn’t find “${placeText}” — showing spots around you instead.`, 'info');
    }
    const live = currentLiveLngLat();
    if (live) return { lat: live[1], lon: live[0] };
    try {
      const here = await resolveCurrentLocationAnchor();
      return { lat: here.lat, lon: here.lon };
    } catch (err) {
      showStatus(`${err.message} Showing spots around the current map view.`, 'info');
      return null;
    }
  }

  const lookingForText = (placeText) => (placeText ? `Finding ${placeText}…` : 'Finding your location…');

  /**
   * Opens the map straight away and only then works out where to look, so a slow place lookup ("near Fort Kochi")
   * shows a "Finding…" banner instead of leaving the search box looking dead.
   */
  async function openCollection(details, key, placeText = null) {
    lastOpenAt = Date.now();
    if (active) deactivate();
    const backClose = () => { if (active && active.backClose === backClose) deactivate(false); };
    active = {
      details: { ...details, categories: details.categories || [] },
      key,
      spots: new Map(),
      category: null,
      loadSeq: 0,
      loadedBox: null,
      loading: false,
      truncated: false,
      popup: null,
      backClose,
      placeholder: $('place-input').placeholder,
      status: map.isStyleLoaded() ? lookingForText(placeText) : 'Loading the map…',
    };
    const current = active;
    rememberUnlocked(details, key);
    $('search-card').classList.add('spots-mode');
    $('place-input').placeholder = 'Search a place to explore…';
    $('place-input').value = '';
    $('spots-add-btn').classList.remove('hidden');
    $('spots-add-btn').style.setProperty('--spots-color', details.color || DEFAULT_COLOR);
    renderBanner();
    pushBackLayer(backClose);

    // Look the place up while the base map is still loading — the two are independent. A slow connection should delay
    // the pins, never cancel opening, so the map is awaited however long it takes (the banner is already up).
    const anchorPromise = resolveAnchor(placeText);
    await mapLoad;
    if (active !== current) return; // the user left (or opened another map) in the meantime
    ensureLayers();
    paintCollectionColor(details.color || DEFAULT_COLOR);
    render();
    current.status = lookingForText(placeText);
    renderBannerSubtitle();

    const anchor = await anchorPromise;
    if (active !== current) return;
    current.status = 'Finding the nearest spots…';
    renderBannerSubtitle();
    await focusNearest(current, anchor, placeText);
    if (active !== current) return;
    current.status = null;
    renderBannerSubtitle();
    scheduleLoad(200);
  }

  /**
   * Frames the map on the spots nearest to `anchor` (the searched place, the user, or — with neither — the whole
   * collection), however far away they are. Opening on a fixed zoom around the anchor could land on an empty street
   * with the spots a few streets, or a few hundred kilometres, off-screen.
   */
  async function focusNearest(current, anchor, placeText) {
    const centre = anchor || { lat: map.getCenter().lat, lon: map.getCenter().lng };
    const fetchBox = async (box) => {
      try {
        const r = await api(
          `/api/spots?c=${encodeURIComponent(current.details.id)}&bbox=${box}&near=${centre.lat.toFixed(5)},${centre.lon.toFixed(5)}`,
          { key: current.key },
        );
        if (r.status === 401) return { gone: true };
        return r.ok ? { data: r.data } : null;
      } catch {
        return null;
      }
    };

    // Look near the anchor first; only if there is nothing there, look everywhere.
    let found = anchor ? await fetchBox(bboxAround(centre.lat, centre.lon, FOCUS_NEAR_HALF_DEG)) : null;
    if (active !== current) return;
    if (found && found.gone) { handleCollectionGone(current); return; }
    if (!anchor || (found && found.data.spots.length === 0)) {
      found = await fetchBox(WORLD_BOX);
      if (active !== current) return;
      if (found && found.gone) { handleCollectionGone(current); return; }
    }

    const spots = found && found.data ? found.data.spots : [];
    if (spots.length === 0) {
      // Nothing at all (or the lookup failed): show the place itself, and the banner says what is going on.
      if (anchor) map.flyTo({ center: [anchor.lon, anchor.lat], zoom: 13, duration: 700 });
      return;
    }

    if (current.spots.size + spots.length > MAX_CACHED_SPOTS) current.spots.clear();
    spots.forEach((s) => current.spots.set(s.id, s));
    current.truncated = Boolean(found.data.truncated);
    render();

    const ranked = spots
      .map((s) => ({ s, d: haversineM(centre.lat, centre.lon, s.lat, s.lon) }))
      .sort((a, b) => a.d - b.d);
    const nearestM = ranked[0].d;
    // With a place or a position: the closest few. With neither: everything, as an overview of the whole collection.
    // The window grows with distance: when the nearest spot is hundreds of km away, its neighbours within ~25% of that
    // are worth showing alongside it rather than a lone pin.
    const reachM = nearestM + Math.max(FOCUS_EXTRA_M, nearestM * 0.25);
    const group = anchor ? ranked.filter((r) => r.d <= reachM).slice(0, FOCUS_MAX_SPOTS) : ranked;
    const points = group.map((r) => [r.s.lon, r.s.lat]);
    if (anchor && nearestM <= FOCUS_ANCHOR_M) points.push([anchor.lon, anchor.lat]);
    frameMapOn(points);

    if (anchor && nearestM > FOCUS_FAR_M) {
      showStatus(`The nearest spots are about ${formatDistance(nearestM)} from ${placeText || 'you'} — showing them.`, 'info');
    }
  }

  /** Fits the map to `points` ([lon, lat]) with room for the search card above and a sensible zoom limit. */
  function frameMapOn(points) {
    const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
    const box = map.getContainer();
    const side = Math.min(48, Math.round(box.clientWidth * 0.1));
    map.fitBounds(bounds, {
      padding: {
        top: Math.min(230, Math.round(box.clientHeight * 0.38)),
        bottom: Math.min(80, Math.round(box.clientHeight * 0.12)),
        left: side,
        right: side,
      },
      maxZoom: FOCUS_MAX_ZOOM,
      duration: 900,
    });
  }

  /** The server no longer accepts the keyword (changed or removed): forget it and leave. */
  function handleCollectionGone(current) {
    forgetUnlocked(current.details.id);
    deactivate();
    showStatus('That map is no longer available.', 'error');
  }

  /** Leaves the map. `unwindBackLayer` is false when the back button itself is what triggered this. */
  function deactivate(unwindBackLayer = true) {
    if (!active) return;
    const closing = active;
    clearTimeout(loadTimer);
    closePopup();
    closeList(unwindBackLayer);
    endAdd(unwindBackLayer);
    active = null;
    if (map.getSource('spots')) map.getSource('spots').setData({ type: 'FeatureCollection', features: [] });
    $('search-card').classList.remove('spots-mode');
    $('place-input').placeholder = closing.placeholder;
    $('spots-banner').classList.add('hidden');
    $('spots-chips').classList.add('hidden');
    $('spots-add-btn').classList.add('hidden');
    if (unwindBackLayer) forgetBackLayerIfTop(closing.backClose);
  }

  // ---------------------------------------------------------------- search-bar entry points

  /**
   * Called by the search box (debounced while typing, and immediately on Enter). Returns true when the query is a
   * collection keyword, in which case the caller must not run a normal place search for it.
   */
  async function handleSearchQuery(query, { listEl, isStale = () => false, enter = false } = {}) {
    if (!CONFIG.SPOTS_ENABLED) return false;
    const text = String(query || '').trim();
    if (text.length < 3) return false;
    const list = await getManifest();
    if (!list.length) return false;
    const match = await matchCollection(text, list);
    if (!match || isStale()) return false;
    // Enter just opened this map while the typing debounce was still in flight: swallow that query rather than
    // drawing a stale "Open …" row over the map. (A deliberate re-search later still gets its row.)
    const justOpened = () => !enter && active && active.details.id === match.id && Date.now() - lastOpenAt < 4000;
    if (justOpened()) return true;
    const details = await fetchCollection(match.id, match.keyword);
    if (!details || isStale()) return false;
    if (justOpened()) return true;

    if (enter) {
      if (listEl) hideSuggestionList(listEl);
      openCollection(details, match.keyword, match.place);
      return true;
    }
    if (!listEl) return true;
    listEl.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'result-item spots-unlock-row';
    const icon = el('span', 'spots-unlock-icon', details.icon);
    icon.style.background = details.color;
    const label = el('span', 'result-text');
    label.appendChild(el('span', 'result-primary', `Open ${details.title}`));
    label.appendChild(el('span', 'result-secondary', match.place ? `Spots near ${match.place}` : 'Spots near you'));
    li.append(icon, label);
    li.addEventListener('click', () => {
      hideSuggestionList(listEl);
      openCollection(details, match.keyword, match.place);
    });
    listEl.appendChild(li);
    showSuggestionList(listEl);
    return true;
  }

  // ---------------------------------------------------------------- "Secret maps" section of the Saved panel

  function renderUnlockedMaps() {
    const section = $('spots-unlocked-section');
    const list = $('spots-unlocked-list');
    const all = Object.entries(readUnlocked());
    list.innerHTML = '';
    section.classList.toggle('hidden', all.length === 0);
    all.forEach(([id, saved]) => {
      const li = el('li', 'spots-unlocked-item');
      const open = el('button', 'spots-unlocked-open');
      open.type = 'button';
      const icon = el('span', 'spots-unlock-icon', saved.icon || '📍');
      icon.style.background = saved.color || DEFAULT_COLOR;
      open.append(icon, el('span', null, saved.title || id));
      open.addEventListener('click', async () => {
        const details = await fetchCollection(id, saved.key);
        if (!details) {
          showStatus('Couldn’t open that map. If its keyword was changed, type the new one in the search bar.', 'error');
          return;
        }
        goBackInApp(); // closes the Saved panel; wait for the resulting popstate before stacking our own layer
        await new Promise((resolve) => {
          window.addEventListener('popstate', resolve, { once: true });
          setTimeout(resolve, 300);
        });
        openCollection(details, saved.key, null);
      });
      const forget = el('button', 'icon-btn small');
      forget.type = 'button';
      forget.setAttribute('aria-label', `Forget ${saved.title || id}`);
      forget.innerHTML = svgIcon(ICON_CLOSE, 14, 2.4);
      forget.addEventListener('click', () => { forgetUnlocked(id); renderUnlockedMaps(); });
      li.append(open, forget);
      list.appendChild(li);
    });
  }

  // ---------------------------------------------------------------- one-time wiring of the static markup

  $('spots-exit-btn').addEventListener('click', () => deactivate());
  $('spots-list-btn').addEventListener('click', openList);
  $('spots-list-close').addEventListener('click', () => closeList());
  $('spots-add-btn').addEventListener('click', startAdd);
  $('spots-add-cancel').addEventListener('click', () => endAdd());
  $('spots-add-form-cancel').addEventListener('click', () => endAdd());
  $('spots-add-here').addEventListener('click', useMyLocationForAdd);
  $('spots-add-next').addEventListener('click', confirmPlacement);
  $('spots-add-back').addEventListener('click', backToPlacement);
  $('spots-add-form').addEventListener('submit', submitSpot);
  $('spots-name').maxLength = SPOT_LIMITS.NAME_MAX;
  $('spots-note').maxLength = SPOT_LIMITS.NOTE_MAX;
  $('spots-url').maxLength = SPOT_LIMITS.URL_MAX;
  $('spots-note').addEventListener('input', () => {
    $('spots-note-count').textContent = `${$('spots-note').value.length}/${SPOT_LIMITS.NOTE_MAX}`;
  });

  /**
   * Android Auto's "Where to?" search. When `query` is a collection keyword (optionally "<keyword> near <place>"),
   * resolves to the nearest few spots as navigable results — { label, lat, lon, distanceM }, nearest first to the
   * named place, or to the car when none is given — and otherwise to null, so the caller runs its normal place search. Read-only by design: nothing is added
   * or reported from a driving surface.
   */
  async function nearestForCar(query, limit = CAR_MAX_RESULTS) {
    if (!CONFIG.SPOTS_ENABLED) return null;
    const text = String(query || '').trim();
    if (text.length < 3) return null;
    const list = await getManifest();
    const match = list.length ? await matchCollection(text, list) : null;
    if (!match) return null;
    const details = await fetchCollection(match.id, match.keyword);
    if (!details) return null;

    const live = currentLiveLngLat();
    let anchor = live ? { lat: live[1], lon: live[0] } : null;
    if (match.place) {
      try {
        const place = await geocodePlace(match.place);
        if (place) anchor = { lat: place.lat, lon: place.lon };
      } catch { /* fall back to the car's own position */ }
    }
    // A recognised keyword with nowhere to look is an empty list, not a place search for the keyword text.
    if (!anchor) return [];

    let result;
    try {
      // The whole world, ranked by the server from the anchor and capped: the nearest spots however far they are, so a
      // driver a long way from every spot still gets a list rather than an empty screen.
      result = await api(
        `/api/spots?c=${encodeURIComponent(details.id)}&bbox=${WORLD_BOX}&near=${anchor.lat.toFixed(5)},${anchor.lon.toFixed(5)}&limit=${limit}`,
        { key: match.keyword },
      );
    } catch {
      return [];
    }
    if (!result.ok) return [];
    // Ranked and measured from the anchor, so "near Marine Drive" lists what is closest to Marine Drive rather than
    // letting the cap drop it in favour of spots near the car. With no place named the anchor is the car itself.
    return (result.data.spots || [])
      .map((s) => ({ label: s.name, lat: s.lat, lon: s.lon, distanceM: haversineM(anchor.lat, anchor.lon, s.lat, s.lon) }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, limit);
  }

  return {
    handleSearchQuery,
    nearestForCar,
    renderUnlockedMaps,
    isActive: () => active !== null,
    close: () => deactivate(),
  };
}
