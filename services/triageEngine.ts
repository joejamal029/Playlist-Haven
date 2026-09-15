import { getAIConfig, AIConfig } from './visionEngine';
import { GoogleGenAI } from '@google/genai';
import { cleanCompositeTrack } from './playlistSanitizer';
import {
  type CanonicalBucket,
  CANONICAL_BUCKETS,
  type BucketMetadata,
  getCachedClassification,
  detectScriptSignature,
  setManualOverride,
  normalizeArtistKey,
  initClassificationCache
} from './classificationEngine';
import {
  getAllEnrichedTracks,
  normalizeSongKey,
  saveEnrichedTrack,
  overwriteArtistCulturalBucketInDB,
  resolveArtistFromCache
} from './metadataDb';
import type { EnrichedSongRecord } from './metadataEnrichmentTypes';

export type { CanonicalBucket, BucketMetadata };
export { CANONICAL_BUCKETS };

export type TriageSource = 'Spotify' | 'YouTube Music' | 'Musicolet' | 'M3U' | 'TXT' | 'Custom' | 'Language Clustered' | 'YouTube ➔ Spotify Converted';
export type ResonanceTier = 'high' | 'emerging' | 'probe';
export type TriageStatus = 'inbox' | 'staged' | 'kept_single' | 'dismissed';
export type DownloadPriority = 'immediate' | 'secondary';
export type AlbumValidationStatus = 'unvalidated' | 'candidate' | 'validated';

export interface TriageTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  rawTitle: string;
  sources: TriageSource[];
  sourceOrder: number; // 1-indexed chronological position in source playlist(s)
  sourcePositions?: Record<string, number>; // Individual per-source / per-list positions, e.g. { 'Spotify': 1, 'YouTube Music': 1 }
  listPositions?: Record<string, number>; // Position keyed by file / playlist name
  primaryListName?: string;
  isrc?: string;
  spotifyId?: string;
  duration?: string;
  durationSeconds?: number;
  resonanceTier: ResonanceTier;
  triageStatus: TriageStatus;
  downloadPriority: DownloadPriority;
  notes?: string;
  addedAt: string;
  // Cultural provenance from Module 13 or auto-classifier
  culturalBucket: CanonicalBucket;
  country?: string;
  countryName?: string;
  confidence?: string;
  sourceDetails?: string;
  filePath?: string;
  // Deep Metadata Inheritance (Module 15 & MusicBrainz / Cover Art)
  coverArtUrl?: string;
  coverArtThumbUrl?: string;
  releaseDate?: string;
  releaseYear?: number;
  originalReleaseYear?: number;
  releaseType?: string;
  genres?: string[];
  tags?: string[];
  artistAliases?: string[];
  translatedTitle?: string;
  translatedArtist?: string;
  culturalContext?: string;
  enrichedRecord?: any;
}

export interface CulturalBucketGroup {
  bucket: CanonicalBucket;
  metadata: BucketMetadata;
  trackCount: number;
  percentageOfTotal: number;
  tracks: TriageTrack[]; // Strictly in original chronological playlist order (sourceOrder ascending)
  artistCount: number;
  artists: {
    artist: string;
    trackCount: number;
    resonanceTier: ResonanceTier;
    firstSeenOrder: number;
    tracks: TriageTrack[];
  }[];
  stagedCount: number;
  stagedPercentage: number;
}

export interface ArtistAlbumSummary {
  name: string;
  trackCount: number;
  tracks: TriageTrack[];
  isValidated: boolean;
}

export interface ArtistCluster {
  artist: string;
  trackCount: number;
  tracks: TriageTrack[];
  albumCount: number;
  albums: ArtistAlbumSummary[];
  resonanceTier: ResonanceTier;
  explorationStatus: 'unexplored' | 'exploring' | 'validated' | 'archived';
  sources: TriageSource[];
  aiDossier?: ArtistAIDossier;
  primaryCulturalBucket: CanonicalBucket;
  culturalBuckets: CanonicalBucket[];
}

export interface AlbumCluster {
  album: string;
  artist: string;
  trackCount: number;
  tracks: TriageTrack[];
  validationStatus: AlbumValidationStatus;
  validationScore: number; // 0 to 100 density score
  isCandidate: boolean;
}

export interface ImmersionBasket {
  tracks: TriageTrack[];
  totalCount: number;
  immediateCount: number;
  secondaryCount: number;
}

export interface TasteSynthesisDossier {
  headline: string;
  summary: string;
  sonicThemes: {
    theme: string;
    description: string;
    sampleArtists: string[];
  }[];
  recommendedAlbumDives: {
    artist: string;
    album: string;
    reason: string;
    priority: 'high' | 'medium';
  }[];
  detectedAnomalies: {
    title: string;
    artist: string;
    observation: string;
  }[];
  generatedAt: string;
}

export interface ArtistAIDossier {
  artist: string;
  signatureStyle: string;
  regionalOrigin: string;
  landmarkAlbums: {
    title: string;
    year?: string;
    importance: string;
  }[];
  discographyVerdict: 'Album Artist' | 'Singles Specialist' | 'Hybrid';
  verdictRationale: string;
  recommendedNextTracks: string[];
  scoutedAt: string;
}

export interface TriageStats {
  totalTracks: number;
  uniqueArtists: number;
  highResonanceArtists: number;
  emergingArtists: number;
  singleProbeArtists: number;
  albumClustersCount: number;
  albumCandidatesCount: number;
  validatedAlbumsCount: number;
  stagedCount: number;
  sourceCounts: Record<string, number>;
  crossPlatformOverlapCount: number;
  culturalBucketCounts: Record<string, number>;
}

// Generate unique ID
export const generateId = (): string => {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substring(2);
};

// Safe CSV parser handling quotes and embedded commas/newlines
export function parseCSVString(text: string): { header: string[]; rows: string[][] } {
  const clean = text.replace(/^\ufeff/, '').trim();
  if (!clean) return { header: [], rows: [] };

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return { header: [], rows: [] };
  const header = rows[0].map(h => h.replace(/^"|"$/g, '').trim());
  const dataRows = rows.slice(1);
  return { header, rows: dataRows };
}

// YouTube video title noise cleaner and Artist - Title separator
export function cleanYouTubeTrackTitle(raw: string): { artist: string; title: string; originalRaw: string } {
  const res = cleanCompositeTrack(raw);
  return {
    artist: res.artist === '<unknown>' ? 'Unknown Artist' : res.artist,
    title: res.title,
    originalRaw: raw
  };
}

// Normalize strings for fuzzy comparison and cross-platform deduplication
export function normalizeStringForMatching(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, '') // remove symbols
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Instant offline cultural bucket waterfall:
 * Tier 0 (Cache / User overrides) -> Tier 1 (Unicode Script Histogram) -> Tier 2 (Genre Heuristics) -> Fallback
 */
export function resolveTrackCulturalBucket(artist: string, title: string): {
  bucket: CanonicalBucket;
  country?: string;
  confidence: string;
  sourceDetails?: string;
} {
  // 1. Module 13 cache (pre-seeded 1,341 artists + user localStorage overrides)
  const cached = getCachedClassification(artist);
  if (cached && cached.bucket && cached.bucket !== 'Other') {
    return {
      bucket: cached.bucket,
      country: cached.country,
      confidence: cached.confidence,
      sourceDetails: cached.sourceDetails || 'Module 13 Verified Cache'
    };
  }

  // 2. Unicode script histogram (CJK Han, Kana, Hangul, Devanagari, Arabic, Thai)
  const scriptSig = detectScriptSignature(artist) || detectScriptSignature(title);
  if (scriptSig) {
    return {
      bucket: scriptSig.bucket,
      confidence: 'script',
      sourceDetails: `Script: ${scriptSig.scriptName}`
    };
  }

  // 3. Heuristic patterns for Gospel & Worship
  const lowerArtist = (artist || '').toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  if (
    lowerArtist.includes('worship') || lowerArtist.includes('choir') || lowerArtist.includes('church') ||
    lowerArtist.includes('gospel') || lowerArtist.includes('cityalight') || lowerArtist.includes('elevation') ||
    lowerArtist.includes('hillsong') || lowerArtist.includes('bethel') || lowerArtist.includes('maverick') ||
    lowerArtist.includes('lanre teriba') || lowerArtist.includes('cherubim') ||
    lowerTitle.includes('hallelujah') || lowerTitle.includes('halleluyah') || lowerTitle.includes('oke mimo') ||
    lowerTitle.includes('lehin jesu') || lowerTitle.includes('jesu yio joba') || lowerTitle.includes('apata aiyeraiye') ||
    lowerTitle.includes('iwo ni mo ni')
  ) {
    return { bucket: 'Gospel', confidence: 'heuristic', sourceDetails: 'Worship / Hymn signature' };
  }

  // 4. Heuristic patterns for Instrumental / Lofi / Soundtracks
  if (
    lowerArtist.includes('chat music') || lowerArtist.includes('lofi') || lowerTitle.includes('instrumental') ||
    lowerTitle.includes('piano version') || lowerTitle.includes('soundtrack') || lowerTitle.includes('bgm') ||
    lowerArtist.includes('dmitry krasnoukhov')
  ) {
    return { bucket: 'Instrumental', confidence: 'heuristic', sourceDetails: 'Instrumental / Sound design' };
  }

  // 5. Nigerian / Afrobeats / Highlife
  if (
    lowerArtist.includes('sunny ade') || lowerArtist.includes('show dem camp') || lowerArtist.includes('omah lay') ||
    lowerArtist.includes('adekunle gold') || lowerArtist.includes('wizkid') || lowerArtist.includes('burna boy') ||
    lowerArtist.includes('asake') || lowerArtist.includes('rema') || lowerArtist.includes('davido')
  ) {
    return { bucket: 'Naija', country: 'NG', confidence: 'heuristic', sourceDetails: 'Nigerian Afrobeats / Highlife' };
  }

  // 6. Filipino / OPM
  if (
    lowerArtist.includes('cup of joe') || lowerArtist.includes('ace banzuelo') || lowerArtist.includes('maki') ||
    lowerArtist.includes('ben&ben') || lowerArtist.includes('sb19') || lowerArtist.includes('zack tabudlo')
  ) {
    return { bucket: 'Filipino', country: 'PH', confidence: 'heuristic', sourceDetails: 'OPM / Filipino' };
  }

  // 7. Indian / I-Pop
  if (lowerArtist.includes('outstation') || lowerArtist.includes('arijit') || lowerArtist.includes('prateek kuhad')) {
    return { bucket: 'I-Pop', country: 'IN', confidence: 'heuristic', sourceDetails: 'Indian Indie / I-Pop' };
  }

  // Default to English / Global
  return { bucket: 'English', confidence: 'default', sourceDetails: 'Default English / Global' };
}

