# Discovery Intelligence Layer (Module 20) — Architect's Plan v2

## 5.1 Executive Compass

Module 20 is the **capstone intelligence layer** that transforms Playlist Haven's 19 independent power tools into a **unified corpus intelligence engine**. It ingests the user's saved albums and playlists (Spotify-schema CSVs), constructs an in-browser **bipartite graph** (Playlists ↔ Tracks), and layers on seven progressive intelligence tiers: **consensus analytics**, **graph-theoretic structure discovery** (community detection, shortest-path bridges, blind spots), **playlist profiling & temporal archaeology**, **automated recipe pipelines** chaining existing modules, **curator intelligence & graduation lifecycle**, **autonomous AI discovery agents**, and **3D visualization of the taste universe**.

This is the module where Playlist Haven stops being a *toolbox* and becomes a **thinking system** — the strategist brain that orchestrates the 19-module heavy machinery.

### Hard Scope Constraints
- **Data source**: Saved **albums** and **playlists** only. `type: 'favorite'` and `type: 'artist'` rows **excluded by default**, configurable via UI toggle.
- **100% client-side**: Zero server, zero backend. All graph computation, community detection, and profiling runs in-browser (Web Workers for heavy ops). AI features use Gemini/local LLM via existing patterns.
- **No new npm dependencies** unless strictly unavoidable (graph algorithms are implementable in pure TS; visualization may require a lightweight canvas/WebGL library in Phase 7).

---

## 5.2 Decision Ledger

### DECISION 1: Input Schema & Exclusion Rules
**Chosen path**: Ingest CSV files matching the Spotify export schema (`Track name | Artist name | Album | Playlist name | Type | ISRC | Spotify - id`). Configurable type filter **defaults to excluding** `favorite` and `artist` rows. The UI surfaces all unique `Type` values found, letting the user toggle each.
**Why**: User's explicit directive. Excluding favorites/artists prevents polluting the corpus with bookmarks lacking playlist-context provenance.
**Resolved via**: Explicit user directive.

