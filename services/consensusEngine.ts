/**
 * Consensus Aggregator Engine (Module 17)
 * 
 * Provides algorithms, concurrent worker pipelines, and Google Search Grounding AI
 * to cross-tabulate 4 to 8 independent music sources (fan lists, critic rankings,
 * concert setlists, Reddit polls, OCR screenshots) to extract universal consensus
 * masterpieces across deep discographies.
 */

import { cleanCompositeTrack } from './playlistSanitizer';
import { sanitizeSongQuery } from './songQuerySanitizer';
import { parseScreenshot, ExtractedSong, getAIClient, getAIConfig, callOpenAICompatible, smartRetry } from './visionEngine';

export interface RawTrackInput {
  title: string;
  artist: string;
  album?: string;
  sourceName: string;
}

export interface ConsensusTrack {
  id: string;                      // Base64 safe hash of normalized artist-title
  artist: string;
  title: string;
  album: string;
  consensusCount: number;          // Number of distinct sources that included this track (k)
  totalSources: number;            // Total active sources evaluated (N)
  consensusPercentage: number;     // Math.round((k / N) * 100)
  sources: Set<string>;            // Specific source names that nominated this track
}

export interface EnrichedConsensusTrack extends ConsensusTrack {
  verifiedArtist?: string;
  verifiedTitle?: string;
  verifiedAlbum?: string;
  confidence?: 'high' | 'medium' | 'low';
  searchUrl?: string;
  groundingStatus?: 'unverified' | 'grounded' | 'failed';
}

export interface SourceSummary {
  id: string;
  name: string;
  trackCount: number;
  enabled: boolean;
  tracks: RawTrackInput[];
}

export interface SourceSection {
  id: string;
  name: string;
  inputType: 'files' | 'text' | 'ocr';
  files: File[];
  textDump: string;
  enabled: boolean;
  trackCount: number;
  tracks: RawTrackInput[];
}

export interface ConcurrencyProgress {
  stage: 'idle' | 'parsing' | 'ai_search' | 'aggregating' | 'complete';
  total: number;
  processed: number;
  failed: number;
  currentItem: string;
}

/**
 * Levenshtein distance computation
 */
export const levenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

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

  return matrix[b.length][a.length];
};

/**
 * Normalized similarity score between 0.0 and 1.0
 */
export const getSimilarity = (s1: string, s2: string): number => {
  if (s1 === s2) return 1.0;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshteinDistance(longer, shorter)) / longer.length;
};

/**
 * Normalizes title or artist string for fuzzy comparison
 */
