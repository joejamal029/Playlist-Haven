import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, Globe, Languages, Sparkles, Filter, Search, Download, 
  Settings2, RefreshCw, XCircle, CheckCircle2, ChevronDown, ChevronRight, 
  Layers, Music2, Database, Upload, FileSpreadsheet, Archive, AlertCircle,
  FileCode, Play, StopCircle, Edit3, Trash2, HelpCircle, HardDrive,
  Compass, CheckSquare, Square, Plus, Check, ExternalLink, Zap
} from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { downloadPlaylistFile } from '../services/downloadHelper';
import { 
  CanonicalBucket, 
  CANONICAL_BUCKETS, 
  BUCKET_CONSOLIDATION_MAP,
  ArtistClassification, 
  ClusteredTrack, 
  ClassificationProgress,
  classifyPlaylistTracks,
  setManualOverride,
  getCachedClassification,
  setCachedClassification,
  detectScriptSignature,
  importArtistCSV,
  exportCacheJSON,
  importCacheJSON,
  getAllCachedEntries,
  resetCacheToDefault,
  saveClassificationCache,
  normalizeArtistKey,
  updateCachedEntry,
  deleteCachedEntry,
  batchUpdateCachedEntries,
  batchDeleteCachedEntries,
  addManualCacheEntry,
  remediateSingleArtistWithAI,
  reclassifyCachedEntriesWithAI,
  batchClassifyWithLLM,
  initClassificationCache
} from '../services/classificationEngine';
import { 
  getAllEnrichedTracks, 
  overwriteArtistCulturalBucketInDB, 
  overwriteDatabaseCulturalBucketsFromCache 
} from '../services/metadataDb';
import { resolveTrackCulturalBucket } from '../services/triageEngine';
import { getAIConfig, setAIConfig, AIConfig } from '../services/visionEngine';
import { cleanCompositeTrack } from '../services/playlistSanitizer';
import JSZip from 'jszip';

interface LanguageClusteringViewProps {
  onBack: () => void;
}

// Parse M3U / CSV / TXT input tracks
function parseRawPlaylistContent(rawContent: string, fileName: string): { title: string; artist: string; filePath?: string; rawPlayCount?: number; [key: string]: any }[] {
  const content = rawContent.replace(/^\ufeff/, ''); // Strip BOM
  const tracks: { title: string; artist: string; filePath?: string; rawPlayCount?: number; [key: string]: any }[] = [];
  const lowerName = fileName.toLowerCase();

  // Check if content looks like CSV/TSV
  const isLikelyCSV = lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || 
                      /^(?:"?[A-Za-z0-9_]+"?[,\t]){1,}[A-Za-z0-9_]+/m.test(content.slice(0, 500));

  if (isLikelyCSV) {
    const firstLine = content.split(/\r?\n/)[0] || '';
    const delimiter = lowerName.endsWith('.tsv') || (!firstLine.includes(',') && firstLine.includes('\t')) ? '\t' : ',';
    
    // Parse CSV rows safely
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
      const colArtistIdx = header.findIndex(h => h === 'colartist' || h === 'artist');
      const artistIdx = colArtistIdx !== -1 ? colArtistIdx : header.findIndex(h => h.includes('artist') || h === 'singer' || h === 'performer');
      const colTitleIdx = header.findIndex(h => h === 'coltitle' || h === 'title');
      const titleIdx = colTitleIdx !== -1 ? colTitleIdx : header.findIndex(h => h.includes('title') || h.includes('track') || h.includes('song') || h === 'name');
      const pathIdx = header.findIndex(h => h === 'collogpath' || h.includes('logpath') || h === 'colpath' || h.includes('path') || h.includes('file') || h.includes('url') || h.includes('location') || h === 'filepath');
      const playIdx = header.findIndex(h => h.includes('playcount') || h.includes('plays') || h === 'play_count');
      const bucketIdx = header.findIndex(h => h.includes('cultural') || h.includes('bucket') || h.includes('languagebucket') || h === 'genre');

      // If only artist column exists (e.g. an artist dump CSV like artists_and_genre.csv)
      if (artistIdx !== -1 && titleIdx === -1) {
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const artist = row[artistIdx] || '<unknown>';
          const rawBucket = bucketIdx !== -1 ? row[bucketIdx]?.trim() : '';
          if (rawBucket && artist && artist !== '<unknown>') {
            const canonical = (CANONICAL_BUCKETS[rawBucket as CanonicalBucket]?.name || BUCKET_CONSOLIDATION_MAP[rawBucket.toLowerCase()]) as CanonicalBucket;
            if (canonical) {
              setCachedClassification(artist, {
                artist,
                bucket: canonical,
                confidence: 'user',
                sourceDetails: 'Imported from CSV Cultural Bucket',
                timestamp: Date.now(),
              });
            }
          }
          if (artist && artist !== '<unknown>') {
            tracks.push({ title: `Track ${r}`, artist, originalRow: row });
          }
        }
        return tracks;
      }

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const rawArtist = artistIdx !== -1 && row[artistIdx] ? row[artistIdx] : '';
        const rawTitle = titleIdx !== -1 && row[titleIdx] ? row[titleIdx] : '';
        const filePath = pathIdx !== -1 ? row[pathIdx] : undefined;
        const rawPlayCount = playIdx !== -1 && !isNaN(parseInt(row[playIdx], 10)) ? parseInt(row[playIdx], 10) : undefined;
        const rawBucket = bucketIdx !== -1 ? row[bucketIdx]?.trim() : '';

        // Clean composite track (separates YouTube titles, strips video noise, CJK brackets, etc.)
        const cleaned = cleanCompositeTrack(rawTitle, rawArtist);
        let artist = cleaned.artist;
        let title = cleaned.title;

        // Pre-register bucket if already enriched from Module 15 or previous export
        if (rawBucket && artist && artist !== '<unknown>') {
          const canonical = (CANONICAL_BUCKETS[rawBucket as CanonicalBucket]?.name || BUCKET_CONSOLIDATION_MAP[rawBucket.toLowerCase()]) as CanonicalBucket;
          if (canonical) {
            setCachedClassification(artist, {
              artist,
              bucket: canonical,
              confidence: 'user',
              sourceDetails: 'Imported from CSV Cultural Bucket',
              timestamp: Date.now(),
            });
          }
        }

        // If artist or title is missing, try inferring from path
        if ((artist === '<unknown>' || title === '<unknown>') && filePath) {
          const fileBase = filePath.split(/[\/\\]/).pop()?.replace(/\.[a-zA-Z0-9]+$/, '') || '';
          const pathCleaned = cleanCompositeTrack(fileBase, artist !== '<unknown>' ? artist : '');
          if (artist === '<unknown>') artist = pathCleaned.artist;
          if (title === '<unknown>') title = pathCleaned.title;
        }

        if (artist !== '<unknown>' || title !== '<unknown>') {
          tracks.push({ title, artist, filePath, rawPlayCount, originalRow: row });
        }
      }
      return tracks;
    }
  }

  // M3U / M3U8 or TXT line-by-line format
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
    let artist = '<unknown>';
    const filePath = line;

    if (currentExtinf) {
      const bucketMatch = currentExtinf.match(/bucket="([^"]+)"/i);
      const commaIdx = currentExtinf.indexOf(',');
      if (commaIdx !== -1) {
        const info = currentExtinf.substring(commaIdx + 1).trim();
        const cleaned = cleanCompositeTrack(info);
        artist = cleaned.artist;
        title = cleaned.title;
      }

      // Check if tagged M3U8 has bucket attribute
      if (bucketMatch && artist && artist !== '<unknown>') {
        const rawBucket = bucketMatch[1].trim();
        const canonical = (CANONICAL_BUCKETS[rawBucket as CanonicalBucket]?.name || BUCKET_CONSOLIDATION_MAP[rawBucket.toLowerCase()]) as CanonicalBucket;
        if (canonical) {
          setCachedClassification(artist, {
            artist,
            bucket: canonical,
            confidence: 'user',
            sourceDetails: 'Imported from Tagged M3U8',
            timestamp: Date.now(),
          });
        }
      }
      currentExtinf = '';
    } else {
      // Parse from filename
      const fileBase = line.split(/[\/\\]/).pop()?.replace(/\.[a-zA-Z0-9]+$/, '') || '';
      if (fileBase.includes(' - ')) {
        const parts = fileBase.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else {
        title = fileBase || line;
      }
    }

    tracks.push({ title, artist, filePath });
  }

  return tracks;
}

