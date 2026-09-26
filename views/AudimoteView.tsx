import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Activity,
  Flame,
  Smile,
  Disc,
  Zap,
  SlidersHorizontal,
  Play,
  Pause,
  Download,
  RefreshCw,
  Search,
  Filter,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  HelpCircle,
  Radio,
  Music,
  Compass,
  FileSpreadsheet,
  Layers,
  ChevronRight,
  Headphones,
  Sparkles,
  Copy,
  Check,
  Share2,
} from 'lucide-react';
import {
  AcousticProfile,
  AudimoteTrackItem,
  CAMELOT_KEY_MAP,
  getCamelotCode,
  isHarmonicallyCompatible,
  getAffectiveMood,
  calculateCalibratedValence,
  AFFECTIVE_DELTA,
  AffectiveMoodInfo,
  AffectiveMoodCategory,
  ClassicMoodQuadrant,
  CAMELOT_TO_KEY_MAP,
  CamelotKeyDetails,
  getHarmonicRelationship,
  getHarmonicCompatibleKeys,
} from '../services/acousticTypes';
import {
  analyzeTrack,
  analyzeTrackBatch,
  loadSavedAcousticTracks,
  AnalysisProgressEvent,
  ActiveTrackInfo,
  generateM3U,
  exportTracksToCSV,
  downloadFile,
  generateTuneMyMusicCSV,
  generateDownloaderTXT,
  generateTSV,
  generateSessionJSON,
  stageTracksToDiscoveryTriage,
  parseAcousticImportFile,
  parseAcousticImportText,
  detectImportFormat,
} from '../services/audimoteEngine';
import { useAudioPreview } from '../components/AudioPreviewContext';
import { initDB, clearEntireMetadataDB } from '../services/metadataDb';

interface AudimoteViewProps {
  onBack: () => void;
  onOpenHelp?: () => void;
  onViewSelect?: (view: any) => void;
}

type MoodQuadrant = 'all' | ClassicMoodQuadrant | AffectiveMoodCategory;

/**
 * RGB Color Interpolation Helper
 */
