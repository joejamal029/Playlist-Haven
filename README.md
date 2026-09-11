# 🎵 Playlist Haven — The Experience Engine Made Real

[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-blueviolet?style=for-the-badge&logo=vercel)](https://playlist-haven.vercel.app)
[![GitHub Repository](https://img.shields.io/badge/Source-GitHub-slate?style=for-the-badge&logo=github)](https://github.com/joejamal029/Playlist-Haven)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub_Sponsors-rose?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/joejamal029)
[![Substack Publication](https://img.shields.io/badge/Essays-Substack-amber?style=for-the-badge&logo=substack)](https://substack.com/@beyondshuffleandalgorithms)

> *"The difference between art shoved in the attic and art hung on your wall is experience. To have your art on the wall is to experience it. To find your art is to use the discovery engine; to stop there is to put it in the attic. To use the experience engine is to put your art on your wall and live with it."*

---

### 🚀 Quick Links & Documentation Hub
* 🌐 **[Launch Live Web App](https://playlist-haven.vercel.app)** *(100% Free, Zero-Install, Zero-Login, Runs Completely in Your Browser)*
* ⚡ **[High-Density Executive Summary](playlist_haven_high_density_summary.md)** *(A rapid 3-minute architectural briefing & system matrix)*
* 📘 **[Comprehensive System Brief](docs/PLAYLIST_HAVEN_SYSTEM_BRIEF.md)** *(Exhaustive 16-module technical specifications & protocols)*
* 💡 **[Essays on Beyond Shuffle & Algorithms](https://substack.com/@beyondshuffleandalgorithms)** *(Long-form explorations on music curation & tech autonomy)*

---

## 🎧 The Creed: Discovery Engine vs. Experience Engine

For close to 5 years, I logged **over 10,000 hours of listening** and manually constructed **over 1,300 playlists**. That journey led to a fundamental realization: mainstream streaming platforms are actively sabotaging our relationship with music.

Streaming platforms are built as **Discovery Engines**. They deploy dopamine-driven recommendation algorithms designed to serve constant novelty and treat songs as short-play, disposable commodities. They hide your listening metrics behind paywalls or parcel them out once a year in marketing campaigns (like Spotify Wrapped).

> *"With 10,000+ hours I thought I had seen it all, but I am truly in new terrains encountering new problems at never imagined scales."*

When you take back autonomy over your listening, you encounter a profound curatorial truth: **the ultimate music experience is an asymptote; you can love and resonate with an endless number of songs and artists. Only the right tools and organization levels will set you straight.**

---

## 🧬 The 3-Tier Musical Lifecycle

A song is not a disposable stream; it is a traveler moving through three distinct evolutionary layers, each powered by its own continuous **DAESO Loop** ($\text{Data} \rightarrow \text{Analyze} \rightarrow \text{Engineer} \rightarrow \text{Systemize} \rightarrow \text{Optimize}$):

```mermaid
graph LR
    subgraph L1["1. Discovery Layer (Pure Exploration)"]
        D1["Capture Play History"] --> D2["Anti-Repeat Subtraction"]
        D2 --> D3["Format Independence"]
    end

    subgraph L2["2. Ingestion Layer (Decision Bridge)"]
        I1["Intake Floodgate Triage"] --> I2["20 Cultural Buckets"]
        I2 --> I3["Chronology & Metadata Repair"]
    end

    subgraph L3["3. Experience Layer (Art on the Wall)"]
        E1["Sonic Sieve Rotations"] --> E2["Skeleton Anchors"]
        E2 --> E3["Multi-Year Archival Depth"]
    end

    L1 -->|"Intake Cohorts"| L2
    L2 -->|"Immersion Baskets"| L3
```

1. **Layer 1: The Discovery Layer (Pure Unencountered Exploration)**  
   Captures listening history as foundational data enabling the DAESO loop. Aggressively purifies new discovery queues by subtracting already-played songs and existing offline libraries via the **Playlist Matcher / Reconciler**—guaranteeing 100% unencountered discovery without algorithmic recirculation.
2. **Layer 2: The Ingestion Layer (The Decision Bridge & Intake Floodgate)**  
   Solves the "Intake Problem" when boundless discovery creates paralyzing volume. Personified by **Discovery Triage (Module 14)**, **Language Clustering (Module 13)**, **Deep Enrichment (Module 15)**, and **Playlist Resequencer (Module 16)**. Categorizes intake tracks into probe singles, magnet artists ($\ge 4$ songs), and validated albums ($\ge 2$ songs) with 1-click promotion, singlesification, and deferral.
3. **Layer 3: The Experience Layer (Living with Art on the Wall)**  
   Where songs achieve their qualitative and quantitative peak over months and years. Powered by the **Sonic Sieve (Module 1)**—the personal heartbeat where the DAESO loop originated—using objective play thresholds ($\ge 2$), spatial skeleton anchors, and local-first integration with **Musicolet** (Android).

---

## 🖼️ Application Interface

<table align="center">
  <tr>
    <td colspan="2" align="center"><b>Playlist Haven Dashboard & Interactive User Guide</b><br/><img src="docs/screenshots/Playlist-Haven Homepage.png" width="800"/></td>
  </tr>
  <tr>
    <td><b>Playlist Manipulator (Single, Dual & 4-Pane Quad Modes)</b><br/><img src="docs/screenshots/Playlist-Haven Playlist Manipulator.png" width="400"/></td>
    <td><b>Vision-to-Playlist (AI Cloud & Local Ollama)</b><br/><img src="docs/screenshots/Playlist-Haven Vision to AI.png" width="400"/></td>
  </tr>
  <tr>
    <td><b>Scrape Stripper & Formatter (BOM & Presets)</b><br/><img src="docs/screenshots/Playlist-Haven Appearance Counter.png" width="400"/></td>
    <td><b>Playlist Merger & Time-Grouping</b><br/><img src="docs/screenshots/Playlist-Haven Playlist Merger.png" width="400"/></td>
  </tr>
</table>

---

## 🎯 What Playlist Haven Solves ("Jobs to Be Done")

Instead of getting lost in technical jargon, here is how Playlist Haven solves real, everyday music curation challenges across each stage of your musical lifecycle:

### 🔍 Layer 1: Discovery Jobs (Pure Exploration & Anti-Repeat Purity)
| Frustration / Everyday Goal | How Playlist Haven Solves It | Core Engine |
| :--- | :--- | :--- |
| **"I want to explore new music without hearing songs I already know or have in my local library."** | Aggressively subtracts your past listening history and offline local directories using fuzzy cross-matching, guaranteeing 100% unencountered discovery. | **8. Playlist Matcher / Reconciler** |
| **"I want to spice up my playlist queues without getting repetitive back-to-back artist clusters."** | Cryptographic shuffle enforcing strict **Artist Separation Spacing**, producing true randomized flow for exploration sets. | **10. Playlist Randomizer** |
| **"I took a screenshot of a DJ set, festival lineup, or friend's playlist queue."** | Digitizes screenshots into clean, playable `.m3u` and `.csv` files via Cloud Gemini 2.5 Flash or 100% offline local vision models (Ollama / LM Studio). | **11. Vision-to-Playlist AI** |
| **"I pasted a raw YouTube text dump and it's full of video clutter and inverted titles."** | Strips video noise (`[MV]`, `1080p`, `Lyrics`), cleans sidebar leaks, and inverts `Artist ↔ Title` orientations with 1 click. | **12. Scrape Stripper** |
| **"I have tracklists from multiple sources and need to merge, split, deduplicate, or convert formats."** | 1/2/4-pane quad workspace with Jaro-Winkler fuzzy deduplication, set math (Union, Intersect, Difference), and seamless `.m3u` $\leftrightarrow$ `.csv` conversion. | **4. Playlist Manipulator** |

### 🌉 Layer 2: Ingestion Jobs (Taming the Intake Floodgate & Decision Bridge)
| Frustration / Everyday Goal | How Playlist Haven Solves It | Core Engine |
| :--- | :--- | :--- |
| **"I discovered 150 songs this month and feel total decision paralysis (The Intake Problem)."** | Tri-Philosophy intake engine: isolates **Singles (The Probe)**, clusters **Artists (Magnet $\ge 4$ vs. Emerging 2–3)**, and validates **Albums ($\ge 2$)** with 1-click batch promotion, singlesification, and deferral. | **14. Discovery Triage** |
| **"Streaming algorithms shove all non-Western music into lazy 'World' or generic 'Pop' buckets."** | Partitions thousands of tracks into **20 authentic cultural and linguistic cohorts** (Naija, J-Pop, K-Pop, Français, C-Pop, etc.) via a 5-tier waterfall engine. | **13. Language Clustering** |
| **"I converted my YouTube playlist to Spotify, and the chronological discovery order got scrambled."** | Restores authentic chronological discovery sequence using title-guarded matching and a 10-category AI musicological resolver. | **16. Playlist Resequencer** |
| **"I want real songwriting credits, true release dates, and high-res cover art."** | Links your library directly to MusicBrainz, Cover Art Archive, and Wikidata with full Work entity traversal and decoupled AI remediation. | **15. Deep Metadata Enrichment** |

### 🖼️ Layer 3: Experience Jobs (Living with Art on the Wall)
| Frustration / Everyday Goal | How Playlist Haven Solves It | Core Engine |
| :--- | :--- | :--- |
| **"I want a self-refreshing weekly rotation based on what I actually listen to, without familiar songs jumping around randomly."** | *(Requires a data-capable music app like Musicolet or Last.fm CSV export)* Dynamically sieves tracks by objective play count ($\ge 2$) while using previous playlists as **Skeleton Anchors** to preserve human spatial memory. | **1. Sonic Sieve Engine** |
| **"I want to see how my listening actually tiers out over time and separate eternal staples from fleeting one-week obsessions."** | Slices multi-thousand song databases into targeted play-count tiers (Tier 1: 50+, Tier 2: 20–49, Tier 3: 5–19) and audits longitudinal multi-year recurrence with frequency histograms. | **3. Tier Filtering & 5. Appearance Counter** |
| **"My library is a cluttered mess of fragmented weekly files, duplicate tracks, noisy video titles, and massive 2,000-song playlists that lag my device."** | Complete library hygiene: consolidates timeframes (Weekly $\rightarrow$ Monthly $\rightarrow$ Yearly), splits monster lists into numbered chapters (`Part 1`, `Part 2`), cleans tag noise via regex (Smart Renamer), and cross-prunes duplicates with fuzzy matching. | **6. Merger, 7. Splitter, 9. Smart Renamer & 4. Manipulator (Pruner)** |
| **"I have curated playlists on streaming, but I want to play them 100% offline from physical files on my local hard drive."** | Fuzzy-matches online streaming tracklists against physical local audio folders (`.mp3`/`.flac`) using Jaro-Winkler bigram similarity to produce 100% playable local `.m3u` playlists for Musicolet and offline audiophile players. | **8. Offline Matcher / Reconciler** |

<details>
<summary><b>🛠️ Click to expand the 16-Module Functional Directory by Lifecycle Layer</b></summary>

<br/>

#### Layer 1: Discovery & Acquisition Modules
* **Vision-to-Playlist AI** (`VisionToPlaylistView.tsx`): Screenshot-to-playlist OCR digitizer via Cloud Gemini or offline Ollama.
* **Scrape Stripper & Formatter** (`ScrapeStripperView.tsx`): Sanitizes messy YouTube and web scrapes into clean UTF-8 BOM CSVs.
* **Playlist Manipulator (Quad View)** (`PlaylistManipulatorView.tsx`): 1/2/4-pane multi-list organizer with fuzzy Jaro-Winkler cross-pruning.
* **Smart Renamer & Tag Editor** (`SmartRenamerView.tsx`): Batch metadata sanitizer with regex find/replace and musical acronym preservation.
* **Playlist Randomizer** (`PlaylistRandomizerView.tsx`): Cryptographic shuffle enforcing artist separation spacing.

#### Layer 2: Ingestion & Cultural Bridge Modules
* **Discovery Triage & Honing** (`DiscoveryTriageView.tsx`): High-agency intake hub for singles, resonance artists, and validated albums.
* **Language & Cultural Clustering** (`LanguageClusteringView.tsx`): 5-tier waterfall engine partitioning libraries into 20 canonical cultural buckets.
* **Playlist Resequencer & Chronology Restorer** (`PlaylistResequencerView.tsx`): Repairs scrambled track order from cross-platform conversions.
* **Deep Metadata Enrichment** (`DeepMetadataEnrichmentView.tsx`): MusicBrainz knowledge graph integration with Work entity songwriting traversal.

#### Layer 3: Experience, Rotation & Archival Modules
* **Sonic Sieve Engine** (`SonicSieveView.tsx`): Weekly listening rotation generator with play-count sieving, skeleton anchors, and penalty lists.
* **Sonic Sieve 2 (Dual Input)** (`SonicSieveView2.tsx`): Comparative dual-playlist siever resolving relative play frequencies.
* **Tier Filtering Workbench** (`TierFilteringView.tsx`): Statistical library slicing into heavy rotation, moderate, and exploration tiers.
* **Appearance Counter** (`PlaylistAppearanceView.tsx`): Historical recurrence audit separating library staples from one-off plays.
* **Playlist Merger & Grouping** (`PlaylistMergerView.tsx`): Temporal consolidation into weekly, monthly, and yearly chronological archives.
* **Playlist Splitter** (`PlaylistSplitterView.tsx`): Decomposes monolithic 2,000+ track playlists into sequential numbered chapters.
* **Playlist Matcher / Reconciler** (`PlaylistMatcherView.tsx`): Bridges streaming tracklists to local physical `.mp3`/`.flac` hard drive storage.

> *Future Roadmap*: Ongoing development includes decoupling the **Consensus Aggregator** (crowdsourced 'Best Of' cross-tabulation) into a dedicated standalone module, and packaging basic list transformations into a standalone manipulation suite.

*For complete technical architecture, API schemas, and mathematical specifications, see the [Comprehensive System Brief](docs/PLAYLIST_HAVEN_SYSTEM_BRIEF.md).*

</details>

---

## 🌉 Bridging Walled Gardens: The 3-Step Universal Loop

Streaming platforms (Spotify, Apple Music, YouTube Music) keep your listening data locked in their ecosystem. Playlist Haven acts as a **bidirectional bridge**:

```
   ┌────────────────────────────────────────────────────────┐
   │            [ Walled Streaming Services ]               │
   │            (Spotify, YouTube Music, Apple)             │
   └───────────┬────────────────────────────────┬───────────┘
               │ (1. Export CSV via             ▲ (3. Re-import clean CSV
               │  TuneMyMusic or scrapers)      │  back to streaming)
               ▼                                │
   ┌────────────────────────────────────────────┴───────────┐
   │                [ Playlist Haven Engine ]               │
   │   Sieve, Deduplicate, Cluster by Culture, Triage       │
   └───────────┬────────────────────────────────────────────┘
               │ (3. Or port clean M3U/CSV)
               ▼
   ┌────────────────────────────────────────────────────────┐
   │            [ Autonomous Music Environments ]           │
   │      Musicolet (Android) / Musify (Free YT Streaming)  │
   └────────────────────────────────────────────────────────┘
```

1. **Extract**: Export your live Spotify, Apple, or YouTube Music playlist as `.csv` or `.txt` using free utilities like TuneMyMusic, Soundiiz, or browser scrapers.
2. **Curate**: Open Playlist Haven in your browser. Apply desktop-grade power tools—sieve by play history, cluster by language, prune duplicates, or restore chronological order.
3. **Synchronize & Experience**:
   * **Back to Streaming**: Export an optimized **UTF-8 BOM CSV** and sync it back to Spotify.
   * **Into Autonomous Players**: Drop the clean `.m3u` directly into **Musicolet** (Android) or **Musify** for 100% offline, algorithm-free listening.

---

## 📱 Tailored for Offline Audiophiles: Musicolet Integrations

**Musicolet** is the undisputed gold standard for offline mobile music playback. In celebration of **Musicolet's 10-Year Anniversary**, Playlist Haven is specifically engineered to interface with Musicolet's core data channels:

* **📊 Channel A: Songs CSV (Quantitative Core)**: Ingests Musicolet's `Songs.csv` database, reads `FILE_PATH` and `PLAY_COUNT` columns with zero metadata loss, recognizes weekly increments (`Week 18` $\rightarrow$ `Week 19`), and appends play tier counts in parentheses, e.g. `Most played Songs • Week 19 - 2026 (12).csv`.
* **🎵 Channel B: M3U Playlists (Qualitative & Structural Core)**: Parses `#EXTINF` metadata and raw Android file paths (e.g. `/storage/emulated/0/Music/...`). When multiple songs share identical play counts, previous M3U playlists are used as **Skeleton Anchors** to preserve human sequencing memory.
* **📄 Channel C: Plain Text Song Lists**: Clean `[Title] - [Artist]` cataloging with hyphen-safe parsing.

> **💡 The Native Musicolet Vision**: Playlist Haven serves as both a live utility and an open conceptual blueprint. We warmly welcome collaboration with the Musicolet engineering team to bring these advanced playlist sieving and conflict-resolution capabilities into native Android controls.

---

## 🧭 Choose Your Path: Curators vs. Developers

### 🎧 For Music Lovers & Curators
* **Zero Installation**: Open **[playlist-haven.vercel.app](https://playlist-haven.vercel.app)** in any modern browser on desktop or mobile.
* **100% Client-Side Privacy**: Your audio files, playlists, and listening habits **never leave your device**. No server databases, no accounts, no tracking.
* **Interactive Help Guide**: Press <kbd>?</kbd> or click the **Guide (?)** button anywhere in the app to search workflows, FAQs, and file specifications.

### 💻 For Developers & Self-Hosters
Playlist Haven is built with **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**. It compiles to a static SPA deployed effortlessly to Vercel, Netlify, or GitHub Pages.

#### ⚡ 1-Click Startup (Windows)
Double-click `launch.bat` in the project root to install dependencies, boot Vite, and launch `http://localhost:3000`.

#### 💻 Manual Command Line
```bash
# 1. Clone repository
git clone https://github.com/joejamal029/Playlist-Haven.git
cd Playlist-Haven

# 2. Install dependencies
npm install

# 3. (Optional) Configure Google Gemini API Key in .env.local
# VITE_GEMINI_API_KEY=your_key_here

# 4. Run development server
npm run dev

# 5. Build production bundle
npm run build

# 6. (Optional) Sync to native Android via Capacitor
npm run android:build
```

#### 🔒 100% Offline Local AI (Ollama / LM Studio)
Playlist Haven supports local-first vision and language models out of the box!
1. Start your local server (e.g., `ollama run llama3.2-vision`).
2. In the app settings, set the Base URL to `http://localhost:11434/v1` and toggle to **OpenAI-Compatible**—zero cloud keys or internet connection required.

---

## 📚 Deep Technical Documentation

For deeper architecture diagrams, database schemas, and mathematical specifications:
* ⚡ **[High-Density Executive Summary](playlist_haven_high_density_summary.md)**: Architectural briefing, 16-module matrix, failover ceilings, and benchmark guarantees.
* 📘 **[Comprehensive System Brief](docs/PLAYLIST_HAVEN_SYSTEM_BRIEF.md)**: Master engineering manual detailing all 16 modules, IndexedDB object stores, MusicBrainz Work entity traversal, and defensive null-safety standards.

---

## ✍️ Author, Essays & Community

* **Substack Publication**: [Beyond Shuffle & Algorithms on Substack](https://substack.com/@beyondshuffleandalgorithms)
* **Medium Publication**: [Beyond Shuffle & Algorithms on Medium](https://beyondshuffleandalgorithms.medium.com/)
* **GitHub Sponsors**: [Support Ongoing Development](https://github.com/sponsors/joejamal029)

*“To use the experience engine is to put your art on your wall and live with it.”* 🎵
