import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, ArrowUpDown, Sparkles, Download, Trash2, Check, X, 
  Search, HelpCircle, AlertCircle, FileText, CheckSquare, Square,
  Layers, SlidersHorizontal, ChevronUp, ChevronDown, Move, ExternalLink,
  ListOrdered, RefreshCw, FileSpreadsheet, ArrowRight, ShieldCheck,
  Settings2, Eye, Link2, Unlink, GripVertical, CornerDownLeft, Hash
} from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { downloadPlaylistFile } from '../services/downloadHelper';
import { getAIConfig, setAIConfig, AIConfig } from '../services/visionEngine';
import {
  ReferenceTrack,
  TargetTrack,
  SourceProvenanceMode,
  AIExecutionMode,
  parseReferencePlaylist,
  parseTargetPlaylist,
  matchDeterministically,
  resolveEdgeCasesWithAI,
  resequenceTracks,
  manuallyBindTrack,
  batchMoveTracks,
  exportResequencedCSV,
  exportDownloaderList,
  exportResequencedM3U
} from '../services/resequencerEngine';

interface PlaylistResequencerViewProps {
  onBack: () => void;
  onOpenHelp?: () => void;
}

export default function PlaylistResequencerView({ onBack, onOpenHelp }: PlaylistResequencerViewProps) {
  // Playlist state
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [targetFiles, setTargetFiles] = useState<File[]>([]);
  const [referenceTracks, setReferenceTracks] = useState<ReferenceTrack[]>([]);
  const [targetTracks, setTargetTracks] = useState<TargetTrack[]>([]);
  const [resequencedTracks, setResequencedTracks] = useState<TargetTrack[]>([]);

  // Configuration
  const [provenanceMode, setProvenanceMode] = useState<SourceProvenanceMode>('YouTube Music');
  const [aiMode, setAiMode] = useState<AIExecutionMode>('on_demand');
  const [isResolvingAI, setIsResolvingAI] = useState<boolean>(false);
  const [aiProgressText, setAiProgressText] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters & Search
  const [refSearch, setRefSearch] = useState<string>('');
  const [refFilter, setRefFilter] = useState<'all' | 'matched' | 'omitted'>('all');
  const [targetSearch, setTargetSearch] = useState<string>('');
  const [targetFilter, setTargetFilter] = useState<'all' | 'shifted' | 'unmatched'>('all');

  // Batch Selection
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [batchTargetPosition, setBatchTargetPosition] = useState<string>('');
  const [batchMoveModalOpen, setBatchMoveModalOpen] = useState<boolean>(false);

  // Drag and Drop Resequencing State
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPlacement, setDropPlacement] = useState<'above' | 'below' | null>(null);

  // Quick Jump Symbol & Popout State (Hidden by default, exposed on hover or click)
  const [hoveredJumpId, setHoveredJumpId] = useState<string | null>(null);
  const [activeJumpId, setActiveJumpId] = useState<string | null>(null);

  // Disambiguation / Manual Linking Modal
  const [manualLinkTarget, setManualLinkTarget] = useState<TargetTrack | null>(null);
  const [manualLinkSearch, setManualLinkSearch] = useState<string>('');

  // AI Settings Modal
  const [isAiConfigModalOpen, setIsAiConfigModalOpen] = useState<boolean>(false);
  const [aiConfigForm, setAiConfigForm] = useState<AIConfig>(getAIConfig());

  // Toast helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle Reference File Upload
  const handleRefFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;
    setRefFiles(files);
    try {
      const text = await files[0].text();
      const parsed = parseReferencePlaylist(text, files[0].name);
      setReferenceTracks(parsed);
      showToast(`Loaded ${parsed.length} reference tracks with baseline chronology`);

      // If target already loaded, run matching
      if (targetTracks.length > 0) {
        runMatchingPipeline(parsed, targetTracks, aiMode === 'auto_on_ingest');
      }
    } catch (err: any) {
      alert(`Failed to parse reference playlist: ${err.message}`);
    }
  };

  // Handle Target File Upload
  const handleTargetFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;
    setTargetFiles(files);
    try {
      const text = await files[0].text();
      const parsed = parseTargetPlaylist(text);
      setTargetTracks(parsed);
      setResequencedTracks(resequenceTracks(parsed));
      showToast(`Loaded ${parsed.length} target converted tracks`);

      // If reference already loaded, run matching
      if (referenceTracks.length > 0) {
        runMatchingPipeline(referenceTracks, parsed, aiMode === 'auto_on_ingest');
      }
    } catch (err: any) {
      alert(`Failed to parse target playlist: ${err.message}`);
    }
  };

  // Central matching orchestrator
  const runMatchingPipeline = async (
    refs: ReferenceTrack[],
    targets: TargetTrack[],
    triggerAutoAI: boolean = false
  ) => {
    // 1. Pass 1: Deterministic
    const detResult = matchDeterministically(refs, targets);
    let currentTargets = detResult.matchedTargets;
    setTargetTracks(currentTargets);
    setResequencedTracks(resequenceTracks(currentTargets));

    showToast(`Deterministically matched ${detResult.matchedCount} / ${targets.length} tracks!`);

    // 2. Pass 2: Auto-AI if enabled and edge cases exist
    if (triggerAutoAI && detResult.unmatchedCount > 0) {
      await handleTriggerAIResolution(refs, currentTargets);
    }
  };

  // Trigger AI Edge Case Resolver
  const handleTriggerAIResolution = async (
    refs: ReferenceTrack[] = referenceTracks,
    targets: TargetTrack[] = targetTracks
  ) => {
    setIsResolvingAI(true);
    setAiProgressText('Initializing AI Musicologist...');
    try {
      const result = await resolveEdgeCasesWithAI(refs, targets, msg => setAiProgressText(msg));
      setTargetTracks(result.updatedTargets);
      setResequencedTracks(resequenceTracks(result.updatedTargets));
      showToast(`✨ AI successfully resolved ${result.aiMatchedCount} edge cases!`);
    } catch (err: any) {
      console.error(err);
      alert(`AI Edge Case Resolution failed: ${err.message}`);
    } finally {
      setIsResolvingAI(false);
      setAiProgressText('');
    }
  };

  // Clear workspace
  const handleClearWorkspace = () => {
    if ((referenceTracks.length > 0 || targetTracks.length > 0) && !confirm('Clear both reference and target playlists?')) {
      return;
    }
    setRefFiles([]);
    setTargetFiles([]);
    setReferenceTracks([]);
    setTargetTracks([]);
    setResequencedTracks([]);
    setSelectedTargetIds(new Set());
    showToast('Resequencer workspace cleared');
  };

  // Shift target track manually up or down
  const handleShiftTrack = (trackId: string, direction: 'up' | 'down') => {
    const idx = resequencedTracks.findIndex(t => t.id === trackId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= resequencedTracks.length) return;

    const newOrder = [...resequencedTracks];
    const [moved] = newOrder.splice(idx, 1);
    newOrder.splice(targetIdx, 0, moved);

    // Re-index
    const updated = newOrder.map((t, i) => ({
      ...t,
      newSequenceIndex: i + 1,
      shiftedPositions: t.originalIndex - (i + 1)
    }));
    setResequencedTracks(updated);
  };

  // Batch Selection Toggle
  const toggleSelectTarget = (id: string) => {
    setSelectedTargetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFilteredTargets = () => {
    const next = new Set<string>();
    filteredResequencedTargets.forEach(t => next.add(t.id));
    setSelectedTargetIds(next);
  };

  const clearSelectedTargets = () => {
    setSelectedTargetIds(new Set());
  };

  // Execute Batch Move
  const handleExecuteBatchMove = () => {
    const pos = parseInt(batchTargetPosition, 10);
    if (isNaN(pos) || pos < 1 || pos > resequencedTracks.length) {
      alert(`Please enter a valid position between 1 and ${resequencedTracks.length}`);
      return;
    }
    const updated = batchMoveTracks(Array.from(selectedTargetIds), pos, resequencedTracks);
    setResequencedTracks(updated);
    setBatchMoveModalOpen(false);
    setSelectedTargetIds(new Set());
    showToast(`Moved ${selectedTargetIds.size} tracks to position #${pos}!`);
  };

  // Delete a single track from the resequenced playlist
  const handleDeleteTrack = (trackId: string) => {
    const track = resequencedTracks.find(t => t.id === trackId);
    if (!track) return;

    const remaining = resequencedTracks.filter(t => t.id !== trackId);
    const updated = remaining.map((t, idx) => ({
      ...t,
      newSequenceIndex: idx + 1,
      shiftedPositions: t.originalIndex - (idx + 1)
    }));
    setResequencedTracks(updated);
    setTargetTracks(prev => prev.filter(t => t.id !== trackId));
    setSelectedTargetIds(prev => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
    showToast(`Removed "${track.title}" from playlist`);
  };

  // Delete all selected tracks in batch
  const handleBatchDelete = () => {
    if (selectedTargetIds.size === 0) return;
    const count = selectedTargetIds.size;
    if (!confirm(`Delete ${count} selected track${count > 1 ? 's' : ''} from the resequenced playlist?`)) {
      return;
    }

    const remaining = resequencedTracks.filter(t => !selectedTargetIds.has(t.id));
    const updated = remaining.map((t, idx) => ({
      ...t,
      newSequenceIndex: idx + 1,
      shiftedPositions: t.originalIndex - (idx + 1)
    }));
    setResequencedTracks(updated);
    setTargetTracks(prev => prev.filter(t => !selectedTargetIds.has(t.id)));
    setSelectedTargetIds(new Set());
    showToast(`Removed ${count} tracks from playlist`);
  };

  // Drag and Drop handlers for target track manual resequencing
  const handleDragStart = (e: React.DragEvent, trackId: string) => {
    setDraggedId(trackId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', trackId);

    // Set custom drag preview if available
    const row = (e.currentTarget as HTMLElement).closest('.target-track-row');
    if (row && e.dataTransfer.setDragImage) {
      e.dataTransfer.setDragImage(row, 24, 20);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTargetId(null);
    setDropPlacement(null);
  };

  const handleDragOverRow = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedId) return;

    const isDraggingSelected = selectedTargetIds.has(draggedId);
    const movingIds = isDraggingSelected ? selectedTargetIds : new Set([draggedId]);

    // Don't show drop indicator on moving items
    if (movingIds.has(trackId)) {
      if (dropTargetId === trackId) {
        setDropTargetId(null);
        setDropPlacement(null);
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const isUpper = (e.clientY - rect.top) < (rect.height / 2);
    const placement = isUpper ? 'above' : 'below';

    if (dropTargetId !== trackId || dropPlacement !== placement) {
      setDropTargetId(trackId);
      setDropPlacement(placement);
    }
  };

  const handleDragOverContainer = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Auto-scroll when dragging near container edges
    const container = e.currentTarget;
    const threshold = 60;
    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;

    if (y < threshold) {
      const speed = Math.max(5, (threshold - y) / 2);
      container.scrollTop -= speed;
    } else if (y > rect.height - threshold) {
      const speed = Math.max(5, (y - (rect.height - threshold)) / 2);
      container.scrollTop += speed;
    }
  };

  const handleDropRow = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedId || !dropPlacement) {
      handleDragEnd();
      return;
    }

    const isDraggingSelected = selectedTargetIds.has(draggedId);
    const movingIds = isDraggingSelected ? selectedTargetIds : new Set([draggedId]);

    if (movingIds.has(targetId)) {
      handleDragEnd();
      return;
    }

    // Preserve relative order of moving tracks in resequencedTracks
    const movingTracks = resequencedTracks.filter(t => movingIds.has(t.id));
    const remainingTracks = resequencedTracks.filter(t => !movingIds.has(t.id));

    let insertIdx = remainingTracks.findIndex(t => t.id === targetId);
    if (insertIdx === -1) {
      handleDragEnd();
      return;
    }

    if (dropPlacement === 'below') {
      insertIdx += 1;
    }

    remainingTracks.splice(insertIdx, 0, ...movingTracks);

    // Re-index new sequence positions and recalculate shift metrics
    const updated = remainingTracks.map((t, idx) => ({
      ...t,
      newSequenceIndex: idx + 1,
      shiftedPositions: t.originalIndex - (idx + 1)
    }));

    setResequencedTracks(updated);
    showToast(`Moved ${movingTracks.length} track${movingTracks.length > 1 ? 's' : ''} to position #${insertIdx + 1}!`);
    handleDragEnd();
  };

  // Quick jump a track (or multi-selected batch) directly to a typed target sequence position
  const handleQuickJump = (trackId: string, targetPos: number) => {
    if (isNaN(targetPos) || resequencedTracks.length === 0) return;
    const clampedPos = Math.max(1, Math.min(targetPos, resequencedTracks.length));

    // If the track is part of multi-selection, move the whole batch together!
    const isPartOfSelection = selectedTargetIds.has(trackId);
    const idsToMove = isPartOfSelection && selectedTargetIds.size > 1
      ? Array.from(selectedTargetIds)
      : [trackId];

    const currentTrack = resequencedTracks.find(t => t.id === trackId);
    const oldPos = currentTrack?.newSequenceIndex;

    const updated = batchMoveTracks(idsToMove, clampedPos, resequencedTracks);
    setResequencedTracks(updated);
    setActiveJumpId(null);
    setHoveredJumpId(null);

    if (idsToMove.length > 1) {
      showToast(`Jumped ${idsToMove.length} selected tracks to position #${clampedPos}!`);
    } else {
      showToast(`Jumped "${currentTrack?.title || 'Track'}" from #${oldPos} ➔ #${clampedPos}!`);
    }

    // Smoothly reveal and highlight the moved track in its new position
    setTimeout(() => {
      const el = document.getElementById(`target-track-${trackId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('ring-2', 'ring-cyan-400', 'bg-cyan-950/70');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-cyan-400', 'bg-cyan-950/70');
        }, 1600);
      }
    }, 60);
  };

  // Manual Bind Action
  const handleSaveManualLink = (refIndex: number | null) => {
    if (!manualLinkTarget) return;
    const updated = manuallyBindTrack(manualLinkTarget.id, refIndex, referenceTracks, targetTracks);
    setTargetTracks(updated);
    setResequencedTracks(resequenceTracks(updated));
    setManualLinkTarget(null);
    showToast(refIndex !== null ? `Linked to Reference #${refIndex}` : 'Unbound track');
  };

  // Export Handlers
  const handleExportCSV = async () => {
    if (resequencedTracks.length === 0) {
      alert('No resequenced tracks to export.');
      return;
    }
    const csv = exportResequencedCSV(resequencedTracks, provenanceMode);
    await downloadPlaylistFile(csv, `Resequenced_Spotify_(${resequencedTracks.length}).csv`, 'text/csv');
    showToast('Downloaded Resequenced Spotify CSV!');
  };

  const handleExportTXT = async () => {
    if (resequencedTracks.length === 0) {
      alert('No tracks to export.');
      return;
    }
    const txt = exportDownloaderList(resequencedTracks);
    await downloadPlaylistFile(txt, `Downloader_List_(${resequencedTracks.length}).txt`, 'text/plain');
    showToast('Downloaded Downloader Query List (.txt)!');
  };

  const handleExportM3U = async () => {
    if (resequencedTracks.length === 0) {
      alert('No tracks to export.');
      return;
    }
    const m3u = exportResequencedM3U(resequencedTracks);
    await downloadPlaylistFile(m3u, `Resequenced_Playlist_(${resequencedTracks.length}).m3u`, 'audio/x-mpegurl');
    showToast('Downloaded M3U Playlist!');
  };

  // Save AI Config
  const handleSaveAIConfig = () => {
    setAIConfig(aiConfigForm);
    setIsAiConfigModalOpen(false);
    showToast('AI settings updated successfully!');
  };

  // Filtered Reference Tracks (Derived from resequencedTracks as live source of truth)
  const filteredRefTracks = useMemo(() => {
    const matchedRefIndices = new Set(
      resequencedTracks.filter(t => t.matchedRefIndex !== undefined).map(t => t.matchedRefIndex!)
    );
    return referenceTracks.filter(r => {
      const isMatched = matchedRefIndices.has(r.originalIndex);
      if (refFilter === 'matched' && !isMatched) return false;
      if (refFilter === 'omitted' && isMatched) return false;
      if (refSearch) {
        const q = refSearch.toLowerCase();
        return r.cleanTitle.toLowerCase().includes(q) || r.cleanArtist.toLowerCase().includes(q) || r.rawTrack.toLowerCase().includes(q);
      }
      return true;
    });
  }, [referenceTracks, resequencedTracks, refFilter, refSearch]);

  // Filtered Resequenced Target Tracks
  const filteredResequencedTargets = useMemo(() => {
    return resequencedTracks.filter(t => {
      if (targetFilter === 'shifted' && (!t.shiftedPositions || Math.abs(t.shiftedPositions) === 0)) return false;
      if (targetFilter === 'unmatched' && t.matchStatus !== 'unmatched') return false;
      if (targetSearch) {
        const q = targetSearch.toLowerCase();
        return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q);
      }
      return true;
    });
  }, [resequencedTracks, targetFilter, targetSearch]);

  // Stats (Derived from live resequenced playlist state)
  const matchedTargetCount = useMemo(() => {
    return resequencedTracks.filter(t => t.matchStatus !== 'unmatched').length;
  }, [resequencedTracks]);

  const unmatchedTargetCount = useMemo(() => {
    return resequencedTracks.filter(t => t.matchStatus === 'unmatched').length;
  }, [resequencedTracks]);

  const omittedRefCount = useMemo(() => {
    const matchedRefIndices = new Set(
      resequencedTracks.filter(t => t.matchedRefIndex !== undefined).map(t => t.matchedRefIndex!)
    );
    return referenceTracks.filter(r => !matchedRefIndices.has(r.originalIndex)).length;
  }, [referenceTracks, resequencedTracks]);

  const shiftedCount = useMemo(() => {
    return resequencedTracks.filter(t => t.shiftedPositions && Math.abs(t.shiftedPositions) > 0).length;
  }, [resequencedTracks]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-500 text-slate-950 font-bold px-4 py-2.5 rounded-2xl shadow-2xl shadow-amber-500/30 flex items-center space-x-2 animate-bounce">
          <Sparkles size={16} />
          <span className="text-xs">{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="p-4 sm:p-6 pb-4 border-b border-slate-800/80 bg-slate-900/60 sticky top-0 z-30 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Return to Dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20">
                <ArrowUpDown size={18} />
              </div>
              <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-amber-200 via-orange-200 to-white bg-clip-text text-transparent">
                Playlist Resequencer & Chronology Restorer
              </h1>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                Module 16
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Re-aligns converted Spotify playlists with original YouTube discovery sequence (#1..#N)
            </p>
          </div>
        </div>

        {/* Global Controls & Mode Toggles */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Source Provenance Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mr-2">Export Source:</span>
            <select
              value={provenanceMode}
              onChange={e => setProvenanceMode(e.target.value as SourceProvenanceMode)}
              className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer text-xs"
              title="Tag exported playlist with this source so Module 14 Triage & Module 13 Clustering recognize its authentic origin"
            >
              <option value="YouTube Music" className="bg-slate-900 text-slate-200">YouTube Music (Preserve YT Intelligence)</option>
              <option value="Spotify" className="bg-slate-900 text-slate-200">Spotify (Native)</option>
              <option value="YouTube ➔ Spotify Converted" className="bg-slate-900 text-slate-200">YouTube ➔ Spotify Converted</option>
            </select>
          </div>

          {/* AI Mode Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => setAiMode('on_demand')}
              className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                aiMode === 'on_demand' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Deterministic first; resolve edge cases on demand"
            >
              On-Demand AI
            </button>
            <button
              onClick={() => setAiMode('auto_on_ingest')}
              className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                aiMode === 'auto_on_ingest' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Automatically run AI on edge cases immediately upon loading files"
            >
              Auto-AI on Ingest
            </button>
          </div>

          <button
            onClick={() => setIsAiConfigModalOpen(true)}
            className="p-2 rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 transition-colors cursor-pointer"
            title="Configure Gemini API or Local LLM"
          >
            <Settings2 size={16} />
          </button>

          {(referenceTracks.length > 0 || targetTracks.length > 0) && (
            <button
              onClick={handleClearWorkspace}
              className="flex items-center space-x-1.5 bg-slate-800/80 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 px-3 py-1.5 rounded-xl border border-slate-700/80 hover:border-rose-800/60 text-xs font-semibold transition-all cursor-pointer"
              title="Clear all currently loaded playlists"
            >
              <Trash2 size={13} className="text-rose-400" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          {/* Export Menu */}
          {resequencedTracks.length > 0 && (
            <div className="flex items-center space-x-1 bg-emerald-600/20 border border-emerald-500/30 rounded-xl p-1 text-xs">
              <button
                onClick={handleExportCSV}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                title="Export Spotify CSV with original columns and resolved chronological sequence"
              >
                <Download size={13} />
                <span>Export CSV</span>
              </button>
              <button
                onClick={handleExportTXT}
                className="hover:bg-emerald-500/30 text-emerald-300 px-2 py-1 rounded-lg transition-colors cursor-pointer text-[11px] font-semibold"
                title="Export text query list for downloaders"
              >
                .txt
              </button>
              <button
                onClick={handleExportM3U}
                className="hover:bg-emerald-500/30 text-emerald-300 px-2 py-1 rounded-lg transition-colors cursor-pointer text-[11px] font-semibold"
                title="Export M3U playlist"
              >
                .m3u
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Dual Playlist Ingestion Dropzone */}
        {(referenceTracks.length === 0 || targetTracks.length === 0) && (
          <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl space-y-5">
            <div>
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <FileSpreadsheet size={16} className="text-amber-400" />
                <span>Step 1: Ingest Baseline & Converted Playlists</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Provide the original playlist with your true chronological order (Slot A), and the converted Spotify playlist with missing songs removed and corrected songs appended at the bottom (Slot B).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Slot A: Reference */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] font-mono">A</span>
                    <span>Reference Baseline (e.g. Original_YT.csv / M3U)</span>
                  </span>
                  {referenceTracks.length > 0 && (
                    <span className="text-[11px] font-mono font-bold text-emerald-400">
                      ✓ {referenceTracks.length} tracks
                    </span>
                  )}
                </div>
                <FileUploader
                  label="Drop Original YouTube Playlist (CSV / M3U)"
                  subLabel="Contains your complete #1..#N chronological sequence"
                  files={refFiles}
                  onFilesSelected={handleRefFilesSelected}
                  onClear={() => {
                    setRefFiles([]);
                    setReferenceTracks([]);
                  }}
                  accept=".csv,.tsv,.m3u,.m3u8,.txt"
                  colorClass="amber"
                />
              </div>

              {/* Slot B: Target */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-mono">B</span>
                    <span>Target Converted (e.g. YT_to_Sptfy.csv)</span>
                  </span>
                  {targetTracks.length > 0 && (
                    <span className="text-[11px] font-mono font-bold text-emerald-400">
                      ✓ {targetTracks.length} tracks
                    </span>
                  )}
                </div>
                <FileUploader
                  label="Drop Converted Spotify Playlist (CSV)"
                  subLabel="Contains surviving Spotify tracks & appended manual corrections"
                  files={targetFiles}
                  onFilesSelected={handleTargetFilesSelected}
                  onClear={() => {
                    setTargetFiles([]);
                    setTargetTracks([]);
                  }}
                  accept=".csv,.tsv,.txt"
                  colorClass="cyan"
                />
              </div>
            </div>
          </div>
        )}

        {/* Resequencing Intelligence Workspace */}
        {referenceTracks.length > 0 && targetTracks.length > 0 && (
          <div className="space-y-6">
            {/* Top Metrics & Diagnostics Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Baseline Reference</span>
                <span className="text-lg font-black text-slate-100 mt-0.5 block">{referenceTracks.length}</span>
                <span className="text-[10px] text-slate-500">Original YT Chronology</span>
              </div>

              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Surviving Target</span>
                <span className="text-lg font-black text-cyan-300 mt-0.5 block">{targetTracks.length}</span>
                <span className="text-[10px] text-slate-500">Spotify Songs to Order</span>
              </div>

              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Matched & Resolved</span>
                <span className="text-lg font-black text-emerald-400 mt-0.5 block">{matchedTargetCount}</span>
                <span className="text-[10px] text-slate-500">{Math.round((matchedTargetCount / targetTracks.length) * 100)}% resolved</span>
              </div>

              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Omitted in Conversion</span>
                <span className="text-lg font-black text-slate-400 mt-0.5 block">{omittedRefCount}</span>
                <span className="text-[10px] text-slate-500">Removed / Failed YT songs</span>
              </div>

              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Chronology Restored</span>
                <span className="text-lg font-black text-amber-400 mt-0.5 block">{shiftedCount}</span>
                <span className="text-[10px] text-slate-500">Tracks shifted from bottom</span>
              </div>
            </div>

            {/* AI Edge Case Action Banner (When Unmatched Tracks Exist) */}
            {unmatchedTargetCount > 0 && (
              <div className="p-4 bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900 border border-purple-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-purple-950/20">
                <div className="flex items-start space-x-3.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 border border-purple-500/30 mt-0.5">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-100 uppercase tracking-wide flex items-center space-x-2">
                      <span>{unmatchedTargetCount} Ambiguous Conversion Edge Cases</span>
                      <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-mono font-bold">
                        AI Musicologist Ready
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed mt-0.5 max-w-2xl">
                      {isResolvingAI
                        ? aiProgressText || 'Resolving cross-lingual titles, Romaji transliterations, and CJK variants...'
                        : 'These tracks contain Japanese/Chinese translations (e.g. Martian = 火星人, Snake = へび), Romanizations (TOKYO = とうきょう), or subtitle noise. Delegate to Gemini to match them in seconds.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleTriggerAIResolution()}
                  disabled={isResolvingAI}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center space-x-2 shrink-0 cursor-pointer shadow-lg shadow-purple-950/30"
                >
                  <Sparkles size={14} className={isResolvingAI ? 'animate-spin' : ''} />
                  <span>{isResolvingAI ? 'Resolving...' : `✨ Resolve ${unmatchedTargetCount} Edge Cases with AI`}</span>
                </button>
              </div>
            )}

            {/* Batch Reordering Floating Bar (When Selected) */}
            {selectedTargetIds.size > 0 && (
              <div className="p-3.5 bg-slate-900 border border-amber-500/40 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl shadow-slate-950">
                <div className="flex items-center space-x-2.5">
                  <span className="text-xs font-bold text-amber-300 font-mono">
                    {selectedTargetIds.size} target tracks selected
                  </span>
                  <span className="text-[10px] text-amber-400/80 font-mono hidden md:inline bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    💡 Drag any selected track to drop whole batch
                  </span>
                  <button
                    onClick={clearSelectedTargets}
                    className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Inline Type-and-Jump for Batch */}
                  <div className="flex items-center space-x-1.5 bg-slate-950 border border-amber-500/40 rounded-lg px-2 py-1 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/30">
                    <span className="text-[10px] font-mono text-amber-400 font-bold">Go to #</span>
                    <input
                      id="batch-inline-jump-input"
                      type="number"
                      min="1"
                      max={resequencedTracks.length}
                      placeholder="Pos"
                      className="w-10 bg-transparent text-xs font-mono font-bold text-amber-200 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-slate-600"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt(e.currentTarget.value, 10);
                          if (!isNaN(val)) {
                            const clamped = Math.max(1, Math.min(val, resequencedTracks.length));
                            const updated = batchMoveTracks(Array.from(selectedTargetIds), clamped, resequencedTracks);
                            setResequencedTracks(updated);
                            showToast(`Moved ${selectedTargetIds.size} tracks to position #${clamped}!`);
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      title={`Type number and press Enter to jump all ${selectedTargetIds.size} tracks`}
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('batch-inline-jump-input') as HTMLInputElement;
                        const val = parseInt(input?.value, 10);
                        if (!isNaN(val)) {
                          const clamped = Math.max(1, Math.min(val, resequencedTracks.length));
                          const updated = batchMoveTracks(Array.from(selectedTargetIds), clamped, resequencedTracks);
                          setResequencedTracks(updated);
                          showToast(`Moved ${selectedTargetIds.size} tracks to position #${clamped}!`);
                          input.value = '';
                        }
                      }}
                      className="text-amber-400 hover:text-amber-200 p-0.5 cursor-pointer"
                      title="Jump batch to position"
                    >
                      <CornerDownLeft size={11} />
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      const updated = batchMoveTracks(Array.from(selectedTargetIds), 1, resequencedTracks);
                      setResequencedTracks(updated);
                      setSelectedTargetIds(new Set());
                      showToast(`Moved ${selectedTargetIds.size} tracks to Top!`);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 cursor-pointer"
                  >
                    To Top (#1)
                  </button>
                  <button
                    onClick={() => {
                      const updated = batchMoveTracks(Array.from(selectedTargetIds), resequencedTracks.length, resequencedTracks);
                      setResequencedTracks(updated);
                      setSelectedTargetIds(new Set());
                      showToast(`Moved ${selectedTargetIds.size} tracks to Bottom!`);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 cursor-pointer"
                  >
                    To Bottom
                  </button>
                  <button
                    onClick={() => setBatchMoveModalOpen(true)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Position Dialog...
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    className="bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-colors"
                    title={`Delete ${selectedTargetIds.size} selected tracks from playlist`}
                  >
                    <Trash2 size={12} />
                    <span>Delete ({selectedTargetIds.size})</span>
                  </button>
                </div>
              </div>
            )}

            {/* Side-by-Side Dual-Pane Visualizer */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Pane: Reference Playlist (YT Baseline #1..#N) */}
              <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center space-x-1.5">
                      <span>Reference Baseline ({referenceTracks.length})</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">True chronological discovery order</p>
                  </div>

                  <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                    {(['all', 'matched', 'omitted'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setRefFilter(f)}
                        className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer capitalize ${
                          refFilter === f ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {f === 'all' ? `All (${referenceTracks.length})` : f === 'matched' ? `Matched (${matchedTargetCount})` : `Omitted (${omittedRefCount})`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search original tracks or artists..."
                    value={refSearch}
                    onChange={e => setRefSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                  {refSearch && (
                    <button onClick={() => setRefSearch('')} className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white">
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Reference Track List */}
                <div className="max-h-[640px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/40">
                  {filteredRefTracks.map(ref => {
                    const matchedTarget = resequencedTracks.find(t => t.matchedRefIndex === ref.originalIndex);
                    const isMatched = !!matchedTarget;

                    return (
                      <div
                        key={ref.id}
                        className={`pt-1.5 pb-1.5 px-2.5 rounded-xl transition-colors flex items-center justify-between text-xs ${
                          isMatched ? 'hover:bg-slate-800/40' : 'opacity-60 bg-slate-950/40'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <span className="font-mono text-[10px] text-amber-400 font-bold w-7 shrink-0">
                            #{ref.originalIndex}
                          </span>
                          <div className="truncate">
                            <h4 className={`font-semibold truncate ${isMatched ? 'text-slate-200' : 'line-through text-slate-400'}`}>
                              {ref.cleanTitle}
                            </h4>
                            <p className="text-[10px] text-slate-500 truncate">
                              {ref.cleanArtist}
                            </p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0 text-right">
                          {isMatched ? (
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(`target-track-${matchedTarget.id}`);
                                if (el) {
                                  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                  el.classList.add('ring-2', 'ring-cyan-400', 'bg-cyan-950/70');
                                  setTimeout(() => el.classList.remove('ring-2', 'ring-cyan-400', 'bg-cyan-950/70'), 1600);
                                }
                              }}
                              className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold cursor-pointer transition-colors"
                              title={`Click to jump to #${matchedTarget.newSequenceIndex} in the Spotify playlist`}
                            >
                              ➔ Spotify #{matchedTarget.newSequenceIndex}
                            </button>
                          ) : (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded text-slate-500 border border-slate-800">
                              Omitted
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Pane: Resequenced Target Playlist (Spotify) */}
              <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-cyan-400 flex items-center space-x-1.5">
                      <span>Resequenced Spotify Playlist ({resequencedTracks.length})</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-slate-400 font-medium">
                        Restored relative discovery sequence • Surviving tracks only
                      </p>
                      <span className="text-[10px] text-cyan-400/80 font-mono flex items-center space-x-1 bg-cyan-950/40 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                        <GripVertical size={11} />
                        <span>Drag row or handle to resequence</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                    <button
                      onClick={selectAllFilteredTargets}
                      className="px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
                    >
                      Select All
                    </button>
                    {(['all', 'shifted', 'unmatched'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setTargetFilter(f)}
                        className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer capitalize ${
                          targetFilter === f ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {f === 'all' ? `All (${resequencedTracks.length})` : f === 'shifted' ? `Shifted (${shiftedCount})` : `Unmatched (${unmatchedTargetCount})`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search resequenced Spotify tracks, artists, or albums..."
                    value={targetSearch}
                    onChange={e => setTargetSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                  {targetSearch && (
                    <button onClick={() => setTargetSearch('')} className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white">
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Resequenced Target Table */}
                <div
                  className="max-h-[640px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/40 relative"
                  onDragOver={handleDragOverContainer}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDropTargetId(null);
                      setDropPlacement(null);
                    }
                  }}
                  onDrop={(e) => {
                    // If dropped in the empty container area below tracks, move to bottom
                    if ((e.target as HTMLElement).closest('.target-track-row')) return;
                    if (draggedId) {
                      e.preventDefault();
                      const isDraggingSelected = selectedTargetIds.has(draggedId);
                      const movingIds = isDraggingSelected ? selectedTargetIds : new Set([draggedId]);
                      const movingTracks = resequencedTracks.filter(t => movingIds.has(t.id));
                      const remainingTracks = resequencedTracks.filter(t => !movingIds.has(t.id));
                      const updated = [...remainingTracks, ...movingTracks].map((t, idx) => ({
                        ...t,
                        newSequenceIndex: idx + 1,
                        shiftedPositions: t.originalIndex - (idx + 1)
                      }));
                      setResequencedTracks(updated);
                      showToast(`Moved ${movingTracks.length} track${movingTracks.length > 1 ? 's' : ''} to bottom!`);
                      handleDragEnd();
                    }
                  }}
                >
                  {filteredResequencedTargets.map(target => {
                    const isSelected = selectedTargetIds.has(target.id);
                    const shift = target.shiftedPositions || 0;
                    const isDraggingSelected = draggedId && selectedTargetIds.has(draggedId);
                    const isBeingDragged = draggedId === target.id || (isDraggingSelected && isSelected);
                    const isDropTarget = dropTargetId === target.id;

                    return (
                      <div key={target.id} className="relative pt-0.5 pb-0.5">
                        {/* Visual Drop Line - Above */}
                        {isDropTarget && dropPlacement === 'above' && (
                          <div className="absolute -top-1 left-2 right-2 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.9)] z-30 pointer-events-none animate-pulse" />
                        )}

                        <div
                          id={`target-track-${target.id}`}
                          draggable
                          onDragStart={(e) => {
                            const el = e.target as HTMLElement;
                            if (el.closest('button') || el.closest('input') || el.closest('.clickable-badge')) {
                              e.preventDefault();
                              return;
                            }
                            handleDragStart(e, target.id);
                          }}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => handleDragOverRow(e, target.id)}
                          onDrop={(e) => handleDropRow(e, target.id)}
                          className={`target-track-row relative pt-2 pb-2 px-2.5 rounded-xl transition-all flex items-center justify-between text-xs group select-none ${
                            isBeingDragged
                              ? 'opacity-35 scale-[0.99] border border-dashed border-cyan-400 bg-cyan-950/40 shadow-inner'
                              : isSelected
                              ? 'bg-cyan-950/40 border border-cyan-500/30'
                              : 'hover:bg-slate-800/40 border border-transparent'
                          }`}
                        >
                          {/* Left: Drag Handle + Checkbox + Sequence Numbers + Track Info */}
                          <div className="flex items-center space-x-2 min-w-0 pr-3">
                            {/* Drag Gripper */}
                            <div
                              className="drag-handle p-1 -ml-1 text-slate-600 hover:text-cyan-400 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
                              title="Drag to manually reorder / resequence"
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                handleDragStart(e, target.id);
                              }}
                              onDragEnd={handleDragEnd}
                            >
                              <GripVertical size={14} />
                            </div>

                            {/* Checkbox */}
                            <button
                              onClick={() => toggleSelectTarget(target.id)}
                              className="text-slate-500 hover:text-cyan-400 cursor-pointer shrink-0"
                              title={isSelected ? 'Deselect track' : 'Select track for batch move or multi-drag'}
                            >
                              {isSelected ? <CheckSquare size={14} className="text-cyan-400" /> : <Square size={14} />}
                            </button>

                            {/* Interactive Sequence Index (Click to expose & focus jump input) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveJumpId(target.id);
                                setTimeout(() => {
                                  const input = document.getElementById(`jump-input-${target.id}`) as HTMLInputElement;
                                  if (input) {
                                    input.focus();
                                    input.select();
                                  }
                                }, 50);
                              }}
                              className="font-mono text-xs text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/20 px-1 py-0.5 rounded font-black w-7 text-center shrink-0 cursor-pointer transition-colors"
                              title="Click to jump to a different position"
                            >
                              #{target.newSequenceIndex}
                            </button>

                            {/* Shift Badge */}
                            <div className="shrink-0 w-20">
                              {shift > 0 ? (
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold block truncate"
                                  title={`Shifted +${shift} positions up! (Was #${target.originalIndex} on Spotify)`}
                                >
                                  ↑ +{shift} (was #{target.originalIndex})
                                </span>
                              ) : shift < 0 ? (
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold block truncate"
                                  title={`Shifted ${shift} positions down (Was #${target.originalIndex} on Spotify)`}
                                >
                                  ↓ {shift} (was #{target.originalIndex})
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono text-slate-500 px-1 block truncate">
                                  = same (#{target.originalIndex})
                                </span>
                              )}
                            </div>

                            {/* Title & Artist */}
                            <div className="truncate">
                              <h4 className="font-bold text-slate-100 truncate">{target.title}</h4>
                              <p className="text-[10px] text-slate-400 truncate">
                                {target.artist} • <span className="text-slate-500">{target.album}</span>
                              </p>
                            </div>
                          </div>

                          {/* Right: Match Category / Reason + Link / Quick Jump / Move Actions */}
                          <div className="flex items-center space-x-2 shrink-0">
                            {/* Match Source Badge */}
                            {target.matchedRefIndex !== undefined ? (
                              <div className="text-right">
                                <span
                                  onClick={() => setManualLinkTarget(target)}
                                  className={`clickable-badge text-[9px] font-mono px-2 py-0.5 rounded-full font-bold cursor-pointer transition-all border ${
                                    target.matchStatus === 'ai'
                                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500 hover:text-white'
                                      : target.matchStatus === 'manual'
                                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500 hover:text-white'
                                      : target.matchCategory === 'exact'
                                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  }`}
                                  title={`${target.matchReason} (Click to inspect or change link)`}
                                >
                                  {target.matchStatus === 'ai' ? '✨ ' : ''}YT #{target.matchedRefIndex} ({target.matchCategory})
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={() => setManualLinkTarget(target)}
                                className="clickable-badge text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold hover:bg-rose-500 hover:text-white cursor-pointer"
                                title="Click to manually bind this track to a YouTube reference track"
                              >
                                ⚠️ Unmatched (Link)
                              </button>
                            )}

                            {/* Quick Jump Symbol & Popout Input (Hidden by default, exposed on hover or click of # symbol) */}
                            {(() => {
                              const isJumpExposed = hoveredJumpId === target.id || activeJumpId === target.id;
                              return (
                                <div 
                                  className="relative flex items-center shrink-0"
                                  onMouseEnter={() => setHoveredJumpId(target.id)}
                                  onMouseLeave={() => {
                                    if (activeJumpId !== target.id) {
                                      setHoveredJumpId(null);
                                    }
                                  }}
                                >
                                  {!isJumpExposed ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveJumpId(target.id);
                                        setTimeout(() => {
                                          const input = document.getElementById(`jump-input-${target.id}`) as HTMLInputElement;
                                          if (input) {
                                            input.focus();
                                            input.select();
                                          }
                                        }, 50);
                                      }}
                                      className="flex items-center justify-center w-6 h-6 rounded-md text-slate-500 hover:text-cyan-300 hover:bg-slate-800/80 border border-slate-800/80 hover:border-cyan-500/40 transition-all cursor-pointer group/jumpbtn"
                                      title="Jump to position # (Hover or click to type number)"
                                    >
                                      <Hash size={12} className="group-hover/jumpbtn:scale-110 transition-transform" />
                                    </button>
                                  ) : (
                                    <div 
                                      className="flex items-center space-x-0.5 bg-slate-950/95 border border-cyan-500/70 rounded-lg px-1.5 py-0.5 shadow-lg shadow-cyan-950/60 ring-1 ring-cyan-500/30 transition-all animate-in fade-in zoom-in-95 duration-100"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="text-[10px] font-mono text-cyan-400 font-bold select-none">#</span>
                                      <input
                                        id={`jump-input-${target.id}`}
                                        type="number"
                                        min="1"
                                        max={resequencedTracks.length}
                                        placeholder={`${target.newSequenceIndex}`}
                                        defaultValue=""
                                        autoFocus
                                        onFocus={() => setActiveJumpId(target.id)}
                                        onBlur={(e) => {
                                          if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest('.jump-submit-btn')) {
                                            return;
                                          }
                                          setTimeout(() => {
                                            setActiveJumpId(prev => prev === target.id ? null : prev);
                                            setHoveredJumpId(prev => prev === target.id ? null : prev);
                                          }, 120);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const val = parseInt(e.currentTarget.value, 10);
                                            if (!isNaN(val)) {
                                              handleQuickJump(target.id, val);
                                            }
                                          } else if (e.key === 'Escape') {
                                            setActiveJumpId(null);
                                            setHoveredJumpId(null);
                                          }
                                        }}
                                        className="w-7 bg-transparent text-xs font-mono font-bold text-cyan-200 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-slate-500 cursor-text"
                                      />
                                      <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const input = document.getElementById(`jump-input-${target.id}`) as HTMLInputElement;
                                          if (input) {
                                            const val = parseInt(input.value, 10);
                                            if (!isNaN(val)) {
                                              handleQuickJump(target.id, val);
                                            } else {
                                              input.focus();
                                            }
                                          }
                                        }}
                                        className="jump-submit-btn text-cyan-400 hover:text-white hover:bg-cyan-500/20 p-0.5 rounded cursor-pointer transition-colors"
                                        title="Jump to typed position (or press Enter)"
                                      >
                                        <CornerDownLeft size={11} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Quick Shift Up / Down & Delete Buttons */}
                            <div className="flex items-center space-x-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleShiftTrack(target.id, 'up')}
                                disabled={target.newSequenceIndex === 1}
                                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                                title="Move 1 step up"
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                onClick={() => handleShiftTrack(target.id, 'down')}
                                disabled={target.newSequenceIndex === resequencedTracks.length}
                                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                                title="Move 1 step down"
                              >
                                <ChevronDown size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTrack(target.id);
                                }}
                                className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 cursor-pointer transition-colors ml-0.5"
                                title={`Delete "${target.title}" from playlist`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Visual Drop Line - Below */}
                        {isDropTarget && dropPlacement === 'below' && (
                          <div className="absolute -bottom-1 left-2 right-2 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.9)] z-30 pointer-events-none animate-pulse" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Manual Disambiguation / Link Drawer Modal */}
      {manualLinkTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center space-x-2">
                <Link2 size={16} />
                <span>Manual Matcher Disambiguation</span>
              </h3>
              <button
                onClick={() => setManualLinkTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
              <span className="text-[10px] text-slate-500 font-mono block">Target Spotify Track:</span>
              <h4 className="font-bold text-slate-100">{manualLinkTarget.title}</h4>
              <p className="text-[11px] text-slate-400">{manualLinkTarget.artist} • {manualLinkTarget.album}</p>
              {manualLinkTarget.matchedRefIndex && (
                <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-400">
                  <span>Currently linked to YouTube #{manualLinkTarget.matchedRefIndex}</span>
                  <button
                    onClick={() => handleSaveManualLink(null)}
                    className="text-rose-400 hover:underline cursor-pointer flex items-center space-x-1"
                  >
                    <Unlink size={11} />
                    <span>Unbind Track</span>
                  </button>
                </div>
              )}
            </div>

            {/* Search Reference */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Bind to YouTube Reference Track:
              </span>
              <input
                type="text"
                placeholder="Search reference playlist tracks..."
                value={manualLinkSearch}
                onChange={e => setManualLinkSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Candidate list */}
            <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-slate-800/40">
              {referenceTracks
                .filter(r => {
                  if (!manualLinkSearch) return true;
                  const q = manualLinkSearch.toLowerCase();
                  return r.cleanTitle.toLowerCase().includes(q) || r.cleanArtist.toLowerCase().includes(q) || r.rawTrack.toLowerCase().includes(q);
                })
                .slice(0, 30)
                .map(ref => (
                  <div
                    key={ref.id}
                    onClick={() => handleSaveManualLink(ref.originalIndex)}
                    className="p-2 hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors flex items-center justify-between text-xs"
                  >
                    <div className="truncate pr-2">
                      <span className="font-mono text-amber-400 font-bold mr-2">#{ref.originalIndex}</span>
                      <span className="font-semibold text-slate-200">{ref.cleanTitle}</span>
                      <span className="text-[10px] text-slate-500 block truncate">{ref.cleanArtist}</span>
                    </div>
                    <button className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px] font-bold shrink-0">
                      Link
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Batch Move Modal */}
      {batchMoveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300">
              Move {selectedTargetIds.size} Selected Tracks
            </h3>
            <p className="text-xs text-slate-400">
              Enter target position number (1 to {resequencedTracks.length}):
            </p>
            <input
              type="number"
              min={1}
              max={resequencedTracks.length}
              value={batchTargetPosition}
              onChange={e => setBatchTargetPosition(e.target.value)}
              placeholder="e.g. 1"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
            />
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setBatchMoveModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteBatchMove}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-1.5 rounded-lg text-xs"
              >
                Move Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Config Modal */}
      {isAiConfigModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center space-x-2">
                <Settings2 size={16} />
                <span>AI Musicologist Settings</span>
              </h3>
              <button onClick={() => setIsAiConfigModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Provider</label>
                <select
                  value={aiConfigForm.provider}
                  onChange={e => setAiConfigForm(prev => ({ ...prev, provider: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
                >
                  <option value="gemini">Google Gemini (Recommended: gemini-2.5-flash)</option>
                  <option value="openai-compatible">Local LLM / OpenAI Compatible (Ollama / vLLM)</option>
                </select>
              </div>

              {aiConfigForm.provider === 'gemini' ? (
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Gemini API Key</label>
                  <input
                    type="password"
                    value={aiConfigForm.apiKey}
                    onChange={e => setAiConfigForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Base URL</label>
                    <input
                      type="text"
                      value={aiConfigForm.baseUrl}
                      onChange={e => setAiConfigForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="http://localhost:11434/v1"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Model Name</label>
                    <input
                      type="text"
                      value={aiConfigForm.modelName}
                      onChange={e => setAiConfigForm(prev => ({ ...prev, modelName: e.target.value }))}
                      placeholder="llama3"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setIsAiConfigModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAIConfig}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
