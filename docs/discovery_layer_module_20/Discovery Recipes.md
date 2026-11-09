# Discovery Recipes & Scenarios

Oct 1, 2026 · Updated to reflect 19-module production architecture + Module 20 vision

Every worked example, grouped by shape. Recipes are implemented as **declarative pipeline definitions** in Module 20 Phase 4 (`discoveryRecipeEngine.ts`). Each recipe specifies a chain of module operations with configurable parameters, rendered as 1-click executable cards in the Recipes tab.

Near-identical recipes (same tool chain, different genre/count) are merged into one entry with variants listed.

## 1. Consensus & novelty sieves (regional discovery, not yet owned)

Shared chain: Consensus Engine (M20 frequency ≥ N) → Language Clustering (M13 bucket filter) → Fuzzy Pruner (M4 — remove owned/offline tracks) → Smart Randomizer (M10 — artist spacing) → Export.

| Variant | Prompt example | Distinct parameters |
|:---|:---|:---|
| Underground Regional Deep Dive | "Find 30 authentic C-Pop & J-Pop songs curated by ≥2 playlists, not in my offline library" | consensus ≥2, buckets: C-Pop + J-Pop, output 30 tracks |
| Underground Consensus Sieve | "40 tracks across African/Naija playlists multiple curators agree on, new to my offline favorites" | consensus ≥3 ranked by curator density, buckets: Naija + African, 40 tracks, M10 entropy min-distance 3 |
| Undiscovered Consensus Pipeline | "50 songs multiple playlists agree on, not yet in my offline library" | consensus ≥3, cross-checked against Musicolet Songs.csv, then M13 language-enriched after filtering (order reversed vs. other variants) |
| Underground Cultural Sieve | "30 J-Pop/C-Pop indie tracks, multiple playlists, not mainstream, formatted for weekly Musicolet" | adds a popularity ceiling (excludes mainstream hits) alongside consensus ≥2 |
| High-Consensus Drill Sieve | "English & African drill, appears in ≥3 playlists, low mainstream popularity, strip title noise, sieve against last month's drill playlist as skeleton anchor" | adds M12 Scrape Stripper pre-pass and a named Skeleton Anchor file (`Drill_July_2026.m3u`) instead of fresh shuffle via M1 |
| **NEW: Acoustic-Filtered Consensus** | "High-energy (>0.7) tracks appearing in ≥2 playlists, BPM 120-140, not in my offline library" | consensus ≥2 + **M18 Audimote** energy/BPM filter (requires tracks to have been analyzed via Audimote) |

## 2. Curator bridge & fusion (cross-pollination between two sources)

Shared chain: Manipulator (M4 — union/intersection of two playlists) → identify bridge artists via M20 Artist Constellation / tempo cluster → Fuzzy Pruner (M4 — dedupe) → Sonic Sieve (M1 — anchor to one side, morph to the other) → Smart Randomizer (M10 — smooth energy gradient).

| Variant | Prompt example | Distinct detail |
|:---|:---|:---|
| Curator Cross-Pollination Bridge | "Bridge Curator A's Afrobeats list and Curator B's UK R&B list" | names dual-heritage bridge artists as an example: Skepta, Little Simz, Darkoo, J Hus |
| Cross-Pollination Bridge (city pop → bedroom pop) | "Bridge J-Pop city pop into English indie bedroom pop" | names bridge artists: Ginger Root, Miki Matsubara; verifies an energy gradient as final step |
| Playlist Bridge & Fusion Synthesizer | "Synthesize a hybrid 40-track playlist bridging Playlist X and Playlist Y, no duplicates of anything played this month" | uses this month's Musicolet CSV as a penalty list (deducts points for recently heard) rather than hard exclusion |
| **NEW: Algorithmic Bridge via Shortest-Path** | "Find the 3-song path connecting Mac Miller's jazzy hip-hop to Lyn Lapid's bedroom pop" | **M20 Phase 2** shortest-path engine on artist constellation graph — computes the bridge algorithmically, not hand-curated |
| **NEW: Harmonic Bridge** | "Bridge from Playlist A to Playlist B, maintaining Camelot-compatible key transitions" | Uses **M18 Audimote** Camelot key data to sequence bridge tracks with harmonic compatibility |

## 3. Full-corpus ingestion & audit pipelines

