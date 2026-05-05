import React, { useState } from 'react';
import { ArrowLeft, BarChart3, Download, Search, CheckCircle2, ListFilter, ChevronDown, ChevronUp, Music } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { readFile } from '../services/sieveEngine';

interface PlaylistAppearanceViewProps {
  onBack: () => void;
}

interface ParsedTrack {
  path: string;
  title: string;
  artist: string;
}

interface AppearanceResult {
  fileName: string;
  url: string;
  trackCount: number;
  appearanceLevel: number;
  tracks: ParsedTrack[];
}

export default function PlaylistAppearanceView({ onBack }: PlaylistAppearanceViewProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [groupName, setGroupName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<AppearanceResult[]>([]);
  const [expandedLevel, setExpandedLevel] = useState<number | null>(null);

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

  const handleAnalyze = async () => {
    if (files.length === 0 || !groupName.trim()) return;
    setIsProcessing(true);
    
    // Cleanup old URLs
    results.forEach(r => URL.revokeObjectURL(r.url));
    setResults([]);

    try {
      const trackCounts = new Map<string, number>();
      const trackMetadata = new Map<string, string>();

      // 1. Ingest all files
      for (const file of files) {
        const content = await readFile(file);
        const lines = content.split(/\r?\n/);
        
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
             // It's a track path
             const currentCount = trackCounts.get(trimmed) || 0;
             trackCounts.set(trimmed, currentCount + 1);
             
             // Save metadata if we don't have it, or if it's the first time
             if (currentMeta && !trackMetadata.has(trimmed)) {
                 trackMetadata.set(trimmed, currentMeta);
             }
             currentMeta = "";
          }
        }
      }

      // 2. Group by appearance count
      const groupedByCount = new Map<number, string[]>();
      
      trackCounts.forEach((count, path) => {
          if (!groupedByCount.has(count)) {
              groupedByCount.set(count, []);
          }
          groupedByCount.get(count)!.push(path);
      });

      // 3. Generate Files
      const newResults: AppearanceResult[] = [];
      const levels = Array.from(groupedByCount.keys()).sort((a, b) => b - a);

      for (const level of levels) {
          const tracks = groupedByCount.get(level)!;
          let outputContent = "#EXTM3U\n";
          const parsedTracks: ParsedTrack[] = [];
          
          tracks.sort().forEach(path => {
              const meta = trackMetadata.get(path);
              if (meta) {
                  outputContent += meta + "\n";
              } else {
                  // Fallback generic metadata for better generic outputs
                  const { title, artist } = parseExtInf("", path);
                  outputContent += `#EXTINF:-1,${artist} - ${title}\n`;
              }
              outputContent += path + "\n";
              
              const { title, artist } = parseExtInf(meta || "", path);
              parsedTracks.push({ path, title, artist });
          });

          const blob = new Blob([outputContent], { type: 'audio/x-mpegurl' });
          const url = URL.createObjectURL(blob);
          const fileName = `${level} Appearance ${groupName.trim()}.m3u`;

          newResults.push({
              fileName,
              url,
              trackCount: tracks.length,
              appearanceLevel: level,
              tracks: parsedTracks
          });
      }

      setResults(newResults);
      setExpandedLevel(null);

    } catch (err) {
      console.error("Analysis failed", err);
      alert("Failed to analyze playlists.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadAll = () => {
    results.forEach((res, index) => {
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
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center space-x-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-sky-400 to-blue-400 bg-clip-text text-transparent">
            Appearance Counter
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Analytics</p>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto w-full space-y-6 pb-20">
        
        <div className="bg-sky-500/5 border border-sky-500/10 rounded-xl p-4 flex items-start space-x-3">
          <div className="p-2 bg-sky-500/10 rounded-lg text-sky-400">
            <BarChart3 size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-sky-300 uppercase">Frequency Analysis</h4>
            <p className="text-[11px] text-slate-400 leading-tight mt-1">
              Upload a collection of playlists. Songs will be grouped into new playlists based on how many times they appear across the collection.
            </p>
          </div>
        </div>

        <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                Playlist Group Name
            </label>
            <input
                type="text"
                placeholder="e.g. Summer Collection"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full bg-slate-900 border-2 border-slate-800 focus:border-sky-500/50 rounded-xl py-3 px-4 text-sm text-slate-200 outline-none transition-all placeholder:text-slate-700 font-bold"
            />
             <p className="text-[10px] text-slate-600 mt-2 px-1">
                Output Format: <span className="font-mono text-sky-500">X Appearance {groupName || 'Group Name'}.m3u</span>
            </p>
        </div>

        <FileUploader
          label="Collection Files"
          subLabel="Upload all playlists to cross-reference"
          files={files}
          onFilesSelected={(newFiles) => { setFiles(prev => [...prev, ...newFiles]); setResults([]); }}
          onClear={() => { setFiles([]); setResults([]); }}
          multiple={true}
          colorClass="sky"
        />

        <button
          onClick={handleAnalyze}
          disabled={files.length === 0 || !groupName.trim() || isProcessing}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] 
            ${files.length > 0 && groupName.trim() && !isProcessing
              ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-xl shadow-sky-900/20' 
              : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
        >
          {isProcessing ? <BarChart3 className="animate-spin" /> : <Search size={20} />}
          <span>{isProcessing ? 'Analyzing...' : 'Count Appearances'}</span>
        </button>

        {results.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Analysis Results</h3>
              {results.length > 1 && (
                <button 
                  onClick={downloadAll} 
                  className="text-[11px] font-bold text-sky-400 flex items-center bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20 active:bg-sky-500/20"
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
                    className="p-3 flex items-center justify-between group hover:border-sky-500/30 cursor-pointer"
                    onClick={() => setExpandedLevel(expandedLevel === res.appearanceLevel ? null : res.appearanceLevel)}
                  >
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center space-x-2 mb-1">
                          <span className="bg-sky-500/20 text-sky-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-sky-500/30">
                              {res.appearanceLevel}x
                          </span>
                          <div className="text-xs font-bold text-slate-200 truncate">{res.fileName}</div>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center space-x-2">
                         <span>{res.trackCount} tracks found</span>
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
                        className="p-2 bg-slate-800 hover:bg-sky-500 hover:text-white text-slate-400 rounded-lg transition-colors"
                      >
                        <Download size={16} />
                      </button>
                      {expandedLevel === res.appearanceLevel ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </div>
                  </div>
                  {expandedLevel === res.appearanceLevel && (
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