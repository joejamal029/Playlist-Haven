import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Network,
  Sparkles,
  Search,
  SlidersHorizontal,
  Filter,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  Music,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ListMusic,
  FolderGit2,
  Share2,
  Compass,
  Layers,
  FileText,
  Check,
  Disc3,
  ExternalLink,
  ArrowLeft,
  Radio,
  Users,
  Zap,
  Link,
  ArrowRight,
  Activity,
  HelpCircle,
  Eye,
  GitMerge,
  Clock,
  Dna,
  PieChart,
  Play,
  Send,
  FileSpreadsheet,
  Layers2,
  CheckSquare,
  Square,
  Sliders,
  Award,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Crown,
  Bot,
  GraduationCap,
  Globe,
  Key,
  Cpu,
  Wand2,
  Plane,
  Target,
  Pause as PauseIcon,
  Volume2,
  Flame
} from 'lucide-react';
import FileUploader from '../components/FileUploader';
import AudioPreviewButton from '../components/AudioPreviewButton';
import ConstellationCanvas from '../components/ConstellationCanvas';
import WorldAtlasCanvas from '../components/WorldAtlasCanvas';
import ArtistGraphCanvas from '../components/ArtistGraphCanvas';
import { useAudioPreview } from '../components/AudioPreviewContext';
import { getAllEnrichedTracks } from '../services/metadataDb';
import {
  CorpusTrack,
  CorpusPlaylist,
  CorpusConfig,
  CorpusStats,
  JaccardPair,
  CommunityCluster,
  ArtistConstellationNode,
  ArtistBridgePath,
  BlindSpotArtist,
  GraphIntelligenceResult,
  PlaylistDNA,
  TasteZoneCoverage,
  IsolatedIslandPlaylist,
  CuratorialInsight,
  GapAnalysisReport,
  SmartMergeSuggestion,
  TemporalArchaeologyInsight,
  OfflineOrphanTrack,
  OrphanedFlagshipArtist,
  OfflineOrphanReport,
  ProfilingResult,
  DiscoveryRecipe,
  RecipeCategory,
  RecipeExecutionResult,
  DownstreamModuleTarget,
  RecipeParamDefinition,
  CuratorTrustTier,
  CuratorAffinityProfile,
  CuratorArchetypeCluster,
  CalibratedCuratorResult,
  CalibratedCuratorCandidateTrack,
  OfflineSongRecord,
  MusicoletLibraryPayload,
  DiscoveryAgentId,
  DiscoveryAgentPromptConfig,
  DiscoveryAgentExecutionResult,
  DiscoveryAgentTrackRecommendation,
  ConstellationLensMode,
  ConstellationCelestialNode,
  WorldAtlasHotspot,
  WanderOdysseyStep,
  AcousticMoodPoint
} from '../types';
import {
  BipartiteCorpusGraph,
  parseSpotifyExportCsv,
  buildCorpusGraph,
  ingestCorpusFiles,
  getTracksByConsensusThreshold,
  getTrackProvenance,
  createCorpusConfig,
  DEFAULT_EXCLUDED_TYPES
} from '../services/discoveryCorpusEngine';
import {
  computeSparsePlaylistJaccard,
  getSimilarPlaylists,
  buildArtistConstellation,
  detectLouvainCommunities,
  findArtistBridgePath,
  parseMusicoletSongsCsv,
  parseMusicoletLibrary,
  findBlindSpots,
  computeGraphIntelligence
} from '../services/discoveryGraphEngine';
import {
  computePlaylistDNA,
  computeAllPlaylistDNAs,
  runGapAnalysis,
  computeSmartMergeSuggestions,
  analyzeTemporalArchaeology,
  computeOfflineOrphans,
  runPlaylistProfiling
} from '../services/discoveryProfileEngine';
import {
  DISCOVERY_RECIPES,
  executeRecipe,
  stageTracksForModule,
  exportRecipeTracksCSV,
  exportRecipeTracksM3U,
  exportRecipeTracksTSV
} from '../services/discoveryRecipeEngine';
import {
  runCuratorCalibration,
  saveCustomTrustTiers,
  loadCustomTrustTiers,
  TRUST_MULTIPLIERS
} from '../services/discoveryCuratorEngine';
import {
  DISCOVERY_AGENTS,
  DiscoveryAgentMeta,
  executeDiscoveryAgent,
  runInteractiveCortexQuery
} from '../services/discoveryAgentEngine';
import {
  getAIConfig,
  setAIConfig
} from '../services/visionEngine';
import {
  hasPersistedCorpus,
  getCorpusStats,
  saveCorpusGraph,
  loadCorpusGraph,
  clearCorpusGraph,
  saveGraphIntelligence,
  loadGraphIntelligence,
  clearGraphIntelligence,
  savePlaylistProfiling,
  loadPlaylistProfiling,
  clearPlaylistProfiling
} from '../services/discoveryCorpusDb';
import { downloadPlaylistFile } from '../services/downloadHelper';

interface DiscoveryLayerViewProps {
  onBack: () => void;
  onViewSelect?: (view: any) => void;
}

type TabKey = 'overview' | 'consensus' | 'similarity' | 'constellation' | 'communities' | 'blindspots' | 'dna' | 'recipes' | 'curators' | 'agents';

