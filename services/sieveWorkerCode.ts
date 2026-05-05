export const WORKER_CODE = `
  const createLog = (message, type = 'INFO') => ({
    timestamp: new Date().toLocaleTimeString(),
    message,
    type,
  });

  const readFile = async (file) => {
    const buffer = await file.arrayBuffer();
    try {
      const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
      return utf8Decoder.decode(buffer);
    } catch (e) {
      const winDecoder = new TextDecoder('windows-1252');
      return winDecoder.decode(buffer);
    }
  };

  const getPointsFromFileName = (name) => {
    const match = name.match(/(\\d+)\\s*plays?/i);
    return match ? parseInt(match[1], 10) : 0;
  };

  const parsePlaylist = (content) => {
    const lines = content.split(/\\r?\\n/);
    const trackMap = new Map(); 
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
        trackMap.set(line, "");
      }
    }
    return trackMap;
  };

  const generateNextFilename = (anchorName, currentAbc, countThreshold) => {
    const dateMatch = anchorName.match(/\\((\\d{1,2})[./-](\\d{1,2})[./-](\\d{2,4})\\)/);
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
    return \`ABC \${newAbc}. \${monthName} Week \${weekNum} (\${dayStr}-\${monthStr}-\${yearStr}) (\${countThreshold}).m3u\`;
  };

  const calculateScores = async (tierFiles, penaltyFiles, onLog) => {
    const songScores = new Map();
    const metadataCache = new Map();
    const sortedTiers = [...tierFiles].sort((a, b) => getPointsFromFileName(b.name) - getPointsFromFileName(a.name));

    for (const file of sortedTiers) {
      const points = getPointsFromFileName(file.name);
      if (points === 0) {
        onLog(createLog(\`Skipped \${file.name}: No "X play" pattern found.\`, 'WARNING'));
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
      onLog(createLog(\`Ingested \${trackMap.size} tracks from \${file.name} (\${points} plays)\`));
    }

    for (const file of penaltyFiles) {
      const content = await readFile(file);
      const trackMap = parsePlaylist(content);
      let penalizedCount = 0;
      trackMap.forEach((_, path) => {
        if (songScores.has(path)) {
            songScores.set(path, songScores.get(path) - 1);
            penalizedCount++;
        }
      });
      onLog(createLog(\`Applied penalties from \${file.name} to \${penalizedCount} tracks.\`));
    }
    return { songScores, metadataCache };
  };

  onmessage = async (e) => {
    const { mode, tierFiles, penaltyFiles, anchorFile, customName, threshold = 2 } = e.data;
    const logs = [];
    const onLog = (log) => {
      logs.push(log);
      postMessage({ type: 'LOG', log });
    };

    try {
      const { songScores, metadataCache } = await calculateScores(tierFiles, penaltyFiles, onLog);

      if (mode === 'sonic') {
        const validSongs = new Map();
        songScores.forEach((score, path) => {
          if (score >= threshold) validSongs.set(path, score);
        });
        onLog(createLog(\`\${validSongs.size} tracks remain (Score >= \${threshold}).\`));

        const rankMap = new Map();
        let abcNum = 0;
        if (anchorFile) {
          const anchorContent = await readFile(anchorFile);
          const anchorTracks = Array.from(parsePlaylist(anchorContent).keys());
          anchorTracks.forEach((path, index) => rankMap.set(path, index));
          const abcMatch = anchorFile.name.match(/ABC\\s+(\\d+)/i);
          abcNum = abcMatch ? parseInt(abcMatch[1]) : 0;
        }

        const groupedSongs = {};
        validSongs.forEach((score, path) => {
          if (!groupedSongs[score]) groupedSongs[score] = [];
          groupedSongs[score].push(path);
        });

        const finalPlaylist = [];
        const scores = Object.keys(groupedSongs).map(Number).sort((a, b) => b - a);
        scores.forEach(score => {
          groupedSongs[score].sort((a, b) => (rankMap.get(a) ?? 99999) - (rankMap.get(b) ?? 99999));
          finalPlaylist.push(...groupedSongs[score]);
        });

        const countThreshold = groupedSongs[threshold]?.length || 0;
        const fileName = anchorFile ? generateNextFilename(anchorFile.name, abcNum, countThreshold) : (customName || "Sieve Result") + ".m3u";
        
        let outputContent = "#EXTM3U\\n";
        finalPlaylist.forEach(track => {
          const meta = metadataCache.get(track);
          if (meta) outputContent += meta + "\\n";
          outputContent += track + "\\n";
        });

        onLog(createLog(\`SUCCESS: Generated \${fileName}\`, 'SUCCESS'));
        postMessage({ 
          type: 'RESULT', 
          result: {
            files: [{ fileName, content: outputContent, count: finalPlaylist.length, score: -1 }],
            logs,
            success: true
          } 
        });

      } else {
        const groupedByScore = new Map();
        songScores.forEach((score, path) => {
          if (!groupedByScore.has(score)) groupedByScore.set(score, []);
          groupedByScore.get(score).push(path);
        });

        const resultFiles = [];
        const scores = Array.from(groupedByScore.keys()).sort((a, b) => b - a);

        for (const score of scores) {
          const tracks = groupedByScore.get(score);
          let content = "#EXTM3U\\n";
          tracks.sort().forEach(track => {
            const meta = metadataCache.get(track);
            if (meta) content += meta + "\\n";
            content += track + "\\n";
          });
          resultFiles.push({
            fileName: \`\${score} plays.m3u\`,
            content,
            count: tracks.length,
            score
          });
        }

        onLog(createLog(\`SUCCESS: Generated \${resultFiles.length} playlists.\`, 'SUCCESS'));
        postMessage({ 
          type: 'RESULT', 
          result: { files: resultFiles, logs, success: true } 
        });
      }
    } catch (error) {
      onLog(createLog(\`Worker Error: \${error.message}\`, 'ERROR'));
      postMessage({ type: 'RESULT', result: { files: [], logs, success: false } });
    }
  };
`;