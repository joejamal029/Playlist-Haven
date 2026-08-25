import { PRE_SEEDED_ARTIST_CACHE } from './preSeededArtistData';
import { getAIConfig } from './visionEngine';
import { GoogleGenAI, Type } from '@google/genai';

export const CLASSIFICATION_CACHE_KEY = 'playlist_haven_artist_language_cache';

export type ClassificationConfidence = 
  | 'user'         // From pre-seeded base database / user CSV
  | 'cache'        // Stored from previous session
  | 'script'       // Detected via Unicode script histogram
  | 'musicbrainz'  // Sourced from MusicBrainz API area/country
  | 'llm'          // Sourced from Gemini AI (search-grounded fallback)
  | 'manual'       // Explicit user manual override (permanent)
  | 'unresolved';  // Still unknown / needs manual classification

export interface ArtistClassification {
  artist: string;
  bucket: CanonicalBucket;
  country?: string;
  countryName?: string;
  confidence: ClassificationConfidence;
  sourceDetails?: string;
  mbid?: string;
  timestamp: number;
}

export type CanonicalBucket =
  | 'English'
  | 'J-Pop'
  | 'Naija'
  | 'K-Pop'
  | 'C-Pop'
  | 'Instrumental'
  | 'Gospel'
  | 'Filipino'
  | 'I-Pop'
  | 'African'
  | 'Latina'
  | 'Français'
  | 'Other';

export interface BucketMetadata {
  name: CanonicalBucket;
  displayName: string;
  colorClass: string;
  badgeBg: string;
  borderClass: string;
  description: string;
}

export const CANONICAL_BUCKETS: Record<CanonicalBucket, BucketMetadata> = {
  'English': {
    name: 'English',
    displayName: 'English (UK / US / CA / AU / Global)',
    colorClass: 'text-blue-400',
    badgeBg: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    borderClass: 'border-blue-500/40',
    description: 'English-language tracks from UK, US, Canada, Australia, and international releases.',
  },
  'J-Pop': {
    name: 'J-Pop',
    displayName: 'J-Pop / Japanese',
    colorClass: 'text-rose-400',
    badgeBg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    borderClass: 'border-rose-500/40',
    description: 'Japanese pop, rock, vocaloid, anime themes, and city pop.',
  },
  'Naija': {
    name: 'Naija',
    displayName: 'Naija (Afrobeats / Nigerian)',
    colorClass: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    borderClass: 'border-emerald-500/40',
    description: 'Nigerian Afrobeats, Street-pop, Fuji, Highlife, and Alté.',
  },
  'K-Pop': {
    name: 'K-Pop',
    displayName: 'K-Pop / Korean',
    colorClass: 'text-purple-400',
    badgeBg: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    borderClass: 'border-purple-500/40',
    description: 'Korean pop, K-hiphop, K-R&B, and OSTs.',
  },
  'C-Pop': {
    name: 'C-Pop',
    displayName: 'C-Pop / Chinese (TW / CN / HK)',
    colorClass: 'text-amber-400',
    badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    borderClass: 'border-amber-500/40',
    description: 'Mandarin, Cantonese, Taiwanese pop, ballads, and indie.',
  },
  'Instrumental': {
    name: 'Instrumental',
    displayName: 'Instrumental / Lofi / OST',
    colorClass: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    borderClass: 'border-cyan-500/40',
    description: 'Pure instrumental tracks, soundtracks, piano solos, lofi beats, and ambient noise.',
  },
  'Gospel': {
    name: 'Gospel',
    displayName: 'Gospel / Christian & Teaching',
    colorClass: 'text-yellow-400',
    badgeBg: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
    borderClass: 'border-yellow-500/40',
    description: 'Christian worship, hymns, praise, and spoken ministry.',
  },
  'Filipino': {
    name: 'Filipino',
    displayName: 'Filipino / OPM',
    colorClass: 'text-orange-400',
    badgeBg: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    borderClass: 'border-orange-500/40',
    description: 'Original Pilipino Music (OPM), Tagalog pop, and acoustic.',
  },
  'I-Pop': {
    name: 'I-Pop',
    displayName: 'I-Pop / Indian Subcontinent',
    colorClass: 'text-indigo-400',
    badgeBg: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    borderClass: 'border-indigo-500/40',
    description: 'Hindi, Punjabi, Bollywood, Bengali, and Indian independent pop.',
  },
  'African': {
    name: 'African',
    displayName: 'African (Continental / Pan-African)',
    colorClass: 'text-lime-400',
    badgeBg: 'bg-lime-500/10 text-lime-300 border-lime-500/30',
    borderClass: 'border-lime-500/40',
    description: 'Amapiano, Ghanaian Highlife, Francophone African, and East/South African releases.',
  },
  'Latina': {
    name: 'Latina',
    displayName: 'Latina / Spanish & Reggaeton',
    colorClass: 'text-red-400',
    badgeBg: 'bg-red-500/10 text-red-300 border-red-500/30',
    borderClass: 'border-red-500/40',
    description: 'Reggaeton, Latin pop, Salsa, Bachata, and Spanish-language releases.',
  },
  'Français': {
    name: 'Français',
    displayName: 'Français / French-speaking',
    colorClass: 'text-sky-400',
    badgeBg: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    borderClass: 'border-sky-500/40',
    description: 'French chansons, French rap, and Francophone Belgian/Swiss artists.',
  },
  'Other': {
    name: 'Other',
    displayName: 'Other / Unclassified',
    colorClass: 'text-slate-400',
    badgeBg: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
    borderClass: 'border-slate-500/40',
    description: 'Uncategorized, mixed, multilingual, or less common regional music.',
  },
};

