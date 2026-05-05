import { ProcessedTrack, ProcessingLog, SieveResult, SieveFile } from '../types';

// Helper to read file content with encoding robustness
export const readFile = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  try {
    // Attempt UTF-8 first (standard for modern M3U8)
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(buffer);
  } catch (e) {
    // Fallback to Windows-1252 (common for legacy desktop music players/M3U)
    const winDecoder = new TextDecoder('windows-1252');
    return winDecoder.decode(buffer);
  }
};

// Helper for logging
export const createLog = (message: string, type: ProcessingLog['type'] = 'INFO'): ProcessingLog => ({
  timestamp: new Date().toLocaleTimeString(),
  message,
  type,
});

/**
 * Extracts points from a filename based on the "X play" or "X plays" convention.
 */
export const getPointsFromFileName = (name: string): number => {
  const match = name.match(/(\d+)\s*plays?/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
};

/**
 * Flexible Playlist Parser
 */
export const parsePlaylist = (content: string): Map<string, string> => {
  const lines = content.split(/\r?\n/);
  const trackMap = new Map<string, string>(); 
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTINF:')) {
      const metadata = line;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') {
        j++;
      }
      
      if (j < lines.length) {
        const path = lines[j].trim();
        if (path && !path.startsWith('#')) {
            trackMap.set(path, metadata);
            i = j;
        }
      }
    } else if (!line.startsWith('#')) {
      trackMap.set(line, "");
    }
  }
  return trackMap;
};

const getWeekOfMonth = (date: Date): number => {
    const day = date.getDate();
    return Math.floor((day - 1) / 7) + 1;
};

export const generateNextFilename = (anchorName: string, currentAbc: number, count2s: number): string => {
    // Robust date match supporting -, ., or / and 2 or 4 digit years
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
    const weekNum = getWeekOfMonth(newDate);
    
    const dayStr = newDate.getDate().toString().padStart(2, '0');
    const monthStr = (newDate.getMonth() + 1).toString().padStart(2, '0');
    const yearStr = newDate.getFullYear().toString().slice(-2);
    
    return `ABC ${newAbc}. ${monthName} Week ${weekNum} (${dayStr}-${monthStr}-${yearStr}) (${count2s}).m3u`;
};

// Shared score calculation logic
export const calculateScores = async (
    tierFiles: File[], 
    penaltyFiles: File[], 
    onLog: (log: ProcessingLog) => void
) => {
    const songScores = new Map<string, number>();
    const metadataCache = new Map<string, string>();

    const sortedTiers = [...tierFiles].sort((a, b) => getPointsFromFileName(b.name) - getPointsFromFileName(a.name));

    for (const file of sortedTiers) {
      const points = getPointsFromFileName(file.name);
      if (points === 0) {
        onLog(createLog(`Skipped ${file.name}: No "X play" pattern found.`, 'WARNING'));
        continue;
      }

      const content = await readFile(file);
      const trackMap = parsePlaylist(content);
      
      trackMap.forEach((meta, path) => {
        const currentScore = songScores.get(path) || 0;
        const newScore = Math.max(currentScore, points);
        songScores.set(path, newScore);
        if (meta && (!metadataCache.has(path) || points >= currentScore)) {
           metadataCache.set(path, meta);
        }
      });
      onLog(createLog(`Ingested ${trackMap.size} tracks from ${file.name} (${points} plays)`));
    }

    for (const file of penaltyFiles) {
      const content = await readFile(file);
      const trackMap = parsePlaylist(content);
      let penalizedCount = 0;
      trackMap.forEach((_, path) => {
        if (songScores.has(path)) {
            songScores.set(path, songScores.get(path)! - 1);
            penalizedCount++;
        }
      });
      onLog(createLog(`Applied penalties from ${file.name} to ${penalizedCount} tracks.`));
    }

    return { songScores, metadataCache };
};