function interpolateRgb(colorA: [number, number, number], colorB: [number, number, number], t: number): string {
  const clampedT = Math.max(0, Math.min(1, t));
  const r = Math.round(colorA[0] + (colorB[0] - colorA[0]) * clampedT);
  const g = Math.round(colorA[1] + (colorB[1] - colorA[1]) * clampedT);
  const b = Math.round(colorA[2] + (colorB[2] - colorA[2]) * clampedT);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Functional Color Resolver for Circumplex Dots
 * 4-Quadrant Mode: 4 quadrant anchor colors + vibrant boundary mixes
 * 8-Octant Mode: 8 octant colors + luminescent silver for neutral + boundary mixes
 */
function getCircumplexDotColor(
  valence: number,
  arousal: number,
  mode: '4quadrants' | '8octants'
): string {
  const v = Math.max(-1.0, Math.min(1.0, valence || 0));
  const a = Math.max(-1.0, Math.min(1.0, arousal || 0));
  const salience = Math.sqrt(v * v + a * a);
  const angleDeg = ((Math.atan2(a, v) * 180) / Math.PI + 360) % 360;

  // 8-Octant Palette Definitions
  const C_SUNNY: [number, number, number] = [20, 184, 166];       // Teal #14b8a6 (0°)
  const C_EUPHORIC: [number, number, number] = [16, 185, 129];    // Emerald #10b981 (45°)
  const C_DRIVING: [number, number, number] = [245, 158, 11];     // Amber #f59e0b (90°)
  const C_TENSE: [number, number, number] = [244, 63, 94];        // Rose #f43f5e (135°)
  const C_MOODY: [number, number, number] = [217, 70, 239];       // Fuchsia #d946ef (180°)
  const C_MELANCHOLIC: [number, number, number] = [99, 102, 241]; // Indigo #6366f1 (225°)
  const C_BITTERSWEET: [number, number, number] = [139, 92, 246]; // Violet #8b5cf6 (270°)
  const C_PEACEFUL: [number, number, number] = [6, 182, 212];      // Cyan #06b6d4 (315°)
  const C_NEUTRAL: [number, number, number] = [226, 232, 240];    // Luminescent Silver #e2e8f0

  if (mode === '4quadrants') {
    // 4 Quadrants Mode:
    // Pure corners at 45° (Euphoric), 135° (Tense), 225° (Melancholic), 315° (Peaceful)
    // Boundary mixes at 90° (Amber = Euphoric + Tense), 180° (Fuchsia = Tense + Melancholic),
    // 270° (Violet = Melancholic + Peaceful), 0° (Teal = Peaceful + Euphoric)
    if (angleDeg >= 45 && angleDeg < 135) {
      const t = (angleDeg - 45) / 90;
      return t <= 0.5
        ? interpolateRgb(C_EUPHORIC, C_DRIVING, t * 2)
        : interpolateRgb(C_DRIVING, C_TENSE, (t - 0.5) * 2);
    } else if (angleDeg >= 135 && angleDeg < 225) {
      const t = (angleDeg - 135) / 90;
      return t <= 0.5
        ? interpolateRgb(C_TENSE, C_MOODY, t * 2)
        : interpolateRgb(C_MOODY, C_MELANCHOLIC, (t - 0.5) * 2);
    } else if (angleDeg >= 225 && angleDeg < 315) {
      const t = (angleDeg - 225) / 90;
      return t <= 0.5
        ? interpolateRgb(C_MELANCHOLIC, C_BITTERSWEET, t * 2)
        : interpolateRgb(C_BITTERSWEET, C_PEACEFUL, (t - 0.5) * 2);
    } else {
      const relAngle = angleDeg >= 315 ? angleDeg - 315 : angleDeg + 45;
      const t = relAngle / 90;
      return t <= 0.5
        ? interpolateRgb(C_PEACEFUL, C_SUNNY, t * 2)
        : interpolateRgb(C_SUNNY, C_EUPHORIC, (t - 0.5) * 2);
    }
  }

  // 8-Octant Mode:
  // Check if inside the Neutral / Balanced core (|v| <= AFFECTIVE_DELTA && |a| <= AFFECTIVE_DELTA)
  if (Math.abs(v) <= AFFECTIVE_DELTA && Math.abs(a) <= AFFECTIVE_DELTA) {
    const normDist = Math.min(1.0, Math.max(Math.abs(v), Math.abs(a)) / AFFECTIVE_DELTA);
    const octantAnchors: Array<{ angle: number; color: [number, number, number] }> = [
      { angle: 0, color: C_SUNNY },
      { angle: 45, color: C_EUPHORIC },
      { angle: 90, color: C_DRIVING },
      { angle: 135, color: C_TENSE },
      { angle: 180, color: C_MOODY },
      { angle: 225, color: C_MELANCHOLIC },
      { angle: 270, color: C_BITTERSWEET },
      { angle: 315, color: C_PEACEFUL },
      { angle: 360, color: C_SUNNY },
    ];
    const idx = Math.floor(angleDeg / 45);
    const frac = (angleDeg % 45) / 45;
    const baseColor = interpolateRgb(octantAnchors[idx].color, octantAnchors[idx + 1].color, frac);
    const parsed = (baseColor.match(/\d+/g)?.map(Number) as [number, number, number]) || C_NEUTRAL;
    return interpolateRgb(C_NEUTRAL, parsed, normDist * 0.45);
  }

  // 8 Octants Continuous Circular Interpolation
  const octantAnchors: Array<{ angle: number; color: [number, number, number] }> = [
    { angle: 0, color: C_SUNNY },
    { angle: 45, color: C_EUPHORIC },
    { angle: 90, color: C_DRIVING },
    { angle: 135, color: C_TENSE },
    { angle: 180, color: C_MOODY },
    { angle: 225, color: C_MELANCHOLIC },
    { angle: 270, color: C_BITTERSWEET },
    { angle: 315, color: C_PEACEFUL },
    { angle: 360, color: C_SUNNY },
  ];
  const idx = Math.floor(angleDeg / 45);
  const frac = (angleDeg % 45) / 45;
  return interpolateRgb(octantAnchors[idx].color, octantAnchors[idx + 1].color, frac);
}

/**
 * Resolves 2D Circumplex Coordinates
 * In '4quadrants' mode: plots Cartesian (Valence, Arousal) into 4 equal quadrants (2x2 grid)
 * In '8octants' mode: maps tracks proportionally into the 3x3 Affective Matrix (equal space allotted per parameter)
 */
function getCircumplexCoordinates(
  valence: number,
  arousal: number,
  mode: '4quadrants' | '8octants'
): { cx: string; cy: string; xNum: number; yNum: number } {
  const v = Math.max(-1.0, Math.min(1.0, valence || 0));
  const a = Math.max(-1.0, Math.min(1.0, arousal || 0));

  if (mode === '4quadrants') {
    const xNum = 50 + v * 45;
    const yNum = 50 - a * 45;
    return { cx: `${xNum}%`, cy: `${yNum}%`, xNum, yNum };
  }

  // 8-Parameter (3x3 Proportional Matrix) Mode:
  // Discretizes Valence into 3 equal columns strictly matching AFFECTIVE_DELTA (0.18):
  // Col 0: [-1.0, -AFFECTIVE_DELTA], center 16.67% (Negative Valence: Tense, Moody, Melancholic)
  // Col 1: [-AFFECTIVE_DELTA, +AFFECTIVE_DELTA], center 50.0% (Neutral Valence: Driving, Balanced, Bittersweet)
  // Col 2: [+AFFECTIVE_DELTA, +1.0], center 83.33% (Positive Valence: Euphoric, Sunny, Peaceful)
  let col = 1;
  let ux = 0;
  const colSpan = (1.0 - AFFECTIVE_DELTA) / 2;
  const colMid = (1.0 + AFFECTIVE_DELTA) / 2;
  if (v < -AFFECTIVE_DELTA) {
    col = 0;
    ux = (v - (-colMid)) / colSpan;
  } else if (v > AFFECTIVE_DELTA) {
    col = 2;
    ux = (v - colMid) / colSpan;
  } else {
    col = 1;
    ux = v / AFFECTIVE_DELTA;
  }
  ux = Math.max(-1.0, Math.min(1.0, ux));
  const colCenters = [16.67, 50.0, 83.33];
  const xNum = colCenters[col] + ux * 9.5;

  // Discretizes Arousal into 3 equal rows strictly matching AFFECTIVE_DELTA (0.18):
  // Row 0: [+AFFECTIVE_DELTA, +1.0], center 16.67% (High Arousal: Tense, Driving, Euphoric)
  // Row 1: [-AFFECTIVE_DELTA, +AFFECTIVE_DELTA], center 50.0% (Neutral Arousal: Moody, Balanced, Sunny)
  // Row 2: [-1.0, -AFFECTIVE_DELTA], center 83.33% (Low Arousal: Melancholic, Bittersweet, Peaceful)
  let row = 1;
  let uy = 0;
  const rowSpan = (1.0 - AFFECTIVE_DELTA) / 2;
  const rowMid = (1.0 + AFFECTIVE_DELTA) / 2;
  if (a > AFFECTIVE_DELTA) {
    row = 0;
    uy = (a - rowMid) / rowSpan;
  } else if (a < -AFFECTIVE_DELTA) {
    row = 2;
    uy = (a - (-rowMid)) / rowSpan;
  } else {
    row = 1;
    uy = a / AFFECTIVE_DELTA;
  }
  uy = Math.max(-1.0, Math.min(1.0, uy));
  const rowCenters = [16.67, 50.0, 83.33];
  const yNum = rowCenters[row] - uy * 9.5;

  return {
    cx: `${Math.max(4, Math.min(96, xNum))}%`,
    cy: `${Math.max(5, Math.min(95, yNum))}%`,
    xNum,
    yNum,
  };
}

export default function AudimoteView({ onBack, onOpenHelp, onViewSelect }: AudimoteViewProps) {
  const { playTrack, pauseTrack, isPlaying, activeAudio } = useAudioPreview();

  const [tracks, setTracks] = useState<AudimoteTrackItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressEvent>({
    processed: 0,
    total: 0,
    activeTracks: [],
    successCount: 0,
    failedCount: 0,
  });

  // Filtering & Triage State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCamelotKey, setSelectedCamelotKey] = useState<string>('all');
  const [camelotFilterMode, setCamelotFilterMode] = useState<'compatible' | 'exact'>('compatible');
  const [camelotNotation, setCamelotNotation] = useState<'both' | 'camelot' | 'musical'>('both');
  const [hoveredCamelotSector, setHoveredCamelotSector] = useState<string | null>(null);
  const [harmonicAnchorId, setHarmonicAnchorId] = useState<string | null>(null);
  const [harmonicFilterActive, setHarmonicFilterActive] = useState<boolean>(false);
  const [minBpm, setMinBpm] = useState<number>(50);
  const [maxBpm, setMaxBpm] = useState<number>(200);
  const [minEnergy, setMinEnergy] = useState<number>(0);
  const [minDanceability, setMinDanceability] = useState<number>(0);
  const [selectedQuadrant, setSelectedQuadrant] = useState<MoodQuadrant>('all');
  const [moodDisplayMode, setMoodDisplayMode] = useState<'8octants' | '4quadrants'>('8octants');
  const [includeBoundaryOverlap, setIncludeBoundaryOverlap] = useState<boolean>(true);
  const [overrideScaleColor, setOverrideScaleColor] = useState<boolean>(false);

  // Interactive Hover / Tooltip State
  const [hoveredTrack, setHoveredTrack] = useState<AudimoteTrackItem | null>(null);

  // Paste / Import Modal State
  const [isPasteModalOpen, setIsPasteModalOpen] = useState<boolean>(false);
  const [pasteText, setPasteText] = useState<string>('');

  // Clear Database Confirmation Modal State
  const [isClearDbModalOpen, setIsClearDbModalOpen] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleClearDatabase = async () => {
    try {
      await clearEntireMetadataDB();
      setTracks([]);
      setIsClearDbModalOpen(false);
      showToast('Acoustic database completely cleared.');
    } catch (err: any) {
      console.error('[AudimoteView] Failed to clear database:', err);
      alert('Failed to clear database: ' + (err?.message || err));
    }
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initial load from IndexedDB
  useEffect(() => {
    loadSavedAcousticTracks()
      .then((saved) => {
        if (saved.length > 0) {
          setTracks(saved);
        }
      })
      .catch((err) => {
        console.warn('[AudimoteView] Error loading saved tracks:', err);
      });
  }, []);

  /**
   * Merges imported tracks into state with deduplication by normalized artist:::title.
   * If an imported track contains an acoustic profile, it rehydrates existing unanalyzed tracks!
   */
  const mergeTracks = (newItems: AudimoteTrackItem[]): { added: number; updated: number } => {
    let added = 0;
    let updated = 0;

    setTracks((prev) => {
      const trackMap = new Map<string, AudimoteTrackItem>();
      const makeKey = (t: AudimoteTrackItem) =>
        `${(t.artist || '').toLowerCase().trim()}:::${(t.title || '').toLowerCase().trim()}`;

      for (const t of prev) {
        trackMap.set(makeKey(t), t);
      }

      for (const item of newItems) {
        const key = makeKey(item);
        const existing = trackMap.get(key);

        const profileWithCalibratedValence = item.profile
          ? {
              ...item.profile,
              valence: calculateCalibratedValence(item.profile),
            }
          : undefined;

        if (existing) {
          // If the new item has an acoustic profile and the existing one didn't, upgrade it!
          if (!existing.profile && profileWithCalibratedValence) {
            trackMap.set(key, {
              ...existing,
              profile: profileWithCalibratedValence,
              acousticProfile: profileWithCalibratedValence,
              previewUrl: existing.previewUrl || item.previewUrl,
              coverArtUrl: existing.coverArtUrl || item.coverArtUrl,
              status: 'completed',
            });
            updated++;
          }
        } else {
          trackMap.set(key, {
            ...item,
            profile: profileWithCalibratedValence || item.profile,
            acousticProfile: profileWithCalibratedValence || item.acousticProfile,
          });
          added++;
        }
      }

      return Array.from(trackMap.values());
    });

    return { added, updated };
  };

  // Handle Drag & Drop: supports audio files (.mp3, .wav, .m4a, .flac) AND playlists (.csv, .tsv, .m3u, .txt, .json)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const rawFiles = Array.from(e.dataTransfer.files);
    if (rawFiles.length === 0) return;

    let totalAdded = 0;
    let totalUpdated = 0;
    const formatsFound = new Set<string>();

    for (const file of rawFiles) {
      try {
        const res = await parseAcousticImportFile(file);
        if (res.tracks.length > 0) {
          const { added, updated } = mergeTracks(res.tracks);
          totalAdded += added;
          totalUpdated += updated;
          formatsFound.add(res.label);
        }
      } catch (err) {
        console.warn('[AudimoteView] Drop import error for file:', file.name, err);
      }
    }

    if (totalAdded > 0 || totalUpdated > 0) {
      const labelStr = Array.from(formatsFound).join(', ');
      showToast(
        `Imported ${totalAdded} tracks${totalUpdated > 0 ? ` (${totalUpdated} hydrated)` : ''} from ${labelStr}`
      );
    }
  };

  // Handle File Input Selection
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const rawFiles = Array.from(e.target.files);

    let totalAdded = 0;
    let totalUpdated = 0;
    const formatsFound = new Set<string>();

    for (const file of rawFiles) {
      try {
        const res = await parseAcousticImportFile(file);
        if (res.tracks.length > 0) {
          const { added, updated } = mergeTracks(res.tracks);
          totalAdded += added;
          totalUpdated += updated;
          formatsFound.add(res.label);
        }
      } catch (err) {
        console.warn('[AudimoteView] File import error for:', file.name, err);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (totalAdded > 0 || totalUpdated > 0) {
      const labelStr = Array.from(formatsFound).join(', ');
      showToast(
        `Imported ${totalAdded} tracks${totalUpdated > 0 ? ` (${totalUpdated} hydrated)` : ''} from ${labelStr}`
      );
    }
  };

  // Import All Tracks from Metadata DB (Enriched Records)
  const handleImportFromDB = async () => {
    try {
      const db = await initDB();
      const transaction = db.transaction(['enriched_tracks'], 'readonly');
      const store = transaction.objectStore('enriched_tracks');
      const req = store.getAll();

      req.onsuccess = () => {
        const records = req.result || [];
        const items: AudimoteTrackItem[] = records.map((r: any) => ({
          id: r.id,
          artist: r.artist?.name || r.queryArtist || 'Unknown Artist',
          title: r.title || r.queryTitle || 'Unknown Title',
          album: r.release?.albumTitle || r.queryAlbum,
          previewUrl: r.artist?.externalLinks?.audioPreviewUrl,
          coverArtUrl: r.release?.coverArtThumbUrl || r.release?.coverArtFullUrl,
          profile: r.acousticProfile,
          status: r.acousticProfile ? 'completed' : 'pending',
        }));

        const { added, updated } = mergeTracks(items);
        showToast(`Imported ${added} tracks${updated > 0 ? ` (${updated} hydrated)` : ''} from Metadata DB`);
      };
    } catch (err) {
      console.error('[AudimoteView] DB import error:', err);
    }
  };

  // Parse Pasted Text (Supports TuneMyMusic CSV, Downloader TXT, M3U, TSV, or JSON)
  const handlePasteImport = () => {
    if (!pasteText.trim()) return;
    try {
      const res = parseAcousticImportText(pasteText);
      if (res.tracks.length > 0) {
        const { added, updated } = mergeTracks(res.tracks);
        showToast(
          `Imported ${added} tracks${updated > 0 ? ` (${updated} hydrated)` : ''} (${res.label})`
        );
      } else {
        showToast('No valid tracks found in pasted text.');
      }
    } catch (err: any) {
      showToast(`Import failed: ${err?.message || err}`);
    }
    setPasteText('');
    setIsPasteModalOpen(false);
  };

  const detectedFormat = useMemo(() => {
    if (!pasteText.trim()) return null;
    return detectImportFormat(pasteText);
  }, [pasteText]);

  const previewTrackCount = useMemo(() => {
    if (!pasteText.trim()) return 0;
    try {
      const parsed = parseAcousticImportText(pasteText);
      return parsed.tracks.length;
    } catch {
      return 0;
    }
  }, [pasteText]);

  // Batch Analysis Execution
  const handleStartAnalysis = async (forceAll: boolean = false) => {
    const targetTracks = forceAll
      ? tracks
      : tracks.filter((t) => t.status !== 'completed' || !t.profile);
    if (targetTracks.length === 0) return;

    setIsAnalyzing(true);
    abortControllerRef.current = new AbortController();

    try {
      await analyzeTrackBatch(
        targetTracks,
        (prog) => setAnalysisProgress(prog),
        abortControllerRef.current.signal,
        2, // High-throughput parallel DSP execution across dual-worker pool
        (updatedItem) => {
          setTracks((prev) =>
            prev.map((t) => (t.id === updatedItem.id ? { ...t, ...updatedItem } : t))
          );
        }
      );
    } catch (err: any) {
      console.warn('[AudimoteView] Batch analysis cancelled or failed:', err);
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  // Single Track Direct Analysis Execution
  const handleAnalyzeSingleTrack = async (item: AudimoteTrackItem) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    abortControllerRef.current = new AbortController();

    // Optimistically set row to analyzing
    setTracks((prev) =>
      prev.map((t) => (t.id === item.id ? { ...t, status: 'analyzing', errorMessage: undefined } : t))
    );
    setAnalysisProgress({
      processed: 0,
      total: 1,
      currentTrack: `${item.artist} - ${item.title}`,
      currentTrackId: item.id,
      activeTracks: [{ id: item.id, artist: item.artist, title: item.title }],
      successCount: 0,
      failedCount: 0,
    });

    try {
      const profile = await analyzeTrack(item, abortControllerRef.current.signal);
      setTracks((prev) =>
        prev.map((t) =>
          t.id === item.id ? { ...t, profile, acousticProfile: profile, status: 'completed' } : t
        )
      );
      setAnalysisProgress({
        processed: 1,
        total: 1,
        activeTracks: [],
        successCount: 1,
        failedCount: 0,
      });
      showToast(`Analyzed "${item.title}" successfully.`);
    } catch (err: any) {
      const errorMsg = err?.message || 'Analysis failed';
      setTracks((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, status: 'error', errorMessage: errorMsg } : t))
      );
      setAnalysisProgress({
        processed: 1,
        total: 1,
        activeTracks: [],
        successCount: 0,
        failedCount: 1,
      });
      showToast(`Failed to analyze "${item.title}": ${errorMsg}`);
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
  };

  // Anchor Track
  const harmonicAnchorTrack = useMemo(() => {
    if (!harmonicAnchorId) return null;
    return tracks.find((t) => t.id === harmonicAnchorId) || null;
  }, [harmonicAnchorId, tracks]);

  // Filtered Tracks
  const filteredTracks = useMemo(() => {
    return tracks.filter((item) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchArtist = item.artist.toLowerCase().includes(q);
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchAlbum = (item.album || '').toLowerCase().includes(q);
        if (!matchArtist && !matchTitle && !matchAlbum) return false;
      }

      // If track has not been analyzed yet, show it in table unless filtered by acoustic criteria
      if (!item.profile) {
        return (
          selectedCamelotKey === 'all' &&
          !harmonicFilterActive &&
          selectedQuadrant === 'all' &&
          minEnergy === 0 &&
          minDanceability === 0
        );
      }

      const p = item.profile;

      // 2. Camelot Key Filter (Harmonic Compatible vs Exact Key)
      if (selectedCamelotKey !== 'all') {
        const trackCamelot = p.camelotCode || '';
        if (camelotFilterMode === 'exact') {
          if (trackCamelot !== selectedCamelotKey) return false;
        } else {
          // Compatible mode (Default): match exact key, relative major/minor, adjacent fifths (+/-1), or energy boost (+2)
          if (!isHarmonicallyCompatible(selectedCamelotKey, trackCamelot)) {
            return false;
          }
        }
      }

      // 3. Harmonic Mixing Filter (Anchor Track Match)
      if (harmonicFilterActive && harmonicAnchorTrack?.profile) {
        const anchorCamelot = harmonicAnchorTrack.profile.camelotCode || '';
        const currentCamelot = p.camelotCode || '';
        if (!isHarmonicallyCompatible(anchorCamelot, currentCamelot)) {
          return false;
        }
      }

      // 4. BPM Range
      if (p.bpm < minBpm || p.bpm > maxBpm) {
        return false;
      }

      // 5. Energy & Danceability
      if (p.energy < minEnergy || p.danceability < minDanceability) {
        return false;
      }

      // 6. Mood Quadrant / Octant Filter (Dual-Layer 4-Quadrant + 8-Octant with Boundary Awareness)
      if (selectedQuadrant !== 'all') {
        const mood = getAffectiveMood(p.valence, p.arousal);
        if (moodDisplayMode === '8octants') {
          // In 8-Octant (3x3 Matrix) Mode, each of the 9 categories is a first-class citizen
          const isDirectMatch = mood.category === selectedQuadrant;
          const isOverlapMatch =
            includeBoundaryOverlap &&
            mood.isBoundary &&
            (mood.secondaryQuadrant === selectedQuadrant || mood.adjacentQuadrant === selectedQuadrant);
          if (!isDirectMatch && !isOverlapMatch) return false;
        } else {
          // Classic 4-Quadrant Mode ('euphoric', 'tense', 'melancholic', 'peaceful')
          const matchesPrimary = mood.primaryQuadrant === selectedQuadrant;
          const matchesSecondary =
            includeBoundaryOverlap &&
            (mood.adjacentQuadrant === selectedQuadrant || mood.secondaryQuadrant === selectedQuadrant);
          if (!matchesPrimary && !matchesSecondary) return false;
        }
      }

      return true;
    });
  }, [
    tracks,
    searchQuery,
    selectedCamelotKey,
    camelotFilterMode,
    harmonicFilterActive,
    harmonicAnchorTrack,
    minBpm,
    maxBpm,
    minEnergy,
    minDanceability,
    selectedQuadrant,
    moodDisplayMode,
    includeBoundaryOverlap,
  ]);

  // All analyzed tracks for Visualizers (to show complete distribution with active filter highlights)
  const allAnalyzedTracks = useMemo(() => {
    return tracks.filter((t) => t.profile != null);
  }, [tracks]);

  // Set of track IDs that match all active filter criteria
  const matchingTrackIds = useMemo(() => {
    return new Set(filteredTracks.map((t) => t.id));
  }, [filteredTracks]);

  // Count of plotted analyzed tracks that match all active filter criteria
  const matchingAnalyzedCount = useMemo(() => {
    return allAnalyzedTracks.filter((t) => matchingTrackIds.has(t.id)).length;
  }, [allAnalyzedTracks, matchingTrackIds]);

  // Statistics
  const stats = useMemo(() => {
    const total = tracks.length;
    const analyzed = tracks.filter((t) => t.profile != null).length;
    if (analyzed === 0) {
      return { total, analyzed, avgBpm: 0, avgEnergy: 0, avgDanceability: 0, dominantCamelot: '-' };
    }

    const analyzedList = tracks.filter((t) => t.profile != null);
    const sumBpm = analyzedList.reduce((acc, t) => acc + (t.profile?.bpm || 0), 0);
    const sumEnergy = analyzedList.reduce((acc, t) => acc + (t.profile?.energy || 0), 0);
    const sumDance = analyzedList.reduce((acc, t) => acc + (t.profile?.danceability || 0), 0);

    const camelotCounts: Record<string, number> = {};
    analyzedList.forEach((t) => {
      const c = t.profile?.camelotCode || '';
      if (c) camelotCounts[c] = (camelotCounts[c] || 0) + 1;
    });

    let dominantCamelot = '-';
    let maxCount = 0;
    Object.entries(camelotCounts).forEach(([k, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantCamelot = k;
      }
    });

    return {
      total,
      analyzed,
      avgBpm: Math.round(sumBpm / analyzed),
      avgEnergy: Math.round((sumEnergy / analyzed) * 100),
      avgDanceability: Math.round((sumDance / analyzed) * 100),
      dominantCamelot,
    };
  }, [tracks]);

  // Camelot Wheel Key Distribution (counts for filtered vs total)
  const camelotKeyDistribution = useMemo(() => {
    const filteredDist: Record<string, number> = {};
    const totalDist: Record<string, number> = {};
    for (let i = 1; i <= 12; i++) {
      filteredDist[`${i}A`] = 0;
      filteredDist[`${i}B`] = 0;
      totalDist[`${i}A`] = 0;
      totalDist[`${i}B`] = 0;
    }
    tracks.forEach((t) => {
      const code = t.profile?.camelotCode;
      if (code && totalDist[code] !== undefined) {
        totalDist[code]++;
      }
    });
    filteredTracks.forEach((t) => {
      const code = t.profile?.camelotCode;
      if (code && filteredDist[code] !== undefined) {
        filteredDist[code]++;
      }
    });
    const maxTotal = Math.max(1, ...Object.values(totalDist));
    return { filtered: filteredDist, total: totalDist, maxTotal };
  }, [tracks, filteredTracks]);

  // Audio Playback Toggle
  const handleTogglePlay = (item: AudimoteTrackItem) => {
    if (activeAudio?.trackId === item.id && isPlaying) {
      pauseTrack();
    } else {
      playTrack({
        id: item.id,
        artist: item.artist,
        title: item.title,
        album: item.album,
        previewUrl: item.previewUrl,
        coverArtUrl: item.coverArtUrl,
      });
    }
  };

  // Foundational Exporters & Downstream Bridges
  const handleExportTuneMyMusicCSV = () => {
    if (filteredTracks.length === 0) {
      showToast('No tracks to export.');
      return;
    }
    const csv = generateTuneMyMusicCSV(filteredTracks);
    downloadFile(csv, 'audimote_tunemymusic.csv', 'text/csv;charset=utf-8;');
    showToast(`Exported TuneMyMusic CSV (${filteredTracks.length} tracks with UTF-8 BOM)!`);
  };

  const handleExportDownloaderTXT = () => {
    if (filteredTracks.length === 0) {
      showToast('No tracks to export.');
      return;
    }
    const txt = generateDownloaderTXT(filteredTracks);
    downloadFile(txt, 'audimote_downloader_tracks.txt', 'text/plain;charset=utf-8;');
    showToast(`Exported Downloader TXT (${filteredTracks.length} tracks)!`);
  };

  const handleExportAcousticCSV = () => {
    if (filteredTracks.length === 0) {
      showToast('No tracks to export.');
      return;
    }
    exportTracksToCSV(filteredTracks, 'audimote_acoustic_profiles.csv');
    showToast(`Exported Dense Acoustic CSV (${filteredTracks.length} tracks with UTF-8 BOM)!`);
  };

  const handleExportDJSet = () => {
    if (filteredTracks.length === 0) {
      showToast('No tracks to export.');
      return;
    }
    const m3u = generateM3U(filteredTracks, 'Audimote Harmonic DJ Set');
    downloadFile(m3u, 'audimote_harmonic_set.m3u', 'audio/x-mpegurl;charset=utf-8;');
    showToast(`Exported Harmonic DJ Set M3U (${filteredTracks.length} tracks)!`);
  };

  const handleExportFocusSet = () => {
    const focusTracks = tracks.filter(
      (t) => t.profile && t.profile.arousal <= 0 && t.profile.valence >= 0
    );
    if (focusTracks.length === 0) {
      showToast('No Peaceful / Focus quadrant tracks available to export.');
      return;
    }
    const m3u = generateM3U(focusTracks, 'Audimote Deep Focus & Study');
    downloadFile(m3u, 'audimote_deep_focus.m3u', 'audio/x-mpegurl;charset=utf-8;');
    showToast(`Exported Deep Focus M3U (${focusTracks.length} tracks)!`);
  };

  const handleCopyTSV = async () => {
    if (filteredTracks.length === 0) {
      showToast('No tracks to copy.');
      return;
    }
    const tsv = generateTSV(filteredTracks);
    try {
      await navigator.clipboard.writeText(tsv);
      showToast(`Copied TSV to clipboard (${filteredTracks.length} tracks)!`);
    } catch {
      showToast('Clipboard access denied.');
    }
  };

  const handleExportSessionJSON = () => {
    if (tracks.length === 0) {
      showToast('No session data to export.');
      return;
    }
    const json = generateSessionJSON(tracks);
    downloadFile(json, 'audimote_session_backup.json', 'application/json;charset=utf-8;');
    showToast(`Exported Session Backup JSON (${tracks.length} tracks)!`);
  };

  const handleStageToTriage = () => {
    if (filteredTracks.length === 0) {
      showToast('No tracks to stage.');
      return;
    }
    const stagedCount = stageTracksToDiscoveryTriage(filteredTracks);
    showToast(`Staged ${stagedCount} tracks into Discovery Triage!`);
    if (onViewSelect) {
      onViewSelect('triage');
    }
  };

  return (
    <div
      className="p-6 max-w-7xl mx-auto space-y-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🐣</span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Audimote</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Module 18
              </span>
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Essentia.js Wasm ⚡
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Client-side acoustic & emotional intelligence triage engine. Zero API cost, zero rate limits.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenHelp && (
            <button
              onClick={onOpenHelp}
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              Guide
            </button>
          )}

          <button
            onClick={handleImportFromDB}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            title="Pull tracks from PlaylistHavenMetadataDB"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            Import DB
          </button>

          <button
            onClick={() => setIsPasteModalOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            title="Paste TuneMyMusic CSV, Downloader TXT, M3U, TSV, or JSON"
          >
            <FileText className="w-4 h-4 text-cyan-400" />
            Paste Tracklist
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            multiple
            accept=".csv,.tsv,.m3u,.m3u8,.txt,.json,.mp3,.wav,.m4a,.flac,.ogg,.aac,audio/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            title="Import TuneMyMusic CSV, M3U playlist, Downloader TXT, TSV, JSON, or Audio files (.mp3, .wav, .m4a)"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            Import Files
          </button>

          <button
            onClick={() => setIsClearDbModalOpen(true)}
            className="px-3 py-1.5 bg-slate-800/80 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700 hover:border-rose-500/40"
            title="Clear all saved acoustic profiles and cached tracks from IndexedDB"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            Clear DB
          </button>

          {isAnalyzing ? (
            <button
              onClick={handleStopAnalysis}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-red-500/20 transition-all"
            >
              <Pause className="w-4 h-4" />
              Stop Analysis
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleStartAnalysis(false)}
                disabled={tracks.length === 0 || tracks.filter((t) => !t.profile).length === 0}
                className="px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all"
              >
                <Zap className="w-4 h-4" />
                Analyze Unprocessed ({tracks.filter((t) => !t.profile).length})
              </button>
              {tracks.some((t) => t.profile) && (
                <button
                  onClick={() => handleStartAnalysis(true)}
                  disabled={tracks.length === 0}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                  title="Re-analyze all tracks with the 3-tier vocal-aware engine"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  Re-analyze All ({tracks.length})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar when analyzing */}
      {isAnalyzing && (
        <div className="p-4 bg-cyan-950/40 border border-cyan-500/30 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
              <span className="text-slate-300 font-medium">
                Evaluating {analysisProgress.activeTracks && analysisProgress.activeTracks.length > 0 ? `(${analysisProgress.activeTracks.length} concurrent):` : ''}
              </span>
              {analysisProgress.activeTracks && analysisProgress.activeTracks.length > 0 ? (
                analysisProgress.activeTracks.map((at) => (
                  <span
                    key={at.id}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 truncate max-w-xs animate-pulse"
                  >
                    {at.artist} - {at.title}
                  </span>
                ))
              ) : (
                <span className="text-cyan-300 font-medium">
                  {analysisProgress.currentTrack || 'Extracting features...'}
                </span>
              )}
            </div>
            <span className="text-cyan-400 font-mono shrink-0">
              {analysisProgress.processed} / {analysisProgress.total} (
              {Math.round((analysisProgress.processed / (analysisProgress.total || 1)) * 100)}%)
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(analysisProgress.processed / (analysisProgress.total || 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-slate-400 text-xs flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-cyan-400" />
            Total Tracks
          </div>
          <div className="text-xl font-bold text-white mt-1">{stats.total}</div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-slate-400 text-xs flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Acoustic Hydrated
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {stats.analyzed} <span className="text-xs text-slate-500">/ {stats.total}</span>
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-slate-400 text-xs flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-yellow-400" />
            Average Tempo
          </div>
          <div className="text-xl font-bold text-yellow-400 mt-1">
            {stats.avgBpm > 0 ? `${stats.avgBpm} BPM` : '-'}
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-slate-400 text-xs flex items-center gap-1.5">
            <Disc className="w-3.5 h-3.5 text-indigo-400" />
            Dominant Key
          </div>
          <div className="text-xl font-bold text-indigo-400 mt-1">{stats.dominantCamelot}</div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-slate-400 text-xs flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            Avg Energy
          </div>
          <div className="text-xl font-bold text-rose-400 mt-1">
            {stats.avgEnergy > 0 ? `${stats.avgEnergy}%` : '-'}
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-slate-400 text-xs flex items-center gap-1.5">
            <Smile className="w-3.5 h-3.5 text-purple-400" />
            Avg Danceability
          </div>
          <div className="text-xl font-bold text-purple-400 mt-1">
            {stats.avgDanceability > 0 ? `${stats.avgDanceability}%` : '-'}
          </div>
        </div>
      </div>

      {/* Visualizers Grid: 2D Mood Scatterplot + 12-Segment Camelot Harmonic Wheel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 2D Mood Scatterplot (Russell's Circumplex Model) */}
        <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden flex flex-col">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  2D Valence-Arousal Mood Circumplex
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800/90 text-cyan-300 font-mono border border-slate-700/60 whitespace-nowrap">
                  {matchingAnalyzedCount} / {allAnalyzedTracks.length} Plotted
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Acoustic emotional fingerprint. Click any point to preview audio.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Dynamic Mode Switcher (4-Quadrant vs 8-Octant) */}
              <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-xs">
                <button
                  onClick={() => {
                    setMoodDisplayMode('4quadrants');
                    if (['driving', 'moody', 'bittersweet', 'sunny', 'balanced'].includes(selectedQuadrant)) {
                      setSelectedQuadrant('all');
                    }
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    moodDisplayMode === '4quadrants'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Switch to Classic 4-Quadrant view (Euphoric, Tense, Melancholic, Peaceful)"
                >
                  4 Quadrants
                </button>
                <button
                  onClick={() => setMoodDisplayMode('8octants')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    moodDisplayMode === '8octants'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Switch to 8-Octant Affective view (with Bittersweet, Driving, Moody, Sunny, Balanced)"
                >
                  8 Mood Octants
                </button>
              </div>

              {overrideScaleColor && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/50 rounded-lg text-xs text-indigo-300">
                  <span className="flex items-center -space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  </span>
                  <span>Scale: Major (Green) / Minor (Indigo)</span>
                  <button
                    onClick={() => setOverrideScaleColor(false)}
                    className="hover:text-white ml-1 text-slate-400"
                    title="Return to Affective Mood Colors"
                  >
                    ✕
                  </button>
                </div>
              )}

              {selectedQuadrant !== 'all' && (
                <button
                  onClick={() => setSelectedQuadrant('all')}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-medium transition-colors"
                  title="Clear mood filter"
                >
                  Reset Mood ✕
                </button>
              )}

              {harmonicAnchorTrack && (
                <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-950/60 border border-indigo-500/40 rounded-lg text-xs text-indigo-300">
                  <span>Anchor:</span>
                  <span className="font-semibold text-white">
                    {harmonicAnchorTrack.artist} - {harmonicAnchorTrack.title} (
                    {harmonicAnchorTrack.profile?.camelotCode})
                  </span>
                  <button
                    onClick={() => {
                      setHarmonicAnchorId(null);
                      setHarmonicFilterActive(false);
                    }}
                    className="hover:text-red-400 ml-1"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Scatterplot Canvas Container */}
          <div className="relative w-full h-80 bg-slate-950/90 rounded-xl border border-slate-800/80 select-none overflow-hidden">
            {/* 1. Dynamic Background Zones (Clickable filters) */}
            {moodDisplayMode === '4quadrants' ? (
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 z-0">
                {/* Top-Left: Tense */}
                <div
                  className={`border-r border-b border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'tense'
                      ? 'bg-rose-950/40 border-rose-500/50'
                      : 'bg-rose-950/10 hover:bg-rose-950/20'
                  }`}
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'tense' ? 'all' : 'tense')}
                />
                {/* Top-Right: Euphoric */}
                <div
                  className={`border-b border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'euphoric'
                      ? 'bg-emerald-950/40 border-emerald-500/50'
                      : 'bg-emerald-950/10 hover:bg-emerald-950/20'
                  }`}
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'euphoric' ? 'all' : 'euphoric')}
                />
                {/* Bottom-Left: Melancholic */}
                <div
                  className={`border-r border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'melancholic'
                      ? 'bg-indigo-950/40 border-indigo-500/50'
                      : 'bg-indigo-950/10 hover:bg-indigo-950/20'
                  }`}
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'melancholic' ? 'all' : 'melancholic')}
                />
                {/* Bottom-Right: Peaceful */}
                <div
                  className={`transition-colors cursor-pointer ${
                    selectedQuadrant === 'peaceful'
                      ? 'bg-cyan-950/40 border-cyan-500/50'
                      : 'bg-cyan-950/10 hover:bg-cyan-950/20'
                  }`}
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'peaceful' ? 'all' : 'peaceful')}
                />
              </div>
            ) : (
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 z-0">
                {/* Row 0 */}
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'tense' ? 'all' : 'tense')}
                  className={`border-r border-b border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'tense' ? 'bg-rose-950/40 border-rose-500/50' : 'bg-rose-950/10 hover:bg-rose-950/20'
                  }`}
                />
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'driving' ? 'all' : 'driving')}
                  className={`border-r border-b border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'driving' ? 'bg-amber-950/40 border-amber-500/50' : 'bg-amber-950/10 hover:bg-amber-950/20'
                  }`}
                />
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'euphoric' ? 'all' : 'euphoric')}
                  className={`border-b border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'euphoric' ? 'bg-emerald-950/40 border-emerald-500/50' : 'bg-emerald-950/10 hover:bg-emerald-950/20'
                  }`}
                />
                {/* Row 1 */}
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'moody' ? 'all' : 'moody')}
                  className={`border-r border-b border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'moody' ? 'bg-fuchsia-950/40 border-fuchsia-500/50' : 'bg-fuchsia-950/10 hover:bg-fuchsia-950/20'
                  }`}
                />
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'balanced' ? 'all' : 'balanced')}
                  className={`border-r border-b border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'balanced' ? 'bg-slate-800/80 border-cyan-500/50' : 'bg-slate-900/60 hover:bg-slate-800/80'
                  }`}
                />
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'sunny' ? 'all' : 'sunny')}
                  className={`border-b border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'sunny' ? 'bg-teal-950/40 border-teal-500/50' : 'bg-teal-950/10 hover:bg-teal-950/20'
                  }`}
                />
                {/* Row 2 */}
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'melancholic' ? 'all' : 'melancholic')}
                  className={`border-r border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'melancholic' ? 'bg-indigo-950/40 border-indigo-500/50' : 'bg-indigo-950/10 hover:bg-indigo-950/20'
                  }`}
                />
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'bittersweet' ? 'all' : 'bittersweet')}
                  className={`border-r border-slate-800/60 transition-colors cursor-pointer ${
                    selectedQuadrant === 'bittersweet' ? 'bg-violet-950/40 border-violet-500/50' : 'bg-violet-950/10 hover:bg-violet-950/20'
                  }`}
                />
                <div
                  onClick={() => setSelectedQuadrant(selectedQuadrant === 'peaceful' ? 'all' : 'peaceful')}
                  className={`transition-colors cursor-pointer ${
                    selectedQuadrant === 'peaceful' ? 'bg-cyan-950/40 border-cyan-500/50' : 'bg-cyan-950/10 hover:bg-cyan-950/20'
                  }`}
                />
              </div>
            )}

            {/* 2. Axes Center Lines (Subtle reference guides) */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-700/40 pointer-events-none z-0" />
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-700/40 pointer-events-none z-0" />

            {/* 3. Scatterplot Data Points (SVG rendered at z-0, dots have pointerEvents: 'auto') */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-0"
              onMouseLeave={() => setHoveredTrack(null)}
            >
              {/* Central Neutral / Balanced Core Boundary (r = 0.20) */}
              <circle
                cx="50%"
                cy="50%"
                r="9%"
                fill={selectedQuadrant === 'balanced' ? 'rgba(71, 85, 105, 0.25)' : 'none'}
                stroke={selectedQuadrant === 'balanced' ? '#38bdf8' : '#64748b'}
                strokeWidth={selectedQuadrant === 'balanced' ? '2' : '1'}
                strokeDasharray="3 3"
                className="opacity-50 pointer-events-none transition-colors"
              />

              {allAnalyzedTracks.map((item) => {
                const p = item.profile!;
                const { cx, cy } = getCircumplexCoordinates(p.valence, p.arousal, moodDisplayMode);

                const isMatch = matchingTrackIds.has(item.id);
                const isHovered = hoveredTrack?.id === item.id;
                const isCurrentPlaying = activeAudio?.trackId === item.id && isPlaying;
                const isAnchor = harmonicAnchorId === item.id;

                // Functional Color: Correlates to Quadrants/Octants with boundary mixing
                // If overrideScaleColor is active, show Major (Emerald) vs Minor (Indigo) directly!
                const modeColor = p.scale === 'minor' ? '#6366f1' : '#10b981';
                const dotColor = overrideScaleColor
                  ? modeColor
                  : getCircumplexDotColor(p.valence, p.arousal, moodDisplayMode);
                const fillColor = isAnchor ? '#f59e0b' : dotColor;

                const baseRadius = 4 + p.danceability * 4;
                const radius = isHovered ? baseRadius + 3 : (isMatch ? baseRadius : Math.max(3, baseRadius - 2));

                return (
                  <g
                    key={item.id}
                    className="cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                    onClick={() => handleTogglePlay(item)}
                    onMouseEnter={() => {
                      if (hoveredTrack?.id !== item.id) {
                        setHoveredTrack(item);
                      }
                    }}
                  >
                    {/* Invisible static hit target to completely prevent hover micro-flickering */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={18}
                      fill="#ffffff"
                      opacity="0"
                      style={{ pointerEvents: 'all' }}
                    />

                    {isCurrentPlaying && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius + 8}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="2"
                        className="animate-ping opacity-75 pointer-events-none"
                      />
                    )}

                    {/* Visible circle with smooth coordinates and color transition */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill={isMatch ? fillColor : '#475569'}
                      stroke={isAnchor ? '#ffffff' : (isMatch ? '#0f172a' : '#1e293b')}
                      strokeWidth={isAnchor ? '2' : (isMatch ? '1.5' : '1')}
                      opacity={isMatch ? 1 : 0.2}
                      className="pointer-events-none"
                      style={{
                        transition: 'cx 0.4s ease-out, cy 0.4s ease-out, fill 0.3s ease, r 0.15s ease',
                      }}
                    />
                  </g>
                );
              })}
            </svg>

            {/* 4. Labels & Badges Overlay Layer (z-10, pointer-events-none: NEVER hidden by dots!) */}
            {moodDisplayMode === '4quadrants' ? (
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none z-10 p-2">
                {/* Top-Left: Tense */}
                <div className="flex flex-col items-start justify-start p-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-rose-900/50 text-[11px] font-bold text-rose-400 uppercase tracking-wider shadow-sm">
                    Tense / Aggressive {selectedQuadrant === 'tense' && '✓'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 pl-1">
                    High Energy · Minor / Dark
                  </span>
                </div>

                {/* Top-Right: Euphoric */}
                <div className="flex flex-col items-end justify-start p-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-emerald-900/50 text-[11px] font-bold text-emerald-400 uppercase tracking-wider shadow-sm">
                    {selectedQuadrant === 'euphoric' && '✓ '}Euphoric / Exuberant
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 pr-1">
                    High Energy · Major / Party
                  </span>
                </div>

                {/* Bottom-Left: Melancholic */}
                <div className="flex flex-col items-start justify-end p-1.5">
                  <span className="text-[10px] text-slate-400 mb-0.5 pl-1">
                    Low Energy · Downtempo
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-indigo-900/50 text-[11px] font-bold text-indigo-400 uppercase tracking-wider shadow-sm">
                    Melancholic / Somber {selectedQuadrant === 'melancholic' && '✓'}
                  </span>
                </div>

                {/* Bottom-Right: Peaceful */}
                <div className="flex flex-col items-end justify-end p-1.5">
                  <span className="text-[10px] text-slate-400 mb-0.5 pr-1">
                    Low Energy · Bright / Ambient
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-cyan-900/50 text-[11px] font-bold text-cyan-400 uppercase tracking-wider shadow-sm">
                    {selectedQuadrant === 'peaceful' && '✓ '}Peaceful / Deep Focus
                  </span>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none z-10 p-1.5">
                {/* Row 0, Col 0: Tense */}
                <div className="flex flex-col items-start justify-start p-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-rose-900/50 text-[11px] font-bold text-rose-400 uppercase tracking-wider shadow-sm">
                    Tense {selectedQuadrant === 'tense' && '✓'}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-0.5 pl-1">
                    High Arousal · Dark
                  </span>
                </div>

                {/* Row 0, Col 1: Driving ⚡ + AROUSAL */}
                <div className="flex flex-col items-center justify-start p-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-amber-900/50 shadow-sm">
                    <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                      Driving ⚡ {selectedQuadrant === 'driving' && '✓'}
                    </span>
                    <span className="text-[9px] font-mono text-amber-400/90 bg-amber-950/80 px-1 py-0.2 rounded border border-amber-500/40">
                      + AROUSAL
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5">
                    High Arousal · Kinetic
                  </span>
                </div>

                {/* Row 0, Col 2: Euphoric */}
                <div className="flex flex-col items-end justify-start p-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-emerald-900/50 text-[11px] font-bold text-emerald-400 uppercase tracking-wider shadow-sm">
                    {selectedQuadrant === 'euphoric' && '✓ '}Euphoric
                  </span>
                  <span className="text-[9px] text-slate-400 mt-0.5 pr-1">
                    High Arousal · Bright
                  </span>
                </div>

                {/* Row 1, Col 0: Moody - VALENCE */}
                <div className="flex flex-col items-start justify-start p-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-fuchsia-900/50 shadow-sm">
                    <span className="text-[11px] font-bold text-fuchsia-400 uppercase tracking-wider">
                      Moody {selectedQuadrant === 'moody' && '✓'}
                    </span>
                    <span className="text-[9px] font-mono text-fuchsia-300/90 bg-fuchsia-950/80 px-1 py-0.2 rounded border border-fuchsia-500/40">
                      - VALENCE
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5 pl-1">
                    Mid Arousal · Restless
                  </span>
                </div>

                {/* Row 1, Col 1: Balanced ⚖️ CORE */}
                <div className="flex flex-col items-center justify-start p-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-slate-700/70 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                      Balanced ⚖️ {selectedQuadrant === 'balanced' && '✓'}
                    </span>
                    <span className="text-[9px] font-mono text-cyan-300/90 bg-slate-900/90 px-1 py-0.2 rounded border border-cyan-500/40">
                      CORE
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5">
                    Equilibrium · Ambient
                  </span>
                </div>

                {/* Row 1, Col 2: Sunny ☀️ + VALENCE */}
                <div className="flex flex-col items-end justify-start p-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-teal-900/50 shadow-sm">
                    <span className="text-[9px] font-mono text-teal-300/90 bg-teal-950/80 px-1 py-0.2 rounded border border-teal-500/40">
                      + VALENCE
                    </span>
                    <span className="text-[11px] font-bold text-teal-300 uppercase tracking-wider">
                      {selectedQuadrant === 'sunny' && '✓ '}Sunny ☀️
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5 pr-1">
                    Mid Arousal · Warm Groove
                  </span>
                </div>

                {/* Row 2, Col 0: Melancholic */}
                <div className="flex flex-col items-start justify-end p-1">
                  <span className="text-[9px] text-slate-400 mb-0.5 pl-1">
                    Low Arousal · Downtempo
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-indigo-900/50 text-[11px] font-bold text-indigo-400 uppercase tracking-wider shadow-sm">
                    Melancholic {selectedQuadrant === 'melancholic' && '✓'}
                  </span>
                </div>

                {/* Row 2, Col 1: Bittersweet 🌸 - AROUSAL */}
                <div className="flex flex-col items-center justify-end p-1">
                  <span className="text-[9px] text-slate-400 mb-0.5">
                    Low Arousal · Contemplative
                  </span>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-violet-900/50 shadow-sm">
                    <span className="text-[11px] font-bold text-violet-300 uppercase tracking-wider">
                      Bittersweet 🌸 {selectedQuadrant === 'bittersweet' && '✓'}
                    </span>
                    <span className="text-[9px] font-mono text-violet-300/90 bg-violet-950/80 px-1 py-0.2 rounded border border-violet-500/40">
                      - AROUSAL
                    </span>
                  </div>
                </div>

                {/* Row 2, Col 2: Peaceful */}
                <div className="flex flex-col items-end justify-end p-1">
                  <span className="text-[9px] text-slate-400 mb-0.5 pr-1">
                    Low Arousal · Deep Focus
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs border border-cyan-900/50 text-[11px] font-bold text-cyan-400 uppercase tracking-wider shadow-sm">
                    {selectedQuadrant === 'peaceful' && '✓ '}Peaceful
                  </span>
                </div>
              </div>
            )}

            {/* 5. Axis Center Labels (ONLY shown in 4quadrants mode along crosshairs) */}
            {moodDisplayMode === '4quadrants' && (
              <>
                <span className="absolute left-1/2 -translate-x-1/2 top-2 text-[9px] font-medium text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800/80 pointer-events-none z-10">
                  + AROUSAL
                </span>
                <span className="absolute left-1/2 -translate-x-1/2 bottom-2 text-[9px] font-medium text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800/80 pointer-events-none z-10">
                  - AROUSAL
                </span>
                <span className="absolute top-1/2 -translate-y-1/2 left-2 text-[9px] font-medium text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800/80 pointer-events-none z-10">
                  - VALENCE
                </span>
                <span className="absolute top-1/2 -translate-y-1/2 right-2 text-[9px] font-medium text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800/80 pointer-events-none z-10">
                  + VALENCE
                </span>
              </>
            )}

            {/* Stable, Flicker-Free Hover Tooltip Positioned Absolute to Circumplex */}
            {hoveredTrack && (() => {
              const p = hoveredTrack.profile;
              if (!p) return null;
              const mood = getAffectiveMood(p.valence, p.arousal);
              const { cx, cy, xNum, yNum } = getCircumplexCoordinates(p.valence, p.arousal, moodDisplayMode);
              const isMatch = matchingTrackIds.has(hoveredTrack.id);

              const isUpperHalf = yNum < 50;
              const isFarLeft = xNum < 25;
              const isFarRight = xNum > 75;

              const xTranslate = isFarLeft
                ? 'translate-x-1'
                : isFarRight
                ? '-translate-x-[calc(100%-4px)]'
                : '-translate-x-1/2';
              const yTranslate = isUpperHalf
                ? 'translate-y-4'
                : '-translate-y-[calc(100%+14px)]';

              return (
                <div
                  className={`absolute z-50 pointer-events-none ${xTranslate} ${yTranslate} bg-slate-900/95 backdrop-blur-md border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[230px]`}
                  style={{ left: cx, top: cy }}
                >
                  <div className="font-semibold text-white truncate max-w-[240px]">
                    {hoveredTrack.title}
                  </div>
                  <div className="text-slate-400 truncate max-w-[240px]">
                    {hoveredTrack.artist}
                  </div>

                  {/* Nuanced Mood Badge + Subtitle */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800 text-[11px]">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${mood.badgeClass}`}>
                      {mood.label}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {mood.subtitle}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                      {hoveredTrack.profile?.camelotCode || '-'} ({hoveredTrack.profile?.key} {hoveredTrack.profile?.scale})
                    </span>
                    <span className="text-yellow-400 font-mono">
                      {Math.round(hoveredTrack.profile?.bpm || 0)} BPM
                    </span>
                    <span className="text-rose-400">
                      ⚡ {Math.round((hoveredTrack.profile?.energy || 0) * 100)}%
                    </span>
                  </div>

                  {mood?.isBoundary && (
                    <div className="text-[10px] text-amber-300/90 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                      Boundary Overlap: <span className="capitalize">{mood.primaryQuadrant}</span> ↔ <span className="capitalize">{mood.secondaryQuadrant || 'adjacent'}</span>
                    </div>
                  )}

                  <div className="text-[10px] text-cyan-400 pt-0.5 flex items-center justify-between">
                    <span>Click point to {activeAudio?.trackId === hoveredTrack.id && isPlaying ? 'pause' : 'play preview'}</span>
                    {!isMatch && <span className="text-amber-400 font-medium">(Filtered Out)</span>}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* 12-Segment Camelot Harmonic Wheel */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Disc className="w-4 h-4 text-indigo-400" />
                Camelot Harmonic Wheel
              </h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Notation Mode: Both | Camelot | Key */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-0.5 flex text-[10px]">
                  <button
                    type="button"
                    onClick={() => setCamelotNotation('both')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      camelotNotation === 'both' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Show both Camelot code (8B) and Musical Key (C)"
                  >
                    Both
                  </button>
                  <button
                    type="button"
                    onClick={() => setCamelotNotation('camelot')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      camelotNotation === 'camelot' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Show Camelot codes only (1A - 12B)"
                  >
                    Camelot
                  </button>
                  <button
                    type="button"
                    onClick={() => setCamelotNotation('musical')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      camelotNotation === 'musical' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Show musical keys only (C, Am, etc.)"
                  >
                    Keys
                  </button>
                </div>

                {/* Filter Mode: Harmonic Mix vs Exact Key */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-0.5 flex text-[10px]">
                  <button
                    type="button"
                    onClick={() => setCamelotFilterMode('compatible')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      camelotFilterMode === 'compatible'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Harmonic Mixing: Matches exact key, relative mode, adjacent fifths, and +2 boost"
                  >
                    Harmonic Mix
                  </button>
                  <button
                    type="button"
                    onClick={() => setCamelotFilterMode('exact')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      camelotFilterMode === 'exact'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Exact Key: Matches only tracks in this exact key"
                  >
                    Exact Key
                  </button>
                </div>

                {/* Circumplex Color Override */}
                <button
                  onClick={() => setOverrideScaleColor((prev) => !prev)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5 ${
                    overrideScaleColor
                      ? 'bg-gradient-to-r from-emerald-600 to-indigo-600 text-white border-indigo-400 shadow-md ring-1 ring-indigo-400/50'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:text-white hover:bg-slate-700'
                  }`}
                  title="Override circumplex scatterplot dot colors to display Major (Emerald) vs Minor (Indigo)"
                >
                  <span className="flex items-center -space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 border border-slate-900" />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 border border-slate-900" />
                  </span>
                  <span>{overrideScaleColor ? 'Scale Colors: ON' : 'Color by Scale'}</span>
                </button>

                {selectedCamelotKey !== 'all' && (
                  <button
                    onClick={() => setSelectedCamelotKey('all')}
                    className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 bg-rose-500/10 rounded-lg border border-rose-500/30 transition-colors"
                    title="Reset Camelot key filter"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {selectedCamelotKey !== 'all' ? (
              <div className="mb-3 px-3 py-1.5 bg-slate-950/80 border border-indigo-500/30 rounded-lg flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${selectedCamelotKey.endsWith('B') ? 'bg-emerald-400' : 'bg-indigo-400'} animate-pulse`} />
                  <span className="text-white font-medium">
                    {selectedCamelotKey} · {CAMELOT_TO_KEY_MAP[selectedCamelotKey]?.fullName}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    {camelotFilterMode === 'compatible' ? '(Harmonic Mix · 5 Compatible Keys)' : '(Exact Key Only)'}
                  </span>
                </div>
                <span className="text-indigo-400 font-semibold font-mono">
                  {filteredTracks.length} tracks
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-3">
                Click a sector to filter compatible tracks. Outer: <span className="text-emerald-400 font-medium">Major (B)</span>, Inner: <span className="text-indigo-400 font-medium">Minor (A)</span>.
              </p>
            )}
          </div>

          {/* SVG Camelot Circular Wheel */}
          <div className="relative w-64 h-64 mx-auto">
            <svg viewBox="0 0 200 200" className="w-full h-full select-none">
              <defs>
                <radialGradient id="wheelCenterGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#1e1b4b" />
                  <stop offset="100%" stopColor="#0f172a" />
                </radialGradient>
                <filter id="hubGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* 12 Sectors: Outer (B) and Inner (A) */}
              {Array.from({ length: 12 }, (_, i) => {
                const keyNum = i + 1;
                const angle = (keyNum - 1) * 30 - 90; // 1 at 12 o'clock
                const rad = (angle * Math.PI) / 180;
                const radNext = ((angle + 30) * Math.PI) / 180;

                const bCode = `${keyNum}B`;
                const aCode = `${keyNum}A`;

                const bDetails = CAMELOT_TO_KEY_MAP[bCode] || { shortName: bCode, fullName: bCode, scale: 'major' };
                const aDetails = CAMELOT_TO_KEY_MAP[aCode] || { shortName: aCode, fullName: aCode, scale: 'minor' };

                const countFilteredB = camelotKeyDistribution.filtered[bCode] || 0;
                const countTotalB = camelotKeyDistribution.total[bCode] || 0;
                const countFilteredA = camelotKeyDistribution.filtered[aCode] || 0;
                const countTotalA = camelotKeyDistribution.total[aCode] || 0;

                const isSelectedB = selectedCamelotKey === bCode;
                const isSelectedA = selectedCamelotKey === aCode;

                const activeKey = hoveredCamelotSector || (selectedCamelotKey !== 'all' ? selectedCamelotKey : null);

                // Outer Arc (Major: 1B - 12B) from r=65 to r=95
                const x1Out = 100 + 95 * Math.cos(rad);
                const y1Out = 100 + 95 * Math.sin(rad);
                const x2Out = 100 + 95 * Math.cos(radNext);
                const y2Out = 100 + 95 * Math.sin(radNext);
                const x3Out = 100 + 65 * Math.cos(radNext);
                const y3Out = 100 + 65 * Math.sin(radNext);
                const x4Out = 100 + 65 * Math.cos(rad);
                const y4Out = 100 + 65 * Math.sin(rad);

                const dOuter = `M ${x1Out} ${y1Out} A 95 95 0 0 1 ${x2Out} ${y2Out} L ${x3Out} ${y3Out} A 65 65 0 0 0 ${x4Out} ${y4Out} Z`;

                // Inner Arc (Minor: 1A - 12A) from r=35 to r=63
                const x1In = 100 + 63 * Math.cos(rad);
                const y1In = 100 + 63 * Math.sin(rad);
                const x2In = 100 + 63 * Math.cos(radNext);
                const y2In = 100 + 63 * Math.sin(radNext);
                const x3In = 100 + 35 * Math.cos(radNext);
                const y3In = 100 + 35 * Math.sin(radNext);
                const x4In = 100 + 35 * Math.cos(rad);
                const y4In = 100 + 35 * Math.sin(rad);

                const dInner = `M ${x1In} ${y1In} A 63 63 0 0 1 ${x2In} ${y2In} L ${x3In} ${y3In} A 35 35 0 0 0 ${x4In} ${y4In} Z`;

                const midAngle = angle + 15;
                const midRad = (midAngle * Math.PI) / 180;
                const textXOut = 100 + 80 * Math.cos(midRad);
                const textYOut = 100 + 80 * Math.sin(midRad);

                const textXIn = 100 + 49 * Math.cos(midRad);
                const textYIn = 100 + 49 * Math.sin(midRad);

                // Styling for Major Outer (B)
                let fillB = '#0f172a';
                let strokeB = '#0f172a';
                let strokeWidthB = '1.5';
                let opacityB = 1;
                let relLabelB = '';

                if (activeKey) {
                  const rel = getHarmonicRelationship(activeKey, bCode);
                  relLabelB = rel.label;
                  if (rel.type === 'exact') {
                    fillB = '#059669';
                    strokeB = '#38bdf8';
                    strokeWidthB = '3';
                    opacityB = 1;
                  } else if (rel.type === 'relative') {
                    fillB = '#065f46';
                    strokeB = '#c084fc';
                    strokeWidthB = '2.5';
                    opacityB = 1;
                  } else if (rel.type === 'adjacent_dominant' || rel.type === 'adjacent_subdominant') {
                    fillB = '#065f46';
                    strokeB = '#38bdf8';
                    strokeWidthB = '2';
                    opacityB = 1;
                  } else if (rel.type === 'energy_boost') {
                    fillB = '#065f46';
                    strokeB = '#fbbf24';
                    strokeWidthB = '2';
                    opacityB = 1;
                  } else {
                    fillB = countTotalB > 0 ? '#064e3b' : '#082f24';
                    strokeB = '#0f172a';
                    strokeWidthB = '1';
                    opacityB = 0.28;
                  }
                } else {
                  if (countTotalB === 0) {
                    fillB = '#0b1f19';
                    strokeB = '#0f172a';
                    opacityB = 0.7;
                  } else {
                    const ratio = Math.min(1, 0.40 + 0.60 * (countTotalB / (camelotKeyDistribution.maxTotal || 1)));
                    fillB = `rgba(5, 150, 105, ${ratio.toFixed(2)})`;
                    strokeB = isSelectedB ? '#34d399' : '#0f172a';
                    strokeWidthB = isSelectedB ? '2.5' : '1.5';
                    opacityB = 1;
                  }
                }

                // Styling for Minor Inner (A)
                let fillA = '#0f172a';
                let strokeA = '#0f172a';
                let strokeWidthA = '1.5';
                let opacityA = 1;
                let relLabelA = '';

                if (activeKey) {
                  const rel = getHarmonicRelationship(activeKey, aCode);
                  relLabelA = rel.label;
                  if (rel.type === 'exact') {
                    fillA = '#4f46e5';
                    strokeA = '#38bdf8';
                    strokeWidthA = '3';
                    opacityA = 1;
                  } else if (rel.type === 'relative') {
                    fillA = '#3730a3';
                    strokeA = '#c084fc';
                    strokeWidthA = '2.5';
                    opacityA = 1;
                  } else if (rel.type === 'adjacent_dominant' || rel.type === 'adjacent_subdominant') {
                    fillA = '#3730a3';
                    strokeA = '#38bdf8';
                    strokeWidthA = '2';
                    opacityA = 1;
                  } else if (rel.type === 'energy_boost') {
                    fillA = '#3730a3';
                    strokeA = '#fbbf24';
                    strokeWidthA = '2';
                    opacityA = 1;
                  } else {
                    fillA = countTotalA > 0 ? '#1e1b4b' : '#10142e';
                    strokeA = '#0f172a';
                    strokeWidthA = '1';
                    opacityA = 0.28;
                  }
                } else {
                  if (countTotalA === 0) {
                    fillA = '#12142e';
                    strokeA = '#0f172a';
                    opacityA = 0.7;
                  } else {
                    const ratio = Math.min(1, 0.40 + 0.60 * (countTotalA / (camelotKeyDistribution.maxTotal || 1)));
                    fillA = `rgba(79, 70, 229, ${ratio.toFixed(2)})`;
                    strokeA = isSelectedA ? '#818cf8' : '#0f172a';
                    strokeWidthA = isSelectedA ? '2.5' : '1.5';
                    opacityA = 1;
                  }
                }

                return (
                  <g key={keyNum}>
                    {/* Outer Major Path */}
                    <path
                      d={dOuter}
                      fill={fillB}
                      stroke={strokeB}
                      strokeWidth={strokeWidthB}
                      opacity={opacityB}
                      className="cursor-pointer transition-all duration-150 hover:brightness-125"
                      onClick={() =>
                        setSelectedCamelotKey(selectedCamelotKey === bCode ? 'all' : bCode)
                      }
                      onMouseEnter={() => setHoveredCamelotSector(bCode)}
                      onMouseLeave={() => setHoveredCamelotSector(null)}
                    >
                      <title>{`${bCode} (${bDetails.fullName}): ${countFilteredB} matching, ${countTotalB} total in library${relLabelB ? ` · ${relLabelB}` : ''}`}</title>
                    </path>

                    {/* Outer Major Text */}
                    {camelotNotation === 'both' ? (
                      <g className="pointer-events-none" opacity={opacityB}>
                        <text
                          x={textXOut}
                          y={textYOut - 4}
                          fill={countTotalB > 0 || isSelectedB ? '#ffffff' : '#475569'}
                          fontSize="8.5"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {bCode}
                        </text>
                        <text
                          x={textXOut}
                          y={textYOut + 5}
                          fill={countTotalB > 0 || isSelectedB ? '#a7f3d0' : '#334155'}
                          fontSize="6.5"
                          fontWeight="medium"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {bDetails.shortName}
                          {countTotalB > 0 && ` (${countTotalB})`}
                        </text>
                      </g>
                    ) : camelotNotation === 'musical' ? (
                      <g className="pointer-events-none" opacity={opacityB}>
                        <text
                          x={textXOut}
                          y={textYOut - 3}
                          fill={countTotalB > 0 || isSelectedB ? '#ffffff' : '#475569'}
                          fontSize="8.5"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {bDetails.shortName}
                        </text>
                        {countTotalB > 0 && (
                          <text
                            x={textXOut}
                            y={textYOut + 5.5}
                            fill="#a7f3d0"
                            fontSize="6"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {countTotalB}
                          </text>
                        )}
                      </g>
                    ) : (
                      <g className="pointer-events-none" opacity={opacityB}>
                        <text
                          x={textXOut}
                          y={textYOut - (countTotalB > 0 ? 3 : 0)}
                          fill={countTotalB > 0 || isSelectedB ? '#ffffff' : '#475569'}
                          fontSize="9"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {bCode}
                        </text>
                        {countTotalB > 0 && (
                          <text
                            x={textXOut}
                            y={textYOut + 5.5}
                            fill="#a7f3d0"
                            fontSize="6"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {countTotalB}
                          </text>
                        )}
                      </g>
                    )}

                    {/* Inner Minor Path */}
                    <path
                      d={dInner}
                      fill={fillA}
                      stroke={strokeA}
                      strokeWidth={strokeWidthA}
                      opacity={opacityA}
                      className="cursor-pointer transition-all duration-150 hover:brightness-125"
                      onClick={() =>
                        setSelectedCamelotKey(selectedCamelotKey === aCode ? 'all' : aCode)
                      }
                      onMouseEnter={() => setHoveredCamelotSector(aCode)}
                      onMouseLeave={() => setHoveredCamelotSector(null)}
                    >
                      <title>{`${aCode} (${aDetails.fullName}): ${countFilteredA} matching, ${countTotalA} total in library${relLabelA ? ` · ${relLabelA}` : ''}`}</title>
                    </path>

                    {/* Inner Minor Text */}
                    {camelotNotation === 'both' ? (
                      <g className="pointer-events-none" opacity={opacityA}>
                        <text
                          x={textXIn}
                          y={textYIn - 3.5}
                          fill={countTotalA > 0 || isSelectedA ? '#ffffff' : '#475569'}
                          fontSize="7.5"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {aCode}
                        </text>
                        <text
                          x={textXIn}
                          y={textYIn + 4.5}
                          fill={countTotalA > 0 || isSelectedA ? '#c7d2fe' : '#334155'}
                          fontSize="5.5"
                          fontWeight="medium"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {aDetails.shortName}
                          {countTotalA > 0 && ` (${countTotalA})`}
                        </text>
                      </g>
                    ) : camelotNotation === 'musical' ? (
                      <g className="pointer-events-none" opacity={opacityA}>
                        <text
                          x={textXIn}
                          y={textYIn - 2.5}
                          fill={countTotalA > 0 || isSelectedA ? '#ffffff' : '#475569'}
                          fontSize="7.5"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {aDetails.shortName}
                        </text>
                        {countTotalA > 0 && (
                          <text
                            x={textXIn}
                            y={textYIn + 4.5}
                            fill="#c7d2fe"
                            fontSize="5"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {countTotalA}
                          </text>
                        )}
                      </g>
                    ) : (
                      <g className="pointer-events-none" opacity={opacityA}>
                        <text
                          x={textXIn}
                          y={textYIn - (countTotalA > 0 ? 2.5 : 0)}
                          fill={countTotalA > 0 || isSelectedA ? '#ffffff' : '#475569'}
                          fontSize="8"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {aCode}
                        </text>
                        {countTotalA > 0 && (
                          <text
                            x={textXIn}
                            y={textYIn + 4.5}
                            fill="#c7d2fe"
                            fontSize="5"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {countTotalA}
                          </text>
                        )}
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Dynamic Center Hub */}
              <circle
                cx="100"
                cy="100"
                r="33"
                fill="url(#wheelCenterGrad)"
                stroke={hoveredCamelotSector || selectedCamelotKey !== 'all' ? '#38bdf8' : '#334155'}
                strokeWidth={hoveredCamelotSector || selectedCamelotKey !== 'all' ? '1.5' : '1'}
                className="transition-colors"
              />
              {(() => {
                const activeKey = hoveredCamelotSector || (selectedCamelotKey !== 'all' ? selectedCamelotKey : null);
                if (activeKey) {
                  const details = CAMELOT_TO_KEY_MAP[activeKey] || { code: activeKey, fullName: activeKey, scale: 'major' };
                  const countTotal = camelotKeyDistribution.total[activeKey] || 0;
                  const rel = (selectedCamelotKey !== 'all' && selectedCamelotKey !== activeKey)
                    ? getHarmonicRelationship(selectedCamelotKey, activeKey)
                    : null;
                  const isTarget = activeKey === selectedCamelotKey;

                  return (
                    <g className="pointer-events-none select-none">
                      <text
                        x="100"
                        y="84"
                        fill={details.scale === 'major' ? '#34d399' : '#818cf8'}
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {details.code}
                      </text>
                      <text
                        x="100"
                        y="96"
                        fill="#ffffff"
                        fontSize="8"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {details.fullName}
                      </text>
                      <text
                        x="100"
                        y="107"
                        fill="#94a3b8"
                        fontSize="7"
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {countTotal} {countTotal === 1 ? 'track' : 'tracks'} ({Math.round((countTotal / Math.max(1, tracks.length)) * 100)}%)
                      </text>
                      <text
                        x="100"
                        y="118"
                        fill={
                          rel
                            ? (rel.type === 'relative'
                                ? '#c084fc'
                                : rel.type === 'energy_boost'
                                ? '#fbbf24'
                                : '#38bdf8')
                            : isTarget
                            ? '#34d399'
                            : '#64748b'
                        }
                        fontSize="6.5"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {rel ? rel.shortLabel : isTarget ? (camelotFilterMode === 'compatible' ? 'Harmonic Mix' : 'Exact Filter') : 'Click to filter'}
                      </text>
                    </g>
                  );
                }

                return (
                  <g className="pointer-events-none select-none">
                    <text
                      x="100"
                      y="87"
                      fill="#38bdf8"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      CAMELOT
                    </text>
                    <text
                      x="100"
                      y="99"
                      fill="#ffffff"
                      fontSize="8.5"
                      fontWeight="semibold"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {tracks.length} Tracks
                    </text>
                    <text
                      x="100"
                      y="111"
                      fill="#a5b4fc"
                      fontSize="7"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      Top: {stats.dominantCamelot || '-'}
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Interactive Legend & Harmonic Relationship Guide */}
          <div className="mt-3 pt-3 border-t border-slate-800 text-xs">
            {hoveredCamelotSector || selectedCamelotKey !== 'all' ? (
              <div className="flex items-center justify-center gap-3 flex-wrap text-[11px] text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-slate-900 ring-1 ring-cyan-400/50" />
                  <span>Target / ±1 Fifth</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400 border border-slate-900 ring-1 ring-purple-400/50" />
                  <span>Relative</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-900 ring-1 ring-amber-400/50" />
                  <span>+2 Boost</span>
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-slate-700" />
                  <span>Divergent</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Major (B)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    Minor (A)
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <span>Intensity:</span>
                  <span className="w-8 h-2 rounded bg-gradient-to-r from-emerald-950 to-emerald-500 inline-block border border-slate-700/50" />
                  <span>Track Density</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Triage & Filter Control Strip */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by artist, title, or album..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Dual-Layer Mode Selector & Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Switcher */}
            <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 p-0.5 rounded-xl text-xs">
              <button
                onClick={() => {
                  setMoodDisplayMode('4quadrants');
                  if (
                    selectedQuadrant === 'driving' ||
                    selectedQuadrant === 'moody' ||
                    selectedQuadrant === 'bittersweet' ||
                    selectedQuadrant === 'sunny' ||
                    selectedQuadrant === 'balanced'
                  ) {
                    setSelectedQuadrant('all');
                  }
                }}
                className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                  moodDisplayMode === '4quadrants'
                    ? 'bg-indigo-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Classic 4-Quadrant View (Euphoric, Tense, Melancholic, Peaceful)"
              >
                4 Quadrants
              </button>
              <button
                onClick={() => setMoodDisplayMode('8octants')}
                className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                  moodDisplayMode === '8octants'
                    ? 'bg-indigo-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="8-Octant Affective View (with Bittersweet, Driving, Moody, Sunny, Balanced)"
              >
                8 Mood Octants
              </button>
            </div>

            {/* Boundary Overlap Toggle (for 4-Quadrant mode) */}
            {moodDisplayMode === '4quadrants' && (
              <button
                onClick={() => setIncludeBoundaryOverlap(!includeBoundaryOverlap)}
                className={`px-2.5 py-1 text-xs rounded-xl border transition-colors whitespace-nowrap ${
                  includeBoundaryOverlap
                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                    : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-400'
                }`}
                title="Include tracks in the boundary overlap layer that share emotional similarity across axes"
              >
                Overlap Layer: {includeBoundaryOverlap ? 'ON (±15%)' : 'OFF'}
              </button>
            )}

            {/* Dynamic Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
              <button
                onClick={() => setSelectedQuadrant('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  selectedQuadrant === 'all'
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>

              {moodDisplayMode === '4quadrants' ? (
                <>
                  <button
                    onClick={() => setSelectedQuadrant('euphoric')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'euphoric'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-emerald-400/80 hover:text-emerald-300'
                    }`}
                  >
                    Euphoric
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('tense')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'tense'
                        ? 'bg-rose-600 text-white shadow'
                        : 'text-rose-400/80 hover:text-rose-300'
                    }`}
                  >
                    Tense
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('melancholic')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'melancholic'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-indigo-400/80 hover:text-indigo-300'
                    }`}
                  >
                    Melancholic
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('peaceful')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'peaceful'
                        ? 'bg-cyan-600 text-white shadow'
                        : 'text-cyan-400/80 hover:text-cyan-300'
                    }`}
                  >
                    Peaceful
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSelectedQuadrant('euphoric')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'euphoric'
                        ? 'bg-emerald-600 text-white'
                        : 'text-emerald-400 hover:text-white'
                    }`}
                  >
                    Euphoric
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('driving')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'driving'
                        ? 'bg-amber-600 text-white'
                        : 'text-amber-400 hover:text-white'
                    }`}
                    title="Border: High Arousal, Neutral Valence"
                  >
                    Driving ⚡
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('tense')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'tense'
                        ? 'bg-rose-600 text-white'
                        : 'text-rose-400 hover:text-white'
                    }`}
                  >
                    Tense
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('moody')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'moody'
                        ? 'bg-fuchsia-600 text-white'
                        : 'text-fuchsia-400 hover:text-white'
                    }`}
                    title="Border: Restless, Mid-Energy Dark"
                  >
                    Moody
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('melancholic')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'melancholic'
                        ? 'bg-indigo-600 text-white'
                        : 'text-indigo-400 hover:text-white'
                    }`}
                  >
                    Melancholic
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('bittersweet')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'bittersweet'
                        ? 'bg-violet-600 text-white'
                        : 'text-violet-400 hover:text-white'
                    }`}
                    title="Border: Low Energy Contemplative / Nostalgic (e.g. Kentaro)"
                  >
                    Bittersweet 🌸
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('peaceful')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'peaceful'
                        ? 'bg-cyan-600 text-white'
                        : 'text-cyan-400 hover:text-white'
                    }`}
                  >
                    Peaceful
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('sunny')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'sunny'
                        ? 'bg-teal-600 text-white'
                        : 'text-teal-400 hover:text-white'
                    }`}
                    title="Border: Gentle Warm Groove"
                  >
                    Sunny ☀️
                  </button>
                  <button
                    onClick={() => setSelectedQuadrant('balanced')}
                    className={`px-2 py-0.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedQuadrant === 'balanced'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Core: Neutral / Ambient Centered"
                  >
                    Balanced ⚖️
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Multi-Criteria Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-800/80 text-xs">
          {/* BPM Filter */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>BPM Range:</span>
              <span className="font-mono text-cyan-400">
                {minBpm} - {maxBpm} BPM
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="50"
                max="140"
                value={minBpm}
                onChange={(e) => setMinBpm(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <input
                type="range"
                min="140"
                max="220"
                value={maxBpm}
                onChange={(e) => setMaxBpm(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
          </div>

          {/* Min Energy */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Min Energy:</span>
              <span className="font-mono text-rose-400">{Math.round(minEnergy * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={minEnergy}
              onChange={(e) => setMinEnergy(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
          </div>

          {/* Min Danceability */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Min Danceability:</span>
              <span className="font-mono text-purple-400">{Math.round(minDanceability * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={minDanceability}
              onChange={(e) => setMinDanceability(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
          </div>

          {/* Camelot Dropdown & Anchor Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1.5">
              <span className="text-slate-400 block">Camelot Key:</span>
              <select
                value={selectedCamelotKey}
                onChange={(e) => setSelectedCamelotKey(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Keys (1A - 12B)</option>
                {Array.from({ length: 12 }, (_, i) => i + 1)
                  .flatMap((num) => [`${num}B`, `${num}A`])
                  .map((code) => {
                    const details = CAMELOT_TO_KEY_MAP[code];
                    const count = camelotKeyDistribution.total[code] || 0;
                    return (
                      <option key={code} value={code}>
                        {code} · {details.fullName} ({details.shortName}) {count > 0 ? `[${count}]` : ''}
                      </option>
                    );
                  })}
              </select>
            </div>

            {harmonicAnchorTrack && (
              <button
                onClick={() => setHarmonicFilterActive(!harmonicFilterActive)}
                className={`mt-5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  harmonicFilterActive
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Harmonic Only
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Acoustic Triage Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">
              Triage Results ({filteredTracks.length})
            </h3>
            {filteredTracks.length !== tracks.length && (
              <span className="text-xs text-slate-500">
                (filtered from {tracks.length} total)
              </span>
            )}
          </div>

          {/* Complete Foundational Exporters & Pipeline Bridges */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Pipeline Bridge: Stage to Discovery Triage (Module 14) */}
            <button
              onClick={handleStageToTriage}
              disabled={filteredTracks.length === 0}
              className="px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
              title="Stage filtered tracks directly into Module 14 (Discovery Triage)"
            >
              <Compass className="w-3.5 h-3.5" />
              Stage to Triage ({filteredTracks.length})
            </button>

            {/* TuneMyMusic CSV */}
            <button
              onClick={handleExportTuneMyMusicCSV}
              disabled={filteredTracks.length === 0}
              className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 text-emerald-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Export CSV for TuneMyMusic import into Spotify / Apple / YouTube Music (with UTF-8 BOM)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              TuneMyMusic CSV
            </button>

            {/* Harmonic DJ Set M3U */}
            <button
              onClick={handleExportDJSet}
              disabled={filteredTracks.length === 0}
              className="px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Export as M3U with Camelot & BPM tags for Serato, Traktor, Rekordbox, Musicolet"
            >
              <Music className="w-3.5 h-3.5" />
              Harmonic M3U
            </button>

            {/* Study Focus M3U */}
            <button
              onClick={handleExportFocusSet}
              disabled={tracks.filter((t) => t.profile && t.profile.arousal <= 0 && t.profile.valence >= 0).length === 0}
              className="px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 text-cyan-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Export study & focus tracks (Low Arousal, Positive Valence)"
            >
              <Headphones className="w-3.5 h-3.5" />
              Focus M3U
            </button>

            {/* Downloader TXT */}
            <button
              onClick={handleExportDownloaderTXT}
              disabled={filteredTracks.length === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
              title="Export Artist - Title per line for yt-dlp / spotdl batch downloading"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              Downloader TXT
            </button>

            {/* Dense Acoustic CSV */}
            <button
              onClick={handleExportAcousticCSV}
              disabled={filteredTracks.length === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
              title="Export full 14-column acoustic profile spreadsheet (with UTF-8 BOM)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
              Acoustic CSV
            </button>

            {/* Copy TSV */}
            <button
              onClick={handleCopyTSV}
              disabled={filteredTracks.length === 0}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
              title="Copy tab-separated values to clipboard for Excel / Google Sheets"
            >
              <Copy className="w-3.5 h-3.5" />
              TSV
            </button>

            {/* Session JSON */}
            <button
              onClick={handleExportSessionJSON}
              disabled={tracks.length === 0}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
              title="Download full session backup JSON"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </button>

            {/* Clear All */}
            <button
              onClick={() => setTracks([])}
              disabled={tracks.length === 0}
              className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-colors border border-red-500/20 disabled:opacity-50"
              title="Clear all tracks"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        {filteredTracks.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-4">
            <Disc className="w-12 h-12 mx-auto text-slate-600 animate-pulse" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-300">No tracks in acoustic triage queue</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Import playlists or audio files (.csv, .m3u, .txt, .json, .mp3, .wav), paste a tracklist, or load your enriched database.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-medium flex items-center gap-2 transition-colors border border-slate-700"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                Import Files (CSV, M3U, TXT, JSON, Audio)
              </button>
              <button
                onClick={() => setIsPasteModalOpen(true)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-medium flex items-center gap-2 transition-colors border border-slate-700"
              >
                <FileText className="w-4 h-4 text-cyan-400" />
                Paste Tracklist
              </button>
              <button
                onClick={handleImportFromDB}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-medium flex items-center gap-2 transition-colors border border-slate-700"
              >
                <Layers className="w-4 h-4 text-purple-400" />
                Load from Metadata DB
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">Play</th>
                  <th className="py-3 px-4">Track Details</th>
                  <th className="py-3 px-4 text-center">Camelot</th>
                  <th className="py-3 px-4 text-center">Key / Scale</th>
                  <th className="py-3 px-4 text-center">BPM</th>
                  <th className="py-3 px-4">Energy</th>
                  <th className="py-3 px-4">Danceability</th>
                  <th className="py-3 px-4 text-center">
                    {moodDisplayMode === '4quadrants' ? 'Mood Quadrant' : 'Affective Mood'}
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTracks.map((item) => {
                  const p = item.profile;
                  const isCurrentPlaying = activeAudio?.trackId === item.id && isPlaying;
                  const isAnchor = harmonicAnchorId === item.id;
                  const isAnalyzingRow = item.status === 'analyzing';
                  const isFailedRow = item.status === 'error';

                  // Dual-layer Mood Resolver
                  const mood = p ? getAffectiveMood(p.valence, p.arousal) : null;
                  let displayLabel = '-';
                  let displayBadge = 'bg-slate-800 text-slate-400';
                  let secondaryTag = '';

                  if (mood) {
                    if (moodDisplayMode === '4quadrants') {
                      // Classic 4-quadrant display
                      displayLabel = mood.primaryQuadrant.charAt(0).toUpperCase() + mood.primaryQuadrant.slice(1);
                      if (mood.primaryQuadrant === 'euphoric') {
                        displayBadge = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
                      } else if (mood.primaryQuadrant === 'tense') {
                        displayBadge = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
                      } else if (mood.primaryQuadrant === 'melancholic') {
                        displayBadge = 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
                      } else {
                        displayBadge = 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
                      }
                      if (mood.isBoundary) {
                        secondaryTag = mood.category === 'balanced' ? 'Balanced' : mood.label;
                      }
                    } else {
                      // 8-octant nuanced display
                      displayLabel = mood.label;
                      displayBadge = mood.badgeClass;
                      if (mood.isBoundary && mood.secondaryQuadrant) {
                        secondaryTag = `↔ ${mood.secondaryQuadrant.charAt(0).toUpperCase() + mood.secondaryQuadrant.slice(1)}`;
                      }
                    }
                  }

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isAnalyzingRow ? 'bg-cyan-950/40 ring-1 ring-cyan-500/50' : ''
                      } ${isCurrentPlaying ? 'bg-cyan-950/20' : ''} ${isAnchor ? 'bg-amber-950/20' : ''}`}
                    >
                      {/* Play Preview Button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleTogglePlay(item)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            isCurrentPlaying
                              ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                          title={isCurrentPlaying ? 'Pause' : 'Play Preview'}
                        >
                          {isCurrentPlaying ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5" />
                          )}
                        </button>
                      </td>

                      {/* Track Details */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-white truncate max-w-xs flex items-center gap-1.5">
                          {isAnalyzingRow && (
                            <RefreshCw className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />
                          )}
                          <span className="truncate">{item.title}</span>
                        </div>
                        <div className="text-slate-400 text-[11px] truncate max-w-xs">
                          {item.artist} {item.album && `· ${item.album}`}
                        </div>
                      </td>

                      {/* Camelot Badge */}
                      <td className="py-3 px-4 text-center">
                        {p?.camelotCode ? (
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono font-bold text-xs ${
                              p.scale === 'minor'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {p.camelotCode}
                          </span>
                        ) : isAnalyzingRow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                            DSP
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Key / Scale */}
                      <td className="py-3 px-4 text-center font-mono text-[11px]">
                        {p ? (
                          <span>
                            {p.key} {p.scale}
                          </span>
                        ) : isAnalyzingRow ? (
                          <span className="text-cyan-400 text-[11px] font-mono animate-pulse">Extracting...</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* BPM */}
                      <td className="py-3 px-4 text-center">
                        {p?.bpm ? (
                          <div
                            className="inline-flex flex-col items-center group relative cursor-help"
                            title={
                              p.bpmDetails
                                ? `3-Tier Consensus: Onset ${p.bpmDetails.rhythmBpm} BPM · Macro ${p.bpmDetails.percivalBpm} BPM · Bass Pulse ${p.bpmDetails.bassBpm} BPM${
                                    p.bpmDetails.vocalFolded ? ' (Vocal-aware fundamental lock)' : ''
                                  } · Confidence: ${Math.round((p.bpmConfidence ?? 0.85) * 100)}%`
                                : `BPM Confidence: ${Math.round((p.bpmConfidence ?? 0.85) * 100)}%`
                            }
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-mono text-yellow-400 font-semibold">
                                {Math.round(p.bpm)}
                              </span>
                              {p.bpmDetails?.vocalFolded && (
                                <span
                                  className="text-[9px] px-1 py-0.2 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-500/40 font-mono"
                                  title="Vocal-aware fundamental lock"
                                >
                                  1×
                                </span>
                              )}
                            </div>
                            {p.bpmConfidence !== undefined && (
                              <span className="text-[9px] font-mono text-slate-400">
                                {Math.round(p.bpmConfidence * 100)}%
                              </span>
                            )}
                          </div>
                        ) : isAnalyzingRow ? (
                          <span className="text-yellow-400/80 font-mono text-xs animate-pulse">Detecting...</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Energy */}
                      <td className="py-3 px-4">
                        {p ? (
                          <div className="w-24 space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>⚡</span>
                              <span>{Math.round(p.energy * 100)}%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-rose-500 h-1.5 rounded-full"
                                style={{ width: `${p.energy * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : isAnalyzingRow ? (
                          <div className="w-24 space-y-1">
                            <div className="flex justify-between text-[10px] text-cyan-400/70">
                              <span>⚡</span>
                              <span className="animate-pulse">Analyzing</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-cyan-500/60 h-1.5 rounded-full w-full animate-pulse" />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Danceability */}
                      <td className="py-3 px-4">
                        {p ? (
                          <div className="w-24 space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>🕺</span>
                              <span>{Math.round(p.danceability * 100)}%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-purple-500 h-1.5 rounded-full"
                                style={{ width: `${p.danceability * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : isAnalyzingRow ? (
                          <div className="w-24 space-y-1">
                            <div className="flex justify-between text-[10px] text-purple-400/70">
                              <span>🕺</span>
                              <span className="animate-pulse">Analyzing</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-purple-500/60 h-1.5 rounded-full w-full animate-pulse" />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Mood Quadrant / Octant */}
                      <td className="py-3 px-4 text-center">
                        {mood && p ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${displayBadge}`}
                              title={`${mood.label} (${mood.subtitle}) — Valence: ${p.valence.toFixed(2)}, Arousal: ${p.arousal.toFixed(2)}`}
                            >
                              {displayLabel}
                            </span>
                            {secondaryTag && (
                              <span
                                className="text-[9px] text-slate-400 font-mono"
                                title={`Boundary Overlap: Primary ${mood.primaryQuadrant} with ${mood.secondaryQuadrant || 'adjacent'} overlap`}
                              >
                                {secondaryTag}
                              </span>
                            )}
                          </div>
                        ) : isAnalyzingRow ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 animate-pulse">
                            Analyzing
                          </span>
                        ) : isFailedRow ? (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950/60 text-rose-300 border border-rose-800/50"
                            title={item.errorMessage || 'Failed to analyze track'}
                          >
                            Failed
                          </span>
                        ) : (
                          <span className="text-slate-600 text-[10px]">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {p && !isAnalyzingRow && (
                          <button
                            onClick={() => handleAnalyzeSingleTrack(item)}
                            disabled={isAnalyzing}
                            className="px-2 py-1 rounded text-[11px] font-medium transition-colors bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/50 hover:border-slate-500 disabled:opacity-40"
                            title="Re-analyze track with 3-tier vocal-aware engine"
                          >
                            Re-analyze
                          </button>
                        )}
                        {(!p || isFailedRow) && (
                          <button
                            onClick={() => handleAnalyzeSingleTrack(item)}
                            disabled={isAnalyzing}
                            className="px-2 py-1 rounded text-[11px] font-medium transition-colors bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/50 hover:border-cyan-500 disabled:opacity-40"
                            title="Analyze this track individually"
                          >
                            {isFailedRow ? 'Retry' : 'Analyze'}
                          </button>
                        )}

                        <button
                          onClick={() => {
                            if (isAnchor) {
                              setHarmonicAnchorId(null);
                              setHarmonicFilterActive(false);
                            } else {
                              setHarmonicAnchorId(item.id);
                              setHarmonicFilterActive(true);
                            }
                          }}
                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                            isAnchor
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                          title="Set as reference track to filter harmonically compatible songs"
                        >
                          {isAnchor ? 'Anchor ✓' : 'Anchor'}
                        </button>

                        <button
                          onClick={() => setTracks(tracks.filter((t) => t.id !== item.id))}
                          className="p-1 hover:bg-slate-800 text-slate-500 hover:text-red-400 rounded transition-colors"
                          title="Remove track"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paste / Multi-Format Import Modal */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  Import Tracklist / Playlist Text
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Paste TuneMyMusic CSV, Downloader TXT, M3U playlist, TSV, or Session JSON.
                </p>
              </div>
              {detectedFormat && detectedFormat.format !== 'empty' && (
                <span className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-full text-[11px] font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {detectedFormat.label}
                </span>
              )}
            </div>

            {/* Format Example Pills */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className="text-slate-500 font-medium">Examples:</span>
              <button
                type="button"
                onClick={() =>
                  setPasteText(
                    `Artist,Track,Album\nDaft Punk,One More Time,Discovery\nBillie Eilish,when the party's over,WHEN WE ALL FALL ASLEEP\nMiles Davis,So What,Kind of Blue`
                  )
                }
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                TuneMyMusic CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  setPasteText(
                    `Daft Punk - One More Time\nBillie Eilish - when the party's over\nMiles Davis - So What\nMetallica - Master of Puppets`
                  )
                }
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Downloader TXT
              </button>
              <button
                type="button"
                onClick={() =>
                  setPasteText(
                    `#EXTM3U\n#EXTINF:320,[10B] 123BPM Daft Punk - One More Time\n#EXTINF:196,[12B] Billie Eilish - when the party's over\n#EXTINF:562,[7A] 136BPM Miles Davis - So What`
                  )
                }
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Harmonic M3U
              </button>
            </div>

            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Paste any supported format here:\n• Artist,Track,Album (TuneMyMusic CSV)\n• Artist - Title (Downloader TXT)\n• #EXTINF:...,Artist - Title (M3U)\n• Tab-separated spreadsheet rows (TSV)\n• Session Backup JSON`}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                {previewTrackCount > 0 ? (
                  <span className="text-emerald-400 font-medium">
                    ✓ {previewTrackCount} track{previewTrackCount === 1 ? '' : 's'} detected
                  </span>
                ) : pasteText.trim() ? (
                  'No tracks recognized yet'
                ) : (
                  'Waiting for input...'
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPasteModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasteImport}
                  disabled={previewTrackCount === 0}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Import {previewTrackCount > 0 ? `${previewTrackCount} Tracks` : 'Tracks'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Database Confirmation Modal */}
      {isClearDbModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Clear Acoustic Database?</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  This action permanently purges all stored acoustic profiles and cached metadata.
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl text-xs text-rose-300 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Permanent Deletion Warning:
              </p>
              <p className="text-slate-300">
                All analyzed tracks ({tracks.length}), Camelot keys, BPM, energy, danceability, and mood profiles stored in IndexedDB (<span className="font-mono text-white">PlaylistHavenMetadataDB</span>) will be wiped.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsClearDbModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearDatabase}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-600/20 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 border border-cyan-500/40 text-cyan-300 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-medium backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