export const BUCKET_CONSOLIDATION_MAP: Record<string, CanonicalBucket> = {
  'english': 'English',
  'english/rap': 'English',
  'pop': 'English',
  'country': 'English',
  'reggae': 'English',
  'j-pop': 'J-Pop',
  'j-pop/vocaloid': 'J-Pop',
  'japanese': 'J-Pop',
  'naija': 'Naija',
  'nigerian': 'Naija',
  'afrobeats': 'Naija',
  'k-pop': 'K-Pop',
  'korean': 'K-Pop',
  'c-pop': 'C-Pop',
  'chinese': 'C-Pop',
  'mandopop': 'C-Pop',
  'cantopop': 'C-Pop',
  'instrumental music': 'Instrumental',
  'instrumental': 'Instrumental',
  'lofi': 'Instrumental',
  'white noise': 'Instrumental',
  'ost': 'Instrumental',
  'soundtrack': 'Instrumental',
  'gospel': 'Gospel',
  'bible teaching': 'Gospel',
  'christian': 'Gospel',
  'worship': 'Gospel',
  'filipino': 'Filipino',
  'tagalog': 'Filipino',
  'opm': 'Filipino',
  'i-pop': 'I-Pop',
  'indian': 'I-Pop',
  'bollywood': 'I-Pop',
  'hindi': 'I-Pop',
  'punjabi': 'I-Pop',
  'african': 'African',
  'amapiano': 'African',
  'afro': 'African',
  'latina': 'Latina',
  'latin': 'Latina',
  'spanish': 'Latina',
  'reggaeton': 'Latina',
  'français': 'Français',
  'french': 'Français',
  'nether-pop': 'Other',
  'dutch': 'Other',
  'ukrainian': 'Other',
  'v-pop': 'Other',
  'vietnamese': 'Other',
  'intro': 'Other',
  'genre': 'Other',
  'other': 'Other',
  'unknown': 'Other',
  '<unknown>': 'Other',
};

export const COUNTRY_TO_BUCKET: Record<string, CanonicalBucket> = {
  // English-speaking primary countries
  US: 'English', GB: 'English', UK: 'English', CA: 'English', AU: 'English', 
  NZ: 'English', IE: 'English', JM: 'English', BB: 'English', BS: 'English',
  
  // East Asian
  JP: 'J-Pop', 
  KR: 'K-Pop', KP: 'K-Pop',
  TW: 'C-Pop', CN: 'C-Pop', HK: 'C-Pop', MO: 'C-Pop', SG: 'C-Pop',
  
  // Nigerian & African
  NG: 'Naija',
  GH: 'African', ZA: 'African', KE: 'African', TZ: 'African',
  CM: 'African', SN: 'African', CI: 'African', UG: 'African',
  ZW: 'African', CD: 'African', CG: 'African', ET: 'African',
  
  // Indian subcontinent
  IN: 'I-Pop', PK: 'I-Pop', BD: 'I-Pop', LK: 'I-Pop', NP: 'I-Pop',
  
  // Latin & Spanish
  MX: 'Latina', CO: 'Latina', PR: 'Latina', AR: 'Latina', CL: 'Latina',
  PE: 'Latina', VE: 'Latina', CU: 'Latina', DO: 'Latina', ES: 'Latina',
  BR: 'Latina', EC: 'Latina', GT: 'Latina', CR: 'Latina', PA: 'Latina',
  
  // French-speaking
  FR: 'Français', BE: 'Français', CH: 'Français', MC: 'Français',
  
  // Filipino
  PH: 'Filipino',
  
  // European countries that predominantly sing/record in English
  SE: 'English', NO: 'English', DK: 'English', FI: 'English',
  IS: 'English', NL: 'English', DE: 'English', AT: 'English',
};

export interface ClusteredTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: string;
  filePath?: string;
  rawPlayCount?: number;
  classification: ArtistClassification;
  originalData?: any;
}

