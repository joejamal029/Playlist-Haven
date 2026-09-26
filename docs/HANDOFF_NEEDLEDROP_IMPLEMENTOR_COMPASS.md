# 🧭 NeedleDrop — Implementor's Handoff Compass & Phase Execution Guide

> **Document Type**: Tactical Execution Compass & Phase-by-Phase Implementation Guide  
> **Primary Authority**: [`docs/ARCHITECTS_BRIEF_NEEDLEDROP.md`](./ARCHITECTS_BRIEF_NEEDLEDROP.md)  
> **Target Audience**: Lead Implementation Agent / Autonomous Engineering Worker

---

## 1. 🎯 Your Role as the Implementor Agent

You are the **Lead Implementation Engineer**. Your job is **not** to reinvent the product vision, redesign the architecture, or debate the core decisions already locked in the Architect's Plan. 

Your mandate is **disciplined, high-fidelity tactical execution**:
1. You will take the 20% architectural leverage provided in [`ARCHITECTS_BRIEF_NEEDLEDROP.md`](./ARCHITECTS_BRIEF_NEEDLEDROP.md) and build the 80% working reality.
2. You will consult this Compass at the **start of every phase** before writing code.
3. You will reuse the battle-tested services and components from Playlist Haven rather than writing new code from scratch.
4. You will strictly adhere to the Hard Rules and Quality Gates defined below.

---

## 2. ⚠️ Critical Reading Warning: Supplementary Documentation

> [!WARNING]
> **DO NOT READ SUPPLEMENTARY DOCUMENTS IN THEIR ENTIRETY.**  
> Reading monolithic documents from start to finish will consume your context window, induce cognitive noise, and distract from your immediate phase objectives.  
> **Only inspect the specific section, function, or line range indicated in each phase below.**

### 📚 Targeted Supplementary References
* [`docs/ARCHITECTS_BRIEF_NEEDLEDROP.md`](./ARCHITECTS_BRIEF_NEEDLEDROP.md) — The Master Plan. Only read the relevant **Decision (5.2)**, **Phase (5.3)**, **Landmine (5.4)**, and **Proactive Prompt (5.5)** for your active phase.
* [`Playlist-Haven/services/itunesApi.ts`](../Playlist-Haven/services/itunesApi.ts) — Direct code donor. Only extract `queryITunesRecording` and `resolveAudioPreviewForTrack`.
* [`Playlist-Haven/services/playlistSanitizer.ts`](../Playlist-Haven/services/playlistSanitizer.ts) — Direct code donor. Only inspect `cleanCompositeTrack` and regex bracket cleaners.
* [`Playlist-Haven/services/metadataDb.ts`](../Playlist-Haven/services/metadataDb.ts) — Direct code donor. Only check the IndexedDB initialization pattern and key schema (`artist:::title`).
* [`Playlist-Haven/docs/PLAYLIST_HAVEN_SYSTEM_BRIEF.md`](../Playlist-Haven/docs/PLAYLIST_HAVEN_SYSTEM_BRIEF.md) — Only check **Section 4.5** (Universal Audio Subsystem) and **Section 2.2** (Musicolet `Songs.csv` column format).

---

## 3. 🛡️ The 7 Non-Negotiable Hard Rules

These rules represent the non-negotiable engineering law of this project. Any PR or phase completion violating these rules is considered broken:

1. **NO GIT COMMANDS**: Under NO circumstances run any `git` commands (`git commit`, `git push`, `git add`, etc.) unless the user explicitly orders you to do so in the chat.
2. **REUSE, DO NOT REINVENT**: The iTunes resolver, string sanitizers, CSV parsers, and IndexedDB adapters already exist in Playlist Haven. Copy, import, and adapt them. Do not write ad-hoc regexes or novel fetchers.
3. **AUDIO ELEMENT HYGIENE**: Never execute raw, abrupt cuts on audio playback. All micro-snippet slices ($0.5s–3.0s$) MUST pass through a Web Audio `GainNode` with an automated 50ms exponential/linear fade-in and fade-out envelope to eliminate speaker pop/click transients.
4. **PLAYER SOVEREIGNTY IS INVIOLABLE**: Never lock difficulty levels to input methods. The player must always have the freedom to combine ANY snippet duration (0.5s, 1.0s, 1.5s, 3.0s) with ANY input paradigm (Rapid 4-Choice vs. Autocomplete Input).
5. **TOKEN-BUCKET RATE LIMITING & CACHING**: All Apple iTunes API calls must pass through a concurrency pool (max 4 concurrent requests, 150ms delay) with persistent IndexedDB caching (`NeedleDropCacheDB`). Never hammer the public endpoint during a live speedrun.
6. **CLIENT-SIDE ZERO BACKEND**: NeedleDrop must remain a 100% client-side SPA (Vite + React 18 + Tailwind CSS). No server processes, no proxy backends, and no proprietary paid SDKs.
7. **UNIVERSAL UTF-8 BOM**: Every CSV/TSV exported by the application must begin with `\uFEFF` to prevent character corruption (mojibake) in Microsoft Excel and Windows.

