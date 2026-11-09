# Roadmap, Enhancements & Source Cross-Reference

Oct 1, 2026 · Updated to reflect 19-module production architecture + Module 20 vision

## Implementation phases (Module 20)

Reconciled from the original three overlapping phase plans in the six drafts, now aligned to the Architect's Brief 7-phase execution map. Original draft labels preserved as sub-bullets.

### What's already built (Modules 1–19, production)

Before Module 20's roadmap begins, these capabilities already exist as production modules:

| Original Draft Concept | Status | Where it lives now |
|:---|:---|:---|
| "Corpus Ingestion from TuneMyMusic CSV/JSON" | ✅ Built | M19 Spotify Intake (direct ingestion) + M12 Scrape Stripper (TuneMyMusic CSV cleanup) |
| "In-browser Consensus & Appearance Graph" | ✅ Partially built | M5 Appearance Counter (frequency histogram) + M17 Consensus Aggregator (multi-source cross-tabulation). Module 20 adds corpus-wide consensus across all saved playlists — distinct from M17's per-artist "Best Of" focus |
| "Language Clustering into cultural buckets" | ✅ Built | M13 Language & Cultural Engine — now 20 buckets (upgraded from 13 in original drafts) |
| "1-click routing into Sonic Sieve, Reconciler, etc." | ✅ Partially built | M17 and M19 already have `onViewSelect` downstream staging to M14 Discovery Triage. Module 20 extends this pattern to all 19 modules |
| "In-app audio decision previews" | ✅ Built | M14 Discovery Triage, M15 Deep Enrichment, M17 Consensus Aggregator, M18 Audimote — all use Apple iTunes 30s previews via `AudioPreviewContext.tsx` |
| "Offline disk matcher / reconciler" | ✅ Built | M8 Playlist Matcher / Reconciler |
| "Zero-key Spotify intake" | ✅ Built | M19 Spotify Intake & Bridge — Web Crypto TOTP + Pathfinder GraphQL |
| "Client-side acoustic analysis" | ✅ Built | M18 Audimote — Essentia.js Wasm, 3-tier BPM, Camelot, Circumplex |
| "Deep metadata enrichment" | ✅ Built | M15 — MusicBrainz + iTunes dual-source + CAA + Work entity traversal |
| "Intake triage for singles/artists/albums" | ✅ Built | M14 Discovery Triage — Tri-Philosophy decision hub |

### Module 20 roadmap (7 phases)

**Phase 0 — Data Layer & Graph Construction**
- *Original draft labels: "Corpus Ingestion," "Module 14 Discovery Intelligence Cockpit" (data portion)*
- Ingest Spotify-schema CSVs into bipartite graph (Playlists ↔ Tracks)
- Configurable type filter (exclude `favorite`/`artist` by default)
- ISRC-first 3-tier deduplication cascade
- IndexedDB persistence (`DiscoveryCorpusDB`)

