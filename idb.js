import { CONFIG } from './config.js';

// Tiny plain-IndexedDB helper, no external library. Six object stores:
// favorites, lists, recentTrips, downloadedAreas, currentTrip, quickPlaces.
// Every exported function rejects with a plain Error on failure.

const DB_NAME = 'navigator-db';
const DB_VERSION = 3;

// Cache the one open connection instead of opening a fresh one per call.
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
      // Favorites saved before this existed get migrated by getFavorites() below.
      if (!db.objectStoreNames.contains('lists')) {
        db.createObjectStore('lists', { keyPath: 'id', autoIncrement: true });
      }
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
    // Without this, an upgrade blocked by another tab would hang forever with no error.
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

// ---- lists (renameable collections of favorites) ----

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
/** Deleting a list keeps its favorites, reassigning them to the oldest
 * remaining list (or a fresh "Favorites" list if none remain). */
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
/** Finds a list by exact name, creating it if it doesn't exist yet. */
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
 * list. Migrates any favorite with no listId to the default list first. */
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

/** Re-searching the same origin→destination bumps the existing entry
 * instead of adding a duplicate. */
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
// Singleton record (key 'active') so a reloaded tab mid-drive can resume.

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
// Two singleton records, keyed 'home'/'work'.

export async function setQuickPlace(kind, place) {
  return idbPut('quickPlaces', { id: kind, label: place.label, lat: place.lat, lon: place.lon });
}
export async function getQuickPlace(kind) {
  return idbGet('quickPlaces', kind);
}
export async function deleteQuickPlace(kind) {
  return idbDelete('quickPlaces', kind);
}
