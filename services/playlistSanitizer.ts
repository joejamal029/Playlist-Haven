/**
 * Playlist Sanitizer Service
 * 
 * Provides robust composite track parsing, artist/title separation, and noise cleaning.
 * Handles:
 * - YouTube Music composite track dumps where "Artist name" column is empty
 * - Reverse "Title - Artist" patterns with CJK parentheses
 * - Japanese corner quotes (「...」, 『...』)
 * - Chinese thick brackets (【...】) and book titles (《...》)
 * - Square brackets and subtitle lyrics
 * - Video media noise (Official Music Video, Visualizer, 4K, Audio Only, etc.)
 * - Repeated middle dot artist dumps ("Yukopi · Yukopi · Yukopi")
 * - Hashtag artist signatures (#cacgoodwomenchoiribadan)
 * - File extensions (.wmv, .mp3, etc.)
 */

export interface CleanTrackResult {
  artist: string;
  title: string;
  originalRaw?: string;
}

/**
 * Clean and parse composite track titles into separated artist and title
 */
export function cleanCompositeTrack(rawTrack: string, rawArtistCol: string = ''): CleanTrackResult {
  let artist = rawArtistCol ? rawArtistCol.trim() : '';
  let title = rawTrack ? rawTrack.trim() : '';

  // Strip wrapping quotes
  title = title.replace(/^["']+|["']+$/g, '').trim();
  artist = artist.replace(/^["']+|["']+$/g, '').trim();

  // Strip YouTube " - Topic" channel suffix
  if (artist && artist.endsWith(' - Topic')) {
    artist = artist.slice(0, -8).trim();
  }

  // If artist is already valid and not an unknown placeholder, return directly
  if (
    artist &&
    artist.toLowerCase() !== '<unknown>' &&
    artist.toLowerCase() !== 'unknown' &&
    artist.toLowerCase() !== 'unknown artist'
  ) {
    // Clean repeated middle dots in artist if present (e.g. "Yukopi · Yukopi...")
    if (artist.includes(' · ')) {
      const toks = artist.split(' · ').map(x => x.trim()).filter(Boolean);
      artist = toks[0] || artist;
    }
    return { artist, title, originalRaw: rawTrack };
  }

  // Otherwise artist is missing, empty, or '<unknown>' - extract from rawTrack
  let raw = title;

  // Unescape backslashes if present
  raw = raw.replace(/\\&/g, '&').replace(/\\\[/g, '[').replace(/\\\]/g, ']');

  // 1. Strip file extensions like .wmv, .mp3, .mp4, .flac
  raw = raw.replace(/\.(?:mp3|m4a|flac|wav|webm|mp4|wmv|ogg|opus|aac)$/i, '').trim();

  // 2. Check for hashtags in track name (e.g. #cacgoodwomenchoiribadan)
  const hashtagMatch = raw.match(/#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g);
  let hashtagArtist = '';
  if (hashtagMatch) {
    for (const ht of hashtagMatch) {
      const lowerHt = ht.toLowerCase();
      if (lowerHt.includes('cacgoodwomenchoir') || lowerHt.includes('dafasoyin')) {
        hashtagArtist = 'C.A.C. Good Women Choir Ibadan';
        break;
      }
    }
  }
  raw = raw.replace(/(?:\s*#[a-zA-Z0-9_\u4e00-\u9fa5]+)+$/g, '').trim();

  // 3. Epic Rap Battles of History pattern: "X vs Y. Epic Rap Battles of History"
  if (/[\.\-\|\–\—]\s*Epic Rap Battles of History/i.test(raw)) {
    artist = 'Epic Rap Battles of History';
    title = raw.replace(/[\.\-\|\–\—]\s*Epic Rap Battles of History.*$/i, '').trim();
    return { artist, title, originalRaw: rawTrack };
  }

  // 4. Pattern: `【Artist】原创《SongTitle》` or `【Artist】《SongTitle》`
  const artistBookMatch = raw.match(/^[【\[]([^】\]]+)[】\]]\s*(?:原创)?\s*《([^》]+)》/);
  if (artistBookMatch) {
    artist = artistBookMatch[1].trim();
    title = artistBookMatch[2].trim();
    return { artist, title, originalRaw: rawTrack };
  }

  // 5. Pattern: `Artist『Title』` or `Artist「Title」`
  const cornerMatch = raw.match(/^([^「『【\[]+)[　\s]*[「『]([^」』]+)[」』]/);
  if (cornerMatch) {
    const prefix = cornerMatch[1].trim();
    const quoted = cornerMatch[2].trim();
    if (prefix.includes(' - ') || prefix.includes(' – ')) {
      const p = prefix.split(/[\-–]/);
      artist = p[0].trim();
      title = p.slice(1).join(' - ').trim();
    } else {
      artist = prefix;
      title = quoted;
    }
    return { artist, title, originalRaw: rawTrack };
  }

  // 6. Strip TV series / movie OST tags, lyrical subtitles and quotes
  raw = raw.replace(/『[^』]*』/g, ' ').trim();
  raw = raw.replace(/[♫♪★☆▶️]\s*「[^」]*」/g, ' ').trim();
  raw = raw.replace(/（[^）]*(?:電視劇|电视剧|電影|电影|插曲|主題曲|主题曲|片尾曲|敬你)[^）]*）/g, ' ').trim();

  // 7. Strip media/quality/lyrics noise brackets:
  raw = raw.replace(/\[\s*(?:eng|chinese|pinyin|rom|lyrics?|sub|subs|cc|audio only|官方)[^\]]*\]/gi, ' ');
  raw = raw.replace(/【\s*(?:lyrics?|高清|完整版|纯享版|纯享|动态歌词|動態歌詞|歌词字幕|歌詞字幕|高音质|高音質|mv|official|官方)[^】]*】/gi, ' ');
  raw = raw.replace(/\(\s*(?:official|music|video|visualizer|audio|hd|4k|lyric|lyrics|remastered|explicit|deleted scene|audio only)[^)]*\)/gi, ' ');
  raw = raw.replace(/\[\s*(?:official|music|video|visualizer|audio|hd|4k|lyric|lyrics|remastered|audio only)[^\]]*\]/gi, ' ');
  raw = raw.replace(/【\s*(?:official|music|video|mv|visualizer|audio|hd|4k|lyrics?|hd)[^】]*】/gi, ' ');
  raw = raw.replace(/\b(?:official video|official music video|official visualizer|visualizer|music video|lyric video|hd|4k|audio|mv|official audio|audio only)\b/gi, ' ');
  raw = raw.replace(/♫|♪|★|☆|▶️/g, ' ');

  // Normalize spacing and strip trailing hyphens / punctuation
  raw = raw.replace(/\s+/g, ' ').trim();
  raw = raw.replace(/[\s\-\–\—\.\/]+$/, '').trim();

  // Pattern A: Leading bracket title like `【无名的人】毛不易 - ...`
  const leadBracketMatch = raw.match(/^[【\[]([^】\]]+)[】\]]\s*([^\-–—]+)\s*[\-–—]/);
  // Pattern B: Title enclosed in book quotes `《Title》` e.g. `【纯享版】周深/郭沁《大鱼》...`
  const bookMatch = raw.match(/(?:^|[【\[\s])([^\s【\[《]+)?\s*《([^》]+)》/);
  // Pattern C: Chinese thick brackets `Artist【Title】`
  const cnMatch = raw.match(/^([^【]+)[　\s]*【([^】]+)】/);
  // Pattern D: Square brackets `Artist [ Title ]`
  const sqMatch = raw.match(/^([^\[]+)\[\s*([^\]]+?)\s*\]/);

  if (leadBracketMatch) {
    title = leadBracketMatch[1].trim();
    artist = leadBracketMatch[2].trim();
  } else if (bookMatch && bookMatch[2]) {
    title = bookMatch[2].trim();
    let a = bookMatch[1] ? bookMatch[1].trim() : '';
    if (!a) {
      const remaining = raw.replace(`《${bookMatch[2]}》`, ' ').replace(/【[^】]*】/g, ' ').replace(/\[[^\]]*\]/g, ' ').trim();
      if (remaining.includes(' - ') || remaining.includes(' – ')) {
        const p = remaining.split(/[\-–]/);
        a = p[0].trim();
      } else {
        const slashArtist = remaining.match(/^([^\s\/]+(?:\/[^\s]+)?)/);
        a = slashArtist ? slashArtist[1].replace(/^原创\s*/, '').trim() : remaining.trim();
      }
    }
    artist = a;
  } else if (cnMatch) {
    artist = cnMatch[1].trim();
    title = cnMatch[2].trim();
  } else if (sqMatch) {
    artist = sqMatch[1].trim();
    title = sqMatch[2].trim();
  } else if (raw.includes(' - ') || raw.includes(' – ') || raw.includes(' — ')) {
    const sep = raw.includes(' - ') ? ' - ' : raw.includes(' – ') ? ' – ' : ' — ';
    const parts = raw.split(sep);
    const a = parts[0].trim();
    let t = parts.slice(1).join(sep).trim();

    // Clean trailing noise on t
    t = t.replace(/\s*lyrics(?:\s*\[[^\]]*\])?$/i, '').trim();
    t = t.replace(/\s*Music Video$/i, '').trim();
    t = t.replace(/『[^』]*』/g, ' ').trim();
    t = t.replace(/【[^】]*】/g, ' ').trim();
    if (t.includes(' Xiaoshi Guniang')) {
      t = t.replace(/\s*Xiaoshi Guniang.*$/i, '').trim();
    }

    // Check if reversed: e.g. "Big Fish (大魚) - Zhou Shen (周深)"
    if (
      (t.includes('(') && t.includes(')') && !a.includes('(')) ||
      (t.toLowerCase().includes('zhou shen') || t.includes('周深'))
    ) {
      artist = t;
      title = a;
    } else {
      artist = a;
      title = t;
    }
  } else if (raw.includes('／')) {
    const parts = raw.split('／');
    title = parts[0].trim();
    artist = parts.slice(1).join('／').trim();
  } else if (hashtagArtist) {
    artist = hashtagArtist;
    title = raw;
  } else {
    // Single title or channel song
    title = raw;
    artist = '<unknown>';
  }

  // Clean repeated middle dots in artist if present (e.g. "Yukopi · Yukopi · ...")
  if (artist.includes(' · ')) {
    const toks = artist.split(' · ').map(x => x.trim()).filter(Boolean);
    artist = toks[0] || artist;
  }

  // Clean remaining bracket noise in title
  title = title.replace(/【[^】]*】/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  title = title.replace(/^["']+|["']+$/g, '').trim();
  artist = artist.replace(/^["']+|["']+$/g, '').trim();
  title = title.replace(/[\s\-\–\—]+$/, '').trim();

  return {
    artist: artist || '<unknown>',
    title: title || rawTrack,
    originalRaw: rawTrack,
  };
}