export interface ClassificationProgress {
  totalTracks: number;
  totalUniqueArtists: number;
  resolvedArtists: number;
  currentArtist?: string;
  currentTier?: string;
  tierCounts: {
    user: number;
    script: number;
    musicbrainz: number;
    llm: number;
    manual: number;
    unresolved: number;
  };
  isCancelled: boolean;
  isProcessing: boolean;
}

// In-memory runtime cache layer
let runtimeCache: Map<string, ArtistClassification> = new Map();
let isCacheInitialized = false;

export function normalizeArtistKey(artist: string): string {
  if (!artist) return '';
  return artist
    .toLowerCase()
    .replace(/\s*-\s*topic$/i, '')       // Strip YouTube " - Topic"
    .replace(/^the\s+/i, '')             // Strip leading "The " for matching
    .replace(/\s+/g, ' ')                // Collapse whitespace
    .trim();
}

/**
 * Split composite multi-artists into individual tokens
 * Handles "Wizkid, Skepta, Naira Marley", "Vaundy ft. Ado", "Dave & Central Cee"
 */
export function extractArtistNames(compositeArtist: string): string[] {
  if (!compositeArtist) return [];
  
  // Replace delimiters with standard commas
  const cleaned = compositeArtist
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s+(?:ft\.?|feat\.?|featuring|with|x|vs\.?)\s+/gi, ', ')
    .replace(/\s*;\s*/g, ', ')
    .replace(/\s*&\s*/g, ', ')
    .replace(/\s*\/\s*/g, ', ');
  
  return cleaned
    .split(',')
    .map(a => a.trim())
    .filter(a => a.length > 0 && a !== '<unknown>');
}

/**
 * Initialize cache by combining pre-seeded dataset with localStorage overrides
 */
export function initClassificationCache(): Map<string, ArtistClassification> {
  if (isCacheInitialized) return runtimeCache;

  runtimeCache = new Map();

  // 1. Load 1,341 pre-seeded baseline artists
  if (PRE_SEEDED_ARTIST_CACHE) {
    for (const [key, entry] of Object.entries(PRE_SEEDED_ARTIST_CACHE)) {
      runtimeCache.set(key, {
        artist: entry.artist,
        bucket: entry.bucket as CanonicalBucket,
        confidence: 'user',
        sourceDetails: 'Pre-seeded base library',
        timestamp: 0,
      });
    }
  }

  // 2. Load stored localStorage cache (contains previous runtime runs + manual edits)
  try {
    const saved = localStorage.getItem(CLASSIFICATION_CACHE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [key, val] of Object.entries(parsed)) {
        runtimeCache.set(key, val as ArtistClassification);
      }
    }
  } catch (e) {
    console.error('Failed to load artist classification cache from localStorage:', e);
  }

  isCacheInitialized = true;
  return runtimeCache;
}

/**
 * Save current runtime cache to localStorage
 */