// Ingest multiple raw discovery files preserving chronological sequence (sourceOrder)
export function parseDiscoveryFiles(
  files: { name: string; content: string }[]
): TriageTrack[] {
  const rawList: {
    title: string;
    artist: string;
    album: string;
    rawTitle: string;
    source: TriageSource;
    sourceOrder: number;
    sourcePositions?: Record<string, number>;
    listPositions?: Record<string, number>;
    listName?: string;
    isrc?: string;
    spotifyId?: string;
    duration?: string;
    culturalBucket?: CanonicalBucket;
    country?: string;
    confidence?: string;
    sourceDetails?: string;
    filePath?: string;
  }[] = [];

  for (const file of files) {
    let fileOrderCounter = 1; // Per-file/list chronological counter strictly resetting to 1
    const fileNameLower = file.name.toLowerCase();
    const content = file.content.replace(/^\ufeff/, '');

    // 1. M3U / M3U8 Playlist
    if (fileNameLower.endsWith('.m3u') || fileNameLower.endsWith('.m3u8') || content.startsWith('#EXTM3U')) {
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXTINF:')) {
          const parts = line.substring(8).split(',');
          const meta = parts.slice(1).join(',').trim();
          let artist = 'Unknown Artist';
          let title = meta;
          if (meta.includes(' - ')) {
            const spl = meta.split(' - ');
            artist = spl[0].trim();
            title = spl.slice(1).join(' - ').trim();
          }
          const resolved = resolveTrackCulturalBucket(artist, title);
          const currentOrder = fileOrderCounter++;
          rawList.push({
            title,
            artist,
            album: 'Single / Discovery Batch',
            rawTitle: meta,
            source: 'M3U',
            sourceOrder: currentOrder,
            sourcePositions: { 'M3U': currentOrder },
            listPositions: { [file.name]: currentOrder },
            listName: file.name,
            culturalBucket: resolved.bucket,
            country: resolved.country,
            confidence: resolved.confidence,
            sourceDetails: resolved.sourceDetails
          });
        }
      }
      continue;
    }

    // 2. CSV / TSV Parsing
    const parsed = parseCSVString(content);
    if (parsed.header.length > 0) {
      const headerLower = parsed.header.map(h => h.toLowerCase());
      const trackIdx = headerLower.findIndex(h => h.includes('track') || h.includes('title') || h === 'song');
      const artistIdx = headerLower.findIndex(h => h.includes('artist'));
      const albumIdx = headerLower.findIndex(h => h.includes('album'));
      const isrcIdx = headerLower.findIndex(h => h.includes('isrc'));
      const spotifyIdIdx = headerLower.findIndex(h => h.includes('spotify') || h.includes('id'));
      const playlistIdx = headerLower.findIndex(h => h.includes('playlist'));

      const bucketIdx = headerLower.findIndex(h => h.includes('bucket') || h.includes('cultural') || h.includes('language'));
      const countryIdx = headerLower.findIndex(h => h.includes('country'));
      const confidenceIdx = headerLower.findIndex(h => h.includes('confidence'));
      const filePathIdx = headerLower.findIndex(h => h.includes('file_path') || h.includes('filepath') || h.includes('path'));
      const sourceIdx = headerLower.findIndex(h => h === 'source' || h === 'provenance');

      // Determine Default Source
      let inferredSource: TriageSource = 'Custom';
      if (bucketIdx !== -1 || fileNameLower.includes('language') || fileNameLower.includes('cultural') || fileNameLower.includes('cohort')) {
        inferredSource = 'Language Clustered';
      } else if (fileNameLower.includes('youtube') || headerLower.some(h => h.includes('youtube'))) {
        inferredSource = 'YouTube Music';
      } else if (fileNameLower.includes('spotify') || spotifyIdIdx !== -1) {
        inferredSource = 'Spotify';
      } else if (fileNameLower.includes('songs') || headerLower.includes('file_path') || headerLower.includes('play_count')) {
        inferredSource = 'Musicolet';
      }

      for (const row of parsed.rows) {
        const rawTrack = (trackIdx !== -1 && row[trackIdx]) ? row[trackIdx] : '';
        let rawArtist = (artistIdx !== -1 && row[artistIdx]) ? row[artistIdx] : '';
        let rawAlbum = (albumIdx !== -1 && row[albumIdx]) ? row[albumIdx] : '';
        const isrc = (isrcIdx !== -1 && row[isrcIdx]) ? row[isrcIdx] : undefined;
        const spotifyId = (spotifyIdIdx !== -1 && row[spotifyIdIdx]) ? row[spotifyIdIdx] : undefined;
        let culturalBucket = (bucketIdx !== -1 && row[bucketIdx]) ? (row[bucketIdx] as CanonicalBucket) : undefined;
        const country = (countryIdx !== -1 && row[countryIdx]) ? row[countryIdx] : undefined;
        let confidence = (confidenceIdx !== -1 && row[confidenceIdx]) ? row[confidenceIdx] : undefined;
        const filePath = (filePathIdx !== -1 && row[filePathIdx]) ? row[filePathIdx] : undefined;

        if (!rawTrack && !rawArtist) continue;

        // Honor explicit Source / Provenance column if provided
        const explicitSource = (sourceIdx !== -1 && row[sourceIdx]) ? row[sourceIdx].trim() : '';
        let rowSource: TriageSource = inferredSource;
        if (explicitSource) {
          const lower = explicitSource.toLowerCase();
          if (lower.includes('youtube') && lower.includes('spotify')) {
            rowSource = 'YouTube ➔ Spotify Converted';
          } else if (lower.includes('youtube')) {
            rowSource = 'YouTube Music';
          } else if (lower.includes('spotify')) {
            rowSource = 'Spotify';
          } else if (lower.includes('musicolet')) {
            rowSource = 'Musicolet';
          } else if (lower.includes('cluster') || lower.includes('language')) {
            rowSource = 'Language Clustered';
          }
        }

        // Clean composite track (separates YouTube titles, strips noise, CJK brackets, etc.)
        const cleaned = cleanCompositeTrack(rawTrack, rawArtist);
        const artist = cleaned.artist === '<unknown>' ? (rawArtist || 'Unknown Artist') : cleaned.artist;
        const title = cleaned.title || rawTrack;

        if (!rawAlbum || rawAlbum.trim() === '') {
          rawAlbum = 'Single / Discovery Batch';
        }

        let sourceDetails: string | undefined = undefined;
        if (!culturalBucket) {
          const resolved = resolveTrackCulturalBucket(artist, title);
          culturalBucket = resolved.bucket;
          confidence = confidence || resolved.confidence;
          sourceDetails = resolved.sourceDetails;
        }

        const currentOrder = fileOrderCounter++;
        rawList.push({
          title: title || rawTrack,
          artist: artist || 'Unknown Artist',
          album: rawAlbum,
          rawTitle: rawTrack,
          source: rowSource,
          sourceOrder: currentOrder,
          sourcePositions: { [rowSource]: currentOrder },
          listPositions: { [file.name]: currentOrder },
          listName: file.name,
          isrc,
          spotifyId,
          culturalBucket,
          country,
          confidence,
          sourceDetails,
          filePath,
        });
      }
      continue;
    }

    // 3. Plain Text (Title - Artist or Artist - Title)
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.includes(' - ')) {
        const parts = line.split(' - ');
        const artist = parts[0].trim();
        const title = parts.slice(1).join(' - ').trim();
        const resolved = resolveTrackCulturalBucket(artist, title);
        const currentOrder = fileOrderCounter++;
        rawList.push({
          title,
          artist,
          album: 'Single / Discovery Batch',
          rawTitle: line,
          source: 'TXT',
          sourceOrder: currentOrder,
          sourcePositions: { 'TXT': currentOrder },
          listPositions: { [file.name]: currentOrder },
          listName: file.name,
          culturalBucket: resolved.bucket,
          country: resolved.country,
          confidence: resolved.confidence,
          sourceDetails: resolved.sourceDetails
        });
      }
    }
  }

  // Cross-reference & deduplicate across sources while preserving chronological order
  return crossReferenceAndCluster(rawList);
}

// Helper to directly ingest clustered cohorts from Module 13 (Language & Nationality Clustering)
export function importFromLanguageClustering(
  payload: Array<{
    title: string;
    artist: string;
    album?: string;
    culturalBucket?: string;
    country?: string;
    confidence?: string;
    sourceDetails?: string;
    filePath?: string;
  }>
): TriageTrack[] {
  let orderCounter = 1;
  const rawList = payload.map(item => {
    const currentOrder = orderCounter++;
    return {
      title: item.title,
      artist: item.artist,
      album: item.album || 'Single / Discovery Batch',
      rawTitle: `${item.artist} - ${item.title}`,
      source: 'Language Clustered' as TriageSource,
      sourceOrder: currentOrder,
      sourcePositions: { 'Language Clustered': currentOrder },
      listPositions: { 'Module 13 Clustered Intake': currentOrder },
      listName: 'Module 13 Clustered Intake',
      culturalBucket: (item.culturalBucket as CanonicalBucket) || 'Other',
      country: item.country,
      confidence: item.confidence,
      sourceDetails: item.sourceDetails,
      filePath: item.filePath,
    };
  });
  return crossReferenceAndCluster(rawList);
}

/**
 * Hydrate a single TriageTrack from a verified EnrichedSongRecord
 */
