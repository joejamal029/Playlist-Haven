# Module 20: Discovery Intelligence Layer — Implementor Compass

> **This document is your compass. Return to it at the start of every phase.**
> It tells you what to build, where to look, what not to touch, and what to verify before moving on. The Architect's Brief is your map. This document tells you which part of the map to read right now.

---

## Your Role

You are a **Principal Software Engineer and Technical Lead** responsible for building Module 20 from zero to production. You do not merely advise — you build, verify, document, and ship. You operate autonomously within the boundaries set by this compass and the Architect's Brief.

You are building the **20th and capstone module** of a 19-module React/TypeScript application. This module transforms the existing toolbox into a thinking system. Every phase you deliver must integrate seamlessly with 19 existing modules that are **production-stable and must not be broken**.

---

## Hard Rules (Non-Negotiable, Every Phase)

> [!CAUTION]
> Violating any of these rules is a build failure regardless of feature completeness.

1. **100% Client-Side.** Zero server endpoints, zero backend calls, zero cloud databases. Everything runs in-browser. The only external calls permitted are to Gemini AI (Phase 6 only) and Apple iTunes API (existing pattern), both behind user-configured keys/toggles.

2. **Do Not Modify Existing Module Files Unless Explicitly Required.** The only existing files you touch are:
   - `App.tsx` — to add the new view route and dashboard card
   - `types.ts` — to add new shared interfaces (append only, never modify existing types)
   - No other existing view, service, or component file is modified. If you need shared logic from an existing service (e.g., `playlistSanitizer.ts`, `downloadHelper.ts`), **import it** — do not copy-paste or rewrite it.

3. **Type Filter Defaults.** The CSV type filter **must default to excluding** `type: 'favorite'` and `type: 'artist'`. It must be **configurable via UI toggle**, not hardcoded. The user must be able to see all unique `Type` values found in their data and toggle each one. This is a user-mandated constraint — do not second-guess it.

4. **Data Source Constraint.** Module 20 operates on the user's **saved albums and playlists** exported as CSVs. The schema is: `Track name, Artist name, Album, Playlist name, Type, ISRC, Spotify - id`. Do not invent additional columns. Do not assume columns that are not in this schema.

5. **UTF-8 BOM on All Exports.** Every CSV, M3U, TSV, or TXT output must prepend `\uFEFF`. This is a system-wide invariant — CJK and accented characters will corrupt without it. Use the existing `downloadHelper.ts` export utilities.

6. **Defensive Null Safety.** Every field from parsed CSV input can be empty, malformed, or missing. Apply null-coalescing (`?? ''`, `?? 0`) on every access. The app's architecture guarantee (§4 of the high-density summary) mandates this.

7. **Error Boundary Compliance.** Your view must function inside the existing root `<ErrorBoundary>`. If your component throws, the app must recover to the dashboard — never a white screen.

8. **No New npm Dependencies in Phases 0–6.** Phase 7 (Visualization) is the only phase where a new dependency *may* be justified, and only after evaluating pure Canvas 2D / raw WebGL first. If you must add a dependency, document the justification and size impact.

9. **IndexedDB Isolation.** Your new database is `DiscoveryCorpusDB` — a **separate** IndexedDB database from `PlaylistHavenMetadataDB` (Module 15/18). Do not write to, read from, or modify the schema of the existing database. Follow the self-healing version pattern in `metadataDb.ts`.

10. **Preserve All Existing Comments and Docstrings.** When editing `App.tsx` or `types.ts`, do not remove, rewrite, or reorganize existing comments. Append your additions below existing content.

---

## Emphasis (Read This Twice)

> [!IMPORTANT]
> **This module's data layer is its foundation. If the CSV parser, deduplication, or graph construction is wrong, every phase built on top of it is wrong.** Spend 70% of Phase 0's effort on correctness — edge cases in ISRC nulls, type filtering, playlist name collisions, BOM handling, and multi-file merge ordering. The remaining 30% is structure.

> [!IMPORTANT]
> **Each phase must be self-sufficient.** The user must be able to use the module at the end of every phase with real value delivered. Phase 0 alone won't have a UI — that's acceptable. But Phase 1 must have a working, interactive view. Phase 2 must add visible new intelligence. Never ship a phase that is "structural setup for the next phase" with nothing user-facing.