### DECISION 2: Corpus Data Structure — Bipartite Graph
**Chosen path**: In-memory bipartite graph: **Playlist** nodes and **Track** nodes connected by edges. Track nodes link to **Artist** nodes (creating a second projection layer). This single structure powers consensus counting, graph inversion, Jaccard similarity, community detection, shortest-path queries, and artist constellation — all from one underlying representation.
**Why**: The Discovery Intelligence Layer doc defines 7 distinct graph operations. A flat frequency table (like Module 5's Appearance Counter) only gives scores; the graph preserves provenance, enables shortest-path, and supports community detection.
**Resolved via**: Specificity.

### DECISION 3: Deduplication — ISRC-First 3-Tier Cascade
**Chosen path**: (1) Match by `ISRC` when non-empty, (2) fallback to `Spotify - id`, (3) fallback to Jaro-Winkler normalized `Artist + Title` (≥ 0.90, reusing `playlistSanitizer.ts`). When ISRC matches but Spotify IDs differ, flag as `possibleDuplicate` for review.
**Why**: ISRC is the only globally unique recording identifier. Spotify IDs are platform-specific. Title-matching is last resort due to spelling variance.
**Resolved via**: Foundational precedence.

### DECISION 4: Seven-Phase Intelligence Stack
**Chosen path**: Features organized into 7 progressive phases, each self-sufficient:
| Phase | Intelligence Tier | Core Capabilities |
|:---:|:---|:---|
| 0 | Data Layer | CSV parsing, dedup, graph construction, IndexedDB persistence |
| 1 | Consensus & Provenance | Consensus matrix, graph inversion (Track → Contexts), threshold filtering |
| 2 | Graph Intelligence | Jaccard similarity, community detection (Louvain), shortest-path bridges, Blind Spot Finder, artist constellation, emergent genre taxonomy |
| 3 | Profiling & Archaeology | Playlist DNA fingerprinting, gap analysis, temporal discovery waves, genre migration, dormant treasures, orphan detection |
| 4 | Recipe Engine | 5 pre-configured pipeline categories as 1-click workflows chaining existing modules |
| 5 | Curator Intelligence & Newees | Taste affinity graph, curator trust weighting, archetype clustering, 5-stage graduation lifecycle |
| 6 | Discovery Agents | 4 autonomous AI personas (Cartographer, Lineage Agent, Deep-Cut Diver, Graduation Concierge) |
| 7 | Visualization & Constellation | 3D/WebGL Infinite Constellation, Playlist Mood Map, interactive graph canvas |

**Why**: Each phase delivers a standalone increment of value. Phase 0–1 work with zero AI and zero new dependencies. Later phases layer intelligence progressively.
**Resolved via**: Steel-Man Default — the most ambitious but still-executable interpretation.

### DECISION 5: Community Detection Algorithm — Louvain
**Chosen path**: Implement Louvain modularity-based community detection on the playlist–track co-occurrence graph. This produces **emergent taste clusters** that may disagree with the fixed 20-bucket cultural taxonomy — and that's the point. The cultural buckets classify by *language/origin*; Louvain clusters by *listening behavior*.
**Why**: The Discovery Intelligence Layer doc explicitly names this as "distinct from the pre-defined cultural buckets" and calls it "a genre/mood axis."
**Resolved via**: Specificity — the doc names the exact algorithm.

### DECISION 6: Shortest-Path Bridge Engine
**Chosen path**: Implement BFS/Dijkstra shortest-path on the artist constellation graph (artists as nodes, weighted edges by co-occurrence-in-playlist). Enables queries like "Find the 3-song bridge connecting Mac Miller's jazzy hip-hop to Lyn Lapid's bedroom pop" — computed algorithmically, not hand-curated.
**Why**: Distinct from the Roadmap's Bridge Vector engine (hand-selects bridge artists). This computes the path from the graph itself.
**Resolved via**: Specificity.

### DECISION 7: Playlist DNA & Gap Analysis
**Chosen path**: Each playlist gets an identity vector computed from the aggregate of its tracks: genre distribution (from Louvain clusters), cultural bucket distribution (from M13 data if available), artist diversity index, era distribution (from release dates if enriched via M15), and consensus-weight profile. This vector enables:
- **Playlist Similarity Matrix** — find near-duplicate playlists
- **Playlist Gap Analysis** — identify taste zones with dense coverage vs. voids
- **Smart Merge Suggestions** — collapse near-duplicates with dedup

**Why**: This is the "Playlist DNA Fingerprinting" concept from the source docs, made concrete with computable dimensions.
**Resolved via**: Specificity.

### DECISION 8: Recipe Engine Architecture
**Chosen path**: Recipes are **declarative pipeline definitions** stored as typed objects — each recipe specifies a chain of module operations (filter → cluster → prune → randomize → export) with configurable parameters. The Recipe Engine tab renders them as cards with 1-click execution. Five recipe categories ship at launch:
1. **Consensus & Novelty Sieves** — high-consensus tracks not in offline library
2. **Curator Bridge & Fusion** — cross-pollination between two taste clusters
3. **Full-Corpus DAESO Pipeline** — discovery-to-offline weekly ration automation
4. **Cultural Deep-Dive & Rebalancing** — regional focus or diversity balancing
5. **Offline Gap Reconciliation** — artists you love offline who have undiscovered tracks in the corpus

Each recipe outputs are routable to downstream modules (M14/M13/M4/M10).
**Why**: The Discovery Recipes doc has 15+ worked examples across these 5 categories. Making them 1-click executable transforms documentation into product.
**Resolved via**: Specificity — the Recipes doc is the most detailed plan on this topic.

### DECISION 9: Curator Intelligence — Trust Weighting
**Chosen path**: Tracks in the consensus matrix get weighted by **curator reliability**. A specialized editorial playlist (e.g., a specific music blogger's "best of" list) can count 1.5× vs. a generic algorithmic dump playlist. The user assigns trust tiers to playlists (or the system infers them from naming patterns / track overlap with the user's graduated library). This feeds into a **Multi-Curator Taste Affinity Graph**: which curators' tracks consistently graduate into offline rotation?
**Why**: Not all playlists are equal. A consensus score of 3 from three editorial playlists is qualitatively different from 3 from three "Top Hits" dumps.
**Resolved via**: Silence rule — only the Roadmap doc addresses this, with no contradiction.

### DECISION 10: Newees Graduation Lifecycle
**Chosen path**: Formalize the existing `* Newees [Genre/Mood] Vol. N` personal playlists into a 5-stage tracked pipeline:
1. **Ingestion** — 78K+ raw tracks enter the corpus
2. **Sieve & Consensus** — consensus matrix + recipe filters produce candidates
3. **Incubation** — auto-drafted Newees playlists for audition
4. **Immersion** — synced to Musicolet, play-logged
5. **Graduation** — tracks with ≥3 plays become permanent Skeleton Anchors in M1

The graduation rule closes the full DAESO loop: Immersion is the destination, Discovery is the fuel.
**Why**: This is the lifecycle the entire app philosophically serves. Module 20 is where it becomes explicit and trackable.
**Resolved via**: Specificity — the Roadmap doc defines the exact 5 stages.

### DECISION 11: Discovery Agent Personas
**Chosen path**: Four named AI agents, each a standing background function (not one-off recipes):

| Persona | Behavior | Data Requirements |
|:---|:---|:---|
| 🧭 **The Cartographer** | Scans all playlists, constructs macro taste-universes, detects isolated playlist "islands" with zero overlap, proposes conceptual threads connecting them | Bipartite graph + community clusters |
| 🧬 **The Lineage Agent** | Traces artist-inspiration chains backward and forward through the corpus ("Lyn Lapid draws from Dodie and Rex Orange County, who draw from 70s Bossa Nova in Playlist #412") | Artist constellation + playlist metadata |
| 💎 **The Deep-Cut Diver** | Targets the bottom 70% of tracks in large playlists (never scrolled to), matches against favorite sonic attributes, extracts high-affinity gems | Consensus matrix + acoustic data from M18 (if available) |
| 🎓 **The Graduation Concierge** | Analyzes what has historically graduated into offline rotation, generates weekly calibrated candidate batches (e.g., 15 songs at 95% affinity) | Newees lifecycle data + Musicolet Songs.csv history |

These are powered by Gemini 2.5 Flash / local LLM via existing AI patterns (model cascade, 25s timeout).
**Why**: The source doc frames these as "standing, autonomous background agents rather than on-demand recipes" — they represent the conversational cortex layer.
**Resolved via**: Specificity.

### DECISION 12: 3D Visualization — Infinite Constellation
**Chosen path**: An interactive WebGL/Canvas visualization with two zoom levels:
- **Macro view**: Playlist bubbles orbiting in space, grouped by community cluster, connected by gravitational strands sized by shared-track count (Jaccard edge weight)
- **Micro view**: Clicking a playlist expands into a track "solar system"; clicking a track highlights every other playlist containing it
- **Wander & Traverse mode**: Continuous listening flow that hops node-to-node along shortest-path aesthetic bridges — a genuinely new playback mode, not just a visualization

Built via dimensionality reduction (UMAP/t-SNE) over the co-occurrence matrix + cultural buckets.
**Why**: This is the product-level differentiator. The source doc calls it "an actual interactive product concept" distinct from diagrams.
**Resolved via**: Steel-Man Default — ambitious but executable with WebGL libraries.

### DECISION 13: Persistence Strategy
**Chosen path**: New **`DiscoveryCorpusDB`** IndexedDB database (separate from `PlaylistHavenMetadataDB`) with versioned schema. Stores: parsed corpus, graph edges, computed consensus scores, community assignments, playlist DNA vectors, curator trust tiers, Newees lifecycle stage per track. User config (type filters, thresholds) in `localStorage`.
**Why**: 78K+ tracks with graph edges and computed vectors exceed React state and localStorage limits. Separate DB prevents schema collisions with M15's metadata store.
**Resolved via**: Recency — existing IndexedDB pattern from M15/M18.

---

## 5.3 Execution Map

### PHASE 0: Data Layer & Graph Construction
**Deliverable**: `discoveryCorpusEngine.ts` + `DiscoveryCorpusDB` IndexedDB + type definitions
**Done when**:
- CSV parser ingests the 7-column Spotify schema with BOM handling
- Configurable type filter excludes `favorite`/`artist` by default
- ISRC-first 3-tier dedup produces stable track IDs
- Multi-file ingestion merges into unified bipartite graph
- Graph stored in IndexedDB with playlist nodes, track nodes, and edges
- `CorpusTrack`, `CorpusPlaylist`, `CorpusEdge`, `CorpusConfig`, `CorpusStats` types defined
- Stats computation works: total tracks, unique tracks, playlists, artists, albums
**Depends on**: Nothing (greenfield)

### PHASE 1: Consensus Matrix & Graph Inversion + View Shell
**Deliverable**: Consensus scoring + provenance lookup + initial `DiscoveryLayerView.tsx`
**Done when**:
- Every deduplicated track has a `consensusCount` (distinct playlists containing it)
- `getTrackProvenance(trackId)` returns full playlist name list
- Interactive consensus threshold slider (1..max)
- View shell renders with tabs: Overview | Consensus Explorer | (placeholders for future tabs)
- Stats cards: total tracks, playlists, unique artists, albums, consensus histogram
- Consensus table: searchable, sortable, expandable rows showing provenance
- Dashboard card added to `App.tsx` (featured full-width, above current M19 card)
- Results exportable as UTF-8 BOM CSV / M3U
**Depends on**: Phase 0

### PHASE 2: Graph Intelligence
**Deliverable**: Jaccard similarity + Louvain communities + shortest-path bridges + Blind Spot Finder + artist constellation + emergent taxonomy
**Done when**:
- **Playlist Similarity**: Pairwise Jaccard for playlists sharing ≥1 track. Sparse computation (skip zero-overlap pairs). Sortable similarity matrix. "Find playlists most similar to X."
- **Community Detection**: Louvain modularity on the track co-occurrence graph. Each track assigned to an emergent cluster. Clusters named by dominant artist/playlist patterns. Displayed alongside (not replacing) the 20 cultural buckets.
- **Shortest-Path Bridge**: BFS on artist constellation graph. "Bridge Artist A's world to Artist B's" → returns the intermediate artist chain.
- **Blind Spot Finder**: Artists with high co-occurrence weight to the user's top artists but zero tracks in the user's offline library (requires Songs.csv comparison).
- **Artist Constellation**: Artist-level node graph (weighted by co-occurrence). "Most connected to [X]", "Bridge artists between two clusters."
- **Emergent Genre Taxonomy**: Cluster labeling via dominant patterns (if AI available) or aggregate metadata (most common album, most common playlist title words).
- All computable in Web Workers for non-blocking UI.
**Depends on**: Phase 0 (graph), Phase 1 (consensus data for weighting)

### PHASE 3: Playlist Profiling & Temporal Archaeology
**Deliverable**: Playlist DNA fingerprints + gap analysis + temporal intelligence
**Done when**:
- **Playlist DNA Vector**: Each playlist profiled by: community cluster distribution, cultural bucket distribution, artist diversity index, consensus-weight profile, track count
- **Playlist Gap Analysis**: Identify taste zones with dense coverage vs. voids ("47 playlists in the singer-songwriter cluster, 0 in the adjacent jazz-influenced cluster")
- **Smart Merge Suggestions**: Surface near-duplicate playlists (Jaccard ≥ 0.7) with 1-click merge routing to M6
- **Temporal Discovery Archaeology** (if timestamp data available from export):
  - *Discovery Waves*: Bursts of playlist-saving activity over time
  - *Genre Migration*: How discovery interests shifted across months/years
  - *Dormant Treasures*: Playlists saved 2+ years ago, never revisited — with a Freshness Score
- **Orphan Detection**: Gap between what's in the corpus and what's in Musicolet rotation (requires Songs.csv upload)
- **Reservoir-to-Canon Latency**: How long tracks sit in discovery before graduating to offline library
**Depends on**: Phase 2 (community clusters, Jaccard, DNA vectors)

### PHASE 4: Recipe Engine & Cross-Module Pipelines
**Deliverable**: Declarative recipe system + 5 pre-configured recipe categories + module routing
**Done when**:
- Recipe data structure defined: `{ name, description, steps: [{module, operation, params}], outputs }`
- **Recipe Category 1 — Consensus & Novelty Sieves**: "30 tracks appearing in ≥2 playlists, not in my offline library, from the J-Pop/C-Pop cultural bucket, randomized with artist spacing" → chains Consensus Filter → Cultural Bucket Filter → Offline Subtraction (M8) → Randomizer (M10) → Export
- **Recipe Category 2 — Curator Bridge & Fusion**: "Bridge Curator A's Afrobeats list and Curator B's UK R&B" → chains Playlist Selection → Set Intersection (M4) → Bridge Artist Identification → Energy Gradient Sort (M10) → Export
- **Recipe Category 3 — Full DAESO Pipeline**: "Process my latest discovery batch through the weekly DAESO routine" → Consensus Sieve → Language Clustering (M13) → Pruner (M4) → Splitter (M7, 20-track rations) → Sonic Sieve anchor (M1) → Export
- **Recipe Category 4 — Cultural Deep-Dive & Rebalancing**: "My listening is 90% English; build a 50-track intake from Naija, I-Pop, Filipino, and Français equally" → Cultural bucket filter → Consensus ranking per bucket → Anti-cluster Randomizer (M10) → Export
- **Recipe Category 5 — Offline Gap Reconciliation**: "Find artists I love offline who have undiscovered tracks in my corpus" → Offline library artist extraction → Corpus filter to those artists → Subtract owned tracks → Export gap playlist
- Each recipe renders as a card with parameter inputs and a "Run" button
- 1-click staging routes filtered results to downstream modules (M14/M13/M4/M17/M18)
- Direct export to UTF-8 BOM CSV, M3U, TSV
**Depends on**: Phase 1 (consensus), Phase 2 (similarity, communities), Phase 0 (graph)

### PHASE 5: Curator Intelligence & Newees Graduation Lifecycle
**Deliverable**: Curator trust system + taste affinity tracking + Newees lifecycle pipeline
**Done when**:
- **Curator Trust Tiers**: User can assign trust levels to playlists (Editorial 1.5×, Standard 1.0×, Low-Signal 0.5×). System suggests tiers based on naming patterns and track overlap with graduated library.
- **Multi-Curator Taste Affinity Graph**: Track which curators' (playlist sources') tracks consistently graduate into offline rotation. High-affinity curators get boosted consensus weighting.
- **Curator Archetype Clustering**: Content-overlap clustering across playlists to surface implicit "curator fingerprints" — taste-sources the user gravitates to without naming them. Zero attribution data required.
- **Newees 5-Stage Lifecycle Pipeline**:
  1. *Ingestion*: Raw tracks enter corpus
  2. *Sieve & Consensus*: Filters produce candidates
  3. *Incubation*: Auto-drafted `* Newees [Cluster] Vol. N` playlists
  4. *Immersion*: Exported to Musicolet, play-logged
  5. *Graduation*: ≥3 plays → permanent Skeleton Anchor in M1, fed back into the affinity graph
