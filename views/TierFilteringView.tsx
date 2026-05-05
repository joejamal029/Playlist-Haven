import React, { useState } from 'react';
import { ArrowLeft, Filter, Layers, Settings2, Download, Check, Combine, ChevronDown, ChevronUp, Music } from 'lucide-react';
import FileUploader from '../components/FileUploader';

interface TierFilteringViewProps {
  onBack: () => void;
}

type RuleType = 'topN' | 'range' | 'percent';

interface Rule {
  type: RuleType;
  value1: number; // N, Start, or Percent
  value2: number; // End (for range)
}

interface M3USong {
  extinf: string;
  url: string;
  title: string;
  artist: string;
}

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

const parseM3U = (content: string): M3USong[] => {
  const lines = content.split(/\r?\n/);
  const songs: M3USong[] = [];
  let currentExtinf = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.toUpperCase() === '#EXTM3U') continue;
    
    if (trimmed.toUpperCase().startsWith('#EXTINF')) {
      currentExtinf = trimmed;
    } else if (!trimmed.startsWith('#')) {
      const { title, artist } = parseExtInf(currentExtinf, trimmed);
      songs.push({ extinf: currentExtinf, url: trimmed, title, artist });
      currentExtinf = ''; // reset for next
    }
  }
  return songs;
};

