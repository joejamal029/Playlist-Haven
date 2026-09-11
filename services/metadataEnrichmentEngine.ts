import {
  EnrichedSongRecord,
  ArtistBioData,
  WorkCreditData,
  ReleaseContextData,
  EnrichmentResolution,
  CandidateMatch,
  EnrichmentOptions,
  EnrichmentStats,
  ENRICHED_CSV_COLUMNS,
} from './metadataEnrichmentTypes';
import {
  getEnrichedTrack,
  saveEnrichedTrack,
  getCachedArtist,
  saveCachedArtist,
  normalizeSongKey,
} from './metadataDb';
import {
  CanonicalBucket,
  COUNTRY_TO_BUCKET,
  detectScriptSignature,
  normalizeArtistKey,
  getCachedClassification,
  setCachedClassification,
} from './classificationEngine';
import { getAIConfig } from './visionEngine';
import { GoogleGenAI, Type } from '@google/genai';

// MusicBrainz Rate Limit: strict minimum 1150ms between network calls
const MUSICBRAINZ_MIN_INTERVAL_MS = 1150;
let lastMusicBrainzRequestTime = 0;
let mbMutexQueue = Promise.resolve();
const USER_AGENT = 'PlaylistHaven/2.0.0 (https://github.com/joejamal029/Playlist-Haven; contact@playlisthaven.app)';

/**
 * Strict FIFO Serialized Throttle Mutex to respect MusicBrainz 1 req/sec guidelines
 * Guarantees no two requests ever execute concurrently or breach the rate limit interval.
 */
export async function throttleMusicBrainz(signal?: AbortSignal): Promise<void> {
  const currentTask = mbMutexQueue.then(async () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const now = Date.now();
    const elapsed = now - lastMusicBrainzRequestTime;
    if (elapsed < MUSICBRAINZ_MIN_INTERVAL_MS) {
      const waitTime = MUSICBRAINZ_MIN_INTERVAL_MS - elapsed;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, waitTime);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }
      });
    }
    lastMusicBrainzRequestTime = Date.now();
  });

  mbMutexQueue = currentTask.catch(() => {});
  return currentTask;
}

/**
 * Resilient MusicBrainz fetcher with automatic exponential backoff on HTTP 503/429 rate limits.
 * Inspects Retry-After header and never treats a temporary rate limit as a permanent NO_MATCH.
 */
export async function fetchMusicBrainzWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response | null> {
  let attempt = 0;
  let backoffMs = 2000;

  while (attempt < maxRetries) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await throttleMusicBrainz(options.signal);

    try {
      const res = await fetch(url, options);

      // Handle MusicBrainz rate limits (503 Service Unavailable or 429 Too Many Requests)
      if (res.status === 503 || res.status === 429) {
        attempt++;
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
        const waitMs = retryAfterSec > 0 
          ? (retryAfterSec * 1000) + 400 
          : backoffMs + Math.floor(Math.random() * 500);

        console.warn(`[MusicBrainz] Rate limited (${res.status}). Pausing ${waitMs}ms before retry ${attempt}/${maxRetries}...`);
        
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, waitMs);
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          }
        });
        backoffMs *= 2;
        continue;
      }

      return res;
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`[MusicBrainz] Network failure after ${maxRetries} attempts for ${url}:`, err);
        return null;
      }
      console.warn(`[MusicBrainz] Network error (${err.message}). Retrying in ${backoffMs}ms...`);
      await new Promise(r => setTimeout(r, backoffMs));
      backoffMs *= 2;
    }
  }
  return null;
}

/**
 * Format milliseconds into mm:ss
 */
export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Pre-query sanitizer: Cleans dirty tags, removes YouTube suffixes, track numbers, file extensions,
 * bare hyphen remasters, and trailing ellipses.
 */
export function sanitizeSongQuery(rawArtist: string, rawTitle: string, rawAlbum?: string) {
  let artist = (rawArtist || '').trim();
  let title = (rawTitle || '').trim();
  let album = (rawAlbum || '').trim();

  // If artist is unknown or empty, but title contains "Artist - Title"
  if ((!artist || artist.toLowerCase() === '<unknown>' || artist.toLowerCase() === 'unknown artist') && title.includes(' - ')) {
    const parts = title.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }

  // Strip file extensions (.mp3, .flac, .m4a, .wav, .aac, .ogg, .opus, .wma)
  title = title.replace(/\.(mp3|flac|m4a|wav|aac|ogg|opus|wma|alac|aiff)$/i, '').trim();

  // Strip common track number prefixes (e.g. "01. ", "01 - ", "1-01 ", "A1. ")
  title = title.replace(/^(?:\d{1,3}[.\-_\s]+|[a-d]\d{1,2}[.\-_\s]+)/i, '').trim();

  // Strip YouTube Topic artifacts
  artist = artist.replace(/\s*-\s*topic$/i, '').trim();

  // Strip trailing ellipses (e.g. "Take Me Home, Country Roads Instru...")
  title = title.replace(/\s*(?:\.{3}|…)\s*$/, '').trim();

  // Extract featured artists from title to avoid breaking MusicBrainz exact title matches
  // e.g. "Essence (feat. Tems)" -> Title: "Essence", Featured: "Tems"
  const featMatch = title.match(/\s*[\(\[](?:feat\.?|ft\.?|featuring)\s+([^\)\]]+)[\)\]]/i);
  let featuredArtist = '';
  if (featMatch) {
    featuredArtist = featMatch[1].trim();
    title = title.replace(featMatch[0], '').trim();
  }

  // Strip common bracketed noise tags
  const noisePatterns = [
    /\s*[\(\[](?:official\s+)?(?:music\s+)?(?:video|mv)[\)\]]/gi,
    /\s*[\(\[](?:official\s+)?(?:audio|visualizer)[\)\]]/gi,
    /\s*[\(\[](?:lyric\s+video|lyrics)[\)\]]/gi,
    /\s*[\(\[](?:hd|4k|1080p|720p|hq|uhd)[\)\]]/gi,
    /\s*[\(\[](?:remastered|remaster\s*\d*)[\)\]]/gi,
    /\s*[\(\[](?:explicit|clean)[\)\]]/gi,
    /\s*[\(\[](?:live[^\)\]]*)[\)\]]/gi,
    /\s*[\(\[](?:acoustic[^\)\]]*)[\)\]]/gi,
    /\s*[\(\[](?:performance[^\)\]]*)[\)\]]/gi,
    /\s*[\(\[](?:original\s+mix|radio\s+edit)[\)\]]/gi,
    /\s*[\(\[](?:deluxe\s+edition|deluxe\s+version)[\)\]]/gi,
    /\s*[\(\[](?:instrumental[^\)\]]*)[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\bremix\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\bbootleg\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\bflip\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\btheme\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[]from\s+[^\)\]]+[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\bcover\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\b(?:short|rap)\s+(?:version|ver)\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\b(?:ost|soundtrack)\b[^\)\]]*[\)\]]/gi,
  ];

  for (const pattern of noisePatterns) {
    title = title.replace(pattern, '').trim();
  }

  // Strip bare hyphen remaster, remix, and edition suffixes (e.g. "Warm - Remix", "In The Air Tonight - 2015 Remastered")
  const bareHyphenPatterns = [
    /\s*-\s*(?:\d{4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{4})?$/i,
    /\s*-\s*deluxe\s+(?:edition|version)$/i,
    /\s*-\s*(?:remix|vip|instrumental|radio\s+edit|club\s+mix|extended\s+mix|single\s+version|acoustic|live)$/i,
    /\s*-\s*(?:original\s+mix|album\s+version)$/i,
    /\s*-\s*official\s+(?:music\s+)?(?:video|audio)$/i,
    /\s*-\s*survival\s+mode$/i, // e.g. "Verdansk - Survival Mode"
  ];

  for (const pattern of bareHyphenPatterns) {
    title = title.replace(pattern, '').trim();
  }

  // Strip bracketed CJK / mojibake translations: [アンコール], [窓], [走馬燈], [ã‚¢ãƒ³ã‚³ãƒ¼ãƒ«]
  title = title.replace(/\s*\[[^\[\]]*[^\x00-\x7F][^\[\]]*\]/g, '').trim();
  // Strip round-bracket content that is predominantly non-ASCII (CJK translations)
  title = title.replace(/\s*\([^()]*[^\x00-\x7F]{2,}[^()]*\)/g, '').trim();
  // Strip fullwidth brackets: 【...】『...』（...）
  title = title.replace(/\s*[【『][^】』]*[】』]/g, '').trim();
  title = title.replace(/\s*（[^）]*）/g, '').trim();
  // Strip trailing non-ASCII blocks appended directly to Latin titles (e.g. "Marigold マリーゴールド")
  // Only if title starts with ASCII and has trailing non-ASCII block
  if (/^[\x00-\x7F]/.test(title) && /[^\x00-\x7F]{2,}$/.test(title)) {
    title = title.replace(/\s*[^\x00-\x7F]{2,}$/, '').trim();
  }

  // Collapse excess whitespace
  artist = artist.replace(/\s+/g, ' ').trim();
  title = title.replace(/\s+/g, ' ').trim();
  album = album.replace(/\s+/g, ' ').trim();

  return {
    cleanArtist: artist,
    cleanTitle: title,
    cleanAlbum: album,
    featuredArtist,
  };
}

/**
 * Calculate string similarity score (0 - 100) using Levenshtein distance
 */
export function calculateMatchScore(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const norm = (s: string) =>
    s
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[-\s]+/g, ' ')
      .toLowerCase()
      .trim();

  const a = norm(s1);
  const b = norm(s2);
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) {
    const minLen = Math.min(a.length, b.length);
    const maxLen = Math.max(a.length, b.length);
    return Math.round((minLen / maxLen) * 90);
  }

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  const score = Math.round((1 - distance / maxLen) * 100);
  return Math.max(0, Math.min(100, score));
}

/**
 * ISO 639-3 language to CanonicalBucket map
 */
const ISO639_TO_BUCKET: Record<string, CanonicalBucket> = {
  tha: 'Thai',
  vie: 'Vietnamese',
  nld: 'Dutch',
  por: 'Portuguese',
  deu: 'German',
  ita: 'Italian',
  ara: 'Arabic',
  arb: 'Arabic',
  kor: 'K-Pop',
  jpn: 'J-Pop',
  zho: 'C-Pop',
  cmn: 'C-Pop',
  yue: 'C-Pop',
  fil: 'Filipino',
  tgl: 'Filipino',
  hin: 'I-Pop',
  ben: 'I-Pop',
  pan: 'I-Pop',
  yor: 'Naija',
  ibo: 'Naija',
  hau: 'Naija',
  swa: 'African',
  zul: 'African',
  fra: 'Français',
  spa: 'Latina',
  eng: 'English',
};