---

## 4. 🗺️ Phase-by-Phase Execution Compass

---

### 📍 PHASE 1: Web Audio Engine & Snippet Slicer

#### 🎯 Phase Focus & Objectives
Build the core audio foundation capable of millisecond-accurate audio playback, midpoint random slicing, and transient-free micro-fades.

#### 📖 Mandatory Architect's Brief Sections to Consult
* **§5.2 Decision 2**: Hybrid Web Audio API + HTML5 Audio Architecture.
* **§5.2 Decision 3**: Dynamic Midpoint Snippet Slicing.
* **§5.4 Landmine 2**: Browser Autoplay Policy & AudioContext Suspension.
* **§5.4 Landmine 3**: Audio Pop/Click Transients on Micro-Snippet Boundaries.
* **§5.4 Landmine 4**: Silent Intros Destroying Recognizability.
* **§5.5 Proactive Prompt 1**: CORS audio stream piping through `GainNode`.

#### 📂 Code to Extract & Adapt
* From `Playlist-Haven/services/itunesApi.ts`: Copy `resolveAudioPreviewForTrack`.
* Create `services/snippetAudioEngine.ts`:
  * Initialize an `AudioContext` with an `HTMLAudioElement` source.
  * Connect: `MediaElementSourceNode` $\rightarrow$ `GainNode` $\rightarrow$ `audioContext.destination`.
  * Implement `playSnippet(url: string, durationSec: number, isIntro: boolean): Promise<void>`.
  * If `isIntro === true`, $T_{\text{start}} = 0.0s$. If `false`, $T_{\text{start}} = \text{random}(8.0s, 22.0s)$.
  * Apply `gainNode.gain.setValueAtTime(0, now)`, `linearRampToValueAtTime(1, now + 0.05)`, and ramp back to 0 at `now + durationSec`.

#### 🛑 Traps & What NOT to Do
* **DO NOT** use `fetch()` + `decodeAudioData()` for standard streaming; CORS on Apple CDN often fails. Use an `<audio crossOrigin="anonymous">` element routed into Web Audio.
* **DO NOT** initialize `AudioContext` automatically on page load without an unlock function; browsers will suspend it.

#### ✅ Phase Exit Verification
* A test button triggers a 0.5s slice of an iTunes preview URL. The audio starts cleanly, plays for exactly 500ms, and fades out with zero audible speaker click.

---

### 📍 PHASE 2: Universal Ingestion & Normalization Engine

#### 🎯 Phase Focus & Objectives
Build the intake pipeline that ingests any playlist format and cleans messy metadata for 85%+ iTunes matching accuracy.

#### 📖 Mandatory Architect's Brief Sections to Consult
* **§5.2 Decision 5**: Universal Zero-Config Ingestion Engine.
* **§5.5 Proactive Prompt 2**: CJK brackets and remix tag stripping.

#### 📂 Code to Extract & Adapt
* From `Playlist-Haven/services/playlistSanitizer.ts`: Extract `cleanCompositeTrack`.
* From `Playlist-Haven/services/songQuerySanitizer.ts`: Extract bracket stripping and feature splitting logic.
* Create `services/intakeParser.ts`:
  * Auto-detect file type: CSV vs M3U vs Plain Text.
  * Handle Spotify CSV (`Track Name,Artist Name(s)`), TuneMyMusic CSV, and Musicolet (`FILE_PATH,PLAY_COUNT`).
  * Return clean array: `Array<{ title: string, artist: string, album?: string, playCount?: number }>`.

#### 🛑 Traps & What NOT to Do
* **DO NOT** create separate upload screens for each format. Build a single, unified dropzone that auto-detects the content format.
* **DO NOT** discard `playCount` if present in Musicolet files; it is needed for Phase 4.

#### ✅ Phase Exit Verification
* Dropping a raw Spotify export, a Musicolet `Songs.csv`, and a plain text file all parse into clean, identical track arrays with stripped bracket tags.

---

### 📍 PHASE 3: Mode 1 — The Artist Gauntlet (Guinness Speedrun)

#### 🎯 Phase Focus & Objectives
Build the flagship high-speed game loop where users test their recognition reflexes against an artist discography under a 60-second timer.

