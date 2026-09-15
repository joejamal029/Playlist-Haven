import { EnrichedSongRecord, ArtistBioData, ReleaseContextData } from './metadataEnrichmentTypes';
import { normalizeArtistKey, extractArtistNames, CanonicalBucket, ArtistClassification, detectScriptSignature } from './classificationEngine';
import { cleanCompositeTrack } from './playlistSanitizer';

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
    status === 'itunes_enriched' || 
    status === 'ai_synthesized_fallback' || 
    status === 'manual_resolved';
  
  if (!isValidVerifiedStatus) return false;

  if (!record.recordingMbid && !record.resolution?.isAiSynthesized && status !== 'manual_resolved' && status !== 'ai_synthesized_fallback' && status !== 'itunes_enriched') {
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

/**
 * Purge specifically all "Not on MusicBrainz" (ai_synthesized_fallback) records from IndexedDB
 * so they can be re-queried against Apple iTunes and other sources instead of loading stale cache.
 */
export async function purgeNotOnMbTracks(): Promise<number> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS], 'readwrite');
    const store = transaction.objectStore(STORE_TRACKS);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = (request.result as EnrichedSongRecord[]) || [];
      const targets = all.filter(t => 
        t.resolution?.status === 'ai_synthesized_fallback' || 
        t.resolution?.source === 'ai_synthesized_fallback' ||
        t.resolution?.isAiSynthesized === true
      );

      if (targets.length === 0) {
        resolve(0);
        return;
      }

      for (const track of targets) {
        if (track.id) store.delete(track.id);
      }

      resolve(targets.length);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Helper to resolve an artist against the Language Clustering cache using all available metadata
 * (query artist, canonical name, clean names, featured artist tokens, aliases)
 */
export function resolveArtistFromCache(
  track: EnrichedSongRecord,
  cacheResolver: (artist: string) => ArtistClassification | null
): ArtistClassification | null {
  if (!track || !cacheResolver) return null;

  // 1. Try queryArtist (the original name from the user's playlist/import)
  if (track.queryArtist) {
    const c1 = cacheResolver(track.queryArtist);
    if (c1 && c1.bucket) return c1;
  }

  // 2. Try canonical artist name from MusicBrainz
  if (track.artist?.name) {
    const c2 = cacheResolver(track.artist.name);
    if (c2 && c2.bucket) return c2;
  }

  // 3. Try clean composite artist (stripping noise, brackets, ft.)
  if (track.queryArtist) {
    const cleaned = cleanCompositeTrack(track.title || track.queryTitle || '', track.queryArtist);
    if (cleaned.artist && cleaned.artist !== track.queryArtist && cleaned.artist !== '<unknown>') {
      const c3 = cacheResolver(cleaned.artist);
      if (c3 && c3.bucket) return c3;
    }
  }
  if (track.artist?.name) {
    const cleaned = cleanCompositeTrack(track.title || '', track.artist.name);
    if (cleaned.artist && cleaned.artist !== track.artist.name && cleaned.artist !== '<unknown>') {
      const c4 = cacheResolver(cleaned.artist);
      if (c4 && c4.bucket) return c4;
    }
  }

  // 4. Try multi-artist tokens from extractArtistNames
  const queryTokens = extractArtistNames(track.queryArtist || '');
  for (const token of queryTokens) {
    const ct = cacheResolver(token);
    if (ct && ct.bucket) return ct;
  }

  const artTokens = extractArtistNames(track.artist?.name || '');
  for (const token of artTokens) {
    const ct = cacheResolver(token);
    if (ct && ct.bucket) return ct;
  }

  // 5. Try MusicBrainz aliases
  if (track.artist?.aliases && Array.isArray(track.artist.aliases)) {
    for (const alias of track.artist.aliases) {
      const aliasName = typeof alias === 'string' ? alias : (alias as any)?.name;
      if (aliasName) {
        const ca = cacheResolver(aliasName);
        if (ca && ca.bucket) return ca;
      }
    }
  }

  // 6. Try credited artists
  if (track.artist?.creditedArtists && Array.isArray(track.artist.creditedArtists)) {
    for (const ca of track.artist.creditedArtists) {
      if (ca.name) {
        const c = cacheResolver(ca.name);
        if (c && c.bucket) return c;
      }
    }
  }

  return null;
}