export const normalizeConsensusString = (str: string): string => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip diacritics / accents
    .toLowerCase()
    .replace(/[\(\[][^\)\]]*(?:official|video|audio|remaster|remastered|deluxe|live|edit|feat|ft|version)[^\)\]]*[\)\]]/gi, '')
    .replace(/\b(?:feat\.?|ft\.?|featuring)\s+[^,\-\(\]]+/gi, '')
    .replace(/[^\w\s\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, ' ') // Strip punctuation except CJK/Hangul
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Safely generates a unique Base64 ID for an artist + title pair
 */
export const generateTrackId = (artist: string, title: string): string => {
  const norm = `${normalizeConsensusString(artist)}:::${normalizeConsensusString(title)}`;
  try {
    return btoa(unescape(encodeURIComponent(norm)));
  } catch {
    return norm.replace(/\s+/g, '-');
  }
};

/**
 * Determines whether two track items represent the same underlying song
 */
export const isSameTrack = (
  trackA: { artist: string; title: string },
  trackB: { artist: string; title: string }
): boolean => {
  const normTitleA = normalizeConsensusString(trackA.title);
  const normTitleB = normalizeConsensusString(trackB.title);

  // Exact normalized title match
  if (normTitleA === normTitleB && normTitleA.length > 0) {
    const normArtistA = normalizeConsensusString(trackA.artist);
    const normArtistB = normalizeConsensusString(trackB.artist);

    // If one artist is missing/unknown, title match is sufficient
    if (
      !normArtistA || !normArtistB ||
      normArtistA === 'unknown' || normArtistB === 'unknown' ||
      normArtistA === '<unknown>' || normArtistB === '<unknown>'
    ) {
      return true;
    }

    if (normArtistA === normArtistB) return true;
    if (normArtistA.includes(normArtistB) || normArtistB.includes(normArtistA)) return true;

    const artistSim = getSimilarity(normArtistA, normArtistB);
    if (artistSim >= 0.75) return true;
  }

  // Fuzzy title and artist match
  const normArtistA = normalizeConsensusString(trackA.artist);
  const normArtistB = normalizeConsensusString(trackB.artist);

  const titleSim = getSimilarity(normTitleA, normTitleB);
  const artistSim = getSimilarity(normArtistA, normArtistB);

  // High similarity on both title and artist
  if (titleSim >= 0.85 && artistSim >= 0.80) {
    return true;
  }

  // Very high title similarity when artist is a subset
  if (titleSim >= 0.90 && (normArtistA.includes(normArtistB) || normArtistB.includes(normArtistA))) {
    return true;
  }

  return false;
};

/**
 * Parses raw CSV/TSV contents into standardized RawTrackInput items
 */
export const parseCSVTracks = (content: string, sourceName: string): RawTrackInput[] => {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const tracks: RawTrackInput[] = [];

  // Helper to split CSV row handling quotes
  const splitRow = (row: string): string[] => {
    const delimiter = row.includes('\t') ? '\t' : ',';
    const pattern = new RegExp(
      `(${delimiter}|\\r?\\n|\\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}\\r\\n]*))`,
      'gi'
    );
    const fields: string[] = [];
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(row))) {
      const field = match[2] ? match[2].replace(/""/g, '"') : match[3];
      fields.push(field ? field.trim() : '');
    }
    return fields.length > 0 ? fields : row.split(delimiter).map(s => s.trim());
  };

  const header = splitRow(lines[0]);
  const headerLower = header.map(h => h.toLowerCase());

  let titleIdx = headerLower.findIndex(h => h.includes('track') || h.includes('title') || h === 'song' || h === 'name');
  let artistIdx = headerLower.findIndex(h => h.includes('artist') || h === 'performer' || h === 'author');
  let albumIdx = headerLower.findIndex(h => h.includes('album') || h === 'collection' || h === 'release');

  const hasRecognizedHeader = titleIdx !== -1 || artistIdx !== -1;
  const startRow = hasRecognizedHeader ? 1 : 0;

  if (!hasRecognizedHeader && header.length >= 2) {
    // Default col 0 = Artist, col 1 = Title or vice versa
    artistIdx = 0;
    titleIdx = 1;
  }

  for (let i = startRow; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length === 0 || cols.every(c => !c)) continue;

    let artist = '';
    let title = '';
    let album = '';

    if (titleIdx !== -1 && cols[titleIdx]) {
      title = cols[titleIdx];
    }
    if (artistIdx !== -1 && cols[artistIdx]) {
      artist = cols[artistIdx];
    }
    if (albumIdx !== -1 && cols[albumIdx]) {
      album = cols[albumIdx];
    }

    // If only one column exists or artist is missing, attempt composite cleaning
    if (!artist || !title) {
      const compositeRaw = title || artist || cols[0];
      const cleaned = cleanCompositeTrack(compositeRaw, artist);
      artist = cleaned.artist;
      title = cleaned.title;
    }

    // Run query sanitizer for clean tags
    const sanitized = sanitizeSongQuery(artist, title, album);

    if (sanitized.cleanTitle) {
      tracks.push({
        artist: sanitized.cleanArtist || artist || 'Unknown Artist',
        title: sanitized.cleanTitle || title,
        album: sanitized.cleanAlbum || album || '',
        sourceName,
      });
    }
  }

  return tracks;
};

/**
 * Parses M3U/M3U8 playlist files
 */
