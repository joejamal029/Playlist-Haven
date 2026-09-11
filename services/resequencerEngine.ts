/**
 * Playlist Resequencer & Chronology Restorer Engine (Module 16)
 * 
 * Re-aligns playlist chronology disrupted by cross-platform conversion (e.g. YouTube Music to Spotify).
 * Features:
 * - Deterministic heuristic matcher (fast & offline) with artist/title isolation
 * - Universal AI Edge-Case Resolver covering 10 musicological ambiguity categories
 * - Relative chronological resequencing (preserving original discovery sequence)
 * - Source provenance tagging (YouTube Music vs Spotify vs Converted) for downstream Module 14 & 13
 * - Export to Spotify CSV, Downloader Query List (.txt), and M3U playlist
 */

import { cleanCompositeTrack } from './playlistSanitizer';
import { parseCSVString, normalizeStringForMatching } from './triageEngine';
import { getAIConfig } from './visionEngine';
import { GoogleGenAI } from '@google/genai';

export type SourceProvenanceMode = 
  | 'YouTube Music'
  | 'Spotify'
  | 'YouTube ➔ Spotify Converted'
  | 'Custom';

export type AIExecutionMode = 'on_demand' | 'auto_on_ingest';

export type MatchCategory =
  | 'exact'
  | 'fuzzy'
  | 'translation'
  | 'transliteration'
  | 'orthography'
  | 'collaboration'
  | 'ost_subtitle'
  | 'version_alias'
  | 'medley_part'
  | 'character_theme'
  | 'typo_drift'
  | 'manual'
  | 'unmatched';

export type MatchStatus = 'exact' | 'fuzzy' | 'ai' | 'manual' | 'unmatched';

export interface ReferenceTrack {
  id: string;
  originalIndex: number; // 1-based index in Reference playlist
  rawTrack: string;
  rawArtist: string;
  cleanTitle: string;
  cleanArtist: string;
  album?: string;
  matchedTargetId?: string;
  matchedTargetIndex?: number;
}

export interface TargetTrack {
  id: string;
  originalIndex: number; // 1-based index in Target playlist (before resequencing)
  title: string;
  artist: string;
  album: string;
  playlistName: string;
  type: string;
  isrc?: string;
  spotifyId?: string;
  rawRow: Record<string, string>; // Preserves all original CSV columns
  matchedRefIndex?: number;       // 1-based index in Reference playlist
  matchedRefId?: string;
  matchScore: number;             // 0.0 to 1.0
  matchCategory: MatchCategory;
  matchReason: string;
  matchStatus: MatchStatus;
  newSequenceIndex?: number;      // 1-based position after resequencing
  shiftedPositions?: number;      // originalIndex - newSequenceIndex (+ means moved up)
}

export interface AIEdgeCaseMatchResult {
  targetIndex: number;
  matchedRefIndex: number | null;
  confidence: number;
  category: MatchCategory;
  reason: string;
}

export interface ResequenceState {
  referenceTracks: ReferenceTrack[];
  targetTracks: TargetTrack[];
  resequencedTracks: TargetTrack[];
  unmatchedTargetCount: number;
  matchedCount: number;
  droppedReferenceCount: number;
  provenanceMode: SourceProvenanceMode;
  aiMode: AIExecutionMode;
}

// Generate unique ID
export const generateResequencerId = (): string => {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'req_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
};

/**
 * Ingest and parse the Reference Playlist (e.g. Original YouTube Playlist)
 */
