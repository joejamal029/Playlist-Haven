import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, Compass, Sparkles, Disc, Music, User, Radio, Filter, Search,
  Download, Trash2, Check, CheckCircle2, ChevronDown, ChevronRight, AlertCircle,
  RefreshCw, Settings2, FileSpreadsheet, FileText, Layers, ExternalLink, Play,
  Plus, X, Heart, ShieldCheck, Flame, Star, Tag, Archive, FolderCheck, ListMusic,
  Eye, SlidersHorizontal, Wand2, HelpCircle, ArrowUpRight, Copy, Share2,
  Globe, Scale, ListOrdered, CheckSquare, Square, PieChart, ArrowRight,
  Disc3, Scissors, Clock, RotateCcw, FileDown, Users
} from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { downloadPlaylistFile } from '../services/downloadHelper';
import {
  TriageTrack,
  TriageSource,
  ArtistCluster,
  AlbumCluster,
  ImmersionBasket,
  TasteSynthesisDossier,
  ArtistAIDossier,
  TriageStats,
  ResonanceTier,
  TriageStatus,
  DownloadPriority,
  type CulturalBucketGroup,
  type CanonicalBucket,
  CANONICAL_BUCKETS,
  parseDiscoveryFiles,
  buildArtistClusters,
  buildAlbumClusters,
  buildCulturalBucketGroups,
  stageBalancedIntakeCohort,
  updateTrackCulturalBucket,
  computeTriageStats,
  exportDownloaderQueryList,
  exportImmersionBatchCSV,
  exportMusicoletM3U,
  exportArtistDecisionCSV,
  exportCompiledTriageCSV,
  exportCurationDossierMarkdown,
  exportTriageSessionJSON,
  synthesizeTasteDossier,
  scoutArtistDiscography,
  importFromLanguageClustering
} from '../services/triageEngine';
import { getAIConfig, setAIConfig, AIConfig } from '../services/visionEngine';

interface DiscoveryTriageViewProps {
  onBack: () => void;
  onOpenHelp?: () => void;
}

type TriageTab = 'overview' | 'buckets' | 'artists' | 'albums' | 'singles' | 'basket' | 'ai_taste';

const BUCKET_BAR_COLORS: Record<string, string> = {
  'English': 'bg-sky-500',
  'J-Pop': 'bg-rose-500',
  'Naija': 'bg-emerald-500',
  'K-Pop': 'bg-fuchsia-500',
  'C-Pop': 'bg-amber-500',
  'Gospel': 'bg-violet-500',
  'Filipino': 'bg-teal-500',
  'I-Pop': 'bg-yellow-500',
  'African': 'bg-orange-500',
  'Latina': 'bg-pink-500',
  'Français': 'bg-indigo-500',
  'Thai': 'bg-lime-500',
  'Vietnamese': 'bg-emerald-600',
  'Dutch': 'bg-orange-600',
  'Arabic': 'bg-amber-600',
  'German': 'bg-amber-700',
  'Italian': 'bg-green-600',
  'Portuguese': 'bg-blue-600',
  'Instrumental': 'bg-slate-400',
  'Other': 'bg-slate-600'
};