export function saveClassificationCache(): void {
  try {
    const obj: Record<string, ArtistClassification> = {};
    for (const [k, v] of runtimeCache.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(CLASSIFICATION_CACHE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('Failed to save artist classification cache to localStorage:', e);
  }
}

/**
 * Get cached classification for an artist with multi-artist fallback
 */
export function getCachedClassification(artistName: string): ArtistClassification | null {
  initClassificationCache();
  
  const exactKey = normalizeArtistKey(artistName);
  if (runtimeCache.has(exactKey)) {
    return runtimeCache.get(exactKey)!;
  }

  // Multi-artist fallback: check if first primary artist is known
  const tokens = extractArtistNames(artistName);
  if (tokens.length > 1) {
    for (const token of tokens) {
      const tokenKey = normalizeArtistKey(token);
      if (runtimeCache.has(tokenKey)) {
        const primary = runtimeCache.get(tokenKey)!;
        return {
          ...primary,
          artist: artistName,
          sourceDetails: `Inherited from primary artist: ${token}`,
        };
      }
    }
  }

  return null;
}

/**
 * Store an artist classification in cache
 */
export function setCachedClassification(artistName: string, classification: ArtistClassification): void {
  initClassificationCache();
  const key = normalizeArtistKey(artistName);
  
  // If existing is manual, do not overwrite unless this new one is also manual
  const existing = runtimeCache.get(key);
  if (existing && existing.confidence === 'manual' && classification.confidence !== 'manual') {
    return;
  }

  runtimeCache.set(key, classification);
  saveClassificationCache();
}

/**
 * Tier 1: Unicode Script Histogram Detector
 * Examines text for non-Latin script signatures
 */
export function detectScriptSignature(text: string): { bucket: CanonicalBucket; scriptName: string } | null {
  if (!text) return null;

  const hasHangul = /\p{Script=Hangul}/u.test(text);
  const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  const hasHan = /\p{Script=Han}/u.test(text);
  const hasDevanagari = /\p{Script=Devanagari}/u.test(text);
  const hasArabic = /\p{Script=Arabic}/u.test(text);
  const hasCyrillic = /\p{Script=Cyrillic}/u.test(text);
  const hasThai = /\p{Script=Thai}/u.test(text);

  if (hasHangul) {
    return { bucket: 'K-Pop', scriptName: 'Hangul (Korean)' };
  }
  if (hasKana) {
    return { bucket: 'J-Pop', scriptName: 'Kana (Japanese)' };
  }
  if (hasHan && !hasKana && !hasHangul) {
    // Pure Han characters without Kana/Hangul strongly indicate C-Pop
    return { bucket: 'C-Pop', scriptName: 'Han (Chinese)' };
  }
  if (hasDevanagari) {
    return { bucket: 'I-Pop', scriptName: 'Devanagari (Indian)' };
  }
  if (hasArabic) {
    return { bucket: 'Other', scriptName: 'Arabic' };
  }
  if (hasCyrillic) {
    return { bucket: 'Other', scriptName: 'Cyrillic' };
  }
  if (hasThai) {
    return { bucket: 'Other', scriptName: 'Thai' };
  }

  return null;
}

/**
 * Tier 2: MusicBrainz API Search with rate-limit queue
 */
let lastMusicBrainzRequestTime = 0;
const MUSICBRAINZ_MIN_INTERVAL_MS = 1100; // Strict rate-limit: >1 req/sec

export async function queryMusicBrainz(
  artistName: string,
  signal?: AbortSignal
): Promise<ArtistClassification | null> {
  const cleanName = artistName.replace(/\s*-\s*topic$/i, '').trim();
  if (!cleanName || cleanName === '<unknown>') return null;

  // Rate-limit throttle
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
        });
      }
    });
  }

  lastMusicBrainzRequestTime = Date.now();

  try {
    const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent('"' + cleanName + '"')}&fmt=json&limit=3`;
    const response = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PlaylistHaven/1.0.0 (https://github.com/joejamal029/Playlist-Haven; contact@playlisthaven.app)',
      },
    });

    if (!response.ok) {
      if (response.status === 503) {
        console.warn('MusicBrainz rate limit busy (503)');
      }
      return null;
    }

    const data = await response.json();
    if (!data.artists || data.artists.length === 0) {
      return null;
    }

    // Pick best match (top result with score >= 70)
    const match = data.artists[0];
    if (match.score && match.score < 70) {
      return null;
    }

    const countryCode = match.country || (match.area && match.area.type === 'Country' ? match.area['iso-3166-1-codes']?.[0] : undefined);
    const areaName = match.area?.name || match['begin-area']?.name;
    const disambiguation = match.disambiguation;

    let bucket: CanonicalBucket = 'Other';

    if (countryCode && COUNTRY_TO_BUCKET[countryCode]) {
      bucket = COUNTRY_TO_BUCKET[countryCode];
    } else if (areaName) {
      // Fuzzy area name matches
      const areaLower = areaName.toLowerCase();
      if (areaLower.includes('nigeria') || areaLower.includes('lagos')) bucket = 'Naija';
      else if (areaLower.includes('japan') || areaLower.includes('tokyo')) bucket = 'J-Pop';
      else if (areaLower.includes('korea') || areaLower.includes('seoul')) bucket = 'K-Pop';
      else if (areaLower.includes('taiwan') || areaLower.includes('china') || areaLower.includes('hong kong')) bucket = 'C-Pop';
      else if (areaLower.includes('philippines') || areaLower.includes('manila')) bucket = 'Filipino';
      else if (areaLower.includes('india') || areaLower.includes('mumbai')) bucket = 'I-Pop';
      else if (areaLower.includes('france') || areaLower.includes('paris')) bucket = 'Français';
      else if (areaLower.includes('puerto rico') || areaLower.includes('colombia') || areaLower.includes('spain')) bucket = 'Latina';
      else if (areaLower.includes('united states') || areaLower.includes('united kingdom') || areaLower.includes('canada')) bucket = 'English';
    }

    // Tag check: if tags contain "k-pop", "j-pop", "afrobeats", "gospel", refine bucket
    if (match.tags && Array.isArray(match.tags)) {
      const tagNames = match.tags.map((t: any) => (t.name || '').toLowerCase());
      if (tagNames.some((t: string) => t.includes('gospel') || t.includes('christian'))) {
        bucket = 'Gospel';
      } else if (tagNames.some((t: string) => t.includes('anime') || t.includes('vocaloid'))) {
        bucket = 'J-Pop';
      } else if (tagNames.some((t: string) => t.includes('afrobeats') || t.includes('naija'))) {
        bucket = 'Naija';
      }
    }

    return {
      artist: cleanName,
      bucket,
      country: countryCode,
      countryName: areaName,
      confidence: 'musicbrainz',
      sourceDetails: `MusicBrainz: ${match.name} (${areaName || countryCode || 'Match'})${disambiguation ? ` - ${disambiguation}` : ''}`,
      mbid: match.id,
      timestamp: Date.now(),
    };
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    console.warn(`MusicBrainz lookup failed for ${cleanName}:`, e.message);
    return null;
  }
}

/**
 * Tier 3: Free-Tier Resilient Gemini LLM Batch Classifier
 * Includes exponential backoff with jitter, 429 quota catch, AbortController support
 */
export async function batchClassifyWithLLM(
  unresolvedArtists: string[],
  signal?: AbortSignal,
  onProgressMessage?: (msg: string) => void
): Promise<Map<string, ArtistClassification>> {
  const results = new Map<string, ArtistClassification>();
  if (unresolvedArtists.length === 0) return results;

  const aiConfig = getAIConfig();
  let apiKey = aiConfig.apiKey;
  if (!apiKey) {
    try {
      // @ts-ignore
      apiKey = import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.VITE_API_KEY || '';
    } catch (e) {}
  }

  const isGemini = aiConfig.provider === 'gemini' || !aiConfig.provider;
  const isLocal = aiConfig.provider === 'openai-compatible';

  if (!apiKey && isGemini) {
    if (onProgressMessage) {
      onProgressMessage('Gemini API key missing (click AI Settings to configure).');
    }
    console.warn('No Gemini API key configured. Skipping LLM Tier.');
    return results;
  }

  // Pack in batches of up to 30 artists to conserve RPM
  const BATCH_SIZE = 30;
  const batches: string[][] = [];
  for (let i = 0; i < unresolvedArtists.length; i += BATCH_SIZE) {
    batches.push(unresolvedArtists.slice(i, i + BATCH_SIZE));
  }

  const modelName = aiConfig.modelName && aiConfig.modelName !== 'gemini-3-flash-preview' 
    ? aiConfig.modelName 
    : 'gemini-2.5-flash';

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    if (signal?.aborted) break;

    const batch = batches[bIdx];
    if (onProgressMessage) {
      onProgressMessage(`AI Batch ${bIdx + 1}/${batches.length} (${batch.length} artists with ${modelName})...`);
    }

    const prompt = `You are an expert global music discographer. Group each of the following musical artists into exactly one of these canonical language/nationality buckets:
