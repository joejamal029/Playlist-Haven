/**
 * Spotify Intake & Bridge Engine (Module 19)
 * 
 * Provides extraction of Spotify playlists directly from public/shared URLs or
 * HTML embed source, completely bypassing developer API keys, Spotify Premium paywalls,
 * third-party intermediaries (TuneMyMusic / Soundiiz), and backend Python daemons.
 * 
 * Architecture:
 * - 100% Client-Side Pure TypeScript & Web Standards (Web Crypto SubtleCrypto HMAC-SHA1).
 * - Multi-batch Pathfinder GraphQL pagination (extracts ALL 300+ tracks via offset=0, offset=300).
 * - Multi-tier fallback:
 *     1. Full Pathfinder Pagination (all 389 tracks with complete metadata)
 *     2. Web Embed Proxy (first 100 tracks if Pathfinder is unavailable)
 *     3. Air-Gapped HTML source paste (100% offline air-gapped workstations)
 * - Universal format exporters:
 *     - UTF-8 BOM CSV (Artist, Track Name, Album, Duration, Spotify URI)
 *     - Standard #EXTM3U playlist with duration and #EXTINF metadata
 *     - TSV (Tab-Separated Values) for spreadsheet paste
 *     - Spotify URI list (spotify:track:...) for 1-click desktop Spotify import
 * - Downstream bridge payloads to Discovery Triage (Module 14) and Consensus Aggregator (Module 17).
 */

import { cleanCompositeTrack } from './playlistSanitizer';

export interface SpotifyTrack {
  id: string;             // Spotify track ID or hash
  uri: string;            // spotify:track:...
  title: string;          // Clean track title
  artist: string;         // Clean artist name(s)
  album: string;          // Album or playlist collection name
  durationMs: number;     // Duration in milliseconds
  durationFormatted: string; // MM:SS or HH:MM:SS
  isExplicit: boolean;
  coverArtUrl?: string;   // Album art if available
  previewUrl?: string;    // Spotify mp3-preview if available
  originalSubtitle?: string; // Raw artist subtitle from Spotify
}

export interface SpotifyPlaylistMetadata {
  id: string;
  name: string;
  subtitle?: string;
  coverArtUrl?: string;
  totalTracks: number;
  totalCount?: number;
  extractedTracks: SpotifyTrack[];
  sourceUrl: string;
  extractedAt: string;
}

/**
 * Format milliseconds into MM:SS format
 */
export function formatMs(ms: number): string {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Extract Spotify Playlist ID from any user-provided URL or URI
 */
export function extractSpotifyPlaylistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Pattern 1: spotify:playlist:ID
  const uriMatch = trimmed.match(/spotify:playlist:([a-zA-Z0-9]{15,30})/);
  if (uriMatch) return uriMatch[1];

  // Pattern 2: https://open.spotify.com/(embed/)?playlist/ID
  const urlMatch = trimmed.match(/open\.spotify\.com\/(?:embed\/)?playlist\/([a-zA-Z0-9]{15,30})/);
  if (urlMatch) return urlMatch[1];

  // Pattern 3: Raw base62 ID (typically 22 chars)
  const rawMatch = trimmed.match(/^[a-zA-Z0-9]{20,25}$/);
  if (rawMatch) return rawMatch[0];

  return null;
}

// -------------------------------------------------------------
// PURE CLIENT-SIDE SPOTIFY PATHFINDER SESSION GENERATOR
// -------------------------------------------------------------

const SPOTIFY_CLIENT_VERSION = '1.2.87.27.ga2033a72';
const PLAYLIST_QUERY_HASH = 'bb67e0af06e8d6f52b531f97468ee4acd44cd0f82b988e15c2ea47b1148efc77';
const TOTP_SECRETS_URL = 'https://git.gay/thereallo/totp-secrets/raw/branch/main/secrets/secretDict.json';

const DEFAULT_TOTP_SECRETS: Record<string, number[]> = {
  "59": [123,105,79,70,110,59,52,125,60,49,80,70,89,75,80,86,63,53,123,37,117,49,52,93,77,62,47,86,48,104,68,72],
  "60": [79,109,69,123,90,65,46,74,94,34,58,48,70,71,92,85,122,63,91,64,87,87],
  "61": [44,55,47,42,70,40,34,114,76,74,50,111,120,97,75,76,94,102,43,69,49,120,118,80,64,78],
};

/**
 * Derives the HMAC key bytes from the encrypted ciphertext
 */
function deriveSecret(ciphertext: number[]): Uint8Array {
  let asciiStr = '';
  for (let i = 0; i < ciphertext.length; i++) {
    asciiStr += (ciphertext[i] ^ ((i % 33) + 9)).toString();
  }
  return new TextEncoder().encode(asciiStr);
}

