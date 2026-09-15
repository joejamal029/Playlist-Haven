import { PRE_SEEDED_ARTIST_CACHE } from './preSeededArtistData';
import { getAIConfig } from './visionEngine';
import { GoogleGenAI, Type } from '@google/genai';
import { resolveAreaToBucket } from './areaDictionary';

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
  | 'Thai'
  | 'Vietnamese'
  | 'Dutch'
  | 'Arabic'
  | 'German'
  | 'Italian'
  | 'Portuguese'
  | 'Filipino'
  | 'I-Pop'
  | 'African'
  | 'Latina'
  | 'Français'
  | 'Gospel'
  | 'Instrumental'
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
    displayName: 'English',
    colorClass: 'text-blue-400',
    badgeBg: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    borderClass: 'border-blue-500/40',
    description: 'English-language tracks from UK, US, Canada, Australia, and international releases.',
  },
  'J-Pop': {
    name: 'J-Pop',
    displayName: 'J-Pop',
    colorClass: 'text-rose-400',
    badgeBg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    borderClass: 'border-rose-500/40',
    description: 'Japanese pop, rock, vocaloid, anime themes, and city pop.',
  },
  'Naija': {
    name: 'Naija',
    displayName: 'Naija',
    colorClass: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    borderClass: 'border-emerald-500/40',
    description: 'Nigerian Afrobeats, Street-pop, Fuji, Highlife, and Alté.',
  },
  'K-Pop': {
    name: 'K-Pop',
    displayName: 'K-Pop',
    colorClass: 'text-purple-400',
    badgeBg: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    borderClass: 'border-purple-500/40',
    description: 'Korean pop, K-hiphop, K-R&B, and OSTs.',
  },
  'C-Pop': {
    name: 'C-Pop',
    displayName: 'C-Pop',
    colorClass: 'text-amber-400',
    badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    borderClass: 'border-amber-500/40',
    description: 'Mandarin, Cantonese, Taiwanese pop, ballads, and indie.',
  },
  'Thai': {
    name: 'Thai',
    displayName: 'Thai',
    colorClass: 'text-teal-400',
    badgeBg: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    borderClass: 'border-teal-500/40',
    description: 'Thai pop (T-Pop), Thai indie, rock, soundtracks, and Bangkok alternative music.',
  },
  'Vietnamese': {
    name: 'Vietnamese',
    displayName: 'Vietnamese',
    colorClass: 'text-emerald-300',
    badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    borderClass: 'border-emerald-500/40',
    description: 'Vietnamese pop (V-Pop), ballads, R&B, and contemporary indie releases.',
  },
  'Dutch': {
    name: 'Dutch',
    displayName: 'Dutch',
    colorClass: 'text-orange-400',
    badgeBg: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    borderClass: 'border-orange-500/40',
    description: 'Nederpop, Nederhop, Dutch electronic, pop, and contemporary Netherlands releases.',
  },
  'Arabic': {
    name: 'Arabic',
    displayName: 'Arabic',
    colorClass: 'text-amber-300',
    badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    borderClass: 'border-amber-500/40',
    description: 'Egyptian pop, Arabesque, Khaliji, Levantine, and Maghreb music.',
  },
  'German': {
    name: 'German',
    displayName: 'German',
    colorClass: 'text-yellow-300',
    badgeBg: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
    borderClass: 'border-yellow-500/40',
    description: 'Deutschrap, Schlager, Neue Deutsche Welle, German pop, and rock.',
  },
  'Italian': {
    name: 'Italian',
    displayName: 'Italian',
    colorClass: 'text-green-400',
    badgeBg: 'bg-green-500/10 text-green-300 border-green-500/30',
    borderClass: 'border-green-500/40',
    description: 'Sanremo, Italian pop, modern Italian trap, and classical vocal opera.',
  },
  'Portuguese': {
    name: 'Portuguese',
    displayName: 'Portuguese',
    colorClass: 'text-lime-300',
    badgeBg: 'bg-lime-500/10 text-lime-300 border-lime-500/30',
    borderClass: 'border-lime-500/40',
    description: 'Brazilian Funk Carioca, Bossa Nova, MPB, Samba, Sertanejo, and Portuguese Fado.',
  },
  'Filipino': {
    name: 'Filipino',
    displayName: 'Filipino',
    colorClass: 'text-orange-400',
    badgeBg: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    borderClass: 'border-orange-500/40',
    description: 'Original Pilipino Music (OPM), Tagalog pop, and acoustic.',
  },
  'I-Pop': {
    name: 'I-Pop',
    displayName: 'I-Pop',
    colorClass: 'text-indigo-400',
    badgeBg: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    borderClass: 'border-indigo-500/40',
    description: 'Hindi, Punjabi, Bollywood, Bengali, and Indian independent pop.',
  },
  'African': {
    name: 'African',
    displayName: 'African',
    colorClass: 'text-lime-400',
    badgeBg: 'bg-lime-500/10 text-lime-300 border-lime-500/30',
    borderClass: 'border-lime-500/40',
    description: 'Amapiano, Ghanaian Highlife, Francophone African, and East/South African releases.',
  },
  'Latina': {
    name: 'Latina',
    displayName: 'Latina',
    colorClass: 'text-red-400',
    badgeBg: 'bg-red-500/10 text-red-300 border-red-500/30',
    borderClass: 'border-red-500/40',
    description: 'Reggaeton, Latin pop, Salsa, Bachata, and Spanish-language releases.',
  },
  'Français': {
    name: 'Français',
    displayName: 'Français',
    colorClass: 'text-sky-400',
    badgeBg: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    borderClass: 'border-sky-500/40',
    description: 'French chansons, French rap, and Francophone Belgian/Swiss artists.',
  },
  'Gospel': {
    name: 'Gospel',
    displayName: 'Gospel',
    colorClass: 'text-yellow-400',
    badgeBg: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
    borderClass: 'border-yellow-500/40',
    description: 'Christian worship, hymns, praise, and spoken ministry.',
  },
  'Instrumental': {
    name: 'Instrumental',
    displayName: 'Instrumental',
    colorClass: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    borderClass: 'border-cyan-500/40',
    description: 'Pure instrumental tracks, soundtracks, piano solos, lofi beats, and ambient noise.',
  },
  'Other': {
    name: 'Other',
    displayName: 'Other',
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
  'thai': 'Thai',
  't-pop': 'Thai',
  'thailand': 'Thai',
  'vietnamese': 'Vietnamese',
  'v-pop': 'Vietnamese',
  'vietnam': 'Vietnamese',
  'dutch': 'Dutch',
  'netherlands': 'Dutch',
  'nederlands': 'Dutch',
  'nederpop': 'Dutch',
  'nederhop': 'Dutch',
  'holland': 'Dutch',
  'arabic': 'Arabic',
  'arabesque': 'Arabic',
  'khaliji': 'Arabic',
  'egyptian': 'Arabic',
  'levantine': 'Arabic',
  'german': 'German',
  'deutsch': 'German',
  'schlager': 'German',
  'austrian': 'German',
  'italian': 'Italian',
  'italiano': 'Italian',
  'sanremo': 'Italian',
  'portuguese': 'Portuguese',
  'brasil': 'Portuguese',
  'brazil': 'Portuguese',
  'bossa nova': 'Portuguese',
  'samba': 'Portuguese',
  'mpb': 'Portuguese',
  'funk carioca': 'Portuguese',
  'fado': 'Portuguese',
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
  'ukrainian': 'Other',
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
  
  // East & Southeast Asian
  JP: 'J-Pop', 
  KR: 'K-Pop', KP: 'K-Pop',
  TW: 'C-Pop', CN: 'C-Pop', HK: 'C-Pop', MO: 'C-Pop', SG: 'C-Pop',
  TH: 'Thai',
  VN: 'Vietnamese',
  PH: 'Filipino',

  // Netherlands
  NL: 'Dutch',

  // Portuguese & Brazilian
  BR: 'Portuguese', PT: 'Portuguese', AO: 'Portuguese', MZ: 'Portuguese', 
  CV: 'Portuguese', GW: 'Portuguese', ST: 'Portuguese', TL: 'Portuguese',

  // German-speaking
  DE: 'German', AT: 'German',

  // Italian
  IT: 'Italian', SM: 'Italian', VA: 'Italian',

  // Middle East & North Africa (Arabic)
  EG: 'Arabic', LB: 'Arabic', SA: 'Arabic', AE: 'Arabic', MA: 'Arabic', 
  DZ: 'Arabic', TN: 'Arabic', JO: 'Arabic', IQ: 'Arabic', SY: 'Arabic', 
  KW: 'Arabic', OM: 'Arabic', QA: 'Arabic', BH: 'Arabic', LY: 'Arabic', 
  SD: 'Arabic', YE: 'Arabic', PS: 'Arabic',
  
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
  EC: 'Latina', GT: 'Latina', CR: 'Latina', PA: 'Latina',
  
  // French-speaking
  FR: 'Français', BE: 'Français', CH: 'Français', MC: 'Français',
  
  // Nordic countries (English/Global default)
  SE: 'English', NO: 'English', DK: 'English', FI: 'English', IS: 'English',
};

