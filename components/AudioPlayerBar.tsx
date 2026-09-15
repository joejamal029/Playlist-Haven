import React from 'react';
import { Play, Pause, Volume2, VolumeX, Download, X, Music2, RefreshCw } from 'lucide-react';
import { useAudioPreview } from './AudioPreviewContext';

function formatAudioTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayerBar() {
  const {
    activeAudio,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isDownloading,
    pauseTrack,
    resumeTrack,
    seekAudio,
    setAudioVolume,
    toggleMuteAudio,
    closeAudio,
    downloadAudioPreview,
  } = useAudioPreview();

  if (!activeAudio) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 shadow-2xl px-4 py-2.5 transition-all duration-300 animate-in slide-in-from-bottom">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Track Info & Artwork */}
        <div className="flex items-center space-x-3 min-w-[200px] max-w-xs">
          <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center shadow">
            {activeAudio.coverArt ? (
              <img src={activeAudio.coverArt} alt={activeAudio.title} className="w-full h-full object-cover" />
            ) : (
              <Music2 className="w-5 h-5 text-pink-400" />
            )}
          </div>
          <div className="truncate">
            <div className="text-xs font-bold text-white truncate" title={activeAudio.title}>
              {activeAudio.title}
            </div>
            <div className="text-[11px] text-slate-400 truncate" title={activeAudio.artist}>
              {activeAudio.artist}
            </div>
          </div>
        </div>

        {/* Center: Controls & Scrubber */}
        <div className="flex-1 max-w-xl flex flex-col items-center space-y-1">
          <div className="flex items-center space-x-4">
            {/* Play/Pause Button */}
            <button
              onClick={() => (isPlaying ? pauseTrack() : resumeTrack())}
              className="p-2 rounded-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-900/40 active:scale-95 transition cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white translate-x-0.5" />
              )}
            </button>
          </div>

          {/* Progress Scrubber & Times */}
          <div className="w-full flex items-center space-x-2 text-[10px] font-mono text-slate-400">
            <span>{formatAudioTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 30}
              step={0.1}
              value={currentTime}
              onChange={e => seekAudio(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
            <span>{formatAudioTime(duration || 30)}</span>
          </div>
        </div>

        {/* Right: Volume & In-Browser Download & Close */}
        <div className="flex items-center space-x-3">
          {/* Volume Controls */}
          <div className="hidden sm:flex items-center space-x-1.5">
            <button
              onClick={toggleMuteAudio}
              className="text-slate-400 hover:text-white transition cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={e => setAudioVolume(parseFloat(e.target.value))}
              className="w-16 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          {/* Direct In-Browser Download (.m4a) */}
          <button
            onClick={() => downloadAudioPreview(activeAudio.url, activeAudio.artist, activeAudio.title)}
            disabled={isDownloading}
            className="px-3 py-1.5 bg-pink-950/60 hover:bg-pink-900/80 text-pink-300 border border-pink-700/60 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
            title="Download 30s Audio Preview (.m4a) directly into browser without external tabs"
          >
            {isDownloading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-pink-400" />
            ) : (
              <Download className="w-3.5 h-3.5 text-pink-400" />
            )}
            <span>Download .m4a</span>
          </button>

          {/* Dismiss Player */}
          <button
            onClick={closeAudio}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer"
            title="Dismiss audio player"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