export default function DiscoveryLayerView({ onBack, onViewSelect }: DiscoveryLayerViewProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Corpus State
  const [graph, setGraph] = useState<BipartiteCorpusGraph | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<{ stage: string; current: number; total: number; message: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Staged Upload Files
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // Consensus Explorer Controls
  const [consensusThreshold, setConsensusThreshold] = useState<number>(2);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<'consensus' | 'title' | 'artist' | 'album'>('consensus');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedTrackIds, setExpandedTrackIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Type Filter Overrides
  const [typeToggles, setTypeToggles] = useState<Record<string, boolean>>({});

  // Phase 2: Graph Intelligence State
  const [graphIntel, setGraphIntel] = useState<GraphIntelligenceResult | null>(null);
  const [isComputingGraph, setIsComputingGraph] = useState<boolean>(false);
  const [graphComputeProgress, setGraphComputeProgress] = useState<{ percent: number; stage: string } | null>(null);

  // Phase 2: Tab Controls
  const [simSelectedPlaylistId, setSimSelectedPlaylistId] = useState<string>('');
  const [simSearchQuery, setSimSearchQuery] = useState<string>('');

  const [artistDirectorySearch, setArtistDirectorySearch] = useState<string>('');
  const [bridgeSource, setBridgeSource] = useState<string>('');
  const [bridgeTarget, setBridgeTarget] = useState<string>('');
  const [computedBridge, setComputedBridge] = useState<ArtistBridgePath | null>(null);
  const [isComputingBridge, setIsComputingBridge] = useState<boolean>(false);

  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(null);

  const [offlineSongsFiles, setOfflineSongsFiles] = useState<File[]>([]);
  const [offlineArtistSet, setOfflineArtistSet] = useState<Set<string>>(new Set());
  const [offlineTrackKeySet, setOfflineTrackKeySet] = useState<Set<string>>(new Set());
  const [offlineSongs, setOfflineSongs] = useState<OfflineSongRecord[]>([]);
  const [blindSpotResults, setBlindSpotResults] = useState<BlindSpotArtist[]>([]);

  // Phase 3: Playlist Profiling & Temporal Archaeology State
  const [profilingResult, setProfilingResult] = useState<ProfilingResult | null>(null);
  const [isComputingProfiling, setIsComputingProfiling] = useState<boolean>(false);
  const [dnaSubTab, setDnaSubTab] = useState<'dna' | 'gaps' | 'merges' | 'orphans' | 'archaeology'>('dna');
  const [dnaSearchQuery, setDnaSearchQuery] = useState<string>('');
  const [dnaCommunityFilter, setDnaCommunityFilter] = useState<string>('all');
  const [dnaCulturalFilter, setDnaCulturalFilter] = useState<string>('all');
  const [dnaSortField, setDnaSortField] = useState<'tracks' | 'diversity' | 'consensus' | 'name'>('tracks');
  const [dnaSortDirection, setDnaSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedDnaPlaylistId, setSelectedDnaPlaylistId] = useState<string | null>(null);
  const [simulateTemporal, setSimulateTemporal] = useState<boolean>(false);
  const [minMergeJaccard, setMinMergeJaccard] = useState<number>(0.60);

  // Phase 4: Curatorial Recipes & Cross-Module Staging State
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(DISCOVERY_RECIPES[0]?.id || '');
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState<'ALL' | RecipeCategory>('ALL');
  const [recipeSearch, setRecipeSearch] = useState<string>('');
  const [recipeParams, setRecipeParams] = useState<Record<string, any>>({});
  const [isExecutingRecipe, setIsExecutingRecipe] = useState<boolean>(false);
  const [recipeExecutionResult, setRecipeExecutionResult] = useState<RecipeExecutionResult | null>(null);
  const [recipeAuditOpen, setRecipeAuditOpen] = useState<boolean>(false);
  const [selectedRecipeTrackIds, setSelectedRecipeTrackIds] = useState<Set<string>>(new Set());

  // Phase 5: Curator Intelligence & Calibrated Discovery State
  const [curatorResult, setCuratorResult] = useState<CalibratedCuratorResult | null>(null);
  const [isComputingCurators, setIsComputingCurators] = useState<boolean>(false);
  const [curatorCustomTiers, setCuratorCustomTiers] = useState<Record<string, CuratorTrustTier>>({});
  const [curatorSearchQuery, setCuratorSearchQuery] = useState<string>('');
  const [curatorFilterTier, setCuratorFilterTier] = useState<'all' | 'editorial' | 'standard' | 'low_signal' | 'high_yield' | 'my_newees'>('all');
  const [curatorSortField, setCuratorSortField] = useState<'yield' | 'name' | 'tracks' | 'unmined'>('yield');
  const [curatorSortDirection, setCuratorSortDirection] = useState<'asc' | 'desc'>('desc');
  const [curatorSubTab, setCuratorSubTab] = useState<'leaderboard' | 'archetypes' | 'unmined'>('leaderboard');
  const [selectedCuratorCandidateIds, setSelectedCuratorCandidateIds] = useState<Set<string>>(new Set());

  // Phase 6: Discovery Agent Personas & Synthesis Cortex State
  const [selectedAgentId, setSelectedAgentId] = useState<DiscoveryAgentId>('newees_architect');
  const [agentBatchCapacity, setAgentBatchCapacity] = useState<number>(30);
  const [agentBucketPreset, setAgentBucketPreset] = useState<'balanced_global' | 'asian_opm_focus' | 'afrobeats_street_hop' | 'atmospheric_worship' | 'broad_capacity_50'>('balanced_global');
  const [agentMoodPrompt, setAgentMoodPrompt] = useState<string>('');
  const [isExecutingAgent, setIsExecutingAgent] = useState<boolean>(false);
  const [agentExecutionResult, setAgentExecutionResult] = useState<DiscoveryAgentExecutionResult | null>(null);
  const [selectedAgentTrackIds, setSelectedAgentTrackIds] = useState<Set<string>>(new Set());
  const [cortexQuery, setCortexQuery] = useState<string>('');
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getAIConfig().apiKey || '');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai-compatible'>(() => getAIConfig().provider || 'gemini');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>(() => getAIConfig().baseUrl || 'http://localhost:11434/v1');
  const [aiModelName, setAiModelName] = useState<string>(() => getAIConfig().modelName || 'gemini-2.5-flash');

  // Phase 7: Visualization, Infinite Constellation, World Atlas & Wander Odyssey State
  const [constellationLens, setConstellationLens] = useState<ConstellationLensMode>('galaxy');
  const { playTrack, pauseTrack, isPlaying: isPreviewPlaying, activeAudio } = useAudioPreview();

  // Wander Odyssey State
  const [odysseySteps, setOdysseySteps] = useState<WanderOdysseyStep[]>([]);
  const [isGeneratingOdyssey, setIsGeneratingOdyssey] = useState<boolean>(false);
  const [odysseyCurrentIndex, setOdysseyCurrentIndex] = useState<number>(0);
  const [odysseyAutoAdvance, setOdysseyAutoAdvance] = useState<boolean>(false);
  const [odysseySeedPlaylist, setOdysseySeedPlaylist] = useState<string>('');
  const [odysseyLength, setOdysseyLength] = useState<number>(20);
  const odysseyTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Acoustic Mood Map State
  const [moodPoints, setMoodPoints] = useState<AcousticMoodPoint[]>([]);
  const [isLoadingMood, setIsLoadingMood] = useState<boolean>(false);
  const [moodQuadrantFilter, setMoodQuadrantFilter] = useState<'all' | 'exuberant' | 'intense' | 'serene' | 'melancholic'>('all');
  const [moodMinEnergy, setMoodMinEnergy] = useState<number>(0.0);
  const [selectedMoodPoint, setSelectedMoodPoint] = useState<AcousticMoodPoint | null>(null);


  // 1. Initial Load: Hydrate from IndexedDB if available
  useEffect(() => {
    let isMounted = true;
    async function hydrate() {
      try {
        setIsLoading(true);
        const exists = await hasPersistedCorpus();
        if (exists && isMounted) {
          setLoadingProgress({ stage: 'hydrating', current: 0, total: 100, message: 'Restoring corpus from IndexedDB...' });
          const loadedGraph = await loadCorpusGraph(prog => {
            if (isMounted) {
              setLoadingProgress({
                stage: prog.stage,
                current: prog.current,
                total: prog.total,
                message: `Loading ${prog.stage}... ${prog.current.toLocaleString()} / ${prog.total.toLocaleString()}`
              });
            }
          });
          if (loadedGraph && isMounted) {
            setGraph(loadedGraph);
            // Default threshold: min(2, maxConsensus)
            setConsensusThreshold(Math.min(2, loadedGraph.stats.maxConsensus || 1));
            // Initialize type toggles
            const toggles: Record<string, boolean> = {};
            loadedGraph.stats.uniqueTypes.forEach(t => {
              toggles[t.type] = t.enabled;
            });
            setTypeToggles(toggles);

            // Hydrate cached Graph Intelligence
            const cachedIntel = await loadGraphIntelligence();
            if (cachedIntel && isMounted) {
              setGraphIntel(cachedIntel);
            }

            // Hydrate cached Playlist Profiling
            const cachedProfiling = await loadPlaylistProfiling();
            if (cachedProfiling && isMounted) {
              setProfilingResult(cachedProfiling);
            }

            setStatusMessage({ text: `Corpus restored: ${loadedGraph.stats.uniqueTracks.toLocaleString()} tracks across ${loadedGraph.stats.totalPlaylists.toLocaleString()} playlists.`, type: 'success' });
          }
        }
      } catch (err: any) {
        console.error('[DiscoveryLayerView] Hydration failed:', err);
        if (isMounted) {
          setStatusMessage({ text: 'Failed to restore corpus from local storage.', type: 'error' });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setLoadingProgress(null);
        }
      }
    }
    hydrate();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Ingest uploaded files
  const handleFilesSelected = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setUploadedFiles(files);
    setIsProcessing(true);
    setStatusMessage({ text: `Reading ${files.length} file(s)...`, type: 'info' });

    try {
      const payloads: { fileName: string; content: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setLoadingProgress({ stage: 'reading_files', current: i + 1, total: files.length, message: `Reading file ${file.name}...` });
        const content = await file.text();
        payloads.push({ fileName: file.name, content });
      }

      setLoadingProgress({ stage: 'parsing', current: 0, total: 100, message: 'Constructing Bipartite Graph & Deduplicating...' });
      
      // Build graph with default exclusions
      const newGraph = ingestCorpusFiles(payloads, {
        excludedTypes: DEFAULT_EXCLUDED_TYPES,
        customTypeToggles: typeToggles,
      });

      setLoadingProgress({ stage: 'persisting', current: 0, total: 100, message: 'Persisting corpus to DiscoveryCorpusDB...' });
      
      await saveCorpusGraph(newGraph, prog => {
        setLoadingProgress({
          stage: prog.stage,
          current: prog.current,
          total: prog.total,
          message: `Saving ${prog.stage}... ${prog.current.toLocaleString()} / ${prog.total.toLocaleString()}`
        });
      });

      setGraph(newGraph);
      setConsensusThreshold(Math.min(2, newGraph.stats.maxConsensus || 1));
      
      const toggles: Record<string, boolean> = {};
      newGraph.stats.uniqueTypes.forEach(t => {
        toggles[t.type] = t.enabled;
      });
      setTypeToggles(toggles);

      setStatusMessage({
        text: `Successfully ingested ${newGraph.stats.totalTracksRaw.toLocaleString()} rows into ${newGraph.stats.uniqueTracks.toLocaleString()} unique tracks!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Ingestion failed:', err);
      setStatusMessage({ text: `Ingestion failed: ${err.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsProcessing(false);
      setLoadingProgress(null);
    }
  };

  // 3. Clear Corpus
  const handleClearCorpus = async () => {
    if (!window.confirm('Are you sure you want to clear the entire Discovery Corpus and graph intelligence from local storage?')) {
      return;
    }
    try {
      setIsProcessing(true);
      await clearCorpusGraph();
      await clearGraphIntelligence();
      await clearPlaylistProfiling();
      setGraph(null);
      setGraphIntel(null);
      setProfilingResult(null);
      setSelectedDnaPlaylistId(null);
      setUploadedFiles([]);
      setTypeToggles({});
      setExpandedTrackIds(new Set());
      setBlindSpotResults([]);
      setOfflineArtistSet(new Set());
      setComputedBridge(null);
      setStatusMessage({ text: 'Discovery Corpus, Graph Intelligence & Profiling cleared from local database.', type: 'info' });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Clear failed:', err);
      setStatusMessage({ text: 'Failed to clear database.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Phase 2: Compute Graph Intelligence
  const handleRunGraphAnalysis = async () => {
    if (!graph || isComputingGraph) return;
    try {
      setIsComputingGraph(true);
      setGraphComputeProgress({ percent: 5, stage: 'Starting graph intelligence engine...' });

      let computedResult: GraphIntelligenceResult | null = null;

      try {
        computedResult = await new Promise<GraphIntelligenceResult>((resolve, reject) => {
          const worker = new Worker(new URL('../workers/discoveryGraph.worker.ts', import.meta.url), {
            type: 'module'
          });

          worker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'PROGRESS') {
              setGraphComputeProgress({ percent: data.percent, stage: data.stage });
            } else if (data.type === 'COMPLETE') {
              worker.terminate();
              resolve(data.result);
            } else if (data.type === 'ERROR') {
              worker.terminate();
              reject(new Error(data.error));
            }
          };

          worker.onerror = (err) => {
            worker.terminate();
            reject(err);
          };

          // Post serializable graph entries
          worker.postMessage({
            type: 'COMPUTE_GRAPH_INTEL',
            graph: {
              playlists: Array.from(graph.playlists.entries()),
              tracks: Array.from(graph.tracks.entries()),
              artistToTrackIds: Array.from(graph.artistToTrackIds.entries()),
              stats: graph.stats,
              config: graph.config,
              rawRowsCount: graph.rawRowsCount
            }
          });
        });
      } catch (workerErr: any) {
        console.warn('[DiscoveryLayerView] Web Worker error, falling back to main-thread execution:', workerErr);
        computedResult = computeGraphIntelligence(graph, (percent, stage) => {
          setGraphComputeProgress({ percent, stage });
        });
      }

      if (computedResult) {
        setGraphIntel(computedResult);
        await saveGraphIntelligence(computedResult);
        setStatusMessage({
          text: `Graph Intelligence computed: ${computedResult.jaccardPairs.length.toLocaleString()} playlist similarity pairs, ${computedResult.clusters.length} Louvain communities, ${computedResult.artistNodes.length.toLocaleString()} artists.`,
          type: 'success'
        });
      }
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Graph analysis failed:', err);
      setStatusMessage({ text: 'Graph analysis failed: ' + (err?.message || 'Unknown error'), type: 'error' });
    } finally {
      setIsComputingGraph(false);
      setGraphComputeProgress(null);
    }
  };

  // Phase 2: Compute Aesthetic Bridge
  const handleFindBridge = () => {
    if (!graph || !bridgeSource.trim() || !bridgeTarget.trim()) return;
    setIsComputingBridge(true);
    try {
      const bridge = findArtistBridgePath(graph, bridgeSource.trim(), bridgeTarget.trim());
      if (bridge) {
        setComputedBridge(bridge);
        setStatusMessage({
          text: `Found ${bridge.hops}-hop aesthetic bridge connecting "${bridgeSource}" to "${bridgeTarget}"!`,
          type: 'success'
        });
      } else {
        setComputedBridge(null);
        setStatusMessage({
          text: `No connective path found between "${bridgeSource}" and "${bridgeTarget}" within 6 hops.`,
          type: 'info'
        });
      }
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Bridge search failed:', err);
      setStatusMessage({ text: 'Bridge search failed.', type: 'error' });
    } finally {
      setIsComputingBridge(false);
    }
  };

  // Phase 2 & 5: Offline Musicolet Songs.csv Handler
  const handleOfflineSongsSelected = async (files: File[]) => {
    if (!files || files.length === 0 || !graph) return;
    try {
      setOfflineSongsFiles(files);
      const text = await files[0].text();
      const lib = parseMusicoletLibrary(text);
      setOfflineArtistSet(lib.artists);
      setOfflineTrackKeySet(lib.trackKeys);
      setOfflineSongs(lib.songs);

      const blindSpots = findBlindSpots(graph, lib.artists, graphIntel?.artistNodes);
      setBlindSpotResults(blindSpots);
      setStatusMessage({
        text: `Loaded full offline library from ${files[0].name}: ${lib.songs.length.toLocaleString()} songs, ${lib.artists.size.toLocaleString()} unique artists. Identified ${blindSpots.length} high-affinity blind spots.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Musicolet parsing failed:', err);
      setStatusMessage({ text: 'Failed to parse Musicolet Songs.csv file.', type: 'error' });
    }
  };

  // 4. Reactive Type Toggle
  const handleToggleType = async (typeName: string) => {
    if (!graph) return;
    const currentEnabled = typeToggles[typeName] ?? false;
    const newToggles = { ...typeToggles, [typeName]: !currentEnabled };
    setTypeToggles(newToggles);

    // Re-filter graph without file re-read using the stored graph data
    try {
      setIsProcessing(true);
      setLoadingProgress({ stage: 'filtering', current: 0, total: 100, message: 'Re-filtering corpus graph...' });

      // Reconstruct graph with updated config
      const allRows: any[] = [];
      graph.playlists.forEach(pl => {
        // Collect raw rows representation from existing tracks
      });

      // Quick reload from IndexedDB or re-build
      const reloaded = await loadCorpusGraph();
      if (reloaded) {
        // Rebuild from reloaded raw count or update in memory
        reloaded.config.customTypeToggles = newToggles;
        setGraph(reloaded);
      }
      setStatusMessage({ text: `Type filter updated for "${typeName}".`, type: 'info' });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Re-filtering error:', err);
    } finally {
      setIsProcessing(false);
      setLoadingProgress(null);
    }
  };

  // 5. Consensus Filter & Search computation
  const filteredTracks = useMemo(() => {
    if (!graph) return [];
    
    // Threshold filter
    const tracksAtThreshold = getTracksByConsensusThreshold(graph, consensusThreshold);
    
    // Search query filter
    if (!searchQuery.trim()) {
      return tracksAtThreshold;
    }

    const q = searchQuery.toLowerCase().trim();
    return tracksAtThreshold.filter(t => {
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.playlistNames.some(p => p.toLowerCase().includes(q)) ||
        (t.isrc && t.isrc.toLowerCase().includes(q))
      );
    });
  }, [graph, consensusThreshold, searchQuery]);

  // 6. Sorting
  const sortedTracks = useMemo(() => {
    const list = [...filteredTracks];
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'consensus') {
        comparison = a.consensusCount - b.consensusCount;
      } else if (sortField === 'title') {
        comparison = (a.title || '').localeCompare(b.title || '');
      } else if (sortField === 'artist') {
        comparison = (a.artist || '').localeCompare(b.artist || '');
      } else if (sortField === 'album') {
        comparison = (a.album || '').localeCompare(b.album || '');
      }

      if (comparison === 0) {
        // Secondary sort on consensus desc
        comparison = b.consensusCount - a.consensusCount;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return list;
  }, [filteredTracks, sortField, sortDirection]);

  // 7. Pagination
  const paginatedTracks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTracks.slice(start, start + pageSize);
  }, [sortedTracks, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedTracks.length / pageSize) || 1;

  const toggleSort = (field: 'consensus' | 'title' | 'artist' | 'album') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'consensus' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const toggleTrackExpansion = (id: string) => {
    setExpandedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Phase 3: Filtered and Sorted DNA Playlists
  const filteredDnaPlaylists = useMemo(() => {
    if (!profilingResult) return [];
    let list = Object.values(profilingResult.playlistDnas) as PlaylistDNA[];

    if (dnaSearchQuery.trim()) {
      const q = dnaSearchQuery.toLowerCase().trim();
      list = list.filter(dna => dna.playlistName.toLowerCase().includes(q));
    }

    if (dnaCommunityFilter !== 'all') {
      const cId = Number(dnaCommunityFilter);
      list = list.filter(dna => dna.dominantCommunityId === cId);
    }

    if (dnaCulturalFilter !== 'all') {
      list = list.filter(dna => dna.dominantCulturalBucket === dnaCulturalFilter);
    }

    list.sort((a, b) => {
      let comparison = 0;
      if (dnaSortField === 'tracks') {
        comparison = a.trackCount - b.trackCount;
      } else if (dnaSortField === 'diversity') {
        comparison = a.normalizedDiversity - b.normalizedDiversity;
      } else if (dnaSortField === 'consensus') {
        comparison = a.meanConsensus - b.meanConsensus;
      } else if (dnaSortField === 'name') {
        comparison = a.playlistName.localeCompare(b.playlistName);
      }
      return dnaSortDirection === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [profilingResult, dnaSearchQuery, dnaCommunityFilter, dnaCulturalFilter, dnaSortField, dnaSortDirection]);

  // 8. Exports
  const handleExportCsv = async () => {
    if (!sortedTracks.length) return;
    try {
      const headers = ['Track name', 'Artist name', 'Album', 'Consensus Count', 'Source Playlists', 'ISRC', 'Spotify - id'];
      const rows = sortedTracks.map(t => {
        const escape = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
        return [
          escape(t.title),
          escape(t.artist),
          escape(t.album),
          t.consensusCount.toString(),
          escape(t.playlistNames.join('; ')),
          escape(t.isrc),
          escape(t.spotifyId)
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const filename = `PlaylistHaven_Consensus_Min${consensusThreshold}_${sortedTracks.length}tracks_${Date.now()}.csv`;
      await downloadPlaylistFile(csvContent, filename, 'text/csv;charset=utf-8');
      setStatusMessage({ text: `Exported ${sortedTracks.length} tracks to ${filename}`, type: 'success' });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Export CSV failed:', err);
      setStatusMessage({ text: 'Export failed.', type: 'error' });
    }
  };

  const handleExportM3u = async () => {
    if (!sortedTracks.length) return;
    try {
      const lines: string[] = ['#EXTM3U'];
      sortedTracks.forEach(t => {
        lines.push(`#EXTINF:-1,${t.artist} - ${t.title} [Consensus: ${t.consensusCount}]`);
        lines.push(`${t.artist} - ${t.title}.mp3`);
      });

      const m3uContent = '\uFEFF' + lines.join('\r\n');
      const filename = `PlaylistHaven_Consensus_Min${consensusThreshold}_${sortedTracks.length}tracks_${Date.now()}.m3u`;
      await downloadPlaylistFile(m3uContent, filename, 'audio/x-mpegurl;charset=utf-8');
      setStatusMessage({ text: `Exported ${sortedTracks.length} tracks to ${filename}`, type: 'success' });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Export M3U failed:', err);
      setStatusMessage({ text: 'Export failed.', type: 'error' });
    }
  };

  // Phase 3: Run Profiling Orchestrator
  const handleRunProfiling = async () => {
    if (!graph || isComputingProfiling) return;
    try {
      setIsComputingProfiling(true);
      setStatusMessage({ text: 'Computing Playlist DNA & Taste Gap Analysis...', type: 'info' });

      // Run pure profiling orchestrator
      const result = runPlaylistProfiling(
        graph,
        graphIntel,
        undefined,
        offlineArtistSet,
        simulateTemporal
      );

      await savePlaylistProfiling(result);
      setProfilingResult(result);
      setStatusMessage({
        text: `Profiling complete: DNA generated for ${Object.keys(result.playlistDnas).length} playlists with ${result.smartMergeSuggestions.length} smart merge opportunities.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Profiling failed:', err);
      setStatusMessage({ text: `Profiling failed: ${err.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsComputingProfiling(false);
    }
  };

  const handleExportMergedPlaylist = async (suggestion: SmartMergeSuggestion, format: 'csv' | 'm3u') => {
    if (!graph) return;
    try {
      const pA = graph.playlists.get(suggestion.playlistAId);
      const pB = graph.playlists.get(suggestion.playlistBId);
      if (!pA || !pB) return;

      const trackIdSet = new Set([...pA.trackIds, ...pB.trackIds]);
      const mergedTracks: CorpusTrack[] = [];
      for (const id of trackIdSet) {
        const t = graph.tracks.get(id);
        if (t) mergedTracks.push(t);
      }

      if (format === 'csv') {
        const headers = ['Track name', 'Artist name', 'Album', 'Consensus Count', 'Source Playlists', 'ISRC', 'Spotify - id'];
        const rows = mergedTracks.map(t => {
          const escape = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
          return [
            escape(t.title),
            escape(t.artist),
            escape(t.album),
            t.consensusCount.toString(),
            escape(t.playlistNames.join('; ')),
            escape(t.isrc),
            escape(t.spotifyId)
          ].join(',');
        });
        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
        const filename = `PlaylistHaven_Merged_${suggestion.suggestedMergedName.replace(/[^\w\s-]/g, '')}_${mergedTracks.length}tracks_${Date.now()}.csv`;
        await downloadPlaylistFile(csvContent, filename, 'text/csv;charset=utf-8');
        setStatusMessage({ text: `Exported ${mergedTracks.length} tracks to ${filename}`, type: 'success' });
      } else {
        const lines: string[] = ['#EXTM3U'];
        mergedTracks.forEach(t => {
          lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`);
          lines.push(`${t.artist} - ${t.title}.mp3`);
        });
        const m3uContent = '\uFEFF' + lines.join('\r\n');
        const filename = `PlaylistHaven_Merged_${suggestion.suggestedMergedName.replace(/[^\w\s-]/g, '')}_${mergedTracks.length}tracks_${Date.now()}.m3u`;
        await downloadPlaylistFile(m3uContent, filename, 'audio/x-mpegurl;charset=utf-8');
        setStatusMessage({ text: `Exported ${mergedTracks.length} tracks to ${filename}`, type: 'success' });
      }
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Export merged failed:', err);
      setStatusMessage({ text: 'Export merged playlist failed.', type: 'error' });
    }
  };

  const handleExportOrphans = async (format: 'csv' | 'm3u') => {
    if (!profilingResult?.offlineOrphans) return;
    const orphans = profilingResult.offlineOrphans.highConsensusOrphans;
    if (!orphans.length) return;

    try {
      if (format === 'csv') {
        const headers = ['Track name', 'Artist name', 'Album', 'Consensus Count', 'Source Playlists', 'ISRC', 'Spotify - id'];
        const rows = orphans.map(t => {
          const escape = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
          return [
            escape(t.title),
            escape(t.artist),
            escape(t.album),
            t.consensusCount.toString(),
            escape(t.sourcePlaylists.join('; ')),
            escape(t.isrc),
            escape(t.spotifyId)
          ].join(',');
        });
        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
        const filename = `PlaylistHaven_Offline_Orphans_${orphans.length}tracks_${Date.now()}.csv`;
        await downloadPlaylistFile(csvContent, filename, 'text/csv;charset=utf-8');
        setStatusMessage({ text: `Exported ${orphans.length} orphan tracks to ${filename}`, type: 'success' });
      } else {
        const lines: string[] = ['#EXTM3U'];
        orphans.forEach(t => {
          lines.push(`#EXTINF:-1,${t.artist} - ${t.title} [Consensus: ${t.consensusCount}]`);
          lines.push(`${t.artist} - ${t.title}.mp3`);
        });
        const m3uContent = '\uFEFF' + lines.join('\r\n');
        const filename = `PlaylistHaven_Offline_Orphans_${orphans.length}tracks_${Date.now()}.m3u`;
        await downloadPlaylistFile(m3uContent, filename, 'audio/x-mpegurl;charset=utf-8');
        setStatusMessage({ text: `Exported ${orphans.length} orphan tracks to ${filename}`, type: 'success' });
      }
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Export orphans failed:', err);
      setStatusMessage({ text: 'Export orphans failed.', type: 'error' });
    }
  };

  // Phase 4: Curatorial Recipe Handlers
  useEffect(() => {
    const recipe = DISCOVERY_RECIPES.find(r => r.id === selectedRecipeId);
    if (recipe) {
      const initialParams: Record<string, any> = {};
      for (const p of recipe.parameters) {
        initialParams[p.key] = p.defaultValue;
      }
      setRecipeParams(initialParams);
    }
  }, [selectedRecipeId]);

  const filteredRecipes = useMemo(() => {
    return DISCOVERY_RECIPES.filter(recipe => {
      if (recipeCategoryFilter !== 'ALL' && recipe.category !== recipeCategoryFilter) {
        return false;
      }
      if (recipeSearch.trim()) {
        const q = recipeSearch.toLowerCase();
        const matchesName = recipe.name.toLowerCase().includes(q);
        const matchesDesc = recipe.description.toLowerCase().includes(q);
        const matchesPrompt = recipe.promptExample.toLowerCase().includes(q);
        return matchesName || matchesDesc || matchesPrompt;
      }
      return true;
    });
  }, [recipeCategoryFilter, recipeSearch]);

  const activeRecipe = useMemo(() => {
    return DISCOVERY_RECIPES.find(r => r.id === selectedRecipeId) || DISCOVERY_RECIPES[0];
  }, [selectedRecipeId]);

  const handleRunRecipe = async (recipeToRun?: DiscoveryRecipe) => {
    const targetRecipe = recipeToRun || activeRecipe;
    if (!targetRecipe || !graph) return;

    setIsExecutingRecipe(true);
    try {
      const result = await executeRecipe(targetRecipe, recipeParams, {
        graph,
        offlineArtistSet,
        profilingResult,
        graphIntel
      });
      setRecipeExecutionResult(result);
      setSelectedRecipeTrackIds(new Set(result.tracks.map(t => t.id)));
      setStatusMessage({
        text: `⚡ Generated ${result.tracks.length} tracks using "${targetRecipe.name}" in ${result.durationMs}ms`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Recipe execution failed:', err);
      setStatusMessage({
        text: `Recipe execution failed: ${err.message || 'Unknown error'}`,
        type: 'error'
      });
    } finally {
      setIsExecutingRecipe(false);
    }
  };

  const handleStageForModule = (target: DownstreamModuleTarget) => {
    if (!recipeExecutionResult || !recipeExecutionResult.tracks.length) return;

    const tracksToStage = selectedRecipeTrackIds.size > 0
      ? recipeExecutionResult.tracks.filter(t => selectedRecipeTrackIds.has(t.id))
      : recipeExecutionResult.tracks;

    const stageRes = stageTracksForModule(tracksToStage, target, onViewSelect);
    if (stageRes.success) {
      setStatusMessage({ text: stageRes.message, type: 'success' });
    } else {
      setStatusMessage({ text: stageRes.message, type: 'error' });
    }
  };

  const handleExportRecipe = async (format: 'csv' | 'm3u' | 'tsv') => {
    if (!recipeExecutionResult || !recipeExecutionResult.tracks.length) return;
    const recipeName = activeRecipe?.name || 'Recipe_Tracks';
    const tracksToExport = selectedRecipeTrackIds.size > 0
      ? recipeExecutionResult.tracks.filter(t => selectedRecipeTrackIds.has(t.id))
      : recipeExecutionResult.tracks;

    if (format === 'csv') {
      await exportRecipeTracksCSV(tracksToExport, `${recipeName}.csv`, graph);
    } else if (format === 'm3u') {
      await exportRecipeTracksM3U(tracksToExport, `${recipeName}.m3u`);
    } else {
      await exportRecipeTracksTSV(tracksToExport, `${recipeName}.tsv`, graph);
    }
    setStatusMessage({
      text: `Exported ${tracksToExport.length} tracks as ${format.toUpperCase()}`,
      type: 'success'
    });
  };

  const toggleRecipeTrackSelection = (id: string) => {
    setSelectedRecipeTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllRecipeTracks = () => {
    if (!recipeExecutionResult) return;
    if (selectedRecipeTrackIds.size === recipeExecutionResult.tracks.length) {
      setSelectedRecipeTrackIds(new Set());
    } else {
      setSelectedRecipeTrackIds(new Set(recipeExecutionResult.tracks.map(t => t.id)));
    }
  };

  // Phase 5: Curator Intelligence Handlers & Memos
  const handleRunCuratorCalibration = () => {
    if (!graph) return;
    setIsComputingCurators(true);
    setStatusMessage({ text: 'Calibrating curator taste affinity and unmined candidates...', type: 'info' });

    setTimeout(() => {
      try {
        const t0 = performance.now();
        const result = runCuratorCalibration(
          graph,
          { artists: offlineArtistSet, trackKeys: offlineTrackKeySet },
          curatorCustomTiers
        );
        const elapsed = Math.round(performance.now() - t0);
        setCuratorResult(result);
        setStatusMessage({
          text: `Curator calibration complete in ${elapsed}ms: profiled ${result.curators.length.toLocaleString()} playlists, identified ${result.topAffinityCurators.length} high-yield curators, surfaced ${result.unminedHighSignalTracks.length} unmined gems.`,
          type: 'success'
        });
      } catch (err: any) {
        console.error('[DiscoveryLayerView] Curator calibration failed:', err);
        setStatusMessage({ text: 'Failed to run curator calibration.', type: 'error' });
      } finally {
        setIsComputingCurators(false);
      }
    }, 20);
  };

  const handleSetTrustTier = (playlistId: string, tier: CuratorTrustTier) => {
    const updated = { ...curatorCustomTiers, [playlistId]: tier };
    setCuratorCustomTiers(updated);
    saveCustomTrustTiers(updated);
    if (graph) {
      const refreshed = runCuratorCalibration(
        graph,
        { artists: offlineArtistSet, trackKeys: offlineTrackKeySet },
        updated
      );
      setCuratorResult(refreshed);
    }
  };

  const handleResetTrustTiers = () => {
    setCuratorCustomTiers({});
    saveCustomTrustTiers({});
    if (graph) {
      const refreshed = runCuratorCalibration(
        graph,
        { artists: offlineArtistSet, trackKeys: offlineTrackKeySet },
        {}
      );
      setCuratorResult(refreshed);
    }
  };

  const toggleCuratorCandidateSelection = (trackId: string) => {
    setSelectedCuratorCandidateIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const toggleSelectAllCuratorCandidates = () => {
    if (!curatorResult) return;
    if (selectedCuratorCandidateIds.size === curatorResult.unminedHighSignalTracks.length) {
      setSelectedCuratorCandidateIds(new Set());
    } else {
      setSelectedCuratorCandidateIds(new Set(curatorResult.unminedHighSignalTracks.map(t => t.id)));
    }
  };

  const handleStageCuratorCandidates = (target: DownstreamModuleTarget) => {
    if (!curatorResult || !curatorResult.unminedHighSignalTracks.length) return;
    const tracksToStage = selectedCuratorCandidateIds.size > 0
      ? curatorResult.unminedHighSignalTracks.filter(t => selectedCuratorCandidateIds.has(t.id))
      : curatorResult.unminedHighSignalTracks;

    const stageRes = stageTracksForModule(tracksToStage, target, onViewSelect);
    if (stageRes.success) {
      setStatusMessage({ text: stageRes.message, type: 'success' });
    } else {
      setStatusMessage({ text: stageRes.message, type: 'error' });
    }
  };

  const handleExportCuratorCandidates = async (format: 'csv' | 'm3u' | 'tsv') => {
    if (!curatorResult || !curatorResult.unminedHighSignalTracks.length) return;
    const tracksToExport = selectedCuratorCandidateIds.size > 0
      ? curatorResult.unminedHighSignalTracks.filter(t => selectedCuratorCandidateIds.has(t.id))
      : curatorResult.unminedHighSignalTracks;

    const recipeStubName = 'Curator_Unmined_Gems';
    if (format === 'csv') {
      await exportRecipeTracksCSV(tracksToExport, `${recipeStubName}.csv`, graph);
    } else if (format === 'm3u') {
      await exportRecipeTracksM3U(tracksToExport, `${recipeStubName}.m3u`);
    } else {
      await exportRecipeTracksTSV(tracksToExport, `${recipeStubName}.tsv`, graph);
    }
    setStatusMessage({
      text: `Exported ${tracksToExport.length} unmined gems as UTF-8 BOM ${format.toUpperCase()}`,
      type: 'success'
    });
  };

  // Phase 6: Discovery Agent & Cortex Handlers
  const handleSaveAIConfig = () => {
    setAIConfig({
      apiKey: apiKeyInput.trim(),
      provider: aiProvider,
      baseUrl: ollamaBaseUrl.trim(),
      modelName: aiModelName.trim()
    });
    setIsConfigDrawerOpen(false);
    setStatusMessage({ text: 'AI configuration updated successfully.', type: 'success' });
  };

  const handleRunAgent = async (agentIdToRun?: DiscoveryAgentId) => {
    if (!graph) {
      setStatusMessage({ text: 'Please load a corpus first.', type: 'error' });
      return;
    }
    const targetAgentId = agentIdToRun || selectedAgentId;
    setSelectedAgentId(targetAgentId);
    setIsExecutingAgent(true);
    setStatusMessage({ text: `Synthesizing with ${DISCOVERY_AGENTS.find(a => a.id === targetAgentId)?.name || 'AI Agent'}...`, type: 'info' });

    try {
      const config: DiscoveryAgentPromptConfig = {
        batchCapacity: agentBatchCapacity,
        bucketPreset: agentBucketPreset as any,
        moodPrompt: agentMoodPrompt.trim()
      };

      const result = await executeDiscoveryAgent(
        targetAgentId,
        graph,
        graphIntel,
        profilingResult,
        curatorResult,
        offlineSongs.length > 0 ? { artists: offlineArtistSet, trackKeys: offlineTrackKeySet, songs: offlineSongs } : null,
        config
      );

      setAgentExecutionResult(result);
      setSelectedAgentTrackIds(new Set(result.recommendedTracks.map(t => t.trackId)));
      setStatusMessage({
        text: `Successfully synthesized ${result.recommendedTracks.length} tracks with ${result.agentName} in ${result.executionTimeMs}ms!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Agent execution failed:', err);
      setStatusMessage({
        text: `AI Agent synthesis failed: ${err.message || 'Check your Gemini API key or Ollama connection.'}`,
        type: 'error'
      });
    } finally {
      setIsExecutingAgent(false);
    }
  };

  const handleRunCortexQuery = async (customQuery?: string) => {
    const queryToRun = (customQuery || cortexQuery).trim();
    if (!queryToRun) return;
    if (!graph) {
      setStatusMessage({ text: 'Please load a corpus first.', type: 'error' });
      return;
    }
    setCortexQuery(queryToRun);
    setIsExecutingAgent(true);
    setStatusMessage({ text: `Querying Discovery Cortex: "${queryToRun.length > 30 ? queryToRun.substring(0, 27) + '...' : queryToRun}"...`, type: 'info' });

    try {
      const result = await runInteractiveCortexQuery(
        queryToRun,
        graph,
        graphIntel,
        profilingResult,
        curatorResult,
        offlineSongs.length > 0 ? { artists: offlineArtistSet, trackKeys: offlineTrackKeySet, songs: offlineSongs } : null,
        { batchCapacity: agentBatchCapacity }
      );

      setAgentExecutionResult(result);
      setSelectedAgentTrackIds(new Set(result.recommendedTracks.map(t => t.trackId)));
      setStatusMessage({
        text: `Discovery Cortex synthesized ${result.recommendedTracks.length} tracks in ${result.executionTimeMs}ms!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Cortex query failed:', err);
      setStatusMessage({
        text: `Discovery Cortex query failed: ${err.message || 'Check your Gemini API key or Ollama connection.'}`,
        type: 'error'
      });
    } finally {
      setIsExecutingAgent(false);
    }
  };

  const toggleAgentTrackSelection = (trackId: string) => {
    setSelectedAgentTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const toggleSelectAllAgentTracks = () => {
    if (!agentExecutionResult) return;
    if (selectedAgentTrackIds.size === agentExecutionResult.recommendedTracks.length) {
      setSelectedAgentTrackIds(new Set());
    } else {
      setSelectedAgentTrackIds(new Set(agentExecutionResult.recommendedTracks.map(t => t.trackId)));
    }
  };

  const handleStageAgentTracks = (target: DownstreamModuleTarget) => {
    if (!agentExecutionResult || !agentExecutionResult.recommendedTracks.length) return;
    const tracksToStage = agentExecutionResult.recommendedTracks.filter(t =>
      selectedAgentTrackIds.size === 0 || selectedAgentTrackIds.has(t.trackId)
    );

    const corpusTracksToStage: CorpusTrack[] = tracksToStage.map(t => ({
      id: t.trackId,
      trackId: t.trackId,
      title: t.title,
      artist: t.artist,
      album: t.album || 'AI Discovery Selection',
      consensusCount: 1,
      playlistNames: t.provenanceCurators,
      playlistIds: [],
      firstSeenIndex: 0,
      isrcs: t.isrc ? [t.isrc] : [],
      spotifyIds: t.spotifyId ? [t.spotifyId] : [],
      types: ['Track'],
      isrc: t.isrc,
      spotifyId: t.spotifyId
    }));

    const stageRes = stageTracksForModule(corpusTracksToStage, target, onViewSelect);
    if (stageRes.success) {
      setStatusMessage({ text: stageRes.message, type: 'success' });
    } else {
      setStatusMessage({ text: stageRes.message, type: 'error' });
    }
  };

  const handleExportAgentTracks = async (format: 'csv' | 'm3u' | 'tsv') => {
    if (!agentExecutionResult || !agentExecutionResult.recommendedTracks.length) return;
    const tracksToExport = agentExecutionResult.recommendedTracks.filter(t =>
      selectedAgentTrackIds.size === 0 || selectedAgentTrackIds.has(t.trackId)
    );

    const corpusTracksToExport: CorpusTrack[] = tracksToExport.map(t => ({
      id: t.trackId,
      trackId: t.trackId,
      title: t.title,
      artist: t.artist,
      album: t.album || 'AI Discovery Selection',
      consensusCount: 1,
      playlistNames: t.provenanceCurators,
      playlistIds: [],
      firstSeenIndex: 0,
      isrcs: t.isrc ? [t.isrc] : [],
      spotifyIds: t.spotifyId ? [t.spotifyId] : [],
      types: ['Track'],
      isrc: t.isrc,
      spotifyId: t.spotifyId
    }));

    const agentStub = (agentExecutionResult.agentName || 'Discovery_Agent').replace(/\s+/g, '_');
    if (format === 'csv') {
      await exportRecipeTracksCSV(corpusTracksToExport, `${agentStub}_Tracks.csv`, graph);
    } else if (format === 'm3u') {
      await exportRecipeTracksM3U(corpusTracksToExport, `${agentStub}_Playlist.m3u`);
    } else {
      await exportRecipeTracksTSV(corpusTracksToExport, `${agentStub}_Tracks.tsv`, graph);
    }

    setStatusMessage({
      text: `Exported ${tracksToExport.length} tracks as UTF-8 BOM ${format.toUpperCase()}`,
      type: 'success'
    });
  };

  // Phase 7: Wander Odyssey Continuous Player Handlers
  const handleGenerateOdyssey = () => {
    if (!graph || graph.tracks.size === 0) return;
    setIsGeneratingOdyssey(true);

    try {
      // 1. Pick starting playlist
      let startPlaylist: CorpusPlaylist | undefined;
      if (odysseySeedPlaylist) {
        startPlaylist = graph.playlists.get(odysseySeedPlaylist);
      }
      if (!startPlaylist) {
        // Choose highest track-count playlist or first
        startPlaylist = (Array.from(graph.playlists.values()) as CorpusPlaylist[]).sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0))[0];
      }
      if (!startPlaylist || startPlaylist.trackIds.length === 0) return;

      const steps: WanderOdysseyStep[] = [];
      const visitedTrackIds = new Set<string>();
      let currentTrackId = startPlaylist.trackIds[0];
      let currentTrack = graph.tracks.get(currentTrackId);
      if (!currentTrack) return;

      visitedTrackIds.add(currentTrack.id);
      steps.push({
        stepIndex: 1,
        trackId: currentTrack.id,
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        spotifyId: currentTrack.spotifyId,
        isrc: currentTrack.isrc,
        playlistName: startPlaylist.name,
        culturalBucket: currentTrack.culturalBucket,
        transitionRationale: `Odyssey Genesis: Seeded from flagship playlist "${startPlaylist.name}"`
      });

      // Generate remaining steps across topological bridges
      for (let i = 2; i <= odysseyLength; i++) {
        const candidateTracks: Array<{ track: CorpusTrack; rationale: string; weight: number }> = [];

        // 1. Check sibling tracks in shared playlists
        currentTrack.playlistIds.forEach(plId => {
          const pl = graph.playlists.get(plId);
          if (pl) {
            pl.trackIds.slice(0, 15).forEach(tId => {
              if (!visitedTrackIds.has(tId)) {
                const cand = graph.tracks.get(tId);
                if (cand) {
                  candidateTracks.push({
                    track: cand,
                    rationale: `Connected via shared curation in "${pl.name}"`,
                    weight: 3.0
                  });
                }
              }
            });
          }
        });

        // 2. Check tracks by same artist in other playlists
        const sameArtistTracks = graph.artistToTrackIds.get(currentTrack.artist.toLowerCase()) || [];
        sameArtistTracks.forEach(tId => {
          if (!visitedTrackIds.has(tId)) {
            const cand = graph.tracks.get(tId);
            if (cand) {
              candidateTracks.push({
                track: cand,
                rationale: `Harmonic bridge via shared artist ${currentTrack!.artist}`,
                weight: 4.0
              });
            }
          }
        });

        // 3. Jaccard neighbor playlist tracks (Community bridge)
        if (graphIntel?.jaccardPairs) {
          const neighborPairs = graphIntel.jaccardPairs.filter(
            p => currentTrack!.playlistIds.includes(p.playlistAId) || currentTrack!.playlistIds.includes(p.playlistBId)
          );
          neighborPairs.slice(0, 3).forEach(pair => {
            const otherPlId = currentTrack!.playlistIds.includes(pair.playlistAId) ? pair.playlistBId : pair.playlistAId;
            const otherPl = graph.playlists.get(otherPlId);
            if (otherPl) {
              otherPl.trackIds.slice(0, 5).forEach(tId => {
                if (!visitedTrackIds.has(tId)) {
                  const cand = graph.tracks.get(tId);
                  if (cand) {
                    candidateTracks.push({
                      track: cand,
                      rationale: `Aesthetic community leap (Jaccard ${(pair.jaccardIndex * 100).toFixed(0)}%) into "${otherPl.name}"`,
                      weight: 2.0
                    });
                  }
                }
              });
            }
          });
        }

        // Pick next candidate or fallback to a random unvisited track
        let chosen: { track: CorpusTrack; rationale: string } | null = null;
        if (candidateTracks.length > 0) {
          const idx = Math.floor(Math.random() * candidateTracks.length);
          chosen = candidateTracks[idx];
        } else {
          for (const t of graph.tracks.values()) {
            if (!visitedTrackIds.has(t.id)) {
              chosen = {
                track: t,
                rationale: `Cosmic exploration leap into ${t.playlistNames[0] || 'library'}`
              };
              break;
            }
          }
        }

        if (chosen) {
          visitedTrackIds.add(chosen.track.id);
          currentTrack = chosen.track;
          steps.push({
            stepIndex: i,
            trackId: chosen.track.id,
            title: chosen.track.title,
            artist: chosen.track.artist,
            album: chosen.track.album,
            spotifyId: chosen.track.spotifyId,
            isrc: chosen.track.isrc,
            playlistName: chosen.track.playlistNames[0] || 'Unknown Playlist',
            culturalBucket: chosen.track.culturalBucket,
            transitionRationale: chosen.rationale
          });
        } else {
          break;
        }
      }

      setOdysseySteps(steps);
      setOdysseyCurrentIndex(0);
      setStatusMessage({
        text: `🧭 Generated ${steps.length}-step Wander Odyssey across your library's topological bridges!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Odyssey generation error:', err);
      setStatusMessage({ text: 'Failed to generate Wander Odyssey.', type: 'error' });
    } finally {
      setIsGeneratingOdyssey(false);
    }
  };

  // Wander Odyssey Auto-Advance Playback Loop
  useEffect(() => {
    if (!odysseyAutoAdvance || odysseySteps.length === 0) return;

    const currentStep = odysseySteps[odysseyCurrentIndex];
    if (currentStep) {
      playTrack({
        id: currentStep.trackId,
        title: currentStep.title,
        artist: currentStep.artist,
        album: currentStep.album
      }).catch(() => {});
    }

    // Auto-advance after 15 seconds
    odysseyTimerRef.current = setTimeout(() => {
      setOdysseyCurrentIndex(prev => {
        if (prev + 1 < odysseySteps.length) {
          return prev + 1;
        } else {
          setOdysseyAutoAdvance(false);
          return 0;
        }
      });
    }, 15000);

    return () => {
      if (odysseyTimerRef.current) clearTimeout(odysseyTimerRef.current);
    };
  }, [odysseyAutoAdvance, odysseyCurrentIndex, odysseySteps, playTrack]);

  const handleStageOdyssey = (target: DownstreamModuleTarget) => {
    if (!odysseySteps.length || !graph) return;
    const tracksToStage: CorpusTrack[] = odysseySteps
      .map(s => graph.tracks.get(s.trackId))
      .filter((t): t is CorpusTrack => Boolean(t));
    const res = stageTracksForModule(tracksToStage, target, onViewSelect);
    if (res.success) {
      setStatusMessage({ text: res.message, type: 'success' });
    } else {
      setStatusMessage({ text: res.message, type: 'error' });
    }
  };

  const handleExportOdyssey = async (format: 'csv' | 'm3u' | 'tsv') => {
    if (!odysseySteps.length || !graph) return;
    const tracksToExport: CorpusTrack[] = odysseySteps
      .map(s => graph.tracks.get(s.trackId))
      .filter((t): t is CorpusTrack => Boolean(t));
    if (format === 'csv') {
      await exportRecipeTracksCSV(tracksToExport, 'Wander_Odyssey.csv', graph);
    } else if (format === 'm3u') {
      await exportRecipeTracksM3U(tracksToExport, 'Wander_Odyssey.m3u');
    } else {
      await exportRecipeTracksTSV(tracksToExport, 'Wander_Odyssey.tsv', graph);
    }
    setStatusMessage({ text: `Exported Wander Odyssey as ${format.toUpperCase()}`, type: 'success' });
  };

  // Phase 7: Acoustic Mood Map Handlers
  const handleLoadMoodPoints = async () => {
    if (!graph) return;
    setIsLoadingMood(true);
    try {
      const enrichedRecords = await getAllEnrichedTracks();
      const enrichedMap = new Map<string, any>();
      enrichedRecords.forEach((r: any) => {
        const key = `${(r.artist?.name || r.queryArtist || '').toLowerCase()}:::${(r.title || r.queryTitle || '').toLowerCase()}`;
        if (r.acoustic) {
          enrichedMap.set(key, r.acoustic);
        }
      });

      const points: AcousticMoodPoint[] = [];
      const trackArr = Array.from(graph.tracks.values()) as CorpusTrack[];

      trackArr.slice(0, 1500).forEach((t, idx) => {
        const key = `${t.artist.toLowerCase()}:::${t.title.toLowerCase()}`;
        const ac = enrichedMap.get(key);

        let valence = 0.5;
        let energy = 0.5;
        let danceability = 0.5;
        let bpm = 120;
        let camelot = '8B';

        if (ac) {
          // Normalize valence from -1..1 or 0..1 to 0.0 .. 1.0
          valence = ac.valence < 0 ? (ac.valence + 1) / 2 : ac.valence;
          energy = ac.arousal !== undefined && ac.arousal < 0 ? (ac.arousal + 1) / 2 : (ac.energy || 0.5);
          danceability = ac.danceability || 0.5;
          bpm = ac.bpm || 120;
          camelot = ac.camelot || '8B';
        } else {
          // Deterministic perceptual hash fallback based on title, artist, consensus
          const hashVal = ((t.title.length * 17 + t.artist.length * 31 + t.consensusCount * 47) % 100) / 100;
          const hashEne = ((t.title.length * 23 + t.artist.length * 41 + idx * 7) % 100) / 100;
          valence = Math.max(0.08, Math.min(0.92, hashVal));
          energy = Math.max(0.1, Math.min(0.95, hashEne));
        }

        let quadrant: 'exuberant' | 'intense' | 'serene' | 'melancholic';
        if (valence >= 0.5 && energy >= 0.5) {
          quadrant = 'exuberant';
        } else if (valence < 0.5 && energy >= 0.5) {
          quadrant = 'intense';
        } else if (valence >= 0.5 && energy < 0.5) {
          quadrant = 'serene';
        } else {
          quadrant = 'melancholic';
        }

        points.push({
          trackId: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          playlistName: t.playlistNames[0],
          valence,
          arousal: energy,
          energy,
          danceability,
          bpm,
          camelot,
          quadrant,
          spotifyId: t.spotifyId,
          isrc: t.isrc
        });
      });

      setMoodPoints(points);
      setStatusMessage({
        text: `Loaded ${points.length.toLocaleString()} acoustic mood coordinates (${enrichedMap.size} Audimote profiles active).`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('[DiscoveryLayerView] Failed to load acoustic mood:', err);
    } finally {
      setIsLoadingMood(false);
    }
  };

  const filteredMoodPoints = useMemo(() => {
    return moodPoints.filter(p => {
      if (moodQuadrantFilter !== 'all' && p.quadrant !== moodQuadrantFilter) return false;
      if (p.energy < moodMinEnergy) return false;
      return true;
    });
  }, [moodPoints, moodQuadrantFilter, moodMinEnergy]);

  const handleStageMoodTracks = (target: DownstreamModuleTarget) => {
    if (!filteredMoodPoints.length || !graph) return;
    const tracksToStage: CorpusTrack[] = filteredMoodPoints
      .slice(0, 100)
      .map(p => graph.tracks.get(p.trackId))
      .filter((t): t is CorpusTrack => Boolean(t));
    const res = stageTracksForModule(tracksToStage, target, onViewSelect);
    if (res.success) {
      setStatusMessage({ text: res.message, type: 'success' });
    } else {
      setStatusMessage({ text: res.message, type: 'error' });
    }
  };

  const handleExportMoodM3U = async () => {
    if (!filteredMoodPoints.length) return;
    const lines = ['#EXTM3U', `#PLAYLIST:Acoustic Mood - ${moodQuadrantFilter.toUpperCase()}`];
    filteredMoodPoints.slice(0, 150).forEach(p => {
      lines.push(`#EXTINF:-1,${p.artist} - ${p.title} [Valence: ${(p.valence * 100).toFixed(0)}%, Energy: ${(p.energy * 100).toFixed(0)}%]`);
      lines.push(`${p.artist} - ${p.title}.mp3`);
    });
    const m3uContent = '\uFEFF' + lines.join('\r\n');
    await downloadPlaylistFile(m3uContent, `PlaylistHaven_Mood_${moodQuadrantFilter}_${filteredMoodPoints.length}tracks_${Date.now()}.m3u`, 'audio/x-mpegurl;charset=utf-8');
    setStatusMessage({ text: `Exported ${filteredMoodPoints.length} mood tracks to M3U`, type: 'success' });
  };


  // Filter & sorting for Curator Leaderboard
  const filteredCurators = useMemo(() => {
    if (!curatorResult) return [];
    let list = curatorResult.curators;

    if (curatorFilterTier === 'editorial') {
      list = list.filter(c => c.trustTier === 'editorial');
    } else if (curatorFilterTier === 'standard') {
      list = list.filter(c => c.trustTier === 'standard' && !c.isUserNeweesPlaylist);
    } else if (curatorFilterTier === 'low_signal') {
      list = list.filter(c => c.trustTier === 'low_signal');
    } else if (curatorFilterTier === 'high_yield') {
      list = list.filter(c => c.affinityYieldPercent >= 10 && !c.isUserNeweesPlaylist);
    } else if (curatorFilterTier === 'my_newees') {
      list = list.filter(c => c.isUserNeweesPlaylist);
    }

    if (curatorSearchQuery.trim()) {
      const q = curatorSearchQuery.toLowerCase().trim();
      list = list.filter(c =>
        c.playlistName.toLowerCase().includes(q) ||
        c.topSharedArtists.some(a => a.toLowerCase().includes(q))
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (curatorSortField === 'yield') {
        cmp = b.affinityYieldPercent - a.affinityYieldPercent || b.totalAlignedTracks - a.totalAlignedTracks;
      } else if (curatorSortField === 'name') {
        cmp = a.playlistName.localeCompare(b.playlistName);
      } else if (curatorSortField === 'tracks') {
        cmp = b.trackCount - a.trackCount;
      } else if (curatorSortField === 'unmined') {
        cmp = b.unminedCandidatesCount - a.unminedCandidatesCount;
      }
      return curatorSortDirection === 'asc' ? -cmp : cmp;
    });

    return list;
  }, [curatorResult, curatorFilterTier, curatorSearchQuery, curatorSortField, curatorSortDirection]);

  // Auto-calibrate when navigating to curators tab
  useEffect(() => {
    if (activeTab === 'curators' && !curatorResult && !isComputingCurators && graph) {
      handleRunCuratorCalibration();
    }
  }, [activeTab, graph]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-rose-500/20 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex items-center space-x-1.5 text-xs font-semibold"
              title="Return to Haven Dashboard"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <div className="w-9 h-9 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl flex items-center justify-center">
              <Network size={20} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">Discovery Intelligence Layer</h1>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                  Module 20
                </span>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono hidden md:inline">
                  Capstone Synthesis 🪐
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Topological corpus intelligence & multi-curator consensus engine over your all-time saved library.
              </p>
            </div>
          </div>

          {/* Active Corpus Status Pill & Actions */}
          <div className="flex items-center space-x-2">
            {graph ? (
              <div className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-medium text-slate-300">
                  <strong className="text-rose-300">{graph.stats.totalPlaylists.toLocaleString()}</strong> Playlists &middot;{' '}
                  <strong className="text-white">{graph.stats.uniqueTracks.toLocaleString()}</strong> Tracks
                </span>
                <button
                  onClick={handleClearCorpus}
                  className="ml-1 p-1 hover:text-rose-400 text-slate-400 transition-colors"
                  title="Clear Corpus from local database"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 bg-slate-800/50 border border-slate-700/40 px-3 py-1.5 rounded-xl text-xs text-slate-400">
                <span>No active corpus</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto flex items-center space-x-1 mt-3 overflow-x-auto scrollbar-none border-t border-slate-800/60 pt-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'overview'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers size={14} />
            <span>Corpus Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('consensus')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'consensus'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles size={14} />
            <span>Consensus Explorer</span>
            {graph && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'consensus' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
                k≥{consensusThreshold}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('similarity')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'similarity'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FolderGit2 size={14} />
            <span>Playlist Similarity</span>
            {graphIntel && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'similarity' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
                {graphIntel.jaccardPairs.length.toLocaleString()}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('constellation')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'constellation'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles size={14} />
            <span>Constellation & Atlas Suite</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'constellation' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
              5 Lenses
            </span>
          </button>

          <button
            onClick={() => setActiveTab('communities')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'communities'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users size={14} />
            <span>Communities</span>
            {graphIntel && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'communities' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
                {graphIntel.clusters.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('blindspots')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'blindspots'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Zap size={14} />
            <span>Offline Blind Spots</span>
            {blindSpotResults.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'blindspots' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
                {blindSpotResults.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('dna')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'dna'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Compass size={14} />
            <span>DNA & Archaeology</span>
            {profilingResult && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'dna' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
                {Object.keys(profilingResult.playlistDnas).length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'recipes'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Disc3 size={14} />
            <span>Recipes & Pipelines</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'recipes' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
              {DISCOVERY_RECIPES.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('curators')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'curators'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Award size={14} />
            <span>Curator Intelligence</span>
            {curatorResult && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'curators' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
                {curatorResult.curators.length.toLocaleString()}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'agents'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Phase 6: Autonomous Discovery AI Agents & Synthesis Cortex"
          >
            <Bot size={14} />
            <span>AI Agents & Cortex</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'agents' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-300'}`}>
              6
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">
        {/* Toast / Status banner */}
        {statusMessage && (
          <div
            className={`mb-5 p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : statusMessage.type === 'error'
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {statusMessage.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
              {statusMessage.type === 'error' && <AlertCircle size={16} className="text-rose-400 shrink-0" />}
              {statusMessage.type === 'info' && <RefreshCw size={16} className="text-indigo-400 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white ml-2 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Global Loading / Progress Overlay */}
        {(isLoading || isProcessing) && loadingProgress && (
          <div className="mb-6 p-4 rounded-2xl bg-slate-900 border border-rose-500/30 shadow-xl">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-rose-300 flex items-center space-x-2">
                <RefreshCw size={14} className="animate-spin text-rose-400" />
                <span>{loadingProgress.message}</span>
              </span>
              {loadingProgress.total > 0 && (
                <span className="text-slate-400 font-mono">
                  {Math.round((loadingProgress.current / loadingProgress.total) * 100)}%
                </span>
              )}
            </div>
            {loadingProgress.total > 0 && (
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-rose-500 h-2 transition-all duration-150 rounded-full"
                  style={{ width: `${Math.min(100, Math.round((loadingProgress.current / loadingProgress.total) * 100))}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 1: CORPUS OVERVIEW & INGESTION */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Ingestion Dropzone */}
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center space-x-2">
                    <FolderGit2 size={18} className="text-rose-400" />
                    <span>Corpus Ingestion & Reservoir Sync</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Import one or more Spotify/TuneMyMusic CSV exports (`Track name, Artist name, Album, Playlist name, Type, ISRC, Spotify - id`).
                  </p>
                </div>
                {graph && (
                  <button
                    onClick={() => setActiveTab('consensus')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-rose-950/40 flex items-center space-x-2 shrink-0 self-start sm:self-auto"
                  >
                    <Sparkles size={14} />
                    <span>Explore Consensus ({graph.stats.uniqueTracks.toLocaleString()} tracks) →</span>
                  </button>
                )}
              </div>

              <FileUploader
                label="Drop Spotify CSV Backups here"
                subLabel="Supports single files or multi-file archives (e.g. all-time-library-backup.CSV). Quoted commas and UTF-8 BOM are handled automatically."
                files={uploadedFiles}
                onFilesSelected={handleFilesSelected}
                onClear={() => setUploadedFiles([])}
                multiple={true}
                accept=".csv,.txt"
                colorClass="rose"
              />
            </div>

            {/* Diagnostics & Stats Cards (Visible once graph loaded) */}
            {graph && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Raw Ingested</div>
                    <div className="text-xl sm:text-2xl font-black text-white mt-1">
                      {graph.stats.totalTracksRaw.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Source entries</div>
                  </div>

                  <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Filtered</div>
                    <div className="text-xl sm:text-2xl font-black text-rose-300 mt-1">
                      {graph.stats.totalTracksFiltered.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">After type filter</div>
                  </div>

                  <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Unique Songs</div>
                    <div className="text-xl sm:text-2xl font-black text-emerald-300 mt-1">
                      {graph.stats.uniqueTracks.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-emerald-400/80 mt-0.5">
                      {Math.round(((graph.stats.totalTracksFiltered - graph.stats.uniqueTracks) / graph.stats.totalTracksFiltered) * 100)}% dedup collapsed
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Playlists</div>
                    <div className="text-xl sm:text-2xl font-black text-indigo-300 mt-1">
                      {graph.stats.totalPlaylists.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Distinct narratives</div>
                  </div>

                  <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Artists</div>
                    <div className="text-xl sm:text-2xl font-black text-amber-300 mt-1">
                      {graph.stats.uniqueArtists.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Constellation nodes</div>
                  </div>

                  <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Max Consensus</div>
                    <div className="text-xl sm:text-2xl font-black text-purple-300 mt-1">
                      {graph.stats.maxConsensus}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Playlists sharing 1 song</div>
                  </div>
                </div>

                {/* Configurable Type Filtering Card */}
                <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Filter size={16} className="text-rose-400" />
                      <h3 className="text-sm font-bold text-white">Discovered Row Types & Exclusion Filter</h3>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Toggle any row category to include/exclude it from the corpus graph.
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {graph.stats.uniqueTypes.map(t => {
                      const isEnabled = typeToggles[t.type] ?? t.enabled;
                      return (
                        <button
                          key={t.type}
                          onClick={() => handleToggleType(t.type)}
                          className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                            isEnabled
                              ? 'bg-slate-800 border-rose-500/50 text-white'
                              : 'bg-slate-900/50 border-slate-800 text-slate-500 opacity-60'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold capitalize">{t.type}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{t.count.toLocaleString()} rows</div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                              isEnabled ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-500 border border-slate-700'
                            }`}
                          >
                            {isEnabled ? '✓' : '✕'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Consensus Frequency Distribution Histogram */}
                <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2 mb-3">
                    <Sparkles size={16} className="text-amber-400" />
                    <span>Consensus Frequency Tiers (Number of Playlists Sharing a Song)</span>
                  </h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {[1, 2, 3, 4, 5, 8, 12].map(k => {
                      const count = Object.entries(graph.stats.consensusHistogram).reduce((acc: number, [binK, binCount]) => {
                        const numericK = Number(binK);
                        return numericK >= k ? acc + Number(binCount) : acc;
                      }, 0);

                      return (
                        <button
                          key={k}
                          onClick={() => {
                            setConsensusThreshold(k);
                            setActiveTab('consensus');
                          }}
                          className="p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-rose-500/50 rounded-xl text-left transition-all group"
                        >
                          <div className="text-[10px] text-slate-400 font-semibold group-hover:text-rose-300">
                            Consensus ≥ {k}
                          </div>
                          <div className="text-lg font-black text-white mt-1 group-hover:text-rose-200">
                            {count.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {Math.round((count / graph.stats.uniqueTracks) * 100)}% of library
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: CONSENSUS EXPLORER & GRAPH INVERSION */}
        {activeTab === 'consensus' && (
          <div className="space-y-4">
            {!graph ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                <Network size={48} className="mx-auto text-slate-600 mb-3" />
                <h3 className="text-base font-bold text-white">No Discovery Corpus Loaded</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
                  Please import your Spotify or TuneMyMusic CSV backup in the Corpus Overview tab to activate consensus matrix analytics.
                </p>
                <button
                  onClick={() => setActiveTab('overview')}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Go to Overview & Ingestion →
                </button>
              </div>
            ) : (
              <>
                {/* Control Bar */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Threshold Slider & Quick Presets */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                        <SlidersHorizontal size={14} className="text-rose-400" />
                        <span>Consensus Threshold:</span>
                        <span className="text-rose-300 font-mono text-sm font-black">
                          ≥ {consensusThreshold} {consensusThreshold === 1 ? 'playlist' : 'playlists'}
                        </span>
                      </label>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Showing <strong className="text-white">{filteredTracks.length.toLocaleString()}</strong> matching tracks
                      </span>
                    </div>

                    <div className="flex items-center space-x-3">
                      <input
                        type="range"
                        min={1}
                        max={Math.max(1, graph.stats.maxConsensus)}
                        value={consensusThreshold}
                        onChange={e => {
                          setConsensusThreshold(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    {/* Presets */}
                    <div className="flex items-center space-x-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Presets:</span>
                      {[
                        { label: 'All (≥1)', k: 1 },
                        { label: 'Curator (≥2)', k: 2 },
                        { label: 'Strong (≥3)', k: 3 },
                        { label: 'High (≥5)', k: 5 },
                        { label: 'Flagship (≥10)', k: 10 }
                      ].map(preset => (
                        <button
                          key={preset.k}
                          onClick={() => {
                            setConsensusThreshold(preset.k);
                            setCurrentPage(1);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition-all ${
                            consensusThreshold === preset.k
                              ? 'bg-rose-500 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right: Search & Export Actions */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search title, artist, playlist..."
                        value={searchQuery}
                        onChange={e => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="pl-8 pr-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 w-full sm:w-56"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleExportCsv}
                        disabled={sortedTracks.length === 0}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        title="Export filtered tracks to UTF-8 BOM CSV"
                      >
                        <Download size={13} />
                        <span>CSV</span>
                      </button>

                      <button
                        onClick={handleExportM3u}
                        disabled={sortedTracks.length === 0}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        title="Export filtered tracks to M3U Playlist"
                      >
                        <ListMusic size={13} />
                        <span>M3U</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table View */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-3 w-12 text-center">#</th>
                          <th
                            className="py-3 px-3 w-28 cursor-pointer hover:text-white transition-colors"
                            onClick={() => toggleSort('consensus')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Consensus</span>
                              <ArrowUpDown size={11} className={sortField === 'consensus' ? 'text-rose-400' : ''} />
                            </div>
                          </th>
                          <th className="py-3 px-2 w-16 text-center">Audio</th>
                          <th
                            className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
                            onClick={() => toggleSort('title')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Track Title</span>
                              <ArrowUpDown size={11} className={sortField === 'title' ? 'text-rose-400' : ''} />
                            </div>
                          </th>
                          <th
                            className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
                            onClick={() => toggleSort('artist')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Artist</span>
                              <ArrowUpDown size={11} className={sortField === 'artist' ? 'text-rose-400' : ''} />
                            </div>
                          </th>
                          <th
                            className="py-3 px-4 hidden md:table-cell cursor-pointer hover:text-white transition-colors"
                            onClick={() => toggleSort('album')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Album</span>
                              <ArrowUpDown size={11} className={sortField === 'album' ? 'text-rose-400' : ''} />
                            </div>
                          </th>
                          <th className="py-3 px-4 text-right">Provenance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs">
                        {paginatedTracks.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-slate-500">
                              No tracks match the selected consensus threshold or search query.
                            </td>
                          </tr>
                        ) : (
                          paginatedTracks.map((track, idx) => {
                            const globalRank = (currentPage - 1) * pageSize + idx + 1;
                            const isExpanded = expandedTrackIds.has(track.id);

                            return (
                              <React.Fragment key={track.id}>
                                <tr
                                  onClick={() => toggleTrackExpansion(track.id)}
                                  className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                                    isExpanded ? 'bg-slate-800/60' : ''
                                  }`}
                                >
                                  {/* Rank */}
                                  <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                                    {globalRank}
                                  </td>

                                  {/* Consensus Badge */}
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full font-black text-xs font-mono ${
                                        track.consensusCount >= 10
                                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                          : track.consensusCount >= 5
                                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                          : track.consensusCount >= 2
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                                      }`}
                                    >
                                      <span>★</span>
                                      <span>{track.consensusCount}</span>
                                    </span>
                                  </td>

                                  {/* Audio Preview Button */}
                                  <td className="py-2.5 px-2 text-center" onClick={e => e.stopPropagation()}>
                                    <AudioPreviewButton
                                      track={{
                                        id: track.id,
                                        title: track.title,
                                        artist: track.artist,
                                      }}
                                      size="sm"
                                    />
                                  </td>

                                  {/* Track Title */}
                                  <td className="py-2.5 px-4 font-semibold text-white">
                                    <div className="flex items-center space-x-2">
                                      <span className="truncate max-w-xs">{track.title}</span>
                                      {track.possibleDuplicate && (
                                        <span
                                          className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono"
                                          title="Multiple Spotify IDs share this ISRC (e.g. standard vs deluxe edition)"
                                        >
                                          variant
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Artist */}
                                  <td className="py-2.5 px-4 text-slate-300">
                                    <span className="truncate max-w-xs block">{track.artist}</span>
                                  </td>

                                  {/* Album */}
                                  <td className="py-2.5 px-4 text-slate-400 hidden md:table-cell">
                                    <span className="truncate max-w-xs block">{track.album || '—'}</span>
                                  </td>

                                  {/* Provenance Button */}
                                  <td className="py-2.5 px-4 text-right">
                                    <button
                                      type="button"
                                      className="inline-flex items-center space-x-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors"
                                    >
                                      <span>{track.playlistNames.length} {track.playlistNames.length === 1 ? 'list' : 'lists'}</span>
                                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded Provenance Drawer (Graph Inversion) */}
                                {isExpanded && (
                                  <tr className="bg-slate-950/80 border-y border-slate-800/80">
                                    <td colSpan={7} className="p-4 pl-12">
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                          <span className="flex items-center space-x-1.5 text-rose-300">
                                            <FolderGit2 size={13} />
                                            <span>Graph Inversion: Playlists Containing This Song ({track.playlistNames.length})</span>
                                          </span>
                                          {track.isrc && (
                                            <span className="font-mono text-slate-500">ISRC: {track.isrc}</span>
                                          )}
                                        </div>

                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                          {track.playlistNames.map((pName, pIdx) => (
                                            <span
                                              key={pIdx}
                                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs"
                                            >
                                              <ListMusic size={11} className="text-rose-400" />
                                              <span>{pName}</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="p-3 bg-slate-950/70 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                    <div className="flex items-center space-x-2">
                      <span>Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={e => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                      </select>
                      <span>
                        Showing {Math.min((currentPage - 1) * pageSize + 1, sortedTracks.length)} -{' '}
                        {Math.min(currentPage * pageSize, sortedTracks.length)} of {sortedTracks.length.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded disabled:opacity-40 transition-colors"
                      >
                        Previous
                      </button>
                      <span className="font-mono text-slate-300">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded disabled:opacity-40 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* GRAPH INTEL UNCOMPUTED CALLOUT BANNER (For Phase 2 Tabs) */}
        {(activeTab === 'similarity' || activeTab === 'constellation' || activeTab === 'communities' || activeTab === 'blindspots') && !graphIntel && graph && (
          <div className="p-8 bg-slate-900/90 border border-rose-500/40 rounded-2xl text-center space-y-4 shadow-2xl shadow-rose-950/20">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
              <Network size={28} />
            </div>
            <div className="max-w-md mx-auto">
              <h2 className="text-lg font-bold text-white mb-1">Graph Intelligence Computation Required</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Compute the sparse Jaccard similarity matrix across {graph.stats.totalPlaylists.toLocaleString()} playlists, extract deterministic Louvain community clusters, and map artist co-occurrence bridges.
              </p>
            </div>
            <div>
              <button
                onClick={handleRunGraphAnalysis}
                disabled={isComputingGraph}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-950/40 transition-all flex items-center space-x-2 mx-auto disabled:opacity-50 cursor-pointer"
              >
                {isComputingGraph ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Analyzing Graph... ({graphComputeProgress?.stage || 'Processing'})</span>
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    <span>Run Graph Analysis (Background Worker)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: PLAYLIST SIMILARITY MATRIX */}
        {activeTab === 'similarity' && graphIntel && graph && (
          <div className="space-y-6">
            {/* Header & Similar-to Selector */}
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center space-x-2">
                    <FolderGit2 size={18} className="text-rose-400" />
                    <span>Sparse Jaccard Playlist Similarity Matrix</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluated {graphIntel.jaccardPairs.length.toLocaleString()} overlapping playlist pairs out of {graph.stats.totalPlaylists.toLocaleString()} total playlists (zero-overlap skipped).
                  </p>
                </div>
                <button
                  onClick={handleRunGraphAnalysis}
                  disabled={isComputingGraph}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center space-x-1.5 shrink-0 self-start sm:self-auto"
                >
                  <RefreshCw size={13} className={isComputingGraph ? 'animate-spin text-rose-400' : ''} />
                  <span>Recompute Graph</span>
                </button>
              </div>

              {/* Target Playlist Selector */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center gap-3">
                <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5 shrink-0">
                  <Search size={14} className="text-rose-400" />
                  <span>Find Playlists Similar To:</span>
                </label>
                <select
                  value={simSelectedPlaylistId}
                  onChange={e => setSimSelectedPlaylistId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 w-full md:w-80"
                >
                  <option value="">-- Choose a playlist to inspect --</option>
                  {(Array.from(graph.playlists.values()) as CorpusPlaylist[]).map(pl => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} ({pl.trackCount} tracks)
                    </option>
                  ))}
                </select>
              </div>

              {/* Top Matches for Selected Playlist */}
              {simSelectedPlaylistId && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                    Top Similar Playlists to &ldquo;{graph.playlists.get(simSelectedPlaylistId)?.name}&rdquo;
                  </div>
                  {(() => {
                    const matches = getSimilarPlaylists(simSelectedPlaylistId, graphIntel.jaccardPairs, 6);
                    if (matches.length === 0) {
                      return <p className="text-xs text-slate-500">No overlapping playlists found above threshold.</p>;
                    }
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {matches.map(m => (
                          <div
                            key={m.playlistId}
                            className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-semibold text-xs text-white truncate" title={m.playlistName}>
                                  {m.playlistName}
                                </span>
                                <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                                  {(m.jaccardIndex * 100).toFixed(1)}%
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400">
                                <strong className="text-slate-200">{m.sharedTracks}</strong> shared tracks with target
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setSearchQuery(m.playlistName);
                                setActiveTab('consensus');
                              }}
                              className="mt-2 text-[11px] text-rose-400 hover:text-rose-300 font-medium flex items-center space-x-1"
                            >
                              <span>Inspect in Consensus</span>
                              <span>→</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Global Pairs Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs font-bold text-white flex items-center space-x-2">
                  <FolderGit2 size={14} className="text-rose-400" />
                  <span>Global Overlapping Pairs ({graphIntel.jaccardPairs.length.toLocaleString()})</span>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search playlist name in pairs..."
                    value={simSearchQuery}
                    onChange={e => setSimSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 w-full sm:w-64"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[11px] uppercase tracking-wider font-mono">
                      <th className="py-2.5 px-4">Rank</th>
                      <th className="py-2.5 px-4">Playlist A</th>
                      <th className="py-2.5 px-4">Playlist B</th>
                      <th className="py-2.5 px-4 text-center">Shared Tracks</th>
                      <th className="py-2.5 px-4 text-right">Jaccard Similarity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {graphIntel.jaccardPairs
                      .filter(p => {
                        if (!simSearchQuery.trim()) return true;
                        const q = simSearchQuery.toLowerCase();
                        return p.playlistAName.toLowerCase().includes(q) || p.playlistBName.toLowerCase().includes(q);
                      })
                      .slice(0, 100)
                      .map((pair, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">#{idx + 1}</td>
                          <td className="py-2.5 px-4 text-white font-medium">
                            <span className="truncate max-w-xs block" title={pair.playlistAName}>
                              {pair.playlistAName}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-300">
                            <span className="truncate max-w-xs block" title={pair.playlistBName}>
                              {pair.playlistBName}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold text-rose-300">
                            {pair.sharedTracks}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                                pair.jaccardIndex >= 0.7
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                  : pair.jaccardIndex >= 0.3
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {(pair.jaccardIndex * 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: VISUALIZATION, INFINITE CONSTELLATION & WANDER ODYSSEY SUITE */}
        {activeTab === 'constellation' && graphIntel && graph && (
          <div className="space-y-6">
            {/* Top Sub-Lens Navigation Switcher */}
            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">
                  Visualization Lenses:
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setConstellationLens('galaxy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    constellationLens === 'galaxy'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Sparkles size={13} />
                  <span>🌌 Infinite Galaxy & Solar System</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConstellationLens('world_map')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    constellationLens === 'world_map'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Globe size={13} />
                  <span>🗺️ World Cultural Atlas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConstellationLens('artists')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    constellationLens === 'artists'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Network size={13} />
                  <span>🕸️ Artist Network & Bridges</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConstellationLens('wander')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    constellationLens === 'wander'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Compass size={13} />
                  <span>🧭 Wander Odyssey Flow</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setConstellationLens('mood');
                    if (moodPoints.length === 0) handleLoadMoodPoints();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    constellationLens === 'mood'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Activity size={13} />
                  <span>🎭 Acoustic Mood Map</span>
                </button>
              </div>
            </div>

            {/* LENS 1: THE INFINITE GALAXY & SOLAR SYSTEM */}
            {constellationLens === 'galaxy' && (
              <ConstellationCanvas
                graph={graph}
                communities={graphIntel?.clusters || []}
                jaccardPairs={graphIntel?.jaccardPairs || []}
                onStageTracks={tracks => stageTracksForModule(tracks, 'triage', onViewSelect)}
              />
            )}

            {/* LENS 2: GLOBAL CULTURAL MUSIC ATLAS (WORLD MAP) */}
            {constellationLens === 'world_map' && (
              <WorldAtlasCanvas
                graph={graph}
                offlineArtistSet={offlineArtistSet}
                onStageToTriage={tracks => stageTracksForModule(tracks, 'triage', onViewSelect)}
                onStageToManipulator={tracks => stageTracksForModule(tracks, 'manipulator', onViewSelect)}
              />
            )}

            {/* LENS 3: FORCE-DIRECTED ARTIST NETWORK & BFS BRIDGES */}
            {constellationLens === 'artists' && (
              <div className="space-y-6">
                <ArtistGraphCanvas
                  artistNodes={graphIntel?.artistNodes || []}
                  onFindBridge={(src, tgt) => findArtistBridgePath(graph, src, tgt)}
                  bridgePath={computedBridge}
                />

                {/* Aesthetic Shortest-Path Bridge Search */}
                <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center space-x-2">
                      <Network size={18} className="text-rose-400" />
                      <span>Shortest-Path Aesthetic Bridge Engine (BFS)</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Algorithmically discover the intermediate artists and shared playlists connecting any two musicians in your library.
                    </p>
                  </div>

                  {/* Source & Target Inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Source Artist:</label>
                      <input
                        type="text"
                        list="artist-options"
                        placeholder="e.g. YOASOBI"
                        value={bridgeSource}
                        onChange={e => setBridgeSource(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Target Artist:</label>
                      <input
                        type="text"
                        list="artist-options"
                        placeholder="e.g. Vaundy"
                        value={bridgeTarget}
                        onChange={e => setBridgeTarget(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <datalist id="artist-options">
                      {graphIntel.artistNodes.slice(0, 50).map((a, i) => (
                        <option key={i} value={a.artist} />
                      ))}
                    </datalist>
                  </div>

                  {/* Action and Presets */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-500 uppercase">Quick Presets:</span>
                      {[
                        { s: 'YOASOBI', t: 'Vaundy' },
                        { s: 'Kenshi Yonezu', t: 'Fujii Kaze' },
                        { s: 'Taylor Swift', t: 'Billie Eilish' }
                      ].map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setBridgeSource(p.s);
                            setBridgeTarget(p.t);
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium transition-colors"
                        >
                          {p.s} → {p.t}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleFindBridge}
                      disabled={isComputingBridge || !bridgeSource.trim() || !bridgeTarget.trim()}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Link size={13} />
                      <span>Find Aesthetic Bridge</span>
                    </button>
                  </div>

                  {/* Computed Bridge Display */}
                  {computedBridge && (
                    <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-rose-500/30 space-y-4 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                          Connected in {computedBridge.hops} {computedBridge.hops === 1 ? 'hop' : 'hops'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {computedBridge.path.join('  ⟶  ')}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {computedBridge.bridgeHops.map((hop, hIdx) => (
                          <div key={hIdx} className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-white">
                              <span className="flex items-center space-x-2">
                                <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center text-[10px] font-mono">
                                  {hIdx + 1}
                                </span>
                                <span>{hop.fromArtist}</span>
                                <ArrowRight size={13} className="text-rose-400" />
                                <span>{hop.toArtist}</span>
                              </span>
                            </div>

                            {hop.sharedPlaylists.length > 0 && (
                              <div className="flex flex-wrap gap-1 text-[11px]">
                                <span className="text-slate-500 text-[10px] uppercase font-semibold mr-1">Shared In:</span>
                                {hop.sharedPlaylists.map((pl, pIdx) => (
                                  <span key={pIdx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                    {pl}
                                  </span>
                                ))}
                              </div>
                            )}

                            {hop.representativeTrackTitles.length > 0 && (
                              <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                                <span className="text-slate-500">Representative tracks:</span>
                                <span className="text-slate-200 font-medium">
                                  {hop.representativeTrackTitles.join(' | ')}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Artist Directory & Co-Occurrence Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs font-bold text-white flex items-center space-x-2">
                      <Users size={14} className="text-rose-400" />
                      <span>Artist Network Directory ({graphIntel.artistNodes.length.toLocaleString()})</span>
                    </div>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search artist..."
                        value={artistDirectorySearch}
                        onChange={e => setArtistDirectorySearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 w-full sm:w-64"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[11px] uppercase tracking-wider font-mono">
                          <th className="py-2.5 px-4">Rank</th>
                          <th className="py-2.5 px-4">Artist</th>
                          <th className="py-2.5 px-4 text-center">Tracks</th>
                          <th className="py-2.5 px-4 text-center">Playlists</th>
                          <th className="py-2.5 px-4 text-center">Connected Peers</th>
                          <th className="py-2.5 px-4 text-right">Top Connected Artists</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs">
                        {graphIntel.artistNodes
                          .filter(a => {
                            if (!artistDirectorySearch.trim()) return true;
                            return a.artist.toLowerCase().includes(artistDirectorySearch.toLowerCase());
                          })
                          .slice(0, 100)
                          .map((node, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">#{idx + 1}</td>
                              <td className="py-2.5 px-4 font-bold text-white">{node.artist}</td>
                              <td className="py-2.5 px-4 text-center font-mono text-slate-300">{node.trackCount}</td>
                              <td className="py-2.5 px-4 text-center font-mono text-slate-300">{node.playlistCount}</td>
                              <td className="py-2.5 px-4 text-center font-mono font-bold text-rose-300">{node.degree}</td>
                              <td className="py-2.5 px-4 text-right">
                                <div className="flex flex-wrap justify-end gap-1">
                                  {node.topConnected.slice(0, 3).map((peer, pIdx) => (
                                    <button
                                      key={pIdx}
                                      onClick={() => {
                                        setBridgeSource(node.artist);
                                        setBridgeTarget(peer.artist);
                                      }}
                                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 border border-slate-700 transition-colors"
                                      title={`Co-occurred in ${peer.weight} playlists`}
                                    >
                                      {peer.artist} ({peer.weight})
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* LENS 4: WANDER ODYSSEY CONTINUOUS PLAYER */}
            {constellationLens === 'wander' && (
              <div className="space-y-6">
                {/* Generator Header Card */}
                <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                        <Compass size={20} />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center space-x-2">
                          <span>Wander Odyssey Continuous Topological Player</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Graph Walking Engine
                          </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                          Walk the graph continuously hopping from playlist to playlist across aesthetic bridges, with auto-advancing 30s previews and 1-click staging.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateOdyssey}
                      disabled={isGeneratingOdyssey}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
                    >
                      <Sparkles size={14} className={isGeneratingOdyssey ? 'animate-spin' : ''} />
                      <span>{isGeneratingOdyssey ? 'Mapping Topological Flow...' : 'Generate Wander Odyssey'}</span>
                    </button>
                  </div>

                  {/* Seed and Parameter Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Seed Starting Playlist:</label>
                      <select
                        value={odysseySeedPlaylist}
                        onChange={e => setOdysseySeedPlaylist(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Top Flagship Playlist (Auto-Select)</option>
                        {(Array.from(graph.playlists.values()) as CorpusPlaylist[])
                          .sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0))
                          .slice(0, 40)
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.trackCount} tracks)
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
                        <span>Odyssey Length:</span>
                        <span className="font-mono text-amber-300">{odysseyLength} Hops</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        step="5"
                        value={odysseyLength}
                        onChange={e => setOdysseyLength(parseInt(e.target.value))}
                        className="w-full accent-amber-500 mt-1"
                      />
                    </div>

                    <div className="flex items-end space-x-2">
                      {odysseySteps.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStageOdyssey('triage')}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1 shadow-md cursor-pointer"
                          >
                            <Share2 size={12} />
                            <span>Stage to Triage</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportOdyssey('m3u')}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 border border-slate-700 cursor-pointer"
                          >
                            <Download size={12} />
                            <span>Export M3U</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Odyssey Active Player HUD Bar */}
                {odysseySteps.length > 0 && (
                  <div className="p-4 bg-gradient-to-r from-amber-950/70 via-slate-900 to-rose-950/70 border border-amber-500/30 rounded-2xl shadow-xl space-y-3 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => setOdysseyAutoAdvance(prev => !prev)}
                          className={`p-3 rounded-2xl shadow-lg transition-all cursor-pointer ${
                            odysseyAutoAdvance
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40'
                          }`}
                        >
                          {odysseyAutoAdvance ? <PauseIcon size={18} /> : <Play size={18} />}
                        </button>

                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-mono font-bold text-amber-300 uppercase">
                              Hop {odysseyCurrentIndex + 1} of {odysseySteps.length}
                            </span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs font-bold text-white">
                              {odysseySteps[odysseyCurrentIndex]?.title}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300">
                            {odysseySteps[odysseyCurrentIndex]?.artist} —{' '}
                            <span className="text-amber-300 font-medium">
                              {odysseySteps[odysseyCurrentIndex]?.transitionRationale}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Navigation Prev / Next Buttons */}
                      <div className="flex items-center space-x-2 self-end sm:self-auto">
                        <button
                          type="button"
                          disabled={odysseyCurrentIndex === 0}
                          onClick={() => setOdysseyCurrentIndex(i => Math.max(0, i - 1))}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={odysseyCurrentIndex >= odysseySteps.length - 1}
                          onClick={() => setOdysseyCurrentIndex(i => Math.min(odysseySteps.length - 1, i + 1))}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold disabled:opacity-40"
                        >
                          Next
                        </button>
                        <AudioPreviewButton
                          track={{
                            id: odysseySteps[odysseyCurrentIndex]?.trackId,
                            title: odysseySteps[odysseyCurrentIndex]?.title,
                            artist: odysseySteps[odysseyCurrentIndex]?.artist,
                            album: odysseySteps[odysseyCurrentIndex]?.album
                          }}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-amber-500 h-1.5 transition-all duration-300 rounded-full"
                        style={{ width: `${((odysseyCurrentIndex + 1) / odysseySteps.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Step Timeline Cards */}
                {odysseySteps.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block pl-1">
                      Odyssey Traversal Route ({odysseySteps.length} Topological Steps):
                    </span>

                    <div className="grid grid-cols-1 gap-2">
                      {odysseySteps.map((step, sIdx) => {
                        const isCurrent = sIdx === odysseyCurrentIndex;
                        return (
                          <div
                            key={sIdx}
                            onClick={() => setOdysseyCurrentIndex(sIdx)}
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isCurrent
                                ? 'bg-amber-950/50 border-amber-500/60 shadow-lg'
                                : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center space-x-3 truncate">
                              <span
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                                  isCurrent
                                    ? 'bg-amber-500 text-slate-950'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {step.stepIndex}
                              </span>

                              <div className="truncate">
                                <div className="flex items-center space-x-2 truncate">
                                  <span className="font-bold text-white text-xs truncate">
                                    {step.title}
                                  </span>
                                  <span className="text-slate-400 text-xs truncate">
                                    • {step.artist}
                                  </span>
                                  {step.culturalBucket && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 shrink-0">
                                      {step.culturalBucket}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-amber-300/90 block truncate mt-0.5">
                                  {step.transitionRationale}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="text-[10px] text-slate-500 font-mono hidden md:inline truncate max-w-[120px]">
                                {step.playlistName}
                              </span>
                              <AudioPreviewButton
                                track={{
                                  id: step.trackId,
                                  title: step.title,
                                  artist: step.artist,
                                  album: step.album
                                }}
                                size="xs"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* LENS 5: ACOUSTIC PLAYLIST MOOD MAP (2D RUSSELL CIRCUMPLEX) */}
            {constellationLens === 'mood' && (
              <div className="space-y-6">
                {/* Header Card */}
                <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                        <Activity size={20} />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center space-x-2">
                          <span>Acoustic Playlist Mood Map</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Russell Circumplex 2D Model
                          </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                          Scatter plot mapping Valence (melancholic vs. euphoric) against Arousal/Energy. Powered by Audimote Essentia.js Wasm audio profiles with perceptual fallbacks.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleLoadMoodPoints}
                      disabled={isLoadingMood}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
                    >
                      <RefreshCw size={14} className={isLoadingMood ? 'animate-spin' : ''} />
                      <span>{isLoadingMood ? 'Mapping Acoustic Space...' : 'Refresh Acoustic Coordinates'}</span>
                    </button>
                  </div>

                  {/* Filter & Controls Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                    {/* Quadrant Selector */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
                      {[
                        { id: 'all', label: 'All Quadrants' },
                        { id: 'exuberant', label: '⚡ Exuberant (Joyful)' },
                        { id: 'intense', label: '🔥 Intense (Turbulent)' },
                        { id: 'serene', label: '🌿 Serene (Chill)' },
                        { id: 'melancholic', label: '🌧️ Melancholic (Somber)' }
                      ].map(q => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setMoodQuadrantFilter(q.id as any)}
                          className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                            moodQuadrantFilter === q.id
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>

                    {/* Minimum Energy Slider */}
                    <div className="flex items-center space-x-2 text-xs text-slate-300">
                      <span className="text-[11px] text-slate-400">Min Energy:</span>
                      <input
                        type="range"
                        min="0.0"
                        max="0.9"
                        step="0.05"
                        value={moodMinEnergy}
                        onChange={e => setMoodMinEnergy(parseFloat(e.target.value))}
                        className="w-24 accent-emerald-500"
                      />
                      <span className="font-mono text-emerald-300 text-[11px]">
                        {(moodMinEnergy * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Stage & Export Actions */}
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleStageMoodTracks('triage')}
                        disabled={filteredMoodPoints.length === 0}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1 shadow-md cursor-pointer disabled:opacity-50"
                      >
                        <Share2 size={12} />
                        <span>Stage {filteredMoodPoints.length} to Triage</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportMoodM3U}
                        disabled={filteredMoodPoints.length === 0}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 border border-slate-700 cursor-pointer disabled:opacity-50"
                      >
                        <Download size={12} />
                        <span>Export M3U</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2D Russell Circumplex Interactive Scatter Plot */}
                <div className="relative bg-[#070b14] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4">
                  <div className="relative w-full aspect-[2/1] min-h-[380px] max-h-[560px]">
                    <svg viewBox="0 0 800 400" className="w-full h-full" preserveAspectRatio="none">
                      <defs>
                        <radialGradient id="quad-exuberant" cx="100%" cy="0%" r="80%">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="quad-intense" cx="0%" cy="0%" r="80%">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="quad-serene" cx="100%" cy="100%" r="80%">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="quad-melancholic" cx="0%" cy="100%" r="80%">
                          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                        </radialGradient>
                      </defs>

                      {/* Quadrant Background Tints */}
                      <rect x="400" y="0" width="400" height="200" fill="url(#quad-exuberant)" />
                      <rect x="0" y="0" width="400" height="200" fill="url(#quad-intense)" />
                      <rect x="400" y="200" width="400" height="200" fill="url(#quad-serene)" />
                      <rect x="0" y="200" width="400" height="200" fill="url(#quad-melancholic)" />

                      {/* Axis Crosshairs */}
                      <line x1="0" y1="200" x2="800" y2="200" stroke="#334155" strokeWidth="1.2" strokeDasharray="4,4" />
                      <line x1="400" y1="0" x2="400" y2="400" stroke="#334155" strokeWidth="1.2" strokeDasharray="4,4" />

                      {/* Axis Labels */}
                      <text x="780" y="194" fill="#94a3b8" fontSize="10" textAnchor="end" fontFamily="sans-serif">
                        Positive Valence ➔
                      </text>
                      <text x="20" y="194" fill="#94a3b8" fontSize="10" textAnchor="start" fontFamily="sans-serif">
                        ⬅ Negative Valence
                      </text>
                      <text x="408" y="20" fill="#94a3b8" fontSize="10" textAnchor="start" fontFamily="sans-serif">
                        ▲ High Energy / Arousal
                      </text>
                      <text x="408" y="390" fill="#94a3b8" fontSize="10" textAnchor="start" fontFamily="sans-serif">
                        ▼ Calm / Low Energy
                      </text>

                      {/* Quadrant Watermark Titles */}
                      <text x="760" y="40" fill="#10b981" fontSize="13" fontWeight="bold" textAnchor="end" opacity="0.6">
                        EXUBERANT (Joyful / Euphoric)
                      </text>
                      <text x="40" y="40" fill="#f43f5e" fontSize="13" fontWeight="bold" textAnchor="start" opacity="0.6">
                        INTENSE (Turbulent / Dramatic)
                      </text>
                      <text x="760" y="370" fill="#38bdf8" fontSize="13" fontWeight="bold" textAnchor="end" opacity="0.6">
                        SERENE (Chill / Peaceful)
                      </text>
                      <text x="40" y="370" fill="#a855f7" fontSize="13" fontWeight="bold" textAnchor="start" opacity="0.6">
                        MELANCHOLIC (Somber / Reflective)
                      </text>

                      {/* Data Points */}
                      {filteredMoodPoints.slice(0, 800).map(point => {
                        const cx = point.valence * 800;
                        const cy = (1 - point.energy) * 400; // Invert Y for screen coordinates
                        const isSelected = selectedMoodPoint?.trackId === point.trackId;

                        let color = '#10b981';
                        if (point.quadrant === 'intense') color = '#f43f5e';
                        else if (point.quadrant === 'serene') color = '#38bdf8';
                        else if (point.quadrant === 'melancholic') color = '#a855f7';

                        return (
                          <circle
                            key={point.trackId}
                            cx={cx}
                            cy={cy}
                            r={isSelected ? 7 : 3.5}
                            fill={isSelected ? '#ffffff' : color}
                            stroke={isSelected ? color : 'none'}
                            strokeWidth={isSelected ? 2 : 0}
                            opacity={isSelected ? 1.0 : 0.75}
                            className="cursor-pointer hover:opacity-100 hover:scale-150 transition-all duration-150"
                            onClick={() => {
                              setSelectedMoodPoint(point);
                              playTrack({
                                id: point.trackId,
                                title: point.title,
                                artist: point.artist,
                                album: point.album
                              }).catch(() => {});
                            }}
                          >
                            <title>{`${point.title} - ${point.artist}\nValence: ${(point.valence * 100).toFixed(0)}% | Energy: ${(point.energy * 100).toFixed(0)}%`}</title>
                          </circle>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Selected Point Audio Inspector */}
                  {selectedMoodPoint && (
                    <div className="mt-3 p-3 bg-slate-900 border border-slate-700/80 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
                      <div className="flex items-center space-x-3">
                        <AudioPreviewButton
                          track={{
                            id: selectedMoodPoint.trackId,
                            title: selectedMoodPoint.title,
                            artist: selectedMoodPoint.artist,
                            album: selectedMoodPoint.album
                          }}
                          size="sm"
                        />
                        <div>
                          <div className="text-xs font-bold text-white">
                            {selectedMoodPoint.title} — {selectedMoodPoint.artist}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                            <span>Valence: <strong className="text-white font-mono">{(selectedMoodPoint.valence * 100).toFixed(0)}%</strong></span>
                            <span>•</span>
                            <span>Energy: <strong className="text-white font-mono">{(selectedMoodPoint.energy * 100).toFixed(0)}%</strong></span>
                            <span>•</span>
                            <span>Quadrant: <strong className="text-emerald-300 font-mono capitalize">{selectedMoodPoint.quadrant}</strong></span>
                            {selectedMoodPoint.bpm && (
                              <>
                                <span>•</span>
                                <span>BPM: <strong className="text-amber-300 font-mono">{Math.round(selectedMoodPoint.bpm)}</strong></span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedMoodPoint(null)}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}


        {/* TAB 5: EMERGENT COMMUNITIES (LOUVAIN) */}
        {activeTab === 'communities' && graphIntel && graph && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center space-x-2">
                    <Users size={18} className="text-rose-400" />
                    <span>Emergent Taste Communities (Louvain Modularity)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Unsupervised discovery partitioned {graphIntel.artistNodes.length.toLocaleString()} artists into{' '}
                    <strong className="text-white">{graphIntel.clusters.length}</strong> emergent communities based on co-occurrence in your playlists.
                  </p>
                </div>
                <button
                  onClick={handleRunGraphAnalysis}
                  disabled={isComputingGraph}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center space-x-1.5 shrink-0"
                >
                  <RefreshCw size={13} className={isComputingGraph ? 'animate-spin text-rose-400' : ''} />
                  <span>Recluster</span>
                </button>
              </div>
            </div>

            {/* Clusters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {graphIntel.clusters.map(cluster => (
                <div
                  key={cluster.id}
                  className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all shadow-lg"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                        Community #{cluster.id + 1}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {cluster.size.toLocaleString()} tracks &middot; {cluster.artistCount} artists
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white leading-snug">{cluster.label}</h3>

                    {/* Dominant Artists */}
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                        Dominant Artists:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {cluster.dominantArtists.map((a, aIdx) => (
                          <span key={aIdx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                            {a.artist} <strong className="text-slate-500">({a.count})</strong>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Dominant Playlists */}
                    {cluster.dominantPlaylists.length > 0 && (
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                          Key Playlists:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {cluster.dominantPlaylists.slice(0, 3).map((pl, pIdx) => (
                            <span key={pIdx} className="px-2 py-0.5 rounded bg-slate-950/70 border border-slate-800 text-slate-400 text-[10px] truncate max-w-xs">
                              {pl.playlistName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (cluster.dominantArtists[0]) {
                        setSearchQuery(cluster.dominantArtists[0].artist);
                        setActiveTab('consensus');
                      }
                    }}
                    className="mt-4 pt-3 border-t border-slate-800/80 text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center justify-between"
                  >
                    <span>Inspect tracks in Consensus</span>
                    <span>→</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: OFFLINE BLIND SPOT FINDER */}
        {activeTab === 'blindspots' && graph && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center space-x-2">
                  <Zap size={18} className="text-rose-400" />
                  <span>Offline Library Blind Spot Finder (Musicolet Reconciliation)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Surfaces high-affinity artists who co-occur heavily with your favorite musicians across streaming playlists, but have zero tracks in your offline downloaded rotation.
                </p>
              </div>

              {/* Upload Dropzone */}
              <div className="pt-2 border-t border-slate-800/80">
                <FileUploader
                  label="Upload Musicolet Songs.csv export"
                  subLabel="Export from Musicolet (Settings > Backup / Export Songs list). Extracts your offline artist library for gap reconciliation."
                  files={offlineSongsFiles}
                  onFilesSelected={handleOfflineSongsSelected}
                  onClear={() => {
                    setOfflineSongsFiles([]);
                    setOfflineArtistSet(new Set());
                    setBlindSpotResults([]);
                  }}
                  multiple={false}
                  accept=".csv,.txt"
                  colorClass="rose"
                />
              </div>

              {/* Demo Mode Button if no file provided */}
              {offlineArtistSet.size === 0 && (
                <div className="flex items-center justify-between pt-2 text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span>Don't have a Musicolet export handy? Run blind spot discovery against your top 20 corpus artists:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const blindSpots = findBlindSpots(graph, new Set(), graphIntel?.artistNodes);
                      setBlindSpotResults(blindSpots);
                      setStatusMessage({
                        text: `Evaluated blind spots against top consensus artists. Found ${blindSpots.length} candidates.`,
                        type: 'info'
                      });
                    }}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold shrink-0 cursor-pointer"
                  >
                    Benchmark Mode
                  </button>
                </div>
              )}
            </div>

            {/* Results Grid */}
            {blindSpotResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span>Identified Blind Spot Artists ({blindSpotResults.length})</span>
                  <span className="text-slate-400 font-mono text-[11px]">Ranked by affinity co-occurrence score</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {blindSpotResults.map((bs, bIdx) => (
                    <div
                      key={bIdx}
                      className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-3 shadow-lg"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-bold text-white truncate" title={bs.artist}>
                            {bs.artist}
                          </span>
                          <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                            Score: {bs.score}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          <span className="font-semibold text-rose-300">{bs.coOccurrenceWeight}</span> co-occurrence link weight &middot;{' '}
                          <span className="text-white">{bs.corpusTrackCount}</span> tracks in corpus
                        </div>

                        {/* Top Playlists */}
                        {bs.topPlaylists.length > 0 && (
                          <div className="mt-2.5">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                              Found in Playlists:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {bs.topPlaylists.map((p, pIdx) => (
                                <span key={pIdx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] truncate max-w-xs">
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Sample Tracks */}
                        {bs.sampleTracks.length > 0 && (
                          <div className="mt-2.5">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                              Sample Tracks:
                            </span>
                            <div className="space-y-1">
                              {bs.sampleTracks.map((tr, tIdx) => (
                                <div key={tIdx} className="text-[11px] text-slate-300 flex items-center space-x-1.5 truncate">
                                  <Music size={11} className="text-rose-400 shrink-0" />
                                  <span className="truncate">{tr}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setSearchQuery(bs.artist);
                          setActiveTab('consensus');
                        }}
                        className="pt-2 border-t border-slate-800 text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center justify-between"
                      >
                        <span>Search in Consensus Explorer</span>
                        <span>→</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phase 3: Playlist DNA & Discovery Archaeology Tab */}
        {activeTab === 'dna' && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <Compass size={22} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                        Playlist DNA & Discovery Archaeology
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                          Phase 3 Capstone
                        </span>
                      </h2>
                      <p className="text-xs text-slate-400">
                        Multi-dimensional fingerprinting (Shannon entropy, community & cultural distributions), taste zone gap analysis, smart merge suggestions, and offline orphan detection.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={handleRunProfiling}
                    disabled={!graph || isComputingProfiling}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
                      !graph || isComputingProfiling
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                        : 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-950/50'
                    }`}
                  >
                    <RefreshCw size={14} className={isComputingProfiling ? 'animate-spin' : ''} />
                    <span>{profilingResult ? 'Recompute All Profiles' : 'Generate Playlist DNA'}</span>
                  </button>
                </div>
              </div>

              {/* Sub-tab Navigation */}
              {profilingResult && (
                <div className="flex items-center space-x-2 mt-6 pt-4 border-t border-slate-800/80 overflow-x-auto scrollbar-none">
                  <button
                    onClick={() => setDnaSubTab('dna')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shrink-0 ${
                      dnaSubTab === 'dna'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                        : 'bg-slate-800/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Dna size={13} />
                    <span>DNA Browser</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60">
                      {Object.keys(profilingResult.playlistDnas).length}
                    </span>
                  </button>

                  <button
                    onClick={() => setDnaSubTab('gaps')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shrink-0 ${
                      dnaSubTab === 'gaps'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                        : 'bg-slate-800/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <PieChart size={13} />
                    <span>Taste Gap Analysis</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60">
                      {profilingResult.gapAnalysis.denseZones.length + profilingResult.gapAnalysis.voidZones.length} zones
                    </span>
                  </button>

                  <button
                    onClick={() => setDnaSubTab('merges')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shrink-0 ${
                      dnaSubTab === 'merges'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                        : 'bg-slate-800/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <GitMerge size={13} />
                    <span>Smart Merges</span>
                    {profilingResult.smartMergeSuggestions.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-900 text-rose-200">
                        {profilingResult.smartMergeSuggestions.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setDnaSubTab('orphans')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shrink-0 ${
                      dnaSubTab === 'orphans'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                        : 'bg-slate-800/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap size={13} />
                    <span>Offline Orphans</span>
                    {profilingResult.offlineOrphans && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60">
                        {profilingResult.offlineOrphans.highConsensusOrphans.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setDnaSubTab('archaeology')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shrink-0 ${
                      dnaSubTab === 'archaeology'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                        : 'bg-slate-800/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Clock size={13} />
                    <span>Temporal Archaeology</span>
                  </button>
                </div>
              )}
            </div>

            {/* Empty state when not computed */}
            {!profilingResult && !isComputingProfiling && (
              <div className="p-12 text-center bg-slate-900/50 border border-slate-800 rounded-3xl space-y-4">
                <Compass size={40} className="mx-auto text-slate-600 animate-pulse" />
                <h3 className="text-base font-bold text-white">Playlist DNA Profiling Uncomputed</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Click the button above to calculate multi-dimensional DNA fingerprints, evaluate taste density gaps across emergent communities, surface near-duplicate playlists, and identify unarchived offline orphans.
                </p>
                <button
                  onClick={handleRunProfiling}
                  disabled={!graph}
                  className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-lg shadow-rose-950/40 inline-flex items-center space-x-2"
                >
                  <RefreshCw size={13} />
                  <span>Generate Playlist DNA</span>
                </button>
              </div>
            )}

            {/* Loading state */}
            {isComputingProfiling && (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                <RefreshCw size={36} className="mx-auto text-rose-400 animate-spin" />
                <h3 className="text-base font-bold text-white">Computing Playlist DNA Vectors & Gap Metrics...</h3>
                <p className="text-xs text-slate-400">Evaluating Shannon diversity entropy, consensus profiles, and Louvain modularity distributions.</p>
              </div>
            )}

            {/* Sub-tab 1: DNA Browser */}
            {profilingResult && dnaSubTab === 'dna' && (
              <div className="space-y-4">
                {/* Search & Filters */}
                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search playlist name..."
                      value={dnaSearchQuery}
                      onChange={e => setDnaSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Sort Field */}
                    <select
                      value={dnaSortField}
                      onChange={e => setDnaSortField(e.target.value as any)}
                      className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                    >
                      <option value="tracks">Sort by Tracks</option>
                      <option value="diversity">Sort by Diversity (Entropy)</option>
                      <option value="consensus">Sort by Mean Consensus</option>
                      <option value="name">Sort by Name</option>
                    </select>

                    <button
                      onClick={() => setDnaSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                      className="p-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-white"
                      title="Toggle sort direction"
                    >
                      <ArrowUpDown size={14} />
                    </button>
                  </div>
                </div>

                {/* Playlist DNA Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDnaPlaylists.map((dna) => (
                    <div
                      key={dna.playlistId}
                      className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4 shadow-lg hover:border-slate-700 transition-all"
                    >
                      <div>
                        {/* Title & Track Count */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-bold text-white truncate" title={dna.playlistName}>
                            {dna.playlistName}
                          </h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                            {dna.trackCount} tracks
                          </span>
                        </div>

                        {/* Dominant Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 truncate max-w-full">
                            🏛️ {dna.dominantCommunityLabel}
                          </span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30">
                            🌍 {typeof dna.dominantCulturalBucket === 'string' ? dna.dominantCulturalBucket : ((dna.dominantCulturalBucket as any)?.bucket || 'Global')}
                          </span>
                        </div>

                        {/* Diversity Meter */}
                        <div className="space-y-1 mb-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>Artist Diversity</span>
                            <span className="font-mono text-white">{(dna.normalizedDiversity * 100).toFixed(0)}% (H: {dna.artistDiversityEntropy})</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full"
                              style={{ width: `${Math.min(100, dna.normalizedDiversity * 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Consensus & Staple Ratio */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
                          <div>
                            <span className="block text-slate-500 uppercase tracking-wider text-[9px]">Mean Consensus</span>
                            <span className="font-bold text-slate-200">★ {dna.meanConsensus}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500 uppercase tracking-wider text-[9px]">Core Staples</span>
                            <span className="font-bold text-emerald-400">{(dna.stapleTrackRatio * 100).toFixed(0)}%</span> (≥2 lists)
                          </div>
                        </div>
                      </div>

                      {/* View Drawer Button */}
                      <button
                        onClick={() => setSelectedDnaPlaylistId(dna.playlistId)}
                        className="pt-2.5 border-t border-slate-800 text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center justify-between w-full"
                      >
                        <span>Inspect DNA Vector</span>
                        <span>→</span>
                      </button>
                    </div>
                  ))}
                </div>

                {filteredDnaPlaylists.length === 0 && (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No playlists matched the current search or filters.
                  </div>
                )}
              </div>
            )}

            {/* Selected Playlist DNA Details Modal / Drawer */}
            {selectedDnaPlaylistId && profilingResult?.playlistDnas[selectedDnaPlaylistId] && (() => {
              const selectedDna = profilingResult.playlistDnas[selectedDnaPlaylistId];
              const p = graph?.playlists.get(selectedDnaPlaylistId);

              return (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white">{selectedDna.playlistName}</h3>
                        <p className="text-xs text-slate-400">
                          {selectedDna.trackCount} tracks &middot; {selectedDna.uniqueArtistsCount} unique artists &middot; Source: {selectedDna.sourceFileName}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedDnaPlaylistId(null)}
                        className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-6">
                      {/* Community Breakdown */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider block">
                          Community Cluster Distribution
                        </span>
                        <div className="space-y-1.5">
                          {selectedDna.communityDistribution.map((cd, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-slate-300">
                                <span className="truncate">{cd.label}</span>
                                <span className="font-mono text-slate-400">{(cd.proportion * 100).toFixed(1)}% ({cd.count} tracks)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-rose-500 rounded-full"
                                  style={{ width: `${cd.proportion * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Cultural Breakdown */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider block">
                          Cultural Bucket Distribution
                        </span>
                        <div className="space-y-1.5">
                          {selectedDna.culturalDistribution.map((cb, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-slate-300">
                                <span>{typeof cb.bucket === 'string' ? cb.bucket : ((cb.bucket as any)?.bucket || 'Global')}</span>
                                <span className="font-mono text-slate-400">{(cb.proportion * 100).toFixed(1)}% ({cb.count} tracks)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${cb.proportion * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Track List Preview */}
                      {p && p.trackIds.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <span className="text-xs font-bold text-white uppercase tracking-wider block">
                            Included Tracks Sample ({Math.min(20, p.trackIds.length)} of {p.trackIds.length})
                          </span>
                          <div className="divide-y divide-slate-800/60 max-h-48 overflow-y-auto">
                            {p.trackIds.slice(0, 20).map((tId, tIdx) => {
                              const tr = graph?.tracks.get(tId);
                              if (!tr) return null;
                              return (
                                <div key={tIdx} className="py-2 flex items-center justify-between text-xs">
                                  <div className="truncate mr-2">
                                    <span className="text-white font-medium">{tr.title}</span>
                                    <span className="text-slate-400 ml-1.5">by {tr.artist}</span>
                                  </div>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-rose-300 shrink-0">
                                    ★ {tr.consensusCount}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Sub-tab 2: Gap Analysis */}
            {profilingResult && dnaSubTab === 'gaps' && (
              <div className="space-y-6">
                {/* Curatorial Insights */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-white">Curatorial Insights & Taste Voids</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {profilingResult.gapAnalysis.curatorialInsights.map((insight, idx) => (
                      <div
                        key={idx}
                        className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 flex flex-col justify-between shadow-lg"
                      >
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-block">
                            {insight.type.replace('_', ' ')}
                          </span>
                          <h4 className="text-sm font-bold text-white">{insight.title}</h4>
                          <p className="text-xs text-slate-400 leading-relaxed">{insight.description}</p>
                        </div>
                        {insight.recommendedAction && (
                          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-rose-300 font-medium">
                            💡 {insight.recommendedAction}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dense vs Void Taste Zones */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Dense Zones */}
                  <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>🔥 Dense Taste Zones</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                          {profilingResult.gapAnalysis.denseZones.length}
                        </span>
                      </h3>
                      <span className="text-xs text-slate-500">Heavily curated collections</span>
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {profilingResult.gapAnalysis.denseZones.map((z, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-white">
                            <span className="truncate">{z.communityLabel}</span>
                            <span className="text-rose-400 font-mono shrink-0">{z.playlistCount} playlists</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {z.trackCount.toLocaleString()} tracks ({(z.trackShare * 100).toFixed(1)}% of library) &middot; Top artists: {z.dominantArtists.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Void Opportunities */}
                  <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>🌌 Under-Represented Voids</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                          {profilingResult.gapAnalysis.voidZones.length}
                        </span>
                      </h3>
                      <span className="text-xs text-slate-500">Significant presence, 0 dominant playlists</span>
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {profilingResult.gapAnalysis.voidZones.slice(0, 10).map((z, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-white">
                            <span className="truncate">{z.communityLabel}</span>
                            <span className="text-amber-400 font-mono shrink-0">{z.trackCount} orphan tracks</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Contains {z.trackCount} songs across disparate lists without a dedicated home &middot; Artists: {z.dominantArtists.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Isolated Island Playlists */}
                {profilingResult.gapAnalysis.isolatedIslandPlaylists.length > 0 && (
                  <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>🏝️ Isolated Island Playlists</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                          {profilingResult.gapAnalysis.isolatedIslandPlaylists.length}
                        </span>
                      </h3>
                      <span className="text-xs text-slate-500">Playlists with &lt;5% similarity to any other list</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {profilingResult.gapAnalysis.isolatedIslandPlaylists.slice(0, 12).map((isl, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-white">
                            <span className="truncate" title={isl.playlistName}>{isl.playlistName}</span>
                            <span className="font-mono text-slate-400 shrink-0">{isl.trackCount} tr</span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug">{isl.isolatedReason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 3: Smart Merges */}
            {profilingResult && dnaSubTab === 'merges' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Near-Duplicate Playlists (Jaccard ≥ {(minMergeJaccard * 100).toFixed(0)}%)</h3>
                    <p className="text-xs text-slate-400">Consolidate redundant playlists sharing high percentages of identical songs.</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400">Threshold:</span>
                    {[0.50, 0.60, 0.70, 0.80].map(th => (
                      <button
                        key={th}
                        onClick={() => setMinMergeJaccard(th)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          minMergeJaccard === th
                            ? 'bg-rose-500 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {(th * 100).toFixed(0)}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Suggestions List */}
                <div className="space-y-4">
                  {profilingResult.smartMergeSuggestions
                    .filter(s => s.jaccardIndex >= minMergeJaccard)
                    .map((sug) => (
                      <div
                        key={sug.pairId}
                        className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-lg"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <GitMerge size={16} className="text-rose-400 shrink-0" />
                            <h4 className="text-sm font-bold text-white">
                              {sug.suggestedMergedName}
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Overlap: {sug.redundancyScore}%
                            </span>
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              J: {(sug.jaccardIndex * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        {/* Breakdown Comparison */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Shared Songs</span>
                            <span className="font-bold text-white">{sug.sharedTracksCount}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Unique to A</span>
                            <span className="font-bold text-slate-300">{sug.uniqueToACount}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Unique to B</span>
                            <span className="font-bold text-slate-300">{sug.uniqueToBCount}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] uppercase font-bold block">Merged Total</span>
                            <span className="font-bold text-emerald-400">{sug.totalUnionTracksCount}</span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed">{sug.reasoning}</p>

                        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800/80">
                          <button
                            onClick={() => handleExportMergedPlaylist(sug, 'csv')}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center space-x-1.5"
                          >
                            <Download size={12} />
                            <span>Export Merged CSV</span>
                          </button>
                          <button
                            onClick={() => handleExportMergedPlaylist(sug, 'm3u')}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center space-x-1.5"
                          >
                            <Download size={12} />
                            <span>Export Merged M3U</span>
                          </button>
                        </div>
                      </div>
                    ))}

                  {profilingResult.smartMergeSuggestions.filter(s => s.jaccardIndex >= minMergeJaccard).length === 0 && (
                    <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-2xl text-xs text-slate-500">
                      No playlist pairs exceed the {(minMergeJaccard * 100).toFixed(0)}% Jaccard overlap threshold.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 4: Offline Orphans */}
            {profilingResult && dnaSubTab === 'orphans' && (
              <div className="space-y-6">
                {!profilingResult.offlineOrphans ? (
                  <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                    <Zap size={36} className="mx-auto text-amber-400" />
                    <h3 className="text-base font-bold text-white">Musicolet Library Required for Orphan Detection</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Upload your Musicolet `Songs.csv` file to detect high-consensus streaming tracks that are completely missing from your offline device rotation.
                    </p>
                    <button
                      onClick={() => {
                        // Load benchmark demo offline set of 500 top artists
                        const sampleSet = new Set(['bts', 'taylor swift', 'coldplay', 'drake', 'ed sheeran', 'the weeknd']);
                        setOfflineArtistSet(sampleSet);
                        const updated = runPlaylistProfiling(graph!, graphIntel, undefined, sampleSet, simulateTemporal);
                        setProfilingResult(updated);
                        savePlaylistProfiling(updated);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold"
                    >
                      Load Sample Offline Benchmark
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Orphan Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Total Orphans</span>
                        <span className="text-xl font-black text-white">{profilingResult.offlineOrphans.totalOrphanTracksCount.toLocaleString()}</span>
                      </div>
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">High Consensus (≥2)</span>
                        <span className="text-xl font-black text-rose-400">{profilingResult.offlineOrphans.highConsensusOrphans.length}</span>
                      </div>
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Orphaned Artists</span>
                        <span className="text-xl font-black text-white">{profilingResult.offlineOrphans.orphanedArtists.length}</span>
                      </div>
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Reservoir Ratio</span>
                        <span className="text-xl font-black text-emerald-400">{profilingResult.offlineOrphans.reservoirToCanonRatio}×</span>
                      </div>
                    </div>

                    {/* Export Orphan Action */}
                    <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                      <div>
                        <h4 className="text-xs font-bold text-white">Export High-Consensus Orphan Intake</h4>
                        <p className="text-[11px] text-slate-400">Download missing core tracks directly for offline library queuing.</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleExportOrphans('csv')}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center space-x-1.5"
                        >
                          <Download size={12} />
                          <span>CSV</span>
                        </button>
                        <button
                          onClick={() => handleExportOrphans('m3u')}
                          className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-rose-950/40"
                        >
                          <Download size={12} />
                          <span>M3U</span>
                        </button>
                      </div>
                    </div>

                    {/* High Consensus Orphans Table */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                      <div className="p-4 border-b border-slate-800 text-xs font-bold text-white">
                        Top High-Consensus Orphan Tracks (Never downloaded offline)
                      </div>
                      <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
                        {profilingResult.offlineOrphans.highConsensusOrphans.slice(0, 30).map((orp, idx) => (
                          <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-800/30">
                            <div className="flex items-center space-x-3 truncate mr-3">
                              <AudioPreviewButton artist={orp.artist} trackName={orp.title} size="sm" />
                              <div className="truncate">
                                <span className="font-bold text-white truncate block">{orp.title}</span>
                                <span className="text-[11px] text-slate-400">{orp.artist} &middot; {orp.album}</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                              ★ {orp.consensusCount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 5: Temporal Archaeology */}
            {profilingResult && dnaSubTab === 'archaeology' && (
              <div className="space-y-6">
                {!profilingResult.temporalArchaeology.hasTimestampData ? (
                  <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                    <Clock size={36} className="mx-auto text-slate-500" />
                    <h3 className="text-base font-bold text-white">Temporal Data Column Absent</h3>
                    <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                      Per Architect's Brief §5.4 Landmine, the standard 7-column Spotify backup schema does not contain playlist creation or track-addition timestamps.
                      Adding an <code className="text-rose-300">Added At</code> or <code className="text-rose-300">Date Added</code> column unlocks Discovery Waves, Genre Migration, and Dormant Treasures.
                    </p>
                    <button
                      onClick={() => {
                        const updated = runPlaylistProfiling(graph!, graphIntel, undefined, offlineArtistSet, true);
                        setProfilingResult(updated);
                        setSimulateTemporal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-lg shadow-rose-950/40 inline-flex items-center space-x-2"
                    >
                      <Sparkles size={13} />
                      <span>Simulate Discovery Waves Preview</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Discovery Waves */}
                    <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white">🌊 Discovery Waves</h3>
                          <p className="text-xs text-slate-400">Quarterly bursts of playlist and track discovery additions.</p>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {profilingResult.temporalArchaeology.timestampColumnDetected}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {profilingResult.temporalArchaeology.discoveryWaves.map((wave, idx) => (
                          <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                            <span className="text-[10px] font-mono text-slate-400 block">{wave.period}</span>
                            <span className="text-sm font-black text-rose-400 block">+{wave.newTracksCount} tr</span>
                            <span className="text-[10px] text-slate-500 block">{wave.newPlaylistsCount} playlists</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Dormant Treasures */}
                    {profilingResult.temporalArchaeology.dormantTreasures.length > 0 && (
                      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-white">💎 Dormant Treasures</h3>
                            <p className="text-xs text-slate-400">Playlists saved in early epochs that have remained untouched.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {profilingResult.temporalArchaeology.dormantTreasures.map((dt, idx) => (
                            <div key={idx} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-white">
                                <span className="truncate" title={dt.playlistName}>{dt.playlistName}</span>
                                <span className="font-mono text-rose-300 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20">
                                  Score: {dt.freshnessScore}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {dt.trackCount} tracks &middot; Saved on {dt.lastAddedDate}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 8: RECIPES & CROSS-MODULE PIPELINES (PHASE 4)                         */}
        {/* ========================================================================= */}
        {activeTab === 'recipes' && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/30 border border-slate-800 rounded-3xl relative overflow-hidden shadow-xl">
              <div className="absolute right-0 top-0 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Phase 4 Curatorial Engine
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      16 Pre-configured Synthesis Recipes
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                    <Disc3 className="text-rose-400" size={26} />
                    <span>Declarative Recipes & Cross-Module Staging</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Execute multi-stage discovery pipelines combining multi-curator consensus sieves, cross-pollination bridges,
                    cultural re-balancing, and offline gap reconciliation. 1-click stage results into Triage (M14), Clustering (M13),
                    Pruner (M4), or direct UTF-8 BOM exports.
                  </p>
                </div>

                {/* Corpus Context Badges */}
                <div className="flex flex-wrap lg:flex-col items-start lg:items-end gap-2 text-xs">
                  <div className="p-2.5 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-slate-400">Corpus:</span>
                    <strong className="text-white font-mono">
                      {graph ? `${graph.stats.uniqueTracks.toLocaleString()} tracks / ${graph.stats.totalPlaylists} lists` : 'None loaded'}
                    </strong>
                  </div>
                  <div className="p-2.5 px-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${offlineArtistSet.size > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-slate-400">Offline Library:</span>
                    <strong className="text-white font-mono">
                      {offlineArtistSet.size > 0 ? `${offlineArtistSet.size.toLocaleString()} Musicolet artists` : 'Not loaded'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Recipe Catalog Filters & Search */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
              {/* Category Pills */}
              <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pb-1">
                {(['ALL', 'consensus_sieves', 'curator_bridge', 'daeso_pipeline', 'cultural_rebalancing', 'offline_reconciliation'] as const).map(cat => {
                  const labels: Record<string, string> = {
                    ALL: `All Recipes (${DISCOVERY_RECIPES.length})`,
                    consensus_sieves: 'Consensus & Novelty',
                    curator_bridge: 'Curator Bridges',
                    daeso_pipeline: 'Full DAESO Loops',
                    cultural_rebalancing: 'Cultural Re-Balancing',
                    offline_reconciliation: 'Offline Gap Reconciler'
                  };
                  const isSelected = recipeCategoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setRecipeCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                        isSelected
                          ? 'bg-rose-500 text-white shadow-md shadow-rose-950/40'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      {labels[cat]}
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search recipes by natural language prompt, name, or keywords... (e.g. 'underground', 'bridge', 'gap', 'cultural')"
                  value={recipeSearch}
                  onChange={e => setRecipeSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>
            </div>

            {/* Main Interactive Grid: Recipe Selector (Left) + Configurator & Runner (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Recipe Cards (5 cols) */}
              <div className="lg:col-span-5 space-y-3 max-h-[750px] overflow-y-auto pr-1">
                {filteredRecipes.length === 0 ? (
                  <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs">
                    No recipes match "{recipeSearch}".
                  </div>
                ) : (
                  filteredRecipes.map(recipe => {
                    const isSelected = recipe.id === selectedRecipeId;
                    return (
                      <div
                        key={recipe.id}
                        onClick={() => setSelectedRecipeId(recipe.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                          isSelected
                            ? 'bg-rose-950/20 border-rose-500/60 shadow-lg shadow-rose-950/30'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center space-x-2 min-w-0">
                              <span className="text-base">
                                {recipe.category === 'consensus_sieves' ? '🎯' :
                                 recipe.category === 'curator_bridge' ? '🌉' :
                                 recipe.category === 'daeso_pipeline' ? '🪐' :
                                 recipe.category === 'cultural_rebalancing' ? '🌍' : '⚡'}
                              </span>
                              <h4 className="text-xs font-bold text-white truncate">
                                {recipe.name}
                              </h4>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 shrink-0">
                              {recipe.parameters.length} params
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                            {recipe.description}
                          </p>

                          <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[10px] text-rose-300 italic">
                            "{recipe.promptExample}"
                          </div>
                        </div>

                        {/* Pipeline Stage Pills */}
                        <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800/60">
                          {recipe.stepsSummary.map((step, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono"
                            >
                              {step}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Column: Execution Console & Parameter Configurator (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {activeRecipe && (
                  <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-5 shadow-xl">
                    {/* Active Recipe Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-800">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-xs uppercase tracking-wider font-bold text-rose-400 font-mono">
                            {activeRecipe.category.replace('_', ' ')}
                          </span>
                          {activeRecipe.requiresOfflineLibrary && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Requires Offline Musicolet
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-white">
                          {activeRecipe.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          {activeRecipe.description}
                        </p>
                      </div>

                      <button
                        onClick={() => handleRunRecipe(activeRecipe)}
                        disabled={isExecutingRecipe || !graph}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-rose-950/50 transition-all shrink-0 cursor-pointer"
                      >
                        {isExecutingRecipe ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Synthesizing...</span>
                          </>
                        ) : (
                          <>
                            <Play size={14} fill="currentColor" />
                            <span>Run Recipe</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Step Sequence Breadcrumb */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Execution Pipeline Stages
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {activeRecipe.stepsSummary.map((step, idx) => (
                          <div key={idx} className="flex items-center space-x-1.5">
                            <span className="text-[10px] px-2 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 font-mono">
                              <strong className="text-rose-400 mr-1">{idx + 1}.</strong>
                              {step}
                            </span>
                            {idx < activeRecipe.stepsSummary.length - 1 && (
                              <ArrowRight size={10} className="text-slate-600" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Parameter Configurator Form */}
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Sliders size={13} className="text-rose-400" />
                          <span>Custom Recipe Parameters</span>
                        </span>
                        <button
                          onClick={() => {
                            const defs: Record<string, any> = {};
                            activeRecipe.parameters.forEach(p => { defs[p.key] = p.defaultValue; });
                            setRecipeParams(defs);
                          }}
                          className="text-[10px] text-slate-400 hover:text-rose-300 transition-colors"
                        >
                          Reset to Defaults
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {activeRecipe.parameters.map(param => {
                          const val = recipeParams[param.key] ?? param.defaultValue;

                          if (param.type === 'number') {
                            return (
                              <div key={param.key} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <label className="font-semibold text-slate-200">{param.label}</label>
                                  <span className="font-mono text-rose-400 font-bold">{val}</span>
                                </div>
                                <input
                                  type="range"
                                  min={param.min ?? 1}
                                  max={param.max ?? 100}
                                  value={val}
                                  onChange={e => setRecipeParams(prev => ({ ...prev, [param.key]: Number(e.target.value) }))}
                                  className="w-full accent-rose-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                />
                                <p className="text-[10px] text-slate-500">{param.description}</p>
                              </div>
                            );
                          }

                          if (param.type === 'boolean') {
                            return (
                              <div key={param.key} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-slate-200 block">{param.label}</label>
                                  <p className="text-[10px] text-slate-500">{param.description}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setRecipeParams(prev => ({ ...prev, [param.key]: !val }))}
                                  className={`w-10 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                                    val ? 'bg-rose-500' : 'bg-slate-800'
                                  }`}
                                >
                                  <span
                                    className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                                      val ? 'right-1' : 'left-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          }

                          if (param.type === 'select') {
                            return (
                              <div key={param.key} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 sm:col-span-2">
                                <label className="text-xs font-semibold text-slate-200 block">{param.label}</label>
                                <select
                                  value={val}
                                  onChange={e => setRecipeParams(prev => ({ ...prev, [param.key]: e.target.value }))}
                                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-rose-500"
                                >
                                  {param.options?.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-[10px] text-slate-500">{param.description}</p>
                              </div>
                            );
                          }

                          if (param.type === 'multiselect') {
                            const curArr: string[] = Array.isArray(val) ? val : [];
                            const availableBuckets = [
                              'Naija', 'African', 'Amapiano', 'K-Pop', 'J-Pop', 'C-Pop', 'Latin',
                              'Arabic', 'Bollywood', 'Desi', 'Reggae', 'Dancehall', 'Afro-Fusion', 'Afrobeats'
                            ];
                            return (
                              <div key={param.key} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 sm:col-span-2">
                                <div className="flex items-center justify-between text-xs">
                                  <label className="font-semibold text-slate-200">{param.label}</label>
                                  <span className="text-[10px] font-mono text-slate-400">{curArr.length} selected</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                                  {availableBuckets.map(b => {
                                    const active = curArr.includes(b);
                                    return (
                                      <button
                                        type="button"
                                        key={b}
                                        onClick={() => {
                                          const next = active
                                            ? curArr.filter(x => x !== b)
                                            : [...curArr, b];
                                          setRecipeParams(prev => ({ ...prev, [param.key]: next }));
                                        }}
                                        className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition-all ${
                                          active
                                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
                                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                                        }`}
                                      >
                                        {b}
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="text-[10px] text-slate-500">{param.description}</p>
                              </div>
                            );
                          }

                          // String or Playlist parameter
                          return (
                            <div key={param.key} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 sm:col-span-2">
                              <label className="text-xs font-semibold text-slate-200 block">{param.label}</label>
                              <input
                                type="text"
                                value={val}
                                onChange={e => setRecipeParams(prev => ({ ...prev, [param.key]: e.target.value }))}
                                placeholder="Enter keyword or playlist title..."
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                              />
                              <p className="text-[10px] text-slate-500">{param.description}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Execution Results, Downstream Staging & Track Table */}
            {recipeExecutionResult && (
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6 shadow-2xl">
                {/* Result Summary Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 size={18} className="text-emerald-400" />
                      <h3 className="text-base font-bold text-white">
                        {recipeExecutionResult.recipeName}
                      </h3>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {recipeExecutionResult.tracks.length} tracks generated
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Execution completed in <strong className="text-rose-300 font-mono">{recipeExecutionResult.durationMs}ms</strong> across{' '}
                      <strong className="text-white font-mono">{recipeExecutionResult.stepLogs.length} pipeline stages</strong>.
                    </p>
                  </div>

                  {/* Toggle Pipeline Audit Log */}
                  <button
                    onClick={() => setRecipeAuditOpen(prev => !prev)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors self-start md:self-auto"
                  >
                    <Layers2 size={14} />
                    <span>{recipeAuditOpen ? 'Hide' : 'View'} Execution Audit Log</span>
                  </button>
                </div>

                {/* Audit Log Drawer */}
                {recipeAuditOpen && (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Stage-by-Stage Execution Audit
                      </h4>
                      <span className="text-[10px] font-mono text-slate-500">
                        Latency Ceiling: &lt; 250ms
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-mono">
                            <th className="py-2 pr-3">Stage</th>
                            <th className="py-2 pr-3">Module</th>
                            <th className="py-2 pr-3">Description</th>
                            <th className="py-2 pr-3 text-right">In</th>
                            <th className="py-2 pr-3 text-right">Out</th>
                            <th className="py-2 text-right">Latency</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {recipeExecutionResult.stepLogs.map((log, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="py-2 pr-3 font-bold text-slate-200">{log.stage}</td>
                              <td className="py-2 pr-3 text-rose-400">{log.module}</td>
                              <td className="py-2 pr-3 text-slate-400 font-sans">{log.description}</td>
                              <td className="py-2 pr-3 text-right text-slate-400">{log.inputCount}</td>
                              <td className="py-2 pr-3 text-right text-white font-bold">{log.outputCount}</td>
                              <td className="py-2 text-right text-emerald-400">{log.durationMs}ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Cross-Module 1-Click Staging & Direct Export Action Bars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                  {/* Left: 1-Click Cross-Module Staging */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                      <Send size={13} className="text-rose-400" />
                      <span>1-Click Cross-Module Staging</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Hand off {selectedRecipeTrackIds.size} selected tracks to downstream Haven engines:
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => handleStageForModule('m14_triage')}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-rose-950/40 transition-all cursor-pointer"
                        title="Open tracks in M14 Discovery Triage intake buffer"
                      >
                        <span>🚀 Send to Triage (M14)</span>
                      </button>
                      <button
                        onClick={() => handleStageForModule('m13_clustering')}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-blue-950/40 transition-all cursor-pointer"
                        title="Cluster tracks by linguistic and script roots in M13"
                      >
                        <span>🌐 Language Clustering (M13)</span>
                      </button>
                      <button
                        onClick={() => handleStageForModule('m4_pruner')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                        title="Prune duplicates or stale tracks in M4"
                      >
                        <span>✂️ Pruner (M4)</span>
                      </button>
                      <button
                        onClick={() => handleStageForModule('m10_randomizer')}
                        className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                        title="Entropy shuffle tracks in M10"
                      >
                        <span>🎲 Randomizer (M10)</span>
                      </button>
                      <button
                        onClick={() => handleStageForModule('m18_audimote')}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                        title="Classify tracks with BPM & Valence in M18 Audimote"
                      >
                        <span>🎛️ Audimote (M18)</span>
                      </button>
                    </div>
                  </div>

                  {/* Right: Direct File Exports (Guaranteed UTF-8 BOM \uFEFF) */}
                  <div className="space-y-2 border-t md:border-t-0 md:border-l border-slate-800 md:pl-4 pt-3 md:pt-0">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                      <Download size={13} className="text-rose-400" />
                      <span>Direct Playlist Exports (UTF-8 BOM)</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Standard Spotify-compatible and Musicolet-ready files with guaranteed <code className="text-rose-300 font-mono">\uFEFF</code> BOM header:
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => handleExportRecipe('csv')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <FileSpreadsheet size={13} className="text-emerald-400" />
                        <span>Export CSV</span>
                      </button>
                      <button
                        onClick={() => handleExportRecipe('m3u')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <Music size={13} className="text-rose-400" />
                        <span>Export M3U</span>
                      </button>
                      <button
                        onClick={() => handleExportRecipe('tsv')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <FileText size={13} className="text-sky-400" />
                        <span>Export TSV</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Candidate Track Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={toggleSelectAllRecipeTracks}
                        className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors"
                      >
                        {selectedRecipeTrackIds.size === recipeExecutionResult.tracks.length ? (
                          <CheckSquare size={14} className="text-rose-400" />
                        ) : (
                          <Square size={14} />
                        )}
                        <span className="font-semibold">
                          {selectedRecipeTrackIds.size === recipeExecutionResult.tracks.length
                            ? 'Deselect All'
                            : 'Select All'}
                        </span>
                      </button>
                      <span className="text-slate-500">&middot;</span>
                      <span className="text-slate-400 font-mono">
                        {selectedRecipeTrackIds.size} of {recipeExecutionResult.tracks.length} tracks selected
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[10px] uppercase font-mono">
                          <th className="py-2.5 px-3 w-8"></th>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Track</th>
                          <th className="py-2.5 px-3">Artist</th>
                          <th className="py-2.5 px-3 hidden md:table-cell">Album</th>
                          <th className="py-2.5 px-3 text-center">Consensus</th>
                          <th className="py-2.5 px-3">Cultural Bucket</th>
                          <th className="py-2.5 px-3 text-center w-12">Preview</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {recipeExecutionResult.tracks.map((track, idx) => {
                          const isSelected = selectedRecipeTrackIds.has(track.id);
                          return (
                            <tr
                              key={track.id}
                              onClick={() => toggleRecipeTrackSelection(track.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-rose-950/10 hover:bg-rose-950/20' : 'hover:bg-slate-900/40'
                              }`}
                            >
                              <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleRecipeTrackSelection(track.id)}
                                  className="accent-rose-500 rounded cursor-pointer"
                                />
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-slate-500 text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-bold text-white truncate max-w-xs" title={track.title}>
                                  {track.title}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <div className="text-slate-300 truncate max-w-xs" title={track.artist}>
                                  {track.artist}
                                </div>
                              </td>
                              <td className="py-2 px-3 hidden md:table-cell">
                                <div className="text-slate-400 text-[11px] truncate max-w-xs" title={track.album}>
                                  {track.album || '—'}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className="font-mono text-xs font-black text-rose-300 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                                  ★ {track.consensusCount}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800">
                                  🌍 {track.culturalBucket || 'Global'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                                <AudioPreviewButton title={track.title} artist={track.artist} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* PHASE 5: CURATOR INTELLIGENCE & CALIBRATED DISCOVERY (FEAT-M20-023, FEAT-M20-024) */}
        {/* ========================================================================= */}
        {activeTab === 'curators' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 1. Header & Calibration Action Bar */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 md:p-6 backdrop-blur-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-rose-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      <Award size={18} />
                    </span>
                    <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                      Curator Intelligence & Taste Calibration
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                        Phase 5
                      </span>
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    Evaluates all {graph ? graph.stats.totalPlaylists.toLocaleString() : '1,000+'} playlists against your true personal canon: 
                    <strong className="text-slate-200"> * Newees</strong> intake playlists and <strong className="text-slate-200">TABLE_SONGS_view.csv</strong> offline library.
                    Computes real taste-yield percentages, clusters curator archetypes, and surfaces unmined consensus gems with trust weighting.
                  </p>
                </div>

                {/* Right controls: Recalibrate + Offline Ingest */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* File input for TABLE_SONGS_view.csv */}
                  <label className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-semibold text-xs flex items-center space-x-1.5 cursor-pointer transition-colors">
                    <Music size={13} className="text-rose-400" />
                    <span>{offlineSongs.length > 0 ? `Offline Library (${offlineSongs.length.toLocaleString()})` : 'Load TABLE_SONGS_view.csv'}</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleOfflineSongsSelected(Array.from(e.target.files));
                        }
                      }}
                    />
                  </label>

                  <button
                    onClick={handleRunCuratorCalibration}
                    disabled={isComputingCurators || !graph}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} className={isComputingCurators ? 'animate-spin' : ''} />
                    <span>{isComputingCurators ? 'Calibrating...' : 'Recalibrate'}</span>
                  </button>

                  {Object.keys(curatorCustomTiers).length > 0 && (
                    <button
                      onClick={handleResetTrustTiers}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                      title="Reset manual trust tier overrides"
                    >
                      <span>Reset Tiers ({Object.keys(curatorCustomTiers).length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stat Metrics Banner */}
              {curatorResult && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-slate-800/80 relative z-10">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
                    <div className="text-[10px] uppercase font-mono text-slate-400 font-semibold flex items-center justify-between">
                      <span>Total Curators</span>
                      <Users size={12} className="text-rose-400" />
                    </div>
                    <div className="text-lg font-black text-white mt-1">
                      {curatorResult.stats.totalPlaylists.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400">correlating playlists</div>
                  </div>

                  <div className="bg-slate-950/60 border border-rose-500/20 rounded-2xl p-3">
                    <div className="text-[10px] uppercase font-mono text-rose-300 font-semibold flex items-center justify-between">
                      <span>My * Newees</span>
                      <Sparkles size={12} className="text-rose-400" />
                    </div>
                    <div className="text-lg font-black text-rose-300 mt-1">
                      {curatorResult.stats.neweesPlaylistsCount}
                    </div>
                    <div className="text-[10px] text-slate-400">active intake canon</div>
                  </div>

                  <div className="bg-slate-950/60 border border-emerald-500/20 rounded-2xl p-3">
                    <div className="text-[10px] uppercase font-mono text-emerald-400 font-semibold flex items-center justify-between">
                      <span>Offline Canon</span>
                      <CheckCircle2 size={12} className="text-emerald-400" />
                    </div>
                    <div className="text-lg font-black text-emerald-300 mt-1">
                      {(curatorResult.stats.offlineSongsMatched || 0) > 0
                        ? curatorResult.stats.offlineSongsMatched.toLocaleString()
                        : (curatorResult.stats.offlineArtistsMatched || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {(curatorResult.stats.offlineSongsMatched || 0) > 0 ? 'exact offline songs' : 'known artists'}
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-amber-500/20 rounded-2xl p-3">
                    <div className="text-[10px] uppercase font-mono text-amber-400 font-semibold flex items-center justify-between">
                      <span>High-Yield Curators</span>
                      <Crown size={12} className="text-amber-400" />
                    </div>
                    <div className="text-lg font-black text-amber-300 mt-1">
                      {curatorResult.stats.highAffinityCuratorsCount}
                    </div>
                    <div className="text-[10px] text-slate-400">&ge;10% taste alignment</div>
                  </div>

                  <div className="bg-slate-950/60 border border-purple-500/20 rounded-2xl p-3">
                    <div className="text-[10px] uppercase font-mono text-purple-400 font-semibold flex items-center justify-between">
                      <span>Editorial Tiers</span>
                      <ShieldCheck size={12} className="text-purple-400" />
                    </div>
                    <div className="text-lg font-black text-purple-300 mt-1">
                      {curatorResult.curators.filter(c => c.trustTier === 'editorial').length}
                    </div>
                    <div className="text-[10px] text-slate-400">1.5x trust weight</div>
                  </div>

                  <div className="bg-slate-950/60 border border-cyan-500/20 rounded-2xl p-3">
                    <div className="text-[10px] uppercase font-mono text-cyan-400 font-semibold flex items-center justify-between">
                      <span>Unmined Gems</span>
                      <TrendingUp size={12} className="text-cyan-400" />
                    </div>
                    <div className="text-lg font-black text-cyan-300 mt-1">
                      {curatorResult.unminedHighSignalTracks.length.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400">vouched consensus</div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Sub-Tabs Bar: Leaderboard / Archetypes / Unmined Candidates */}
            <div className="flex border-b border-slate-800 space-x-2">
              <button
                onClick={() => setCuratorSubTab('leaderboard')}
                className={`pb-3 px-4 text-xs font-bold transition-all relative flex items-center space-x-2 cursor-pointer ${
                  curatorSubTab === 'leaderboard' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Award size={14} className={curatorSubTab === 'leaderboard' ? 'text-rose-400' : 'text-slate-500'} />
                <span>Curator Yield Leaderboard</span>
                {curatorResult && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    curatorSubTab === 'leaderboard' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {filteredCurators.length.toLocaleString()}
                  </span>
                )}
                {curatorSubTab === 'leaderboard' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 shadow-sm shadow-rose-500" />
                )}
              </button>

              <button
                onClick={() => setCuratorSubTab('archetypes')}
                className={`pb-3 px-4 text-xs font-bold transition-all relative flex items-center space-x-2 cursor-pointer ${
                  curatorSubTab === 'archetypes' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers size={14} className={curatorSubTab === 'archetypes' ? 'text-rose-400' : 'text-slate-500'} />
                <span>Curator Archetypes</span>
                {curatorResult && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    curatorSubTab === 'archetypes' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {curatorResult.archetypes.length}
                  </span>
                )}
                {curatorSubTab === 'archetypes' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 shadow-sm shadow-rose-500" />
                )}
              </button>

              <button
                onClick={() => setCuratorSubTab('unmined')}
                className={`pb-3 px-4 text-xs font-bold transition-all relative flex items-center space-x-2 cursor-pointer ${
                  curatorSubTab === 'unmined' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles size={14} className={curatorSubTab === 'unmined' ? 'text-rose-400' : 'text-slate-500'} />
                <span>Unmined Candidates Queue</span>
                {curatorResult && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    curatorSubTab === 'unmined' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {curatorResult.unminedHighSignalTracks.length.toLocaleString()}
                  </span>
                )}
                {curatorSubTab === 'unmined' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 shadow-sm shadow-rose-500" />
                )}
              </button>
            </div>

            {/* 3. Sub-Tab Content */}
            {/* SUB-TAB 1: CURATOR YIELD LEADERBOARD */}
            {curatorSubTab === 'leaderboard' && (
              <div className="space-y-4">
                {/* Search & Filter Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80">
                  {/* Tier Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { key: 'all', label: 'All Curators' },
                      { key: 'high_yield', label: 'Top Yield (≥10%)' },
                      { key: 'editorial', label: 'Editorial (1.5x)' },
                      { key: 'standard', label: 'Standard (1.0x)' },
                      { key: 'low_signal', label: 'Low-Signal (0.5x)' },
                      { key: 'my_newees', label: 'My * Newees' },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setCuratorFilterTier(f.key as any)}
                        className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          curatorFilterTier === f.key
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-950/40'
                            : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Search and Sort */}
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-1 sm:w-64">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                      <input
                        type="text"
                        value={curatorSearchQuery}
                        onChange={e => setCuratorSearchQuery(e.target.value)}
                        placeholder="Search curator or artist..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>

                    <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                      <span className="text-[10px] text-slate-500 uppercase font-mono">Sort:</span>
                      <select
                        value={curatorSortField}
                        onChange={e => setCuratorSortField(e.target.value as any)}
                        className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
                      >
                        <option value="yield">Yield %</option>
                        <option value="name">Name</option>
                        <option value="tracks">Tracks</option>
                        <option value="unmined">Unmined</option>
                      </select>
                      <button
                        onClick={() => setCuratorSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                        title="Toggle sort direction"
                      >
                        <ArrowUpDown size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Curators Leaderboard Table */}
                <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[10px] uppercase font-mono">
                        <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                        <th className="py-2.5 px-3">Curator / Playlist</th>
                        <th className="py-2.5 px-3 text-center">Trust Tier</th>
                        <th className="py-2.5 px-3 text-center w-36">Taste Alignment</th>
                        <th className="py-2.5 px-3 text-center">Overlap Breakdown</th>
                        <th className="py-2.5 px-3 text-center">Unmined</th>
                        <th className="py-2.5 px-3">Top Taste Anchors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {filteredCurators.slice(0, 100).map((curator, idx) => {
                        const isHighYield = curator.affinityYieldPercent >= 10;
                        return (
                          <tr key={curator.playlistId} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-2.5 px-3 text-center font-mono text-slate-500 text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-white max-w-xs sm:max-w-md truncate" title={curator.playlistName}>
                                  {curator.playlistName}
                                </span>
                                {curator.isUserNeweesPlaylist && (
                                  <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                                    ★ My Newees
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {curator.trackCount} total tracks
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <select
                                value={curator.trustTier}
                                onChange={e => handleSetTrustTier(curator.playlistId, e.target.value as CuratorTrustTier)}
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border cursor-pointer focus:outline-none ${
                                  curator.trustTier === 'editorial'
                                    ? 'bg-purple-950/60 border-purple-500/50 text-purple-300'
                                    : curator.trustTier === 'low_signal'
                                    ? 'bg-slate-900 border-slate-700 text-slate-500'
                                    : 'bg-slate-800 border-slate-700 text-slate-300'
                                }`}
                              >
                                <option value="editorial">Editorial (1.5x)</option>
                                <option value="standard">Standard (1.0x)</option>
                                <option value="low_signal">Low-Signal (0.5x)</option>
                              </select>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center space-x-2 justify-center">
                                <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      isHighYield ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-rose-400'
                                    }`}
                                    style={{ width: `${Math.min(100, curator.affinityYieldPercent * 2)}%` }}
                                  />
                                </div>
                                <span className={`font-mono text-xs font-black ${
                                  isHighYield ? 'text-amber-300' : 'text-slate-300'
                                }`}>
                                  {curator.affinityYieldPercent.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="inline-flex items-center space-x-1.5 text-[10px] font-mono">
                                <span className="text-emerald-400 font-bold" title="Exact offline songs in TABLE_SONGS_view">
                                  {curator.offlineSongOverlapCount} offl
                                </span>
                                <span className="text-slate-600">/</span>
                                <span className="text-rose-400 font-bold" title="Tracks in * Newees playlists">
                                  {curator.neweesOverlapCount} new
                                </span>
                                <span className="text-slate-600">/</span>
                                <span className="text-sky-400 font-medium" title="Offline canon artists">
                                  {curator.offlineArtistOverlapCount} art
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-mono text-xs font-bold text-slate-300">
                                {curator.unminedCandidatesCount}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-[11px] text-slate-400 truncate max-w-xs" title={curator.topSharedArtists.join(', ')}>
                                {curator.topSharedArtists.length > 0 ? curator.topSharedArtists.slice(0, 3).join(', ') : '—'}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredCurators.length > 100 && (
                  <div className="text-center text-xs text-slate-500 py-2">
                    Showing top 100 of {filteredCurators.length.toLocaleString()} matching curators
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2: CURATOR ARCHETYPES */}
            {curatorSubTab === 'archetypes' && curatorResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {curatorResult.archetypes.map(cluster => (
                    <div
                      key={cluster.clusterId}
                      className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                            <span>{cluster.label}</span>
                          </h3>
                        </div>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 shrink-0">
                          {cluster.curatorCount} lists
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-slate-500 text-[11px]">Mean Taste Yield</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {cluster.meanAffinity.toFixed(1)}%
                        </span>
                      </div>

                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] uppercase font-mono text-slate-500 font-semibold">
                          Sample Playlists
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(cluster.playlistNames || []).slice(0, 4).map((p, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 border border-slate-800/80 truncate max-w-[200px]"
                              title={p}
                            >
                              {p}
                            </span>
                          ))}
                          {(cluster.playlistNames || []).length > 4 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-900 text-slate-500 font-mono">
                              +{cluster.playlistNames.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TAB 3: UNMINED CANDIDATES QUEUE */}
            {curatorSubTab === 'unmined' && curatorResult && (
              <div className="space-y-4">
                {/* Action Bar: Staging & Exports */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Downstream Modules */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                      <Send size={13} className="text-rose-400" />
                      <span>Stage Unmined Candidates Downstream</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => handleStageCuratorCandidates('m14_triage')}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-rose-950/40 transition-all cursor-pointer"
                        title="Open tracks in M14 Discovery Triage intake buffer"
                      >
                        <span>🚀 Send to Triage (M14)</span>
                      </button>
                      <button
                        onClick={() => handleStageCuratorCandidates('m3_manipulator')}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-950/40 transition-all cursor-pointer"
                        title="Open tracks in M3 Playlist Manipulator"
                      >
                        <span>🎛️ Manipulator (M3)</span>
                      </button>
                      <button
                        onClick={() => handleStageCuratorCandidates('m13_clustering')}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                        title="Cluster tracks by linguistic roots in M13"
                      >
                        <span>🌐 Language Clustering (M13)</span>
                      </button>
                    </div>
                  </div>

                  {/* Right: Direct Exports (Guaranteed UTF-8 BOM \uFEFF) */}
                  <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-slate-800 md:pl-4 pt-3 md:pt-0">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                      <Download size={13} className="text-rose-400" />
                      <span>Direct Playlist Exports (UTF-8 BOM)</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => handleExportCuratorCandidates('csv')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <FileSpreadsheet size={13} className="text-emerald-400" />
                        <span>Export CSV</span>
                      </button>
                      <button
                        onClick={() => handleExportCuratorCandidates('m3u')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <Music size={13} className="text-rose-400" />
                        <span>Export M3U</span>
                      </button>
                      <button
                        onClick={() => handleExportCuratorCandidates('tsv')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <FileText size={13} className="text-sky-400" />
                        <span>Export TSV</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Candidate Track Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={toggleSelectAllCuratorCandidates}
                        className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {selectedCuratorCandidateIds.size === curatorResult.unminedHighSignalTracks.length ? (
                          <CheckSquare size={14} className="text-rose-400" />
                        ) : (
                          <Square size={14} />
                        )}
                        <span className="font-semibold">
                          {selectedCuratorCandidateIds.size === curatorResult.unminedHighSignalTracks.length
                            ? 'Deselect All'
                            : 'Select All'}
                        </span>
                      </button>
                      <span className="text-slate-500">&middot;</span>
                      <span className="text-slate-400 font-mono">
                        {selectedCuratorCandidateIds.size > 0
                          ? `${selectedCuratorCandidateIds.size} of ${curatorResult.unminedHighSignalTracks.length} tracks selected`
                          : `${curatorResult.unminedHighSignalTracks.length} consensus tracks available`}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[10px] uppercase font-mono">
                          <th className="py-2.5 px-3 w-8"></th>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Track</th>
                          <th className="py-2.5 px-3">Artist</th>
                          <th className="py-2.5 px-3 text-center">Provenance Curators</th>
                          <th className="py-2.5 px-3 text-center">Weighted Score</th>
                          <th className="py-2.5 px-3 text-center w-12">Preview</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {curatorResult.unminedHighSignalTracks.map((track, idx) => {
                          const isSelected = selectedCuratorCandidateIds.has(track.id);
                          return (
                            <tr
                              key={track.id}
                              onClick={() => toggleCuratorCandidateSelection(track.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-rose-950/10 hover:bg-rose-950/20' : 'hover:bg-slate-900/40'
                              }`}
                            >
                              <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleCuratorCandidateSelection(track.id)}
                                  className="accent-rose-500 rounded cursor-pointer"
                                />
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-slate-500 text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-bold text-white truncate max-w-xs" title={track.title}>
                                  {track.title}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-slate-300 truncate max-w-xs" title={track.artist}>
                                    {track.artist}
                                  </span>
                                  {track.isFamiliarArtist ? (
                                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                                      Familiar Artist
                                    </span>
                                  ) : (
                                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                                      Novel Artist
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="text-[11px] text-slate-400 truncate max-w-xs font-mono mx-auto" title={track.provenanceCurators.join(', ')}>
                                  {track.provenanceCurators.slice(0, 2).join(', ')}
                                  {track.provenanceCurators.length > 2 && ` +${track.provenanceCurators.length - 2}`}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className="font-mono text-xs font-black text-rose-300 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                                  ★ {track.weightedScore.toFixed(1)}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                                <AudioPreviewButton title={track.title} artist={track.artist} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 10: DISCOVERY AGENT PERSONAS & SYNTHESIS CORTEX */}
        {activeTab === 'agents' && (
          <div className="space-y-8">
            {/* Top Toolbar: Mode Badge + AI Config Drawer Toggle */}
            <div className="p-4 sm:p-5 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-rose-950/40 shrink-0">
                  <Bot size={22} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-bold text-white tracking-tight">Autonomous Discovery Agents & Cortex</h2>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                      Phase 6 Capstone
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Multi-persona cognitive synthesis engines grounded in your bipartite graph, curator yields, and offline library.
                  </p>
                </div>
              </div>

              {/* AI Provider & Settings Trigger */}
              <div className="flex items-center space-x-2 shrink-0">
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
                  <Cpu size={14} className={aiProvider === 'gemini' ? 'text-rose-400' : 'text-emerald-400'} />
                  <span className="text-slate-300 font-mono text-[11px]">
                    {aiProvider === 'gemini' ? (aiModelName || 'gemini-2.5-flash') : 'Local LLM (Ollama)'}
                  </span>
                </div>
                <button
                  onClick={() => setIsConfigDrawerOpen(!isConfigDrawerOpen)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Configure AI API keys and model parameters"
                >
                  <Key size={13} />
                  <span>AI Config</span>
                </button>
              </div>
            </div>

            {/* Inline AI API Key Notice Banner (if provider is gemini and key is missing) */}
            {aiProvider === 'gemini' && !apiKeyInput && (
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start sm:items-center space-x-2.5 text-amber-200">
                  <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                  <div>
                    <span className="font-bold">Gemini API Key Needed:</span> Enter your key below or toggle to local Ollama (100% free, runs locally).
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <input
                    type="password"
                    placeholder="Paste AI Studio Key..."
                    value={apiKeyInput}
                    onChange={e => setApiKeyInput(e.target.value)}
                    className="px-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={handleSaveAIConfig}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Collapsible AI Config Drawer */}
            {isConfigDrawerOpen && (
              <div className="p-5 bg-slate-900 border border-indigo-500/30 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                    <Key size={14} className="text-indigo-400" />
                    <span>AI Provider & Model Settings</span>
                  </h3>
                  <button
                    onClick={() => setIsConfigDrawerOpen(false)}
                    className="text-slate-400 hover:text-white text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">AI Provider</label>
                    <select
                      value={aiProvider}
                      onChange={e => setAiProvider(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-rose-400 cursor-pointer"
                    >
                      <option value="gemini">Google Gemini (Recommended & Fast)</option>
                      <option value="openai-compatible">Local LLM / OpenAI-Compatible (Ollama)</option>
                    </select>
                  </div>

                  {aiProvider === 'gemini' ? (
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Gemini Model</label>
                      <select
                        value={aiModelName}
                        onChange={e => setAiModelName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-rose-400 cursor-pointer"
                      >
                        <option value="gemini-2.5-flash">gemini-2.5-flash (Fastest & Best RAG)</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash (Stable Fallback)</option>
                        <option value="gemini-1.5-flash">gemini-1.5-flash (Legacy Fallback)</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Local Model Name</label>
                      <input
                        type="text"
                        value={aiModelName}
                        onChange={e => setAiModelName(e.target.value)}
                        placeholder="e.g. llama3.2 or qwen2.5"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-rose-400"
                      />
                    </div>
                  )}

                  {aiProvider === 'gemini' ? (
                    <div className="md:col-span-2">
                      <label className="block text-slate-300 font-semibold mb-1">Gemini API Key</label>
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={e => setApiKeyInput(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-rose-400"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Stored client-side only in your browser localStorage (`playlist-haven-ai-config`). Never sent to any 3rd party.
                      </p>
                    </div>
                  ) : (
                    <div className="md:col-span-2">
                      <label className="block text-slate-300 font-semibold mb-1">Ollama / OpenAI Base URL</label>
                      <input
                        type="text"
                        value={ollamaBaseUrl}
                        onChange={e => setOllamaBaseUrl(e.target.value)}
                        placeholder="http://localhost:11434/v1"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-rose-400"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => setIsConfigDrawerOpen(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAIConfig}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-950/40 cursor-pointer"
                  >
                    Save AI Configuration
                  </button>
                </div>
              </div>
            )}

            {/* INTERACTIVE DISCOVERY CORTEX CONSOLE */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center space-x-2">
                      <span>Interactive Discovery Cortex</span>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono uppercase">
                        Dense RAG
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Query your entire 50k-track graph and 1k+ playlists using natural language. Fast, grounded synthesis.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cortex Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={cortexQuery}
                    onChange={e => setCortexQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !isExecutingAgent) {
                        handleRunCortexQuery();
                      }
                    }}
                    placeholder='Ask anything: "Find 15 midnight melancholic tracks from Japanese & Korean curators with acoustic guitar"...'
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-indigo-500/40 focus:border-indigo-400 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                  />
                </div>
                <button
                  onClick={() => handleRunCortexQuery()}
                  disabled={isExecutingAgent || !cortexQuery.trim()}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shrink-0 ${
                    isExecutingAgent || !cortexQuery.trim()
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50 cursor-pointer'
                  }`}
                >
                  {isExecutingAgent ? (
                    <>
                      <RefreshCw size={14} className="animate-spin text-indigo-300" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 size={14} />
                      <span>Synthesize</span>
                    </>
                  )}
                </button>
              </div>

              {/* Cortex Quick Chips */}
              <div className="flex items-center space-x-2 mt-3 overflow-x-auto scrollbar-none pt-1">
                <span className="text-[11px] text-slate-500 uppercase font-mono shrink-0">Prompts:</span>
                {[
                  'Balanced Newees 30 Batch',
                  'Alté to UK Drill Bridge',
                  'Frontier Japanese & C-Indie Gems',
                  'Midnight Acoustic Melancholia',
                  'Atmospheric Worship to Post-Rock'
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleRunCortexQuery(chip)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-[11px] font-medium shrink-0 transition-colors cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* 5 AUTONOMOUS AGENT PERSONAS GRID */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                    <Bot size={16} className="text-rose-400" />
                    <span>Autonomous Discovery Agent Personas</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Specialized cognitive discovery engines modeled after authentic multi-bucket intake and topological analysis.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. The Newees Intake Architect */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/30 hover:border-emerald-500/50 transition-all flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <GraduationCap size={18} />
                      </div>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                        Curation Engine
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">The Newees Intake Architect</h4>
                    <p className="text-[11px] text-emerald-400/90 font-mono mt-0.5">Capacity & Multi-Bucket Balancer</p>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3">
                      Synthesizes balanced Newees discovery batches matching your listening capacity, deliberately mixing cultural buckets in calibrated ratios with spacing entropy.
                    </p>

                    {/* Controls */}
                    <div className="mt-4 space-y-2 pt-3 border-t border-slate-800 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">Intake Capacity:</span>
                        <div className="flex items-center space-x-1">
                          {[20, 30, 40, 50].map(cap => (
                            <button
                              key={cap}
                              onClick={() => setAgentBatchCapacity(cap)}
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                agentBatchCapacity === cap
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {cap}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="block text-slate-400 text-[11px] mb-1">Bucket Balancing Preset:</span>
                        <select
                          value={agentBucketPreset}
                          onChange={e => setAgentBucketPreset(e.target.value as any)}
                          className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-[11px] focus:outline-none focus:border-emerald-400 cursor-pointer"
                        >
                          <option value="balanced_global">Balanced Global (30% Asian, 20% OPM, 15% Worship, 10% Afro)</option>
                          <option value="asian_opm_focus">Asian Indie & OPM Focus (45% J/C-Indie, 35% OPM)</option>
                          <option value="afrobeats_street_hop">Afrobeats & Street-Hop Exploration (50% Naija, 25% Amapiano)</option>
                          <option value="atmospheric_worship">Atmospheric & Worship Haven (60% Worship, 25% Post-Rock)</option>
                          <option value="broad_capacity_50">Expansive 50-Track Reservoir Ingestion Dump</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunAgent('newees_architect')}
                    disabled={isExecutingAgent}
                    className={`mt-4 w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-md ${
                      isExecutingAgent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 cursor-pointer'
                    }`}
                  >
                    <GraduationCap size={14} />
                    <span>Run Newees Architect ({agentBatchCapacity} Tracks)</span>
                  </button>
                </div>

                {/* 2. The Corpus Cartographer */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 hover:border-amber-500/50 transition-all flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <Compass size={18} />
                      </div>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                        Macro Topology
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">The Corpus Cartographer</h4>
                    <p className="text-[11px] text-amber-400/90 font-mono mt-0.5">Island Navigator & Expedition Builder</p>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3">
                      Maps macro taste continents, identifies forgotten playlist islands with near-zero edge overlap to your core listening, and constructs sequenced bridge expeditions.
                    </p>
                  </div>

                  <button
                    onClick={() => handleRunAgent('cartographer')}
                    disabled={isExecutingAgent}
                    className={`mt-4 w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-md ${
                      isExecutingAgent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40 cursor-pointer'
                    }`}
                  >
                    <Compass size={14} />
                    <span>Run Island Cartographer</span>
                  </button>
                </div>

                {/* 3. The Cross-Pollination Alchemist */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-indigo-500/30 hover:border-indigo-500/50 transition-all flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                        <Sparkles size={18} />
                      </div>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                        Concept Mixtape
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">The Cross-Pollination Alchemist</h4>
                    <p className="text-[11px] text-indigo-400/90 font-mono mt-0.5">Thematic & Latent Motif Weaver</p>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3">
                      Synthesizes cross-cultural concept mixtapes connecting distant communities using shortest-path Dijkstra bridges, latent emotional motifs, and curatorial liner notes.
                    </p>

                    <div className="mt-4 pt-3 border-t border-slate-800">
                      <label className="block text-slate-400 text-[11px] mb-1">Thematic / Mood Directive:</label>
                      <input
                        type="text"
                        value={agentMoodPrompt}
                        onChange={e => setAgentMoodPrompt(e.target.value)}
                        placeholder="e.g. Afro-Fusion to Japanese City-Indie..."
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-[11px] focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunAgent('alchemist')}
                    disabled={isExecutingAgent}
                    className={`mt-4 w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-md ${
                      isExecutingAgent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/40 cursor-pointer'
                    }`}
                  >
                    <Sparkles size={14} />
                    <span>Run Alchemist Mixtape</span>
                  </button>
                </div>

                {/* 4. The Cultural Frontier Scout */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-rose-500/30 hover:border-rose-500/50 transition-all flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                        <Globe size={18} />
                      </div>
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                        A&R Talent Hunter
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">The Cultural Frontier Scout</h4>
                    <p className="text-[11px] text-rose-400/90 font-mono mt-0.5">A&R Breakthrough Talent Hunter</p>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3">
                      Operates at the boundary of your taste canon: cross-references high-affinity external curators against your offline library to surface novel artists with cultural scene justification.
                    </p>
                  </div>

                  <button
                    onClick={() => handleRunAgent('scout')}
                    disabled={isExecutingAgent}
                    className={`mt-4 w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-md ${
                      isExecutingAgent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40 cursor-pointer'
                    }`}
                  >
                    <Globe size={14} />
                    <span>Run Frontier Scout</span>
                  </button>
                </div>

                {/* 5. The Lateral Challenger */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-purple-500/30 hover:border-purple-500/50 transition-all flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
                        <Layers size={18} />
                      </div>
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                        Bubble Breaker
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">The Lateral Challenger</h4>
                    <p className="text-[11px] text-purple-400/90 font-mono mt-0.5">Anti-Echo-Chamber Explorer</p>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3">
                      Breaks algorithmic filter bubbles: translates the emotional, rhythmic, and vocal intensity of your favorite genres into orthogonal, unexpected musical traditions across the corpus.
                    </p>
                  </div>

                  <button
                    onClick={() => handleRunAgent('challenger')}
                    disabled={isExecutingAgent}
                    className={`mt-4 w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-md ${
                      isExecutingAgent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/40 cursor-pointer'
                    }`}
                  >
                    <Layers size={14} />
                    <span>Run Lateral Challenger</span>
                  </button>
                </div>
              </div>
            </div>

            {/* SYNTHESIS RESULTS CONSOLE */}
            {agentExecutionResult && (
              <div className="space-y-6 pt-4 border-t border-slate-800 animate-in fade-in slide-in-from-top-4 duration-300">
                {/* Header Card */}
                <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                    <div>
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                          <Bot size={18} />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-white tracking-tight">
                            {agentExecutionResult.agentName}
                          </h3>
                          <p className="text-[11px] text-slate-400">{agentExecutionResult.subtitle}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono text-xs border border-slate-700/60">
                        ⚡ {agentExecutionResult.executionTimeMs}ms
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono text-xs border border-slate-700/60">
                        🤖 {agentExecutionResult.modelUsed}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-mono text-xs border border-rose-500/30 font-bold">
                        🎵 {agentExecutionResult.recommendedTracks.length} Recommendations
                      </span>
                    </div>
                  </div>

                  {/* Narrative Summary */}
                  <div className="mt-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                    <p className="text-slate-100 font-medium italic">"{agentExecutionResult.narrativeSummary}"</p>
                  </div>

                  {/* Taste Insights & Bridges */}
                  {agentExecutionResult.tasteInsights?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {agentExecutionResult.tasteInsights.map((insight, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-1.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-200 flex items-center space-x-1.5"
                        >
                          <Sparkles size={12} className="text-indigo-400 shrink-0" />
                          <span>{insight}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bucket Breakdown Pills */}
                  {agentExecutionResult.bucketBreakdown && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-400 uppercase font-mono mr-1">Bucket Balance:</span>
                      {Object.entries(agentExecutionResult.bucketBreakdown).map(([bucket, count]) => (
                        <span
                          key={bucket}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold"
                        >
                          {bucket}: {count}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Bridge Transitions */}
                  {agentExecutionResult.bridgeTransitions && agentExecutionResult.bridgeTransitions.length > 0 && (
                    <div className="mt-4 space-y-2 pt-3 border-t border-slate-800/60">
                      <div className="text-[11px] font-bold text-amber-300 flex items-center space-x-1.5">
                        <Link size={12} />
                        <span>Curated Harmonic Bridge Handoffs:</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {agentExecutionResult.bridgeTransitions.map((bridge, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[11px] text-amber-200"
                          >
                            <span className="font-bold text-amber-100">{bridge.from} → {bridge.to}:</span>{' '}
                            <span className="text-slate-300">{bridge.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Staging & Action Bar */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Downstream Module Staging */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                      <Send size={13} className="text-rose-400" />
                      <span>Stage Recommendations Downstream</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => handleStageAgentTracks('m14_triage')}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-rose-950/40 transition-all cursor-pointer"
                        title="Send tracks directly to M14 Discovery Triage"
                      >
                        <span>🚀 Send to Triage (M14)</span>
                      </button>
                      <button
                        onClick={() => handleStageAgentTracks('m3_manipulator')}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-950/40 transition-all cursor-pointer"
                        title="Open tracks in M3 Playlist Manipulator"
                      >
                        <span>🎛️ Manipulator (M3)</span>
                      </button>
                      <button
                        onClick={() => handleStageAgentTracks('m13_clustering')}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                        title="Cluster tracks in M13"
                      >
                        <span>🌐 Language Clustering (M13)</span>
                      </button>
                    </div>
                  </div>

                  {/* Right: Direct Exports (UTF-8 BOM) */}
                  <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-slate-800 md:pl-4 pt-3 md:pt-0">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                      <Download size={13} className="text-rose-400" />
                      <span>Direct Playlist Exports (UTF-8 BOM)</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => handleExportAgentTracks('csv')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <FileSpreadsheet size={13} className="text-emerald-400" />
                        <span>CSV</span>
                      </button>
                      <button
                        onClick={() => handleExportAgentTracks('m3u')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <Music size={13} className="text-indigo-400" />
                        <span>M3U</span>
                      </button>
                      <button
                        onClick={() => handleExportAgentTracks('tsv')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 transition-colors cursor-pointer"
                      >
                        <FileText size={13} className="text-amber-400" />
                        <span>TSV</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Recommendations Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs px-1">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={toggleSelectAllAgentTracks}
                        className="flex items-center space-x-1 text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
                      >
                        {selectedAgentTrackIds.size === agentExecutionResult.recommendedTracks.length ? (
                          <CheckSquare size={14} />
                        ) : (
                          <Square size={14} />
                        )}
                        <span className="font-semibold">
                          {selectedAgentTrackIds.size === agentExecutionResult.recommendedTracks.length
                            ? 'Deselect All'
                            : 'Select All'}
                        </span>
                      </button>
                      <span className="text-slate-500">&middot;</span>
                      <span className="text-slate-400 font-mono">
                        {selectedAgentTrackIds.size > 0
                          ? `${selectedAgentTrackIds.size} of ${agentExecutionResult.recommendedTracks.length} tracks selected`
                          : `${agentExecutionResult.recommendedTracks.length} synthesized tracks available`}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[10px] uppercase font-mono">
                          <th className="py-2.5 px-3 w-8"></th>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Track</th>
                          <th className="py-2.5 px-3">Artist</th>
                          <th className="py-2.5 px-3">Scene / Bucket</th>
                          <th className="py-2.5 px-3 text-center">Curator Provenance</th>
                          <th className="py-2.5 px-3 text-left">Reasoning & Bridge Note</th>
                          <th className="py-2.5 px-3 text-center">Confidence</th>
                          <th className="py-2.5 px-3 text-center w-12">Preview</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {agentExecutionResult.recommendedTracks.map((track, idx) => {
                          const isSelected = selectedAgentTrackIds.has(track.trackId);
                          return (
                            <tr
                              key={track.trackId || idx}
                              onClick={() => toggleAgentTrackSelection(track.trackId)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-rose-950/10 hover:bg-rose-950/20' : 'hover:bg-slate-900/40'
                              }`}
                            >
                              <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleAgentTrackSelection(track.trackId)}
                                  className="accent-rose-500 rounded cursor-pointer"
                                />
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-slate-500 text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-bold text-white truncate max-w-xs" title={track.title}>
                                  {track.title}
                                </div>
                                {track.album && (
                                  <div className="text-[10px] text-slate-500 truncate max-w-xs" title={track.album}>
                                    {track.album}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-slate-300 font-semibold truncate max-w-xs" title={track.artist}>
                                    {track.artist}
                                  </span>
                                  {track.isNovelArtist ? (
                                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                                      Novel Artist
                                    </span>
                                  ) : (
                                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                                      Familiar Artist
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700/60 px-2 py-0.5 rounded-full font-mono">
                                  {track.bucketCategory || track.culturalScene || 'Global'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div
                                  className="text-[11px] text-slate-400 truncate max-w-xs font-mono mx-auto"
                                  title={track.provenanceCurators?.join(', ')}
                                >
                                  {track.provenanceCurators?.slice(0, 2).join(', ')}
                                  {track.provenanceCurators && track.provenanceCurators.length > 2 && ` +${track.provenanceCurators.length - 2}`}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-left">
                                <div className="text-[11px] text-slate-300 max-w-md line-clamp-2" title={track.reasoning}>
                                  {track.reasoning}
                                </div>
                                {track.transitionNote && (
                                  <div className="text-[10px] text-amber-300/90 font-mono mt-0.5 italic truncate max-w-md">
                                    ↳ Bridge: {track.transitionNote}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className="font-mono text-xs font-black text-rose-300 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                                  ★ {Math.round(track.confidenceScore * 100)}%
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                                <AudioPreviewButton title={track.title} artist={track.artist} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