export const parseM3UTracks = (content: string, sourceName: string): RawTrackInput[] => {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tracks: RawTrackInput[] = [];

  let currentExtinf = '';

  for (const line of lines) {
    if (line.toUpperCase() === '#EXTM3U') continue;

    if (line.toUpperCase().startsWith('#EXTINF:')) {
      currentExtinf = line;
      continue;
    }

    if (line.startsWith('#')) continue;

    let title = '';
    let artist = '';
    let album = '';

    if (currentExtinf) {
      const commaIdx = currentExtinf.indexOf(',');
      if (commaIdx !== -1) {
        const info = currentExtinf.substring(commaIdx + 1).trim();
        const cleaned = cleanCompositeTrack(info);
        artist = cleaned.artist;
        title = cleaned.title;
      }
      currentExtinf = '';
    }

    // If EXTINF was missing or empty, extract from path filename
    if (!title) {
      const pathParts = line.split(/[/\\]/);
      const fileName = pathParts[pathParts.length - 1].replace(/\.[a-zA-Z0-9]+$/, '');
      const cleaned = cleanCompositeTrack(fileName);
      artist = cleaned.artist;
      title = cleaned.title;
    }

    const sanitized = sanitizeSongQuery(artist, title, album);
    if (sanitized.cleanTitle) {
      tracks.push({
        artist: sanitized.cleanArtist || artist || 'Unknown Artist',
        title: sanitized.cleanTitle || title,
        album: sanitized.cleanAlbum || album || '',
        sourceName,
      });
    }
  }

  return tracks;
};

/**
 * Parses plain text dumps (e.g. numbered forum lists, "Artist - Title" dumps)
 */
export const parseTextDumpTracks = (text: string, sourceName: string): RawTrackInput[] => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tracks: RawTrackInput[] = [];

  for (const line of lines) {
    // Strip leading track numbering: "1. ", "01 - ", "[1] ", "#1 "
    const strippedNumber = line.replace(/^(?:#?\d{1,3}[\.\)\:\-\s]+|\[\d{1,3}\]\s*)/, '').trim();
    if (!strippedNumber) continue;

    const cleaned = cleanCompositeTrack(strippedNumber);
    const sanitized = sanitizeSongQuery(cleaned.artist, cleaned.title);

    if (sanitized.cleanTitle) {
      tracks.push({
        artist: sanitized.cleanArtist || cleaned.artist || 'Unknown Artist',
        title: sanitized.cleanTitle || cleaned.title,
        album: '',
        sourceName,
      });
    }
  }

  return tracks;
};

/**
 * Parses screenshot using Vision AI and converts into RawTrackInput
 */
export const parseScreenshotTracks = async (file: File, sourceName: string): Promise<RawTrackInput[]> => {
  const extracted: ExtractedSong[] = await parseScreenshot(file);
  return extracted.map(song => {
    const sanitized = sanitizeSongQuery(song.artist, song.title, song.album);
    return {
      artist: sanitized.cleanArtist || song.artist || 'Unknown Artist',
      title: sanitized.cleanTitle || song.title,
      album: sanitized.cleanAlbum || song.album || '',
      sourceName,
    };
  });
};

/**
 * Concurrently processes an array of SourceSections using worker pool
 * (CONCURRENCY = 2 for image OCR to prevent payload limits, CONCURRENCY = 4 for text/CSV)
 */
export const processSourceSectionsConcurrently = async (
  sections: SourceSection[],
  onProgress?: (progress: ConcurrencyProgress) => void
): Promise<SourceSection[]> => {
  const updatedSections: SourceSection[] = sections.map(s => ({ ...s, tracks: [...s.tracks] }));

  // Collect tasks
  interface SectionTask {
    sectionId: string;
    sectionName: string;
    type: 'file' | 'text' | 'ocr';
    file?: File;
    text?: string;
  }

  const tasks: SectionTask[] = [];

  for (const s of updatedSections) {
    if (s.inputType === 'files') {
      for (const f of s.files) {
        tasks.push({ sectionId: s.id, sectionName: s.name, type: 'file', file: f });
      }
    } else if (s.inputType === 'ocr') {
      for (const f of s.files) {
        tasks.push({ sectionId: s.id, sectionName: s.name, type: 'ocr', file: f });
      }
    } else if (s.inputType === 'text' && s.textDump.trim()) {
      tasks.push({ sectionId: s.id, sectionName: s.name, type: 'text', text: s.textDump });
    }
  }

  if (tasks.length === 0) {
    return updatedSections;
  }

  const total = tasks.length;
  let processed = 0;
  let failed = 0;

  onProgress?.({
    stage: 'parsing',
    total,
    processed: 0,
    failed: 0,
    currentItem: 'Starting multi-source intake...',
  });

  const CONCURRENCY = 4;
  const queue = [...tasks];

  // Map to collect extracted tracks per section
  const sectionTrackMap = new Map<string, RawTrackInput[]>();
  for (const s of updatedSections) {
    sectionTrackMap.set(s.id, []);
  }

  const worker = async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;

      const itemName = task.file ? task.file.name : `${task.sectionName} Text Dump`;
      onProgress?.({
        stage: 'parsing',
        total,
        processed,
        failed,
        currentItem: `Parsing ${itemName}...`,
      });

      try {
        let extracted: RawTrackInput[] = [];

        if (task.type === 'file' && task.file) {
          const content = await task.file.text();
          const ext = task.file.name.split('.').pop()?.toLowerCase() || '';
          if (ext === 'csv' || ext === 'tsv') {
            extracted = parseCSVTracks(content, task.sectionName);
          } else if (ext === 'm3u' || ext === 'm3u8') {
            extracted = parseM3UTracks(content, task.sectionName);
          } else {
            extracted = parseTextDumpTracks(content, task.sectionName);
          }
        } else if (task.type === 'ocr' && task.file) {
          extracted = await parseScreenshotTracks(task.file, task.sectionName);
        } else if (task.type === 'text' && task.text) {
          extracted = parseTextDumpTracks(task.text, task.sectionName);
        }

        const currentList = sectionTrackMap.get(task.sectionId) || [];
        sectionTrackMap.set(task.sectionId, [...currentList, ...extracted]);
      } catch (err) {
        console.error(`Failed to process ${itemName}`, err);
        failed++;
      } finally {
        processed++;
        onProgress?.({
          stage: 'parsing',
          total,
          processed,
          failed,
          currentItem: `Finished ${itemName}`,
        });
      }
    }
  };

  const workers = Array(Math.min(total, CONCURRENCY))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);

  // Update sections with gathered tracks
  for (const s of updatedSections) {
    const gathered = sectionTrackMap.get(s.id) || [];
    if (gathered.length > 0) {
      s.tracks = gathered;
      s.trackCount = gathered.length;
    }
  }

  onProgress?.({
    stage: 'complete',
    total,
    processed,
    failed,
    currentItem: 'All source sections processed.',
  });

  return updatedSections;
};