[English, J-Pop, Naija, K-Pop, C-Pop, Instrumental, Gospel, Filipino, I-Pop, African, Latina, Français, Other]

Guidelines:
- "English": UK, US, Canada, Australia, Ireland, and global artists singing predominantly in English.
- "J-Pop": Japanese artists, Anime OST composers, Vocaloid.
- "Naija": Nigerian artists (Afrobeats, Highlife, Fuji, Street-pop).
- "K-Pop": South Korean pop, K-hiphop, K-R&B.
- "C-Pop": Chinese, Taiwanese, Hong Kong Mandopop/Cantopop.
- "Instrumental": Pure instrumental music, sound design, piano solos, lofi beats.
- "Gospel": Christian ministry, worship bands, hymns.
- "Filipino": OPM, Tagalog pop artists.
- "I-Pop": Indian pop, Bollywood playback, Punjabi music.
- "African": Non-Nigerian African artists (Amapiano, South African, Ghanaian, Congolese).
- "Latina": Spanish/Latin pop, Reggaeton, Bachata, Latin American artists.
- "Français": French, Francophone Belgian/Swiss artists singing in French.
- "Other": Any other region or unclassifiable.

Artists to classify:
${JSON.stringify(batch)}

Respond ONLY with a JSON array of objects with keys: "artist", "bucket", "country", "reason".`;

    let success = false;
    let attempt = 0;
    const maxRetries = 3;

    while (!success && attempt < maxRetries) {
      if (signal?.aborted) break;
      attempt++;

      try {
        let rawText = '';

        if (isGemini) {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    artist: { type: Type.STRING },
                    bucket: { 
                      type: Type.STRING,
                      enum: [
                        'English', 'J-Pop', 'Naija', 'K-Pop', 'C-Pop',
                        'Instrumental', 'Gospel', 'Filipino', 'I-Pop',
                        'African', 'Latina', 'Français', 'Other'
                      ]
                    },
                    country: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['artist', 'bucket'],
                },
              },
            },
          });

          if (typeof (response as any).text === 'function') {
            rawText = (response as any).text();
          } else if ((response as any).text) {
            rawText = (response as any).text;
          } else if ((response as any).candidates?.[0]?.content?.parts?.[0]?.text) {
            rawText = (response as any).candidates[0].content.parts[0].text;
          }
        } else if (isLocal) {
          // OpenAI-compatible fallback (Ollama, LM Studio)
          const baseUrl = (aiConfig.baseUrl || 'http://localhost:11434/v1').replace(/\/$/, '');
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            signal,
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({
              model: modelName || 'llama3',
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: 'json_object' }
            })
          });
          if (!res.ok) throw new Error(`Local model returned HTTP ${res.status}`);
          const resData = await res.json();
          rawText = resData?.choices?.[0]?.message?.content || '[]';
        }

        // Clean json string (strip markdown ```json ... ``` blocks)
        const cleanJson = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        let parsed = JSON.parse(cleanJson);
        if (!Array.isArray(parsed) && Array.isArray((parsed as any).artists)) {
          parsed = (parsed as any).artists;
        }

        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.artist && item.bucket) {
              const canonical = BUCKET_CONSOLIDATION_MAP[item.bucket.toLowerCase()] || 'Other';
              const classification: ArtistClassification = {
                artist: item.artist,
                bucket: canonical,
                countryName: item.country,
                confidence: 'llm',
                sourceDetails: `AI (${modelName}): ${item.reason || canonical}`,
                timestamp: Date.now(),
              };
              results.set(normalizeArtistKey(item.artist), classification);
              setCachedClassification(item.artist, classification);
            }
          }
        }
        success = true;
      } catch (err: any) {
        if (signal?.aborted) break;

        const isRateLimit = err?.status === 429 || 
                            err?.message?.includes('429') || 
                            err?.message?.includes('RESOURCE_EXHAUSTED') ||
                            err?.message?.includes('quota');

        if (isRateLimit && attempt < maxRetries) {
          const backoff = (attempt * 2000) + Math.floor(Math.random() * 1000);
          if (onProgressMessage) {
            onProgressMessage(`Rate limit reached. Retrying in ${(backoff / 1000).toFixed(1)}s (attempt ${attempt}/${maxRetries})...`);
          }
          await new Promise(r => setTimeout(r, backoff));
        } else {
          console.warn(`LLM Batch ${bIdx + 1} error:`, err?.message || err);
          if (onProgressMessage) {
            onProgressMessage(`AI batch error: ${err?.message || 'Check API key/model'}`);
          }
          break;
        }
      }
    }
  }

  return results;
}

/**
 * Primary High-Speed Waterfall Orchestrator
 * Classifies all tracks in seconds, streaming progress to caller
 */
export async function classifyPlaylistTracks(
  tracks: { title: string; artist: string; album?: string; duration?: string; filePath?: string; rawPlayCount?: number; [key: string]: any }[],
  options?: {
    useMusicBrainz?: boolean;
    useLLM?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: ClassificationProgress) => void;
  }
): Promise<{
  clusteredTracks: ClusteredTrack[];
  clusters: Record<CanonicalBucket, ClusteredTrack[]>;
  stats: {
    totalTracks: number;
    uniqueArtists: number;
    tierBreakdown: Record<ClassificationConfidence, number>;
  };
}> {
  initClassificationCache();

  const useMusicBrainz = options?.useMusicBrainz ?? true;
  const useLLM = options?.useLLM ?? true;
  const signal = options?.signal;
  const onProgress = options?.onProgress;

  // Extract unique artists
  const artistMap = new Map<string, { originalName: string; titles: string[]; tracks: any[] }>();
  for (const track of tracks) {
    const rawArtist = (track.artist || '<unknown>').trim();
    const key = normalizeArtistKey(rawArtist);
    if (!artistMap.has(key)) {
      artistMap.set(key, { originalName: rawArtist, titles: [], tracks: [] });
    }
    const entry = artistMap.get(key)!;
    if (track.title) entry.titles.push(track.title);
    entry.tracks.push(track);
  }

  const totalUniqueArtists = artistMap.size;
  const resolvedClassifications = new Map<string, ArtistClassification>();
  const uncachedArtistKeys: string[] = [];

  const tierCounts: ClassificationProgress['tierCounts'] = {
    user: 0,
    script: 0,
    musicbrainz: 0,
    llm: 0,
    manual: 0,
    unresolved: 0,
  };

  // -------------------------------------------------------------
  // FAST PASS (Synchronous, <10ms): Tier 0 (Cache) & Tier 1 (Script)
  // -------------------------------------------------------------
  for (const [key, info] of artistMap.entries()) {
    // Check Tier 0 (Cache / Pre-seeded / Manual)
    const cached = getCachedClassification(info.originalName);
    if (cached) {
      resolvedClassifications.set(key, cached);
      if (cached.confidence === 'manual') tierCounts.manual++;
      else if (cached.confidence === 'user') tierCounts.user++;
      else if (cached.confidence === 'musicbrainz') tierCounts.musicbrainz++;
      else if (cached.confidence === 'llm') tierCounts.llm++;
      else if (cached.confidence === 'script') tierCounts.script++;
      else tierCounts.user++;
      continue;
    }

    // Check Tier 1: Unicode Script Histogram on artist name or pooled track titles
    const artistScript = detectScriptSignature(info.originalName);
    if (artistScript) {
      const cls: ArtistClassification = {
        artist: info.originalName,
        bucket: artistScript.bucket,
        confidence: 'script',
        sourceDetails: `Script detection: ${artistScript.scriptName}`,
        timestamp: Date.now(),
      };
      resolvedClassifications.set(key, cls);
      setCachedClassification(info.originalName, cls);
      tierCounts.script++;
      continue;
    }

    // Check if dominant script in song titles gives away the language (e.g. all titles in Japanese/Korean)
    let titleScriptMatch: { bucket: CanonicalBucket; scriptName: string } | null = null;
    for (const title of info.titles.slice(0, 5)) {
      const s = detectScriptSignature(title);
      if (s) {
        titleScriptMatch = s;
        break;
      }
    }

    if (titleScriptMatch) {
      const cls: ArtistClassification = {
        artist: info.originalName,
        bucket: titleScriptMatch.bucket,
        confidence: 'script',
        sourceDetails: `Track title script: ${titleScriptMatch.scriptName}`,
        timestamp: Date.now(),
      };
      resolvedClassifications.set(key, cls);
      setCachedClassification(info.originalName, cls);
      tierCounts.script++;
      continue;
    }

    // Unresolved, needs online lookup
    uncachedArtistKeys.push(key);
  }

  // Emit initial progress after instant Tier 0/1 pass
  if (onProgress) {
    onProgress({
      totalTracks: tracks.length,
      totalUniqueArtists,
      resolvedArtists: resolvedClassifications.size,
      tierCounts: { ...tierCounts },
      isCancelled: false,
      isProcessing: uncachedArtistKeys.length > 0 && (useMusicBrainz || useLLM),
    });
  }

  // -------------------------------------------------------------
  // ASYNC PASS 1: Tier 2 (MusicBrainz)
  // -------------------------------------------------------------
  const stillUnresolvedKeys: string[] = [];

  if (useMusicBrainz && uncachedArtistKeys.length > 0 && !signal?.aborted) {
    for (let i = 0; i < uncachedArtistKeys.length; i++) {
      if (signal?.aborted) break;
      if (options?.shouldSkipMusicBrainz?.()) {
        // Collect all remaining and skip straight to Tier 3 (LLM)
        stillUnresolvedKeys.push(...uncachedArtistKeys.slice(i));
        break;
      }

      const key = uncachedArtistKeys[i];
      const info = artistMap.get(key)!;

      if (onProgress) {
        onProgress({
          totalTracks: tracks.length,
          totalUniqueArtists,
          resolvedArtists: resolvedClassifications.size,
          currentArtist: info.originalName,
          currentTier: `Tier 2: MusicBrainz API (${i + 1}/${uncachedArtistKeys.length})`,
          tierCounts: { ...tierCounts },
          isCancelled: false,
          isProcessing: true,
        });
      }

      try {
        const mbResult = await queryMusicBrainz(info.originalName, signal);
        if (mbResult) {
          resolvedClassifications.set(key, mbResult);
          setCachedClassification(info.originalName, mbResult);
          tierCounts.musicbrainz++;
        } else {
          stillUnresolvedKeys.push(key);
        }
      } catch (e: any) {
        if (e.name === 'AbortError') break;
        stillUnresolvedKeys.push(key);
      }
    }
  } else {
    stillUnresolvedKeys.push(...uncachedArtistKeys);
  }

  // -------------------------------------------------------------
  // ASYNC PASS 2: Tier 3 (Gemini LLM Batch Fallback)
  // -------------------------------------------------------------
  if (useLLM && stillUnresolvedKeys.length > 0 && !signal?.aborted) {
    const artistsToQuery = stillUnresolvedKeys.map(k => artistMap.get(k)!.originalName);
    
    try {
      const llmResults = await batchClassifyWithLLM(
        artistsToQuery,
        signal,
        (msg) => {
          if (onProgress) {
            onProgress({
              totalTracks: tracks.length,
              totalUniqueArtists,
              resolvedArtists: resolvedClassifications.size,
              currentTier: `Tier 3: ${msg}`,
              tierCounts: { ...tierCounts },
              isCancelled: false,
              isProcessing: true,
            });
          }
        }
      );

      for (const key of stillUnresolvedKeys) {
        if (llmResults.has(key)) {
          const res = llmResults.get(key)!;
          resolvedClassifications.set(key, res);
          tierCounts.llm++;
        }
      }
    } catch (e) {
      console.warn('LLM batch tier error:', e);
    }
  }

  // -------------------------------------------------------------
  // FINAL PASS: Default remaining unclassifiable to 'Other'
  // -------------------------------------------------------------
  for (const [key, info] of artistMap.entries()) {
    if (!resolvedClassifications.has(key)) {
      const fallback: ArtistClassification = {
        artist: info.originalName,
        bucket: 'Other',
        confidence: 'unresolved',
        sourceDetails: 'Unresolved / Default',
        timestamp: Date.now(),
      };
      resolvedClassifications.set(key, fallback);
      tierCounts.unresolved++;
    }
  }

  // Build final clustered tracks structure
  const clusters: Record<CanonicalBucket, ClusteredTrack[]> = {
    'English': [],
    'J-Pop': [],
    'Naija': [],
    'K-Pop': [],
    'C-Pop': [],
    'Instrumental': [],
    'Gospel': [],
    'Filipino': [],
    'I-Pop': [],
    'African': [],
    'Latina': [],
    'Français': [],
    'Other': [],
  };

  const clusteredTracks: ClusteredTrack[] = [];
  const tierBreakdown: Record<ClassificationConfidence, number> = {
    user: 0,
    cache: 0,
    script: 0,
    musicbrainz: 0,
    llm: 0,
    manual: 0,
    unresolved: 0,
  };

  tracks.forEach((track, idx) => {
    const rawArtist = (track.artist || '<unknown>').trim();
    const key = normalizeArtistKey(rawArtist);
    const classification = resolvedClassifications.get(key) || {
      artist: rawArtist,
      bucket: 'Other' as CanonicalBucket,
      confidence: 'unresolved' as ClassificationConfidence,
      timestamp: Date.now(),
    };

    const clusteredTrack: ClusteredTrack = {
      id: `track-${idx}-${key}`,
      title: track.title || 'Unknown Title',
      artist: rawArtist,
      album: track.album,
      duration: track.duration,
      filePath: track.filePath || track.path,
      rawPlayCount: track.rawPlayCount || track.play_count,
      classification,
      originalData: track,
    };

    clusteredTracks.push(clusteredTrack);
    clusters[classification.bucket].push(clusteredTrack);
    tierBreakdown[classification.confidence] = (tierBreakdown[classification.confidence] || 0) + 1;
  });

  if (onProgress) {
    onProgress({
      totalTracks: tracks.length,
      totalUniqueArtists,
      resolvedArtists: resolvedClassifications.size,
      tierCounts: { ...tierCounts },
      isCancelled: !!signal?.aborted,
      isProcessing: false,
    });
  }

  return {
    clusteredTracks,
    clusters,
    stats: {
      totalTracks: tracks.length,
      uniqueArtists: totalUniqueArtists,
      tierBreakdown,
    },
  };
}

/**
 * Manual Override API (Tier 4)
 * Immediately updates in-memory cache, persists to localStorage, and returns updated classification
 */
export function setManualOverride(artist: string, newBucket: CanonicalBucket): ArtistClassification {
  const clean = artist.replace(/\s*-\s*topic$/i, '').trim();
  const classification: ArtistClassification = {
    artist: clean,
    bucket: newBucket,
    confidence: 'manual',
    sourceDetails: 'User Manual Override',
    timestamp: Date.now(),
  };

  setCachedClassification(clean, classification);
  return classification;
}

/**
 * Bootstrap cache from custom CSV (COL_ARTIST, COL_GENRE)
 */
export function importArtistCSV(csvText: string): { imported: number; errors: number } {
  initClassificationCache();
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length <= 1) return { imported: 0, errors: 0 };

  let imported = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // CSV parser
    const match = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
    if (!match || match.length < 2) {
      errors++;
      continue;
    }

    const artist = match[0].replace(/^,/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim();
    const genre = match[1].replace(/^,/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim();

    if (!artist || artist === '<unknown>' || !genre || genre === '<unknown>') {
      continue;
    }

    const canonical = BUCKET_CONSOLIDATION_MAP[genre.toLowerCase()] || 'Other';
    setCachedClassification(artist, {
      artist,
      bucket: canonical,
      confidence: 'user',
      sourceDetails: `CSV Import (${genre})`,
      timestamp: Date.now(),
    });
    imported++;
  }

  saveClassificationCache();
  return { imported, errors };
}

/**
 * Export full cache as JSON
 */
export function exportCacheJSON(): string {
  initClassificationCache();
  const data: Record<string, ArtistClassification> = {};
  for (const [k, v] of runtimeCache.entries()) {
    data[k] = v;
  }
  return JSON.stringify(data, null, 2);
}

/**
 * Import cache from JSON
 */
export function importCacheJSON(jsonString: string): { imported: number } {
  initClassificationCache();
  const parsed = JSON.parse(jsonString);
  let count = 0;
  for (const [k, v] of Object.entries(parsed)) {
    if (v && typeof v === 'object' && (v as any).bucket) {
      runtimeCache.set(k, v as ArtistClassification);
      count++;
    }
  }
  saveClassificationCache();
  return { imported: count };
}

/**
 * Get all cached entries
 */
export function getAllCachedEntries(): ArtistClassification[] {
  initClassificationCache();
  return Array.from(runtimeCache.values());
}

/**
 * Clear all runtime cache (resets to pre-seeded 1,341 only)
 */
export function resetCacheToDefault(): void {
  localStorage.removeItem(CLASSIFICATION_CACHE_KEY);
  isCacheInitialized = false;
  initClassificationCache();
}
