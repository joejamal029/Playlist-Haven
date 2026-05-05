import React, { useState } from 'react';
import { ArrowLeft, Shuffle, Download, Sparkles, Dices, List, Layers, ChevronDown, ChevronUp, Music } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { readFile } from '../services/sieveEngine';

interface PlaylistRandomizerViewProps {
  onBack: () => void;
}

interface ParsedTrack {
  path: string;
  title: string;
  artist: string;
}

interface BatchResult {
  originalName: string;
  fileName: string;
  url: string;
  count: number;
  tracks: ParsedTrack[];
}

export default function PlaylistRandomizerView({ onBack }: PlaylistRandomizerViewProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);

  // Single Merge Mode Results
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [trackCount, setTrackCount] = useState<number>(0);
  const [shuffleCount, setShuffleCount] = useState<number>(0);
  const [standardTracks, setStandardTracks] = useState<ParsedTrack[]>([]);
  const [expandedStandard, setExpandedStandard] = useState(false);

  // Batch Mode Results
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [expandedBatchIndex, setExpandedBatchIndex] = useState<number | null>(null);

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

  const parseTracks = (content: string) => {
    const lines = content.split(/\r?\n/);
    const tracks: { meta: string; path: string; parsed: ParsedTrack }[] = [];
    let currentMeta = "";
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#EXTM3U')) continue;

      if (trimmed.startsWith('#EXTINF')) {
        currentMeta = trimmed;
      } else if (trimmed.startsWith('#')) {
         // skip comments
      } else {
         const parsed = parseExtInf(currentMeta, trimmed);
         tracks.push({ meta: currentMeta, path: trimmed, parsed: { ...parsed, path: trimmed } });
         currentMeta = "";
      }
    }
    return tracks;
  };

  const shuffleArray = (array: any[]) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  };

  const generateBlobUrl = (tracks: { meta: string; path: string }[]) => {
    let outputContent = "#EXTM3U\n";
    tracks.forEach(t => {
      if (t.meta) outputContent += t.meta + "\n";
      outputContent += t.path + "\n";
    });
    const blob = new Blob([outputContent], { type: 'audio/x-mpegurl' });
    return URL.createObjectURL(blob);
  };

  const handleShuffle = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    
    // Cleanup previous
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    batchResults.forEach(r => URL.revokeObjectURL(r.url));
    setResultUrl(null);
    setBatchResults([]);
    setStandardTracks([]);
    setExpandedStandard(false);
    setExpandedBatchIndex(null);

    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      if (isBatchMode) {
        // Batch Mode
        const results: BatchResult[] = [];
        for (const file of files) {
          const content = await readFile(file);
          const tracks = parseTracks(content);
          shuffleArray(tracks);
          const url = generateBlobUrl(tracks);
          results.push({
            originalName: file.name,
            fileName: `(Random) ${file.name}`,
            url,
            count: tracks.length,
            tracks: tracks.map(t => t.parsed)
          });
        }
        setBatchResults(results);
      } else {
        // Merge Mode
        let allTracks: { meta: string; path: string; parsed: ParsedTrack }[] = [];
        for (const file of files) {
          const content = await readFile(file);
          const tracks = parseTracks(content);
          allTracks = [...allTracks, ...tracks];
        }
        shuffleArray(allTracks);
        const url = generateBlobUrl(allTracks);
        setResultUrl(url);
        setTrackCount(allTracks.length);
        setStandardTracks(allTracks.map(t => t.parsed));
        setShuffleCount(prev => prev + 1);
      }
    } catch (err) {
      console.error("Shuffle failed", err);
      alert("Failed to shuffle playlists.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadAllBatches = () => {
    batchResults.forEach((res, index) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = res.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 200);
    });
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center space-x-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
            Playlist Randomizer
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Toolbox</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto w-full space-y-6 pb-20">
        
        {/* Mode Switcher */}
        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800/50">
            <button 
              onClick={() => { setIsBatchMode(false); setResultUrl(null); setBatchResults([]); }}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 text-xs font-bold rounded-lg transition-all
                ${!isBatchMode ? 'bg-fuchsia-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Layers size={14} />
              <span>Merge & Shuffle</span>
            </button>
            <button 
              onClick={() => { setIsBatchMode(true); setResultUrl(null); setBatchResults([]); }}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 text-xs font-bold rounded-lg transition-all
                ${isBatchMode ? 'bg-pink-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <List size={14} />
              <span>Batch Shuffle</span>
            </button>
        </div>

        {/* Info Card */}
        <div className="bg-fuchsia-500/5 border border-fuchsia-500/10 rounded-xl p-4 flex items-start space-x-3">
          <div className="p-2 bg-fuchsia-500/10 rounded-lg text-fuchsia-400">
            <Shuffle size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-fuchsia-300 uppercase">
              {isBatchMode ? 'Smart Batch Shuffle' : 'Super Shuffle'}
            </h4>
            <p className="text-[11px] text-slate-400 leading-tight mt-1">
              {isBatchMode 
                ? 'Randomize each uploaded playlist individually without merging them. Useful for refreshing multiple playlists at once.'
                : 'Combine multiple playlists into one giant list and randomize the order.'}
            </p>
          </div>
        </div>

        <FileUploader
          label="Playlists"
          subLabel={isBatchMode ? "Select all files to shuffle individually" : "Select files to mix together"}
          files={files}
          onFilesSelected={(newFiles) => { 
              setFiles(prev => [...prev, ...newFiles]);
              setResultUrl(null); 
              setBatchResults([]);
              setStandardTracks([]);
              setExpandedStandard(false);
              setExpandedBatchIndex(null);
          }}
          onClear={() => { 
              setFiles([]); 
              setResultUrl(null); 
              setBatchResults([]);
              setStandardTracks([]);
              setExpandedStandard(false);
              setExpandedBatchIndex(null);
          }}
          multiple={true}
          accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel"
          colorClass="rose"
        />

        <button
          onClick={handleShuffle}
          disabled={files.length === 0 || isProcessing}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] 
            ${files.length > 0 && !isProcessing
              ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-xl shadow-fuchsia-900/20' 
              : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
        >
          {isProcessing ? <Shuffle className="animate-spin" /> : <Dices size={24} />}
          <span>
            {isProcessing ? 'Shuffling...' : (resultUrl || batchResults.length > 0) ? 'Reshuffle Again' : 'Randomize'}
          </span>
        </button>

        {/* Single Result Mode */}
        {!isBatchMode && resultUrl && (
           <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 overflow-hidden relative">
               <div className="p-6 flex flex-col items-center text-center w-full border-b border-slate-800">
                 <div className="w-12 h-12 bg-pink-500/20 text-pink-400 rounded-full flex items-center justify-center mb-3">
                     <Sparkles size={24} />
                 </div>
                 <h3 className="text-lg font-bold text-white mb-1">Randomized!</h3>
                 <p className="text-xs text-slate-500 mb-4">
                   Successfully shuffled {trackCount} tracks. <br/>
                   <span className="opacity-50">Iteration #{shuffleCount}</span>
                 </p>
                 
                 {standardTracks.length > 0 && (
                     <button
                        onClick={() => setExpandedStandard(!expandedStandard)}
                        className="absolute right-4 top-4 p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
                     >
                        {expandedStandard ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                     </button>
                 )}
                 
                 <a 
                   href={resultUrl} 
                   download={`randomized_playlist_${new Date().getTime()}.m3u`}
                   className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center space-x-2 transition-all"
                 >
                   <Download size={16} />
                   <span className="font-bold">Download M3U</span>
                 </a>
               </div>

               {expandedStandard && standardTracks.length > 0 && (
                 <div className="bg-slate-950/50 p-3 max-h-80 w-full overflow-y-auto custom-scrollbar">
                   {standardTracks.map((track, tIdx) => (
                     <div key={tIdx} className="flex items-center space-x-3 py-1.5 border-b border-slate-800/50 last:border-0 relative group">
                       <div className="bg-slate-800/50 text-slate-500 rounded p-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
                         <Music size={12} />
                       </div>
                       <div className="min-w-0 flex-1 text-left">
                         <div className="text-xs font-medium text-slate-200 truncate">{track.title}</div>
                         <div className="text-[10px] text-slate-500 truncate">{track.artist}</div>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
           </div>
        )}

        {/* Batch Result Mode */}
        {isBatchMode && batchResults.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Shuffled Batches</h3>
              {batchResults.length > 1 && (
                <button 
                  onClick={downloadAllBatches} 
                  className="text-[11px] font-bold text-pink-400 flex items-center bg-pink-500/10 px-3 py-1 rounded-full border border-pink-500/20 active:bg-pink-500/20"
                >
                  <Download size={12} className="mr-1.5" />
                  Download All ({batchResults.length})
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {batchResults.map((res, idx) => (
                 <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden transition-colors">
                  <div 
                    className="p-3 flex items-center justify-between group hover:border-pink-500/30 cursor-pointer"
                    onClick={() => setExpandedBatchIndex(expandedBatchIndex === idx ? null : idx)}
                  >
                    <div className="min-w-0 pr-4 text-left">
                      <div className="text-xs font-bold text-slate-200 truncate">{res.fileName}</div>
                      <div className="text-[10px] text-slate-500 flex items-center space-x-2">
                         <span>{res.count} tracks</span>
                         <span className="text-slate-600">•</span>
                         <span className="italic opacity-50 truncate">from {res.originalName}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const a = document.createElement('a');
                          a.href = res.url;
                          a.download = res.fileName;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                        className="p-2 bg-slate-800 hover:bg-pink-500 hover:text-white text-slate-400 rounded-lg transition-colors"
                      >
                        <Download size={16} />
                      </button>
                      {expandedBatchIndex === idx ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </div>
                  </div>
                  
                  {expandedBatchIndex === idx && (
                    <div className="bg-slate-950/50 p-3 border-t border-slate-800/50 max-h-60 overflow-y-auto custom-scrollbar">
                      {res.tracks.map((track, tIdx) => (
                        <div key={tIdx} className="flex items-center space-x-3 py-1.5 border-b border-slate-800/50 last:border-0 relative group">
                          <div className="bg-slate-800/50 text-slate-500 rounded p-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
                            <Music size={12} />
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <div className="text-xs font-medium text-slate-200 truncate">{track.title}</div>
                            <div className="text-[10px] text-slate-500 truncate">{track.artist}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}