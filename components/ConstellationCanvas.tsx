import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Play,
  Pause,
  ArrowLeft,
  Sparkles,
  Info,
  Radio,
  ExternalLink,
  Layers,
  Search,
  Sliders,
  Check
} from 'lucide-react';
import {
  BipartiteCorpusGraph,
  CorpusPlaylist,
  CorpusTrack,
  CommunityCluster,
  JaccardPair,
  ConstellationCelestialNode,
  ConstellationCelestialEdge
} from '../types';
import { useAudioPreview } from './AudioPreviewContext';
import AudioPreviewButton from './AudioPreviewButton';

interface ConstellationCanvasProps {
  graph: BipartiteCorpusGraph;
  communities: CommunityCluster[];
  jaccardPairs: JaccardPair[];
  onSelectPlaylist?: (playlistId: string) => void;
  onStageTracks?: (tracks: CorpusTrack[]) => void;
}

// Distinct Community Color Palette
const COMMUNITY_COLORS = [
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#a855f7', // Purple
  '#14b8a6', // Teal
  '#6366f1'  // Indigo
];

export default function ConstellationCanvas({
  graph,
  communities = [],
  jaccardPairs = [],
  onSelectPlaylist,
  onStageTracks
}: ConstellationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { playTrack, pauseTrack, isPlaying, activeAudio } = useAudioPreview();

  // Canvas Viewport Transformation
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Filtering Controls
  const [selectedCommunityFilter, setSelectedCommunityFilter] = useState<number | 'all'>('all');
  const [minJaccardThreshold, setMinJaccardThreshold] = useState<number>(0.15);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected State
  const [hoveredNode, setHoveredNode] = useState<ConstellationCelestialNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<ConstellationCelestialNode | null>(null);

  // Micro / Solar System Mode State
  const [solarModePlaylistId, setSolarModePlaylistId] = useState<string | null>(null);
  const [selectedSolarTrackId, setSelectedSolarTrackId] = useState<string | null>(null);
  const [inversionBeamPlaylists, setInversionBeamPlaylists] = useState<string[]>([]);

  // 1. Compute Celestial Nodes
  const nodes = useMemo<ConstellationCelestialNode[]>(() => {
    if (!graph || graph.playlists.size === 0) return [];

    // Map playlist to community
    const playlistCommunityMap = new Map<string, number>();
    const trackToComm = new Map<string, number>();
    communities.forEach(c => {
      (c.topTrackIds || []).forEach(tid => trackToComm.set(tid, c.id));
      (c.dominantPlaylists || []).forEach(dp => {
        for (const pl of graph.playlists.values()) {
          if (pl.name === dp.playlistName) {
            playlistCommunityMap.set(pl.id, c.id);
          }
        }
      });
    });
    // For unmapped playlists, infer from track overlap
    graph.playlists.forEach(pl => {
      if (!playlistCommunityMap.has(pl.id)) {
        const commVotes = new Map<number, number>();
        (pl.trackIds || []).slice(0, 30).forEach(tid => {
          const cid = trackToComm.get(tid);
          if (cid !== undefined) {
            commVotes.set(cid, (commVotes.get(cid) || 0) + 1);
          }
        });
        if (commVotes.size > 0) {
          let bestC = 0, bestCount = -1;
          commVotes.forEach((cnt, cid) => {
            if (cnt > bestCount) {
              bestCount = cnt;
              bestC = cid;
            }
          });
          playlistCommunityMap.set(pl.id, bestC);
        }
      }
    });

    const result: ConstellationCelestialNode[] = [];
    const communityCounts = communities.length || 1;

    // Distribute communities in a circular spiral nebula
    const communityCenters = new Map<number, { cx: number; cy: number }>();
    communities.forEach((c, idx) => {
      const angle = (idx / communityCounts) * 2 * Math.PI;
      const radius = 260 + (idx % 3) * 60;
      communityCenters.set(c.id, {
        cx: 500 + Math.cos(angle) * radius,
        cy: 400 + Math.sin(angle) * radius
      });
    });

    let i = 0;
    graph.playlists.forEach(pl => {
      const commId = playlistCommunityMap.get(pl.id) ?? (i % communityCounts);
      const center = communityCenters.get(commId) || { cx: 500, cy: 400 };

      // Local displacement inside community nebula
      const localAngle = (i * 1.618033) * 2 * Math.PI;
      const localRadius = (Math.sqrt(i % 47) / Math.sqrt(47)) * 120 + 20;

      const x = center.cx + Math.cos(localAngle) * localRadius;
      const y = center.cy + Math.sin(localAngle) * localRadius;

      // Extract top artists in this playlist
      const artistCounts = new Map<string, number>();
      pl.trackIds.slice(0, 40).forEach(tId => {
        const t = graph.tracks.get(tId);
        if (t) {
          artistCounts.set(t.artist, (artistCounts.get(t.artist) || 0) + 1);
        }
      });
      const topArtists = Array.from(artistCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(e => e[0]);

      // Radius scaled by track count (3 to 12)
      const r = Math.max(3.5, Math.min(13, 3.5 + Math.log2(pl.trackCount + 1)));

      result.push({
        id: pl.id,
        name: pl.name,
        communityId: commId,
        color: COMMUNITY_COLORS[commId % COMMUNITY_COLORS.length],
        x,
        y,
        radius: r,
        trackCount: pl.trackCount,
        topArtists
      });
      i++;
    });

    return result;
  }, [graph, communities]);

  // Node Map for fast ID lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, ConstellationCelestialNode>();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      if (selectedCommunityFilter !== 'all' && n.communityId !== selectedCommunityFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return n.name.toLowerCase().includes(q) || n.topArtists.some(a => a.toLowerCase().includes(q));
      }
      return true;
    });
  }, [nodes, selectedCommunityFilter, searchQuery]);

  // 2. Compute Celestial Edges (Filtered by Jaccard Threshold)
  const edges = useMemo<ConstellationCelestialEdge[]>(() => {
    if (!jaccardPairs || jaccardPairs.length === 0) return [];
    return jaccardPairs
      .filter(p => (p.jaccardIndex ?? 0) >= minJaccardThreshold)
      .slice(0, 1200) // Keep edge rendering ultra fast
      .map(p => ({
        sourceId: p.playlistAId,
        targetId: p.playlistBId,
        weight: p.jaccardIndex ?? 0
      }));
  }, [jaccardPairs, minJaccardThreshold]);

  // Solar System Data when a playlist is expanded
  const solarSystemData = useMemo(() => {
    if (!solarModePlaylistId || !graph) return null;
    const pl = graph.playlists.get(solarModePlaylistId);
    if (!pl) return null;

    const tracks: CorpusTrack[] = [];
    pl.trackIds.forEach(tId => {
      const t = graph.tracks.get(tId);
      if (t) tracks.push(t);
    });

    // Sort by consensus count descending
    tracks.sort((a, b) => b.consensusCount - a.consensusCount);

    return {
      playlist: pl,
      tracks
    };
  }, [solarModePlaylistId, graph]);

  // Handle Graph Inversion Beams when a track is clicked in Solar Mode
  const handleSelectSolarTrack = (trackId: string) => {
    setSelectedSolarTrackId(trackId);
    if (!graph) return;
    const t = graph.tracks.get(trackId);
    if (t) {
      setInversionBeamPlaylists(t.playlistIds);
      // Audition preview
      playTrack({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album
      }).catch(() => {});
    }
  };

  // Render Loop on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set resolution
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Apply Pan & Zoom
    ctx.translate(pan.x + width / 2, pan.y + height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-500, -400); // Center at (500, 400)

    if (!solarModePlaylistId) {
      // ==========================================
      // MACRO VIEW: THE INFINITE GALAXY
      // ==========================================

      // 1. Draw Jaccard Edges
      edges.forEach(edge => {
        const s = nodeMap.get(edge.sourceId);
        const t = nodeMap.get(edge.targetId);
        if (!s || !t) return;

        const isHighlighted =
          (selectedNode && (selectedNode.id === s.id || selectedNode.id === t.id)) ||
          (hoveredNode && (hoveredNode.id === s.id || hoveredNode.id === t.id));

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = isHighlighted ? '#f43f5e' : '#334155';
        ctx.lineWidth = isHighlighted ? 1.8 : Math.max(0.4, edge.weight * 2);
        ctx.globalAlpha = isHighlighted ? 0.85 : Math.max(0.12, edge.weight * 0.4);
        ctx.stroke();
      });

      // 2. Draw Nodes
      filteredNodes.forEach(node => {
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;

        // Glow halo for large or selected nodes
        if (node.radius > 7 || isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * (isHovered || isSelected ? 2.4 : 1.6), 0, Math.PI * 2);
          ctx.fillStyle = node.color;
          ctx.globalAlpha = isHovered || isSelected ? 0.45 : 0.18;
          ctx.fill();
        }

        // Core star
        ctx.beginPath();
        ctx.arc(node.x, node.y, isHovered || isSelected ? node.radius * 1.3 : node.radius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#ffffff' : node.color;
        ctx.globalAlpha = 0.95;
        ctx.fill();

        // Node label if hovered or selected
        if (isHovered || isSelected || zoom > 2.0) {
          ctx.font = '600 10px sans-serif';
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.globalAlpha = 1.0;
          ctx.fillText(node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name, node.x, node.y + node.radius + 12);
        }
      });
    } else {
      // ==========================================
      // MICRO VIEW: SOLAR SYSTEM & INVERSION BEAMS
      // ==========================================
      const sunCenter = { x: 500, y: 400 };

      // 1. Draw Inversion Laser Beams to Outer Playlists
      if (selectedSolarTrackId && inversionBeamPlaylists.length > 0) {
        inversionBeamPlaylists.forEach(plId => {
          const targetNode = nodeMap.get(plId);
          if (!targetNode || targetNode.id === solarModePlaylistId) return;

          ctx.beginPath();
          ctx.moveTo(sunCenter.x, sunCenter.y);
          ctx.lineTo(targetNode.x, targetNode.y);
          ctx.strokeStyle = '#38bdf8'; // Glowing cyan laser
          ctx.lineWidth = 1.6;
          ctx.globalAlpha = 0.7;
          ctx.stroke();

          // Target beacon
          ctx.beginPath();
          ctx.arc(targetNode.x, targetNode.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.globalAlpha = 0.9;
          ctx.fill();
        });
      }

      // 2. Draw Sun (The Expanded Playlist)
      const sunRadius = 38;
      // Corona glow
      ctx.beginPath();
      ctx.arc(sunCenter.x, sunCenter.y, sunRadius * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.globalAlpha = 0.25;
      ctx.fill();

      // Sun body
      ctx.beginPath();
      ctx.arc(sunCenter.x, sunCenter.y, sunRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.globalAlpha = 1.0;
      ctx.fill();

      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.fillText('SUN', sunCenter.x, sunCenter.y + 4);

      // 3. Draw Orbiting Track Planets
      if (solarSystemData) {
        const trackCount = Math.min(solarSystemData.tracks.length, 36);
        const orbitRings = 3;

        // Draw orbital tracks
        for (let ring = 1; ring <= orbitRings; ring++) {
          const ringRadius = 75 + ring * 55;
          ctx.beginPath();
          ctx.arc(sunCenter.x, sunCenter.y, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 0.8;
          ctx.setLineDash([4, 4]);
          ctx.globalAlpha = 0.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Place track planets along rings
        solarSystemData.tracks.slice(0, trackCount).forEach((track, tIdx) => {
          const ringIndex = (tIdx % orbitRings) + 1;
          const ringRadius = 75 + ringIndex * 55;
          const tracksInThisRing = Math.ceil(trackCount / orbitRings);
          const posInRing = Math.floor(tIdx / orbitRings);
          const angle = (posInRing / tracksInThisRing) * 2 * Math.PI;

          const px = sunCenter.x + Math.cos(angle) * ringRadius;
          const py = sunCenter.y + Math.sin(angle) * ringRadius;

          const isSelected = selectedSolarTrackId === track.id;
          const pRadius = Math.max(5, Math.min(12, 5 + track.consensusCount * 1.5));

          // Planet Halo
          if (isSelected) {
            ctx.beginPath();
            ctx.arc(px, py, pRadius * 2, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.globalAlpha = 0.5;
            ctx.fill();
          }

          // Planet Body
          ctx.beginPath();
          ctx.arc(px, py, pRadius, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#38bdf8' : track.consensusCount > 1 ? '#a855f7' : '#94a3b8';
          ctx.globalAlpha = 0.95;
          ctx.fill();

          // Planet Label
          ctx.font = '500 9px sans-serif';
          ctx.fillStyle = isSelected ? '#38bdf8' : '#cbd5e1';
          ctx.textAlign = 'center';
          ctx.globalAlpha = 0.9;
          const shortTitle = track.title.length > 15 ? track.title.slice(0, 13) + '…' : track.title;
          ctx.fillText(shortTitle, px, py + pRadius + 10);
        });
      }
    }

    ctx.restore();
  }, [
    zoom,
    pan,
    filteredNodes,
    edges,
    nodeMap,
    hoveredNode,
    selectedNode,
    solarModePlaylistId,
    solarSystemData,
    selectedSolarTrackId,
    inversionBeamPlaylists
  ]);

  // Handle Mouse Events for Pan, Drag, and Selection
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }

    // Hit-testing nodes
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert screen coordinates to canvas world coordinates
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const worldX = (mouseX - (pan.x + width / 2)) / zoom + 500;
    const worldY = (mouseY - (pan.y + height / 2)) / zoom + 400;

    let found: ConstellationCelestialNode | null = null;
    for (const node of filteredNodes) {
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      if (dx * dx + dy * dy <= (node.radius + 5) * (node.radius + 5)) {
        found = node;
        break;
      }
    }
    setHoveredNode(found);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom(prev => Math.max(0.4, Math.min(6.0, prev * factor)));
  };

  const handleCanvasClick = () => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode);
      if (onSelectPlaylist) {
        onSelectPlaylist(hoveredNode.id);
      }
    }
  };

  // Zoom to Solar System
  const handleEnterSolarSystem = (plId: string) => {
    setSolarModePlaylistId(plId);
    setSelectedSolarTrackId(null);
    setInversionBeamPlaylists([]);
    setZoom(1.2);
    setPan({ x: 0, y: 0 });
  };

  const handleExitSolarSystem = () => {
    setSolarModePlaylistId(null);
    setSelectedSolarTrackId(null);
    setInversionBeamPlaylists([]);
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Top Filter and Controls Bar */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                Infinite Constellation & Solar System Visualizer
              </h2>
              {solarModePlaylistId ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Solar Planetary Mode
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Macro Galaxy Mode ({filteredNodes.length.toLocaleString()} stars)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {solarModePlaylistId
                ? 'Orbital planetary tracks. Click any track to trigger Graph Inversion Laser Beams across the library!'
                : 'Hardware-accelerated Louvain community nebulae connected by Jaccard gravitational strands.'}
            </p>
          </div>
        </div>

        {/* Viewport & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {solarModePlaylistId ? (
            <button
              type="button"
              onClick={handleExitSolarSystem}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border border-slate-700"
            >
              <ArrowLeft size={13} />
              <span>Back to Infinite Galaxy</span>
            </button>
          ) : (
            <>
              {/* Community Filter */}
              <select
                value={selectedCommunityFilter}
                onChange={e =>
                  setSelectedCommunityFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Nebulae ({communities.length})</option>
                {communities.map(c => (
                  <option key={c.id} value={c.id}>
                    Community #{c.id} ({c.size || c.dominantPlaylists?.length || 0} tracks/lists)
                  </option>
                ))}
              </select>

              {/* Jaccard Slider */}
              <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs text-slate-300">
                <span className="text-[10px] text-slate-400">Min J:</span>
                <input
                  type="range"
                  min="0.10"
                  max="0.50"
                  step="0.05"
                  value={minJaccardThreshold}
                  onChange={e => setMinJaccardThreshold(parseFloat(e.target.value))}
                  className="w-16 accent-purple-500"
                />
                <span className="font-mono text-[10px] text-purple-300">
                  {minJaccardThreshold.toFixed(2)}
                </span>
              </div>

              {/* Playlist Search */}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search playlist star..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-7 pr-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 w-36 sm:w-44"
                />
              </div>
            </>
          )}

          {/* Zoom Buttons */}
          <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setZoom(z => Math.min(5.0, z * 1.25))}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => setZoom(z => Math.max(0.4, z * 0.8))}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Reset View"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative w-full aspect-[2/1] min-h-[440px] max-h-[640px] overflow-hidden select-none cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onClick={handleCanvasClick}
          className="w-full h-full block"
        />

        {/* Hover Tooltip in Galaxy Mode */}
        {!solarModePlaylistId && hoveredNode && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-xs space-y-1.5"
            style={{
              left: 20,
              bottom: 20
            }}
          >
            <div className="flex items-center space-x-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: hoveredNode.color }}
              />
              <span className="text-xs font-bold text-white truncate max-w-[200px]">
                {hoveredNode.name}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 space-y-0.5">
              <div>Tracks: <strong className="text-white font-mono">{hoveredNode.trackCount}</strong></div>
              <div>Nebula Community: <strong className="text-purple-300 font-mono">#{hoveredNode.communityId}</strong></div>
              {hoveredNode.topArtists.length > 0 && (
                <div>Top: <span className="text-slate-300">{hoveredNode.topArtists.join(', ')}</span></div>
              )}
            </div>
            <div className="pt-1 text-[10px] text-purple-400 font-semibold">
              Click node to inspect or enter its Solar System!
            </div>
          </div>
        )}

        {/* Solar System Inversion Beam Info Banner */}
        {solarModePlaylistId && selectedSolarTrackId && (
          <div className="absolute left-4 bottom-4 z-20 bg-slate-900/95 border border-sky-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-sm space-y-1.5 animate-in fade-in">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-xs font-bold text-white">Graph Inversion Laser Beams Active</span>
            </div>
            <p className="text-[11px] text-slate-300">
              This track appears in <strong className="text-sky-300 font-mono">{inversionBeamPlaylists.length} playlists</strong> across your library. Gravitational laser strands are shining across the galaxy to every sibling container!
            </p>
          </div>
        )}
      </div>

      {/* Galaxy Node Inspector Panel (Bottom Drawer when a node is selected in Galaxy Mode) */}
      {!solarModePlaylistId && selectedNode && (
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center space-x-3">
            <div
              className="w-4 h-4 rounded-full shadow"
              style={{ backgroundColor: selectedNode.color }}
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-white">{selectedNode.name}</span>
                <span className="text-xs font-mono text-purple-300">({selectedNode.trackCount} tracks)</span>
              </div>
              <p className="text-xs text-slate-400">
                Community #{selectedNode.communityId} • Top artists: {selectedNode.topArtists.join(', ') || 'Mixed'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => handleEnterSolarSystem(selectedNode.id)}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md cursor-pointer"
            >
              <Sparkles size={13} />
              <span>Enter Solar System View</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Micro Solar System Planetary Track Drawer */}
      {solarModePlaylistId && solarSystemData && (
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-white">
                Orbiting Planetary Tracks ({solarSystemData.tracks.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Click any track to ignite Graph Inversion laser strands
              </span>
            </div>
            {onStageTracks && (
              <button
                type="button"
                onClick={() => onStageTracks(solarSystemData.tracks.slice(0, 50))}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all"
              >
                Stage Playlist to Triage
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
            {solarSystemData.tracks.slice(0, 32).map(t => {
              const isCurrent = selectedSolarTrackId === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => handleSelectSolarTrack(t.id)}
                  className={`p-2 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between space-x-2 ${
                    isCurrent
                      ? 'bg-sky-950/60 border-sky-500 text-white shadow-md'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="truncate flex-1">
                    <span className="font-semibold block truncate">{t.title}</span>
                    <span className="text-[11px] text-slate-400 block truncate">{t.artist}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        t.consensusCount > 1
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                      title={`Appears in ${t.consensusCount} playlists`}
                    >
                      {t.consensusCount}x
                    </span>
                    <AudioPreviewButton
                      track={{
                        id: t.id,
                        title: t.title,
                        artist: t.artist,
                        album: t.album
                      }}
                      size="xs"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