/**
 * Determine cultural bucket from comprehensive metadata
 */
export function resolveCulturalBucket(
  artist: Partial<ArtistBioData>,
  work: Partial<WorkCreditData>,
  tags: { name: string }[],
  title: string
): CanonicalBucket {
  // 0. Check if user already manually classified or cached this artist in Module 13
  if (artist.name) {
    const cached = getCachedClassification(artist.name);
    if (cached && (cached.confidence === 'manual' || cached.confidence === 'user')) {
      return cached.bucket;
    }
  }

  // 1. Check artist country code (skip pseudo-codes XW=Worldwide, XE=Europe, XU=Unknown)
  if (artist.countryCode && artist.countryCode !== 'XW' && artist.countryCode !== 'XE' && artist.countryCode !== 'XU' && COUNTRY_TO_BUCKET[artist.countryCode]) {
    return COUNTRY_TO_BUCKET[artist.countryCode];
  }

  // 2. Check work lyrics language
  if (work.lyricsLanguages && work.lyricsLanguages.length > 0) {
    for (const lang of work.lyricsLanguages) {
      if (ISO639_TO_BUCKET[lang]) {
        return ISO639_TO_BUCKET[lang];
      }
    }
  }

  // 3. Check community tags / genres
  if (tags && tags.length > 0) {
    const tagString = tags.map(t => t.name.toLowerCase()).join(' ');
    if (tagString.includes('gospel') || tagString.includes('christian')) return 'Gospel';
    if (tagString.includes('t-pop') || tagString.includes('thai')) return 'Thai';
    if (tagString.includes('v-pop') || tagString.includes('vietnamese')) return 'Vietnamese';
    if (tagString.includes('nederpop') || tagString.includes('nederhop') || tagString.includes('dutch')) return 'Dutch';
    if (tagString.includes('bossa nova') || tagString.includes('samba') || tagString.includes('funk carioca') || tagString.includes('mpb') || tagString.includes('fado')) return 'Portuguese';
    if (tagString.includes('arabic') || tagString.includes('arabesque') || tagString.includes('khaliji')) return 'Arabic';
    if (tagString.includes('deutschrap') || tagString.includes('schlager') || tagString.includes('german')) return 'German';
    if (tagString.includes('italiano') || tagString.includes('sanremo')) return 'Italian';
    if (tagString.includes('afrobeats') || tagString.includes('naija')) return 'Naija';
    if (tagString.includes('j-pop') || tagString.includes('anime') || tagString.includes('vocaloid')) return 'J-Pop';
    if (tagString.includes('k-pop') || tagString.includes('k-hiphop')) return 'K-Pop';
    if (tagString.includes('c-pop') || tagString.includes('mandopop') || tagString.includes('cantopop')) return 'C-Pop';
    if (tagString.includes('latin') || tagString.includes('reggaeton') || tagString.includes('bachata') || tagString.includes('salsa')) return 'Latina';
    if (tagString.includes('lofi') || tagString.includes('instrumental') || tagString.includes('ambient') || tagString.includes('soundtrack')) return 'Instrumental';
  }

  // 4. Check Unicode script signatures in Title + Artist
  const scriptSig = detectScriptSignature(`${title} ${artist.name || ''}`);
  if (scriptSig) {
    return scriptSig.bucket;
  }

  // 5. Check primary area or begin area fuzzy names
  const area = `${artist.primaryArea || ''} ${artist.beginArea || ''} ${artist.countryName || ''}`.toLowerCase();
  if (area.includes('thailand') || area.includes('bangkok')) return 'Thai';
  if (area.includes('vietnam') || area.includes('hanoi') || area.includes('ho chi minh')) return 'Vietnamese';
  if (area.includes('netherlands') || area.includes('amsterdam') || area.includes('rotterdam')) return 'Dutch';
  if (area.includes('brazil') || area.includes('brasil') || area.includes('portugal') || area.includes('rio de janeiro')) return 'Portuguese';
  if (area.includes('germany') || area.includes('deutschland') || area.includes('berlin') || area.includes('austria')) return 'German';
  if (area.includes('italy') || area.includes('italia') || area.includes('rome') || area.includes('milan')) return 'Italian';
  if (area.includes('egypt') || area.includes('saudi') || area.includes('lebanon') || area.includes('uae') || area.includes('dubai')) return 'Arabic';
  if (area.includes('nigeria') || area.includes('lagos')) return 'Naija';
  if (area.includes('japan') || area.includes('tokyo')) return 'J-Pop';
  if (area.includes('korea') || area.includes('seoul')) return 'K-Pop';
  if (area.includes('china') || area.includes('taiwan') || area.includes('hong kong')) return 'C-Pop';
  if (area.includes('philippines') || area.includes('manila')) return 'Filipino';
  if (area.includes('india') || area.includes('mumbai') || area.includes('delhi')) return 'I-Pop';
  if (area.includes('france') || area.includes('paris')) return 'Français';
  if (area.includes('mexico') || area.includes('colombia') || area.includes('puerto rico') || area.includes('spain') || area.includes('argentina')) return 'Latina';

  return 'English';
}

/**
 * Query MusicBrainz for full Artist details (inc=aliases+tags+genres+ratings+url-rels+artist-rels)
 */
export async function fetchArtistDetails(artistMbid: string, signal?: AbortSignal): Promise<ArtistBioData | null> {
  if (!artistMbid) return null;

  // 1. Check IndexedDB cached artist
  const cached = await getCachedArtist(artistMbid);
  if (cached) return cached;

  // 2. Query MusicBrainz API with retry
  try {
    const url = `https://musicbrainz.org/ws/2/artist/${artistMbid}?inc=aliases+tags+genres+ratings+url-rels+artist-rels&fmt=json`;
    const res = await fetchMusicBrainzWithRetry(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });

    if (!res || !res.ok) return null;

    const data = await res.json();
    const externalLinks: ArtistBioData['externalLinks'] = {};
    const bandMembers: ArtistBioData['bandMembers'] = [];

    // Parse relations (external links and band members)
    if (data.relations && Array.isArray(data.relations)) {
      for (const rel of data.relations) {
        if (rel.url?.resource) {
          const u = rel.url.resource;
          if (u.includes('wikidata.org/wiki/')) {
            const qid = u.split('/').pop();
            externalLinks.wikidataId = qid;
            externalLinks.wikidataUrl = u;
          } else if (u.includes('wikipedia.org')) {
            externalLinks.wikipediaUrl = u;
          } else if (u.includes('spotify.com')) {
            externalLinks.spotifyUrl = u;
          } else if (u.includes('apple.com')) {
            externalLinks.appleMusicUrl = u;
          } else if (u.includes('discogs.com')) {
            externalLinks.discogsUrl = u;
          } else if (u.includes('allmusic.com')) {
            externalLinks.allmusicUrl = u;
          } else if (u.includes('youtube.com')) {
            externalLinks.youtubeUrl = u;
          } else if (rel.type === 'official homepage') {
            externalLinks.officialWebsite = u;
          }
        } else if (rel.type === 'member of band' && rel.artist) {
          bandMembers.push({
            name: rel.artist.name,
            mbid: rel.artist.id,
            role: rel.attributes?.join(', '),
            isActive: !rel.ended,
          });
        }
      }
    }

    // Parse aliases
    const aliases = (data.aliases || []).map((a: any) => ({
      name: a.name,
      locale: a.locale,
      type: a.type,
      primary: a.primary || false,
    }));

    const artistBio: ArtistBioData = {
      artistMbid: data.id,
      name: data.name,
      sortName: data['sort-name'] || data.name,
      type: data.type || 'Person',
      gender: data.gender,
      birthDate: data['life-span']?.begin,
      deathDate: data['life-span']?.end,
      isActive: !data['life-span']?.ended,
      countryCode: (data.country && data.country !== 'XW' && data.country !== 'XE' && data.country !== 'XU' ? data.country : undefined) || data.area?.['iso-3166-1-codes']?.[0] || data['begin-area']?.['iso-3166-1-codes']?.[0] || data.country,
      countryName: data.area?.name,
      primaryArea: data.area?.name,
      beginArea: data['begin-area']?.name,
      endArea: data['end-area']?.name,
      aliases,
      bandMembers,
      creditedArtists: [{ name: data.name, mbid: data.id }],
      externalLinks,
    };

    // Save to IndexedDB
    await saveCachedArtist(artistBio);
    return artistBio;
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn(`Failed to fetch artist details for ${artistMbid}:`, err);
    return null;
  }
}

/**
 * Search MusicBrainz candidates for manual disambiguation drawer
 */
export async function searchMusicBrainzCandidates(
  artist: string,
  title: string,
  signal?: AbortSignal
): Promise<CandidateMatch[]> {
  const { cleanArtist, cleanTitle } = sanitizeSongQuery(artist, title);

  try {
    const query = `recording:"${cleanTitle.replace(/"/g, '')}" AND artist:"${cleanArtist.replace(/"/g, '')}"`;
    const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=6`;
    
    const res = await fetchMusicBrainzWithRetry(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });

    if (!res || !res.ok) return [];
    const data = await res.json();
    if (!data.recordings || data.recordings.length === 0) return [];

    return data.recordings.map((rec: any) => {
      const art = rec['artist-credit']?.[0]?.artist;
      const rel = rec.releases?.[0];
      const matchScore = Math.round((calculateMatchScore(rec.title, cleanTitle) + calculateMatchScore(art?.name || '', cleanArtist)) / 2);

      return {
        recordingMbid: rec.id,
        title: rec.title,
        artist: art?.name || rec['artist-credit']?.[0]?.name || 'Unknown',
        artistMbid: art?.id,
        album: rel?.title || 'Unknown Release',
        releaseMbid: rel?.id,
        releaseDate: rel?.date,
        country: rel?.country,
        duration: formatDuration(rec.length),
        durationMs: rec.length,
        score: matchScore,
        isrc: rec.isrcs?.[0],
        disambiguation: rec.disambiguation,
      };
    });
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    return [];
  }
}

/**
 * Fetch full recording package by Recording MBID
 */
export async function fetchRecordingDetails(
  recordingMbid: string,
  queryArtist: string,
  queryTitle: string,
  queryAlbum?: string,
  queryPath?: string,
  signal?: AbortSignal
): Promise<EnrichedSongRecord | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/recording/${recordingMbid}?inc=artists+releases+release-groups+isrcs+url-rels+artist-rels+work-rels+tags+genres+ratings&fmt=json`;
    const res = await fetchMusicBrainzWithRetry(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });

    if (!res || !res.ok) return null;
    const rec = await res.json();
    return parseMusicBrainzRecording(rec, queryArtist, queryTitle, queryAlbum, queryPath, signal);
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    console.error(`Failed to fetch recording ${recordingMbid}:`, e);
    return null;
  }
}

