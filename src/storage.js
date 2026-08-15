/**
 * Persistent storage — wraps @capacitor/preferences on Android, falls back to
 * localStorage in the dev browser.
 *
 * Two namespaces:
 *   - positions  : { [movieId]: { sec, totalSec, updatedAt } }
 *   - favorites  : Set<groupId>  (serialized as a JSON array on disk)
 */
import { Preferences } from "@capacitor/preferences";

const KEY_POS = "telecast.positions";
const KEY_FAV = "telecast.favorites";
const KEY_PREFS = "telecast.prefs";

async function readKey(key) {
  try {
    const { value } = await Preferences.get({ key });
    if (value !== null && value !== undefined) return value;
  } catch {
    /* fall through */
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

async function writeKey(key, value) {
  try {
    await Preferences.set({ key, value });
    return;
  } catch {
    /* fall through */
  }
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ---------- positions ----------
let _positions = null;
export async function loadPositions() {
  if (_positions) return _positions;
  const raw = await readKey(KEY_POS);
  try { _positions = raw ? JSON.parse(raw) : {}; }
  catch { _positions = {}; }
  return _positions;
}

export async function getPosition(movieId) {
  const all = await loadPositions();
  return all[movieId] || null;
}

export async function savePosition(movieId, sec, totalSec) {
  if (!movieId || !Number.isFinite(sec) || sec <= 0) return;
  const all = await loadPositions();
  all[movieId] = { sec: Math.floor(sec), totalSec: Math.floor(totalSec || 0), updatedAt: Date.now() };
  await writeKey(KEY_POS, JSON.stringify(all));
}

export async function clearPosition(movieId) {
  const all = await loadPositions();
  delete all[movieId];
  await writeKey(KEY_POS, JSON.stringify(all));
}

export async function clearAllPositions() {
  _positions = {};
  await writeKey(KEY_POS, JSON.stringify({}));
}

// ---------- favorites ----------
let _favorites = null;
export async function loadFavorites() {
  if (_favorites) return _favorites;
  const raw = await readKey(KEY_FAV);
  try { _favorites = new Set(raw ? JSON.parse(raw) : []); }
  catch { _favorites = new Set(); }
  return _favorites;
}

export async function toggleFavorite(groupId) {
  const set = await loadFavorites();
  if (set.has(groupId)) set.delete(groupId);
  else set.add(groupId);
  await writeKey(KEY_FAV, JSON.stringify([...set]));
  return set;
}

export async function isFavorite(groupId) {
  const set = await loadFavorites();
  return set.has(groupId);
}

// ---------- general prefs ----------
const PREFS_DEFAULTS = { resumeEnabled: true };
let _prefs = null;
export async function loadPrefs() {
  if (_prefs) return _prefs;
  const raw = await readKey(KEY_PREFS);
  try { _prefs = { ...PREFS_DEFAULTS, ...(raw ? JSON.parse(raw) : {}) }; }
  catch { _prefs = { ...PREFS_DEFAULTS }; }
  return _prefs;
}

export async function setPref(key, value) {
  const p = await loadPrefs();
  p[key] = value;
  await writeKey(KEY_PREFS, JSON.stringify(p));
  return p;
}
