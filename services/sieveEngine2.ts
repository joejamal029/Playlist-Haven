// Core Sieve Engine — runs on main thread, no worker needed for small datasets

export interface FileData {
  name: string;
  content: string;
}

export type LogType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';

export interface SieveLog {
  timestamp: string;
  message: string;
  type: LogType;
}

export const makeLog = (message: string, type: LogType = 'INFO'): SieveLog => ({
  timestamp: new Date().toLocaleTimeString(),
  message,
  type,
});

// RFC-4180 CSV parser — pure JS, no escaping issues
export const parseCSV = (text: string): string[][] => {
  const sanitizedText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;

  for (let i = 0; i < sanitizedText.length; i++) {
    const c = sanitizedText[i];
    const n = sanitizedText[i + 1];

    if (c === '"') {
      if (inQ && n === '"') { cell += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(cell); cell = '';
    } else if ((c === '\r' || c === '\n') && !inQ) {
      if (c === '\r' && n === '\n') i++;
      row.push(cell);
      if (row.some(x => x !== '')) rows.push(row); // skip blank lines
      row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
};

export const parseMusicoletCSV = (content: string) => {
  const rows = parseCSV(content);
  if (rows.length < 2) return { trackMap: new Map<string, number>(), metadataMap: new Map<string, string[]>(), headers: [] as string[] };

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(h => h.trim().replace(/^["']|["']$/g, '').trim().toUpperCase());
  const fileIdx = headers.indexOf('FILE_PATH');
  const playCountIdx = headers.indexOf('PLAY_COUNT');

  if (fileIdx === -1 || playCountIdx === -1) {
    return { trackMap: new Map<string, number>(), metadataMap: new Map<string, string[]>(), headers: [] as string[] };
  }

  const trackMap = new Map<string, number>();
  const metadataMap = new Map<string, string[]>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= Math.max(fileIdx, playCountIdx)) continue;
    const path = row[fileIdx].trim().replace(/^["']|["']$/g, '').trim();
    if (!path) continue;
    const plays = parseInt(row[playCountIdx], 10);
    trackMap.set(path, isNaN(plays) ? 0 : plays);
    metadataMap.set(path, row);
  }

  return { trackMap, metadataMap, headers: rawHeaders };
};

export const parseM3UPlaylist = (content: string): Map<string, string> => {
  const lines = content.split('\n').map(l => l.endsWith('\r') ? l.slice(0, -1) : l);
  const map = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#EXTM3U')) continue;
    if (line.startsWith('#EXTINF:')) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && lines[j].trim() && !lines[j].trim().startsWith('#')) {
        const path = lines[j].trim().replace(/^["']|["']$/g, '').trim();
        map.set(path, line);
        i = j;
      }
    } else if (!line.startsWith('#')) {
      const path = line.replace(/^["']|["']$/g, '').trim();
      map.set(path, '');
    }
  }
  return map;
};

export const parseAnyPlaylist = (content: string): Map<string, string> => {
  const first = content.split('\n')[0]?.replace(/\r$/, '') ?? '';
  if (first.toUpperCase().includes('FILE_PATH')) {
    const rows = parseCSV(content);
    if (rows.length === 0) return new Map();
    const headers = rows[0].map(h => h.trim().replace(/^["']|["']$/g, '').trim().toUpperCase());
    const fileIdx = headers.indexOf('FILE_PATH');
    const map = new Map<string, string>();
    if (fileIdx !== -1) {
      for (let i = 1; i < rows.length; i++) {
        const p = rows[i]?.[fileIdx]?.trim()?.replace(/^["']|["']$/g, '').trim();
        if (p) map.set(p, '');
      }
    }
    return map;
  }
  return parseM3UPlaylist(content);
};

export const getPointsFromFileName = (name: string): number => {
  const m = name.match(/(\d+)\s*plays?/i);
  return m ? parseInt(m[1], 10) : 0;
};

export const generateNextFilename = (anchorName: string, currentAbc: number, countThreshold: number, sieveType: string): string => {
  const ext = sieveType === 'musicolet-csv' ? 'csv' : 'm3u';
  
  // Try matching Musicolet Week X - YYYY format
  const wm = anchorName.match(/Week\s+(\d+)\s*-\s*(\d{4})/i);
  if (wm) {
    const nextWeek = parseInt(wm[1]) + 1;
    const year = wm[2];
    return `Most played Songs • Week ${nextWeek} - ${year} (${countThreshold}).${ext}`;
  }

  const dm = anchorName.match(/\((\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\)/);
  let d = new Date();
  if (dm) {
    let y = parseInt(dm[3]); if (y < 100) y += 2000;
    const old = new Date(y, parseInt(dm[2]) - 1, parseInt(dm[1]));
    if (!isNaN(old.getTime())) { old.setDate(old.getDate() + 7); d = old; }
  }
  const abc = currentAbc + 1;
  const month = d.toLocaleString('default', { month: 'long' });
  const week = Math.floor((d.getDate() - 1) / 7) + 1;
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yy = d.getFullYear().toString().slice(-2);
  return `ABC ${abc}. ${month} Week ${week} (${dd}-${mm}-${yy}) (${countThreshold}).${ext}`;
};

export const generateCSVContent = (headers: string[], tracks: string[], scoreMap: Map<string, number>, metadataMap: Map<string, string[]>): string => {
  const upHdr = headers.map(h => h.trim().toUpperCase());
  const playIdx = upHdr.indexOf('PLAY_COUNT');
  const fileIdx = upHdr.indexOf('FILE_PATH');

  const q = (s: string) => (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    ? `"${s.replace(/"/g, '""')}"` : s;

  let out = headers.map(h => q(h.toString())).join(',') + '\n';

  for (const track of tracks) {
    const row = metadataMap.get(track);
    const score = scoreMap.get(track) ?? 0;
    if (row) {
      const r = [...row];
      if (playIdx !== -1) r[playIdx] = score.toString();
      out += r.map(c => q((c ?? '').toString())).join(',') + '\n';
    } else {
      const r = Array(headers.length).fill('');
      if (fileIdx !== -1) r[fileIdx] = track;
      if (playIdx !== -1) r[playIdx] = score.toString();
      out += r.map(c => q((c ?? '').toString())).join(',') + '\n';
    }
  }
  return out;
};

export const runSieve = async (
  mode: 'sonic' | 'ranking',
  sieveType: 'classic' | 'musicolet-csv',
  tierFiles: FileData[],
  penaltyFiles: FileData[],
  anchorFile: FileData | null,
  customName: string,
  threshold: number,
  onLog: (log: SieveLog) => void,
  filenameCountThreshold: number = 2
) => {
  // ── Score Calculation ──────────────────────────────────────────────
  const songScores = new Map<string, number>();
  const metadataCache = new Map<string, string[]>();
  let csvHeaders: string[] = [];

  if (sieveType === 'musicolet-csv') {
    for (const file of tierFiles) {
      const { trackMap, metadataMap, headers } = parseMusicoletCSV(file.content);
      if (headers.length > 0 && csvHeaders.length === 0) csvHeaders = headers;
      if (trackMap.size === 0) {
        onLog(makeLog(`Warning: No tracks parsed from ${file.name}. Expected a Songs CSV with FILE_PATH & PLAY_COUNT columns.`, 'WARNING'));
        continue;
      }
      trackMap.forEach((plays, path) => {
        const cur = songScores.get(path) ?? 0;
        const next = Math.max(cur, plays);
        songScores.set(path, next);
        const meta = metadataMap.get(path);
        if (meta && (!metadataCache.has(path) || plays >= cur)) metadataCache.set(path, meta);
      });
      onLog(makeLog(`Ingested ${trackMap.size} tracks from: ${file.name}`));
    }
  } else {
    const sorted = [...tierFiles].sort((a, b) => getPointsFromFileName(b.name) - getPointsFromFileName(a.name));
    for (const file of sorted) {
      const pts = getPointsFromFileName(file.name);
      if (pts === 0) { onLog(makeLog(`Skipped ${file.name}: no "X plays" in name.`, 'WARNING')); continue; }
      const trackMap = parseM3UPlaylist(file.content);
      trackMap.forEach((meta, path) => {
        const cur = songScores.get(path) ?? 0;
        songScores.set(path, Math.max(cur, pts));
        if (meta && (!metadataCache.has(path) || pts >= cur)) metadataCache.set(path, [meta]);
      });
      onLog(makeLog(`Ingested ${trackMap.size} tracks from ${file.name} (${pts} plays)`));
    }
  }

  for (const file of penaltyFiles) {
    const trackMap = parseAnyPlaylist(file.content);
    let count = 0;
    trackMap.forEach((_, path) => {
      if (songScores.has(path)) { songScores.set(path, (songScores.get(path) ?? 0) - 1); count++; }
    });
    onLog(makeLog(`Penalty from ${file.name}: ${count} tracks penalised.`));
  }

  onLog(makeLog(`Total unique tracks scored: ${songScores.size}`));

  // ── Mode: Sonic Sieve ─────────────────────────────────────────────
  if (mode === 'sonic') {
    const valid = new Map<string, number>();
    songScores.forEach((s, p) => { if (s >= threshold) valid.set(p, s); });
    onLog(makeLog(`${valid.size} tracks pass threshold (≥ ${threshold} plays).`));

    const rankMap = new Map<string, number>();
    let abcNum = 0;
    if (anchorFile) {
      const anchors = Array.from(parseAnyPlaylist(anchorFile.content).keys());
      anchors.forEach((p, i) => rankMap.set(p, i));
      const m = anchorFile.name.match(/ABC\s+(\d+)/i);
      abcNum = m ? parseInt(m[1]) : 0;
    }

    const groups: Record<number, string[]> = {};
    valid.forEach((s, p) => { (groups[s] = groups[s] ?? []).push(p); });

    const finalList: string[] = [];
    Object.keys(groups).map(Number).sort((a, b) => b - a).forEach(s => {
      groups[s].sort((a, b) => (rankMap.get(a) ?? 99999) - (rankMap.get(b) ?? 99999));
      finalList.push(...groups[s]);
    });

    const countAtThreshold = groups[filenameCountThreshold]?.length ?? 0;
    const fileName = anchorFile
      ? generateNextFilename(anchorFile.name, abcNum, countAtThreshold, sieveType)
      : `${customName || 'Sieve Result'}${sieveType === 'musicolet-csv' ? '.csv' : '.m3u'}`;

    let content = '';
    if (sieveType === 'musicolet-csv') {
      const hdrs = csvHeaders.length > 0 ? csvHeaders : ['FILE_PATH','TITLE','ARTIST','ALBUM','ALBUM_ARTIST','COMPOSER','GENRE','YEAR','DURATION_MS','PLAY_COUNT'];
      content = generateCSVContent(hdrs, finalList, valid, metadataCache);
    } else {
      content = '#EXTM3U\n';
      finalList.forEach(t => {
        const m = metadataCache.get(t);
        if (m?.[0]) content += m[0] + '\n';
        content += t + '\n';
      });
    }

    onLog(makeLog(`SUCCESS: Generated "${fileName}"`, 'SUCCESS'));
    return { files: [{ fileName, content, count: finalList.length, score: -1 }], success: true };

  // ── Mode: Ranking Sieve ───────────────────────────────────────────
  } else {
    const grouped = new Map<number, string[]>();
    songScores.forEach((s, p) => { if (!grouped.has(s)) grouped.set(s, []); grouped.get(s)!.push(p); });

    const files = [];
    for (const [score, tracks] of Array.from(grouped.entries()).sort((a, b) => b[0] - a[0])) {
      const ext = sieveType === 'musicolet-csv' ? 'csv' : 'm3u';
      let content = '';
      if (sieveType === 'musicolet-csv') {
        const hdrs = csvHeaders.length > 0 ? csvHeaders : ['FILE_PATH','TITLE','ARTIST','ALBUM','ALBUM_ARTIST','COMPOSER','GENRE','YEAR','DURATION_MS','PLAY_COUNT'];
        content = generateCSVContent(hdrs, tracks, songScores, metadataCache);
      } else {
        content = '#EXTM3U\n';
        tracks.sort().forEach(t => {
          const m = metadataCache.get(t);
          if (m?.[0]) content += m[0] + '\n';
          content += t + '\n';
        });
      }
      files.push({ fileName: `${score} plays.${ext}`, content, count: tracks.length, score });
    }

    onLog(makeLog(`SUCCESS: Generated ${files.length} playlist(s).`, 'SUCCESS'));
    return { files, success: true };
  }
};