export default function LanguageClusteringView({ onBack }: LanguageClusteringViewProps) {
  // Navigation & UI States
  const [files, setFiles] = useState<File[]>([]);
  const [parsedTracks, setParsedTracks] = useState<{ title: string; artist: string; [key: string]: any }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ClassificationProgress | null>(null);
  
  // Results
  const [clusteredTracks, setClusteredTracks] = useState<ClusteredTrack[]>([]);
  const [clusters, setClusters] = useState<Record<CanonicalBucket, ClusteredTrack[]>>({} as any);
  
  // View & Filtering Controls
  const [selectedBucketFilter, setSelectedBucketFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});
  
  // Waterfall Toggles
  const [enableMusicBrainz, setEnableMusicBrainz] = useState(true);
  const [enableLLM, setEnableLLM] = useState(true);

  // Modals
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showCacheModal, setShowCacheModal] = useState(false);
  const [showImportCsvModal, setShowImportCsvModal] = useState(false);
  const [editingTrack, setEditingTrack] = useState<ClusteredTrack | null>(null);

  // AI Configuration State
  const [aiConfigState, setAiConfigState] = useState<AIConfig>(getAIConfig());

  // Cache modal state & operability
  const [cacheList, setCacheList] = useState<ArtistClassification[]>([]);
  const [cacheSearch, setCacheSearch] = useState('');
  const [cacheSourceFilter, setCacheSourceFilter] = useState('ALL');
  const [cacheBucketFilter, setCacheBucketFilter] = useState<string>('ALL');
  const [cachePage, setCachePage] = useState<number>(1);
  const [cachePageSize, setCachePageSize] = useState<number>(50);
  const [selectedCacheKeys, setSelectedCacheKeys] = useState<Set<string>>(new Set());
  const [batchBucketTarget, setBatchBucketTarget] = useState<CanonicalBucket>('English');
  const [showAddArtistModal, setShowAddArtistModal] = useState<boolean>(false);
  const [newArtistName, setNewArtistName] = useState<string>('');
  const [newArtistBucket, setNewArtistBucket] = useState<CanonicalBucket>('English');
  const [newArtistCountry, setNewArtistCountry] = useState<string>('');
  const [newArtistNotes, setNewArtistNotes] = useState<string>('');
  const [editingCacheEntry, setEditingCacheEntry] = useState<ArtistClassification | null>(null);

  // AI Remediation & Workspace Toast State
  const [isAiRemediating, setIsAiRemediating] = useState<boolean>(false);
  const [isOverwritingDB, setIsOverwritingDB] = useState<boolean>(false);
  const [aiRemediationProgress, setAiRemediationProgress] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 4000);
  };

  // CSV Import State
  const [importCsvText, setImportCsvText] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null);

  // Abort Controller and Skip references
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipMusicBrainzRef = useRef(false);

  // Check if API key is present
  const hasApiKey = useMemo(() => {
    let key = aiConfigState.apiKey;
    if (!key) {
      try {
        // @ts-ignore
        key = import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.VITE_API_KEY || '';
      } catch (e) {}
    }
    return !!key || aiConfigState.provider === 'openai-compatible';
  }, [aiConfigState]);

  // Apply Superior Local Cache Instantly (Tier 0 & Script Detection & Heuristics)
  const applyDefaultCacheToTracks = (sourceTracks: any[], silent = false) => {
    if (!sourceTracks || sourceTracks.length === 0) return;

    // Force-clean cache to purge any poisoned 'Other' entries
    initClassificationCache(true);

    const newClustered: ClusteredTrack[] = [];
    const newClusters: Record<CanonicalBucket, ClusteredTrack[]> = {
      English: [], 'J-Pop': [], Naija: [], 'K-Pop': [], 'C-Pop': [],
      Thai: [], Vietnamese: [], Dutch: [], Arabic: [], German: [],
      Italian: [], Portuguese: [], Filipino: [], 'I-Pop': [], African: [],
      Latina: [], Français: [], Gospel: [], Instrumental: [], Other: []
    };

    let cacheCount = 0;
    let manualCount = 0;
    let unresolvedCount = 0;
    const uniqueArtists = new Set<string>();

    sourceTracks.forEach(t => {
      const rawArtist = t.artist || '';
      uniqueArtists.add(normalizeArtistKey(rawArtist));
      const cached = getCachedClassification(rawArtist);
      
      let classification: ArtistClassification;
      if (cached && cached.bucket && cached.bucket !== 'Other') {
        classification = cached;
        if (cached.confidence === 'manual') manualCount++;
        else cacheCount++;
      } else {
        const scriptSig = detectScriptSignature(rawArtist) || (t.title ? detectScriptSignature(t.title) : null);
        if (scriptSig && scriptSig.bucket && scriptSig.bucket !== 'Other') {
          classification = {
            artist: rawArtist,
            bucket: scriptSig.bucket,
            confidence: 'script',
            sourceDetails: `Script detection: ${scriptSig.scriptName}`,
            timestamp: Date.now(),
          };
          setCachedClassification(rawArtist, classification);
          cacheCount++;
        } else {
          // Heuristic patterns check for Gospel, Instrumental, Naija, Filipino, I-Pop, etc.
          const heuristic = resolveTrackCulturalBucket(rawArtist, t.title || '');
          if (heuristic && heuristic.bucket && heuristic.bucket !== 'Other' && heuristic.confidence !== 'default') {
            classification = {
              artist: rawArtist,
              bucket: heuristic.bucket,
              country: heuristic.country,
              confidence: 'heuristic',
              sourceDetails: heuristic.sourceDetails || 'Heuristic Signature',
              timestamp: Date.now(),
            };
            setCachedClassification(rawArtist, classification);
            cacheCount++;
          } else if (t.originalRow?.culturalBucket && t.originalRow.culturalBucket !== 'Other') {
            // Respect database record cultural bucket if valid and not Other
            classification = {
              artist: rawArtist,
              bucket: t.originalRow.culturalBucket,
              country: t.originalRow.artist?.countryCode,
              countryName: t.originalRow.artist?.countryName,
              confidence: 'user',
              sourceDetails: `Database Record: ${t.originalRow.resolution?.badgeLabel || 'Verified'}`,
              timestamp: Date.now(),
            };
            setCachedClassification(rawArtist, classification);
            cacheCount++;
          } else {
            classification = {
              artist: rawArtist,
              bucket: 'Other',
              confidence: 'unresolved',
              timestamp: Date.now(),
            };
            unresolvedCount++;
          }
        }
      }

      const ct: ClusteredTrack = {
        id: `${t.artist}:::${t.title}`,
        title: t.title,
        artist: t.artist,
        album: t.album,
        filePath: t.filePath,
        rawPlayCount: t.rawPlayCount,
        classification,
        originalData: t,
      };

      newClustered.push(ct);
      newClusters[classification.bucket].push(ct);
    });

    setClusteredTracks(newClustered);
    setClusters(newClusters);

    const initialExpanded: Record<string, boolean> = {};
    for (const [bucket, trks] of Object.entries(newClusters) as [CanonicalBucket, ClusteredTrack[]][]) {
      if (trks.length > 0) initialExpanded[bucket] = true;
    }
    setExpandedBuckets(initialExpanded);

    setProgress({
      totalTracks: sourceTracks.length,
      totalUniqueArtists: uniqueArtists.size,
      resolvedArtists: uniqueArtists.size - unresolvedCount,
      currentTier: 'Defaulted to Local Cache (0ms)',
      tierCounts: {
        user: cacheCount,
        script: 0,
        musicbrainz: 0,
        llm: 0,
        manual: manualCount,
        unresolved: unresolvedCount,
      },
      isCancelled: false,
      isProcessing: false,
    });

    if (!silent) {
      showToast(`⚡ Defaulted to Cache: ${cacheCount + manualCount}/${sourceTracks.length} tracks clustered from cache!`);
    }
    // Asynchronously synchronize IndexedDB with the superior cache
    overwriteDatabaseCulturalBucketsFromCache(getCachedClassification, newClustered).catch(console.warn);
  };

  // Overwrite Deep Metadata DB culturalBucket from superior Language Clustering Cache
  const handleOverwriteDBFromCache = async () => {
    setIsOverwritingDB(true);
    showToast('🗃 Overwriting database language fields from Language Clustering cache...');
    try {
      initClassificationCache(true); // Ensure all 'Other' entries are purged
      const result = await overwriteDatabaseCulturalBucketsFromCache(getCachedClassification, clusteredTracks);
      if (result.updatedCount > 0) {
        showToast(`🗃 Database Updated: ${result.updatedCount} track(s) updated across ${result.totalTracks} total database tracks using Language Clustering cache!`);
        // Re-read tracks into workspace to reflect the updated database
        handleApplyCacheToWorkspace();
      } else {
        showToast(`✅ All ${result.totalTracks} database tracks are already in sync with Language Clustering cache!`);
      }
    } catch (e: any) {
      console.error('Failed to overwrite DB from cache:', e);
      showToast(`❌ Database overwrite failed: ${e.message || 'Unknown error'}`);
    } finally {
      setIsOverwritingDB(false);
    }
  };

  // Load files when selected
  useEffect(() => {
    if (files.length === 0) {
      return;
    }

    const loadAllFiles = async () => {
      let allTracks: any[] = [];
      for (const file of files) {
        try {
          if (file && typeof file.text === 'function') {
            const text = await file.text();
            if (text && text.trim().length > 0) {
              const parsed = parseRawPlaylistContent(text, file.name);
              allTracks = allTracks.concat(parsed);
            }
          }
        } catch (e) {
          console.error('Failed to read playlist file:', file.name, e);
        }
      }
      if (allTracks.length > 0) {
        setParsedTracks(allTracks);
        // Auto-default to cache: instantly cluster all recognized tracks
        applyDefaultCacheToTracks(allTracks, false);
      }
    };

    loadAllFiles();
  }, [files]);

  // Execute High-Speed Classification
  const handleStartClustering = async () => {
    if (parsedTracks.length === 0) return;

    setIsProcessing(true);
    skipMusicBrainzRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await classifyPlaylistTracks(parsedTracks, {
        useMusicBrainz: enableMusicBrainz,
        useLLM: enableLLM,
        signal: controller.signal,
        shouldSkipMusicBrainz: () => skipMusicBrainzRef.current,
        onProgress: (p) => {
          setProgress(p);
        },
      });

      setClusteredTracks(result.clusteredTracks);
      setClusters(result.clusters);

      // Expand all non-empty buckets by default
      const initialExpanded: Record<string, boolean> = {};
      for (const [bucket, tracks] of Object.entries(result.clusters) as [CanonicalBucket, ClusteredTrack[]][]) {
        if (tracks.length > 0) initialExpanded[bucket] = true;
      }
      setExpandedBuckets(initialExpanded);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Clustering error:', e);
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel / Skip AI
  const handleCancelClustering = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Handle Manual Override
  const handleAssignBucket = (artist: string, newBucket: CanonicalBucket) => {
    const updated = setManualOverride(artist, newBucket);
    
    // Automatically overwrite culturalBucket in IndexedDB for this artist
    overwriteArtistCulturalBucketInDB(artist, newBucket).catch(err => {
      console.warn('Failed to sync manual override to IndexedDB:', err);
    });
    
    // Update local clustered tracks state
    setClusteredTracks(prev => prev.map(t => {
      if (t.artist.toLowerCase().trim() === artist.toLowerCase().trim()) {
        return { ...t, classification: updated };
      }
      return t;
    }));

    // Rebuild clusters map
    setClusters(prev => {
      const nextClusters: Record<CanonicalBucket, ClusteredTrack[]> = {
        'English': [], 'J-Pop': [], 'Naija': [], 'K-Pop': [], 'C-Pop': [],
        'Thai': [], 'Vietnamese': [], 'Dutch': [], 'Arabic': [],
        'German': [], 'Italian': [], 'Portuguese': [],
        'Filipino': [], 'I-Pop': [], 'African': [], 'Latina': [],
        'Français': [], 'Gospel': [], 'Instrumental': [], 'Other': []
      };

      clusteredTracks.forEach(t => {
        const cls = t.artist.toLowerCase().trim() === artist.toLowerCase().trim() ? updated : t.classification;
        nextClusters[cls.bucket].push({ ...t, classification: cls });
      });

      return nextClusters;
    });

    setEditingTrack(null);
  };

  // Filtered tracks for display
  const filteredClusters = useMemo(() => {
    const result: Record<string, ClusteredTrack[]> = {};
    const query = searchQuery.toLowerCase().trim();

    for (const [bucket, tracks] of Object.entries(clusters) as [CanonicalBucket, ClusteredTrack[]][]) {
      if (selectedBucketFilter !== 'ALL' && selectedBucketFilter !== bucket) {
        continue;
      }

      const matchingTracks = tracks.filter(t => {
        const matchesSearch = !query || 
          t.title.toLowerCase().includes(query) || 
          t.artist.toLowerCase().includes(query) ||
          (t.classification.countryName || '').toLowerCase().includes(query) ||
          (t.classification.country || '').toLowerCase().includes(query);

        const matchesSource = sourceFilter === 'ALL' || t.classification.confidence === sourceFilter;

        return matchesSearch && matchesSource;
      });

      if (matchingTracks.length > 0 || (selectedBucketFilter === bucket && tracks.length > 0)) {
        result[bucket] = matchingTracks;
      }
    }

    return result;
  }, [clusters, selectedBucketFilter, searchQuery, sourceFilter]);

  // Count tracks that are unresolved or ambiguous
  const unresolvedCount = useMemo(() => {
    return clusteredTracks.filter(t => 
      t.classification.confidence === 'unresolved' || 
      (t.classification.bucket === 'Other' && t.classification.confidence !== 'manual')
    ).length;
  }, [clusteredTracks]);

  // Filtered cache list for Cache Manager
  const filteredCache = useMemo(() => {
    const q = cacheSearch.toLowerCase().trim();
    return cacheList.filter(c => {
      const matchesQuery = !q || 
        c.artist.toLowerCase().includes(q) || 
        c.bucket.toLowerCase().includes(q) || 
        (c.countryName || '').toLowerCase().includes(q) || 
        (c.country || '').toLowerCase().includes(q) ||
        (c.sourceDetails || '').toLowerCase().includes(q);

      const matchesBucket = cacheBucketFilter === 'ALL' || c.bucket === cacheBucketFilter;
      const matchesSource = cacheSourceFilter === 'ALL' || c.confidence === cacheSourceFilter;

      return matchesQuery && matchesBucket && matchesSource;
    });
  }, [cacheList, cacheSearch, cacheBucketFilter, cacheSourceFilter]);

  const totalCachePages = Math.max(1, Math.ceil(filteredCache.length / (cachePageSize || 50)));
  const pagedCache = useMemo(() => {
    if (cachePageSize >= 10000) return filteredCache;
    const start = (cachePage - 1) * cachePageSize;
    return filteredCache.slice(start, start + cachePageSize);
  }, [filteredCache, cachePage, cachePageSize]);

  // Load directly from Module 15 IndexedDB with strict verification guard
  const handleLoadFromEnrichedDB = async (silent = false) => {
    try {
      const enriched = await getAllEnrichedTracks();
      // Strict guard: ensure only verified enriched tracks are accepted
      const verifiedTracks = enriched.filter(t => 
        t.resolution?.status !== 'needs_resolution' &&
        t.resolution?.status !== 'pending' &&
        (t.recordingMbid || t.resolution?.isAiSynthesized || t.resolution?.status === 'manual_resolved' || t.resolution?.status === 'itunes_enriched')
      );

      if (verifiedTracks.length === 0) {
        if (!silent) {
          alert('No verified enriched tracks found in local IndexedDB. Enrich tracks in Module 15 (Deep Metadata Engine) first!');
        }
        return;
      }

      const loadedTracks = verifiedTracks.map(t => {
        const artist = t.artist?.name || t.queryArtist || '<unknown>';
        const title = t.title || t.queryTitle || 'Untitled';
        const existing = getCachedClassification(artist);
        if (!existing && t.culturalBucket && t.culturalBucket !== 'Other' && t.resolution?.status !== 'needs_resolution') {
          const isAi = t.resolution?.source === 'ai_synthesized_fallback' || t.resolution?.isAiSynthesized;
          setCachedClassification(artist, {
            artist,
            bucket: t.culturalBucket,
            country: t.artist?.countryCode,
            countryName: t.artist?.countryName,
            confidence: isAi ? 'llm' : 'musicbrainz',
            sourceDetails: `IndexedDB: ${t.resolution?.badgeLabel || 'Enriched Record'}`,
            mbid: t.artist?.artistMbid,
            timestamp: Date.now(),
          });
        }
        return {
          title,
          artist,
          album: t.release?.albumTitle || t.queryAlbum || '',
          filePath: t.queryPath || '',
          rawPlayCount: undefined,
          originalRow: t,
        };
      });

      setParsedTracks(loadedTracks);
      applyDefaultCacheToTracks(loadedTracks, silent);
      if (!silent) {
        showToast(`📥 Ingested ${verifiedTracks.length} verified tracks from Module 15 IndexedDB!`);
      }
    } catch (e: any) {
      if (!silent) {
        alert(`Failed to load from IndexedDB: ${e.message}`);
      }
    }
  };


  // Synchronize active workspace tracks against the current cache
  const handleApplyCacheToWorkspace = () => {
    if (clusteredTracks.length === 0 && parsedTracks.length === 0) {
      showToast('No tracks loaded in workspace to apply cache to.');
      return;
    }

    const sourceTracks = parsedTracks.length > 0 
      ? parsedTracks 
      : clusteredTracks.map(t => ({
          title: t.title,
          artist: t.artist,
          album: t.album,
          filePath: t.filePath,
          rawPlayCount: t.rawPlayCount,
          originalData: t.originalData,
        }));

    applyDefaultCacheToTracks(sourceTracks, false);
  };

  // On-Demand AI Remediation for Unresolved / Ambiguous Tracks
  const handleRemediateUnresolvedWithAI = async () => {
    const unresolvedTracks = clusteredTracks.filter(t => 
      t.classification.confidence === 'unresolved' || 
      (t.classification.bucket === 'Other' && t.classification.confidence !== 'manual')
    );

    if (unresolvedTracks.length === 0) {
      showToast('All tracks are already classified! Zero unresolved tracks remaining.');
      return;
    }

    const uniqueArtists = Array.from(new Set(unresolvedTracks.map(t => t.artist))).filter(Boolean);
    setIsAiRemediating(true);
    setAiRemediationProgress(`Starting AI remediation for ${uniqueArtists.length} unique artists with Gemini 2.5 Flash...`);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const results = await batchClassifyWithLLM(
        uniqueArtists,
        controller.signal,
        (msg) => setAiRemediationProgress(msg)
      );

      let remediatedCount = 0;
      let nextTracks: ClusteredTrack[] = [];
      setClusteredTracks(prev => {
        const updated = prev.map(track => {
          const normKey = normalizeArtistKey(track.artist);
          if (results.has(normKey)) {
            remediatedCount++;
            return {
              ...track,
              classification: results.get(normKey)!,
            };
          }
          return track;
        });
        nextTracks = updated;

        const newClusters: Record<CanonicalBucket, ClusteredTrack[]> = {
          English: [], 'J-Pop': [], Naija: [], 'K-Pop': [], 'C-Pop': [],
          Thai: [], Vietnamese: [], Dutch: [], Arabic: [], German: [],
          Italian: [], Portuguese: [], Filipino: [], 'I-Pop': [], African: [],
          Latina: [], Français: [], Gospel: [], Instrumental: [], Other: []
        };
        updated.forEach(t => {
          newClusters[t.classification.bucket].push(t);
        });
        setClusters(newClusters);
        return updated;
      });

      setCacheList(getAllCachedEntries());
      // Automatically sync all newly remediated artists to IndexedDB
      overwriteDatabaseCulturalBucketsFromCache(getCachedClassification, nextTracks).catch(console.warn);
      showToast(`⚡ AI Remediation Complete! Reclassified ${remediatedCount} tracks (${results.size} artists) with Gemini 2.5 Flash.`);
    } catch (e: any) {
      console.error('AI Remediation error:', e);
      showToast(`AI Remediation failed: ${e.message || 'Unknown error'}`);
    } finally {
      setIsAiRemediating(false);
      setAiRemediationProgress('');
      abortControllerRef.current = null;
    }
  };

  // Single-Track AI Remediation
  const handleRemediateSingleTrackWithAI = async (track: ClusteredTrack) => {
    setIsAiRemediating(true);
    showToast(`✨ Remediating "${track.artist}" with Gemini 2.5 Flash...`);

    try {
      const result = await remediateSingleArtistWithAI(track.artist);
      if (result) {
        setClusteredTracks(prev => {
          const updated = prev.map(t => {
            if (normalizeArtistKey(t.artist) === normalizeArtistKey(track.artist)) {
              return { ...t, classification: result };
            }
            return t;
          });
          const newClusters: Record<CanonicalBucket, ClusteredTrack[]> = {
            English: [], 'J-Pop': [], Naija: [], 'K-Pop': [], 'C-Pop': [],
            Thai: [], Vietnamese: [], Dutch: [], Arabic: [], German: [],
            Italian: [], Portuguese: [], Filipino: [], 'I-Pop': [], African: [],
            Latina: [], Français: [], Gospel: [], Instrumental: [], Other: []
          };
          updated.forEach(t => {
            newClusters[t.classification.bucket].push(t);
          });
          setClusters(newClusters);
          return updated;
        });

        setCacheList(getAllCachedEntries());
        if (result.bucket && result.bucket !== 'Other') {
          overwriteArtistCulturalBucketInDB(result.artist || track.artist, result.bucket).catch(console.warn);
        }
        showToast(`✨ Reclassified "${track.artist}" to ${result.bucket}!`);
      } else {
        showToast(`AI could not reclassify "${track.artist}".`);
      }
    } catch (e: any) {
      showToast(`AI remediation failed: ${e.message}`);
    } finally {
      setIsAiRemediating(false);
    }
  };

  // Forward Propagation to Discovery Triage (Module 14)
  const handlePropagateToDiscoveryTriage = async () => {
    if (clusteredTracks.length === 0) {
      alert('No clustered tracks available to propagate. Run clustering first!');
      return;
    }

    // Ensure database records are 100% updated with superior cache classifications
    try {
      await overwriteDatabaseCulturalBucketsFromCache(getCachedClassification, clusteredTracks);
    } catch (e) {
      console.warn('Pre-propagation DB sync warning:', e);
    }

    const payload = clusteredTracks.map(t => ({
      title: t.title,
      artist: t.artist,
      album: t.album || 'Single / Clustered Intake',
      culturalBucket: t.classification.bucket,
      country: t.classification.country || t.classification.countryName,
      confidence: t.classification.confidence,
      sourceDetails: t.classification.sourceDetails,
      filePath: t.filePath,
      stagedAt: new Date().toISOString(),
    }));

    try {
      localStorage.setItem('playlist_haven_triage_intake', JSON.stringify(payload));
      showToast(`🧭 Staged ${payload.length} tracks with cultural provenance for Discovery Triage!`);
      alert(`Successfully propagated ${payload.length} clustered tracks to Discovery Triage!\n\nYou can now open the Discovery Triage module to review singles, magnet artists, validation ratios, and download baskets.`);
    } catch (e: any) {
      alert(`Failed to stage tracks for Discovery Triage: ${e.message}`);
    }
  };

  // Export Discovery Cohort CSV
  const handleExportDiscoveryCohortCSV = async () => {
    if (clusteredTracks.length === 0) return;
    const lines = ['"TITLE","ARTIST","ALBUM","CULTURAL_BUCKET","COUNTRY_CODE","COUNTRY_NAME","CONFIDENCE","SOURCE_DETAILS","FILE_PATH"'];
    for (const t of clusteredTracks) {
      const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
      lines.push([
        escape(t.title),
        escape(t.artist),
        escape(t.album || 'Single / Clustered Intake'),
        escape(t.classification.bucket),
        escape(t.classification.country || ''),
        escape(t.classification.countryName || ''),
        escape(t.classification.confidence),
        escape(t.classification.sourceDetails || ''),
        escape(t.filePath || '')
      ].join(','));
    }
    await downloadPlaylistFile('\ufeff' + lines.join('\n'), `Discovery_Cohort_Intake_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  };

  // Export a single bucket as M3U
  const handleExportBucketM3U = async (bucket: CanonicalBucket, tracks: ClusteredTrack[]) => {
    const lines = ['#EXTM3U'];
    for (const t of tracks) {
      lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`);
      lines.push(t.filePath || `${t.artist} - ${t.title}.mp3`);
    }
    await downloadPlaylistFile(lines.join('\n'), `${bucket}_Playlist.m3u`, 'audio/x-mpegurl');
  };

  // Export a single bucket as CSV
  const handleExportBucketCSV = async (bucket: CanonicalBucket, tracks: ClusteredTrack[]) => {
    const lines = ['"TITLE","ARTIST","BUCKET","COUNTRY","CONFIDENCE","SOURCE_DETAILS","FILE_PATH"'];
    for (const t of tracks) {
      const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
      lines.push([
        escape(t.title),
        escape(t.artist),
        escape(t.classification.bucket),
        escape(t.classification.countryName || t.classification.country || ''),
        escape(t.classification.confidence),
        escape(t.classification.sourceDetails || ''),
        escape(t.filePath || '')
      ].join(','));
    }
    await downloadPlaylistFile('\ufeff' + lines.join('\n'), `${bucket}_Tracks.csv`, 'text/csv;charset=utf-8;');
  };

  // Export All Clusters as ZIP bundle
  const handleExportAllZip = async () => {
    const zip = new JSZip();
    let fileCount = 0;

    for (const [bucket, tracks] of Object.entries(clusters) as [CanonicalBucket, ClusteredTrack[]][]) {
      if (tracks.length === 0) continue;
      const lines = ['#EXTM3U'];
      for (const t of tracks) {
        lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`);
        lines.push(t.filePath || `${t.artist} - ${t.title}.mp3`);
      }
      zip.file(`${bucket}.m3u`, lines.join('\n'));
      fileCount++;
    }

    if (fileCount === 0) {
      alert('No clustered tracks available to export.');
      return;
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    await downloadPlaylistFile(blob, `Language_Clustered_Playlists_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
  };

  // Export Enriched CSV with all language metadata
  const handleExportEnrichedCSV = async () => {
    if (clusteredTracks.length === 0) return;
    const lines = ['"TITLE","ARTIST","BUCKET","COUNTRY_CODE","COUNTRY_NAME","CONFIDENCE_TIER","SOURCE_DETAILS","FILE_PATH"'];
    for (const t of clusteredTracks) {
      const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
      lines.push([
        escape(t.title),
        escape(t.artist),
        escape(t.classification.bucket),
        escape(t.classification.country || ''),
        escape(t.classification.countryName || ''),
        escape(t.classification.confidence),
        escape(t.classification.sourceDetails || ''),
        escape(t.filePath || '')
      ].join(','));
    }
    await downloadPlaylistFile('\ufeff' + lines.join('\n'), `Enriched_Language_Library_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  };

  // Open cache manager
  const handleOpenCacheManager = () => {
    setCacheList(getAllCachedEntries());
    setCachePage(1);
    setSelectedCacheKeys(new Set());
    setShowCacheModal(true);
  };

  // Cache Selection Handlers
  const handleToggleCacheSelect = (key: string) => {
    setSelectedCacheKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllPage = () => {
    setSelectedCacheKeys(prev => {
      const next = new Set(prev);
      pagedCache.forEach(c => next.add(normalizeArtistKey(c.artist)));
      return next;
    });
  };

  const handleSelectAllMatching = () => {
    setSelectedCacheKeys(new Set(filteredCache.map(c => normalizeArtistKey(c.artist))));
  };

  const handleClearCacheSelection = () => {
    setSelectedCacheKeys(new Set());
  };

  // Batch Reassign Bucket
  const handleBatchReassignBucket = () => {
    if (selectedCacheKeys.size === 0) return;
    const keysArray = Array.from(selectedCacheKeys);
    const count = batchUpdateCachedEntries(keysArray, {
      bucket: batchBucketTarget,
      confidence: 'manual',
      sourceDetails: 'Batch manual reassignment',
    });
    setCacheList(getAllCachedEntries());
    setSelectedCacheKeys(new Set());

    // Synchronize to current clustered tracks view
    let nextClusteredTracks: ClusteredTrack[] = [];
    setClusteredTracks(prev => {
      if (prev.length === 0) return prev;
      const keySet = new Set(keysArray);
      const updated = prev.map(t => {
        if (keySet.has(normalizeArtistKey(t.artist))) {
          return {
            ...t,
            classification: {
              ...t.classification,
              bucket: batchBucketTarget,
              confidence: 'manual',
              sourceDetails: 'Batch manual reassignment'
            }
          };
        }
        return t;
      });
      nextClusteredTracks = updated;
      const nextClusters: Record<CanonicalBucket, ClusteredTrack[]> = {
        English: [], 'J-Pop': [], Naija: [], 'K-Pop': [], 'C-Pop': [],
        Thai: [], Vietnamese: [], Dutch: [], Arabic: [], German: [],
        Italian: [], Portuguese: [], Filipino: [], 'I-Pop': [], African: [],
        Latina: [], Français: [], Gospel: [], Instrumental: [], Other: []
      };
      updated.forEach(t => nextClusters[t.classification.bucket].push(t));
      setClusters(nextClusters);
      return updated;
    });

    // Immediately synchronize to IndexedDB with updated tracks
    overwriteDatabaseCulturalBucketsFromCache(getCachedClassification, nextClusteredTracks.length > 0 ? nextClusteredTracks : clusteredTracks).catch(console.warn);

    showToast(`Reassigned ${count} artists to "${batchBucketTarget}" (Synced to View & DB)!`);
  };

  // Batch Delete
  const handleBatchDelete = () => {
    if (selectedCacheKeys.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedCacheKeys.size} artist mappings from cache?`)) return;
    const count = batchDeleteCachedEntries(Array.from(selectedCacheKeys));
    setCacheList(getAllCachedEntries());
    setSelectedCacheKeys(new Set());
    showToast(`Deleted ${count} artist mappings from cache.`);
  };

  // Batch AI Reclassify
  const handleBatchReclassifyAI = async () => {
    if (selectedCacheKeys.size === 0) return;
    const keysArray = Array.from(selectedCacheKeys);
    setIsAiRemediating(true);
    setAiRemediationProgress(`Reclassifying ${keysArray.length} cached artists with Gemini 2.5 Flash...`);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const count = await reclassifyCachedEntriesWithAI(
        keysArray,
        controller.signal,
        (msg) => setAiRemediationProgress(msg)
      );

      setCacheList(getAllCachedEntries());
      setSelectedCacheKeys(new Set());
      // Immediately sync to IndexedDB
      overwriteDatabaseCulturalBucketsFromCache(getCachedClassification, clusteredTracks).catch(console.warn);
      showToast(`⚡ AI Reclassification complete: ${count} artists updated with Gemini 2.5 Flash (DB synced)!`);
    } catch (e: any) {
      showToast(`AI Reclassification error: ${e.message}`);
    } finally {
      setIsAiRemediating(false);
      setAiRemediationProgress('');
      abortControllerRef.current = null;
    }
  };

  // Batch Export Selected
  const handleExportSelectedCache = () => {
    if (selectedCacheKeys.size === 0) return;
    const selectedEntries = cacheList.filter(c => selectedCacheKeys.has(normalizeArtistKey(c.artist)));
    const json = JSON.stringify(selectedEntries, null, 2);
    downloadPlaylistFile(json, `selected_artist_cache_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  // Add New Manual Artist Mapping
  const handleSaveNewArtist = () => {
    if (!newArtistName.trim()) {
      alert('Artist name cannot be empty.');
      return;
    }
    addManualCacheEntry(newArtistName, newArtistBucket, newArtistCountry, newArtistNotes);
    setCacheList(getAllCachedEntries());
    // Immediately overwrite in IndexedDB
    overwriteArtistCulturalBucketInDB(newArtistName, newArtistBucket).catch(console.warn);
    setNewArtistName('');
    setNewArtistCountry('');
    setNewArtistNotes('');
    setShowAddArtistModal(false);
    showToast(`Added "${newArtistName}" to ${newArtistBucket} in cache & DB!`);
  };

  // Delete Single Cached Entry
  const handleDeleteSingleCache = (artist: string) => {
    if (confirm(`Remove "${artist}" from cache?`)) {
      deleteCachedEntry(artist);
      setCacheList(getAllCachedEntries());
      showToast(`Removed "${artist}" from cache.`);
    }
  };

  // Inline Bucket Change for Single Entry
  const handleInlineBucketChange = (artist: string, bucket: CanonicalBucket) => {
    updateCachedEntry(artist, {
      bucket,
      confidence: 'manual',
      sourceDetails: 'Manual cache edit',
    });
    setCacheList(getAllCachedEntries());
    // Immediately overwrite in IndexedDB
    overwriteArtistCulturalBucketInDB(artist, bucket).catch(console.warn);

    // Synchronize to current clustered tracks view
    setClusteredTracks(prev => {
      if (prev.length === 0) return prev;
      const targetKey = normalizeArtistKey(artist);
      const updated = prev.map(t => {
        if (normalizeArtistKey(t.artist) === targetKey) {
          return {
            ...t,
            classification: {
              ...t.classification,
              bucket,
              confidence: 'manual',
              sourceDetails: 'Manual cache edit'
            }
          };
        }
        return t;
      });
      const nextClusters: Record<CanonicalBucket, ClusteredTrack[]> = {
        English: [], 'J-Pop': [], Naija: [], 'K-Pop': [], 'C-Pop': [],
        Thai: [], Vietnamese: [], Dutch: [], Arabic: [], German: [],
        Italian: [], Portuguese: [], Filipino: [], 'I-Pop': [], African: [],
        Latina: [], Français: [], Gospel: [], Instrumental: [], Other: []
      };
      updated.forEach(t => nextClusters[t.classification.bucket].push(t));
      setClusters(nextClusters);
      return updated;
    });

    showToast(`Updated "${artist}" → ${bucket} (Synced to View & DB)`);
  };

  // Handle CSV Import
  const handleExecuteImportCsv = () => {
    if (!importCsvText.trim()) return;
    const res = importArtistCSV(importCsvText);
    setImportResult(res);
    setCacheList(getAllCachedEntries());
    // Synchronize to IndexedDB
    overwriteDatabaseCulturalBucketsFromCache(getCachedClassification, clusteredTracks).catch(console.warn);
    showToast(`Imported ${res.imported} mappings to cache & synced to DB.`);
  };

  const getSourceBadge = (conf: string) => {
    switch (conf) {
      case 'user':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">User Cache (Tier 0)</span>;
      case 'script':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Script Signature (Tier 1)</span>;
      case 'musicbrainz':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">MusicBrainz (Tier 2)</span>;
      case 'llm':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">Gemini AI (Tier 3)</span>;
      case 'manual':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">Manual Override (Tier 4)</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/30">Unresolved</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 border border-cyan-500/50 text-slate-100 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <span className="text-cyan-400 font-bold">⚡</span>
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-500 hover:text-white ml-2 cursor-pointer">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Autonomous AI Remediation Progress Banner */}
      {isAiRemediating && (
        <div className="max-w-7xl mx-auto mb-6 bg-purple-950/40 border border-purple-800/60 rounded-2xl p-4 flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-purple-400 animate-spin" />
            <div>
              <div className="text-xs font-bold text-purple-200">Gemini 2.5 Flash Autonomous Remediation Active</div>
              <div className="text-[11px] text-purple-300/80 font-mono">{aiRemediationProgress || 'Contacting Gemini 2.5 Flash API...'}</div>
            </div>
          </div>
          <button
            onClick={() => {
              if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
              }
              setIsAiRemediating(false);
              setAiRemediationProgress('');
            }}
            className="px-3 py-1.5 bg-purple-900/60 hover:bg-purple-800 border border-purple-700/60 text-purple-200 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Stop AI
          </button>
        </div>
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition flex items-center gap-2 text-slate-300 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-xl">
                  <Globe className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                    Language & Nationality Clustering
                  </h1>
                  <p className="text-xs md:text-sm text-slate-400">
                    High-speed multi-tiered classification engine grouping tracks by artist language & nationality
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowImportCsvModal(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/70 rounded-xl text-xs font-semibold flex items-center gap-2 text-slate-200 transition"
              title="Import or seed custom artist genre CSV"
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Import Dataset</span>
            </button>

            <button
              onClick={handleOpenCacheManager}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/70 rounded-xl text-xs font-semibold flex items-center gap-2 text-slate-200 transition"
              title="Inspect and manage cached artist classifications"
            >
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Manage Cache</span>
            </button>

            <button
              onClick={handleOverwriteDBFromCache}
              disabled={isOverwritingDB}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-teal-500/50 hover:border-teal-400 rounded-xl text-xs font-semibold flex items-center gap-2 text-teal-300 hover:text-white transition cursor-pointer"
              title="Overwrite cultural / language fields in Deep Metadata database (IndexedDB) using the superior Language Clustering cache"
            >
              <Database className={`w-4 h-4 text-teal-400 ${isOverwritingDB ? 'animate-spin' : ''}`} />
              <span>Overwrite DB from Cache</span>
            </button>

            <button
              onClick={() => setShowConfigModal(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/70 rounded-xl text-xs font-semibold flex items-center gap-2 text-slate-200 transition"
              title="Configure Gemini API Key & Model"
            >
              <Settings2 className="w-4 h-4 text-purple-400" />
              <span>AI Settings</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Upload & Control Panel */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5">
                <span className="text-xs font-semibold text-slate-300">Playlist Files & Library Intake:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOverwriteDBFromCache}
                    disabled={isOverwritingDB}
                    className="px-3 py-1.5 bg-teal-950/60 hover:bg-teal-900/60 text-teal-300 hover:text-white border border-teal-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm cursor-pointer"
                    title="Overwrite language/culturalBucket field across all records in IndexedDB with this superior cache"
                  >
                    <Database className={`w-3.5 h-3.5 text-teal-400 ${isOverwritingDB ? 'animate-spin' : ''}`} />
                    <span>🗃 Overwrite DB Language from Cache</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadFromEnrichedDB(false)}
                    className="px-3 py-1.5 bg-gradient-to-r from-teal-600/30 to-cyan-600/30 hover:from-teal-600 hover:to-cyan-600 text-teal-300 hover:text-white border border-teal-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm cursor-pointer"
                    title="Directly load enriched tracks from Module 15 (IndexedDB) with 0ms pre-assigned cultural buckets"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-teal-400" />
                    <span>📥 Ingest from Module 15 (IndexedDB)</span>
                  </button>
                </div>
              </div>

              <FileUploader
                files={files}
                onFilesSelected={(newFiles) => {
                  setFiles(prev => [...prev, ...newFiles]);
                }}
                onClear={() => {
                  setFiles([]);
                  setParsedTracks([]);
                  setClusteredTracks([]);
                  setClusters({} as any);
                  setProgress(null);
                }}
                accept=".m3u,.m3u8,.csv,.tsv,.txt"
                multiple={true}
                label="Select or Drop Playlist Files (M3U, CSV, TSV, TXT)"
                colorClass="cyan"
              />

              {/* Ingested Tracks Quick Preview */}
              {parsedTracks.length > 0 && (
                <div className="p-3.5 bg-slate-950/80 border border-cyan-500/30 rounded-xl space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold text-white">
                        {parsedTracks.length.toLocaleString()} tracks loaded
                      </span>
                      <span className="text-slate-400">
                        ({new Set(parsedTracks.map(t => (t.artist || '').toLowerCase().trim())).size.toLocaleString()} unique artists across {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''}` : 'Database Library'})
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
                      Ready to Cluster
                    </span>
                  </div>

                  {/* 3 sample rows */}
                  <div className="divide-y divide-slate-800/60 text-[11px] text-slate-400 pt-1">
                    {parsedTracks.slice(0, 3).map((t, idx) => (
                      <div key={idx} className="py-1 flex items-center justify-between gap-2">
                        <span className="text-slate-200 font-medium truncate flex-1">{t.title}</span>
                        <span className="text-cyan-400 font-semibold truncate max-w-xs">{t.artist}</span>
                      </div>
                    ))}
                    {parsedTracks.length > 3 && (
                      <div className="pt-1 text-[10px] text-slate-500 italic">
                        + {(parsedTracks.length - 3).toLocaleString()} more tracks...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Classification Tiers</span>
                <span className="text-xs text-emerald-400 font-mono">Tier 0 (1,341 Seeded)</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">Tier 2: MusicBrainz API (1 req/s)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableMusicBrainz}
                    onChange={(e) => setEnableMusicBrainz(e.target.checked)}
                    disabled={isProcessing}
                    className="rounded border-slate-700 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                  <div className="flex flex-col">
                    <span className="text-slate-300">Tier 3: Gemini AI Fallback</span>
                    <span className="text-[10px] mt-0.5">
                      {hasApiKey ? (
                        <span className="text-emerald-400 font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {aiConfigState.modelName || 'gemini-2.5-flash'}
                        </span>
                      ) : (
                        <span 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowConfigModal(true); }}
                          className="text-amber-400 font-mono hover:underline cursor-pointer"
                        >
                          ⚠️ Key needed (Click to configure)
                        </span>
                      )}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableLLM}
                    onChange={(e) => setEnableLLM(e.target.checked)}
                    disabled={isProcessing}
                    className="rounded border-slate-700 text-purple-500 focus:ring-0 cursor-pointer"
                  />
                </label>
              </div>

              <div className="pt-2 space-y-2">
                {!isProcessing ? (
                  <>
                    <button
                      onClick={() => applyDefaultCacheToTracks(parsedTracks, false)}
                      disabled={parsedTracks.length === 0}
                      className="w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-white border border-emerald-500/40 font-bold rounded-xl shadow-lg shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition cursor-pointer"
                      title="Default instantly to the superior local cache without making any online network calls"
                    >
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <span>⚡ Default to Cache ({parsedTracks.length} tracks)</span>
                    </button>
                    <button
                      onClick={handleStartClustering}
                      disabled={parsedTracks.length === 0}
                      className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Run Intelligent Clustering (MusicBrainz & AI)</span>
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={handleCancelClustering}
                      className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <StopCircle className="w-4 h-4" />
                      <span>Stop / Use Current Results</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Real-time Progress Bar */}
          {progress && (
            <div className="mt-6 pt-6 border-t border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2">
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="font-semibold text-slate-200">
                    {isProcessing ? (progress.currentTier || 'Processing...') : 'Clustering Complete'}
                  </span>
                  {progress.currentArtist && (
                    <span className="text-slate-400 truncate max-w-xs">({progress.currentArtist})</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {isProcessing && enableLLM && progress.currentTier?.includes('MusicBrainz') && (
                    <button
                      type="button"
                      onClick={() => { skipMusicBrainzRef.current = true; }}
                      className="px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                      title="Instantly skip the 1 req/s MusicBrainz queue and batch-classify all remaining artists with Gemini AI"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
                      <span>⚡ Skip to AI (Fast)</span>
                    </button>
                  )}
                  <div className="text-slate-400">
                    Artists resolved: <span className="text-white font-bold">{progress.resolvedArtists}</span> / {progress.totalUniqueArtists}
                  </div>
                </div>
              </div>

              {/* Multi-tier progress bar */}
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div 
                  className="bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(progress.tierCounts.user / progress.totalUniqueArtists) * 100}%` }}
                  title={`Cache: ${progress.tierCounts.user}`}
                />
                <div 
                  className="bg-cyan-400 transition-all duration-300"
                  style={{ width: `${(progress.tierCounts.script / progress.totalUniqueArtists) * 100}%` }}
                  title={`Script: ${progress.tierCounts.script}`}
                />
                <div 
                  className="bg-blue-500 transition-all duration-300"
                  style={{ width: `${(progress.tierCounts.musicbrainz / progress.totalUniqueArtists) * 100}%` }}
                  title={`MusicBrainz: ${progress.tierCounts.musicbrainz}`}
                />
                <div 
                  className="bg-purple-500 transition-all duration-300"
                  style={{ width: `${(progress.tierCounts.llm / progress.totalUniqueArtists) * 100}%` }}
                  title={`AI: ${progress.tierCounts.llm}`}
                />
                <div 
                  className="bg-amber-500 transition-all duration-300"
                  style={{ width: `${(progress.tierCounts.manual / progress.totalUniqueArtists) * 100}%` }}
                  title={`Manual: ${progress.tierCounts.manual}`}
                />
              </div>

              {/* Legend & Tier Counts */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  <span>Cache ({progress.tierCounts.user})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                  <span>Script ({progress.tierCounts.script})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  <span>MusicBrainz ({progress.tierCounts.musicbrainz})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                  <span>AI ({progress.tierCounts.llm})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  <span>Manual ({progress.tierCounts.manual})</span>
                </span>
                {progress.tierCounts.unresolved > 0 && (
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
                    <span>Unresolved ({progress.tierCounts.unresolved})</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Results Area */}
        {clusteredTracks.length > 0 && (
          <div className="space-y-6">
            {/* Global Export & Batch Actions Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Clustered Library ({clusteredTracks.length} Tracks)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Distributed across {Object.keys(clusters).filter(k => clusters[k as CanonicalBucket]?.length > 0).length} language & nationality groups
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* AI Remediate Button */}
                <button
                  onClick={handleRemediateUnresolvedWithAI}
                  disabled={isAiRemediating || unresolvedCount === 0}
                  className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-purple-900/20 transition cursor-pointer"
                  title="Autonomous multi-tier remediation for unresolved or ambiguous tracks using Gemini 2.5 Flash"
                >
                  <Sparkles className={`w-4 h-4 text-purple-200 ${isAiRemediating ? 'animate-spin' : ''}`} />
                  <span>⚡ AI Remediate Unresolved</span>
                  {unresolvedCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-purple-900/80 text-purple-200 text-[10px] font-mono font-bold">
                      {unresolvedCount}
                    </span>
                  )}
                </button>

                {/* Propagate to Discovery Triage */}
                <button
                  onClick={handlePropagateToDiscoveryTriage}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-900/20 transition cursor-pointer"
                  title="Stage this clustered cohort into Discovery Triage (Module 14)"
                >
                  <Compass className="w-4 h-4 text-amber-200" />
                  <span>🧭 Propagate to Discovery Triage</span>
                </button>

                {/* Export Discovery Cohort CSV */}
                <button
                  onClick={handleExportDiscoveryCohortCSV}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Export Discovery Cohort CSV with cultural provenance"
                >
                  <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                  <span>Export Cohort CSV</span>
                </button>

                {/* Re-sync with Cache */}
                <button
                  onClick={handleApplyCacheToWorkspace}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Re-sync current workspace tracks against latest persistent cache"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Re-sync Cache</span>
                </button>

                {/* Overwrite DB Language from Cache */}
                <button
                  onClick={handleOverwriteDBFromCache}
                  disabled={isOverwritingDB}
                  className="px-3 py-2 bg-teal-950/80 hover:bg-teal-900/80 text-teal-300 hover:text-white border border-teal-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="Overwrite culturalBucket in IndexedDB database using the superior Language Clustering cache"
                >
                  <Database className={`w-3.5 h-3.5 text-teal-400 ${isOverwritingDB ? 'animate-spin' : ''}`} />
                  <span>Overwrite DB from Cache</span>
                </button>

                {/* Export All as ZIP */}
                <button
                  onClick={handleExportAllZip}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                  <span>Export All as ZIP (Separate Playlists)</span>
                </button>

                {/* Export Enriched CSV */}
                <button
                  onClick={handleExportEnrichedCSV}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Export Enriched CSV</span>
                </button>
              </div>
            </div>

            {/* Filter & Bucket Pill Tabs */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                <button
                  onClick={() => setSelectedBucketFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    selectedBucketFilter === 'ALL'
                      ? 'bg-white text-slate-950 shadow-md'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <span>All Tracks</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${selectedBucketFilter === 'ALL' ? 'bg-slate-200 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                    {clusteredTracks.length}
                  </span>
                </button>

                {Object.entries(CANONICAL_BUCKETS).map(([key, meta]) => {
                  const count = clusters[key as CanonicalBucket]?.length || 0;
                  if (count === 0 && selectedBucketFilter !== key) return null;
                  const isSelected = selectedBucketFilter === key;

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedBucketFilter(key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                        isSelected
                          ? `${meta.badgeBg} border-current shadow-md`
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      <span>{key}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800/80 text-slate-300">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search & Source Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search titles, artists, or countries..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-500 hover:text-white"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">Source:</span>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">All Sources</option>
                    <option value="user">User Cache (Tier 0)</option>
                    <option value="script">Script Signature (Tier 1)</option>
                    <option value="musicbrainz">MusicBrainz (Tier 2)</option>
                    <option value="llm">Gemini AI (Tier 3)</option>
                    <option value="manual">Manual Override (Tier 4)</option>
                    <option value="unresolved">Unresolved Only</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Clusters Accordion Grid */}
            <div className="space-y-4">
              {(Object.entries(filteredClusters) as [CanonicalBucket, ClusteredTrack[]][]).map(([bucketKey, tracks]) => {
                const meta = CANONICAL_BUCKETS[bucketKey] || CANONICAL_BUCKETS['Other'];
                const isExpanded = expandedBuckets[bucketKey] ?? true;
                const uniqueArtistsInBucket = new Set(tracks.map(t => t.artist.toLowerCase())).size;

                return (
                  <div 
                    key={bucketKey}
                    className={`bg-slate-900/60 border ${meta.borderClass} rounded-2xl overflow-hidden transition-all`}
                  >
                    {/* Bucket Header */}
                    <div 
                      onClick={() => setExpandedBuckets(p => ({ ...p, [bucketKey]: !isExpanded }))}
                      className="p-4 bg-slate-900/80 hover:bg-slate-850 cursor-pointer flex flex-wrap items-center justify-between gap-3 select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${meta.badgeBg}`}>
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className={`text-base font-bold ${meta.colorClass}`}>
                              {meta.displayName}
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-bold">
                              {tracks.length} tracks
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {uniqueArtistsInBucket} unique artists • {meta.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleExportBucketM3U(bucketKey as CanonicalBucket, tracks)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                          title="Export this bucket as an .m3u playlist"
                        >
                          <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                          <span>.m3u</span>
                        </button>

                        <button
                          onClick={() => handleExportBucketCSV(bucketKey as CanonicalBucket, tracks)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                          title="Export this bucket as a .csv spreadsheet"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                          <span>.csv</span>
                        </button>
                      </div>
                    </div>

                    {/* Bucket Content Table */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2.5 px-4 font-semibold">Track Title</th>
                              <th className="py-2.5 px-4 font-semibold">Artist</th>
                              <th className="py-2.5 px-4 font-semibold">Classification / Source</th>
                              <th className="py-2.5 px-4 font-semibold">Country / Origin</th>
                              <th className="py-2.5 px-4 font-semibold text-right">Reassign</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {tracks.map((track) => (
                              <tr key={track.id} className="hover:bg-slate-800/40 transition">
                                <td className="py-2.5 px-4 text-white font-medium max-w-xs truncate">
                                  {track.title}
                                </td>
                                <td className="py-2.5 px-4 text-slate-300 font-medium">
                                  {track.artist}
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-2">
                                    {getSourceBadge(track.classification.confidence)}
                                    {track.classification.sourceDetails && (
                                      <span className="text-[11px] text-slate-400 truncate max-w-[200px]" title={track.classification.sourceDetails}>
                                        {track.classification.sourceDetails}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-slate-300">
                                  {track.classification.countryName || track.classification.country || '—'}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleRemediateSingleTrackWithAI(track)}
                                      disabled={isAiRemediating}
                                      className="p-1.5 bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 hover:text-white rounded-lg border border-purple-700/50 transition disabled:opacity-40 cursor-pointer"
                                      title="AI Remediate this artist using Gemini 2.5 Flash"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setEditingTrack(track)}
                                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition cursor-pointer"
                                      title="Manually reassign artist to another bucket"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Manual Reassignment Modal */}
      {editingTrack && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Reassign Artist Group</h3>
              </div>
              <button
                onClick={() => setEditingTrack(null)}
                className="text-slate-500 hover:text-white p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-400">
                Artist: <span className="font-bold text-white">{editingTrack.artist}</span>
              </p>
              <p className="text-slate-400">
                Sample Track: <span className="text-slate-300">{editingTrack.title}</span>
              </p>
              <p className="text-slate-400">
                Current Bucket: <span className="font-bold text-cyan-400">{editingTrack.classification.bucket}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Select New Language / Nationality Bucket (Tier 4 Override):
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                {Object.entries(CANONICAL_BUCKETS).map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => handleAssignBucket(editingTrack.artist, key as CanonicalBucket)}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-left transition flex items-center justify-between ${
                      editingTrack.classification.bucket === key
                        ? `${meta.badgeBg} border-current`
                        : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>{key}</span>
                    {editingTrack.classification.bucket === key && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setEditingTrack(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operable Cache Manager Studio Modal */}
      {showCacheModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base">Operable Artist Classification Cache</h3>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-xs font-bold">
                      {cacheList.length} Verified Records
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Full CRUD studio: edit canonical buckets inline, execute batch actions, or trigger autonomous AI reclassification with Gemini 2.5 Flash
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCacheModal(false)}
                className="text-slate-500 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex-1 min-w-[220px] relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={cacheSearch}
                  onChange={(e) => { setCacheSearch(e.target.value); setCachePage(1); }}
                  placeholder="Search artist, bucket, or country..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                {cacheSearch && (
                  <button onClick={() => setCacheSearch('')} className="absolute right-2.5 top-2 text-slate-500 hover:text-white cursor-pointer">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Bucket Filter */}
                <select
                  value={cacheBucketFilter}
                  onChange={(e) => { setCacheBucketFilter(e.target.value); setCachePage(1); }}
                  className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="ALL">All Buckets ({cacheList.length})</option>
                  {Object.keys(CANONICAL_BUCKETS).map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                {/* Source Tier Filter */}
                <select
                  value={cacheSourceFilter}
                  onChange={(e) => { setCacheSourceFilter(e.target.value); setCachePage(1); }}
                  className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="ALL">All Tiers</option>
                  <option value="user">Tier 0 (Pre-seeded / User)</option>
                  <option value="script">Tier 1 (Script Regex)</option>
                  <option value="musicbrainz">Tier 2 (MusicBrainz)</option>
                  <option value="llm">Tier 3 (Gemini AI)</option>
                  <option value="manual">Tier 4 (Manual Override)</option>
                </select>

                {/* Page Size */}
                <select
                  value={cachePageSize}
                  onChange={(e) => { setCachePageSize(Number(e.target.value)); setCachePage(1); }}
                  className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="25">25 / page</option>
                  <option value="50">50 / page</option>
                  <option value="100">100 / page</option>
                  <option value="250">250 / page</option>
                  <option value="10000">View All</option>
                </select>

                <button
                  onClick={() => setShowAddArtistModal(true)}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Artist</span>
                </button>
              </div>
            </div>

            {/* Batch Action Toolbar (Appears when items are selected) */}
            {selectedCacheKeys.size > 0 && (
              <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in shrink-0">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-cyan-500 text-slate-950 font-black text-xs">
                    {selectedCacheKeys.size} Selected
                  </span>
                  <span className="text-xs text-cyan-200">Batch Operations:</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Batch Reassign Bucket */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={batchBucketTarget}
                      onChange={(e) => setBatchBucketTarget(e.target.value as CanonicalBucket)}
                      className="bg-slate-900 border border-cyan-500/50 text-xs text-cyan-200 rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
                    >
                      {Object.keys(CANONICAL_BUCKETS).map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleBatchReassignBucket}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                    >
                      Reassign
                    </button>
                  </div>

                  {/* Batch AI Reclassify */}
                  <button
                    onClick={handleBatchReclassifyAI}
                    disabled={isAiRemediating}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                    title="Batch reclassify selected artists with Gemini 2.5 Flash"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Reclassify (Gemini 2.5 Flash)</span>
                  </button>

                  {/* Export Selected */}
                  <button
                    onClick={handleExportSelectedCache}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Selected</span>
                  </button>

                  {/* Batch Delete */}
                  <button
                    onClick={handleBatchDelete}
                    className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>

                  {/* Clear Selection */}
                  <button
                    onClick={handleClearCacheSelection}
                    className="text-xs text-slate-400 hover:text-white underline ml-1 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Quick Select Helpers */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSelectAllPage}
                  className="hover:text-cyan-400 underline transition cursor-pointer"
                >
                  Select all on page ({pagedCache.length})
                </button>
                <button
                  onClick={handleSelectAllMatching}
                  className="hover:text-cyan-400 underline transition cursor-pointer"
                >
                  Select all matching filter ({filteredCache.length})
                </button>
              </div>
              <div>
                Showing {filteredCache.length === 0 ? 0 : (cachePage - 1) * cachePageSize + 1} - {Math.min(cachePage * cachePageSize, filteredCache.length)} of {filteredCache.length}
              </div>
            </div>

            {/* Cache table */}
            <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800 z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={pagedCache.length > 0 && pagedCache.every(c => selectedCacheKeys.has(normalizeArtistKey(c.artist)))}
                        onChange={(e) => {
                          if (e.target.checked) handleSelectAllPage();
                          else handleClearCacheSelection();
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-4 font-semibold">Artist</th>
                    <th className="py-2.5 px-4 font-semibold">Canonical Bucket (Editable)</th>
                    <th className="py-2.5 px-4 font-semibold">Confidence Tier</th>
                    <th className="py-2.5 px-4 font-semibold">Details / Origin</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {pagedCache.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 text-xs">
                        No cached artist records matching your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    pagedCache.map((item, idx) => {
                      const normKey = normalizeArtistKey(item.artist);
                      const isSelected = selectedCacheKeys.has(normKey);

                      return (
                        <tr key={normKey || idx} className={`hover:bg-slate-800/40 transition ${isSelected ? 'bg-cyan-950/20' : ''}`}>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleCacheSelect(normKey)}
                              className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-4 text-white font-medium max-w-[200px] truncate" title={item.artist}>
                            {item.artist}
                          </td>
                          <td className="py-2.5 px-4">
                            <select
                              value={item.bucket}
                              onChange={(e) => handleInlineBucketChange(item.artist, e.target.value as CanonicalBucket)}
                              className="bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
                            >
                              {Object.keys(CANONICAL_BUCKETS).map(b => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-4">
                            {getSourceBadge(item.confidence)}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400 truncate max-w-xs text-[11px]" title={item.sourceDetails || item.countryName || item.country || ''}>
                            {item.sourceDetails || item.countryName || item.country || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteSingleCache(item.artist)}
                              className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg border border-slate-700 hover:border-rose-700 transition cursor-pointer"
                              title="Delete from cache"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls & Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 shrink-0 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCachePage(prev => Math.max(1, prev - 1))}
                  disabled={cachePage <= 1}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-400">
                  Page <span className="text-white font-bold">{cachePage}</span> of <span className="text-white font-bold">{totalCachePages}</span>
                </span>
                <button
                  onClick={() => setCachePage(prev => Math.min(totalCachePages, prev + 1))}
                  disabled={cachePage >= totalCachePages}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Next
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleApplyCacheToWorkspace}
                  className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Apply updated cache mappings directly into the active clustered workspace"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>⚡ Apply Cache to Workspace</span>
                </button>

                <button
                  onClick={() => {
                    const json = exportCacheJSON();
                    downloadPlaylistFile(json, `artist_language_cache_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export JSON</span>
                </button>

                <button
                  onClick={() => {
                    if (confirm('Reset cache to the pre-seeded default (1,341 verified artists)? All custom manual overrides will be cleared.')) {
                      resetCacheToDefault();
                      setCacheList(getAllCachedEntries());
                      showToast('Cache reset to 1,341 verified default mappings.');
                    }
                  }}
                  className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>

                <button
                  onClick={() => setShowCacheModal(false)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Manual Artist Modal */}
      {showAddArtistModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Plus className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Add Artist Mapping to Cache</h3>
              </div>
              <button
                onClick={() => setShowAddArtistModal(false)}
                className="text-slate-500 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold mb-1 block">Artist Name *</label>
                <input
                  type="text"
                  value={newArtistName}
                  onChange={(e) => setNewArtistName(e.target.value)}
                  placeholder="e.g. Hikaru Utada, Burna Boy, Bad Bunny..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold mb-1 block">Canonical Cultural Bucket *</label>
                <select
                  value={newArtistBucket}
                  onChange={(e) => setNewArtistBucket(e.target.value as CanonicalBucket)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
                >
                  {Object.keys(CANONICAL_BUCKETS).map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold mb-1 block">Country / Origin (Optional)</label>
                <input
                  type="text"
                  value={newArtistCountry}
                  onChange={(e) => setNewArtistCountry(e.target.value)}
                  placeholder="e.g. Japan, Nigeria, Brazil..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold mb-1 block">Curation Notes / Provenance (Optional)</label>
                <input
                  type="text"
                  value={newArtistNotes}
                  onChange={(e) => setNewArtistNotes(e.target.value)}
                  placeholder="e.g. Manual verified entry"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowAddArtistModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewArtist}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-900/20 cursor-pointer"
              >
                Save to Cache
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Dataset Modal */}
      {showImportCsvModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Upload className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Import Custom Artist Mapping Dataset</h3>
              </div>
              <button
                onClick={() => setShowImportCsvModal(false)}
                className="text-slate-500 hover:text-white p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Paste your CSV content with columns <code className="text-cyan-400">"COL_ARTIST","COL_GENRE"</code> or upload a CSV file to seed Tier 0 cache.
              </p>

              <div>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const text = await file.text();
                      setImportCsvText(text);
                    }
                  }}
                  className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <textarea
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                placeholder={`"COL_ARTIST","COL_GENRE"\n"Jay Chou","C-Pop"\n"BTS","K-Pop"\n"Burna Boy","Naija"`}
                rows={6}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />

              {importResult && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Successfully imported {importResult.imported} artist mappings into Tier 0 cache!</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowImportCsvModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Done
              </button>
              <button
                onClick={handleExecuteImportCsv}
                disabled={!importCsvText.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/20 disabled:opacity-50"
              >
                Import to Cache
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Configuration Settings Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Settings2 className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-base">Gemini AI Configuration</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-500 hover:text-white p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold mb-1 block">Gemini API Key (Google AI Studio)</label>
                <input
                  type="password"
                  value={aiConfigState.apiKey}
                  onChange={(e) => setAiConfigState(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-purple-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used for Tier 3 batch classification of uncached artists. Free tier is fully supported with automated rate-limit backoff.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-semibold block">Model Name</label>
                  <span className="text-[10px] text-purple-400 font-mono">Google Deepmind</span>
                </div>
                
                {/* Quick Model Pills */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-pro'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAiConfigState(p => ({ ...p, modelName: m }))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition ${
                        aiConfigState.modelName === m
                          ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {m} {m === 'gemini-2.5-flash' ? '★ Primary' : m === 'gemini-2.0-flash' ? '(Secondary)' : ''}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={aiConfigState.modelName}
                  onChange={(e) => setAiConfigState(p => ({ ...p, modelName: e.target.value }))}
                  placeholder="gemini-2.5-flash"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setAIConfig(aiConfigState);
                  setShowConfigModal(false);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-900/20"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