export function hydrateTriageTrackFromEnrichedRecord(
  track: TriageTrack,
  rec: EnrichedSongRecord
): TriageTrack {
  const releaseYear = rec.release?.originalReleaseYear || 
    (rec.release?.releaseDate ? parseInt(rec.release.releaseDate.slice(0, 4), 10) : undefined);

  // Derive cover art with Cover Art Archive fallback
  let coverUrl = rec.release?.coverArtFullUrl || rec.release?.coverArtThumbUrl;
  let thumbUrl = rec.release?.coverArtThumbUrl || rec.release?.coverArtFullUrl;
  if (!coverUrl && rec.release?.releaseMbid) {
    coverUrl = `https://coverartarchive.org/release/${rec.release.releaseMbid}/front`;
  }
  if (!thumbUrl && rec.release?.releaseMbid) {
    thumbUrl = `https://coverartarchive.org/release/${rec.release.releaseMbid}/front-250`;
  }

  // Cultural & Language classification (Module 13 Cache is Superior!)
  initClassificationCache();
  const cacheMatch = resolveArtistFromCache(rec, getCachedClassification) || 
                     (track.artist ? getCachedClassification(track.artist) : null);

  let culturalBucket: CanonicalBucket;
  let country: string | undefined = track.country;
  let countryName: string | undefined = track.countryName;
  let confidence: string = track.confidence || 'Database Linked';
  let sourceDetails: string = track.sourceDetails 
    ? (track.sourceDetails.includes('DB') ? track.sourceDetails : `${track.sourceDetails} • DB Linked`) 
    : 'Playlist Haven Database';

  if (cacheMatch && cacheMatch.bucket) {
    culturalBucket = cacheMatch.bucket;
    country = cacheMatch.country || country;
    countryName = cacheMatch.countryName || countryName;
    confidence = cacheMatch.confidence;
    sourceDetails = cacheMatch.sourceDetails || 'Language Clustering Cache (Superior)';
  } else if (track.source === 'Language Clustered' && track.culturalBucket && track.culturalBucket !== 'Other') {
    culturalBucket = track.culturalBucket;
    confidence = track.confidence || 'Language Clustered';
    sourceDetails = track.sourceDetails || 'Clustered Intake';
  } else if (rec.culturalBucket && rec.culturalBucket !== 'Other') {
    culturalBucket = rec.culturalBucket;
    country = rec.artist?.countryCode || country;
    countryName = rec.artist?.countryName || countryName;
    confidence = rec.resolution?.badgeLabel || 'Database Verified';
    sourceDetails = 'Deep Metadata DB';
  } else {
    const fallback = resolveTrackCulturalBucket(track.artist || rec.artist?.name || '', track.title || rec.title || '');
    culturalBucket = fallback.bucket;
    country = fallback.country || country;
    confidence = fallback.confidence;
    sourceDetails = fallback.sourceDetails || 'Heuristic Signature';
  }

  // Ensure attached rec is kept synchronized with the superior bucket and permanently persisted
  if (rec.culturalBucket !== culturalBucket) {
    rec.culturalBucket = culturalBucket;
    rec.updatedAt = Date.now();
    saveEnrichedTrack(rec, true).catch(err => {
      console.warn('[Triage Hydration] Auto-persisting culturalBucket update to IndexedDB failed:', err);
    });
  }

  return {
    ...track,
    // Database canonical names
    title: rec.title || track.title,
    artist: rec.artist?.name || track.artist,
    album: rec.release?.albumTitle || track.album || 'Single / Discovery Batch',
    // Cover art images
    coverArtUrl: coverUrl || track.coverArtUrl,
    coverArtThumbUrl: thumbUrl || track.coverArtThumbUrl,
    // Release timeline
    releaseDate: rec.release?.releaseDate || track.releaseDate,
    releaseYear: releaseYear || track.releaseYear,
    originalReleaseYear: rec.release?.originalReleaseYear || track.originalReleaseYear || releaseYear,
    releaseType: rec.release?.releaseType || track.releaseType,
    // Cultural & Language classification (Module 13 Cache is Authoritative)
    culturalBucket,
    country: country || rec.artist?.countryCode,
    countryName: countryName || rec.artist?.countryName,
    // Genres, tags, aliases
    genres: (rec.genres && rec.genres.length > 0) ? rec.genres : track.genres,
    tags: (rec.tags && rec.tags.length > 0) ? rec.tags.map((x: any) => (x.name || x)) : track.tags,
    artistAliases: (rec.artist?.aliases && rec.artist.aliases.length > 0) 
      ? rec.artist.aliases.map((a: any) => (a.name || a)) 
      : track.artistAliases,
    // Status & provenance
    confidence,
    sourceDetails,
    isrc: (rec.isrcs && rec.isrcs.length > 0) ? rec.isrcs[0] : track.isrc,
    duration: rec.durationFormatted || track.duration,
    // Complete record attachment
    enrichedRecord: rec,
  };
}

/**
 * Authoritative Direct Database Linking & Metadata Hydration
 * Matches an array of TriageTracks directly against PlaylistHavenMetadataDB (enriched_tracks store).
 * Loads and hydrates:
 * - Cover art URLs (Full & Thumbnail, with Cover Art Archive fallback)
 * - Canonical Title, Artist, and Album
 * - Release Date, Release Year, Original Release Year, Release Type
 * - Cultural Bucket (database is authoritative) & Country
 * - Genres, Community Tags, Artist Aliases
 * - Complete Enriched Song Record attachment
 */
export async function linkTracksWithDatabase(
  tracks: TriageTrack[]
): Promise<{ hydratedTracks: TriageTrack[]; matchedCount: number }> {
  if (!tracks || tracks.length === 0) {
    return { hydratedTracks: [], matchedCount: 0 };
  }

  let enrichedList: EnrichedSongRecord[] = [];
  try {
    enrichedList = await getAllEnrichedTracks();
  } catch (err) {
    console.warn('[Database Linker] Failed to load tracks from IndexedDB:', err);
    return { hydratedTracks: tracks, matchedCount: 0 };
  }

  if (!enrichedList || enrichedList.length === 0) {
    return { hydratedTracks: tracks, matchedCount: 0 };
  }

  // 1. Build Multi-Index Maps for O(1) matching
  const exactKeyMap = new Map<string, EnrichedSongRecord>();
  const artistMap = new Map<string, EnrichedSongRecord[]>();

  for (const rec of enrichedList) {
    const artName = rec.artist?.name || rec.queryArtist || '';
    const recTitle = rec.title || rec.queryTitle || '';

    // Index by primary normalized keys
    const k1 = normalizeSongKey(artName, recTitle);
    const k2 = normalizeSongKey(rec.queryArtist, rec.queryTitle);
    const k3 = normalizeSongKey(artName, rec.queryTitle);
    const k4 = normalizeSongKey(rec.queryArtist, rec.title);

    if (k1 && !exactKeyMap.has(k1)) exactKeyMap.set(k1, rec);
    if (k2 && !exactKeyMap.has(k2)) exactKeyMap.set(k2, rec);
    if (k3 && !exactKeyMap.has(k3)) exactKeyMap.set(k3, rec);
    if (k4 && !exactKeyMap.has(k4)) exactKeyMap.set(k4, rec);

    // Index by sanitized/clean terms
    const cleanRec = cleanCompositeTrack(recTitle, artName);
    const kClean = normalizeSongKey(cleanRec.artist, cleanRec.title);
    if (kClean && !exactKeyMap.has(kClean)) exactKeyMap.set(kClean, rec);

    // Index by artist key
    const artKey = normalizeArtistKey(artName);
    if (artKey) {
      const list = artistMap.get(artKey) || [];
      list.push(rec);
      artistMap.set(artKey, list);
    }
    const qArtKey = normalizeArtistKey(rec.queryArtist || '');
    if (qArtKey && qArtKey !== artKey) {
      const list = artistMap.get(qArtKey) || [];
      list.push(rec);
      artistMap.set(qArtKey, list);
    }
  }

  let matchedCount = 0;
  initClassificationCache(true);

  const hydratedTracks = tracks.map(t => {
    // Attempt 1: Direct key match on (t.artist, t.title)
    let rec = exactKeyMap.get(normalizeSongKey(t.artist, t.title));

    // Attempt 2: Direct key match on sanitized terms
    if (!rec) {
      const cleaned = cleanCompositeTrack(t.title, t.artist);
      rec = exactKeyMap.get(normalizeSongKey(cleaned.artist, cleaned.title));
    }

    // Attempt 3: Direct key match using rawTitle if present
    if (!rec && t.rawTitle && t.rawTitle !== t.title) {
      const cleanedRaw = cleanCompositeTrack(t.rawTitle, t.artist);
      rec = exactKeyMap.get(normalizeSongKey(cleanedRaw.artist, cleanedRaw.title));
    }

    // Attempt 4: Search among tracks by the same artist
    if (!rec) {
      const artKey = normalizeArtistKey(t.artist);
      const artistTracks = artistMap.get(artKey);
      if (artistTracks && artistTracks.length > 0) {
        const normTargetTitle = normalizeSongKey('', t.title).replace(/^:::+/, '');
        for (const candidate of artistTracks) {
          const cTitleNorm = normalizeSongKey('', candidate.title || candidate.queryTitle || '').replace(/^:::+/, '');
          if (cTitleNorm && normTargetTitle && cTitleNorm === normTargetTitle) {
            rec = candidate;
            break;
          }
          // Substring / stripped feature match
          if (normTargetTitle && cTitleNorm && (normTargetTitle.includes(cTitleNorm) || cTitleNorm.includes(normTargetTitle))) {
            rec = candidate;
            break;
          }
        }
      }
    }

    if (rec) {
      matchedCount++;
      const originalDbBucket = rec.culturalBucket;
      const hydrated = hydrateTriageTrackFromEnrichedRecord(t, rec);
      // If the superior cultural bucket in hydrated differs from what was stored in the DB record, update IndexedDB!
      if (rec.id && hydrated.culturalBucket && hydrated.culturalBucket !== originalDbBucket) {
        rec.culturalBucket = hydrated.culturalBucket;
        rec.updatedAt = Date.now();
        saveEnrichedTrack(rec, true).catch(err => console.warn('[Database Linker] Sync culturalBucket failed:', err));
      }
      return hydrated;
    }

    // For unmatched tracks, still ensure superior cache is honored
    const dummyRec = { queryArtist: t.artist, title: t.title } as any;
    const cacheFallback = resolveArtistFromCache(dummyRec, getCachedClassification) || getCachedClassification(t.artist);
    if (cacheFallback && cacheFallback.bucket && t.culturalBucket !== cacheFallback.bucket) {
      return {
        ...t,
        culturalBucket: cacheFallback.bucket,
        country: cacheFallback.country || t.country,
        countryName: cacheFallback.countryName || t.countryName,
        confidence: cacheFallback.confidence,
        sourceDetails: cacheFallback.sourceDetails || 'Language Clustering Cache (Superior)'
      };
    }

    return t;
  });

  return { hydratedTracks, matchedCount };
}

