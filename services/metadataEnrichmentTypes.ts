import { CanonicalBucket } from './classificationEngine';

export type EnrichmentStatus = 
  | 'pending'
  | 'cached'
  | 'enriched'
  | 'needs_resolution'
  | 'manual_resolved'
  | 'ai_search_resolved'
  | 'itunes_enriched'
  | 'ai_synthesized_fallback';

export type EnrichmentSource = 
  | 'musicbrainz'
  | 'itunes'
  | 'cache'
  | 'ai_synthesized_fallback'
  | 'manual';

export interface ExternalLinks {
  wikidataId?: string;
  wikidataUrl?: string;
  wikipediaUrl?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  itunesArtistUrl?: string;
  audioPreviewUrl?: string;
  discogsUrl?: string;
  allmusicUrl?: string;
  officialWebsite?: string;
  youtubeUrl?: string;
  tidalUrl?: string;
  [key: string]: string | undefined;
}

export interface ArtistBioData {
  artistMbid: string;
  name: string;
  sortName: string;
  type: string; // Person, Group, Orchestra, Choir, Character, Other
  gender?: string;
  birthDate?: string; // Begin date
  deathDate?: string; // End date
  isActive: boolean;
  countryCode?: string; // ISO 3166-1 alpha-2 (e.g. TH, JP, NG, NL, BR)
  countryName?: string;
  primaryArea?: string; // City or Region (e.g. Bangkok, Lagos, Amsterdam)
  beginArea?: string; // Birthplace / founding city
  endArea?: string;
  aliases: { name: string; locale?: string; type?: string; primary?: boolean }[];
  bandMembers: { name: string; mbid?: string; role?: string; isActive?: boolean }[];
  creditedArtists: { name: string; mbid?: string; joinphrase?: string }[];
  externalLinks: ExternalLinks;
}

export interface WorkCreditData {
  workMbid?: string;
  workTitle?: string;
  iswc?: string;
  workType?: string;
  lyricsLanguages: string[]; // ISO 639-3 codes (e.g. tha, vie, nld, por, eng, jpn)
  composers: { name: string; mbid?: string }[];
  lyricists: { name: string; mbid?: string }[];
  arrangers: { name: string; mbid?: string }[];
  producers: { name: string; mbid?: string }[];
  engineers: { name: string; mbid?: string; role?: string }[];
  relationships: { type: string; target: string }[];
}

export interface ReleaseContextData {
  releaseMbid?: string;
  releaseGroupMbid?: string;
  albumTitle: string;
  disambiguation?: string;
  releaseDate?: string; // YYYY-MM-DD
  originalReleaseDate?: string; // Earliest recorded release in history
  originalReleaseYear?: number;
  releaseType: string; // Album, Single, EP, Compilation, Soundtrack, Live, Remix
  releaseStatus: string; // Official, Promotion, Bootleg
  packaging?: string;
  labels: { name: string; catalogNumber?: string }[];
  barcode?: string;
  mediaFormat?: string; // CD, 12" Vinyl, Digital Media, Cassette
  trackPosition?: number;
  trackCount?: number;
  discNumber?: number;
  releaseLanguage?: string;
  releaseScript?: string;
  coverArtThumbUrl?: string;
  coverArtFullUrl?: string;
}

export interface EnrichmentResolution {
  status: EnrichmentStatus;
  source: EnrichmentSource;
  isAiSynthesized: boolean; // True ONLY if it's a last-resort AI fallback
  badgeLabel: string;
  failureReason?: 'NO_MATCH' | 'LOW_CONFIDENCE' | 'DIRTY_TAGS' | 'NETWORK_ERROR';
  matchScore: number; // 0 - 100
  searchQueryUsed?: string;
  cleanTerms?: { artist: string; title: string; album?: string };
  timestamp: number;
}

