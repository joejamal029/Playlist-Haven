import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
  ArrowLeft,
  Database,
  Sparkles,
  RefreshCw,
  Download,
  FileSpreadsheet,
  FileCode,
  Music2,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Zap,
  Disc,
  Play,
  Pause,
  Square,
  Trash2,
  Eye,
  User,
  Calendar,
  MapPin,
  Tag,
  Radio,
  Layers,
  HardDrive,
  Upload,
  Copy,
  Check,
  FileText,
  SlidersHorizontal,
  X,
  Key,
  Volume2,
  VolumeX,
  Image as ImageIcon,
} from 'lucide-react';
import {
  EnrichedSongRecord,
  CandidateMatch,
  EnrichmentStats,
  EnrichmentResolution,
  ENRICHED_CSV_COLUMNS,
} from '../services/metadataEnrichmentTypes';
import {
  exportToEnrichedCsv,
  exportToMasterJson,
  exportToTaggedM3u8,
  exportToDownloaderTxt,
  queryMusicBrainzRecording,
  aiPrecisionQuerySurgeon,
  batchAiPrecisionQuerySurgeon,
  aiSynthesizedFallback,
  batchAiSynthesizedFallback,
  searchMusicBrainzCandidates,
  fetchRecordingDetails,
  processTrackEnrichment,
  sanitizeSongQuery,
  formatDuration,
  resolveAIKey,
  resolveAiSongwritingCredits,
  hydrateTrackDossier,
  remediateSingleTrack,
} from '../services/metadataEnrichmentEngine';
import { cleanCompositeTrack } from '../services/playlistSanitizer';
import { getAIConfig, setAIConfig, AIConfig } from '../services/visionEngine';
import {
  getAllEnrichedTracks,
  saveEnrichedTrack,
  bulkSaveEnrichedTracks,
  deleteEnrichedTrack,
  getDatabaseStats,
  exportDatabaseToJSON,
  importDatabaseFromJSON,
  clearDatabase,
  purgeUnresolvedTracks,
  normalizeSongKey,
} from '../services/metadataDb';
import {
  queryITunesRecording,
  supplementTrackFromITunes,
  resolveTrackAudioPreview,
} from '../services/itunesApi';
import {
  CANONICAL_BUCKETS,
  CanonicalBucket,
} from '../services/classificationEngine';
import { downloadPlaylistFile } from '../services/downloadHelper';
import FileUploader from '../components/FileUploader';

export interface RawCsvDataset {
  fileName: string;
  headers: string[];
  rows: string[][];
  delimiter: string;
}

export interface ColumnMappingConfig {
  titleCol: string;
  artistCol: string;
  albumCol: string;
  pathCol: string;
  durationCol: string;
  skipUnknownArtists: boolean;
  skipShortAudio: boolean;
  cleanTopicSuffix: boolean;
  excludePathKeywords: string;
}

