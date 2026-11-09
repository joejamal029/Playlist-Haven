import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Globe,
  Play,
  Pause,
  Compass,
  Radio,
  Sparkles,
  Layers,
  Plane,
  Target,
  ArrowRight,
  ExternalLink,
  Download,
  Music,
  Users,
  X,
  Volume2,
  VolumeX,
  Share2,
  Check
} from 'lucide-react';
import {
  BipartiteCorpusGraph,
  CorpusTrack,
  WorldAtlasHotspot
} from '../types';
import {
  CanonicalBucket,
  CANONICAL_BUCKETS,
  getCachedClassification,
  detectScriptSignature
} from '../services/classificationEngine';
import { useAudioPreview } from './AudioPreviewContext';
import AudioPreviewButton from './AudioPreviewButton';
import { downloadPlaylistFile } from '../services/downloadHelper';

interface WorldAtlasCanvasProps {
  graph: BipartiteCorpusGraph;
  offlineArtistSet?: Set<string>;
  onStageToTriage?: (tracks: CorpusTrack[]) => void;
  onStageToManipulator?: (tracks: CorpusTrack[]) => void;
}

type MapMode = 'density' | 'deep_dive' | 'flight_odyssey' | 'frontier_hunter';

// Standardized 1000x500 Mercator/Robinson projection centroid coordinates
const BUCKET_COORDINATES: Record<CanonicalBucket, { x: number; y: number; regionName: string; defaultColor: string }> = {
  'English': { x: 230, y: 190, regionName: 'North America & Anglosphere', defaultColor: '#60a5fa' },
  'J-Pop': { x: 840, y: 195, regionName: 'Tokyo, Japan', defaultColor: '#f43f5e' },
  'Naija': { x: 485, y: 310, regionName: 'Lagos & West Africa', defaultColor: '#22c55e' },
  'K-Pop': { x: 810, y: 200, regionName: 'Seoul, South Korea', defaultColor: '#a855f7' },
  'C-Pop': { x: 760, y: 235, regionName: 'Greater China (Mandopop/Cantopop)', defaultColor: '#ef4444' },
  'Thai': { x: 745, y: 285, regionName: 'Bangkok, Thailand (T-Pop)', defaultColor: '#ec4899' },
  'Vietnamese': { x: 765, y: 280, regionName: 'Hanoi & Saigon, Vietnam (V-Pop)', defaultColor: '#f97316' },
  'Dutch': { x: 495, y: 155, regionName: 'Amsterdam, Netherlands (Nederpop)', defaultColor: '#fb923c' },
  'Arabic': { x: 575, y: 245, regionName: 'Middle East & North Africa (MENA)', defaultColor: '#eab308' },
  'German': { x: 508, y: 160, regionName: 'Berlin, Germany & DACH', defaultColor: '#facc15' },
  'Italian': { x: 512, y: 180, regionName: 'Rome, Italy (Sanremo/Italo)', defaultColor: '#4ade80' },
  'Portuguese': { x: 345, y: 360, regionName: 'Brazil & Portugal (Bossa/Sertanejo/Funk)', defaultColor: '#a3e635' },
  'Filipino': { x: 810, y: 295, regionName: 'Manila, Philippines (OPM)', defaultColor: '#fbbf24' },
  'I-Pop': { x: 685, y: 250, regionName: 'India (Bollywood/Indie/Desi)', defaultColor: '#818cf8' },
  'African': { x: 520, y: 380, regionName: 'Sub-Saharan Africa (Amapiano/Afro-house)', defaultColor: '#84cc16' },
  'Latina': { x: 245, y: 290, regionName: 'Latin America (Reggaeton/Latin Pop)', defaultColor: '#f87171' },
  'Français': { x: 485, y: 168, regionName: 'Paris, France & Francophonie', defaultColor: '#38bdf8' },
  'Gospel': { x: 460, y: 340, regionName: 'Global Worship & Sacred Harmonies', defaultColor: '#fde047' },
  'Instrumental': { x: 500, y: 75, regionName: 'Ambient / Soundtracks / Celestial Spheres', defaultColor: '#22d3ee' },
  'Other': { x: 500, y: 255, regionName: 'Global Cross-Cultural Nexus', defaultColor: '#94a3b8' }
};