| Recipe | Prompt example | Steps |
|:---|:---|:---|
| Discovery-to-Offline Sieve Bridge (Full DAESO Loop) | "Process my latest 5,000 saved discovery tracks through my weekly DAESO routine" | M20 Consensus Matrix → 800 high-consensus tracks → M13 Language Clustering → regional buckets → M4 Pruner (remove already-explored) → M7 Splitter (20-track weekly rations) → M1 Sonic Sieve (apply last week's Skeleton Anchor) → Musicolet/Musify → feedback: high-play tracks graduate, low-play tracks penalized |
| Walled-Garden Ingestion Pipeline | "I backed up 1,040 playlists from TuneMyMusic. Clean the noise, catalog into DAESO layers, generate a master audit report" | M12 Scrape Stripper (clean headers, strip noise, fix CJK swaps) → M5 Appearance Counter (full frequency distribution) → M13 Language Clustering (artists into 20 buckets via Tier 0–4) → M7 Splitter + M6 Merger (master collections by language/decade/consensus) → M20 Corpus Stats Report |
| **NEW: Spotify Direct Intake Pipeline** | "Ingest these 12 Spotify playlist URLs, build my corpus, and show me the consensus map" | **M19 Spotify Intake** (ingest each URL via Pathfinder GraphQL) → M20 Corpus Ingestor (merge all into bipartite graph) → M20 Consensus Matrix → M13 Language Clustering → M20 Stats Dashboard |
| **NEW: Acoustic Enrichment Pipeline** | "Analyze acoustic features for my top 200 consensus tracks and plot them on the mood circumplex" | M20 Consensus Filter (top 200) → Export track list → **M18 Audimote** (batch analyze via iTunes 30s previews) → M20 Playlist Mood Map (Phase 7 visualization) |
| **NEW: Metadata Deep-Dive Pipeline** | "Enrich my top consensus tracks with full MusicBrainz metadata, cover art, and songwriting credits" | M20 Consensus Filter → Export → **M15 Deep Enrichment** (MusicBrainz + iTunes dual-source) → M20 Playlist DNA (era distribution from release dates) |

## 4. Cultural deep-dive & rebalancing

| Recipe | Prompt example | Steps / parameters |
|:---|:---|:---|
| Cultural Deep-Dive Expedition | "30 tracks: 20 high-energy Afrobeats + 10 underground Amapiano, appearing in ≥2 playlists" | M13 Language Cluster (Naija/African) → M20 Consensus filter (≥2) → M4 Fuzzy Pruner (remove live/remix dupes) → M7 Splitter (assemble 30-track balance) → Export |
| Cultural Re-Balancing Engine | "My listening is 90% English pop this month. Build a 50-track intake-regulation playlist pulling equally from Naija, I-Pop, Filipino, and Français" | M13 Language Clustering (4 buckets) → M20 Consensus ranking (top tracks per bucket) → M10 Anti-cluster Randomizer (interweave 4 regions with zero back-to-back artist collisions) → UTF-8 BOM export |
| Multi-Curator Asian Indie Discovery | "30 C-Pop/J-Pop indie tracks from 2023–2024 saved playlists, never added to any '* Newees' playlist, no artist more than twice, UTF-8 BOM for CJK rendering" | adds a temporal filter (2023–2024, if timestamps available) and an exclusion set defined by prior curated output (the Newees playlists) rather than the offline library |
| **NEW: Community-Based Cultural Discovery** | "Show me tracks from Louvain clusters I've barely explored — the 3 smallest communities in my corpus" | **M20 Phase 2** community detection → identify smallest clusters → extract tracks → subtract known favorites → M10 randomize → export |

## 5. Offline gap reconciliation

| Recipe | Prompt example | Steps |
|:---|:---|:---|
| Offline Discovery Gap Reconciler | "Across all my saved playlists, find which artists I love offline (per Musicolet Songs.csv) have new songs I don't own locally yet" | M20 Corpus Ingest → M1 Sonic Sieve on Songs.csv to identify core offline favorite artists (≥5 offline plays) → M4 Manipulator/Cross-Pruner filters corpus to those artists → M8 Local Reconciler fuzzy-matches against local file paths → output: a "Discovery Gap" playlist of tracks by favorite artists not yet owned locally |
| **NEW: Blind Spot Reconciler** | "Find artists deeply connected to my favorites in the corpus graph but completely absent from my offline library" | **M20 Phase 2** Blind Spot Finder (artist constellation weighted co-occurrence vs. Songs.csv) → extract all corpus tracks by blind-spot artists → M14 Discovery Triage (stage for audition) |
| **NEW: Dormant Treasure Expedition** | "Surface tracks from playlists I saved 2+ years ago but never revisited or downloaded" | **M20 Phase 3** Dormant Treasure detection (if timestamps available) → M20 Consensus filter (pick the highest-consensus dormant tracks) → M14 Triage staging |

## 6. Curator intelligence & graduation recipes (NEW — Phase 5)

| Recipe | Prompt example | Steps |
|:---|:---|:---|
| Curator Affinity Report | "Which playlist sources have historically led to my best offline discoveries?" | **M20 Phase 5** Curator Taste Affinity Graph → rank curators by graduation rate → display top 10 with track examples |
| Trusted Curator Sieve | "Show me consensus tracks where ≥2 of the source playlists are from my high-affinity curators (editorial tier)" | M20 Consensus Matrix with **curator trust weighting** (1.5× editorial) → filter for weighted consensus ≥3 → export |
| Weekly Newees Draft | "Generate this week's Newees candidates based on the Graduation Concierge's recommendations" | **M20 Phase 6** Graduation Concierge agent → 15-track calibrated batch → stage to M14 Discovery Triage → export as `* Newees [Cluster] Vol. N.csv` |
| Graduation Pipeline Audit | "Show me the full funnel: how many tracks are at each lifecycle stage?" | **M20 Phase 5** Newees Lifecycle dashboard → Ingested / Sieved / Incubating / Immersing / Graduated counts → visual funnel |
