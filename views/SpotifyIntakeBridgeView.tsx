import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Music,
  Download,
  Copy,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Radio,
  Sparkles,
  RefreshCw,
  Compass,
  Database,
  BarChart3,
  SlidersHorizontal,
  CheckSquare,
  Square,
  Share2,
  Trash2,
  Clock,
  Layers,
  HelpCircle,
  Link2,
  Code2,
} from 'lucide-react';
import {
  SpotifyTrack,
  SpotifyPlaylistMetadata,
  fetchSpotifyPlaylistByUrl,
  parseSpotifyEmbedHtml,
  extractSpotifyPlaylistId,
  exportSpotifyTracksToCSV,
  exportSpotifyTracksToM3U,
  exportSpotifyTracksToTSV,
  exportSpotifyTrackURIs,
  exportSpotifyTracksToPlainText,
} from '../services/spotifyIntakeEngine';
import { downloadPlaylistFile } from '../services/downloadHelper';
import AudioPreviewButton from '../components/AudioPreviewButton';
import SongCoverArt from '../components/SongCoverArt';
import SongMetadataInspectorModal from '../components/SongMetadataInspectorModal';
import { TriageTrack } from '../services/triageEngine';

interface SpotifyIntakeBridgeViewProps {
  onBack: () => void;
  onOpenHelp?: () => void;
  onViewSelect?: (view: any) => void;
}