/**
 * Overwrite the culturalBucket field for all tracks belonging to a given artist in IndexedDB
 * (Ensures Language Clustering cache changes immediately sync to the Deep Metadata database)
 */
export async function overwriteArtistCulturalBucketInDB(
  artistName: string,
  newBucket: CanonicalBucket
): Promise<number> {
  if (!artistName || !newBucket) return 0;
  const db = await initDB();
  const targetNorm = normalizeArtistKey(artistName);
  const targetTokens = extractArtistNames(artistName).map(normalizeArtistKey);
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS], 'readwrite');
    const store = transaction.objectStore(STORE_TRACKS);
    const request = store.openCursor();
    let updatedCount = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const track = cursor.value as EnrichedSongRecord;
        const normArt = normalizeArtistKey(track.artist?.name || '');
        const normQuery = normalizeArtistKey(track.queryArtist || '');
        
        let matches = (normArt && (normArt === targetNorm || targetTokens.includes(normArt))) ||
                      (normQuery && (normQuery === targetNorm || targetTokens.includes(normQuery)));

        if (!matches && track.artist?.aliases && Array.isArray(track.artist.aliases)) {
          matches = track.artist.aliases.some(a => {
            const aName = typeof a === 'string' ? a : (a as any)?.name;
            return aName && normalizeArtistKey(aName) === targetNorm;
          });
        }

        if (!matches) {
          const artTokens = extractArtistNames(track.artist?.name || '').map(normalizeArtistKey);
          const qTokens = extractArtistNames(track.queryArtist || '').map(normalizeArtistKey);
          matches = artTokens.includes(targetNorm) || qTokens.includes(targetNorm);
        }

        if (matches) {
          if (track.culturalBucket !== newBucket) {
            track.culturalBucket = newBucket;
            track.updatedAt = now;
            // Promote unresolved / pending track to manual_resolved so it persists and is visible
            if (!track.resolution || track.resolution.status === 'needs_resolution' || track.resolution.status === 'pending') {
              track.resolution = {
                status: 'manual_resolved',
                source: 'manual',
                isAiSynthesized: true,
                badgeLabel: '✓ Language Clustered Override',
                matchScore: 100,
                timestamp: now,
              };
            }
            cursor.update(track);
            updatedCount++;
          }
        }
        cursor.continue();
      }
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(updatedCount);
    transaction.onerror = () => reject(transaction.error || new Error('Transaction failed'));
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
}

/**
 * Overwrite the culturalBucket field across all tracks in IndexedDB using the superior Language Clustering cache
 * and any currently clustered tracks from the active workspace.
 * Resolves each track by:
 * 1. Exact song key match (normalizeSongKey) from clusteredTracks
 * 2. Artist match from clusteredTracks
 * 3. Multi-tiered cache lookup via cacheResolver
 */