/**
 * Parse a MusicBrainz recording object into an EnrichedSongRecord
 */
async function parseMusicBrainzRecording(
  rec: any,
  queryArtist: string,
  queryTitle: string,
  queryAlbum?: string,
  queryPath?: string,
  signal?: AbortSignal
): Promise<EnrichedSongRecord> {
  const primaryArtist = rec['artist-credit']?.[0]?.artist;
  const artistMbid = primaryArtist?.id;
  const artistName = primaryArtist?.name || rec['artist-credit']?.[0]?.name || queryArtist;

  // 1. Fetch rich Artist Bio data (from IndexedDB cache or MB API)
  let artistBio: ArtistBioData | null = null;
  if (artistMbid) {
    artistBio = await fetchArtistDetails(artistMbid, signal);
  }

  if (!artistBio) {
    artistBio = {
      artistMbid: artistMbid || '',
      name: artistName,
      sortName: primaryArtist?.['sort-name'] || artistName,
      type: primaryArtist?.type || 'Person',
      isActive: true,
      aliases: [],
      bandMembers: [],
      creditedArtists: (rec['artist-credit'] || []).map((c: any) => ({
        name: c.name,
        mbid: c.artist?.id,
        joinphrase: c.joinphrase,
      })),
      externalLinks: {},
    };
  }

  // 2. Parse releases: identify earliest release date (Original Year) and primary album release
  let originalDate = '';
  let earliestYear = 9999;
  let selectedRelease: any = null;

  if (rec.releases && Array.isArray(rec.releases)) {
    for (const rel of rec.releases) {
      if (rel.date) {
        const year = parseInt(rel.date.slice(0, 4), 10);
        if (!isNaN(year) && year < earliestYear) {
          earliestYear = year;
          originalDate = rel.date;
        }
      }
      // If user provided an album title, check if this release matches
      if (queryAlbum && !selectedRelease) {
        if (rel.title?.toLowerCase().includes(queryAlbum.toLowerCase())) {
          selectedRelease = rel;
        }
      }
    }
    if (!selectedRelease) {
      // Pick first Official album or first release
      selectedRelease = rec.releases.find((r: any) => r.status === 'Official') || rec.releases[0];
    }
  }

  const releaseMbid = selectedRelease?.id;
  const coverArtThumbUrl = releaseMbid ? `https://coverartarchive.org/release/${releaseMbid}/front-250` : undefined;
  const coverArtFullUrl = releaseMbid ? `https://coverartarchive.org/release/${releaseMbid}/front` : undefined;

  const media = selectedRelease?.media?.[0];
  const track = media?.track?.[0];

  const releaseContext: ReleaseContextData = {
    releaseMbid,
    releaseGroupMbid: selectedRelease?.['release-group']?.id,
    albumTitle: selectedRelease?.title || queryAlbum || '',
    disambiguation: selectedRelease?.disambiguation,
    releaseDate: selectedRelease?.date,
    originalReleaseDate: earliestYear < 9999 ? originalDate : selectedRelease?.date,
    originalReleaseYear: earliestYear < 9999 ? earliestYear : (selectedRelease?.date ? parseInt(selectedRelease.date.slice(0, 4), 10) : undefined),
    releaseType: selectedRelease?.['release-group']?.['primary-type'] || 'Album',
    releaseStatus: selectedRelease?.status || 'Official',
    packaging: selectedRelease?.packaging,
    labels: (selectedRelease?.['label-info'] || []).map((l: any) => ({
      name: l.label?.name || '',
      catalogNumber: l['catalog-number'],
    })),
    barcode: selectedRelease?.barcode,
    mediaFormat: media?.format || 'Digital Media',
    trackPosition: track?.position || media?.['track-offset'],
    trackCount: media?.['track-count'],
    discNumber: media?.position,
    coverArtThumbUrl,
    coverArtFullUrl,
  };

  // 3. Parse Works & Songwriting / Production credits
  const workData: WorkCreditData = {
    lyricsLanguages: [],
    composers: [],
    lyricists: [],
    arrangers: [],
    producers: [],
    engineers: [],
    relationships: [],
  };

  if (rec.relations && Array.isArray(rec.relations)) {
    for (const rel of rec.relations) {
      if (rel.work) {
        workData.workMbid = rel.work.id;
        workData.workTitle = rel.work.title;
        workData.iswc = rel.work.iswcs?.[0];
        workData.workType = rel.work.type;
        if (rel.work.languages && Array.isArray(rel.work.languages)) {
          workData.lyricsLanguages = rel.work.languages;
        }
      }
      const targetName = rel.artist?.name || rel.work?.title || rel.target;
      if (targetName) {
        workData.relationships.push({ type: rel.type, target: targetName });
        if (rel.type === 'composer' || rel.type === 'writer') {
          workData.composers.push({ name: rel.artist.name, mbid: rel.artist.id });
        } else if (rel.type === 'lyricist') {
          workData.lyricists.push({ name: rel.artist.name, mbid: rel.artist.id });
        } else if (rel.type === 'arranger') {
          workData.arrangers.push({ name: rel.artist.name, mbid: rel.artist.id });
        } else if (rel.type === 'producer') {
          workData.producers.push({ name: rel.artist.name, mbid: rel.artist.id });
        } else if (rel.type === 'mix' || rel.type === 'engineer' || rel.type === 'mastering') {
          workData.engineers.push({ name: rel.artist.name, mbid: rel.artist.id, role: rel.type });
        }
      }
    }
  }

  // 3b. Deep Work Traversal: Fetch composer/lyricist credits from the Work entity itself.
  // MusicBrainz stores songwriting credits on the Work, NOT the Recording.
  // Recording only has a "performance" relation linking to the Work.
  if (workData.workMbid && workData.composers.length === 0 && workData.lyricists.length === 0) {
    try {
      const workUrl = `https://musicbrainz.org/ws/2/work/${workData.workMbid}?inc=artist-rels&fmt=json`;
      const workRes = await fetchMusicBrainzWithRetry(workUrl, {
        signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
      });
      if (workRes && workRes.ok) {
        const workEntity = await workRes.json();
        if (workEntity.relations && Array.isArray(workEntity.relations)) {
          for (const wRel of workEntity.relations) {
            if (!wRel.artist) continue;
            const creditName = wRel.artist.name;
            const creditMbid = wRel.artist.id;
            workData.relationships.push({ type: wRel.type, target: creditName });
            if (wRel.type === 'composer' || wRel.type === 'writer') {
              if (!workData.composers.some((c: any) => c.name === creditName)) {
                workData.composers.push({ name: creditName, mbid: creditMbid });
              }
            } else if (wRel.type === 'lyricist') {
              if (!workData.lyricists.some((l: any) => l.name === creditName)) {
                workData.lyricists.push({ name: creditName, mbid: creditMbid });
              }
            } else if (wRel.type === 'arranger') {
              if (!workData.arrangers.some((a: any) => a.name === creditName)) {
                workData.arrangers.push({ name: creditName, mbid: creditMbid });
              }
            }
          }
        }
        // Also capture work languages if not already populated
        if (workEntity.languages && Array.isArray(workEntity.languages) && workData.lyricsLanguages.length === 0) {
          workData.lyricsLanguages = workEntity.languages;
        }
      }
    } catch (workErr: any) {
      if (workErr.name === 'AbortError') throw workErr;
      console.warn(`[Work Traversal] Failed to fetch work ${workData.workMbid}:`, workErr.message);
    }
  }

  // 3c. Deep Work Traversal Fallback: If no composers/lyricists were found on MB, resolve via AI if key is available
  if (workData.composers.length === 0 && workData.lyricists.length === 0 && (resolveAIKey() || getAIConfig().provider === 'openai-compatible')) {
    try {
      const aiCredits = await resolveAiSongwritingCredits(artistName, rec.title, releaseContext.albumTitle, signal);
      if (aiCredits.composers.length > 0 || aiCredits.lyricists.length > 0) {
        workData.composers = aiCredits.composers;
        workData.lyricists = aiCredits.lyricists;
        if (aiCredits.languages && aiCredits.languages.length > 0 && workData.lyricsLanguages.length === 0) {
          workData.lyricsLanguages = aiCredits.languages;
        }
      }
    } catch (aiErr: any) {
      if (aiErr.name === 'AbortError') throw aiErr;
      console.warn(`[AI Songwriting Credits] Failed to resolve credits for ${rec.title}:`, aiErr.message);
    }
  }

  // 4. Tags & Genres
  const tags = (rec.tags || []).map((t: any) => ({ name: t.name, count: t.count || 1 }));
  const genres = (rec.genres || []).map((g: any) => g.name);

  // 5. Cultural Bucket
  const culturalBucket = resolveCulturalBucket(artistBio, workData, tags, rec.title);

  // 6. Match Score (compare against both raw query and sanitized terms)
  const { cleanArtist, cleanTitle } = sanitizeSongQuery(queryArtist, queryTitle);
  const titleScore = Math.max(
    calculateMatchScore(rec.title, queryTitle),
    calculateMatchScore(rec.title, cleanTitle)
  );
  const artistScore = Math.max(
    calculateMatchScore(artistBio.name, queryArtist),
    calculateMatchScore(artistBio.name, cleanArtist)
  );
  const matchScore = Math.round((titleScore * 0.6) + (artistScore * 0.4));

  const resolution: EnrichmentResolution = {
    status: matchScore >= 60 ? 'enriched' : 'needs_resolution',
    source: 'musicbrainz',
    isAiSynthesized: false,
    badgeLabel: matchScore >= 60 ? '✓ MusicBrainz Verified' : '⚠️ Low Confidence Match',
    matchScore,
    timestamp: Date.now(),
  };

  const id = normalizeSongKey(queryArtist, queryTitle);

  // Sync with Module 13 Language & Nationality Classification cache
  if (artistBio.name) {
    setCachedClassification(artistBio.name, {
      artist: artistBio.name,
      bucket: culturalBucket,
      country: artistBio.countryCode,
      countryName: artistBio.countryName,
      confidence: 'musicbrainz',
      sourceDetails: `Deep Metadata Engine: ${rec.title} (${artistBio.countryName || artistBio.countryCode || 'MB Verified'})`,
      mbid: artistBio.artistMbid,
      timestamp: Date.now(),
    });
  }

  return {
    id,
    queryArtist,
    queryTitle,
    queryAlbum,
    queryPath,
    recordingMbid: rec.id,
    title: rec.title,
    disambiguation: rec.disambiguation,
    durationMs: rec.length,
    durationFormatted: formatDuration(rec.length),
    isrcs: rec.isrcs || [],
    acoustids: [],
    rating: rec.rating?.value,
    ratingVotes: rec.rating?.['votes-count'],
    isVideo: rec.video || false,
    annotation: rec.annotation,
    artist: artistBio,
    work: workData,
    release: releaseContext,
    genres,
    tags,
    culturalBucket,
    resolution,
    rawMusicBrainzData: rec,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Parse a MusicBrainz recording directly from search endpoint result (1-request ultra-fast path)
 * Avoids firing redundant recording details and artist details network requests during mass ingestion.
 */
export function parseSearchRecording(
  rec: any,
  queryArtist: string,
  queryTitle: string,
  queryAlbum?: string,
  queryPath?: string
): EnrichedSongRecord {
  const primaryCredit = rec['artist-credit']?.[0];
  const primaryArtist = primaryCredit?.artist;
  const artistMbid = primaryArtist?.id || '';
  const artistName = primaryArtist?.name || primaryCredit?.name || queryArtist;

  // Releases
  let originalDate = '';
  let earliestYear = 9999;
  let selectedRelease: any = null;

  if (rec.releases && Array.isArray(rec.releases)) {
    for (const rel of rec.releases) {
      if (rel.date) {
        const year = parseInt(rel.date.slice(0, 4), 10);
        if (!isNaN(year) && year < earliestYear) {
          earliestYear = year;
          originalDate = rel.date;
        }
      }
      if (queryAlbum && !selectedRelease) {
        if (rel.title?.toLowerCase().includes(queryAlbum.toLowerCase())) {
          selectedRelease = rel;
        }
      }
    }
    if (!selectedRelease) {
      selectedRelease = rec.releases.find((r: any) => r.status === 'Official') || rec.releases[0];
    }
  }

  const releaseMbid = selectedRelease?.id;
  const coverArtThumbUrl = releaseMbid ? `https://coverartarchive.org/release/${releaseMbid}/front-250` : undefined;
  const coverArtFullUrl = releaseMbid ? `https://coverartarchive.org/release/${releaseMbid}/front` : undefined;

  const rawCountry = selectedRelease?.country || primaryArtist?.country || undefined;
  const cleanCountry = (rawCountry && rawCountry !== 'XW' && rawCountry !== 'XE' && rawCountry !== 'XU') ? rawCountry : undefined;
  const areaCountry = primaryArtist?.area?.['iso-3166-1-codes']?.[0] || primaryArtist?.['begin-area']?.['iso-3166-1-codes']?.[0];
  const countryCode = cleanCountry || areaCountry || undefined;
  const countryName = countryCode ? (COUNTRY_TO_BUCKET[countryCode] ? countryCode : undefined) : undefined;

  const artistBio: ArtistBioData = {
    artistMbid,
    name: artistName,
    sortName: primaryArtist?.['sort-name'] || artistName,
    type: primaryArtist?.type || 'Person',
    isActive: true,
    countryCode,
    countryName,
    primaryArea: countryName,
    aliases: (primaryArtist?.aliases || []).map((a: any) => ({
      name: a.name,
      locale: a.locale,
      type: a.type,
      primary: a.primary || false,
    })),
    bandMembers: [],
    creditedArtists: (rec['artist-credit'] || []).map((c: any) => ({
      name: c.name,
      mbid: c.artist?.id,
      joinphrase: c.joinphrase,
    })),
    externalLinks: {},
  };

  const workData: WorkCreditData = {
    lyricsLanguages: [],
    composers: [],
    lyricists: [],
    arrangers: [],
    producers: [],
    engineers: [],
    relationships: [],
  };

  const tags = (rec.tags || []).map((t: any) => ({ name: t.name, count: t.count || 1 }));
  const genres = tags.map((t: any) => t.name);
  const culturalBucket = resolveCulturalBucket(artistBio, workData, tags, rec.title);

  const { cleanArtist, cleanTitle } = sanitizeSongQuery(queryArtist, queryTitle);
  const titleScore = Math.max(
    calculateMatchScore(rec.title, queryTitle),
    calculateMatchScore(rec.title, cleanTitle)
  );
  const artistScore = Math.max(
    calculateMatchScore(artistName, queryArtist),
    calculateMatchScore(artistName, cleanArtist)
  );
  const matchScore = Math.round((titleScore * 0.6) + (artistScore * 0.4));

  const resolution: EnrichmentResolution = {
    status: matchScore >= 60 ? 'enriched' : 'needs_resolution',
    source: 'musicbrainz',
    isAiSynthesized: false,
    badgeLabel: matchScore >= 60 ? '✓ MusicBrainz Verified' : '⚠️ Low Confidence Match',
    matchScore,
    timestamp: Date.now(),
  };

  const releaseContext: ReleaseContextData = {
    releaseMbid,
    releaseGroupMbid: selectedRelease?.['release-group']?.id,
    albumTitle: selectedRelease?.title || queryAlbum || '',
    disambiguation: selectedRelease?.disambiguation,
    releaseDate: selectedRelease?.date,
    originalReleaseDate: earliestYear < 9999 ? originalDate : selectedRelease?.date,
    originalReleaseYear: earliestYear < 9999 ? earliestYear : (selectedRelease?.date ? parseInt(selectedRelease.date.slice(0, 4), 10) : undefined),
    releaseType: selectedRelease?.['release-group']?.['primary-type'] || 'Album',
    releaseStatus: selectedRelease?.status || 'Official',
    labels: [],
    mediaFormat: 'Digital Media',
    coverArtThumbUrl,
    coverArtFullUrl,
  };

  return {
    id: normalizeSongKey(queryArtist, queryTitle),
    queryArtist,
    queryTitle,
    queryAlbum,
    queryPath,
    recordingMbid: rec.id,
    title: rec.title,
    disambiguation: rec.disambiguation,
    durationMs: rec.length,
    durationFormatted: formatDuration(rec.length),
    isrcs: rec.isrcs || [],
    acoustids: [],
    isVideo: rec.video || false,
    artist: artistBio,
    work: workData,
    release: releaseContext,
    genres,
    tags,
    culturalBucket,
    resolution,
    rawMusicBrainzData: rec,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Hydrates a search recording match:
 * 1. Attempts to fetch full recording details and relations (including work traversal, songwriting credits, and artist bio).
 * 2. If details fail or return low match, falls back to parseSearchRecording and enriches artist bio from artist details.
 */
async function hydrateSearchMatch(
  rec: any,
  artist: string,
  title: string,
  album?: string,
  path?: string,
  signal?: AbortSignal
): Promise<EnrichedSongRecord> {
  if (rec?.id) {
    try {
      const detailed = await fetchRecordingDetails(rec.id, artist, title, album, path, signal);
      if (detailed && detailed.resolution.status === 'enriched') {
        return detailed;
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }
  }

  const enriched = parseSearchRecording(rec, artist, title, album, path);
  const artistMbid = rec['artist-credit']?.[0]?.artist?.id;
  if (artistMbid) {
    try {
      const bio = await fetchArtistDetails(artistMbid, signal);
      if (bio) {
        enriched.artist = {
          ...enriched.artist,
          ...bio,
          creditedArtists: enriched.artist.creditedArtists?.length ? enriched.artist.creditedArtists : bio.creditedArtists,
          externalLinks: { ...bio.externalLinks, ...enriched.artist.externalLinks },
        };
        if (bio.countryCode && bio.countryCode !== 'XW' && bio.countryCode !== 'XE' && bio.countryCode !== 'XU') {
          enriched.artist.countryCode = bio.countryCode;
          enriched.artist.countryName = bio.countryName || bio.primaryArea || bio.countryCode;
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }
  }

  return enriched;
}

/**
 * Search MusicBrainz with exact quoted terms
 */
export async function queryMusicBrainzRecording(
  artist: string,
  title: string,
  album?: string,
  path?: string,
  signal?: AbortSignal
): Promise<EnrichedSongRecord | null> {
  const { cleanArtist, cleanTitle } = sanitizeSongQuery(artist, title, album);
  if (!cleanTitle) return null;

  try {
    // 1. Exact quoted search
    const query = `recording:"${cleanTitle.replace(/"/g, '')}" AND artist:"${cleanArtist.replace(/"/g, '')}"`;
    const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`;

    const res = await fetchMusicBrainzWithRetry(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });

    if (!res || !res.ok) return null;

    const data = await res.json();
    if (!data.recordings || data.recordings.length === 0) {
      // 2. If 0 matches, check if cleanArtist has multiple artist tokens (e.g. "ArrDee, Kyla" or "ARTAN, Spencer Elmer")
      const primaryArtist = cleanArtist.split(/[,/&]|(?:\s+ft\.?\s+)|\s+feat\.?\s+/i)[0].trim();
      if (primaryArtist && primaryArtist !== cleanArtist) {
        const relaxedArtUrl = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent('recording:"' + cleanTitle.replace(/"/g, '') + '" AND artist:"' + primaryArtist.replace(/"/g, '') + '"')}&fmt=json&limit=5`;
        const artRes = await fetchMusicBrainzWithRetry(relaxedArtUrl, {
          signal,
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        });
        if (artRes && artRes.ok) {
          const artData = await artRes.json();
          if (artData.recordings && artData.recordings.length > 0) {
            const enriched = await hydrateSearchMatch(artData.recordings[0], artist, title, album, path, signal);
            if (enriched.resolution.status === 'enriched') return enriched;
          }
        }
      }

      // 2.5 Root title fallback if cleanTitle has parentheticals (e.g. "Warm (Remix)" -> "Warm")
      const rootTitle = cleanTitle.replace(/\s*[\(\[][^\)\]]+[\)\]]/g, '').trim();
      if (rootTitle && rootTitle !== cleanTitle) {
        const rootUrl = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent('recording:"' + rootTitle.replace(/"/g, '') + '" AND artist:"' + (primaryArtist || cleanArtist).replace(/"/g, '') + '"')}&fmt=json&limit=5`;
        const rootRes = await fetchMusicBrainzWithRetry(rootUrl, {
          signal,
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        });
        if (rootRes && rootRes.ok) {
          const rootData = await rootRes.json();
          if (rootData.recordings && rootData.recordings.length > 0) {
            const enriched = await hydrateSearchMatch(rootData.recordings[0], artist, title, album, path, signal);
            if (enriched.resolution.status === 'enriched') return enriched;
          }
        }
      }

      // 3. Relaxed title query if title has multiple words
      if (cleanTitle.includes(' ')) {
        const relaxedUrl = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent('recording:"' + cleanTitle.replace(/"/g, '') + '"')}&fmt=json&limit=5`;
        const relRes = await fetchMusicBrainzWithRetry(relaxedUrl, {
          signal,
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        });
        if (relRes && relRes.ok) {
          const relData = await relRes.json();
          if (relData.recordings && relData.recordings.length > 0) {
            // Check if any has a matching artist
            const best = relData.recordings.find((r: any) => {
              const rArt = r['artist-credit']?.[0]?.name || '';
              return calculateMatchScore(rArt, cleanArtist) >= 45 || (primaryArtist && calculateMatchScore(rArt, primaryArtist) >= 45);
            });
            if (best) {
              const enriched = await hydrateSearchMatch(best, artist, title, album, path, signal);
              if (enriched.resolution.status === 'enriched') return enriched;
            }
          }
        }
      }
      return null;
    }

    // Pick best match directly from search result and fully hydrate
    const topRec = data.recordings[0];
    const enriched = await hydrateSearchMatch(topRec, artist, title, album, path, signal);
    return enriched.resolution.status === 'enriched' ? enriched : null;
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn(`MusicBrainz search error for "${artist} - ${title}":`, err.message);
    return null;
  }
}

/**
 * Universal safe API key resolver checking local config, process.env, and import.meta.env
 */
export function resolveAIKey(): string {
  const aiConfig = getAIConfig();
  if (aiConfig.apiKey && aiConfig.apiKey.trim()) {
    return aiConfig.apiKey.trim();
  }

  try {
    const procKey = typeof process !== 'undefined' && process.env ? (process.env.API_KEY || process.env.GEMINI_API_KEY) : '';
    if (procKey && procKey.trim()) return procKey.trim();
  } catch (e) {}

  try {
    // @ts-ignore
    const viteKey = import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.VITE_API_KEY || '';
    if (viteKey && viteKey.trim()) return viteKey.trim();
  } catch (e) {}

  return '';
}

/**
 * Universal markdown-proof JSON parser: strips markdown code fences and isolates JSON arrays/objects
 */
export function cleanAndParseJson<T = any>(rawText: string, fallback: T): T {
  if (!rawText || typeof rawText !== 'string') return fallback;
  try {
    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const firstBracket = cleaned.indexOf('[');
    const firstBrace = cleaned.indexOf('{');

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      const lastBracket = cleaned.lastIndexOf(']');
      if (lastBracket > firstBracket) {
        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
      }
    } else if (firstBrace !== -1) {
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    }

    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn('[JSON Parser] Failed to parse JSON from AI response:', err, '\nRaw text was:', rawText.slice(0, 300));
    return fallback;
  }
}

/**
 * Helper to call Google GenAI with Primary model (gemini-2.5-flash) and automatic tiered failovers
 */
async function callGeminiWithTimeout(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  config: any,
  timeoutMs = 25000
): Promise<string> {
  const rawModel = model || 'gemini-2.5-flash';
  const primaryModel = (rawModel === 'gemini-3-flash-preview') ? 'gemini-2.5-flash' : rawModel;
  const secondaryModel = primaryModel === 'gemini-2.5-flash' ? 'gemini-2.0-flash' : 'gemini-1.5-flash';
  const tertiaryModel = 'gemini-1.5-flash';

  const tryModel = async (targetModel: string, ms: number) => {
    const genPromise = ai.models.generateContent({
      model: targetModel,
      contents: prompt,
      config,
    }).then(res => {
      if (typeof (res as any)?.text === 'function') {
        return (res as any).text();
      }
      return res.text || '';
    });

    const timeoutPromise = new Promise<string>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`AI generation timed out after ${ms}ms on ${targetModel}`)), ms);
      genPromise.finally(() => clearTimeout(t));
    });

    return Promise.race([genPromise, timeoutPromise]);
  };

  try {
    return await tryModel(primaryModel, timeoutMs);
  } catch (primaryErr: any) {
    if (primaryModel !== secondaryModel) {
      console.warn(`[AI Engine] Primary model (${primaryModel}) encountered an issue (${primaryErr.message}). Failing over to secondary model (${secondaryModel})...`);
      try {
        return await tryModel(secondaryModel, timeoutMs);
      } catch (secErr: any) {
        if (secondaryModel !== tertiaryModel) {
          console.warn(`[AI Engine] Secondary failover (${secondaryModel}) encountered an issue (${secErr.message}). Failing over to tertiary model (${tertiaryModel})...`);
          try {
            return await tryModel(tertiaryModel, timeoutMs);
          } catch (tertiaryErr: any) {
            console.error(`[AI Engine] Tertiary failover (${tertiaryModel}) also failed:`, tertiaryErr);
            throw tertiaryErr;
          }
        }
        throw secErr;
      }
    }
    throw primaryErr;
  }
}

