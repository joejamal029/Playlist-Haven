import { EnrichedSongRecord } from './metadataEnrichmentTypes';
import { sanitizeSongQuery } from './songQuerySanitizer';
import { normalizeSongKey, saveEnrichedTrack, getEnrichedTrack } from './metadataDb';
import { 
  CanonicalBucket, 
  getCachedClassification, 
  setCachedClassification, 
  detectScriptSignature,
  normalizeArtistKey 
} from './classificationEngine';

interface ITunesTrackResult {
  trackId?: number;
  artistId?: number;
  artistName: string;
  trackName: string;
  collectionName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
  artistViewUrl?: string;
  country?: string;
  isrc?: string;
}

/**
 * Map iTunes primary genre names to Playlist Haven's 20 canonical cultural buckets
 */
function mapITunesGenreToBucket(genre: string, artistName: string, trackTitle: string): CanonicalBucket {
  const g = (genre || '').toLowerCase().trim();

  if (g.includes('j-pop') || g.includes('anime') || g.includes('kayokyoku') || g.includes('japanese')) {
    return 'J-Pop';
  }
  if (g.includes('k-pop') || g.includes('korean')) {
    return 'K-Pop';
  }
  if (g.includes('c-pop') || g.includes('mandopop') || g.includes('cantopop') || g.includes('chinese')) {
    return 'C-Pop';
  }
  if (g.includes('gospel') || g.includes('christian') || g.includes('praise') || g.includes('worship')) {
    return 'Gospel';
  }
  if (g.includes('afro-pop') || g.includes('afrobeats') || g.includes('naija')) {
    return 'Naija';
  }
  if (g.includes('african') || g.includes('highlife') || g.includes('amapiano') || g.includes('bongo flava')) {
    return 'African';
  }
  if (g.includes('latin') || g.includes('reggaeton') || g.includes('salsa') || g.includes('bachata') || g.includes('música mexicana')) {
    return 'Latina';
  }
  if (g.includes('filipino') || g.includes('opm') || g.includes('pinoy')) {
    return 'Filipino';
  }
  if (g.includes('thai')) {
    return 'Thai';
  }
  if (g.includes('vietnamese') || g.includes('v-pop')) {
    return 'Vietnamese';
  }
  if (g.includes('german') || g.includes('schlager')) {
    return 'German';
  }
  if (g.includes('french') || g.includes('chanson')) {
    return 'Français';
  }
  if (g.includes('italian')) {
    return 'Italian';
  }
  if (g.includes('portuguese') || g.includes('fado') || g.includes('bossa nova') || g.includes('samba')) {
    return 'Portuguese';
  }
  if (g.includes('soundtrack') || g.includes('score') || g.includes('instrumental') || g.includes('classical') || g.includes('new age')) {
    return 'Instrumental';
  }

  // Script signature fallback
  const scriptSig = detectScriptSignature(`${trackTitle} ${artistName}`);
  if (scriptSig && scriptSig.bucket !== 'Other') {
    return scriptSig.bucket;
  }

  return 'Other';
}

/**
 * Compute string similarity (Levenshtein-based token overlap)
 */