export async function overwriteDatabaseCulturalBucketsFromCache(
  cacheResolver: (artist: string) => ArtistClassification | null,
  clusteredTracks?: Array<{ title?: string; artist?: string; classification?: { bucket?: CanonicalBucket } }>
): Promise<{ updatedCount: number; totalTracks: number }> {
  const db = await initDB();
  const now = Date.now();

  // Pre-build song-level and artist-level fast lookup maps from clustered tracks if provided
  const songKeyToBucket = new Map<string, CanonicalBucket>();
  const clusteredArtistToBucket = new Map<string, CanonicalBucket>();

  if (clusteredTracks && Array.isArray(clusteredTracks) && clusteredTracks.length > 0) {
    for (const ct of clusteredTracks) {
      const bucket = ct.classification?.bucket;
      if (!bucket || bucket === 'Other') continue;
      
      if (ct.artist && ct.title) {
        const songKey = normalizeSongKey(ct.artist, ct.title);
        songKeyToBucket.set(songKey, bucket);
        const cleaned = cleanCompositeTrack(ct.title, ct.artist);
        if (cleaned.artist && cleaned.title) {
          songKeyToBucket.set(normalizeSongKey(cleaned.artist, cleaned.title), bucket);
        }
      }

      if (ct.artist) {
        clusteredArtistToBucket.set(normalizeArtistKey(ct.artist), bucket);
        const tokens = extractArtistNames(ct.artist);
        for (const token of tokens) {
          clusteredArtistToBucket.set(normalizeArtistKey(token), bucket);
        }
      }
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_TRACKS], 'readwrite');
    const store = transaction.objectStore(STORE_TRACKS);
    const request = store.openCursor();
    let updatedCount = 0;
    let totalTracks = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        totalTracks++;
        const track = cursor.value as EnrichedSongRecord;
        
        let targetBucket: CanonicalBucket | null = null;

        // 1. Check exact song-key match from clusteredTracks
        if (songKeyToBucket.size > 0) {
          if (track.id && songKeyToBucket.has(track.id)) {
            targetBucket = songKeyToBucket.get(track.id)!;
          } else if (track.queryArtist && track.queryTitle) {
            const qKey = normalizeSongKey(track.queryArtist, track.queryTitle);
            if (songKeyToBucket.has(qKey)) {
              targetBucket = songKeyToBucket.get(qKey)!;
            }
          } else if (track.artist?.name && track.title) {
            const aKey = normalizeSongKey(track.artist.name, track.title);
            if (songKeyToBucket.has(aKey)) {
              targetBucket = songKeyToBucket.get(aKey)!;
            }
          }
        }

        // 2. Check artist match from clusteredTracks
        if (!targetBucket && clusteredArtistToBucket.size > 0) {
          const normArt = normalizeArtistKey(track.artist?.name || '');
          const normQuery = normalizeArtistKey(track.queryArtist || '');
          if (normArt && clusteredArtistToBucket.has(normArt)) {
            targetBucket = clusteredArtistToBucket.get(normArt)!;
          } else if (normQuery && clusteredArtistToBucket.has(normQuery)) {
            targetBucket = clusteredArtistToBucket.get(normQuery)!;
          }
        }

        // 3. Check multi-tiered cache resolver
        if (!targetBucket) {
          const cached = resolveArtistFromCache(track, cacheResolver);
          if (cached && cached.bucket && cached.bucket !== 'Other') {
            targetBucket = cached.bucket;
          }
        }

        // 4. Script signature fallback
        if (!targetBucket) {
          const scriptSig = detectScriptSignature(track.artist?.name || track.queryArtist || '') || 
                            detectScriptSignature(track.title || track.queryTitle || '');
          if (scriptSig && scriptSig.bucket && scriptSig.bucket !== 'Other') {
            targetBucket = scriptSig.bucket;
          }
        }

        if (targetBucket && targetBucket !== 'Other') {
          if (track.culturalBucket !== targetBucket) {
            track.culturalBucket = targetBucket;
            track.updatedAt = now;
            // Promote unresolved / pending track so it is retained and persistable
            if (!track.resolution || track.resolution.status === 'needs_resolution' || track.resolution.status === 'pending') {
              track.resolution = {
                status: 'manual_resolved',
                source: 'manual',
                isAiSynthesized: true,
                badgeLabel: '✓ Language Clustered Override',
                matchScore: 100,
                timestamp: now,
              };
            }
            cursor.update(track);
            updatedCount++;
          }
        }
        cursor.continue();
      }
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve({ updatedCount, totalTracks });
    transaction.onerror = () => reject(transaction.error || new Error('Transaction failed'));
    transaction.onabort = () => reject(new Error('Transaction aborted'));
  });
}