/**
 * AI-assisted Songwriting Credits Resolution:
 * When MusicBrainz recording has no Work linked, queries Gemini AI to identify
 * the verified songwriter(s), composer(s), and lyricist(s) for the track.
 */
export async function resolveAiSongwritingCredits(
  artist: string,
  title: string,
  album?: string,
  signal?: AbortSignal
): Promise<{ composers: { name: string; mbid?: string }[]; lyricists: { name: string; mbid?: string }[]; languages?: string[] }> {
  const apiKey = resolveAIKey();
  const aiConfig = getAIConfig();
  if (!apiKey && aiConfig.provider === 'gemini') {
    return { composers: [], lyricists: [] };
  }

  try {
    const prompt = `Identify the real, official songwriters, composers, and lyricists for the song:
Artist: "${artist}"
Title: "${title}"
${album ? `Album: "${album}"` : ''}

Respond ONLY with a JSON object matching this schema:
{
  "composers": ["Full Name 1", "Full Name 2"],
  "lyricists": ["Full Name 1", "Full Name 2"],
  "languages": ["eng"]
}
If composers and lyricists are the same or credited generally as writers, populate both or composers. If completely unknown, return empty arrays.`;

    let jsonText = '';
    if (aiConfig.provider === 'gemini' || !aiConfig.provider) {
      const ai = new GoogleGenAI({ apiKey });
      const model = aiConfig.modelName || 'gemini-2.5-flash';
      jsonText = await callGeminiWithTimeout(ai, model, prompt, {
        responseMimeType: 'application/json',
        temperature: 0.1,
      }, 15000);
    } else {
      const baseUrl = aiConfig.baseUrl.replace(/\/$/, '');
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: aiConfig.modelName || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal,
      });
      if (resp.ok) {
        const data = await resp.json();
        jsonText = data.choices?.[0]?.message?.content || '';
      }
    }

    const parsed = cleanAndParseJson<any>(jsonText, { composers: [], lyricists: [] });
    const composers = (Array.isArray(parsed.composers) ? parsed.composers : []).map((name: string) => ({ name: String(name).trim() })).filter((c: any) => c.name);
    const lyricists = (Array.isArray(parsed.lyricists) ? parsed.lyricists : []).map((name: string) => ({ name: String(name).trim() })).filter((l: any) => l.name);
    const languages = Array.isArray(parsed.languages) ? parsed.languages.map(String) : [];

    return { composers, lyricists, languages };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn('[AI Songwriting Resolver] Failed to resolve credits:', err.message);
    return { composers: [], lyricists: [] };
  }
}

