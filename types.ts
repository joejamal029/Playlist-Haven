export interface ProcessedTrack {
  path: string;
  metadata: string; // The #EXTINF line
  score: number;
}

export interface ProcessingLog {
  timestamp: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
}

export interface SieveFile {
  fileName: string;
  content: string;
  count: number;
  score: number;
}

export interface SieveResult {
  files: SieveFile[];
  logs?: ProcessingLog[];
  success: boolean;
}

export interface FileGroup {
  tiers: File[];
  penalties: File[];
  anchor: File | null;
}

// ==============================================================================
// Module 20: Discovery Intelligence Layer Shared Types (Phase 0)
// ==============================================================================

export interface RawSpotifyCsvRow {
  trackName: string;
  artistName: string;
  album: string;
  playlistName: string;
  type: string;
  isrc: string;
  spotifyId: string;
  sourceFileName?: string;
  rowNumber?: number;
}

export interface CorpusPlaylist {
  id: string;               // Composite key: "${encodeURIComponent(name)}:::${encodeURIComponent(sourceFileName)}"
  name: string;             // Clean display name (e.g. "🎵• Lyn Lapid 🩵.3")
  type: string;             // Row type (e.g. "Playlist", "Album")
  sourceFileName: string;   // Provenance file
  trackIds: string[];       // Deduplicated track IDs belonging to this playlist
  trackCount: number;
}

export interface CorpusTrack {
  id: string;               // Stable unique identifier (deterministic ID)
  trackId?: string;         // Alias for id
  title: string;
  artist: string;
  album: string;
  type?: string;            // Track type or category
  culturalBucket?: string;  // Regional/cultural classification
  playlistName?: string;    // Display playlist name
  playlistId?: string;      // Associated playlist id
  isrc: string;             // Primary ISRC (if present)
  spotifyId: string;        // Primary Spotify ID (if present)
  isrcs: string[];          // All associated ISRCs from merged instances
  spotifyIds: string[];     // All associated Spotify IDs from merged instances
  playlistIds: string[];    // Composite playlist IDs containing this track
  playlistNames: string[];  // Human-readable playlist names (graph inversion)
  consensusCount: number;   // Number of distinct playlists containing this track
  possibleDuplicate?: boolean; // Flagged if ISRC matches across tracks but Spotify IDs differ
  firstSeenIndex: number;
}

export interface BipartiteCorpusGraph {
  playlists: Map<string, CorpusPlaylist>;
  tracks: Map<string, CorpusTrack>;
  artistToTrackIds: Map<string, string[]>;
  stats: CorpusStats;
  config: CorpusConfig;
  rawRowsCount: number;
}

export interface CorpusConfig {
  excludedTypes: string[];  // Normalized lowercase excluded types (defaults to ['favorite', 'artist'])
  customTypeToggles: Record<string, boolean>; // Dynamic toggle state per discovered type
}

export interface CorpusStats {
  totalTracksRaw: number;
  totalTracksFiltered: number;
  uniqueTracks: number;
  totalPlaylists: number;
  uniqueArtists: number;
  uniqueAlbums: number;
  maxConsensus: number;
  consensusHistogram: Record<number, number>; // k -> trackCount
  uniqueTypes: { type: string; count: number; enabled: boolean }[];
  importedFiles: string[];
}

// ==============================================================================
// Module 20: Discovery Intelligence Layer Shared Types (Phase 2 - Graph Intelligence)
// ==============================================================================

export interface JaccardPair {
  playlistAId: string;
  playlistAName: string;
  playlistBId: string;
  playlistBName: string;
  sharedTracks: number;
  jaccardIndex: number; // |A ∩ B| / |A ∪ B|
}

export interface CommunityCluster {
  id: number;
  label: string;
  size: number;
  artistCount: number;
  dominantArtists: { artist: string; count: number }[];
  dominantPlaylists: { playlistName: string; count: number }[];
  topTrackIds: string[];
}

export interface ArtistConstellationNode {
  artist: string;
  trackCount: number;
  playlistCount: number;
  degree: number; // number of connected distinct artists
  totalCoOccurrence: number; // sum of edge weights
  topConnected: { artist: string; weight: number }[];
  communityId?: number;
}

export interface ArtistBridgeHop {
  fromArtist: string;
  toArtist: string;
  sharedPlaylists: string[];
  representativeTrackTitles: string[];
}

export interface ArtistBridgePath {
  sourceArtist: string;
  targetArtist: string;
  path: string[]; // sequence: [source, hop1, ..., target]
  hops: number;
  bridgeHops: ArtistBridgeHop[];
}

