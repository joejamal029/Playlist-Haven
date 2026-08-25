# Playlist Haven - The Experience Engine Made Real

[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-blueviolet?style=for-the-badge&logo=vercel)](https://playlist-haven.vercel.app)
[![GitHub Repository](https://img.shields.io/badge/Source-GitHub-slate?style=for-the-badge&logo=github)](https://github.com/joejamal029/Playlist-Haven)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub_Sponsors-rose?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/joejamal029)
[![Substack Publication](https://img.shields.io/badge/Essays-Substack-amber?style=for-the-badge&logo=substack)](https://substack.com/@beyondshuffleandalgorithms)

> *"I once saw a quote about how the difference between art shoved in the attic and art hung on your wall is experience. To have your art on the wall is to experience it. To find your art is to use the discovery engine; to stop there is to put it in the attic. To use the experience engine is to put your art on your wall and live with it."*

**Playlist Haven** is a premium, state-of-the-art playlist utility suite built to empower music audiophiles to take back autonomy over their media libraries, resist algorithmic feed fatigue, and intentionally cultivate their own listening environments. It serves as the physical realization of the **Experience Engine**—a local-first "swiss army knife" designed to organize, sort, slice, sieve, and bridge music assets with absolute desktop-grade control.

---

## 🎧 My Story & Philosophy

For close to 5 years, I logged **over 10,000 hours of listening** and manually constructed **over 1,300 playlists**. My meticulous process was driven by a deep realization: mainstream streaming platforms are actively sabotaging our relationship with music. 

Streaming sites focus entirely on the **Discovery Engine**—deploying capitalistic, dopamine-driven recommendation algorithms built to feed us constant novelty and treat songs as short-play, disposable commodities. They hide our listening metrics, keep them behind paywalls, or parcel them out once a year in marketing campaigns.

**I built Playlist Haven to make the Experience Engine real.** It is built on the core belief that songs do *not* have short play values and that the ideal music experience must balance discovery with depth. By digitizing our music habits, we can establish the **DAESO Loop**:

```mermaid
graph LR
    A[Data] --> B[Analyze]
    B --> C[Engineer]
    C --> D[Systemize]
    D --> E[Optimize]
    E --> A
```

This application was designed to serve as the technological engine for my music blog, **Beyond Shuffle & Algorithms**, where I explore the deep intersections of technology, listening autonomy, playlist functional layers, and the preservation of art in an age of algorithmic feed fatigue. 

*   **Substack Publication**: [Beyond Shuffle & Algorithms on Substack](https://substack.com/@beyondshuffleandalgorithms)
*   **Medium Essays**: [Beyond Shuffle & Algorithms on Medium](https://beyondshuffleandalgorithms.medium.com/)
*   **GitHub Sponsors**: [Support the Developer on GitHub Sponsors](https://github.com/sponsors/joejamal029)

---

## 🖼️ Application Interface & Features

<table align="center">
  <tr>
    <td colspan="2" align="center"><b>Playlist Haven Dashboard & Help Guide</b><br/><img src="docs/screenshots/Playlist-Haven Homepage.png" width="800"/></td>
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

## 💡 Searchable Interactive Help & Philosophy Modal (`?`)

Anyone exploring the application can press the **`Guide (?)`** button in the header, click the **New to Playlist Haven? Quick Tour (?)** banner, or press <kbd>?</kbd> / <kbd>Shift</kbd> + <kbd>?</kbd> from anywhere to open the comprehensive user guide:

*   **1. 💡 Why Playlist Haven (Philosophy Tab)**: In-depth essays on the Experience Engine creed, breaking streaming walled gardens, the DAESO curation cycle, and representing regional & Chinese/CJK artists.
*   **2. 🚀 Quick Start & Workflows**: Step-by-step guides for bridging walled gardens, 60-second YouTube-to-Spotify scrapes, weekly Musicolet rotation sieving, Vision AI digitizing, and Language & Nationality library clustering.
*   **3. 🎛️ Tool-by-Tool Guide**: Detailed interactive breakdowns for all 13 modules.
*   **4. 📖 Formats & Glossary**: Complete specifications for M3U/M3U8 `#EXTINF`, Songs CSV, plain text tracklists, UTF-8 BOM (`\uFEFF`), and Jaro-Winkler bigram similarity.
*   **5. ❓ FAQ & Troubleshooting**: Practical answers covering browser automation scripts, offline LLMs, and Excel encoding.
*   **🔍 Instant Multi-Field Search Engine**: Search across questions, answers, tool names, and tags (`#spotify`, `#scrape`, `#cjk`, `#bom`, `#musicolet`, `#sieve`, `#ollama`, `#language`, `#clustering`).

---

## 🌉 Bridging Walled Gardens: Streaming Extension Pipeline

Mainstream streaming services (Spotify, YouTube Music, Apple Music) are walled gardens that restrict how you manage your music, offering zero advanced sorting, fuzzy pruning, multi-tier play-count filtering, or structural manipulation. 

**Playlist Haven acts as a bidirectional bridge that extends local desktop-grade power tools to your cloud streaming libraries:**

```
   ┌────────────────────────────────────────────────────────┐
   │            [ Walled Streaming Services ]               │
   │            (Spotify, YouTube Music, Apple)             │
   └───────────┬────────────────────────────────┬───────────┘
               │ (Export via third-party web    ▲ (Import manipulated CSVs
               │  tools like TuneMyMusic)       │  back to streaming lists)
               ▼                                │
   ┌────────────────────────────────────────────┴───────────┐
   │                [ Playlist Haven Engine ]               │
   │  Curate, Sieve, Deduplicate, Fuzzy Cross-Prune, Sort   │
   └───────────┬────────────────────────────────────────────┘
               │ (Port final sieved file)
               ▼
   ┌────────────────────────────────────────────────────────┐
   │            [ Autonomous Music Environments ]           │
   │     Musify (Free YouTube Streaming) / Musicolet        │
   └────────────────────────────────────────────────────────┘
```

### The 4-Step Universal Extension Loop:
1.  **Extract**: Export your live Spotify, Apple Music, or YouTube Music playlists as a `.csv` or `.txt` file using online synchronization tools (e.g., *Tune My Music* or *Soundiiz*) or browser text scrapers.
2.  **Transform**: Import the CSV into Playlist Haven's web suite. Apply dynamic play-count filters, run multi-pane quad view manipulations, fuzzy-prune duplicates across different open lists, or sieve tracks based on play-history.
3.  **Synchronize**: Export the optimized **UTF-8 BOM CSV** from Playlist Haven and upload it back to Spotify or YTM via the same sync tools—instantly extending local power-user sorting, sieving, and deduplication features directly to your live streaming experience.
4.  **Autonomous Transition**: Alternatively, route sieved CSVs directly into **Musify** (which enables free streaming of YouTube content) or offline players like **Musicolet** (the legendary Android local file manager celebrating its 10th anniversary).

---

## 📱 Tailored Musicolet Integrations

**Musicolet** stands as the absolute gold standard for offline music library management, representing the ultimate tool for listeners who demand complete autonomy over their media. In celebration of **Musicolet's 10-Year Anniversary**, Playlist Haven is engineered specifically to interlock with the **two primary data export channels** Musicolet makes available, enabling a highly functional, offline-first curation ecosystem:

### 📊 Channel A: Songs CSV Exports (The Quantitative Core)
Musicolet's raw `.csv` music databases represent your objective play-history. Playlist Haven ingests these exports to perform precise mathematical library manipulations:
*   **Musicolet-Specific Headers**: The engine parses Musicolet's native CSV outputs, mapping `FILE_PATH` and `PLAY_COUNT` columns directly.
*   **BOM Handling**: Handles Musicolet's default UTF-8 Byte Order Mark (BOM) headers cleanly, ensuring track paths are not corrupted by hidden file markers during file-reading.
*   **Zero-Loss Metadata Preservation**: Caches all additional CSV metadata rows (artists, albums, duration, composers) to ensure sieved and edited files preserve exact original metadata blocks upon download.
*   **Timeframe-Bound Filename Tracking**: Recognizes and auto-increments the weekly naming convention:
    `Most played Songs • Week X - YYYY.csv` ──► `Most played Songs • Week X+1 - YYYY.csv`
*   **Parenthesized Play Tier Counter**: Appends your custom play count threshold statistics directly to the output filename in parentheses, e.g. `Most played Songs • Week 18 - 2026 (12).csv` where `12` represents the count of tracks at your exact play tier limit.

### 🎵 Channel B: M3U Playlist Exports (The Qualitative & Structural Core)
The foundational `.m3u` / `.m3u8` playlist format represents your active, human-curated music taste. Playlist Haven was designed around these files to make advanced playlist curation possible:
*   **Highly Portable M3U Metadata Parsing**: Playlist Haven extracts and writes standard `#EXTM3U` and `#EXTINF` metadata records, parsing durational metadata, titles, and artists smoothly.
*   **Preserving Android File Paths**: Successfully ingests and outputs custom, system-specific directories—including raw Android external/internal storage pathways (e.g. `Android/media/...`, `Music/SpotiFlyer/...`, `Download/...` or custom system music folders like `ultima/ultima/...`). This allows you to import manipulated playlists straight back into Musicolet's database with zero broken file paths.
*   **Conflict Resolution & Skeleton Anchor**: Solves play-count positional conflict. When dozens of tracks possess identical play-history scores, the M3U playlist export is utilized as a "skeleton anchor" to preserve the structural sequencing of your tracks and resolve rating position ties cleanly.

### 📄 Channel C: Plain Text Song Lists (The Text-Based Catalog)
Simple `.txt` file representations containing track records formatted as `[Title] - [Artist]` line-by-line are fully supported:
*   **Intelligent Separator Parsing**: Splits track entries using `lastIndexOf(' - ')` to correctly isolate the artist name on the right, preserving version tags, cover tags, and sub-titles containing hyphens in the song title.
*   **Fuzzy and AI Matching**: Can be matched directly against offline files and library databases in the Reconciler (Offline Playlist Matcher) to resolve local paths.
*   **Dual-Export Actions**: Can be manipulated and exported back to clean `.txt` song lists, or converted directly into standard playable `.m3u` playlists.

---

## 🔮 My Native Musicolet Dream & Future Roadmap

While Playlist Haven serves as a standalone web utility, my ultimate vision is **native integration**. Having manually curated over 1,300 playlists inside Musicolet over 5 years, I designed this application to act as both an open conceptual blueprint and an open invitation for future development:

*   **Unlocking the M3U Potential**: Musicolet is the undisputed king of offline playback, but what is **fundamentally missing is a powerful, deep way of working with playlists—specifically, unlocking the vast, untapped potential of native M3U playlist manipulation**. Playlists should not be static, isolated listings of files; they are active, dynamic layers of qualitative taste and structural experience.
*   **Direct Collaboration Invitation**: **I would absolutely love to collaborate directly with the Musicolet development team** to bring these features to life natively on Android. By integrating these advanced Experience Engine capabilities—such as automated play-count sieving, fuzzy cross-playlist duplicates pruning, and skeleton anchor conflict resolution—directly as native, on-device controls within Musicolet, we can revolutionize how offline libraries are managed.

---

## 🛠️ Comprehensive Module Specifications

Playlist Haven features 13 specialized functional views, mapped directly to the **DAESO** playlist layers:

### 1. 🎛️ Sonic Sieve Logic Engine (`SonicSieveView.tsx`) [Integration Layer]
The ultimate weekly playlist generator that automates your listening rotation:
*   **Musicolet CSV & Classic M3U Modes**: Choose between raw M3U parsing and parsing Musicolet Songs CSV exports. Includes BOM (Byte Order Mark) stripping and quote-sanitized parsing to handle UTF-8/Windows-1252 character sets.
*   **The Quantitative Sieve**: Filter tracks using a dynamic play count threshold (customizable range, defaulting to my personal sweet spot of `≥ 2 plays`).
*   **The Skeleton Anchor**: When dozens of songs are tied at the exact same play count, typical sorters introduce noise and destroy positional memory. The Anchor playlist acts as a "skeleton," preserving your original structural order and inserting new, lower-ranked tracks cleanly at the end.
*   **Dynamic Filename Formatting**: Automatically matches the weekly `Week X - YYYY` format in the anchor filename, increments the week count, and appends the exact track count matching your play tier in parentheses, e.g., `Most played Songs • Week 18 - 2026 (12).csv`.
*   **Penalty Playlists**: Ingest one or more playlists/CSVs to deduct 1 play point per track per file (ideal for "Exclusion lists" or "Last Week's" plays).

### 2. 🎚️ Playlist Manipulator (`PlaylistManipulatorView.tsx`) [Analytic & Capture Layer]
An extensive interactive workbench to rearrange, slice, and cross-reference multiple M3U, CSV, or TXT playlists simultaneously:
*   **Multi-Pane Layout Support (1, 2, or 4 Viewing Panes)**: Toggle between Single-Pane, Dual-Pane, or 4-Pane Quad View modes to view and manipulate up to 4 distinct playlist files side-by-side.
*   **Universal Toolbar Features**: Universal Move Top, Move Bottom, Cross-Prune, Combine, and Copy To across single-pane and multi-pane views.
*   **Fuzzy Cross-Prune**: Cross-reference multiple loaded playlists to identify and remove fuzzy duplicate matches across files using Jaro-Winkler bigram similarity with customizable matching strictness percentages.
*   **Plain Text Support**: Upload plain text track lists (`.txt` files formatted as `Title - Artist`). Rearrange or sort them, and export them back to clean text lists or convert them directly to standard playable M3U playlists.
*   **Play Count Filters**: Dynamically parses play statistics from CSV fields to let you select, deselect, replace, or intersect tracks using custom play-range boundaries—passing completely silently for files without play metadata.
*   **Interactive Drag-and-Drop Grid**: Move tracks manually with smooth drag previews and responsive container auto-scrolling.
*   **Numeric & Alphabetical Sorting**: One-click sorting by play count (Highest plays first) or alphabetical properties (Title, Artist, Album).
*   **Deduplication & Multiple-Shuffles**: Clean duplicate tracks instantly, invert selections, or perform complex randomizations to keep stale playlists fresh.

### 3. 🧩 Playlist Merger (`PlaylistMergerView.tsx`) [Storage Layer]
Merge multiple playlist files into cohesive groups:
*   **Standard Merge**: Combine multiple M3U or CSV files into a single unified playlist file, applying automatic deduplication.
*   **Timeframe Merge**: Detects date formats in filenames (using formats like `DD-MM-YY`, `YYYY-MM-DD`, etc.) and groups playlists into `Week`, `Month`, `Quarter`, or `Year` timeframes, generating a ZIP archive of individual merged playlists.

### 4. ✂️ Playlist Splitter (`PlaylistSplitterView.tsx`) [Storage Layer]
Divide a large playlist into equal smaller parts:
*   **Interactive Slices**: Input a custom division range (2 to 20 parts) and slice large lists while fully maintaining the original track ordering.

### 5. 🧽 Playlist Pruner (`PlaylistPrunerView.tsx`) [Analytic Layer]
Perform smart track exclusions:
*   **Exclusion Matrix**: Ingest a single "Source Playlist" (The Eraser) and multiple "Target Playlists" to strip out source tracks from target files instantly, outputting cleaned lists with detailed statistics.

### 6. 🎲 Playlist Randomizer (`PlaylistRandomizerView.tsx`) [Engineering Layer]
Apply advanced shuffling algorithms to playlist files:
*   **Weighted & Group Shuffling**: Supports randomizing tracks while keeping artists grouped, shuffling within custom segments, or executing complete shuffles to revive stale playlists.

### 7. 🏷️ Smart Renamer (`SmartRenamerView.tsx`) [Systemization Layer]
Perform batch modifications on track directories:
*   **Path Mapping**: Batch rename playlist directories, track file paths, titles, or tags with advanced string substitutions, casing shifts, prefixes, and suffixes.

### 8. 🎨 Playlist Appearance & Aesthetics (`PlaylistAppearanceView.tsx`) [Engineering Layer]
Edit metadata blocks like EXTINF tags, covers, playlist titles, file directory mappings, descriptions, and custom track titles.

### 9. 📊 Tier Filtering (`TierFilteringView.tsx`) [Analytic Layer]
Filter playlist tracks into distinct high, medium, or low tiers based on custom play count boundaries, exporting segmented tier files.

### 10. 👁️ Vision-To-Playlist (`VisionToPlaylistView.tsx`) [Capture Layer]
AI-assisted screenshot playlist converter. Upload images or screenshots of online playlists, and the visual engine will extract track titles and artists, automatically resolving them into clean, standards-compliant M3U or CSV files. Supports Cloud (Gemini) and 100% offline local vision models (Ollama / LM Studio).

### 11. 🔗 Offline Playlist Matcher & Reconciler (`PlaylistMatcherView.tsx`) [Integration & Capture Layer]
Reconcile and align tracklist variations between a shared playlist (M3U, CSV, or TXT) and your local library database:
*   **Fuzzy Bigram Similarity**: Automatically maps matching titles and artists using robust Jaro-Winkler string-cleaning and bigram score comparison.
*   **AI Assist Lookup**: Send low-confidence candidate tracks in token-optimized chunks to Gemini to identify and match the correct candidate.
*   **Real-time Searchable Resolution Overlay**: Quickly search your entire library database inline to manually assign matches for unresolved tracks.
*   **Export Options**: Download a playable local M3U playlist with your local file paths, or export a CSV list of all missing songs.

### 12. 🪄 Scrape Stripper & Formatter (`ScrapeStripperView.tsx`) [Capture & Curation Layer]
Standardized, automated YouTube channel and playlist scrape parser & formatter:
*   **Standardized Manual & Automated Scrape Parser**: Ingests raw text dumps from YouTube channel pages, playlists, and browser scrapes (supports leading durations or compact formats, with zero header noise).
*   **Automated Recommendation Exclusion**: Truncates output automatically at recommendation section boundaries (`Recommended videos`, `Recommended playlists`, `Related videos`, `You might also like`, `People also watched`).
*   **Smart Metadata Normalization**:
    *   **Featured Artist Normalizer**: Extracts `feat.` / `ft.` from song titles into the Artist field (`Main Artist feat. Featured Artist`).
    *   **Smart Title Case**: Normalizes capitalization while intelligently preserving acronyms like `DJ`, `MC`, `OP`, `ED`, `MV`, `HD`, `OST`, and `REMIX`.
    *   **CJK & Slash Delimiter Orientation**: Handles `Title / Artist` ordering for Japanese and CJK music channels (e.g. Bella Ping's channel).
*   **1-Click Swap & Batch Artist Manager**: 1-click **Swap Artist ↔ Title** button and **Batch Set Artist** overrider for complex edge cases.
*   **Custom Rule Presets**: Save, load, and persist custom keyword exclusions and formatting rules to `localStorage`.
*   **Multi-Format UTF-8 BOM Exports**: Export cleaned lists directly to **CSV**, **TSV**, **TXT**, **M3U**, or **Clipboard** with UTF-8 Byte Order Marks (`\uFEFF`) and interactive column selector pills (`Title`, `Artist`, `Duration`, `Views`, `Age`) for instant ingestion into Tune My Music, Spotify, Musicolet, or Musify.

### 13. 🌐 Language & Nationality Clustering Engine (`LanguageClusteringView.tsx`) [Curation & Analytic Layer]
Intelligent, multi-tiered music library partitioner that groups tracks by artist language spoken and cultural origin in milliseconds:
*   **Speed-First 5-Tier Waterfall Architecture**:
    *   **Tier 0: Pre-Seeded Cache & Ingestion**: 1,341 verified base artist mappings loaded instantly with automatic composite multi-artist splitting (`Wizkid, Skepta, Naira Marley` or `Vaundy ft. Ado`).
    *   **Tier 1: Unicode Script Histogram**: Deterministic offline signature detection for Han (Chinese), Kana (Japanese), Hangul (Korean), and Devanagari (Indian).
    *   **Tier 2: MusicBrainz Web Service**: Official rate-throttled API querying country of origin (`TW`, `KR`, `NG`, `GB`, `US`, `FR`, `BR`, `IN`, `PH`, `ES`).
    *   **Tier 3: Gemini AI Batch Fallback**: Free-tier optimized batch classification (30 artists/call) with automated 429 quota backoff, jitter, and instant `AbortController` cancellation.
    *   **Tier 4: Manual Override**: Inline 1-click badge reassignment permanently stored to `localStorage`.
*   **13 Canonical Language & Regional Buckets**: English, J-Pop, Naija, K-Pop, C-Pop, Instrumental, Gospel, Filipino, I-Pop, African, Latina, Français, and Other.
*   **Advanced Export Suite**: Export individual bucket playlists (.m3u / .csv), export all 13 buckets bundled as a multi-playlist ZIP archive, or export enriched CSVs with full country and confidence source metadata.
*   **Persistent Cache & Dataset Manager**: Ingest custom `COL_ARTIST, COL_GENRE` CSVs, inspect and search the persistent cache, and export/import JSON backups.

---

## 🛠️ Run Locally & Build

**Prerequisites:** Node.js (v18+) installed.

### ⚡ 1-Click Startup (Windows)
Double-click `launch.bat` in the project root to automatically start the development server and open `http://localhost:3000` in your default browser.

### 💻 Manual Command Line
1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Configure AI Models (Universal & Local-First)**:
    *   **Option A: Cloud Models (Gemini)**:
        Create a `.env.local` file in the root directory:
        ```env
        VITE_GEMINI_API_KEY=your_gemini_api_key_here
        ```
    *   **Option B: Local Models (OpenAI-Compatible / Ollama / LM Studio)**:
        Playlist Haven supports **100% offline, local-first vision models** out of the box!
        *   Launch your local model server (e.g., `ollama run llama3.2-vision`).
        *   In the app, open Vision-to-Playlist settings, configure the Base URL (`http://localhost:11434/v1`), and toggle provider to **OpenAI-Compatible**—no cloud key required!
3.  **Run Development Server**:
    ```bash
    npm run dev
    ```
4.  **Production Compilation**:
    ```bash
    npm run build
    ```
5.  **Capacitor Android Native Sync**:
    ```bash
    npm run android:build
    ```

### 🚀 Cloud Deployment (Vercel) & Architecture
Playlist Haven is designed with a **100% Zero-Backend, Client-Side Architecture**:
*   **Static SPA Hosting**: Deploys seamlessly to **Vercel**, GitHub Pages, or Netlify with zero server dependencies (`npm run build`).
*   **Browser-Native Ingestion & Export**: All parsing (M3U, CSV, TSV, TXT), Unicode histogram script analysis, ZIP archiving (`jszip`), and UTF-8 BOM CSV generation execute purely in the browser.
*   **CORS-Enabled APIs**: MusicBrainz Web Service v2 natively supports global browser CORS.
*   **Secure Client-Side AI**: Gemini AI and OpenAI-compatible API calls run directly from the browser with keys securely stored in local browser storage (`localStorage`) or injected via `VITE_GEMINI_API_KEY` environment variables.

---

*“To use the experience engine is to put your art on your wall and experience it.”* 🎵