// Component for rendering clear, per-source sequence numbering badges
export function SourceSequenceBadge({
  track,
  compact = false
}: {
  track: TriageTrack;
  compact?: boolean;
}) {
  if (!track) return null;
  const positions = track.sourcePositions || (track.sources?.[0] ? { [track.sources[0]]: track.sourceOrder ?? 1 } : { Source: track.sourceOrder ?? 1 });
  const entries = Object.entries(positions);

  const getSourceBadgeMeta = (source: string) => {
    switch (source) {
      case 'Spotify':
        return {
          code: 'SP',
          style: 'bg-emerald-950/90 text-emerald-300 border-emerald-800/80',
          title: `Spotify Track #${positions[source]}`
        };
      case 'YouTube Music':
        return {
          code: 'YT',
          style: 'bg-rose-950/90 text-rose-300 border-rose-800/80',
          title: `YouTube Music Track #${positions[source]}`
        };
      case 'Language Clustered':
        return {
          code: 'LC',
          style: 'bg-cyan-950/90 text-cyan-300 border-cyan-800/80',
          title: `Clustered Intake Track #${positions[source]}`
        };
      case 'Musicolet':
        return {
          code: 'MC',
          style: 'bg-purple-950/90 text-purple-300 border-purple-800/80',
          title: `Musicolet Track #${positions[source]}`
        };
      case 'M3U':
        return {
          code: 'M3U',
          style: 'bg-blue-950/90 text-blue-300 border-blue-800/80',
          title: `M3U Playlist Track #${positions[source]}`
        };
      case 'TXT':
        return {
          code: 'TXT',
          style: 'bg-slate-800 text-slate-300 border-slate-700',
          title: `Text List Track #${positions[source]}`
        };
      default:
        return {
          code: source.length <= 4 ? source : source.slice(0, 3).toUpperCase(),
          style: 'bg-amber-950/90 text-amber-300 border-amber-800/80',
          title: `${source} Track #${positions[source]}`
        };
    }
  };

  if (entries.length === 0) {
    return (
      <span className="font-mono text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded shadow-sm inline-block">
        #{track.sourceOrder}
      </span>
    );
  }

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {entries.map(([src, ord]) => {
        const meta = getSourceBadgeMeta(src);
        return (
          <span
            key={src}
            className={`font-mono font-bold rounded border shadow-sm inline-flex items-center space-x-1 ${meta.style} ${
              compact ? 'text-[9px] px-1.5 py-0.2' : 'text-[11px] px-2 py-0.5'
            }`}
            title={meta.title}
          >
            <span className="opacity-70 text-[9px] uppercase tracking-wider">{meta.code}</span>
            <span>#{ord}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function DiscoveryTriageView({ onBack, onOpenHelp }: DiscoveryTriageViewProps) {
  // Core Data States
  const [tracks, setTracks] = useState<TriageTrack[]>([]);
  const [stagedTrackIds, setStagedTrackIds] = useState<Set<string>>(new Set());
  const [validatedAlbumKeys, setValidatedAlbumKeys] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TriageTab>('overview');

  // Intake from Module 13 (Language & Nationality Clustering)
  const [pendingIntake, setPendingIntake] = useState<any[] | null>(null);

  // Notification / Toast
  const [notification, setNotification] = useState<string | null>(null);

  // File Uploader state
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState<boolean>(false);

  // Filters & Search
  const [artistSearch, setArtistSearch] = useState<string>('');
  const [artistTierFilter, setArtistTierFilter] = useState<'all' | 'high' | 'emerging' | 'probe'>('all');
  const [artistSort, setArtistSort] = useState<'count' | 'name'>('count');
  const [expandedArtist, setExpandedArtist] = useState<string | null>(null);

  // Artist Triage & Conflict Resolution States
  const [promotedArtistNames, setPromotedArtistNames] = useState<Set<string>>(new Set());
  const [singlesifiedTracksMap, setSinglesifiedTracksMap] = useState<Map<string, Set<string>>>(new Map());
  const [deferredArtistNames, setDeferredArtistNames] = useState<Set<string>>(new Set());
  const [dismissedArtistNames, setDismissedArtistNames] = useState<Set<string>>(new Set());
  const [selectedArtistNames, setSelectedArtistNames] = useState<Set<string>>(new Set());
  const [artistLanguageFilter, setArtistLanguageFilter] = useState<string>('all');
  const [artistViewScope, setArtistViewScope] = useState<'active' | 'promoted' | 'singlesified' | 'deferred' | 'all'>('active');
  const [activeSinglesifyArtist, setActiveSinglesifyArtist] = useState<string | null>(null);
  const [tempSinglesSelections, setTempSinglesSelections] = useState<Map<string, Set<string>>>(new Map());

  const [albumSearch, setAlbumSearch] = useState<string>('');
  const [albumFilter, setAlbumFilter] = useState<'all' | 'validated' | 'candidate'>('all');
  const [candidateThreshold, setCandidateThreshold] = useState<number>(2);

  const [singleSearch, setSingleSearch] = useState<string>('');
  const [singleStatusFilter, setSingleStatusFilter] = useState<'all' | 'probe' | 'multi' | 'staged' | 'inbox'>('all');
  const [singleSourceFilter, setSingleSourceFilter] = useState<'all' | TriageSource>('all');

  // Cultural & Language Buckets States
  const [selectedBucketName, setSelectedBucketName] = useState<CanonicalBucket | 'all'>('all');
  const [bucketSourceFilter, setBucketSourceFilter] = useState<'all' | TriageSource>('all');
  const [bucketSearch, setBucketSearch] = useState<string>('');
  const [quotaModalOpen, setQuotaModalOpen] = useState<boolean>(false);
  const [quotaPerBucket, setQuotaPerBucket] = useState<number>(5);
  const [selectedQuotaBuckets, setSelectedQuotaBuckets] = useState<Set<CanonicalBucket>>(new Set());

  // AI States
  const [isSynthesizingTaste, setIsSynthesizingTaste] = useState<boolean>(false);
  const [tasteSynthesisProgress, setTasteSynthesisProgress] = useState<string>('');
  const [tasteDossier, setTasteDossier] = useState<TasteSynthesisDossier | null>(null);

  // Artist Discography Scout Drawer
  const [selectedScoutArtist, setSelectedScoutArtist] = useState<ArtistCluster | null>(null);
  const [isScoutingArtist, setIsScoutingArtist] = useState<boolean>(false);
  const [artistDossiers, setArtistDossiers] = useState<Record<string, ArtistAIDossier>>({});

  // AI Configuration Modal
  const [aiConfigModalOpen, setAiConfigModalOpen] = useState<boolean>(false);
  const [aiConfigForm, setAiConfigForm] = useState<AIConfig>(getAIConfig());

  // Show toast notification
  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(prev => (prev === msg ? null : prev));
    }, 3000);
  };

  // Check for staged intake from Module 13
  useEffect(() => {
    try {
      const stored = localStorage.getItem('playlist_haven_triage_intake');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPendingIntake(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to parse triage intake:', e);
    }
  }, []);

  // Ingest Clustered Cohort from Module 13
  const handleIngestClusteredIntake = () => {
    if (!pendingIntake || pendingIntake.length === 0) return;
    const newTracks = importFromLanguageClustering(pendingIntake);
    setTracks(newTracks);
    localStorage.removeItem('playlist_haven_triage_intake');
    setPendingIntake(null);
    showToast(`🧭 Ingested ${newTracks.length} tracks with cultural provenance from Module 13!`);
  };

  const handleDismissIntake = () => {
    localStorage.removeItem('playlist_haven_triage_intake');
    setPendingIntake(null);
  };

  // Clear workspace
  const handleClearWorkspace = () => {
    if (tracks.length > 0 && !confirm('Are you sure you want to clear your current triage workspace?')) {
      return;
    }
    setTracks([]);
    setStagedTrackIds(new Set());
    setValidatedAlbumKeys(new Set());
    setPromotedArtistNames(new Set());
    setSinglesifiedTracksMap(new Map());
    setDeferredArtistNames(new Set());
    setDismissedArtistNames(new Set());
    setSelectedArtistNames(new Set());
    setTempSinglesSelections(new Map());
    setActiveSinglesifyArtist(null);
    setUploadedFiles([]);
    setTasteDossier(null);
    showToast('Triage workspace cleared');
  };

  // Handle uploaded files (Supports CSV, TSV, M3U, M3U8, TXT, and Session Backup JSON)
  const handleFilesSelected = async (files: File[]) => {
    setIsProcessingFiles(true);
    try {
      const filePayloads: { name: string; content: string }[] = [];
      for (const f of files) {
        const text = await f.text();
        // Check if file is a Session Backup JSON
        if (f.name.toLowerCase().endsWith('.json')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.tracks && Array.isArray(parsed.tracks)) {
              setTracks(parsed.tracks);
              if (Array.isArray(parsed.stagedTrackIds)) {
                setStagedTrackIds(new Set(parsed.stagedTrackIds));
              }
              if (Array.isArray(parsed.validatedAlbumKeys)) {
                setValidatedAlbumKeys(new Set(parsed.validatedAlbumKeys));
              }
              setUploadedFiles(files);
              showToast(`Restored triage session with ${parsed.tracks.length} tracks!`);
              setActiveTab('overview');
              setIsProcessingFiles(false);
              return;
            }
          } catch (jsonErr) {
            console.warn('File parsed as session JSON failed, falling back to discovery parser', jsonErr);
          }
        }
        filePayloads.push({ name: f.name, content: text });
      }
      const parsedTracks = parseDiscoveryFiles(filePayloads);
      setTracks(parsedTracks);
      setUploadedFiles(files);
      showToast(`Ingested ${parsedTracks.length} tracks from ${files.length} file(s)!`);
      setActiveTab('overview');
    } catch (err: any) {
      alert(`Error reading files: ${err.message}`);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  // Derived Clusters & Computations
  const artistClusters = useMemo(() => {
    return buildArtistClusters(tracks, validatedAlbumKeys);
  }, [tracks, validatedAlbumKeys]);

  const albumClusters = useMemo(() => {
    return buildAlbumClusters(tracks, validatedAlbumKeys, candidateThreshold);
  }, [tracks, validatedAlbumKeys, candidateThreshold]);

  const stagedTracks = useMemo(() => {
    return tracks.filter(t => t && t.id && stagedTrackIds.has(t.id)).sort((a, b) => {
      const orderA = a.sourceOrder ?? 0;
      const orderB = b.sourceOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      const sA = a.sources?.[0] || '';
      const sB = b.sources?.[0] || '';
      const cmp = sA.localeCompare(sB);
      if (cmp !== 0) return cmp;
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [tracks, stagedTrackIds]);

  const bucketGroups = useMemo<CulturalBucketGroup[]>(() => {
    return buildCulturalBucketGroups(tracks, stagedTrackIds);
  }, [tracks, stagedTrackIds]);

  const stats = useMemo<TriageStats>(() => {
    return computeTriageStats(tracks, artistClusters, albumClusters, stagedTracks);
  }, [tracks, artistClusters, albumClusters, stagedTracks]);

  // Toggle single track in/out of immersion basket
  const toggleStageTrack = (trackId: string, priority?: DownloadPriority) => {
    setStagedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
        showToast('Removed track from Immersion Basket');
      } else {
        next.add(trackId);
        if (priority) {
          setTracks(curr => curr.map(t => (t.id === trackId ? { ...t, downloadPriority: priority } : t)));
        }
        showToast('Added track to Immersion Basket 🛒');
      }
      return next;
    });
  };

  // Toggle track download priority
  const toggleTrackPriority = (trackId: string) => {
    setTracks(curr =>
      curr.map(t => {
        if (t.id === trackId) {
          const newPriority: DownloadPriority = t.downloadPriority === 'immediate' ? 'secondary' : 'immediate';
          return { ...t, downloadPriority: newPriority };
        }
        return t;
      })
    );
  };

  // Stage all tracks by an artist
  const stageAllArtistTracks = (artistName: string) => {
    const artistTracks = tracks.filter(t => t.artist === artistName);
    setStagedTrackIds(prev => {
      const next = new Set(prev);
      artistTracks.forEach(t => next.add(t.id));
      return next;
    });
    showToast(`Staged all ${artistTracks.length} tracks by ${artistName} to Basket!`);
  };

  // Toggle album validation
  const toggleValidateAlbum = (artistName: string, albumName: string) => {
    const key = `${artistName}___${albumName}`;
    setValidatedAlbumKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        showToast(`Unvalidated album "${albumName}"`);
      } else {
        next.add(key);
        // Also automatically stage all tracks of this album into the basket with Immediate priority
        const albumTracks = tracks.filter(t => t.artist === artistName && t.album === albumName);
        setStagedTrackIds(stagedPrev => {
          const stagedNext = new Set(stagedPrev);
          albumTracks.forEach(t => stagedNext.add(t.id));
          return stagedNext;
        });
        setTracks(curr =>
          curr.map(t => (t.artist === artistName && t.album === albumName ? { ...t, downloadPriority: 'immediate' } : t))
        );
        showToast(`Validated "${albumName}" for Full Immersion & staged ${albumTracks.length} tracks! 💿`);
      }
      return next;
    });
  };

  // Reassign a single track's cultural bucket (with persistent cache update)
  const handleUpdateTrackBucket = (trackId: string, newBucket: CanonicalBucket) => {
    const updated = updateTrackCulturalBucket(trackId, newBucket, tracks, true);
    setTracks(updated);
    showToast(`Reassigned track to ${newBucket}!`);
  };

  // Open Quota Modal with active buckets pre-selected
  const openQuotaModal = () => {
    const bucketsWithTracks = new Set<CanonicalBucket>();
    bucketGroups.forEach(g => {
      const unstaged = g.tracks.filter(t => !stagedTrackIds.has(t.id));
      if (unstaged.length > 0) {
        bucketsWithTracks.add(g.bucket);
      }
    });
    setSelectedQuotaBuckets(bucketsWithTracks);
    setQuotaModalOpen(true);
  };

  // Toggle selection of bucket in quota modal
  const toggleQuotaBucket = (bucket: CanonicalBucket) => {
    setSelectedQuotaBuckets(prev => {
      const next = new Set(prev);
      if (next.has(bucket)) {
        next.delete(bucket);
      } else {
        next.add(bucket);
      }
      return next;
    });
  };

  // Select all buckets in quota modal
  const selectAllQuotaBuckets = () => {
    const all = new Set<CanonicalBucket>();
    bucketGroups.forEach(g => all.add(g.bucket));
    setSelectedQuotaBuckets(all);
  };

  // Clear all buckets in quota modal
  const clearQuotaBuckets = () => {
    setSelectedQuotaBuckets(new Set());
  };

  // Stage balanced cohort across selected buckets in strict chronological order
  const handleStageBalancedCohort = (targetPerBucket: number, bucketsToUse?: CanonicalBucket[]) => {
    const toStage = stageBalancedIntakeCohort(tracks, stagedTrackIds, targetPerBucket, bucketsToUse);
    if (toStage.length === 0) {
      showToast('All tracks in selected buckets are already staged in your basket!');
      return;
    }
    setStagedTrackIds(prev => {
      const next = new Set(prev);
      toStage.forEach(id => next.add(id));
      return next;
    });
    showToast(`Staged ${toStage.length} tracks evenly across ${bucketsToUse ? bucketsToUse.length : bucketGroups.length} buckets in chronological sequence! 🛒`);
    setQuotaModalOpen(false);
  };

  // Stage next N chronological tracks for a specific bucket
  const handleStageNextInBucket = (bucket: CanonicalBucket, count: number = 5) => {
    const group = bucketGroups.find(g => g.bucket === bucket);
    if (!group) return;
    const unstaged = group.tracks.filter(t => !stagedTrackIds.has(t.id));
    const toAdd = unstaged.slice(0, count);
    if (toAdd.length === 0) {
      showToast(`All tracks in ${bucket} are already staged!`);
      return;
    }
    setStagedTrackIds(prev => {
      const next = new Set(prev);
      toAdd.forEach(t => next.add(t.id));
      return next;
    });
    showToast(`Staged next ${toAdd.length} chronological tracks from ${bucket}!`);
  };

  // Run AI Taste Synthesis
  const handleRunTasteSynthesis = async () => {
    setIsSynthesizingTaste(true);
    setTasteSynthesisProgress('Connecting to AI Engine...');
    try {
      const dossier = await synthesizeTasteDossier(tracks, undefined, msg => setTasteSynthesisProgress(msg));
      setTasteDossier(dossier);
      showToast('AI Taste Dossier generated successfully!');
    } catch (err: any) {
      console.error(err);
      alert(`AI Taste Synthesis failed: ${err.message}`);
    } finally {
      setIsSynthesizingTaste(false);
      setTasteSynthesisProgress('');
    }
  };

  // Scout individual artist discography
  const handleScoutArtist = async (cluster: ArtistCluster) => {
    setSelectedScoutArtist(cluster);
    if (artistDossiers[cluster.artist]) return; // already cached

    setIsScoutingArtist(true);
    try {
      const songTitles = cluster.tracks.map(t => t.title);
      const dossier = await scoutArtistDiscography(cluster.artist, songTitles);
      setArtistDossiers(prev => ({ ...prev, [cluster.artist]: dossier }));
      showToast(`Scouted ${cluster.artist}'s discography!`);
    } catch (err: any) {
      console.error(err);
      alert(`Artist Scout failed: ${err.message}`);
    } finally {
      setIsScoutingArtist(false);
    }
  };

  // Save AI Config
  const handleSaveAIConfig = () => {
    setAIConfig(aiConfigForm);
    setAiConfigModalOpen(false);
    showToast('AI Settings updated successfully!');
  };

  // EXPORT HANDLERS
  const handleExportDownloaderList = async () => {
    if (stagedTracks.length === 0) {
      alert('Your Immersion Basket is empty. Please stage tracks first!');
      return;
    }
    const txt = exportDownloaderQueryList(stagedTracks);
    await downloadPlaylistFile(txt, `Immersion_Downloader_List_(${stagedTracks.length}).txt`, 'text/plain');
    showToast('Downloaded Downloader Query List (.txt)!');
  };

  const handleExportSyncCSV = async () => {
    if (stagedTracks.length === 0) {
      alert('Your Immersion Basket is empty. Please stage tracks first!');
      return;
    }
    const csv = exportImmersionBatchCSV(stagedTracks);
    await downloadPlaylistFile(csv, `Immersion_Batch_Sync_(${stagedTracks.length}).csv`, 'text/csv;charset=utf-8;');
    showToast('Downloaded TuneMyMusic / Spotify Sync CSV!');
  };

  const handleExportMusicoletM3U = async () => {
    if (stagedTracks.length === 0) {
      alert('Your Immersion Basket is empty. Please stage tracks first!');
      return;
    }
    const m3u = exportMusicoletM3U(stagedTracks, `Immersion Batch (${stagedTracks.length})`);
    await downloadPlaylistFile(m3u, `Immersion_Musicolet_Batch_(${stagedTracks.length}).m3u`, 'audio/x-mpegurl');
    showToast('Downloaded Musicolet Playable M3U!');
  };

  const handleExportDossierMarkdown = async () => {
    const md = exportCurationDossierMarkdown(tracks, artistClusters, albumClusters, tasteDossier || undefined);
    await downloadPlaylistFile(md, `Discovery_Triage_Dossier_${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown');
    showToast('Downloaded Archival Curation Dossier (.md)!');
  };

  const handleExportSessionJSON = async () => {
    const json = exportTriageSessionJSON(tracks, Array.from(stagedTrackIds), Array.from(validatedAlbumKeys));
    await downloadPlaylistFile(json, `triage_session_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    showToast('Exported Session Backup JSON!');
  };

  // ARTIST TRIAGE & CONFLICT RESOLUTION HANDLERS

  // 1. Promote artist to compilation / album & export real-time CSV
  const handlePromoteArtistToAlbum = async (cluster: ArtistCluster, silent: boolean = false) => {
    const safeName = cluster.artist.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 40);
    const csv = exportArtistDecisionCSV(cluster.artist, cluster.tracks, 'album');
    await downloadPlaylistFile(csv, `Album_Intake_${safeName}_(${cluster.trackCount}_tracks).csv`, 'text/csv;charset=utf-8;');

    setPromotedArtistNames(prev => new Set(prev).add(cluster.artist));
    setValidatedAlbumKeys(prev => {
      const next = new Set(prev);
      cluster.albums.forEach(al => {
        if (al.name !== 'Singles / EPs') {
          next.add(`${cluster.artist}___${al.name}`);
        }
      });
      return next;
    });
    setDismissedArtistNames(prev => new Set(prev).add(cluster.artist));
    setSelectedArtistNames(prev => {
      const next = new Set(prev);
      next.delete(cluster.artist);
      return next;
    });

    if (!silent) {
      showToast(`🌟 Promoted "${cluster.artist}" to Album (${cluster.trackCount} tracks) & exported CSV! Removed from active view.`);
    }
  };

  // 2. Singlesification helpers
  const handleStartSinglesify = (cluster: ArtistCluster) => {
    if (activeSinglesifyArtist === cluster.artist) {
      setActiveSinglesifyArtist(null);
    } else {
      setActiveSinglesifyArtist(cluster.artist);
      setExpandedArtist(cluster.artist);
      if (!tempSinglesSelections.has(cluster.artist)) {
        const existing = singlesifiedTracksMap.get(cluster.artist);
        if (existing && existing.size > 0) {
          setTempSinglesSelections(prev => new Map(prev).set(cluster.artist, new Set(existing)));
        } else {
          // Default: select the 1st track as single probe candidate
          const defaultSet = new Set<string>();
          if (cluster.tracks.length > 0) {
            defaultSet.add(cluster.tracks[0].id);
          }
          setTempSinglesSelections(prev => new Map(prev).set(cluster.artist, defaultSet));
        }
      }
    }
  };

  const handleSelectAllSinglesForArtist = (artistName: string, trackIds: string[]) => {
    setTempSinglesSelections(prev => {
      const next = new Map(prev);
      next.set(artistName, new Set(trackIds));
      return next;
    });
  };

  const handleSelectFirstSingleForArtist = (artistName: string, firstTrackId?: string) => {
    if (!firstTrackId) return;
    setTempSinglesSelections(prev => {
      const next = new Map(prev);
      next.set(artistName, new Set([firstTrackId]));
      return next;
    });
  };

  const handleClearSinglesForArtist = (artistName: string) => {
    setTempSinglesSelections(prev => {
      const next = new Map(prev);
      next.set(artistName, new Set());
      return next;
    });
  };

  // Toggle track selection within singlesification
  const handleToggleKeepAsSingle = (artistName: string, trackId: string) => {
    setTempSinglesSelections(prev => {
      const next = new Map(prev);
      const current = new Set(next.get(artistName) || []);
      if (current.has(trackId)) current.delete(trackId);
      else current.add(trackId);
      next.set(artistName, current);
      return next;
    });
  };

  // 3. Export singlesified sample tracks for an individual artist
  const handleExportArtistSinglesCSV = async (cluster: ArtistCluster) => {
    const selectedIds = tempSinglesSelections.get(cluster.artist) || new Set();
    const chosenTracks = cluster.tracks.filter(t => selectedIds.has(t.id));
    if (chosenTracks.length === 0) {
      alert('Please check at least 1 song to export as singles.');
      return;
    }
    const safeName = cluster.artist.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 40);
    const csv = exportArtistDecisionCSV(cluster.artist, chosenTracks, 'singlesified');
    await downloadPlaylistFile(csv, `Singlesified_${safeName}_(${chosenTracks.length}_tracks).csv`, 'text/csv;charset=utf-8;');
    showToast(`Downloaded ${chosenTracks.length} singles for "${cluster.artist}"!`);
  };

  // 4. Finalize singlesification (commits chosen tracks, marks unselected as deferred, exports CSV, removes from view)
  const handleFinalizeSinglesification = async (cluster: ArtistCluster) => {
    const selectedIds = tempSinglesSelections.get(cluster.artist) || new Set();
    if (selectedIds.size === 0) {
      alert('Please select at least 1 track to keep as a single, or click "Defer Artist" to defer all songs.');
      return;
    }
    const chosenTracks = cluster.tracks.filter(t => selectedIds.has(t.id));
    const safeName = cluster.artist.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 40);
    const csv = exportArtistDecisionCSV(cluster.artist, chosenTracks, 'singlesified');
    await downloadPlaylistFile(csv, `Singlesified_${safeName}_(${chosenTracks.length}_tracks).csv`, 'text/csv;charset=utf-8;');

    setSinglesifiedTracksMap(prev => {
      const next = new Map(prev);
      next.set(cluster.artist, new Set(selectedIds));
      return next;
    });
    setDismissedArtistNames(prev => new Set(prev).add(cluster.artist));
    setSelectedArtistNames(prev => {
      const next = new Set(prev);
      next.delete(cluster.artist);
      return next;
    });
    setActiveSinglesifyArtist(null);

    const deferredCount = cluster.trackCount - chosenTracks.length;
    showToast(`🎯 Singlesified "${cluster.artist}": kept ${chosenTracks.length} singles, deferred ${deferredCount}. Removed from active view.`);
  };

  // 5. Defer artist entirely
  const handleDeferArtist = async (cluster: ArtistCluster, exportCSV: boolean = true) => {
    if (exportCSV) {
      const safeName = cluster.artist.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 40);
      const csv = exportArtistDecisionCSV(cluster.artist, cluster.tracks, 'deferred');
      await downloadPlaylistFile(csv, `Deferred_${safeName}_(${cluster.trackCount}_tracks).csv`, 'text/csv;charset=utf-8;');
    }
    setDeferredArtistNames(prev => new Set(prev).add(cluster.artist));
    setDismissedArtistNames(prev => new Set(prev).add(cluster.artist));
    setSelectedArtistNames(prev => {
      const next = new Set(prev);
      next.delete(cluster.artist);
      return next;
    });
    showToast(`📦 Deferred "${cluster.artist}" (${cluster.trackCount} tracks) & removed from active view.`);
  };

  // 6. Restore artist to active triage view
  const handleRestoreArtist = (artistName: string) => {
    setDismissedArtistNames(prev => {
      const next = new Set(prev);
      next.delete(artistName);
      return next;
    });
    showToast(`Restored "${artistName}" to active triage view.`);
  };

  const handleRestoreAllDismissed = () => {
    if (dismissedArtistNames.size === 0) return;
    const count = dismissedArtistNames.size;
    setDismissedArtistNames(new Set());
    showToast(`Restored all ${count} hidden artists to active triage view!`);
  };

  // 7. Batch Operations for Artists
  const handleToggleSelectArtist = (artistName: string) => {
    setSelectedArtistNames(prev => {
      const next = new Set(prev);
      if (next.has(artistName)) next.delete(artistName);
      else next.add(artistName);
      return next;
    });
  };

  const handleSelectAllVisibleArtists = () => {
    const next = new Set<string>();
    filteredArtists.forEach(a => next.add(a.artist));
    setSelectedArtistNames(next);
  };

  const handleDeselectAllArtists = () => {
    setSelectedArtistNames(new Set());
  };

  const handleBatchPromoteSelected = async () => {
    if (selectedArtistNames.size === 0) return;
    const count = selectedArtistNames.size;
    if (!confirm(`Promote all ${count} selected artists to Albums/Compilations? This will export a compiled album CSV and clear them from active triage.`)) return;

    const selectedClusters = artistClusters.filter(c => selectedArtistNames.has(c.artist));
    const allTracks = selectedClusters.flatMap(c => c.tracks);
    const csv = exportCompiledTriageCSV(allTracks, 'Promoted Albums');
    await downloadPlaylistFile(csv, `Compiled_Promoted_Albums_(${allTracks.length}_tracks).csv`, 'text/csv;charset=utf-8;');

    setPromotedArtistNames(prev => {
      const next = new Set(prev);
      selectedArtistNames.forEach(n => next.add(n));
      return next;
    });
    setDismissedArtistNames(prev => {
      const next = new Set(prev);
      selectedArtistNames.forEach(n => next.add(n));
      return next;
    });
    setSelectedArtistNames(new Set());
    showToast(`🌟 Promoted ${count} artists (${allTracks.length} tracks) to Albums and exported CSV!`);
  };

  const handleBatchDeferSelected = async () => {
    if (selectedArtistNames.size === 0) return;
    const count = selectedArtistNames.size;
    if (!confirm(`Defer all ${count} selected artists? This will export a compiled deferred CSV and clear them from active triage.`)) return;

    const selectedClusters = artistClusters.filter(c => selectedArtistNames.has(c.artist));
    const allTracks = selectedClusters.flatMap(c => c.tracks);
    const csv = exportCompiledTriageCSV(allTracks, 'Deferred Tracks');
    await downloadPlaylistFile(csv, `Compiled_Deferred_Batch_(${allTracks.length}_tracks).csv`, 'text/csv;charset=utf-8;');

    setDeferredArtistNames(prev => {
      const next = new Set(prev);
      selectedArtistNames.forEach(n => next.add(n));
      return next;
    });
    setDismissedArtistNames(prev => {
      const next = new Set(prev);
      selectedArtistNames.forEach(n => next.add(n));
      return next;
    });
    setSelectedArtistNames(new Set());
    showToast(`📦 Deferred ${count} artists (${allTracks.length} tracks) and exported CSV!`);
  };

  const handleBatchStageSelected = () => {
    if (selectedArtistNames.size === 0) return;
    const count = selectedArtistNames.size;
    const selectedClusters = artistClusters.filter(c => selectedArtistNames.has(c.artist));
    const allTracks = selectedClusters.flatMap(c => c.tracks);
    setStagedTrackIds(prev => {
      const next = new Set(prev);
      allTracks.forEach(t => next.add(t.id));
      return next;
    });
    setSelectedArtistNames(new Set());
    showToast(`🛒 Staged all ${allTracks.length} tracks from ${count} selected artists into Basket!`);
  };

  // 8. Compiled Master Collections
  const compiledSinglesifiedTracks = useMemo(() => {
    const list: TriageTrack[] = [];
    singlesifiedTracksMap.forEach((trackIds, artist) => {
      const cluster = artistClusters.find(c => c.artist === artist);
      if (cluster) {
        cluster.tracks.forEach(t => {
          if (trackIds.has(t.id)) list.push(t);
        });
      }
    });
    return list;
  }, [singlesifiedTracksMap, artistClusters]);

  const compiledDeferredTracks = useMemo(() => {
    const list: TriageTrack[] = [];
    // 1. Fully deferred artists
    deferredArtistNames.forEach(artist => {
      const cluster = artistClusters.find(c => c.artist === artist);
      if (cluster) {
        list.push(...cluster.tracks);
      }
    });
    // 2. Remaining unselected songs from singlesified artists
    singlesifiedTracksMap.forEach((keptTrackIds, artist) => {
      const cluster = artistClusters.find(c => c.artist === artist);
      if (cluster) {
        cluster.tracks.forEach(t => {
          if (!keptTrackIds.has(t.id)) list.push(t);
        });
      }
    });
    return list;
  }, [deferredArtistNames, singlesifiedTracksMap, artistClusters]);

  const compiledPromotedAlbumTracks = useMemo(() => {
    const list: TriageTrack[] = [];
    promotedArtistNames.forEach(artist => {
      const cluster = artistClusters.find(c => c.artist === artist);
      if (cluster) {
        list.push(...cluster.tracks);
      }
    });
    return list;
  }, [promotedArtistNames, artistClusters]);

  // 9. Master Export Handlers
  const handleExportMasterSinglesified = async () => {
    if (compiledSinglesifiedTracks.length === 0) {
      alert('No singlesified tracks yet. Use "Singlesify" on an artist to pick sample singles.');
      return;
    }
    const csv = exportCompiledTriageCSV(compiledSinglesifiedTracks, 'Singlesified Samples');
    await downloadPlaylistFile(csv, `Compiled_Singlesified_Tracks_(${compiledSinglesifiedTracks.length}).csv`, 'text/csv;charset=utf-8;');
    showToast(`Downloaded Compiled Singlesified CSV (${compiledSinglesifiedTracks.length} tracks)!`);
  };

  const handleExportMasterDeferred = async () => {
    if (compiledDeferredTracks.length === 0) {
      alert('No deferred tracks yet. Defer artists or singlesify artists to populate this list.');
      return;
    }
    const csv = exportCompiledTriageCSV(compiledDeferredTracks, 'Deferred Tracks');
    await downloadPlaylistFile(csv, `Compiled_Deferred_Tracks_(${compiledDeferredTracks.length}).csv`, 'text/csv;charset=utf-8;');
    showToast(`Downloaded Compiled Deferred CSV (${compiledDeferredTracks.length} tracks for external filtering)!`);
  };

  const handleExportMasterPromotedAlbums = async () => {
    if (compiledPromotedAlbumTracks.length === 0) {
      alert('No promoted albums yet. Click "Promote to Album" on artists to populate this list.');
      return;
    }
    const csv = exportCompiledTriageCSV(compiledPromotedAlbumTracks, 'Promoted Albums');
    await downloadPlaylistFile(csv, `Compiled_Promoted_Albums_(${compiledPromotedAlbumTracks.length}).csv`, 'text/csv;charset=utf-8;');
    showToast(`Downloaded Compiled Promoted Albums CSV (${compiledPromotedAlbumTracks.length} tracks)!`);
  };

  // Distinct Cultural Buckets in Artists with counts
  const availableArtistLanguages = useMemo(() => {
    const counts = new Map<string, number>();
    artistClusters.forEach(c => {
      const b = c.primaryCulturalBucket || 'Other / Unclassified';
      counts.set(b, (counts.get(b) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [artistClusters]);

  // Filtered Artists List
  const filteredArtists = useMemo(() => {
    return artistClusters.filter(cluster => {
      // 1. View Scope filter
      const isPromoted = promotedArtistNames.has(cluster.artist);
      const isSinglesified = singlesifiedTracksMap.has(cluster.artist);
      const isDeferred = deferredArtistNames.has(cluster.artist);
      const isDismissed = dismissedArtistNames.has(cluster.artist);

      if (artistViewScope === 'active') {
        if (isDismissed) return false;
      } else if (artistViewScope === 'promoted') {
        if (!isPromoted) return false;
      } else if (artistViewScope === 'singlesified') {
        if (!isSinglesified) return false;
      } else if (artistViewScope === 'deferred') {
        if (!isDeferred) return false;
      }
      // 'all' passes through

      // 2. Tier filter
      if (artistTierFilter !== 'all' && cluster.resonanceTier !== artistTierFilter) {
        return false;
      }

      // 3. Language / Cultural Bucket filter
      if (artistLanguageFilter !== 'all' && cluster.primaryCulturalBucket !== artistLanguageFilter) {
        return false;
      }

      // 4. Search query
      if (artistSearch) {
        const q = artistSearch.toLowerCase();
        return (
          cluster.artist.toLowerCase().includes(q) ||
          cluster.primaryCulturalBucket.toLowerCase().includes(q) ||
          cluster.tracks.some(t => t.title.toLowerCase().includes(q) || t.album.toLowerCase().includes(q))
        );
      }
      return true;
    }).sort((a, b) => {
      if (artistSort === 'count') {
        return b.trackCount - a.trackCount;
      }
      return a.artist.localeCompare(b.artist);
    });
  }, [
    artistClusters,
    artistTierFilter,
    artistSearch,
    artistSort,
    artistLanguageFilter,
    artistViewScope,
    promotedArtistNames,
    singlesifiedTracksMap,
    deferredArtistNames,
    dismissedArtistNames
  ]);

  // Filtered Albums List
  const filteredAlbums = useMemo(() => {
    return albumClusters.filter(cluster => {
      if (albumFilter === 'validated' && cluster.validationStatus !== 'validated') return false;
      if (albumFilter === 'candidate' && !cluster.isCandidate) return false;
      if (albumSearch) {
        const q = albumSearch.toLowerCase();
        return cluster.album.toLowerCase().includes(q) || cluster.artist.toLowerCase().includes(q);
      }
      return true;
    });
  }, [albumClusters, albumFilter, albumSearch]);

  // Filtered Singles List - strictly preserving chronological playlist discovery sequence
  const filteredSingles = useMemo(() => {
    return tracks.filter(t => {
      if (!t) return false;
      if (singleSourceFilter !== 'all' && !(t.sources?.includes(singleSourceFilter))) return false;
      if (singleStatusFilter === 'probe' && t.resonanceTier !== 'probe') return false;
      if (singleStatusFilter === 'multi' && t.resonanceTier === 'probe') return false;
      if (singleStatusFilter === 'staged' && !stagedTrackIds.has(t.id)) return false;
      if (singleStatusFilter === 'inbox' && (stagedTrackIds.has(t.id) || t.triageStatus === 'kept_single')) return false;
      if (singleSearch) {
        const q = singleSearch.toLowerCase();
        return (t.title || '').toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q) || (t.album || '').toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      if (singleSourceFilter !== 'all') {
        const posA = a.sourcePositions?.[singleSourceFilter] ?? (a.sourceOrder ?? 0);
        const posB = b.sourcePositions?.[singleSourceFilter] ?? (b.sourceOrder ?? 0);
        return posA - posB;
      }
      const orderA = a.sourceOrder ?? 0;
      const orderB = b.sourceOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      const sA = a.sources?.[0] || '';
      const sB = b.sources?.[0] || '';
      const cmp = sA.localeCompare(sB);
      if (cmp !== 0) return cmp;
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [tracks, singleSourceFilter, singleStatusFilter, singleSearch, stagedTrackIds]);

  // Filtered Cultural & Language Bucket Tracks - strictly sorted by sourceOrder
  const filteredBucketTracks = useMemo(() => {
    let list: TriageTrack[] = [];
    if (selectedBucketName === 'all') {
      list = [...tracks];
    } else {
      const group = bucketGroups.find(g => g.bucket === selectedBucketName);
      list = group ? [...group.tracks] : [];
    }

    if (bucketSourceFilter !== 'all') {
      list = list.filter(t => t && t.sources?.includes(bucketSourceFilter));
    }

    // Strictly preserve chronological playlist discovery order
    list.sort((a, b) => {
      if (bucketSourceFilter !== 'all') {
        const posA = a.sourcePositions?.[bucketSourceFilter] ?? (a.sourceOrder ?? 0);
        const posB = b.sourcePositions?.[bucketSourceFilter] ?? (b.sourceOrder ?? 0);
        return posA - posB;
      }
      const orderA = a.sourceOrder ?? 0;
      const orderB = b.sourceOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      const sA = a.sources?.[0] || '';
      const sB = b.sources?.[0] || '';
      const cmp = sA.localeCompare(sB);
      if (cmp !== 0) return cmp;
      return (a.title || '').localeCompare(b.title || '');
    });

    if (bucketSearch) {
      const q = bucketSearch.toLowerCase();
      list = list.filter(
        t =>
          (t.title || '').toLowerCase().includes(q) ||
          (t.artist || '').toLowerCase().includes(q) ||
          (t.album || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [tracks, bucketGroups, selectedBucketName, bucketSourceFilter, bucketSearch]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-2xl shadow-amber-500/20 flex items-center space-x-2 animate-bounce">
          <CheckCircle2 size={18} />
          <span className="text-xs">{notification}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20">
                <Compass size={18} />
              </div>
              <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-amber-200 via-orange-200 to-white bg-clip-text text-transparent">
                Discovery Triage & Honing Engine
              </h1>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                Module 14
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Bridging Discovery to Immersion • Singles (Probes) ➔ Artists (Resonance) ➔ Albums (Validation)
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center space-x-2.5">
          {tracks.length > 0 && (
            <button
              onClick={handleClearWorkspace}
              className="flex items-center space-x-1.5 bg-slate-800/80 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 px-3 py-1.5 rounded-xl border border-slate-700/80 hover:border-rose-800/60 text-xs font-semibold transition-all cursor-pointer"
              title="Clear all currently loaded tracks and start fresh"
            >
              <Trash2 size={13} className="text-rose-400" />
              <span className="hidden md:inline">Clear Workspace</span>
            </button>
          )}

          <button
            onClick={() => setAiConfigModalOpen(true)}
            className="flex items-center space-x-1.5 bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white px-3 py-1.5 rounded-xl border border-purple-500/30 text-xs font-semibold transition-all cursor-pointer"
            title="Configure Gemini API or Local LLM"
          >
            <Settings2 size={14} />
            <span className="hidden sm:inline">AI Settings</span>
          </button>

          {/* Immersion Basket Quick Trigger */}
          <button
            onClick={() => setActiveTab('basket')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              stagedTracks.length > 0
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500 hover:text-slate-950'
                : 'bg-slate-800/80 text-slate-400 border-slate-700'
            }`}
          >
            <span>🛒 Basket</span>
            <span className="bg-emerald-500 text-slate-950 px-1.5 py-0.2 rounded-full text-[10px] font-black">
              {stagedTracks.length}
            </span>
          </button>

          {onOpenHelp && (
            <button
              onClick={onOpenHelp}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Help Guide (?)"
            >
              <HelpCircle size={17} />
            </button>
          )}
        </div>
      </header>

      {/* Module 13 Intake Alert Banner */}
      {pendingIntake && pendingIntake.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-cyan-950/80 border-b border-amber-500/40 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/40">
              <Compass className="w-5 h-5 animate-spin" style={{ animationDuration: '8s' }} />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-200 flex items-center gap-2">
                <span>Cultural Cohort Staged from Language & Nationality Clustering (Module 13)</span>
                <span className="px-2 py-0.2 rounded-full bg-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                  {pendingIntake.length} Tracks Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tracks carry verified cultural buckets (e.g. J-Pop, Naija, K-Pop, C-Pop) and country provenance ready for triage.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismissIntake}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Dismiss
            </button>
            <button
              onClick={handleIngestClusteredIntake}
              className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ingest Cohort into Triage Workspace</span>
            </button>
          </div>
        </div>
      )}

      {/* Metrics Strip */}
      <section className="bg-slate-900/40 border-b border-slate-800/60 px-6 py-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">Discovered Tracks</span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-lg font-black text-slate-100">{stats.totalTracks}</span>
              <span className="text-[10px] text-slate-500 font-mono">
                ({stats.sourceCounts['Spotify'] || 0} Sp / {stats.sourceCounts['YouTube Music'] || 0} YT)
              </span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">Unique Artists</span>
            <span className="text-lg font-black text-slate-100 mt-0.5 block">{stats.uniqueArtists}</span>
          </div>

          <div
            onClick={() => setActiveTab('buckets')}
            className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-2.5 cursor-pointer hover:border-cyan-400/60 transition-all hover:bg-slate-800/80"
            title="Click to view Language & Cultural Buckets"
          >
            <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold block">🌐 Cultural Buckets</span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-lg font-black text-cyan-300">{bucketGroups.length}</span>
              <span className="text-[10px] text-cyan-500/80 font-mono">Traditions</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold block">🌟 Magnet Artists</span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-lg font-black text-amber-300">{stats.highResonanceArtists}</span>
              <span className="text-[10px] text-amber-500/80 font-mono">(&ge;4 tracks)</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-orange-500/20 rounded-xl p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-orange-400 font-bold block">⚡ Emerging Sparks</span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-lg font-black text-orange-300">{stats.emergingArtists}</span>
              <span className="text-[10px] text-orange-500/80 font-mono">(2-3 tracks)</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-emerald-500/20 rounded-xl p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold block">💿 Validated / Candidates</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-black text-emerald-300">{stats.validatedAlbumsCount}</span>
              <span className="text-[10px] text-slate-400 font-mono">/ {stats.albumCandidatesCount}</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-cyan-500/20 rounded-xl p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold block">🛒 Staged in Basket</span>
            <span className="text-lg font-black text-cyan-300 mt-0.5 block">{stats.stagedCount}</span>
          </div>
        </div>
      </section>

      {/* Primary Navigation Tabs */}
      <nav className="border-b border-slate-800 bg-slate-950 px-6 pt-3 flex items-center space-x-1 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-amber-400 text-amber-300 bg-slate-900/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers size={15} />
          <span>Overview & Ingestion</span>
        </button>

        <button
          onClick={() => setActiveTab('buckets')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'buckets'
              ? 'border-cyan-400 text-cyan-300 bg-slate-900/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe size={15} className={activeTab === 'buckets' ? 'text-cyan-400' : 'text-slate-400'} />
          <span>🌐 Cultural & Language Buckets ({bucketGroups.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('artists')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'artists'
              ? 'border-amber-400 text-amber-300 bg-slate-900/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <User size={15} />
          <span>Artists & Resonance ({artistClusters.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('albums')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'albums'
              ? 'border-amber-400 text-amber-300 bg-slate-900/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Disc size={15} />
          <span>Albums & Validation ({albumClusters.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('singles')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'singles'
              ? 'border-amber-400 text-amber-300 bg-slate-900/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Music size={15} />
          <span>Singles Triage ({tracks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('basket')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'basket'
              ? 'border-emerald-400 text-emerald-300 bg-slate-900/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderCheck size={15} className="text-emerald-400" />
          <span>Immersion Basket ({stagedTracks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('ai_taste')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'ai_taste'
              ? 'border-purple-400 text-purple-300 bg-slate-900/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles size={15} className="text-purple-400" />
          <span>AI Taste Intelligence</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW & INGESTION                                               */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Philosophy Banner */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-orange-950/30 to-slate-900 border border-amber-500/30">
              <div className="flex items-start space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30 mt-0.5">
                  <Compass size={22} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-100 uppercase tracking-wide">
                    The Tri-Philosophy Discovery Bridge
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">
                    You discover music at unprecedented scale through streaming platforms. This module aggregates your multi-month intake cohorts, separates fleeting one-offs from true resonance, validates trusted artists for full album immersion, and stages your offline download baskets.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                    <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-[11px]">
                      <span className="font-bold text-amber-400 block mb-1">1. Singles (The Probe)</span>
                      <p className="text-slate-400">Initial sparks discovered across streaming feeds. Kept as lone singles or flagged for deeper artist exploration.</p>
                    </div>
                    <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-[11px]">
                      <span className="font-bold text-orange-400 block mb-1">2. Artists (The Resonance)</span>
                      <p className="text-slate-400">When attention is piqued, more tracks accumulate. Multiple songs identify high-resonance magnet artists.</p>
                    </div>
                    <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-[11px]">
                      <span className="font-bold text-emerald-400 block mb-1">3. Albums (The Validation Gate)</span>
                      <p className="text-slate-400">Albums come only when an artist is thoroughly validated and trusted for deep, multi-month offline immersion.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ingestion Dropzone & Sample Loader */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest mb-3 flex items-center space-x-2">
                  <FileSpreadsheet size={15} className="text-amber-400" />
                  <span>Ingest Discovery Files (Multi-File Supported)</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Drag and drop Spotify CSVs, YouTube Music CSVs, Musicolet exports, or M3U playlists simultaneously. Titles like <code>"Grace Runkle - open handed (Official Music Video)"</code> are automatically cleaned and split.
                </p>
                <FileUploader
                  label="Drop Discovery CSVs / M3Us"
                  subLabel="Supports Spotify, YouTube Music, Musicolet, M3U8, TXT"
                  files={uploadedFiles}
                  onFilesSelected={handleFilesSelected}
                  onClear={() => {
                    setUploadedFiles([]);
                    setTracks([]);
                    setStagedTrackIds(new Set());
                  }}
                  multiple={true}
                  accept=".csv,.tsv,.m3u,.m3u8,.txt"
                  colorClass="amber"
                />
              </div>

              {/* Workspace & Session Archiving */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest mb-2 flex items-center space-x-2">
                    <Download size={15} className="text-amber-400" />
                    <span>Workspace & Archiving</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    Save your triage state including basket selections, priorities, and validated albums to a JSON file or restore anytime via the ingestion box.
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={handleExportSessionJSON}
                      disabled={tracks.length === 0}
                      className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <Download size={14} className="text-amber-400" />
                      <span>Backup Session (.json)</span>
                    </button>
                    <button
                      onClick={handleExportDossierMarkdown}
                      disabled={tracks.length === 0}
                      className="w-full bg-slate-800/60 hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 border border-slate-700/70 font-semibold py-2 px-4 rounded-xl text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <FileText size={14} />
                      <span>Export Triage Report (.md)</span>
                    </button>
                  </div>
                </div>

                {tracks.length > 0 && (
                  <div className="pt-3 border-t border-slate-800/80">
                    <button
                      onClick={handleClearWorkspace}
                      className="w-full bg-rose-950/20 hover:bg-rose-900/40 text-rose-300 border border-rose-900/30 font-semibold py-1.5 px-3 rounded-lg text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>Clear Triage Workspace</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Ingestion Provenance Breakdown */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest mb-3 flex items-center justify-between">
                <span>Multi-Source Provenance & Overlap</span>
                <span className="text-[10px] font-mono text-cyan-400">
                  {stats.crossPlatformOverlapCount} tracks found on both Spotify & YouTube
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-200">Spotify Discovery</span>
                    <span className="font-mono text-emerald-400">{stats.sourceCounts['Spotify'] || 0} tracks</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Contains official album links, ISRC codes, and Spotify track identifiers.</p>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-200">YouTube Music Intake</span>
                    <span className="font-mono text-rose-400">{stats.sourceCounts['YouTube Music'] || 0} tracks</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Parsed from video titles with automatic visualizer/MV tag stripping.</p>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-200">Cross-Platform Overlap</span>
                    <span className="font-mono text-cyan-400">{stats.crossPlatformOverlapCount} overlaps</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Tracks unified into single entries preserving both source tags.</p>
                </div>
              </div>
            </div>

            {/* Cultural Diet Snapshot */}
            <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/30 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center space-x-2">
                  <Globe size={16} className="text-cyan-400" />
                  <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">
                    Language & Cultural Diet Breakdown ({bucketGroups.length} Traditions)
                  </h3>
                </div>
                <button
                  onClick={() => setActiveTab('buckets')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <span>Open Cultural Intake Balancer</span>
                  <ArrowRight size={13} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Tracks are categorized into authentic cultural traditions with strict chronological discovery ordering (<code className="text-amber-400">#Seq</code>) preserved.
              </p>
              <div className="flex flex-wrap gap-2">
                {bucketGroups.slice(0, 8).map(g => (
                  <div
                    key={g.bucket}
                    onClick={() => {
                      setSelectedBucketName(g.bucket);
                      setActiveTab('buckets');
                    }}
                    className="p-2.5 bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50 rounded-xl cursor-pointer transition-all flex items-center space-x-2"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${BUCKET_BAR_COLORS[g.bucket] || 'bg-slate-500'}`} />
                    <span className="font-bold text-slate-200 text-xs">{g.metadata.displayName}</span>
                    <span className="font-mono text-[10px] text-slate-500 font-bold">({g.trackCount})</span>
                    {g.stagedCount > 0 && (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-bold font-mono">
                        {g.stagedCount} staged
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1.5: CULTURAL & LANGUAGE BUCKETS (AUDIO DIET & TIME-ORDERED INTAKE)   */}
        {/* ========================================================================= */}
        {activeTab === 'buckets' && (
          tracks.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
                <Globe size={24} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-200 uppercase tracking-wide">No Discovery Tracks Loaded</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Ingest your Spotify or YouTube Music discovery playlists or restore a session backup in the Overview tab to view and balance your cultural intake.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('overview')}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer inline-flex items-center space-x-1.5"
              >
                <FileSpreadsheet size={14} />
                <span>Go to Ingestion Dropzone</span>
              </button>
            </div>
          ) : (
          <div className="space-y-6">
            {/* 1. Header & Intake Staging Tools */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-900 border border-cyan-500/30">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 border border-cyan-500/30 mt-0.5">
                    <Globe size={22} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-100 uppercase tracking-wide flex items-center space-x-2">
                      <span>Cultural & Language Intake Balancer</span>
                      <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold uppercase font-mono">
                        {bucketGroups.length} Traditions Active
                      </span>
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed mt-1 max-w-2xl">
                      Preserve and curate a proportionate audio diet across your authentic cultural heritage. All tracks strictly retain their chronological discovery order (<code className="text-amber-400 font-bold">#1, #2...</code>) so you can balance each intake cohort while knowing exactly when each song was discovered.
                    </p>
                  </div>
                </div>

                {/* Staging Quick Tools */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    onClick={openQuotaModal}
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs transition-all flex items-center space-x-2 cursor-pointer shadow-lg shadow-cyan-950/40"
                  >
                    <Scale size={15} />
                    <span>⚖️ Auto-Balance Basket (Quota Stager)</span>
                  </button>

                  <button
                    onClick={() => handleStageBalancedCohort(3)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold py-2.5 px-3.5 rounded-xl text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                    title="Stage the earliest 3 unstaged tracks from every cultural bucket"
                  >
                    <Plus size={14} className="text-cyan-400" />
                    <span>Stage Next 3 Per Bucket</span>
                  </button>
                </div>
              </div>

              {/* 2. Audio Diet Balance Meter (Discovery Pool vs Immersion Basket) */}
              <div className="mt-5 pt-4 border-t border-cyan-500/20 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                    <PieChart size={14} className="text-cyan-400" />
                    <span>Audio Diet Balance (Discovery Pool vs. Immersion Basket)</span>
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {stagedTracks.length} of {tracks.length} tracks staged ({tracks.length > 0 ? Math.round((stagedTracks.length / tracks.length) * 100) : 0}%)
                  </span>
                </div>

                {/* Stacked Bar: Discovery Pool */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Discovery Pool Composition ({tracks.length} total tracks)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                    {bucketGroups.map(g => {
                      const colorClass = BUCKET_BAR_COLORS[g.bucket] || 'bg-slate-500';
                      const displayName = g.metadata?.displayName || g.bucket || 'Unknown';
                      const pct = Math.min(100, Math.max(0, g.percentageOfTotal || 0));
                      return (
                        <div
                          key={g.bucket}
                          className={`${colorClass} h-full transition-all hover:opacity-80`}
                          style={{ width: `${pct}%` }}
                          title={`${displayName}: ${g.trackCount} tracks (${pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Stacked Bar: Immersion Basket */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Current Basket Intake Diet ({stagedTracks.length} staged tracks)</span>
                    {stagedTracks.length === 0 && (
                      <span className="text-amber-400">Basket empty — stage cohorts below</span>
                    )}
                  </div>
                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                    {stagedTracks.length === 0 ? (
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center text-[9px] text-slate-600 font-mono">
                        No tracks staged
                      </div>
                    ) : (
                      bucketGroups.filter(g => g.stagedCount > 0).map(g => {
                        const colorClass = BUCKET_BAR_COLORS[g.bucket] || 'bg-slate-500';
                        const totalStaged = Math.max(1, stagedTracks.length);
                        const pctOfStaged = Math.min(100, Math.max(0, (g.stagedCount / totalStaged) * 100));
                        const displayName = g.metadata?.displayName || g.bucket || 'Unknown';
                        return (
                          <div
                            key={g.bucket}
                            className={`${colorClass} h-full transition-all hover:opacity-80`}
                            style={{ width: `${pctOfStaged}%` }}
                            title={`${displayName}: ${g.stagedCount} staged (${pctOfStaged.toFixed(1)}% of basket)`}
                          />
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Legend Indicators */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-[11px]">
                  {bucketGroups.map(g => {
                    const colorClass = BUCKET_BAR_COLORS[g.bucket] || 'bg-slate-500';
                    return (
                      <div
                        key={g.bucket}
                        className="flex items-center space-x-1.5 text-slate-300 font-medium cursor-pointer hover:text-cyan-300 transition-colors"
                        onClick={() => setSelectedBucketName(selectedBucketName === g.bucket ? 'all' : g.bucket)}
                        title={`Click to filter by ${g.bucket} (${g.percentageOfTotal.toFixed(1)}%)`}
                      >
                        <span className={`w-2 h-2 rounded-full ${colorClass}`} />
                        <span className={selectedBucketName === g.bucket ? 'text-cyan-300 font-bold underline' : ''}>{g.bucket}</span>
                        <span className="font-mono text-[10px] text-slate-500 font-bold">({g.trackCount})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. Filter Toolbar & Bucket Cards Grid */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Search in bucket */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search songs, artists or albums in stream..."
                    value={bucketSearch}
                    onChange={e => setBucketSearch(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 w-72"
                  />
                  {bucketSearch && (
                    <button
                      onClick={() => setBucketSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Bucket Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    onClick={() => setSelectedBucketName('all')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                      selectedBucketName === 'all'
                        ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/40'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    All ({tracks.length})
                  </button>
                  {bucketGroups.map(g => (
                    <button
                      key={g.bucket}
                      onClick={() => setSelectedBucketName(g.bucket)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                        selectedBucketName === g.bucket
                          ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/40'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      <span>{g.bucket}</span>
                      <span className="font-mono text-[10px] font-normal opacity-80">({g.trackCount})</span>
                      {g.stagedCount > 0 && (
                        <span className={`text-[9px] px-1 py-0.2 rounded font-bold font-mono ${
                          selectedBucketName === g.bucket
                            ? 'bg-slate-950 text-emerald-400'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {g.stagedCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bucket Quick-Action Cards (shown when "All" is active, or single card for active bucket) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {bucketGroups
                  .filter(g => selectedBucketName === 'all' || selectedBucketName === g.bucket)
                  .map(g => {
                    const colorClass = BUCKET_BAR_COLORS[g.bucket] || 'bg-slate-500';
                    const unstagedCount = g.tracks.filter(t => !stagedTrackIds.has(t.id)).length;
                    const nextUnstaged = g.tracks.find(t => !stagedTrackIds.has(t.id));

                    return (
                      <div
                        key={g.bucket}
                        className={`bg-slate-900/70 border rounded-2xl p-4 flex flex-col justify-between transition-all ${
                          selectedBucketName === g.bucket
                            ? 'border-cyan-500/50 bg-slate-900/90 shadow-lg shadow-cyan-950/20'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2">
                              <span className={`w-3 h-3 rounded-full ${colorClass}`} />
                              <h3 className="font-black text-slate-100 text-sm">{g.metadata?.displayName || g.bucket || 'Unknown'}</h3>
                            </div>
                            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-full font-bold">
                              {g.percentageOfTotal.toFixed(1)}%
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{g.metadata?.description || ''}</p>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Tracks</span>
                              <span className="font-black text-slate-200">{g.trackCount}</span>
                              <span className="text-[10px] text-slate-500 ml-1">({g.artistCount} artists)</span>
                            </div>

                            <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Staged</span>
                              <div className="flex items-baseline space-x-1">
                                <span className="font-black text-emerald-400">{g.stagedCount}</span>
                                <span className="text-[10px] text-slate-500">/ {g.trackCount}</span>
                              </div>
                            </div>
                          </div>

                          {/* Next In Line Preview */}
                          {nextUnstaged ? (
                            <div className="mt-2.5 p-2 bg-slate-950/40 rounded-xl border border-slate-800/80 text-[10px]">
                              <span className="text-slate-500 block">Next in sequence:</span>
                              <div className="flex items-center space-x-1.5 mt-0.5 truncate">
                                <SourceSequenceBadge track={nextUnstaged} compact />
                                <span className="font-semibold text-slate-200 truncate">{nextUnstaged.title}</span>
                                <span className="text-slate-400 truncate">by {nextUnstaged.artist}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2.5 p-2 bg-emerald-950/20 rounded-xl border border-emerald-800/30 text-[10px] text-emerald-400 text-center font-bold">
                              ✓ All tracks in this bucket staged!
                            </div>
                          )}
                        </div>

                        {/* Card Action Buttons */}
                        <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center space-x-2">
                          <button
                            onClick={() => handleStageNextInBucket(g.bucket, 5)}
                            disabled={unstagedCount === 0}
                            className="flex-1 bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 disabled:opacity-30 py-1.5 px-2 rounded-xl text-[11px] font-bold border border-cyan-500/30 transition-all cursor-pointer flex items-center justify-center space-x-1"
                            title={`Stage the earliest 5 unstaged tracks from ${g.metadata?.displayName || g.bucket || 'Unknown'} in chronological order`}
                          >
                            <span>Stage Next 5</span>
                            <ArrowRight size={13} />
                          </button>

                          <button
                            onClick={() => setSelectedBucketName(g.bucket)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title="Filter stream to this bucket"
                          >
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* 4. Chronological Track Stream */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-950/60">
                <div className="flex items-center space-x-2">
                  <ListOrdered size={16} className="text-amber-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-200">
                    Chronological Discovery Stream ({filteredBucketTracks.length} tracks)
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Source Filter Tabs */}
                  <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                    {(['all', 'Spotify', 'YouTube Music'] as const).map(src => (
                      <button
                        key={src}
                        onClick={() => setBucketSourceFilter(src)}
                        className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                          bucketSourceFilter === src
                            ? src === 'Spotify'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                              : src === 'YouTube Music'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                              : 'bg-slate-800 text-amber-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {src === 'all' ? 'All Sources' : src === 'YouTube Music' ? 'YouTube' : src}
                      </button>
                    ))}
                  </div>

                  <span
                    className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-mono"
                    title="Numbering is individual per source/list starting from #1. Duplicate numbers across sources are supported."
                  >
                    #Seq = Per-List Chronology
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-28"># Seq</th>
                      <th className="py-3 px-4">Track & Artist</th>
                      <th className="py-3 px-4">Album</th>
                      <th className="py-3 px-4">Resonance</th>
                      <th className="py-3 px-4">Cultural Bucket</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4 text-right">Intake Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredBucketTracks.slice(0, 150).map(track => {
                      const isStaged = stagedTrackIds.has(track.id);
                      return (
                        <tr key={track.id} className="hover:bg-slate-800/30 transition-colors">
                          {/* Chronological Sequence Badge */}
                          <td className="py-2.5 px-4 font-mono">
                            <SourceSequenceBadge track={track} />
                          </td>

                          {/* Track & Artist */}
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-slate-200">{track.title}</div>
                            <div className="text-[11px] text-slate-400 font-medium">{track.artist}</div>
                          </td>

                          {/* Album */}
                          <td className="py-2.5 px-4 text-slate-400 text-[11px] max-w-[180px] truncate">
                            {track.album || 'Single / Discovery'}
                          </td>

                          {/* Resonance Tier */}
                          <td className="py-2.5 px-4">
                            {track.resonanceTier === 'high' && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                                🌟 Magnet
                              </span>
                            )}
                            {track.resonanceTier === 'emerging' && (
                              <span className="text-[9px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                                ⚡ Emerging
                              </span>
                            )}
                            {track.resonanceTier === 'probe' && (
                              <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase">
                                🔍 Probe
                              </span>
                            )}
                          </td>

                          {/* Inline Cultural Bucket Reassignment */}
                          <td className="py-2.5 px-4">
                            <select
                              value={track.culturalBucket || 'Other'}
                              onChange={e => handleUpdateTrackBucket(track.id, e.target.value as CanonicalBucket)}
                              className="bg-slate-950 border border-slate-700 hover:border-cyan-500 text-slate-200 text-[10px] rounded-lg px-2 py-1 font-semibold focus:outline-none focus:border-cyan-400 cursor-pointer"
                              title="Click to reassign cultural bucket and save to persistent cache"
                            >
                              {Object.keys(CANONICAL_BUCKETS).map(b => (
                                <option key={b} value={b}>
                                  {CANONICAL_BUCKETS[b as CanonicalBucket]?.displayName || b}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Source Tags */}
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap items-center gap-1">
                              {(track.sources || []).map(s => (
                                <span
                                  key={s}
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                    s === 'Spotify'
                                      ? 'bg-emerald-950 text-emerald-300'
                                      : s === 'Language Clustered'
                                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/80'
                                      : 'bg-rose-950 text-rose-300'
                                  }`}
                                >
                                  {s === 'Spotify' ? 'Spotify' : s === 'Language Clustered' ? 'Clustered' : 'YTM'}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <a
                                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                                  `${track.artist} ${track.title}`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                title="Listen / Search"
                              >
                                <Play size={12} />
                              </a>

                              <button
                                onClick={() => toggleStageTrack(track.id)}
                                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                                  isStaged
                                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                    : 'bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300'
                                }`}
                              >
                                {isStaged ? 'Staged 🛒' : '+ Stage'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredBucketTracks.length > 150 && (
                <div className="p-3 text-center text-[11px] text-slate-500 border-t border-slate-800 font-mono">
                  Showing first 150 of {filteredBucketTracks.length} tracks in strict chronological order. Use search or bucket filter to inspect specific ranges.
                </div>
              )}
            </div>
          </div>
          )
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ARTISTS & RESONANCE                                                */}
        {/* ========================================================================= */}
        {activeTab === 'artists' && (
          tracks.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <Users size={24} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-200 uppercase tracking-wide">No Artists In Triage</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Load discovery playlists to identify repeat artist resonances (High Resonance vs Lone Probes) and scout discographies.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('overview')}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer inline-flex items-center space-x-1.5"
              >
                <FileSpreadsheet size={14} />
                <span>Go to Ingestion Dropzone</span>
              </button>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Master Decision & Export Hub Banner */}
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Disc3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-100 flex items-center space-x-2">
                      <span>Artist Decision & Master Export Hub</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase font-mono">
                        High-Agency Triage
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Promote artists directly to albums, singlesify probe samples, or defer discographies to eliminate intake decision fatigue.
                    </p>
                  </div>
                </div>

                {dismissedArtistNames.size > 0 && (
                  <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-400">
                    <span>{dismissedArtistNames.size} artist(s) triaged & hidden from active view</span>
                    <button
                      onClick={handleRestoreAllDismissed}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg font-bold transition-all flex items-center space-x-1 cursor-pointer"
                      title="Restore all triaged artists to active view"
                    >
                      <RotateCcw size={12} />
                      <span>Restore All</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Master Compiled Export Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Promoted Albums */}
                <div className="bg-slate-900/90 border border-slate-800/80 hover:border-amber-500/40 rounded-xl p-3 flex flex-col justify-between transition-all">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                        <Disc3 size={15} className="text-amber-400" />
                        <span>Promoted Albums</span>
                      </span>
                      <span className="text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        {promotedArtistNames.size} artists ({compiledPromotedAlbumTracks.length} tracks)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Artists promoted to standalone compilations / albums.
                    </p>
                  </div>
                  <button
                    onClick={handleExportMasterPromotedAlbums}
                    disabled={compiledPromotedAlbumTracks.length === 0}
                    className={`mt-3 w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      compiledPromotedAlbumTracks.length > 0
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800'
                    }`}
                  >
                    <FileDown size={13} />
                    <span>Download Promoted Albums CSV</span>
                  </button>
                </div>

                {/* 2. Singlesified Tracks */}
                <div className="bg-slate-900/90 border border-slate-800/80 hover:border-emerald-500/40 rounded-xl p-3 flex flex-col justify-between transition-all">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                        <Scissors size={15} className="text-emerald-400" />
                        <span>Singlesified Tracks</span>
                      </span>
                      <span className="text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        {singlesifiedTracksMap.size} artists ({compiledSinglesifiedTracks.length} tracks)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Chosen single probe tracks retained from multi-track artists.
                    </p>
                  </div>
                  <button
                    onClick={handleExportMasterSinglesified}
                    disabled={compiledSinglesifiedTracks.length === 0}
                    className={`mt-3 w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      compiledSinglesifiedTracks.length > 0
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800'
                    }`}
                  >
                    <FileDown size={13} />
                    <span>Download Singlesified CSV</span>
                  </button>
                </div>

                {/* 3. Compiled Deferred (External Filter List) */}
                <div className="bg-slate-900/90 border border-slate-800/80 hover:border-rose-500/40 rounded-xl p-3 flex flex-col justify-between transition-all">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                        <Clock size={15} className="text-rose-400" />
                        <span>Deferred Filter List</span>
                      </span>
                      <span className="text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full">
                        {compiledDeferredTracks.length} deferred tracks
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Deferred artists + unselected singles. Use externally to filter master list down to pure 1-off singles.
                    </p>
                  </div>
                  <button
                    onClick={handleExportMasterDeferred}
                    disabled={compiledDeferredTracks.length === 0}
                    className={`mt-3 w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      compiledDeferredTracks.length > 0
                        ? 'bg-rose-500 hover:bg-rose-400 text-slate-950 shadow-md shadow-rose-500/20'
                        : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800'
                    }`}
                  >
                    <FileDown size={13} />
                    <span>Download Master Deferred CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* View Scope Tabs */}
                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase px-2">Scope:</span>
                  <button
                    onClick={() => setArtistViewScope('active')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      artistViewScope === 'active' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Active ({artistClusters.filter(c => !dismissedArtistNames.has(c.artist)).length})
                  </button>
                  <button
                    onClick={() => setArtistViewScope('promoted')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      artistViewScope === 'promoted' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🌟 Promoted ({promotedArtistNames.size})
                  </button>
                  <button
                    onClick={() => setArtistViewScope('singlesified')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      artistViewScope === 'singlesified' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🎯 Singlesified ({singlesifiedTracksMap.size})
                  </button>
                  <button
                    onClick={() => setArtistViewScope('deferred')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      artistViewScope === 'deferred' ? 'bg-rose-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    📦 Deferred ({deferredArtistNames.size})
                  </button>
                  <button
                    onClick={() => setArtistViewScope('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      artistViewScope === 'all' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({artistClusters.length})
                  </button>
                </div>

                {/* Sort Switcher */}
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Sort:</span>
                  <select
                    value={artistSort}
                    onChange={e => setArtistSort(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="count">Most Tracks First</option>
                    <option value="name">Alphabetical (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Filters Row: Search, Resonance Tier, Language / Cultural Bucket */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/60">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search artists, songs or albums..."
                      value={artistSearch}
                      onChange={e => setArtistSearch(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 w-56"
                    />
                    {artistSearch && (
                      <button
                        onClick={() => setArtistSearch('')}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Tier Pills */}
                  <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      onClick={() => setArtistTierFilter('all')}
                      className={`px-2 py-0.5 rounded-lg font-bold cursor-pointer transition-colors ${
                        artistTierFilter === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All Tiers
                    </button>
                    <button
                      onClick={() => setArtistTierFilter('high')}
                      className={`px-2 py-0.5 rounded-lg font-bold cursor-pointer transition-colors ${
                        artistTierFilter === 'high' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🌟 Magnet ({stats.highResonanceArtists})
                    </button>
                    <button
                      onClick={() => setArtistTierFilter('emerging')}
                      className={`px-2 py-0.5 rounded-lg font-bold cursor-pointer transition-colors ${
                        artistTierFilter === 'emerging' ? 'bg-orange-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ⚡ Emerging ({stats.emergingArtists})
                    </button>
                    <button
                      onClick={() => setArtistTierFilter('probe')}
                      className={`px-2 py-0.5 rounded-lg font-bold cursor-pointer transition-colors ${
                        artistTierFilter === 'probe' ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🔍 Probes ({stats.singleProbeArtists})
                    </button>
                  </div>

                  {/* Language / Cultural Bucket Filter */}
                  <div className="flex items-center space-x-1.5 text-xs">
                    <Globe size={13} className="text-slate-500" />
                    <select
                      value={artistLanguageFilter}
                      onChange={e => setArtistLanguageFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-500/60 max-w-[210px] truncate"
                    >
                      <option value="all">All Cultural Buckets ({artistClusters.length})</option>
                      {availableArtistLanguages.map(([b, count]) => (
                        <option key={b} value={b}>
                          {b} ({count})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Batch selection quick trigger */}
                <div className="flex items-center space-x-2 text-xs">
                  {filteredArtists.length > 0 && (
                    <button
                      onClick={() => {
                        const allVis = filteredArtists.every(a => selectedArtistNames.has(a.artist));
                        if (allVis) handleDeselectAllArtists();
                        else handleSelectAllVisibleArtists();
                      }}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 font-bold transition-all cursor-pointer"
                    >
                      {filteredArtists.every(a => selectedArtistNames.has(a.artist)) ? (
                        <>
                          <CheckSquare size={13} className="text-amber-400" />
                          <span>Deselect All in View</span>
                        </>
                      ) : (
                        <>
                          <Square size={13} className="text-slate-500" />
                          <span>Select All in View ({filteredArtists.length})</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Batch Action Bar */}
            {selectedArtistNames.size > 0 && (
              <div className="sticky top-2 z-20 bg-amber-500/10 border-2 border-amber-500/60 backdrop-blur-md rounded-2xl p-3 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs">
                    {selectedArtistNames.size}
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-300">
                      {selectedArtistNames.size} Artists Selected
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Apply bulk triage actions and export real-time compiled CSVs
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleBatchStageSelected}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                    title="Stage all tracks from all selected artists into Immersion Basket"
                  >
                    <Plus size={13} />
                    <span>🛒 Stage Selected to Basket</span>
                  </button>

                  <button
                    onClick={handleBatchPromoteSelected}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                  >
                    <Disc3 size={13} />
                    <span>🌟 Promote Selected to Albums</span>
                  </button>

                  <button
                    onClick={handleBatchDeferSelected}
                    className="bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-slate-950 border border-rose-500/40 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Clock size={13} />
                    <span>📦 Defer Selected</span>
                  </button>

                  <button
                    onClick={handleDeselectAllArtists}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            {/* Artist Cards Grid */}
            {filteredArtists.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
                <Users size={28} className="text-slate-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-300">No artists match the current scope and filters</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Switch the scope above to Promoted, Singlesified, Deferred, or All to view previously triaged artists.
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredArtists.map(cluster => {
                const isExpanded = expandedArtist === cluster.artist;
                const isSinglesifying = activeSinglesifyArtist === cluster.artist;
                const isSelected = selectedArtistNames.has(cluster.artist);
                const isPromoted = promotedArtistNames.has(cluster.artist);
                const isSinglesified = singlesifiedTracksMap.has(cluster.artist);
                const isDeferred = deferredArtistNames.has(cluster.artist);
                const isDismissed = dismissedArtistNames.has(cluster.artist);
                const singlesSelection = tempSinglesSelections.get(cluster.artist) || singlesifiedTracksMap.get(cluster.artist) || new Set();

                const allStaged = cluster.tracks.every(t => stagedTrackIds.has(t.id));
                const someStaged = cluster.tracks.some(t => stagedTrackIds.has(t.id));

                return (
                  <div
                    key={cluster.artist}
                    className={`bg-slate-900/70 border rounded-2xl p-4 transition-all ${
                      isSinglesifying
                        ? 'border-emerald-500/80 bg-slate-900/95 ring-1 ring-emerald-500/40 shadow-xl shadow-emerald-500/10'
                        : isSelected
                        ? 'border-amber-500/60 bg-amber-500/5'
                        : cluster.resonanceTier === 'high'
                        ? 'border-amber-500/30 hover:border-amber-500/60'
                        : cluster.resonanceTier === 'emerging'
                        ? 'border-orange-500/20 hover:border-orange-500/50'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                        <button
                          onClick={() => handleToggleSelectArtist(cluster.artist)}
                          className="mt-0.5 text-slate-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0"
                          title={isSelected ? 'Deselect artist' : 'Select artist for batch actions'}
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-amber-400" />
                          ) : (
                            <Square size={16} className="text-slate-600 hover:text-slate-400" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="font-black text-slate-100 text-sm truncate max-w-[220px]" title={cluster.artist}>
                              {cluster.artist}
                            </h4>

                            {cluster.resonanceTier === 'high' && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                                🌟 Magnet
                              </span>
                            )}
                            {cluster.resonanceTier === 'emerging' && (
                              <span className="text-[9px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                                ⚡ Emerging
                              </span>
                            )}

                            {/* Cultural / Language Bucket Badge */}
                            {cluster.primaryCulturalBucket && (
                              <span className="text-[9px] bg-sky-500/15 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full font-bold flex items-center space-x-1">
                                <Globe size={9} />
                                <span>{cluster.primaryCulturalBucket}</span>
                              </span>
                            )}

                            {/* Triaged Status Badges */}
                            {isPromoted && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                                🌟 Promoted
                              </span>
                            )}
                            {isSinglesified && (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                                🎯 Singles ({singlesifiedTracksMap.get(cluster.artist)?.size || 0} kept)
                              </span>
                            )}
                            {isDeferred && (
                              <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full font-bold">
                                📦 Deferred
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-1 font-medium">
                            <span className="text-amber-300 font-bold">{cluster.trackCount} tracks</span>
                            <span>•</span>
                            <span>{cluster.albumCount} album(s)</span>
                            <span>•</span>
                            <div className="flex items-center space-x-1">
                              {(cluster.sources || []).map(s => (
                                <span
                                  key={s}
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                    s === 'Spotify' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                                  }`}
                                >
                                  {s === 'Spotify' ? 'Sp' : 'YT'}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Restore button if dismissed and in non-active scope */}
                      {isDismissed && (
                        <button
                          onClick={() => handleRestoreArtist(cluster.artist)}
                          className="shrink-0 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition-all cursor-pointer"
                          title="Restore artist to Active Triage view"
                        >
                          <RotateCcw size={10} />
                          <span>Restore</span>
                        </button>
                      )}
                    </div>

                    {/* High-Agency Action Row */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-800/80">
                      {/* 1. Promote to Album */}
                      <button
                        onClick={() => handlePromoteArtistToAlbum(cluster)}
                        className="bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
                        title="Promote to Album: exports CSV immediately & clears from active triage"
                      >
                        <Disc3 size={12} />
                        <span>Promote to Album</span>
                      </button>

                      {/* 2. Singlesify */}
                      <button
                        onClick={() => handleStartSinglesify(cluster)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer ${
                          isSinglesifying
                            ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400 shadow-md shadow-emerald-500/20'
                            : 'bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/30'
                        }`}
                        title="Pick individual sample tracks to keep as singles, defer rest & export CSV"
                      >
                        <Scissors size={12} />
                        <span>{isSinglesifying ? 'Singlesifying...' : 'Singlesify'}</span>
                      </button>

                      {/* 3. Defer Artist */}
                      <button
                        onClick={() => handleDeferArtist(cluster)}
                        className="bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-400 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
                        title="Defer artist discography: exports deferred CSV & clears from active triage"
                      >
                        <Clock size={12} />
                        <span>Defer Artist</span>
                      </button>

                      {/* 4. AI Scout */}
                      <button
                        onClick={() => handleScoutArtist(cluster)}
                        className="p-1 rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white transition-all text-xs font-bold flex items-center space-x-1 cursor-pointer ml-auto"
                        title="Run AI Discography Scout on this artist"
                      >
                        <Sparkles size={12} />
                        <span className="text-[10px]">AI Scout</span>
                      </button>

                      {/* 5. Stage All */}
                      <button
                        onClick={() => stageAllArtistTracks(cluster.artist)}
                        className={`p-1 px-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                          allStaged
                            ? 'bg-emerald-500 text-slate-950'
                            : someStaged
                            ? 'bg-emerald-500/30 text-emerald-200'
                            : 'bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300'
                        }`}
                        title="Stage all songs by this artist to Immersion Basket"
                      >
                        <Check size={12} />
                        <span className="text-[10px]">{allStaged ? 'Staged' : 'Stage All'}</span>
                      </button>
                    </div>

                    {/* Albums preview chips */}
                    {cluster.albums.filter(a => a.name !== 'Singles / EPs').length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-slate-800/60">
                        {cluster.albums
                          .filter(a => a.name !== 'Singles / EPs')
                          .slice(0, 4)
                          .map(al => (
                            <span
                              key={al.name}
                              className={`text-[10px] px-2 py-0.5 rounded-lg border font-medium flex items-center space-x-1 ${
                                al.isValidated
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : 'bg-slate-950/70 text-slate-300 border-slate-800'
                              }`}
                            >
                              <Disc size={10} className="text-slate-500" />
                              <span className="truncate max-w-[130px]">{al.name}</span>
                              <span className="opacity-60 text-[9px]">({al.trackCount})</span>
                            </span>
                          ))}
                      </div>
                    )}

                    {/* Expand/Collapse Tracklist Toggle & Listen Link */}
                    <div className="mt-2.5 pt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <button
                        onClick={() => setExpandedArtist(isExpanded ? null : cluster.artist)}
                        className="flex items-center space-x-1 text-slate-400 hover:text-slate-200 font-bold transition-colors cursor-pointer"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{isExpanded ? 'Hide Tracks' : `View ${cluster.trackCount} Tracks`}</span>
                      </button>

                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(cluster.artist)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center space-x-1 text-slate-500 hover:text-amber-400 transition-colors"
                      >
                        <span>Listen</span>
                        <ArrowUpRight size={11} />
                      </a>
                    </div>

                    {/* Expanded Tracklist / In-Card Singlesification UI */}
                    {isExpanded && (
                      <div className="mt-2.5 space-y-2">
                        {/* Singlesification interactive control bar */}
                        {isSinglesifying && (
                          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-2.5 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                              <span className="font-black text-emerald-300 flex items-center space-x-1.5">
                                <Scissors size={13} />
                                <span>Singles Selection ({singlesSelection.size} of {cluster.trackCount} checked)</span>
                              </span>
                              <div className="flex items-center space-x-1 text-[10px]">
                                <button
                                  onClick={() => handleSelectAllSinglesForArtist(cluster.artist, cluster.tracks.map(t => t.id))}
                                  className="text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={() => handleSelectFirstSingleForArtist(cluster.artist, cluster.tracks[0]?.id)}
                                  className="text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                                >
                                  First Only
                                </button>
                                <button
                                  onClick={() => handleClearSinglesForArtist(cluster.artist)}
                                  className="text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            <p className="text-[10px] text-emerald-200/70">
                              Checked songs are kept as singles probes. Unchecked songs are marked as deferred and added to the Master Deferred Filter List.
                            </p>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                onClick={() => handleFinalizeSinglesification(cluster)}
                                disabled={singlesSelection.size === 0}
                                className={`px-3 py-1 rounded-lg text-xs font-black flex items-center space-x-1.5 transition-all cursor-pointer ${
                                  singlesSelection.size > 0
                                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                <Check size={13} />
                                <span>Commit Singles & Remove from View</span>
                              </button>
                              <button
                                onClick={() => handleExportArtistSinglesCSV(cluster)}
                                disabled={singlesSelection.size === 0}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center space-x-1 transition-all cursor-pointer"
                              >
                                <FileDown size={12} />
                                <span>Export Singles CSV</span>
                              </button>
                              <button
                                onClick={() => setActiveSinglesifyArtist(null)}
                                className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Tracks list */}
                        <div className="space-y-1 bg-slate-950/60 rounded-xl p-2 border border-slate-800/60 max-h-56 overflow-y-auto">
                          {cluster.tracks.map(t => {
                            const isStaged = stagedTrackIds.has(t.id);
                            const isSingleChecked = singlesSelection.has(t.id);

                            return (
                              <div
                                key={t.id}
                                className={`flex items-center justify-between text-xs p-1.5 rounded-lg transition-colors group ${
                                  isSinglesifying
                                    ? isSingleChecked
                                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                                      : 'hover:bg-slate-900/80'
                                    : 'hover:bg-slate-900/80'
                                }`}
                              >
                                <div className="flex items-center space-x-2 truncate flex-1 min-w-0 pr-2">
                                  {isSinglesifying ? (
                                    <button
                                      onClick={() => handleToggleKeepAsSingle(cluster.artist, t.id)}
                                      className="text-slate-500 hover:text-emerald-400 cursor-pointer shrink-0"
                                      title={isSingleChecked ? 'Uncheck single' : 'Keep as Single'}
                                    >
                                      {isSingleChecked ? (
                                        <CheckSquare size={15} className="text-emerald-400" />
                                      ) : (
                                        <Square size={15} className="text-slate-600 hover:text-slate-400" />
                                      )}
                                    </button>
                                  ) : (
                                    <SourceSequenceBadge track={t} compact />
                                  )}

                                  <div className="truncate flex-1 min-w-0">
                                    <span className="font-semibold text-slate-200 truncate block">{t.title}</span>
                                    <div className="flex items-center space-x-2 text-[10px] text-slate-500 truncate">
                                      <span className="truncate">{t.album}</span>
                                      {isSinglesifying && (
                                        <span className={`font-mono font-bold ${isSingleChecked ? 'text-emerald-400' : 'text-slate-500'}`}>
                                          • {isSingleChecked ? 'Kept as Single' : 'Deferred'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-1.5 shrink-0">
                                  <button
                                    onClick={() => toggleStageTrack(t.id)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                      isStaged
                                        ? 'bg-emerald-500 text-slate-950'
                                        : 'bg-slate-800 text-slate-400 hover:bg-emerald-500 hover:text-slate-950'
                                    }`}
                                  >
                                    {isStaged ? 'Staged' : '+ Stage'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
          )
        )}

        {/* ========================================================================= */}
        {/* TAB 3: ALBUMS & VALIDATION                                                */}
        {/* ========================================================================= */}
        {activeTab === 'albums' && (
          tracks.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <Disc3 size={24} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-200 uppercase tracking-wide">No Album Clusters</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Load discovery playlists to group tracks into candidate albums, validate them, and stage entire album cohorts for immersion.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('overview')}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer inline-flex items-center space-x-1.5"
              >
                <FileSpreadsheet size={14} />
                <span>Go to Ingestion Dropzone</span>
              </button>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search albums or artists..."
                    value={albumSearch}
                    onChange={e => setAlbumSearch(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 w-64"
                  />
                  {albumSearch && (
                    <button
                      onClick={() => setAlbumSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setAlbumFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      albumFilter === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({albumClusters.length})
                  </button>
                  <button
                    onClick={() => setAlbumFilter('validated')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      albumFilter === 'validated' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🟢 Validated ({stats.validatedAlbumsCount})
                  </button>
                  <button
                    onClick={() => setAlbumFilter('candidate')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      albumFilter === 'candidate' ? 'bg-orange-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🟡 Candidates ({stats.albumCandidatesCount})
                  </button>
                </div>
              </div>

              {/* Threshold Slider */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 font-medium">Candidate Threshold:</span>
                <select
                  value={candidateThreshold}
                  onChange={e => setCandidateThreshold(parseInt(e.target.value, 10))}
                  className="bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none"
                >
                  <option value={2}>&ge; 2 tracks saved</option>
                  <option value={3}>&ge; 3 tracks saved</option>
                  <option value={4}>&ge; 4 tracks saved</option>
                </select>
              </div>
            </div>

            {/* Albums Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAlbums.map(cluster => {
                const isValidated = cluster.validationStatus === 'validated';
                return (
                  <div
                    key={`${cluster.artist}___${cluster.album}`}
                    className={`bg-slate-900/70 border rounded-2xl p-5 transition-all ${
                      isValidated
                        ? 'border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                        : cluster.isCandidate
                        ? 'border-orange-500/30'
                        : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center space-x-2">
                          <Disc
                            size={16}
                            className={isValidated ? 'text-emerald-400' : cluster.isCandidate ? 'text-orange-400' : 'text-slate-500'}
                          />
                          <h4 className="font-black text-slate-100 text-sm truncate">{cluster.album}</h4>
                        </div>
                        <p className="text-xs font-semibold text-slate-400 mt-1 truncate">{cluster.artist}</p>
                      </div>

                      {/* 1-Click Validation Button */}
                      <button
                        onClick={() => toggleValidateAlbum(cluster.artist, cluster.album)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shrink-0 ${
                          isValidated
                            ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-md shadow-emerald-950/40'
                            : 'bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 border border-slate-700'
                        }`}
                      >
                        <ShieldCheck size={14} />
                        <span>{isValidated ? 'Validated' : 'Validate Album'}</span>
                      </button>
                    </div>

                    {/* Progress & Density Meter */}
                    <div className="mt-4">
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono mb-1.5">
                        <span>{cluster.trackCount} discovered tracks</span>
                        <span>{cluster.validationScore}% Density Signal</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isValidated ? 'bg-emerald-400' : cluster.isCandidate ? 'bg-orange-400' : 'bg-slate-600'
                          }`}
                          style={{ width: `${cluster.validationScore}%` }}
                        />
                      </div>
                    </div>

                    {/* Tracks List */}
                    <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-1">
                      {cluster.tracks.map(t => {
                        const isStaged = stagedTrackIds.has(t.id);
                        return (
                          <div
                            key={t.id}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-950/40"
                          >
                            <span className="text-slate-300 truncate pr-2">{t.title}</span>
                            <button
                              onClick={() => toggleStageTrack(t.id)}
                              className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                                isStaged
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-400 hover:bg-emerald-500 hover:text-slate-950'
                              }`}
                            >
                              {isStaged ? 'Staged' : '+ Basket'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SINGLES TRIAGE                                                     */}
        {/* ========================================================================= */}
        {activeTab === 'singles' && (
          tracks.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <Music2 size={24} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-200 uppercase tracking-wide">No Singles In Triage</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Ingest your discovery playlists to inspect probe tracks, evaluate single-track resonances, and stage songs for offline download.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('overview')}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer inline-flex items-center space-x-1.5"
              >
                <FileSpreadsheet size={14} />
                <span>Go to Ingestion Dropzone</span>
              </button>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search singles, artists..."
                    value={singleSearch}
                    onChange={e => setSingleSearch(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 w-64"
                  />
                </div>

                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setSingleStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      singleStatusFilter === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({tracks.length})
                  </button>
                  <button
                    onClick={() => setSingleStatusFilter('probe')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      singleStatusFilter === 'probe' ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Lone Probes ({stats.singleProbeArtists})
                  </button>
                  <button
                    onClick={() => setSingleStatusFilter('staged')}
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                      singleStatusFilter === 'staged' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Staged ({stagedTracks.length})
                  </button>
                </div>

                {/* Source Filter Pills */}
                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  {(['all', 'Spotify', 'YouTube Music'] as const).map(src => (
                    <button
                      key={src}
                      onClick={() => setSingleSourceFilter(src)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        singleSourceFilter === src
                          ? src === 'Spotify'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : src === 'YouTube Music'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                            : 'bg-slate-800 text-amber-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {src === 'all' ? 'All Sources' : src === 'YouTube Music' ? 'YouTube' : src}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bulk Actions */}
              <div className="flex items-center space-x-2 text-xs">
                <button
                  onClick={() => {
                    const newIds = new Set(stagedTrackIds);
                    filteredSingles.forEach(t => newIds.add(t.id));
                    setStagedTrackIds(newIds);
                    showToast(`Staged ${filteredSingles.length} filtered tracks to Basket!`);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl font-bold border border-slate-700 cursor-pointer"
                >
                  Stage All Filtered ({filteredSingles.length})
                </button>
              </div>
            </div>

            {/* Singles Table */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-28"># Seq</th>
                      <th className="py-3 px-4">Track & Artist</th>
                      <th className="py-3 px-4">Album</th>
                      <th className="py-3 px-4">Resonance Tier</th>
                      <th className="py-3 px-4">Cultural Bucket</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4 text-right">Triage Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredSingles.slice(0, 100).map(track => {
                      const isStaged = stagedTrackIds.has(track.id);
                      return (
                        <tr key={track.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 px-4 font-mono">
                            <SourceSequenceBadge track={track} />
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-slate-200">{track.title}</div>
                            <div className="text-[11px] text-slate-400 font-medium">{track.artist}</div>
                          </td>
                          <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                            {track.album || 'Single / Discovery'}
                          </td>
                          <td className="py-2.5 px-4">
                            {track.resonanceTier === 'high' && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                                🌟 Magnet
                              </span>
                            )}
                            {track.resonanceTier === 'emerging' && (
                              <span className="text-[9px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                                ⚡ Emerging
                              </span>
                            )}
                            {track.resonanceTier === 'probe' && (
                              <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase">
                                Lone Probe
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <select
                              value={track.culturalBucket || 'Other'}
                              onChange={e => handleUpdateTrackBucket(track.id, e.target.value as CanonicalBucket)}
                              className="bg-slate-950 border border-slate-700 hover:border-cyan-500 text-slate-200 text-[10px] rounded-lg px-2 py-1 font-semibold focus:outline-none focus:border-cyan-400 cursor-pointer"
                              title="Reassign cultural bucket"
                            >
                              {Object.keys(CANONICAL_BUCKETS).map(b => (
                                <option key={b} value={b}>
                                  {CANONICAL_BUCKETS[b as CanonicalBucket]?.displayName || b}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap items-center gap-1">
                              {(track.sources || []).map(s => (
                                <span
                                  key={s}
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                    s === 'Spotify' ? 'bg-emerald-950 text-emerald-300' :
                                    s === 'Language Clustered' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/80' :
                                    'bg-rose-950 text-rose-300'
                                  }`}
                                >
                                  {s === 'Spotify' ? 'Spotify' : s === 'Language Clustered' ? 'Clustered' : 'YTM'}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {/* YouTube Search Preview */}
                              <a
                                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                                  `${track.artist} ${track.title}`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                title="Listen / Search"
                              >
                                <Play size={12} />
                              </a>

                              {/* Stage to Basket */}
                              <button
                                onClick={() => toggleStageTrack(track.id)}
                                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                                  isStaged
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300'
                                }`}
                              >
                                {isStaged ? 'Staged 🛒' : '+ Stage'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredSingles.length > 100 && (
                <div className="p-3 text-center text-[11px] text-slate-500 border-t border-slate-800">
                  Showing first 100 of {filteredSingles.length} tracks. Use search to refine.
                </div>
              )}
            </div>
          </div>
          )
        )}

        {/* ========================================================================= */}
        {/* TAB 5: IMMERSION BASKET (OFFLINE BRIDGE)                                  */}
        {/* ========================================================================= */}
        {activeTab === 'basket' && (
          <div className="space-y-6">
            {/* Launchpad Header */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-slate-900 border border-emerald-500/30">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-100 uppercase tracking-wide flex items-center space-x-2">
                    <FolderCheck size={18} className="text-emerald-400" />
                    <span>The Immersion Staging Basket</span>
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1 max-w-2xl">
                    "I discover, choose items for download, download, immerse for months... and when it's time for downloading, I go the extra." Export your finalized cohort directly to download utilities, Spotify, or Musicolet.
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-2xl font-black text-emerald-300">{stagedTracks.length}</span>
                  <span className="text-[10px] text-slate-400 font-mono block">Tracks Staged</span>
                </div>
              </div>

              {/* Exporters Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-emerald-500/20">
                <button
                  onClick={handleExportDownloaderList}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-lg shadow-emerald-950/40"
                >
                  <Download size={14} />
                  <span>Downloader Query List (.txt)</span>
                </button>

                <button
                  onClick={handleExportSyncCSV}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-3 rounded-xl text-xs border border-slate-700 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <FileSpreadsheet size={14} className="text-cyan-400" />
                  <span>TuneMyMusic / Sync (.csv)</span>
                </button>

                <button
                  onClick={handleExportMusicoletM3U}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-3 rounded-xl text-xs border border-slate-700 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <ListMusic size={14} className="text-amber-400" />
                  <span>Musicolet Ready (.m3u)</span>
                </button>

                <button
                  onClick={handleExportDossierMarkdown}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-3 rounded-xl text-xs border border-slate-700 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <FileText size={14} className="text-purple-400" />
                  <span>Archival Dossier (.md)</span>
                </button>
              </div>

              {/* Basket Cultural Diet Summary */}
              <div className="mt-4 pt-3 border-t border-emerald-500/20 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider mr-1 flex items-center space-x-1">
                  <Globe size={12} className="text-emerald-400" />
                  <span>Intake Audio Diet:</span>
                </span>
                {bucketGroups.filter(g => g.stagedCount > 0).length === 0 ? (
                  <span className="text-[11px] text-slate-400">No tracks staged yet</span>
                ) : (
                  bucketGroups.filter(g => g.stagedCount > 0).map(g => (
                    <span
                      key={g.bucket}
                      className="text-[10px] bg-slate-900 border border-slate-700 px-2.5 py-0.5 rounded-full text-slate-300 flex items-center space-x-1.5 shadow-sm"
                    >
                      <span className={`w-2 h-2 rounded-full ${BUCKET_BAR_COLORS[g.bucket] || 'bg-slate-500'}`} />
                      <span>{g.metadata?.displayName || g.bucket || 'Unknown'}</span>
                      <span className="font-bold text-emerald-400 font-mono">({g.stagedCount})</span>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Staged Tracks Partitioned by Priority */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">
                  Staged Batch Queue ({stagedTracks.length})
                </h3>
                <button
                  onClick={() => {
                    setStagedTrackIds(new Set());
                    showToast('Cleared Immersion Basket');
                  }}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>Clear Basket</span>
                </button>
              </div>

              {stagedTracks.length === 0 ? (
                <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500 text-xs">
                  Your Immersion Basket is empty. Head to the Cultural Buckets, Artists, Albums, or Singles tabs to stage tracks for offline download!
                </div>
              ) : (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl divide-y divide-slate-800/60">
                  {stagedTracks.map((t, idx) => (
                    <div key={t.id} className="p-3.5 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center space-x-3 flex-1 min-w-0 pr-4">
                        <span className="text-[11px] font-mono text-slate-500 w-6 shrink-0">{idx + 1}.</span>
                        <div className="truncate">
                          <div className="flex items-center space-x-2">
                            <SourceSequenceBadge track={t} compact />
                            <h4 className="font-bold text-slate-200 text-xs truncate">{t.title}</h4>
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 shrink-0">
                              {t.culturalBucket}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                            {t.artist} • <span className="text-slate-500">{t.album}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        {/* Priority Toggle Pill */}
                        <button
                          onClick={() => toggleTrackPriority(t.id)}
                          className={`text-[10px] px-2.5 py-1 rounded-full font-bold cursor-pointer transition-all ${
                            t.downloadPriority === 'immediate'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {t.downloadPriority === 'immediate' ? '🚀 Priority 1' : '📦 Priority 2'}
                        </button>

                        <button
                          onClick={() => toggleStageTrack(t.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Remove from basket"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: AI TASTE INTELLIGENCE CONSOLE                                      */}
        {/* ========================================================================= */}
        {activeTab === 'ai_taste' && (
          <div className="space-y-6">
            {/* Header / Trigger */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900 border border-purple-500/30">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-100 uppercase tracking-wide flex items-center space-x-2">
                    <Sparkles size={18} className="text-purple-400" />
                    <span>AI Taste Intelligence & Discography Scout</span>
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1 max-w-2xl">
                    Uses Gemini 2.5 Flash or your local offline LLM to analyze the entire discovery cohort, uncover hidden micro-genres, recommend definitive album dives, and flag intriguing sonic anomalies.
                  </p>
                </div>

                <button
                  onClick={handleRunTasteSynthesis}
                  disabled={isSynthesizingTaste || tracks.length === 0}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center space-x-2 cursor-pointer shadow-lg shadow-purple-950/40 shrink-0 ml-4"
                >
                  <Sparkles size={14} className={isSynthesizingTaste ? 'animate-spin' : ''} />
                  <span>{isSynthesizingTaste ? 'Synthesizing...' : 'Run Taste Synthesis'}</span>
                </button>
              </div>

              {tasteSynthesisProgress && (
                <div className="mt-3 text-xs text-purple-300 font-mono animate-pulse">
                  {tasteSynthesisProgress}
                </div>
              )}
            </div>

            {/* Dossier Display */}
            {tasteDossier ? (
              <div className="space-y-6">
                {/* Headline Banner */}
                <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl">
                  <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider block mb-1">
                    Cohort Thesis
                  </span>
                  <h3 className="text-lg font-black text-slate-100">"{tasteDossier.headline}"</h3>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">{tasteDossier.summary}</p>
                </div>

                {/* Sonic Themes */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Aesthetic Connective Tissue & Micro-Scenes
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tasteDossier.sonicThemes.map((th, idx) => (
                      <div key={idx} className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                        <h5 className="font-bold text-amber-300 text-xs">{th.theme}</h5>
                        <p className="text-xs text-slate-400 leading-relaxed">{th.description}</p>
                        <div className="pt-2 flex flex-wrap gap-1">
                          {th.sampleArtists.map(a => (
                            <span
                              key={a}
                              className="text-[10px] bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-md"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Album Dives */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center space-x-1.5">
                    <Disc size={14} />
                    <span>Top Recommended Full Album Dives (Validation Candidates)</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {tasteDossier.recommendedAlbumDives.map((rec, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-slate-900/70 border border-emerald-500/30 rounded-xl flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-black text-slate-200 text-xs truncate">{rec.artist}</span>
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded uppercase">
                              {rec.priority}
                            </span>
                          </div>
                          <p className="text-xs text-amber-400 font-bold mt-1">💿 {rec.album}</p>
                          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{rec.reason}</p>
                        </div>
                        <button
                          onClick={() => toggleValidateAlbum(rec.artist, rec.album)}
                          className="w-full bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          + Validate & Stage Album
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Anomalies */}
                {tasteDossier.detectedAnomalies.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-cyan-400">
                      Curious Outliers & Anomalies
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {tasteDossier.detectedAnomalies.map((ano, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-900/50 border border-slate-800 rounded-xl">
                          <span className="font-bold text-slate-200 text-xs">
                            {ano.artist} — {ano.title}
                          </span>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{ano.observation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-12 text-center bg-slate-900/30 border border-slate-800 rounded-2xl text-slate-500 text-xs">
                Click "Run Taste Synthesis" above to generate your AI Curation Dossier.
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* ARTIST DISCOGRAPHY SCOUT MODAL / DRAWER                                   */}
      {/* ========================================================================= */}
      {selectedScoutArtist && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-black text-slate-100">{selectedScoutArtist.artist}</h3>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                    AI Scout
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  You have saved <strong className="text-amber-300">{selectedScoutArtist.trackCount} songs</strong> by this artist.
                </p>
              </div>

              <button
                onClick={() => setSelectedScoutArtist(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {isScoutingArtist ? (
              <div className="py-12 text-center space-y-2">
                <Sparkles size={24} className="mx-auto text-purple-400 animate-spin" />
                <p className="text-xs text-slate-400 font-mono">Analyzing discography & album cohesion with AI...</p>
              </div>
            ) : artistDossiers[selectedScoutArtist.artist] ? (
              <div className="space-y-4 text-xs">
                {/* Style & Origin */}
                <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono text-purple-400 font-bold uppercase">Signature Sound & Roots</span>
                  <p className="text-slate-200">{artistDossiers[selectedScoutArtist.artist].signatureStyle}</p>
                  <p className="text-slate-400 text-[11px]">Origin: {artistDossiers[selectedScoutArtist.artist].regionalOrigin}</p>
                </div>

                {/* Audiophile Verdict */}
                <div className="p-3.5 bg-gradient-to-r from-purple-950/30 to-slate-950 rounded-xl border border-purple-500/30 space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-black uppercase text-purple-300 text-[11px]">Verdict:</span>
                    <span className="px-2 py-0.5 rounded bg-purple-500 text-slate-950 font-black text-[10px] uppercase">
                      {artistDossiers[selectedScoutArtist.artist].discographyVerdict}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {artistDossiers[selectedScoutArtist.artist].verdictRationale}
                  </p>
                </div>

                {/* Landmark Albums */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-slate-400">Landmark Albums to Explore</span>
                  <div className="space-y-2">
                    {artistDossiers[selectedScoutArtist.artist].landmarkAlbums.map((al, idx) => (
                      <div key={idx} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-start">
                        <div className="pr-2">
                          <span className="font-bold text-slate-200">💿 {al.title}</span>
                          {al.year && <span className="text-slate-500 text-[10px] ml-1.5 font-mono">({al.year})</span>}
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{al.importance}</p>
                        </div>
                        <button
                          onClick={() => toggleValidateAlbum(selectedScoutArtist.artist, al.title)}
                          className="bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 px-2 py-1 rounded text-[10px] font-bold cursor-pointer shrink-0"
                        >
                          + Validate
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Next Tracks */}
                {artistDossiers[selectedScoutArtist.artist].recommendedNextTracks.length > 0 && (
                  <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800">
                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">Recommended Next Singles to Hunt</span>
                    <div className="flex flex-wrap gap-1.5">
                      {artistDossiers[selectedScoutArtist.artist].recommendedNextTracks.map(tr => (
                        <span key={tr} className="text-[10px] bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-slate-300">
                          {tr}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400">
                <button
                  onClick={() => handleScoutArtist(selectedScoutArtist)}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Analyze with AI
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AI CONFIGURATION MODAL                                                    */}
      {/* ========================================================================= */}
      {aiConfigModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                <Settings2 size={16} className="text-purple-400" />
                <span>AI Model Settings</span>
              </h3>
              <button
                onClick={() => setAiConfigModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">Provider</label>
                <select
                  value={aiConfigForm.provider}
                  onChange={e => setAiConfigForm({ ...aiConfigForm, provider: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none"
                >
                  <option value="gemini">Google Gemini (Cloud)</option>
                  <option value="openai-compatible">OpenAI-Compatible (Ollama / LM Studio Local)</option>
                </select>
              </div>

              {aiConfigForm.provider === 'gemini' ? (
                <div>
                  <label className="text-slate-400 font-semibold mb-1 block">Gemini API Key</label>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={aiConfigForm.apiKey}
                    onChange={e => setAiConfigForm({ ...aiConfigForm, apiKey: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Stored locally in your browser storage.</p>
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
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-semibold mb-1 block">API Key (Optional for Local)</label>
                    <input
                      type="password"
                      placeholder="Optional"
                      value={aiConfigForm.apiKey}
                      onChange={e => setAiConfigForm({ ...aiConfigForm, apiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none"
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
                  placeholder="gemini-2.5-flash"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2 focus:outline-none font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
              <button
                onClick={() => setAiConfigModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAIConfig}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PROPORTIONATE INTAKE QUOTA MODAL                                          */}
      {/* ========================================================================= */}
      {quotaModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                  <Scale size={18} className="text-cyan-400" />
                  <span>Proportionate Audio Diet Quota Stager</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Select the cultural buckets to include and the number of chronological songs to stage from each.
                </p>
              </div>
              <button
                onClick={() => setQuotaModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quota Per Bucket Input */}
            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-slate-200">Quota Per Bucket:</label>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-cyan-400 font-black text-sm">{quotaPerBucket} tracks</span>
                  <span className="text-slate-500 text-[10px]">each</span>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                value={quotaPerBucket}
                onChange={e => setQuotaPerBucket(parseInt(e.target.value, 10))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>1 track</span>
                <span>5 tracks</span>
                <span>10 tracks</span>
                <span>20 tracks</span>
              </div>
            </div>

            {/* Bucket Selection Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Select Cultural Buckets ({selectedQuotaBuckets.size} selected):</span>
                <div className="flex items-center space-x-2 text-[10px]">
                  <button
                    onClick={selectAllQuotaBuckets}
                    className="text-cyan-400 hover:underline font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    onClick={clearQuotaBuckets}
                    className="text-slate-400 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto space-y-1.5 p-2 bg-slate-950/40 rounded-xl border border-slate-800">
                {bucketGroups.map(g => {
                  const isChecked = selectedQuotaBuckets.has(g.bucket);
                  const unstagedCount = g.tracks.filter(t => !stagedTrackIds.has(t.id)).length;
                  const willTake = Math.min(unstagedCount, quotaPerBucket);

                  return (
                    <div
                      key={g.bucket}
                      onClick={() => toggleQuotaBucket(g.bucket)}
                      className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-cyan-950/40 border-cyan-500/40 text-slate-200'
                          : 'bg-slate-900/40 border-slate-800/60 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {isChecked ? (
                          <CheckSquare size={14} className="text-cyan-400 shrink-0" />
                        ) : (
                          <Square size={14} className="text-slate-600 shrink-0" />
                        )}
                        <span className="font-bold">{g.metadata?.displayName || g.bucket || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] font-mono">
                        <span className="text-slate-500">{unstagedCount} unstaged</span>
                        {isChecked && (
                          <span className="text-cyan-300 font-bold bg-cyan-950 border border-cyan-800/80 px-1.5 py-0.2 rounded">
                            +{willTake}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Projected Staged Summary */}
            <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl text-xs flex items-center justify-between">
              <span className="text-slate-300">Cohort Intake Total:</span>
              <span className="font-bold font-mono text-cyan-300">
                {Array.from(selectedQuotaBuckets).reduce((acc, b) => {
                  const g = bucketGroups.find(x => x.bucket === b);
                  const unstaged = g ? g.tracks.filter(t => !stagedTrackIds.has(t.id)).length : 0;
                  return acc + Math.min(unstaged, quotaPerBucket);
                }, 0)}{' '}
                tracks in strict chronological order
              </span>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-800 flex justify-end space-x-2">
              <button
                onClick={() => setQuotaModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStageBalancedCohort(quotaPerBucket, Array.from(selectedQuotaBuckets))}
                disabled={selectedQuotaBuckets.size === 0}
                className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-cyan-950/40"
              >
                Stage Balanced Intake Cohort 🛒
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
