export const WORKER_CODE = `
  const createLog = (message, type = 'INFO') => ({
    timestamp: new Date().toLocaleTimeString(),
    message,
    type,
  });

  const parseCSV = (text, delimiter = ',') => {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
      } else if ((char === String.fromCharCode(13) || char === String.fromCharCode(10)) && !inQuotes) {
        if (char === String.fromCharCode(13) && nextChar === String.fromCharCode(10)) {
          i++;
        }
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

  const readFile = async (file) => {
    return file.content;
  };

  const getPointsFromFileName = (name) => {
    const match = name.match(new RegExp('([0-9]+)[ \\t]*plays?', 'i'));
    return match ? parseInt(match[1], 10) : 0;
  };

  const parsePlaylist = (content) => {
    const lines = content.split(String.fromCharCode(10)).map(line => line.endsWith(String.fromCharCode(13)) ? line.slice(0, -1) : line);
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

  const parseMusicoletCSV = (content) => {
    const parsedRows = parseCSV(content);
    if (parsedRows.length === 0) return { trackMap: new Map(), metadataMap: new Map(), headers: [] };
    
    const headers = parsedRows[0].map(h => h.trim().toUpperCase());
    const fileIdx = headers.indexOf('FILE_PATH');
    const playCountIdx = headers.indexOf('PLAY_COUNT');
    
    if (fileIdx === -1 || playCountIdx === -1) {
      return { trackMap: new Map(), metadataMap: new Map(), headers: [] };
    }
    
    const trackMap = new Map();
    const metadataMap = new Map();
    
    for (let i = 1; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      if (row.length <= Math.max(fileIdx, playCountIdx)) continue;
      
      const path = row[fileIdx].trim();
      const playCountVal = parseInt(row[playCountIdx], 10);
      if (!path) continue;
      
      const plays = isNaN(playCountVal) ? 0 : playCountVal;
      trackMap.set(path, plays);
      metadataMap.set(path, row);
    }
    
    return { trackMap, metadataMap, headers: parsedRows[0] };
  };

  const parseAnyPlaylist = (content) => {
    const lines = content.split(String.fromCharCode(10));
    const firstLine = lines[0] || '';
    const trimmedFirstLine = firstLine.endsWith(String.fromCharCode(13)) ? firstLine.slice(0, -1) : firstLine;
    if (trimmedFirstLine.toUpperCase().includes('FILE_PATH')) {
      const parsed = parseCSV(content);
      const headers = parsed[0].map(h => h.trim().toUpperCase());
      const fileIdx = headers.indexOf('FILE_PATH');
      const paths = new Map();
      if (fileIdx !== -1) {
        for (let i = 1; i < parsed.length; i++) {
          const row = parsed[i];
          if (row.length > fileIdx && row[fileIdx].trim()) {
            paths.set(row[fileIdx].trim(), "");
          }
        }
      }
      return paths;
    } else {
      return parsePlaylist(content);
    }
  };

  const generateNextFilename = (anchorName, currentAbc, countThreshold, sieveType) => {
    const ext = sieveType === 'musicolet-csv' ? 'csv' : 'm3u';
    const dateMatch = anchorName.match(new RegExp('\\\\(([0-9]{1,2})[./-]([0-9]{1,2})[./-]([0-9]{2,4})\\\\)'));
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
    return \`ABC \${newAbc}. \${monthName} Week \${weekNum} (\${dayStr}-\${monthStr}-\${yearStr}) (\${countThreshold}).\${ext}\`;
  };

  const generateCSVContent = (headers, tracks, scoreMap, metadataCache) => {
    const playCountIdx = headers.map(h => h.trim().toUpperCase()).indexOf('PLAY_COUNT');
    const fileIdx = headers.map(h => h.trim().toUpperCase()).indexOf('FILE_PATH');
    
    let csv = headers.map(h => h.includes(',') || h.includes('"') ? \`"\${h.replace(/"/g, '""')}"\` : h).join(',') + '\\n';
    
    tracks.forEach(track => {
      let row = metadataCache.get(track);
      const score = scoreMap.get(track) || 0;
      
      if (row) {
        const rowCopy = [...row];
        if (playCountIdx !== -1) {
          rowCopy[playCountIdx] = score.toString();
        }
        const formattedLine = rowCopy.map(cell => {
          const str = (cell || "").toString();
          if (str.includes(',') || str.includes('"') || str.includes(String.fromCharCode(10)) || str.includes(String.fromCharCode(13))) {
            return \`"\${str.replace(/"/g, '""')}"\`;
          }
          return str;
        }).join(',');
        csv += formattedLine + '\\n';
      } else {
        const parts = track.split(/[-_]/);
        const artist = parts[0] ? parts[0].trim() : "Unknown";
        const title = parts[1] ? parts[1].replace(/\\.[^/.]+$/, "").trim() : track;
        
        const defaultRow = Array(headers.length).fill("");
        if (fileIdx !== -1) defaultRow[fileIdx] = track;
        const titleIdx = headers.map(h => h.trim().toUpperCase()).indexOf('TITLE');
        if (titleIdx !== -1) defaultRow[titleIdx] = title;
        const artistIdx = headers.map(h => h.trim().toUpperCase()).indexOf('ARTIST');
        if (artistIdx !== -1) defaultRow[artistIdx] = artist;
        if (playCountIdx !== -1) defaultRow[playCountIdx] = score.toString();
        
        const formattedLine = defaultRow.map(cell => {
          const str = (cell || "").toString();
          if (str.includes(',') || str.includes('"') || str.includes(String.fromCharCode(10)) || str.includes(String.fromCharCode(13))) {
            return \`"\${str.replace(/"/g, '""')}"\`;
          }
          return str;
        }).join(',');
        csv += formattedLine + '\\n';
      }
    });
    
    return csv;
  };

  const calculateScores = async (tierFiles, penaltyFiles, sieveType, onLog) => {
    const songScores = new Map();
    const metadataCache = new Map();
    let csvHeaders = [];

    if (sieveType === 'musicolet-csv') {
      for (const file of tierFiles) {
        const content = await readFile(file);
        const { trackMap, metadataMap, headers } = parseMusicoletCSV(content);
        
        if (headers && headers.length > 0 && csvHeaders.length === 0) {
          csvHeaders = headers;
        }

        trackMap.forEach((plays, path) => {
          const currentScore = songScores.get(path) || 0;
          const newScore = Math.max(currentScore, plays);
          songScores.set(path, newScore);
          
          const row = metadataMap.get(path);
          if (row && (!metadataCache.has(path) || plays >= currentScore)) {
            metadataCache.set(path, row);
          }
        });
        onLog(createLog(\`Ingested \${trackMap.size} tracks from Musicolet CSV: \${file.name}\`));
      }
    } else {
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
    }

    for (const file of penaltyFiles) {
      const content = await readFile(file);
      const trackMap = parseAnyPlaylist(content);
      let penalizedCount = 0;
      trackMap.forEach((_, path) => {
        if (songScores.has(path)) {
            songScores.set(path, songScores.get(path) - 1);
            penalizedCount++;
        }
      });
      onLog(createLog(\`Applied penalties from \${file.name} to \${penalizedCount} tracks.\`));
    }
    return { songScores, metadataCache, csvHeaders };
  };

  onmessage = async (e) => {
    const { mode, sieveType = 'classic', tierFiles, penaltyFiles, anchorFile, customName, threshold = 2 } = e.data;
    const logs = [];
    const onLog = (log) => {
      logs.push(log);
      postMessage({ type: 'LOG', log });
    };

    try {
      const { songScores, metadataCache, csvHeaders } = await calculateScores(tierFiles, penaltyFiles, sieveType, onLog);

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
          const anchorTracks = Array.from(parseAnyPlaylist(anchorContent).keys());
          anchorTracks.forEach((path, index) => rankMap.set(path, index));
          const abcMatch = anchorFile.name.match(new RegExp('ABC[ \\t]+([0-9]+)', 'i'));
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
        const fileName = anchorFile 
          ? generateNextFilename(anchorFile.name, abcNum, countThreshold, sieveType) 
          : (customName || "Sieve Result") + (sieveType === 'musicolet-csv' ? ".csv" : ".m3u");
        
        let outputContent = "";
        if (sieveType === 'musicolet-csv') {
          const headers = csvHeaders.length > 0 ? csvHeaders : ['FILE_PATH', 'TITLE', 'ARTIST', 'ALBUM', 'ALBUM_ARTIST', 'COMPOSER', 'GENRE', 'YEAR', 'DURATION_MS', 'PLAY_COUNT'];
          outputContent = generateCSVContent(headers, finalPlaylist, validSongs, metadataCache);
        } else {
          outputContent = "#EXTM3U\\n";
          finalPlaylist.forEach(track => {
            const meta = metadataCache.get(track);
            if (meta) outputContent += meta + "\\n";
            outputContent += track + "\\n";
          });
        }

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
          const ext = sieveType === 'musicolet-csv' ? 'csv' : 'm3u';
          let content = "";
          
          if (sieveType === 'musicolet-csv') {
            const headers = csvHeaders.length > 0 ? csvHeaders : ['FILE_PATH', 'TITLE', 'ARTIST', 'ALBUM', 'ALBUM_ARTIST', 'COMPOSER', 'GENRE', 'YEAR', 'DURATION_MS', 'PLAY_COUNT'];
            content = generateCSVContent(headers, tracks, songScores, metadataCache);
          } else {
            content = "#EXTM3U\\n";
            tracks.sort().forEach(track => {
              const meta = metadataCache.get(track);
              if (meta) content += meta + "\\n";
              content += track + "\\n";
            });
          }
          
          resultFiles.push({
            fileName: \`\${score} plays.\${ext}\`,
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