/**
 * EXPERIMENTAL AI SEARCH GROUNDING:
 * Uses Google Search Grounding to verify and enrich a ConsensusTrack with canonical metadata
 */
export const enrichConsensusTrackWithAISearch = async (track: ConsensusTrack): Promise<EnrichedConsensusTrack> => {
  return smartRetry(async () => {
    try {
      const config = getAIConfig();
      let text = '';
      let searchUrl = '';

      if (config.provider === 'gemini') {
        const response = await getAIClient().models.generateContent({
          model: config.modelName || 'gemini-2.5-flash',
          contents: `Find the correct, canonical music metadata for this track.
          
          Title: "${track.title}"
          Artist: "${track.artist}"
          Album (if known): "${track.album || ''}"
          
          Search the web to verify the exact canonical Artist Name, Track Title, and original Album.
          
          Return ONLY a JSON object with this exact structure, no markdown formatting or other text:
          { "artist": "string", "title": "string", "album": "string", "confidence": "high" | "medium" | "low" }`,
          config: {
            tools: [{ googleSearch: {} }]
          }
        });

        text = response.text || '{}';

        // Extract grounding search URL if available
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks && chunks.length > 0) {
          const webChunk = chunks.find((c: any) => c.web?.uri);
          if (webChunk) searchUrl = webChunk.web.uri;
        }
      } else {
        text = await callOpenAICompatible(
          `Find the correct, canonical music metadata for this track.
          
          Title: "${track.title}"
          Artist: "${track.artist}"
          Album (if known): "${track.album || ''}"
          
          Identify the canonical Artist, Track Title, and Album based on your knowledge base.
          
          Return ONLY a JSON object with this exact structure. Do not include any explanation or markdown formatting outside of raw JSON:
          { "artist": "string", "title": "string", "album": "string", "confidence": "high" | "medium" | "low" }`
        );
      }

      text = text.replace(/```json/g, '').replace(/```/g, '').trim();

      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON from AI search response:', text);
      }

      return {
        ...track,
        verifiedArtist: data.artist || track.artist,
        verifiedTitle: data.title || track.title,
        verifiedAlbum: data.album || track.album,
        confidence: data.confidence || 'medium',
        searchUrl: searchUrl || (data.artist && data.title ? `https://www.google.com/search?q=${encodeURIComponent(`${data.artist} ${data.title}`)}` : undefined),
        groundingStatus: 'grounded',
      };
    } catch (err) {
      console.error(`AI Search Grounding error for ${track.title}:`, err);
      return {
        ...track,
        groundingStatus: 'failed',
      };
    }
  });
};

