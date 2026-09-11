Here is the complete, high-density executive briefing summarizing the philosophy, system architecture, and all 16 functional modules of **Playlist Haven**.

---

# 🎵 Executive Briefing: Playlist Haven (The Experience Engine)

---

## 1. 💡 Core Philosophy & Narrative Angle

### The Creed: Discovery Engine vs. Experience Engine
> *"The difference between art shoved in the attic and art hung on your wall is experience. To have your art on the wall is to experience it. To find your art is to use the discovery engine; to stop there is to put it in the attic. To use the experience engine is to put your art on your wall and live with it."*

* **The Problem**: Mainstream streaming platforms (Spotify, Apple Music, YouTube Music) are **Discovery Engines**. They optimize for capitalistic novelty, algorithmic feed fatigue, disposable short-play metrics, and marketing hooks (e.g. Spotify Wrapped once a year). They lock your listening history behind walled gardens and provide zero tools for deep structural manipulation.
* **The Solution**: **Playlist Haven is the Experience Engine Made Real**. It is a local-first, desktop-grade swiss army knife built to empower music audiophiles to actively engineer, prune, sieve, cluster, and live with their personal music libraries over decades.

### Cultural & Language Roots over Generic Genres
* **Rejection of Genre Labels**: Broad labels like "World Music" or generic "Pop" erase the cultural and linguistic nuance of songs.
* **Authentic Regional Partitioning**: The engine prioritizes spoken language and artist nationality across **20 canonical cultural buckets** (English, J-Pop, Naija, K-Pop, C-Pop, Thai, Vietnamese, Dutch, Arabic, German, Italian, Portuguese / Brazilian, Filipino, I-Pop, African, Latina, Français, Gospel, Instrumental, and Other) to allow listeners to consciously balance their global audio diet.

### The DAESO Curation Cycle
All curation workflows inside Playlist Haven follow a 5-step continuous loop:
$$\text{Data} \longrightarrow \text{Analyze} \longrightarrow \text{Engineer} \longrightarrow \text{Systemize} \longrightarrow \text{Optimize} \longrightarrow \text{Data}$$
1. **Data (Capture & Offline Storage)**: Raw play-history CSVs, YouTube text dumps, screenshot digitizations, MusicBrainz Web Service v2 cataloging, and local IndexedDB database stores.
2. **Analyze**: Frequency counters, missing-track reconciliations, 20-bucket language clustering, and AI precision query diagnosis.
3. **Engineer**: Dynamic play-count sieving, skeleton anchors, smart randomizers, metadata normalization, and disambiguation candidate linking.
4. **Systemize**: Chronological week/month/year archives, multi-part sub-playlist splitters, tagged M3U8 exports, and 38-column CSV master schemas.
5. **Optimize**: Fuzzy Jaro-Winkler cross-pruning, duplicate removal, penalty play lists, and offline local physical drive reconciliation.

### The Walled Garden Bridge
Playlist Haven acts as a **bidirectional bridge**:
$$\text{Streaming (Spotify/YT)} \xrightarrow{\text{Export CSV}} \text{Playlist Haven (Desktop Power Tools)} \xrightarrow{\text{UTF-8 BOM CSV}} \text{Streaming / Musify / Musicolet}$$
* Allows users to extract cloud playlists, apply desktop-grade power filters (fuzzy deduplication, play-count sieving, multi-pane quad pruning, deep metadata enrichment), and push optimized lists back to Spotify via TuneMyMusic or into offline players like **Musicolet** (Android) and **Musify**.

---

## 2. 🎨 Visual Identity & Design System

* **Theme**: Deep audiophile console / cyber-studio terminal (`slate-950` / `slate-900` dark background, translucent backdrop blur).
* **Accent Colors**: 
  * 💎 **Cyan / Sky**: Fast action, parsing, and language clustering.
  * 🔮 **Purple / Indigo**: AI processing, Gemini 2.5 Flash, and Vision OCR.
  * 🍃 **Emerald / Green**: Success states, cache hits, verified tracks, and exports.
  * 🌺 **Rose / Pink**: Destructive actions, pruner subtractions, exclusions.
  * ⚡ **Amber / Orange**: Warnings, manual overrides, and penalty lists.
  * 🧬 **Fuchsia / Violet**: Deep musicological metadata, MusicBrainz MBIDs, and Cover Art Archive.
