import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { resolveAudioPreviewForTrack } from '../services/itunesApi';

export interface PlayableTrack {
  id: string;
  artist: string;
  title: string;
  album?: string;
  coverArtUrl?: string;
  previewUrl?: string;
}

export interface ActiveAudio {
  trackId: string;
  artist: string;
  title: string;
  album?: string;
  coverArt?: string;
  url: string;
}

export interface AudioPreviewContextValue {
  activeAudio: ActiveAudio | null;
  isPlaying: boolean;
  loadingTrackId: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isDownloading: boolean;
  playTrack: (track: PlayableTrack) => Promise<void>;
  pauseTrack: () => void;
  resumeTrack: () => void;
  togglePlayTrack: (track: PlayableTrack) => Promise<void>;
  seekAudio: (seconds: number) => void;
  setAudioVolume: (volume: number) => void;
  toggleMuteAudio: () => void;
  closeAudio: () => void;
  downloadAudioPreview: (url: string, artist: string, title: string) => Promise<void>;
}

const AudioPreviewContext = createContext<AudioPreviewContextValue | null>(null);

export function AudioPreviewProvider({ children }: { children: ReactNode }) {
  const [activeAudio, setActiveAudio] = useState<ActiveAudio | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(30);
  const [volume, setVolumeState] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playTrack = async (track: PlayableTrack) => {
    let previewUrl = track.previewUrl;
    let coverArt = track.coverArtUrl;

    if (!previewUrl) {
      setLoadingTrackId(track.id);
      try {
        const resolved = await resolveAudioPreviewForTrack(track.artist, track.title, track.album);
        if (resolved.previewUrl) {
          previewUrl = resolved.previewUrl;
          if (resolved.coverArt && !coverArt) {
            coverArt = resolved.coverArt;
          }
        }
      } catch (err) {
        console.warn('[AudioPreview] Resolution error:', err);
      } finally {
        setLoadingTrackId(null);
      }
    }

    if (!previewUrl) {
      alert(`No 30-second audio preview found on Apple iTunes for "${track.artist} - ${track.title}".`);
      return;
    }

    const newActive: ActiveAudio = {
      trackId: track.id,
      url: previewUrl,
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverArt,
    };

    setActiveAudio(newActive);
    setCurrentTime(0);

    if (audioRef.current) {
      audioRef.current.src = previewUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(e => {
          console.warn('[AudioPreview] Autoplay blocked or error:', e);
          setIsPlaying(false);
        });
    }
  };

  const pauseTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const resumeTrack = () => {
    if (audioRef.current && activeAudio) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(e => {
          console.warn('[AudioPreview] Resume error:', e);
          setIsPlaying(false);
        });
    }
  };

  const togglePlayTrack = async (track: PlayableTrack) => {
    if (activeAudio?.trackId === track.id) {
      if (isPlaying) {
        pauseTrack();
      } else {
        resumeTrack();
      }
    } else {
      await playTrack(track);
    }
  };

  const seekAudio = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const setAudioVolume = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : clamped;
    }
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMuteAudio = () => {
    setIsMuted(prev => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  };

  const closeAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPlaying(false);
    setActiveAudio(null);
    setCurrentTime(0);
  };

  const downloadAudioPreview = async (url: string, artist: string, title: string) => {
    try {
      setIsDownloading(true);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const safeFilename = `${artist} - ${title} (30s Preview).m4a`.replace(/[/\\?%*:|"<>]/g, '_');
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert(`Could not download audio preview directly: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <AudioPreviewContext.Provider
      value={{
        activeAudio,
        isPlaying,
        loadingTrackId,
        currentTime,
        duration,
        volume,
        isMuted,
        isDownloading,
        playTrack,
        pauseTrack,
        resumeTrack,
        togglePlayTrack,
        seekAudio,
        setAudioVolume,
        toggleMuteAudio,
        closeAudio,
        downloadAudioPreview,
      }}
    >
      {/* Permanently mounted hidden HTML5 Audio Element */}
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration || 30);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />
      {children}
    </AudioPreviewContext.Provider>
  );
}

export function useAudioPreview(): AudioPreviewContextValue {
  const context = useContext(AudioPreviewContext);
  if (!context) {
    throw new Error('useAudioPreview must be used within an AudioPreviewProvider');
  }
  return context;
}