/**
 * Concurrently runs AI Search Grounding across a set of consensus tracks
 * (CONCURRENCY = 4 parallel web searches)
 */
export const runConcurrentAISearchGrounding = async (
  tracks: ConsensusTrack[],
  onProgress?: (progress: ConcurrencyProgress) => void
): Promise<EnrichedConsensusTrack[]> => {
  const total = tracks.length;
  if (total === 0) return [];

  let processed = 0;
  let failed = 0;

  onProgress?.({
    stage: 'ai_search',
    total,
    processed: 0,
    failed: 0,
    currentItem: 'Starting AI Search Grounding...',
  });

  const CONCURRENCY = 4;
  const queue = [...tracks];
  const results: EnrichedConsensusTrack[] = [];

  const worker = async () => {
    while (queue.length > 0) {
      const track = queue.shift();
      if (!track) break;

      onProgress?.({
        stage: 'ai_search',
        total,
        processed,
        failed,
        currentItem: `Searching: ${track.artist} - ${track.title}...`,
      });

      try {
        const enriched = await enrichConsensusTrackWithAISearch(track);
        results.push(enriched);
        if (enriched.groundingStatus === 'failed') {
          failed++;
        }
      } catch (e) {
        console.error(`AI Search Grounding failed for ${track.title}`, e);
        failed++;
        results.push({ ...track, groundingStatus: 'failed' });
      } finally {
        processed++;
        onProgress?.({
          stage: 'ai_search',
          total,
          processed,
          failed,
          currentItem: `Verified ${track.title}`,
        });
      }
    }
  };

  const workers = Array(Math.min(total, CONCURRENCY))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);

  onProgress?.({
    stage: 'complete',
    total,
    processed,
    failed,
    currentItem: 'AI Search Grounding Complete.',
  });

  // Preserve original ordering
  const idMap = new Map(results.map(r => [r.id, r]));
  return tracks.map(t => idMap.get(t.id) || { ...t, groundingStatus: 'failed' });
};

/**
 * Cross-tabulates all enabled sources and computes consensus metrics
 */
