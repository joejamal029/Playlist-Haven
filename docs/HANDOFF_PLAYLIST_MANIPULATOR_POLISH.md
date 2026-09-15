# 📋 Task Handoff: Playlist Manipulator (Core Suite Elevation & Polish)

> **To the Incoming Agent**:  
> You are tasked with executing the **Playlist Manipulator Polish (`PlaylistManipulatorView.tsx`)** in Playlist Haven.  
> This document provides the complete context, architectural requirements, UI specifications, state mappings, and verification criteria to transform this module into the snappy, desktop-grade daily driver envisioned by the creator.

---

## 1. 🧭 Architectural Mission & Context

### 1.1 The Curation Problem It Solves
Streaming platforms (Spotify, Apple Music, YouTube Music) intentionally trap users in a **"1-song / 1-playlist cage"**:
- You can only look at one playlist at a time.
- You cannot view two or four playlists side-by-side.
- You cannot bulk-subtract one playlist from another to remove familiar songs.
- You cannot drag-and-drop or batch-move blocks of tracks between playlists.

The **Playlist Manipulator** was built as the genesis and foundational reason Playlist Haven exists: giving users **true organizational sovereignty** over their music libraries.

### 1.2 The Goal of this Polish
`views/PlaylistManipulatorView.tsx` is already a massive 2,800-line power tool with multi-pane rendering, cross-pruning, and format conversions. However, **its most frequent everyday operations are buried**:
- Merging playlists requires opening a complex modal (`isCombinePanelOpen`) and configuring dropdowns.
- Subtracting one playlist from another ($A - B$ anti-repeat discovery) has no dedicated 1-click button.
- Finding overlapping tracks ($A \cap B$) requires multi-step navigation.
- Filtering by play-count opens a separate modal (`playCountFilterPlaylistId`).
- Range selection relies on a modal rather than fluid native `Shift + Click`.

**Your mission is to surface these buried superpowers directly onto the primary workspace as instant, 1-click actions and polish the multi-pane user experience.**

---

## 2. 🧱 Target Deliverables & Feature Specifications

### 2.1 Quick-Action Operations Bar (Top-Level Toolbar)
Add a prominent, high-visibility **Operations Toolbar** above the panes when 2 or more playlists are loaded:

```
[ 🔄 Merge Panes (A + B) ]  [ ⚡ Subtract Known (A - B) ]  [ 🤝 Find Overlaps (A ∩ B) ]  [ 🧹 Cross-Prune Duplicates ]
```

1. **🔄 Merge Active Panes ($A + B$)**:
   - 1-click action: Combines the active pane and secondary pane into either a brand new playlist pane or appends to Pane A.
   - Built-in duplicate detection: Prompts/toggles *"Avoid Duplicates (fuzzy 80%)"*.
2. **⚡ Subtract / Anti-Repeat ($A - B$)**:
   - **The Core Discovery Superpower**: "Remove songs in Reference Pane B from Source Pane A".
   - Automatically compares tracks using `stringSimilarity(normA, normB) >= 0.85` and removes or unselects matching tracks from Pane A.
   - Leaves Pane A with **100% unencountered songs**.
3. **🤝 Find Overlaps ($A \cap B$)**:
   - 1-click action: Isolates only the tracks that appear in *both* Pane A and Pane B.
   - Can select them in Pane A, or generate a new "Shared Favorites" playlist pane.
4. **🧹 Quick Cross-Prune**:
   - Surfaces the fuzzy duplicate finder with a single click, allowing users to review and purge cross-playlist duplicates without digging into menus.

---

### 2.2 Inline Sticky Filters per Pane (Kill the Filter Modals)
Currently, `playCountFilterPlaylistId` opens a modal. Move all filters directly into each pane's header as clean, compact filter pills:

1. **Search Input**: Live filter across title, artist, and album.
2. **Artist Pill / Dropdown**: Filter pane by specific artist.
3. **Album Pill**: Filter pane by specific album.
4. **Play Count Pill ($\ge N$)**:
   - When play count data is present (from Musicolet / Last.fm CSVs), provide a quick stepper/pill:
     `Plays: All | ≥2 | ≥5 | ≥10 | Custom`
   - Immediately filters the visible tracks in that specific pane.