export function parseReferencePlaylist(csvOrM3UContent: string, fileName: string = 'Reference'): ReferenceTrack[] {
  const clean = csvOrM3UContent.replace(/^\ufeff/, '').trim();
  if (!clean) return [];

  const tracks: ReferenceTrack[] = [];

  // M3U Format
  if (clean.startsWith('#EXTM3U') || fileName.toLowerCase().endsWith('.m3u') || fileName.toLowerCase().endsWith('.m3u8')) {
    const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let order = 1;
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const meta = line.substring(8).split(',').slice(1).join(',').trim();
        const cleaned = cleanCompositeTrack(meta);
        tracks.push({
          id: generateResequencerId(),
          originalIndex: order++,
          rawTrack: meta,
          rawArtist: cleaned.artist,
          cleanTitle: cleaned.title,
          cleanArtist: cleaned.artist,
          album: 'Original Playlist'
        });
      }
    }
    return tracks;
  }

  // CSV / TSV Format
  const parsed = parseCSVString(clean);
  if (parsed.header.length === 0) return [];

  const headerLower = parsed.header.map(h => h.toLowerCase());
  const trackIdx = headerLower.findIndex(h => h.includes('track') || h.includes('title') || h === 'song');
  const artistIdx = headerLower.findIndex(h => h.includes('artist'));
  const albumIdx = headerLower.findIndex(h => h.includes('album'));

  let order = 1;
  for (const row of parsed.rows) {
    const rawTrack = (trackIdx !== -1 && row[trackIdx]) ? row[trackIdx] : '';
    const rawArtist = (artistIdx !== -1 && row[artistIdx]) ? row[artistIdx] : '';
    const rawAlbum = (albumIdx !== -1 && row[albumIdx]) ? row[albumIdx] : '';

    if (!rawTrack && !rawArtist) continue;

    const cleaned = cleanCompositeTrack(rawTrack, rawArtist);
    tracks.push({
      id: generateResequencerId(),
      originalIndex: order++,
      rawTrack: rawTrack || cleaned.title,
      rawArtist: rawArtist,
      cleanTitle: cleaned.title,
      cleanArtist: cleaned.artist === '<unknown>' ? (rawArtist || 'Unknown Artist') : cleaned.artist,
      album: rawAlbum
    });
  }

  return tracks;
}

/**
 * Ingest and parse the Target Converted Playlist (e.g. Converted Spotify Playlist with appended corrections)
 */
export function parseTargetPlaylist(csvContent: string): TargetTrack[] {
  const clean = csvContent.replace(/^\ufeff/, '').trim();
  if (!clean) return [];

  const parsed = parseCSVString(clean);
  if (parsed.header.length === 0) return [];

  const header = parsed.header;
  const headerLower = header.map(h => h.toLowerCase());
  const trackIdx = headerLower.findIndex(h => h.includes('track') || h.includes('title') || h === 'song');
  const artistIdx = headerLower.findIndex(h => h.includes('artist'));
  const albumIdx = headerLower.findIndex(h => h.includes('album'));
  const playlistIdx = headerLower.findIndex(h => h.includes('playlist'));
  const typeIdx = headerLower.findIndex(h => h === 'type');
  const isrcIdx = headerLower.findIndex(h => h.includes('isrc'));
  const spotifyIdIdx = headerLower.findIndex(h => h.includes('spotify') || h.includes('id'));

  const tracks: TargetTrack[] = [];
  let order = 1;

  for (const row of parsed.rows) {
    const rawRow: Record<string, string> = {};
    header.forEach((col, idx) => {
      rawRow[col] = row[idx] || '';
    });

    const title = (trackIdx !== -1 && row[trackIdx]) ? row[trackIdx] : '';
    const artist = (artistIdx !== -1 && row[artistIdx]) ? row[artistIdx] : '';
    const album = (albumIdx !== -1 && row[albumIdx]) ? row[albumIdx] : '';
    const playlistName = (playlistIdx !== -1 && row[playlistIdx]) ? row[playlistIdx] : '';
    const type = (typeIdx !== -1 && row[typeIdx]) ? row[typeIdx] : 'Track';
    const isrc = (isrcIdx !== -1 && row[isrcIdx]) ? row[isrcIdx] : undefined;
    const spotifyId = (spotifyIdIdx !== -1 && row[spotifyIdIdx]) ? row[spotifyIdIdx] : undefined;

    if (!title && !artist) continue;

    tracks.push({
      id: generateResequencerId(),
      originalIndex: order++,
      title,
      artist: artist || 'Unknown Artist',
      album,
      playlistName,
      type,
      isrc,
      spotifyId,
      rawRow,
      matchScore: 0,
      matchCategory: 'unmatched',
      matchReason: 'Unprocessed',
      matchStatus: 'unmatched'
    });
  }

  return tracks;
}

