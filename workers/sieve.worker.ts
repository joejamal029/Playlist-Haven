// Sonic Sieve Web Worker — compiled by Vite, no string-literal escaping issues

interface FileData {
  name: string;
  content: string;
}

interface WorkerInput {
  mode: 'sonic' | 'ranking';
  sieveType: 'classic' | 'musicolet-csv';
  tierFiles: FileData[];
  penaltyFiles: FileData[];
  anchorFile: FileData | null;
  customName?: string;
  threshold?: number;
}

const createLog = (message: string, type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' = 'INFO') => ({
  timestamp: new Date().toLocaleTimeString(),
  message,
  type,
});

const parseCSV = (text: string, delimiter = ','): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
};

const getPointsFromFileName = (name: string): number => {
  const match = name.match(/(\d+)\s*plays?/i);
  return match ? parseInt(match[1], 10) : 0;
};

const parsePlaylist = (content: string): Map<string, string> => {
  const lines = content.split('\n').map(l => l.endsWith('\r') ? l.slice(0, -1) : l);
  const trackMap = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#EXTM3U')) continue;
    if (line.startsWith('#EXTINF:')) {
      const metadata = line;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length) {
        const path = lines[j].trim();
        if (path && !path.startsWith('#')) {
          trackMap.set(path, metadata);
          i = j;
        }
      }
    } else if (!line.startsWith('#')) {
      trackMap.set(line, '');
    }
  }
  return trackMap;
};

const parseMusicoletCSV = (content: string) => {
  const parsedRows = parseCSV(content);
  if (parsedRows.length === 0) return { trackMap: new Map<string, number>(), metadataMap: new Map<string, string[]>(), headers: [] as string[] };

  const headers = parsedRows[0].map(h => h.trim().toUpperCase());
  const fileIdx = headers.indexOf('FILE_PATH');
  const playCountIdx = headers.indexOf('PLAY_COUNT');

  if (fileIdx === -1 || playCountIdx === -1) {
    return { trackMap: new Map<string, number>(), metadataMap: new Map<string, string[]>(), headers: [] as string[] };
  }

  const trackMap = new Map<string, number>();
  const metadataMap = new Map<string, string[]>();

  for (let i = 1; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if (row.length <= Math.max(fileIdx, playCountIdx)) continue;
    const path = row[fileIdx].trim();
    if (!path) continue;
    const plays = isNaN(parseInt(row[playCountIdx], 10)) ? 0 : parseInt(row[playCountIdx], 10);
    trackMap.set(path, plays);
    metadataMap.set(path, row);
  }

  return { trackMap, metadataMap, headers: parsedRows[0] };
};

const parseAnyPlaylist = (content: string): Map<string, string> => {
  const firstLine = content.split('\n')[0]?.replace(/\r$/, '') ?? '';
  if (firstLine.toUpperCase().includes('FILE_PATH')) {
    const parsed = parseCSV(content);
    if (parsed.length === 0) return new Map();
    const headers = parsed[0].map(h => h.trim().toUpperCase());
    const fileIdx = headers.indexOf('FILE_PATH');
    const paths = new Map<string, string>();
    if (fileIdx !== -1) {
      for (let i = 1; i < parsed.length; i++) {
        const row = parsed[i];
        if (row.length > fileIdx && row[fileIdx].trim()) {
          paths.set(row[fileIdx].trim(), '');
        }
      }
    }
    return paths;
  }
  return parsePlaylist(content);
};