export interface BlindSpotArtist {
  artist: string;
  corpusTrackCount: number;
  corpusPlaylistCount: number;
  coOccurrenceWeight: number; // Connectivity to user's top/favorite artists
  offlineTrackCount: number;  // 0 for true blind spot
  score: number;              // Calculated priority score
  topPlaylists: string[];
  sampleTracks: string[];
}

export interface GraphIntelligenceResult {
  timestamp: number;
  jaccardPairs: JaccardPair[];
  clusters: CommunityCluster[];
  artistNodes: ArtistConstellationNode[];
  trackToCommunity: Record<string, number>;
  artistToCommunity: Record<string, number>;
  blindSpots?: BlindSpotArtist[];
}

// ==============================================================================
// Module 20: Discovery Intelligence Layer Shared Types (Phase 3 - Profiling & Archaeology)
// ==============================================================================

export interface PlaylistDNA {
  playlistId: string;
  playlistName: string;
  sourceFileName: string;
  trackCount: number;
  uniqueArtistsCount: number;

  // Diversity & Entropy
  artistDiversityEntropy: number; // Shannon entropy: -sum(p * ln(p))
  normalizedDiversity: number;    // Entropy normalized to [0, 1] range: H / ln(N)
  artistToTrackRatio: number;     // uniqueArtists / trackCount

  // Consensus profile
  meanConsensus: number;
  medianConsensus: number;
  maxConsensus: number;
  stapleTrackRatio: number;       // % of tracks appearing in >= 2 playlists (core library)
  exclusiveTrackRatio: number;    // % of tracks appearing only in this playlist (deep cuts)

  // Community distribution (from Phase 2 Louvain)
  dominantCommunityId: number;
  dominantCommunityLabel: string;
  communityDistribution: { communityId: number; label: string; proportion: number; count: number }[];

  // Cultural bucket distribution (from M13 Language Classification)
  dominantCulturalBucket: string;
  culturalDistribution: { bucket: string; proportion: number; count: number }[];
}

export interface TasteZoneCoverage {
  communityId: number;
  communityLabel: string;
  playlistCount: number;
  trackCount: number;
  playlistShare: number; // proportion of all playlists
  trackShare: number;    // proportion of all tracks
  densityClassification: 'dense' | 'moderate' | 'sparse' | 'void';
  dominantArtists: string[];
}

export interface IsolatedIslandPlaylist {
  playlistId: string;
  playlistName: string;
  trackCount: number;
  maxJaccardOverlap: number;
  isolatedReason: string;
}

export interface CuratorialInsight {
  type: 'concentration' | 'blind_spot' | 'island' | 'opportunity';
  title: string;
  description: string;
  recommendedAction?: string;
}

export interface GapAnalysisReport {
  timestamp: number;
  totalPlaylistsAnalyzed: number;
  denseZones: TasteZoneCoverage[];
  moderateZones: TasteZoneCoverage[];
  sparseZones: TasteZoneCoverage[];
  voidZones: TasteZoneCoverage[];
  isolatedIslandPlaylists: IsolatedIslandPlaylist[];
  curatorialInsights: CuratorialInsight[];
}

export interface SmartMergeSuggestion {
  pairId: string;
  playlistAId: string;
  playlistAName: string;
  playlistBId: string;
  playlistBName: string;
  jaccardIndex: number;
  sharedTracksCount: number;
  uniqueToACount: number;
  uniqueToBCount: number;
  totalUnionTracksCount: number;
  redundancyScore: number; // percentage overlap
  suggestedMergedName: string;
  reasoning: string;
}

export interface TemporalArchaeologyInsight {
  hasTimestampData: boolean;
  timestampColumnDetected?: string;
  earliestDate?: string;
  latestDate?: string;
  discoveryWaves: { period: string; newPlaylistsCount: number; newTracksCount: number }[];
  genreMigrations: { period: string; dominantCommunity: string; dominantBucket: string }[];
  dormantTreasures: {
    playlistId: string;
    playlistName: string;
    lastAddedDate: string;
    trackCount: number;
    freshnessScore: number; // 0 to 100 based on age & lack of modification
  }[];
}

export interface OfflineOrphanTrack {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  consensusCount: number;
  sourcePlaylists: string[];
  isrc: string;
  spotifyId: string;
}

export interface OrphanedFlagshipArtist {
  artist: string;
  corpusTrackCount: number;
  corpusPlaylists: string[];
  topSampleTracks: string[];
}

export interface OfflineOrphanReport {
  timestamp: number;
  totalCorpusTracks: number;
  offlineTracksCount: number;
  totalOrphanTracksCount: number;
  highConsensusOrphans: OfflineOrphanTrack[]; // consensus >= 2
  orphanedArtists: OrphanedFlagshipArtist[];
  reservoirToCanonRatio: number; // (corpus unique tracks) / (offline unique tracks)
}

