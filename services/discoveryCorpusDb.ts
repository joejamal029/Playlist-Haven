/**
 * Module 20: Discovery Intelligence Layer — Persistence Engine (Phase 0)
 * 
 * Provides:
 * - Dedicated IndexedDB storage under 'DiscoveryCorpusDB' (completely isolated from 'PlaylistHavenMetadataDB').
 * - Self-healing version handling and error recovery.
 * - Batched chunked transactions (5,000 items/chunk) to handle 78K+ tracks without browser freeze.
 * - Stores: corpus_meta, corpus_playlists, corpus_tracks.
 * - Reconstructs BipartiteCorpusGraph with Maps on load.
 * 
 * Architecture Guarantees:
 * - 100% Client-Side Pure TypeScript.
 * - Zero external libraries.
 */

import {
  CorpusPlaylist,
  CorpusTrack,
  CorpusConfig,
  CorpusStats,
  GraphIntelligenceResult,
  ProfilingResult
} from '../types';
import {
  BipartiteCorpusGraph,
  createCorpusConfig,
  normalizeForMatch
} from './discoveryCorpusEngine';

const DB_NAME = 'DiscoveryCorpusDB';
const DB_VERSION = 1;

const STORE_META = 'corpus_meta';
const STORE_PLAYLISTS = 'corpus_playlists';
const STORE_TRACKS = 'corpus_tracks';

const BATCH_SIZE = 5000;

let dbInstance: IDBDatabase | null = null;

/**
 * Initializes and connects to DiscoveryCorpusDB with VersionError self-healing fallback.
 */
export function initDiscoveryDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this runtime environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      // VersionError safety fallback
      if (request.error?.name === 'VersionError') {
        console.warn('[DiscoveryCorpusDB] Database version mismatch. Opening existing version...');
        const fallbackReq = window.indexedDB.open(DB_NAME);
        fallbackReq.onsuccess = () => {
          dbInstance = fallbackReq.result;
          resolve(dbInstance);
        };
        fallbackReq.onerror = () => {
          console.error('[DiscoveryCorpusDB] Fallback open failed:', fallbackReq.error);
          reject(fallbackReq.error);
        };
        return;
      }
      console.error('[DiscoveryCorpusDB] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Meta key-value store
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }

      // 2. Playlists store
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        const playlistStore = db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' });
        playlistStore.createIndex('name', 'name', { unique: false });
        playlistStore.createIndex('type', 'type', { unique: false });
      }

      // 3. Tracks store
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        const trackStore = db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
        trackStore.createIndex('artist', 'artist', { unique: false });
        trackStore.createIndex('consensusCount', 'consensusCount', { unique: false });
        trackStore.createIndex('possibleDuplicate', 'possibleDuplicate', { unique: false });
      }
    };
  });
}

/**
 * Checks whether a saved corpus exists in IndexedDB.
 */
