// IndexedDB storage for the user's songs (including the audio file, so it plays offline).
const DB_NAME = 'chordwell', STORE = 'songs';
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  }));
}

export const saveSong = song => tx('readwrite', s => s.put(song)).catch(e => { console.warn('save failed', e); });
export const deleteSong = id => tx('readwrite', s => s.delete(id)).catch(() => {});
export const getSong = id => tx('readonly', s => s.get(id)).catch(() => null);
export const listSongs = () => tx('readonly', s => s.getAll())
  .then(all => (all || []).sort((a, b) => (b.updated || 0) - (a.updated || 0)))
  .catch(() => []);

// Ask the browser not to clear our storage (helps on phones).
export function requestPersist() {
  try { navigator.storage?.persist?.(); } catch {}
}
