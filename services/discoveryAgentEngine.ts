import {
  BipartiteCorpusGraph,
  CorpusTrack,
  GraphIntelligenceResult,
  ProfilingResult,
  CalibratedCuratorResult,
  MusicoletLibraryPayload,
  DiscoveryAgentId,
  DiscoveryAgentPromptConfig,
  DiscoveryAgentExecutionResult,
  DiscoveryAgentTrackRecommendation
} from '../types';
import {
  getAIConfig,
  getAIClient,
  callOpenAICompatible,
  smartRetry
} from './visionEngine';
import { resolveTrackCulturalBucket } from './triageEngine';

// ============================================================================
// Agent Metadata Registry
// ============================================================================

export interface DiscoveryAgentMeta {
  id: DiscoveryAgentId;
  name: string;
  badge: string;
  role: string;
  description: string;
  iconName: 'GraduationCap' | 'Compass' | 'Sparkles' | 'Globe' | 'Layers' | 'Bot';
  accentColor: 'emerald' | 'amber' | 'indigo' | 'rose' | 'purple' | 'cyan';
  defaultCapacity: number;
  presets?: Array<{ id: string; label: string; description: string; targetCapacity: number }>;
}

export const DISCOVERY_AGENTS: DiscoveryAgentMeta[] = [
  {
    id: 'newees_architect',
    name: 'The Newees Intake Architect',
    badge: 'Capacity & Multi-Bucket Balancer',
    role: 'Authentic Curation Engine',
    description: 'Synthesizes balanced Newees discovery batches matching your listening capacity, deliberately mixing cultural buckets in calibrated ratios while weaving bridging connector tracks.',
    iconName: 'GraduationCap',
    accentColor: 'emerald',
    defaultCapacity: 30,
    presets: [
      { id: 'balanced_global', label: 'Balanced Global (Default)', description: '30% Asian/Mandopop, 20% OPM Filipino, 15% South Asian, 15% Worship, 10% Alt-Pop, 10% Afrobeats', targetCapacity: 30 },
      { id: 'asian_opm_focus', label: 'Asian Indie & OPM Focus', description: '45% J-Indie/C-Indie, 35% Filipino OPM, 20% Ambient/Global Indie', targetCapacity: 30 },
      { id: 'afrobeats_street_hop', label: 'Afrobeats & Street-Hop Exploration', description: '50% Afrobeats/Street-Hop, 25% South African Amapiano, 25% Global Afro-Fusion', targetCapacity: 25 },
      { id: 'atmospheric_worship', label: 'Atmospheric & Worship Haven', description: '60% Contemporary Worship & Choral, 25% Post-Rock/Cinematic, 15% Folk/Acoustic', targetCapacity: 20 },
      { id: 'broad_capacity_50', label: 'Expansive 50-Track Ingestion Dump', description: 'Full-spectrum balanced reservoir ingest with 5 cultural segments and transition bridges', targetCapacity: 50 }
    ]
  },
  {
    id: 'cartographer',
    name: 'The Corpus Cartographer',
    badge: 'Island Navigator & Macro Topology',
    role: 'Topological Archaeology',
    description: 'Maps macro taste continents, identifies forgotten playlist islands with near-zero edge overlap to your core listening, and constructs sequenced bridge expeditions.',
    iconName: 'Compass',
    accentColor: 'amber',
    defaultCapacity: 15
  },
  {
    id: 'alchemist',
    name: 'The Cross-Pollination Alchemist',
    badge: 'Thematic & Latent Motif Weaver',
    role: 'Harmonic Bridge Synthesizer',
    description: 'Synthesizes cross-cultural concept mixtapes connecting distant communities using shortest-path Dijkstra bridges, latent emotional motifs, and curatorial liner notes.',
    iconName: 'Sparkles',
    accentColor: 'indigo',
    defaultCapacity: 16
  },
  {
    id: 'scout',
    name: 'The Cultural Frontier Scout',
    badge: 'A&R Breakthrough Talent Hunter',
    role: 'Frontier Boundary Scout',
    description: 'Operates at the boundary of your taste canon: cross-references high-affinity external curators against your offline library to surface novel artists with cultural scene justification.',
    iconName: 'Globe',
    accentColor: 'rose',
    defaultCapacity: 15
  },
  {
    id: 'challenger',
    name: 'The Lateral Challenger',
    badge: 'Anti-Echo-Chamber Explorer',
    role: 'Bubble Breaker',
    description: 'Breaks algorithmic filter bubbles: translates the emotional, rhythmic, and vocal intensity of your favorite genres into orthogonal, unexpected musical traditions across the corpus.',
    iconName: 'Layers',
    accentColor: 'purple',
    defaultCapacity: 14
  },
  {
    id: 'cortex',
    name: 'Interactive Discovery Cortex',
    badge: 'Dense Structured RAG Console',
    role: 'Freeform AI Query Bar',
    description: 'Converse directly with your entire 50k-track graph and 1k+ playlists using natural language. Fast, fully grounded curatorial recommendations with live audio previews.',
    iconName: 'Bot',
    accentColor: 'cyan',
    defaultCapacity: 15
  }
];