const generateNextFilename = (anchorName: string, currentAbc: number, countThreshold: number, sieveType: string): string => {
  const ext = sieveType === 'musicolet-csv' ? 'csv' : 'm3u';
  const dateMatch = anchorName.match(/\((\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\)/);
  let newDate = new Date();
  if (dateMatch) {
    const d = parseInt(dateMatch[1]);
    const m = parseInt(dateMatch[2]) - 1;
    let y = parseInt(dateMatch[3]);
    if (y < 100) y += 2000;
    const oldDate = new Date(y, m, d);
    if (!isNaN(oldDate.getTime())) {
      oldDate.setDate(oldDate.getDate() + 7);
      newDate = oldDate;
    }
  }
  const newAbc = currentAbc + 1;
  const monthName = newDate.toLocaleString('default', { month: 'long' });
  const weekNum = Math.floor((newDate.getDate() - 1) / 7) + 1;
  const dayStr = newDate.getDate().toString().padStart(2, '0');
  const monthStr = (newDate.getMonth() + 1).toString().padStart(2, '0');
  const yearStr = newDate.getFullYear().toString().slice(-2);
  return `ABC ${newAbc}. ${monthName} Week ${weekNum} (${dayStr}-${monthStr}-${yearStr}) (${countThreshold}).${ext}`;
};

const generateCSVContent = (headers: string[], tracks: string[], scoreMap: Map<string, number>, metadataCache: Map<string, string[]>): string => {
  const playCountIdx = headers.map(h => h.trim().toUpperCase()).indexOf('PLAY_COUNT');
  const fileIdx = headers.map(h => h.trim().toUpperCase()).indexOf('FILE_PATH');

  const quoteCell = (cell: string) => {
    if (cell.includes(',') || cell.includes('"') || cell.includes('\n') || cell.includes('\r')) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };

  let csv = headers.map(quoteCell).join(',') + '\n';

  tracks.forEach(track => {
    const row = metadataCache.get(track);
    const score = scoreMap.get(track) ?? 0;

    if (row) {
      const rowCopy = [...row];
      if (playCountIdx !== -1) rowCopy[playCountIdx] = score.toString();
      csv += rowCopy.map(c => quoteCell((c ?? '').toString())).join(',') + '\n';
    } else {
      const defaultRow = Array(headers.length).fill('');
      if (fileIdx !== -1) defaultRow[fileIdx] = track;
      if (playCountIdx !== -1) defaultRow[playCountIdx] = score.toString();
      csv += defaultRow.map(c => quoteCell((c ?? '').toString())).join(',') + '\n';
    }
  });

  return csv;
};

const calculateScores = async (
  tierFiles: FileData[],
  penaltyFiles: FileData[],
  sieveType: string,
  onLog: (log: ReturnType<typeof createLog>) => void
) => {
  const songScores = new Map<string, number>();
  const metadataCache = new Map<string, string[]>();
  let csvHeaders: string[] = [];

  if (sieveType === 'musicolet-csv') {
    for (const file of tierFiles) {
      const { trackMap, metadataMap, headers } = parseMusicoletCSV(file.content);

      if (headers.length > 0 && csvHeaders.length === 0) csvHeaders = headers;

      trackMap.forEach((plays, path) => {
        const currentScore = songScores.get(path) ?? 0;
        const newScore = Math.max(currentScore, plays);
        songScores.set(path, newScore);
        const rowData = metadataMap.get(path);
        if (rowData && (!metadataCache.has(path) || plays >= currentScore)) {
          metadataCache.set(path, rowData);
        }
      });
      onLog(createLog(`Ingested ${trackMap.size} tracks from Musicolet CSV: ${file.name}`));
    }
  } else {
    const sortedTiers = [...tierFiles].sort((a, b) => getPointsFromFileName(b.name) - getPointsFromFileName(a.name));
    for (const file of sortedTiers) {
      const points = getPointsFromFileName(file.name);
      if (points === 0) {
        onLog(createLog(`Skipped ${file.name}: No "X play" pattern found.`, 'WARNING'));
        continue;
      }
      const trackMap = parsePlaylist(file.content);
      trackMap.forEach((meta, path) => {
        const currentScore = songScores.get(path) ?? 0;
        const newScore = Math.max(currentScore, points);
        songScores.set(path, newScore);
        if (meta && (!metadataCache.has(path) || points >= currentScore)) {
          metadataCache.set(path, [meta]);
        }
      });
      onLog(createLog(`Ingested ${trackMap.size} tracks from ${file.name} (${points} plays)`));
    }
  }

  for (const file of penaltyFiles) {
    const trackMap = parseAnyPlaylist(file.content);
    let penalizedCount = 0;
    trackMap.forEach((_, path) => {
      if (songScores.has(path)) {
        songScores.set(path, (songScores.get(path) ?? 0) - 1);
        penalizedCount++;
      }
    });
    onLog(createLog(`Applied penalties from ${file.name} to ${penalizedCount} tracks.`));
  }

  return { songScores, metadataCache, csvHeaders };
};

onmessage = async (e: MessageEvent<WorkerInput>) => {
  const { mode, sieveType = 'classic', tierFiles, penaltyFiles, anchorFile, customName, threshold = 2 } = e.data;
  const logs: ReturnType<typeof createLog>[] = [];

  const onLog = (log: ReturnType<typeof createLog>) => {
    logs.push(log);
    postMessage({ type: 'LOG', log });
  };

  try {
    const { songScores, metadataCache, csvHeaders } = await calculateScores(tierFiles, penaltyFiles, sieveType, onLog);

    if (mode === 'sonic') {
      const validSongs = new Map<string, number>();
      songScores.forEach((score, path) => {
        if (score >= threshold) validSongs.set(path, score);
      });
      onLog(createLog(`${validSongs.size} tracks remain (Score >= ${threshold}).`));

      const rankMap = new Map<string, number>();
      let abcNum = 0;
      if (anchorFile) {
        const anchorTracks = Array.from(parseAnyPlaylist(anchorFile.content).keys());
        anchorTracks.forEach((path, index) => rankMap.set(path, index));
        const abcMatch = anchorFile.name.match(/ABC\s+(\d+)/i);
        abcNum = abcMatch ? parseInt(abcMatch[1]) : 0;
      }

      const groupedSongs: Record<number, string[]> = {};
      validSongs.forEach((score, path) => {
        if (!groupedSongs[score]) groupedSongs[score] = [];
        groupedSongs[score].push(path);
      });

      const finalPlaylist: string[] = [];
      const scores = Object.keys(groupedSongs).map(Number).sort((a, b) => b - a);
      scores.forEach(score => {
        groupedSongs[score].sort((a, b) => (rankMap.get(a) ?? 99999) - (rankMap.get(b) ?? 99999));
        finalPlaylist.push(...groupedSongs[score]);
      });

      const countThreshold = groupedSongs[threshold]?.length ?? 0;
      const fileName = anchorFile
        ? generateNextFilename(anchorFile.name, abcNum, countThreshold, sieveType)
        : (customName || 'Sieve Result') + (sieveType === 'musicolet-csv' ? '.csv' : '.m3u');

      let outputContent = '';
      if (sieveType === 'musicolet-csv') {
        const headers = csvHeaders.length > 0 ? csvHeaders : ['FILE_PATH', 'TITLE', 'ARTIST', 'ALBUM', 'ALBUM_ARTIST', 'COMPOSER', 'GENRE', 'YEAR', 'DURATION_MS', 'PLAY_COUNT'];
        outputContent = generateCSVContent(headers, finalPlaylist, validSongs, metadataCache);
      } else {
        outputContent = '#EXTM3U\n';
        finalPlaylist.forEach(track => {
          const meta = metadataCache.get(track);
          if (meta && meta[0]) outputContent += meta[0] + '\n';
          outputContent += track + '\n';
        });
      }

      onLog(createLog(`SUCCESS: Generated ${fileName}`, 'SUCCESS'));
      postMessage({
        type: 'RESULT',
        result: {
          files: [{ fileName, content: outputContent, count: finalPlaylist.length, score: -1 }],
          logs,
          success: true,
        },
      });

    } else {
      const groupedByScore = new Map<number, string[]>();
      songScores.forEach((score, path) => {
        if (!groupedByScore.has(score)) groupedByScore.set(score, []);
        groupedByScore.get(score)!.push(path);
      });

      const resultFiles = [];
      const scores = Array.from(groupedByScore.keys()).sort((a, b) => b - a);

      for (const score of scores) {
        const tracks = groupedByScore.get(score)!;
        const ext = sieveType === 'musicolet-csv' ? 'csv' : 'm3u';
        let content = '';

        if (sieveType === 'musicolet-csv') {
          const headers = csvHeaders.length > 0 ? csvHeaders : ['FILE_PATH', 'TITLE', 'ARTIST', 'ALBUM', 'ALBUM_ARTIST', 'COMPOSER', 'GENRE', 'YEAR', 'DURATION_MS', 'PLAY_COUNT'];
          content = generateCSVContent(headers, tracks, songScores, metadataCache);
        } else {
          content = '#EXTM3U\n';
          tracks.sort().forEach(track => {
            const meta = metadataCache.get(track);
            if (meta && meta[0]) content += meta[0] + '\n';
            content += track + '\n';
          });
        }

        resultFiles.push({ fileName: `${score} plays.${ext}`, content, count: tracks.length, score });
      }

      onLog(createLog(`SUCCESS: Generated ${resultFiles.length} playlists.`, 'SUCCESS'));
      postMessage({ type: 'RESULT', result: { files: resultFiles, logs, success: true } });
    }

  } catch (error: any) {
    onLog(createLog(`Worker Error: ${error?.message ?? String(error)}`, 'ERROR'));
    postMessage({ type: 'RESULT', result: { files: [], logs, success: false } });
  }
};
