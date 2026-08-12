import { CONFIG } from './config.js';

// ============================================================================
// Tiny plain-IndexedDB helper — no external library. Four object stores:
//   favorites      — saved places (name, lat, lon, note)
//   recentTrips    — auto-recorded origin/destination pairs, capped & pruned
//   downloadedAreas — metadata for each offline tile download (Milestone 3A)
//   currentTrip    — a single "resume where I left off" record (Milestone 3B)
// Every exported function rejects with a plain Error on failure; callers are
// expected to catch and show a plain-language status message, same as every
// other async operation in this app.
// ============================================================================

const DB_NAME = 'navigator-db';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open the local database.'));
  });
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

// ---- favorites --------------------------------------------------------------

export async function addFavorite({ label, lat, lon, note }) {
  return idbAdd('favorites', { name: label, lat, lon, note: note || '', createdAt: Date.now() });
}
export async function getFavorites() {
  const all = await idbGetAll('favorites');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteFavorite(id) {
  return idbDelete('favorites', id);
}

// ---- recent trips -------------------------------------------------------------

export async function addRecentTrip(trip) {
  await idbAdd('recentTrips', { ...trip, createdAt: Date.now() });
  // Cap at MAX_RECENT_TRIPS, dropping the oldest first.
  const all = await idbGetAll('recentTrips');
  all.sort((a, b) => b.createdAt - a.createdAt);
  const excess = all.slice(CONFIG.MAX_RECENT_TRIPS);
  for (const item of excess) await idbDelete('recentTrips', item.id);
}
export async function getRecentTrips() {
  const all = await idbGetAll('recentTrips');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteRecentTrip(id) {
  return idbDelete('recentTrips', id);
}

// ---- downloaded areas (Milestone 3A) -------------------------------------------

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

// ---- current trip (Milestone 3B resilience) ------------------------------------
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
