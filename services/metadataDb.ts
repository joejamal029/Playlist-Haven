import { EnrichedSongRecord, ArtistBioData, ReleaseContextData } from './metadataEnrichmentTypes';
import { normalizeArtistKey } from './classificationEngine';

const DB_NAME = 'PlaylistHavenMetadataDB';
const DB_VERSION = 1;

const STORE_TRACKS = 'enriched_tracks';
const STORE_ARTISTS = 'cached_artists';
const STORE_RELEASES = 'cached_releases';

let dbInstance: IDBDatabase | null = null;

export function normalizeSongKey(artist: string, title: string): string {
  const normArtist = normalizeArtistKey(artist || '');
  const normTitle = (title || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')      // strip brackets
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\.[a-zA-Z0-9]+$/, '')     // strip extension
    .replace(/[^\p{L}\p{N}\s]/gu, '')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return `${normArtist}:::${normTitle}`;
}

export function isPersistableEnrichedTrack(record: EnrichedSongRecord): boolean {
  if (!record) return false;
  const status = record.resolution?.status;
  if (!status || status === 'needs_resolution' || status === 'pending') {
    return false;
  }
  const isValidVerifiedStatus = 
    status === 'enriched' || 
    status === 'cached' || 
    status === 'ai_search_resolved' || 
    status === 'ai_synthesized_fallback' || 
    status === 'manual_resolved';
  
  if (!isValidVerifiedStatus) return false;

  if (!record.recordingMbid && !record.resolution?.isAiSynthesized && status !== 'manual_resolved' && status !== 'ai_synthesized_fallback') {
    return false;
  }

  const hasArtist = Boolean(record.artist?.name || record.queryArtist);
  const hasTitle = Boolean(record.title || record.queryTitle);
  return hasArtist && hasTitle;
}

export function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    // Check IndexedDB availability (browser environment)
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      // Proactive sanitation: scrub any unverified legacy placeholders in the background
      purgeUnresolvedTracks().catch((err) => {
        console.warn('Background sanitation of unresolved tracks failed:', err);
      });
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Enriched Tracks store
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        const trackStore = db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
        trackStore.createIndex('culturalBucket', 'culturalBucket', { unique: false });
        trackStore.createIndex('artistName', 'artist.name', { unique: false });
        trackStore.createIndex('countryCode', 'artist.countryCode', { unique: false });
        trackStore.createIndex('status', 'resolution.status', { unique: false });
        trackStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 2. Cached Artists store
      if (!db.objectStoreNames.contains(STORE_ARTISTS)) {
        const artistStore = db.createObjectStore(STORE_ARTISTS, { keyPath: 'id' });
        artistStore.createIndex('artistMbid', 'artistMbid', { unique: false });
        artistStore.createIndex('name', 'name', { unique: false });
      }

      // 3. Cached Releases store
      if (!db.objectStoreNames.contains(STORE_RELEASES)) {
        const releaseStore = db.createObjectStore(STORE_RELEASES, { keyPath: 'id' });
        releaseStore.createIndex('releaseMbid', 'releaseMbid', { unique: false });
      }
    };
  });
}

/**
 * Retrieve an enriched track from local IndexedDB
 */
export async function getEnrichedTrack(artist: string, title: string): Promise<EnrichedSongRecord | null> {
  const db = await initDB();
  const key = normalizeSongKey(artist, title);

  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_TRACKS], 'readonly');
    const store = transaction.objectStore(STORE_TRACKS);
    const request = store.get(key);

    request.onsuccess = () => {
      const res = (request.result as EnrichedSongRecord) || null;
      // Do not treat 'needs_resolution' or unverified records as a valid cache hit
      if (res && isPersistableEnrichedTrack(res)) {
        resolve(res);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      resolve(null);
    };
  });
}

/**
 * Save or update an enriched track (failed 'needs_resolution' tracks are strictly blocked)
 */
export async function saveEnrichedTrack(record: EnrichedSongRecord, forceUpdate = false): Promise<void> {
  // Strict Guard: Never save failed/unresolved/pending records to IndexedDB
  if (!isPersistableEnrichedTrack(record)) {
    return;
  }

  const db = await initDB();
  const key = record.id || normalizeSongKey(record.queryArtist, record.queryTitle);
  const now = Date.now();

  const recordToSave: EnrichedSongRecord = {
    ...record,
    id: key,
    updatedAt: now,
    createdAt: record.createdAt || now,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS], 'readwrite');
    const store = transaction.objectStore(STORE_TRACKS);

    if (forceUpdate) {
      const putRequest = store.put(recordToSave);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    } else {
      // Check existing first
      const getRequest = store.get(key);
      getRequest.onsuccess = () => {
        if (!getRequest.result) {
          const putRequest = store.put(recordToSave);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve(); // Already exists, keep existing
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    }
  });
}

/**
 * Bulk save enriched tracks in a single transaction (strictly filtered against failed tracks)
 */
export async function bulkSaveEnrichedTracks(records: EnrichedSongRecord[], forceUpdate = true): Promise<number> {
  const validRecords = records.filter(isPersistableEnrichedTrack);
  if (validRecords.length === 0) return 0;
  const db = await initDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS], 'readwrite');
    const store = transaction.objectStore(STORE_TRACKS);
    let savedCount = 0;

    for (const record of validRecords) {
      const key = record.id || normalizeSongKey(record.queryArtist, record.queryTitle);
      const toSave: EnrichedSongRecord = {
        ...record,
        id: key,
        updatedAt: now,
        createdAt: record.createdAt || now,
      };

      if (forceUpdate) {
        store.put(toSave);
        savedCount++;
      } else {
        store.add(toSave); // .add() fails gracefully if key exists
        savedCount++;
      }
    }

    transaction.oncomplete = () => resolve(savedCount);
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get all enriched tracks stored in IndexedDB (strictly excluding failed or unverified tracks)
 */