// Simplified high-aesthetic dark mode continent vectors for 1000x500 canvas
const CONTINENT_PATHS = [
  // North America
  "M 120,60 L 260,50 L 320,80 L 290,140 L 240,170 L 250,220 L 200,260 L 160,250 L 140,200 L 90,170 L 80,120 Z",
  // Greenland
  "M 340,30 L 400,25 L 380,70 L 320,65 Z",
  // South America
  "M 240,280 L 310,290 L 360,340 L 340,430 L 300,470 L 270,450 L 250,380 L 225,320 Z",
  // Europe
  "M 470,120 L 530,110 L 560,140 L 530,190 L 470,200 L 450,170 L 460,135 Z",
  // United Kingdom & Ireland
  "M 450,130 L 465,120 L 460,145 L 445,140 Z",
  // Africa
  "M 465,220 L 550,225 L 590,290 L 540,410 L 490,420 L 450,330 L 440,260 Z",
  // Asia
  "M 550,110 L 850,90 L 880,170 L 820,260 L 760,280 L 700,290 L 650,240 L 580,210 Z",
  // Japan
  "M 840,170 L 855,185 L 845,215 L 830,195 Z",
  // Southeast Asian Archipelago / Philippines / Indonesia
  "M 780,310 L 825,305 L 810,345 L 775,340 Z",
  // Australia
  "M 780,370 L 870,360 L 890,430 L 820,455 L 770,410 Z",
  // New Zealand
  "M 905,445 L 925,435 L 920,470 L 900,465 Z"
];