export interface ProfilingResult {
  timestamp: number;
  playlistDnas: Record<string, PlaylistDNA>; // keyed by playlistId
  gapAnalysis: GapAnalysisReport;
  smartMergeSuggestions: SmartMergeSuggestion[];
  temporalArchaeology: TemporalArchaeologyInsight;
  offlineOrphans?: OfflineOrphanReport;
}

// ==========================================
// Module 20: Phase 4 — Recipe Engine Interfaces
// ==========================================

export type RecipeCategory =
  | 'consensus_sieves'
  | 'curator_bridge'
  | 'daeso_pipeline'
  | 'cultural_rebalancing'
  | 'offline_gap'
  | 'offline_reconciliation';

export type RecipeParamType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'playlist_select'
  | 'artist_select';

export interface RecipeParamOption {
  value: string;
  label: string;
}

export interface RecipeParamDefinition {
  key: string;
  label: string;
  description: string;
  type: RecipeParamType;
  defaultValue: any;
  min?: number;
  max?: number;
  step?: number;
  options?: RecipeParamOption[];
}

export interface RecipeStep {
  stage:
    | 'filter'
    | 'intersect'
    | 'bridge'
    | 'subtract'
    | 'cluster'
    | 'prune'
    | 'split'
    | 'rebalance'
    | 'randomize'
    | 'format';
  module: string; // e.g. 'M20 Consensus', 'M13 Language', 'M4 Pruner', 'M10 Randomizer', 'M8 Reconciler', 'M7 Splitter', 'M1 Sieve'
  description: string;
  inputTrackCount?: number;
  outputTrackCount?: number;
}

export interface DiscoveryRecipe {
  id: string;
  category: RecipeCategory;
  name: string;
  description: string;
  promptExample: string;
  iconName: string;
  accentColor: string; // 'rose' | 'sky' | 'emerald' | 'amber' | 'purple' | 'indigo'
  parameters: RecipeParamDefinition[];
  stepsSummary: string[];
  requiresOfflineLibrary?: boolean;
  requiresGraphIntelligence?: boolean;
  requiresAcousticData?: boolean;
}

export interface RecipeExecutionStepLog {
  stage: string;
  module: string;
  description: string;
  inputCount: number;
  outputCount: number;
  durationMs: number;
}

export interface RecipeExecutionResult {
  recipeId: string;
  recipeName: string;
  executedAt: number;
  durationMs: number;
  tracks: CorpusTrack[];
  stepLogs: RecipeExecutionStepLog[];
  appliedParams: Record<string, any>;
  summary: string;
  subtractionsCount?: number;
  balancedBuckets?: Record<string, number>;
  bridgePath?: string[];
}

export type DownstreamModuleTarget =
  | 'm14_triage'
  | 'triage'
  | 'm13_clustering'
  | 'clustering'
  | 'm4_pruner'
  | 'pruner'
  | 'm10_randomizer'
  | 'randomizer'
  | 'm7_splitter'
  | 'splitter'
  | 'm18_audimote'
  | 'audimote'
  | 'm1_sieve'
  | 'sieve'
  | 'm3_manipulator'
  | 'manipulator'
  | 'standard_csv'
  | 'csv'
  | 'm3u'
  | 'tsv';

// ============================================================================
// Phase 5: Curator Intelligence & Calibrated Discovery Types
// ============================================================================

export type CuratorTrustTier = 'editorial' | 'standard' | 'low_signal';

export interface OfflineSongRecord {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  duration?: number;
  playCount?: number;
  normKey: string; // `${normArtist}:::${normTitle}`
}

export interface MusicoletLibraryPayload {
  artists: Set<string>;
  trackKeys: Set<string>; // normArtist:::normTitle
  songs: OfflineSongRecord[];
}

export interface CuratorAffinityProfile {
  playlistId: string;
  playlistName: string;
  trackCount: number;
  trustTier: CuratorTrustTier;
  trustMultiplier: number; // editorial: 1.5, standard: 1.0, low_signal: 0.5
  
  // Real personal alignment metrics
  neweesOverlapCount: number;        // Tracks that appear in your * Newees playlists
  offlineSongOverlapCount: number;   // Exact tracks in your Musicolet offline library
  offlineArtistOverlapCount: number; // Tracks by artists in your Musicolet library
  totalAlignedTracks: number;        // Unique union of (Newees ∪ Offline Songs)
  affinityYieldPercent: number;      // (totalAlignedTracks / trackCount) * 100%
  
  isUserNeweesPlaylist: boolean;     // True if this is one of your * Newees lists
  unminedCandidatesCount: number;    // Tracks in this list NOT in Newees and NOT in offline library
  topSharedArtists: string[];
}

export interface CuratorArchetypeCluster {
  clusterId: number;
  label: string;
  curatorCount: number;
  playlistNames: string[];
  meanAffinity: number;
}