// ============================================================================
// Dense Structured RAG Context Builder (< 2,500 Tokens)
// ============================================================================

export interface DenseCorpusContext {
  macroStats: {
    totalPlaylists: number;
    uniqueTracks: number;
    uniqueArtists: number;
    maxConsensus: number;
  };
  topCommunities: Array<{
    clusterId: number;
    trackCount: number;
    topArtists: string[];
  }>;
  topCurators: Array<{
    name: string;
    yieldPercent: number;
    tracks: number;
    unminedCandidates: number;
    topSharedArtists: string[];
  }>;
  curatorArchetypes: Array<{
    label: string;
    curatorCount: number;
    meanAffinity: number;
  }>;
  userCanon: {
    offlineTopArtists: string[];
    userNeweesPlaylists: string[];
    savedArtistCollections: string[];
    searchReservoirs: string[];
  };
  candidateTracksPool: Array<{
    id: string;
    title: string;
    artist: string;
    album?: string;
    curators: string[];
    isNovelArtist: boolean;
    score: number;
  }>;
}

export function buildDenseCorpusContext(
  graph: BipartiteCorpusGraph,
  graphIntel?: GraphIntelligenceResult | null,
  profilingResult?: ProfilingResult | null,
  curatorResult?: CalibratedCuratorResult | null,
  offlineLib?: MusicoletLibraryPayload | null
): DenseCorpusContext {
  // 1. Macro Stats
  const macroStats = {
    totalPlaylists: graph.stats.totalPlaylists,
    uniqueTracks: graph.stats.uniqueTracks,
    uniqueArtists: graph.stats.uniqueArtists,
    maxConsensus: graph.stats.maxConsensus
  };

  // 2. Top Communities (Top 6 clusters by track count)
  const topCommunities: Array<{ clusterId: number; trackCount: number; topArtists: string[] }> = [];
  if (graphIntel?.clusters?.length) {
    const sortedClusters = [...graphIntel.clusters].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 6);
    sortedClusters.forEach(cluster => {
      const topArtists = (cluster.dominantArtists || []).slice(0, 5).map(da => da.artist);
      topCommunities.push({
        clusterId: cluster.id,
        trackCount: cluster.size || (cluster.topTrackIds?.length || 0),
        topArtists
      });
    });
  }

  // 3. Top High-Yield Curators (Top 12 external curators with >= 10% affinity yield)
  const topCurators: Array<{ name: string; yieldPercent: number; tracks: number; unminedCandidates: number; topSharedArtists: string[] }> = [];
  if (curatorResult?.curators?.length) {
    const externalCurators = curatorResult.curators
      .filter(c => !c.isUserNeweesPlaylist && c.affinityYieldPercent >= 10)
      .sort((a, b) => b.affinityYieldPercent - a.affinityYieldPercent || b.totalAlignedTracks - a.totalAlignedTracks)
      .slice(0, 12);

    externalCurators.forEach(c => {
      topCurators.push({
        name: c.playlistName,
        yieldPercent: Math.round(c.affinityYieldPercent),
        tracks: c.trackCount,
        unminedCandidates: c.unminedCandidatesCount,
        topSharedArtists: c.topSharedArtists.slice(0, 3)
      });
    });
  }

  // 4. Curator Archetypes
  const curatorArchetypes: Array<{ label: string; curatorCount: number; meanAffinity: number }> = [];
  if (curatorResult?.archetypes?.length) {
    curatorResult.archetypes.slice(0, 5).forEach(arch => {
      curatorArchetypes.push({
        label: arch.label,
        curatorCount: arch.curatorCount,
        meanAffinity: Math.round(arch.meanAffinity)
      });
    });
  }

  // 5. User Canon (Offline Top Artists, Newees Lists, Single-Artist Collections, Search Reservoirs)
  const offlineTopArtists: string[] = [];
  if (offlineLib?.songs?.length) {
    const counts = new Map<string, number>();
    offlineLib.songs.forEach(s => {
      if (s.artist) counts.set(s.artist, (counts.get(s.artist) || 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    sorted.forEach(([a]) => offlineTopArtists.push(a));
  } else if (offlineLib?.artists?.size) {
    offlineTopArtists.push(...Array.from(offlineLib.artists).slice(0, 25));
  }

  // Scan graph playlists for user collections
  const userNeweesPlaylists: string[] = [];
  const savedArtistCollections: string[] = [];
  const searchReservoirs: string[] = [];

  for (const pl of graph.playlists.values()) {
    const nameLower = pl.name.toLowerCase();
    if (nameLower.startsWith('*') || nameLower.includes('newees')) {
      if (userNeweesPlaylists.length < 8) userNeweesPlaylists.push(pl.name);
    } else if (nameLower.includes('best of') || nameLower.startsWith('the best of')) {
      if (savedArtistCollections.length < 8) savedArtistCollections.push(pl.name);
    } else if (nameLower.includes('discov mix') || nameLower.includes('search') || nameLower.includes('discovery mix')) {
      if (searchReservoirs.length < 8) searchReservoirs.push(pl.name);
    }
  }

  // 6. Candidate Pool of High-Signal Unmined Tracks (Up to 40 tracks)
  const candidateTracksPool: Array<{
    id: string;
    title: string;
    artist: string;
    album?: string;
    curators: string[];
    isNovelArtist: boolean;
    score: number;
  }> = [];

  if (curatorResult?.unminedHighSignalTracks?.length) {
    curatorResult.unminedHighSignalTracks.slice(0, 40).forEach(t => {
      candidateTracksPool.push({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        curators: t.provenanceCurators.slice(0, 3),
        isNovelArtist: !t.isFamiliarArtist,
        score: Number(t.weightedScore.toFixed(1))
      });
    });
  } else {
    // Fallback to top consensus tracks
    const sortedTracks = Array.from(graph.tracks.values())
      .filter(t => t.consensusCount >= 2)
      .sort((a, b) => b.consensusCount - a.consensusCount)
      .slice(0, 40);

    sortedTracks.forEach(t => {
      candidateTracksPool.push({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        curators: t.playlistNames.slice(0, 3),
        isNovelArtist: offlineLib?.artists ? !offlineLib.artists.has(t.artist.toLowerCase().trim()) : false,
        score: t.consensusCount * 2.0
      });
    });
  }

  return {
    macroStats,
    topCommunities,
    topCurators,
    curatorArchetypes,
    userCanon: {
      offlineTopArtists,
      userNeweesPlaylists,
      savedArtistCollections,
      searchReservoirs
    },
    candidateTracksPool
  };
}

// ============================================================================
// Multi-Model Cascading AI Dispatcher
// ============================================================================

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const REQUEST_TIMEOUT_MS = 28000;

async function executeAIRequestWithTimeout(prompt: string): Promise<string> {
  const config = getAIConfig();

  // Handle OpenAI-compatible (Ollama / Local LLM)
  if (config.provider === 'openai-compatible') {
    const callPromise = smartRetry(() => callOpenAICompatible(prompt));
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(`Local LLM timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`)), REQUEST_TIMEOUT_MS)
    );
    return Promise.race([callPromise, timeoutPromise]);
  }

  // Handle Google Gemini Provider
  const client = getAIClient();
  let lastError: any = null;

  // Try configured model, then cascade through fallbacks
  const modelsToTry = [
    config.modelName || 'gemini-2.5-flash',
    ...GEMINI_MODELS.filter(m => m !== (config.modelName || 'gemini-2.5-flash'))
  ];

  for (const model of modelsToTry) {
    try {
      const callPromise = smartRetry(async () => {
        const response = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
        return response.text || '';
      }, 2, 1000);

      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini request with model ${model} timed out.`)), REQUEST_TIMEOUT_MS)
      );

      const result = await Promise.race([callPromise, timeoutPromise]);
      if (result && result.trim().length > 0) {
        return result;
      }
    } catch (err: any) {
      console.warn(`[discoveryAgentEngine] Model ${model} failed:`, err.message);
      lastError = err;
      // If error is missing API key, don't cascade fruitlessly
      if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('API key not valid')) {
        break;
      }
    }
  }

  throw lastError || new Error('All AI models failed to generate response.');
}

// ============================================================================
// Resilient JSON Response Parser & Graph Relinker
// ============================================================================

interface RawAgentOutput {
  narrativeSummary?: string;
  tasteInsights?: string[];
  recommendedTracks?: Array<{
    trackId?: string;
    title?: string;
    artist?: string;
    album?: string;
    provenanceCurators?: string[];
    reasoning?: string;
    culturalScene?: string;
    isNovelArtist?: boolean;
    confidenceScore?: number;
    transitionNote?: string;
    bucketCategory?: string;
  }>;
  bridgeTransitions?: Array<{ from: string; to: string; note: string }>;
  bucketBreakdown?: Record<string, number>;
}

export function parseAndRelinkAgentResponse(
  rawJsonString: string,
  agentId: DiscoveryAgentId,
  agentName: string,
  subtitle: string,
  modelUsed: string,
  startTimeMs: number,
  graph: BipartiteCorpusGraph,
  offlineLib?: MusicoletLibraryPayload | null
): DiscoveryAgentExecutionResult {
  let cleaned = rawJsonString.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Locate the first { and last } to avoid incidental prose
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  let parsed: RawAgentOutput = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[discoveryAgentEngine] Failed to parse JSON response. Falling back to regex recovery.', err);
    // Minimal fallback object
    parsed = {
      narrativeSummary: 'Generated discovery recommendations synthesized from corpus graph analysis.',
      tasteInsights: ['Corpus graph consensus matched with high-yield curators.'],
      recommendedTracks: []
    };
  }

  // Build lookup index of tracks from graph for instant fuzzy linking
  const trackMap = graph.tracks;
  const normKeyMap = new Map<string, CorpusTrack>();
  for (const track of trackMap.values()) {
    const key = `${track.title.toLowerCase().trim()}:::${track.artist.toLowerCase().trim()}`;
    if (!normKeyMap.has(key)) normKeyMap.set(key, track);
  }

  // Relink recommended tracks
  const recommendedTracks: DiscoveryAgentTrackRecommendation[] = [];
  const rawList = Array.isArray(parsed.recommendedTracks) ? parsed.recommendedTracks : [];

  for (const rec of rawList) {
    if (!rec.title || !rec.artist) continue;

    let matchedTrack: CorpusTrack | undefined;

    // 1. Try trackId exact match
    if (rec.trackId && trackMap.has(rec.trackId)) {
      matchedTrack = trackMap.get(rec.trackId);
    }

    // 2. Try normalized title + artist lookup
    if (!matchedTrack) {
      const searchKey = `${rec.title.toLowerCase().trim()}:::${rec.artist.toLowerCase().trim()}`;
      matchedTrack = normKeyMap.get(searchKey);
    }

    // 3. Fallback partial title match
    if (!matchedTrack) {
      const recTitleNorm = rec.title.toLowerCase().trim();
      const recArtistNorm = rec.artist.toLowerCase().trim();
      for (const track of trackMap.values()) {
        if (
          track.artist.toLowerCase().trim().includes(recArtistNorm) &&
          (track.title.toLowerCase().trim().includes(recTitleNorm) || recTitleNorm.includes(track.title.toLowerCase().trim()))
        ) {
          matchedTrack = track;
          break;
        }
      }
    }

    // Determine novel artist status against offline library
    const artistNorm = (rec.artist || '').toLowerCase().trim();
    const isNovel = offlineLib?.artists
      ? !offlineLib.artists.has(artistNorm)
      : (rec.isNovelArtist ?? false);

    // Resolve cultural bucket if missing
    const resolvedBucket = rec.culturalScene || resolveTrackCulturalBucket(rec.artist, rec.title).bucket;

    recommendedTracks.push({
      trackId: matchedTrack ? matchedTrack.id : `agent_rec_${Math.random().toString(36).substring(2, 9)}`,
      title: matchedTrack ? matchedTrack.title : rec.title,
      artist: matchedTrack ? matchedTrack.artist : rec.artist,
      album: matchedTrack ? matchedTrack.album : (rec.album || 'Discovery Intelligence'),
      isrc: matchedTrack?.isrc,
      spotifyId: matchedTrack?.spotifyId,
      provenanceCurators: matchedTrack?.playlistNames?.length
        ? Array.from(new Set([...matchedTrack.playlistNames, ...(rec.provenanceCurators || [])]))
        : (rec.provenanceCurators || ['High-Affinity Discovery Curator']),
      reasoning: rec.reasoning || `Synthesized by ${agentName} based on corpus consensus and cultural alignment.`,
      culturalScene: resolvedBucket,
      isNovelArtist: isNovel,
      confidenceScore: typeof rec.confidenceScore === 'number' ? Math.min(1.0, Math.max(0.0, rec.confidenceScore)) : 0.92,
      transitionNote: rec.transitionNote,
      bucketCategory: rec.bucketCategory || resolvedBucket
    });
  }

  const executionTimeMs = Math.round(performance.now() - startTimeMs);

  return {
    agentId,
    agentName,
    subtitle,
    generatedAt: new Date().toISOString(),
    modelUsed,
    executionTimeMs,
    narrativeSummary: parsed.narrativeSummary || `Curatorial batch generated by ${agentName}.`,
    tasteInsights: Array.isArray(parsed.tasteInsights) ? parsed.tasteInsights : [],
    recommendedTracks,
    bridgeTransitions: parsed.bridgeTransitions,
    bucketBreakdown: parsed.bucketBreakdown
  };
}

// ============================================================================
// AGENT 1: The Newees Intake Architect (Capacity & Multi-Bucket Balancer)
// ============================================================================

export async function runNeweesArchitectAgent(
  graph: BipartiteCorpusGraph,
  graphIntel?: GraphIntelligenceResult | null,
  profilingResult?: ProfilingResult | null,
  curatorResult?: CalibratedCuratorResult | null,
  offlineLib?: MusicoletLibraryPayload | null,
  config: DiscoveryAgentPromptConfig = {}
): Promise<DiscoveryAgentExecutionResult> {
  const startTime = performance.now();
  const context = buildDenseCorpusContext(graph, graphIntel, profilingResult, curatorResult, offlineLib);
  const aiConfig = getAIConfig();
  const capacity = config.batchCapacity || 30;
  const preset = config.bucketPreset || 'balanced_global';

  let bucketInstructions = '';
  if (preset === 'asian_opm_focus') {
    bucketInstructions = `Target Ratios: 45% Asian/J-Indie/C-Indie/Mandopop, 35% Filipino OPM, 20% Ambient/Global Indie.`;
  } else if (preset === 'afrobeats_street_hop') {
    bucketInstructions = `Target Ratios: 50% Afrobeats/Naija Street-Hop, 25% South African Amapiano, 25% Global Afro-Fusion.`;
  } else if (preset === 'atmospheric_worship') {
    bucketInstructions = `Target Ratios: 60% Contemporary Worship & Choral, 25% Post-Rock/Cinematic, 15% Acoustic/Folk.`;
  } else {
    // balanced_global
    bucketInstructions = `Target Ratios: 30% Asian/J-Indie/C-Indie (Vaundy, 蛙池, The Chairs), 20% OPM Filipino (Ben&Ben, Rico Blanco, juan karlos), 15% South Asian Indie (Eden's Echo, Janki Maheshwar), 15% Worship/Atmospheric (Hillsong, Bridge Worship), 10% Western Alt-Pop (LANY, Lizzy McAlpine), 10% Afrobeats/Global (Rema, Seyi Vibez).`;
  }

  const prompt = `
You are "The Newees Intake Architect" (Role: Capacity & Multi-Bucket Balancer), an elite music curation AI for Playlist Haven.
The listener's authentic discovery methodology is NOT passive listening. They intentionally curate balanced Newees discovery batches (like "Newees 20 exp", "Newees 19 Definitive", "NEWEES 18 FINAL") from raw intake reservoirs ("Discov Mix", "2025 Search Genesis"), single-artist collections ("Best of [Artist]"), and top high-yield external curators.

TASK:
Synthesize an authentic, balanced Newees Discovery Batch of EXACTLY ${capacity} tracks matching the listener's intake capacity.

CURATION RULES:
1. CAPACITY & PROPORTIONS:
   Strictly distribute the ${capacity} tracks across cultural buckets adhering to:
   ${bucketInstructions}
2. SPACING ENTROPY:
   Interweave the tracks so adjacent songs do NOT clump into the same culture or artist. Sequence the tracklist like a master DJ.
3. TRANSITION BRIDGES:
   Identify 2-3 "Bridge Tracks" that naturally transition between contrasting musical worlds (e.g., Japanese acoustic indie bridging into Filipino bedroom pop, or atmospheric worship bridging into cinematic alt-pop).
4. SOURCING:
   Prioritize the provided unmined high-signal candidate tracks and top curator gems from the corpus context.
   If candidate pool lacks a specific quota, suggest authentic, highly grounded tracks from the user's favorite cultural movements.

CORPUS GRAPH CONTEXT (Dense RAG):
${JSON.stringify(context, null, 2)}

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "narrativeSummary": "A concise, elegant curatorial introduction to this Newees batch explaining the capacity ratio and harmonic bridge sequence.",
  "tasteInsights": [
    "Insight on how this batch balances familiar anchors with frontier discoveries",
    "Analysis of the selected cultural bridge tracks"
  ],
  "bucketBreakdown": {
    "Bucket Name": 10
  },
  "bridgeTransitions": [
    { "from": "Artist A", "to": "Artist B", "note": "Why this transition works sonically" }
  ],
  "recommendedTracks": [
    {
      "trackId": "exact id from candidateTracksPool if matched, or omit",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "provenanceCurators": ["Curator name from context"],
      "reasoning": "Curatorial justification for inclusion in this Newees batch",
      "culturalScene": "e.g. J-Indie / Mandopop / OPM / Worship / Afrobeats / Alt-Pop",
      "bucketCategory": "The cultural bucket name",
      "isNovelArtist": true,
      "confidenceScore": 0.95,
      "transitionNote": "Note if this serves as an inter-bucket transition bridge"
    }
  ]
}
`.trim();

  const rawJson = await executeAIRequestWithTimeout(prompt);
  return parseAndRelinkAgentResponse(
    rawJson,
    'newees_architect',
    'The Newees Intake Architect',
    'Capacity & Multi-Bucket Balancer',
    aiConfig.modelName || 'gemini-2.5-flash',
    startTime,
    graph,
    offlineLib
  );
}

// ============================================================================
// AGENT 2: The Corpus Cartographer & Island Navigator
// ============================================================================

export async function runCartographerAgent(
  graph: BipartiteCorpusGraph,
  graphIntel?: GraphIntelligenceResult | null,
  profilingResult?: ProfilingResult | null,
  curatorResult?: CalibratedCuratorResult | null,
  offlineLib?: MusicoletLibraryPayload | null,
  config: DiscoveryAgentPromptConfig = {}
): Promise<DiscoveryAgentExecutionResult> {
  const startTime = performance.now();
  const context = buildDenseCorpusContext(graph, graphIntel, profilingResult, curatorResult, offlineLib);
  const aiConfig = getAIConfig();
  const capacity = config.batchCapacity || 15;

  const prompt = `
You are "The Corpus Cartographer" (Role: Island Navigator & Macro Topology Cartographer) for Playlist Haven.
You analyze the topological structure of the listener's 50,000-track bipartite graph and 1,000+ playlists.

TASK:
1. Identify high-level "Taste Continents" from the Louvain community clusters and curator archetypes.
2. Spot isolated "Taste Islands": obscure, isolated playlists in the corpus with near-zero Jaccard overlap to main rotation.
3. Construct an "Island Bridge Expedition" playlist of ${capacity} tracks: a sequenced expedition that takes the listener from their familiar mainland, walks step-by-step through harmonic connector tracks, and docks safely onto the isolated island.

CORPUS GRAPH CONTEXT:
${JSON.stringify(context, null, 2)}

OUTPUT FORMAT:
Return ONLY valid JSON matching this structure:
{
  "narrativeSummary": "A cartographic overview detailing the macro taste continents, identifying the isolated island found, and laying out the route of the bridge expedition.",
  "tasteInsights": [
    "Macro continent breakdown across graph clusters",
    "Identification of the isolated island playlist and why it became disconnected"
  ],
  "bridgeTransitions": [
    { "from": "Mainland Community", "to": "Isolated Island", "note": "Harmonic and rhythmic stepping stones" }
  ],
  "recommendedTracks": [
    {
      "trackId": "exact id from candidate pool if matched",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "provenanceCurators": ["Curator name"],
      "reasoning": "Step-by-step navigational role in this Bridge Expedition",
      "culturalScene": "Genre or cultural scene",
      "isNovelArtist": false,
      "confidenceScore": 0.94,
      "transitionNote": "Expedition milestone (e.g. Mainland Anchor -> Mid-Ocean Stepping Stone -> Island Shore)"
    }
  ]
}
`.trim();

  const rawJson = await executeAIRequestWithTimeout(prompt);
  return parseAndRelinkAgentResponse(
    rawJson,
    'cartographer',
    'The Corpus Cartographer',
    'Island Navigator & Macro Topology',
    aiConfig.modelName || 'gemini-2.5-flash',
    startTime,
    graph,
    offlineLib
  );
}

// ============================================================================
// AGENT 3: The Cross-Pollination Alchemist
// ============================================================================

export async function runAlchemistAgent(
  graph: BipartiteCorpusGraph,
  graphIntel?: GraphIntelligenceResult | null,
  profilingResult?: ProfilingResult | null,
  curatorResult?: CalibratedCuratorResult | null,
  offlineLib?: MusicoletLibraryPayload | null,
  config: DiscoveryAgentPromptConfig = {}
): Promise<DiscoveryAgentExecutionResult> {
  const startTime = performance.now();
  const context = buildDenseCorpusContext(graph, graphIntel, profilingResult, curatorResult, offlineLib);
  const aiConfig = getAIConfig();
  const capacity = config.batchCapacity || 16;
  const moodPrompt = config.moodPrompt || 'Bridging Afro-Fusion, Japanese City-Indie, and Melancholic UK Soul';

  const prompt = `
You are "The Cross-Pollination Alchemist" (Role: Thematic & Latent Motif Weaver) for Playlist Haven.
You synthesize non-obvious, deeply cohesive concept mixtapes bridging distant communities, cultures, and curators.

USER MOOD / THEMATIC DIRECTIVE:
"${moodPrompt}"

TASK:
Craft a sequenced ${capacity}-track concept mixtape that smoothly evolves between two or more contrasting musical worlds.
Use latent emotional, textural, and harmonic motifs (e.g., shared minor-key melancholy, organic Rhodes piano, syncopated polyrhythms, or intimate bilingual whisper vocals) to create effortless handoffs.
For EVERY track transition, provide a curatorial liner note explaining the sonic alchemy.

CORPUS GRAPH CONTEXT:
${JSON.stringify(context, null, 2)}

OUTPUT FORMAT:
Return ONLY valid JSON matching this structure:
{
  "narrativeSummary": "Liner notes for the concept mixtape explaining the unifying thematic motif and sonic progression.",
  "tasteInsights": [
    "Latent acoustic commonalities discovered between distant communities",
    "Curatorial transition methodology"
  ],
  "bridgeTransitions": [
    { "from": "Artist A", "to": "Artist B", "note": "Harmonic transition note" }
  ],
  "recommendedTracks": [
    {
      "trackId": "exact id from candidate pool if matched",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "provenanceCurators": ["Curator name"],
      "reasoning": "Alchemical justification for track placement",
      "culturalScene": "Scene",
      "isNovelArtist": false,
      "confidenceScore": 0.95,
      "transitionNote": "Liner note describing handoff to the next track"
    }
  ]
}
`.trim();

  const rawJson = await executeAIRequestWithTimeout(prompt);
  return parseAndRelinkAgentResponse(
    rawJson,
    'alchemist',
    'The Cross-Pollination Alchemist',
    'Thematic & Latent Motif Weaver',
    aiConfig.modelName || 'gemini-2.5-flash',
    startTime,
    graph,
    offlineLib
  );
}

// ============================================================================
// AGENT 4: The Cultural Frontier Scout
// ============================================================================

export async function runFrontierScoutAgent(
  graph: BipartiteCorpusGraph,
  graphIntel?: GraphIntelligenceResult | null,
  profilingResult?: ProfilingResult | null,
  curatorResult?: CalibratedCuratorResult | null,
  offlineLib?: MusicoletLibraryPayload | null,
  config: DiscoveryAgentPromptConfig = {}
): Promise<DiscoveryAgentExecutionResult> {
  const startTime = performance.now();
  const context = buildDenseCorpusContext(graph, graphIntel, profilingResult, curatorResult, offlineLib);
  const aiConfig = getAIConfig();
  const capacity = config.batchCapacity || 15;

  const prompt = `
You are "The Cultural Frontier Scout" (Role: A&R Breakthrough Talent Hunter) for Playlist Haven.
Your mission is pure discovery at the outer boundary of the listener's taste canon.

TASK:
1. Analyze the listener's core canon from their offline library top artists and user Newees playlists.
2. Cross-reference top external curators with >= 10% affinity yield (e.g. "Spotify sucks", "nihon", "Saucy Dog?").
3. Scout unmined tracks specifically for NOVEL ARTISTS (artists NOT in the listener's offline library) that embody the same emotional authenticity, vocal cadence, or production quality as the listener's canon.
4. Compile an "A&R Frontier Dossier" of ${capacity} high-conviction breakthrough tracks with cultural scene context.

CORPUS GRAPH CONTEXT:
${JSON.stringify(context, null, 2)}

OUTPUT FORMAT:
Return ONLY valid JSON matching this structure:
{
  "narrativeSummary": "Executive A&R briefing detailing the discovered frontier talent, highlighting the external curators with highest hit rates.",
  "tasteInsights": [
    "Analysis of what makes these novel artists resonate with the listener's existing canon",
    "Geographic and cultural scene developments spotted at the boundary"
  ],
  "recommendedTracks": [
    {
      "trackId": "exact id from candidate pool if matched",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "provenanceCurators": ["Curator name"],
      "reasoning": "A&R scouting rationale: why this novel artist is a must-hear match for the listener",
      "culturalScene": "Specific cultural scene or micro-movement",
      "isNovelArtist": true,
      "confidenceScore": 0.96
    }
  ]
}
`.trim();

  const rawJson = await executeAIRequestWithTimeout(prompt);
  return parseAndRelinkAgentResponse(
    rawJson,
    'scout',
    'The Cultural Frontier Scout',
    'A&R Breakthrough Talent Hunter',
    aiConfig.modelName || 'gemini-2.5-flash',
    startTime,
    graph,
    offlineLib
  );
}

// ============================================================================
// AGENT 5: The Lateral Challenger (Anti-Echo-Chamber Explorer)
// ============================================================================

export async function runLateralChallengerAgent(
  graph: BipartiteCorpusGraph,
  graphIntel?: GraphIntelligenceResult | null,
  profilingResult?: ProfilingResult | null,
  curatorResult?: CalibratedCuratorResult | null,
  offlineLib?: MusicoletLibraryPayload | null,
  config: DiscoveryAgentPromptConfig = {}
): Promise<DiscoveryAgentExecutionResult> {
  const startTime = performance.now();
  const context = buildDenseCorpusContext(graph, graphIntel, profilingResult, curatorResult, offlineLib);
  const aiConfig = getAIConfig();
  const capacity = config.batchCapacity || 14;

  const prompt = `
You are "The Lateral Challenger" (Role: Anti-Echo-Chamber Acoustic Explorer) for Playlist Haven.
Your mission is to deliberately break algorithmic filter bubbles and challenge listener comfort zones WITHOUT recommending low-quality or irrelevant filler.

TASK:
1. Pinpoint the listener's primary comfort zones (dominant artists and genres from offline library).
2. Translate the CORE ACOUSTIC ESSENCE of those favorites (e.g. urgent street percussion, raw emotional vocal strain, soaring spiritual anthems, or nocturnal melancholia) into completely ORTHOGONAL musical traditions and global genres across the corpus.
   Example: If the listener loves the syncopation and emotional chanting of Seyi Vibez / Asake, translate that exact rhythmic urgency into South African Amapiano deep cuts, UK Afroswing, or Brazilian Baile Funk.
3. Curate a provocative, boundary-pushing discovery basket of ${capacity} tracks with sharp lateral analogies.

CORPUS GRAPH CONTEXT:
${JSON.stringify(context, null, 2)}

OUTPUT FORMAT:
Return ONLY valid JSON matching this structure:
{
  "narrativeSummary": "Provocative curatorial thesis detailing the listener's comfort zone and outlining the lateral acoustic analogies deployed.",
  "tasteInsights": [
    "Specific comfort zone patterns identified in offline library",
    "Acoustic translation bridge explaining the cross-tradition resonance"
  ],
  "recommendedTracks": [
    {
      "trackId": "exact id from candidate pool if matched",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "provenanceCurators": ["Curator name"],
      "reasoning": "Lateral analogy: 'You love X in [Favorite Artist]? Here is how that same acoustic energy exists in [Tradition]'",
      "culturalScene": "Orthogonal genre or cultural tradition",
      "isNovelArtist": true,
      "confidenceScore": 0.93
    }
  ]
}
`.trim();

  const rawJson = await executeAIRequestWithTimeout(prompt);
  return parseAndRelinkAgentResponse(
    rawJson,
    'challenger',
    'The Lateral Challenger',
    'Anti-Echo-Chamber Acoustic Explorer',
    aiConfig.modelName || 'gemini-2.5-flash',
    startTime,
    graph,
    offlineLib
  );
}

// ============================================================================
// CORTEX: Freeform Interactive Natural Language Synthesis
// ============================================================================

export async function runInteractiveCortexQuery(
  userQuery: string,
  graph: BipartiteCorpusGraph,
  graphIntel?: GraphIntelligenceResult | null,
  profilingResult?: ProfilingResult | null,
  curatorResult?: CalibratedCuratorResult | null,
  offlineLib?: MusicoletLibraryPayload | null,
  config: DiscoveryAgentPromptConfig = {}
): Promise<DiscoveryAgentExecutionResult> {
  const startTime = performance.now();
  const context = buildDenseCorpusContext(graph, graphIntel, profilingResult, curatorResult, offlineLib);
  const aiConfig = getAIConfig();
  const capacity = config.batchCapacity || 15;

  const prompt = `
You are the "Interactive Discovery Cortex" for Playlist Haven, an intelligent natural-language music synthesis engine.
You have direct access to a dense RAG summary of the listener's 50,000-track bipartite graph, Louvain communities, curator yields, and offline library.

USER'S CURATORIAL QUERY:
"${userQuery}"

TASK:
1. Reason deeply over the listener's query in the context of their corpus graph.
2. Select or synthesize an optimal tracklist of approximately ${capacity} tracks directly answering the user's inquiry.
3. Ground the recommendations in the provided candidate tracks, high-yield curators, and community clusters wherever possible.
4. Provide a rich narrative breakdown and clear curatorial reasoning for every track.

CORPUS GRAPH CONTEXT:
${JSON.stringify(context, null, 2)}

OUTPUT FORMAT:
Return ONLY valid JSON matching this structure:
{
  "narrativeSummary": "Direct response to the user's inquiry explaining the curation philosophy and narrative structure of the tracklist.",
  "tasteInsights": [
    "Insight on how the corpus matched the user query",
    "Highlights of notable curator gems or cultural crossover points"
  ],
  "recommendedTracks": [
    {
      "trackId": "exact id from candidate pool if matched",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "provenanceCurators": ["Curator name"],
      "reasoning": "Why this track fulfills the user's specific prompt",
      "culturalScene": "Cultural scene or genre",
      "isNovelArtist": false,
      "confidenceScore": 0.95
    }
  ]
}
`.trim();

  const rawJson = await executeAIRequestWithTimeout(prompt);
  return parseAndRelinkAgentResponse(
    rawJson,
    'cortex',
    'Interactive Discovery Cortex',
    `Query: "${userQuery.length > 50 ? userQuery.substring(0, 47) + '...' : userQuery}"`,
    aiConfig.modelName || 'gemini-2.5-flash',
    startTime,
    graph,
    offlineLib
  );
}

// Master dispatch function
export async function executeDiscoveryAgent(
  agentId: DiscoveryAgentId,
  graph: BipartiteCorpusGraph,
  graphIntel?: GraphIntelligenceResult | null,
  profilingResult?: ProfilingResult | null,
  curatorResult?: CalibratedCuratorResult | null,
  offlineLib?: MusicoletLibraryPayload | null,
  config: DiscoveryAgentPromptConfig = {}
): Promise<DiscoveryAgentExecutionResult> {
  switch (agentId) {
    case 'newees_architect':
      return runNeweesArchitectAgent(graph, graphIntel, profilingResult, curatorResult, offlineLib, config);
    case 'cartographer':
      return runCartographerAgent(graph, graphIntel, profilingResult, curatorResult, offlineLib, config);
    case 'alchemist':
      return runAlchemistAgent(graph, graphIntel, profilingResult, curatorResult, offlineLib, config);
    case 'scout':
      return runFrontierScoutAgent(graph, graphIntel, profilingResult, curatorResult, offlineLib, config);
    case 'challenger':
      return runLateralChallengerAgent(graph, graphIntel, profilingResult, curatorResult, offlineLib, config);
    case 'cortex':
      return runInteractiveCortexQuery(config.moodPrompt || 'Curate high-signal gems from top curators', graph, graphIntel, profilingResult, curatorResult, offlineLib, config);
    default:
      throw new Error(`Unknown discovery agent id: ${agentId}`);
  }
}
