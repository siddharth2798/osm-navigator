import { CONFIG } from './config.js';

// ============================================================================
// Tiny plain-IndexedDB helper — no external library. Six object stores:
//   favorites      — saved places (name, lat, lon, note, listId)
//   lists          — renameable collections a favorite can be filed under
//                     (Google-Maps-style "Favorites"/"Want to go"/custom)
//   recentTrips    — auto-recorded origin/destination pairs, capped & pruned
//   downloadedAreas — metadata for each offline tile download
//   currentTrip    — a single "resume where I left off" record
//   quickPlaces    — Home/Work one-tap shortcuts (fixed keys 'home'/'work')
// Every exported function rejects with a plain Error on failure; callers are
// expected to catch and show a plain-language status message, same as every
// other async operation in this app.
// ============================================================================

const DB_NAME = 'navigator-db';
const DB_VERSION = 3;

// A fresh indexedDB.open() per call (the original shape here) never closes
// the connection it creates, so every single read/write — including the
// getFavorites()/getRecentTrips() pair fired on every focus of a search
// field, and the saveCurrentTrip() fired every 15s throughout a drive —
// permanently leaked one more open IDB connection for the rest of the tab's
// lifetime. Caching the one open connection and reusing it is the standard
// pattern; onversionchange (another tab loading a newer DB_VERSION) closes
// it and clears the cache so the next call reopens cleanly instead of
// hanging against a connection this tab is now blocking an upgrade on.
let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('favorites')) {
        db.createObjectStore('favorites', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('recentTrips')) {
        db.createObjectStore('recentTrips', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('downloadedAreas')) {
        db.createObjectStore('downloadedAreas', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('currentTrip')) {
        db.createObjectStore('currentTrip', { keyPath: 'id' });
      }
      // Added in DB_VERSION 2: existing favorites (saved before lists
      // existed) have no listId yet — getFavorites() below migrates them
      // to whatever the default list turns out to be, the first time
      // they're read, rather than needing a one-off migration pass here.
      if (!db.objectStoreNames.contains('lists')) {
        db.createObjectStore('lists', { keyPath: 'id', autoIncrement: true });
      }
      // Added in DB_VERSION 3: Home/Work quick places, a two-record store
      // (fixed keys 'home'/'work') — same singleton-record idiom as
      // currentTrip above.
      if (!db.objectStoreNames.contains('quickPlaces')) {
        db.createObjectStore('quickPlaces', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error || new Error('Could not open the local database.')); };
    // Fires when a version-upgrade open is blocked by another tab/instance
    // still holding a connection at an older DB_VERSION — plausible here
    // since DB_VERSION has been bumped more than once (quick places added
    // it to 3). Without this, neither onsuccess nor onerror ever fires
    // until that other connection closes: dbPromise sits pending forever,
    // with no timeout, so every caller (getFavorites, addFavorite,
    // getRecentTrips, the 15s saveCurrentTrip ticker, getDownloadedAreas,
    // ...) hangs indefinitely instead of hitting its existing "Could not
    // load…" error path.
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error('Could not open the local database — it looks like another tab has this app open on an older version. Close other tabs of this app and reload.'));
    };
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Local database operation failed.'));
  });
}

async function idbGetAll(storeName) {
  const db = await openDb();
  return reqToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}
async function idbGet(storeName, key) {
  const db = await openDb();
  return reqToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}
async function idbAdd(storeName, value) {
  const db = await openDb();
  return reqToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).add(value));
}
async function idbPut(storeName, value) {
  const db = await openDb();
  return reqToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).put(value));
}
async function idbDelete(storeName, key) {
  const db = await openDb();
  return reqToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key));
}

// ---- lists (favorites organized into renameable collections, Google-Maps-style "Saved" screen) ----

export async function addList({ name }) {
  return idbAdd('lists', { name, createdAt: Date.now() });
}
export async function getLists() {
  const all = await idbGetAll('lists');
  return all.sort((a, b) => a.createdAt - b.createdAt); // creation order, so the default list stays first
}
export async function renameList(id, name) {
  const list = await idbGet('lists', id);
  if (!list) throw new Error('That list no longer exists.');
  return idbPut('lists', { ...list, name });
}
/** Deleting a list keeps its favorites rather than deleting them — they're
 * reassigned to whichever list is now first (oldest). Any list can be
 * deleted, including the only one: if that leaves affected favorites with
 * nowhere to go, a fresh "Favorites" list is created to hold them (the
 * same self-healing fallback getFavorites()/openSaveToListPrompt already
 * rely on for a brand-new install with zero lists). */
