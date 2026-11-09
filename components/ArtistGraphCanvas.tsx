import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Network,
  Search,
  Link,
  ArrowRight,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Users,
  Compass,
  Check
} from 'lucide-react';
import {
  ArtistConstellationNode,
  ArtistBridgePath
} from '../types';

interface ArtistGraphCanvasProps {
  artistNodes: ArtistConstellationNode[];
  onFindBridge?: (source: string, target: string) => ArtistBridgePath | null;
  bridgePath?: ArtistBridgePath | null;
}

interface SimNode {
  id: string;
  artist: string;
  degree: number;
  trackCount: number;
  playlistCount: number;
  topConnected: Array<{ artist: string; weight: number }>;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface SimEdge {
  source: string;
  target: string;
  weight: number;
}

export default function ArtistGraphCanvas({
  artistNodes = [],
  onFindBridge,
  bridgePath
}: ArtistGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport transformation
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dragging single node
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Selection & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [sourceArtist, setSourceArtist] = useState<string>('');
  const [targetArtist, setTargetArtist] = useState<string>('');
  const [localBridge, setLocalBridge] = useState<ArtistBridgePath | null>(bridgePath || null);

  // Initialize Physics Simulation State
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<SimEdge[]>([]);

  // Setup simulation nodes & edges from top 100 artists
  useEffect(() => {
    if (!artistNodes || artistNodes.length === 0) return;

    const topList = artistNodes.slice(0, 100);
    const topArtistSet = new Set(topList.map(a => a.artist));

    const width = 800;
    const height = 500;

    // Distribute nodes in a circle
    const nodes: SimNode[] = topList.map((a, idx) => {
      const angle = (idx / topList.length) * 2 * Math.PI;
      const dist = 140 + (idx % 4) * 55;
      const r = Math.max(5, Math.min(18, 5 + Math.sqrt(a.degree) * 2.2));

      return {
        id: a.artist,
        artist: a.artist,
        degree: a.degree,
        trackCount: a.trackCount,
        playlistCount: a.playlistCount,
        topConnected: a.topConnected,
        x: width / 2 + Math.cos(angle) * dist,
        y: height / 2 + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: r
      };
    });

    const edgeMap = new Map<string, SimEdge>();
    topList.forEach(a => {
      a.topConnected.forEach(conn => {
        if (topArtistSet.has(conn.artist)) {
          const key = [a.artist, conn.artist].sort().join(':::');
          if (!edgeMap.has(key)) {
            edgeMap.set(key, {
              source: a.artist,
              target: conn.artist,
              weight: conn.weight
            });
          }
        }
      });
    });

    simNodesRef.current = nodes;
    simEdgesRef.current = Array.from(edgeMap.values());
  }, [artistNodes]);

  // Sync prop bridgePath
  useEffect(() => {
    if (bridgePath) setLocalBridge(bridgePath);
  }, [bridgePath]);

  // Bridge path artist set for highlighting
  const bridgeArtistSet = useMemo(() => {
    return new Set(localBridge?.path || []);
  }, [localBridge]);

  // Animation & Physics Tick Loop
  useEffect(() => {
    let animId: number;

    const tick = () => {
      const nodes = simNodesRef.current;
      const edges = simEdgesRef.current;
      const cx = 400;
      const cy = 250;

      // 1. Center gravity & boundary spring
      for (const n of nodes) {
        if (n.id === draggedNodeId) continue;
        const dx = cx - n.x;
        const dy = cy - n.y;
        n.vx += dx * 0.001;
        n.vy += dy * 0.001;

        // Damping
        n.vx *= 0.88;
        n.vy *= 0.88;
      }

      // 2. Node-node electrostatic repulsion
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 180) {
            const force = (180 - dist) / dist * 0.4;
            const fx = dx * force;
            const fy = dy * force;

            if (n1.id !== draggedNodeId) {
              n1.vx -= fx * 0.5;
              n1.vy -= fy * 0.5;
            }
            if (n2.id !== draggedNodeId) {
              n2.vx += fx * 0.5;
              n2.vy += fy * 0.5;
            }
          }
        }
      }

      // 3. Edge spring attraction
      const nodeIndexMap = new Map<string, SimNode>();
      nodes.forEach(n => nodeIndexMap.set(n.id, n));

      for (const edge of edges) {
        const s = nodeIndexMap.get(edge.source);
        const t = nodeIndexMap.get(edge.target);
        if (!s || !t) continue;

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 70;
        const force = (dist - targetDist) * 0.003 * Math.min(1.5, edge.weight * 0.3);

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (s.id !== draggedNodeId) {
          s.vx += fx;
          s.vy += fy;
        }
        if (t.id !== draggedNodeId) {
          t.vx -= fx;
          t.vy -= fy;
        }
      }

      // 4. Update positions
      for (const n of nodes) {
        if (n.id === draggedNodeId) continue;
        n.x += n.vx;
        n.y += n.vy;
      }

      // 5. Render
      renderCanvas();
      animId = requestAnimationFrame(tick);
    };