**Phase 1 — Consensus Matrix & Graph Inversion + View Shell**
- *Original draft labels: "Discovery Workbench," "Interactive Consensus Explorer"*
- Corpus-wide consensus scoring (distinct from M17's per-artist focus — this operates across all saved playlists)
- Graph inversion: Track → Contexts (provenance list)
- Interactive threshold slider, searchable table, expandable provenance rows
- Dashboard card, module routing, UTF-8 BOM export

**Phase 2 — Graph Intelligence**
- *Original draft labels: "Bipartite Graph Projection," "Community Detection," "Bridge Queries"*
- Jaccard playlist similarity (sparse matrix)
- Louvain community detection (emergent taste clusters)
- Shortest-path bridge queries on artist constellation graph
- Blind Spot Finder (requires Songs.csv)
- Corpus-native emergent genre taxonomy
- All in Web Workers

**Phase 3 — Playlist Profiling & Temporal Archaeology**
- *Original draft labels: "Playlist DNA Fingerprinting," "Discovery Archaeology," "Orphan Detection"*
- Playlist DNA vectors (community + cultural + acoustic + era dimensions)
- Gap analysis, smart merge suggestions (Jaccard ≥ 0.7)
- Temporal features (gracefully optional — hidden when no timestamps in data)
- Orphan detection (requires Songs.csv)

**Phase 4 — Recipe Engine & Cross-Module Pipelines**
- *Original draft labels: "Automated DAESO Recipes," "Curation Scheduler," "1-click action buttons"*
- Declarative recipe definitions with configurable parameters
- 6 recipe categories (see Discovery Recipes doc): Consensus Sieves, Curator Bridges, Full DAESO Pipelines, Cultural Deep-Dives, Offline Gap Reconciliation, Curator Intelligence & Graduation
- 1-click module routing to M14/M13/M4/M17/M18
- Direct export to UTF-8 BOM CSV, M3U, TSV

**Phase 5 — Curator Intelligence & Newees Graduation Lifecycle**
- *Original draft labels: "Multi-Curator Taste Affinity Graph," "Curator Trust Weighting," "Newees incubation & graduation lifecycle"*
- Curator trust tiers: Editorial (1.5×), Standard (1.0×), Low-Signal (0.5×)
- Weighted consensus scoring
- Curator archetype clustering
- 5-stage Newees lifecycle: Ingested → Sieved → Incubating → Immersing → Graduated (≥3 plays → Skeleton Anchor)
- Taste affinity graph: which curators' tracks consistently graduate

**Phase 6 — Discovery Agent Personas (AI Layer)**
- *Original draft labels: "Conversational Discovery Assistant," "Autonomous agent & conversational cortex"*
- 4 AI agent personas: 🧭 Cartographer, 🧬 Lineage Agent, 💎 Deep-Cut Diver, 🎓 Graduation Concierge, 📊 Promotion Candidate
- Gemini 2.5 Flash cascade + local LLM (existing AI infrastructure)
- Structured context approach (not full RAG/embeddings — corpus summaries + graph query results fed to LLM)
- Gated behind "Enable AI Discovery Agents" toggle

**Phase 7 — Visualization & Infinite Constellation**
- *Original draft labels: "3D/WebGL Infinite Constellation," "Playlist Mood Map," "Wander & Traverse mode"*
- WebGL/Canvas macro view (playlist bubbles by community cluster, Jaccard-weighted strands)
- Micro view (track solar system expansion, cross-playlist highlighting)
- Wander & Traverse (shortest-path playback with iTunes 30s previews, M3U fallback)
- Playlist Mood Map (2D scatter from Audimote data, gracefully optional)
- Artist Constellation Canvas (force-directed interactive graph)

### Alternative integration framing (from original drafts, now resolved)

The original drafts presented three "options" — Module 20 implements all three as distinct features across its phases:

| Original "Option" | Resolution |
|:---|:---|
| **Option 1 — "Discovery Intelligence Cockpit"**: corpus overview cards, interactive consensus explorer, one-click action buttons | → **Phase 1** (Consensus Explorer tab + Stats cards + module routing) |
| **Option 2 — "Conversational Discovery Assistant"**: persistent AI copilot, live "Tool Call Trail" | → **Phase 6** (Discovery Agent personas with reasoning trails) |
| **Option 3 — "Automated DAESO Recipes"**: "Weekly Discovery Drop," "Language Focus of the Month," "Dormant Archaeology Expedition" | → **Phase 4** (Recipe Engine with 6 pre-configured categories) |

## Cognitive engines (status table)

Extensions proposed in the original drafts — all now scoped into Module 20 phases:

| Engine | Status | Module 20 Phase |
|:---|:---|:---:|
| Multi-Curator Taste Affinity Graph | 🟡 Scoped | 5 |
| Curator Trust Weighting | 🟡 Scoped | 5 |
| "* Newees" incubation & graduation lifecycle | 🟡 Scoped | 5 |
| Bridge Vector & Cross-Genre Mutation Engine | 🟡 Scoped (as Shortest-Path Bridge) | 2 |
| Dynamic Crossover Discovery | 🟡 Scoped (as Artist Constellation + Bridge queries) | 2 |
| Full walled-garden bi-directional portability | ✅ Partially built (M19 Spotify intake → Playlist Haven → M3U export → Musicolet). Full loop closure via M20 graduation feedback | 5 |

## Source cross-reference (module numbering — RESOLVED)

The original six drafts assigned conflicting numbers to the same modules. This conflict is now **fully resolved** — the codebase has canonical numbering (M1–M19) matching the production view files. The mapping below documents what each draft called each module, for historical traceability only.

| Canonical # | Canonical Name | View File | Original draft aliases |
|:---:|:---|:---|:---|
| 1 | Sonic Sieve Engine | `SonicSieveView.tsx` | #1 in every draft (consistent) |
| 2 | Sonic Sieve 2 (Dual Input) | `SonicSieveView.tsx` | Not in original drafts (added later) |
| 3 | Tier Filtering Workbench | `TierFilteringView.tsx` | #2 (architecture), #10 (var1), #3 (toolbox3) |
| 4 | Playlist Manipulator (Quad) | `PlaylistManipulatorView.tsx` | #2 (toolbox v1, var1), #3 (architecture) |
| 5 | Appearance Counter | `PlaylistAppearanceView.tsx` | #9 (toolbox v1), #5 (architecture, intelligence-toolbox), #4 (var1 recap), #8 (toolbox3) |
| 6 | Playlist Merger & Grouping | `PlaylistMergerView.tsx` | #6 (architecture), #5 (toolbox3), #3 (toolbox2) |
| 7 | Playlist Splitter | `PlaylistSplitterView.tsx` | #7 (toolbox v1), #6 (toolbox3), #9 (var1) |
| 8 | Playlist Matcher / Reconciler | `PlaylistMatcherView.tsx` | #3 (toolbox v1), #5 (architecture), #10 (intelligence-toolbox), #4 (toolbox3) |
| 9 | Smart Renamer & Tag Editor | `SmartRenamerView.tsx` | #8 (toolbox v1), #10 (architecture), #9 (toolbox3) |
| 10 | Playlist Randomizer | `PlaylistRandomizerView.tsx` | #6 (toolbox v1), #8 (architecture), #10 (toolbox3) |
| 11 | Vision-to-Playlist AI | `VisionToPlaylistView.tsx` | #11 (consistent) |
| 12 | Scrape Stripper & Formatter | `ScrapeStripperView.tsx` | #12 (consistent) |
| 13 | Language & Cultural Engine | `LanguageClusteringView.tsx` | #13 (consistent). Now 20 cultural buckets (up from 13 in original drafts) |
| 14 | Discovery Triage & Honing | `DiscoveryTriageView.tsx` | Not in original drafts (built after M13) |
| 15 | Deep Metadata Enrichment | `DeepMetadataEnrichmentView.tsx` | Not in original drafts (built after M14) |
| 16 | Playlist Resequencer | `PlaylistResequencerView.tsx` | Not in original drafts (built after M15) |
| 17 | Consensus Aggregator | `ConsensusAggregatorView.tsx` | Not in original drafts (built after M16) |
| 18 | Audimote 🐣 | `AudimoteView.tsx` | Not in original drafts (built after M17) |
| 19 | Spotify Intake & Bridge | `SpotifyIntakeBridgeView.tsx` | Not in original drafts (built after M18) |
| **20** | **Discovery Intelligence Layer** | `DiscoveryLayerView.tsx` | The subject of the original 6 drafts — now concrete |

## Technical architecture (current)

| Dimension | Specification |
|:---|:---|
| **Runtime** | 100% Client-Side SPA (React 19 + Vite 6 + Tailwind CSS 4) |
| **Mobile** | Capacitor 8 for Android builds |
| **AI Hierarchy** | `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-1.5-flash` + local LLM (Ollama/LM Studio) |
| **Client Storage** | `localStorage` (settings) + `IndexedDB` (`PlaylistHavenMetadataDB` v4 for M15/M18, `DiscoveryCorpusDB` for M20) |
| **Audio Subsystem** | Global `AudioPreviewContext` + reusable `AudioPlayerBar` + Apple iTunes 30s previews + Essentia.js Wasm (M18) |
| **Cover Art** | `SongCoverArt.tsx` — Spotify CDN + iTunes fallback + vinyl crate placeholder |
| **Compliance** | 1,150ms token-bucket rate limiter (MusicBrainz fair-use) |
| **Portability** | Universal UTF-8 BOM (`\uFEFF`) on all exports |
| **Web Workers** | `sieve.worker.ts` (M1), `audimote.worker.ts` (M18), `discoveryGraph.worker.ts` (M20) |

## Note on the original source drafts

The six original source documents (`discovery_agent_toolbox`, its `architecture/2/3` variants, `discovery_intelligence_toolbox`, and the `var1` recap) were written against a 13-module codebase. They have now been superseded by:

1. **[ARCHITECTS_BRIEF_MODULE_20.md](ARCHITECTS_BRIEF_MODULE_20.md)** — the authoritative plan (13 decisions, 7 phases, 8 landmines)
2. **[IMPLEMENTOR_COMPASS.md](IMPLEMENTOR_COMPASS.md)** — the implementor's phase-by-phase navigation guide
3. This document and its siblings (Overview & Architecture, Discovery Intelligence Layer, Discovery Recipes) — updated to 19-module reality

The original drafts remain in the `ARCHITECT/` subfolder for provenance traceability. They should not be consulted for current architecture or module numbering — use the canonical documents listed above.
