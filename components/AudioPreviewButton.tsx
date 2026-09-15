import React from 'react';
import { Play, Pause, RefreshCw } from 'lucide-react';
import { useAudioPreview, PlayableTrack } from './AudioPreviewContext';

interface AudioPreviewButtonProps {
  track: PlayableTrack;
  variant?: 'icon' | 'pill' | 'text';
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  title?: string;
}

export default function AudioPreviewButton({
  track,
  variant = 'icon',
  size = 'sm',
  className = '',
  title,
}: AudioPreviewButtonProps) {
  const { activeAudio, isPlaying, loadingTrackId, togglePlayTrack } = useAudioPreview();

  const isCurrent = activeAudio?.trackId === track.id;
  const isCurrentPlaying = isCurrent && isPlaying;
  const isLoading = loadingTrackId === track.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlayTrack(track);
  };

  const iconSizes = {
    xs: 11,
    sm: 12,
    md: 14,
  };

  const iconSize = iconSizes[size];

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={`px-2.5 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 text-xs font-bold cursor-pointer ${
          isCurrentPlaying
            ? 'bg-pink-600/30 text-pink-300 border border-pink-500/40 shadow-sm'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
        } ${className}`}
        title={title || (isCurrentPlaying ? 'Pause in-app 30s preview' : 'Play 30s iTunes audio preview in-app')}
      >
        {isLoading ? (
          <RefreshCw size={iconSize} className="animate-spin text-pink-400" />
        ) : isCurrentPlaying ? (
          <Pause size={iconSize} className="text-pink-400 fill-pink-400" />
        ) : (
          <Play size={iconSize} className="text-pink-400 fill-pink-400" />
        )}
        <span>{isLoading ? 'Loading...' : isCurrentPlaying ? 'Pause' : 'Preview'}</span>
      </button>
    );
  }

  if (variant === 'text') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={`flex items-center space-x-1 text-slate-400 hover:text-pink-400 transition-colors cursor-pointer text-[11px] font-semibold ${
          isCurrentPlaying ? 'text-pink-400' : ''
        } ${className}`}
        title={title || (isCurrentPlaying ? 'Pause audio preview' : `Listen to 30s preview of "${track.title}"`)}
      >
        {isLoading ? (
          <RefreshCw size={iconSize} className="animate-spin text-pink-400" />
        ) : isCurrentPlaying ? (
          <Pause size={iconSize} className="text-pink-400 fill-pink-400" />
        ) : (
          <Play size={iconSize} className="text-pink-400" />
        )}
        <span>{isLoading ? 'Loading...' : isCurrentPlaying ? 'Playing' : 'Preview'}</span>
      </button>
    );
  }

  // Default: 'icon'
  const sizeClasses = {
    xs: 'p-1 rounded-lg',
    sm: 'p-1.5 rounded-lg',
    md: 'p-2 rounded-xl',
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`${sizeClasses[size]} bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center justify-center ${
        isCurrentPlaying ? 'bg-pink-950/60 border border-pink-500/40 text-pink-300' : ''
      } ${className}`}
      title={
        title ||
        (isLoading
          ? 'Resolving iTunes audio preview...'
          : isCurrentPlaying
          ? 'Pause 30s preview'
          : `Play 30s iTunes preview of "${track.title}"`)}
    >
      {isLoading ? (
        <RefreshCw size={iconSize} className="animate-spin text-pink-400" />
      ) : isCurrentPlaying ? (
        <Pause size={iconSize} className="text-pink-400 fill-pink-400" />
      ) : (
        <Play size={iconSize} className="text-pink-400" />
      )}
    </button>
  );
}