export async function getAllEnrichedTracks(): Promise<EnrichedSongRecord[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS], 'readonly');
    const store = transaction.objectStore(STORE_TRACKS);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = (request.result as EnrichedSongRecord[]) || [];
      const valid = all.filter(isPersistableEnrichedTrack);
      resolve(valid);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Delete a specific track from IndexedDB
 */
export async function deleteEnrichedTrack(id: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS], 'readwrite');
    const store = transaction.objectStore(STORE_TRACKS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Artist-level shared caching
 */
export async function getCachedArtist(artistMbidOrName: string): Promise<ArtistBioData | null> {
  if (!artistMbidOrName) return null;
  const db = await initDB();
  const key = artistMbidOrName.includes('-') ? artistMbidOrName : normalizeArtistKey(artistMbidOrName);

  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_ARTISTS], 'readonly');
    const store = transaction.objectStore(STORE_ARTISTS);
    const request = store.get(key);

    request.onsuccess = () => {
      const res = request.result;
      resolve(res ? res.data : null);
    };
    request.onerror = () => resolve(null);
  });
}

export async function saveCachedArtist(artist: ArtistBioData): Promise<void> {
  if (!artist) return;
  const db = await initDB();
  const keys = [
    artist.artistMbid,
    normalizeArtistKey(artist.name),
  ].filter(Boolean);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ARTISTS], 'readwrite');
    const store = transaction.objectStore(STORE_ARTISTS);

    for (const key of keys) {
      store.put({ id: key, artistMbid: artist.artistMbid, name: artist.name, data: artist, updatedAt: Date.now() });
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Release-level shared caching
 */
export async function getCachedRelease(releaseMbid: string): Promise<ReleaseContextData | null> {
  if (!releaseMbid) return null;
  const db = await initDB();

  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_RELEASES], 'readonly');
    const store = transaction.objectStore(STORE_RELEASES);
    const request = store.get(releaseMbid);

    request.onsuccess = () => {
      const res = request.result;
      resolve(res ? res.data : null);
    };
    request.onerror = () => resolve(null);
  });
}

export async function saveCachedRelease(release: ReleaseContextData): Promise<void> {
  if (!release || !release.releaseMbid) return;
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_RELEASES], 'readwrite');
    const store = transaction.objectStore(STORE_RELEASES);

    store.put({ id: release.releaseMbid, releaseMbid: release.releaseMbid, data: release, updatedAt: Date.now() });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Storage metrics and statistics
 */
export async function getDatabaseStats(): Promise<{
  trackCount: number;
  artistCount: number;
  releaseCount: number;
  estimatedSizeBytes: number;
}> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS, STORE_ARTISTS, STORE_RELEASES], 'readonly');
    const trackStore = transaction.objectStore(STORE_TRACKS);
    const artistStore = transaction.objectStore(STORE_ARTISTS);
    const releaseStore = transaction.objectStore(STORE_RELEASES);

    const trackReq = trackStore.count();
    const artistReq = artistStore.count();
    const releaseReq = releaseStore.count();

    transaction.oncomplete = () => {
      const trackCount = trackReq.result || 0;
      const artistCount = artistReq.result || 0;
      const releaseCount = releaseReq.result || 0;
      // Rough JSON estimate: ~3.5 KB per dense track record + 1.5 KB per artist
      const estimatedSizeBytes = (trackCount * 3500) + (artistCount * 1500) + (releaseCount * 1200);

      resolve({
        trackCount,
        artistCount,
        releaseCount,
        estimatedSizeBytes,
      });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Export full offline database backup to JSON string
 */
export async function exportDatabaseToJSON(): Promise<string> {
  const tracks = await getAllEnrichedTracks();
  const stats = await getDatabaseStats();

  const payload = {
    appName: 'Playlist Haven',
    module: 'Deep Metadata Enrichment Engine',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    stats,
    tracks,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Import and merge an offline JSON database backup or preloaded dataset
 */
export async function importDatabaseFromJSON(jsonContent: string): Promise<{ importedTracks: number }> {
  const parsed = JSON.parse(jsonContent);
  let tracksToImport: EnrichedSongRecord[] = [];

  if (Array.isArray(parsed)) {
    tracksToImport = parsed;
  } else if (parsed && Array.isArray(parsed.tracks)) {
    tracksToImport = parsed.tracks;
  } else {
    throw new Error('Invalid JSON dataset format. Expected an array of tracks or a Playlist Haven database export.');
  }

  const validTracks = tracksToImport.filter(t => t.title && (t.artist?.name || t.queryArtist));
  const count = await bulkSaveEnrichedTracks(validTracks, true);
  return { importedTracks: count };
}

/**
 * Clear all records from IndexedDB
 */
export async function clearDatabase(): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS, STORE_ARTISTS, STORE_RELEASES], 'readwrite');
    transaction.objectStore(STORE_TRACKS).clear();
    transaction.objectStore(STORE_ARTISTS).clear();
    transaction.objectStore(STORE_RELEASES).clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Purge any unresolved, failed, or unverified records from IndexedDB
 */
export async function purgeUnresolvedTracks(): Promise<number> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS], 'readwrite');
    const store = transaction.objectStore(STORE_TRACKS);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = (request.result as EnrichedSongRecord[]) || [];
      const invalid = all.filter(t => !isPersistableEnrichedTrack(t));

      if (invalid.length === 0) {
        resolve(0);
        return;
      }

      for (const track of invalid) {
        if (track.id) store.delete(track.id);
      }

      resolve(invalid.length);
    };

    request.onerror = () => {
      resolve(0);
    };
  });
}

