/**
 * Pre-query sanitizer: Cleans dirty tags, removes YouTube suffixes, track numbers, file extensions,
 * bare hyphen remasters, and trailing ellipses.
 */
export function sanitizeSongQuery(rawArtist: string, rawTitle: string, rawAlbum?: string) {
  let artist = (rawArtist || '').trim();
  let title = (rawTitle || '').trim();
  let album = (rawAlbum || '').trim();

  // If artist is unknown or empty, but title contains "Artist - Title"
  if ((!artist || artist.toLowerCase() === '<unknown>' || artist.toLowerCase() === 'unknown artist') && title.includes(' - ')) {
    const parts = title.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }

  // Strip file extensions (.mp3, .flac, .m4a, .wav, .aac, .ogg, .opus, .wma)
  title = title.replace(/\.(mp3|flac|m4a|wav|aac|ogg|opus|wma|alac|aiff)$/i, '').trim();

  // Strip common track number prefixes (e.g. "01. ", "01 - ", "1-01 ", "A1. ")
  title = title.replace(/^(?:\d{1,3}[.\-_\s]+|[a-d]\d{1,2}[.\-_\s]+)/i, '').trim();

  // Strip YouTube Topic artifacts
  artist = artist.replace(/\s*-\s*topic$/i, '').trim();

  // Strip trailing ellipses (e.g. "Take Me Home, Country Roads Instru...")
  title = title.replace(/\s*(?:\.{3}|…)\s*$/, '').trim();

  // Extract featured artists from title to avoid breaking MusicBrainz exact title matches
  // e.g. "Essence (feat. Tems)" -> Title: "Essence", Featured: "Tems"
  const featMatch = title.match(/\s*[\(\[](?:feat\.?|ft\.?|featuring)\s+([^\)\]]+)[\)\]]/i);
  let featuredArtist = '';
  if (featMatch) {
    featuredArtist = featMatch[1].trim();
    title = title.replace(featMatch[0], '').trim();
  }

  // Strip common bracketed noise tags
  const noisePatterns = [
    /\s*[\(\[](?:official\s+)?(?:music\s+)?(?:video|mv)[\)\]]/gi,
    /\s*[\(\[](?:official\s+)?(?:audio|visualizer)[\)\]]/gi,
    /\s*[\(\[](?:lyric\s+video|lyrics)[\)\]]/gi,
    /\s*[\(\[](?:hd|4k|1080p|720p|hq|uhd)[\)\]]/gi,
    /\s*[\(\[](?:remastered|remaster\s*\d*)[\)\]]/gi,
    /\s*[\(\[](?:explicit|clean)[\)\]]/gi,
    /\s*[\(\[](?:live[^\)\]]*)[\)\]]/gi,
    /\s*[\(\[](?:acoustic[^\)\]]*)[\)\]]/gi,
    /\s*[\(\[](?:performance[^\)\]]*)[\)\]]/gi,
    /\s*[\(\[](?:original\s+mix|radio\s+edit)[\)\]]/gi,
    /\s*[\(\[](?:deluxe\s+edition|deluxe\s+version)[\)\]]/gi,
    /\s*[\(\[](?:instrumental[^\)\]]*)[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\bremix\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\bbootleg\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\bflip\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\btheme\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[]from\s+[^\)\]]+[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\bcover\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\b(?:short|rap)\s+(?:version|ver)\b[^\)\]]*[\)\]]/gi,
    /\s*[\(\[][^\)\]]*\b(?:ost|soundtrack)\b[^\)\]]*[\)\]]/gi,
  ];

  for (const pattern of noisePatterns) {
    title = title.replace(pattern, '').trim();
  }

  // Strip bare hyphen remaster, remix, and edition suffixes (e.g. "Warm - Remix", "In The Air Tonight - 2015 Remastered")
  const bareHyphenPatterns = [
    /\s*-\s*(?:\d{4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{4})?$/i,
    /\s*-\s*deluxe\s+(?:edition|version)$/i,
    /\s*-\s*(?:remix|vip|instrumental|radio\s+edit|club\s+mix|extended\s+mix|single\s+version|acoustic|live)$/i,
    /\s*-\s*(?:original\s+mix|album\s+version)$/i,
    /\s*-\s*official\s+(?:music\s+)?(?:video|audio)$/i,
    /\s*-\s*survival\s+mode$/i, // e.g. "Verdansk - Survival Mode"
  ];

  for (const pattern of bareHyphenPatterns) {
    title = title.replace(pattern, '').trim();
  }

  // Strip bracketed CJK / mojibake translations: [アンコール], [窓], [走馬燈], [ã‚¢ãƒ³ã‚³ãƒ¼ãƒ«]
  title = title.replace(/\s*\[[^\[\]]*[^\x00-\x7F][^\[\]]*\]/g, '').trim();
  // Strip round-bracket content that is predominantly non-ASCII (CJK translations)
  title = title.replace(/\s*\([^()]*[^\x00-\x7F]{2,}[^()]*\)/g, '').trim();
  // Strip fullwidth brackets: 【...】『...』（...）
  title = title.replace(/\s*[【『][^】』]*[】』]/g, '').trim();
  title = title.replace(/\s*（[^）]*）/g, '').trim();
  // Strip trailing non-ASCII blocks appended directly to Latin titles (e.g. "Marigold マリーゴールド")
  // Only if title starts with ASCII and has trailing non-ASCII block
  if (/^[\x00-\x7F]/.test(title) && /[^\x00-\x7F]{2,}$/.test(title)) {
    title = title.replace(/\s*[^\x00-\x7F]{2,}$/, '').trim();
  }

  // Collapse excess whitespace
  artist = artist.replace(/\s+/g, ' ').trim();
  title = title.replace(/\s+/g, ' ').trim();
  album = album.replace(/\s+/g, ' ').trim();

  return {
    cleanArtist: artist,
    cleanTitle: title,
    cleanAlbum: album,
    featuredArtist,
  };
}
