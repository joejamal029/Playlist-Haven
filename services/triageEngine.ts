import { getAIConfig, AIConfig } from './visionEngine';
import { GoogleGenAI } from '@google/genai';
import { cleanCompositeTrack } from './playlistSanitizer';
import {
  type CanonicalBucket,
  CANONICAL_BUCKETS,
  type BucketMetadata,
  getCachedClassification,
  detectScriptSignature,
  setManualOverride
} from './classificationEngine';

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
  confidence?: string;
  sourceDetails?: string;
  filePath?: string;
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
    confidence?: string;
    sourceDetails?: string;
    filePath?: string;
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
      if (t.confidence && !existing.confidence) existing.confidence = t.confidence;
      if (t.sourceDetails && !existing.sourceDetails) existing.sourceDetails = t.sourceDetails;
      if (t.filePath && !existing.filePath) existing.filePath = t.filePath;
      if (existing.album === 'Single / Discovery Batch' && t.album && t.album !== 'Single / Discovery Batch') {
        existing.album = t.album;
      }
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
        confidence: t.confidence,
        sourceDetails: t.sourceDetails,
        filePath: t.filePath,
      });
    }
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

// Reassign a track's cultural bucket and update permanent cache
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
      return {
        ...t,
        culturalBucket: newBucket,
        confidence: 'manual',
        sourceDetails: 'Manual user reassignment'
      };
    }
    return t;
  });

  if (updatePermanentCache && targetArtist) {
    try {
      setManualOverride(targetArtist, newBucket);
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
