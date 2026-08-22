import React, { useState, useEffect, useMemo } from 'react';
import { 
  HelpCircle, Search, X, ChevronDown, ChevronUp, Lightbulb, Sparkles, 
  Layers, SlidersHorizontal, Wand2, Eye, GitCompare, Merge, Scissors, 
  Shuffle, Eraser, Filter, Type, Palette, BookOpen, ExternalLink, 
  Check, ArrowRight, ShieldCheck, FileText, Music, Info, Zap, Globe, 
  Terminal, Bookmark, Columns, RefreshCw, Github, Heart, Newspaper
} from 'lucide-react';

interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}

interface GuideTopic {
  id: string;
  category: 'why' | 'workflows' | 'tools' | 'glossary' | 'faq';
  title: string;
  badge?: string;
  badgeColor?: string;
  summary: string;
  content: React.ReactNode;
  tags: string[];
}

const GITHUB_REPO_URL = 'https://github.com/joejamal029/Playlist-Haven';
const GITHUB_SPONSOR_URL = 'https://github.com/sponsors/joejamal029';
const SUBSTACK_BLOG_URL = 'https://substack.com/@beyondshuffleandalgorithms';

export default function HelpGuideModal({ isOpen, onClose, initialTab = 'why' }: HelpGuideModalProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({
    'why-experience-engine': true,
    'workflow-bridging-walled-gardens': true,
    'tool-scrape-stripper': true
  });

  // Global ESC key binding
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  const openExternal = (url: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const toggleTopic = (id: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    guideTopics.forEach(t => { all[t.id] = true; });
    setExpandedTopics(all);
  };

  const collapseAll = () => {
    setExpandedTopics({});
  };

  // Categories Definition
  const categories = [
    { id: 'why', label: 'Why Playlist Haven', icon: Lightbulb, color: 'text-amber-400' },
    { id: 'workflows', label: 'Quick Start & Workflows', icon: Zap, color: 'text-indigo-400' },
    { id: 'tools', label: 'Tool-by-Tool Guide', icon: Wand2, color: 'text-violet-400' },
    { id: 'glossary', label: 'Formats & Glossary', icon: BookOpen, color: 'text-cyan-400' },
    { id: 'faq', label: 'FAQ & Troubleshooting', icon: HelpCircle, color: 'text-emerald-400' }
  ];

  // Comprehensive Guide Topics Database
  const guideTopics: GuideTopic[] = [
    // --- WHY PLAYLIST HAVEN (PHILOSOPHY) ---
    {
      id: 'why-experience-engine',
      category: 'why',
      title: 'The Experience Engine vs The Discovery Engine',
      badge: 'Core Philosophy',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      summary: 'Why mainstream streaming platforms sabotage our relationship with music, and how to take back autonomy.',
      tags: ['philosophy', 'discovery', 'experience', 'streaming', 'musicolet', 'daeso', 'source code', 'github', 'sponsor', 'substack', 'blog'],
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            Mainstream streaming platforms (Spotify, YouTube Music, Apple Music) are strictly engineered around the <strong className="text-white">Discovery Engine</strong>. Their algorithms optimize for hyper-novelty, disposable short-play listening, and keeping users glued to infinite algorithmic feeds.
          </p>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5 text-amber-200">
            <span className="font-bold flex items-center gap-1.5 text-amber-300">
              <Lightbulb size={14} /> The Experience Engine Creed:
            </span>
            <p className="italic text-[11px]">
              "The difference between art shoved in the attic and art hung on your wall is experience. To find your art is to use the discovery engine; to stop there is to put it in the attic. To use the experience engine is to put your art on your wall and live with it."
            </p>
          </div>
          <p>
            <strong>Playlist Haven</strong> is the physical realization of the <strong>Experience Engine</strong>—a local-first Swiss Army Knife built to let you curate, sort, prune, sieve, and intentionally cultivate your music library with desktop-grade precision.
          </p>
        </div>
      )
    },
    {
      id: 'why-bridging-walled-gardens',
      category: 'why',
      title: 'Bridging Walled Streaming Gardens (Spotify / YTM / Apple)',
      badge: 'Streaming Bridge',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      summary: 'Extend local desktop power tools directly to your live Spotify, Apple Music, and YouTube libraries.',
      tags: ['spotify', 'youtube', 'tunemymusic', 'bridge', 'musify', 'export', 'csv'],
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            Streaming services are walled gardens that forbid deep sorting, fuzzy cross-playlist deduplication, play-count sieving, or structural manipulation.
          </p>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 font-mono text-[11px]">
            <div className="text-violet-400 font-bold">The Universal Extension Loop:</div>
            <div className="text-slate-400 flex flex-col space-y-1">
              <div>1. <strong>Extract:</strong> Export live playlists to CSV/TXT (via Tune My Music, Soundiiz, or Scrape Stripper).</div>
              <div>2. <strong>Transform:</strong> Ingest into Playlist Haven to sieve by play-history, fuzzy cross-prune duplicates, or slice into equal parts.</div>
              <div>3. <strong>Synchronize:</strong> Export clean UTF-8 CSVs back to Spotify/YTM or route directly to Musify & Musicolet.</div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'why-source-code',
      category: 'why',
      title: 'Open Source, Substack Essays & Sponsorship',
      badge: 'Community & Essays',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      summary: 'Read the official Substack essays, explore the open-source repository, or sponsor ongoing development.',
      tags: ['substack', 'blog', 'essays', 'github', 'source code', 'sponsor', 'open source', 'beyond shuffle'],
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            Dive deeper into the philosophy of music curation, algorithmic resistance, and personal audio archives through our official publication and open-source project.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {/* Substack Blog Card */}
            <div className="p-3.5 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-950 border border-amber-500/30 rounded-xl flex flex-col justify-between space-y-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 bg-amber-500/20 text-amber-300 rounded-lg flex items-center justify-center border border-amber-500/30 shrink-0">
                  <Bookmark size={17} />
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-200">Substack Essays</div>
                  <p className="text-[10px] text-amber-400/80">Beyond Shuffle</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                In-depth essays on listening autonomy, intentional curation, and audio philosophy.
              </p>
              <button
                onClick={(e) => openExternal(SUBSTACK_BLOG_URL, e)}
                className="flex items-center justify-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg font-black text-xs transition-colors shadow-md shadow-amber-950/40 cursor-pointer"
              >
                <span>Read on Substack</span>
                <ExternalLink size={12} />
              </button>
            </div>

            {/* GitHub Source Link Card */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col justify-between space-y-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 bg-slate-800 text-slate-200 rounded-lg flex items-center justify-center border border-slate-700 shrink-0">
                  <Github size={17} />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">Source Code</div>
                  <p className="text-[10px] text-slate-500">Star & Fork</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Full TypeScript + React codebase, Capacitor plugins, and parsing engines.
              </p>
              <button
                onClick={(e) => openExternal(GITHUB_REPO_URL, e)}
                className="flex items-center justify-center space-x-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors border border-slate-700 cursor-pointer"
              >
                <span>GitHub Repo</span>
                <ExternalLink size={12} />
              </button>
            </div>

            {/* GitHub Sponsor Link Card */}
            <div className="p-3.5 bg-gradient-to-br from-rose-950/30 via-slate-900 to-slate-950 border border-rose-500/30 rounded-xl flex flex-col justify-between space-y-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 bg-rose-500/20 text-rose-300 rounded-lg flex items-center justify-center border border-rose-500/30 shrink-0">
                  <Heart size={17} className="fill-rose-400/30 text-rose-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-rose-200">Support Creator</div>
                  <p className="text-[10px] text-rose-400/80">GitHub Sponsors</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Help sustain independent local-first audio tooling and feature development.
              </p>
              <button
                onClick={(e) => openExternal(GITHUB_SPONSOR_URL, e)}
                className="flex items-center justify-center space-x-1.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all shadow-md shadow-rose-950/40 cursor-pointer"
              >
                <Heart size={12} className="fill-white" />
                <span>Sponsor Project</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'why-chinese-cjk-artists',
      category: 'why',
      title: 'Individual Representation for Chinese & Regional Artists',
      badge: 'Cultural Mission',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      summary: 'Rescuing meticulously crafted Chinese, Japanese, and indie music compilations from YouTube obscurity.',
      tags: ['chinese', 'cjk', 'bella ping', 'youtube', 'artists', 'utf-8', 'bom', 'taiwanese', 'mandopop'],
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            On YouTube, hundreds of incredible Chinese, Taiwanese, and Japanese artists (like those curated on <em>Bella Ping</em> and regional channels) are buried in monolithic video uploads or cluttered titles with noisy tags (<code>【歌詞字幕 / 完整高清音質】♫</code>).
          </p>
          <p>
            Listeners love the songs, but the artists remain anonymous "in an ocean". <strong>Scrape Stripper & Formatter</strong> strips all noise, extracts individual Artist and Song fields, preserves CJK characters via UTF-8 BOM, and generates clean CSV/TSV lists so listeners can port 1,000+ tracks to Spotify in seconds to follow and appreciate the individual creators.
          </p>
        </div>
      )
    },
    {
      id: 'why-daeso-loop',
      category: 'why',
      title: 'The DAESO Curation Cycle',
      badge: 'Framework',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      summary: 'Data → Analyze → Engineer → Systemize → Optimize framework.',
      tags: ['daeso', 'cycle', 'methodology', 'curation', 'play count'],
      content: (
        <div className="space-y-2 text-xs leading-relaxed text-slate-300">
          <ul className="space-y-1.5 list-disc list-inside text-[11px] text-slate-300">
            <li><strong className="text-indigo-300">Data (Capture):</strong> Raw play-history CSVs, scrape text dumps, screenshot digitizations.</li>
            <li><strong className="text-violet-300">Analyze:</strong> Tier filtering, song appearance frequency counters, missing-track reconciliations.</li>
            <li><strong className="text-fuchsia-300">Engineer:</strong> Sonic Sieve dynamic thresholds, smart randomizers, aesthetic tag editors.</li>
            <li><strong className="text-cyan-300">Systemize:</strong> Multi-part splitters, timeframe group mergers (Week/Month/Year archives).</li>
            <li><strong className="text-emerald-300">Optimize:</strong> Fuzzy cross-pruning, Jaro-Winkler duplicate removal, penalty lists.</li>
          </ul>
        </div>
      )
    },

    // --- QUICK START & WORKFLOWS ---
    {
      id: 'workflow-bridging-walled-gardens',
      category: 'workflows',
      title: 'Workflow 1: 🌉 Bridging Walled Streaming Gardens (The 4-Step Extension Loop)',
      badge: 'Flagship Architecture',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      summary: 'Extend desktop-grade power tools, play-count sieving, and cross-pruning to live Spotify, Apple Music & YouTube libraries.',
      tags: ['bridge', 'spotify', 'tunemymusic', 'soundiiz', 'workflow', 'streaming', 'musify', 'musicolet', 'walled garden'],
      content: (
        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <p>
            Mainstream streaming platforms are walled gardens with zero advanced curation capabilities. <strong>Playlist Haven acts as a bidirectional bridge</strong> that unlocks desktop power tools for your live streaming account:
          </p>

          <div className="space-y-2.5">
            {/* Step 1 */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-bold text-indigo-300 font-mono text-xs">
                <span className="w-5 h-5 bg-indigo-500/20 rounded-full flex items-center justify-center text-[10px]">1</span>
                <span>EXTRACT: Export from Walled Streaming Platforms</span>
              </div>
              <p className="text-[11px] text-slate-400 pl-7">
                Use online synchronization utilities like <strong className="text-slate-200">Tune My Music</strong> or <strong className="text-slate-200">Soundiiz</strong> (or browser text scrapers) to export your live Spotify, Apple Music, or YouTube playlists into standard <code>.csv</code> or <code>.txt</code> files.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-bold text-violet-300 font-mono text-xs">
                <span className="w-5 h-5 bg-violet-500/20 rounded-full flex items-center justify-center text-[10px]">2</span>
                <span>TRANSFORM: Ingest & Apply Desktop Power Tools</span>
              </div>
              <div className="text-[11px] text-slate-400 pl-7 space-y-1">
                <p>Import your CSV/TXT files into Playlist Haven's specialized tool modules:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                  <li><strong className="text-indigo-200">Playlist Manipulator:</strong> Open 2 to 4 playlists side-by-side in <em>Quad View</em> and fuzzy cross-prune duplicate songs across lists using Jaro-Winkler similarity.</li>
                  <li><strong className="text-indigo-200">Sonic Sieve:</strong> Filter tracks by play-count thresholds (e.g. $\ge 2$ plays) and rank them preserving positional memory with the Skeleton Anchor.</li>
                  <li><strong className="text-indigo-200">Scrape Stripper:</strong> Strip noise tags (HD, 4K, Official Video, CJK brackets), auto-split CJK artists, and normalize <code>feat.</code> credits.</li>
                  <li><strong className="text-indigo-200">Playlist Splitter / Tier Filter:</strong> Slice massive 2,000-track playlists into clean, digestible sub-playlists.</li>
                </ul>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-bold text-cyan-300 font-mono text-xs">
                <span className="w-5 h-5 bg-cyan-500/20 rounded-full flex items-center justify-center text-[10px]">3</span>
                <span>SYNCHRONIZE: Re-Import Clean Data Back to Streaming</span>
              </div>
              <p className="text-[11px] text-slate-400 pl-7">
                Click <strong>CSV</strong> or <strong>Copy Cleaned</strong> in Playlist Haven (exported with UTF-8 BOM encoding so Chinese, Japanese, and accented characters are never garbled). In <strong className="text-slate-200">Tune My Music</strong>, select <em>Upload CSV</em> $\rightarrow$ choose destination <strong className="text-slate-200">Spotify / YouTube Music</strong>. Your live streaming account is updated in seconds!
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-bold text-emerald-300 font-mono text-xs">
                <span className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center text-[10px]">4</span>
                <span>AUTONOMOUS TRANSITION: Port to Musify & Musicolet</span>
              </div>
              <p className="text-[11px] text-slate-400 pl-7">
                Alternatively, route your manipulated playlists into <strong className="text-slate-200">Musify</strong> (for free, ad-free YouTube streaming) or <strong className="text-slate-200">Musicolet</strong> on Android for complete, 100% offline listening autonomy.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'workflow-scrape-spotify',
      category: 'workflows',
      title: 'Workflow 2: Port 1,000+ YouTube Channel Songs to Spotify in 60s',
      badge: 'High-Speed Curation',
      badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
      summary: 'Scrape a YouTube channel or playlist, strip noise, and generate a clean CSV for Tune My Music.',
      tags: ['scrape', 'youtube', 'spotify', 'tunemymusic', 'workflow', 'channel', 'csv'],
      content: (
        <div className="space-y-2 text-xs text-slate-300">
          <ol className="space-y-2 list-decimal list-inside text-[11px] text-slate-300">
            <li>Open the YouTube channel (Videos tab) or Playlist page in your browser.</li>
            <li>Use the <strong>1-Click Console Scraper script</strong> (or click-drag text selection) to copy the raw text.</li>
            <li>In Playlist Haven, open <strong>Scrape Stripper & Formatter</strong> and paste the text into the input box.</li>
            <li>Ensure <strong>Exclude Recommendations</strong> is checked to prevent unrelated YouTube videos from leaking in.</li>
            <li>Review the cleaned live table. (Tip: Use <em>1-Click Swap Artist/Title</em> if titles were formatted as <code>Title / Artist</code>).</li>
            <li>Click <strong>CSV</strong> (exported with UTF-8 BOM so Chinese/Japanese characters are never garbled).</li>
            <li>Open <strong>Tune My Music</strong> $\rightarrow$ select <em>Upload CSV</em> $\rightarrow$ choose destination <strong>Spotify</strong>!</li>
          </ol>
        </div>
      )
    },
    {
      id: 'workflow-weekly-sonic-sieve',
      category: 'workflows',
      title: 'Workflow 3: Automated Weekly Listening Rotation (Musicolet + Sonic Sieve)',
      badge: 'Audiophile Routine',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      summary: 'Turn your offline Musicolet play history into an intelligent weekly top-tier playlist.',
      tags: ['musicolet', 'sonic sieve', 'weekly', 'play count', 'anchor', 'skeleton'],
      content: (
        <div className="space-y-2 text-xs text-slate-300">
          <ol className="space-y-2 list-decimal list-inside text-[11px]">
            <li>In Musicolet, export your library's <strong>Songs.csv</strong>.</li>
            <li>Open <strong>Sonic Sieve</strong> in Playlist Haven and upload the CSV file.</li>
            <li>Set your threshold (e.g. <code>≥ 2 plays</code>).</li>
            <li>Upload last week's playlist (e.g. <code>Most played Songs • Week 18 - 2026.m3u</code>) as your <strong>Skeleton Anchor</strong>.</li>
            <li>The engine preserves your positional listening memory for tied tracks and automatically outputs <code>Most played Songs • Week 19 - 2026 (Count).csv</code>.</li>
            <li>Import the new playlist back into Musicolet!</li>
          </ol>
        </div>
      )
    },
    {
      id: 'workflow-screenshot-vision-ai',
      category: 'workflows',
      title: 'Workflow 4: Digitize Playlist Screenshots with Vision AI',
      badge: 'AI Powered',
      badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
      summary: 'Convert images/screenshots of music playlists into standard playable M3U or CSV files.',
      tags: ['vision', 'ai', 'ocr', 'screenshot', 'ollama', 'gemini', 'local ai'],
      content: (
        <div className="space-y-2 text-xs text-slate-300">
          <p>
            Have a screenshot of an Instagram music story, a friend's playlist, or a DJ tracklist?
          </p>
          <ol className="space-y-1.5 list-decimal list-inside text-[11px]">
            <li>Open <strong>Vision-to-Playlist</strong>.</li>
            <li>Drag & drop the image screenshot.</li>
            <li>Select your backend: Cloud (Gemini) or <strong>100% Offline Local Model</strong> (Ollama / LM Studio).</li>
            <li>Click <em>Digitize Playlist</em> to extract tracks, deduplicate titles, and download a ready-to-play M3U or CSV!</li>
          </ol>
        </div>
      )
    },
    {
      id: 'workflow-matcher-reconciler',
      category: 'workflows',
      title: 'Workflow 5: Reconcile Shared Online Playlists with Local Library',
      badge: 'Local Paths',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      summary: 'Resolve online track names against your local storage audio files using fuzzy bigram matching.',
      tags: ['matcher', 'reconciler', 'fuzzy', 'local files', 'm3u', 'offline'],
      content: (
        <div className="space-y-2 text-xs text-slate-300 text-[11px]">
          <ol className="space-y-1.5 list-decimal list-inside">
            <li>Open <strong>Playlist Reconciler (Matcher)</strong>.</li>
            <li>Upload a shared M3U, CSV, or TXT playlist.</li>
            <li>Select your local music folder or upload your library index.</li>
            <li>The engine matches files using Jaro-Winkler bigram similarity and highlights unresolved songs for 1-click manual search.</li>
            <li>Download the playable local M3U playlist with your exact directory paths!</li>
          </ol>
        </div>
      )
    },

    // --- TOOL-BY-TOOL GUIDE ---
    {
      id: 'tool-scrape-stripper',
      category: 'tools',
      title: '🪄 Scrape Stripper & Formatter (Module #12)',
      badge: 'v3.1 Power Engine',
      badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
      summary: 'Parse messy YouTube channel & playlist text dumps into structured CSV, TSV, TXT, or M3U documents.',
      tags: ['scrape', 'stripper', 'parser', 'presets', 'swap', 'batch artist', 'recommendations', 'bom'],
      content: (
        <div className="space-y-3 text-xs text-slate-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="font-bold text-violet-300">🛡️ Auto Recommendation Exclusion</span>
              <p className="text-slate-400">Truncates parsing instantly at section headers like <em>Recommended videos</em> or <em>Recommended playlists</em>.</p>
            </div>
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="font-bold text-violet-300">🔄 1-Click Swap Artist/Title</span>
              <p className="text-slate-400">Instant toggle to reverse Title $\leftrightarrow$ Artist fields for CJK / Japanese tracks formatted as <code>Title / Artist</code>.</p>
            </div>
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="font-bold text-violet-300">✨ Smart Featured Normalizer</span>
              <p className="text-slate-400">Extracts <code>feat.</code> and <code>ft.</code> from titles into the Artist field automatically.</p>
            </div>
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="font-bold text-violet-300">🔖 Custom Rule Presets</span>
              <p className="text-slate-400">Save custom exclusion keywords and toggles to <code>localStorage</code> for specific channel niches.</p>
            </div>
          </div>
          <div className="p-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-[11px] text-violet-200">
            <strong>Export Column Selection:</strong> Use the column pills (<code>Title</code>, <code>Artist</code>, <code>Duration</code>, <code>Views</code>, <code>Age</code>) to include only the fields you need in your CSV/TSV/TXT exports.
          </div>
        </div>
      )
    },
    {
      id: 'tool-manipulator',
      category: 'tools',
      title: '🎚️ Playlist Manipulator (1, 2, and 4-Pane Modes)',
      badge: 'Quad-View Workbench',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      summary: 'Interactive workbench to rearrange, slice, cross-prune, and compare up to 4 playlists simultaneously.',
      tags: ['manipulator', 'multi-pane', 'quad view', 'cross-prune', 'combine', 'reorder', 'drag and drop'],
      content: (
        <div className="space-y-2 text-xs text-slate-300">
          <p>
            The Manipulator offers Single-Pane, Dual-Pane, or <strong>4-Pane Quad View</strong> modes for side-by-side playlist operations:
          </p>
          <ul className="space-y-1 list-disc list-inside text-[11px]">
            <li><strong>Universal Toolbar:</strong> Move Top, Move Bottom, Cross-Prune, Combine, and Copy To are universally available in all pane modes.</li>
            <li><strong>Fuzzy Cross-Pruning:</strong> Compare 2 to 4 open playlists to detect and remove duplicate songs across files using Jaro-Winkler similarity.</li>
            <li><strong>Drag-and-Drop:</strong> Reorder tracks manually with smooth container auto-scrolling.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'tool-sonic-sieve',
      category: 'tools',
      title: '🎛️ Sonic Sieve Logic Engine',
      badge: 'Core Sieve',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      summary: 'The mathematical weekly playlist generator with Skeleton Anchor technology.',
      tags: ['sonic sieve', 'play count', 'anchor', 'skeleton', 'musicolet', 'csv'],
      content: (
        <div className="space-y-2 text-xs text-slate-300">
          <p>
            Standard sorting introduces noise and destroys positional memory when dozens of songs share the same play count.
          </p>
          <p className="text-[11px]">
            <strong>The Skeleton Anchor:</strong> Upload last week's playlist to act as an anchor skeleton. Sonic Sieve locks existing tracks in their original order and cleanly inserts newly qualifying tracks at the bottom.
          </p>
        </div>
      )
    },
    {
      id: 'tool-reconciler',
      category: 'tools',
      title: '🔗 Offline Playlist Matcher & Reconciler',
      badge: 'Local Library',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      summary: 'Map shared online playlists to your local storage audio files with fuzzy bigram similarity.',
      tags: ['matcher', 'reconciler', 'fuzzy', 'local files', 'm3u', 'offline'],
      content: (
        <div className="space-y-2 text-xs text-slate-300">
          <p className="text-[11px]">
            Ingest an M3U, CSV, or TXT playlist and your local library directory. The engine matches filenames using bigram score cleaning, offers AI-assisted candidates for tough matches, and exports a playable M3U with exact local file paths.
          </p>
        </div>
      )
    },
    {
      id: 'tool-batch-utilities',
      category: 'tools',
      title: '🧩 Utilities: Merger, Splitter, Randomizer, Pruner & Renamer',
      badge: 'Suite',
      badgeColor: 'bg-slate-700 text-slate-300',
      summary: 'High-speed batch operations for large audio collections.',
      tags: ['merger', 'splitter', 'randomizer', 'pruner', 'renamer', 'tier filter'],
      content: (
        <div className="space-y-2 text-xs text-slate-300 text-[11px]">
          <p><strong>Merger:</strong> Combine multiple playlists with deduplication or auto-group by dates into weekly/monthly ZIP archives.</p>
          <p><strong>Splitter:</strong> Divide large playlists into 2 to 20 equal segments without shuffling order.</p>
          <p><strong>Randomizer:</strong> Multi-mode shuffling (artist grouping, segment shuffles, full mix).</p>
          <p><strong>Pruner:</strong> Use a Source playlist as an "Eraser" to strip matching songs across multiple target playlists.</p>
          <p><strong>Smart Renamer:</strong> Batch modify file path strings, casing, prefixes, and directory mappings.</p>
        </div>
      )
    },

    // --- GLOSSARY & FORMATS ---
    {
      id: 'glossary-m3u',
      category: 'glossary',
      title: 'M3U / M3U8 Playlist Files',
      badge: 'Playlist Standard',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      summary: 'The universal audio playlist standard featuring #EXTM3U and #EXTINF metadata.',
      tags: ['m3u', 'm3u8', 'extinf', 'format', 'audio', 'musicolet'],
      content: (
        <div className="space-y-2 text-xs text-slate-300 font-mono text-[11px]">
          <p className="font-sans text-xs">A standard M3U contains duration seconds, display title, and audio file path:</p>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300">
            #EXTM3U<br/>
            #EXTINF:216,Ryan.B & 周延英 - 沒有理由<br/>
            Music/Ryan.B - 沒有理由.mp3
          </div>
        </div>
      )
    },
    {
      id: 'glossary-bom',
      category: 'glossary',
      title: 'UTF-8 BOM (Byte Order Mark: \\uFEFF)',
      badge: 'Encoding',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      summary: 'The secret to preventing garbled Chinese, Japanese, Korean, and accented characters in Excel & Notepad.',
      tags: ['bom', 'utf-8', 'encoding', 'chinese', 'japanese', 'excel', 'garbled'],
      content: (
        <div className="space-y-2 text-xs text-slate-300">
          <p>
            When opening CSV files, Windows applications and Microsoft Excel default to ANSI mode unless a <strong>UTF-8 Byte Order Mark (<code>\uFEFF</code>)</strong> is present at the start of the file.
          </p>
          <p className="text-[11px] text-emerald-300">
            All CSV, TSV, and TXT files exported from Playlist Haven include UTF-8 BOM encoding automatically, ensuring zero garbled text across all platforms.
          </p>
        </div>
      )
    },
    {
      id: 'glossary-jaro-winkler',
      category: 'glossary',
      title: 'Jaro-Winkler Bigram Similarity',
      badge: 'Algorithm',
      badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
      summary: 'The intelligent fuzzy string matching algorithm used for deduplication and cross-pruning.',
      tags: ['algorithm', 'jaro-winkler', 'fuzzy', 'deduplication', 'matcher'],
      content: (
        <div className="space-y-2 text-xs text-slate-300 text-[11px]">
          <p>
            Unlike rigid character checks, Jaro-Winkler string distance rewards prefix matches and handles differences in spacing, casing, and bracketed noise (e.g. matching <code>"Song Name (Official Video)"</code> with <code>"Song Name"</code>).
          </p>
        </div>
      )
    },

    // --- FAQ & TROUBLESHOOTING ---
    {
      id: 'faq-console-scraper',
      category: 'faq',
      title: 'How do I automate YouTube scraping with the Browser Script?',
      badge: 'Automation Tip',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      summary: 'Auto-scroll and copy entire YouTube channels in 1 click without manual mouse dragging.',
      tags: ['scraper', 'script', 'console', 'bookmarklet', 'automation', 'youtube'],
      content: (
        <div className="space-y-2 text-xs text-slate-300">
          <p>
            Instead of manually clicking and dragging down a long channel page, open your browser Console (<code>F12</code> $\rightarrow$ <em>Console</em>) on any YouTube page and run:
          </p>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-mono text-violet-300 overflow-x-auto">
            javascript:(async function()&#123;let l=document.documentElement.scrollHeight,a=0;while(a&lt;15)&#123;window.scrollTo(0,document.documentElement.scrollHeight);await new Promise(r=&gt;setTimeout(r,1200));let n=document.documentElement.scrollHeight;if(n===l)&#123;a++&#125;else&#123;l=n;a=0&#125;&#125;await navigator.clipboard.writeText(document.body.innerText);alert("✅ Copied to clipboard!");&#125;)();
          </div>
          <p className="text-[11px]">
            The script will auto-scroll to the bottom, load all videos, and copy the text straight to your clipboard for Scrape Stripper!
          </p>
        </div>
      )
    },
    {
      id: 'faq-offline-ai',
      category: 'faq',
      title: 'Can I use Vision-to-Playlist completely offline?',
      badge: 'Privacy & Local-First',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      summary: 'Connect Playlist Haven to local Ollama or LM Studio models without any cloud API keys.',
      tags: ['offline', 'ollama', 'local ai', 'lm studio', 'vision', 'privacy'],
      content: (
        <div className="space-y-2 text-xs text-slate-300 text-[11px]">
          <p>
            Yes! Playlist Haven is 100% local-first and OpenAI-compatible. In <strong>Vision-to-Playlist</strong> Settings, switch the provider to <strong>OpenAI-Compatible</strong> and point the Base URL to your local Ollama instance (<code>http://localhost:11434/v1</code>) running <code>llama3.2-vision</code>.
          </p>
        </div>
      )
    }
  ];

  // Multi-Field Search Filter Engine
  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) {
      return guideTopics.filter(t => t.category === activeTab);
    }
    const q = searchQuery.toLowerCase().trim();
    return guideTopics.filter(t => 
      t.title.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q)) ||
      t.category.toLowerCase().includes(q)
    );
  }, [guideTopics, activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Modal Surface Box */}
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/90 space-y-3">
          
          {/* Top Row: Title, Reference Badge, and Header Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-violet-500/20 text-violet-400 rounded-2xl flex items-center justify-center border border-violet-500/30 shrink-0">
                <HelpCircle size={22} />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-black bg-gradient-to-r from-violet-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                    Playlist Haven User Guide & Philosophy
                  </h2>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Master the Experience Engine, tools, and streaming bridge</p>
              </div>
            </div>

            {/* Quick Header Actions: Blog, Sponsor, Source, ESC */}
            <div className="flex items-center space-x-2 shrink-0">
              
              {/* Substack Blog Button */}
              <button
                type="button"
                onClick={(e) => openExternal(SUBSTACK_BLOG_URL, e)}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 rounded-xl border border-amber-500/30 transition-all flex items-center gap-1.5 text-xs font-bold shadow shadow-amber-950/30 cursor-pointer"
                title="Read Beyond Shuffle & Algorithms on Substack"
              >
                <Bookmark size={13} className="text-amber-400 fill-amber-400/20" />
                <span>Blog</span>
              </button>

              {/* GitHub Sponsors Button */}
              <button
                type="button"
                onClick={(e) => openExternal(GITHUB_SPONSOR_URL, e)}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 rounded-xl border border-rose-500/30 transition-all flex items-center gap-1.5 text-xs font-bold shadow shadow-rose-950/30 cursor-pointer"
                title="Sponsor on GitHub (joejamal029)"
              >
                <Heart size={13} className="text-rose-400 fill-rose-500/30" />
                <span>Sponsor</span>
              </button>

              {/* GitHub Source Link Button */}
              <button
                type="button"
                onClick={(e) => openExternal(GITHUB_REPO_URL, e)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                title="Open GitHub Source Code (joejamal029/Playlist-Haven)"
              >
                <Github size={13} />
                <span className="hidden sm:inline">Source</span>
                <ExternalLink size={10} className="text-slate-400" />
              </button>

              {/* ESC Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 px-2.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors border border-slate-800 font-mono text-xs flex items-center gap-1 cursor-pointer"
                title="Close (ESC)"
              >
                <span>ESC</span>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Full-Width Search Input Bar */}
          <div className="flex items-center space-x-2.5 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 focus-within:border-violet-500/60 transition-colors shadow-inner">
            <Search size={16} className="text-slate-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search all guide topics, workflows, tools, and glossary (e.g. bridge, scrape, spotify, musicolet)..."
              className="bg-transparent text-xs text-slate-200 placeholder:text-slate-500 outline-none w-full font-medium"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer">
                <X size={14} />
              </button>
            )}
          </div>

        </div>

        {/* Category Navigation Tabs (Hidden when searching to show unified results) */}
        {!searchQuery.trim() ? (
          <div className="flex items-center px-4 py-2.5 gap-1.5 overflow-x-auto border-b border-slate-800 bg-slate-955/60 custom-scrollbar text-xs font-bold shrink-0">
            {categories.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-950/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-white' : tab.color} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-2.5 bg-violet-500/10 border-b border-violet-500/20 text-xs font-semibold text-violet-300 flex items-center justify-between">
            <span>Searching all guide topics for: <strong>"{searchQuery}"</strong> ({filteredTopics.length} matches)</span>
            <button
              onClick={() => setSearchQuery('')}
              className="text-[11px] underline hover:text-white font-bold cursor-pointer"
            >
              Clear search & view categories
            </button>
          </div>
        )}

        {/* Expand / Collapse Controls */}
        <div className="px-5 py-2 bg-slate-900 border-b border-slate-850 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <span>{filteredTopics.length} Topic{filteredTopics.length !== 1 ? 's' : ''} Available</span>
          <div className="flex items-center space-x-2">
            <button onClick={expandAll} className="hover:text-violet-400 transition-colors cursor-pointer">Expand All</button>
            <span>•</span>
            <button onClick={collapseAll} className="hover:text-violet-400 transition-colors cursor-pointer">Collapse All</button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {filteredTopics.length > 0 ? (
            filteredTopics.map(topic => {
              const isExpanded = !!expandedTopics[topic.id];
              return (
                <div
                  key={topic.id}
                  className={`border rounded-2xl transition-all duration-200 overflow-hidden ${
                    isExpanded 
                      ? 'bg-slate-955 border-slate-750 shadow-md' 
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Topic Accordion Header */}
                  <button
                    onClick={() => toggleTopic(topic.id)}
                    className="w-full p-4 text-left flex items-start justify-between gap-3 cursor-pointer"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                          {topic.title}
                        </h3>
                        {topic.badge && (
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${topic.badgeColor || 'bg-slate-800 text-slate-400'}`}>
                            {topic.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-normal">
                        {topic.summary}
                      </p>
                    </div>

                    <div className="p-1 text-slate-500 hover:text-slate-300 rounded-lg shrink-0 mt-0.5">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>

                  {/* Expanded Content Body */}
                  {isExpanded && (
                    <div className="p-4 pt-1 border-t border-slate-850/80 animate-in fade-in duration-150 space-y-3">
                      {topic.content}

                      {/* Tag Pills */}
                      {topic.tags && topic.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-slate-850/60">
                          <span className="text-[9px] font-mono text-slate-600 mr-1">Tags:</span>
                          {topic.tags.map(tag => (
                            <button
                              key={tag}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery(tag);
                              }}
                              className="text-[9px] font-mono bg-slate-900 text-slate-400 hover:text-violet-300 border border-slate-800 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center space-y-3">
              <Search size={32} className="text-slate-700 animate-pulse" />
              <p className="text-sm font-bold text-slate-400">No guide topics match "{searchQuery}"</p>
              <p className="text-xs text-slate-600 max-w-sm">
                Try searching for keywords like <em>substack</em>, <em>sponsor</em>, <em>bridge</em>, <em>github</em>, <em>scrape</em>, <em>spotify</em>, <em>chinese</em>, <em>cjk</em>, <em>bom</em>, <em>musicolet</em>, or <em>sieve</em>.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-colors mt-2 cursor-pointer"
              >
                Reset Search
              </button>
            </div>
          )}
        </div>

        {/* Footer Summary Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <div className="flex items-center space-x-2">
            <Sparkles size={14} className="text-violet-400" />
            <span>Playlist Haven — The Experience Engine Made Real</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={(e) => openExternal(SUBSTACK_BLOG_URL, e)}
              className="flex items-center space-x-1.5 text-amber-400 hover:text-amber-300 transition-colors font-mono text-[11px] cursor-pointer"
            >
              <Bookmark size={12} className="fill-amber-400/30" />
              <span>Substack Blog</span>
            </button>

            <span className="text-slate-700">•</span>

            <button
              type="button"
              onClick={(e) => openExternal(GITHUB_SPONSOR_URL, e)}
              className="flex items-center space-x-1.5 text-rose-400 hover:text-rose-300 transition-colors font-mono text-[11px] cursor-pointer"
            >
              <Heart size={12} className="fill-rose-400" />
              <span>Sponsor</span>
            </button>

            <span className="text-slate-700">•</span>

            <button
              type="button"
              onClick={(e) => openExternal(GITHUB_REPO_URL, e)}
              className="flex items-center space-x-1.5 text-slate-400 hover:text-violet-300 transition-colors font-mono text-[11px] cursor-pointer"
            >
              <Github size={13} />
              <span>GitHub</span>
              <ExternalLink size={10} />
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors shadow shadow-violet-950/40 text-xs ml-1 cursor-pointer"
            >
              Got it!
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
