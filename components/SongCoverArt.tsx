import React, { useState } from 'react';
import { Disc3, Music2 } from 'lucide-react';

export type CoverArtSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

interface SongCoverArtProps {
  src?: string;
  alt?: string;
  title?: string;
  artist?: string;
  culturalBucket?: string;
  size?: CoverArtSize;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

const SIZE_DIMENSIONS: Record<CoverArtSize, { container: string; icon: number; center: string }> = {
  xs: { container: 'w-7 h-7 rounded-md', icon: 11, center: 'w-2.5 h-2.5' },
  sm: { container: 'w-10 h-10 rounded-lg', icon: 15, center: 'w-3.5 h-3.5' },
  md: { container: 'w-14 h-14 rounded-xl', icon: 20, center: 'w-5 h-5' },
  lg: { container: 'w-20 h-20 rounded-2xl', icon: 26, center: 'w-7 h-7' },
  xl: { container: 'w-28 h-28 rounded-2xl', icon: 34, center: 'w-9 h-9' },
  hero: { container: 'w-44 h-44 rounded-3xl', icon: 48, center: 'w-14 h-14' },
};

const BUCKET_LABEL_COLORS: Record<string, string> = {
  'English': 'from-blue-600 to-indigo-700',
  'J-Pop': 'from-rose-600 to-pink-700',
  'Naija': 'from-emerald-600 to-green-700',
  'K-Pop': 'from-purple-600 to-violet-700',
  'C-Pop': 'from-amber-600 to-yellow-700',
  'Thai': 'from-cyan-600 to-teal-700',
  'Vietnamese': 'from-teal-600 to-emerald-700',
  'Dutch': 'from-orange-600 to-amber-700',
  'Arabic': 'from-amber-700 to-orange-800',
  'German': 'from-slate-600 to-zinc-700',
  'Italian': 'from-emerald-700 to-teal-800',
  'Portuguese': 'from-lime-600 to-green-700',
  'Filipino': 'from-sky-600 to-blue-700',
  'I-Pop': 'from-orange-600 to-red-700',
  'African': 'from-amber-600 to-rose-700',
  'Latina': 'from-rose-600 to-red-700',
  'Français': 'from-indigo-600 to-blue-700',
  'Gospel': 'from-yellow-600 to-amber-700',
  'Instrumental': 'from-violet-700 to-purple-800',
  'Other': 'from-slate-700 to-slate-900',
};

export default function SongCoverArt({
  src,
  alt,
  title,
  artist,
  culturalBucket = 'Other',
  size = 'md',
  className = '',
  onClick,
  hoverable = true,
}: SongCoverArtProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const { container, icon, center } = SIZE_DIMENSIONS[size] || SIZE_DIMENSIONS.md;
  const labelColor = BUCKET_LABEL_COLORS[culturalBucket] || BUCKET_LABEL_COLORS.Other;

  const showImage = src && !hasError;

  return (
    <div
      onClick={onClick}
      className={`relative shrink-0 overflow-hidden select-none ${container} ${
        onClick ? 'cursor-pointer' : ''
      } ${
        hoverable && onClick ? 'hover:scale-[1.03] active:scale-[0.98] transition-transform' : ''
      } shadow-md border border-slate-700/60 bg-slate-950 ${className}`}
      title={title && artist ? `${title} by ${artist}` : title || artist || 'Album Artwork'}
    >
      {showImage ? (
        <>
          <img
            src={src}
            alt={alt || title || 'Cover Art'}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
          {!isLoaded && (
            <div className="absolute inset-0 bg-slate-900 animate-pulse flex items-center justify-center">
              <Disc3 size={icon} className="text-slate-700 animate-spin" />
            </div>
          )}
        </>
      ) : (
        /* Vinyl Record Crate Fallback */
        <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-black flex items-center justify-center relative p-1">
          {/* Outer vinyl ring grooves */}
          <div className="absolute inset-1 rounded-full border border-slate-800/80 pointer-events-none" />
          <div className="absolute inset-2 rounded-full border border-slate-800/40 pointer-events-none" />

          {/* Center spindle label colored by cultural bucket */}
          <div
            className={`rounded-full bg-gradient-to-br ${labelColor} shadow-inner flex items-center justify-center text-white/90 border border-white/20 ${center}`}
          >
            <div className="w-1 h-1 rounded-full bg-slate-950" />
          </div>

          {/* Discreet music note hint on medium/large sizes */}
          {size !== 'xs' && size !== 'sm' && (
            <div className="absolute bottom-1 right-1 opacity-20 text-slate-300">
              <Music2 size={icon * 0.6} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