#### 📖 Mandatory Architect's Brief Sections to Consult
* **§5.2 Decision 4**: Sovereign Player Interaction Model (4-Choice vs Autocomplete).
* **§5.2 Decision 6**: Pre-Fetching & Background Stream Resolution.
* **§5.4 Landmine 5**: Multiple-Choice Distractor Contamination.
* **§5.5 Proactive Prompt 3**: Accent- and case-insensitive autocomplete matching.

#### 📂 Implementation Steps
* Create `views/ArtistGauntletView.tsx`:
  * Pre-game Lobby: Select artist, choose duration (0.5s, 1.0s, 1.5s, 3.0s), toggle "True Intro", select Input Style.
  * Trigger background iTunes pre-fetching for the artist's tracks before starting the clock.
  * Game Screen:
    * 60-second countdown bar with millisecond reaction timer.
    * Active audio playback trigger on track advance.
    * If 4-Choice: Render 4 options with numeric keyboard shortcuts (`1`, `2`, `3`, `4`).
    * If Autocomplete: Render auto-focused input with instant Enter-to-submit.
    * Visual streak indicator (`Combo x3`, `x5`).
  * Results Screen: Total recognized, time elapsed, average reaction latency (e.g. `1.18s`), accuracy percentage.

#### 🛑 Traps & What NOT to Do
* **DO NOT** fetch iTunes previews synchronously during the speedrun; network lag will ruin the 60-second timer. Pre-fetch the first 10 tracks during the lobby countdown.
* **DO NOT** lock Autocomplete to the "Legend" tier. Allow players to use 4-Choice or Autocomplete on any tier.

#### ✅ Phase Exit Verification
* Running a 60-second Gauntlet plays snippets seamlessly on track transition, records reaction times accurately, and displays the final score card without UI stalls.

---

### 📍 PHASE 4: Mode 2 — The Personal Intimacy Audit

#### 🎯 Phase Focus & Objectives
Build the diagnostic benchmark mode that audits how well curators actually know their personal libraries across tiers and cultural cohorts.

#### 📖 Mandatory Architect's Brief Sections to Consult
* **§5.3 Phase 4**: Mode 2 Architecture & Specifications.
* **§5.5 Proactive Prompt 4**: EIQ mathematical formula bounds.

#### 📂 Implementation Steps
* Create `views/IntimacyAuditView.tsx` and `services/intimacyCalculator.ts`:
  * Ingest Musicolet `Songs.csv` or multi-tier playlists.
  * Partition tracks into Tier 1 ($\ge 50$ plays), Tier 2 (20–49 plays), and Tier 3 (5–19 plays).
  * Blind Test Loop: Play snippet without showing artist or title.
  * User clicks "I Know This" (reveals choices or typing) or "Skip / Forgotten".
  * Compute the **Ear Intimacy Quotient (EIQ)**:
    $$\text{EIQ} = \left(\frac{\text{Correct Guesses}}{\text{Total Tested}}\right) \times \left(\frac{1.0}{\text{Mean Response Latency (s)}}\right) \times 100$$
  * Render an Intimacy Distribution Chart: Percentage mastered in Tier 1 vs Tier 3.

#### 🛑 Traps & What NOT to Do
* **DO NOT** reveal album art or titles before the user registers a guess or skip.
* **DO NOT** divide by zero if latency is 0 or no tracks are answered. Enforce defensive math safeguards.

#### ✅ Phase Exit Verification
* Ingesting a sample Musicolet file runs through a 15-track sample test and outputs an EIQ score with a breakdown of recognized vs forgotten staples.

---

### 📍 PHASE 5: Mode 3 — The Discovery Arcade (Crate-Digging Triage)

#### 🎯 Phase Focus & Objectives
Build the rapid-fire audition salon that lets curators triage 100-track disposable lists in 5 minutes using intuitive keyboard hotkeys or touch gestures.

#### 📖 Mandatory Architect's Brief Sections to Consult
* **§5.2 Decision 8**: Direct Downstream Pipeline Handoff to Playlist Haven.
* **§5.5 Proactive Prompt 5**: Hotkey debounce and double-skip prevention.

