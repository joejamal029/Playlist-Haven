import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Upload,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  CheckSquare,
  Square,
  Sliders,
  Search,
  Download,
  Copy,
  Compass,
  Globe,
  Database,
  HelpCircle,
  Info,
  Plus,
  Layers,
  Settings,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Play,
  Share2,
} from 'lucide-react';
import {
  SourceSection,
  ConsensusTrack,
  EnrichedConsensusTrack,
  ConcurrencyProgress,
  computeConsensus,
  processSourceSectionsConcurrently,
  runConcurrentAISearchGrounding,
  generateTuneMyMusicCSV,
  generateConsensusM3U,
  generateConsensusTSV,
  RADIOHEAD_SAMPLE_SECTIONS,
} from '../services/consensusEngine';
import { getAIConfig, setAIConfig, AIConfig } from '../services/visionEngine';
import { downloadPlaylistFile } from '../services/downloadHelper';
import AudioPreviewButton from '../components/AudioPreviewButton';
import SongMetadataInspectorModal from '../components/SongMetadataInspectorModal';
import { TriageTrack } from '../services/triageEngine';

interface ConsensusAggregatorViewProps {
  onBack: () => void;
  onOpenHelp?: () => void;
  onViewSelect?: (view: any) => void;
}

export default function ConsensusAggregatorView({
  onBack,
  onOpenHelp,
  onViewSelect,
}: ConsensusAggregatorViewProps) {
  // State: AI Config
  const [aiConfig, setAiConfigState] = useState<AIConfig>(() => getAIConfig());
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // State: Source Sections (Clearly Differentiated Multi-Source Organization)
  const [sections, setSections] = useState<SourceSection[]>([
    {
      id: 'section-1',
      name: 'Source 1: Rolling Stone / Critic Poll',
      inputType: 'files',
      files: [],
      textDump: '',
      enabled: true,
      trackCount: 0,
      tracks: [],
    },
    {
      id: 'section-2',
      name: 'Source 2: Reddit / Fan Community Consensus',
      inputType: 'text',
      files: [],
      textDump: '',
      enabled: true,
      trackCount: 0,
      tracks: [],
    },
  ]);

  // State: Concurrency & Processing HUD
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<ConcurrencyProgress>({
    stage: 'idle',
    total: 0,
    processed: 0,
    failed: 0,
    currentItem: '',
  });

  // State: Consensus Matrix Results
  const [rawConsensusTracks, setRawConsensusTracks] = useState<ConsensusTrack[]>([]);
  const [groundedTracks, setGroundedTracks] = useState<EnrichedConsensusTrack[]>([]);
  const [isGrounded, setIsGrounded] = useState<boolean>(false);

  // State: Threshold & Filter Controls
  const [minThreshold, setMinThreshold] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // State: Inspector Modal & Toast
  const [inspectedTrack, setInspectedTrack] = useState<ConsensusTrack | EnrichedConsensusTrack | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  // Active enabled sections count
  const activeSectionsCount = useMemo(() => sections.filter(s => s.enabled).length, [sections]);

  // Filtered consensus tracks
  const displayedTracks = useMemo(() => {
    const baseList: (ConsensusTrack | EnrichedConsensusTrack)[] = isGrounded && groundedTracks.length > 0
      ? groundedTracks
      : rawConsensusTracks;

    const query = searchQuery.trim().toLowerCase();

    return baseList
      .filter(t => {
        if (t.consensusCount < minThreshold) return false;
        if (query) {
          const enriched = t as EnrichedConsensusTrack;
          const matchTitle = (enriched.verifiedTitle || t.title).toLowerCase().includes(query);
          const matchArtist = (enriched.verifiedArtist || t.artist).toLowerCase().includes(query);
          const matchAlbum = (enriched.verifiedAlbum || t.album).toLowerCase().includes(query);
          return matchTitle || matchArtist || matchAlbum;
        }
        return true;
      })
      .sort((a, b) => {
        if (b.consensusCount !== a.consensusCount) {
          return b.consensusCount - a.consensusCount;
        }
        if (b.consensusPercentage !== a.consensusPercentage) {
          return b.consensusPercentage - a.consensusPercentage;
        }
        return a.title.localeCompare(b.title);
      });
  }, [rawConsensusTracks, groundedTracks, isGrounded, minThreshold, searchQuery]);

  // Section Management Helpers
  const handleAddSection = () => {
    const newId = `section-${Date.now()}`;
    setSections(prev => [
      ...prev,
      {
        id: newId,
        name: `Source ${prev.length + 1}: Named Collection`,
        inputType: 'files',
        files: [],
        textDump: '',
        enabled: true,
        trackCount: 0,
        tracks: [],
      },
    ]);
  };

  const handleUpdateSectionName = (id: string, name: string) => {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, name } : s)));
  };

  const handleUpdateSectionInputType = (id: string, inputType: 'files' | 'text' | 'ocr') => {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, inputType } : s)));
  };

  const handleUpdateSectionFiles = (id: string, files: File[]) => {
    setSections(prev =>
      prev.map(s => (s.id === id ? { ...s, files: [...s.files, ...files] } : s))
    );
  };

  const handleClearSectionFiles = (id: string) => {
    setSections(prev =>
      prev.map(s => (s.id === id ? { ...s, files: [], tracks: [], trackCount: 0 } : s))
    );
  };

  const handleUpdateSectionText = (id: string, textDump: string) => {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, textDump } : s)));
  };

  const handleToggleSection = (id: string) => {
    setSections(prev => {
      const updated = prev.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s));
      // Recompute consensus immediately when sections toggle
      const newConsensus = computeConsensus(updated, 1, '');
      setRawConsensusTracks(newConsensus);
      return updated;
    });
  };

  const handleDeleteSection = (id: string) => {
    setSections(prev => {
      const updated = prev.filter(s => s.id !== id);
      const newConsensus = computeConsensus(updated, 1, '');
      setRawConsensusTracks(newConsensus);
      return updated;
    });
    showToast('Source section removed.');
  };

  const handleClearAllSections = () => {
    if (confirm('Clear all source sections and reset the consensus matrix?')) {
      setSections([]);
      setRawConsensusTracks([]);
      setGroundedTracks([]);
      setIsGrounded(false);
      setSelectedTrackIds(new Set());
      showToast('All sections cleared.');
    }
  };

  // Load Curated Sample Preset
  const handleLoadSampleCrate = () => {
    setSections(RADIOHEAD_SAMPLE_SECTIONS);
    const consensus = computeConsensus(RADIOHEAD_SAMPLE_SECTIONS, 1, '');
    setRawConsensusTracks(consensus);
    setMinThreshold(2); // Recommend >= 2 to isolate consensus immediately
    setGroundedTracks([]);
    setIsGrounded(false);
    setSelectedTrackIds(new Set());
    showToast('Loaded 4 Radiohead consensus source sections!');
  };

  // 1. Process & Extract Consensus (Concurrent Worker Pool)
  const handleExtractConsensus = async () => {
    setIsProcessing(true);
    setGroundedTracks([]);
    setIsGrounded(false);

    try {
      // Step 1: Concurrently process all sections (CONCURRENCY = 4)
      const processedSections = await processSourceSectionsConcurrently(sections, prog => {
        setProgress(prog);
      });

      setSections(processedSections);

      // Step 2: Compute cross-tabulation consensus
      setProgress({
        stage: 'aggregating',
        total: processedSections.length,
        processed: processedSections.length,
        failed: 0,
        currentItem: 'Cross-tabulating consensus matrix with Jaro-Winkler similarity...',
      });

      const consensus = computeConsensus(processedSections, 1, '');
      setRawConsensusTracks(consensus);

      const activeCount = processedSections.filter(s => s.enabled && s.trackCount > 0).length;
      if (activeCount >= 2 && minThreshold === 1) {
        setMinThreshold(2);
      }

      setProgress({
        stage: 'complete',
        total: consensus.length,
        processed: consensus.length,
        failed: 0,
        currentItem: `Successfully aggregated ${consensus.length} consensus candidates!`,
      });

      showToast(`Extracted ${consensus.length} consensus songs across ${activeCount} active sources!`);
    } catch (err: any) {
      console.error('Consensus Extraction Failed:', err);
      showToast(`Extraction failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Run Google Search Grounded AI Verification (CONCURRENCY = 4)
  const handleRunAISearchGrounding = async () => {
    if (rawConsensusTracks.length === 0) {
      showToast('Extract consensus first before running AI Search Grounding.');
      return;
    }

    setIsProcessing(true);

    try {
      // Target tracks based on current threshold or selection
      const targets = selectedTrackIds.size > 0
        ? rawConsensusTracks.filter(t => selectedTrackIds.has(t.id))
        : rawConsensusTracks.filter(t => t.consensusCount >= minThreshold);

      if (targets.length === 0) {
        showToast('No tracks meet the current filter criteria for AI search.');
        setIsProcessing(false);
        return;
      }

      showToast(`Running AI Search Grounding across ${targets.length} tracks (CONCURRENCY = 4)...`);

      const enriched = await runConcurrentAISearchGrounding(targets, prog => {
        setProgress(prog);
      });

      // Merge enriched tracks with base tracks
      const enrichedMap = new Map(enriched.map(e => [e.id, e]));
      const merged = rawConsensusTracks.map(t => enrichedMap.get(t.id) || t);

      setGroundedTracks(merged as EnrichedConsensusTrack[]);
      setIsGrounded(true);

      showToast(`AI Search Grounding complete for ${enriched.length} tracks!`);
    } catch (err: any) {
      console.error('AI Grounding Failed:', err);
      showToast(`AI Grounding error: ${err.message || 'Search failed'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Selection Helpers
  const handleToggleSelectAll = () => {
    if (selectedTrackIds.size === displayedTracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(displayedTracks.map(t => t.id)));
    }
  };

  const handleToggleSelectTrack = (id: string) => {
    setSelectedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Effective targets for export / staging
  const getTargetTracks = (): (ConsensusTrack | EnrichedConsensusTrack)[] => {
    if (selectedTrackIds.size > 0) {
      return displayedTracks.filter(t => selectedTrackIds.has(t.id));
    }
    return displayedTracks;
  };

  // Exporters
  const handleExportTuneMyMusicCSV = async () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks to export.');
      return;
    }
    const csvContent = generateTuneMyMusicCSV(targets);
    await downloadPlaylistFile(
      csvContent,
      `consensus_masterpieces_tunemymusic_${targets.length}.csv`,
      'text/csv;charset=utf-8;'
    );
    showToast(`Exported TuneMyMusic CSV (${targets.length} tracks with UTF-8 BOM)!`);
  };

  const handleExportM3U = async () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks to export.');
      return;
    }
    const m3uContent = generateConsensusM3U(targets);
    await downloadPlaylistFile(
      m3uContent,
      `consensus_masterpieces_${targets.length}.m3u`,
      'audio/x-mpegurl'
    );
    showToast(`Exported M3U playlist (${targets.length} tracks)!`);
  };

  const handleCopyTSV = async () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks to copy.');
      return;
    }
    const tsvContent = generateConsensusTSV(targets);
    try {
      await navigator.clipboard.writeText(tsvContent);
      showToast(`Copied ${targets.length} consensus tracks to clipboard!`);
    } catch {
      showToast('Clipboard access denied.');
    }
  };

  // Downstream Curation Bridges
  const handleStageToTriage = () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks to stage for Triage.');
      return;
    }

    const payload = targets.map((t) => {
      const enriched = t as EnrichedConsensusTrack;
      const finalArtist = enriched.verifiedArtist || t.artist;
      const finalTitle = enriched.verifiedTitle || t.title;
      const finalAlbum = enriched.verifiedAlbum || t.album || 'Consensus Masterpiece';

      return {
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        culturalBucket: 'Other',
        sourceDetails: `Consensus ${t.consensusCount}/${t.totalSources} (${Array.from(t.sources).join(', ')})`,
        confidence: enriched.confidence,
        stagedAt: new Date().toISOString(),
      };
    });

    try {
      localStorage.setItem('playlist_haven_triage_intake', JSON.stringify(payload));
      showToast(`Staged ${payload.length} consensus tracks for Discovery Triage!`);
      if (onViewSelect) {
        onViewSelect('triage');
      }
    } catch (e: any) {
      showToast(`Failed to stage tracks: ${e.message}`);
    }
  };

  // Convert ConsensusTrack to minimal TriageTrack for SongMetadataInspectorModal
  const inspectedTriageTrack = useMemo<TriageTrack | null>(() => {
    if (!inspectedTrack) return null;
    const enriched = inspectedTrack as EnrichedConsensusTrack;
    const artist = enriched.verifiedArtist || inspectedTrack.artist;
    const title = enriched.verifiedTitle || inspectedTrack.title;
    const album = enriched.verifiedAlbum || inspectedTrack.album || 'Consensus Masterpiece';

    return {
      id: inspectedTrack.id,
      title,
      artist,
      album,
      rawTitle: `${artist} - ${title}`,
      sources: Array.from(inspectedTrack.sources) as any,
      sourceOrder: 1,
      resonanceTier: inspectedTrack.consensusPercentage >= 60 ? 'high' : 'emerging',
      triageStatus: 'inbox',
      downloadPriority: 'immediate',
      culturalBucket: 'Other',
      confidence: enriched.confidence,
      addedAt: new Date().toISOString(),
      sourceDetails: `Consensus: ${inspectedTrack.consensusCount}/${inspectedTrack.totalSources} sources (${inspectedTrack.consensusPercentage}%)`,
    };
  }, [inspectedTrack]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-200 pb-32">
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all active:scale-95 cursor-pointer"
            title="Return to Dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <BarChart3 className="text-cyan-400" size={20} />
                <span>Consensus Aggregator</span>
              </h1>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                Layer 1: Discovery
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono hidden sm:inline">
                Module 17
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block font-medium">
              Multi-source crate-digging with concurrent worker pools & Google Search Grounding.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* AI Settings Config Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              showSettings
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Configure AI Engine (Gemini Cloud vs Local Ollama/LM Studio)"
          >
            <Settings size={16} />
          </button>

          {/* Load Sample Crate Button */}
          <button
            onClick={handleLoadSampleCrate}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-cyan-950 to-slate-900 hover:from-cyan-900 hover:to-slate-800 text-cyan-300 px-3 py-1.5 rounded-xl border border-cyan-500/40 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
            title="Load 4 Radiohead consensus sources for instant verification"
          >
            <Sparkles size={14} className="text-cyan-400" />
            <span className="hidden md:inline">Load Sample Crate</span>
            <span className="md:hidden">Sample</span>
          </button>

          {/* Quick Help Button */}
          {onOpenHelp && (
            <button
              onClick={onOpenHelp}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              title="Consensus Aggregator Guidance & Docs"
            >
              <HelpCircle size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Collapsible AI Engine Settings Drawer */}
      {showSettings && (
        <section aria-label="AI Engine Settings" className="bg-slate-900/90 border-b border-slate-800 p-4 animate-in slide-in-from-top duration-200">
          <div className="max-w-6xl mx-auto bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                <Settings size={14} />
                <span>AI Grounding & Verification Configuration</span>
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-xs text-slate-500 hover:text-slate-300 font-bold cursor-pointer"
              >
                Close Settings
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">
                  AI Provider
                </label>
                <select
                  value={aiConfig.provider}
                  onChange={e => {
                    const provider = e.target.value as 'gemini' | 'openai-compatible';
                    const modelName = provider === 'gemini' ? 'gemini-2.5-flash' : 'llava';
                    const updated = { ...aiConfig, provider, modelName };
                    setAiConfigState(updated);
                    setAIConfig(updated);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 outline-none rounded-xl p-2.5 text-xs text-slate-200"
                >
                  <option value="gemini">Google Gemini (Cloud SDK + Google Search Grounding)</option>
                  <option value="openai-compatible">Custom / Local (Ollama, LM Studio, vLLM)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  {aiConfig.provider === 'gemini'
                    ? 'Uses official Google GenAI with live Google Search web grounding for canonical artist/album verification.'
                    : 'Uses local OpenAI-compatible endpoint with zero external data transmission.'}
                </p>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">
                  Model Identifier
                </label>
                <input
                  type="text"
                  value={aiConfig.modelName}
                  onChange={e => {
                    const updated = { ...aiConfig, modelName: e.target.value };
                    setAiConfigState(updated);
                    setAIConfig(updated);
                  }}
                  placeholder={aiConfig.provider === 'gemini' ? 'gemini-2.5-flash' : 'llava'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 outline-none rounded-xl p-2.5 text-xs text-slate-200"
                />
              </div>

              {aiConfig.provider === 'openai-compatible' && (
                <div className="md:col-span-2">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">
                    Custom Base Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={aiConfig.baseUrl}
                    onChange={e => {
                      const updated = { ...aiConfig, baseUrl: e.target.value };
                      setAiConfigState(updated);
                      setAIConfig(updated);
                    }}
                    placeholder="http://localhost:11434/v1"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 outline-none rounded-xl p-2.5 text-xs text-slate-200"
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">
                  {aiConfig.provider === 'gemini' ? 'Gemini API Key (Overrides env)' : 'API Key (Optional / Bearer Token)'}
                </label>
                <input
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={e => {
                    const updated = { ...aiConfig, apiKey: e.target.value };
                    setAiConfigState(updated);
                    setAIConfig(updated);
                  }}
                  placeholder={aiConfig.provider === 'gemini' ? 'AIzaSy...' : 'Optional Auth Token'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 outline-none rounded-xl p-2.5 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-6">
        
        {/* 2. Differentiated Source Sections Container */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers size={18} className="text-cyan-400" />
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Independent Source Sections
              </h2>
              <span className="text-xs bg-slate-800 text-cyan-300 font-mono px-2.5 py-0.5 rounded-full font-bold">
                {activeSectionsCount} of {sections.length} active
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleAddSection}
                className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Source Section</span>
              </button>

              {sections.length > 0 && (
                <button
                  onClick={handleClearAllSections}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center space-x-1 font-bold px-2.5 py-1.5 rounded-xl hover:bg-slate-900 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {/* Source Section Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sections.map(section => (
              <div
                key={section.id}
                className={`bg-slate-900/60 border rounded-2xl p-4 transition-all shadow-xl backdrop-blur-sm flex flex-col justify-between ${
                  section.enabled ? 'border-slate-800 hover:border-slate-700' : 'border-slate-850 opacity-60'
                }`}
              >
                <div>
                  {/* Section Card Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-3">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={section.enabled}
                        onChange={() => handleToggleSection(section.id)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-500"
                        title={section.enabled ? 'Disable source from consensus' : 'Enable source for consensus'}
                      />
                      <input
                        type="text"
                        value={section.name}
                        onChange={e => handleUpdateSectionName(section.id, e.target.value)}
                        className="bg-transparent text-sm font-bold text-slate-100 border-b border-transparent hover:border-slate-700 focus:border-cyan-500 outline-none px-1 py-0.5 flex-1 min-w-0 truncate"
                        placeholder="Name this source..."
                      />
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <span className="text-[10px] bg-slate-800 text-cyan-300 font-mono font-bold px-2 py-0.5 rounded-full">
                        {section.trackCount} tracks
                      </span>
                      <button
                        onClick={() => handleDeleteSection(section.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Delete this source section"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Input Type Selector Tabs */}
                  <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold mb-3">
                    <button
                      onClick={() => handleUpdateSectionInputType(section.id, 'files')}
                      className={`flex-1 flex items-center justify-center space-x-1 py-1 rounded-lg transition-all cursor-pointer ${
                        section.inputType === 'files'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileText size={12} />
                      <span>Files (CSV/M3U)</span>
                    </button>

                    <button
                      onClick={() => handleUpdateSectionInputType(section.id, 'text')}
                      className={`flex-1 flex items-center justify-center space-x-1 py-1 rounded-lg transition-all cursor-pointer ${
                        section.inputType === 'text'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Plus size={12} />
                      <span>Paste Text</span>
                    </button>

                    <button
                      onClick={() => handleUpdateSectionInputType(section.id, 'ocr')}
                      className={`flex-1 flex items-center justify-center space-x-1 py-1 rounded-lg transition-all cursor-pointer ${
                        section.inputType === 'ocr'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <ImageIcon size={12} />
                      <span>Screenshot OCR</span>
                    </button>
                  </div>

                  {/* Section Content: Files Mode */}
                  {section.inputType === 'files' && (
                    <div className="space-y-2">
                      <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault();
                          if (e.dataTransfer.files) {
                            handleUpdateSectionFiles(section.id, Array.from(e.dataTransfer.files));
                          }
                        }}
                        className="border border-dashed border-slate-700/80 hover:border-cyan-500/60 rounded-xl p-4 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/70 transition-all flex flex-col items-center justify-center space-y-1 relative"
                      >
                        <input
                          type="file"
                          multiple
                          accept=".csv,.tsv,.m3u,.m3u8,.txt"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={e => {
                            if (e.target.files) {
                              handleUpdateSectionFiles(section.id, Array.from(e.target.files));
                            }
                          }}
                        />
                        <Upload size={18} className="text-cyan-400" />
                        <p className="text-xs font-bold text-slate-200">
                          Drop .csv, .m3u, or .txt files for this source
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Click to browse or drop files into this section
                        </p>
                      </div>

                      {section.files.length > 0 && (
                        <div className="flex items-center justify-between text-xs bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400 truncate">
                            {section.files.length} file(s): {section.files.map(f => f.name).join(', ')}
                          </span>
                          <button
                            onClick={() => handleClearSectionFiles(section.id)}
                            className="text-slate-500 hover:text-rose-400 ml-2 font-bold cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section Content: Text Mode */}
                  {section.inputType === 'text' && (
                    <div>
                      <textarea
                        rows={3}
                        placeholder={"Paste tracklist (e.g. 'Artist - Title' or 'Title'):\nRadiohead - Paranoid Android\nRadiohead - Karma Police\nRadiohead - Idioteque"}
                        value={section.textDump}
                        onChange={e => handleUpdateSectionText(section.id, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  )}

                  {/* Section Content: OCR Mode */}
                  {section.inputType === 'ocr' && (
                    <div className="space-y-2">
                      <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault();
                          if (e.dataTransfer.files) {
                            handleUpdateSectionFiles(section.id, Array.from(e.dataTransfer.files));
                          }
                        }}
                        className="border border-dashed border-slate-700/80 hover:border-violet-500/60 rounded-xl p-4 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/70 transition-all flex flex-col items-center justify-center space-y-1 relative"
                      >
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={e => {
                            if (e.target.files) {
                              handleUpdateSectionFiles(section.id, Array.from(e.target.files));
                            }
                          }}
                        />
                        <ImageIcon size={18} className="text-violet-400" />
                        <p className="text-xs font-bold text-slate-200">
                          Drop playlist screenshot(s) for Vision AI
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Flyers, streaming screenshots, or forum captures
                        </p>
                      </div>

                      {section.files.length > 0 && (
                        <div className="flex items-center justify-between text-xs bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400 truncate">
                            {section.files.length} screenshot(s) loaded
                          </span>
                          <button
                            onClick={() => handleClearSectionFiles(section.id)}
                            className="text-slate-500 hover:text-rose-400 ml-2 font-bold cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Action Execution & Concurrency Progress HUD */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExtractConsensus}
              disabled={isProcessing || activeSectionsCount === 0}
              className={`flex-1 py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-xl cursor-pointer ${
                !isProcessing && activeSectionsCount > 0
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 shadow-cyan-950/30 active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'
              }`}
            >
              {isProcessing && progress.stage === 'parsing' ? (
                <RefreshCw size={16} className="animate-spin text-slate-950" />
              ) : (
                <BarChart3 size={16} />
              )}
              <span>
                {isProcessing && progress.stage === 'parsing'
                  ? `Parsing Sources (${progress.processed}/${progress.total})...`
                  : `Extract Consensus (${activeSectionsCount} Active Sources)`}
              </span>
            </button>

            <button
              onClick={handleRunAISearchGrounding}
              disabled={isProcessing || rawConsensusTracks.length === 0}
              className={`flex-1 py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-xl cursor-pointer ${
                !isProcessing && rawConsensusTracks.length > 0
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-slate-950 shadow-amber-950/30 active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'
              }`}
              title="Verify consensus songs against live web results via Gemini Google Search Grounding"
            >
              {isProcessing && progress.stage === 'ai_search' ? (
                <RefreshCw size={16} className="animate-spin text-slate-950" />
              ) : (
                <Sparkles size={16} />
              )}
              <span>
                {isProcessing && progress.stage === 'ai_search'
                  ? `AI Search Grounding (${progress.processed}/${progress.total})...`
                  : 'AI Search Grounding (Web Verification)'}
              </span>
            </button>
          </div>

          {/* Concurrency Progress HUD */}
          {isProcessing && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 animate-in fade-in duration-300">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="font-bold text-cyan-300 uppercase tracking-wider font-mono">
                    Stage: {progress.stage.replace('_', ' ')}
                  </span>
                </div>
                <span className="font-mono text-slate-400">
                  {progress.processed} / {progress.total} items
                </span>
              </div>

              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate max-w-md font-mono">{progress.currentItem}</span>
                {progress.failed > 0 && (
                  <span className="text-rose-400 font-bold font-mono">
                    {progress.failed} failed item(s)
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 4. Consensus Control Bar */}
        {rawConsensusTracks.length > 0 && (
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Dynamic Threshold Slider */}
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 font-bold text-slate-300">
                    <Sliders size={15} className="text-cyan-400" />
                    <span>Consensus Threshold</span>
                  </div>
                  <span className="font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2.5 py-0.5 rounded-lg">
                    Appears in &ge; {minThreshold} of {activeSectionsCount} sources (
                    {activeSectionsCount > 0 ? Math.round((minThreshold / activeSectionsCount) * 100) : 0}%+)
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={Math.max(activeSectionsCount, 1)}
                  step={1}
                  value={minThreshold}
                  onChange={e => setMinThreshold(parseInt(e.target.value, 10))}
                  disabled={activeSectionsCount === 0}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Search live filter */}
              <div className="w-full md:w-64 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter songs, artists..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Quick Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Quick Filters:
              </span>

              <button
                onClick={() => setMinThreshold(1)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  minThreshold === 1
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                All Candidates (&ge;1)
              </button>

              <button
                onClick={() => setMinThreshold(Math.min(2, activeSectionsCount))}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  minThreshold === Math.min(2, activeSectionsCount) && minThreshold !== 1
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Emerging Consensus (&ge;2)
              </button>

              <button
                onClick={() => setMinThreshold(Math.max(1, Math.ceil(activeSectionsCount * 0.5)))}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  minThreshold === Math.max(1, Math.ceil(activeSectionsCount * 0.5)) && minThreshold > 1
                    ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Strong Consensus (&ge;50%)
              </button>

              <button
                onClick={() => setMinThreshold(activeSectionsCount)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  minThreshold === activeSectionsCount && activeSectionsCount > 1
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Unanimous Masterpieces (100%)
              </button>

              <div className="ml-auto text-xs text-slate-400 font-mono">
                Showing <strong className="text-white">{displayedTracks.length}</strong> consensus tracks
                {isGrounded && (
                  <span className="text-amber-400 font-bold ml-1.5 flex-inline items-center gap-1">
                    <Sparkles size={11} className="inline mr-0.5" />
                    AI Grounded
                  </span>
                )}
                {selectedTrackIds.size > 0 && (
                  <span className="text-cyan-400 ml-1.5">({selectedTrackIds.size} selected)</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 5. The Consensus Track Table */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                <tr>
                  <th className="p-3.5 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-slate-400 hover:text-white cursor-pointer"
                      title={selectedTrackIds.size === displayedTracks.length ? 'Deselect All' : 'Select All'}
                    >
                      {displayedTracks.length > 0 && selectedTrackIds.size === displayedTracks.length ? (
                        <CheckSquare size={16} className="text-cyan-400" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="p-3.5 w-12 text-center">Preview</th>
                  <th className="p-3.5 w-12 text-center">#</th>
                  <th className="p-3.5">Title & Artist</th>
                  <th className="p-3.5 hidden md:table-cell">Album</th>
                  <th className="p-3.5 w-52">Consensus Score</th>
                  <th className="p-3.5 hidden lg:table-cell">Nominated By</th>
                  {isGrounded && <th className="p-3.5 w-24 text-center">AI Search</th>}
                  <th className="p-3.5 w-16 text-center">Info</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-850">
                {displayedTracks.length === 0 ? (
                  <tr>
                    <td colSpan={isGrounded ? 9 : 8} className="p-10 text-center text-slate-500">
                      {rawConsensusTracks.length === 0
                        ? 'Populate source sections and click "Extract Consensus" above.'
                        : 'No tracks meet the current consensus threshold or search filter.'}
                    </td>
                  </tr>
                ) : (
                  displayedTracks.map((track, idx) => {
                    const isSelected = selectedTrackIds.has(track.id);
                    const enriched = track as EnrichedConsensusTrack;

                    const finalArtist = enriched.verifiedArtist || track.artist;
                    const finalTitle = enriched.verifiedTitle || track.title;
                    const finalAlbum = enriched.verifiedAlbum || track.album;

                    // Dynamic progress bar styling
                    let progressBg = 'bg-slate-600';
                    let badgeBg = 'bg-slate-800 text-slate-400 border-slate-700';

                    if (track.consensusPercentage === 100) {
                      progressBg = 'bg-emerald-500';
                      badgeBg = 'bg-emerald-950/80 text-emerald-300 border-emerald-700';
                    } else if (track.consensusPercentage >= 60) {
                      progressBg = 'bg-cyan-500';
                      badgeBg = 'bg-cyan-950/80 text-cyan-300 border-cyan-700';
                    } else if (track.consensusPercentage >= 40) {
                      progressBg = 'bg-blue-500';
                      badgeBg = 'bg-blue-950/80 text-blue-300 border-blue-700';
                    }

                    return (
                      <tr
                        key={track.id}
                        className={`hover:bg-slate-850/50 transition-colors ${
                          isSelected ? 'bg-cyan-950/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectTrack(track.id)}
                            className="text-slate-400 hover:text-white cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare size={16} className="text-cyan-400" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </td>

                        {/* In-App 30s iTunes Preview */}
                        <td className="p-3.5 text-center">
                          <AudioPreviewButton
                            size="sm"
                            track={{
                              id: track.id,
                              artist: finalArtist,
                              title: finalTitle,
                              album: finalAlbum,
                            }}
                          />
                        </td>

                        {/* Rank */}
                        <td className="p-3.5 text-center font-mono text-slate-500 font-bold">
                          {idx + 1}
                        </td>

                        {/* Title & Artist */}
                        <td className="p-3.5">
                          <div className="font-bold text-slate-100 text-sm">{finalTitle}</div>
                          <div className="text-xs text-slate-400">{finalArtist}</div>
                        </td>

                        {/* Album */}
                        <td className="p-3.5 hidden md:table-cell text-slate-400 max-w-xs truncate">
                          {finalAlbum || '—'}
                        </td>

                        {/* Consensus Score */}
                        <td className="p-3.5">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className={`px-2 py-0.5 rounded border font-bold ${badgeBg}`}>
                                {track.consensusCount} / {track.totalSources} sources
                              </span>
                              <span className="font-bold text-slate-300">
                                {track.consensusPercentage}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${progressBg}`}
                                style={{ width: `${track.consensusPercentage}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Sources Breakdown */}
                        <td className="p-3.5 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {Array.from(track.sources).map(src => (
                              <span
                                key={src}
                                className="text-[10px] bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-md truncate max-w-[150px]"
                                title={src}
                              >
                                {src}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* AI Search Confidence Badge */}
                        {isGrounded && (
                          <td className="p-3.5 text-center">
                            {enriched.confidence ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                                    enriched.confidence === 'high'
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : enriched.confidence === 'medium'
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {enriched.confidence}
                                </span>
                                {enriched.searchUrl && (
                                  <a
                                    href={enriched.searchUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[9px] text-cyan-400 hover:underline flex items-center gap-0.5"
                                    title="View Google Search web citation"
                                  >
                                    <span>Source</span>
                                    <ExternalLink size={9} />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600 font-mono">—</span>
                            )}
                          </td>
                        )}

                        {/* Inspector Trigger */}
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => setInspectedTrack(track)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 hover:text-slate-950 text-slate-300 transition-colors cursor-pointer"
                            title="Inspect Deep Metadata & Songwriting Credits"
                          >
                            <Info size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* 6. Action & Downstream Curation Bar */}
      {displayedTracks.length > 0 && (
        <aside aria-label="Action and Downstream Curation Bar" className="fixed bottom-0 left-0 right-0 z-20 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 px-4 py-3 shadow-2xl">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <span className="font-bold text-white">
                {selectedTrackIds.size > 0 ? selectedTrackIds.size : displayedTracks.length}
              </span>
              <span>of {displayedTracks.length} tracks targeted</span>
              {selectedTrackIds.size > 0 && (
                <button
                  onClick={() => setSelectedTrackIds(new Set())}
                  className="text-xs text-cyan-400 hover:underline ml-2 cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {/* Actions & Export Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Exporters */}
              <button
                onClick={handleExportTuneMyMusicCSV}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                title="Export CSV for immediate TuneMyMusic Spotify/Apple import"
              >
                <Download size={14} />
                <span>TuneMyMusic CSV</span>
              </button>

              <button
                onClick={handleExportM3U}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded-xl text-xs border border-slate-700 transition-all cursor-pointer"
                title="Export M3U playlist for local media players"
              >
                <FileText size={14} />
                <span>M3U</span>
              </button>

              <button
                onClick={handleCopyTSV}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded-xl text-xs border border-slate-700 transition-all cursor-pointer"
                title="Copy TSV table to clipboard"
              >
                <Copy size={14} />
                <span className="hidden sm:inline">Copy TSV</span>
              </button>

              <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

              {/* Downstream Bridges */}
              <button
                onClick={handleStageToTriage}
                className="flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                title="Stage consensus masterpieces into Discovery Triage (Module 14)"
              >
                <Compass size={14} />
                <span>Stage to Triage (M14)</span>
              </button>

              {onViewSelect && (
                <>
                  <button
                    onClick={() => onViewSelect('clustering')}
                    className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold px-3 py-1.5 rounded-xl text-xs border border-slate-700 transition-all cursor-pointer"
                    title="Route to Language Clustering (Module 13)"
                  >
                    <Globe size={14} />
                    <span className="hidden lg:inline">Cluster (M13)</span>
                  </button>

                  <button
                    onClick={() => onViewSelect('enrichment')}
                    className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 font-bold px-3 py-1.5 rounded-xl text-xs border border-slate-700 transition-all cursor-pointer"
                    title="Route to Deep Metadata Enrichment (Module 15)"
                  >
                    <Database size={14} />
                    <span className="hidden lg:inline">Enrich (M15)</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* 7. Deep Metadata Inspector Modal */}
      {inspectedTriageTrack && (
        <SongMetadataInspectorModal
          isOpen={!!inspectedTrack}
          track={inspectedTriageTrack}
          onClose={() => setInspectedTrack(null)}
        />
      )}

      {/* 8. Transient Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900 border border-cyan-500/50 text-cyan-200 px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-bold flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
          <Sparkles size={14} className="text-cyan-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