// Cross-reference tracks across files and deduplicate while preserving earliest chronological discovery order
export function crossReferenceAndCluster(
  rawTracks: {
    title: string;
    artist: string;
    album: string;
    rawTitle: string;
    source: TriageSource;
    sourceOrder: number;
    sourcePositions?: Record<string, number>;
    listPositions?: Record<string, number>;
    listName?: string;
    isrc?: string;
    spotifyId?: string;
    culturalBucket?: CanonicalBucket;
    country?: string;
    countryName?: string;
    confidence?: string;
    sourceDetails?: string;
    filePath?: string;
    coverArtUrl?: string;
    coverArtThumbUrl?: string;
    releaseDate?: string;
    releaseYear?: number;
    originalReleaseYear?: number;
    releaseType?: string;
    genres?: string[];
    tags?: string[];
    artistAliases?: string[];
    translatedTitle?: string;
    translatedArtist?: string;
    culturalContext?: string;
    enrichedRecord?: any;
  }[]
): TriageTrack[] {
  const unifiedMap = new Map<string, TriageTrack>();

  // Count artist occurrences first for resonance tiering
  const artistFreq = new Map<string, number>();
  for (const t of rawTracks) {
    const normArtist = normalizeStringForMatching(t.artist);
    if (normArtist) {
      artistFreq.set(normArtist, (artistFreq.get(normArtist) || 0) + 1);
    }
  }

  for (const t of rawTracks) {
    const normTitle = normalizeStringForMatching(t.title);
    const normArtist = normalizeStringForMatching(t.artist);
    const key = `${normArtist}___${normTitle}`;

    const freq = artistFreq.get(normArtist) || 1;
    const tier: ResonanceTier = freq >= 4 ? 'high' : freq >= 2 ? 'emerging' : 'probe';

    if (unifiedMap.has(key)) {
      const existing = unifiedMap.get(key)!;
      // Retain earliest chronological order (lowest sourceOrder) for relative sorting
      existing.sourceOrder = Math.min(existing.sourceOrder, t.sourceOrder);

      if (!existing.sources.includes(t.source)) {
        existing.sources.push(t.source);
      }

      // Record per-source sequence position
      if (!existing.sourcePositions) {
        existing.sourcePositions = { [existing.sources[0]]: existing.sourceOrder };
      }
      existing.sourcePositions[t.source] = t.sourceOrder;

      // Record per-list position
      if (t.listPositions) {
        existing.listPositions = {
          ...(existing.listPositions || {}),
          ...t.listPositions,
        };
      } else if (t.listName) {
        existing.listPositions = {
          ...(existing.listPositions || {}),
          [t.listName]: t.sourceOrder,
        };
      }

      if (!existing.isrc && t.isrc) existing.isrc = t.isrc;
      if (!existing.spotifyId && t.spotifyId) existing.spotifyId = t.spotifyId;
      if (t.culturalBucket && (!existing.culturalBucket || existing.culturalBucket === 'Other')) {
        existing.culturalBucket = t.culturalBucket;
      }
      if (t.country && !existing.country) existing.country = t.country;
      if (t.countryName && !existing.countryName) existing.countryName = t.countryName;
      if (t.confidence && !existing.confidence) existing.confidence = t.confidence;
      if (t.sourceDetails && !existing.sourceDetails) existing.sourceDetails = t.sourceDetails;
      if (t.filePath && !existing.filePath) existing.filePath = t.filePath;
      if (existing.album === 'Single / Discovery Batch' && t.album && t.album !== 'Single / Discovery Batch') {
        existing.album = t.album;
      }
      // Metadata inheritance
      if (!existing.coverArtUrl && t.coverArtUrl) existing.coverArtUrl = t.coverArtUrl;
      if (!existing.coverArtThumbUrl && t.coverArtThumbUrl) existing.coverArtThumbUrl = t.coverArtThumbUrl;
      if (!existing.releaseDate && t.releaseDate) existing.releaseDate = t.releaseDate;
      if (!existing.releaseYear && t.releaseYear) existing.releaseYear = t.releaseYear;
      if (!existing.originalReleaseYear && t.originalReleaseYear) existing.originalReleaseYear = t.originalReleaseYear;
      if (!existing.releaseType && t.releaseType) existing.releaseType = t.releaseType;
      if (!existing.genres && t.genres) existing.genres = t.genres;
      if (!existing.tags && t.tags) existing.tags = t.tags;
      if (!existing.artistAliases && t.artistAliases) existing.artistAliases = t.artistAliases;
      if (!existing.translatedTitle && t.translatedTitle) existing.translatedTitle = t.translatedTitle;
      if (!existing.translatedArtist && t.translatedArtist) existing.translatedArtist = t.translatedArtist;
      if (!existing.culturalContext && t.culturalContext) existing.culturalContext = t.culturalContext;
      if (!existing.enrichedRecord && t.enrichedRecord) existing.enrichedRecord = t.enrichedRecord;
    } else {
      unifiedMap.set(key, {
        id: generateId(),
        title: t.title,
        artist: t.artist,
        album: t.album || 'Single / Discovery Batch',
        rawTitle: t.rawTitle,
        sources: [t.source],
        sourceOrder: t.sourceOrder || 1,
        sourcePositions: t.sourcePositions || { [t.source]: t.sourceOrder || 1 },
        listPositions: t.listPositions || (t.listName ? { [t.listName]: t.sourceOrder || 1 } : undefined),
        primaryListName: t.listName,
        isrc: t.isrc,
        spotifyId: t.spotifyId,
        resonanceTier: tier,
        triageStatus: 'inbox',
        downloadPriority: tier === 'high' ? 'immediate' : 'secondary',
        addedAt: new Date().toISOString(),
        culturalBucket: t.culturalBucket || 'Other',
        country: t.country,
        countryName: t.countryName,
        confidence: t.confidence,
        sourceDetails: t.sourceDetails,
        filePath: t.filePath,
        coverArtUrl: t.coverArtUrl,
        coverArtThumbUrl: t.coverArtThumbUrl,
        releaseDate: t.releaseDate,
        releaseYear: t.releaseYear,
        originalReleaseYear: t.originalReleaseYear,
        releaseType: t.releaseType,
        genres: t.genres,
        tags: t.tags,
        artistAliases: t.artistAliases,
        translatedTitle: t.translatedTitle,
        translatedArtist: t.translatedArtist,
        culturalContext: t.culturalContext,
        enrichedRecord: t.enrichedRecord,
      });
    }
  }

  // Calculate true artist track frequencies across deduplicated unique tracks
  const deduplicatedArtistCounts = new Map<string, number>();
  for (const track of unifiedMap.values()) {
    const normArtist = normalizeStringForMatching(track.artist);
    if (normArtist) {
      deduplicatedArtistCounts.set(normArtist, (deduplicatedArtistCounts.get(normArtist) || 0) + 1);
    }
  }

  // Assign accurate resonance tier and download priority based on unique tracks per artist
  for (const track of unifiedMap.values()) {
    const normArtist = normalizeStringForMatching(track.artist);
    const count = (normArtist && deduplicatedArtistCounts.get(normArtist)) || 1;
    const tier: ResonanceTier = count >= 4 ? 'high' : count >= 2 ? 'emerging' : 'probe';
    track.resonanceTier = tier;
    track.downloadPriority = tier === 'high' ? 'immediate' : 'secondary';
  }

  // Strictly sort the unified collection by chronological sourceOrder ascending.
  // Duplicate sourceOrder across different sources (e.g. Spotify #1 and YouTube #1) sort deterministically:
  return Array.from(unifiedMap.values()).sort((a, b) => {
    const orderA = a.sourceOrder ?? 0;
    const orderB = b.sourceOrder ?? 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const sA = a.sources?.[0] || '';
    const sB = b.sources?.[0] || '';
    const cmp = sA.localeCompare(sB);
    if (cmp !== 0) return cmp;
    return (a.title || '').localeCompare(b.title || '');
  });
}

// Build Cultural Bucket Groups (Language & Cultural Partitioning Layer)
export function buildCulturalBucketGroups(
  tracks: TriageTrack[],
  stagedTrackIds: Set<string> = new Set()
): CulturalBucketGroup[] {
  const bucketMap = new Map<CanonicalBucket, TriageTrack[]>();

  for (const t of tracks) {
    const b = (t.culturalBucket || 'Other') as CanonicalBucket;
    if (!bucketMap.has(b)) {
      bucketMap.set(b, []);
    }
    bucketMap.get(b)!.push(t);
  }

  const groups: CulturalBucketGroup[] = [];
  const totalCount = tracks.length;
  const stagedCountTotal = tracks.filter(t => stagedTrackIds.has(t.id)).length;

  for (const [bucket, bTracks] of bucketMap.entries()) {
    // 1. Sort tracks strictly by chronological discovery order (sourceOrder ascending)
    const sortedTracks = [...bTracks].sort((a, b) => {
      const orderA = a.sourceOrder ?? 0;
      const orderB = b.sourceOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      const sA = a.sources?.[0] || '';
      const sB = b.sources?.[0] || '';
      const cmp = sA.localeCompare(sB);
      if (cmp !== 0) return cmp;
      return (a.title || '').localeCompare(b.title || '');
    });

    // 2. Group artists within this bucket
    const artistMap = new Map<string, TriageTrack[]>();
    for (const t of sortedTracks) {
      const art = t.artist || 'Unknown Artist';
      if (!artistMap.has(art)) {
        artistMap.set(art, []);
      }
      artistMap.get(art)!.push(t);
    }

    const artists = Array.from(artistMap.entries()).map(([artist, aTracks]) => {
      const firstSeen = Math.min(...aTracks.map(t => t.sourceOrder ?? 0));
      const count = aTracks.length;
      const tier: ResonanceTier = count >= 4 ? 'high' : count >= 2 ? 'emerging' : 'probe';
      return {
        artist,
        trackCount: count,
        resonanceTier: tier,
        firstSeenOrder: firstSeen,
        tracks: aTracks.sort((x, y) => {
          const oX = x.sourceOrder ?? 0;
          const oY = y.sourceOrder ?? 0;
          if (oX !== oY) return oX - oY;
          return (x.sources?.[0] || '').localeCompare(y.sources?.[0] || '') || (x.title || '').localeCompare(y.title || '');
        })
      };
    }).sort((a, b) => b.trackCount - a.trackCount || a.firstSeenOrder - b.firstSeenOrder);

    const stagedInBucket = sortedTracks.filter(t => stagedTrackIds.has(t.id)).length;
    const metadata = CANONICAL_BUCKETS[bucket] || CANONICAL_BUCKETS['Other'] || {
      name: bucket,
      displayName: bucket,
      colorClass: 'text-slate-400',
      badgeBg: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
      borderClass: 'border-slate-500/40',
      description: 'Cultural / regional classification',
    };

    groups.push({
      bucket,
      metadata,
      trackCount: sortedTracks.length,
      percentageOfTotal: totalCount > 0 ? (sortedTracks.length / totalCount) * 100 : 0,
      tracks: sortedTracks,
      artistCount: artists.length,
      artists,
      stagedCount: stagedInBucket,
      stagedPercentage: stagedCountTotal > 0 ? (stagedInBucket / stagedCountTotal) * 100 : 0
    });
  }

  // Sort groups descending by track count
  return groups.sort((a, b) => b.trackCount - a.trackCount);
}

// Stage a balanced intake cohort across selected cultural buckets in chronological order
export function stageBalancedIntakeCohort(
  tracks: TriageTrack[],
  stagedTrackIds: Set<string>,
  targetPerBucket: number,
  selectedBuckets?: CanonicalBucket[]
): string[] {
  const toStageIds: string[] = [];
  const groups = buildCulturalBucketGroups(tracks, stagedTrackIds);

  for (const group of groups) {
    if (selectedBuckets && selectedBuckets.length > 0 && !selectedBuckets.includes(group.bucket)) {
      continue;
    }
    // Take the top N un-staged tracks in strict chronological order (earliest sourceOrder first)
    const unstaged = group.tracks.filter(t => !stagedTrackIds.has(t.id));
    const slice = unstaged.slice(0, targetPerBucket);
    slice.forEach(t => toStageIds.push(t.id));
  }

  return toStageIds;
}

// Reassign a track's cultural bucket and update permanent cache & database
export function updateTrackCulturalBucket(
  trackId: string,
  newBucket: CanonicalBucket,
  tracks: TriageTrack[],
  updatePermanentCache: boolean = true
): TriageTrack[] {
  let targetArtist = '';
  const updated = tracks.map(t => {
    if (t.id === trackId) {
      targetArtist = t.artist;
      const updatedRecord = t.enrichedRecord ? { ...t.enrichedRecord, culturalBucket: newBucket, updatedAt: Date.now() } : undefined;
      return {
        ...t,
        culturalBucket: newBucket,
        confidence: 'manual',
        sourceDetails: 'Manual user reassignment',
        enrichedRecord: updatedRecord
      };
    }
    return t;
  });

  if (updatePermanentCache && targetArtist) {
    try {
      setManualOverride(targetArtist, newBucket);
      // Immediately overwrite IndexedDB records for this artist
      overwriteArtistCulturalBucketInDB(targetArtist, newBucket).catch(console.warn);
    } catch (e) {
      console.warn('Failed to update permanent classification cache:', e);
    }
  }

  return updated;
}

