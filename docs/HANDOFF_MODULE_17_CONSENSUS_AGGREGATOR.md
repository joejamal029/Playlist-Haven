# 📋 Task Handoff: Module 17 — Consensus Aggregator (True 'Best-Of' Synthesis)

> **To the Incoming Agent**:  
> You are tasked with implementing **Module 17: Consensus Aggregator (`ConsensusAggregatorView.tsx`)** in Playlist Haven.  
> This document provides all the context, architectural requirements, UI specifications, reference implementations, and verification commands you need to complete the task with zero ambiguity.

---

## 1. 🧭 Architectural Mission & Context

### 1.1 The Curation Problem It Solves
When crate-digging into deep discographies (e.g., Radiohead, Miles Davis, Fela Kuti, Fela Anikulapo Kuti, Bowie), streaming algorithms (like Spotify's "Popular" row) only show currently trending or sponsored tracks. Individual fan playlists or blogs, on the other hand, suffer from heavy individual bias.

To discover the **true universal masterpieces** of an artist, curators collect **4 to 8 independent sources** (fan-curated "Best Of" lists, concert setlists, Reddit consensus threads, and critic lists) and **cross-tabulate** them. Songs that appear across 75%–100% of these independent sources represent the undisputed consensus core.

### 1.2 The Genesis & Why Decoupling is Needed
An initial proof-of-concept of this logic was previously implemented inside `views/VisionToPlaylistView.tsx` under an experimental OCR mode (`aggregateSongs` in `services/visionEngine.ts`). However, because it was trapped inside the Vision module, it **only accepted image screenshots**.

In reality, curators have lists in multiple formats:
- `.csv` exports from Spotify / YouTube.
- `.m3u` / `.m3u8` playlists from media players.
- `.txt` text dumps from Reddit or blogs (`Artist - Title`).
- Raw copy-pasted text from setlist forums.
- Screenshots/flyers from live shows (via OCR).

**Your mission is to decouple and elevate this feature into a standalone, first-class crate-digging workbench: Module 17 (`ConsensusAggregatorView.tsx`).**

---

## 2. 🧱 Target Deliverables

You will create and wire the following:

| Target File | Role | Description |
| :--- | :--- | :--- |
| `services/consensusEngine.ts` | **New Service** | Pure business logic: string normalization, Jaro-Winkler bigram similarity, multi-source ingestion, recurrence cross-tabulation, and TuneMyMusic CSV generation. |
| `views/ConsensusAggregatorView.tsx` | **New View** | First-class UI with multi-source file dropzones, text paste modal, source management cards, interactive consensus threshold slider, recurrence heatmaps, source breakdown popover, and exports. |
| `App.tsx` | **Modification** | Register `'consensus'` in `AppView` type, add routing switch case, and add the card to the Dashboard under **Layer 1: Discovery / Crate Digging**. |
| `components/HelpGuideModal.tsx` | **Modification** | Add Module 17 documentation to the universal help guide modal. |

---

## 3. ⚙️ Detailed Architectural Specifications

### 3.1 `services/consensusEngine.ts`

Extract and expand the logic currently in `services/visionEngine.ts:aggregateSongs`:

```typescript
export interface RawTrackInput {
  title: string;
  artist: string;
  album?: string;
  sourceName: string;
}

export interface ConsensusTrack {
  id: string;                      // Base64 safe hash of normalized artist-title
  artist: string;
  title: string;
  album: string;
  consensusCount: number;          // Number of distinct sources that included this track (k)
  totalSources: number;            // Total active sources evaluated (N)
  consensusPercentage: number;     // Math.round((k / N) * 100)
  sources: Set<string>;            // Specific source names that nominated this track
}

export interface SourceSummary {
  id: string;
  name: string;
  trackCount: number;
  enabled: boolean;
}
```

#### Core Algorithms:
1. **String Normalization (`normalizeString`)**:
   - Strip noisy bracket tags: `[Official Audio]`, `(Remastered 2011)`, `[1080p]`, `(Live at...)`.
   - Remove punctuation, diacritics, and normalize whitespace to lowercase.
2. **Fuzzy String Matcher (`isSameTrack`)**:
   - Use bigram / Jaro-Winkler similarity:
     `artistSim >= 0.85 && titleSim >= 0.85`
   - If match found:
     - Increment `consensusCount`.
     - Add `sourceName` to `sources: Set<string>`.
     - Retain the cleanest title/artist string and preserve album name if available.
3. **Format Parsers**:
   - `parseCSVTracks(content: string, sourceName: string): RawTrackInput[]` (detects headers or defaults to col 0: Title, col 1: Artist, or vice-versa).
   - `parseM3UTracks(content: string, sourceName: string): RawTrackInput[]` (parses `#EXTINF:...,Artist - Title`).
   - `parseTextDumpTracks(text: string, sourceName: string): RawTrackInput[]` (splits by newline, splits on ` - ` or ` – `).
4. **CSV Exporter (`generateTuneMyMusicCSV`)**:
   - Headers: `Artist,Track Name,Album,Consensus Count,Consensus Percentage,Sources`
   - Prepend UTF-8 BOM (`\uFEFF`) to prevent Excel/Sheets character corruption.

---

### 3.2 `views/ConsensusAggregatorView.tsx` UI/UX Requirements

Follow the Dark Audiophile design system (`#020617` Slate-950, `#0f172a / 60%` glass panels, `border-slate-800`):

1. **Header Bar**:
   - Back button (`ArrowLeft` $\rightarrow$ returns to dashboard).
   - Title: **Consensus Aggregator** with `BarChart3` icon and `Layer 1: Discovery` badge.
   - Quick Help button (`?`).
2. **Universal Intake Area**:
   - **Multi-File Dropzone**: Drag & drop multiple `.csv`, `.m3u`, or `.txt` files at once.
   - **Paste Text Tab**: Textarea for pasting raw setlists or forum threads directly with a custom source name input (e.g. "Reddit r/Radiohead Top 20").
   - **Screenshot OCR Tab**: Optional image dropzone that passes screenshots to `parseScreenshot` from `services/visionEngine.ts` and tags the output as an OCR source!
3. **Active Sources Shelf**:
   - Badges/cards for every loaded source:
     - Shows Source Name and extracted track count.
     - Toggle checkbox (enable/disable source from consensus calculation).
     - Trash icon to remove source.
4. **Consensus Control Bar**:
   - **Dynamic Threshold Slider**: Range from `1` to `Total Active Sources` (e.g., *"Show tracks appearing in at least 3 of 5 sources (60%+)"*).
   - **Quick-Filter Pills**:
     - *All Candidates* ($\ge 1$)
     - *Emerging Consensus* ($\ge 2$)
     - *Strong Consensus* ($\ge 50\%$)
     - *Unanimous Masterpieces* ($100\%$)
   - **Search Input**: Live filter by artist or title.
5. **The Consensus Track Table**:
   - Columns:
     - Selection Checkbox.
     - Track # (1-based sequence).
     - Title & Artist (clean, bold).
     - Consensus Progress Bar: Visual percentage bar with color gradient:
       - 100%: Emerald green (`bg-emerald-500`)
       - $\ge 60\%$: Cyan (`bg-cyan-500`)
       - $\ge 40\%$: Blue (`bg-blue-500`)
       - Single nomination: Slate (`bg-slate-700`)
     - Consensus Metric: e.g. `4/5 sources (80%)`.
     - Source Breakdown Popover/Drawer: Hover or click to see the exact source names that nominated this song.
6. **Action & Export Bar**:
   - Selection count display: `X of Y tracks selected`.
   - **TuneMyMusic CSV Export**: Direct download for immediate Spotify/Apple Music import.
   - **M3U Playlist Export**: Playable playlist for local players.
   - **Copy to Clipboard**: Instant TSV/CSV format for spreadsheets.

---

### 3.3 Integration into `App.tsx`

1. Import `ConsensusAggregatorView`:
   ```typescript
   import ConsensusAggregatorView from './views/ConsensusAggregatorView';
   ```
2. Add to `AppView` type:
   ```typescript
   type AppView = 'dashboard' | ... | 'consensus';
   ```
3. Add to `renderView()` switch statement:
   ```typescript
   case 'consensus':
     return <ConsensusAggregatorView onBack={() => setCurrentView('dashboard')} onOpenHelp={() => setIsHelpModalOpen(true)} />;
   ```
4. Add Dashboard card in `Dashboard` component under **Layer 1: Discovery & Acquisition**:
   - Title: **Consensus Aggregator**
   - Subtitle: **True 'Best-Of' Synthesis**
   - Description: *Cross-tabulates multiple fan playlists, setlists, and recommendations to extract universal consensus masterpieces across deep discographies.*
   - Icon: `BarChart3` or `Sparkles`
   - Badge: `Discovery` / `Layer 1`

---

## 4. 🛡️ Coding Guidelines & Null Safety

1. **Defensive Null-Safety**:
   - Use safe optional chaining: `song?.title ?? ''`, `sources?.size ?? 0`.
   - Protect division against zero: `totalSources > 0 ? Math.round((k / totalSources) * 100) : 0`.
2. **Client-Side UTF-8 BOM**:
   - In CSV exports, always prefix content with `\uFEFF`:
     ```typescript
     const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
     ```
3. **No Breaking Changes**:
   - Preserve existing functionality in `VisionToPlaylistView.tsx`.
   - Ensure existing tests and views remain completely unaffected.

---

## 5. 🔍 Verification & Acceptance Criteria

When implementation is complete, verify the following:
1. `npm run build` passes with zero errors and clean bundle output.
2. In the app UI:
   - Clicking the new **Consensus Aggregator** dashboard card navigates to the view cleanly.
   - Dropping 3 different sample CSVs or text files creates 3 active sources.
   - Moving the consensus slider from 1 to 3 immediately filters out single-source tracks.
   - The TuneMyMusic CSV downloads cleanly and contains the UTF-8 BOM.
   - The Back button returns to the main Dashboard.