export default function TierFilteringView({ onBack }: TierFilteringViewProps) {
  const [files, setFiles] = useState<File[]>([]);
  
  const [useGlobalRule, setUseGlobalRule] = useState(true);
  const [globalRule, setGlobalRule] = useState<Rule>({ type: 'topN', value1: 50, value2: 100 });
  const [playlistRules, setPlaylistRules] = useState<Record<string, Rule>>({});
  
  const [deduplicate, setDeduplicate] = useState(true);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState(0);
  const [resultTracks, setResultTracks] = useState<M3USong[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedResult, setExpandedResult] = useState(false);

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles(prev => {
      const combined = [...prev, ...newFiles];
      // Initialize rules for new files
      const newRules = { ...playlistRules };
      newFiles.forEach(f => {
        if (!newRules[f.name]) {
          newRules[f.name] = { type: 'topN', value1: 50, value2: 100 };
        }
      });
      setPlaylistRules(newRules);
      return combined;
    });
    setResultUrl(null);
  };

  const updatePlaylistRule = (filename: string, rule: Rule) => {
    setPlaylistRules(prev => ({ ...prev, [filename]: rule }));
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    try {
      let combinedSongs: M3USong[] = [];
      
      for (const file of files) {
        const text = await file.text();
        const songs = parseM3U(text);
        const rule = useGlobalRule ? globalRule : (playlistRules[file.name] || { type: 'topN', value1: 50, value2: 100 });
        
        let filtered: M3USong[] = [];
        if (rule.type === 'topN') {
          filtered = songs.slice(0, rule.value1);
        } else if (rule.type === 'percent') {
          const count = Math.ceil(songs.length * (rule.value1 / 100));
          filtered = songs.slice(0, count);
        } else if (rule.type === 'range') {
          const start = Math.max(0, rule.value1 - 1);
          const end = rule.value2;
          filtered = songs.slice(start, end);
        }
        
        combinedSongs = [...combinedSongs, ...filtered];
      }
      
      if (deduplicate) {
        const seen = new Set<string>();
        combinedSongs = combinedSongs.filter(song => {
          const id = song.url || song.extinf;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }
      
      let m3uContent = "#EXTM3U\n";
      combinedSongs.forEach(song => {
        if (song.extinf) m3uContent += song.extinf + "\n";
        if (song.url) m3uContent += song.url + "\n";
      });
      
      const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
      setResultUrl(URL.createObjectURL(blob));
      setResultCount(combinedSongs.length);
      setResultTracks(combinedSongs);
      setExpandedResult(false);
    } catch (error) {
      console.error("Error processing playlists:", error);
      alert("An error occurred while processing the playlists.");
    } finally {
      setIsProcessing(false);
    }
  };

  const RulePicker = ({ rule, onChange }: { rule: Rule, onChange: (r: Rule) => void }) => (
    <div className="flex items-center space-x-2">
      <select 
        value={rule.type} 
        onChange={e => onChange({ ...rule, type: e.target.value as RuleType })}
        className="bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500"
      >
        <option value="topN">Top N</option>
        <option value="range">Range</option>
        <option value="percent">Percentage</option>
      </select>
      
      {rule.type === 'topN' && (
        <input type="number" min="1" value={rule.value1} onChange={e => onChange({ ...rule, value1: parseInt(e.target.value) || 1 })} className="w-16 bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" placeholder="N" />
      )}
      {rule.type === 'percent' && (
        <div className="flex items-center space-x-1">
          <input type="number" min="1" max="100" value={rule.value1} onChange={e => onChange({ ...rule, value1: parseInt(e.target.value) || 1 })} className="w-16 bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" placeholder="%" />
          <span className="text-xs text-slate-500">%</span>
        </div>
      )}
      {rule.type === 'range' && (
        <div className="flex items-center space-x-1">
          <input type="number" min="1" value={rule.value1} onChange={e => onChange({ ...rule, value1: parseInt(e.target.value) || 1 })} className="w-16 bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" placeholder="Start" />
          <span className="text-xs text-slate-500">-</span>
          <input type="number" min="1" value={rule.value2} onChange={e => onChange({ ...rule, value2: parseInt(e.target.value) || 1 })} className="w-16 bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none" placeholder="End" />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center space-x-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Tier Filtering
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Extract & Combine</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-6">
        
        {/* Section 1: Upload */}
        <section>
          <FileUploader
            label="Upload Playlists"
            subLabel="Select multiple M3U files to filter and combine"
            files={files}
            onFilesSelected={handleFilesSelected}
            onClear={() => { setFiles([]); setResultUrl(null); }}
            multiple={true}
            accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel"
            colorClass="emerald"
          />
        </section>

        {files.length > 0 && (
          <>
            {/* Section 2: Rule Configuration */}
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                  <Settings2 size={14} className="mr-2" />
                  Filtering Rules
                </h3>
                <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button 
                    onClick={() => setUseGlobalRule(true)}
                    className={`text-[10px] px-3 py-1 rounded-md font-bold transition-colors ${useGlobalRule ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Global Rule
                  </button>
                  <button 
                    onClick={() => setUseGlobalRule(false)}
                    className={`text-[10px] px-3 py-1 rounded-md font-bold transition-colors ${!useGlobalRule ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Per Playlist
                  </button>
                </div>
              </div>

              {useGlobalRule ? (
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-medium">Apply to all {files.length} playlists:</span>
                  <RulePicker rule={globalRule} onChange={setGlobalRule} />
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                  {files.map((file, idx) => (
                    <div key={idx} className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-xs text-slate-300 font-medium truncate pr-4 max-w-[50%]">{file.name}</span>
                      <RulePicker 
                        rule={playlistRules[file.name] || { type: 'topN', value1: 50, value2: 100 }} 
                        onChange={(r) => updatePlaylistRule(file.name, r)} 
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Section 3: Combine Options & Process */}
            <section className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-emerald-500/30 transition-colors" onClick={() => setDeduplicate(!deduplicate)}>
                <div className="flex items-center space-x-3">
                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${deduplicate ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-800 border-slate-700'}`}>
                    {deduplicate && <Check size={14} className="text-white" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">Deduplicate Songs</h4>
                    <p className="text-[10px] text-slate-500">Remove duplicate tracks from the combined list</p>
                  </div>
                </div>
                <Combine size={18} className={deduplicate ? "text-emerald-400" : "text-slate-600"} />
              </div>

              <button
                onClick={handleProcess}
                disabled={isProcessing}
                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] 
                  ${!isProcessing 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-900/20' 
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
              >
                <Filter size={20} />
                <span>{isProcessing ? 'Processing...' : 'Filter & Combine'}</span>
              </button>
            </section>
          </>
        )}

        {/* Section 4: Results */}
        {resultUrl && (
          <section className="animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
               <div className="p-4 flex flex-col items-center text-center border-b border-slate-800 w-full relative">
                 <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-3">
                     <Check size={24} />
                 </div>
                 <h3 className="text-lg font-bold text-white mb-1">Processing Complete!</h3>
                 <div className="flex space-x-4 text-[11px] text-slate-400 mb-6">
                     <span className="px-2 py-1 bg-slate-800 rounded">Total Tracks: <span className="text-slate-200 font-bold">{resultCount}</span></span>
                     <span className="px-2 py-1 bg-slate-800 rounded">Playlists: <span className="text-slate-200 font-bold">{files.length}</span></span>
                 </div>
                 
                 {resultTracks.length > 0 && (
                     <button
                        onClick={() => setExpandedResult(!expandedResult)}
                        className="absolute right-4 top-4 p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
                     >
                        {expandedResult ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                     </button>
                 )}
                 <a 
                   href={resultUrl}
                   download="Tier_Filtered_Combined.m3u"
                   className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center space-x-2 transition-all"
                 >
                   <Download size={16} />
                   <span className="font-bold">Download File</span>
                 </a>
               </div>

               {expandedResult && resultTracks.length > 0 && (
                 <div className="bg-slate-950/50 p-3 max-h-80 overflow-y-auto custom-scrollbar">
                   {resultTracks.map((track, tIdx) => (
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
          </section>
        )}

      </div>
    </div>
  );
}