export default function SpotifyIntakeBridgeView({
  onBack,
  onOpenHelp,
  onViewSelect,
}: SpotifyIntakeBridgeViewProps) {
  // Input mode: 'url' (Direct Link) vs 'html' (Air-Gapped Page Source)
  const [inputMode, setInputMode] = useState<'url' | 'html'>('url');
  const [playlistUrl, setPlaylistUrl] = useState<string>(
    'https://open.spotify.com/playlist/26xGC3d1hYZyRjINbDtn7w?si=NAyQxgpDRjKJt01hp2K4FQ'
  );
  const [htmlSource, setHtmlSource] = useState<string>('');

  // Processing state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<SpotifyPlaylistMetadata | null>(null);

  // Search & Selection
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Deep Metadata Inspector
  const [inspectedTrack, setInspectedTrack] = useState<SpotifyTrack | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3200);
  };

  // Filtered tracks
  const displayedTracks = useMemo(() => {
    if (!metadata) return [];
    if (!searchQuery.trim()) return metadata.extractedTracks;
    const q = searchQuery.toLowerCase();
    return metadata.extractedTracks.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [metadata, searchQuery]);

  // Target tracks for exports and staging
  const getTargetTracks = (): SpotifyTrack[] => {
    if (!metadata) return [];
    if (selectedTrackIds.size > 0) {
      return displayedTracks.filter(t => selectedTrackIds.has(t.id));
    }
    return displayedTracks;
  };

  // State: Progress indicator
  const [loadingProgress, setLoadingProgress] = useState<string>('');

  // 1. Fetch Playlist by URL
  const handleFetchPlaylist = async () => {
    if (!playlistUrl.trim()) {
      setErrorMessage('Please enter a Spotify playlist URL or ID.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setLoadingProgress('Initializing Spotify session...');

    try {
      const data = await fetchSpotifyPlaylistByUrl(playlistUrl.trim(), (loaded, total) => {
        setLoadingProgress(`Ingested ${loaded} of ${total} tracks...`);
      });
      setMetadata(data);
      setSelectedTrackIds(new Set());
      showToast(`Successfully extracted ${data.totalTracks} tracks from "${data.name}"!`);
    } catch (err: any) {
      console.error('Spotify extraction error:', err);
      setErrorMessage(
        err.message ||
          'Failed to extract playlist. If CORS is restricted, switch to the "Raw HTML Source" tab.'
      );
    } finally {
      setIsLoading(false);
      setLoadingProgress('');
    }
  };

  // 2. Parse Raw Embed HTML (Air-Gapped Mode)
  const handleParseHtml = () => {
    if (!htmlSource.trim()) {
      setErrorMessage('Please paste the Spotify page HTML source into the field.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = parseSpotifyEmbedHtml(htmlSource.trim(), playlistUrl || 'Pasted Source');
      setMetadata(data);
      setSelectedTrackIds(new Set());
      showToast(`Successfully parsed ${data.totalTracks} tracks from page source!`);
    } catch (err: any) {
      console.error('HTML parse error:', err);
      setErrorMessage(err.message || 'Failed to parse Spotify HTML.');
    } finally {
      setIsLoading(false);
    }
  };

  // Selection handlers
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

  // -------------------------------------------------------------
  // EXPORTERS (CSV, M3U, TSV, SPOTIFY URIs)
  // -------------------------------------------------------------

  const handleExportCSV = async () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks selected for export.');
      return;
    }

    const playlistTitle = metadata?.name || 'spotify_playlist';
    const safeName = playlistTitle.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const csvContent = exportSpotifyTracksToCSV(targets, playlistTitle);

    await downloadPlaylistFile(
      csvContent,
      `spotify_${safeName}_${targets.length}.csv`,
      'text/csv;charset=utf-8;'
    );
    showToast(`Exported CSV (${targets.length} tracks with UTF-8 BOM)!`);
  };

  const handleExportM3U = async () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks selected for export.');
      return;
    }

    const playlistTitle = metadata?.name || 'spotify_playlist';
    const safeName = playlistTitle.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const m3uContent = exportSpotifyTracksToM3U(targets);

    await downloadPlaylistFile(
      m3uContent,
      `spotify_${safeName}_${targets.length}.m3u`,
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

    const tsvContent = exportSpotifyTracksToTSV(targets);
    try {
      await navigator.clipboard.writeText(tsvContent);
      showToast(`Copied ${targets.length} tracks as TSV (ready for Sheets/Excel)!`);
    } catch {
      showToast('Failed to copy to clipboard.');
    }
  };

  const handleCopyURIs = async () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks to copy.');
      return;
    }

    const uriList = exportSpotifyTrackURIs(targets);
    try {
      await navigator.clipboard.writeText(uriList);
      showToast(`Copied ${targets.length} Spotify URIs (Paste with Ctrl+V into Spotify)!`);
    } catch {
      showToast('Failed to copy to clipboard.');
    }
  };

  // -------------------------------------------------------------
  // DOWNSTREAM BRIDGES (Triage, Consensus, Manipulator, Enrichment)
  // -------------------------------------------------------------

  const handleStageToTriage = () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks to stage for Triage.');
      return;
    }

    const payload = targets.map((t, idx) => ({
      title: t.title,
      artist: t.artist,
      album: t.album || metadata?.name || 'Spotify Import',
      culturalBucket: 'Other',
      coverArtUrl: t.coverArtUrl,
      coverArtThumbUrl: t.coverArtUrl,
      sourceDetails: `Spotify Import: ${metadata?.name || 'Playlist'} (#${idx + 1})`,
      stagedAt: new Date().toISOString(),
      rawTitle: `${t.artist} - ${t.title}`,
    }));

    try {
      localStorage.setItem('playlist_haven_triage_intake', JSON.stringify(payload));
      showToast(`Staged ${payload.length} tracks into Discovery Triage!`);
      if (onViewSelect) {
        onViewSelect('triage');
      }
    } catch (e: any) {
      showToast(`Failed to stage tracks: ${e.message}`);
    }
  };

  const handleRouteToConsensus = () => {
    const targets = getTargetTracks();
    if (targets.length === 0) {
      showToast('No tracks to route.');
      return;
    }

    const textDump = exportSpotifyTracksToPlainText(targets);
    try {
      localStorage.setItem(
        'playlist_haven_consensus_seed',
        JSON.stringify({
          sourceName: metadata?.name ? `Spotify: ${metadata.name}` : 'Spotify Playlist Import',
          textDump,
          tracks: targets.map(t => ({
            title: t.title,
            artist: t.artist,
            album: t.album,
            coverArtUrl: t.coverArtUrl,
            sourceName: metadata?.name || 'Spotify Import',
          })),
        })
      );
      showToast(`Routed ${targets.length} tracks to Consensus Aggregator!`);
      if (onViewSelect) {
        onViewSelect('consensus');
      }
    } catch (e: any) {
      showToast(`Failed to route: ${e.message}`);
    }
  };

  // Convert SpotifyTrack to minimal TriageTrack for SongMetadataInspectorModal
  const inspectedTriageTrack = useMemo<TriageTrack | null>(() => {
    if (!inspectedTrack) return null;
    return {
      id: inspectedTrack.id,
      title: inspectedTrack.title,
      artist: inspectedTrack.artist,
      album: inspectedTrack.album || metadata?.name || 'Spotify Playlist',
      rawTitle: `${inspectedTrack.artist} - ${inspectedTrack.title}`,
      sources: ['Spotify Import' as any],
      sourceOrder: 1,
      resonanceTier: 'probe',
      triageStatus: 'inbox',
      downloadPriority: 'immediate',
      culturalBucket: 'Other',
      coverArtUrl: inspectedTrack.coverArtUrl,
      previewUrl: inspectedTrack.previewUrl,
      duration: inspectedTrack.durationFormatted,
    };
  }, [inspectedTrack, metadata]);

  return (
    <div className="flex flex-col min-h-screen pb-24">
      {/* Header */}
      <header className="p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Return to Dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <Radio className="text-emerald-400" size={24} />
                <span>Spotify Intake & Bridge</span>
              </h1>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                Module 19
              </span>
              <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono hidden sm:inline">
                Zero-Auth Direct
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium hidden sm:block">
              Directly extract public Spotify playlists without developer API keys or TuneMyMusic exports.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenHelp && (
            <button
              onClick={onOpenHelp}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer font-bold text-xs flex items-center gap-1.5"
              title="User Guide"
            >
              <HelpCircle size={18} />
              <span className="hidden sm:inline font-mono">Guide (?)</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-6">
        {/* Intake Control Box */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          {/* Mode Switch Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setInputMode('url')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  inputMode === 'url'
                    ? 'bg-emerald-600 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Link2 size={14} />
                <span>Spotify Playlist URL</span>
              </button>

              <button
                type="button"
                onClick={() => setInputMode('html')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  inputMode === 'html'
                    ? 'bg-emerald-600 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Code2 size={14} />
                <span>Raw HTML Source (Air-Gapped)</span>
              </button>
            </div>

            <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
              100% Client-Side • No API Tokens • No Paywalls
            </span>
          </div>

          {/* URL Input Form */}
          {inputMode === 'url' ? (
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 block">
                Paste any public or shared Spotify playlist link:
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={playlistUrl}
                    onChange={e => setPlaylistUrl(e.target.value)}
                    placeholder="https://open.spotify.com/playlist/26xGC3d1hYZyRjINbDtn7w?si=..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none transition-colors"
                  />
                  {playlistUrl && (
                    <button
                      type="button"
                      onClick={() => setPlaylistUrl('')}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleFetchPlaylist}
                  disabled={isLoading}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>{loadingProgress || 'Extracting Tracks...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Extract Playlist</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Supports Spotify web links (<code className="text-emerald-400">https://open.spotify.com/playlist/...</code>) or URIs (<code className="text-emerald-400">spotify:playlist:...</code>).
              </p>
            </div>
          ) : (
            /* Air-Gapped HTML Input */
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 block">
                Paste Spotify page HTML source (Right click playlist page ➔ View Source ➔ Select All ➔ Paste):
              </label>
              <textarea
                rows={4}
                value={htmlSource}
                onChange={e => setHtmlSource(e.target.value)}
                placeholder="<!DOCTYPE html><html>...<script id=&quot;__NEXT_DATA__&quot; type=&quot;application/json&quot;>...</script>...</html>"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-xs text-slate-200 outline-none font-mono"
              />
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-500">
                  Ideal for zero-network corporate firewalls or completely offline air-gapped workstations.
                </span>
                <button
                  type="button"
                  onClick={handleParseHtml}
                  disabled={isLoading || !htmlSource.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-bold px-5 py-2 rounded-xl text-xs flex items-center space-x-2 transition-all cursor-pointer"
                >
                  {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>Parse HTML</span>
                </button>
              </div>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
              <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Extraction Error:</span> {errorMessage}
              </div>
            </div>
          )}
        </section>

        {/* Playlist Summary Hero & Track Controls */}
        {metadata && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="flex items-center space-x-4">
                {metadata.coverArtUrl ? (
                  <img
                    src={metadata.coverArtUrl}
                    alt={metadata.name}
                    className="w-16 h-16 rounded-xl object-cover border border-slate-700 shadow-md"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
                    <Music size={28} />
                  </div>
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-white">{metadata.name}</h2>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono font-bold flex items-center gap-1">
                      <Radio size={11} className="text-emerald-400" />
                      <span>{metadata.totalTracks} / {metadata.totalCount || metadata.totalTracks} tracks</span>
                    </span>
                    {metadata.totalTracks >= (metadata.totalCount || metadata.totalTracks) ? (
                      <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider">
                        100% Complete
                      </span>
                    ) : (
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider">
                        Embed Preview ({metadata.totalTracks})
                      </span>
                    )}
                  </div>
                  {metadata.subtitle && (
                    <p className="text-xs text-slate-400 mt-1">{metadata.subtitle}</p>
                  )}
                  <p className="text-[11px] text-slate-500 font-mono mt-1">
                    ID: {metadata.id || 'N/A'} • Extracted: {new Date(metadata.extractedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* Quick Search */}
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter by title, artist, album..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none"
                />
              </div>
            </div>

            {/* Track Listing Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-slate-400 hover:text-white cursor-pointer"
                        title={
                          selectedTrackIds.size === displayedTracks.length
                            ? 'Deselect All'
                            : 'Select All'
                        }
                      >
                        {displayedTracks.length > 0 &&
                        selectedTrackIds.size === displayedTracks.length ? (
                          <CheckSquare size={16} className="text-emerald-400" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </th>
                    <th className="p-3 w-12 text-center">Preview</th>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">Title & Artist</th>
                    <th className="p-3 hidden md:table-cell">Duration</th>
                    <th className="p-3 hidden lg:table-cell">Spotify URI</th>
                    <th className="p-3 w-16 text-center">Info</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-850">
                  {displayedTracks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No tracks match your current filter.
                      </td>
                    </tr>
                  ) : (
                    displayedTracks.map((track, idx) => {
                      const isSelected = selectedTrackIds.has(track.id);

                      return (
                        <tr
                          key={track.id || idx}
                          className={`hover:bg-slate-850/50 transition-colors ${
                            isSelected ? 'bg-emerald-950/20' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectTrack(track.id)}
                              className="text-slate-400 hover:text-white cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare size={16} className="text-emerald-400" />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>
                          </td>

                          {/* 30s Audio Preview Button */}
                          <td className="p-3 text-center">
                            <AudioPreviewButton
                              size="sm"
                              track={{
                                id: track.id,
                                artist: track.artist,
                                title: track.title,
                                album: track.album,
                                coverArtUrl: track.coverArtUrl,
                                previewUrl: track.previewUrl,
                              }}
                            />
                          </td>

                          {/* Number */}
                          <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>

                          {/* Title & Artist with Album Art Thumbnail */}
                          <td className="p-3">
                            <div className="flex items-center space-x-3">
                              <SongCoverArt
                                src={track.coverArtUrl}
                                title={track.title}
                                artist={track.artist}
                                size="sm"
                                className="shadow-md rounded-lg ring-1 ring-slate-800/80 shrink-0 cursor-pointer"
                                onClick={() => setInspectedTrack(track)}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-100 flex items-center space-x-1.5">
                                  <span className="truncate">{track.title}</span>
                                  {track.isExplicit && (
                                    <span className="text-[9px] bg-slate-800 text-rose-400 border border-rose-500/30 px-1 rounded uppercase font-mono shrink-0">
                                      E
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-400 text-[11px] truncate">
                                  {track.artist}
                                  {track.album && track.album !== metadata.name && (
                                    <span className="text-slate-500"> • {track.album}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Duration */}
                          <td className="p-3 hidden md:table-cell text-slate-400 font-mono">
                            {track.durationFormatted}
                          </td>

                          {/* Spotify URI */}
                          <td className="p-3 hidden lg:table-cell text-slate-500 font-mono text-[11px] truncate max-w-xs">
                            {track.uri}
                          </td>

                          {/* Deep Inspector */}
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setInspectedTrack(track)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-300 transition-colors cursor-pointer"
                              title="Inspect Deep Metadata"
                            >
                              <Sparkles size={14} />
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
        )}
      </main>

      {/* Floating Bottom Action & Export Bar */}
      {metadata && metadata.extractedTracks.length > 0 && (
        <aside
          aria-label="Export and downstream triage bar"
          className="fixed bottom-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-4 py-3 shadow-2xl"
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <span className="font-bold text-emerald-400">
                {selectedTrackIds.size > 0 ? selectedTrackIds.size : displayedTracks.length}
              </span>
              <span>of {metadata.extractedTracks.length} tracks selected</span>
              {selectedTrackIds.size > 0 && (
                <button
                  onClick={() => setSelectedTrackIds(new Set())}
                  className="text-xs text-slate-400 hover:underline ml-2 cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {/* Actions & Export Formats */}
            <div className="flex flex-wrap items-center gap-2">
              {/* CSV Export (TuneMyMusic / Soundiiz format) */}
              <button
                onClick={handleExportCSV}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                title="Export CSV with UTF-8 BOM"
              >
                <Download size={14} />
                <span>Export CSV</span>
              </button>

              {/* M3U Playlist */}
              <button
                onClick={handleExportM3U}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded-xl text-xs border border-slate-700 transition-all cursor-pointer"
                title="Export M3U playlist file"
              >
                <FileText size={14} />
                <span>M3U</span>
              </button>

              {/* Copy TSV */}
              <button
                onClick={handleCopyTSV}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded-xl text-xs border border-slate-700 transition-all cursor-pointer"
                title="Copy TSV table to clipboard"
              >
                <Copy size={14} />
                <span className="hidden sm:inline">Copy TSV</span>
              </button>

              {/* Copy URIs */}
              <button
                onClick={handleCopyURIs}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded-xl text-xs border border-slate-700 transition-all cursor-pointer"
                title="Copy spotify:track: URIs for Ctrl+V paste into Spotify desktop client"
              >
                <Radio size={14} />
                <span>Copy URIs</span>
              </button>

              <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

              {/* Downstream Bridges */}
              <button
                onClick={handleStageToTriage}
                className="flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                title="Stage tracks into Discovery Triage (Module 14)"
              >
                <Compass size={14} />
                <span>Stage to Triage (M14)</span>
              </button>

              <button
                onClick={handleRouteToConsensus}
                className="flex items-center space-x-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                title="Send as nomination source into Consensus Aggregator (Module 17)"
              >
                <BarChart3 size={14} />
                <span className="hidden lg:inline">To Consensus (M17)</span>
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Deep Metadata Inspector Modal */}
      {inspectedTriageTrack && (
        <SongMetadataInspectorModal
          isOpen={!!inspectedTrack}
          track={inspectedTriageTrack}
          onClose={() => setInspectedTrack(null)}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900 border border-emerald-500/50 text-emerald-200 px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-bold flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
          <Sparkles size={14} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
