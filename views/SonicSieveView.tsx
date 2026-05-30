import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Download, Play, RefreshCw, Terminal, AlertTriangle, FileText, LayoutGrid, Layers, HelpCircle, X, Info, CheckCircle2, Sliders, ArrowLeft, ChevronDown, ChevronUp, Music } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { ProcessingLog, SieveResult, SieveFile } from '../types';
import { runSieve, SieveLog } from '../services/sieveEngine2';

type SieveMode = 'sonic' | 'ranking';

interface SonicSieveViewProps {
  onBack: () => void;
}

export default function SonicSieveView({ onBack }: SonicSieveViewProps) {
  const [sieveType, setSieveType] = useState<'classic' | 'musicolet-csv'>('classic');
  const [mode, setMode] = useState<SieveMode>('sonic');
  const [tierFiles, setTierFiles] = useState<File[]>([]);
  const [penaltyFiles, setPenaltyFiles] = useState<File[]>([]);
  const [anchorFile, setAnchorFile] = useState<File | null>(null);
  const [customFileName, setCustomFileName] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [filenameCountThreshold, setFilenameCountThreshold] = useState(2);
  const [maxThreshold, setMaxThreshold] = useState(20);
  const [showHelp, setShowHelp] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SieveResult | null>(null);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const parseExtInf = (meta: string, path: string) => {
    let title = 'Unknown Title';
    let artist = 'Unknown Artist';
    const commaIdx = meta.indexOf(',');
    if (commaIdx !== -1) {
      const info = meta.substring(commaIdx + 1).trim();
      const dashIdx = info.indexOf(' - ');
      if (dashIdx !== -1) {
        artist = info.substring(0, dashIdx).trim();
        title = info.substring(dashIdx + 3).trim();
      } else {
        title = info;
      }
    } else {
      let filename = path.split(/[\/\\]/).pop() || path;
      filename = filename.replace(/\.[a-zA-Z0-9]+$/, '');
      if (filename.includes(' - ')) {
        const fDash = filename.indexOf(' - ');
        artist = filename.substring(0, fDash).trim();
        title = filename.substring(fDash + 3).trim();
      } else {
        title = filename;
      }
    }
    return { title, artist };
  };

  const parseCSVText = (text: string, delimiter: string = ','): string[][] => {
    const sanitizedText = text.replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < sanitizedText.length; i++) {
      const char = sanitizedText[i];
      const nextChar = sanitizedText[i + 1];
      
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
        if (char === '\r' && nextChar === '\n') {
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

  const parseCSVContent = (content: string) => {
    const parsedRows = parseCSVText(content);
    if (parsedRows.length === 0) return [];
    
    const headers = parsedRows[0].map(h => h.trim().replace(/^["']|["']$/g, '').trim().toUpperCase());
    const fileIdx = headers.indexOf('FILE_PATH');
    const titleIdx = headers.indexOf('TITLE');
    const artistIdx = headers.indexOf('ARTIST');
    
    if (fileIdx === -1) return [];
    
    const tracks = [];
    for (let i = 1; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      if (row.length <= fileIdx) continue;
      
      const path = row[fileIdx].trim().replace(/^["']|["']$/g, '').trim();
      if (!path) continue;
      
      const title = titleIdx !== -1 && row[titleIdx] ? row[titleIdx].trim().replace(/^["']|["']$/g, '').trim() : path.split(/[\/\\]/).pop() || path;
      const artist = artistIdx !== -1 && row[artistIdx] ? row[artistIdx].trim().replace(/^["']|["']$/g, '').trim() : 'Unknown Artist';
      
      tracks.push({ path, title, artist });
    }
    return tracks;
  };

  const parseM3UContent = (content: string) => {
    const lines = content.split(/\r?\n/);
    const tracks = [];
    let currentMeta = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#EXTM3U')) continue;
      if (trimmed.startsWith('#EXTINF')) {
        currentMeta = trimmed;
      } else if (!trimmed.startsWith('#')) {
        const { title, artist } = parseExtInf(currentMeta, trimmed);
        tracks.push({ path: trimmed, title, artist });
        currentMeta = "";
      }
    }
    return tracks;
  };

  // Live preview logic
  const [previewScores, setPreviewScores] = useState<Map<string, number> | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<null>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Simplified main-thread calculation for live threshold count updates
  useEffect(() => {
    if (tierFiles.length === 0) {
      setPreviewScores(null);
      return;
    }

    const getTracksFromCSV = (content: string): Map<string, number> => {
      const parsedRows = parseCSVText(content);
      const trackScores = new Map<string, number>();
      if (parsedRows.length === 0) return trackScores;
      
      const headers = parsedRows[0].map(h => h.trim().toUpperCase());
      const fileIdx = headers.indexOf('FILE_PATH');
      const playCountIdx = headers.indexOf('PLAY_COUNT');
      
      if (fileIdx === -1 || playCountIdx === -1) return trackScores;
      
      for (let i = 1; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        if (row.length <= Math.max(fileIdx, playCountIdx)) continue;
        
        const path = row[fileIdx].trim();
        const playCountVal = parseInt(row[playCountIdx], 10);
        if (!path) continue;
        
        const plays = isNaN(playCountVal) ? 0 : playCountVal;
        trackScores.set(path, plays);
      }
      return trackScores;
    };

    const runPreview = async () => {
      setIsPreviewLoading(true);
      try {
        const songScores = new Map<string, number>();
        
        // Ingest Tiers
        if (sieveType === 'musicolet-csv') {
          for (const file of tierFiles) {
            const buffer = await file.arrayBuffer();
            let content = "";
            try { content = new TextDecoder('utf-8').decode(buffer); } 
            catch { content = new TextDecoder('windows-1252').decode(buffer); }

            const trackScores = getTracksFromCSV(content);
            trackScores.forEach((plays, path) => {
              songScores.set(path, Math.max(songScores.get(path) || 0, plays));
            });
          }
        } else {
          for (const file of tierFiles) {
            const match = file.name.match(/(\d+)\s*plays?/i);
            const points = match ? parseInt(match[1], 10) : 0;
            if (points === 0) continue;

            const buffer = await file.arrayBuffer();
            let content = "";
            try { content = new TextDecoder('utf-8').decode(buffer); } 
            catch { content = new TextDecoder('windows-1252').decode(buffer); }

            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line || line.startsWith('#')) continue;
              songScores.set(line, Math.max(songScores.get(line) || 0, points));
            }
          }
        }

        // Apply Penalties
        for (const file of penaltyFiles) {
          const buffer = await file.arrayBuffer();
          let content = "";
          try { content = new TextDecoder('utf-8').decode(buffer); } 
          catch { content = new TextDecoder('windows-1252').decode(buffer); }

          const firstLine = content.split(/\r?\n/)[0] || '';
          const isCsv = firstLine.toUpperCase().includes('FILE_PATH');
          
          if (isCsv) {
            const parsed = parseCSVText(content);
            const headers = parsed[0].map(h => h.trim().toUpperCase());
            const fileIdx = headers.indexOf('FILE_PATH');
            if (fileIdx !== -1) {
              for (let i = 1; i < parsed.length; i++) {
                const row = parsed[i];
                if (row.length > fileIdx && row[fileIdx].trim()) {
                  const path = row[fileIdx].trim();
                  if (songScores.has(path)) {
                    songScores.set(path, songScores.get(path)! - 1);
                  }
                }
              }
            }
          } else {
            const lines = content.split(/\r?\n/);
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) continue;
              if (songScores.has(trimmed)) {
                songScores.set(trimmed, songScores.get(trimmed)! - 1);
              }
            }
          }
        }
        setPreviewScores(songScores);
      } catch (e) {
        console.error("Preview failed", e);
      } finally {
        setIsPreviewLoading(false);
      }
    };

    runPreview();
  }, [tierFiles, penaltyFiles, sieveType]);

  const remainingCount = useMemo(() => {
    if (!previewScores) return 0;
    let count = 0;
    previewScores.forEach(score => {
      if (score >= threshold) count++;
    });
    return count;
  }, [previewScores, threshold]);

  const handleReset = () => {
    setTierFiles([]);
    setPenaltyFiles([]);
    setAnchorFile(null);
    setCustomFileName("");
    setThreshold(2);
    setFilenameCountThreshold(2);
    setMaxThreshold(20);
    setResult(null);
    setLogs([]);
    setExpandedIndex(null);
  };

  const handleRun = async () => {
    if (tierFiles.length === 0) {
      setLogs([{ timestamp: new Date().toLocaleTimeString(), message: "No Tier Files selected!", type: 'ERROR' }]);
      return;
    }
    if (mode === 'sonic' && !anchorFile && !customFileName.trim()) {
      setLogs([{ timestamp: new Date().toLocaleTimeString(), message: "Please provide an Anchor file OR a result name!", type: 'ERROR' }]);
      return;
    }

    setIsProcessing(true);
    setResult(null);
    const startLogs: SieveLog[] = [{ timestamp: new Date().toLocaleTimeString(), message: "Reading files...", type: 'INFO' }];
    setLogs(startLogs);

    try {
      const readFile = async (file: File): Promise<string> => {
        const buf = await file.arrayBuffer();
        try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch { return new TextDecoder('windows-1252').decode(buf); }
      };

      const tierData = await Promise.all(tierFiles.map(async f => ({ name: f.name, content: await readFile(f) })));
      const penaltyData = await Promise.all(penaltyFiles.map(async f => ({ name: f.name, content: await readFile(f) })));
      const anchorData = anchorFile ? { name: anchorFile.name, content: await readFile(anchorFile) } : null;

      const allLogs: SieveLog[] = [...startLogs];
      const onLog = (log: SieveLog) => {
        allLogs.push(log);
        setLogs([...allLogs]);
      };

      onLog({ timestamp: new Date().toLocaleTimeString(), message: `Files loaded. Running ${sieveType === 'musicolet-csv' ? 'Musicolet CSV' : 'Classic'} sieve...`, type: 'INFO' });

      const result = await runSieve(mode, sieveType, tierData, penaltyData, anchorData, customFileName, threshold, onLog, filenameCountThreshold);
      setResult(result);
    } catch (err: any) {
      setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `Error: ${err?.message ?? String(err)}`, type: 'ERROR' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFile = (file: SieveFile) => {
    const isCsv = file.fileName.endsWith('.csv');
    const blob = new Blob([file.content], { type: isCsv ? 'text/csv;charset=utf-8;' : 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    if (!result || !result.files) return;
    result.files.forEach((file, index) => {
      setTimeout(() => downloadFile(file), index * 300);
    });
  };

  const canRun = tierFiles.length > 0 && (mode === 'ranking' || anchorFile || customFileName.trim().length > 0);

  const getButtonClass = () => {
    if (isProcessing) return 'bg-slate-800 text-slate-500 cursor-not-allowed';
    if (!canRun) return 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50';
    return mode === 'sonic' 
      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-xl shadow-indigo-900/20' 
      : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-xl shadow-purple-900/20';
  };

  const getLogColorClass = (type: string) => {
    switch(type) {
      case 'ERROR': return 'text-red-400';
      case 'WARNING': return 'text-amber-400';
      case 'SUCCESS': return 'text-emerald-400';
      default: return 'text-slate-500';
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Sonic Sieve</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Logic Engine</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
           <button 
             onClick={() => setShowHelp(true)} 
             className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
           >
             <HelpCircle size={18} />
           </button>
           <button 
             onClick={handleReset} 
             className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
           >
             <RefreshCw size={18} />
           </button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto w-full space-y-6 pb-20">
        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800/50">
            <button 
              onClick={() => { setMode('sonic'); setResult(null); }}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 text-xs font-bold rounded-lg transition-all
                ${mode === 'sonic' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Layers size={14} />
              <span>Sonic Sieve</span>
            </button>
            <button 
              onClick={() => { setMode('ranking'); setResult(null); }}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 text-xs font-bold rounded-lg transition-all
                ${mode === 'ranking' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <LayoutGrid size={14} />
              <span>Ranking Sieve</span>
            </button>
        </div>

        {/* Sieve Source Type Selector */}
        <div className="space-y-2 bg-slate-900/30 border border-slate-800/60 p-3 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Sieve Data Source</span>
            <span className="text-[9px] text-slate-600 italic">Musicolet CSV vs M3U</span>
          </div>
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800/60">
              <button 
                onClick={() => { setSieveType('classic'); handleReset(); }}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all text-center
                  ${sieveType === 'classic' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Classic Tiers (M3U)
              </button>
              <button 
                onClick={() => { setSieveType('musicolet-csv'); handleReset(); }}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all text-center
                  ${sieveType === 'musicolet-csv' ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Musicolet CSV Exports
              </button>
          </div>
        </div>

        {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="sticky top-0 bg-slate-900/80 backdrop-blur-md px-6 py-4 border-b border-slate-800 flex justify-between items-center z-10">
              <div className="flex items-center space-x-2">
                <HelpCircle size={20} className="text-indigo-400" />
                <h2 className="text-lg font-bold">How it Works</h2>
              </div>
              <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-8">
              <section className="space-y-3">
                <h3 className="text-indigo-400 font-bold uppercase tracking-widest text-[11px] flex items-center">
                  <CheckCircle2 size={14} className="mr-2" />
                  Naming Convention
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Tier files MUST be named with <span className="text-indigo-300 font-mono">"X plays"</span>. 
                  Example: <span className="bg-slate-800 px-1.5 rounded">15 plays.m3u</span> assigns a score of 15 to all tracks inside.
                  If a track is in multiple files, the <span className="font-bold">highest</span> score wins.
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-rose-400 font-bold uppercase tracking-widest text-[11px] flex items-center">
                  <CheckCircle2 size={14} className="mr-2" />
                  Penalties
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Every song found in a <span className="text-rose-300 font-bold">Penalty Playlist</span> has its final score <span className="font-bold">reduced by 1</span> for each file it appears in. 
                  Useful for "Exclusion" or "Last Week" lists.
                </p>
              </section>

              <div className="grid grid-cols-1 gap-4">
                <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase">
                    <Layers size={14} />
                    <span>Sonic Sieve Mode</span>
                  </div>
                  <p className="text-[12px] text-slate-400 leading-relaxed">
                    Uses the <span className="text-white font-bold font-mono">Dynamic Sieve Threshold</span> to filter your library. 
                    Only tracks with a calculated score <span className="text-white font-bold">≥ Your Threshold</span> are kept.
                    You can adjust the <span className="italic">Max Range</span> to accommodate high-frequency datasets.
                  </p>
                </div>

                <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-purple-400 font-bold text-xs uppercase">
                    <LayoutGrid size={14} />
                    <span>Ranking Sieve Mode</span>
                  </div>
                  <p className="text-[12px] text-slate-400">
                    Does <span className="text-white font-bold">no filtering</span>. It splits all ingested tracks into separate playlists named by their final score.
                  </p>
                </div>
              </div>

              <section className="space-y-3">
                <h3 className="text-amber-400 font-bold uppercase tracking-widest text-[11px] flex items-center">
                  <Info size={14} className="mr-2" />
                  The Anchor Logic
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  An Anchor playlist acts as a "Skeleton". Sonic Sieve will attempt to preserve the track order from the Anchor file, inserting tracks with lower scores at the end.
                </p>
              </section>
            </div>
            
            <div className="mt-auto p-6 pt-0">
              <button 
                onClick={() => setShowHelp(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 flex items-start space-x-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
            <AlertTriangle size={16} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-300 uppercase">
              {mode === 'sonic' ? 'Weekly Generation Mode' : 'Play Count Categorization'}
            </h4>
            <p className="text-[11px] text-slate-400 leading-tight mt-1">
              {mode === 'sonic' 
                ? 'Identifies tracks meeting your threshold score, applying penalties and anchor ranking.' 
                : 'Processes all files and groups tracks into separate playlists by their final score.'}
            </p>
          </div>
        </div>

        <section className="space-y-2">
          <FileUploader 
            label={sieveType === 'musicolet-csv' ? "Most played Songs CSVs" : "Tier Playlists"} 
            subLabel={sieveType === 'musicolet-csv' ? "Upload 'Most played Songs' exports (not Artist/Album)" : "Files named 'X plays' (e.g. 15 plays)"}
            files={tierFiles}
            onFilesSelected={(files) => setTierFiles(prev => [...prev, ...files])}
            onClear={() => setTierFiles([])}
            multiple={true}
            accept={sieveType === 'musicolet-csv' ? ".csv,text/csv,application/csv" : ".m3u,.m3u8"}
            colorClass="emerald"
          />

          <FileUploader 
            label="Penalty Playlists" 
            subLabel="Subtracts 1 play per track per file"
            files={penaltyFiles}
            onFilesSelected={(files) => setPenaltyFiles(prev => [...prev, ...files])}
            onClear={() => setPenaltyFiles([])}
            multiple={true}
            colorClass="rose"
            accept={sieveType === 'musicolet-csv' ? ".m3u,.m3u8,.csv,text/csv,application/csv" : ".m3u,.m3u8"}
          />

          {mode === 'sonic' && (
            <>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 mb-4 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-indigo-400">
                    <Sliders size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Sieve Threshold</span>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <input 
                      type="number"
                      value={threshold}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setThreshold(isNaN(val) ? 0 : val);
                      }}
                      className="w-16 bg-slate-800/50 rounded px-2 py-0.5 text-xl font-black text-white outline-none border border-slate-700/50 focus:border-indigo-500 text-right"
                    />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Plays</span>
                  </div>
                </div>
                
                <input 
                  type="range" 
                  min="0" 
                  max={maxThreshold} 
                  step="1" 
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                
                <div className="flex justify-between items-center pt-2">
                  <span className="text-[10px] text-slate-500 font-mono italic">Min: 0</span>
                  <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center space-x-2">
                    <span className="text-[10px] font-bold text-indigo-300">
                      {isPreviewLoading ? 'Calculating...' : `${remainingCount} Tracks Remaining`}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] text-slate-500 font-mono italic whitespace-nowrap">Max Range:</span>
                    <input 
                      type="number"
                      value={maxThreshold}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setMaxThreshold(isNaN(val) ? 1 : Math.max(1, val));
                      }}
                      className="w-12 bg-slate-800 border border-slate-700 rounded text-[10px] text-center text-slate-300 outline-none focus:border-indigo-500 py-1"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-850 pt-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-cyan-400">
                    <FileText size={16} />
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider block">Parenthesis Play Tier</span>
                      <span className="text-[9px] text-slate-500">Play count tier referenced in generated filename</span>
                    </div>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <input 
                      type="number"
                      value={filenameCountThreshold}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setFilenameCountThreshold(isNaN(val) ? 0 : val);
                      }}
                      className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-sm font-bold text-white text-center outline-none focus:border-cyan-500"
                    />
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Plays</span>
                  </div>
                </div>
              </div>

              <FileUploader 
                label="Anchor Playlist (Optional)" 
                subLabel="Original sequence for sorting"
                files={anchorFile}
                onFilesSelected={(files) => setAnchorFile(files[0])}
                onClear={() => { setAnchorFile(null); setCustomFileName(""); }}
                multiple={false}
                accept={sieveType === 'musicolet-csv' ? ".m3u,.m3u8,.csv,text/csv,application/csv" : ".m3u,.m3u8"}
                colorClass="amber"
              />
              {!anchorFile && (
                <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <input
                    type="text"
                    placeholder="Resulting Playlist Name"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    className="w-full bg-slate-900 border-2 border-slate-800 focus:border-indigo-500/50 rounded-xl py-3 px-4 text-sm text-slate-200 outline-none transition-all placeholder:text-slate-700"
                  />
                </div>
              )}
            </>
          )}
        </section>

        <button
          onClick={handleRun}
          disabled={isProcessing || !canRun}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] ${getButtonClass()}`}
        >
          {isProcessing ? <RefreshCw className="animate-spin" /> : <Play fill="currentColor" size={20} />}
          <span>{isProcessing ? 'Processing Engine...' : mode === 'sonic' ? 'Run Sieve' : 'Run Ranking'}</span>
        </button>

        {(logs.length > 0 || result) && (
          <section className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-inner">
            <div className="flex items-center px-4 py-2 bg-slate-950 border-b border-slate-800">
              <Terminal size={14} className="mr-2 text-slate-500" />
              <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Process Log</span>
            </div>
            <div className="p-4 h-40 overflow-y-auto font-mono text-[10px] space-y-1.5 scrollbar-hide">
              {logs.map((log, i) => (
                <div key={i} className={`flex items-start space-x-2 ${getLogColorClass(log.type)}`}>
                  <span className="opacity-40">[{log.timestamp}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </section>
        )}

        {result && result.success && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Generated Files</h3>
              {result.files.length > 1 && (
                <button 
                  onClick={downloadAll} 
                  className="text-[11px] font-bold text-indigo-400 flex items-center bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 active:bg-indigo-500/20"
                >
                  <Download size={12} className="mr-1.5" />
                  Download All ({result.files.length})
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {result.files.map((file, idx) => {
                const tracks = expandedIndex === idx 
                  ? (sieveType === 'musicolet-csv' ? parseCSVContent(file.content) : parseM3UContent(file.content))
                  : [];
                return (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-colors">
                  <div 
                    className="p-3 flex items-center justify-between group hover:border-indigo-500/30 cursor-pointer"
                    onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                  >
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center space-x-2 mb-1">
                          {file.score !== -1 && (
                            <span className="bg-purple-500/20 text-purple-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-purple-500/30">
                                {file.score} Plays
                            </span>
                          )}
                          <div className="text-xs font-bold text-slate-200 truncate">{file.fileName}</div>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center space-x-2">
                         <span>{file.count} tracks found</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadFile(file);
                        }}
                        className="p-2 bg-slate-800 hover:bg-indigo-500 hover:text-white text-slate-400 rounded-lg transition-colors"
                      >
                        <Download size={16} />
                      </button>
                      {expandedIndex === idx ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </div>
                  </div>
                  {expandedIndex === idx && (
                    <div className="bg-slate-950/50 p-3 border-t border-slate-800/50 max-h-60 overflow-y-auto custom-scrollbar">
                      {tracks.map((track, tIdx) => (
                        <div key={tIdx} className="flex items-center space-x-3 py-1.5 border-b border-slate-800/50 last:border-0 relative group">
                          <div className="bg-slate-800/50 text-slate-500 rounded p-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
                            <Music size={12} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-200 truncate">{track.title}</div>
                            <div className="text-[10px] text-slate-500 truncate">{track.artist}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