/**
 * Fast deterministic heuristic matcher with strict title-guarding
 */
export function matchDeterministically(
  referenceTracks: ReferenceTrack[],
  targetTracks: TargetTrack[]
): {
  matchedTargets: TargetTrack[];
  matchedCount: number;
  unmatchedCount: number;
} {
  const usedRefIndices = new Set<number>();
  const updatedTargets = targetTracks.map(t => ({ ...t }));

  // Helper to score title similarity
  const calcDice = (a: string, b: string): number => {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bigramsA = [];
    for (let i = 0; i < a.length - 1; i++) bigramsA.push(a.substring(i, i + 2));
    const bigramsB = [];
    for (let i = 0; i < b.length - 1; i++) bigramsB.push(b.substring(i, i + 2));
    let matches = 0;
    const bCopy = [...bigramsB];
    for (const bg of bigramsA) {
      const idx = bCopy.indexOf(bg);
      if (idx !== -1) {
        matches++;
        bCopy.splice(idx, 1);
      }
    }
    return (2 * matches) / (bigramsA.length + bigramsB.length);
  };

  // PASS 1: Exact Title & Artist match
  for (const t of updatedTargets) {
    if (t.matchStatus !== 'unmatched') continue;
    const normTTitle = normalizeStringForMatching(t.title);
    const normTArtist = normalizeStringForMatching(t.artist);

    for (const ref of referenceTracks) {
      if (usedRefIndices.has(ref.originalIndex)) continue;
      const normRTitle = normalizeStringForMatching(ref.cleanTitle);
      const normRArtist = normalizeStringForMatching(ref.cleanArtist);

      if (normTTitle && normRTitle && normTTitle === normRTitle) {
        if (normTArtist === normRArtist || normRArtist.includes(normTArtist) || normTArtist.includes(normRArtist)) {
          t.matchedRefIndex = ref.originalIndex;
          t.matchedRefId = ref.id;
          t.matchScore = 1.0;
          t.matchCategory = 'exact';
          t.matchReason = 'Exact Title & Artist Match';
          t.matchStatus = 'exact';
          usedRefIndices.add(ref.originalIndex);
          break;
        }
      }
    }
  }

  // PASS 2: Exact Title Match alone (where artist was uncredited or in video title)
  for (const t of updatedTargets) {
    if (t.matchStatus !== 'unmatched') continue;
    const normTTitle = normalizeStringForMatching(t.title);

    for (const ref of referenceTracks) {
      if (usedRefIndices.has(ref.originalIndex)) continue;
      const normRTitle = normalizeStringForMatching(ref.cleanTitle);

      if (normTTitle && normRTitle && normTTitle === normRTitle) {
        t.matchedRefIndex = ref.originalIndex;
        t.matchedRefId = ref.id;
        t.matchScore = 0.95;
        t.matchCategory = 'exact';
        t.matchReason = `Exact Title Match ("${ref.cleanTitle}")`;
        t.matchStatus = 'exact';
        usedRefIndices.add(ref.originalIndex);
        break;
      }
    }
  }

  // PASS 3: Title Substring + Partial Artist Match (e.g. "SOLO - KR Ver." vs "SOLO")
  for (const t of updatedTargets) {
    if (t.matchStatus !== 'unmatched') continue;
    const normTTitle = normalizeStringForMatching(t.title);
    const normTArtist = normalizeStringForMatching(t.artist);

    for (const ref of referenceTracks) {
      if (usedRefIndices.has(ref.originalIndex)) continue;
      const normRTitle = normalizeStringForMatching(ref.cleanTitle);
      const normRArtist = normalizeStringForMatching(ref.cleanArtist);

      if (normTTitle && normRTitle) {
        const titleOverlap = normTTitle.startsWith(normRTitle) || normRTitle.startsWith(normTTitle) ||
                             normTTitle.includes(normRTitle) || normRTitle.includes(normTTitle);

        if (titleOverlap) {
          const artistMatch = !normTArtist || !normRArtist || normTArtist === normRArtist ||
                              normTArtist.includes(normRArtist) || normRArtist.includes(normTArtist);

          if (artistMatch) {
            t.matchedRefIndex = ref.originalIndex;
            t.matchedRefId = ref.id;
            t.matchScore = 0.88;
            t.matchCategory = 'fuzzy';
            t.matchReason = `Title Substring Match: "${ref.cleanTitle}"`;
            t.matchStatus = 'fuzzy';
            usedRefIndices.add(ref.originalIndex);
            break;
          }
        }
      }
    }
  }

  // PASS 4: High Fuzzy Title Similarity (> 0.82) with Guarded Artist Checking
  for (const t of updatedTargets) {
    if (t.matchStatus !== 'unmatched') continue;
    const normTTitle = normalizeStringForMatching(t.title);
    const normTArtist = normalizeStringForMatching(t.artist);

    let bestRef: ReferenceTrack | null = null;
    let bestDice = 0;

    for (const ref of referenceTracks) {
      if (usedRefIndices.has(ref.originalIndex)) continue;
      const normRTitle = normalizeStringForMatching(ref.cleanTitle);
      const normRArtist = normalizeStringForMatching(ref.cleanArtist);

      const titleSim = calcDice(normTTitle, normRTitle);
      if (titleSim > 0.82 && titleSim > bestDice) {
        const artistSim = (!normTArtist || !normRArtist) ? 0.7 : calcDice(normTArtist, normRArtist);
        if (artistSim >= 0.4 || normRArtist.includes(normTArtist) || normTArtist.includes(normRArtist)) {
          bestDice = titleSim;
          bestRef = ref;
        }
      }
    }

    if (bestRef && bestDice > 0.82) {
      t.matchedRefIndex = bestRef.originalIndex;
      t.matchedRefId = bestRef.id;
      t.matchScore = parseFloat(bestDice.toFixed(2));
      t.matchCategory = 'fuzzy';
      t.matchReason = `Fuzzy Title Match (${Math.round(bestDice * 100)}%): "${bestRef.cleanTitle}"`;
      t.matchStatus = 'fuzzy';
      usedRefIndices.add(bestRef.originalIndex);
    }
  }

  const matchedCount = updatedTargets.filter(t => t.matchStatus !== 'unmatched').length;
  const unmatchedCount = updatedTargets.length - matchedCount;

  return {
    matchedTargets: updatedTargets,
    matchedCount,
    unmatchedCount
  };
}