* **Interaction Density**: High-density desktop workspace (multi-pane side-by-side grids, real-time multi-colored progress bars, inline 1-click badge reassignment, tag search, instant feedback under 100ms).

---

## 3. 🎛️ The 16 Specialized Modules

### Category A: Capture & Ingestion (Data Layer)
* **Module 11: 👁️ Vision-to-Playlist (AI OCR Digitizer)**
  * Converts screenshots of playlists, DJ tracklists, or Spotify queues into playable `.m3u` / `.csv` files.
  * Supports Cloud **Gemini 2.5 Flash** and **100% offline local LLMs** (Ollama / LM Studio via OpenAI-compatible endpoints).
* **Module 12: 🪄 Scrape Stripper & Formatter**
  * Ingests messy text dumps from YouTube channel videos, playlists, or web scrapers.
  * Automatically removes noise (`【Official MV】`, `4K`, `Lyrics`), excludes recommended sidebar video leaks, auto-splits `Title / Artist` CJK orientations, and exports clean UTF-8 BOM CSVs.

### Category B: Analysis & Cultural Organization (Analyze Layer)
* **Module 6: 📊 Song Appearance & Frequency Counter**
  * Ingests multiple playlists simultaneously to calculate exact track and artist recurrence frequencies. Identifies core library staples vs. one-off plays.