// Build Artist Clusters (The Resonance Layer)
export function buildArtistClusters(
  tracks: TriageTrack[],
  validatedAlbumsSet: Set<string> = new Set()
): ArtistCluster[] {
  const artistMap = new Map<string, TriageTrack[]>();

  for (const track of tracks) {
    const artist = track.artist.trim() || 'Unknown Artist';
    if (!artistMap.has(artist)) {
      artistMap.set(artist, []);
    }
    artistMap.get(artist)!.push(track);
  }

  const clusters: ArtistCluster[] = [];

  for (const [artist, artistTracks] of artistMap.entries()) {
    // Sort tracks by original playlist discovery sequence
    const sortedArtistTracks = [...artistTracks].sort((a, b) => a.sourceOrder - b.sourceOrder);

    // Albums grouping for this artist
    const albumMap = new Map<string, TriageTrack[]>();
    for (const t of sortedArtistTracks) {
      const album = t.album && t.album !== 'Single / Discovery Batch' ? t.album.trim() : 'Singles / EPs';
      if (!albumMap.has(album)) {
        albumMap.set(album, []);
      }
      albumMap.get(album)!.push(t);
    }

    const albums: ArtistAlbumSummary[] = Array.from(albumMap.entries()).map(([name, alTracks]) => ({
      name,
      trackCount: alTracks.length,
      tracks: alTracks.sort((a, b) => a.sourceOrder - b.sourceOrder),
      isValidated: validatedAlbumsSet.has(`${artist}___${name}`)
    })).sort((a, b) => b.trackCount - a.trackCount);

    const distinctAlbums = albums.filter(a => a.name !== 'Singles / EPs');

    const sourcesSet = new Set<TriageSource>();
    sortedArtistTracks.forEach(t => t.sources.forEach(s => sourcesSet.add(s)));

    const count = sortedArtistTracks.length;
    const tier: ResonanceTier = count >= 4 ? 'high' : count >= 2 ? 'emerging' : 'probe';

    // Cultural Bucket calculation
    const bucketCounts = new Map<CanonicalBucket, number>();
    for (const t of sortedArtistTracks) {
      const b = t.culturalBucket || 'English';
      bucketCounts.set(b, (bucketCounts.get(b) || 0) + 1);
    }
    let primaryCulturalBucket: CanonicalBucket = 'English';
    let maxBucketCount = 0;
    for (const [b, cnt] of bucketCounts.entries()) {
      if (cnt > maxBucketCount) {
        maxBucketCount = cnt;
        primaryCulturalBucket = b;
      }
    }
    const culturalBuckets = Array.from(bucketCounts.keys());

    clusters.push({
      artist,
      trackCount: count,
      tracks: sortedArtistTracks,
      albumCount: distinctAlbums.length,
      albums,
      resonanceTier: tier,
      explorationStatus: 'unexplored',
      sources: Array.from(sourcesSet),
      primaryCulturalBucket,
      culturalBuckets
    });
  }

  // Sort descending by track count, then alphabetically
  return clusters.sort((a, b) => {
    if (b.trackCount !== a.trackCount) return b.trackCount - a.trackCount;
    return a.artist.localeCompare(b.artist);
  });
}

// Build Album Clusters (The Validation Layer)
export function buildAlbumClusters(
  tracks: TriageTrack[],
  validatedAlbumsSet: Set<string> = new Set(),
  candidateThreshold: number = 2
): AlbumCluster[] {
  const albumMap = new Map<string, { album: string; artist: string; tracks: TriageTrack[] }>();

  for (const track of tracks) {
    const album = track.album?.trim();
    if (!album || album === 'Single / Discovery Batch' || album === 'Singles / EPs') continue;

    const artist = track.artist.trim();
    const key = `${artist}___${album}`;

    if (!albumMap.has(key)) {
      albumMap.set(key, { album, artist, tracks: [] });
    }
    albumMap.get(key)!.tracks.push(track);
  }

  const clusters: AlbumCluster[] = [];

  for (const [key, item] of albumMap.entries()) {
    const isValidated = validatedAlbumsSet.has(key);
    const count = item.tracks.length;
    const isCandidate = count >= candidateThreshold;

    // Density score: min(100, count * 25)
    const validationScore = Math.min(100, count * 25);

    clusters.push({
      album: item.album,
      artist: item.artist,
      trackCount: count,
      tracks: item.tracks.sort((a, b) => a.sourceOrder - b.sourceOrder),
      validationStatus: isValidated ? 'validated' : isCandidate ? 'candidate' : 'unvalidated',
      validationScore,
      isCandidate
    });
  }

  // Sort: Validated first, then candidates by track count descending
  return clusters.sort((a, b) => {
    if (a.validationStatus === 'validated' && b.validationStatus !== 'validated') return -1;
    if (b.validationStatus === 'validated' && a.validationStatus !== 'validated') return 1;
    return b.trackCount - a.trackCount;
  });
}

// Compute Statistics for Triage Dashboard
export function computeTriageStats(
  tracks: TriageTrack[],
  artistClusters: ArtistCluster[],
  albumClusters: AlbumCluster[],
  stagedTracks: TriageTrack[]
): TriageStats {
  const sourceCounts: Record<string, number> = {};
  const culturalBucketCounts: Record<string, number> = {};
  let crossPlatformCount = 0;

  for (const t of tracks) {
    if (!t) continue;
    const sList = t.sources || [];
    if (sList.length > 1) {
      crossPlatformCount++;
    }
    for (const s of sList) {
      sourceCounts[s] = (sourceCounts[s] || 0) + 1;
    }
    const b = t.culturalBucket || 'Other';
    culturalBucketCounts[b] = (culturalBucketCounts[b] || 0) + 1;
  }

  const highRes = artistClusters.filter(a => a.resonanceTier === 'high').length;
  const emerging = artistClusters.filter(a => a.resonanceTier === 'emerging').length;
  const singleProbe = artistClusters.filter(a => a.resonanceTier === 'probe').length;

  const albumCandidates = albumClusters.filter(a => a.isCandidate).length;
  const validatedAlbums = albumClusters.filter(a => a.validationStatus === 'validated').length;

  return {
    totalTracks: tracks.length,
    uniqueArtists: artistClusters.length,
    highResonanceArtists: highRes,
    emergingArtists: emerging,
    singleProbeArtists: singleProbe,
    albumClustersCount: albumClusters.length,
    albumCandidatesCount: albumCandidates,
    validatedAlbumsCount: validatedAlbums,
    stagedCount: stagedTracks.length,
    sourceCounts,
    crossPlatformOverlapCount: crossPlatformCount,
    culturalBucketCounts
  };
}

// EXPORT GENERATORS FOR DOWNSTREAM TOOLS & MUSICOLET

// 1. Downloader Query List (.txt) for SpotDL, yt-dlp, Musify batch downloads (sorted by chronological sourceOrder)
export function exportDownloaderQueryList(tracks: TriageTrack[]): string {
  return [...tracks]
    .sort((a, b) => {
      const orderA = a.sourceOrder ?? 0;
      const orderB = b.sourceOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      const sA = a.sources?.[0] || '';
      const sB = b.sources?.[0] || '';
      const cmp = sA.localeCompare(sB);
      if (cmp !== 0) return cmp;
      return (a.title || '').localeCompare(b.title || '');
    })
    .map(t => `${t.artist || 'Unknown'} - ${t.title || 'Untitled'}`)
    .join('\r\n');
}

// 2. TuneMyMusic / Spotify Synchronizer CSV (UTF-8 BOM) with Cultural Bucket & Sequence
export function exportImmersionBatchCSV(tracks: TriageTrack[]): string {
  const header = ['Track name', 'Artist name', 'Album', 'Type', 'Cultural Bucket', 'ISRC', 'Spotify - id', 'Priority', 'Sequence', 'Provenance'];
  const lines = [header.map(h => `"${h}"`).join(',')];

  const sorted = [...tracks].sort((a, b) => {
    const orderA = a.sourceOrder ?? 0;
    const orderB = b.sourceOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const sA = a.sources?.[0] || '';
    const sB = b.sources?.[0] || '';
    const cmp = sA.localeCompare(sB);
    if (cmp !== 0) return cmp;
    return (a.title || '').localeCompare(b.title || '');
  });

  for (const t of sorted) {
    // Format sequence: include per-source positions (e.g. "Spotify #12; YouTube Music #4")
    const seqStr = t.sourcePositions && Object.keys(t.sourcePositions).length > 0
      ? Object.entries(t.sourcePositions).map(([src, pos]) => `${src} #${pos}`).join('; ')
      : `${t.sources?.[0] || 'Track'} #${t.sourceOrder ?? 1}`;

    const row = [
      (t.title || '').replace(/"/g, '""'),
      (t.artist || '').replace(/"/g, '""'),
      (t.album || '').replace(/"/g, '""'),
      'Track',
      t.culturalBucket || 'Other',
      t.isrc || '',
      t.spotifyId || '',
      t.downloadPriority || 'standard',
      seqStr,
      (t.sources || []).join(' + ')
    ];
    lines.push(row.map(cell => `"${cell}"`).join(','));
  }

  // UTF-8 BOM
  return '\uFEFF' + lines.join('\r\n');
}

// 3. Musicolet / Player Ready M3U (#EXTM3U)
export function exportMusicoletM3U(tracks: TriageTrack[], playlistName: string = 'Immersion Staging Batch'): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlistName}`];

  const sorted = [...tracks].sort((a, b) => {
    const orderA = a.sourceOrder ?? 0;
    const orderB = b.sourceOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const sA = a.sources?.[0] || '';
    const sB = b.sources?.[0] || '';
    const cmp = sA.localeCompare(sB);
    if (cmp !== 0) return cmp;
    return (a.title || '').localeCompare(b.title || '');
  });

  for (const t of sorted) {
    lines.push(`#EXTINF:-1,${t.artist || 'Unknown'} - ${t.title || 'Untitled'}`);
    lines.push(`${t.artist || 'Unknown'} - ${t.title || 'Untitled'}.mp3`);
  }

  return lines.join('\r\n');
}