/**
 * AI Precision Search Surgeon:
 * Invoked when tags are dirty, distorted, or MusicBrainz returned 0 matches.
 * Uses Gemini to parse, clean, and isolate the true Artist and Title, then re-queries MusicBrainz!
 */
export async function aiPrecisionQuerySurgeon(
  dirtyArtist: string,
  dirtyTitle: string,
  dirtyAlbum?: string,
  dirtyPath?: string,
  signal?: AbortSignal
): Promise<EnrichedSongRecord | null> {
  const aiConfig = getAIConfig();
  const apiKey = resolveAIKey();

  // If no AI key available, we can't run AI surgeon
  if (!apiKey && aiConfig.provider === 'gemini') {
    return null;
  }

  try {
    const prompt = `You are an expert music metadata surgeon. A music library has dirty, distorted, or concatenated audio tags.
Raw Artist: "${dirtyArtist}"
Raw Title: "${dirtyTitle}"
Raw Album: "${dirtyAlbum || ''}"
File Path: "${dirtyPath || ''}"

Identify the exact canonical artist name and song title for an official MusicBrainz search.
Strip any YouTube artifacts ("Official Music Video", "Topic", "Audio", "4K"), track numbers ("01", "02 - "), inverted fields ("Artist - Title" in the title slot), and extract featured artists.

Respond ONLY with valid JSON matching this schema:
{
  "artist": "string",
  "title": "string",
  "album": "string or empty",
  "confidenceScore": number (0 to 100)
}`;

    let jsonText = '';

    if (aiConfig.provider === 'gemini' || !aiConfig.provider) {
      const ai = new GoogleGenAI({ apiKey });
      const model = aiConfig.modelName || 'gemini-2.0-flash';
      jsonText = await callGeminiWithTimeout(ai, model, prompt, {
        responseMimeType: 'application/json',
        temperature: 0.1,
      });
    } else {
      // OpenAI-compatible endpoint
      const baseUrl = aiConfig.baseUrl.replace(/\/$/, '');
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: aiConfig.modelName || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal,
      });
      if (resp.ok) {
        const data = await resp.json();
        jsonText = data.choices?.[0]?.message?.content || '';
      }
    }

    if (!jsonText) return null;

    const parsed = cleanAndParseJson<any>(jsonText, null);
    if (!parsed) return null;

    const cleanArtist = parsed.artist?.trim();
    const cleanTitle = parsed.title?.trim();
    const cleanAlbum = parsed.album?.trim();

    if (!cleanArtist || !cleanTitle) return null;

    // Now re-query MusicBrainz with the AI-cleaned terms!
    const enriched = await queryMusicBrainzRecording(cleanArtist, cleanTitle, cleanAlbum, dirtyPath, signal);
    if (enriched) {
      // Mark with AI resolution status
      enriched.resolution.status = 'ai_search_resolved';
      enriched.resolution.source = 'musicbrainz';
      enriched.resolution.badgeLabel = '⚡ AI Search Resolved';
      enriched.resolution.cleanTerms = { artist: cleanArtist, title: cleanTitle, album: cleanAlbum };
      enriched.queryArtist = dirtyArtist;
      enriched.queryTitle = dirtyTitle;
      enriched.id = normalizeSongKey(dirtyArtist, dirtyTitle);
      return enriched;
    }

    return null;
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    console.warn(`AI precision surgeon error for "${dirtyArtist} - ${dirtyTitle}":`, e);
    return null;
  }
}

