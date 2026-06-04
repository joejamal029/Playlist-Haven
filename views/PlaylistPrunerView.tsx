import React, { useState } from 'react';
import { ArrowLeft, Eraser, Download, FileMinus, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Music } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { readFile } from '../services/sieveEngine';
import { downloadPlaylistFile } from '../services/downloadHelper';

interface PlaylistPrunerViewProps {
  onBack: () => void;
}

interface ParsedTrack {
  path: string;
  title: string;
  artist: string;
}

interface PruneResult {
  fileName: string;
  url: string;
  content: string;
  originalCount: number;
  removedCount: number;
  finalCount: number;
  tracks: ParsedTrack[];
}

export default function PlaylistPrunerView({ onBack }: PlaylistPrunerViewProps) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [targetFiles, setTargetFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<PruneResult[]>([]);
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

  const parseTracks = (content: string) => {
    const lines = content.split(/\r?\n/);
    const tracks = new Set<string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        tracks.add(trimmed);
      }
    }
    return tracks;
  };

  const handlePrune = async () => {
    if (!sourceFile || targetFiles.length === 0) return;
    setIsProcessing(true);
    
    // Cleanup old URLs
    results.forEach(r => URL.revokeObjectURL(r.url));
    setResults([]);

    try {
      // 1. Process Source File to get the "Blacklist" of tracks
      const sourceContent = await readFile(sourceFile);
      const tracksToRemove = parseTracks(sourceContent);

      const newResults: PruneResult[] = [];

      // 2. Process each Target File
      for (const file of targetFiles) {
        const content = await readFile(file);
        const lines = content.split(/\r?\n/);
        
        let outputContent = "#EXTM3U\n";
        let currentMeta = "";
        let originalCount = 0;
        let keptCount = 0;
        const parsedTracks: ParsedTrack[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('#EXTM3U')) continue;

          if (trimmed.startsWith('#EXTINF')) {
            currentMeta = trimmed;
          } else if (trimmed.startsWith('#')) {
            // Skip comments
          } else {
            // It's a track path
            originalCount++;
            if (tracksToRemove.has(trimmed)) {
              // PRUNE IT: Do not add to output, clear metadata
              currentMeta = "";
            } else {
              // KEEP IT
              if (currentMeta) outputContent += currentMeta + "\n";
              outputContent += trimmed + "\n";
              keptCount++;
              
              const { title, artist } = parseExtInf(currentMeta, trimmed);
              parsedTracks.push({ path: trimmed, title, artist });
              
              currentMeta = "";
            }
          }
        }

        const blob = new Blob([outputContent], { type: 'audio/x-mpegurl' });
        const url = URL.createObjectURL(blob);
        
        newResults.push({
          fileName: file.name, // Keeping original name as requested
          url,
          content: outputContent,
          originalCount,
          removedCount: originalCount - keptCount,
          finalCount: keptCount,
          tracks: parsedTracks
        });
      }

      setResults(newResults);

    } catch (err) {
      console.error("Pruning failed", err);
      alert("Failed to prune playlists.");
    } finally {
      setIsProcessing(false);
      setExpandedIndex(null);
    }
  };

  const downloadAll = async () => {
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      await new Promise(resolve => setTimeout(resolve, i * 200));
      await downloadPlaylistFile(res.content, res.fileName, 'audio/x-mpegurl');
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center space-x-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-rose-400 to-red-400 bg-clip-text text-transparent">
            Playlist Pruner
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Toolbox</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto w-full space-y-6 pb-20">
        
        <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-4 flex items-start space-x-3">
          <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400">
            <Eraser size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-rose-300 uppercase">Smart Remove</h4>
            <p className="text-[11px] text-slate-400 leading-tight mt-1">
              Upload a <strong>Source Playlist</strong> containing songs you want to remove. 
              Then upload <strong>Target Playlists</strong> to clean them.
            </p>
          </div>
        </div>

        <FileUploader
          label="Source Playlist (The Eraser)"
          subLabel="Songs in this file will be removed from others"
          files={sourceFile}
          onFilesSelected={(files) => { setSourceFile(files[0]); setResults([]); }}
          onClear={() => { setSourceFile(null); setResults([]); }}
          multiple={false}
          accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel"
          colorClass="rose"
        />

        <div className="flex justify-center -my-2 z-10 relative">
            <div className="bg-slate-900 p-1 rounded-full border border-slate-800 text-slate-500">
                <ArrowLeft className="rotate-[-90deg]" size={16} />
            </div>
        </div>

        <FileUploader
          label="Target Playlists (To Clean)"
          subLabel="Select files to strip source songs from"
          files={targetFiles}
          onFilesSelected={(newFiles) => { setTargetFiles(prev => [...prev, ...newFiles]); setResults([]); }}
          onClear={() => { setTargetFiles([]); setResults([]); }}
          multiple={true}
          accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel"
          colorClass="blue"
        />

        <button
          onClick={handlePrune}
          disabled={!sourceFile || targetFiles.length === 0 || isProcessing}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] 
            ${sourceFile && targetFiles.length > 0 && !isProcessing
              ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-xl shadow-rose-900/20' 
              : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
        >
          {isProcessing ? <Eraser className="animate-spin" /> : <FileMinus size={24} />}
          <span>{isProcessing ? 'Pruning...' : 'Prune Playlists'}</span>
        </button>

        {results.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cleaned Playlists</h3>
              {results.length > 1 && (
                <button 
                  onClick={downloadAll} 
                  className="text-[11px] font-bold text-rose-400 flex items-center bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20 active:bg-rose-500/20"
                >
                  <Download size={12} className="mr-1.5" />
                  Download All ({results.length})
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {results.map((res, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-colors">
                  <div 
                    className="p-3 flex items-center justify-between group hover:border-rose-500/30 cursor-pointer"
                    onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                  >
                    <div className="min-w-0 pr-4">
                      <div className="text-xs font-bold text-slate-200 truncate">{res.fileName}</div>
                      <div className="text-[10px] text-slate-500 flex items-center space-x-2 mt-1">
                         {res.removedCount > 0 ? (
                             <span className="text-rose-400 font-bold">-{res.removedCount} removed</span>
                         ) : (
                             <span className="text-emerald-500 font-bold">Clean</span>
                         )}
                         <span className="text-slate-700">|</span>
                         <span>{res.finalCount} tracks remaining</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          await downloadPlaylistFile(res.content, res.fileName, 'audio/x-mpegurl');
                        }}
                        className="p-2 bg-slate-800 hover:bg-rose-500 hover:text-white text-slate-400 rounded-lg transition-colors"
                      >
                        <Download size={16} />
                      </button>
                      {expandedIndex === idx ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </div>
                  </div>
                  {expandedIndex === idx && (
                    <div className="bg-slate-950/50 p-3 border-t border-slate-800/50 max-h-60 overflow-y-auto custom-scrollbar">
                      {res.tracks.map((track, tIdx) => (
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