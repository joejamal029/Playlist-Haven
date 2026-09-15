import React, { useState, useEffect } from 'react';
import {
  X, ExternalLink, Play, Disc3, Check, Scissors, ShoppingCart,
  Sparkles, Calendar, Globe, MapPin, Tag, User, Music2, FileText,
  Radio, Layers, Loader2, CheckCircle2, Copy
} from 'lucide-react';
import { TriageTrack, getTrackEraBadge, translateSingleTrackWithAI, getCachedTranslations, TrackTranslationResult } from '../services/triageEngine';
import { CANONICAL_BUCKETS } from '../services/classificationEngine';
import SongCoverArt from './SongCoverArt';
import AudioPreviewButton from './AudioPreviewButton';

interface SongMetadataInspectorModalProps {
  isOpen: boolean;
  track: TriageTrack | null;
  onClose: () => void;
  onValidateSingle?: (track: TriageTrack) => void;
  onPromoteArtist?: (artistName: string) => void;
  onStageBasket?: (trackId: string) => void;
  onDeferTrack?: (track: TriageTrack) => void;
  isStaged?: boolean;
  isSingleRetained?: boolean;
  isArtistPromoted?: boolean;
  onTranslated?: (res: TrackTranslationResult) => void;
}

export default function SongMetadataInspectorModal({
  isOpen,
  track,
  onClose,
  onValidateSingle,
  onPromoteArtist,
  onStageBasket,
  onDeferTrack,
  isStaged = false,
  isSingleRetained = false,
  isArtistPromoted = false,
  onTranslated,
}: SongMetadataInspectorModalProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState<TrackTranslationResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!track) {
      setTranslation(null);
      return;
    }
    const normKey = `${track.artist.trim().toLowerCase()}:::${track.title.trim().toLowerCase()}`;
    const cache = getCachedTranslations();
    if (cache[normKey]) {
      setTranslation(cache[normKey]);
    } else if (track.translatedTitle || track.translatedArtist || track.culturalContext) {
      setTranslation({
        trackKey: normKey,
        originalArtist: track.artist,
        originalTitle: track.title,
        romanizedArtist: track.translatedArtist,
        romanizedTitle: track.translatedTitle,
        translatedTitle: track.translatedTitle,
        culturalContext: track.culturalContext,
        timestamp: Date.now(),
      });
    } else {
      setTranslation(null);
    }
  }, [track]);

  if (!isOpen || !track) return null;

  const enriched = track.enrichedRecord;
  const releaseYear = track.originalReleaseYear || track.releaseYear || (enriched?.release?.originalReleaseYear) || (enriched?.release?.releaseDate ? parseInt(enriched.release.releaseDate.slice(0, 4), 10) : undefined);
  const eraBadge = getTrackEraBadge(releaseYear);
  const bucketMeta = CANONICAL_BUCKETS[track.culturalBucket];

  // Extract external links if available
  const externalLinks = enriched?.artist?.externalLinks || {};
  const spotifyUrl = externalLinks.spotifyUrl || (track.spotifyId ? `https://open.spotify.com/track/${track.spotifyId}` : undefined);
  const mbRecordingUrl = enriched?.recordingMbid ? `https://musicbrainz.org/recording/${enriched.recordingMbid}` : undefined;
  const wikidataUrl = externalLinks.wikidataUrl;
  const discogsUrl = externalLinks.discogsUrl;

  const handleTranslate = async () => {
    setIsTranslating(true);
    try {
      const res = await translateSingleTrackWithAI(track.artist, track.title, track.culturalBucket);
      setTranslation(res);
      onTranslated?.(res);
    } catch (err: any) {
      alert(`AI Translation failed: ${err.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Music2 size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-100 uppercase tracking-wide">
                Song Deep Metadata Dossier
              </h3>
              <p className="text-[11px] text-slate-400">
                Inherited from Module 15 Deep Metadata Engine & MusicBrainz
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <AudioPreviewButton
              track={{
                id: track.id,
                artist: track.artist,
                title: track.title,
                album: track.album,
                coverArtUrl: track.coverArtUrl || track.coverArtThumbUrl || enriched?.release?.coverArtFullUrl || enriched?.release?.coverArtThumbUrl,
                previewUrl: enriched?.artist?.externalLinks?.audioPreviewUrl,
              }}
              variant="pill"
            />

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300 custom-scrollbar">
          {/* Hero Row: Cover Art & Core Title / Artist */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <SongCoverArt
              src={track.coverArtUrl || track.coverArtThumbUrl || enriched?.release?.coverArtFullUrl || enriched?.release?.coverArtThumbUrl}
              title={track.title}
              artist={track.artist}
              culturalBucket={track.culturalBucket}
              size="xl"
              className="shadow-xl ring-2 ring-slate-800"
            />

            <div className="min-w-0 flex-1 space-y-1.5">
              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${bucketMeta?.badgeBg || 'bg-slate-800 text-slate-300'}`}>
                  {track.culturalBucket}
                </span>

                {eraBadge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border font-mono ${eraBadge.color}`}>
                    {eraBadge.label}
                  </span>
                )}

                {enriched?.release?.releaseType && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    {enriched.release.releaseType}
                  </span>
                )}

                {track.duration && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-slate-400 bg-slate-800/60 border border-slate-800">
                    {track.duration}
                  </span>
                )}
              </div>

              {/* Title with Translated Title right beside it */}
              <div className="pt-0.5">
                <div className="text-base sm:text-lg font-black text-slate-100 leading-snug break-words">
                  <span>{track.title}</span>
                  {translation?.translatedTitle && translation.translatedTitle.toLowerCase() !== track.title.toLowerCase() && (
                    <span className="ml-2 text-sm font-bold text-amber-300">
                      ({translation.translatedTitle})
                    </span>
                  )}
                </div>

                {/* Artist with Romanized / English alias right beside it */}
                <div className="text-xs sm:text-sm font-bold text-slate-300 mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-cyan-300">{track.artist}</span>
                  {(translation?.romanizedArtist || enriched?.artist?.aliases?.[0]?.name) && (
                    <span className="text-slate-400 font-normal">
                      ({translation?.romanizedArtist || enriched?.artist?.aliases?.[0]?.name})
                    </span>
                  )}
                </div>

                {/* Album */}
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  Album: <span className="text-slate-200">{enriched?.release?.albumTitle || track.album || 'Single Release'}</span>
                </p>
              </div>
            </div>
          </div>

          {/* AI Translation & Cultural Essence Box */}
          <div className="bg-gradient-to-br from-indigo-950/30 via-slate-900 to-indigo-950/20 border border-indigo-500/30 rounded-2xl p-4 space-y-2.5 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-indigo-300 flex items-center space-x-1.5">
                <Sparkles size={14} className="text-amber-400" />
                <span>AI Translation & Cultural Vibe Context</span>
              </span>

              <button
                onClick={handleTranslate}
                disabled={isTranslating}
                className="bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center space-x-1 disabled:opacity-50"
              >
                {isTranslating ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Translating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    <span>{translation ? 'Refresh AI Translation' : '✨ Translate with AI'}</span>
                  </>
                )}
              </button>
            </div>

            {translation ? (
              <div className="space-y-1.5 text-[11px] leading-relaxed">
                {translation.culturalContext ? (
                  <p className="text-slate-300 italic bg-slate-950/40 p-2.5 rounded-xl border border-indigo-950">
                    "{translation.culturalContext}"
                  </p>
                ) : (
                  <p className="text-slate-400">Translation indexed and linked to song metadata.</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                  {translation.romanizedTitle && (
                    <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block">Romanized Title:</span>
                      <span className="text-amber-200 font-bold">{translation.romanizedTitle}</span>
                    </div>
                  )}
                  {translation.romanizedArtist && (
                    <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block">Romanized / English Artist:</span>
                      <span className="text-cyan-200 font-bold">{translation.romanizedArtist}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                For foreign language titles or non-English artists, click the translate button above to generate instant Romanized titles, English translations, and cultural context.
              </p>
            )}
          </div>

          {/* Deep Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Release Context */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center space-x-1">
                <Calendar size={12} className="text-amber-400" />
                <span>Release Context</span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Release Year:</span>
                  <span className="font-bold text-slate-200">{releaseYear || 'Uncataloged'}</span>
                </div>
                {enriched?.release?.releaseDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Release Date:</span>
                    <span className="font-mono text-slate-200">{enriched.release.releaseDate}</span>
                  </div>
                )}
                {enriched?.release?.labels && enriched.release.labels.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Record Label:</span>
                    <span className="text-slate-200 truncate max-w-[140px]">{enriched.release.labels.map((l: any) => l.name).join(', ')}</span>
                  </div>
                )}
                {enriched?.release?.mediaFormat && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Media Format:</span>
                    <span className="text-slate-200">{enriched.release.mediaFormat}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cultural & Geographic Provenance */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center space-x-1">
                <Globe size={12} className="text-cyan-400" />
                <span>Cultural Provenance</span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tradition:</span>
                  <span className="font-bold text-cyan-300">{track.culturalBucket}</span>
                </div>
                {(enriched?.artist?.countryName || track.countryName || track.country) && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Country:</span>
                    <span className="text-slate-200">{enriched?.artist?.countryName || track.countryName || track.country}</span>
                  </div>
                )}
                {enriched?.artist?.beginArea && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Formation Area:</span>
                    <span className="text-slate-200 truncate max-w-[140px]">{enriched.artist.beginArea}</span>
                  </div>
                )}
                {enriched?.work?.lyricsLanguages && enriched.work.lyricsLanguages.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Lyrics Language:</span>
                    <span className="font-mono text-slate-200 uppercase">{enriched.work.lyricsLanguages.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Songwriting Credits (if available) */}
          {enriched?.work && (enriched.work.composers?.length > 0 || enriched.work.lyricists?.length > 0) && (
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center space-x-1">
                <User size={12} className="text-emerald-400" />
                <span>Songwriting & Production Credits</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {enriched.work.composers?.length > 0 && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Composers:</span>
                    <span className="text-slate-200">{enriched.work.composers.map((c: any) => c.name).join(', ')}</span>
                  </div>
                )}
                {enriched.work.lyricists?.length > 0 && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Lyricists:</span>
                    <span className="text-slate-200">{enriched.work.lyricists.map((l: any) => l.name).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Genres & Community Tags */}
          {(track.genres?.length || enriched?.genres?.length || track.tags?.length || enriched?.tags?.length) ? (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center space-x-1">
                <Tag size={12} className="text-amber-400" />
                <span>Genres & Sonic Tags</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(track.genres || enriched?.genres || []).map((g: string, i: number) => (
                  <span key={`g-${i}`} className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-lg text-[10px] font-medium">
                    {g}
                  </span>
                ))}
                {(track.tags || enriched?.tags?.map((t: any) => t.name) || []).slice(0, 6).map((tag: string, i: number) => (
                  <span key={`t-${i}`} className="bg-slate-950 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-lg text-[10px]">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* External Verification Links */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-slate-400 mr-1">External:</span>

            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist} ${track.title}`)}`}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center space-x-1 transition-colors"
            >
              <span>YouTube</span>
              <ExternalLink size={10} />
            </a>

            {spotifyUrl && (
              <a
                href={spotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/40 text-[11px] font-bold flex items-center space-x-1 transition-colors"
              >
                <span>Spotify</span>
                <ExternalLink size={10} />
              </a>
            )}

            {mbRecordingUrl && (
              <a
                href={mbRecordingUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/40 text-[11px] font-bold flex items-center space-x-1 transition-colors"
              >
                <span>MusicBrainz</span>
                <ExternalLink size={10} />
              </a>
            )}

            {discogsUrl && (
              <a
                href={discogsUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center space-x-1 transition-colors"
              >
                <span>Discogs</span>
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>

        {/* Modal Triage Actions Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            {onStageBasket && (
              <button
                onClick={() => onStageBasket(track.id)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center space-x-1.5 ${
                  isStaged
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 border border-slate-700'
                }`}
              >
                <ShoppingCart size={13} />
                <span>{isStaged ? 'Staged in Basket 🛒' : '+ Immersion Basket'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onDeferTrack && (
              <button
                onClick={() => {
                  onDeferTrack(track);
                  onClose();
                }}
                className="bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                title="Defer track from discovery triage"
              >
                <Scissors size={12} />
                <span>Defer</span>
              </button>
            )}

            {onPromoteArtist && (
              <button
                onClick={() => {
                  onPromoteArtist(track.artist);
                  onClose();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  isArtistPromoted
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40'
                }`}
              >
                <Disc3 size={13} />
                <span>Promote Artist</span>
              </button>
            )}

            {onValidateSingle && (
              <button
                onClick={() => {
                  onValidateSingle(track);
                  onClose();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center space-x-1 ${
                  isSingleRetained
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                }`}
              >
                <Check size={13} />
                <span>Retain Single Probe</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