export interface BatchSurgeonTrackInput {
  id?: string;
  artist: string;
  title: string;
  album?: string;
  path?: string;
}

export interface BatchAiSurgeonResult {
  resolved: Map<string, EnrichedSongRecord>;
  unresolved: {
    id: string;
    artist: string;
    title: string;
    album?: string;
    path?: string;
    cleanArtist?: string;
    cleanTitle?: string;
    cleanAlbum?: string;
  }[];
}

/**
 * Batched AI Precision Search Surgeon (Fold 1):
 * Accepts up to 10 tracks with dirty/noisy tags in a single LLM prompt.
 * Asks AI to isolate canonical { artist, title, album }, extracting featured artists and stripping noise.
 * Then re-queries MusicBrainz for each item with the canonical terms.
 * Resolves matched items as 'ai_search_resolved' and saves them to IndexedDB.
 */
export async function batchAiPrecisionQuerySurgeon(
  tracks: BatchSurgeonTrackInput[],
  signal?: AbortSignal
): Promise<BatchAiSurgeonResult> {
  const result: BatchAiSurgeonResult = {
    resolved: new Map(),
    unresolved: [],
  };

  if (!tracks || tracks.length === 0) return result;

  const aiConfig = getAIConfig();
  const apiKey = resolveAIKey();

  // Pre-assign stable IDs if missing
  const indexedTracks = tracks.map((t, idx) => ({
    id: t.id || normalizeSongKey(t.artist, t.title) || `track_${idx}`,
    artist: t.artist || '',
    title: t.title || '',
    album: t.album || '',
    path: t.path || '',
  }));

  // If no AI key available, treat all as unresolved
  if (!apiKey && aiConfig.provider === 'gemini') {
    result.unresolved = indexedTracks;
    return result;
  }

  try {
    const promptTracksJson = JSON.stringify(
      indexedTracks.map(t => ({
        id: t.id,
        artist: t.artist,
        title: t.title,
        album: t.album,
        path: t.path,
      })),
      null,
      2
    );

    const prompt = `You are an expert music metadata surgeon. The following list of songs has dirty, noisy, or distorted tags.
For EACH track in the JSON list, extract and isolate the exact canonical primary artist name and song title for an official MusicBrainz catalog search.
- Strip YouTube artifacts ("Official Music Video", "Topic", "Audio", "4K", "Lyrics").
- Strip track numbers ("01", "02 - ").
- Invert fields if the title contains "Artist - Title".
- Strip bare hyphen remaster/version tags (e.g. "- 2015 Remastered", "- Remaster", "- Deluxe Edition", "- Instrumental").
- Extract featured artists into their own separate presence or isolate the primary artist.
- If title ends with trailing ellipses ("..."), repair or isolate the true title.

Input tracks:
${promptTracksJson}

Respond ONLY with valid JSON array containing one object per input track matching this schema:
[
  {
    "id": "string (matching input id)",
    "cleanArtist": "string",
    "cleanTitle": "string",
    "cleanAlbum": "string or empty"
  }
]`;

    let jsonText = '';

    if (aiConfig.provider === 'gemini' || !aiConfig.provider) {
      const ai = new GoogleGenAI({ apiKey });
      const model = aiConfig.modelName || 'gemini-2.5-flash';
      jsonText = await callGeminiWithTimeout(ai, model, prompt, {
        responseMimeType: 'application/json',
        temperature: 0.1,
      }, 25000);
    } else {
      const baseUrl = aiConfig.baseUrl.replace(/\/$/, '');
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: aiConfig.modelName || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal,
      });
      if (resp.ok) {
        const data = await resp.json();
        jsonText = data.choices?.[0]?.message?.content || '';
      }
    }

    let parsedList: { id: string; cleanArtist: string; cleanTitle: string; cleanAlbum?: string }[] = [];
    if (jsonText) {
      const parsed = cleanAndParseJson<any>(jsonText, []);
      if (Array.isArray(parsed)) {
        parsedList = parsed;
      } else if (parsed && Array.isArray(parsed.tracks)) {
        parsedList = parsed.tracks;
      } else if (parsed && Array.isArray(parsed.items)) {
        parsedList = parsed.items;
      }
    }

    const parsedMap = new Map<string, { cleanArtist?: string; cleanTitle?: string; cleanAlbum?: string }>();
    for (const p of parsedList) {
      if (p && p.id) {
        parsedMap.set(String(p.id), p);
      }
    }

    // Now re-query MusicBrainz for each track with the AI-cleaned terms (using ID mapping with positional fallback)
    for (let idx = 0; idx < indexedTracks.length; idx++) {
      if (signal?.aborted) break;
      const orig = indexedTracks[idx];

      const aiCleaned = parsedMap.get(orig.id) || parsedList[idx];
      const cleanArtist = aiCleaned?.cleanArtist?.trim() || orig.artist;
      const cleanTitle = aiCleaned?.cleanTitle?.trim() || orig.title;
      const cleanAlbum = aiCleaned?.cleanAlbum?.trim() || orig.album;

      const enriched = await queryMusicBrainzRecording(cleanArtist, cleanTitle, cleanAlbum, orig.path, signal);

      if (enriched) {
        // Tag with AI resolution metadata
        enriched.resolution.status = 'ai_search_resolved';
        enriched.resolution.source = 'musicbrainz';
        enriched.resolution.badgeLabel = '⚡ AI Search Resolved';
        enriched.resolution.cleanTerms = { artist: cleanArtist, title: cleanTitle, album: cleanAlbum };
        enriched.queryArtist = orig.artist;
        enriched.queryTitle = orig.title;
        enriched.id = orig.id;

        // Persist to IndexedDB
        await saveEnrichedTrack(enriched, true);
        result.resolved.set(orig.id, enriched);
      } else {
        result.unresolved.push({
          id: orig.id,
          artist: orig.artist,
          title: orig.title,
          album: orig.album,
          path: orig.path,
          cleanArtist,
          cleanTitle,
          cleanAlbum,
        });
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    console.error('Error in batchAiPrecisionQuerySurgeon:', e);
    result.unresolved = indexedTracks;
  }

  return result;
}

/**
 * Batched AI Fallback Synthesis (Fold 2):
 * Accepts up to 10 tracks that genuinely failed MusicBrainz after Fold 1 retry.
 * Generates fallback musicological metadata in a single LLM prompt.
 * Resolves items as 'ai_synthesized_fallback' and persists to IndexedDB.
 */