export async function hasPersistedCorpus(): Promise<boolean> {
  try {
    const db = await initDiscoveryDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_META], 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.get('stats');
      req.onsuccess = () => {
        resolve(Boolean(req.result));
      };
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Reads cached CorpusStats from the meta store without loading the entire graph into memory.
 */
export async function getCorpusStats(): Promise<CorpusStats | null> {
  try {
    const db = await initDiscoveryDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_META], 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.get('stats');
      req.onsuccess = () => {
        resolve(req.result ? (req.result.value as CorpusStats) : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Persists a complete BipartiteCorpusGraph into DiscoveryCorpusDB in batched chunks.
 */
export async function saveCorpusGraph(
  graph: BipartiteCorpusGraph,
  onProgress?: (progress: { stage: string; current: number; total: number }) => void
): Promise<boolean> {
  const db = await initDiscoveryDb();

  // 1. Clear existing data
  await clearCorpusGraph();

  // 2. Save metadata & configuration
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readwrite');
    const store = tx.objectStore(STORE_META);

    store.put({ key: 'stats', value: graph.stats });
    store.put({ key: 'config', value: graph.config });
    store.put({ key: 'importedFiles', value: graph.stats.importedFiles });
    store.put({ key: 'rawRowsCount', value: graph.rawRowsCount });
    store.put({ key: 'updatedAt', value: new Date().toISOString() });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // 3. Save Playlists in batches
  const playlistList = Array.from(graph.playlists.values());
  for (let i = 0; i < playlistList.length; i += BATCH_SIZE) {
    const batch = playlistList.slice(i, i + BATCH_SIZE);
    if (onProgress) {
      onProgress({ stage: 'playlists', current: Math.min(i + batch.length, playlistList.length), total: playlistList.length });
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_PLAYLISTS], 'readwrite');
      const store = tx.objectStore(STORE_PLAYLISTS);
      for (const pl of batch) {
        store.put(pl);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // 4. Save Tracks in batches
  const trackList = Array.from(graph.tracks.values());
  for (let i = 0; i < trackList.length; i += BATCH_SIZE) {
    const batch = trackList.slice(i, i + BATCH_SIZE);
    if (onProgress) {
      onProgress({ stage: 'tracks', current: Math.min(i + batch.length, trackList.length), total: trackList.length });
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_TRACKS], 'readwrite');
      const store = tx.objectStore(STORE_TRACKS);
      for (const trk of batch) {
        store.put(trk);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return true;
}

/**
 * Loads the persisted corpus from DiscoveryCorpusDB and reconstructs the BipartiteCorpusGraph.
 */
export async function loadCorpusGraph(
  onProgress?: (progress: { stage: string; current: number; total: number }) => void
): Promise<BipartiteCorpusGraph | null> {
  const db = await initDiscoveryDb();

  // 1. Read metadata
  const metaMap = await new Promise<Record<string, any>>((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readonly');
    const store = tx.objectStore(STORE_META);
    const req = store.getAll();
    req.onsuccess = () => {
      const result: Record<string, any> = {};
      for (const item of req.result || []) {
        result[item.key] = item.value;
      }
      resolve(result);
    };
    req.onerror = () => reject(req.error);
  });

  if (!metaMap.stats) {
    return null; // No saved corpus found
  }

  const stats: CorpusStats = metaMap.stats;
  const config: CorpusConfig = createCorpusConfig(metaMap.config);
  const rawRowsCount: number = metaMap.rawRowsCount ?? stats.totalTracksRaw;

  // 2. Read Playlists
  const playlists = new Map<string, CorpusPlaylist>();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS], 'readonly');
    const store = tx.objectStore(STORE_PLAYLISTS);
    const req = store.getAll();
    req.onsuccess = () => {
      for (const pl of req.result || []) {
        playlists.set(pl.id, pl);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });

  // 3. Read Tracks using cursor to handle large memory structures smoothly
  const tracks = new Map<string, CorpusTrack>();
  const artistToTrackIds = new Map<string, string[]>();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_TRACKS], 'readonly');
    const store = tx.objectStore(STORE_TRACKS);
    const req = store.openCursor();
    let count = 0;

    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const track = cursor.value as CorpusTrack;
        tracks.set(track.id, track);

        if (track.artist) {
          const norm = normalizeForMatch(track.artist);
          if (norm) {
            const normList = artistToTrackIds.get(norm) || [];
            normList.push(track.id);
            artistToTrackIds.set(norm, normList);
          }

          if (track.artist !== norm) {
            const rawList = artistToTrackIds.get(track.artist) || [];
            rawList.push(track.id);
            artistToTrackIds.set(track.artist, rawList);
          }
        }

        count++;
        if (count % BATCH_SIZE === 0 && onProgress) {
          onProgress({ stage: 'loading_tracks', current: count, total: stats.uniqueTracks });
        }
        cursor.continue();
      } else {
        resolve();
      }
    };

    req.onerror = () => reject(req.error);
  });

  return {
    playlists,
    tracks,
    artistToTrackIds,
    stats,
    config,
    rawRowsCount,
  };
}

/**
 * Clears all data from DiscoveryCorpusDB.
 */
export async function clearCorpusGraph(): Promise<boolean> {
  const db = await initDiscoveryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_PLAYLISTS, STORE_TRACKS], 'readwrite');
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_PLAYLISTS).clear();
    tx.objectStore(STORE_TRACKS).clear();

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Persists computed GraphIntelligenceResult to DiscoveryCorpusDB.
 */
export async function saveGraphIntelligence(result: GraphIntelligenceResult): Promise<void> {
  const db = await initDiscoveryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.put({ key: 'graph_intelligence', value: result });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads cached GraphIntelligenceResult from DiscoveryCorpusDB.
 */
export async function loadGraphIntelligence(): Promise<GraphIntelligenceResult | null> {
  const db = await initDiscoveryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readonly');
    const store = tx.objectStore(STORE_META);
    const req = store.get('graph_intelligence');
    req.onsuccess = () => {
      resolve(req.result?.value || null);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clears cached GraphIntelligenceResult from DiscoveryCorpusDB.
 */
export async function clearGraphIntelligence(): Promise<void> {
  const db = await initDiscoveryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.delete('graph_intelligence');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Persists computed ProfilingResult to DiscoveryCorpusDB.
 */
export async function savePlaylistProfiling(result: ProfilingResult): Promise<void> {
  const db = await initDiscoveryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.put({ key: 'playlist_profiling', value: result });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads cached ProfilingResult from DiscoveryCorpusDB.
 */
export async function loadPlaylistProfiling(): Promise<ProfilingResult | null> {
  const db = await initDiscoveryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readonly');
    const store = tx.objectStore(STORE_META);
    const req = store.get('playlist_profiling');
    req.onsuccess = () => {
      resolve(req.result?.value || null);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clears cached ProfilingResult from DiscoveryCorpusDB.
 */
export async function clearPlaylistProfiling(): Promise<void> {
  const db = await initDiscoveryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.delete('playlist_profiling');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}