export interface CalibratedCuratorCandidateTrack extends CorpusTrack {
  isFamiliarArtist: boolean;
  provenanceCurators: string[];
  weightedScore: number;
}

export interface CalibratedCuratorResult {
  curators: CuratorAffinityProfile[];
  topAffinityCurators: CuratorAffinityProfile[];
  archetypes: CuratorArchetypeCluster[];
  unminedHighSignalTracks: CalibratedCuratorCandidateTrack[];
  stats: {
    totalPlaylists: number;
    neweesPlaylistsCount: number;
    neweesUniqueTracksCount: number;
    offlineSongsMatched: number;
    offlineArtistsMatched: number;
    highAffinityCuratorsCount: number;
  };
}

// ============================================================================
// Phase 6: Discovery Agent Personas & Synthesis Cortex Types
// ============================================================================

export type DiscoveryAgentId =
  | 'newees_architect'
  | 'cartographer'
  | 'alchemist'
  | 'scout'
  | 'challenger'
  | 'cortex';

export interface DiscoveryAgentBucketConfig {
  bucketName: string;
  targetPercent: number; // e.g. 30 for 30%
}

export interface DiscoveryAgentPromptConfig {
  batchCapacity?: number; // 20, 30, 40, 50 (default 30)
  bucketPreset?: 'balanced_global' | 'asian_opm_focus' | 'afrobeats_street_hop' | 'atmospheric_worship' | 'custom';
  customBuckets?: DiscoveryAgentBucketConfig[];
  includeUnminedCurators?: boolean;
  includeBestOfCollections?: boolean;
  includeSearchReservoirs?: boolean; // e.g. Discov Mix, Search genesis
  sourceCommunityId?: number;
  targetCommunityId?: number;
  moodPrompt?: string;
  discoveryTemperature?: number; // 0.2 (conservative) to 1.0 (exploratory)
}

export interface DiscoveryAgentTrackRecommendation {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  isrc?: string;
  spotifyId?: string;
  provenanceCurators: string[];
  reasoning: string;
  culturalScene?: string;
  isNovelArtist: boolean;
  confidenceScore: number; // 0.0 - 1.0
  transitionNote?: string; // For Alchemist / Bridge expeditions
  bucketCategory?: string; // For Newees Architect (e.g. "Asian Indie", "Worship", etc.)
}

export interface DiscoveryAgentExecutionResult {
  agentId: DiscoveryAgentId;
  agentName: string;
  subtitle: string;
  generatedAt: string;
  modelUsed: string;
  executionTimeMs: number;
  narrativeSummary: string;
  tasteInsights: string[];
  recommendedTracks: DiscoveryAgentTrackRecommendation[];
  bridgeTransitions?: Array<{ from: string; to: string; note: string }>;
  bucketBreakdown?: Record<string, number>;
  rawTokensUsed?: number;
}

// ============================================================================
// Phase 7: Visualization, Infinite Constellation & Wander Odyssey Types
// ============================================================================

export type ConstellationLensMode = 'galaxy' | 'world_map' | 'artists' | 'wander' | 'mood';

export interface ConstellationCelestialNode {
  id: string; // Playlist composite ID
  name: string;
  communityId: number;
  color: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius: number;
  trackCount: number;
  culturalBucket?: string;
  isCurator?: boolean;
  curatorAffinity?: number;
  topArtists: string[];
}

export interface ConstellationCelestialEdge {
  sourceId: string;
  targetId: string;
  weight: number; // Jaccard similarity (0.0 to 1.0)
  isBeam?: boolean; // Highlighted inversion beam
}

export interface WorldAtlasHotspot {
  bucketId: string;
  label: string;
  regionName: string;
  x: number; // 0-1000 SVG Mercator coordinate
  y: number; // 0-500 SVG Mercator coordinate
  trackCount: number;
  playlistCount: number;
  topArtists: string[];
  sampleTracks: Array<{
    id: string;
    title: string;
    artist: string;
    album?: string;
    spotifyId?: string;
  }>;
  color: string;
  affinityScore?: number;
}

export interface WanderOdysseyStep {
  stepIndex: number;
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  spotifyId?: string;
  isrc?: string;
  playlistName: string;
  communityId?: number;
  culturalBucket?: string;
  valence?: number;
  arousal?: number;
  transitionRationale: string;
}

export interface AcousticMoodPoint {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  playlistName?: string;
  valence: number; // 0.0 to 1.0 (horizontal axis: negative to positive)
  arousal: number; // 0.0 to 1.0 (vertical axis: calm to energetic)
  energy: number;
  danceability?: number;
  bpm?: number;
  camelot?: string;
  quadrant: 'exuberant' | 'intense' | 'serene' | 'melancholic';
  spotifyId?: string;
  isrc?: string;
}