/**
 * Computes RFC 6238 TOTP using browser Web Crypto API (SubtleCrypto HMAC-SHA1)
 */
async function generateWebCryptoTotp(secretBytes: Uint8Array, timestampMs: number): Promise<string> {
  const TOTP_PERIOD = 30;
  const counter = Math.floor(Math.floor(timestampMs / 1000) / TOTP_PERIOD);
  
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setBigInt64(0, BigInt(counter), false); // Big-Endian 64-bit int

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, counterBuf);
  const hmac = new Uint8Array(sig);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 1000000).toString().padStart(6, '0');
}

interface WebSessionTokens {
  accessToken: string;
  clientToken: string;
}

/**
 * Generates an anonymous Web Player session directly from Spotify endpoints
 */
async function getAnonymousWebPlayerSession(): Promise<WebSessionTokens> {
  // 1. Fetch current TOTP secrets dictionary or use embedded fallback
  let secrets: Record<string, number[]> = DEFAULT_TOTP_SECRETS;
  try {
    const secretsResp = await fetch(TOTP_SECRETS_URL, { signal: AbortSignal.timeout(2500) });
    if (secretsResp.ok) {
      const remote = await secretsResp.json();
      if (remote && Object.keys(remote).length > 0) {
        secrets = remote;
      }
    }
  } catch (_corsOrNetworkErr) {
    // Graceful fallback to verified embedded secrets
    secrets = DEFAULT_TOTP_SECRETS;
  }

  const version = Object.keys(secrets).map(Number).sort((a, b) => b - a)[0].toString();
  const secretBytes = deriveSecret(secrets[version] || DEFAULT_TOTP_SECRETS["61"]);

  // 2. Fetch official Spotify server time
  const timeResp = await fetch('/api/spotify-servertime');
  if (!timeResp.ok) {
    throw new Error('Failed to synchronize with Spotify server time.');
  }
  const timeJson = await timeResp.json();
  const serverTimeMs = (timeJson.serverTime || Math.floor(Date.now() / 1000)) * 1000;

  // 3. Compute 6-digit TOTP
  const totp = await generateWebCryptoTotp(secretBytes, serverTimeMs);

  // 4. Request anonymous session accessToken
  const tokenUrl = `/api/spotify-token?reason=init&productType=web-player&totp=${totp}&totpServer=${totp}&totpVer=${version}`;
  const tokenResp = await fetch(tokenUrl);
  if (!tokenResp.ok) {
    throw new Error(`Spotify rejected session initialization (HTTP ${tokenResp.status}).`);
  }
  const tokenJson = await tokenResp.json();
  const accessToken = tokenJson.accessToken;
  const clientId = tokenJson.clientId;

  if (!accessToken || !clientId) {
    throw new Error('No access token returned from Spotify session endpoint.');
  }

  // 5. Request client-token
  const clientTokenResp = await fetch('/api/spotify-clienttoken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_data: {
        client_version: SPOTIFY_CLIENT_VERSION,
        client_id: clientId,
        js_sdk_data: {},
      },
    }),
  });

  if (!clientTokenResp.ok) {
    throw new Error(`Failed to retrieve Spotify client token (HTTP ${clientTokenResp.status}).`);
  }
  const clientTokenJson = await clientTokenResp.json();
  const clientToken = clientTokenJson?.granted_token?.token;

  if (!clientToken) {
    throw new Error('No granted token returned in Spotify client token response.');
  }

  return { accessToken, clientToken };
}

/**
 * Fetches all playlist tracks using Spotify's Pathfinder GraphQL pagination
 * Retrieves batches of 300 until the entire playlist (e.g. all 389 tracks) is ingested.
 */
