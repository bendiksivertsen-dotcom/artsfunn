// Photo storage in IndexedDB (blobs are far too large for localStorage's quota).
// Photos are keyed by a groupId shared by every observation created in the same
// registerObs() submission, so one photo taken at a locality attaches to every
// species logged there without the user re-picking it per species.

const DB_NAME    = 'artsfunn_photos';
const DB_VERSION = 1;
const STORE      = 'photos';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'photoId' });
      store.createIndex('groupId', 'groupId', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return dbPromise;
}

async function store(mode) {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Downscale + re-encode an image file so field photos (often several MB
 * straight off a phone camera) don't blow past IndexedDB/device storage.
 */
export function compressImage(file, maxPx = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        const scale = maxPx / Math.max(width, height);
        width  = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
    img.src = url;
  });
}

export async function addPhoto(groupId, blob) {
  const photoId = `${groupId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const s = await store('readwrite');
  await wrap(s.add({ photoId, groupId, blob, ts: Date.now() }));
  return photoId;
}

export async function getPhotosByGroup(groupId) {
  const s = await store('readonly');
  return wrap(s.index('groupId').getAll(groupId));
}

export async function getAllPhotos() {
  const s = await store('readonly');
  return wrap(s.getAll());
}

export async function deletePhotosForGroup(groupId) {
  const photos = await getPhotosByGroup(groupId);
  const s = await store('readwrite');
  await Promise.all(photos.map(p => wrap(s.delete(p.photoId))));
}

export async function clearAllPhotos() {
  const s = await store('readwrite');
  await wrap(s.clear());
}