export const computeConsensus = (
  sources: (SourceSummary | SourceSection)[],
  minConsensusCount: number = 1,
  searchQuery: string = ''
): ConsensusTrack[] => {
  const activeSources = sources.filter(s => s.enabled && s.tracks && s.tracks.length > 0);
  const totalSources = activeSources.length;

  if (totalSources === 0) return [];

  const aggregated: ConsensusTrack[] = [];

  for (const source of activeSources) {
    const seenTracksInSource = new Set<string>();

    for (const raw of source.tracks) {
      // Look for match in existing aggregated list
      let match = aggregated.find(agg => isSameTrack(agg, raw));

      if (match) {
        if (!seenTracksInSource.has(match.id)) {
          match.consensusCount++;
          match.sources.add(source.name);
          seenTracksInSource.add(match.id);
        }

        // Adopt album if match doesn't have one yet
        if (!match.album && raw.album) {
          match.album = raw.album;
        }

        // Retain cleaner/longer proper casing if present
        if (raw.title && raw.title.length > match.title.length && !raw.title.includes('  ')) {
          match.title = raw.title;
        }
      } else {
        const id = generateTrackId(raw.artist, raw.title);
        const newTrack: ConsensusTrack = {
          id,
          artist: raw.artist,
          title: raw.title,
          album: raw.album || '',
          consensusCount: 1,
          totalSources,
          consensusPercentage: 0,
          sources: new Set([source.name]),
        };

        aggregated.push(newTrack);
        seenTracksInSource.add(id);
      }
    }
  }

  // Calculate percentages and assign total sources
  for (const track of aggregated) {
    track.totalSources = totalSources;
    track.consensusCount = track.sources.size;
    track.consensusPercentage = totalSources > 0 ? Math.round((track.sources.size / totalSources) * 100) : 0;
  }

  // Filter by minConsensusCount and optional search query
  const query = searchQuery.trim().toLowerCase();

  return aggregated
    .filter(track => {
      if (track.consensusCount < minConsensusCount) return false;
      if (query) {
        return (
          track.title.toLowerCase().includes(query) ||
          track.artist.toLowerCase().includes(query) ||
          track.album.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (b.consensusCount !== a.consensusCount) {
        return b.consensusCount - a.consensusCount;
      }
      if (b.consensusPercentage !== a.consensusPercentage) {
        return b.consensusPercentage - a.consensusPercentage;
      }
      return a.title.localeCompare(b.title);
    });
};

/**
 * Generates TuneMyMusic CSV export with UTF-8 Byte Order Mark (\uFEFF)
 */
export const generateTuneMyMusicCSV = (tracks: (ConsensusTrack | EnrichedConsensusTrack)[]): string => {
  const escapeCsv = (val: string | number) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const header = ['Artist', 'Track Name', 'Album', 'Consensus Count', 'Consensus Percentage', 'Sources'];
  const rows = tracks.map(t => {
    const enriched = t as EnrichedConsensusTrack;
    const finalArtist = enriched.verifiedArtist || t.artist;
    const finalTitle = enriched.verifiedTitle || t.title;
    const finalAlbum = enriched.verifiedAlbum || t.album;

    return [
      escapeCsv(finalArtist),
      escapeCsv(finalTitle),
      escapeCsv(finalAlbum),
      escapeCsv(t.consensusCount),
      escapeCsv(`${t.consensusPercentage}%`),
      escapeCsv(Array.from(t.sources).join('; ')),
    ].join(',');
  });

  // Prepend UTF-8 BOM (\uFEFF) to protect CJK and international characters
  return '\uFEFF' + [header.join(','), ...rows].join('\n');
};

/**
 * Generates standard M3U playlist file
 */
export const generateConsensusM3U = (tracks: (ConsensusTrack | EnrichedConsensusTrack)[]): string => {
  const lines = ['#EXTM3U'];
  for (const t of tracks) {
    const enriched = t as EnrichedConsensusTrack;
    const finalArtist = enriched.verifiedArtist || t.artist;
    const finalTitle = enriched.verifiedTitle || t.title;
    lines.push(`#EXTINF:-1,${finalArtist} - ${finalTitle}`);
    lines.push(`${finalArtist} - ${finalTitle}.mp3`);
  }
  return lines.join('\n');
};

/**
 * Generates tab-separated text for clipboard paste into Google Sheets / Excel
 */
export const generateConsensusTSV = (tracks: (ConsensusTrack | EnrichedConsensusTrack)[]): string => {
  const header = ['Rank', 'Artist', 'Title', 'Album', 'Consensus', 'Percentage', 'Nominated By', 'AI Confidence'];
  const rows = tracks.map((t, idx) => {
    const enriched = t as EnrichedConsensusTrack;
    const finalArtist = enriched.verifiedArtist || t.artist;
    const finalTitle = enriched.verifiedTitle || t.title;
    const finalAlbum = enriched.verifiedAlbum || t.album;

    return [
      idx + 1,
      finalArtist,
      finalTitle,
      finalAlbum,
      t.consensusCount,
      `${t.consensusPercentage}%`,
      Array.from(t.sources).join(', '),
      enriched.confidence || '—',
    ].join('\t');
  });

  return [header.join('\t'), ...rows].join('\n');
};

/**
 * Curated Radiohead consensus preset dataset for instant 1-click verification
 */
export const RADIOHEAD_SAMPLE_SOURCES: SourceSummary[] = [
  {
    id: 'source-rolling-stone',
    name: 'Rolling Stone Reader Poll (Top 12)',
    trackCount: 12,
    enabled: true,
    tracks: [
      { artist: 'Radiohead', title: 'Paranoid Android', album: 'OK Computer', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Karma Police', album: 'OK Computer', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Creep', album: 'Pablo Honey', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Fake Plastic Trees', album: 'The Bends', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Idioteque', album: 'Kid A', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'There There', album: 'Hail to the Thief', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Street Spirit (Fade Out)', album: 'The Bends', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'No Surprises', album: 'OK Computer', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Weird Fishes/Arpeggi', album: 'In Rainbows', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Pyramid Song', album: 'Amnesiac', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Reckoner', album: 'In Rainbows', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
      { artist: 'Radiohead', title: 'Everything in Its Right Place', album: 'Kid A', sourceName: 'Rolling Stone Reader Poll (Top 12)' },
    ],
  },
  {
    id: 'source-reddit-consensus',
    name: 'Reddit r/radiohead Consensus 2024',
    trackCount: 12,
    enabled: true,
    tracks: [
      { artist: 'Radiohead', title: 'Paranoid Android', album: 'OK Computer', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'Weird Fishes/Arpeggi', album: 'In Rainbows', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'Idioteque', album: 'Kid A', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'There There', album: 'Hail to the Thief', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'Karma Police', album: 'OK Computer', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'Reckoner', album: 'In Rainbows', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'Jigsaw Falling Into Place', album: 'In Rainbows', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'Everything in Its Right Place', album: 'Kid A', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'Pyramid Song', album: 'Amnesiac', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'How to Disappear Completely', album: 'Kid A', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: 'No Surprises', album: 'OK Computer', sourceName: 'Reddit r/radiohead Consensus 2024' },
      { artist: 'Radiohead', title: '2 + 2 = 5', album: 'Hail to the Thief', sourceName: 'Reddit r/radiohead Consensus 2024' },
    ],
  },
  {
    id: 'source-pitchfork-essentials',
    name: 'Pitchfork Essential Tracks',
    trackCount: 10,
    enabled: true,
    tracks: [
      { artist: 'Radiohead', title: 'Paranoid Android', album: 'OK Computer', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'Idioteque', album: 'Kid A', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'How to Disappear Completely', album: 'Kid A', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'Pyramid Song', album: 'Amnesiac', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'Everything in Its Right Place', album: 'Kid A', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'Weird Fishes/Arpeggi', album: 'In Rainbows', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'Street Spirit (Fade Out)', album: 'The Bends', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'There There', album: 'Hail to the Thief', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'Karma Police', album: 'OK Computer', sourceName: 'Pitchfork Essential Tracks' },
      { artist: 'Radiohead', title: 'Lotus Flower', album: 'The King of Limbs', sourceName: 'Pitchfork Essential Tracks' },
    ],
  },
  {
    id: 'source-concert-setlists',
    name: 'Concert Setlists Most Performed',
    trackCount: 10,
    enabled: true,
    tracks: [
      { artist: 'Radiohead', title: 'Paranoid Android', album: 'OK Computer', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'Karma Police', album: 'OK Computer', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'Idioteque', album: 'Kid A', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'Street Spirit (Fade Out)', album: 'The Bends', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'There There', album: 'Hail to the Thief', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'Everything in Its Right Place', album: 'Kid A', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'Weird Fishes/Arpeggi', album: 'In Rainbows', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'The National Anthem', album: 'Kid A', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'No Surprises', album: 'OK Computer', sourceName: 'Concert Setlists Most Performed' },
      { artist: 'Radiohead', title: 'Myxomatosis', album: 'Hail to the Thief', sourceName: 'Concert Setlists Most Performed' },
    ],
  },
];

export const RADIOHEAD_SAMPLE_SECTIONS: SourceSection[] = RADIOHEAD_SAMPLE_SOURCES.map(s => ({
  id: s.id,
  name: s.name,
  inputType: 'text',
  files: [],
  textDump: s.tracks.map(t => `${t.artist} - ${t.title}`).join('\n'),
  enabled: true,
  trackCount: s.trackCount,
  tracks: s.tracks,
}));