    const renderCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(pan.x + width / 2, pan.y + height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-400, -250);

      const nodes = simNodesRef.current;
      const edges = simEdgesRef.current;
      const nodeMap = new Map<string, SimNode>();
      nodes.forEach(n => nodeMap.set(n.id, n));

      const hoveredNode = hoveredNodeId ? nodeMap.get(hoveredNodeId) : null;
      const connectedSet = new Set<string>();
      if (hoveredNode) {
        connectedSet.add(hoveredNode.id);
        hoveredNode.topConnected.forEach(c => connectedSet.add(c.artist));
      }

      // Draw Edges
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;

        const isBridgeEdge =
          localBridge &&
          bridgeArtistSet.has(s.id) &&
          bridgeArtistSet.has(t.id);

        const isHoverEdge =
          hoveredNode && (s.id === hoveredNode.id || t.id === hoveredNode.id);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);

        if (isBridgeEdge) {
          ctx.strokeStyle = '#f59e0b'; // Radiant Gold Bridge
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.95;
        } else if (isHoverEdge) {
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 1.8;
          ctx.globalAlpha = 0.85;
        } else {
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = Math.max(0.4, edge.weight * 0.4);
          ctx.globalAlpha = hoveredNodeId ? 0.08 : 0.35;
        }
        ctx.stroke();
      }

      // Draw Nodes
      for (const n of nodes) {
        const isHovered = n.id === hoveredNodeId;
        const isConnected = connectedSet.has(n.id);
        const isBridgeNode = bridgeArtistSet.has(n.id);
        const isMatchSearch =
          searchQuery.trim() &&
          n.artist.toLowerCase().includes(searchQuery.toLowerCase());

        let nodeColor = '#3b82f6';
        if (isBridgeNode) nodeColor = '#f59e0b';
        else if (isHovered) nodeColor = '#f43f5e';
        else if (isConnected) nodeColor = '#ec4899';
        else if (isMatchSearch) nodeColor = '#10b981';

        // Outer Glow
        if (isBridgeNode || isHovered || isMatchSearch || n.radius > 12) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius * 1.8, 0, Math.PI * 2);
          ctx.fillStyle = nodeColor;
          ctx.globalAlpha = isHovered || isBridgeNode ? 0.45 : 0.15;
          ctx.fill();
        }

        // Core Circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, isHovered ? n.radius * 1.2 : n.radius, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.globalAlpha =
          hoveredNodeId && !isConnected && !isBridgeNode ? 0.25 : 0.95;
        ctx.fill();

        // Label
        if (isHovered || isBridgeNode || isMatchSearch || zoom > 1.4 || n.radius > 10) {
          ctx.font = '600 10px sans-serif';
          ctx.fillStyle = isBridgeNode ? '#fbbf24' : isHovered ? '#ffffff' : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.globalAlpha = hoveredNodeId && !isConnected && !isBridgeNode ? 0.2 : 1.0;
          const displayArtist = n.artist.length > 16 ? n.artist.slice(0, 14) + '…' : n.artist;
          ctx.fillText(displayArtist, n.x, n.y + n.radius + 11);
        }
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [
    zoom,
    pan,
    draggedNodeId,
    hoveredNodeId,
    localBridge,
    bridgeArtistSet,
    searchQuery
  ]);

  // Handle Dragging / Panning
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const worldX = (mouseX - (pan.x + width / 2)) / zoom + 400;
    const worldY = (mouseY - (pan.y + height / 2)) / zoom + 250;

    // Check if clicked a node
    for (const n of simNodesRef.current) {
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) {
        setDraggedNodeId(n.id);
        // If clicking, set as source or target for bridge
        if (!sourceArtist) {
          setSourceArtist(n.artist);
        } else if (!targetArtist && n.artist !== sourceArtist) {
          setTargetArtist(n.artist);
          if (onFindBridge) {
            const b = onFindBridge(sourceArtist, n.artist);
            setLocalBridge(b);
          }
        }
        return;
      }
    }

    // Otherwise pan viewport
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const worldX = (mouseX - (pan.x + width / 2)) / zoom + 400;
    const worldY = (mouseY - (pan.y + height / 2)) / zoom + 250;

    if (draggedNodeId) {
      const node = simNodesRef.current.find(n => n.id === draggedNodeId);
      if (node) {
        node.x = worldX;
        node.y = worldY;
        node.vx = 0;
        node.vy = 0;
      }
      return;
    }

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    // Hover hit-test
    let foundId: string | null = null;
    for (const n of simNodesRef.current) {
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) {
        foundId = n.id;
        break;
      }
    }
    setHoveredNodeId(foundId);
  };

  const handleMouseUp = () => {
    setDraggedNodeId(null);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom(prev => Math.max(0.4, Math.min(4.0, prev * factor)));
  };

  // Run Dijkstra / BFS Bridge
  const handleTriggerBridge = () => {
    if (!sourceArtist.trim() || !targetArtist.trim() || !onFindBridge) return;
    const res = onFindBridge(sourceArtist.trim(), targetArtist.trim());
    setLocalBridge(res);
  };

  return (
    <div className="relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Top Filter and Controls Bar */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
            <Network size={18} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                Force-Directed Artist Constellation & Aesthetic Bridge Engine
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Top 100 Co-Occurrence Hubs
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Interactive physics simulation with draggable nodes, spotlight peer highlighting, and Dijkstra pathfinding.
            </p>
          </div>
        </div>

        {/* Search & Zoom Buttons */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Search artist node..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-7 pr-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-36 sm:w-48"
            />
          </div>

          <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setZoom(z => Math.min(4.0, z * 1.25))}
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

      {/* Aesthetic Bridge Tracer Control Row */}
      <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-400 flex items-center space-x-1">
            <Link size={13} className="text-amber-400" />
            <span>Trace Aesthetic Bridge:</span>
          </span>
          <input
            type="text"
            placeholder="Source (e.g. YOASOBI)"
            value={sourceArtist}
            onChange={e => setSourceArtist(e.target.value)}
            className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 w-36"
          />
          <ArrowRight size={12} className="text-slate-500" />
          <input
            type="text"
            placeholder="Target (e.g. Vaundy)"
            value={targetArtist}
            onChange={e => setTargetArtist(e.target.value)}
            className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 w-36"
          />
          <button
            type="button"
            onClick={handleTriggerBridge}
            disabled={!sourceArtist.trim() || !targetArtist.trim()}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            Trace Path
          </button>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
          <span className="text-slate-500">Presets:</span>
          {[
            { s: 'YOASOBI', t: 'Vaundy' },
            { s: 'Kenshi Yonezu', t: 'Fujii Kaze' },
            { s: 'Taylor Swift', t: 'Billie Eilish' }
          ].map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSourceArtist(p.s);
                setTargetArtist(p.t);
                if (onFindBridge) {
                  const b = onFindBridge(p.s, p.t);
                  setLocalBridge(b);
                }
              }}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
            >
              {p.s} → {p.t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative w-full aspect-[2/1] min-h-[420px] max-h-[600px] overflow-hidden select-none cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full block"
        />

        {/* Active Bridge Path Visual HUD */}
        {localBridge && (
          <div className="absolute top-4 left-4 z-20 bg-slate-900/95 border border-amber-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-md space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                <Sparkles size={13} />
                <span>Aesthetic Bridge Found ({localBridge.hops} {localBridge.hops === 1 ? 'Hop' : 'Hops'})</span>
              </span>
              <button
                onClick={() => setLocalBridge(null)}
                className="text-[10px] text-slate-400 hover:text-white"
              >
                Clear
              </button>
            </div>
            <div className="flex items-center flex-wrap gap-1 text-xs font-mono font-bold text-white">
              {localBridge.path.map((art, idx) => (
                <React.Fragment key={idx}>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {art}
                  </span>
                  {idx < localBridge.path.length - 1 && (
                    <ArrowRight size={11} className="text-amber-400" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bridge Hops Breakdown Table */}
      {localBridge && localBridge.bridgeHops.length > 0 && (
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 space-y-2">
          <span className="text-xs font-bold text-white block">
            Hop Breakdown & Curatorial Stepping Stones:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {localBridge.bridgeHops.map((hop, hIdx) => (
              <div key={hIdx} className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60 text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-200 font-semibold">
                  <span>Hop {hIdx + 1}: {hop.fromArtist} → {hop.toArtist}</span>
                </div>
                {hop.sharedPlaylists.length > 0 && (
                  <div className="text-[11px] text-slate-400 truncate">
                    Shared in: <span className="text-slate-300">{hop.sharedPlaylists.join(', ')}</span>
                  </div>
                )}
                {hop.representativeTrackTitles.length > 0 && (
                  <div className="text-[11px] text-slate-400 truncate">
                    Tracks: <span className="text-amber-300">{hop.representativeTrackTitles.join(' | ')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