- Lifecycle stage tracked per-track in IndexedDB
- Visual pipeline view showing tracks flowing through stages
**Depends on**: Phase 2 (communities, artist constellation), Phase 4 (recipes for automated drafting)

### PHASE 6: Discovery Agent Personas (AI Layer)
**Deliverable**: 4 autonomous AI agents powered by Gemini/local LLM
**Done when**:
- **🧭 The Cartographer**: Scans corpus, constructs macro taste-universes (named clusters), detects isolated playlist "islands" with zero track overlap, proposes conceptual threads connecting them back to core habits. Output: narrative map + connection suggestions.
- **🧬 The Lineage & Influence Agent**: For artist-inspiration playlists (e.g., "Em Beihold: songs that made me"), traces influence backward and forward through the corpus graph. Output: influence tree visualization + "artists you'd love based on lineage."
- **💎 The Deep-Cut Diver**: Targets the bottom 70% of tracks in large playlists (past song #50 of 200, where humans stop scrolling), cross-references with favorite sonic attributes (from M18 acoustic data if available), extracts high-affinity gems saved years ago but never heard. Output: curated deep-cuts playlist.
- **🎓 The Graduation Concierge**: Analyzes historical graduation patterns, generates weekly calibrated candidate batches (e.g., "15 songs at 95% predicted affinity"). Output: weekly Newees draft playlist.
- All agents use existing Gemini 2.5 Flash cascade (`2.5-flash` → `2.0-flash` → `1.5-flash`) with 25s `Promise.race` ceiling and local LLM fallback.
- Agent results displayed in a dedicated "Agents" tab with reasoning trails.
- Agents can be run on-demand or scheduled as recurring digests (Phase 7 enhancement).
**Depends on**: Phase 2 (graph intelligence), Phase 3 (profiling), Phase 5 (lifecycle data)

### PHASE 7: Visualization & Infinite Constellation
**Deliverable**: Interactive 3D taste universe + Playlist Mood Map + graph canvas
**Done when**:
- **Infinite Constellation (WebGL/Canvas)**:
  - *Macro view*: 1,040 playlist bubbles in space, grouped by community cluster (Louvain), connected by gravitational strands sized by Jaccard weight. Colored by cultural bucket.
  - *Micro view*: Click a playlist → expands into track "solar system." Click a track → highlights every other playlist containing it (graph inversion, visualized).
  - *Wander & Traverse mode*: Continuous listening flow hopping node-to-node along shortest-path aesthetic bridges. A genuinely new playback mode using iTunes 30s previews.
  - Built via UMAP/t-SNE dimensionality reduction over co-occurrence matrix + cultural buckets.
- **Playlist Mood Map** (if M18 Audimote data available): 2D scatter plot, one dot per playlist, positioned by aggregate Valence/Arousal from its tracks.
- **Artist Constellation Canvas**: Interactive force-directed graph of artist co-occurrence. Draggable, zoomable, click-to-filter.
- Lightweight WebGL/Canvas library (evaluate: raw Canvas 2D API for artist graph, Three.js or deck.gl for constellation if needed).
**Depends on**: Phase 2 (Jaccard, communities, artist constellation), Phase 3 (DNA vectors)

---

## 5.4 Landmines

### LANDMINE: Corpus Size Memory Pressure
**Trigger**: 78K+ tracks across 1K+ playlists. Jaccard = O(P²) = 540K+ pairs. Louvain iterates over the full edge set.
**Source**: Discovery Intelligence Layer §1 feasibility flag.
**Mitigation**: (1) Sparse Jaccard — skip zero-overlap pairs. (2) All heavy computation in Web Workers. (3) Stream results to IndexedDB, never hold full matrix in React state. (4) Louvain on the artist-level projection (smaller graph) if track-level is too slow. (5) Progressive loading — show results as they compute, don't block on full completion.

### LANDMINE: ISRC Collisions and Nulls
**Trigger**: Empty ISRCs in some exports. Remasters/originals sharing ISRCs. Classical recordings.
**Source**: Surfaced by consolidation.
**Mitigation**: 3-tier cascade handles nulls. ISRC match + different Spotify ID → `possibleDuplicate` flag for user review.

### LANDMINE: Type Field Variance
**Trigger**: Different export tools use different capitalization/values for `Type`.
**Source**: Surfaced by consolidation.
**Mitigation**: Case-insensitive matching. UI shows all unique type values found, user toggles each.

### LANDMINE: Cross-Module Data Shape Mismatch
**Trigger**: Module 20 stages tracks to M14, but M14 expects a different CSV structure.
**Source**: Surfaced by consolidation.
**Mitigation**: `formatForModule(tracks, targetModule)` adapter function that transforms corpus tracks into each module's expected format.

### LANDMINE: Playlist Name Collision
**Trigger**: Multiple playlists with identical names from different exports.
**Source**: Schema has no unique playlist ID.
**Mitigation**: Composite identity: `Playlist name + source filename`. Warning banner in UI on collision.

### LANDMINE: Louvain Instability
**Trigger**: Louvain is non-deterministic (results vary by node processing order). Users see different clusters on re-import.
**Source**: Surfaced by consolidation — the doc names Louvain but doesn't address its instability.
**Mitigation**: Seed the node ordering deterministically (alphabetical by track ID). Cache cluster assignments in IndexedDB. Display a "Recluster" button rather than auto-recomputing.

### LANDMINE: Temporal Data Availability
**Trigger**: Phase 3's Discovery Archaeology features (Discovery Waves, Genre Migration, Dormant Treasures) require playlist-save or track-add timestamps. The user's current schema has no timestamp column.
**Source**: Discovery Intelligence Layer §2 — "if playlist-save and track-add timestamps survive the export."
**Mitigation**: Make temporal features **gracefully optional**. If no timestamp data: hide the Archaeology sub-tab and surface a message explaining what data would unlock it. Don't fail; degrade.

### LANDMINE: WebGL Browser Compatibility
**Trigger**: Phase 7 constellation on mobile browsers, older devices, or WebGL-disabled contexts.
**Source**: Surfaced by consolidation.
**Mitigation**: Feature-detect WebGL availability. Fallback to Canvas 2D (flat 2D scatter) or static SVG for devices without WebGL. The constellation is an enhancement, not a gate.

---

## 5.5 Proactive Prompts

- **At Phase 0**: Verify the exact column headers in 3+ real export files. Does `Track name,Artist name,Album,Playlist name,Type,ISRC,Spotify - id` exactly match?
- **At Phase 1**: Default sort order for the consensus table — by consensus count descending, or by original discovery row order?
- **At Phase 2**: Louvain will discover N clusters. How should they be named? Auto-label by dominant artist/playlist-title keywords, or let the user name them manually?
- **At Phase 3**: Temporal Archaeology requires timestamps. Is there a way to export timestamps from the user's Spotify backup, or should this entire sub-feature be flagged as "future data dependency"?
- **At Phase 4**: Recipes chain modules sequentially. Should the UI show a "pipeline view" (step 1 → step 2 → step 3 with intermediate results), or just "Run" → final output?
- **At Phase 5**: Curator trust tiers — should the default be "all playlists equal (1.0×)" with manual overrides, or should the system attempt auto-classification on first import?
- **At Phase 6**: Agent personas require AI calls. Should they be gated behind an "Enable AI Agents" toggle (like Vision AI's model selector), or always-available with graceful fallback if no API key?
- **At Phase 7**: WebGL library choice — evaluate raw Canvas 2D vs. Three.js vs. deck.gl vs. a lighter option. This is the only phase that may require a new npm dependency.

---

## 5.6 Traceability Ledger

| Decision | Primary Source |
|:---|:---|
| D1: Schema & Exclusion | User directive + schema images |
| D2: Bipartite Graph | Discovery Intelligence Layer §1 |
| D3: ISRC Dedup | Schema images + existing `playlistSanitizer.ts` |
| D4: 7-Phase Stack | All 4 source docs (synthesized phase progression) |
| D5: Louvain Community Detection | Discovery Intelligence Layer §1 (named algorithm) |
| D6: Shortest-Path Bridges | Discovery Intelligence Layer §1 (named operation) |
| D7: Playlist DNA & Gap Analysis | Discovery Intelligence Layer §2 |
| D8: Recipe Engine | Discovery Recipes (15+ worked examples across 5 categories) |
| D9: Curator Trust Weighting | Roadmap & Source Notes (cognitive engines table) |
| D10: Newees Graduation Lifecycle | Roadmap & Source Notes (5-stage pipeline definition) |
| D11: Discovery Agent Personas | Discovery Intelligence Layer §4 (4 named personas) |
| D12: 3D Constellation | Discovery Intelligence Layer §5 (product concept) |
| D13: Persistence (DiscoveryCorpusDB) | Existing M15/M18 IndexedDB pattern |

---

## 5.7 Lowest-Confidence Calls

### LC-1: Louvain in Pure Client-Side TypeScript
Louvain community detection on a graph with 78K track nodes and potentially millions of edges is computationally ambitious for a browser. No source plan addresses performance at this scale in JS. The mitigation (artist-level projection, Web Workers) is sound but unproven. **If Louvain proves too slow at corpus scale, fall back to simpler K-means clustering on the playlist DNA vectors, or threshold-based grouping by dominant cultural bucket + consensus tier.**

### LC-2: UMAP/t-SNE for Constellation Layout
The 3D Constellation requires dimensionality reduction. UMAP and t-SNE are available as JS libraries but are computationally expensive and may require a new dependency (`umap-js` or similar). **If the dependency budget is zero, use a simpler force-directed layout (computable in pure TS) instead of true UMAP/t-SNE. The visual result is less mathematically precise but achieves the same product goal.**

### LC-3: Wander & Traverse Playback Mode
The source doc describes a "continuous listening flow that hops node-to-node along shortest-path aesthetic bridges" as a genuinely new playback mode. This requires integrating the existing iTunes 30s preview system with graph traversal state. **The playback integration is the riskiest single feature — it crosses the boundary between data visualization and audio player state. If it proves too complex, ship Wander mode as a "generate playlist from path" recipe (outputs an M3U) rather than a live interactive playback mode.**

---

## File-Level Implementation Map

```
Playlist-Haven/
├── App.tsx                                    # Add 'discovery-layer' to AppView, import, route, dashboard card
├── services/
│   ├── discoveryCorpusEngine.ts               # NEW — CSV parser, dedup, bipartite graph, consensus, export
│   ├── discoveryGraphEngine.ts                # NEW — Jaccard, Louvain, shortest-path, artist constellation
│   ├── discoveryProfileEngine.ts              # NEW — Playlist DNA, gap analysis, temporal archaeology
│   ├── discoveryRecipeEngine.ts               # NEW — Declarative recipe definitions, pipeline executor
│   ├── discoveryCuratorEngine.ts              # NEW — Trust weighting, affinity graph, archetype clustering
│   ├── discoveryAgentEngine.ts                # NEW — AI persona orchestration (Gemini/local LLM)
│   └── discoveryCorpusDb.ts                   # NEW — IndexedDB DiscoveryCorpusDB schema & CRUD
├── views/
│   └── DiscoveryLayerView.tsx                 # NEW — Multi-tab view (Overview, Consensus, Graph, Profiling,
│                                              #        Recipes, Curators, Agents, Constellation)
├── components/
│   ├── ConstellationCanvas.tsx                # NEW (Phase 7) — WebGL/Canvas constellation renderer
│   └── ArtistGraphCanvas.tsx                  # NEW (Phase 2) — Force-directed artist co-occurrence graph
└── workers/
    └── discoveryGraph.worker.ts               # NEW — Web Worker for Louvain, Jaccard, shortest-path
```

### Core Type Definitions

```typescript
// === Corpus Data Layer ===
interface CorpusTrack {
  id: string;                          // Stable composite: ISRC > SpotifyId > normalized key
  trackName: string;
  artistName: string;
  album: string;
  isrc: string;
  spotifyId: string;
  playlists: string[];                 // Playlist IDs containing this track
  consensusCount: number;              // playlists.length
  communityId?: number;                // Louvain cluster assignment (Phase 2)
  lifecycleStage?: NeweesStage;        // Phase 5
  curatorSources?: CuratorSource[];    // Phase 5
}

interface CorpusPlaylist {
  id: string;                          // Composite: playlistName + sourceFile
  name: string;
  sourceFile: string;
  trackCount: number;
  trackIds: string[];
  dnaVector?: PlaylistDNA;             // Phase 3
  trustTier?: CuratorTrustTier;        // Phase 5
}

interface CorpusConfig {
  excludedTypes: string[];             // Default: ['favorite', 'artist']
  dedupThreshold: number;             // Jaro-Winkler fallback, default 0.90
  minConsensus: number;               // Current filter threshold, default 1
  enabledRecipes: string[];           // Active recipe IDs
  curatorTrustDefaults: CuratorTrustTier; // Default trust for new playlists
}

// === Graph Intelligence (Phase 2) ===
interface JaccardPair {
  playlistA: string;
  playlistB: string;
  sharedTracks: number;
  jaccardIndex: number;               // |A ∩ B| / |A ∪ B|
}

interface CommunityCluster {
  id: number;
  trackIds: string[];
  dominantArtists: string[];           // Top 5 by frequency
  dominantPlaylists: string[];         // Top 5 by track contribution
  suggestedName: string;               // Auto-generated or user-assigned
  size: number;
}

interface BridgePath {
  sourceArtist: string;
  targetArtist: string;
  path: string[];                      // Intermediate artist names
  bridgeTracks: CorpusTrack[];         // Representative tracks at each hop
  totalDistance: number;
}

interface BlindSpot {
  artist: string;
  coOccurrenceWeight: number;          // How connected to user's favorites
  corpusTrackCount: number;            // Tracks in corpus by this artist
  offlineTrackCount: number;           // Tracks in Musicolet (0 = true blind spot)
}

// === Playlist Profiling (Phase 3) ===
interface PlaylistDNA {
  communityDistribution: Map<number, number>;  // Cluster → track count
  culturalDistribution: Map<string, number>;   // Bucket → track count
  artistDiversityIndex: number;                // Shannon entropy
  consensusProfile: { mean: number; max: number; median: number };
  trackCount: number;
}

// === Recipes (Phase 4) ===
interface DiscoveryRecipe {
  id: string;
  name: string;
  description: string;
  category: 'consensus-sieve' | 'curator-bridge' | 'daeso-pipeline' | 'cultural-dive' | 'offline-gap';
  steps: RecipeStep[];
  defaultParams: Record<string, any>;
}

interface RecipeStep {
  moduleId: number;                    // Target module (4, 8, 10, 13, 14, etc.)
  operation: string;                   // Named operation within that module
  params: Record<string, any>;         // Configurable parameters
}

// === Curator Intelligence (Phase 5) ===
type CuratorTrustTier = 'editorial' | 'standard' | 'low-signal';
type NeweesStage = 'ingested' | 'sieved' | 'incubating' | 'immersing' | 'graduated';

interface CuratorSource {
  playlistId: string;
  trustTier: CuratorTrustTier;
  trustMultiplier: number;             // 1.5 / 1.0 / 0.5
  graduationRate: number;              // % of this curator's tracks that graduated
}

// === Stats ===
interface CorpusStats {
  totalTracksRaw: number;              // Pre-dedup, pre-filter
  totalTracksFiltered: number;         // Post type-filter, pre-dedup
  uniqueTracks: number;                // Post-dedup
  totalPlaylists: number;
  uniqueArtists: number;
  uniqueAlbums: number;
  maxConsensus: number;
  consensusHistogram: Map<number, number>;
  communityCount?: number;             // Phase 2
  blindSpotCount?: number;             // Phase 2
}
```