export default function WorldAtlasCanvas({
  graph,
  offlineArtistSet = new Set(),
  onStageToTriage,
  onStageToManipulator
}: WorldAtlasCanvasProps) {
  const { playTrack, pauseTrack, isPlaying, activeAudio } = useAudioPreview();

  const [mapMode, setMapMode] = useState<MapMode>('density');
  const [selectedBucket, setSelectedBucket] = useState<CanonicalBucket | null>(null);
  const [hoveredHotspot, setHoveredHotspot] = useState<WorldAtlasHotspot | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Trans-Continental Flight Odyssey State
  const [flightActive, setFlightActive] = useState<boolean>(false);
  const [flightCurrentHop, setFlightCurrentHop] = useState<number>(0);
  const [flightHistory, setFlightHistory] = useState<string[]>([]);
  const flightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Deep-dive drawer search & filter
  const [drawerSearch, setDrawerSearch] = useState<string>('');
  const [drawerPage, setDrawerPage] = useState<number>(1);
  const [isCopiedNotice, setIsCopiedNotice] = useState<boolean>(false);

  // 1. Compute Geographic Hotspots from Graph Tracks
  const hotspots: WorldAtlasHotspot[] = useMemo(() => {
    if (!graph || graph.tracks.size === 0) return [];

    const bucketTrackMap = new Map<CanonicalBucket, CorpusTrack[]>();
    const bucketPlaylistSet = new Map<CanonicalBucket, Set<string>>();
    const bucketArtistCount = new Map<CanonicalBucket, Map<string, number>>();

    // Seed buckets
    Object.keys(BUCKET_COORDINATES).forEach(b => {
      bucketTrackMap.set(b as CanonicalBucket, []);
      bucketPlaylistSet.set(b as CanonicalBucket, new Set());
      bucketArtistCount.set(b as CanonicalBucket, new Map());
    });

    graph.tracks.forEach(track => {
      // Determine canonical bucket
      let bucket: CanonicalBucket = 'Other';
      if (track.culturalBucket && track.culturalBucket in BUCKET_COORDINATES) {
        bucket = track.culturalBucket as CanonicalBucket;
      } else {
        const cached = getCachedClassification(track.artist);
        if (cached && cached.bucket && cached.bucket in BUCKET_COORDINATES) {
          bucket = cached.bucket;
        } else {
          // Script signature detection fallback
          const script = detectScriptSignature(`${track.artist} ${track.title}`);
          if (script && script.bucket && script.bucket in BUCKET_COORDINATES) {
            bucket = script.bucket as CanonicalBucket;
          }
        }
      }

      // Add to bucket
      const tracksList = bucketTrackMap.get(bucket) || [];
      tracksList.push(track);
      bucketTrackMap.set(bucket, tracksList);

      // Add playlist IDs
      const plSet = bucketPlaylistSet.get(bucket) || new Set();
      track.playlistIds.forEach(plId => plSet.add(plId));
      bucketPlaylistSet.set(bucket, plSet);

      // Track artist frequency
      const artMap = bucketArtistCount.get(bucket) || new Map();
      artMap.set(track.artist, (artMap.get(track.artist) || 0) + 1);
      bucketArtistCount.set(bucket, artMap);
    });

    // Build hotspot entities
    const list: WorldAtlasHotspot[] = [];

    Object.entries(BUCKET_COORDINATES).forEach(([bucketKey, coords]) => {
      const b = bucketKey as CanonicalBucket;
      const bTracks = bucketTrackMap.get(b) || [];
      if (bTracks.length === 0) return; // Omit zero-count hotspots

      const artMap = bucketArtistCount.get(b) || new Map();
      const topArtists = Array.from(artMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);

      // Calculate offline familiar vs unmined frontier ratio
      const unminedCount = bTracks.filter(t => !offlineArtistSet || !offlineArtistSet.has((t.artist || '').toLowerCase())).length;
      const affinityScore = bTracks.length > 0 ? unminedCount / bTracks.length : 0;

      // Sample tracks sorted by consensus
      const sampleTracks = [...bTracks]
        .sort((a, b) => b.consensusCount - a.consensusCount)
        .slice(0, 10)
        .map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          spotifyId: t.spotifyId
        }));

      list.push({
        bucketId: b,
        label: CANONICAL_BUCKETS[b]?.displayName || b,
        regionName: coords.regionName,
        x: coords.x,
        y: coords.y,
        trackCount: bTracks.length,
        playlistCount: (bucketPlaylistSet.get(b) || new Set()).size,
        topArtists,
        sampleTracks,
        color: coords.defaultColor,
        affinityScore
      });
    });

    return list.sort((a, b) => b.trackCount - a.trackCount);
  }, [graph, offlineArtistSet]);

  // Max track count for scaling radii
  const maxTrackCount = useMemo(() => {
    return Math.max(...hotspots.map(h => h.trackCount), 1);
  }, [hotspots]);

  // Ordered sequence of hotspots for trans-continental flight odyssey
  const flightRoute: WorldAtlasHotspot[] = useMemo(() => {
    const desiredOrder: CanonicalBucket[] = [
      'Naija',
      'African',
      'Arabic',
      'I-Pop',
      'Thai',
      'Vietnamese',
      'Filipino',
      'C-Pop',
      'K-Pop',
      'J-Pop',
      'English',
      'Latina',
      'Portuguese',
      'Français',
      'Dutch',
      'German',
      'Italian',
      'Gospel'
    ];
    return desiredOrder
      .map(bucket => hotspots.find(h => h.bucketId === bucket))
      .filter((h): h is WorldAtlasHotspot => Boolean(h));
  }, [hotspots]);

  // Handle Trans-Continental Flight Auto-Advance
  useEffect(() => {
    if (!flightActive || flightRoute.length === 0) return;

    const currentSpot = flightRoute[flightCurrentHop % flightRoute.length];
    if (currentSpot && currentSpot.sampleTracks.length > 0) {
      const trackToPlay = currentSpot.sampleTracks[0];
      playTrack({
        id: trackToPlay.id,
        title: trackToPlay.title,
        artist: trackToPlay.artist,
        album: trackToPlay.album
      }).catch(() => {});
    }

    // Set timer for next continental hop (12 seconds per preview slice)
    flightTimerRef.current = setTimeout(() => {
      setFlightCurrentHop(prev => {
        const next = (prev + 1) % flightRoute.length;
        setFlightHistory(hist => [...hist.slice(-5), flightRoute[next].bucketId]);
        return next;
      });
    }, 12000);

    return () => {
      if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
    };
  }, [flightActive, flightCurrentHop, flightRoute, playTrack]);

  // Stop flight when switching tabs or exiting mode
  const handleToggleFlight = () => {
    if (flightActive) {
      setFlightActive(false);
      pauseTrack();
      if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
    } else {
      setFlightActive(true);
      setFlightCurrentHop(0);
      setFlightHistory([flightRoute[0]?.bucketId || '']);
    }
  };

  // Selected Bucket Tracks for Drawer
  const selectedBucketTracks: CorpusTrack[] = useMemo(() => {
    if (!selectedBucket || !graph) return [];
    const res: CorpusTrack[] = [];
    graph.tracks.forEach(track => {
      let b: CanonicalBucket = 'Other';
      if (track.culturalBucket && track.culturalBucket in BUCKET_COORDINATES) {
        b = track.culturalBucket as CanonicalBucket;
      } else {
        const cached = getCachedClassification(track.artist);
        if (cached && cached.bucket) b = cached.bucket;
      }
      if (b === selectedBucket) {
        res.push(track);
      }
    });
    return res.sort((a, b) => b.consensusCount - a.consensusCount);
  }, [selectedBucket, graph]);

  // Filtered tracks inside drawer
  const filteredDrawerTracks = useMemo(() => {
    if (!drawerSearch.trim()) return selectedBucketTracks;
    const q = drawerSearch.toLowerCase();
    return selectedBucketTracks.filter(
      t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album?.toLowerCase().includes(q)
    );
  }, [selectedBucketTracks, drawerSearch]);

  const pagedDrawerTracks = useMemo(() => {
    const start = (drawerPage - 1) * 25;
    return filteredDrawerTracks.slice(start, start + 25);
  }, [filteredDrawerTracks, drawerPage]);

  // Export bucket as M3U with UTF-8 BOM
  const handleExportBucketM3U = () => {
    if (!selectedBucket || selectedBucketTracks.length === 0) return;
    const lines = [
      '#EXTM3U',
      `#PLAYLIST:Cultural Atlas - ${CANONICAL_BUCKETS[selectedBucket]?.displayName || selectedBucket}`
    ];
    selectedBucketTracks.forEach(t => {
      lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`);
      lines.push(`${t.artist} - ${t.title}.mp3`);
    });
    const content = '\uFEFF' + lines.join('\n');
    downloadPlaylistFile(content, `Atlas_${selectedBucket}_Batch.m3u`, 'audio/x-mpegurl;charset=utf-8');
  };

  // Stage to downstream Triage
  const handleStageDrawerTracks = () => {
    if (onStageToTriage && selectedBucketTracks.length > 0) {
      onStageToTriage(selectedBucketTracks.slice(0, 100));
      setIsCopiedNotice(true);
      setTimeout(() => setIsCopiedNotice(false), 2000);
    }
  };

  return (
    <div className="relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Controls Bar */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
            <Globe size={18} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                Global Cultural Music Atlas
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
                20 Canonical Regional Centroids
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Interactive Mercator topology mapped to language, cultural heritage, and live 30s stream previews.
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center space-x-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
          <button
            onClick={() => { setMapMode('density'); setFlightActive(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              mapMode === 'density'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Layers size={13} />
            <span>Density Heatmap</span>
          </button>

          <button
            onClick={() => { setMapMode('deep_dive'); setFlightActive(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              mapMode === 'deep_dive'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Compass size={13} />
            <span>Regional Deep Dive</span>
          </button>

          <button
            onClick={() => { setMapMode('flight_odyssey'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              mapMode === 'flight_odyssey'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Plane size={13} />
            <span>Flight Odyssey</span>
          </button>

          <button
            onClick={() => { setMapMode('frontier_hunter'); setFlightActive(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              mapMode === 'frontier_hunter'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Target size={13} />
            <span>Frontier Hunter</span>
          </button>
        </div>
      </div>

      {/* Flight Odyssey Sub-Banner */}
      {mapMode === 'flight_odyssey' && (
        <div className="bg-gradient-to-r from-rose-950/60 via-slate-900 to-indigo-950/60 border-b border-rose-500/20 px-4 py-2.5 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleToggleFlight}
              className={`px-3 py-1 rounded-xl font-bold flex items-center space-x-1.5 transition-all shadow-md ${
                flightActive
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              {flightActive ? <Pause size={12} /> : <Play size={12} />}
              <span>{flightActive ? 'Pause Trans-Continental Flight' : 'Launch Trans-Continental Flight Tour'}</span>
            </button>
            <div className="text-slate-300">
              {flightActive ? (
                <span className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    Currently touring: <strong className="text-rose-300">{flightRoute[flightCurrentHop % flightRoute.length]?.label}</strong> ({flightRoute[flightCurrentHop % flightRoute.length]?.regionName})
                  </span>
                </span>
              ) : (
                <span>Continuous audio flight across 18 world soundscapes in sequence (12s preview per continent).</span>
              )}
            </div>
          </div>
          <div className="hidden sm:flex items-center space-x-1 text-[11px] font-mono text-slate-400">
            <span>Hop {flightCurrentHop + 1} of {flightRoute.length}</span>
          </div>
        </div>
      )}

      {/* Frontier Hunter Sub-Banner */}
      {mapMode === 'frontier_hunter' && (
        <div className="bg-amber-950/40 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center space-x-2">
            <Target size={14} className="text-amber-400" />
            <span>
              <strong>Frontier Talent Hunter Mode:</strong> Pins glow brighter gold where you have the highest ratio of <em>unmined & novel artists</em> absent from your Musicolet offline library.
            </span>
          </div>
          <span className="text-[11px] text-amber-300 font-mono">
            {(offlineArtistSet?.size || 0).toLocaleString()} familiar offline artists cross-checked
          </span>
        </div>
      )}

      {/* The Interactive SVG World Canvas */}
      <div
        className="relative w-full aspect-[2/1] min-h-[420px] max-h-[640px] bg-[#070b14] overflow-hidden select-none cursor-crosshair"
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          });
        }}
      >
        <svg
          viewBox="0 0 1000 500"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="world-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e293b" strokeWidth="0.4" strokeDasharray="2,2" />
            </pattern>

            {/* Glowing radial gradient for pins */}
            <radialGradient id="hotspot-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#f43f5e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="frontier-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background Grid */}
          <rect width="1000" height="500" fill="url(#world-grid)" />

          {/* Equator & Prime Meridian subtle guide lines */}
          <line x1="0" y1="250" x2="1000" y2="250" stroke="#334155" strokeWidth="0.6" strokeDasharray="4,4" />
          <line x1="500" y1="0" x2="500" y2="500" stroke="#334155" strokeWidth="0.6" strokeDasharray="4,4" />

          {/* Continent Silhouettes */}
          <g className="transition-opacity duration-500">
            {CONTINENT_PATHS.map((pathStr, idx) => (
              <path
                key={idx}
                d={pathStr}
                fill="#0f172a"
                stroke="#1e293b"
                strokeWidth="1.2"
                className="hover:fill-slate-800/80 transition-colors duration-300"
              />
            ))}
          </g>

          {/* Flight Odyssey Animated Trajectory Arc */}
          {mapMode === 'flight_odyssey' && flightRoute.length > 1 && (
            <g>
              {flightRoute.map((spot, idx) => {
                const nextSpot = flightRoute[(idx + 1) % flightRoute.length];
                const isCurrentLeg = idx === (flightCurrentHop % flightRoute.length);
                return (
                  <line
                    key={`flight-leg-${idx}`}
                    x1={spot.x}
                    y1={spot.y}
                    x2={nextSpot.x}
                    y2={nextSpot.y}
                    stroke={isCurrentLeg ? '#f43f5e' : '#475569'}
                    strokeWidth={isCurrentLeg ? 2.5 : 1}
                    strokeDasharray={isCurrentLeg ? '4,4' : '2,4'}
                    strokeOpacity={isCurrentLeg ? 0.9 : 0.4}
                  />
                );
              })}

              {/* Moving Flight Indicator */}
              {flightActive && (
                <circle
                  cx={flightRoute[flightCurrentHop % flightRoute.length]?.x}
                  cy={flightRoute[flightCurrentHop % flightRoute.length]?.y}
                  r="16"
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2"
                  className="animate-ping"
                />
              )}
            </g>
          )}

          {/* Hotspot Pins */}
          {hotspots.map(hotspot => {
            // Compute radius based on track count or frontier ratio
            const sizeFactor = hotspot.trackCount / maxTrackCount;
            let radius = Math.max(8, Math.min(28, 8 + sizeFactor * 20));

            if (mapMode === 'frontier_hunter') {
              radius = Math.max(10, Math.min(30, 10 + (hotspot.affinityScore || 0) * 18));
            }

            const isHovered = hoveredHotspot?.bucketId === hotspot.bucketId;
            const isSelected = selectedBucket === hotspot.bucketId;
            const isFlightCurrent =
              mapMode === 'flight_odyssey' &&
              flightRoute[flightCurrentHop % flightRoute.length]?.bucketId === hotspot.bucketId;

            const pinColor =
              mapMode === 'frontier_hunter'
                ? '#fbbf24'
                : hotspot.color || '#f43f5e';

            return (
              <g
                key={hotspot.bucketId}
                className="cursor-pointer group"
                onClick={() => {
                  setSelectedBucket(hotspot.bucketId as CanonicalBucket);
                }}
                onMouseEnter={() => setHoveredHotspot(hotspot)}
                onMouseLeave={() => setHoveredHotspot(null)}
              >
                {/* Outer Glow Halo */}
                <circle
                  cx={hotspot.x}
                  cy={hotspot.y}
                  r={radius * (isHovered || isFlightCurrent ? 2.2 : 1.6)}
                  fill={mapMode === 'frontier_hunter' ? 'url(#frontier-glow)' : 'url(#hotspot-glow)'}
                  opacity={isHovered || isFlightCurrent ? 0.9 : 0.45}
                  className="transition-all duration-300"
                />

                {/* Pulsing Radar Ring for Large / Current Hubs */}
                {(isFlightCurrent || isSelected || hotspot.trackCount > 500) && (
                  <circle
                    cx={hotspot.x}
                    cy={hotspot.y}
                    r={radius * 1.5}
                    fill="none"
                    stroke={pinColor}
                    strokeWidth="1.5"
                    strokeOpacity="0.7"
                    className="animate-ping"
                    style={{ animationDuration: '2.5s' }}
                  />
                )}

                {/* Solid Core Circle */}
                <circle
                  cx={hotspot.x}
                  cy={hotspot.y}
                  r={radius}
                  fill={isSelected ? '#ffffff' : pinColor}
                  stroke={isSelected ? pinColor : '#0f172a'}
                  strokeWidth="2"
                  className="transition-all duration-200 group-hover:scale-110"
                />

                {/* Inner Icon or Dot */}
                <circle
                  cx={hotspot.x}
                  cy={hotspot.y}
                  r={radius > 14 ? 4 : 2}
                  fill={isSelected ? pinColor : '#ffffff'}
                />

                {/* Hotspot Text Label */}
                <text
                  x={hotspot.x}
                  y={hotspot.y + radius + 11}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="9"
                  fontFamily="sans-serif"
                  fontWeight={isHovered || isSelected ? '700' : '500'}
                  className="pointer-events-none drop-shadow-md"
                >
                  {hotspot.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredHotspot && (
          <div
            className="absolute z-30 pointer-events-none bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-xs space-y-2 animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: Math.min(mousePos.x + 15, 650),
              top: Math.min(mousePos.y + 15, 300)
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: hoveredHotspot.color }}
                />
                <span>{hoveredHotspot.label}</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {hoveredHotspot.regionName}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px]">Total Tracks</span>
                <strong className="text-white font-mono">{hoveredHotspot.trackCount.toLocaleString()}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Playlists</span>
                <strong className="text-slate-200 font-mono">{hoveredHotspot.playlistCount.toLocaleString()}</strong>
              </div>
            </div>

            {hoveredHotspot.topArtists.length > 0 && (
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Top Scene Artists:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {hoveredHotspot.topArtists.slice(0, 3).map((art, idx) => (
                    <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                      {art}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-1 text-[10px] text-rose-400 flex items-center space-x-1">
              <span>Click pin to open Regional Sonic Capsule drawer</span>
              <ArrowRight size={10} />
            </div>
          </div>
        )}
      </div>

      {/* REGIONAL SONIC CAPSULE DRAWER */}
      {selectedBucket && (
        <div className="border-t border-slate-800 bg-slate-900/95 backdrop-blur-xl p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div
                className="w-4 h-4 rounded-full shadow-lg"
                style={{ backgroundColor: BUCKET_COORDINATES[selectedBucket]?.defaultColor || '#f43f5e' }}
              />
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>{CANONICAL_BUCKETS[selectedBucket]?.displayName || selectedBucket} Sonic Capsule</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    ({selectedBucketTracks.length.toLocaleString()} tracks in your corpus)
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  {BUCKET_COORDINATES[selectedBucket]?.regionName} • {CANONICAL_BUCKETS[selectedBucket]?.description}
                </p>
              </div>
            </div>

            {/* Capsule Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStageDrawerTracks}
                disabled={selectedBucketTracks.length === 0}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                {isCopiedNotice ? <Check size={13} /> : <Share2 size={13} />}
                <span>{isCopiedNotice ? 'Staged to Triage!' : 'Stage Top 100 to M14 Triage'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportBucketM3U}
                disabled={selectedBucketTracks.length === 0}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border border-slate-700 cursor-pointer"
              >
                <Download size={13} />
                <span>Export M3U</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedBucket(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="Close Drawer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Search bar inside capsule */}
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              placeholder={`Search ${CANONICAL_BUCKETS[selectedBucket]?.displayName} tracks or artists...`}
              value={drawerSearch}
              onChange={e => {
                setDrawerSearch(e.target.value);
                setDrawerPage(1);
              }}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 w-full sm:w-80"
            />
            <span className="text-xs text-slate-500 font-mono">
              Showing {pagedDrawerTracks.length} of {filteredDrawerTracks.length}
            </span>
          </div>

          {/* Track Table with in-app 30s Audio Stream Previews */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[11px] font-mono uppercase">
                  <th className="py-2.5 px-3 w-10 text-center">Audio</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">Artist</th>
                  <th className="py-2.5 px-3">Album</th>
                  <th className="py-2.5 px-3 text-center">Consensus</th>
                  <th className="py-2.5 px-3 text-right">Familiarity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pagedDrawerTracks.map(t => {
                  const isFamiliar = offlineArtistSet ? offlineArtistSet.has((t.artist || '').toLowerCase()) : false;
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 text-center">
                        <AudioPreviewButton
                          track={{
                            id: t.id,
                            title: t.title,
                            artist: t.artist,
                            album: t.album
                          }}
                          size="xs"
                        />
                      </td>
                      <td className="py-2 px-3 font-semibold text-white truncate max-w-[200px]" title={t.title}>
                        {t.title}
                      </td>
                      <td className="py-2 px-3 text-slate-300 truncate max-w-[150px]" title={t.artist}>
                        {t.artist}
                      </td>
                      <td className="py-2 px-3 text-slate-500 truncate max-w-[150px]" title={t.album || 'Unknown'}>
                        {t.album || '—'}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-rose-400">
                        {t.consensusCount}x
                      </td>
                      <td className="py-2 px-3 text-right">
                        {isFamiliar ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            Offline Familiar
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            Novel Frontier
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredDrawerTracks.length > 25 && (
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              <span>Page {drawerPage} of {Math.ceil(filteredDrawerTracks.length / 25)}</span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  disabled={drawerPage === 1}
                  onClick={() => setDrawerPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={drawerPage >= Math.ceil(filteredDrawerTracks.length / 25)}
                  onClick={() => setDrawerPage(p => p + 1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
