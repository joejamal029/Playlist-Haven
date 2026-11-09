# Discovery Intelligence Layer — Novel Concepts

Oct 1, 2026 · Updated to reflect 19-module production architecture + Module 20 vision

Approaches the user's saved albums and playlists corpus from a structural intelligence angle: not "which existing module executes this," but "what latent structure does the corpus itself contain." Every concept here is a Module 20 deliverable organized by implementation phase.

## 1. Graph theory & structural intelligence (Phase 2)

The corpus is a **bipartite graph** (Playlists ↔ Tracks), and these are the specific graph-theoretic operations Module 20 computes on it:

| Operation | What it computes | Distinct from existing modules | Phase |
|:---|:---|:---|:---:|
| **Graph inversion** | Track → Contexts: for any track, list every playlist narrative that led to it | The Appearance Counter (M5) gives a *score*; inversion gives the *provenance list* itself — the actual playlist names, for display | 1 |
| **Jaccard similarity / bipartite projection** | Playlist-to-playlist and artist-to-artist similarity matrices derived from shared-track overlap | Distinct from track-level fuzzy matching (Jaro-Winkler in M4) — operates one level up, on whole playlists/artists | 2 |
| **Louvain community detection** | Unsupervised cluster discovery on the co-occurrence graph | Produces *emergent* taste clusters instead of the pre-defined 20 cultural buckets from M13 — could reveal a taxonomy that disagrees with the cultural classification. This is a **genre/mood axis**; M13 is a **cultural/linguistic axis** | 2 |
| **Shortest-path / bridge queries** | "Find the 3-song bridge connecting Mac Miller's jazzy hip-hop to Lyn Lapid's bedroom pop" — BFS/Dijkstra on the artist constellation graph | Computes the path algorithmically from the graph itself, not hand-curated | 2 |
| **Artist Constellation graph** | Nodes = artists, edges = co-occurrence-in-playlist weight | Supports "artists most connected to Wizkid," Bridge Artists (connecting two separate clusters), and the **Blind Spot Finder** (artists deeply connected to your favorites whom you've never actually played — requires Musicolet Songs.csv comparison) | 2 |
| **Curator archetype clustering** | Content-overlap clustering across playlists to surface implicit "curator fingerprints" — taste-sources you gravitate to without ever naming them | Different from Curator Trust Weighting (Phase 5), which lets you *rate* curators; this *discovers* the groupings first, with no identity needed | 5 |
| **Corpus-native genre taxonomy** | A taxonomy built from co-occurrence patterns rather than trusting playlist titles or Spotify's genre labels | Complements M13's 20-bucket Language Clustering: this is a genre/mood axis, clustering is a cultural/linguistic axis | 2 |

**Implementation notes:**
- Jaccard computed as **sparse matrix** — skip pairs sharing zero tracks. For 1,000+ playlists, only ~10-20% of pairs have actual overlap.
- Louvain implemented on the **artist-level projection** first (smaller graph, faster convergence). Node ordering seeded deterministically (alphabetical by ID) for stable cluster assignments.
- All heavy graph computation runs in `workers/discoveryGraph.worker.ts` (Web Worker) to avoid blocking the UI.
- Results cached in `DiscoveryCorpusDB` (IndexedDB) — never recomputed on every view mount.

## 2. Playlist & track profiling (Phase 3)

**Playlist DNA Fingerprinting** — each playlist gets an identity vector computed from the aggregate of its tracks:

| DNA Dimension | Source | Available since |
|:---|:---|:---|
| Community cluster distribution | Louvain (Phase 2) | Phase 3 |
| 20-bucket cultural distribution | M13 Language Clustering data (if available) | Phase 3 |
| Artist diversity index (Shannon entropy) | Corpus graph | Phase 3 |
| Consensus-weight profile (mean, max, median) | Consensus matrix (Phase 1) | Phase 3 |
| Acoustic profile (tempo/energy/danceability/valence) | **M18 Audimote** (Essentia.js Wasm) — resolved via IndexedDB `PlaylistHavenMetadataDB` | Phase 3/7 |
| Era distribution (release decade) | **M15 Deep Enrichment** metadata (if enriched) | Phase 3 |

> **Feasibility update (resolved):** The original drafts flagged audio-feature profiling as blocked because Spotify's audio-features API was dead. This is now **resolved**: Module 18 (Audimote) computes BPM, key, energy, danceability, and valence/arousal 100% client-side via Essentia.js Wasm on Apple iTunes 30s previews. If the user has run Audimote analysis on corpus tracks, that data is available in `PlaylistHavenMetadataDB` v4 for Playlist DNA computation. If not, the acoustic dimension is gracefully omitted — not errored.

Playlist DNA unlocks:

- **Playlist Similarity Matrix** — find near-duplicate playlists (Jaccard ≥ 0.7)
- **Playlist Gap Analysis** — "I have 47 playlists in this mood zone and zero in the adjacent one"
- **Smart Merge Suggestions** — collapse near-duplicates into one deduplicated version, routed to M6 (Merger)
- **Playlist Mood Map** — 2D scatter plot, one dot per playlist, positioned by aggregate Valence/Arousal from Audimote data (Phase 7 visualization)

**Temporal Discovery Archaeology** — if playlist-save or track-add timestamps survive the export:

- **Discovery Waves**: Bursts of playlist-saving activity, indicating exploration periods
- **Genre Migration**: How discovery interests shifted over months/years (e.g., a K-Pop phase, when Afrobeats entered the radar)
- **Dormant Treasures**: Playlists saved 2+ years ago, never revisited — with a Freshness Score

> **Data dependency note:** The current Spotify CSV schema (`Track name | Artist name | Album | Playlist name | Type | ISRC | Spotify - id`) has **no timestamp column**. Temporal features are **gracefully optional** — hidden (not errored) when no timestamp data is present. If a future export format includes timestamps, these features activate automatically.

**Orphan detection & reservoir-to-canon latency** — two reconciliation metrics:

- **Orphan detection**: Gap between what's in the corpus and what's actually in Musicolet offline rotation. Requires user to upload Musicolet `Songs.csv`. Surfaces artists and tracks saved in streaming playlists but never downloaded for offline listening.
- **Reservoir-to-canon latency**: If timestamps are available — how long tracks sit in discovery playlists before graduating to the offline library. Broken out by cultural bucket or Louvain cluster.

## 3. Semantic & conversational layer (Phase 6)

Distinct from the automated recipe pipelines (Phase 4): here, playlist titles, track titles, and artist names are fed to an LLM agent (Gemini 2.5 Flash or local model via the existing AI cascade in `visionEngine.ts`) with the full corpus graph as structured context. The agent can answer cross-dimensional natural-language queries that fixed pipelines cannot:

- "Find songs with the exact curatorial DNA of 'songs i wish i wrote,' but sung exclusively in Tagalog or French"
- "Extract tracks from playlists curated directly by female singer-songwriters about their inspirations"
- "I'm in a melancholic mood — show me slow tracks that sound like Adele but from non-English artists"
- "Assemble a 20-track progression bridging Nigerian Alté to London Grime to French Hip-Hop"

**Implementation approach (updated):** The original drafts proposed full RAG (retrieval-augmented generation) with embeddings over 78K tracks. Module 20 Phase 6 takes a **lighter approach**: feed the LLM a structured summary of the corpus (top-level stats, community cluster descriptions, Playlist DNA summaries) as context, plus the specific graph query results relevant to the user's question. The LLM reasons over this structured context — not raw embeddings. This avoids the infrastructure cost of a vector store while still enabling rich conversational queries.

AI model cascade (existing infrastructure in `visionEngine.ts`):
- `gemini-2.5-flash` (primary) → `gemini-2.0-flash` → `gemini-1.5-flash` (fallback)
- 25-second `Promise.race` safety ceiling
- Local LLM support via OpenAI-compatible endpoints (Ollama / LM Studio)

## 4. Discovery agent personas (Phase 6)

Four named personas, each a standing, autonomous background function powered by the AI layer. Distinct from one-off recipes (Phase 4) because these agents **reason across the entire corpus** rather than executing fixed pipelines:

| Persona | Behavior | Data Requirements |
|:---|:---|:---|
| 🧭 **The Cartographer** | Scans all playlists, constructs macro taste-universes (e.g., "The 90s Soul Influence Sphere," "The Asian Indie Wave"), detects isolated playlist "islands" with zero track overlap with anything else, proposes conceptual threads connecting them back to core listening habits | Bipartite graph + Louvain community clusters |
| 🧬 **The Lineage & Influence Agent** | Specializes in artist-inspiration playlists (e.g., "Em Beihold: songs that made me"); traces influence both backward and forward — "Lyn Lapid draws from Dodie and Rex Orange County, who draw from 70s Bossa Nova in Playlist #412" | Artist constellation + playlist metadata + M15 enrichment data (if available) |
| 💎 **The Deep-Cut Diver** | Targets the bottom 70% of tracks in large playlists (rarely reached past song #50 of 200), matches them against favorite sonic attributes (using M18 Audimote data if available), extracts high-affinity gems saved years ago but never heard | Consensus matrix + Audimote acoustic data (optional) + offline library (Songs.csv) |
| 🎓 **The Graduation Concierge** | Analyzes what has historically graduated into the offline `* Newees X` folders, generates weekly calibrated candidate batches (e.g., 15 songs at 95% predicted affinity) for audition. Feeds directly into M14 Discovery Triage for final decision. | Newees lifecycle data (Phase 5) + Musicolet Songs.csv play count history |
| 📊 **The Promotion Candidate** | Periodically surfaces "N tracks from the reservoir most likely to earn a spot in the closed loop," feeding directly into the existing weekly Musicolet pipeline's count-group logic (M1 Sonic Sieve) rather than existing as a separate feature — the most concretely integration-ready agent | Consensus matrix + Newees lifecycle + Sonic Sieve play counts |

**Gating:** Agent personas are behind an "Enable AI Discovery Agents" toggle. When no API key is configured, the agents tab shows a setup prompt directing the user to configure Gemini or Ollama — never crashes, never blocks.

## 5. Visualization & additional concepts (Phase 7)

**3D/WebGL "Infinite Constellation"** — an interactive product concept, not just a diagram:

- **Macro view**: Playlist bubbles orbiting in space, grouped by Louvain community cluster, connected by gravitational strands sized by Jaccard weight. Colored by 20-bucket cultural classification.
- **Micro view**: Clicking a playlist expands into a track "solar system" (reusing `SongCoverArt.tsx` for album art on nodes). Clicking a track highlights every other playlist in the galaxy containing it (graph inversion, visualized).
- **Wander & Traverse mode**: Continuous listening flow that hops node-to-node along shortest-path aesthetic bridges, playing Apple iTunes 30s previews (via existing `AudioPreviewContext.tsx`). Falls back to "generate M3U from path" if live playback integration is too complex.
- Layout computed via UMAP/t-SNE dimensionality reduction (if library budget permits) or force-directed layout (pure TS fallback) over the co-occurrence matrix + cultural buckets.
- **WebGL feature detection**: Falls back to Canvas 2D (flat scatter) on devices without WebGL support.

**Additional named generation modes** (implemented as recipes in Phase 4):

| Mode | What's distinct | Parameters |
|:---|:---|:---|
| **The Overlooked** | Tracks appearing in only 1 playlist, from artists with low mainstream presence | consensus = 1, optional follower-count threshold if data available |
| **Era Archaeology** | Everything from a specific past window (e.g., 2018–2019) that was saved but never engaged with | Time-boxed filter + offline library subtraction |
| **Mood Bridge** | Start at Playlist A's energy level, gradually transition to Playlist B's mood | Requires Audimote acoustic data for energy/valence gradient computation |
| **Cultural Re-Balancing** | "My listening is 90% English; build a 50-track intake equally from Naija, I-Pop, Filipino, and Français" | M13 cultural bucket filter + per-bucket consensus ranking + M10 anti-cluster randomizer |