/**
 * Transient cache of raw contextual hints (area, disambiguation, tags, type)
 * gathered during Tier 2 (MusicBrainz) to enrich Tier 3 (Gemini 2.5 Flash) queries.
 */
export const musicBrainzHintsCache = new Map<string, string>();

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
export function initClassificationCache(forceReload = false): Map<string, ArtistClassification> {
  if (!forceReload && isCacheInitialized) return runtimeCache;

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
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(CLASSIFICATION_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        let purgedCount = 0;
        for (const [key, val] of Object.entries(parsed)) {
          const entry = val as ArtistClassification;
          // Strict sanitation: strip out ANY entry that is 'Other', unresolved, or missing bucket
          if (
            !entry || 
            entry.confidence === 'unresolved' || 
            !entry.bucket || 
            entry.bucket === 'Other' ||
            !entry.artist
          ) {
            purgedCount++;
            continue;
          }
          runtimeCache.set(key, entry);
        }
        // Scrub runtimeCache of any rogue 'Other' or unresolved entries
        for (const [k, v] of runtimeCache.entries()) {
          if (!v || !v.bucket || v.bucket === 'Other' || v.confidence === 'unresolved') {
            runtimeCache.delete(k);
            purgedCount++;
          }
        }
        if (purgedCount > 0) {
          saveClassificationCache();
        }
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
    if (typeof localStorage === 'undefined') return;
    const obj: Record<string, ArtistClassification> = {};
    for (const [k, v] of runtimeCache.entries()) {
      // Never serialize unresolved entries or ANY 'Other' records to cache
      if (
        v && 
        v.confidence !== 'unresolved' && 
        v.bucket &&
        v.bucket !== 'Other'
      ) {
        obj[k] = v;
      }
    }
    localStorage.setItem(CLASSIFICATION_CACHE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('Failed to save artist classification cache to localStorage:', e);
  }
}

/**
 * Get cached classification for an artist with multi-level resilient fallback matching:
 * 1. Exact normalized key
 * 2. Stripped parentheticals (e.g. "BTS (방탄소년단)" -> "BTS")
 * 3. Stripped diacritics / accents (e.g. "Beyoncé" -> "Beyonce")
 * 4. Stripped punctuation / special characters
 * 5. Composite multi-artist tokens (e.g. "Asake ft. Burna Boy")
 */
export function getCachedClassification(artistName: string): ArtistClassification | null {
  if (!artistName) return null;
  initClassificationCache();
  
  // Helper to validate non-Other classification
  const validEntry = (entry: ArtistClassification | undefined): ArtistClassification | null => {
    if (entry && entry.bucket && entry.bucket !== 'Other') return entry;
    return null;
  };

  // 1. Exact normalized key
  const exactKey = normalizeArtistKey(artistName);
  if (runtimeCache.has(exactKey)) {
    const res = validEntry(runtimeCache.get(exactKey));
    if (res) return res;
  }

  // 2. Parenthetical-stripped match: e.g. "BTS (방탄소년단)" -> "BTS"
  const noParens = normalizeArtistKey(artistName.replace(/\s*\([^)]*\)/g, ''));
  if (noParens && noParens !== exactKey && runtimeCache.has(noParens)) {
    const res = validEntry(runtimeCache.get(noParens));
    if (res) return res;
  }

  // 3. Diacritics / accents-stripped match: e.g. "Beyoncé" -> "Beyonce"
  try {
    const noAccents = normalizeArtistKey(artistName.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    if (noAccents && noAccents !== exactKey && runtimeCache.has(noAccents)) {
      const res = validEntry(runtimeCache.get(noAccents));
      if (res) return res;
    }
  } catch (_) {}

  // 4. Punctuation-stripped match: e.g. "Tyler, The Creator" -> "tyler the creator"
  const noPunct = normalizeArtistKey(artistName.replace(/[^\p{L}\p{N}\s]/gu, ' '));
  if (noPunct && noPunct !== exactKey && runtimeCache.has(noPunct)) {
    const res = validEntry(runtimeCache.get(noPunct));
    if (res) return res;
  }

  // 5. Multi-artist fallback: check if any constituent artist is known
  const tokens = extractArtistNames(artistName);
  if (tokens.length > 1) {
    for (const token of tokens) {
      const normToken = normalizeArtistKey(token);
      if (normToken && normToken !== exactKey && runtimeCache.has(normToken)) {
        const found = validEntry(runtimeCache.get(normToken));
        if (found) {
          return {
            ...found,
            artist: artistName,
            sourceDetails: `Inherited from primary artist: ${token}`,
          };
        }
      }
      // Also try parenthetical & diacritic on token
      const tNoParens = normalizeArtistKey(token.replace(/\s*\([^)]*\)/g, ''));
      if (tNoParens && runtimeCache.has(tNoParens)) {
        const found = validEntry(runtimeCache.get(tNoParens));
        if (found) {
          return {
            ...found,
            artist: artistName,
            sourceDetails: `Inherited from primary artist: ${token}`,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Store an artist classification in cache ('Other' and unresolved entries are strictly blocked)
 */
export function setCachedClassification(artistName: string, classification: ArtistClassification): void {
  // Strict Guard: Never persist 'Other' or unresolved classifications to cache!
  // In the Language Clustering cache, 'Other' is strictly NOT a valid classification.
  if (
    !classification || 
    classification.confidence === 'unresolved' || 
    !classification.bucket ||
    classification.bucket === 'Other'
  ) {
    return;
  }

  initClassificationCache();
  const key = normalizeArtistKey(artistName);
  
  const existing = runtimeCache.get(key);
  // Protection: The Language Clustering cache is superior!
  // Automated background lookups (MusicBrainz / Deep Metadata Engine) can NEVER overwrite
  // human manual overrides, user edits, AI remediations, or script signatures.
  if (existing && existing.bucket && existing.bucket !== 'Other') {
    const isIncomingAutomated = 
      classification.confidence === 'musicbrainz' || 
      classification.sourceDetails?.includes('Deep Metadata Engine') ||
      classification.sourceDetails?.includes('MusicBrainz');
    if (isIncomingAutomated && (existing.confidence === 'manual' || existing.confidence === 'user' || existing.confidence === 'llm' || existing.confidence === 'script')) {
      return;
    }
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
  if (hasThai) {
    return { bucket: 'Thai', scriptName: 'Thai (Thailand)' };
  }
  if (hasArabic) {
    return { bucket: 'Arabic', scriptName: 'Arabic (Middle East/North Africa)' };
  }
  if (hasCyrillic) {
    return { bucket: 'Other', scriptName: 'Cyrillic' };
  }

  return null;
}

/**
 * Tier 2: MusicBrainz API Search with rate-limit queue
 */
let lastMusicBrainzRequestTime = 0;
const MUSICBRAINZ_MIN_INTERVAL_MS = 1200; // Strict rate-limit: >1.2s per req

export async function queryMusicBrainz(
  artistName: string,
  signal?: AbortSignal
): Promise<ArtistClassification | null> {
  const cleanName = artistName.replace(/\s*-\s*topic$/i, '').trim();
  if (!cleanName || cleanName === '<unknown>') return null;

  const normKey = normalizeArtistKey(cleanName);

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
    let response = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PlaylistHaven/1.0.0 (https://github.com/joejamal029/Playlist-Haven; contact@playlisthaven.app)',
      },
    });

    // 503 backoff with single retry
    if (response.status === 503) {
      console.warn(`MusicBrainz rate limit busy (503) for ${cleanName}. Retrying in 1.5s...`);
      await new Promise(r => setTimeout(r, 1500));
      lastMusicBrainzRequestTime = Date.now();
      response = await fetch(url, {
        signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PlaylistHaven/1.0.0 (https://github.com/joejamal029/Playlist-Haven; contact@playlisthaven.app)',
        },
      });
    }

    if (!response.ok) {
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

    // Extract ISO country code: check match.country, area ISO-3166-1, or area subdivision ISO-3166-2 (e.g. US-PA, AU-WA)
    let countryCode = match.country || (match.area && match.area.type === 'Country' ? match.area['iso-3166-1-codes']?.[0] : undefined);
    if (!countryCode && match.area?.['iso-3166-2-codes']?.[0]) {
      const sub = match.area['iso-3166-2-codes'][0];
      const prefix = sub.split('-')[0];
      if (COUNTRY_TO_BUCKET[prefix]) {
        countryCode = prefix;
      }
    }

    const areaName = match.area?.name || match['begin-area']?.name;
    const disambiguation = match.disambiguation || '';

    let bucket: CanonicalBucket = 'Other';
    let countryName: string | undefined = areaName;

    // 1. Direct ISO country code mapping
    if (countryCode && COUNTRY_TO_BUCKET[countryCode]) {
      bucket = COUNTRY_TO_BUCKET[countryCode];
    }

    // 2. Comprehensive Area / City / State name mapping
    if (bucket === 'Other' && areaName) {
      const areaResolved = resolveAreaToBucket(areaName);
      if (areaResolved) {
        bucket = areaResolved.bucket;
        countryCode = countryCode || areaResolved.country;
        countryName = areaResolved.countryName || areaName;
      }
    }

    // 3. Begin-area fallback if still unresolved
    if (bucket === 'Other' && match['begin-area']?.name) {
      const beginResolved = resolveAreaToBucket(match['begin-area'].name);
      if (beginResolved) {
        bucket = beginResolved.bucket;
        countryCode = countryCode || beginResolved.country;
        countryName = beginResolved.countryName || match['begin-area'].name;
      }
    }

    // 4. Check disambiguation for explicit Christian/Gospel clues
    const disLower = disambiguation.toLowerCase();
    if (disLower.includes('christian') || disLower.includes('worship') || disLower.includes('gospel') || disLower.includes('church')) {
      bucket = 'Gospel';
    }

    // 5. Community tags refinement
    if (match.tags && Array.isArray(match.tags)) {
      const tagNames = match.tags.map((t: any) => (t.name || '').toLowerCase());
      if (tagNames.some((t: string) => t.includes('gospel') || t.includes('christian') || t.includes('worship') || t.includes('ccm') || t.includes('praise'))) {
        bucket = 'Gospel';
      } else if (tagNames.some((t: string) => t.includes('anime') || t.includes('vocaloid') || t.includes('j-pop') || t.includes('j-rock') || t.includes('city pop'))) {
        bucket = 'J-Pop';
      } else if (tagNames.some((t: string) => t.includes('afrobeats') || t.includes('naija'))) {
        bucket = 'Naija';
      } else if (tagNames.some((t: string) => t.includes('k-pop') || t.includes('kpop') || t.includes('k-hop') || t.includes('k-rap'))) {
        bucket = 'K-Pop';
      } else if (tagNames.some((t: string) => t.includes('c-pop') || t.includes('mandopop') || t.includes('cantopop'))) {
        bucket = 'C-Pop';
      } else if (tagNames.some((t: string) => t.includes('latin') || t.includes('reggaeton') || t.includes('bachata') || t.includes('flamenco') || t.includes('cumbia') || t.includes('spanish'))) {
        bucket = 'Latina';
      } else if (tagNames.some((t: string) => t.includes('t-pop') || t.includes('thai'))) {
        bucket = 'Thai';
      } else if (tagNames.some((t: string) => t.includes('v-pop') || t.includes('vietnamese'))) {
        bucket = 'Vietnamese';
      } else if (tagNames.some((t: string) => t.includes('nederpop') || t.includes('nederhop') || t.includes('dutch'))) {
        bucket = 'Dutch';
      } else if (tagNames.some((t: string) => t.includes('bossa nova') || t.includes('funk carioca') || t.includes('samba') || t.includes('mpb') || t.includes('fado'))) {
        bucket = 'Portuguese';
      } else if (tagNames.some((t: string) => t.includes('arabic') || t.includes('arabesque') || t.includes('khaliji'))) {
        bucket = 'Arabic';
      } else if (tagNames.some((t: string) => t.includes('deutschrap') || t.includes('schlager'))) {
        bucket = 'German';
      } else if (tagNames.some((t: string) => t.includes('sanremo') || t.includes('italiano'))) {
        bucket = 'Italian';
      } else if (tagNames.some((t: string) => t.includes('opm') || t.includes('filipino') || t.includes('tagalog'))) {
        bucket = 'Filipino';
      } else if (tagNames.some((t: string) => t.includes('bollywood') || t.includes('desi') || t.includes('punjabi') || t.includes('hindustani'))) {
        bucket = 'I-Pop';
      }
    }

    // CRITICAL WATERFALL INVARIANT:
    // If MusicBrainz cannot affirmatively classify the artist into a specific bucket,
    // do NOT return 'Other' with confidence: 'musicbrainz'. Cache any extracted raw hints
    // and return null so the waterfall cascades cleanly to Tier 3 (Gemini 2.5 Flash LLM).
    if (bucket === 'Other') {
      const hints: string[] = [];
      if (match.name && match.name.toLowerCase() !== cleanName.toLowerCase()) {
        hints.push(`MB Name: ${match.name}`);
      }
      if (match.type) hints.push(`Type: ${match.type}`);
      if (areaName) hints.push(`Area: ${areaName}`);
      if (match['begin-area']?.name && match['begin-area'].name !== areaName) {
        hints.push(`Origin: ${match['begin-area'].name}`);
      }
      if (disambiguation) hints.push(`Disambiguation: ${disambiguation}`);
      if (match.tags && Array.isArray(match.tags)) {
        const tagList = match.tags.slice(0, 6).map((t: any) => t.name).filter(Boolean);
        if (tagList.length > 0) hints.push(`Tags: ${tagList.join(', ')}`);
      }
      if (hints.length > 0) {
        musicBrainzHintsCache.set(normKey, hints.join(' | '));
      }
      return null;
    }

    return {
      artist: cleanName,
      bucket,
      country: countryCode,
      countryName,
      confidence: 'musicbrainz',
      sourceDetails: `MusicBrainz: ${match.name} (${countryName || countryCode || 'Match'})${disambiguation ? ` - ${disambiguation}` : ''}`,
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
  onProgressMessage?: (msg: string) => void,
  artistHintsMap?: Map<string, string>
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

  const rawModel = aiConfig.modelName || 'gemini-2.5-flash';
  const primaryModel = (rawModel === 'gemini-3-flash-preview') ? 'gemini-2.5-flash' : rawModel;
  const secondaryModel = primaryModel === 'gemini-2.5-flash' ? 'gemini-2.0-flash' : 'gemini-1.5-flash';
  const tertiaryModel = 'gemini-1.5-flash';

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    if (signal?.aborted) break;

    const batch = batches[bIdx];
    if (onProgressMessage) {
      onProgressMessage(`AI Batch ${bIdx + 1}/${batches.length} (${batch.length} artists with ${primaryModel})...`);
    }

    // Attach any preliminary metadata/contextual hints gathered from Tier 2 MusicBrainz
    const batchWithHints = batch.map(artist => {
      const key = normalizeArtistKey(artist);
      const hints = artistHintsMap?.get(key) || musicBrainzHintsCache.get(key);
      return hints ? { artist, preliminaryHints: hints } : { artist };
    });

    const prompt = `You are an expert global music discographer. Group each of the following musical artists into exactly one of these canonical language/nationality buckets:
[English, J-Pop, Naija, K-Pop, C-Pop, Thai, Vietnamese, Dutch, Arabic, German, Italian, Portuguese, Filipino, I-Pop, African, Latina, Français, Gospel, Instrumental, Other]

Guidelines:
- "English": UK, US, Canada, Australia, Ireland, and global artists singing predominantly in English.
- "J-Pop": Japanese artists, Anime OST composers, Vocaloid, City Pop, J-Rock.
- "Naija": Nigerian artists (Afrobeats, Highlife, Fuji, Street-pop, Alté).
- "K-Pop": South Korean pop, K-hiphop, K-R&B.
- "C-Pop": Chinese, Taiwanese, Hong Kong Mandopop/Cantopop.
- "Thai": Thai pop (T-Pop), Thai indie/rock, Thailand artists.
- "Vietnamese": Vietnamese pop (V-Pop), ballads, Vietnam artists.
- "Dutch": Netherlands artists, Nederpop, Nederhop, Dutch electronic.
- "Arabic": Middle Eastern and North African artists (Egyptian, Levantine, Khaliji, Maghreb).
- "German": German, Austrian, Swiss Deutschrap, Schlager, Neue Deutsche Welle.
- "Italian": Italian pop, Sanremo, modern Italian trap, classical vocal.
- "Portuguese": Brazilian (Funk Carioca, Bossa Nova, MPB, Samba) and Portuguese (Fado, pop) artists.
- "Filipino": OPM, Tagalog pop artists, Philippines acoustic.
- "I-Pop": Indian pop, Bollywood playback, Punjabi, Hindi, South Asian music.
- "African": Non-Nigerian continental African artists (Amapiano, South African, Ghanaian, Congolese).
- "Latina": Spanish/Latin pop, Reggaeton, Bachata, Latin American artists.
- "Français": French, Francophone Belgian/Swiss artists singing in French.
- "Gospel": Christian ministry, worship bands, hymns, praise, Bible teaching, CCM, gospel artists.
- "Instrumental": Pure instrumental music, sound design, piano solos, lofi beats, ambient.
- "Other": Any other region or unclassifiable.

Use any supplied preliminary hints (such as area, origin, community tags, or disambiguation) to inform your categorization accurately.

Artists to classify:
${JSON.stringify(batchWithHints, null, 2)}

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
          const tryGenerate = async (m: string) => {
            return await ai.models.generateContent({
              model: m,
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
                          'Thai', 'Vietnamese', 'Dutch', 'Arabic', 'German',
                          'Italian', 'Portuguese', 'Filipino', 'I-Pop',
                          'African', 'Latina', 'Français', 'Gospel',
                          'Instrumental', 'Other'
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
          };

          let response: any;
          try {
            response = await tryGenerate(primaryModel);
          } catch (primaryErr: any) {
            if (primaryModel !== secondaryModel) {
              console.warn(`[ClassificationEngine] Primary model ${primaryModel} failed (${primaryErr.message}). Failing over to ${secondaryModel}...`);
              try {
                response = await tryGenerate(secondaryModel);
              } catch (secErr: any) {
                if (secondaryModel !== tertiaryModel) {
                  console.warn(`[ClassificationEngine] Secondary model ${secondaryModel} failed (${secErr.message}). Failing over to ${tertiaryModel}...`);
                  response = await tryGenerate(tertiaryModel);
                } else {
                  throw secErr;
                }
              }
            } else {
              throw primaryErr;
            }
          }

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
              model: primaryModel || 'llama3',
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
                sourceDetails: `AI (${primaryModel}): ${item.reason || canonical}`,
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
    shouldSkipMusicBrainz?: () => boolean;
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
      if (cached.confidence === 'manual') {
        tierCounts.manual++;
      } else {
        tierCounts.user++; // Cache hit (displayed as "Cache" in UI)
      }
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
    // Only pool titles if the artist is not an unknown placeholder
    if (key !== '<unknown>' && key !== 'unknown' && key !== 'unknown artist') {
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
    }

    // If artist is an unknown placeholder, do not query online MusicBrainz or LLM
    if (key === '<unknown>' || key === 'unknown' || key === 'unknown artist') {
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
        if (mbResult && mbResult.bucket !== 'Other') {
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
        },
        musicBrainzHintsCache
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
    'Thai': [],
    'Vietnamese': [],
    'Dutch': [],
    'Arabic': [],
    'German': [],
    'Italian': [],
    'Portuguese': [],
    'Filipino': [],
    'I-Pop': [],
    'African': [],
    'Latina': [],
    'Français': [],
    'Gospel': [],
    'Instrumental': [],
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
    const isUnknown = !rawArtist || key === '<unknown>' || key === 'unknown' || key === 'unknown artist';

    let classification: ArtistClassification;
    if (isUnknown) {
      // For tracks without an artist, detect script directly from track title
      const scriptMatch = detectScriptSignature(track.title);
      if (scriptMatch) {
        classification = {
          artist: rawArtist || '<unknown>',
          bucket: scriptMatch.bucket,
          confidence: 'script',
          sourceDetails: `Track title script: ${scriptMatch.scriptName}`,
          timestamp: Date.now(),
        };
      } else {
        classification = {
          artist: rawArtist || '<unknown>',
          bucket: 'Other' as CanonicalBucket,
          confidence: 'unresolved' as ClassificationConfidence,
          sourceDetails: 'Unknown artist without recognizable script',
          timestamp: Date.now(),
        };
      }
    } else {
      classification = resolvedClassifications.get(key) || {
        artist: rawArtist,
        bucket: 'Other' as CanonicalBucket,
        confidence: 'unresolved' as ClassificationConfidence,
        timestamp: Date.now(),
      };
    }

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

  if (newBucket === 'Other') {
    deleteCachedEntry(clean);
  } else {
    setCachedClassification(clean, classification);
  }
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
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CLASSIFICATION_CACHE_KEY);
  }
  isCacheInitialized = false;
  initClassificationCache();
}

/**
 * Update a specific cached entry
 */
export function updateCachedEntry(
  artistKeyOrName: string,
  updates: Partial<ArtistClassification>
): boolean {
  initClassificationCache();
  const key = normalizeArtistKey(artistKeyOrName);
  const existing = runtimeCache.get(key);
  if (!existing) return false;

  const updated: ArtistClassification = {
    ...existing,
    ...updates,
    timestamp: Date.now(),
  };

  // If bucket was updated, ensure it's valid canonical bucket
  if (updates.bucket) {
    const canonical = CANONICAL_BUCKETS[updates.bucket]?.name || BUCKET_CONSOLIDATION_MAP[updates.bucket.toLowerCase()] || updates.bucket;
    updated.bucket = canonical as CanonicalBucket;
  }

  runtimeCache.set(key, updated);
  saveClassificationCache();
  return true;
}

/**
 * Delete a specific entry from cache
 */
export function deleteCachedEntry(artistKeyOrName: string): boolean {
  initClassificationCache();
  const key = normalizeArtistKey(artistKeyOrName);
  if (!runtimeCache.has(key)) return false;

  runtimeCache.delete(key);
  saveClassificationCache();
  return true;
}

/**
 * Batch update multiple cached entries (e.g. batch reassign bucket or country)
 */
export function batchUpdateCachedEntries(
  artistKeysOrNames: string[],
  updates: Partial<ArtistClassification>
): number {
  initClassificationCache();
  let count = 0;

  for (const name of artistKeysOrNames) {
    const key = normalizeArtistKey(name);
    const existing = runtimeCache.get(key);
    if (existing) {
      const updated: ArtistClassification = {
        ...existing,
        ...updates,
        timestamp: Date.now(),
      };
      if (updates.bucket) {
        const canonical = CANONICAL_BUCKETS[updates.bucket]?.name || BUCKET_CONSOLIDATION_MAP[updates.bucket.toLowerCase()] || updates.bucket;
        updated.bucket = canonical as CanonicalBucket;
      }
      runtimeCache.set(key, updated);
      count++;
    }
  }

  if (count > 0) {
    saveClassificationCache();
  }
  return count;
}

/**
 * Batch delete multiple cached entries
 */
export function batchDeleteCachedEntries(artistKeysOrNames: string[]): number {
  initClassificationCache();
  let count = 0;

  for (const name of artistKeysOrNames) {
    const key = normalizeArtistKey(name);
    if (runtimeCache.delete(key)) {
      count++;
    }
  }

  if (count > 0) {
    saveClassificationCache();
  }
  return count;
}

/**
 * Add a new manual artist mapping to cache directly
 */
export function addManualCacheEntry(
  artist: string,
  bucket: CanonicalBucket,
  country?: string,
  notes?: string
): ArtistClassification {
  initClassificationCache();
  const cleanArtist = artist.trim();
  const canonicalBucket = CANONICAL_BUCKETS[bucket]?.name || 'Other';

  const classification: ArtistClassification = {
    artist: cleanArtist,
    bucket: canonicalBucket,
    country: country?.trim() || undefined,
    countryName: country?.trim() || undefined,
    confidence: 'manual',
    sourceDetails: notes?.trim() || 'Direct Manual Cache Entry',
    timestamp: Date.now(),
  };

  const key = normalizeArtistKey(cleanArtist);
  runtimeCache.set(key, classification);
  saveClassificationCache();
  return classification;
}

/**
 * Remediate a single artist using Gemini 2.5 Flash
 */
export async function remediateSingleArtistWithAI(
  artistName: string,
  signal?: AbortSignal
): Promise<ArtistClassification | null> {
  if (!artistName || artistName === '<unknown>') return null;
  const results = await batchClassifyWithLLM([artistName], signal);
  const key = normalizeArtistKey(artistName);
  return results.get(key) || null;
}

/**
 * Reclassify selected cached entries using Gemini 2.5 Flash batch AI
 */
export async function reclassifyCachedEntriesWithAI(
  artistNames: string[],
  signal?: AbortSignal,
  onProgress?: (msg: string) => void
): Promise<number> {
  const results = await batchClassifyWithLLM(artistNames, signal, onProgress);
  return results.size;
}