export interface EnrichedSongRecord {
  id: string; // Normalized key: artist:::title
  queryArtist: string;
  queryTitle: string;
  queryAlbum?: string;
  queryPath?: string;
  recordingMbid: string;
  title: string;
  disambiguation?: string;
  durationMs?: number;
  durationFormatted?: string;
  isrcs: string[];
  acoustids: string[];
  rating?: number;
  ratingVotes?: number;
  isVideo: boolean;
  annotation?: string;
  artist: ArtistBioData;
  work: WorkCreditData;
  release: ReleaseContextData;
  genres: string[];
  tags: { name: string; count: number }[];
  culturalBucket: CanonicalBucket;
  resolution: EnrichmentResolution;
  rawMusicBrainzData?: any;
  createdAt: number;
  updatedAt: number;
}

export interface CandidateMatch {
  recordingMbid: string;
  title: string;
  artist: string;
  artistMbid?: string;
  album: string;
  releaseMbid?: string;
  releaseDate?: string;
  country?: string;
  duration?: string;
  durationMs?: number;
  score: number;
  isrc?: string;
  disambiguation?: string;
}

export interface EnrichmentStats {
  totalProcessed: number;
  cacheHits: number;
  mbEnriched: number;
  itunesEnriched?: number;
  needsResolution: number;
  aiSynthesized: number;
  manualResolved: number;
}

export interface EnrichmentOptions {
  forceUpdate?: boolean; // If true, ignore cache and re-query MusicBrainz
  signal?: AbortSignal;
  onProgress?: (progress: {
    processed: number;
    total: number;
    currentTrack?: string;
    currentStatus?: string;
    stats: EnrichmentStats;
  }) => void;
  onTrackEnriched?: (record: EnrichedSongRecord) => void;
}

/**
 * Dense 38-column CSV Export Header Specification
 */