function computeStringMatchScore(query: string, candidate: string): number {
  const normQ = (query || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const normC = (candidate || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  if (normQ === normC) return 100;
  if (normC.includes(normQ) || normQ.includes(normC)) return 85;

  const qTokens = new Set(normQ.split(' ').filter(Boolean));
  const cTokens = new Set(normC.split(' ').filter(Boolean));
  if (qTokens.size === 0 || cTokens.size === 0) return 0;

  let intersection = 0;
  for (const t of qTokens) {
    if (cTokens.has(t)) intersection++;
  }
  const dice = (2 * intersection) / (qTokens.size + cTokens.size);
  return Math.round(dice * 100);
}

/**
 * Query Apple iTunes Search API as a public, zero-key secondary fallback
 * when MusicBrainz catalog has no match.
 */
export async function queryITunesRecording(
  artist: string,
  title: string,
  album?: string,
  path?: string,
  signal?: AbortSignal
): Promise<EnrichedSongRecord | null> {
  const { cleanArtist, cleanTitle, cleanAlbum } = sanitizeSongQuery(artist, title, album);

  const queryTerms = [
    `${cleanArtist} ${cleanTitle}`,
    `${artist} ${title}`
  ];

  for (const query of queryTerms) {
    if (signal?.aborted) break;

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`;
      const response = await fetch(url, { signal });
      if (!response.ok) continue;

      const data = await response.json();
      const results: ITunesTrackResult[] = data.results || [];
      if (results.length === 0) continue;

      // Find the best matching candidate
      let bestItem: ITunesTrackResult | null = null;
      let highestScore = 0;

      for (const item of results) {
        const artistScore = Math.max(
          computeStringMatchScore(cleanArtist, item.artistName),
          computeStringMatchScore(artist, item.artistName)
        );
        const titleScore = Math.max(
          computeStringMatchScore(cleanTitle, item.trackName),
          computeStringMatchScore(title, item.trackName)
        );

        const totalScore = Math.round((artistScore * 0.5) + (titleScore * 0.5));
        if (totalScore > highestScore) {
          highestScore = totalScore;
          bestItem = item;
        }
      }

      // We require at least 50% match score to prevent false positives
      if (!bestItem || highestScore < 50) continue;

      const now = Date.now();
      const releaseYear = bestItem.releaseDate ? parseInt(bestItem.releaseDate.slice(0, 4), 10) : undefined;
      const releaseDate = bestItem.releaseDate ? bestItem.releaseDate.slice(0, 10) : undefined;

      // Cover Art Resolution (100x100 -> 600x600 upscaled)
      const coverThumb = bestItem.artworkUrl100;
      const coverFull = bestItem.artworkUrl100
        ? bestItem.artworkUrl100.replace(/100x100bb\.(jpg|png)/i, '600x600bb.$1')
        : undefined;

      // Cultural Bucket Resolution (Priority: Module 13 Cache > iTunes Genre > Script Detector)
      const cachedCls = getCachedClassification(cleanArtist) || getCachedClassification(bestItem.artistName);
      let culturalBucket: CanonicalBucket = 'Other';

      if (cachedCls && cachedCls.bucket && cachedCls.bucket !== 'Other') {
        culturalBucket = cachedCls.bucket;
      } else {
        culturalBucket = mapITunesGenreToBucket(bestItem.primaryGenreName || '', bestItem.artistName, bestItem.trackName);
      }

      // If valid bucket resolved, update Module 13 cache so Language Clustering and Triage sync automatically
      if (culturalBucket !== 'Other') {
        setCachedClassification(cleanArtist, {
          artist: bestItem.artistName || cleanArtist,
          bucket: culturalBucket,
          country: bestItem.country,
          confidence: 'script',
          sourceDetails: `iTunes Catalog Verified: ${bestItem.primaryGenreName || 'Apple Music'}`,
          timestamp: now
        });
      }

      const durationMs = bestItem.trackTimeMillis;
      let durationFormatted = '';
      if (durationMs) {
        const totalSec = Math.floor(durationMs / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        durationFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      const enriched: EnrichedSongRecord = {
        id: normalizeSongKey(artist, title),
        queryArtist: artist,
        queryTitle: title,
        queryAlbum: album,
        queryPath: path,
        recordingMbid: '', // iTunes tracks don't have MBIDs
        title: bestItem.trackName || cleanTitle,
        durationMs,
        durationFormatted,
        isrcs: bestItem.isrc ? [bestItem.isrc] : [],
        acoustids: [],
        isVideo: false,
        artist: {
          artistMbid: '',
          name: bestItem.artistName || cleanArtist,
          sortName: bestItem.artistName || cleanArtist,
          type: 'Person',
          isActive: true,
          aliases: [],
          bandMembers: [],
          creditedArtists: [{ name: bestItem.artistName || cleanArtist }],
          externalLinks: {
            appleMusicUrl: bestItem.trackViewUrl,
            itunesArtistUrl: bestItem.artistViewUrl,
            audioPreviewUrl: bestItem.previewUrl,
          },
        },
        work: {
          lyricsLanguages: [],
          composers: [],
          lyricists: [],
          arrangers: [],
          producers: [],
          engineers: [],
          relationships: [],
        },
        release: {
          albumTitle: bestItem.collectionName || cleanAlbum || 'Single Release',
          releaseType: (bestItem.collectionName || '').toLowerCase().includes('single') ? 'Single' : 'Album',
          releaseStatus: 'Official',
          labels: [],
          releaseDate,
          originalReleaseDate: releaseDate,
          originalReleaseYear: releaseYear,
          coverArtThumbUrl: coverThumb,
          coverArtFullUrl: coverFull,
        },
        genres: bestItem.primaryGenreName ? [bestItem.primaryGenreName] : [],
        tags: bestItem.primaryGenreName ? [{ name: bestItem.primaryGenreName, count: 1 }] : [],
        culturalBucket,
        resolution: {
          status: 'itunes_enriched',
          source: 'itunes',
          isAiSynthesized: false,
          badgeLabel: '🍎 iTunes Verified',
          matchScore: highestScore,
          searchQueryUsed: query,
          cleanTerms: {
            artist: cleanArtist,
            title: cleanTitle,
            album: cleanAlbum
          },
          timestamp: now,
        },
        createdAt: now,
        updatedAt: now,
      };

      return enriched;
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      console.warn(`[iTunes API] Query error for "${query}":`, err.message);
    }
  }

  return null;
}

/**
 * Supplement an existing track with missing release year, album artwork, and audio preview from Apple iTunes.
 * Only updates fields that are currently empty / missing, preserving authoritative MusicBrainz data.
 */
export async function supplementTrackFromITunes(
  record: EnrichedSongRecord,
  signal?: AbortSignal,
  options?: { forceArt?: boolean; forceYear?: boolean }
): Promise<{ updatedRecord: EnrichedSongRecord; supplementedFields: string[] } | null> {
  if (!record) return null;

  const artist = record.artist?.name || record.queryArtist;
  const title = record.title || record.queryTitle;
  const album = record.release?.albumTitle || record.queryAlbum;

  // Determine if art is missing or needs replacement (empty or dead 404 CoverArtArchive URL)
  const currentThumb = record.release?.coverArtThumbUrl || '';
  const currentFull = record.release?.coverArtFullUrl || '';
  const hasNoArt = !currentThumb && !currentFull;
  const hasCaaArt = currentThumb.includes('coverartarchive.org') || currentFull.includes('coverartarchive.org');

  let needsArt = !!(options?.forceArt || hasNoArt);
  if (!needsArt && hasCaaArt) {
    // If it points to CoverArtArchive, verify with a fast HEAD request whether it actually exists
    const testUrl = currentThumb || currentFull;
    try {
      const headRes = await fetch(testUrl, { method: 'HEAD', signal });
      if (!headRes.ok) {
        needsArt = true; // 404 Not Found on CoverArtArchive
      }
    } catch {
      needsArt = true; // Network or 404 failure
    }
  }

  // Determine if year / date is missing or invalid
  const rawYear = record.release?.originalReleaseYear;
  const rawDate = record.release?.releaseDate;
  const hasYear = (typeof rawYear === 'number' && rawYear > 0 && !isNaN(rawYear)) ||
                  (typeof rawDate === 'string' && rawDate.trim() !== '' && rawDate !== '—');
  const needsYear = !!(options?.forceYear || !hasYear);

  const needsPreview = !record.artist?.externalLinks?.audioPreviewUrl;

  const itunesMatch = await queryITunesRecording(artist, title, album, record.queryPath, signal);
  if (!itunesMatch) return null;

  const supplementedFields: string[] = [];
  let hasChanges = false;

  // 1. Supplement Cover Art if missing or dead CAA
  if (needsArt && (itunesMatch.release?.coverArtFullUrl || itunesMatch.release?.coverArtThumbUrl)) {
    if (!record.release) {
      record.release = { ...itunesMatch.release };
    } else {
      record.release.coverArtFullUrl = itunesMatch.release?.coverArtFullUrl;
      record.release.coverArtThumbUrl = itunesMatch.release?.coverArtThumbUrl;
    }
    supplementedFields.push('Cover Art (600×600)');
    hasChanges = true;
  }

  // 2. Supplement Release Year / Date if missing or empty
  if (needsYear && (itunesMatch.release?.originalReleaseYear || itunesMatch.release?.releaseDate)) {
    if (!record.release) {
      record.release = { ...itunesMatch.release };
    } else {
      if (itunesMatch.release?.originalReleaseYear && (!record.release.originalReleaseYear || record.release.originalReleaseYear <= 0)) {
        record.release.originalReleaseYear = itunesMatch.release.originalReleaseYear;
      }
      if (itunesMatch.release?.releaseDate && (!record.release.releaseDate || record.release.releaseDate === '—')) {
        record.release.releaseDate = itunesMatch.release.releaseDate;
      }
    }
    supplementedFields.push('Release Date / Year');
    hasChanges = true;
  }

  // 3. Supplement Audio Preview URL if missing
  if (needsPreview && itunesMatch.artist?.externalLinks?.audioPreviewUrl) {
    if (!record.artist.externalLinks) record.artist.externalLinks = {};
    record.artist.externalLinks.audioPreviewUrl = itunesMatch.artist.externalLinks.audioPreviewUrl;
    supplementedFields.push('30s Audio Preview');
    hasChanges = true;
  }

  // 4. Supplement Apple Music URL if missing
  if (!record.artist?.externalLinks?.appleMusicUrl && itunesMatch.artist?.externalLinks?.appleMusicUrl) {
    if (!record.artist.externalLinks) record.artist.externalLinks = {};
    record.artist.externalLinks.appleMusicUrl = itunesMatch.artist.externalLinks.appleMusicUrl;
    hasChanges = true;
  }

  // 5. Cultural bucket upgrade if currently 'Other'
  if (record.culturalBucket === 'Other' && itunesMatch.culturalBucket && itunesMatch.culturalBucket !== 'Other') {
    record.culturalBucket = itunesMatch.culturalBucket;
    supplementedFields.push(`Cultural Bucket (${itunesMatch.culturalBucket})`);
    hasChanges = true;
  }

  if (hasChanges) {
    record.updatedAt = Date.now();
    await saveEnrichedTrack(record, true);
  }

  return { updatedRecord: record, supplementedFields };
}

/**
 * Universal on-demand resolver for 30-second audio preview URLs.
 * If already present, returns immediately; otherwise queries iTunes on the fly, attaches it, and persists to DB.
 */
export async function resolveTrackAudioPreview(
  record: EnrichedSongRecord,
  signal?: AbortSignal
): Promise<string | null> {
  if (!record) return null;
  if (record.artist?.externalLinks?.audioPreviewUrl) {
    return record.artist.externalLinks.audioPreviewUrl;
  }

  const res = await supplementTrackFromITunes(record, signal);
  if (res && res.updatedRecord.artist?.externalLinks?.audioPreviewUrl) {
    return res.updatedRecord.artist.externalLinks.audioPreviewUrl;
  }

  return null;
}

/**
 * Universal on-demand resolver for 30-second audio preview URLs for any track.
 * Checks IndexedDB cache first for instant 0ms resolution, then queries Apple iTunes Search API.
 * If audio preview is found and an enriched track exists in DB, it updates the DB record.
 * Returns { previewUrl, coverArt }.
 */
export async function resolveAudioPreviewForTrack(
  artist: string,
  title: string,
  album?: string,
  signal?: AbortSignal
): Promise<{ previewUrl: string | null; coverArt?: string }> {
  if (!artist && !title) return { previewUrl: null };

  try {
    // 1. Check local IndexedDB first (0ms cache lookup)
    const cached = await getEnrichedTrack(artist, title);
    if (cached?.artist?.externalLinks?.audioPreviewUrl) {
      return {
        previewUrl: cached.artist.externalLinks.audioPreviewUrl,
        coverArt: cached.release?.coverArtFullUrl || cached.release?.coverArtThumbUrl,
      };
    }

    // 2. Query iTunes Search API
    const itunesMatch = await queryITunesRecording(artist, title, album, undefined, signal);
    if (itunesMatch?.artist?.externalLinks?.audioPreviewUrl) {
      const previewUrl = itunesMatch.artist.externalLinks.audioPreviewUrl;
      const coverArt = itunesMatch.release?.coverArtFullUrl || itunesMatch.release?.coverArtThumbUrl;

      // If cached record existed in DB without preview, attach preview and save
      if (cached) {
        if (!cached.artist.externalLinks) cached.artist.externalLinks = {};
        cached.artist.externalLinks.audioPreviewUrl = previewUrl;
        cached.updatedAt = Date.now();
        await saveEnrichedTrack(cached, true);
      }

      return { previewUrl, coverArt };
    }
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn(`[iTunes Preview] Failed to resolve preview for "${artist} - ${title}":`, err);
  }

  return { previewUrl: null };
}