export async function batchAiSynthesizedFallback(
  tracks: { id: string; artist: string; title: string; album?: string; path?: string; cleanArtist?: string; cleanTitle?: string }[],
  signal?: AbortSignal
): Promise<Map<string, EnrichedSongRecord>> {
  const resolved = new Map<string, EnrichedSongRecord>();
  if (!tracks || tracks.length === 0) return resolved;

  const aiConfig = getAIConfig();
  const apiKey = resolveAIKey();

  const promptList = tracks.map(t => ({
    id: t.id,
    artist: t.cleanArtist || t.artist,
    title: t.cleanTitle || t.title,
    album: t.album || '',
  }));

  let aiMetadataMap = new Map<string, any>();
  let fallbackList: any[] = [];

  if (apiKey || aiConfig.provider === 'openai-compatible') {
    try {
      const prompt = `These songs are uncataloged on MusicBrainz (unreleased demos, bootlegs, soundcloud leaks).
Provide realistic fallback musicological metadata for EACH track based on your knowledge base.

Input tracks:
${JSON.stringify(promptList, null, 2)}

Respond ONLY with valid JSON array containing one object per input track matching this schema:
[
  {
    "id": "string (matching input id)",
    "culturalBucket": one of ["English", "J-Pop", "Naija", "K-Pop", "C-Pop", "Thai", "Vietnamese", "Dutch", "Arabic", "German", "Italian", "Portuguese", "Filipino", "I-Pop", "African", "Latina", "Français", "Gospel", "Instrumental", "Other"],
    "countryCode": "2-letter ISO (e.g. US, NG, JP, TH, NL, BR, VN, DE)",
    "countryName": "string",
    "genres": ["string", "string"],
    "estimatedYear": number or null,
    "artistType": "Person" or "Group"
  }
]`;

      let jsonText = '';
      if (aiConfig.provider === 'gemini' || !aiConfig.provider) {
        const ai = new GoogleGenAI({ apiKey });
        const model = aiConfig.modelName || 'gemini-2.5-flash';
        jsonText = await callGeminiWithTimeout(ai, model, prompt, {
          responseMimeType: 'application/json',
          temperature: 0.2,
        }, 25000);
      } else {
        const baseUrl = aiConfig.baseUrl.replace(/\/$/, '');
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: aiConfig.modelName || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.2,
          }),
          signal,
        });
        if (resp.ok) {
          const data = await resp.json();
          jsonText = data.choices?.[0]?.message?.content || '';
        }
      }

      if (jsonText) {
        const parsed = cleanAndParseJson<any>(jsonText, []);
        const list = Array.isArray(parsed) ? parsed : (parsed.tracks || parsed.items || []);
        fallbackList = list;
        for (const item of list) {
          if (item && item.id) {
            aiMetadataMap.set(String(item.id), item);
          }
        }
      }
    } catch (err) {
      console.warn('AI fallback batch generation error, using heuristic fallback:', err);
    }
  }

  const now = Date.now();
  for (let idx = 0; idx < tracks.length; idx++) {
    const t = tracks[idx];
    const effectiveArtist = t.cleanArtist || t.artist;
    const effectiveTitle = t.cleanTitle || t.title;
    const aiData = aiMetadataMap.get(t.id) || fallbackList[idx];

    const scriptSig = detectScriptSignature(`${effectiveTitle} ${effectiveArtist}`);
    let fallbackBucket: CanonicalBucket = aiData?.culturalBucket || (scriptSig ? scriptSig.bucket : 'Other');
    let countryCode = aiData?.countryCode || '';
    let countryName = aiData?.countryName || '';
    let genreList = Array.isArray(aiData?.genres) ? aiData.genres : ['Music'];
    let estimatedYear = aiData?.estimatedYear && !isNaN(aiData.estimatedYear) ? Number(aiData.estimatedYear) : undefined;

    const record: EnrichedSongRecord = {
      id: t.id,
      queryArtist: t.artist,
      queryTitle: t.title,
      queryAlbum: t.album,
      queryPath: t.path,
      recordingMbid: '',
      title: effectiveTitle,
      durationMs: undefined,
      durationFormatted: '',
      isrcs: [],
      acoustids: [],
      isVideo: false,
      artist: {
        artistMbid: '',
        name: effectiveArtist,
        sortName: effectiveArtist,
        type: aiData?.artistType === 'Group' ? 'Group' : 'Person',
        isActive: true,
        countryCode,
        countryName,
        aliases: [],
        bandMembers: [],
        creditedArtists: [{ name: effectiveArtist }],
        externalLinks: {},
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
        albumTitle: t.album || 'Single / Unknown Album',
        releaseType: 'Single',
        releaseStatus: 'Uncataloged',
        labels: [],
        mediaFormat: 'Digital Media',
        originalReleaseYear: estimatedYear,
        releaseDate: estimatedYear ? `${estimatedYear}-01-01` : undefined,
      },
      genres: genreList,
      tags: genreList.map((g: string) => ({ name: g, count: 1 })),
      culturalBucket: fallbackBucket,
      resolution: {
        status: 'ai_synthesized_fallback',
        source: 'ai_synthesized_fallback',
        isAiSynthesized: true,
        badgeLabel: '⚠️ AI Fallback (Not on MusicBrainz)',
        matchScore: 0,
        timestamp: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    setCachedClassification(effectiveArtist, {
      artist: effectiveArtist,
      bucket: fallbackBucket,
      country: countryCode,
      countryName: countryName,
      confidence: 'llm',
      sourceDetails: 'Deep Metadata Engine: AI Fallback Synthesis',
      timestamp: now,
    });

    await saveEnrichedTrack(record, true);
    resolved.set(t.id, record);
  }

  return resolved;
}

/**
 * Last-Resort AI Fallback Synthesis:
 * ONLY invoked when MusicBrainz genuinely has zero records (unreleased demos, bootlegs, soundcloud leaks).
 * Badged with "⚠️ AI Fallback (Not on MusicBrainz)"
 */
export async function aiSynthesizedFallback(
  artist: string,
  title: string,
  album?: string,
  path?: string,
  signal?: AbortSignal
): Promise<EnrichedSongRecord> {
  const { cleanArtist, cleanTitle, cleanAlbum } = sanitizeSongQuery(artist, title, album);
  const now = Date.now();
  const id = normalizeSongKey(artist, title);

  // Heuristic baseline in case AI fails or is offline
  const scriptSig = detectScriptSignature(`${cleanTitle} ${cleanArtist}`);
  let fallbackBucket: CanonicalBucket = scriptSig ? scriptSig.bucket : 'Other';

  let genreList = ['Music'];
  let countryCode = '';
  let countryName = '';
  let estimatedYear: number | undefined = undefined;

  const aiConfig = getAIConfig();
  const apiKey = resolveAIKey();

  if (apiKey || aiConfig.provider === 'openai-compatible') {
    try {
      const prompt = `This song is not cataloged on MusicBrainz. Provide realistic fallback musicological metadata based on your knowledge base.
Artist: "${cleanArtist}"
Title: "${cleanTitle}"
Album: "${cleanAlbum || ''}"

Return valid JSON with:
{
  "culturalBucket": one of ["English", "J-Pop", "Naija", "K-Pop", "C-Pop", "Thai", "Vietnamese", "Dutch", "Arabic", "German", "Italian", "Portuguese", "Filipino", "I-Pop", "African", "Latina", "Français", "Gospel", "Instrumental", "Other"],
  "countryCode": 2-letter ISO (e.g. US, NG, JP, TH, NL, BR, VN, DE),
  "countryName": string,
  "genres": string[],
  "estimatedYear": number or null,
  "artistType": "Person" or "Group"
}`;

      let jsonText = '';
      if (aiConfig.provider === 'gemini' || !aiConfig.provider) {
        const ai = new GoogleGenAI({ apiKey });
        const model = aiConfig.modelName || 'gemini-2.0-flash';
        jsonText = await callGeminiWithTimeout(ai, model, prompt, {
          responseMimeType: 'application/json',
          temperature: 0.2,
        }, 20000);
      } else {
        const baseUrl = aiConfig.baseUrl.replace(/\/$/, '');
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: aiConfig.modelName || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.2,
          }),
          signal,
        });
        if (resp.ok) {
          const data = await resp.json();
          jsonText = data.choices?.[0]?.message?.content || '';
        }
      }

      if (jsonText) {
        const parsed = cleanAndParseJson<any>(jsonText, null);
        if (parsed) {
          if (parsed.culturalBucket) fallbackBucket = parsed.culturalBucket as CanonicalBucket;
          if (parsed.countryCode) countryCode = parsed.countryCode;
          if (parsed.countryName) countryName = parsed.countryName;
          if (Array.isArray(parsed.genres)) genreList = parsed.genres;
          if (parsed.estimatedYear && !isNaN(parsed.estimatedYear)) estimatedYear = Number(parsed.estimatedYear);
        }
      }
    } catch (e) {
      console.warn('AI fallback generation encountered an error, falling back to heuristics:', e);
    }
  }

  const record: EnrichedSongRecord = {
    id,
    queryArtist: artist,
    queryTitle: title,
    queryAlbum: album,
    queryPath: path,
    recordingMbid: '',
    title: cleanTitle,
    durationMs: undefined,
    durationFormatted: '',
    isrcs: [],
    acoustids: [],
    isVideo: false,
    artist: {
      artistMbid: '',
      name: cleanArtist,
      sortName: cleanArtist,
      type: 'Person',
      isActive: true,
      countryCode,
      countryName,
      aliases: [],
      bandMembers: [],
      creditedArtists: [{ name: cleanArtist }],
      externalLinks: {},
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
      albumTitle: cleanAlbum || 'Single / Unknown Album',
      releaseType: 'Single',
      releaseStatus: 'Uncataloged',
      labels: [],
      mediaFormat: 'Digital Media',
      originalReleaseYear: estimatedYear,
      releaseDate: estimatedYear ? `${estimatedYear}-01-01` : undefined,
    },
    genres: genreList,
    tags: genreList.map(g => ({ name: g, count: 1 })),
    culturalBucket: fallbackBucket,
    resolution: {
      status: 'ai_synthesized_fallback',
      source: 'ai_synthesized_fallback',
      isAiSynthesized: true,
      badgeLabel: '⚠️ AI Fallback (Not on MusicBrainz)',
      matchScore: 0,
      timestamp: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  // Sync fallback classification with Module 13 cache
  setCachedClassification(cleanArtist, {
    artist: cleanArtist,
    bucket: fallbackBucket,
    country: countryCode,
    countryName: countryName,
    confidence: 'llm',
    sourceDetails: 'Deep Metadata Engine: AI Fallback Synthesis',
    timestamp: now,
  });

  return record;
}

/**
 * Orchestrator: Enrich a single track with intelligent retry workflow:
 * 1. Check IndexedDB cache (unless forceUpdate is true) -> 0ms
 * 2. Sanitize & query MusicBrainz recording -> Verified MB data
 * 3. If zero or low match: trigger AI Precision Query Surgeon -> Re-query MusicBrainz
 * 4. If still zero: mark as needs_resolution or last-resort AI fallback
 * 5. Save enriched record to IndexedDB
 */
export async function processTrackEnrichment(
  track: { artist: string; title: string; album?: string; path?: string },
  forceUpdate = false,
  signal?: AbortSignal
): Promise<{ record: EnrichedSongRecord; isCacheHit: boolean }> {
  const { artist, title, album, path } = track;

  // 1. Check local IndexedDB first
  if (!forceUpdate) {
    const cached = await getEnrichedTrack(artist, title);
    if (cached) {
      return { record: cached, isCacheHit: true };
    }
  }

  // 2. Direct MusicBrainz recording query
  let enriched = await queryMusicBrainzRecording(artist, title, album, path, signal);

  // 3. If found on MusicBrainz, persist to IndexedDB
  if (enriched) {
    await saveEnrichedTrack(enriched, true);
    return { record: enriched, isCacheHit: false };
  }

  // 4. If not found on MusicBrainz, construct a structured "needs_resolution" record
  // (AI precision surgeon and fallback are decoupled into batched remediation queue)
  const { cleanArtist, cleanTitle, cleanAlbum } = sanitizeSongQuery(artist, title, album);
  const scriptSig = detectScriptSignature(`${cleanTitle} ${cleanArtist}`);
  const culturalBucket: CanonicalBucket = scriptSig ? scriptSig.bucket : 'Other';
  const now = Date.now();

  enriched = {
    id: normalizeSongKey(artist, title),
    queryArtist: artist,
    queryTitle: title,
    queryAlbum: album,
    queryPath: path,
    recordingMbid: '',
    title: cleanTitle,
    durationMs: undefined,
    durationFormatted: '',
    isrcs: [],
    acoustids: [],
    isVideo: false,
    artist: {
      artistMbid: '',
      name: cleanArtist,
      sortName: cleanArtist,
      type: 'Person',
      isActive: true,
      aliases: [],
      bandMembers: [],
      creditedArtists: [{ name: cleanArtist }],
      externalLinks: {},
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
      albumTitle: cleanAlbum || '',
      releaseType: 'Unknown',
      releaseStatus: 'Uncataloged',
      labels: [],
    },
    genres: [],
    tags: [],
    culturalBucket,
    resolution: {
      status: 'needs_resolution',
      source: 'manual',
      isAiSynthesized: false,
      badgeLabel: '⚠️ Needs Resolution',
      failureReason: 'NO_MATCH',
      matchScore: 0,
      timestamp: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  // NOTE: Never persist 'needs_resolution' to IndexedDB!
  return { record: enriched, isCacheHit: false };
}

/**
 * Batch Enrichment Pipeline with rate limiter and live progress reporting
 */
export async function runBatchEnrichment(
  tracks: { artist: string; title: string; album?: string; path?: string }[],
  options: EnrichmentOptions = {}
): Promise<{ records: EnrichedSongRecord[]; stats: EnrichmentStats }> {
  const stats: EnrichmentStats = {
    totalProcessed: 0,
    cacheHits: 0,
    mbEnriched: 0,
    needsResolution: 0,
    aiSynthesized: 0,
    manualResolved: 0,
  };

  const records: EnrichedSongRecord[] = [];
  const total = tracks.length;

  for (let i = 0; i < tracks.length; i++) {
    if (options.signal?.aborted) break;

    const track = tracks[i];
    options.onProgress?.({
      processed: i,
      total,
      currentTrack: `${track.artist} - ${track.title}`,
      currentStatus: 'Processing...',
      stats,
    });

    try {
      const { record, isCacheHit } = await processTrackEnrichment(track, options.forceUpdate, options.signal);
      records.push(record);
      stats.totalProcessed++;

      if (isCacheHit) {
        stats.cacheHits++;
      } else if (record.resolution.status === 'enriched' || record.resolution.status === 'ai_search_resolved') {
        stats.mbEnriched++;
      } else if (record.resolution.status === 'ai_synthesized_fallback') {
        stats.aiSynthesized++;
      } else if (record.resolution.status === 'needs_resolution') {
        stats.needsResolution++;
      } else if (record.resolution.status === 'manual_resolved') {
        stats.manualResolved++;
      }

      options.onTrackEnriched?.(record);
    } catch (err: any) {
      if (err.name === 'AbortError') break;
      console.error(`Error processing track ${track.artist} - ${track.title}:`, err);
    }
  }

  options.onProgress?.({
    processed: records.length,
    total,
    currentTrack: undefined,
    currentStatus: 'Complete',
    stats,
  });

  return { records, stats };
}

/**
 * Ultra-Dense 38-Column CSV Exporter with UTF-8 BOM
 */
export function exportToEnrichedCsv(records: EnrichedSongRecord[]): string {
  const BOM = '\uFEFF';
  const headers = ENRICHED_CSV_COLUMNS.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');

  const rows = records.map(record => {
    return ENRICHED_CSV_COLUMNS.map(col => {
      const val = col.get(record);
      const str = val === undefined || val === null ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',');
  });

  return BOM + [headers, ...rows].join('\r\n');
}

/**
 * Master JSON Exporter
 */
export function exportToMasterJson(records: EnrichedSongRecord[]): string {
  const payload = {
    appName: 'Playlist Haven',
    module: 'Deep Metadata Enrichment Engine',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    totalTracks: records.length,
    tracks: records,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Tagged M3U8 Playlist Exporter with MusicBrainz MBIDs and release years
 */
export function exportToTaggedM3u8(records: EnrichedSongRecord[]): string {
  const lines: string[] = ['#EXTM3U', '#PLAYLIST:Playlist Haven - Deep Enriched Library'];

  for (const r of records) {
    const durationSec = r.durationMs ? Math.round(r.durationMs / 1000) : -1;
    const title = r.title || r.queryTitle;
    const artist = r.artist?.name || r.queryArtist;
    const year = r.release?.originalReleaseYear || '';
    const mbid = r.recordingMbid ? ` mbid="${r.recordingMbid}"` : '';
    const bucket = r.culturalBucket ? ` bucket="${r.culturalBucket}"` : '';

    lines.push(`#EXTINF:${durationSec}${mbid}${bucket},${artist} - ${title}${year ? ` (${year})` : ''}`);
    if (r.queryPath) {
      lines.push(r.queryPath);
    } else {
      lines.push(`${artist} - ${title}.mp3`);
    }
  }

  return lines.join('\n');
}

/**
 * Downloader CLI Clean TXT Exporter (spotdl / yt-dlp format)
 */
export function exportToDownloaderTxt(records: EnrichedSongRecord[]): string {
  return records
    .map(r => `${r.artist?.name || r.queryArtist} - ${r.title || r.queryTitle}`)
    .filter(Boolean)
    .join('\n');
}

/**
 * Deep Track Hydration & Self-Healing:
 * Checks if track has missing artist bio (country, beginArea, birthDate) or empty songwriting credits.
 * Automatically fetches artist details from MB / cache and queries AI for songwriting credits if missing.
 * Persists the updated record to IndexedDB.
 */
export async function hydrateTrackDossier(
  track: EnrichedSongRecord,
  signal?: AbortSignal
): Promise<EnrichedSongRecord> {
  let modified = false;
  const updated: EnrichedSongRecord = JSON.parse(JSON.stringify(track));

  // 1. If artist MBID exists, ensure full artist details are populated
  const artistMbid = updated.artist?.artistMbid;
  const needsArtistHydration = !updated.artist?.beginArea || 
    !updated.artist?.countryCode || 
    updated.artist?.countryCode === 'XW' || 
    updated.artist?.countryCode === 'XE' || 
    !updated.artist?.birthDate;

  if (artistMbid && needsArtistHydration) {
    try {
      const bio = await fetchArtistDetails(artistMbid, signal);
      if (bio) {
        updated.artist = {
          ...updated.artist,
          ...bio,
          creditedArtists: updated.artist.creditedArtists?.length ? updated.artist.creditedArtists : bio.creditedArtists,
          externalLinks: { ...bio.externalLinks, ...updated.artist.externalLinks },
        };
        if (bio.countryCode && bio.countryCode !== 'XW' && bio.countryCode !== 'XE' && bio.countryCode !== 'XU') {
          updated.artist.countryCode = bio.countryCode;
          updated.artist.countryName = bio.countryName || bio.primaryArea || bio.countryCode;
        }
        modified = true;
      }
    } catch (e) {
      console.warn('[hydrateTrackDossier] Failed to fetch artist details:', e);
    }
  }

  // 2. If recordingMbid exists and relations/work were never fetched, fetch recording details
  if (updated.recordingMbid && (!updated.work || (updated.work.composers.length === 0 && updated.work.lyricists.length === 0))) {
    try {
      const detailed = await fetchRecordingDetails(
        updated.recordingMbid,
        updated.queryArtist,
        updated.queryTitle,
        updated.queryAlbum,
        updated.queryPath,
        signal
      );
      if (detailed && detailed.work && (detailed.work.composers.length > 0 || detailed.work.lyricists.length > 0)) {
        updated.work = detailed.work;
        modified = true;
      }
    } catch (e) {
      console.warn('[hydrateTrackDossier] Failed to fetch recording details:', e);
    }
  }

  // 3. If still no composers or lyricists, resolve with AI
  if ((!updated.work || (updated.work.composers.length === 0 && updated.work.lyricists.length === 0)) && (resolveAIKey() || getAIConfig().provider === 'openai-compatible')) {
    try {
      const aiCredits = await resolveAiSongwritingCredits(
        updated.artist?.name || updated.queryArtist,
        updated.title || updated.queryTitle,
        updated.release?.albumTitle || updated.queryAlbum,
        signal
      );
      if (aiCredits.composers.length > 0 || aiCredits.lyricists.length > 0) {
        if (!updated.work) {
          updated.work = {
            lyricsLanguages: [],
            composers: [],
            lyricists: [],
            arrangers: [],
            producers: [],
            engineers: [],
            relationships: [],
          };
        }
        updated.work.composers = aiCredits.composers;
        updated.work.lyricists = aiCredits.lyricists;
        if (aiCredits.languages && aiCredits.languages.length > 0 && updated.work.lyricsLanguages.length === 0) {
          updated.work.lyricsLanguages = aiCredits.languages;
        }
        modified = true;
      }
    } catch (e) {
      console.warn('[hydrateTrackDossier] Failed to resolve AI songwriting credits:', e);
    }
  }

  if (modified) {
    updated.updatedAt = Date.now();
    await saveEnrichedTrack(updated, true);
  }

  return updated;
}

/**
 * Remediate a single unresolved track using 2-fold AI remediation:
 * 1. Fold 1: Precision Surgeon (cleans query & re-queries MusicBrainz)
 * 2. Fold 2: Fallback Synthesis (synthesizes metadata directly with AI if not on MusicBrainz)
 * Returns the updated EnrichedSongRecord and automatically saves to IndexedDB.
 */
export async function remediateSingleTrack(
  track: EnrichedSongRecord,
  signal?: AbortSignal
): Promise<EnrichedSongRecord> {
  const surgeonInput = [{
    id: track.id,
    artist: track.artist?.name || track.queryArtist,
    title: track.title || track.queryTitle,
    album: track.release?.albumTitle || track.queryAlbum,
    path: track.queryPath,
  }];

  // Fold 1: Try AI Precision Surgeon + MusicBrainz
  const surgeonResult = await batchAiPrecisionQuerySurgeon(surgeonInput, signal);
  if (surgeonResult.resolved.has(track.id)) {
    const resolved = surgeonResult.resolved.get(track.id)!;
    await saveEnrichedTrack(resolved, true);
    return resolved;
  }

  // Fold 2: AI Synthesized Fallback
  const unresolvedItem = surgeonResult.unresolved[0] || {
    id: track.id,
    artist: track.artist?.name || track.queryArtist,
    title: track.title || track.queryTitle,
    album: track.release?.albumTitle || track.queryAlbum,
    path: track.queryPath,
  };

  const fallbackMap = await batchAiSynthesizedFallback([unresolvedItem], signal);
  if (fallbackMap.has(track.id)) {
    const fallback = fallbackMap.get(track.id)!;
    await saveEnrichedTrack(fallback, true);
    return fallback;
  }

  return track;
}