---

### 2.3 Native Ergonomic Multi-Pane Controls
1. **Layout Selector**:
   - Clean, tactile buttons at the top right:
     - `[ 1 Pane ]` (Single focus mode)
     - `[ 2 Panes ]` (Dual comparison mode - side-by-side)
     - `[ 4 Panes ]` (Quad crate-digging grid - 2x2)
2. **Native `Shift + Click` Range Selection**:
   - Instead of opening the `rangeSelectorPlaylistId` modal, implement native spreadsheet-style selection:
     - Clicking Track A, then holding `Shift` and clicking Track B selects all tracks between A and B in that pane.
   - Keep the modal only as an advanced fallback.
3. **Smooth Inter-Pane Drag-and-Drop**:
   - When dragging a selected track (or batch of selected tracks) from Pane 1 over Pane 2:
     - Show a glowing cyan drop-zone indicator (`border-cyan-500/50 bg-cyan-950/20`).
     - Dropping inserts the tracks at the target position or appends to the target pane.

---

## 3. 🔍 Codebase Mappings in `views/PlaylistManipulatorView.tsx`

| Existing Symbol | Line Area | How to Use / Refactor |
| :--- | :--- | :--- |
| `paneCount` (`1 \| 2 \| 4`) | ~L200 | Controls visible panes (`activePlaylistId`, `secondaryPlaylistId`, `thirdPlaylistId`, `fourthPlaylistId`). Ensure smooth CSS grid layout (`grid-cols-1`, `grid-cols-2`, `grid-cols-2 xl:grid-cols-4`). |
| `stringSimilarity` / `normalizeForMatch` | ~L116–142 | Jaro-Winkler bigram matcher. Use directly for instant $A - B$ subtraction and $A \cap B$ overlap calculations. |
| `isCombinePanelOpen` | ~L209 | Currently handles merging. Surface its core function into the 1-click **Merge** toolbar button. |
| `playCountFilterPlaylistId` | ~L227 | Currently a modal. Convert into inline pane controls via `getFilteredTracks`. |
| `getFilteredTracks` | ~L270 | Update this filter pipeline to incorporate `playCountMin` and `playCountMax` directly per playlist data. |
| `PlaylistData` interface | ~L22–33 | Add optional per-pane filter state if needed: `playCountFilter?: number`, `albumFilter?: string`. |

---

## 4. 🎨 Design System Guidelines (Dark Audiophile)

- **Background**: Deep Slate-950 (`#020617`).
- **Panes**: Glassmorphic Slate-900 panels (`bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-xl`).
- **Active Accents**:
  - Primary / Selection: `cyan-400` / `cyan-500`
  - Merge / Combine: `blue-500`
  - Subtract / Anti-Repeat: `amber-400` or `emerald-400`
  - Cross-Prune / Delete: `rose-500`
- **Typography**: Inter sans for text, tabular monospace font (`font-mono`) for track numbers, play counts, and durations.

---

## 5. 🛡️ Defensive Engineering Standards

1. **Defensive Null-Safety**:
   - Always guard track arrays: `playlist?.tracks ?? []`.
   - Protect IDs and lookups: `playlists.find(p => p.id === id) || null`.
2. **Immutable State Updates**:
   - Use the existing `updatePlaylist(playlistId, updater)` helper to avoid direct state mutation.
3. **UTF-8 BOM Preservation**:
   - When exporting CSVs, ensure `\uFEFF` is preserved so CJK/accented characters render correctly in Excel.

---

## 6. ✅ Verification & Acceptance Checklist

When complete, verify:
1. `npm run build` runs and passes with **zero errors**.
2. **Toolbar**: Load 2 playlists $\rightarrow$ click `⚡ Subtract (A - B)` $\rightarrow$ verify matching songs from Playlist B are instantly removed or highlighted in Playlist A.
3. **Merge**: Click `🔄 Merge (A + B)` $\rightarrow$ verify a combined playlist appears with deduplication option.
4. **Inline Filters**: Change play count or artist filter on Pane 1 $\rightarrow$ Pane 1 updates instantly without modal popups.
5. **Multi-Pane**: Switch between 1, 2, and 4 panes $\rightarrow$ layout adapts responsively without broken heights or horizontal overflow.