* **Module 13: 🌐 Language & Nationality Clustering Engine**
  * Multi-tiered waterfall architecture that classifies thousands of tracks into **20 canonical cultural/language buckets** in milliseconds:
    * **Tier 0**: 1,353+ pre-seeded baseline artist cache (<100ms offline) with composite multi-artist splitting (`Wizkid, Skepta, Naira Marley`).
    * **Tier 1**: Unicode Script Histogram (Han/CJK, Kana, Hangul, Devanagari, Thai, Arabic).
    * **Tier 2**: MusicBrainz Web Service v2 with modular area dictionary (`services/areaDictionary.ts`): queries ISO country-of-origin across 16+ countries and resolves regional/metropolitan areas (Lagos $\rightarrow$ Naija, Tokyo $\rightarrow$ J-Pop, São Paulo $\rightarrow$ Portuguese / Brazilian).
      * **Strict Null Cascade**: When MusicBrainz cannot decisively map to a canonical bucket, it strictly yields `null` (never poisoning cache with premature `'Other'`), allowing seamless cascade to Tier 3 AI.
    * **Tier 3**: Context-Enriched **Gemini 2.5 Flash** batch fallback (★ Primary): passes raw MusicBrainz preliminary hints (area, disambiguation, tags, artist type) directly to AI prompts to resolve cultural nuance effortlessly without brittle hardcoded regexes or static artist lists. Features automatic cascading failover (`gemini-2.5-flash` $\rightarrow$ `gemini-2.0-flash` $\rightarrow$ `gemini-1.5-flash`), 1-click `⚡ Skip to AI` accelerator, and automated 429 jitter backoff.
    * **Tier 4**: Inline manual overrides saved permanently to browser storage.
  * **Centralized Robust Playlist Sanitizer (`services/playlistSanitizer.ts`)**:
    * Ingests complex YouTube Music exports with empty `"Artist name"` columns (e.g. `My YouTube Music Library.csv`), extracting clean artist and title pairs from composite strings with an 89%+ extraction rate.
    * Parses Japanese corner quotes (`Artist「Title」` / `Artist『Title』`), Chinese thick brackets (`Artist【Title】`), book title delimiters (`《Title》`), square brackets (`Artist [ Title ]`), channel slash formats (`Title／Artist`), and reverse `Title - Artist` patterns with CJK parentheses (`Big Fish (大魚) - Zhou Shen (周深)`).
    * Strips repeated middle dots (`Yukopi · Yukopi`), hashtag signatures (`#cacgoodwomenchoiribadan`), video tags (`(Official Music Video)`, `[AUDIO ONLY]`, `[Eng/Chinese/Pinyin]`), and media file extensions (`.wmv`, `.mp3`).
  * **Resilient Script Detection & Unknown Artist Isolation**:
    * Tracks without extractable artists are isolated so they never pool together or query online APIs.
    * Individual track titles undergo Unicode Script Histogram detection (e.g. Japanese Kana/Kanji in `身売り` cleanly routes to `J-Pop` with confidence `script`).
  * **Operable Cache Studio (Full CRUD, Batch Operations & Hygiene Guard)**:
    * Search, inline editing (bucket, country, provenance notes), single-entry deletion, multi-select batch bucket reassignment, and batch removal.
    * Dedicated manual mapping modal (`+ Add Artist`) to register custom artist mappings with canonical bucket selection, country of origin, and curation notes.
    * **Strict Persistence & Hygiene Guard**: Unresolved or failed classifications are **strictly prevented from saving to `localStorage`**; legacy unverified or poisoned `Other` entries with `confidence: 'musicbrainz'` are automatically scrubbed on initialization and prior to any cache write.
    * JSON cache backup export/import and CSV ingestion.
  * **AI Remediation Suite**:
    * 1-click single-artist remediation via purple `[ ✨ AI Remediate ]` button directly in cache rows.
    * Batch reclassification for all unresolved cache entries or full cache regeneration.
    * Quick model selector (`gemini-2.5-flash` ★ Primary, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-2.5-pro`).
  * **Bidirectional Interoperability Bridge (Modules 13, 14 & 15)**:
    * 1-click **`📥 Ingest from Module 15 (IndexedDB)`** toolbar button loads enriched tracks directly from local IndexedDB with 0ms latency. The CSV parser auto-detects `Cultural / Language Bucket` headers from Module 15 exports, and the M3U parser extracts `bucket="..."` from `#EXTINF`.
    * **Propagation to Discovery Triage (Module 14)**: Curated language cohorts cleanly propagate downstream into Discovery Triage with cultural provenance badges (`[Naija]`, `[J-Pop]`), deduplication, and cross-module resonance tiering.
  * Exports single playlists, all-in-one ZIP archives, or enriched CSVs with origin metadata.

### Category C: Precision Manipulation & Deduplication (Engineer Layer)
* **Module 1: 🎛️ Sonic Sieve Logic Engine (Flagship)**
  * Automated weekly listening rotation generator based on objective play-count thresholds (e.g. $\ge 2$ plays).
  * **Skeleton Anchor**: Preserves positional listening memory when songs have identical play counts.
  * **Penalty Lists**: Deducts play points for tracks played in preceding cycles.
  * Auto-formats weekly filenames: `Most played Songs • Week 19 - 2026 (12).csv`.
* **Module 2: 🔀 Playlist Manipulator (Single, Dual & 4-Pane Quad View)**
  * Desktop power workspace for viewing and editing up to 4 playlists side-by-side.
  * Fuzzy cross-pruning, Jaro-Winkler duplicate detection, bulk reordering, and set operations (Union, Intersect, Difference).
* **Module 7: 🎲 Smart Playlist Randomizer**
  * True cryptographic or artist-spaced shuffling that avoids playing the same artist back-to-back while maintaining custom seed reproducibility.
* **Module 9: 🏷️ Smart Tag & Track Renamer**
  * Batch metadata cleaner with regex find/replace, case formatting (Title Case, UPPER, lower), and acoustic tag extraction.

### Category D: Structural & Chronological Management (Systemize Layer)
* **Module 3: ✂️ Playlist Splitter**
  * Slices monolithic 2,000-track libraries into manageable sub-playlists by track count, duration, or artist chunks.
* **Module 4: 🔗 Playlist Merger & Time-Grouping**
  * Merges multiple playlists into chronological archives (Weekly, Monthly, Yearly) with duplicate suppression.
* **Module 5: 📈 Play-History Tier Filter**
  * Ingests Musicolet `Songs.csv` and partitions tracks into play-count tiers (e.g. Tier 1: 50+ plays, Tier 2: 20–49 plays, Tier 3: 5–19 plays).

### Category E: Physical Mapping & Pruning (Optimize Layer)
* **Module 8: ✂️ Playlist Pruner & Subtracter**
  * Exact and fuzzy subtraction ($A - B$) to strip duplicate or stale tracks from master libraries.
* **Module 10: 🎯 Playlist Reconciler (Offline Matcher)**
  * Bridges streaming tracklists with local physical hard drive storage. Matches online track names against local `.mp3`/`.flac` directories using fuzzy bigram similarity to produce 100% playable local `.m3u` files.

### Category F: Discovery-to-Immersion Bridge (Triage & Honing Layer)
* **Module 14: 🧭 Discovery Triage & Honing Engine (Flagship Intelligence Layer)**
  * The essential bridge between ephemeral streaming discovery and deep, multi-month offline immersion.
  * Solves the problems of scale and cognitive overload by organizing multi-month intake cohorts across the 3 core discovery philosophies and cultural intake buckets:
    * **Language & Cultural Bucket Intake View**: The cornerstone view of intake triage (`TriageLanguageClusterView`), grouping multi-month intake cohorts into regional audio diets across the **20 canonical cultural buckets** (English, Naija, J-Pop, K-Pop, C-Pop, Thai, Vietnamese, etc.) to guarantee a proportionate global listening intake.
    * **Singles (The Probe)**: Isolates lone sparks and one-offs with instant triage actions (keep as single, deep dive artist, or stage for download).
    * **Artists (The Resonance & High-Agency Decision Hub)**: Clusters tracks by artist into **Magnet Artists ($\ge 4$ tracks)** and **Emerging Sparks (2–3 tracks)** to uncover deep engagement, featuring a high-agency conflict resolution workflow to eliminate decision fatigue on multi-track artists:
      * **Promote to Compilation / Album**: 1-click promotion that instantly exports `Album_Intake_[Artist].csv` and clears the artist from active triage view.
      * **Singlesification Mode**: In-card track selection allowing listeners to pick 1–2 probe singles (`Keep as Single`), exporting `Singlesified_[Artist].csv`, keeping chosen singles while automatically marking unselected tracks as deferred, and dismissing the artist from active view.
      * **1-Click Deferral**: Exports `Deferred_[Artist].csv` and clears the artist from active triage.
      * **Multi-Artist Batch Action Bar**: Select All Visible / Deselect All with rapid batch operations for high-volume intake:
        * **👑 Promote Selected to Albums**: Bulk promotes selected artists into album intakes, downloading `Compiled_Promoted_Albums_(${count}_tracks).csv` and clearing them from active triage.
        * **🛒 Stage Selected to Basket**: Ingests all tracks from all checked artists directly into the Immersion Download Basket in chronological sequence.
        * **⏳ Defer Selected**: Exports `Compiled_Deferred_Batch_(${count}_tracks).csv` and dismisses them from active view.
      * **Master Compiled CSV Exports**: 1-click downloads for `Compiled_Promoted_Albums_(${count}).csv`, `Compiled_Singlesified_Tracks_(${count}).csv`, and `Compiled_Deferred_Tracks_(${count}).csv` (specifically engineered to externally filter master intake playlists down to pure 1-off singles).
      * **Cultural & Language Bucket Identification**: Direct display of primary cultural buckets (`[J-Pop]`, `[Naija]`, `[K-Pop]`, etc.) on each card with a toolbar cultural filter.
      * **View Scopes & Non-Destructive Restore**: Seamlessly switch between `Active`, `Promoted`, `Singlesified`, `Deferred`, and `All` scopes with 1-click individual or global restore.
    * **Albums (The Validation Gate)**: Clusters tracks sharing an album to validate trusted, high-density candidates ($\ge 2$ or 3 tracks) before full album acquisition.
  * **Strict Chronological Sequence Preservation**: Retains the authentic 1-based discovery sequence numbers (`#1..#N`) individually per source list, supporting duplicate numbering across different sources (e.g. YouTube `#1..#95` alongside Spotify `#1..#64`) and maintaining time-priority intake slicing across all views (Singles, Artists, Albums, Language Buckets, and Download Basket).
  * **Module 16 Provenance Ingestion**: Ingests resequenced Spotify CSVs carrying explicit `Source: YouTube Music` or `Provenance` headers, ensuring converted Spotify tracks retain authentic YouTube discovery sequence and intelligence throughout triage.
  * **Immersion Download Basket & Defensive Staging Pipeline**: Staging launchpad with priority queuing (Immediate vs Secondary Wave) and multi-format download exports: Downloader Query Lists (`.txt` for yt-dlp/SpotDL), TuneMyMusic / Spotify Sync (`.csv`), and playable Musicolet playlists (`.m3u`). Protected by a zero-crash defensive comparator (`sourceOrder ?? 0`, `sources?.[0] || ''`, safe string sorting) guaranteeing seamless bulk staging.
  * **AI Intelligence Console**: Powered by Gemini 2.5 Flash / local LLM for cohort taste synthesis, micro-scene mapping, and 1-click Artist Discography Scouts (Album Artist vs Singles Specialist verdicts).

### Category G: Deep Musicological & Knowledge Graph Layer (Musicology & Offline Database Layer)
* **Module 15: 🧬 Deep Metadata Enrichment Engine (Flagship Musicology Layer)**
  * Connects your music library directly to the global open music knowledge graph (MusicBrainz Web Service v2, Cover Art Archive, and Wikidata) with strict rate-limiting ($\ge 1150\text{ms}$) and exact quoted queries (`recording:"..." AND artist:"..."`).
  * **Interactive Column Mapping & Cleaning Studio**: Ingests varied CSV exports (e.g. Musicolet `TABLE_SONGS_view.csv`, Spotify exports) with customizable column mapping, delimiter selection, and live cleaning previews.
  * **Enhanced Pre-Query Sanitizer**:
    * Strips custom remix tags (`(Ajpop3y remix)`, `(... bootleg)`, `(... flip)`), anime/show themes (`(Naruto ending theme)`, `(From Sex Education...)`), cover versions, and soundtrack/OST tags.
    * Deep non-ASCII and CJK bracket stripping (`[アンコール]`, `【...】`, `『...』`, `（...）`) and trailing non-ASCII text cleaning so foreign translations and dirty tags cleanly resolve on Pass 1.
  * **Deep Work Entity Traversal & AI Songwriting Fallback**:
    * **MusicBrainz Work Traversal**: Secondary throttled fetch to `/ws/2/work/{workId}?inc=artist-rels` to extract full songwriting credits (composers, lyricists, arrangers, writers) stored on the Work entity, populating full credits for tracks like Olivia Rodrigo's *deja vu*.
    * **AI Songwriting Credits Resolver**: When MusicBrainz has no community Work entity registered for a recording (e.g. Jon Bellion's *He Is the Same* or Hozier's *Too Sweet*), automatically invokes Gemini AI (`resolveAiSongwritingCredits`) to identify official songwriters, composers, and lyricists.
  * **Country Pseudo-Code Resolution & Artist Bio Hydration**:
    * Automatically bypasses MusicBrainz release pseudo-country codes (`XW` Worldwide, `XE`, `XU`) and resolves the authentic country of origin from artist area or begin-area ISO 3166-1 codes (e.g. `XW` $\rightarrow$ `US`).
    * `hydrateSearchMatch` populates full artist biographical context (`countryCode`, `countryName`, `beginArea`, `birthDate`, `gender`, and external links), cached in IndexedDB `cached_artists` with 0ms subsequent lookup overhead.
  * **Decoupled 2-Stage High-Throughput Pipeline**:
    * **Stage 1: Non-Blocking Primary Ingestion**: High-speed ingestion loop processing thousands of tracks at 1 req/sec directly to 100% completion without freezing or inline batch awaiting. Tracks requiring resolution are queued cleanly.
    * **Stage 2: Batched AI Remediation**: Runs automatically upon completion or on-demand via `⚡ AI Precision Re-Search`, resolving edge cases without impacting ingestion throughput.
  * **Two-Fold AI Remediation Architecture**:
    * **Fold 1 (AI Precision Query Surgeon + MusicBrainz Retry)**: Uses **Gemini 2.0 Flash** (with automatic failover to **Gemini 1.5 Flash**) or local LLMs to diagnose distorted tags, cross-language titles (e.g. BIBI's *Very, Slowly* $\rightarrow$ `아주, 천천히`), isolate canonical syntax, and re-query MusicBrainz.
    * **Fold 2 (AI Musicological Fallback Synthesis)**: When MusicBrainz genuinely has 0 records (unreleased bootlegs, underground demos, obscure pressings), Gemini synthesizes structured musicological fallback data with a clear visual badge: `⚠️ AI Fallback (Not on MusicBrainz)`.
    * **1-Click Row AI Remediation**: Dedicated purple `[ ✨ AI Remediate ]` button directly in table row action columns for instant single-track remediation with zero batch overhead.
    * **Integrated AI Configuration & Live Test**: Built-in AI Settings modal in the Module 15 header and banner with live status badge (`AI Ready` / `Configure AI Key`), multi-tier API key resolution, and 1-click connection test.
    * **Markdown-Proof JSON Parsing**: Universal parser (`cleanAndParseJson`) resilient against markdown code fences (````json ... ````).
  * **Album Artwork Accessibility & In-App High-Resolution Lightbox**:
    * **Direct Image Endpoints**: Resolves Cover Art Archive URLs directly to the high-resolution JPEG (`/release/{mbid}/front`), permanently eliminating raw JSON text redirects (`index.json`).
    * **In-App High-Resolution Lightbox Modal**: Clicking any album art thumbnail opens a cinema-styled lightbox overlay with 1-click image download (`{artist} - {album}_artwork.jpg`), direct raw image tab opening, and MusicBrainz release links.
  * **Multi-Step Search & Resilient String Matching**:
    * **Unicode Normalization**: Normalizes Unicode hyphens (`\u2010`–`\u2014`), smart quotes, and punctuation so artists like `K‐Trap` match `K-Trap` and `K Trap` at 100%.
    * **Dual-Title Confidence Matching**: Evaluates candidate confidence against both raw title and clean title, preventing version or remix tags (`- Remix`) from artificially dropping match score below threshold.
    * **Direct 1-Request Search Parsing**: Parses recording metadata directly from search results (`parseSearchRecording`), eliminating redundant secondary API roundtrips.
  * **Persistent IndexedDB Architecture & Strict Persistence Guard**:
    * Browser-native database (`PlaylistHavenMetadataDB` v1) storing `enriched_tracks`, `cached_artists`, and `cached_releases` with compound key normalization (`artist:::title`). Features offline JSON database export and 1-click preloading to eliminate redundant API requests entirely.
    * **Strict Persistence Guard**: Failed or unresolved tracks (`needs_resolution`) are **strictly never written to IndexedDB**, guaranteeing cache hits remain 100% verified.
    * Active `purgeUnresolvedTracks()` hygiene routine scrubs legacy unverified placeholders.
  * **Dual Ingestion Modes**:
    * ⚡ **Fast Mode (Skip Cached)**: Bypasses previously enriched tracks in IndexedDB for instantaneous 0ms processing.
    * 🔄 **Update Mode (Force Refresh)**: Re-queries MusicBrainz to refresh release lineage, new album editions, or community edits.
  * **Disambiguation & Dossier Inspection**:
    * 🔍 **Manual Disambiguation Drawer**: Live real-time search displaying candidate recordings with match confidence scores, release titles, track counts, release years, and 1-click linking.
    * **Interactive Slide-Over Musicological Dossier with Self-Healing**: Deep inspection drawer with high-resolution artwork, direct hyperlinks to `musicbrainz.org`, full songwriting credits breakdown, artist biographical data, external links (Spotify, Apple Music, Wikidata, Discogs, YouTube), automatic background self-healing (`[ ⚡ Auto-hydrating... ]`), and on-demand `[ ✨ AI Resolve Credits ]`.
  * **Dense Multi-Format Exporters**:
    * 📊 **38-Column CSV (UTF-8 BOM)**: Industry-grade metadata spreadsheet compatible with Excel, Google Sheets, and LibreOffice.
    * 📦 **Master Dataset JSON**: Complete hierarchical archive of all tracks, artist bios, and release context.
    * 🎵 **Extended Tagged M3U8**: Playlist with embedded MBID, duration, year, and cultural bucket tags.
    * ⚡ **Downloader Query TXT**: Formatted tracklist for automated batch downloaders (SpotDL / yt-dlp).
  * **Bidirectional Interoperability Bridge with Module 13**: Automatically populates `setCachedClassification` with country and bucket metadata during enrichment. Module 13 can ingest directly from Module 15's IndexedDB store in 1 click.

### Category H: Chronological Restoration & Conversion Bridge (Data Hygiene & Repair Layer)
* **Module 16: 🔄 Playlist Resequencer & Chronology Restorer (Flagship Conversion Repair Layer)**
  * **The Cross-Platform Conversion Problem**: When converting YouTube playlists to Spotify for offline downloading and audio consistency, conversion errors regularly occur. Tracks that fail to map are deleted, and wrongly mapped tracks are manually found on Spotify and appended to the **end** of the playlist. This completely shatters chronological discovery memory (e.g. tracks originally discovered at positions `#2`, `#7`, `#17`, `#34`, `#40`, `#64`, `#67` in YouTube are stranded at `#58..#64` in Spotify).
  * **Two-Tier Matching Architecture (Zero Brute-Force Placeholders)**:
    * **Tier 1 (Fast Deterministic Baseline)**: Cleans video metadata noise using `cleanCompositeTrack` (stripping MV noise, brackets, Japanese corner quotes, CJK separators) and executes title-guarded fuzzy matching to instantly match clean tracks offline.
    * **Tier 2 (Universal AI Edge-Case Resolver)**: Standard 10-category musicological resolution template dispatches ambiguous edge cases to **Gemini 2.5 Flash** or local LLMs without writing brittle, hardcoded translation dictionaries:
      1. *Translations* (`Martian` $\leftrightarrow$ `火星人`, `Snake` $\leftrightarrow$ `へび`)
      2. *Transliterations / Romanizations* (`とうきょう` $\leftrightarrow$ `TOKYO`, `原点廻帰` $\leftrightarrow$ `Genten Kaiki`, `宇多田ヒカル` $\leftrightarrow$ `Hikaru Utada`)
      3. *Orthography / Scripts* (Traditional `斑馬` $\leftrightarrow$ Simplified `斑马`)
      4. *Collaboration Inversions* (`A feat. B`, `A & B`, `A vs. B`)
      5. *OST, Drama & Subtitle Noise* (`电视剧《...》插曲`, anime OP/ED)
      6. *Remix & Version Aliases* (`Parisian Soul Edit`, `Acoustic`, `Remastered`)
      7. *Medley Splits*
      8. *Character & Video Game Themes*
      9. *Spelling Drift*
      10. *Definitive Non-Matches* (preventing false positives)
  * **Execution Modes**:
    * **On-Demand AI (Default)**: Review deterministic matches and omitted tracks first, then trigger `"✨ Resolve N Edge Cases with AI"`.
    * **Auto-AI on Ingest**: Immediately resolves edge cases in the background upon file loading.
  * **Side-by-Side Dual-Pane Visualizer & Shift Metrics**:
    * **Reference Pane**: Displays baseline YouTube `#1..#N` with green `➔ Spotify #K` links and muted `Omitted in Conversion` badges.
    * **Target Pane**: Shows restored chronological order `#1..#M`, green shift badges (`↑ +56 (was #58)`), match category pills, manual search-and-bind drawer, and fine-grained up/down nudges.
    * **Interactive Quick-Jump Symbol & Hover Popout**: Clean, uncluttered UI concealing the jump input by default; hovering over or clicking the `#` symbol reveals the input to jump tracks directly. Jump target dynamically resolves to the actual 1-based index the song occupies after all remediations (fuzzy matching, AI resolution, and drag-and-drop adjustments).
    * **In-Row Single & Batch Deletion**: Dedicated `Trash2` action on every target row to immediately remove unwanted tracks with dynamic real-time recalculation of sequence indices and shift offsets, plus batch deletion for multi-selected tracks.
    * **Drag-and-Drop Resequencing**: Fluid row dragging with visual placement indicators (above/below) and edge-proximity auto-scrolling.
    * **Batch Reordering Toolbar**: Multi-select tracks and move them to Top, Bottom, or a specific position `#P`.
  * **Source Provenance & Multi-Format Exporters**:
    * **Resequenced Spotify CSV (UTF-8 BOM)**: Maintains all native Spotify IDs, ISRCs, and metadata columns while embedding an explicit `Source: YouTube Music` or `Provenance` header for seamless downstream ingestion into Module 14 (Discovery Triage) and Module 13 (Language Clustering).
    * **Downloader Query List (`.txt`)**: Clean `Artist - Title` queue for SpotDL, yt-dlp, and batch download tools.
    * **Playable M3U Playlist (`.m3u`)**: Standard `#EXTINF` playlist.

---

## 4. ⚙️ Technical Architecture & Ecosystem

* **100% Client-Side SPA (Zero-Backend)**: Runs entirely in the browser using React, Vite, and Tailwind CSS. Deployed statically on Vercel with zero server maintenance.
* **Root ErrorBoundary & Global Fault Isolation**:
  * Root React Error Boundary (`components/ErrorBoundary.tsx`) encapsulating the entire view renderer. Catches unhandled runtime exceptions or edge-case null attributes without unmounting the application into a blank screen.
  * Provides detailed collapsible stack traces and 1-click recovery actions ("Return to Safe State" and "Reload Page").
* **Universal Null-Safety & Defensive Data Standards**:
  * Comprehensive null-coalescing and fallback protections across all sorting pipelines (`(a.sourceOrder ?? 0) - (b.sourceOrder ?? 0)`), source arrays (`sources?.[0] || ''`), string comparators, and canonical bucket lookups (`CANONICAL_BUCKETS`), ensuring smooth operation across irregular or missing CSV headers.
* **AI Model Tier Hierarchy & Resilience**:
  * **Primary Workhorse (★)**: **`gemini-2.5-flash`** — Validated across all AI engines (Vision OCR, Language Clustering, Cohort Triage, Fold 1/2 Metadata Enrichment, and Module 16 Resequencer Edge-Case Resolution).
  * **Secondary & Tertiary Failover**: Cascades transparently to **`gemini-2.0-flash`** and **`gemini-1.5-flash`** if the primary model encounters rate limits, network errors, or exceeds the **25-second `Promise.race` safety ceiling**.
  * **Local-First AI**: 100% offline, privacy-first local LLM execution via OpenAI-compatible endpoints (Ollama / LM Studio) for both vision and language tasks.
* **Persistent Dual Storage Tiers**:
  * `localStorage`: Fast UI state, user settings, API keys, and custom rule presets.
  * `IndexedDB` (`PlaylistHavenMetadataDB` v1): High-capacity object stores (`enriched_tracks`, `cached_artists`, `cached_releases`) capable of storing hundreds of thousands of tracks with rich nested JSON and Cover Art URLs without browser memory pressure.
* **Native Mobile Compilation**: Integrated with **Capacitor** to build and sync directly to native Android APKs (`npm run android:build`).
* **Strict API Compliance**: Built-in 1,150ms token-bucket rate limiter complying strictly with MusicBrainz API rate-limit policies.
* **Universal UTF-8 BOM Standards**: Prepending `\uFEFF` across all exported CSVs preventing character corruption across Excel, Google Sheets, and Windows environments.
* **Format Standards**: Native support for `#EXTM3U` / `#EXTINF`, Musicolet `Songs.csv` with UTF-8 BOM, TSV, and plain text.
* **External Links**:
  * **GitHub**: [github.com/joejamal029/Playlist-Haven](https://github.com/joejamal029/Playlist-Haven)
  * **Sponsors**: [github.com/sponsors/joejamal029](https://github.com/sponsors/joejamal029)
  * **Substack**: [substack.com/@beyondshuffleandalgorithms](https://substack.com/@beyondshuffleandalgorithms)