export async function deleteList(id) {
  const lists = await getLists();
  const remaining = lists.filter((l) => l.id !== id);
  const favorites = await idbGetAll('favorites');
  const affected = favorites.filter((f) => f.listId === id);
  if (affected.length) {
    const fallbackId = remaining.length ? remaining[0].id : await addList({ name: 'Favorites' });
    for (const fav of affected) await idbPut('favorites', { ...fav, listId: fallbackId });
  }
  return idbDelete('lists', id);
}
async function getOrCreateDefaultListId() {
  const lists = await getLists();
  if (lists.length) return lists[0].id;
  return addList({ name: 'Favorites' });
}
/** Finds a list by exact name, creating it if it doesn't exist yet — used
 * to file a place under a specific named list (e.g. "To add to OSM")
 * rather than falling back to whichever list happens to be first. */
export async function getOrCreateNamedListId(name) {
  const lists = await getLists();
  const existing = lists.find((l) => l.name === name);
  if (existing) return existing.id;
  return addList({ name });
}

// ---- favorites --------------------------------------------------------------

export async function addFavorite({ label, lat, lon, note, listId }) {
  const finalListId = listId != null ? listId : await getOrCreateDefaultListId();
  return idbAdd('favorites', { name: label, lat, lon, note: note || '', listId: finalListId, createdAt: Date.now() });
}
/** Returns favorites sorted newest-first, optionally filtered to a single
 * list. Also self-heals favorites saved before lists existed (no listId
 * yet) by filing them under the default list the first time they're read,
 * rather than needing a one-off migration pass at DB-upgrade time. */
export async function getFavorites(listId) {
  const all = await idbGetAll('favorites');
  const legacy = all.filter((f) => f.listId == null);
  if (legacy.length) {
    const defaultId = await getOrCreateDefaultListId();
    for (const fav of legacy) {
      fav.listId = defaultId;
      await idbPut('favorites', fav);
    }
  }
  const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
  return listId == null ? sorted : sorted.filter((f) => f.listId === listId);
}
export async function moveFavoriteToList(id, listId) {
  const fav = await idbGet('favorites', id);
  if (!fav) throw new Error('That favorite no longer exists.');
  return idbPut('favorites', { ...fav, listId });
}
export async function deleteFavorite(id) {
  return idbDelete('favorites', id);
}

// ---- recent trips -------------------------------------------------------------

/** Re-searching/re-planning the same origin→destination just bumps its
 * existing entry to the top instead of piling up near-duplicates, the same
 * way Google Maps' recent-search list behaves. */
export async function addRecentTrip(trip) {
  const all = await idbGetAll('recentTrips');
  const dup = all.find((t) => t.originLabel === trip.originLabel && t.destLabel === trip.destLabel);
  if (dup) {
    await idbPut('recentTrips', { ...dup, ...trip, createdAt: Date.now() });
  } else {
    await idbAdd('recentTrips', { ...trip, createdAt: Date.now() });
  }
  // Cap at MAX_RECENT_TRIPS, dropping the oldest first.
  const updated = await idbGetAll('recentTrips');
  updated.sort((a, b) => b.createdAt - a.createdAt);
  const excess = updated.slice(CONFIG.MAX_RECENT_TRIPS);
  for (const item of excess) await idbDelete('recentTrips', item.id);
}
export async function getRecentTrips() {
  const all = await idbGetAll('recentTrips');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteRecentTrip(id) {
  return idbDelete('recentTrips', id);
}

// ---- downloaded areas -----------------------------------------------------------

export async function addDownloadedArea(area) {
  return idbAdd('downloadedAreas', { ...area, createdAt: Date.now() });
}
export async function getDownloadedAreas() {
  const all = await idbGetAll('downloadedAreas');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteDownloadedArea(id) {
  return idbDelete('downloadedAreas', id);
}

// ---- current trip -----------------------------------------------------------
// A singleton record (fixed key 'active') so a killed/reloaded tab mid-drive
// can restore the in-progress route without a network round trip.

export async function saveCurrentTrip(tripData) {
  return idbPut('currentTrip', { id: 'active', ...tripData, savedAt: Date.now() });
}
export async function loadCurrentTrip() {
  return idbGet('currentTrip', 'active');
}
export async function clearCurrentTrip() {
  return idbDelete('currentTrip', 'active');
}

// ---- quick places (Home/Work) -----------------------------------------------
// Two singleton records, keyed 'home'/'work' — one-tap shortcuts, distinct
// from the favorites/lists system since there's always at most one of each.

export async function setQuickPlace(kind, place) {
  return idbPut('quickPlaces', { id: kind, label: place.label, lat: place.lat, lon: place.lon });
}
export async function getQuickPlace(kind) {
  return idbGet('quickPlaces', kind);
}
export async function deleteQuickPlace(kind) {
  return idbDelete('quickPlaces', kind);
}
