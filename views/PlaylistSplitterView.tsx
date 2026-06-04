import React, { useState } from 'react';
import { ArrowLeft, Scissors, Download, FileAudio, Check, Divide, ChevronDown, ChevronUp, Music } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { readFile } from '../services/sieveEngine';
import { downloadPlaylistFile } from '../services/downloadHelper';

interface PlaylistSplitterViewProps {
  onBack: () => void;
}

interface ParsedTrack {
  path: string;
  title: string;
  artist: string;
}

interface SplitResult {
  fileName: string;
  url: string;
  content: string;
  count: number;
  tracks: ParsedTrack[];
}

export default function PlaylistSplitterView({ onBack }: PlaylistSplitterViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [numParts, setNumParts] = useState(2);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<SplitResult[]>([]);
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

  const handleSplit = async () => {
    if (!file) return;
    setIsProcessing(true);
    setResults([]);

    try {
      const content = await readFile(file);
      const lines = content.split(/\r?\n/);
      const tracks: { meta: string; path: string }[] = [];
      let currentMeta = "";

      // Parse tracks maintaining order
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('#EXTM3U')) continue;

        if (trimmed.startsWith('#EXTINF')) {
          currentMeta = trimmed;
        } else if (trimmed.startsWith('#')) {
          // Skip other directives
        } else {
          tracks.push({ meta: currentMeta, path: trimmed });
          currentMeta = "";
        }
      }

      if (tracks.length === 0) {
        alert("No tracks found in playlist!");
        setIsProcessing(false);
        return;
      }

      const totalTracks = tracks.length;
      const chunkSize = Math.ceil(totalTracks / numParts);
      const newResults: SplitResult[] = [];

      for (let i = 0; i < numParts; i++) {
        const start = i * chunkSize;
        const end = start + chunkSize;
        const chunk = tracks.slice(start, end);

        if (chunk.length === 0) break;

        let outputContent = "#EXTM3U\n";
        const parsedChunkTracks: ParsedTrack[] = [];
        chunk.forEach(track => {
          if (track.meta) outputContent += track.meta + "\n";
          outputContent += track.path + "\n";
          
          const { title, artist } = parseExtInf(track.meta, track.path);
          parsedChunkTracks.push({ path: track.path, title, artist });
        });

        const blob = new Blob([outputContent], { type: 'audio/x-mpegurl' });
        const url = URL.createObjectURL(blob);
        const baseName = file.name.replace(/\.m3u8?$/i, "");
        
        newResults.push({
          fileName: `${baseName} (Part ${i + 1}).m3u`,
          url,
          content: outputContent,
          count: chunk.length,
          tracks: parsedChunkTracks
        });
      }

      setResults(newResults);

    } catch (err) {
      console.error("Split failed", err);
      alert("Failed to split playlist.");
    } finally {
      setIsProcessing(false);
      setExpandedIndex(null);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center space-x-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            Playlist Splitter
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Toolbox</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto w-full space-y-6">
        <div className="bg-orange-500/5 border border-orange-500/10 rounded-xl p-4 flex items-start space-x-3">
          <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400">
            <Scissors size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-orange-300 uppercase">Split Playlist</h4>
            <p className="text-[11px] text-slate-400 leading-tight mt-1">
              Divide a large playlist into equal smaller parts.
            </p>
          </div>
        </div>

        <FileUploader
          label="Source Playlist"
          subLabel="Select the playlist to split"
          files={file ? [file] : []}
          onFilesSelected={(files) => { setFile(files[0]); setResults([]); }}
          onClear={() => { setFile(null); setResults([]); }}
          multiple={false}
          accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel"
          colorClass="amber"
        />

        {file && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-sm font-bold flex items-center gap-2">
                <Divide size={16} className="text-orange-400" />
                Split into
              </span>
              <span className="text-xl font-black text-white">{numParts} <span className="text-xs font-normal text-slate-500">Parts</span></span>
            </div>
            <input 
              type="range" 
              min="2" 
              max="20" 
              step="1" 
              value={numParts}
              onChange={(e) => setNumParts(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>2 Parts</span>
              <span>20 Parts</span>
            </div>
          </div>
        )}

        <button
          onClick={handleSplit}
          disabled={!file || isProcessing}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] 
            ${file && !isProcessing
              ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-xl shadow-orange-900/20' 
              : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
        >
          {isProcessing ? <Scissors className="animate-spin" /> : <Scissors size={20} />}
          <span>{isProcessing ? 'Cutting...' : 'Split Playlist'}</span>
        </button>

        {results.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
             <div className="flex items-center space-x-2 text-emerald-400">
               <Check size={16} />
               <h3 className="text-sm font-bold uppercase tracking-widest">Done!</h3>
             </div>
             <div className="grid grid-cols-1 gap-3">
               {results.map((part, idx) => (
                 <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-colors">
                    <div 
                       className="p-3 flex items-center justify-between group hover:border-orange-500/30 cursor-pointer"
                       onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                         <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center text-slate-500 shrink-0">
                           <span className="font-bold text-xs">{idx + 1}</span>
                         </div>
                         <div className="min-w-0 pr-4">
                           <div className="text-xs font-bold text-slate-200 truncate">{part.fileName}</div>
                           <div className="text-[10px] text-slate-500">{part.count} tracks</div>
                         </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            await downloadPlaylistFile(part.content, part.fileName, 'audio/x-mpegurl');
                          }}
                          className="p-2 bg-slate-800 hover:bg-orange-500 hover:text-white text-slate-400 rounded-lg transition-colors"
                        >
                          <Download size={16} />
                        </button>
                        {expandedIndex === idx ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                      </div>
                    </div>
                    {expandedIndex === idx && (
                      <div className="bg-slate-950/50 p-3 border-t border-slate-800/50 max-h-60 overflow-y-auto custom-scrollbar">
                        {part.tracks.map((track, tIdx) => (
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
               ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}