#### 📂 Implementation Steps
* Create `views/DiscoveryArcadeView.tsx`:
  * Dropzone for raw TuneMyMusic or Spotify CSV.
  * Card-based deck: Automatically streams 5–10 second hook as card appears.
  * Hotkey / Button Controls:
    * <kbd>→</kbd> / Green Button: **Keep** (adds to Immersion Basket).
    * <kbd>←</kbd> / Slate Button: **Discard** (skips to next track).
    * <kbd>↑</kbd> / Cyan Button: **Deep Dig** (loops 30s preview, fetches high-res artwork).
    * <kbd>↓</kbd> / Amber Button: **Replay Hook**.
  * Dynamic counter: `Auditioned: 24 / 100`.
  * Export Bar: 1-click download of `NeedleDrop_Keepers_[Date].csv` with UTF-8 BOM.

#### 🛑 Traps & What NOT to Do
* **DO NOT** delay card advance while waiting for animations. Transitions must feel instantaneous.
* **DO NOT** forget to clean up previous audio when rapidly skipping cards.

#### ✅ Phase Exit Verification
* 50 tracks can be triaged in under 3 minutes using solely the keyboard arrow keys, producing a downloaded keepers CSV file.

---

### 📍 PHASE 6: Guinness Record Vault & Canvas Certificate Generator

#### 🎯 Phase Focus & Objectives
Build the persistent local storage for records and the HTML5 Canvas generator that stamps high-res shareable certificate images.

#### 📖 Mandatory Architect's Brief Sections to Consult
* **§5.2 Decision 7**: Client-Side Audiophile Record Certificate Generator.
* **§5.5 Proactive Prompt 6**: Retina display `devicePixelRatio` canvas scaling.

#### 📂 Implementation Steps
* Create `services/recordVault.ts`:
  * Store personal bests in IndexedDB (`NeedleDropVaultDB`).
* Create `services/certificateCanvas.ts`:
  * Generate a 1200×630 canvas (standard social card size).
  * Scale context by `window.devicePixelRatio` for razor-sharp typography.
  * Background: `#050505` obsidian with audiophile waveform graphic and gold/cyan accents.
  * Text elements: Artist name, tracks recognized, total time, average latency, difficulty stamp, verification seal.
  * Export methods: `downloadAsPNG(filename)` and `copyImageToClipboard()`.
* Create `components/RecordCertificateModal.tsx` to preview and share the certificate.

#### 🛑 Traps & What NOT to Do
* **DO NOT** use external heavy screenshot libraries (like `html2canvas`); use native HTML5 Canvas 2D API for 100% deterministic, high-framerate rendering.
* **DO NOT** draw images from external URLs without `crossOrigin = "anonymous"`, or the canvas will be tainted.

#### ✅ Phase Exit Verification
* Completing a Gauntlet run generates a visually stunning 1200×630 PNG card that downloads cleanly to the user's computer.

---

### 📍 PHASE 7: Mobile Touch Ergonomics & Build Verification

#### 🎯 Phase Focus & Objectives
Optimize touch responsiveness on mobile devices, eliminate zoom delays, and verify zero-warning production build.

#### 📖 Mandatory Architect's Brief Sections to Consult
* **§5.5 Proactive Prompt 7**: Bundle size limits (<500kB gzip).
* **§5.3 Phase 7**: Mobile touch specifications.

#### 📂 Implementation Steps
* Apply Tailwind mobile touch styles: `touch-manipulation`, `select-none`, safe-area insets (`pb-safe`).
* Set meta viewport: `viewport-fit=cover`.
* Run `npm run build` and ensure exit code 0 with zero TypeScript errors.

#### 🛑 Traps & What NOT to Do
* **DO NOT** run git commands during verification.
* **DO NOT** import bloated component libraries. Rely on Tailwind CSS and `lucide-react`.

#### ✅ Phase Exit Verification
* `npm run build` completes with exit code 0.
* Responsive preview verifies tactile button sizing and flawless layout on both mobile (375px) and desktop (1440px).

---

## 5. 🏁 The Final Implementor Checklist

Before marking the project complete, verify this checklist:
- [ ] Hybrid Web Audio engine plays 0.5s snippets with 50ms fade envelopes and zero clicks.
- [ ] Pre-game lobby permits sovereign choice of 4-Choice or Autocomplete on any duration tier.
- [ ] Midpoint randomizer samples between second 8.0 and 22.0, with working "True Intro" toggle.
- [ ] Universal parser handles Spotify CSV, Musicolet CSV, M3U, and text dumps.
- [ ] Mode 1 (Artist Gauntlet), Mode 2 (Intimacy Audit), and Mode 3 (Discovery Arcade) all work independently.
- [ ] Personal records persist in IndexedDB.
- [ ] HTML5 Canvas stamps 1200×630 retina certificates with 1-click PNG download.
- [ ] Discovery Arcade exports clean UTF-8 BOM CSV files.
- [ ] Zero `git` commands were executed.
- [ ] `npm run build` exits with code 0.