export async function fetchFullPlaylistPathfinder(
  playlistId: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<SpotifyPlaylistMetadata> {
  const session = await getAnonymousWebPlayerSession();

  let offset = 0;
  const limit = 300;
  const allTracks: SpotifyTrack[] = [];
  let playlistName = 'Spotify Playlist';
  let coverArtUrl = '';
  let totalCount = 0;

  while (true) {
    const pfResp = await fetch('/api/spotify-pathfinder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
        'client-token': session.clientToken,
        'app-platform': 'WebPlayer',
        'spotify-app-version': SPOTIFY_CLIENT_VERSION,
      },
      body: JSON.stringify({
        variables: {
          uri: `spotify:playlist:${playlistId}`,
          offset,
          limit,
          enableWatchFeedEntrypoint: true,
        },
        operationName: 'fetchPlaylist',
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: PLAYLIST_QUERY_HASH,
          },
        },
      }),
    });

    if (!pfResp.ok) {
      throw new Error(`Spotify Pathfinder query failed (HTTP ${pfResp.status}).`);
    }

    const pfJson = await pfResp.json();
    const data = pfJson?.data;
    const playlistV2 = data?.playlistV2;
    const content = playlistV2?.content;

    if (!content) {
      throw new Error('Invalid playlist structure received from Spotify Pathfinder.');
    }

    if (offset === 0) {
      playlistName = playlistV2.name || 'Spotify Playlist';
      totalCount = content.totalCount || 0;
      const images = playlistV2.images?.items || [];
      if (images.length > 0 && images[0]?.sources?.length > 0) {
        coverArtUrl = images[0].sources[0].url || '';
      }
    }

    const items: any[] = content.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      const trackData = item?.itemV2?.data;
      if (!trackData || trackData.__typename !== 'Track') continue;

      const trackName = trackData.name || '';
      const durationMs = trackData.trackDuration?.totalMilliseconds || 0;
      const trackUri = trackData.uri || '';
      const isExplicit = trackData.contentRating?.label === 'EXPLICIT';

      // Artists
      const artistItems = trackData.artists?.items || [];
      const artistNames = artistItems
        .map((a: any) => a?.profile?.name)
        .filter(Boolean);
      const artistStr = artistNames.length > 0 ? artistNames.join(', ') : 'Unknown Artist';

      // Album
      const albumData = trackData.albumOfTrack || {};
      const albumName = albumData.name || playlistName;
      let albumArt = '';
      const albumSources = albumData.coverArt?.sources || [];
      if (albumSources.length > 0) {
        albumArt = albumSources[0].url || '';
      }

      // ID
      const trackId = trackUri.replace('spotify:track:', '') || `track-${allTracks.length}`;

      const cleaned = cleanCompositeTrack(trackName, artistStr);

      allTracks.push({
        id: trackId,
        uri: trackUri,
        title: cleaned.title,
        artist: cleaned.artist || artistStr,
        album: albumName,
        durationMs,
        durationFormatted: formatMs(durationMs),
        isExplicit,
        coverArtUrl: albumArt || coverArtUrl,
        originalSubtitle: artistStr,
      });
    }

    offset += items.length;
    if (onProgress) {
      onProgress(allTracks.length, totalCount || allTracks.length);
    }

    if (totalCount && offset >= totalCount) break;
    if (items.length < limit) break;
  }

  return {
    id: playlistId,
    name: playlistName,
    subtitle: `${allTracks.length} tracks • Complete discography intake`,
    coverArtUrl,
    totalTracks: allTracks.length,
    totalCount: totalCount || allTracks.length,
    extractedTracks: allTracks,
    sourceUrl: `https://open.spotify.com/playlist/${playlistId}`,
    extractedAt: new Date().toISOString(),
  };
}

// -------------------------------------------------------------
// EMBED HTML PARSER & MULTI-TIER FALLBACK
// -------------------------------------------------------------

/**
 * Parses raw HTML from Spotify Embed page to extract trackList and playlist metadata
 */