/**
 * Universal AI Edge-Case Resolver Template & Execution
 * Covers all 10 ambiguity categories across languages, transliterations, and metadata variations.
 */
export async function resolveEdgeCasesWithAI(
  referenceTracks: ReferenceTrack[],
  targetTracks: TargetTrack[],
  onProgress?: (message: string) => void
): Promise<{
  updatedTargets: TargetTrack[];
  aiMatchedCount: number;
  newMatches: AIEdgeCaseMatchResult[];
}> {
  const unmatchedTargets = targetTracks.filter(t => t.matchStatus === 'unmatched');
  if (unmatchedTargets.length === 0) {
    return { updatedTargets: targetTracks, aiMatchedCount: 0, newMatches: [] };
  }

  // Find candidate unmapped reference tracks
  const usedRefIndices = new Set(
    targetTracks.filter(t => t.matchStatus !== 'unmatched' && t.matchedRefIndex !== undefined).map(t => t.matchedRefIndex!)
  );
  const candidateRefs = referenceTracks.filter(r => !usedRefIndices.has(r.originalIndex));

  if (candidateRefs.length === 0) {
    return { updatedTargets: targetTracks, aiMatchedCount: 0, newMatches: [] };
  }

  const aiConfig = getAIConfig();
  let apiKey = aiConfig.apiKey;
  if (!apiKey) {
    try {
      // @ts-ignore
      apiKey = (import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.VITE_API_KEY) || '';
    } catch (e) {}
  }

  const isGemini = aiConfig.provider === 'gemini' || !aiConfig.provider;
  if (!apiKey && isGemini) {
    throw new Error('Gemini API key is required to resolve edge cases with AI. Please configure your key in AI Settings or use an OpenAI-compatible endpoint.');
  }

  if (onProgress) onProgress(`Synthesizing cross-lingual matches across ${unmatchedTargets.length} edge cases...`);

  // Build the compact structured payload for the AI
  const unmatchedPayload = unmatchedTargets.map(t => ({
    targetIndex: t.originalIndex,
    title: t.title,
    artist: t.artist,
    album: t.album,
    isrc: t.isrc
  }));

  const candidatePayload = candidateRefs.map(r => ({
    refIndex: r.originalIndex,
    rawTrack: r.rawTrack,
    artist: r.cleanArtist,
    title: r.cleanTitle
  }));

  const systemPrompt = `You are a world-class musicologist, cross-platform audio cataloging specialist, and multilingual metadata matching engine.
Your task is to match Spotify tracks that were converted from a YouTube playlist where titles or artists have platform-conversion ambiguities.

UNIVERSAL RESOLUTION TAXONOMY (Analyze and classify each match into one of these 10 categories):
1. 'translation': Official title translations between languages (e.g. English <-> Japanese/Chinese/Korean/French/Spanish, e.g. "Martian" = "火星人", "Snake" = "へび").
2. 'transliteration': Romanization / Script transliteration systems (Pinyin, Romaji, Revised Romanization of Korean, Cyrillic, e.g. "とうきょう" = "TOKYO", "原点廻帰" = "Genten Kaiki", "宇多田ヒカル" = "Hikaru Utada").
3. 'orthography': Character set differences (Traditional vs Simplified Chinese like "斑馬" = "斑马", "假如當初" = "假如当初", full-width vs half-width characters).
4. 'collaboration': Main vs featuring artist swapped or omitted ("A feat. B", "A & B", "A x B", "A vs B").
5. 'ost_subtitle': Titles containing drama series tags (电视剧《...》插曲), anime OP/ED themes, movie OSTs, or lyric subtitles.
6. 'version_alias': Remixes, live takes, or edits ("Original Mix", "Acoustic", "Parisian Soul Edit", "Remastered", "Live at...").
7. 'medley_part': A song presented in a medley on YouTube but released as an individual track on Spotify.
8. 'character_theme': Song theme or character aliases (Epic Rap Battles characters, video game themes).
9. 'typo_drift': Minor phonetic typos or platform scraper artifacts.
10. 'no_match': The Spotify track is NOT in the YouTube candidate list. DO NOT hallucinate or force a match if confidence is low (< 0.5). Return matchedRefIndex: null.

STRICT JSON OUTPUT FORMAT:
Return ONLY a valid JSON array of objects conforming to this schema:
[
  {
    "targetIndex": number,
    "matchedRefIndex": number | null,
    "confidence": number (between 0.0 and 1.0),
    "category": "translation" | "transliteration" | "orthography" | "collaboration" | "ost_subtitle" | "version_alias" | "medley_part" | "character_theme" | "typo_drift" | "no_match",
    "reason": "Clear 1-sentence explanation of why these match"
  }
]`;

  const userPrompt = `UNMATCHED SPOTIFY TARGET TRACKS:
${JSON.stringify(unmatchedPayload, null, 2)}

CANDIDATE YOUTUBE REFERENCE TRACKS:
${JSON.stringify(candidatePayload, null, 2)}

Identify the true match for each target track. Return JSON only.`;

  let responseText = '';

  if (isGemini) {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = aiConfig.modelName || 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });
    responseText = response.text || '';
  } else {
    // OpenAI-compatible endpoint
    const baseUrl = aiConfig.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(aiConfig.apiKey ? { Authorization: `Bearer ${aiConfig.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: aiConfig.modelName || 'llama3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) {
      throw new Error(`AI Request failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    responseText = data.choices?.[0]?.message?.content || '';
  }

  // Parse JSON response
  let rawParsed: any;
  try {
    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    rawParsed = JSON.parse(cleanJson);
    if (rawParsed.matches && Array.isArray(rawParsed.matches)) {
      rawParsed = rawParsed.matches;
    }
  } catch (err: any) {
    console.error('Failed to parse AI response JSON:', responseText);
    throw new Error(`AI returned invalid JSON: ${err.message}`);
  }

  if (!Array.isArray(rawParsed)) {
    throw new Error('AI response is not an array of matches.');
  }

  const newMatches: AIEdgeCaseMatchResult[] = [];
  const updatedTargets = targetTracks.map(t => ({ ...t }));
  const claimedRefIndices = new Set(usedRefIndices);

  for (const match of rawParsed) {
    const targetIdx = Number(match.targetIndex);
    const refIdx = match.matchedRefIndex !== null && match.matchedRefIndex !== undefined ? Number(match.matchedRefIndex) : null;
    const confidence = Number(match.confidence) || 0;
    const category = (match.category || 'translation') as MatchCategory;
    const reason = match.reason || 'AI Resolved Match';

    if (refIdx !== null && confidence >= 0.5 && !claimedRefIndices.has(refIdx)) {
      const targetItem = updatedTargets.find(t => t.originalIndex === targetIdx);
      const refItem = referenceTracks.find(r => r.originalIndex === refIdx);

      if (targetItem && refItem) {
        targetItem.matchedRefIndex = refIdx;
        targetItem.matchedRefId = refItem.id;
        targetItem.matchScore = parseFloat(confidence.toFixed(2));
        targetItem.matchCategory = category;
        targetItem.matchReason = reason;
        targetItem.matchStatus = 'ai';
        claimedRefIndices.add(refIdx);

        newMatches.push({
          targetIndex: targetIdx,
          matchedRefIndex: refIdx,
          confidence,
          category,
          reason
        });
      }
    }
  }

  return {
    updatedTargets,
    aiMatchedCount: newMatches.length,
    newMatches
  };
}

/**
 * Restore relative chronological order of Target tracks based on matched reference indices
 */
export function resequenceTracks(
  targetTracks: TargetTrack[],
  customOverrides?: Map<string, number> // targetTrackId -> custom position
): TargetTrack[] {
  // Separate matched from unmatched
  const matched = targetTracks.filter(t => t.matchedRefIndex !== undefined && t.matchedRefIndex !== null);
  const unmatched = targetTracks.filter(t => t.matchedRefIndex === undefined || t.matchedRefIndex === null);

  // Sort matched tracks strictly by matchedRefIndex ascending
  matched.sort((a, b) => {
    // If user specified a manual custom override rank
    if (customOverrides) {
      const overA = customOverrides.get(a.id);
      const overB = customOverrides.get(b.id);
      if (overA !== undefined && overB !== undefined) return overA - overB;
      if (overA !== undefined) return -1;
      if (overB !== undefined) return 1;
    }
    return (a.matchedRefIndex || 0) - (b.matchedRefIndex || 0);
  });

  // Combine: matched in chronological sequence + any unmatched kept at the bottom
  const combined = [...matched, ...unmatched];

  // Assign new sequential 1-based indices and compute shift metrics
  return combined.map((t, idx) => {
    const newSeq = idx + 1;
    const shift = t.originalIndex - newSeq; // positive means moved up, e.g. #58 -> #2 is +56
    return {
      ...t,
      newSequenceIndex: newSeq,
      shiftedPositions: shift
    };
  });
}

/**
 * Manually bind or unbind a target track to a reference track
 */
export function manuallyBindTrack(
  targetId: string,
  refIndex: number | null,
  referenceTracks: ReferenceTrack[],
  targetTracks: TargetTrack[]
): TargetTrack[] {
  return targetTracks.map(t => {
    if (t.id !== targetId) return t;

    if (refIndex === null) {
      return {
        ...t,
        matchedRefIndex: undefined,
        matchedRefId: undefined,
        matchScore: 0,
        matchCategory: 'unmatched',
        matchReason: 'Manually Unbound',
        matchStatus: 'unmatched'
      };
    }

    const ref = referenceTracks.find(r => r.originalIndex === refIndex);
    return {
      ...t,
      matchedRefIndex: refIndex,
      matchedRefId: ref?.id,
      matchScore: 1.0,
      matchCategory: 'manual',
      matchReason: `Manually Linked to YouTube #${refIndex} ("${ref?.cleanTitle || ''}")`,
      matchStatus: 'manual'
    };
  });
}

/**
 * Batch move selected tracks to a specific target sequence index
 */
export function batchMoveTracks(
  trackIdsToMove: string[],
  targetPosition: number, // 1-based target index
  currentResequenced: TargetTrack[]
): TargetTrack[] {
  const movingSet = new Set(trackIdsToMove);
  const movingTracks = currentResequenced.filter(t => movingSet.has(t.id));
  const remainingTracks = currentResequenced.filter(t => !movingSet.has(t.id));

  const insertIndex = Math.max(0, Math.min(targetPosition - 1, remainingTracks.length));
  const newOrder = [
    ...remainingTracks.slice(0, insertIndex),
    ...movingTracks,
    ...remainingTracks.slice(insertIndex)
  ];

  return newOrder.map((t, idx) => ({
    ...t,
    newSequenceIndex: idx + 1,
    shiftedPositions: t.originalIndex - (idx + 1)
  }));
}

/**
 * Export Resequenced Target Playlist to CSV (Preserving all original Spotify columns)
 */
export function exportResequencedCSV(
  resequencedTracks: TargetTrack[],
  provenance: SourceProvenanceMode = 'YouTube Music',
  updatedPlaylistName?: string
): string {
  if (resequencedTracks.length === 0) return '';

  const firstRaw = resequencedTracks[0]?.rawRow || {};
  const originalHeaders = Object.keys(firstRaw);

  // Guarantee standard Spotify column order or fallback
  const baseHeaders = originalHeaders.length > 0
    ? [...originalHeaders]
    : ['Track name', 'Artist name', 'Album', 'Playlist name', 'Type', 'ISRC', 'Spotify - id'];

  // Add Source, Provenance, and Original Sequence columns if not already present
  const exportHeaders = [...baseHeaders];
  if (!exportHeaders.some(h => h.toLowerCase() === 'source')) exportHeaders.push('Source');
  if (!exportHeaders.some(h => h.toLowerCase() === 'provenance')) exportHeaders.push('Provenance');
  if (!exportHeaders.some(h => h.toLowerCase() === 'yt_sequence')) exportHeaders.push('YT_Sequence');

  const escapeCell = (val: any) => {
    const s = String(val ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [exportHeaders.map(escapeCell).join(',')];

  for (const track of resequencedTracks) {
    const row = exportHeaders.map(col => {
      const colLower = col.toLowerCase();
      if (colLower === 'track name' || colLower === 'title') return track.title;
      if (colLower === 'artist name' || colLower === 'artist') return track.artist;
      if (colLower === 'album') return track.album;
      if (colLower === 'playlist name') return updatedPlaylistName || track.playlistName || 'Resequenced Playlist';
      if (colLower === 'type') return track.type || 'Track';
      if (colLower === 'isrc') return track.isrc || '';
      if (colLower === 'spotify - id' || colLower === 'spotify id') return track.spotifyId || '';
      if (colLower === 'source') return provenance;
      if (colLower === 'provenance') return `Converted to Spotify (${provenance} Baseline)`;
      if (colLower === 'yt_sequence') return track.matchedRefIndex ? `YT #${track.matchedRefIndex}` : 'Unmatched';
      return track.rawRow[col] || '';
    });
    lines.push(row.map(escapeCell).join(','));
  }

  return lines.join('\n');
}

/**
 * Export clean Downloader query list (.txt)
 */
export function exportDownloaderList(resequencedTracks: TargetTrack[]): string {
  return resequencedTracks
    .map(t => `${t.artist} - ${t.title}`)
    .join('\n');
}

/**
 * Export standard M3U playlist
 */
export function exportResequencedM3U(
  resequencedTracks: TargetTrack[],
  playlistName: string = 'Resequenced Discovery Playlist'
): string {
  const lines = [`#EXTM3U`, `#PLAYLIST:${playlistName}`];
  for (const track of resequencedTracks) {
    lines.push(`#EXTINF:-1,${track.artist} - ${track.title}`);
    lines.push(`${track.artist} - ${track.title}.mp3`);
  }
  return lines.join('\n');
}
