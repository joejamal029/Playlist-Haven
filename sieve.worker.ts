import { 
  calculateScores, 
  parsePlaylist, 
  readFile, 
  generateNextFilename, 
  createLog 
} from './services/sieveEngine';
import { ProcessingLog, SieveResult } from './types';

interface WorkerData {
  mode: 'sonic' | 'ranking';
  tierFiles: File[];
  penaltyFiles: File[];
  anchorFile: File | null;
  customName?: string;
  threshold?: number;
}

onmessage = async (e: MessageEvent<WorkerData>) => {
  const { mode, tierFiles, penaltyFiles, anchorFile, customName, threshold = 2 } = e.data;
  const logs: ProcessingLog[] = [];

  const onLog = (log: ProcessingLog) => {
    logs.push(log);
    postMessage({ type: 'LOG', log });
  };

  try {
    const { songScores, metadataCache } = await calculateScores(tierFiles, penaltyFiles, onLog);

    if (mode === 'sonic') {
      const validSongs = new Map<string, number>();
      songScores.forEach((score, path) => {
        if (score >= threshold) validSongs.set(path, score);
      });
      onLog(createLog(`${validSongs.size} tracks remain after score sanitation (Score >= ${threshold}).`));

      const rankMap = new Map<string, number>();
      let abcNum = 0;
      if (anchorFile) {
        const anchorContent = await readFile(anchorFile);
        const anchorTracks = Array.from(parsePlaylist(anchorContent).keys());
        anchorTracks.forEach((path, index) => rankMap.set(path, index));
        const abcMatch = anchorFile.name.match(/ABC\s+(\d+)/i);
        abcNum = abcMatch ? parseInt(abcMatch[1]) : 0;
      }

      const groupedSongs: { [key: number]: string[] } = {};
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

      const countThreshold = groupedSongs[threshold]?.length || 0;
      const fileName = anchorFile ? generateNextFilename(anchorFile.name, abcNum, countThreshold) : (customName || "Sieve Result") + ".m3u";
      
      let outputContent = "#EXTM3U\n";
      finalPlaylist.forEach(track => {
        const meta = metadataCache.get(track);
        if (meta) outputContent += `${meta}\n`;
        outputContent += `${track}\n`;
      });

      onLog(createLog(`SUCCESS: Generated ${fileName}`, 'SUCCESS'));
      postMessage({ 
        type: 'RESULT', 
        result: {
          files: [{ fileName, content: outputContent, count: finalPlaylist.length, score: -1 }],
          logs,
          success: true
        } 
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
        let content = "#EXTM3U\n";
        tracks.sort().forEach(track => {
          const meta = metadataCache.get(track);
          if (meta) content += `${meta}\n`;
          content += `${track}\n`;
        });
        resultFiles.push({
          fileName: `${score} plays.m3u`,
          content,
          count: tracks.length,
          score
        });
      }

      onLog(createLog(`SUCCESS: Generated ${resultFiles.length} score-based playlists.`, 'SUCCESS'));
      postMessage({ 
        type: 'RESULT', 
        result: { files: resultFiles, logs, success: true } 
      });
    }
  } catch (error: any) {
    onLog(createLog(`Worker Error: ${error.message}`, 'ERROR'));
    postMessage({ type: 'RESULT', result: { files: [], logs, success: false } });
  }
};