export const ENRICHED_CSV_COLUMNS = [
  { key: 'TITLE', label: 'Title', get: (r: EnrichedSongRecord) => r.title || r.queryTitle },
  { key: 'ARTIST', label: 'Artist', get: (r: EnrichedSongRecord) => r.artist?.name || r.queryArtist },
  { key: 'ALBUM', label: 'Album', get: (r: EnrichedSongRecord) => r.release?.albumTitle || '' },
  { key: 'ORIGINAL_YEAR', label: 'Original Release Year', get: (r: EnrichedSongRecord) => r.release?.originalReleaseYear || '' },
  { key: 'RELEASE_DATE', label: 'Release Date', get: (r: EnrichedSongRecord) => r.release?.releaseDate || '' },
  { key: 'CULTURAL_BUCKET', label: 'Cultural / Language Bucket', get: (r: EnrichedSongRecord) => r.culturalBucket },
  { key: 'COUNTRY_CODE', label: 'Country Code', get: (r: EnrichedSongRecord) => r.artist?.countryCode || '' },
  { key: 'COUNTRY_NAME', label: 'Country Name', get: (r: EnrichedSongRecord) => r.artist?.countryName || '' },
  { key: 'BIRTHPLACE_BEGIN_AREA', label: 'Begin Area (Birth City / Formation)', get: (r: EnrichedSongRecord) => r.artist?.beginArea || '' },
  { key: 'PRIMARY_AREA', label: 'Primary Area', get: (r: EnrichedSongRecord) => r.artist?.primaryArea || '' },
  { key: 'GENRES', label: 'Genres', get: (r: EnrichedSongRecord) => (r.genres || []).join(', ') },
  { key: 'COMMUNITY_TAGS', label: 'Tags', get: (r: EnrichedSongRecord) => (r.tags || []).map(t => t.name).slice(0, 5).join(', ') },
  { key: 'DURATION', label: 'Duration', get: (r: EnrichedSongRecord) => r.durationFormatted || '' },
  { key: 'ISRC', label: 'ISRC', get: (r: EnrichedSongRecord) => (r.isrcs || []).join('; ') },
  { key: 'COMPOSERS', label: 'Composers', get: (r: EnrichedSongRecord) => (r.work?.composers || []).map(c => c.name).join(', ') },
  { key: 'LYRICISTS', label: 'Lyricists', get: (r: EnrichedSongRecord) => (r.work?.lyricists || []).map(l => l.name).join(', ') },
  { key: 'PRODUCERS', label: 'Producers', get: (r: EnrichedSongRecord) => (r.work?.producers || []).map(p => p.name).join(', ') },
  { key: 'LYRICS_LANGUAGES', label: 'Lyrics Languages (ISO 639-3)', get: (r: EnrichedSongRecord) => (r.work?.lyricsLanguages || []).join(', ') },
  { key: 'RECORD_LABELS', label: 'Record Labels', get: (r: EnrichedSongRecord) => (r.release?.labels || []).map(l => l.name).join(', ') },
  { key: 'CATALOG_NUMBERS', label: 'Catalog Numbers', get: (r: EnrichedSongRecord) => (r.release?.labels || []).map(l => l.catalogNumber).filter(Boolean).join(', ') },
  { key: 'BARCODE_UPC', label: 'Barcode / UPC', get: (r: EnrichedSongRecord) => r.release?.barcode || '' },
  { key: 'MEDIA_FORMAT', label: 'Media Format', get: (r: EnrichedSongRecord) => r.release?.mediaFormat || '' },
  { key: 'RELEASE_TYPE', label: 'Release Type', get: (r: EnrichedSongRecord) => r.release?.releaseType || '' },
  { key: 'TRACK_POSITION', label: 'Track Position', get: (r: EnrichedSongRecord) => r.release?.trackPosition ? `${r.release.trackPosition}/${r.release.trackCount || ''}` : '' },
  { key: 'ARTIST_GENDER', label: 'Artist Gender', get: (r: EnrichedSongRecord) => r.artist?.gender || '' },
  { key: 'ARTIST_TYPE', label: 'Artist Type', get: (r: EnrichedSongRecord) => r.artist?.type || '' },
  { key: 'ARTIST_ACTIVE_YEARS', label: 'Artist Active Years', get: (r: EnrichedSongRecord) => `${r.artist?.birthDate || ''} - ${r.artist?.deathDate || (r.artist?.isActive ? 'Present' : '')}` },
  { key: 'NATIVE_ALIASES', label: 'Native Script Aliases', get: (r: EnrichedSongRecord) => (r.artist?.aliases || []).map(a => a.name).slice(0, 4).join(', ') },
  { key: 'BAND_MEMBERS', label: 'Band Members', get: (r: EnrichedSongRecord) => (r.artist?.bandMembers || []).map(m => m.name).join(', ') },
  { key: 'WIKIDATA_ID', label: 'Wikidata ID', get: (r: EnrichedSongRecord) => r.artist?.externalLinks?.wikidataId || '' },
  { key: 'SPOTIFY_URL', label: 'Spotify URL', get: (r: EnrichedSongRecord) => r.artist?.externalLinks?.spotifyUrl || '' },
  { key: 'DISCOGS_URL', label: 'Discogs URL', get: (r: EnrichedSongRecord) => r.artist?.externalLinks?.discogsUrl || '' },
  { key: 'COVER_ART_URL', label: 'Cover Art URL', get: (r: EnrichedSongRecord) => r.release?.coverArtThumbUrl || '' },
  { key: 'RECORDING_MBID', label: 'Recording MBID', get: (r: EnrichedSongRecord) => r.recordingMbid || '' },
  { key: 'ARTIST_MBID', label: 'Artist MBID', get: (r: EnrichedSongRecord) => r.artist?.artistMbid || '' },
  { key: 'RELEASE_MBID', label: 'Release MBID', get: (r: EnrichedSongRecord) => r.release?.releaseMbid || '' },
  { key: 'ENRICHMENT_SOURCE', label: 'Enrichment Source', get: (r: EnrichedSongRecord) => r.resolution?.source || '' },
  { key: 'STATUS_BADGE', label: 'Status Badge', get: (r: EnrichedSongRecord) => r.resolution?.badgeLabel || '' },
  { key: 'IS_AI_SYNTHESIZED', label: 'Is AI Synthesized (Fallback)', get: (r: EnrichedSongRecord) => r.resolution?.isAiSynthesized ? 'TRUE' : 'FALSE' },
  { key: 'MATCH_SCORE', label: 'Match Score (%)', get: (r: EnrichedSongRecord) => r.resolution?.matchScore ?? '' },
  { key: 'LOCAL_FILE_PATH', label: 'Original File Path', get: (r: EnrichedSongRecord) => r.queryPath || '' },
];