> [!IMPORTANT]
> **Reuse existing engines. Do not reinvent.** Jaro-Winkler fuzzy matching exists in `playlistSanitizer.ts`. CSV export exists in `downloadHelper.ts`. Audio preview infrastructure exists in `AudioPreviewContext.tsx` and `itunesApi.ts`. Cover art exists in `SongCoverArt.tsx`. File upload exists in `FileUploader.tsx`. AI model cascade exists in `visionEngine.ts`. Study these before writing any utility code.

---

## Supplementary Documents Reference

> [!WARNING]
> **Do not read these documents in their entirety.** Each is thousands of lines. Read only the sections referenced for the current phase.

| Document | Location | When to consult |
|:---|:---|:---|
| **Architect's Brief** | [`ARCHITECTS_BRIEF_MODULE_20.md`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/docs/discovery_layer_module_20/ARCHITECTS_BRIEF_MODULE_20.md) | **Every phase** — §5.2 Decision Ledger for constraints, §5.3 for phase deliverables, §5.4 for landmines, §5.7 for lowest-confidence calls |
| **High-Density Summary** | [`playlist_haven_high_density_summary.md`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/Playlist-Haven/playlist_haven_high_density_summary.md) | Phase 0 — §2 Module Matrix (understand what each module does), §4 Technical Architecture (runtime guarantees) |
| **README** | [`README.md`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/Playlist-Haven/README.md) | Phase 1 — "Jobs to Be Done" tables (understand user language and expectations), Module directory (view-to-file mapping) |
| **System Brief** | [`PLAYLIST_HAVEN_SYSTEM_BRIEF.md`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/Playlist-Haven/docs/PLAYLIST_HAVEN_SYSTEM_BRIEF.md) | When you need deep detail on a specific module's internals (e.g., M13's 5-tier waterfall, M14's triage philosophy, M15's IndexedDB schema) |
| **Discovery Intelligence Layer** | [`Discovery Intelligence Layer.md`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/docs/discovery_layer_module_20/Discovery%20Intelligence%20Layer.md) | Phase 2 (§1 graph operations), Phase 3 (§2 profiling), Phase 6 (§4 agent personas), Phase 7 (§5 visualization) |
| **Discovery Recipes** | [`Discovery Recipes.md`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/docs/discovery_layer_module_20/Discovery%20Recipes.md) | Phase 4 — all 5 recipe categories with worked examples and exact parameter sets |
| **Roadmap & Source Notes** | [`Roadmap & Source Notes.md`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/docs/discovery_layer_module_20/Roadmap%20%26%20Source%20Notes.md) | Phase 5 — cognitive engines table (curator trust, Newees lifecycle, taste affinity graph) |
| **Overview & Architecture** | [`Overview & Architecture.md`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/docs/discovery_layer_module_20/Overview%20%26%20Architecture.md) | Phase 0 — DAESO loop diagram, canonical tool registry table (§ Canonical tool registry), Mind & Hands architecture |
| **App.tsx** | [`App.tsx`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/Playlist-Haven/App.tsx) | Phase 1 — study the `AppView` type union, `renderView()` switch, dashboard card pattern (especially M19's featured card as your template) |
| **Existing Services** | [`services/`](file:///C:/Users/USER/Desktop/APPS/Playlist%20Haven/Playlist-Haven/services/) | Phase 0 — `playlistSanitizer.ts` (CSV parsing, Jaro-Winkler), `downloadHelper.ts` (export), `metadataDb.ts` (IndexedDB pattern), `consensusEngine.ts` (track interfaces, source management) |

---

## Phase-by-Phase Navigation

---

### Phase 0: Data Layer & Graph Construction

**Read before starting:**
- Architect's Brief §5.2: Decisions 1, 2, 3, 13 (schema, graph structure, dedup, persistence)
- Architect's Brief §5.4: Landmines — ISRC Collisions, Type Field Variance, Playlist Name Collision
- Overview & Architecture: §Canonical tool registry (understand the tool names you're building alongside)
- Existing code: `services/playlistSanitizer.ts` (CSV parsing patterns), `services/metadataDb.ts` (IndexedDB pattern), `services/consensusEngine.ts` lines 14–60 (interface patterns)

**You are building:**
- `services/discoveryCorpusEngine.ts` — CSV parser, type filter, ISRC-first 3-tier dedup, bipartite graph construction, stats computation
- `services/discoveryCorpusDb.ts` — IndexedDB `DiscoveryCorpusDB` with versioned schema, CRUD operations, self-healing version migration
- Type definitions in `services/discoveryCorpusEngine.ts` (or `types.ts` if shared cross-module): `CorpusTrack`, `CorpusPlaylist`, `CorpusConfig`, `CorpusStats`

**Verify before closing this phase:**
- [ ] CSV parser handles: UTF-8 BOM, quoted fields with commas, empty fields, missing columns
- [ ] Type filter excludes `favorite` and `artist` (case-insensitive) by default
- [ ] Type filter is configurable — not a hardcoded `if` statement
- [ ] ISRC-first dedup cascade works: ISRC → Spotify ID → Jaro-Winkler (≥0.90)
- [ ] Multi-file import merges correctly — no duplicate playlists, no lost tracks
- [ ] Playlist name collisions handled with composite ID (name + source filename)
- [ ] Graph stored to IndexedDB and retrievable across page refreshes
- [ ] Stats computation: totalTracksRaw, totalTracksFiltered, uniqueTracks, totalPlaylists, uniqueArtists, uniqueAlbums, maxConsensus, consensusHistogram
- [ ] All fields null-safe — no crash on empty ISRC, empty album, empty anything

**Do not build yet:** No UI. No view file. No dashboard card. Data layer only.

---

### Phase 1: Consensus Matrix & Graph Inversion + View Shell

**Read before starting:**
- Architect's Brief §5.2: Decision 4 (Phase 1 scope), Decision 7 (UI architecture)
- Architect's Brief §5.5: Proactive Prompt — default sort order
- App.tsx: Study `AppView` type union (line 27), `renderView()` switch (lines 50–111), M19's dashboard card (lines 198–223) as the template for your featured card
- README: §Jobs to Be Done — understand the user-facing language

**You are building:**
- Consensus scoring: for every deduplicated track, `consensusCount` = number of distinct playlists containing it
- Graph inversion: `getTrackProvenance(trackId)` returns the full list of playlist names
- Interactive consensus threshold slider (range: 1 to maxConsensus)
- `views/DiscoveryLayerView.tsx` — the view shell with tabbed navigation
- Tab 1: **Corpus Overview** — file import (reuse `FileUploader.tsx`), stats cards, type filter config
- Tab 2: **Consensus Explorer** — searchable, sortable table with expandable provenance rows, threshold slider
- Placeholder tabs for future phases (Similarity, Artists, Recipes, etc.)
- Dashboard card in `App.tsx` — full-width featured card with module description
- `AppView` type updated: add `'discovery-layer'`
- Export: filtered consensus results to UTF-8 BOM CSV and M3U

**UI pattern to match:**
- Dark slate background (`bg-slate-950`), slate borders, Tailwind utility classes
- Featured dashboard cards use `col-span-2`, colored borders (pick a new accent color not used by existing modules — suggest `rose` or `pink`), Lucide React icons
- Module badge pattern: `<span className="text-[9px] bg-{color}-500/20 text-{color}-300 ...">Module 20</span>`

**Verify before closing this phase:**
- [ ] User can import 1+ CSV files and see stats cards populate
- [ ] Type filter toggles work — excluding/including `favorite`/`artist` visibly changes counts
- [ ] Consensus Explorer shows all tracks sortable by consensus count, artist, title
- [ ] Clicking a track row expands to show all playlist names containing it (provenance)
- [ ] Threshold slider filters the table in real time
- [ ] Export produces valid UTF-8 BOM CSV with Track name, Artist name, Album, Playlist name(s), Consensus Count
- [ ] Dashboard card appears and navigates to the module
- [ ] Back button returns to dashboard
- [ ] No console errors, no white screen on bad input

---

### Phase 2: Graph Intelligence

**Read before starting:**
- Architect's Brief §5.2: Decisions 5, 6 (Louvain, shortest-path)
- Architect's Brief §5.4: Landmines — Corpus Size Memory Pressure, Louvain Instability
- Architect's Brief §5.7: LC-1 (Louvain in client-side TS — fallback plan)
- Discovery Intelligence Layer §1: Full table of graph operations (Jaccard, Louvain, shortest-path, artist constellation, blind spot finder, corpus-native taxonomy)

**You are building:**
- `services/discoveryGraphEngine.ts` — Jaccard similarity, Louvain community detection, BFS/Dijkstra shortest-path, artist constellation, blind spot finder
- `workers/discoveryGraph.worker.ts` — Web Worker for heavy computation (Jaccard, Louvain)
- New tabs in `DiscoveryLayerView.tsx`:
  - **Playlist Similarity** — sortable Jaccard matrix, "find playlists most similar to X"
  - **Artist Constellation** — co-occurrence table, "most connected to X", bridge artist identification
  - **Communities** — emergent cluster display, cluster membership lists
- Blind Spot Finder: requires optional secondary upload of Musicolet `Songs.csv` to identify artists in the corpus but absent from offline rotation

**Critical implementation notes:**
- Jaccard: **sparse computation only** — skip pairs sharing zero tracks. For 1,040 playlists, compute only the ~10–20% of pairs with actual overlap.
- Louvain: implement on the **artist-level projection** first (smaller graph, faster). If artist-level works well, optionally extend to track-level.
- Seed Louvain node ordering deterministically (sort by track/artist ID) to produce stable cluster assignments across re-imports.
- Cache all computed results in IndexedDB. Do not recompute on every view mount.
- Shortest-path: BFS on artist constellation graph (unweighted) or Dijkstra (weighted by inverse co-occurrence). Start with BFS — simpler, usually sufficient.

**Verify before closing this phase:**
- [ ] Jaccard matrix computes without freezing the UI (Web Worker)
- [ ] "Similar to X" returns plausible results for known playlist pairs
- [ ] Louvain produces stable, labeled clusters
- [ ] Artist constellation shows co-occurrence weights
- [ ] Shortest-path bridge returns a valid artist chain between two selected artists
- [ ] Blind Spot Finder works when Songs.csv is provided, gracefully hidden when not

---

### Phase 3: Playlist Profiling & Temporal Archaeology

**Read before starting:**
- Architect's Brief §5.2: Decision 7 (Playlist DNA)
- Architect's Brief §5.4: Landmine — Temporal Data Availability
- Discovery Intelligence Layer §2: Full profiling section (DNA fingerprinting, gap analysis, temporal archaeology, orphan detection)

**You are building:**
- `services/discoveryProfileEngine.ts` — Playlist DNA vector computation, gap analysis, temporal features, orphan detection
- New tab in view: **Profiling & Archaeology**
- Playlist DNA: compute identity vector per playlist from community distribution, cultural bucket distribution (if M13 data available), artist diversity (Shannon entropy), consensus profile
- Gap Analysis: identify taste zones with dense vs. sparse coverage
- Smart Merge Suggestions: surface playlists with Jaccard ≥ 0.7 as near-duplicates
- Temporal features: **gracefully optional** — only enabled if timestamp data is present in the CSV. If no timestamps: hide the archaeology sub-section, show a message explaining what data would unlock it. Do not fail. Do not show empty charts.
- Orphan Detection: gap between corpus tracks and offline Musicolet library (requires Songs.csv upload, same as Blind Spot)

**Verify before closing this phase:**
- [ ] Every playlist has a computed DNA vector
- [ ] Gap analysis surfaces at least one insight about coverage distribution
- [ ] Near-duplicate suggestions appear for playlists with high Jaccard overlap
- [ ] Temporal features are hidden (not errored) when timestamp data is absent
- [ ] If the user previously uploaded Songs.csv in Phase 2, orphan detection reuses it

---

### Phase 4: Recipe Engine & Cross-Module Pipelines

**Read before starting:**
- Architect's Brief §5.2: Decision 8 (Recipe architecture, 5 categories)
- Architect's Brief §5.4: Landmine — Cross-Module Data Shape Mismatch
- Discovery Recipes doc: **Read this in full** — it is only 47 lines and contains every recipe variant with exact parameters

**You are building:**
- `services/discoveryRecipeEngine.ts` — declarative recipe definitions, parameter validation, pipeline execution, output formatting
- New tab: **Recipes & Actions**
- 5 recipe categories with pre-configured variants (see Decision 8 in the Brief for the exact list)
- Each recipe rendered as a card with: name, description, configurable parameter inputs, "Run" button, progress indicator, results display
- `formatForModule(tracks, targetModule)` — adapter function that transforms `CorpusTrack[]` into the CSV format expected by each downstream module (M14, M13, M4, M17, M18)
- 1-click staging: "Send to Triage", "Send to Language Clustering", etc. — serializes output and navigates via `onViewSelect`
- Direct export buttons: CSV, M3U, TSV

**Critical implementation note on cross-module staging:**
The exact mechanism for passing data between modules on navigation is your decision. Options include `localStorage`, a shared React context, or `sessionStorage`. Choose what works. The constraint is: **data must survive the view switch** — `App.tsx` remounts the entire view component on navigation. Whatever you choose, implement it consistently for all module bridges and document it in a code comment.

**Verify before closing this phase:**
- [x] All 5 recipe categories render with at least 1 working variant each (16 total pre-configured variants)
- [x] Parameter inputs are functional (e.g., consensus threshold, cultural bucket selection, track limit)
- [x] "Run" executes the pipeline and displays results (< 250ms on real 78k corpus)
- [x] "Send to Triage" navigates to M14 with the correct data arriving (via localStorage buffer)
- [x] Export produces valid UTF-8 BOM CSV / M3U / TSV
- [x] Recipes that require optional data (Songs.csv, M13 buckets) degrade gracefully when that data is absent

---

### Phase 5: Curator Intelligence & Calibrated Discovery Intake

**Read before starting:**
- Architect's Brief §5.2: Decisions 9, 10 (trust weighting, curator affinity)
- User Grounding Clarification: *Newees represents positive ingestion intent and TABLE_SONGS_view.csv represents the offline library realization canon; no synthetic audition state machine or fake play-count gates (`col_num_played`). The essence is calibrated curation and discovery.*
- Roadmap & Source Notes: §Next-level cognitive engines — Curator Taste Affinity Graph, Curator Trust Weighting, Calibrated Discovery Intake

**You are building:**
- `services/discoveryCuratorEngine.ts` — trust tier assignment, affinity computation, archetype clustering, unmined candidate extraction
- New tab in view: **Curator Intelligence** (`activeTab === 'curators'`)
- Curator Trust Tiers: user assigns `editorial` (1.5×), `standard` (1.0×), or `low-signal` (0.5×) to playlists. Persisted in `localStorage`.
- Weighted consensus: consensus score = $\sum(\text{trustMultiplier})$ across containing playlists, accurately differentiating high-signal curators from bulk dumps.
- Curator Archetype Clustering: 7 editorial archetype clusters grouping curators with shared curation styles and mean taste yields.
- Taste Affinity Graph: evaluates 1,017 corpus playlists against user's `* Newees` playlists + full offline canon (`TABLE_SONGS_view.csv`). Displays ranked yield leaderboard with multi-level breakdown (offline songs, Newees tracks, offline artists).
- Calibrated Discovery Intake: surfaces high-weighted consensus gems vouched by top-aligned curators, strictly excluding existing canon, tagging `[Familiar Artist]` vs `[Novel Artist]`, and supporting 1-click downstream staging to M14 Triage & M3 Manipulator.

**Verify before closing this phase:**
- [x] User can assign trust tiers (`editorial`, `standard`, `low_signal`) to playlists
- [x] Weighted consensus score differs from raw count when trust tiers are non-uniform
- [x] Curator archetype clusters are displayed (7 archetypes with mean affinity and sample playlists)
- [x] Taste affinity ranking works when `TABLE_SONGS_view.csv` or `Songs.csv` is provided
- [x] Unmined candidate extraction strictly excludes existing Newees and offline tracks
- [x] Unmined gems are enriched with `isFamiliarArtist`, `provenanceCurators`, and `weightedScore`
- [x] 1-Click staging to downstream modules (M14 Triage, M3 Manipulator, M13 Clustering) and UTF-8 BOM exports verified
- [x] Sub-250ms benchmark verified on full 78k corpus (184ms)

---

### Phase 6: Discovery Agent Personas & Synthesis Cortex (AI Layer)

**Read before starting:**
- Architect's Brief §5.2: Decision 11 (Agent personas) & Decision 12
- User Directives & Grounding Clarification: *Replaced bottom-barrel heuristic agents with 5 high-utility cognitive discovery engines and an Interactive Cortex, directly modeled after the authentic Newees curation workflow observed across `Newees discovery`, `* Search`, `Discov Mix (dates)`, and `Best Of [Artist]` collections.*
- Existing code: `services/visionEngine.ts` — study `getAIClient()`, `getAIConfig()`, `callOpenAICompatible()`, `smartRetry()`, and the Gemini model cascade pattern

**You are building:**
- `services/discoveryAgentEngine.ts` — dense structured context RAG builder (< 2,500 tokens), multi-model cascade with timeout ceiling, response parser, and graph relinker
- New tab: **AI Agents & Cortex** (`activeTab === 'agents'`)
- 5 high-utility agent personas + Interactive Cortex:
  - 🎓 **The Newees Intake Architect**: Capacity & Multi-Bucket Balancer (curates balanced 20–50 track batches based on listener capacity, cultural bucket ratios, spacing entropy, and transition bridges)
  - 🧭 **The Corpus Cartographer**: Macro taste continents, isolated playlist island detection (zero Jaccard overlap), sequenced bridge expeditions
  - ⚡ **The Cross-Pollination Alchemist**: Cross-cultural concept mixtapes connecting distant communities using shortest-path Dijkstra bridges and curatorial liner notes
  - 🌍 **The Cultural Frontier Scout**: A&R talent hunter identifying novel uncollected artists (`isNovelArtist === true`) vouched by high-yield external curators
  - 🎭 **The Lateral Challenger**: Anti-echo-chamber explorer translating core vocal and rhythmic intensity into orthogonal global traditions
  - 🧠 **Interactive Discovery Cortex**: Natural language query console with dense RAG context and quick-prompt suggestion chips
- AI calls via the existing model cascade: `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-1.5-flash` with 28s timeout ceiling
- Local LLM support via existing OpenAI-compatible endpoint pattern (Ollama / LM Studio)
- Gate AI agents behind inline configuration card and setup banner — if no API key configured, guides user without white-screens or crashing
- Display reasoning trails: shows what data the agent analyzed, why it made each suggestion, and transition bridge notes
- 1-Click downstream staging to M14 Triage, M3 Manipulator, and M13 Clustering, plus UTF-8 BOM (`\uFEFF`) CSV, M3U, and TSV exports

**Verify before closing this phase:**
- [x] Each agent produces coherent, actionable output when given a populated corpus
- [x] AI calls use the existing cascade pattern — no new API clients
- [x] Graceful fallback when no API key / no internet / timeout (inline setup drawer & banner)
- [x] Local LLM (Ollama) works via the existing toggle
- [x] Results are exportable (CSV, M3U, TSV with universal UTF-8 BOM `\uFEFF`) and stageable to M14 Triage & M3 Manipulator

---

### Phase 7: Visualization, Infinite Constellation & Wander Odyssey Suite

**Read before starting:**
- Architect's Brief §5.2: Decision 12 (3D/2D constellation)
- Architect's Brief §5.4: Landmine — WebGL Browser Compatibility
- Architect's Brief §5.7: LC-2 (UMAP dependency), LC-3 (Wander & Traverse)
- User Directives & Innovation: *Interactive Global Cultural Music Atlas (World Map) utilizing the 20 canonical bucket classification system with direct 30s audio streaming, regional density heatmaps, flight paths, and frontier talent hunting.*
- Discovery Intelligence Layer §5: Full visualization spec

**You are building:**
- `components/ConstellationCanvas.tsx` — Hardware-accelerated 2D Canvas Infinite Galaxy & Solar System visualizer with Louvain community nebulae, Jaccard gravitational strands, and planetary track expansion with Graph Inversion Laser Beams.
- `components/WorldAtlasCanvas.tsx` — Interactive Global Cultural Music Atlas powered by 20 canonical regional centroids (`Naija`, `J-Pop`, `K-Pop`, `Filipino`, `C-Pop`, `I-Pop`, `Thai`, `Vietnamese`, `Latina`, `Français`, `German`, `Italian`, `Dutch`, `Portuguese`, `Arabic`, `English`, `African`, `Gospel`, `Instrumental`, `Other`), direct 30s preview streaming from map pins, Density Heatmap, Regional Deep-Dive Capsule drawer, Trans-Continental Flight Odyssey, and Frontier Talent Hunter.
- `components/ArtistGraphCanvas.tsx` — Interactive force-directed physics network for top 100 co-occurrence hub artists with draggable nodes, spotlight neighbor peer highlighting, and live Dijkstra/BFS shortest-path aesthetic bridge tracer.
- **Wander Odyssey Continuous Player**: Continuous topological graph walking hopping from playlist to playlist across aesthetic bridges, with auto-advancing 30s audio previews via `useAudioPreview()`, step timeline with transition rationales, 1-click downstream staging to M14 Triage & M3 Manipulator, and universal UTF-8 BOM (`\uFEFF`) M3U/CSV exports.
- **Acoustic Playlist Mood Map**: 2D Russell Circumplex Valence vs. Arousal/Energy scatter plot integrating Audimote Essentia.js Wasm audio profiles with perceptual fallbacks, quadrant filters (`exuberant`, `intense`, `serene`, `melancholic`), energy sliders, and 1-click staging.

**Verify before closing this phase:**
- [x] Infinite Galaxy renders real corpus data with Louvain community nebulae & Jaccard strands
- [x] Clicking a playlist zooms into Solar System view with orbiting planetary tracks; clicking a track shoots Graph Inversion laser strands to sibling playlists
- [x] Global Cultural Music Atlas (World Map) renders 20 canonical regional centroids with live 30s preview streaming, Regional Capsule drawer, Trans-Continental Flight Odyssey, and Frontier Talent Hunter
- [x] Force-directed artist network is interactive with draggable nodes, neighbor spotlighting, and live Dijkstra shortest-path bridge tracer
- [x] Wander Odyssey mode walks topological graph with continuous audio flow, auto-advance, and 1-click staging to M14 Triage & M3 Manipulator
- [x] 2D Acoustic Mood Map plots tracks on Russell Circumplex quadrants with Audimote profile overlay
- [x] Universal UTF-8 BOM (`\uFEFF`) verified on all M3U/CSV exports
- [x] Production build passes cleanly with zero errors (`npm run build` exit code 0)

---

## Post-Build Checklist (After Phase 7)

Before declaring the module complete:

- [x] All 8 tabs in the view render without error
- [x] The dashboard card matches the visual weight and style of existing featured cards
- [x] Back button works from every tab and sub-view
- [x] The `?` help guide modal has entries for Module 20 (update `HelpGuideModal.tsx`)
- [x] The module works with zero AI keys configured (Phases 0–5 fully functional)
- [x] The module works with a single small CSV (3 playlists, 30 tracks) — don't only test at scale
- [x] The module works with a massive CSV (1,000+ playlists, 50K+ tracks) — don't only test small
- [x] No `console.error` on any interaction path
- [x] All exports open correctly in Excel (BOM verified) and import into TuneMyMusic
- [x] `npm run build` succeeds with zero TypeScript errors
- [x] Update the README: add Module 20 to the module directory, update the module count from 19 to 20, add a Jobs to Be Done entry for the Discovery Intelligence Layer
- [x] Update the high-density summary: add Module 20 row to the §2 Module Matrix table


---

## File Map (Quick Reference)

| File | Phase | Purpose |
|:---|:---:|:---|
| `services/discoveryCorpusEngine.ts` | 0 | CSV parser, dedup, graph, consensus, stats |
| `services/discoveryCorpusDb.ts` | 0 | IndexedDB `DiscoveryCorpusDB` schema & CRUD |
| `services/discoveryGraphEngine.ts` | 2 | Jaccard, Louvain, shortest-path, artist constellation |
| `services/discoveryProfileEngine.ts` | 3 | Playlist DNA, gap analysis, temporal features |
| `services/discoveryRecipeEngine.ts` | 4 | Recipe definitions, pipeline executor, output formatting |
| `services/discoveryCuratorEngine.ts` | 5 | Trust weighting, affinity graph, Newees lifecycle |
| `services/discoveryAgentEngine.ts` | 6 | AI persona orchestration |
| `views/DiscoveryLayerView.tsx` | 1 | Main view with tabbed navigation |
| `components/ConstellationCanvas.tsx` | 7 | WebGL/Canvas constellation renderer |
| `components/ArtistGraphCanvas.tsx` | 2 | Force-directed artist graph |
| `workers/discoveryGraph.worker.ts` | 2 | Web Worker for heavy graph computation |
| `App.tsx` | 1 | Add route + dashboard card (modify) |
| `types.ts` | 0 | Shared interfaces (append only) |