export function parseCsvToMatrix(content: string, fileName: string): RawCsvDataset {
  const cleanContent = content.replace(/^\ufeff/, '').trim();
  const lowerName = fileName.toLowerCase();
  const firstLine = cleanContent.split(/\r?\n/)[0] || '';
  const delimiter = lowerName.endsWith('.tsv') || (!firstLine.includes(',') && firstLine.includes('\t')) ? '\t' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanContent.length; i++) {
    const char = cleanContent[i];
    const nextChar = cleanContent[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
  }

  if (rows.length === 0) return { fileName, headers: [], rows: [], delimiter };

  const headers = rows[0].map(h => h.replace(/^["']|["']$/g, '').trim());
  const dataRows = rows.slice(1).map(r => r.map(c => c.replace(/^["']|["']$/g, '').trim()));

  return { fileName, headers, rows: dataRows, delimiter };
}

export function detectBestColumns(headers: string[]): ColumnMappingConfig {
  // Title: prioritize col_title, title (ref), title, track, song, name
  const titleCol = headers.find(h => /^col_?title$/i.test(h)) ||
                   headers.find(h => /^title\b/i.test(h)) ||
                   headers.find(h => /title/i.test(h)) ||
                   headers.find(h => /track|song/i.test(h)) ||
                   headers[0] || '';

  // Artist: prioritize col_artist, artist (ref), album_artist, artist, singer
  const artistCol = headers.find(h => /^col_?artist$/i.test(h)) ||
                    headers.find(h => /^artist\b/i.test(h)) ||
                    headers.find(h => /artist/i.test(h)) ||
                    headers.find(h => /singer|performer/i.test(h)) ||
                    (headers.length > 1 ? headers[1] : '');

  // Album: col_album, album, release
  const albumCol = headers.find(h => /^col_?album$/i.test(h)) ||
                   headers.find(h => /album/i.test(h)) ||
                   headers.find(h => /release/i.test(h)) || '';

  // Path: col_logpath, col_filepath, col_path, path, file
  const pathCol = headers.find(h => /col_?logpath/i.test(h)) ||
                  headers.find(h => /col_?filepath/i.test(h)) ||
                  headers.find(h => /col_?path/i.test(h)) ||
                  headers.find(h => /path|file|location/i.test(h)) || '';

  // Duration: col_duration, duration, time
  const durationCol = headers.find(h => /col_?duration/i.test(h)) ||
                      headers.find(h => /duration/i.test(h)) || '';

  return {
    titleCol,
    artistCol,
    albumCol,
    pathCol,
    durationCol,
    skipUnknownArtists: true,
    skipShortAudio: true,
    cleanTopicSuffix: true,
    excludePathKeywords: '',
  };
}

interface DeepMetadataEnrichmentViewProps {
  onBack: () => void;
}

// Ingestion parser supporting M3U, CSV, TSV, TXT, JSON
function parseRawMusicLibrary(
  rawContent: string,
  fileName: string
): { artist: string; title: string; album?: string; path?: string }[] {
  const content = rawContent.replace(/^\ufeff/, '').trim();
  const lowerName = fileName.toLowerCase();
  const songs: { artist: string; title: string; album?: string; path?: string }[] = [];

  // 1. JSON
  if (lowerName.endsWith('.json') || (content.startsWith('[') && content.endsWith(']')) || (content.startsWith('{') && content.endsWith('}'))) {
    try {
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : (parsed.tracks || parsed.songs || parsed.library || parsed.records || []);
      for (const item of items) {
        const title = item.title || item.song || item.track || item.name || item.queryTitle || '';
        const artist = item.artist || item.artistName || item.singer || item.performer || item.queryArtist || '';
        const album = item.album || item.albumTitle || item.release || item.release?.albumTitle || '';
        const path = item.path || item.filePath || item.uri || item.queryPath || '';
        if (title || artist) {
          songs.push({
            artist: artist || 'Unknown Artist',
            title: title || 'Unknown Title',
            album: album || undefined,
            path: path || undefined,
          });
        }
      }
      if (songs.length > 0) return songs;
    } catch (e) {}
  }

  // 2. CSV / TSV (Robust quote-aware parser)
  const isLikelyCSV = lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || /^(?:"?[A-Za-z0-9_]+"?[,\t]){1,}[A-Za-z0-9_]+/m.test(content.slice(0, 500));
  if (isLikelyCSV) {
    const firstLine = content.split(/\r?\n/)[0] || '';
    const delimiter = lowerName.endsWith('.tsv') || (!firstLine.includes(',') && firstLine.includes('\t')) ? '\t' : ',';
    
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
    }

    if (rows.length >= 2) {
      const header = rows[0].map(h => h.toLowerCase().replace(/[\s_"-]+/g, ''));
      const artistIdx = header.findIndex(h => h.includes('artist') || h === 'singer' || h === 'performer' || h === 'colartist');
      const titleIdx = header.findIndex(h => h.includes('title') || h.includes('track') || h.includes('song') || h === 'name' || h === 'coltitle');
      const albumIdx = header.findIndex(h => h.includes('album') || h === 'release' || h === 'colalbum');
      const pathIdx = header.findIndex(h => h.includes('path') || h.includes('file') || h.includes('location') || h === 'filepath' || h === 'uri');

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const rawArtist = artistIdx !== -1 && row[artistIdx] ? row[artistIdx] : '';
        const rawTitle = titleIdx !== -1 && row[titleIdx] ? row[titleIdx] : '';
        const album = albumIdx !== -1 && row[albumIdx] ? row[albumIdx].replace(/^["']|["']$/g, '').trim() : undefined;
        const path = pathIdx !== -1 && row[pathIdx] ? row[pathIdx].replace(/^["']|["']$/g, '').trim() : undefined;

        // Clean composite track
        const cleaned = cleanCompositeTrack(rawTitle, rawArtist);
        let artist = cleaned.artist;
        let title = cleaned.title;

        // If artist or title is missing, try inferring from path
        if ((!artist || artist === '<unknown>' || !title || title === '<unknown>') && path) {
          const base = path.split(/[\\/]/).pop()?.replace(/\.[a-zA-Z0-9]+$/, '') || '';
          const pathCleaned = cleanCompositeTrack(base, artist && artist !== '<unknown>' ? artist : '');
          if (!artist || artist === '<unknown>') artist = pathCleaned.artist;
          if (!title || title === '<unknown>') title = pathCleaned.title;
        }

        if (title || artist) {
          songs.push({
            artist: artist && artist !== '<unknown>' ? artist : 'Unknown Artist',
            title: title && title !== '<unknown>' ? title : 'Unknown Title',
            album,
            path,
          });
        }
      }
      if (songs.length > 0) return songs;
    }
  }

  // 3. M3U / M3U8 / Plain Text
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  let currentExtinf = '';

  for (const line of lines) {
    if (line.toUpperCase() === '#EXTM3U') continue;
    if (line.toUpperCase().startsWith('#EXTINF')) {
      currentExtinf = line;
      continue;
    }
    if (line.startsWith('#')) continue;

    let title = 'Unknown Title';
    let artist = 'Unknown Artist';
    const path = line;

    if (currentExtinf) {
      const commaIdx = currentExtinf.indexOf(',');
      if (commaIdx !== -1) {
        const info = currentExtinf.substring(commaIdx + 1).trim();
        const cleaned = cleanCompositeTrack(info);
        artist = cleaned.artist === '<unknown>' ? 'Unknown Artist' : cleaned.artist;
        title = cleaned.title;
      }
      currentExtinf = '';
    } else {
      // Clean path / filename / line
      const base = line.split(/[\\/]/).pop() || line;
      const stripped = base.replace(/\.[a-zA-Z0-9]+$/, '');
      const cleaned = cleanCompositeTrack(stripped);
      artist = cleaned.artist === '<unknown>' ? 'Unknown Artist' : cleaned.artist;
      title = cleaned.title;
    }

    songs.push({ artist, title, path });
  }

  return songs;
}

export default function DeepMetadataEnrichmentView({ onBack }: DeepMetadataEnrichmentViewProps) {
  // State: Loaded / Ingested Records
  const [records, setRecords] = useState<EnrichedSongRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // State: File Upload & Staging
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [stagedQueue, setStagedQueue] = useState<{ artist: string; title: string; album?: string; path?: string }[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState<boolean>(false);

  // State: Column Mapping & Ingestion Studio
  const [activeCsvDataset, setActiveCsvDataset] = useState<RawCsvDataset | null>(null);
  const [showColumnMappingModal, setShowColumnMappingModal] = useState<boolean>(false);
  const [columnMapping, setColumnMapping] = useState<ColumnMappingConfig>({
    titleCol: '',
    artistCol: '',
    albumCol: '',
    pathCol: '',
    durationCol: '',
    skipUnknownArtists: true,
    skipShortAudio: true,
    cleanTopicSuffix: true,
    excludePathKeywords: '',
  });

  // State: Ingestion & Running Queue
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<{
    index: number;
    total: number;
    currentTrackName?: string;
    stats: EnrichmentStats;
  }>({
    index: 0,
    total: 0,
    stats: { totalProcessed: 0, cacheHits: 0, mbEnriched: 0, needsResolution: 0, aiSynthesized: 0, manualResolved: 0 },
  });

  // Controls: Ingestion Mode (Skip Cached vs Force Update)
  const [forceUpdateMode, setForceUpdateMode] = useState<boolean>(false);
  const [autoAiSurgeon, setAutoAiSurgeon] = useState<boolean>(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBucket, setSelectedBucket] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Database Stats
  const [dbStats, setDbStats] = useState<{
    trackCount: number;
    artistCount: number;
    releaseCount: number;
    estimatedSizeBytes: number;
  }>({ trackCount: 0, artistCount: 0, releaseCount: 0, estimatedSizeBytes: 0 });

  // Drawers & Modals
  const [activeDossier, setActiveDossier] = useState<EnrichedSongRecord | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; artist: string; releaseMbid?: string } | null>(null);
  const [isHydratingDossier, setIsHydratingDossier] = useState<boolean>(false);
  const [isResolvingCredits, setIsResolvingCredits] = useState<boolean>(false);
  const [remediatingTrackId, setRemediatingTrackId] = useState<string | null>(null);
  const [disambiguatingTrack, setDisambiguatingTrack] = useState<EnrichedSongRecord | null>(null);
  const [candidateMatches, setCandidateMatches] = useState<CandidateMatch[]>([]);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);
  const [disambiguateSearchQuery, setDisambiguateSearchQuery] = useState<{ artist: string; title: string }>({ artist: '', title: '' });

  const [showPreloadModal, setShowPreloadModal] = useState(false);
  const [preloadJsonText, setPreloadJsonText] = useState('');
  const [preloadFeedback, setPreloadFeedback] = useState<string | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Audio Player State (Universal 30s In-App Preview & Downloader)
  const [activeAudio, setActiveAudio] = useState<{
    trackId: string;
    url: string;
    title: string;
    artist: string;
    coverArt?: string;
  } | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioLoadingTrackId, setAudioLoadingTrackId] = useState<string | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(30);
  const [audioVolume, setAudioVolume] = useState<number>(0.85);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Field Supplement State (iTunes Artwork & Release Year Sanitizer)
  const [supplementingTrackId, setSupplementingTrackId] = useState<string | null>(null);
  const [isSupplementingAll, setIsSupplementingAll] = useState<boolean>(false);
  const [failedArtIds, setFailedArtIds] = useState<Set<string>>(new Set());

  // AI Settings Modal State
  const [aiConfigModalOpen, setAiConfigModalOpen] = useState(false);
  const [aiConfigForm, setAiConfigForm] = useState<AIConfig>(() => getAIConfig());
  const [aiTestStatus, setAiTestStatus] = useState<{ testing: boolean; message: string; success?: boolean } | null>(null);
  const [hasAiKey, setHasAiKey] = useState<boolean>(() => !!resolveAIKey());

  const checkAiStatus = () => {
    setHasAiKey(!!resolveAIKey());
  };

  const handleTestAiConnection = async () => {
    setAiTestStatus({ testing: true, message: 'Testing AI connection...' });
    try {
      const apiKey = aiConfigForm.apiKey.trim();
      const model = aiConfigForm.modelName?.trim() || (aiConfigForm.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-3.5-turbo');

      if (aiConfigForm.provider === 'gemini') {
        const keyToUse = apiKey || resolveAIKey();
        if (!keyToUse) {
          throw new Error('Please provide a Gemini API Key to test.');
        }
        const ai = new GoogleGenAI({ apiKey: keyToUse });
        const res = await ai.models.generateContent({
          model,
          contents: 'Say OK',
        });
        const txt = res.text || '';
        if (txt) {
          setAiTestStatus({ testing: false, success: true, message: `Connected successfully to Google Gemini (${model})!` });
        } else {
          throw new Error('No response content returned.');
        }
      } else {
        const baseUrl = (aiConfigForm.baseUrl || 'http://localhost:11434/v1').replace(/\/$/, '');
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 5
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        setAiTestStatus({ testing: false, success: true, message: `Connected successfully to ${model}!` });
      }
    } catch (err: any) {
      setAiTestStatus({ testing: false, success: false, message: `Connection failed: ${err.message}` });
    }
  };

  const handleSaveAIConfig = () => {
    setAIConfig(aiConfigForm);
    setAiConfigModalOpen(false);
    setAiTestStatus(null);
    checkAiStatus();
  };

  // Abort controller ref
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef<boolean>(false);
  isPausedRef.current = isPaused;

  // Load IndexedDB on Mount
  useEffect(() => {
    refreshDatabaseState();
  }, []);

  // Auto-hydrate dossier when opened if artist bio or work credits are incomplete
  useEffect(() => {
    if (!activeDossier) return;
    const needsArtist = Boolean(
      activeDossier.artist?.artistMbid && (
        !activeDossier.artist?.beginArea || 
        !activeDossier.artist?.countryCode || 
        activeDossier.artist?.countryCode === 'XW' || 
        activeDossier.artist?.countryCode === 'XE' || 
        !activeDossier.artist?.birthDate
      )
    );
    const needsWork = Boolean(
      activeDossier.recordingMbid && (
        !activeDossier.work || 
        (activeDossier.work.composers.length === 0 && activeDossier.work.lyricists.length === 0)
      )
    );

    if ((needsArtist || needsWork) && !isHydratingDossier) {
      setIsHydratingDossier(true);
      hydrateTrackDossier(activeDossier)
        .then(hydrated => {
          setActiveDossier(hydrated);
          setRecords(prev => prev.map(r => r.id === hydrated.id ? hydrated : r));
        })
        .catch(err => console.warn('Dossier auto-hydration error:', err))
        .finally(() => setIsHydratingDossier(false));
    }
  }, [activeDossier?.id]);

  const refreshDatabaseState = async () => {
    try {
      const stats = await getDatabaseStats();
      setDbStats(stats);
      const allTracks = await getAllEnrichedTracks();
      setRecords(allTracks);
    } catch (err) {
      console.error('Failed to load database stats:', err);
    }
  };

  // Stats calculation for current table
  const tableStats = useMemo(() => {
    let cacheHits = 0;
    let mbEnriched = 0;
    let itunesEnriched = 0;
    let needsResolution = 0;
    let aiSynthesized = 0;
    let missingArtOrYear = 0;

    for (const r of records) {
      if (r.resolution?.status === 'cached') cacheHits++;
      else if (r.resolution?.status === 'enriched' || r.resolution?.status === 'ai_search_resolved') mbEnriched++;
      else if (r.resolution?.status === 'itunes_enriched') itunesEnriched++;
      else if (r.resolution?.status === 'needs_resolution') needsResolution++;
      else if (r.resolution?.status === 'ai_synthesized_fallback') aiSynthesized++;

      const thumb = r.release?.coverArtThumbUrl || '';
      const full = r.release?.coverArtFullUrl || '';
      const isArtFailed = failedArtIds.has(r.id);
      const hasNoArt = !thumb && !full;
      const needsArt = isArtFailed || hasNoArt;

      const rawYear = r.release?.originalReleaseYear;
      const rawDate = r.release?.releaseDate;
      const hasYear = (typeof rawYear === 'number' && rawYear > 0 && !isNaN(rawYear)) ||
                      (typeof rawDate === 'string' && rawDate.trim() !== '' && rawDate !== '—');
      const needsYear = !hasYear;

      if (needsArt || needsYear) {
        missingArtOrYear++;
      }
    }

    return {
      total: records.length,
      cacheHits,
      mbEnriched,
      itunesEnriched,
      needsResolution,
      aiSynthesized,
      missingArtOrYear,
    };
  }, [records, failedArtIds]);

  // Handle Universal File Selection & Ingestion
  const handleFilesSelected = async (newFiles: File[]) => {
    if (!newFiles || newFiles.length === 0) return;
    setIsReadingFiles(true);
    setUploadedFiles(prev => [...prev, ...newFiles]);

    try {
      // 1. Check if an uploaded file is a tabular CSV/TSV with columns
      const csvFile = newFiles.find(f => f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.tsv'));
      if (csvFile) {
        const text = await csvFile.text();
        const matrix = parseCsvToMatrix(text, csvFile.name);
        if (matrix.headers.length >= 2 && matrix.rows.length > 0) {
          const detected = detectBestColumns(matrix.headers);
          setActiveCsvDataset(matrix);
          setColumnMapping(detected);
          setShowColumnMappingModal(true);
          setIsReadingFiles(false);
          return;
        }
      }

      // 2. Fallback / Multi-file ingestion (M3U, JSON, TXT)
      let allSongs: { artist: string; title: string; album?: string; path?: string }[] = [];
      for (const file of newFiles) {
        const text = await file.text();
        const parsed = parseRawMusicLibrary(text, file.name);
        allSongs = allSongs.concat(parsed);
      }

      if (allSongs.length === 0) {
        alert('No valid tracks could be extracted from the uploaded file(s). Please verify the file has Artist/Title columns, valid M3U, or JSON format.');
        setIsReadingFiles(false);
        return;
      }

      setStagedQueue(prev => [...prev, ...allSongs]);
    } catch (err: any) {
      console.error('Error reading upload files:', err);
      alert(`Error reading files: ${err.message}`);
    } finally {
      setIsReadingFiles(false);
    }
  };

  const handleFileLoaded = async (content: string, fileName: string) => {
    const matrix = parseCsvToMatrix(content, fileName);
    if (matrix.headers.length >= 2 && matrix.rows.length > 0) {
      const detected = detectBestColumns(matrix.headers);
      setActiveCsvDataset(matrix);
      setColumnMapping(detected);
      setShowColumnMappingModal(true);
      return;
    }

    const rawList = parseRawMusicLibrary(content, fileName);
    if (rawList.length === 0) {
      alert('No valid tracks could be extracted from this file.');
      return;
    }
    setStagedQueue(prev => [...prev, ...rawList]);
  };

  // Compute live mapped songs and filtering statistics from active CSV dataset
  const mappedDatasetResults = useMemo(() => {
    if (!activeCsvDataset || activeCsvDataset.rows.length === 0) {
      return { validSongs: [], filteredCount: 0, previewRows: [], totalRows: 0 };
    }

    const { headers, rows } = activeCsvDataset;
    const titleIdx = headers.indexOf(columnMapping.titleCol);
    const artistIdx = headers.indexOf(columnMapping.artistCol);
    const albumIdx = headers.indexOf(columnMapping.albumCol);
    const pathIdx = headers.indexOf(columnMapping.pathCol);
    const durationIdx = headers.indexOf(columnMapping.durationCol);

    const excludeKeywords = columnMapping.excludePathKeywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    const validSongs: { artist: string; title: string; album?: string; path?: string }[] = [];
    const previewRows: {
      rowNum: number;
      rawTitle: string;
      rawArtist: string;
      cleanedArtist: string;
      cleanedTitle: string;
      album?: string;
      path?: string;
      durationMs?: number;
      status: 'valid' | 'unknown_artist' | 'short_audio' | 'path_excluded' | 'missing_data';
      reason?: string;
    }[] = [];

    let filteredCount = 0;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rawTitle = titleIdx !== -1 ? (row[titleIdx] || '').trim() : '';
      const rawArtist = artistIdx !== -1 ? (row[artistIdx] || '').trim() : '';
      const rawAlbum = albumIdx !== -1 ? (row[albumIdx] || '').trim() : undefined;
      const rawPath = pathIdx !== -1 ? (row[pathIdx] || '').trim() : undefined;
      const durationMs = durationIdx !== -1 && !isNaN(parseInt(row[durationIdx] || '0', 10)) ? parseInt(row[durationIdx] || '0', 10) : undefined;

      let cleanedArtist = rawArtist;
      let cleanedTitle = rawTitle;

      // Suffix cleaning (e.g. "JID - Topic" -> "JID")
      if (columnMapping.cleanTopicSuffix && cleanedArtist) {
        cleanedArtist = cleanedArtist.replace(/\s*-\s*topic$/i, '').trim();
      }

      // Check for composite Title like "Artist - Title" if artist is empty or unknown
      if ((!cleanedArtist || cleanedArtist.toLowerCase() === '<unknown>' || cleanedArtist.toLowerCase() === 'unknown') && cleanedTitle.includes(' - ')) {
        const parts = cleanedTitle.split(' - ');
        cleanedArtist = parts[0].trim();
        cleanedTitle = parts.slice(1).join(' - ').trim();
      }

      // Determine status
      let status: 'valid' | 'unknown_artist' | 'short_audio' | 'path_excluded' | 'missing_data' = 'valid';
      let reason = '';

      const isUnknown = !cleanedArtist || cleanedArtist.toLowerCase() === '<unknown>' || cleanedArtist.toLowerCase() === 'unknown' || cleanedArtist.toLowerCase() === 'unknown artist';

      if (columnMapping.skipUnknownArtists && isUnknown) {
        status = 'unknown_artist';
        reason = 'Artist is <unknown>';
      } else if (columnMapping.skipShortAudio && durationMs && durationMs > 0 && durationMs < 30000) {
        status = 'short_audio';
        reason = `Short audio (${Math.round(durationMs / 1000)}s < 30s)`;
      } else if (excludeKeywords.length > 0 && ((rawPath && excludeKeywords.some(k => rawPath.toLowerCase().includes(k))) || (rawAlbum && excludeKeywords.some(k => rawAlbum.toLowerCase().includes(k))))) {
        status = 'path_excluded';
        reason = 'Matched excluded path keyword';
      } else if (!cleanedTitle && !cleanedArtist) {
        status = 'missing_data';
        reason = 'Missing both title and artist';
      }

      if (status === 'valid') {
        validSongs.push({
          artist: cleanedArtist || 'Unknown Artist',
          title: cleanedTitle || 'Unknown Title',
          album: rawAlbum || undefined,
          path: rawPath || undefined,
        });
      } else {
        filteredCount++;
      }

      // Keep first 15 rows for live preview
      if (r < 15) {
        previewRows.push({
          rowNum: r + 1,
          rawTitle,
          rawArtist,
          cleanedArtist,
          cleanedTitle,
          album: rawAlbum,
          path: rawPath,
          durationMs,
          status,
          reason,
        });
      }
    }

    return { validSongs, filteredCount, previewRows, totalRows: rows.length };
  }, [activeCsvDataset, columnMapping]);

  const handleApplyColumnMapping = () => {
    if (mappedDatasetResults.validSongs.length === 0) {
      alert('No valid songs found with current column mapping and filters. Please check that Title and Artist columns are correctly selected.');
      return;
    }
    setStagedQueue(mappedDatasetResults.validSongs);
    setShowColumnMappingModal(false);
  };

  // Start Pipeline with Decoupled Two-Fold AI Remediation & Batched Surgeon
  const startEnrichmentPipeline = async (
    queue: { artist: string; title: string; album?: string; path?: string }[]
  ) => {
    setIsProcessing(true);
    setIsPaused(false);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const stats: EnrichmentStats = {
      totalProcessed: 0,
      cacheHits: 0,
      mbEnriched: 0,
      needsResolution: 0,
      aiSynthesized: 0,
      manualResolved: 0,
    };

    const updatedRecordsMap = new Map<string, EnrichedSongRecord>();
    // Pre-populate with existing records
    for (const r of records) {
      updatedRecordsMap.set(r.id, r);
    }

    const remediationQueue: { id: string; artist: string; title: string; album?: string; path?: string }[] = [];

    // Helper: Flush a batch of unresolved tracks through Two-Fold AI Remediation
    const flushRemediationBatch = async (batchTracks: typeof remediationQueue) => {
      if (batchTracks.length === 0 || controller.signal.aborted) return;

      try {
        setCurrentProgress(prev => ({
          ...prev,
          currentTrackName: `⚡ AI Remediation (Fold 1: Precision Surgeon for ${batchTracks.length} tracks)...`,
        }));

        // Fold 1: Batched AI Query Surgeon -> Re-query MusicBrainz
        const surgeonResult = await batchAiPrecisionQuerySurgeon(batchTracks, controller.signal);

        for (const [id, resolvedRecord] of surgeonResult.resolved.entries()) {
          updatedRecordsMap.set(id, resolvedRecord);
          stats.mbEnriched++;
          stats.needsResolution = Math.max(0, stats.needsResolution - 1);
        }

        // Fold 2: Last-resort fallback for genuine 0s (uncataloged on MusicBrainz)
        if (surgeonResult.unresolved.length > 0 && !controller.signal.aborted) {
          setCurrentProgress(prev => ({
            ...prev,
            currentTrackName: `⚠️ AI Remediation (Fold 2: Musicological Fallback for ${surgeonResult.unresolved.length} tracks)...`,
          }));

          const fallbackMap = await batchAiSynthesizedFallback(surgeonResult.unresolved, controller.signal);
          for (const [id, fallbackRecord] of fallbackMap.entries()) {
            updatedRecordsMap.set(id, fallbackRecord);
            stats.aiSynthesized++;
            stats.needsResolution = Math.max(0, stats.needsResolution - 1);
          }
        }
      } catch (err: any) {
        console.warn('AI batch remediation error, skipping batch safely:', err);
      } finally {
        setRecords(Array.from(updatedRecordsMap.values()));
      }
    };

    // Stage 1: Fast Primary MusicBrainz Ingestion (1 req/sec uninterrupted stream)
    for (let i = 0; i < queue.length; i++) {
      if (controller.signal.aborted) break;

      // Handle pause loop
      while (isPausedRef.current && !controller.signal.aborted) {
        await new Promise(r => setTimeout(r, 300));
      }
      if (controller.signal.aborted) break;

      const track = queue[i];
      setCurrentProgress({
        index: i + 1,
        total: queue.length,
        currentTrackName: `${track.artist} - ${track.title}`,
        stats: { ...stats },
      });

      try {
        const { record, isCacheHit } = await processTrackEnrichment(
          track,
          forceUpdateMode,
          controller.signal
        );

        updatedRecordsMap.set(record.id, record);
        stats.totalProcessed++;

        if (isCacheHit) {
          stats.cacheHits++;
        } else if (record.resolution.status === 'enriched' || record.resolution.status === 'ai_search_resolved' || record.resolution.status === 'itunes_enriched') {
          stats.mbEnriched++;
        } else if (record.resolution.status === 'needs_resolution') {
          stats.needsResolution++;
          remediationQueue.push({
            id: record.id,
            artist: track.artist,
            title: track.title,
            album: track.album,
            path: track.path,
          });
        }

        // Periodically update view table (every 3 tracks or at end of stage 1)
        if (i % 3 === 0 || i === queue.length - 1) {
          setRecords(Array.from(updatedRecordsMap.values()));
        }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        console.error('Error enriching track:', err);
      }
    }

    // Stage 2: Post-Scan AI Remediation Queue (Non-blocking Fold 1 Surgeon + Fold 2 Fallback)
    // Only runs if autoAiSurgeon is toggled on and there are tracks needing resolution
    if (autoAiSurgeon && remediationQueue.length > 0 && !controller.signal.aborted) {
      const totalToRemediate = remediationQueue.length;
      let remediatedCount = 0;

      while (remediationQueue.length > 0 && !controller.signal.aborted) {
        // Handle pause loop
        while (isPausedRef.current && !controller.signal.aborted) {
          await new Promise(r => setTimeout(r, 300));
        }
        if (controller.signal.aborted) break;

        const batchToProcess = remediationQueue.splice(0, 8);
        remediatedCount += batchToProcess.length;

        setCurrentProgress({
          index: remediatedCount,
          total: totalToRemediate,
          currentTrackName: `⚡ AI Remediation: Batch ${Math.ceil(remediatedCount / 8)} (${remediatedCount}/${totalToRemediate} flagged tracks)...`,
          stats: { ...stats },
        });

        await flushRemediationBatch(batchToProcess);
      }
    }

    setIsProcessing(false);
    abortControllerRef.current = null;
    const finalStats = await getDatabaseStats();
    setDbStats(finalStats);
    setRecords(Array.from(updatedRecordsMap.values()));
  };

  // Run AI Precision Search on Selected / Flagged Tracks in Batches of 8
  const handleRunAiSurgeonOnFlagged = async (targetRecords?: EnrichedSongRecord[]) => {
    const targets = targetRecords || records.filter(r => r.resolution.status === 'needs_resolution');
    if (targets.length === 0) {
      alert('No tracks flagged for resolution.');
      return;
    }

    const key = resolveAIKey();
    const config = getAIConfig();
    if (!key && config.provider === 'gemini') {
      setAiConfigForm(getAIConfig());
      setAiConfigModalOpen(true);
      alert('A Gemini API Key is required to run AI Precision Search and Fallback Synthesis. Please configure your key in the AI Settings dialog.');
      return;
    }

    setIsProcessing(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const BATCH_SIZE = 8;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      if (controller.signal.aborted) break;
      const chunk = targets.slice(i, i + BATCH_SIZE);
      const startNum = i + 1;
      const endNum = Math.min(i + BATCH_SIZE, targets.length);

      setCurrentProgress({
        index: endNum,
        total: targets.length,
        currentTrackName: `⚡ AI Precision Batch: Tracks ${startNum}–${endNum} of ${targets.length}...`,
        stats: { totalProcessed: i, cacheHits: 0, mbEnriched: 0, needsResolution: 0, aiSynthesized: 0, manualResolved: 0 },
      });

      try {
        const surgeonResult = await batchAiPrecisionQuerySurgeon(
          chunk.map(t => ({
            id: t.id,
            artist: t.artist?.name || t.queryArtist || '',
            title: t.title || t.queryTitle || '',
            album: t.release?.albumTitle || t.queryAlbum || '',
            path: t.queryPath || '',
          })),
          controller.signal
        );

        for (const [id, cleaned] of surgeonResult.resolved.entries()) {
          setRecords(prev => prev.map(r => r.id === id ? cleaned : r));
        }

        // Fold 2: For any remaining genuinely uncataloged tracks, generate fallback
        if (surgeonResult.unresolved.length > 0 && !controller.signal.aborted) {
          const fallbackMap = await batchAiSynthesizedFallback(surgeonResult.unresolved, controller.signal);
          for (const [id, fallback] of fallbackMap.entries()) {
            setRecords(prev => prev.map(r => r.id === id ? fallback : r));
          }
        }
      } catch (err) {
        console.warn('AI surgeon batch pass error:', err);
      }
    }

    setIsProcessing(false);
    abortControllerRef.current = null;
    const finalStats = await getDatabaseStats();
    setDbStats(finalStats);
  };

  // Remediate a single track using 2-fold AI pipeline (Surgeon -> Fallback Synthesis)
  const handleRemediateSingleTrack = async (track: EnrichedSongRecord) => {
    const key = resolveAIKey();
    const config = getAIConfig();
    if (!key && config.provider === 'gemini') {
      setAiConfigForm(getAIConfig());
      setAiConfigModalOpen(true);
      alert('A Gemini API Key is required for AI Remediation. Please configure your key in the AI Settings dialog.');
      return;
    }

    try {
      setRemediatingTrackId(track.id);
      const remediated = await remediateSingleTrack(track);
      setRecords(prev => prev.map(r => r.id === track.id ? remediated : r));
      if (activeDossier?.id === track.id) {
        setActiveDossier(remediated);
      }
      if (disambiguatingTrack?.id === track.id) {
        setDisambiguatingTrack(null);
      }
      const finalStats = await getDatabaseStats();
      setDbStats(finalStats);
    } catch (err: any) {
      console.error('Failed to remediate track:', err);
      alert('AI remediation failed: ' + (err.message || 'Unknown error'));
    } finally {
      setRemediatingTrackId(null);
    }
  };

  // On-demand AI Songwriting Credits Resolver for active dossier
  const handleResolveDossierCredits = async () => {
    if (!activeDossier) return;
    const key = resolveAIKey();
    const config = getAIConfig();
    if (!key && config.provider === 'gemini') {
      setAiConfigForm(getAIConfig());
      setAiConfigModalOpen(true);
      alert('A Gemini API Key is required for AI Songwriting Credits. Please configure your key in the AI Settings dialog.');
      return;
    }

    try {
      setIsResolvingCredits(true);
      const credits = await resolveAiSongwritingCredits(
        activeDossier.artist?.name || activeDossier.queryArtist,
        activeDossier.title || activeDossier.queryTitle,
        activeDossier.release?.albumTitle || activeDossier.queryAlbum
      );
      if (credits.composers.length > 0 || credits.lyricists.length > 0) {
        const updated: EnrichedSongRecord = {
          ...activeDossier,
          work: {
            ...activeDossier.work,
            lyricsLanguages: credits.languages?.length ? credits.languages : (activeDossier.work?.lyricsLanguages || []),
            composers: credits.composers,
            lyricists: credits.lyricists,
            arrangers: activeDossier.work?.arrangers || [],
            producers: activeDossier.work?.producers || [],
            engineers: activeDossier.work?.engineers || [],
            relationships: activeDossier.work?.relationships || [],
          },
          updatedAt: Date.now(),
        };
        await saveEnrichedTrack(updated, true);
        setActiveDossier(updated);
        setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
      } else {
        alert('AI could not determine songwriting credits for this track.');
      }
    } catch (err: any) {
      console.error('Failed to resolve songwriting credits:', err);
      alert('AI songwriting resolution failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsResolvingCredits(false);
    }
  };

  // Generate Fallback AI Synthesis for Uncataloged Tracks ("Not on MusicBrainz")
  const handleSynthesizeAiFallback = async (target: EnrichedSongRecord) => {
    try {
      const synthesized = await aiSynthesizedFallback(target.queryArtist, target.queryTitle, target.queryAlbum, target.queryPath);
      await saveEnrichedTrack(synthesized, true);
      setRecords(prev => prev.map(r => r.id === target.id ? synthesized : r));
      if (disambiguatingTrack?.id === target.id) {
        setDisambiguatingTrack(null);
      }
      if (activeDossier?.id === target.id) {
        setActiveDossier(synthesized);
      }
    } catch (e) {
      console.error('Failed to synthesize AI fallback:', e);
    }
  };

  // Download full-resolution cover art directly
  const handleDownloadArtwork = async (url: string, filename: string) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${filename.replace(/[/\\?%*:|"<>]/g, '_')}_artwork.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Fallback: open raw image directly in a new browser tab if cross-origin download fails
      window.open(url, '_blank');
    }
  };

  // Open Disambiguation Drawer
  const openDisambiguationDrawer = async (track: EnrichedSongRecord) => {
    setDisambiguatingTrack(track);
    const { cleanArtist, cleanTitle } = sanitizeSongQuery(track.queryArtist, track.queryTitle);
    setDisambiguateSearchQuery({ artist: cleanArtist, title: cleanTitle });
    setIsSearchingCandidates(true);
    const candidates = await searchMusicBrainzCandidates(cleanArtist, cleanTitle);
    setCandidateMatches(candidates);
    setIsSearchingCandidates(false);
  };

  // Perform Manual Live Candidate Search
  const handlePerformCandidateSearch = async () => {
    if (!disambiguateSearchQuery.title) return;
    setIsSearchingCandidates(true);
    const candidates = await searchMusicBrainzCandidates(disambiguateSearchQuery.artist, disambiguateSearchQuery.title);
    setCandidateMatches(candidates);
    setIsSearchingCandidates(false);
  };

  // Link selected candidate to recording
  const handleLinkCandidate = async (candidate: CandidateMatch) => {
    if (!disambiguatingTrack) return;
    try {
      const fullRecord = await fetchRecordingDetails(
        candidate.recordingMbid,
        disambiguatingTrack.queryArtist,
        disambiguatingTrack.queryTitle,
        disambiguatingTrack.queryAlbum,
        disambiguatingTrack.queryPath
      );

      if (fullRecord) {
        fullRecord.resolution.status = 'manual_resolved';
        fullRecord.resolution.badgeLabel = '✓ Manually Verified Match';
        fullRecord.resolution.matchScore = candidate.score;

        await saveEnrichedTrack(fullRecord, true);
        setRecords(prev => prev.map(r => r.id === fullRecord.id ? fullRecord : r));
        setDisambiguatingTrack(null);
      }
    } catch (e) {
      console.error('Failed to link candidate:', e);
    }
  };

  // Export handlers
  const handleExportCsv = async () => {
    const data = selectedIds.size > 0 ? records.filter(r => selectedIds.has(r.id)) : records;
    if (data.length === 0) return alert('No tracks to export.');
    const csvContent = exportToEnrichedCsv(data);
    await downloadPlaylistFile(csvContent, `PlaylistHaven_Enriched_Library_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  };

  const handleExportJson = async () => {
    const data = selectedIds.size > 0 ? records.filter(r => selectedIds.has(r.id)) : records;
    if (data.length === 0) return alert('No tracks to export.');
    const jsonContent = exportToMasterJson(data);
    await downloadPlaylistFile(jsonContent, `PlaylistHaven_Master_Dossier_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  const handleExportM3u8 = async () => {
    const data = selectedIds.size > 0 ? records.filter(r => selectedIds.has(r.id)) : records;
    if (data.length === 0) return alert('No tracks to export.');
    const m3u8Content = exportToTaggedM3u8(data);
    await downloadPlaylistFile(m3u8Content, `PlaylistHaven_Enriched_${new Date().toISOString().slice(0, 10)}.m3u8`, 'audio/x-mpegurl');
  };

  const handleExportDownloaderTxt = async () => {
    const data = selectedIds.size > 0 ? records.filter(r => selectedIds.has(r.id)) : records;
    if (data.length === 0) return alert('No tracks to export.');
    const txtContent = exportToDownloaderTxt(data);
    await downloadPlaylistFile(txtContent, `Downloader_Queue_${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain');
  };

  // Preload Dataset
  const handlePreloadDataset = async () => {
    if (!preloadJsonText.trim()) return;
    try {
      const { importedTracks } = await importDatabaseFromJSON(preloadJsonText);
      setPreloadFeedback(`Successfully imported & indexed ${importedTracks} tracks into local IndexedDB!`);
      await refreshDatabaseState();
      setTimeout(() => {
        setShowPreloadModal(false);
        setPreloadFeedback(null);
        setPreloadJsonText('');
      }, 1500);
    } catch (e: any) {
      setPreloadFeedback(`Import error: ${e.message}`);
    }
  };

  // Clear Database
  const handleClearDatabase = async () => {
    if (confirm('Are you sure you want to clear all stored enriched tracks from your browser IndexedDB? This cannot be undone.')) {
      await clearDatabase();
      await refreshDatabaseState();
    }
  };

  // Purge Unresolved Records from DB
  const handlePurgeUnresolved = async () => {
    try {
      const purged = await purgeUnresolvedTracks();
      await refreshDatabaseState();
      alert(`Successfully purged ${purged} unresolved placeholder records from IndexedDB.`);
    } catch (e: any) {
      alert(`Failed to purge unresolved records: ${e.message}`);
    }
  };

  // -------------------------------------------------------------
  // Universal 30s Audio Preview Player & In-Browser Downloader
  // -------------------------------------------------------------
  const formatAudioTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const togglePlayAudio = () => {
    if (!audioRef.current || !activeAudio) return;
    if (audioRef.current.paused) {
      audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(console.warn);
    } else {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    }
  };

  const handleSeekAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setAudioCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAudioVolume(val);
    if (isAudioMuted && val > 0) setIsAudioMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  const toggleMuteAudio = () => {
    if (!audioRef.current) return;
    if (isAudioMuted) {
      audioRef.current.volume = audioVolume;
      setIsAudioMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsAudioMuted(true);
    }
  };

  const handleCloseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setActiveAudio(null);
    setIsPlayingAudio(false);
    setAudioCurrentTime(0);
  };

  const handlePlayTrackPreview = async (track: EnrichedSongRecord) => {
    if (activeAudio?.trackId === track.id) {
      togglePlayAudio();
      return;
    }

    const artistName = track.artist?.name || track.queryArtist;
    const trackTitle = track.title || track.queryTitle;
    const coverArt = track.release?.coverArtThumbUrl || track.release?.coverArtFullUrl;

    let previewUrl = track.artist?.externalLinks?.audioPreviewUrl;

    if (!previewUrl) {
      setAudioLoadingTrackId(track.id);
      try {
        previewUrl = await resolveTrackAudioPreview(track);
        if (previewUrl) {
          // Update in-memory records
          setRecords(prev => prev.map(r => r.id === track.id ? { ...track } : r));
          if (activeDossier?.id === track.id) {
            setActiveDossier({ ...track });
          }
        }
      } catch (err: any) {
        console.warn('Failed to resolve preview:', err);
      } finally {
        setAudioLoadingTrackId(null);
      }
    }

    if (!previewUrl) {
      alert(`No 30-second audio preview found on Apple iTunes for "${artistName} - ${trackTitle}".`);
      return;
    }

    setActiveAudio({
      trackId: track.id,
      url: previewUrl,
      title: trackTitle,
      artist: artistName,
      coverArt,
    });
    setAudioCurrentTime(0);

    // Play immediately on persistently mounted audioRef
    if (audioRef.current) {
      audioRef.current.src = previewUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.volume = isAudioMuted ? 0 : audioVolume;
      audioRef.current.play()
        .then(() => setIsPlayingAudio(true))
        .catch(e => {
          console.warn('[Audio Player] Playback error:', e);
          setIsPlayingAudio(false);
        });
    }
  };

  const handleDownloadAudioPreview = async (url: string, artist: string, title: string) => {
    try {
      setIsDownloadingAudio(true);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const safeFilename = `${artist} - ${title} (30s Preview).m4a`.replace(/[/\\?%*:|"<>]/g, '_');
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert(`Could not download audio preview directly: ${err.message}`);
    } finally {
      setIsDownloadingAudio(false);
    }
  };

  // -------------------------------------------------------------
  // iTunes Album Art & Release Year Sanitizer / Supplement
  // -------------------------------------------------------------
  const handleSupplementSingleTrack = async (track: EnrichedSongRecord) => {
    setSupplementingTrackId(track.id);
    try {
      const forceArt = failedArtIds.has(track.id);
      const res = await supplementTrackFromITunes(track, undefined, { forceArt });
      if (res && res.supplementedFields.length > 0) {
        setRecords(prev => prev.map(r => r.id === track.id ? res.updatedRecord : r));
        if (activeDossier?.id === track.id) {
          setActiveDossier(res.updatedRecord);
        }
        if (failedArtIds.has(track.id)) {
          setFailedArtIds(prev => {
            const next = new Set(prev);
            next.delete(track.id);
            return next;
          });
        }
        alert(`Successfully supplemented: ${res.supplementedFields.join(', ')} for "${track.title || track.queryTitle}"!`);
      } else {
        alert(`No additional metadata found on Apple iTunes for "${track.title || track.queryTitle}".`);
      }
    } catch (e: any) {
      alert(`Supplement error: ${e.message}`);
    } finally {
      setSupplementingTrackId(null);
    }
  };

  const handleSupplementMissingArtAndYear = async () => {
    const targets = records.filter(r => {
      const thumb = r.release?.coverArtThumbUrl || '';
      const full = r.release?.coverArtFullUrl || '';
      const isArtFailed = failedArtIds.has(r.id);
      const hasNoArt = !thumb && !full;
      const needsArt = isArtFailed || hasNoArt;

      const rawYear = r.release?.originalReleaseYear;
      const rawDate = r.release?.releaseDate;
      const hasYear = (typeof rawYear === 'number' && rawYear > 0 && !isNaN(rawYear)) ||
                      (typeof rawDate === 'string' && rawDate.trim() !== '' && rawDate !== '—');
      const needsYear = !hasYear;

      return needsArt || needsYear;
    });

    if (targets.length === 0) {
      alert('All tracks in your library already have cover art and release dates!');
      return;
    }

    setIsProcessing(true);
    setIsSupplementingAll(true);
    setIsPaused(false);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let supplementedCount = 0;
    const updatedMap = new Map<string, EnrichedSongRecord>();
    for (const r of records) updatedMap.set(r.id, r);

    for (let i = 0; i < targets.length; i++) {
      if (controller.signal.aborted) break;
      const t = targets[i];
      const artist = t.artist?.name || t.queryArtist;
      const title = t.title || t.queryTitle;

      setCurrentProgress({
        index: i + 1,
        total: targets.length,
        currentTrackName: `🖼️ Sanitizing Art & Year: ${artist} - ${title}...`,
        stats: {
          totalProcessed: i + 1,
          cacheHits: tableStats.cacheHits,
          mbEnriched: tableStats.mbEnriched,
          itunesEnriched: (tableStats.itunesEnriched || 0) + supplementedCount,
          needsResolution: tableStats.needsResolution,
          aiSynthesized: tableStats.aiSynthesized,
          manualResolved: tableStats.manualResolved,
        },
      });

      try {
        const forceArt = failedArtIds.has(t.id);
        const res = await supplementTrackFromITunes(t, controller.signal, { forceArt });
        if (res && res.supplementedFields.length > 0) {
          supplementedCount++;
          updatedMap.set(t.id, res.updatedRecord);
          if (failedArtIds.has(t.id)) {
            setFailedArtIds(prev => {
              const next = new Set(prev);
              next.delete(t.id);
              return next;
            });
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        console.warn(`[Supplement] Error for ${artist} - ${title}:`, err);
      }
    }

    setRecords(Array.from(updatedMap.values()));
    setIsProcessing(false);
    setIsSupplementingAll(false);
    await refreshDatabaseState();

    if (!controller.signal.aborted) {
      alert(`Sanitization complete! Successfully supplemented missing artwork / release year for ${supplementedCount} of ${targets.length} tracks from Apple iTunes.`);
    }
  };

  // Dedicated one-click: Re-query all "Not on MB" tracks directly against Apple iTunes
  const handleRetryNotOnMbWithItunes = async () => {
    const targets = records.filter(r => 
      r.resolution?.status === 'ai_synthesized_fallback' ||
      r.resolution?.source === 'ai_synthesized_fallback' ||
      r.resolution?.isAiSynthesized ||
      (r.resolution?.status === 'needs_resolution' && r.resolution?.failureReason === 'PURGED_FOR_RETRY')
    );

    if (targets.length === 0) {
      alert('No "Not on MB" fallback tracks found to retry.');
      return;
    }

    setIsProcessing(true);
    setIsPaused(false);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // First delete their cached entries from IndexedDB so they never load stale cache
    for (const t of targets) {
      if (t.id) await deleteEnrichedTrack(t.id);
    }

    let itunesFound = 0;
    let stillUnresolved = 0;
    const updatedMap = new Map<string, EnrichedSongRecord>();
    for (const r of records) updatedMap.set(r.id, r);

    for (let i = 0; i < targets.length; i++) {
      if (controller.signal.aborted) break;
      const t = targets[i];
      const artist = t.artist?.name || t.queryArtist;
      const title = t.title || t.queryTitle;
      const album = t.release?.albumTitle || t.queryAlbum;

      setCurrentProgress({
        index: i + 1,
        total: targets.length,
        currentTrackName: `🍎 iTunes Query: ${artist} - ${title}...`,
        stats: {
          totalProcessed: i + 1,
          cacheHits: tableStats.cacheHits,
          mbEnriched: tableStats.mbEnriched,
          itunesEnriched: (tableStats.itunesEnriched || 0) + itunesFound,
          needsResolution: stillUnresolved,
          aiSynthesized: targets.length - i - 1,
          manualResolved: tableStats.manualResolved,
        },
      });

      try {
        const itunesRecord = await queryITunesRecording(artist, title, album, t.queryPath, controller.signal);
        if (itunesRecord) {
          itunesRecord.id = t.id;
          itunesRecord.queryArtist = t.queryArtist;
          itunesRecord.queryTitle = t.queryTitle;
          await saveEnrichedTrack(itunesRecord, true);
          updatedMap.set(t.id, itunesRecord);
          itunesFound++;
        } else {
          // If iTunes also misses, mark as needs_resolution
          t.resolution.status = 'needs_resolution';
          t.resolution.badgeLabel = '⚠️ Needs Resolution';
          t.resolution.source = 'manual';
          t.resolution.isAiSynthesized = false;
          updatedMap.set(t.id, t);
          stillUnresolved++;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        console.warn(`Error querying iTunes for ${artist} - ${title}:`, err);
      }

      if (i % 3 === 0 || i === targets.length - 1) {
        setRecords(Array.from(updatedMap.values()));
      }
    }

    setIsProcessing(false);
    abortControllerRef.current = null;
    await refreshDatabaseState();
    alert(`🍎 iTunes Retry Completed!\n\n✓ ${itunesFound} tracks matched & verified on Apple iTunes (600×600 artwork loaded)\n⚠️ ${stillUnresolved} tracks remain uncataloged on iTunes`);
  };

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // 1. Cultural Bucket
      if (selectedBucket !== 'ALL' && r.culturalBucket !== selectedBucket) {
        return false;
      }
      // 2. Status
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'verified' && r.resolution.status !== 'enriched' && r.resolution.status !== 'ai_search_resolved' && r.resolution.status !== 'itunes_enriched') return false;
        if (selectedStatus === 'itunes_enriched' && r.resolution.status !== 'itunes_enriched') return false;
        if (selectedStatus === 'needs_resolution' && r.resolution.status !== 'needs_resolution') return false;
        if (selectedStatus === 'not_on_mb' && r.resolution.status !== 'ai_synthesized_fallback') return false;
        if (selectedStatus === 'cached' && r.resolution.status !== 'cached') return false;
      }
      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (r.title || r.queryTitle || '').toLowerCase().includes(q);
        const matchArtist = (r.artist?.name || r.queryArtist || '').toLowerCase().includes(q);
        const matchAlbum = (r.release?.albumTitle || '').toLowerCase().includes(q);
        const matchCountry = (r.artist?.countryName || r.artist?.countryCode || '').toLowerCase().includes(q);
        const matchLabel = (r.release?.labels || []).some(l => l.name.toLowerCase().includes(q));
        const matchIsrc = (r.isrcs || []).some(i => i.toLowerCase().includes(q));
        return matchTitle || matchArtist || matchAlbum || matchCountry || matchLabel || matchIsrc;
      }
      return true;
    });
  }, [records, selectedBucket, selectedStatus, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      {/* 1. Header & Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700 active:scale-95"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>🧬 Deep Metadata Enrichment Engine</span>
              </h1>
              <span className="bg-gradient-to-r from-teal-500/20 to-cyan-500/20 border border-teal-500/40 text-teal-300 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold tracking-wide uppercase">
                Module 15 • Tier 2 Deep
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Extract maximum musicological data from MusicBrainz, Cover Art Archive, and Wikidata into local IndexedDB.
            </p>
          </div>
        </div>

        {/* Database Stats Badge & Utility Actions */}
        <div className="flex items-center space-x-2.5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-1.5 text-slate-300 font-mono">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span>{dbStats.trackCount} Tracks Indexed</span>
            </div>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {(dbStats.estimatedSizeBytes / 1024).toFixed(0)} KB
            </span>
          </div>

          <button
            onClick={() => {
              setAiConfigForm(getAIConfig());
              setAiTestStatus(null);
              setAiConfigModalOpen(true);
            }}
            className={`px-3 py-1.5 border rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 ${
              hasAiKey
                ? 'bg-purple-950/40 text-purple-300 border-purple-800/60 hover:bg-purple-900/60'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/60'
            }`}
            title="Configure AI API Key & Model for Precision Search Surgeon"
          >
            <Sparkles className={`w-3.5 h-3.5 ${hasAiKey ? 'text-purple-400' : 'text-amber-400 animate-pulse'}`} />
            <span>{hasAiKey ? 'AI Ready' : 'Configure AI Key'}</span>
          </button>

          <button
            onClick={() => setShowPreloadModal(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95"
            title="Preload or import an offline dataset into IndexedDB"
          >
            <Upload className="w-3.5 h-3.5 text-teal-400" />
            <span>Preload</span>
          </button>

          <button
            onClick={async () => {
              const json = await exportDatabaseToJSON();
              await downloadPlaylistFile(json, `PlaylistHaven_Metadata_DB_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95"
            title="Export full offline database backup"
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Backup DB</span>
          </button>

          <button
            onClick={handlePurgeUnresolved}
            className="px-3 py-1.5 bg-slate-800 hover:bg-amber-950/60 hover:text-amber-300 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95"
            title="Purge all legacy failed 'needs_resolution' records from IndexedDB"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Purge Unresolved</span>
          </button>

          <button
            onClick={handleClearDatabase}
            className="p-2 bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 border border-slate-700 rounded-xl transition"
            title="Clear IndexedDB"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Studio Container */}
      <main className={`flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 ${activeAudio ? 'pb-24' : ''}`}>
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total in Workspace</span>
            <div className="text-2xl sm:text-3xl font-black text-white mt-2 font-mono">
              {tableStats.total}
            </div>
            <span className="text-[11px] text-slate-500 mt-1">Ready for export</span>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">0ms Cache Hits</span>
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-300 mt-2 font-mono">
              {tableStats.cacheHits}
            </div>
            <span className="text-[11px] text-emerald-500/80 mt-1">IndexedDB instant reuse</span>
          </div>

          <div 
            onClick={() => setSelectedStatus(prev => prev === 'verified' ? 'ALL' : 'verified')}
            className={`bg-cyan-950/20 border rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition ${
              selectedStatus === 'verified' ? 'border-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-400 shadow-md' : 'border-cyan-500/30 hover:border-cyan-400/60'
            }`}
            title="Click to filter table by verified tracks"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">MB Verified</span>
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-cyan-300 mt-2 font-mono">
              {tableStats.mbEnriched}
            </div>
            <span className="text-[11px] text-cyan-500/80 mt-1">MusicBrainz verified</span>
          </div>

          <div 
            onClick={() => setSelectedStatus(prev => prev === 'itunes_enriched' ? 'ALL' : 'itunes_enriched')}
            className={`bg-pink-950/20 border rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition ${
              selectedStatus === 'itunes_enriched' ? 'border-pink-400 bg-pink-950/40 ring-1 ring-pink-400 shadow-md' : 'border-pink-500/30 hover:border-pink-400/60'
            }`}
            title="Click to filter table by iTunes Verified tracks"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-pink-400 uppercase tracking-wider">iTunes Verified</span>
              <span className="text-sm">🍎</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-pink-300 mt-2 font-mono">
              {tableStats.itunesEnriched}
            </div>
            <span className="text-[11px] text-pink-500/80 mt-1">Apple iTunes Catalog</span>
          </div>

          <div 
            onClick={() => setSelectedStatus(prev => prev === 'needs_resolution' ? 'ALL' : 'needs_resolution')}
            className={`bg-amber-950/20 border rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition ${
              selectedStatus === 'needs_resolution' ? 'border-amber-400 bg-amber-950/40 ring-1 ring-amber-400 shadow-md' : 'border-amber-500/30 hover:border-amber-400/60'
            }`}
            title="Click to filter table by tracks needing resolution"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Needs Resolution</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mt-2 font-mono">
              {tableStats.needsResolution}
            </div>
            <span className="text-[11px] text-amber-500/80 mt-1">Dirty tags or ambiguous</span>
          </div>

          <div 
            onClick={() => setSelectedStatus(prev => prev === 'not_on_mb' ? 'ALL' : 'not_on_mb')}
            className={`bg-purple-950/20 border rounded-2xl p-4 flex flex-col justify-between col-span-2 sm:col-span-1 lg:col-span-1 cursor-pointer transition ${
              selectedStatus === 'not_on_mb' ? 'border-purple-400 bg-purple-950/40 ring-1 ring-purple-400 shadow-md' : 'border-purple-500/30 hover:border-purple-400/60'
            }`}
            title="Click to filter table by 'Not on MB' fallback tracks"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Not on MB</span>
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-purple-300 mt-2 font-mono">
              {tableStats.aiSynthesized}
            </div>
            <span className="text-[11px] text-purple-400/80 mt-1">⚠️ AI Fallback</span>
          </div>
        </div>

        {/* Ingestion & Workflow Configuration Section */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Universal Library Ingestion</span>
                <span className="text-xs font-normal text-slate-400">(.m3u, .m3u8, .csv, .tsv, .txt, .json)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Drop your music library in any format. Songs are matched against MusicBrainz with rate-limiting safety.
              </p>
            </div>

            {/* Mode Switches */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Ingestion Mode Toggle */}
              <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center space-x-1">
                <button
                  onClick={() => setForceUpdateMode(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                    !forceUpdateMode
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Skip tracks already enriched in local IndexedDB (0ms cache lookup)"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>⚡ Fast: Skip Cached</span>
                </button>

                <button
                  onClick={() => setForceUpdateMode(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                    forceUpdateMode
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Force re-query MusicBrainz and overwrite stored metadata"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>🔄 Update: Force Refresh</span>
                </button>
              </div>

              {/* Auto AI Surgeon Toggle */}
              <button
                onClick={() => setAutoAiSurgeon(prev => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center space-x-1.5 ${
                  autoAiSurgeon
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
                title="Automatically clean dirty tags and re-query MusicBrainz if first search fails"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Auto AI Surgeon</span>
              </button>

              {/* One-Click Retry Not on MB with iTunes */}
              {tableStats.aiSynthesized > 0 && (
                <button
                  type="button"
                  onClick={handleRetryNotOnMbWithItunes}
                  disabled={isProcessing}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold border border-pink-500/50 bg-pink-950/60 hover:bg-pink-900/80 text-pink-200 transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer animate-pulse hover:animate-none"
                  title="Purge cached entries for fallback tracks and query Apple iTunes Search API directly"
                >
                  <span className="text-sm">🍎</span>
                  <span>Retry Not on MB with iTunes ({tableStats.aiSynthesized})</span>
                </button>
              )}
            </div>
          </div>

          {/* Drag & Drop File Upload Zone */}
          <FileUploader
            files={uploadedFiles}
            onFilesSelected={handleFilesSelected}
            onClear={() => {
              setUploadedFiles([]);
              setStagedQueue([]);
            }}
            multiple={true}
            accept=".m3u,.m3u8,.csv,.tsv,.txt,.json,text/csv,text/plain,application/json"
            label="Upload Music Library (M3U, CSV, TSV, TXT, JSON)"
            subLabel="Drag & drop any playlist, library CSV, or text dump to enrich with MusicBrainz"
            colorClass="fuchsia"
          />

          {/* Reading Files Loading Indicator */}
          {isReadingFiles && (
            <div className="flex items-center justify-center p-4 bg-slate-900/80 border border-fuchsia-500/30 rounded-2xl text-xs font-bold text-fuchsia-300 space-x-2 animate-pulse mt-3">
              <RefreshCw className="w-4 h-4 animate-spin text-fuchsia-400" />
              <span>Parsing uploaded file(s)...</span>
            </div>
          )}

          {/* Staged Tracks Launchpad Banner */}
          {stagedQueue.length > 0 && !isProcessing && (
            <div className="mt-4 bg-gradient-to-r from-fuchsia-950/50 via-purple-950/40 to-slate-900 border border-fuchsia-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 animate-in fade-in duration-200 shadow-xl">
              <div className="flex items-center space-x-3.5">
                <div className="p-3 bg-fuchsia-500/20 text-fuchsia-300 rounded-xl border border-fuchsia-500/30 shadow-inner">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-white text-sm">
                      {stagedQueue.length.toLocaleString()} Tracks Staged for Deep Enrichment
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                      {uploadedFiles.length} File{uploadedFiles.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>{new Set(stagedQueue.map(s => (s.artist || '').toLowerCase().trim())).size.toLocaleString()} unique artists detected.</span>
                    <span className="text-slate-400">•</span>
                    <span>Mode:</span>
                    <span className="font-semibold text-cyan-300">
                      {forceUpdateMode ? '🔄 Force Refresh (Update All)' : '⚡ Fast Mode (Skip Cached in IndexedDB)'}
                    </span>
                    {columnMapping.titleCol && (
                      <span className="font-mono text-[10px] text-fuchsia-300 bg-fuchsia-950/80 px-2 py-0.5 rounded border border-fuchsia-800/60">
                        Title: {columnMapping.titleCol} • Artist: {columnMapping.artistCol}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2.5">
                {activeCsvDataset && (
                  <button
                    type="button"
                    onClick={() => setShowColumnMappingModal(true)}
                    className="px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/60 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
                    title="Re-open Column Mapping and hygiene filters"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>⚙️ Column Mapping & Filters</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUploadedFiles([]);
                    setStagedQueue([]);
                    setActiveCsvDataset(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-800/60 rounded-xl transition cursor-pointer"
                >
                  Clear Queue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const queueToRun = [...stagedQueue];
                    setStagedQueue([]);
                    startEnrichmentPipeline(queueToRun);
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 text-white rounded-xl text-xs font-black tracking-wide uppercase flex items-center space-x-2 shadow-lg shadow-fuchsia-900/40 active:scale-95 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-fuchsia-200 animate-pulse" />
                  <span>🚀 Start Deep Enrichment ({stagedQueue.length.toLocaleString()} Tracks)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Running Queue Progress Bar (Active when processing) */}
        {isProcessing && (
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-4 space-y-3 animate-pulse">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                <span className="font-bold text-white">
                  Enriching Track {currentProgress.index} of {currentProgress.total}
                </span>
                <span className="text-slate-400 font-mono">
                  ({Math.round((currentProgress.index / Math.max(1, currentProgress.total)) * 100)}%)
                </span>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsPaused(p => !p)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1"
                >
                  {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  onClick={() => abortControllerRef.current?.abort()}
                  className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded-lg text-xs font-semibold flex items-center space-x-1"
                >
                  <Square className="w-3.5 h-3.5 text-rose-400" />
                  <span>Stop & Use Current</span>
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-300"
                style={{ width: `${(currentProgress.index / Math.max(1, currentProgress.total)) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate max-w-md text-slate-300">
                Processing: <span className="font-semibold text-white">{currentProgress.currentTrackName}</span>
              </span>
              <span className="font-mono text-cyan-400">Rate Limit: 1.1s safety throttle</span>
            </div>
          </div>
        )}

        {/* Flagged Resolution Notification Bar */}
        {tableStats.needsResolution > 0 && !isProcessing && (
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-200">
                  {tableStats.needsResolution} tracks require disambiguation or dirty tag cleaning
                </h3>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  MusicBrainz returned no exact matches due to noisy titles or uncataloged versions. Use AI precision terms or link manually.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  setAiConfigForm(getAIConfig());
                  setAiTestStatus(null);
                  setAiConfigModalOpen(true);
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
                <span>AI Settings</span>
              </button>
              <button
                type="button"
                onClick={() => handleRunAiSurgeonOnFlagged()}
                className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-lg shadow-purple-950/40 active:scale-95 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-purple-200 animate-pulse" />
                <span>⚡ AI Precision Re-Search</span>
              </button>
            </div>
          </div>
        )}

        {/* Data Grid Toolbar (Search, Filter by 20 Buckets, Export) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search title, artist, album, country, label, ISRC..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>

            {/* Cultural Bucket Filter (20 Canonical Buckets!) */}
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedBucket}
                onChange={e => setSelectedBucket(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All 20 Cultural Buckets</option>
                {Object.keys(CANONICAL_BUCKETS).map(b => (
                  <option key={b} value={b}>{CANONICAL_BUCKETS[b as CanonicalBucket].displayName}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="verified">✓ Verified (MusicBrainz & iTunes)</option>
                <option value="itunes_enriched">🍎 iTunes Verified</option>
                <option value="needs_resolution">⚠️ Needs Resolution</option>
                <option value="not_on_mb">⚠️ Not on MusicBrainz (AI Fallback)</option>
                <option value="cached">⚡ 0ms Cached</option>
              </select>
            </div>

            {/* Export & Supplement Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSupplementMissingArtAndYear}
                disabled={isProcessing || isSupplementingAll}
                className="px-3 py-2 bg-gradient-to-r from-emerald-600/30 to-teal-600/30 hover:from-emerald-600/50 hover:to-teal-600/50 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
                title="Sanitize empty album art and release year fields across all tracks using Apple iTunes"
              >
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <span>🖼️ Supplement Missing Art & Year {tableStats.missingArtOrYear > 0 ? `(${tableStats.missingArtOrYear})` : ''}</span>
              </button>

              <button
                onClick={handleExportCsv}
                className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
                title="Export 38-Column CSV with UTF-8 BOM"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>38-Col CSV</span>
              </button>

              <button
                onClick={handleExportJson}
                className="px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
                title="Export Master Dataset JSON"
              >
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Master JSON</span>
              </button>

              <button
                onClick={handleExportM3u8}
                className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
                title="Export Tagged M3U8 Playlist"
              >
                <FileCode className="w-4 h-4 text-purple-400" />
                <span>Tagged M3U8</span>
              </button>

              <button
                onClick={handleExportDownloaderTxt}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
                title="Export clean list for spotdl / yt-dlp"
              >
                <FileText className="w-4 h-4 text-slate-400" />
                <span>TXT List</span>
              </button>
            </div>
          </div>

          {/* Bulk Selection Bar if any selected */}
          {selectedIds.size > 0 && (
            <div className="bg-slate-950 border border-cyan-500/40 rounded-xl p-2.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-cyan-300">
                {selectedIds.size} of {filteredRecords.length} tracks selected
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const sel = records.filter(r => selectedIds.has(r.id));
                    handleRunAiSurgeonOnFlagged(sel);
                  }}
                  className="px-2.5 py-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded-lg text-xs font-medium flex items-center space-x-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Precision on Selected</span>
                </button>

                <button
                  onClick={async () => {
                    const sel = records.filter(r => selectedIds.has(r.id));
                    let count = 0;
                    for (const t of sel) {
                      const res = await supplementTrackFromITunes(t);
                      if (res && res.supplementedFields.length > 0) count++;
                    }
                    await refreshDatabaseState();
                    alert(`Supplemented iTunes metadata for ${count} of ${sel.length} selected tracks.`);
                  }}
                  className="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 rounded-lg text-xs font-medium flex items-center space-x-1 cursor-pointer"
                  title="Supplement missing art/year for selected tracks via iTunes"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Supplement Selected</span>
                </button>

                <button
                  onClick={async () => {
                    for (const id of selectedIds) {
                      await deleteEnrichedTrack(id);
                    }
                    setSelectedIds(new Set());
                    await refreshDatabaseState();
                  }}
                  className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded-lg text-xs font-medium flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. High-Density Interactive Data Grid */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-mono text-[10px]">
                <tr>
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(filteredRecords.map(r => r.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                    />
                  </th>
                  <th className="p-3 w-12 text-center">Art</th>
                  <th className="p-3 font-semibold">Track Title & Version</th>
                  <th className="p-3 font-semibold">Artist & Origin</th>
                  <th className="p-3 font-semibold">Album & Year</th>
                  <th className="p-3 font-semibold">Cultural Bucket</th>
                  <th className="p-3 font-semibold">Status Badge</th>
                  <th className="p-3 font-semibold text-center">Match</th>
                  <th className="p-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">
                      No enriched tracks found matching your filter. Upload a playlist above to get started!
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(track => {
                    const bucketMeta = CANONICAL_BUCKETS[track.culturalBucket] || CANONICAL_BUCKETS['Other'];
                    const isSelected = selectedIds.has(track.id);

                    return (
                      <tr
                        key={track.id}
                        className={`hover:bg-slate-800/50 transition cursor-pointer ${
                          isSelected ? 'bg-cyan-950/20' : ''
                        }`}
                        onClick={() => setActiveDossier(track)}
                      >
                        {/* Checkbox */}
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(track.id)) next.delete(track.id);
                                else next.add(track.id);
                                return next;
                              });
                            }}
                            className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                          />
                        </td>

                        {/* Cover Art Thumbnail */}
                        <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                          <div
                            onClick={() => setActiveDossier(track)}
                            className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center mx-auto shadow cursor-pointer group"
                            title="Click to view full dossier"
                          >
                            {track.release?.coverArtThumbUrl && !failedArtIds.has(track.id) ? (
                              <img
                                src={track.release.coverArtThumbUrl}
                                alt={track.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition"
                                onError={() => {
                                  setFailedArtIds(prev => new Set(prev).add(track.id));
                                }}
                              />
                            ) : (
                              <Disc className="w-5 h-5 text-slate-600 group-hover:text-cyan-400 transition" />
                            )}
                          </div>
                        </td>

                        {/* Title */}
                        <td className="p-3 max-w-[200px]">
                          <div className="font-bold text-white truncate" title={track.title || track.queryTitle}>
                            {track.title || track.queryTitle}
                          </div>
                          {track.disambiguation && (
                            <div className="text-[10px] text-slate-400 truncate italic">
                              ({track.disambiguation})
                            </div>
                          )}
                          {track.isrcs && track.isrcs.length > 0 && (
                            <div className="text-[10px] font-mono text-cyan-400/80">
                              ISRC: {track.isrcs[0]}
                            </div>
                          )}
                        </td>

                        {/* Artist & Origin */}
                        <td className="p-3 max-w-[180px]">
                          <div className="font-medium text-slate-200 truncate" title={track.artist?.name || track.queryArtist}>
                            {track.artist?.name || track.queryArtist}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                            {track.artist?.countryCode && (
                              <span className="font-mono bg-slate-800 px-1 py-0.2 rounded text-slate-300">
                                {track.artist.countryCode}
                              </span>
                            )}
                            <span>{track.artist?.beginArea || track.artist?.primaryArea || track.artist?.countryName || 'Unknown Area'}</span>
                          </div>
                        </td>

                        {/* Album & Year */}
                        <td className="p-3 max-w-[160px]">
                          <div className="text-slate-300 truncate" title={track.release?.albumTitle || 'Unknown Album'}>
                            {track.release?.albumTitle || '—'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {track.release?.originalReleaseYear || track.release?.releaseDate?.slice(0, 4) || '—'}
                          </div>
                        </td>

                        {/* Cultural Bucket Badge */}
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${bucketMeta.badgeBg}`}>
                            {bucketMeta.displayName.split(' ')[0]}
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td className="p-3">
                          {track.resolution?.status === 'enriched' || track.resolution?.status === 'manual_resolved' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                              <ShieldCheck className="w-3 h-3 text-cyan-400" />
                              <span>MB Verified</span>
                            </span>
                          ) : track.resolution?.status === 'itunes_enriched' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-pink-950/80 text-pink-300 border border-pink-700/80" title="Verified via Apple iTunes Search API">
                              <span>🍎</span>
                              <span>iTunes Verified</span>
                            </span>
                          ) : track.resolution?.status === 'ai_search_resolved' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-950 text-purple-300 border border-purple-800/80">
                              <Zap className="w-3 h-3 text-purple-400" />
                              <span>⚡ AI Search</span>
                            </span>
                          ) : track.resolution?.status === 'ai_synthesized_fallback' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800/80" title="Not cataloged on MusicBrainz">
                              <AlertCircle className="w-3 h-3 text-rose-400" />
                              <span>Not on MB</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800/80">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              <span>Needs Res</span>
                            </span>
                          )}
                        </td>

                        {/* Match Score */}
                        <td className="p-3 text-center font-mono font-bold">
                          <span className={`${
                            track.resolution?.matchScore >= 80 ? 'text-emerald-400' :
                            track.resolution?.matchScore >= 60 ? 'text-amber-400' : 'text-slate-500'
                          }`}>
                            {track.resolution?.matchScore ? `${track.resolution.matchScore}%` : '—'}
                          </span>
                        </td>

                        {/* Action Buttons */}
                        <td className="p-3 text-right space-x-1" onClick={e => e.stopPropagation()}>
                          {/* In-App 30s Audio Preview */}
                          <button
                            onClick={() => handlePlayTrackPreview(track)}
                            disabled={audioLoadingTrackId === track.id}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              activeAudio?.trackId === track.id && isPlayingAudio
                                ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/50'
                                : 'bg-slate-800 hover:bg-pink-950/60 hover:text-pink-300 text-slate-300'
                            }`}
                            title={
                              activeAudio?.trackId === track.id && isPlayingAudio
                                ? 'Pause in-app 30s audio preview'
                                : track.artist?.externalLinks?.audioPreviewUrl
                                  ? 'Play in-app 30s audio preview'
                                  : 'Fetch from iTunes & play 30s preview'
                            }
                          >
                            {audioLoadingTrackId === track.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-pink-400" />
                            ) : activeAudio?.trackId === track.id && isPlayingAudio ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5 text-pink-400" />
                            )}
                          </button>

                          {/* Supplement Missing Art & Year button */}
                          {(((!track.release?.coverArtFullUrl && !track.release?.coverArtThumbUrl) || failedArtIds.has(track.id)) ||
                            (!track.release?.originalReleaseYear && (!track.release?.releaseDate || track.release?.releaseDate === '—'))) && (
                            <button
                              onClick={() => handleSupplementSingleTrack(track)}
                              disabled={supplementingTrackId === track.id}
                              className="p-1.5 bg-slate-800 hover:bg-emerald-950/60 hover:text-emerald-300 text-slate-300 rounded-lg transition cursor-pointer"
                              title="Sanitize empty art / release year via Apple iTunes"
                            >
                              <Sparkles className={`w-3.5 h-3.5 ${supplementingTrackId === track.id ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
                            </button>
                          )}

                          <button
                            onClick={() => setActiveDossier(track)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                            title="Open deep dossier drawer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openDisambiguationDrawer(track)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg transition"
                            title="Manual disambiguation search"
                          >
                            <Search className="w-3.5 h-3.5" />
                          </button>

                          {(track.resolution?.status === 'needs_resolution' || (track.resolution?.matchScore ?? 0) < 60) && (
                            <button
                              onClick={() => handleRemediateSingleTrack(track)}
                              disabled={remediatingTrackId === track.id}
                              className={`p-1.5 rounded-lg transition ${
                                remediatingTrackId === track.id
                                  ? 'bg-purple-900/50 text-purple-300 animate-pulse cursor-wait'
                                  : 'bg-purple-950/80 hover:bg-purple-800 text-purple-300 border border-purple-700/60 hover:border-purple-500'
                              }`}
                              title="✨ AI Remediate: Precision surgeon & fallback synthesis"
                            >
                              <Sparkles className={`w-3.5 h-3.5 ${remediatingTrackId === track.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 4. Slide-Over Deep Metadata Dossier Drawer */}
      {activeDossier && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-fadeIn">
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-y-auto">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-md z-10">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
                  <Music2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">Track Musicological Dossier</h2>
                    {isHydratingDossier && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.5 rounded-md animate-pulse">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        Auto-hydrating...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    ID: {activeDossier.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveDossier(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6">
              {/* AI Remediation Action Card for Unresolved / Low-confidence Tracks */}
              {(activeDossier.resolution?.status === 'needs_resolution' || (activeDossier.resolution?.matchScore ?? 0) < 60) && (
                <div className="bg-gradient-to-r from-purple-950/50 via-purple-900/25 to-slate-950 border border-purple-700/50 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-purple-400 text-xs font-bold">
                      <Sparkles className="w-4 h-4" />
                      <span>Uncataloged or Unresolved on MusicBrainz</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Run AI Precision Surgeon to clean tags and re-query MusicBrainz, or directly synthesize fallback musicological data.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRemediateSingleTrack(activeDossier)}
                      disabled={remediatingTrackId === activeDossier.id}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md transition"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${remediatingTrackId === activeDossier.id ? 'animate-spin' : ''}`} />
                      <span>{remediatingTrackId === activeDossier.id ? 'Remediating...' : 'AI Remediate Track'}</span>
                    </button>
                    <button
                      onClick={() => handleSynthesizeAiFallback(activeDossier)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                      title="Directly synthesize fallback metadata without re-querying MB"
                    >
                      <span>Fallback</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Cover Art & High Level Lineage */}
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div
                  onClick={() => {
                    const fullUrl = activeDossier.release?.coverArtFullUrl || (activeDossier.release?.releaseMbid ? `https://coverartarchive.org/release/${activeDossier.release.releaseMbid}/front` : '') || activeDossier.release?.coverArtThumbUrl;
                    if (fullUrl) {
                      setLightboxImage({
                        url: fullUrl,
                        title: activeDossier.release?.albumTitle || activeDossier.title || activeDossier.queryTitle,
                        artist: activeDossier.artist?.name || activeDossier.queryArtist,
                        releaseMbid: activeDossier.release?.releaseMbid,
                      });
                    }
                  }}
                  className={`w-36 h-36 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex-shrink-0 shadow-xl relative group ${
                    activeDossier.release?.coverArtFullUrl || activeDossier.release?.coverArtThumbUrl || activeDossier.release?.releaseMbid ? 'cursor-pointer' : ''
                  }`}
                  title={activeDossier.release?.releaseMbid ? 'Click to inspect full-resolution artwork' : undefined}
                >
                  {activeDossier.release?.coverArtFullUrl || activeDossier.release?.coverArtThumbUrl ? (
                    <img
                      src={activeDossier.release.coverArtFullUrl || activeDossier.release.coverArtThumbUrl}
                      alt={activeDossier.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                      <Disc className="w-10 h-10 mb-1" />
                      <span className="text-[10px]">No Artwork</span>
                    </div>
                  )}
                  {activeDossier.release?.releaseMbid && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition duration-200 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                      <div className="flex items-center gap-1 px-2.5 py-1 bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 rounded-lg text-xs font-semibold backdrop-blur-sm shadow">
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Art</span>
                      </div>
                      <a
                        href={`https://coverartarchive.org/release/${activeDossier.release.releaseMbid}/front`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1 hover:underline"
                        title="Open direct image file in new tab"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span>Direct JPG</span>
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      CANONICAL_BUCKETS[activeDossier.culturalBucket]?.badgeBg || ''
                    }`}>
                      {activeDossier.culturalBucket}
                    </span>
                    <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                      {activeDossier.resolution?.badgeLabel}
                    </span>
                  </div>

                  <h3 className="text-xl font-black text-white leading-tight">
                    {activeDossier.title || activeDossier.queryTitle}
                  </h3>
                  <p className="text-sm font-semibold text-slate-300">
                    by {activeDossier.artist?.name || activeDossier.queryArtist}
                  </p>
                  <p className="text-xs text-slate-400">
                    Album: <span className="text-slate-200">{activeDossier.release?.albumTitle || 'Unknown Release'}</span>
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 font-mono pt-1">
                    <span>Original Year: <strong className="text-cyan-400">{activeDossier.release?.originalReleaseYear || '—'}</strong></span>
                    <span>Release Date: <strong>{activeDossier.release?.releaseDate || '—'}</strong></span>
                    <span>Duration: <strong>{activeDossier.durationFormatted || '—'}</strong></span>
                  </div>
                </div>
              </div>

              {/* MBIDs & Canonical Links */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">MusicBrainz Identifiers</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Recording MBID</span>
                    {activeDossier.recordingMbid ? (
                      <a
                        href={`https://musicbrainz.org/recording/${activeDossier.recordingMbid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline font-mono truncate block"
                      >
                        {activeDossier.recordingMbid}
                      </a>
                    ) : (
                      <span className="text-slate-600">Uncataloged</span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Artist MBID</span>
                    {activeDossier.artist?.artistMbid ? (
                      <a
                        href={`https://musicbrainz.org/artist/${activeDossier.artist.artistMbid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline font-mono truncate block"
                      >
                        {activeDossier.artist.artistMbid}
                      </a>
                    ) : (
                      <span className="text-slate-600">Uncataloged</span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Release MBID</span>
                    {activeDossier.release?.releaseMbid ? (
                      <a
                        href={`https://musicbrainz.org/release/${activeDossier.release.releaseMbid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline font-mono truncate block"
                      >
                        {activeDossier.release.releaseMbid}
                      </a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">ISRC</span>
                    <span className="font-mono text-slate-300">
                      {(activeDossier.isrcs || []).join(', ') || 'None attached'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Songwriting & Production Credits */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Work & Songwriting Credits</h4>
                  {(!activeDossier.work || (activeDossier.work.composers.length === 0 && activeDossier.work.lyricists.length === 0)) && (
                    <button
                      onClick={handleResolveDossierCredits}
                      disabled={isResolvingCredits}
                      className="px-2 py-1 bg-purple-950 hover:bg-purple-900 border border-purple-700/60 text-purple-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition"
                      title="Resolve songwriters using Gemini AI"
                    >
                      <Sparkles className={`w-3 h-3 ${isResolvingCredits ? 'animate-spin' : ''}`} />
                      <span>{isResolvingCredits ? 'Resolving...' : '✨ AI Resolve Credits'}</span>
                    </button>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Composers / Writers</span>
                    <p className="text-slate-200">
                      {(activeDossier.work?.composers || []).map(c => c.name).join(', ') || 'No composer registered'}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Lyricists</span>
                    <p className="text-slate-200">
                      {(activeDossier.work?.lyricists || []).map(l => l.name).join(', ') || 'No lyricist registered'}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Lyrics Languages (ISO 639-3)</span>
                    <p className="text-cyan-300 font-mono">
                      {(activeDossier.work?.lyricsLanguages || []).join(', ') || 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Artist Biography & Cultural Origin */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Artist Cultural Dossier</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Begin Area (Birth City / Formation)</span>
                    <span className="text-slate-200 font-medium">{activeDossier.artist?.beginArea || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Primary Country</span>
                    <span className="text-slate-200 font-medium">
                      {activeDossier.artist?.countryName || activeDossier.artist?.countryCode || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Artist Type & Gender</span>
                    <span className="text-slate-200">{activeDossier.artist?.type || 'Person'} {activeDossier.artist?.gender ? `(${activeDossier.artist.gender})` : ''}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Active Span</span>
                    <span className="text-slate-200 font-mono">
                      {activeDossier.artist?.birthDate || '—'} to {activeDossier.artist?.deathDate || (activeDossier.artist?.isActive ? 'Present' : 'Ended')}
                    </span>
                  </div>
                </div>

                {/* Native Script Aliases */}
                {activeDossier.artist?.aliases && activeDossier.artist.aliases.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] mb-1">Native Script Aliases</span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeDossier.artist.aliases.slice(0, 6).map((a, i) => (
                        <span key={i} className="bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px]">
                          {a.name} {a.locale ? `(${a.locale})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* External Music Streaming & Authority Links */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Streaming & Knowledge Graph Links</h4>
                <div className="flex flex-wrap gap-2">
                  {activeDossier.artist?.externalLinks?.spotifyUrl && (
                    <a
                      href={activeDossier.artist.externalLinks.spotifyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-emerald-900/60 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Spotify</span>
                    </a>
                  )}

                  {activeDossier.artist?.externalLinks?.appleMusicUrl && (
                    <a
                      href={activeDossier.artist.externalLinks.appleMusicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-rose-950/40 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-rose-900/60 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Apple Music</span>
                    </a>
                  )}

                  {/* In-App 30s Audio Preview Play Button */}
                  <button
                    onClick={() => handlePlayTrackPreview(activeDossier)}
                    disabled={audioLoadingTrackId === activeDossier.id}
                    className="px-3 py-1.5 bg-gradient-to-r from-pink-950/60 to-rose-950/60 hover:from-pink-900/80 hover:to-rose-900/80 border border-pink-500/40 text-pink-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow"
                    title="Play 30s Audio Preview directly in-app"
                  >
                    {audioLoadingTrackId === activeDossier.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-pink-400" />
                    ) : activeAudio?.trackId === activeDossier.id && isPlayingAudio ? (
                      <Pause className="w-3.5 h-3.5 text-pink-400" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-pink-400" />
                    )}
                    <span>
                      {activeAudio?.trackId === activeDossier.id && isPlayingAudio
                        ? 'Pause 30s Preview'
                        : 'Play 30s Preview (In-App)'}
                    </span>
                  </button>

                  {/* Direct In-Browser Preview Download */}
                  {activeDossier.artist?.externalLinks?.audioPreviewUrl && (
                    <button
                      onClick={() => handleDownloadAudioPreview(
                        activeDossier.artist!.externalLinks!.audioPreviewUrl!,
                        activeDossier.artist?.name || activeDossier.queryArtist,
                        activeDossier.title || activeDossier.queryTitle
                      )}
                      disabled={isDownloadingAudio}
                      className="px-3 py-1.5 bg-pink-950/40 hover:bg-pink-900/60 border border-pink-500/30 text-pink-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                      title="Download 30s audio preview (.m4a) locally to browser"
                    >
                      {isDownloadingAudio ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-pink-400" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-pink-400" />
                      )}
                      <span>Download .m4a</span>
                    </button>
                  )}

                  {/* Sanitize / Supplement Empty Art & Year */}
                  {((!activeDossier.release?.coverArtFullUrl && !activeDossier.release?.coverArtThumbUrl) ||
                    (!activeDossier.release?.originalReleaseYear && !activeDossier.release?.releaseDate)) && (
                    <button
                      onClick={() => handleSupplementSingleTrack(activeDossier)}
                      disabled={supplementingTrackId === activeDossier.id}
                      className="px-3 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                      title="Supplement missing cover artwork and release year from Apple iTunes"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${supplementingTrackId === activeDossier.id ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
                      <span>Sanitize Art & Year (iTunes)</span>
                    </button>
                  )}

                  {activeDossier.artist?.externalLinks?.wikidataUrl && (
                    <a
                      href={activeDossier.artist.externalLinks.wikidataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-blue-950/40 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-blue-900/60 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Wikidata ({activeDossier.artist.externalLinks.wikidataId})</span>
                    </a>
                  )}

                  {activeDossier.artist?.externalLinks?.discogsUrl && (
                    <a
                      href={activeDossier.artist.externalLinks.discogsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-slate-700 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Discogs</span>
                    </a>
                  )}

                  {activeDossier.artist?.externalLinks?.youtubeUrl && (
                    <a
                      href={activeDossier.artist.externalLinks.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-red-950/40 border border-red-500/30 text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-red-900/60 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>YouTube</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Manual Disambiguation Drawer */}
      {disambiguatingTrack && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm flex justify-end animate-fadeIn">
          <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-md z-10">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Manual Disambiguation</h2>
                  <p className="text-xs text-slate-400">
                    Live MusicBrainz search & 1-click candidate linking
                  </p>
                </div>
              </div>

              <button
                onClick={() => setDisambiguatingTrack(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              {/* Target song information */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Unresolved Track Query</span>
                <p className="text-sm font-bold text-white">
                  {disambiguatingTrack.queryArtist} — {disambiguatingTrack.queryTitle}
                </p>
                {disambiguatingTrack.queryPath && (
                  <p className="text-[11px] font-mono text-slate-500 truncate">
                    {disambiguatingTrack.queryPath}
                  </p>
                )}
              </div>

              {/* Live search input fields */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-300">Refine Search Terms</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Artist..."
                    value={disambiguateSearchQuery.artist}
                    onChange={e => setDisambiguateSearchQuery(p => ({ ...p, artist: e.target.value }))}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="text"
                    placeholder="Title..."
                    value={disambiguateSearchQuery.title}
                    onChange={e => setDisambiguateSearchQuery(p => ({ ...p, title: e.target.value }))}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  onClick={handlePerformCandidateSearch}
                  disabled={isSearchingCandidates}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition active:scale-95 disabled:opacity-50"
                >
                  {isSearchingCandidates ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Search MusicBrainz</span>
                </button>
              </div>

              {/* Candidate Matches List */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Candidate Recordings ({candidateMatches.length})
                  </span>
                  <button
                    onClick={() => handleSynthesizeAiFallback(disambiguatingTrack)}
                    className="text-xs text-purple-400 hover:underline flex items-center gap-1"
                    title="If track truly doesn't exist on MusicBrainz"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Synthesize AI Fallback</span>
                  </button>
                </div>

                {candidateMatches.length === 0 && !isSearchingCandidates && (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-950 rounded-xl border border-slate-800">
                    No recordings found matching these terms. Check for typos or click "Synthesize AI Fallback" if this is an uncataloged demo or bootleg.
                  </div>
                )}

                <div className="space-y-2.5">
                  {candidateMatches.map(cand => (
                    <div
                      key={cand.recordingMbid}
                      className="bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-cyan-500/50 transition flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            cand.score >= 80 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                            cand.score >= 60 ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {cand.score}% Match
                          </span>
                          <h4 className="text-xs font-bold text-white truncate max-w-xs">{cand.title}</h4>
                        </div>
                        <p className="text-xs text-slate-300">{cand.artist}</p>
                        <p className="text-[11px] text-slate-400">
                          Album: <span className="text-slate-200">{cand.album}</span> {cand.releaseDate ? `(${cand.releaseDate})` : ''}
                        </p>
                        {cand.duration && (
                          <span className="text-[10px] font-mono text-slate-500">Duration: {cand.duration}</span>
                        )}
                      </div>

                      <button
                        onClick={() => handleLinkCandidate(cand)}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center space-x-1 active:scale-95 flex-shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Link Match</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Preload Offline Dataset Modal */}
      {showPreloadModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <Database className="w-5 h-5 text-teal-400" />
                <h3 className="text-base font-bold text-white">Preload Dataset into IndexedDB</h3>
              </div>
              <button
                onClick={() => setShowPreloadModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Paste or choose a previously exported Playlist Haven database JSON backup.
              </p>
              <label className="px-2.5 py-1 bg-teal-950/60 hover:bg-teal-900 text-teal-300 border border-teal-700/60 rounded-lg text-xs font-bold cursor-pointer transition flex items-center space-x-1">
                <Upload className="w-3 h-3" />
                <span>Choose .json</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const text = await f.text();
                      setPreloadJsonText(text);
                    }
                  }}
                />
              </label>
            </div>

            <textarea
              rows={7}
              placeholder="Paste JSON array of tracks or Playlist Haven database backup..."
              value={preloadJsonText}
              onChange={e => setPreloadJsonText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
            />

            {preloadFeedback && (
              <p className={`text-xs font-mono ${preloadFeedback.includes('error') ? 'text-rose-400' : 'text-teal-300'}`}>
                {preloadFeedback}
              </p>
            )}

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowPreloadModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePreloadDataset}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
              >
                <HardDrive className="w-4 h-4" />
                <span>Import & Index</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Column Mapping & Ingestion Studio Modal */}
      {showColumnMappingModal && activeCsvDataset && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-fuchsia-500/40 rounded-3xl max-w-4xl w-full p-6 space-y-6 shadow-2xl animate-in fade-in duration-200 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-fuchsia-500/20 text-fuchsia-300 rounded-2xl border border-fuchsia-500/30">
                  <SlidersHorizontal className="w-6 h-6 text-fuchsia-400" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-black text-white">Dataset Column Mapping & Cleaning Studio</h3>
                    <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/70 px-2.5 py-0.5 rounded-full border border-cyan-800/60">
                      {activeCsvDataset.fileName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select which dataset columns map to track metadata and configure automated hygiene filters ({activeCsvDataset.rows.length.toLocaleString()} rows detected).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowColumnMappingModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Column Selectors Grid */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Map Dataset Columns to Metadata Fields</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* Title Col */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
                  <label className="block text-[11px] font-bold text-fuchsia-300 mb-1 flex items-center justify-between">
                    <span>🎵 Title Column *</span>
                    <span className="text-[9px] text-fuchsia-400 font-normal">Required</span>
                  </label>
                  <select
                    value={columnMapping.titleCol}
                    onChange={e => setColumnMapping(prev => ({ ...prev, titleCol: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl p-2 focus:border-fuchsia-500 focus:outline-none"
                  >
                    {activeCsvDataset.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Artist Col */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
                  <label className="block text-[11px] font-bold text-cyan-300 mb-1 flex items-center justify-between">
                    <span>🎤 Artist Column *</span>
                    <span className="text-[9px] text-cyan-400 font-normal">Required</span>
                  </label>
                  <select
                    value={columnMapping.artistCol}
                    onChange={e => setColumnMapping(prev => ({ ...prev, artistCol: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl p-2 focus:border-cyan-500 focus:outline-none"
                  >
                    {activeCsvDataset.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Album Col */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    💿 Album Column
                  </label>
                  <select
                    value={columnMapping.albumCol}
                    onChange={e => setColumnMapping(prev => ({ ...prev, albumCol: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl p-2 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="">(None / Skip)</option>
                    {activeCsvDataset.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Path Col */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    📁 File Path Column
                  </label>
                  <select
                    value={columnMapping.pathCol}
                    onChange={e => setColumnMapping(prev => ({ ...prev, pathCol: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl p-2 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="">(None / Skip)</option>
                    {activeCsvDataset.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Duration Col */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    ⏱️ Duration Column
                  </label>
                  <select
                    value={columnMapping.durationCol}
                    onChange={e => setColumnMapping(prev => ({ ...prev, durationCol: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl p-2 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="">(None / Skip)</option>
                    {activeCsvDataset.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Hygiene Filters */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Filter className="w-3.5 h-3.5 text-amber-400" />
                <span>Automated Hygiene & Filtering Rules</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-start space-x-2.5 p-2.5 bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={columnMapping.skipUnknownArtists}
                    onChange={e => setColumnMapping(prev => ({ ...prev, skipUnknownArtists: e.target.checked }))}
                    className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Skip &lt;unknown&gt; Artists</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Excludes untagged audio, sound recordings & phone notes.</span>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 p-2.5 bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={columnMapping.skipShortAudio}
                    onChange={e => setColumnMapping(prev => ({ ...prev, skipShortAudio: e.target.checked }))}
                    className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Skip Short Audio (&lt; 30s)</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Excludes brief voice notes, ringtones & notification sounds.</span>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 p-2.5 bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={columnMapping.cleanTopicSuffix}
                    onChange={e => setColumnMapping(prev => ({ ...prev, cleanTopicSuffix: e.target.checked }))}
                    className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Clean &quot; - Topic&quot; Suffixes</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Normalizes YouTube Topic channels (e.g. <code>JID - Topic</code> ➔ <code>JID</code>).</span>
                  </div>
                </label>
              </div>

              {/* Path Exclusions */}
              <div className="pt-1">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Exclude Files Containing Keywords in Path / Album (comma-separated):
                </label>
                <input
                  type="text"
                  placeholder="e.g. SoundRecorder, PhoneRecord, WhatsApp, Voice"
                  value={columnMapping.excludePathKeywords}
                  onChange={e => setColumnMapping(prev => ({ ...prev, excludePathKeywords: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Live Preview Table */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Live Mapping Preview (First {mappedDatasetResults.previewRows.length} Rows)</span>
                </h4>

                {/* Live Stats Badges */}
                <div className="flex items-center space-x-2 text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                    ✓ {mappedDatasetResults.validSongs.length.toLocaleString()} Ready to Enrich
                  </span>
                  {mappedDatasetResults.filteredCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      ⚠️ {mappedDatasetResults.filteredCount.toLocaleString()} Filtered Out
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950 max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 text-[11px] uppercase font-bold sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5 w-12 text-center">#</th>
                      <th className="p-2.5">Title</th>
                      <th className="p-2.5">Artist</th>
                      <th className="p-2.5">Album</th>
                      <th className="p-2.5">Path / Duration</th>
                      <th className="p-2.5 text-right">Ingestion Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {mappedDatasetResults.previewRows.map(row => (
                      <tr key={row.rowNum} className={row.status === 'valid' ? 'hover:bg-slate-900/50' : 'bg-slate-900/30 opacity-60'}>
                        <td className="p-2.5 text-slate-500 font-mono text-center">{row.rowNum}</td>
                        <td className="p-2.5 font-bold text-white max-w-[200px] truncate" title={row.cleanedTitle}>
                          {row.cleanedTitle || <span className="text-slate-600 italic">(empty)</span>}
                        </td>
                        <td className="p-2.5 text-slate-300 max-w-[180px] truncate" title={row.cleanedArtist}>
                          <span>{row.cleanedArtist || <span className="text-slate-600 italic">(empty)</span>}</span>
                          {row.rawArtist !== row.cleanedArtist && (
                            <span className="ml-1.5 text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1 py-0.5 rounded font-mono">
                              Cleaned
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-400 max-w-[140px] truncate" title={row.album}>
                          {row.album || '-'}
                        </td>
                        <td className="p-2.5 text-slate-400 font-mono text-[11px] max-w-[160px] truncate" title={row.path}>
                          {row.durationMs ? `${Math.round(row.durationMs / 1000)}s • ` : ''}
                          {row.path ? row.path.split(/[\\/]/).pop() : '-'}
                        </td>
                        <td className="p-2.5 text-right">
                          {row.status === 'valid' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                              ✓ Ready
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold" title={row.reason}>
                              ⚠️ {row.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => {
                  if (activeCsvDataset) {
                    setColumnMapping(detectBestColumns(activeCsvDataset.headers));
                  }
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Reset to Defaults
              </button>

              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={() => setShowColumnMappingModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyColumnMapping}
                  className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 text-white rounded-xl text-xs font-black tracking-wide uppercase flex items-center space-x-2 shadow-lg shadow-fuchsia-900/40 active:scale-95 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>🚀 Apply Column Mapping & Stage ({mappedDatasetResults.validSongs.length.toLocaleString()} Songs)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. AI Configuration & Provider Settings Modal */}
      {aiConfigModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span>AI Precision Search & Fallback Settings</span>
              </h3>
              <button
                onClick={() => {
                  setAiConfigModalOpen(false);
                  setAiTestStatus(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">Provider</label>
                <select
                  value={aiConfigForm.provider}
                  onChange={e => setAiConfigForm({ ...aiConfigForm, provider: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500 transition cursor-pointer"
                >
                  <option value="gemini">Google Gemini (Recommended • Fast & Free Quota)</option>
                  <option value="openai-compatible">OpenAI-Compatible (Ollama / LM Studio / Local)</option>
                </select>
              </div>

              {aiConfigForm.provider === 'gemini' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 font-semibold">Gemini API Key</label>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-purple-400 hover:text-purple-300 underline"
                    >
                      Get free key from Google AI Studio →
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder={hasAiKey ? '••••••••••••••••••••••••' : 'AIzaSy...'}
                      value={aiConfigForm.apiKey}
                      onChange={e => setAiConfigForm({ ...aiConfigForm, apiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 pl-8 focus:outline-none focus:border-purple-500 font-mono text-xs transition"
                    />
                    <Key className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Stored securely in your local browser storage. Powers canonical title cleaning and uncataloged song synthesis.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-slate-400 font-semibold mb-1 block">Base URL</label>
                    <input
                      type="text"
                      placeholder="http://localhost:11434/v1"
                      value={aiConfigForm.baseUrl}
                      onChange={e => setAiConfigForm({ ...aiConfigForm, baseUrl: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500 font-mono text-xs transition"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-semibold mb-1 block">API Key (Optional for Local)</label>
                    <input
                      type="password"
                      placeholder="Optional"
                      value={aiConfigForm.apiKey}
                      onChange={e => setAiConfigForm({ ...aiConfigForm, apiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500 font-mono text-xs transition"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-slate-400 font-semibold mb-1 block">Model Name</label>
                <input
                  type="text"
                  value={aiConfigForm.modelName}
                  onChange={e => setAiConfigForm({ ...aiConfigForm, modelName: e.target.value })}
                  placeholder={aiConfigForm.provider === 'gemini' ? 'gemini-2.0-flash' : 'llama3'}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500 font-mono text-xs transition"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {aiConfigForm.provider === 'gemini'
                    ? 'Default: gemini-2.0-flash (fast & accurate). Automatic failover: gemini-1.5-flash.'
                    : 'Your local model name (e.g. llama3, mistral, qwen2.5).'}
                </p>
              </div>

              {/* Test Status Feedback */}
              {aiTestStatus && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center space-x-2 border ${
                    aiTestStatus.testing
                      ? 'bg-purple-950/40 border-purple-800/60 text-purple-300'
                      : aiTestStatus.success
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  }`}
                >
                  {aiTestStatus.testing ? (
                    <RefreshCw className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />
                  ) : aiTestStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  )}
                  <span>{aiTestStatus.message}</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestAiConnection}
                disabled={aiTestStatus?.testing}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${aiTestStatus?.testing ? 'animate-spin' : ''}`} />
                <span>{aiTestStatus?.testing ? 'Testing...' : 'Test Connection'}</span>
              </button>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setAiConfigModalOpen(false);
                    setAiTestStatus(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAIConfig}
                  className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-950/40 active:scale-95 transition cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. High-Resolution Artwork Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl relative flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Header / Close */}
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="truncate pr-4">
                <h3 className="text-sm font-bold text-white truncate">{lightboxImage.title}</h3>
                <p className="text-xs text-slate-400 truncate">by {lightboxImage.artist}</p>
              </div>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* High-Res Image View */}
            <div className="w-full max-h-[65vh] flex items-center justify-center overflow-hidden rounded-xl bg-slate-950/80 border border-slate-800/60 p-2 shadow-inner">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-2xl transition duration-300"
                onError={e => {
                  // Fallback to front-500 if full resolution fails
                  if (!lightboxImage.url.includes('front-500') && lightboxImage.releaseMbid) {
                    (e.target as HTMLImageElement).src = `https://coverartarchive.org/release/${lightboxImage.releaseMbid}/front-500`;
                  }
                }}
              />
            </div>

            {/* Actions Bar */}
            <div className="w-full pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[11px] font-mono text-slate-500">
                Cover Art Archive (Direct High-Res JPG)
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadArtwork(lightboxImage.url, `${lightboxImage.artist} - ${lightboxImage.title}`)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>

                <a
                  href={lightboxImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Image</span>
                </a>

                {lightboxImage.releaseMbid && (
                  <a
                    href={`https://musicbrainz.org/release/${lightboxImage.releaseMbid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg font-semibold flex items-center gap-1.5 transition"
                  >
                    <span>MusicBrainz Release</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. Universal In-App 30s Audio Preview Player & In-Browser Downloader */}
      {/* Persistent Native Audio Engine (Always Mounted for Immediate Playback) */}
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setIsPlayingAudio(true)}
        onPause={() => setIsPlayingAudio(false)}
        onTimeUpdate={() => {
          if (audioRef.current) setAudioCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setAudioDuration(audioRef.current.duration || 30);
        }}
        onEnded={() => {
          setIsPlayingAudio(false);
          setAudioCurrentTime(0);
        }}
      />

      {activeAudio && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 shadow-2xl px-4 py-2.5 transition-all duration-300 animate-in slide-in-from-bottom">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            {/* Left: Track Info & Artwork */}
            <div className="flex items-center space-x-3 min-w-[200px] max-w-xs">
              <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                {activeAudio.coverArt ? (
                  <img src={activeAudio.coverArt} alt={activeAudio.title} className="w-full h-full object-cover" />
                ) : (
                  <Music2 className="w-5 h-5 text-pink-400" />
                )}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-white truncate" title={activeAudio.title}>
                  {activeAudio.title}
                </div>
                <div className="text-[11px] text-slate-400 truncate" title={activeAudio.artist}>
                  {activeAudio.artist}
                </div>
              </div>
            </div>

            {/* Center: Controls & Scrubber */}
            <div className="flex-1 max-w-xl flex flex-col items-center space-y-1">
              <div className="flex items-center space-x-4">
                {/* Play/Pause Button */}
                <button
                  onClick={togglePlayAudio}
                  className="p-2 rounded-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-900/40 active:scale-95 transition cursor-pointer"
                  title={isPlayingAudio ? 'Pause' : 'Play'}
                >
                  {isPlayingAudio ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white translate-x-0.5" />
                  )}
                </button>
              </div>

              {/* Progress Scrubber & Times */}
              <div className="w-full flex items-center space-x-2 text-[10px] font-mono text-slate-400">
                <span>{formatAudioTime(audioCurrentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 30}
                  step={0.1}
                  value={audioCurrentTime}
                  onChange={handleSeekAudio}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
                <span>{formatAudioTime(audioDuration || 30)}</span>
              </div>
            </div>

            {/* Right: Volume & In-Browser Download & Close */}
            <div className="flex items-center space-x-3">
              {/* Volume Controls */}
              <div className="hidden sm:flex items-center space-x-1.5">
                <button onClick={toggleMuteAudio} className="text-slate-400 hover:text-white transition cursor-pointer">
                  {isAudioMuted || audioVolume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isAudioMuted ? 0 : audioVolume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              {/* Direct In-Browser Download (.m4a) */}
              <button
                onClick={() => handleDownloadAudioPreview(activeAudio.url, activeAudio.artist, activeAudio.title)}
                disabled={isDownloadingAudio}
                className="px-3 py-1.5 bg-pink-950/60 hover:bg-pink-900/80 text-pink-300 border border-pink-700/60 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
                title="Download 30s Audio Preview (.m4a) directly into browser without external tabs"
              >
                {isDownloadingAudio ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-pink-400" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-pink-400" />
                )}
                <span>Download .m4a</span>
              </button>

              {/* Dismiss Player */}
              <button
                onClick={handleCloseAudio}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer"
                title="Dismiss audio player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