export function parseSpotifyEmbedHtml(html: string, fallbackUrl: string = ''): SpotifyPlaylistMetadata {
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!nextDataMatch) {
    throw new Error(
      'Could not find Spotify __NEXT_DATA__ payload in page HTML. Ensure this is a valid public Spotify playlist.'
    );
  }

  let jsonData: any;
  try {
    jsonData = JSON.parse(nextDataMatch[1]);
  } catch (err: any) {
    throw new Error(`Failed to parse Spotify JSON payload: ${err.message}`);
  }

  const entity = jsonData?.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    throw new Error('Spotify playlist data structure not found in JSON payload.');
  }

  const playlistName = entity.name || entity.title || 'Spotify Playlist';
  const playlistSubtitle = entity.subtitle || '';
  const playlistId = entity.id || '';
  const coverArtUrl = entity.coverArt?.sources?.[0]?.url || entity.visualIdentity?.image?.[0]?.url || '';
  const rawTrackList: any[] = entity.trackList || [];

  const extractedTracks: SpotifyTrack[] = rawTrackList.map((t, idx) => {
    const rawTitle = t.title || 'Unknown Title';
    const rawSubtitle = t.subtitle || '';
    const cleaned = cleanCompositeTrack(rawTitle, rawSubtitle);

    const trackUri = t.uri || `spotify:track:${t.uid || idx}`;
    const id = trackUri.replace('spotify:track:', '') || `track-${idx}`;
    const durationMs = typeof t.duration === 'number' ? t.duration : 0;
    const previewUrl = t.audioPreview?.url || undefined;

    return {
      id,
      uri: trackUri,
      title: cleaned.title,
      artist: cleaned.artist || rawSubtitle || 'Unknown Artist',
      album: playlistName,
      durationMs,
      durationFormatted: formatMs(durationMs),
      isExplicit: !!t.isExplicit,
      coverArtUrl,
      previewUrl,
      originalSubtitle: rawSubtitle,
    };
  });

  return {
    id: playlistId,
    name: playlistName,
    subtitle: playlistSubtitle,
    coverArtUrl,
    totalTracks: extractedTracks.length,
    totalCount: extractedTracks.length,
    extractedTracks,
    sourceUrl: fallbackUrl,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Universal Spotify Playlist Ingestion Entrypoint
 * Tier 1: Pure Client-Side Pathfinder Pagination (Extracts ALL 389 tracks with zero daemons!)
 * Tier 2: Embed Proxy Fallback (first 100 tracks if Pathfinder is blocked)
 * Tier 3: CORS Gateways Fallback
 */
export async function fetchSpotifyPlaylistByUrl(
  urlOrId: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<SpotifyPlaylistMetadata> {
  const playlistId = extractSpotifyPlaylistId(urlOrId);
  if (!playlistId) {
    throw new Error('Invalid Spotify playlist URL or ID. Please check the link and try again.');
  }

  // Tier 1: Pure TypeScript Web-Standards Pathfinder (Pulls ALL 389 tracks!)
  try {
    const fullData = await fetchFullPlaylistPathfinder(playlistId, onProgress);
    if (fullData && fullData.totalTracks > 0) {
      return fullData;
    }
  } catch (err: any) {
    console.warn('Pathfinder full pagination failed, attempting embed fallback:', err.message);
  }

  // Tier 2: Embed Fallback (Extracts first 100 tracks)
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const candidates: { url: string; label: string; isJsonWrapper?: boolean }[] = [
    { url: `/api/spotify-embed/playlist/${playlistId}`, label: 'Local Dev Proxy' },
    { url: embedUrl, label: 'Direct Embed' },
    { url: `https://corsproxy.io/?${encodeURIComponent(embedUrl)}`, label: 'CORS Proxy IO' },
    {
      url: `https://api.allorigins.win/get?url=${encodeURIComponent(embedUrl)}`,
      label: 'AllOrigins Gateway',
      isJsonWrapper: true,
    },
  ];

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const resp = await fetch(candidate.url, {
        headers: {
          Accept: 'text/html,application/json,*/*',
        },
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }

      let html = '';
      if (candidate.isJsonWrapper) {
        const json = await resp.json();
        html = json.contents || '';
      } else {
        html = await resp.text();
      }

      if (html && html.includes('__NEXT_DATA__')) {
        return parseSpotifyEmbedHtml(html, embedUrl);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(
    `Failed to load Spotify playlist. ${
      lastError ? lastError.message : 'All network gateways failed.'
    } You can also paste the playlist page source directly into the Raw Source tab.`
  );
}

// -------------------------------------------------------------
// UNIVERSAL EXPORTERS (CSV, M3U, TSV, SPOTIFY URI)
// -------------------------------------------------------------

function escapeCsv(val: string | number): string {
  const s = String(val ?? '').replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r') ? `"${s}"` : s;
}

export function exportSpotifyTracksToCSV(tracks: SpotifyTrack[], playlistName: string = 'Spotify Playlist'): string {
  const header = ['Artist', 'Track Name', 'Album', 'Duration', 'Spotify URI', 'Cover Art URL'];
  const rows = tracks.map(t => [
    escapeCsv(t.artist),
    escapeCsv(t.title),
    escapeCsv(t.album || playlistName),
    escapeCsv(t.durationFormatted),
    escapeCsv(t.uri),
    escapeCsv(t.coverArtUrl || ''),
  ].join(','));

  return '\uFEFF' + [header.join(','), ...rows].join('\n');
}

export function exportSpotifyTracksToM3U(tracks: SpotifyTrack[]): string {
  const lines = ['#EXTM3U'];
  for (const t of tracks) {
    const seconds = t.durationMs > 0 ? Math.round(t.durationMs / 1000) : -1;
    lines.push(`#EXTINF:${seconds},${t.artist} - ${t.title}`);
    lines.push(`${t.artist} - ${t.title}.mp3`);
  }
  return lines.join('\n');
}

export function exportSpotifyTracksToTSV(tracks: SpotifyTrack[]): string {
  const header = ['#', 'Artist', 'Title', 'Album', 'Duration', 'Spotify URI', 'Cover Art URL'];
  const rows = tracks.map((t, idx) => [
    idx + 1,
    t.artist,
    t.title,
    t.album,
    t.durationFormatted,
    t.uri,
    t.coverArtUrl || '',
  ].join('\t'));

  return [header.join('\t'), ...rows].join('\n');
}

export function exportSpotifyTrackURIs(tracks: SpotifyTrack[]): string {
  return tracks.map(t => t.uri).filter(Boolean).join('\n');
}

export function exportSpotifyTracksToPlainText(tracks: SpotifyTrack[]): string {
  return tracks.map(t => `${t.artist} - ${t.title}`).join('\n');
}