// 4. Standalone Artist Decision CSV (Album, Singlesified, or Deferred)
export function exportArtistDecisionCSV(
  artist: string,
  tracks: TriageTrack[],
  decisionType: 'album' | 'singlesified' | 'deferred'
): string {
  const header = [
    'Track name',
    'Artist name',
    'Album',
    'Type',
    'LanguageBucket',
    'Decision',
    'ISRC',
    'Spotify - id',
    'Source_Sequence',
    'Sources'
  ];
  const lines = [header.join(',')];

  const sorted = [...tracks].sort((a, b) => (a.sourceOrder ?? 0) - (b.sourceOrder ?? 0));

  for (const t of sorted) {
    const seqStr = t.sourcePositions && Object.keys(t.sourcePositions).length > 0
      ? Object.entries(t.sourcePositions).map(([src, pos]) => `${src} #${pos}`).join('; ')
      : `${t.sources?.[0] || 'Track'} #${t.sourceOrder ?? 1}`;

    const decisionLabel = decisionType === 'album'
      ? 'Promoted Album / Compilation'
      : decisionType === 'singlesified'
      ? 'Singlesified Sample'
      : 'Deferred';

    const row = [
      (t.title || '').replace(/"/g, '""'),
      (t.artist || '').replace(/"/g, '""'),
      (t.album || '').replace(/"/g, '""'),
      'Track',
      t.culturalBucket || 'Other',
      decisionLabel,
      t.isrc || '',
      t.spotifyId || '',
      seqStr,
      (t.sources || []).join(' + ')
    ];
    lines.push(row.map(c => `"${c}"`).join(','));
  }

  return '\uFEFF' + lines.join('\r\n');
}

// 5. Compiled Master Decision CSV (Compiled Singlesified, Deferred, or Promoted Albums)
export function exportCompiledTriageCSV(
  tracks: TriageTrack[],
  triageCategory: 'Singlesified Samples' | 'Deferred Tracks' | 'Promoted Albums'
): string {
  const header = [
    'Track name',
    'Artist name',
    'Album',
    'Type',
    'LanguageBucket',
    'TriageCategory',
    'ResonanceTier',
    'ISRC',
    'Spotify - id',
    'Source_Sequence',
    'Sources'
  ];
  const lines = [header.join(',')];

  const sorted = [...tracks].sort((a, b) => {
    const artA = a.artist || '';
    const artB = b.artist || '';
    if (artA !== artB) return artA.localeCompare(artB);
    return (a.sourceOrder ?? 0) - (b.sourceOrder ?? 0);
  });

  for (const t of sorted) {
    const seqStr = t.sourcePositions && Object.keys(t.sourcePositions).length > 0
      ? Object.entries(t.sourcePositions).map(([src, pos]) => `${src} #${pos}`).join('; ')
      : `${t.sources?.[0] || 'Track'} #${t.sourceOrder ?? 1}`;

    const row = [
      (t.title || '').replace(/"/g, '""'),
      (t.artist || '').replace(/"/g, '""'),
      (t.album || '').replace(/"/g, '""'),
      'Track',
      t.culturalBucket || 'Other',
      triageCategory,
      t.resonanceTier,
      t.isrc || '',
      t.spotifyId || '',
      seqStr,
      t.sources.join(' + ')
    ];
    lines.push(row.map(c => `"${c}"`).join(','));
  }

  return '\uFEFF' + lines.join('\r\n');
}

// 4. Archival Curation Markdown Dossier
export function exportCurationDossierMarkdown(
  tracks: TriageTrack[],
  artistClusters: ArtistCluster[],
  albumClusters: AlbumCluster[],
  tasteDossier?: TasteSynthesisDossier
): string {
  const highRes = artistClusters.filter(a => a.resonanceTier === 'high');
  const validatedAlbums = albumClusters.filter(a => a.validationStatus === 'validated');
  const candidates = albumClusters.filter(a => a.isCandidate && a.validationStatus !== 'validated');

  let md = `# 🎵 Discovery Triage & Immersion Dossier\n\n`;
  md += `*Generated by Playlist Haven Experience Engine on ${new Date().toLocaleDateString()}*\n\n`;
  md += `## 📊 Curation Metrics\n`;
  md += `- **Total Discovered Tracks**: ${tracks.length}\n`;
  md += `- **Unique Artists**: ${artistClusters.length}\n`;
  md += `- **High-Resonance Magnet Artists (≥4 tracks)**: ${highRes.length}\n`;
  md += `- **Validated Albums**: ${validatedAlbums.length}\n`;
  md += `- **Album Candidates (≥2 tracks)**: ${candidates.length}\n\n`;

  if (tasteDossier) {
    md += `## 🔮 AI Taste Intelligence Synthesis\n`;
    md += `### ${tasteDossier.headline}\n`;
    md += `${tasteDossier.summary}\n\n`;

    md += `### Sonic Themes\n`;
    tasteDossier.sonicThemes.forEach(th => {
      md += `- **${th.theme}**: ${th.description} *(e.g. ${th.sampleArtists.join(', ')})*\n`;
    });
    md += `\n`;

    if (tasteDossier.recommendedAlbumDives.length > 0) {
      md += `### Recommended Full Album Dives\n`;
      tasteDossier.recommendedAlbumDives.forEach(rec => {
        md += `- **${rec.artist}** — *${rec.album}*: ${rec.reason} [${rec.priority.toUpperCase()}]\n`;
      });
      md += `\n`;
    }
  }

  md += `## 🌟 High-Resonance Magnet Artists\n`;
  highRes.slice(0, 20).forEach(a => {
    md += `### ${a.artist} (${a.trackCount} tracks, ${a.albumCount} albums)\n`;
    a.tracks.forEach(t => {
      md += `- ${t.title} [${t.album}] (${t.sources.join(', ')})\n`;
    });
    md += `\n`;
  });

  if (validatedAlbums.length > 0) {
    md += `## 💿 Validated Albums for Offline Immersion\n`;
    validatedAlbums.forEach(al => {
      md += `- **${al.artist}** — *${al.album}* (${al.trackCount} tracks discovered)\n`;
    });
    md += `\n`;
  }

  return md;
}

// 5. Session Backup JSON
export function exportTriageSessionJSON(
  tracks: TriageTrack[],
  stagedTrackIds: string[],
  validatedAlbumKeys: string[]
): string {
  return JSON.stringify(
    {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tracks,
      stagedTrackIds,
      validatedAlbumKeys
    },
    null,
    2
  );
}

// AI INTELLIGENCE LAYER (Gemini 2.5 Flash / Local LLM)

// Feature 1: Taste Intelligence & Batch Synthesis
export async function synthesizeTasteDossier(
  tracks: TriageTrack[],
  signal?: AbortSignal,
  onProgress?: (msg: string) => void
): Promise<TasteSynthesisDossier> {
  const aiConfig = getAIConfig();
  let apiKey = aiConfig.apiKey;
  if (!apiKey) {
    try {
      // @ts-ignore
      apiKey = import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.VITE_API_KEY || '';
    } catch (e) {}
  }

  const isGemini = aiConfig.provider === 'gemini' || !aiConfig.provider;

  if (!apiKey && isGemini) {
    throw new Error('Gemini API key is required. Please open AI Settings to enter your API key, or use a local OpenAI-compatible endpoint.');
  }

  if (onProgress) onProgress('Synthesizing taste landscape & micro-scenes across discovery batch...');

  // Sample top artists and tracks for the prompt
  const clusters = buildArtistClusters(tracks);
  const topArtists = clusters.slice(0, 30).map(a => ({
    artist: a.artist,
    tracksCount: a.trackCount,
    sampleSongs: a.tracks.slice(0, 4).map(t => t.title),
    sampleAlbums: a.albums.filter(al => al.name !== 'Singles / EPs').slice(0, 3).map(al => al.name)
  }));

  const loneTracks = tracks.filter(t => t.resonanceTier === 'probe').slice(0, 15).map(t => `${t.artist} - ${t.title}`);

  const prompt = `You are an elite music curator, audiophile musicologist, and discographer.
A listener has accumulated a curation discovery library of ${tracks.length} tracks across Spotify and YouTube Music over several months.
They follow three core philosophies in discovering music:
1. Singles: Initial sparks / probes.
2. Artists: When singles pique interest, explore more songs by the artist. Multiple songs mean high resonance.
3. Albums: An album comes ONLY when the artist has been truly validated and trusted.

Here are the listener's top multi-track artists and sample songs:
${JSON.stringify(topArtists, null, 2)}

Here are some lone single probes:
${JSON.stringify(loneTracks, null, 2)}

Analyze this entire discovery dataset and return ONLY a valid JSON object matching this exact schema:
{
  "headline": "A punchy, poetic 1-sentence title describing this discovery collection's aesthetic spirit",
  "summary": "A 2-3 sentence overarching synthesis of what this listener has been gravitating towards across these months",
  "sonicThemes": [
    {
      "theme": "Name of distinct micro-genre or aesthetic scene (e.g. Melancholy Bedroom Folk, CJK Indie Alt-Rock, Modern Choral Worship)",
      "description": "Brief explanation of how this sound manifests in the collection",
      "sampleArtists": ["Artist 1", "Artist 2"]
    }
  ],
  "recommendedAlbumDives": [
    {
      "artist": "Artist from the list with high density or cohesion",
      "album": "The definitive, landmark album of this artist that this user MUST validate next",
      "reason": "Why their current discovered tracks prove they are ready for this full album immersion",
      "priority": "high"
    }
  ],
  "detectedAnomalies": [
    {
      "title": "Song title",
      "artist": "Artist name",
      "observation": "Why this song is an intriguing outlier / anomaly compared to the rest of the collection"
    }
  ]
}

Provide 3 to 4 sonicThemes, 3 to 5 recommendedAlbumDives, and 2 to 3 detectedAnomalies. Return PURE JSON ONLY.`;

  const primaryModel = aiConfig.modelName || 'gemini-2.5-flash';
  const secondaryModel = 'gemini-2.0-flash';

  let rawResponseText = '';

  if (isGemini) {
    const client = new GoogleGenAI({ apiKey });
    const tryGenerate = async (m: string) => {
      return await client.models.generateContent({
        model: m,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
    };

    let response: any;
    try {
      response = await tryGenerate(primaryModel);
    } catch (primaryErr: any) {
      if (primaryModel !== secondaryModel) {
        console.warn(`[TriageEngine] Primary model ${primaryModel} failed (${primaryErr.message}). Failing over to ${secondaryModel}...`);
        response = await tryGenerate(secondaryModel);
      } else {
        throw primaryErr;
      }
    }
    rawResponseText = response.text || '';
  } else {
    // Local OpenAI compatible endpoint
    const res = await fetch(`${aiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model: primaryModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      }),
      signal
    });
    if (!res.ok) {
      throw new Error(`Local LLM responded with status ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    rawResponseText = data.choices?.[0]?.message?.content || '';
  }

  // Parse JSON safely
  let cleanJson = rawResponseText.trim();
  cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleanJson);
    return {
      headline: parsed.headline || 'Eclectic Global Discovery Tapestry',
      summary: parsed.summary || 'A rich multi-genre exploration spanning intimate singer-songwriters, vibrant regional sounds, and ambient acoustic textures.',
      sonicThemes: parsed.sonicThemes || [],
      recommendedAlbumDives: parsed.recommendedAlbumDives || [],
      detectedAnomalies: parsed.detectedAnomalies || [],
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('Failed to parse AI Taste Dossier JSON:', rawResponseText);
    throw new Error('AI returned an invalid JSON response format. Please try again.');
  }
}

// Feature 2: Artist Discography Scout
export async function scoutArtistDiscography(
  artist: string,
  knownTracks: string[],
  signal?: AbortSignal
): Promise<ArtistAIDossier> {
  const aiConfig = getAIConfig();
  let apiKey = aiConfig.apiKey;
  if (!apiKey) {
    try {
      // @ts-ignore
      apiKey = import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.VITE_API_KEY || '';
    } catch (e) {}
  }

  const isGemini = aiConfig.provider === 'gemini' || !aiConfig.provider;

  if (!apiKey && isGemini) {
    throw new Error('Gemini API key is required. Please configure it in AI Settings.');
  }

  const prompt = `You are a master musicologist and discography scout.
The listener has saved these songs by "${artist}":
${JSON.stringify(knownTracks)}

The listener wants to know whether this artist is best appreciated as a "Curated Singles Artist" or if they have cohesive, masterpiece albums worthy of "Full Album Validation & Immersion".

Respond ONLY with a valid JSON object matching this exact schema:
{
  "artist": "${artist}",
  "signatureStyle": "1-2 sentence description of their signature sonic fingerprint and genre niche",
  "regionalOrigin": "Country / cultural music roots (e.g. Taiwan, Nigeria, UK, Japan, Ireland)",
  "landmarkAlbums": [
    {
      "title": "Album Title",
      "year": "YYYY",
      "importance": "Why this album is essential, and how it connects to the tracks the user already loves"
    }
  ],
  "discographyVerdict": "Album Artist" | "Singles Specialist" | "Hybrid",
  "verdictRationale": "A 2-sentence candid audiophile recommendation on whether to download full albums or stick to curated singles",
  "recommendedNextTracks": ["Title 1", "Title 2", "Title 3"]
}

Provide 2 to 3 landmarkAlbums and 3 recommendedNextTracks. Return PURE JSON ONLY.`;

  const primaryModel = aiConfig.modelName || 'gemini-2.5-flash';
  const secondaryModel = 'gemini-2.0-flash';

  let rawResponseText = '';

  if (isGemini) {
    const client = new GoogleGenAI({ apiKey });
    const tryGenerate = async (m: string) => {
      return await client.models.generateContent({
        model: m,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
    };

    let response: any;
    try {
      response = await tryGenerate(primaryModel);
    } catch (primaryErr: any) {
      if (primaryModel !== secondaryModel) {
        console.warn(`[TriageEngine] Primary model ${primaryModel} failed (${primaryErr.message}). Failing over to ${secondaryModel}...`);
        response = await tryGenerate(secondaryModel);
      } else {
        throw primaryErr;
      }
    }
    rawResponseText = response.text || '';
  } else {
    const res = await fetch(`${aiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model: primaryModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      }),
      signal
    });
    if (!res.ok) {
      throw new Error(`Local LLM error: ${res.statusText}`);
    }
    const data = await res.json();
    rawResponseText = data.choices?.[0]?.message?.content || '';
  }

  let cleanJson = rawResponseText.trim();
  cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleanJson);
    return {
      artist,
      signatureStyle: parsed.signatureStyle || 'Unique melodic songwriting and distinct vocal production.',
      regionalOrigin: parsed.regionalOrigin || 'Global',
      landmarkAlbums: parsed.landmarkAlbums || [],
      discographyVerdict: parsed.discographyVerdict || 'Hybrid',
      verdictRationale: parsed.verdictRationale || 'Both their singles and longer formats show strong artistic vision.',
      recommendedNextTracks: parsed.recommendedNextTracks || [],
      scoutedAt: new Date().toISOString()
    };
  } catch (e) {
    console.error('Failed to parse Artist AIDossier JSON:', rawResponseText);
    throw new Error('AI returned an invalid JSON response format for the artist.');
  }
}

// =========================================================================
// 15. Crystallized Baseline & Homeostasis Engine (Singles Probe Intelligence)
// =========================================================================

export interface CrystallizedChoiceTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  culturalBucket: CanonicalBucket;
  decisionType: 'album' | 'single';
  sourceOrder?: number;
  sources?: TriageSource[];
  isrc?: string;
  spotifyId?: string;
  fileName?: string;
}

export interface CrystallizedHomeostasisStats {
  totalTracks: number;
  albumTracksCount: number;
  singleProbesCount: number;
  bucketCounts: Record<string, number>;
  bucketPercentages: Record<string, number>;
  deficitBuckets: { bucket: CanonicalBucket; count: number; percentage: number; deficitDeficit: number }[];
}

/**
 * Parse an uploaded CSV of prior definite choices (albums and singles).
 * Recognizes Playlist Haven exports (Album intake, Singlesified, Compiled)
 * as well as generic Spotify/YTM/Musicolet exports.
 */
export function parseDefiniteChoicesCSV(
  content: string,
  fileName: string
): CrystallizedChoiceTrack[] {
  const cleanContent = content.replace(/^\ufeff/, '');
  const parsed = parseCSVString(cleanContent);
  if (parsed.header.length === 0 || parsed.rows.length === 0) return [];

  const headerLower = parsed.header.map(h => h.toLowerCase());
  const trackIdx = headerLower.findIndex(h => h.includes('track') || h.includes('title') || h === 'song');
  const artistIdx = headerLower.findIndex(h => h.includes('artist') || h === 'performer');
  const albumIdx = headerLower.findIndex(h => h.includes('album') || h.includes('collection'));
  const bucketIdx = headerLower.findIndex(h => h.includes('bucket') || h.includes('cultural') || h.includes('language'));
  const decisionIdx = headerLower.findIndex(h => h.includes('decision') || h.includes('triagecategory') || h === 'category' || h === 'type');
  const isrcIdx = headerLower.findIndex(h => h.includes('isrc'));
  const spotifyIdIdx = headerLower.findIndex(h => h.includes('spotify') || h.includes('id'));
  const sourceSeqIdx = headerLower.findIndex(h => h.includes('sequence') || h.includes('source_sequence') || h === 'seq');
  const sourcesIdx = headerLower.findIndex(h => h === 'sources' || h === 'source');

  const fileNameLower = fileName.toLowerCase();
  const fileImpliesAlbum = fileNameLower.includes('album') || fileNameLower.includes('collection') || fileNameLower.includes('discography');
  const fileImpliesSingle = fileNameLower.includes('single') || fileNameLower.includes('probe');

  const results: CrystallizedChoiceTrack[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rawTrack = (trackIdx !== -1 && row[trackIdx]) ? row[trackIdx].trim() : '';
    let rawArtist = (artistIdx !== -1 && row[artistIdx]) ? row[artistIdx].trim() : '';
    let rawAlbum = (albumIdx !== -1 && row[albumIdx]) ? row[albumIdx].trim() : '';
    const rawDecision = (decisionIdx !== -1 && row[decisionIdx]) ? row[decisionIdx].toLowerCase().trim() : '';
    const rawBucket = (bucketIdx !== -1 && row[bucketIdx]) ? row[bucketIdx].trim() : '';
    const isrc = (isrcIdx !== -1 && row[isrcIdx]) ? row[isrcIdx].trim() : undefined;
    const spotifyId = (spotifyIdIdx !== -1 && row[spotifyIdIdx]) ? row[spotifyIdIdx].trim() : undefined;
    const rawSeq = (sourceSeqIdx !== -1 && row[sourceSeqIdx]) ? row[sourceSeqIdx].trim() : '';
    const rawSources = (sourcesIdx !== -1 && row[sourcesIdx]) ? row[sourcesIdx].trim() : '';

    if (!rawTrack && !rawArtist) continue;

    // All definite choices uploaded in Discovery Triage are previously organized tracks from album and artist collections triage
    const decisionType: 'album' | 'single' = 'album';

    // Determine Cultural Bucket
    let canonicalBucket: CanonicalBucket = 'English';
    if (rawBucket && CANONICAL_BUCKETS[rawBucket as CanonicalBucket]) {
      canonicalBucket = rawBucket as CanonicalBucket;
    } else {
      canonicalBucket = resolveTrackCulturalBucket(rawArtist || 'Unknown', rawTrack || 'Unknown').bucket;
    }

    // Sequence parsing
    let seqOrder = i + 1;
    const seqMatch = rawSeq.match(/#(\d+)/);
    if (seqMatch) {
      seqOrder = parseInt(seqMatch[1], 10);
    }

    const sources: TriageSource[] = [];
    if (rawSources.includes('Spotify')) sources.push('Spotify');
    if (rawSources.includes('YouTube') || rawSources.includes('YTM')) sources.push('YouTube Music');
    if (sources.length === 0) sources.push('Custom');

    results.push({
      id: `crystallized_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      title: rawTrack || 'Untitled Track',
      artist: rawArtist || 'Unknown Artist',
      album: rawAlbum || (decisionType === 'album' ? 'Promoted Album Collection' : 'Single Choice'),
      culturalBucket: canonicalBucket,
      decisionType,
      sourceOrder: seqOrder,
      sources,
      isrc,
      spotifyId,
      fileName
    });
  }

  return results;
}

/**
 * Compute real-time cultural homeostasis statistics across crystallized decisions
 * and determine which cultural traditions suffer from representation deficits.
 */
export function computeCrystallizedHomeostasis(
  crystallizedTracks: CrystallizedChoiceTrack[],
  totalIntakeCandidates: number = 0
): CrystallizedHomeostasisStats {
  const bucketCounts: Record<string, number> = {};
  let albumTracksCount = 0;
  let singleProbesCount = 0;

  for (const t of crystallizedTracks) {
    bucketCounts[t.culturalBucket] = (bucketCounts[t.culturalBucket] || 0) + 1;
    if (t.decisionType === 'album') albumTracksCount++;
    else singleProbesCount++;
  }

  const total = crystallizedTracks.length;
  const bucketPercentages: Record<string, number> = {};

  if (total > 0) {
    for (const [b, count] of Object.entries(bucketCounts)) {
      bucketPercentages[b] = (count / total) * 100;
    }
  }

  const activeBucketNames = Object.keys(CANONICAL_BUCKETS) as CanonicalBucket[];
  const deficitBuckets: { bucket: CanonicalBucket; count: number; percentage: number; deficitDeficit: number }[] = [];

  for (const b of activeBucketNames) {
    const count = bucketCounts[b] || 0;
    const pct = bucketPercentages[b] || 0;
    // If a bucket has fewer than 2 selections or less than 12% representation in a non-trivial baseline
    if (total >= 4 && pct < 12) {
      deficitBuckets.push({
        bucket: b,
        count,
        percentage: pct,
        deficitDeficit: Math.max(1, Math.round((0.15 * total) - count))
      });
    }
  }

  // Sort deficit buckets by most urgent need
  deficitBuckets.sort((a, b) => a.count - b.count);

  return {
    totalTracks: total,
    albumTracksCount,
    singleProbesCount,
    bucketCounts,
    bucketPercentages,
    deficitBuckets
  };
}

// =========================================================================
// RELEASE ERA HELPERS (Classics Hunter)
// =========================================================================
export type ReleaseEraKey = 'all' | 'classics' | '90s' | '2000s' | '2010s' | '2020s';

export interface ReleaseEraOption {
  key: ReleaseEraKey;
  label: string;
  sublabel: string;
  filterFn: (year?: number) => boolean;
}

export const RELEASE_ERA_OPTIONS: ReleaseEraOption[] = [
  { key: 'all', label: 'All Eras', sublabel: 'All Releases', filterFn: () => true },
  { key: 'classics', label: 'Classics (< 1990)', sublabel: '70s, 80s & Vintage', filterFn: (y) => y !== undefined && y > 0 && y < 1990 },
  { key: '90s', label: '90s (1990–1999)', sublabel: 'Golden Era', filterFn: (y) => y !== undefined && y >= 1990 && y <= 1999 },
  { key: '2000s', label: '2000s (2000–2009)', sublabel: 'Millennium', filterFn: (y) => y !== undefined && y >= 2000 && y <= 2009 },
  { key: '2010s', label: '2010s (2010–2019)', sublabel: 'Streaming Dawn', filterFn: (y) => y !== undefined && y >= 2010 && y <= 2019 },
  { key: '2020s', label: '2020s (2020+)', sublabel: 'Contemporary', filterFn: (y) => y !== undefined && y >= 2020 },
];

export function getTrackEraBadge(year?: number): { label: string; color: string } | null {
  if (!year || year <= 0) return null;
  if (year < 1980) return { label: `${year} · 70s Classic`, color: 'bg-amber-950/80 text-amber-300 border-amber-500/40' };
  if (year < 1990) return { label: `${year} · 80s Classic`, color: 'bg-amber-900/80 text-amber-200 border-amber-500/40' };
  if (year < 2000) return { label: `${year} · 90s`, color: 'bg-purple-950/80 text-purple-300 border-purple-500/40' };
  if (year < 2010) return { label: `${year} · 2000s`, color: 'bg-blue-950/80 text-blue-300 border-blue-500/40' };
  if (year < 2020) return { label: `${year} · 2010s`, color: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40' };
  return { label: `${year} · Modern`, color: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' };
}

// =========================================================================
// AI TRANSLATION & CULTURAL CONTEXT ENGINE
// =========================================================================
export interface TrackTranslationResult {
  trackKey: string;
  originalArtist: string;
  originalTitle: string;
  romanizedArtist?: string;
  romanizedTitle?: string;
  translatedTitle?: string;
  culturalContext?: string;
  detectedLanguage?: string;
  timestamp: number;
}

export interface EffectiveTranslation {
  romanizedTitle?: string;
  translatedTitle?: string;
  romanizedArtist?: string;
  translatedArtist?: string;
  culturalContext?: string;
  detectedLanguage?: string;
  hasTranslation: boolean;
}

export function getEffectiveTrackTranslation(
  track: { 
    artist: string; 
    title: string; 
    translatedTitle?: string; 
    translatedArtist?: string; 
    culturalContext?: string; 
    artistAliases?: string[]; 
    enrichedRecord?: any 
  },
  translationsMap: Record<string, TrackTranslationResult>
): EffectiveTranslation {
  const normKey = `${(track.artist || '').trim().toLowerCase()}:::${(track.title || '').trim().toLowerCase()}`;
  let trans = translationsMap[normKey];

  if (!trans && track.enrichedRecord) {
    const qArtist = track.enrichedRecord.queryArtist;
    const qTitle = track.enrichedRecord.queryTitle;
    if (qArtist && qTitle) {
      const qKey = `${qArtist.trim().toLowerCase()}:::${qTitle.trim().toLowerCase()}`;
      trans = translationsMap[qKey];
    }
  }

  const romanizedTitle = trans?.romanizedTitle || track.translatedTitle;
  const translatedTitle = trans?.translatedTitle;
  const romanizedArtist = trans?.romanizedArtist || trans?.translatedArtist || track.translatedArtist || track.artistAliases?.[0];
  const culturalContext = trans?.culturalContext || track.culturalContext;
  const detectedLanguage = trans?.detectedLanguage;

  const hasTranslation = Boolean(
    (romanizedTitle && romanizedTitle.toLowerCase().trim() !== track.title.toLowerCase().trim()) ||
    (translatedTitle && translatedTitle.toLowerCase().trim() !== track.title.toLowerCase().trim()) ||
    (romanizedArtist && romanizedArtist.toLowerCase().trim() !== track.artist.toLowerCase().trim()) ||
    culturalContext
  );

  return {
    romanizedTitle,
    translatedTitle,
    romanizedArtist,
    translatedArtist: trans?.translatedArtist || track.translatedArtist,
    culturalContext,
    detectedLanguage,
    hasTranslation,
  };
}

const AI_TRANSLATION_CACHE_KEY = 'playlist_haven_ai_translations';

export function getCachedTranslations(): Record<string, TrackTranslationResult> {
  try {
    const raw = localStorage.getItem(AI_TRANSLATION_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const cleaned: Record<string, TrackTranslationResult> = {};
    let hasDirty = false;
    for (const [k, v] of Object.entries(parsed)) {
      const item = v as TrackTranslationResult;
      // Strictly require at least one real translation, romanization, or cultural insight
      if (item && (
        (item.translatedTitle && item.translatedTitle.trim()) || 
        (item.romanizedTitle && item.romanizedTitle.trim()) || 
        (item.romanizedArtist && item.romanizedArtist.trim()) || 
        (item.culturalContext && item.culturalContext.trim())
      )) {
        cleaned[k] = item;
      } else {
        hasDirty = true;
      }
    }
    if (hasDirty) {
      localStorage.setItem(AI_TRANSLATION_CACHE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch (e) {
    return {};
  }
}

export function saveCachedTranslations(newEntries: Record<string, TrackTranslationResult>): void {
  try {
    const existing = getCachedTranslations();
    const validOnly: Record<string, TrackTranslationResult> = {};
    for (const [k, v] of Object.entries(newEntries)) {
      if (v && (
        (v.translatedTitle && v.translatedTitle.trim()) || 
        (v.romanizedTitle && v.romanizedTitle.trim()) || 
        (v.romanizedArtist && v.romanizedArtist.trim()) || 
        (v.culturalContext && v.culturalContext.trim())
      )) {
        validOnly[k] = v;
      }
    }
    const merged = { ...existing, ...validOnly };
    localStorage.setItem(AI_TRANSLATION_CACHE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn('Failed to cache AI translations to localStorage', e);
  }
}

/**
 * Single Track AI Translation
 */
export async function translateSingleTrackWithAI(
  artist: string,
  title: string,
  culturalBucket?: string,
  signal?: AbortSignal
): Promise<TrackTranslationResult> {
  const normKey = `${(artist || '').trim().toLowerCase()}:::${(title || '').trim().toLowerCase()}`;
  const cache = getCachedTranslations();
  if (cache[normKey] && (cache[normKey].translatedTitle || cache[normKey].romanizedTitle || cache[normKey].culturalContext)) {
    return cache[normKey];
  }

  const results = await batchTranslateTracksWithAI([{ artist, title, culturalBucket }], signal);
  if (results[normKey]) return results[normKey];

  throw new Error(`Could not generate translation for "${title}" by "${artist}". Check your Gemini API key.`);
}

/**
 * Batch AI Translation for filtered results
 */
export async function batchTranslateTracksWithAI(
  items: { artist: string; title: string; culturalBucket?: string }[],
  signal?: AbortSignal,
  onProgress?: (processed: number, total: number) => void
): Promise<Record<string, TrackTranslationResult>> {
  const cache = getCachedTranslations();
  const resultMap: Record<string, TrackTranslationResult> = {};
  const needed: { idx: number; artist: string; title: string; culturalBucket?: string; key: string }[] = [];

  items.forEach((item, idx) => {
    const key = `${(item.artist || '').trim().toLowerCase()}:::${(item.title || '').trim().toLowerCase()}`;
    const cached = cache[key];
    if (cached && (cached.translatedTitle || cached.romanizedTitle || cached.romanizedArtist)) {
      resultMap[key] = cached;
    } else {
      needed.push({ idx, artist: item.artist, title: item.title, culturalBucket: item.culturalBucket, key });
    }
  });

  if (needed.length === 0) {
    return resultMap;
  }

  const aiConfig = getAIConfig();
  let apiKey = aiConfig.apiKey?.trim() || '';
  if (!apiKey) {
    try {
      const procKey = typeof process !== 'undefined' && process.env ? (process.env.API_KEY || process.env.GEMINI_API_KEY) : '';
      if (procKey && procKey.trim()) apiKey = procKey.trim();
    } catch (e) {}
  }
  if (!apiKey) {
    try {
      // @ts-ignore
      const viteKey = import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.VITE_API_KEY || '';
      if (viteKey && viteKey.trim()) apiKey = viteKey.trim();
    } catch (e) {}
  }

  const isGemini = aiConfig.provider === 'gemini' || !aiConfig.provider;
  if (!apiKey && isGemini) {
    throw new Error('Gemini API key is required for AI translation. Please add your key in AI Settings (top-right gear icon).');
  }

  const client = isGemini ? new GoogleGenAI({ apiKey }) : null;
  const primaryModel = aiConfig.modelName || 'gemini-2.5-flash';
  const secondaryModel = 'gemini-2.0-flash';

  // Process in chunks of 20
  const CHUNK_SIZE = 20;
  for (let i = 0; i < needed.length; i += CHUNK_SIZE) {
    if (signal?.aborted) break;
    const chunk = needed.slice(i, i + CHUNK_SIZE);

    const promptPayload = chunk.map((c, cIdx) => ({
      id: cIdx,
      artist: c.artist,
      title: c.title,
      culturalBucket: c.culturalBucket || 'Unknown'
    }));

    const prompt = `You are a master multilingual musicologist and linguist.
Translate and provide romanization and concise cultural context for these tracks.
If an artist or title is already in English, provide an accurate clean version and musical context.

Input Tracks:
${JSON.stringify(promptPayload, null, 2)}

Return a strict JSON object with this exact structure:
{
  "translations": [
    {
      "id": 0,
      "romanizedArtist": "Romanized name or English stage name",
      "romanizedTitle": "Romanized song title (e.g. Romaji, Pinyin, RTGS)",
      "translatedTitle": "English translation of song title (e.g. 'The Moon Represents My Heart')",
      "culturalContext": "1 sentence describing the song's musical style, era, vibe, or cultural significance",
      "detectedLanguage": "e.g. Japanese, Mandarin, Thai, Yoruba, Vietnamese"
    }
  ]
}
Return JSON ONLY. No markdown wrappers.`;

    try {
      let rawText = '';
      if (isGemini && client) {
        const tryCall = async (m: string) => {
          return await client.models.generateContent({
            model: m,
            contents: prompt,
            config: { responseMimeType: 'application/json' }
          });
        };
        try {
          const res = await tryCall(primaryModel);
          rawText = res.text || '';
        } catch (err: any) {
          if (primaryModel !== secondaryModel) {
            console.warn(`[TranslateEngine] Model ${primaryModel} failed. Failing over to ${secondaryModel}...`);
            const res = await tryCall(secondaryModel);
            rawText = res.text || '';
          } else {
            throw err;
          }
        }
      } else {
        const res = await fetch(`${aiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            model: primaryModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
          }),
          signal
        });
        const data = await res.json();
        rawText = data.choices?.[0]?.message?.content || '';
      }

      let cleanJson = rawText.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      const list: any[] = parsed.translations || [];

      const newBatchCache: Record<string, TrackTranslationResult> = {};
      list.forEach(t => {
        const matchingChunkItem = chunk[t.id];
        if (matchingChunkItem) {
          const res: TrackTranslationResult = {
            trackKey: matchingChunkItem.key,
            originalArtist: matchingChunkItem.artist,
            originalTitle: matchingChunkItem.title,
            romanizedArtist: t.romanizedArtist,
            romanizedTitle: t.romanizedTitle,
            translatedTitle: t.translatedTitle,
            culturalContext: t.culturalContext,
            detectedLanguage: t.detectedLanguage,
            timestamp: Date.now()
          };
          resultMap[matchingChunkItem.key] = res;
          newBatchCache[matchingChunkItem.key] = res;
        }
      });

      saveCachedTranslations(newBatchCache);
      onProgress?.(Math.min(i + CHUNK_SIZE, needed.length), needed.length);
    } catch (chunkErr: any) {
      console.error('[TranslateEngine] Chunk translation error:', chunkErr);
      throw new Error(`AI Translation chunk failed: ${chunkErr?.message || 'Gemini API call failed'}`);
    }
  }

  return resultMap;
}
