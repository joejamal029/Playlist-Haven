import React, { useState } from 'react';
import { ArrowLeft, Merge, Download, FileAudio, Check, AlertCircle, Calendar, Archive, ChevronDown, ChevronUp, Music } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { readFile } from '../services/sieveEngine';
import JSZip from 'jszip';
import { downloadPlaylistFile } from '../services/downloadHelper';

interface PlaylistMergerViewProps {
  onBack: () => void;
}

interface ParsedTrack {
  path: string;
  title: string;
  artist: string;
}

type MergeMode = 'standard' | 'timeframe';
type DateFormat = 'DD MM YY' | 'DD-MM-YY' | 'DD.MM.YY' | 'DD MM YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'YYYY.MM.DD' | 'YYYYMMDD' | 'MM-DD-YYYY' | 'DD Month YYYY' | 'Month YYYY' | 'Week WW YYYY';
type GroupBy = 'Week' | 'Month' | 'Quarter' | 'Year';

export const AVAILABLE_FORMATS: { id: DateFormat; label: string }[] = [
  { id: 'DD MM YY', label: 'DD MM YY (e.g. 25 10 23)' },
  { id: 'DD-MM-YY', label: 'DD-MM-YY (e.g. 25-10-23)' },
  { id: 'DD.MM.YY', label: 'DD.MM.YY (e.g. 25.10.23)' },
  { id: 'DD MM YYYY', label: 'DD MM YYYY (e.g. 25 10 2023)' },
  { id: 'DD-MM-YYYY', label: 'DD-MM-YYYY (e.g. 25-10-2023)' },
  { id: 'YYYY-MM-DD', label: 'YYYY-MM-DD (e.g. 2023-10-25)' },
  { id: 'YYYY.MM.DD', label: 'YYYY.MM.DD (e.g. 2023.10.25)' },
  { id: 'YYYYMMDD', label: 'YYYYMMDD (e.g. 20231025)' },
  { id: 'MM-DD-YYYY', label: 'MM-DD-YYYY (e.g. 10-25-2023)' },
  { id: 'DD Month YYYY', label: 'DD Month YYYY (e.g. 25 October 2023)' },
  { id: 'Month YYYY', label: 'Month YYYY (e.g. October 2023)' },
  { id: 'Week WW YYYY', label: 'Week WW YYYY (e.g. Week 42 2023)' },
];

function extractDate(filename: string, formats: DateFormat[]): Date | null {
  const name = filename.replace(/\.[^/.]+$/, "");
  
  for (const format of formats) {
    if (format === 'DD MM YY') {
      const match = name.match(/(?:^|[^\d])(\d{2})\s+(\d{2})\s+(\d{2})(?:[^\d]|$)/);
      if (match) return new Date(2000 + parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }
    if (format === 'DD-MM-YY') {
      const match = name.match(/(?:^|[^\d])(\d{2})-(\d{2})-(\d{2})(?:[^\d]|$)/);
      if (match) return new Date(2000 + parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }
    if (format === 'DD.MM.YY') {
      const match = name.match(/(?:^|[^\d])(\d{2})\.(\d{2})\.(\d{2})(?:[^\d]|$)/);
      if (match) return new Date(2000 + parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }
    if (format === 'DD MM YYYY') {
      const match = name.match(/(?:^|[^\d])(\d{2})\s+(\d{2})\s+(\d{4})(?:[^\d]|$)/);
      if (match) return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }
    if (format === 'DD-MM-YYYY') {
      const match = name.match(/(?:^|[^\d])(\d{2})-(\d{2})-(\d{4})(?:[^\d]|$)/);
      if (match) return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }
    if (format === 'YYYY-MM-DD') {
      const match = name.match(/(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?:[^\d]|$)/);
      if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    if (format === 'YYYY.MM.DD') {
      const match = name.match(/(?:^|[^\d])(\d{4})\.(\d{2})\.(\d{2})(?:[^\d]|$)/);
      if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    if (format === 'YYYYMMDD') {
      const match = name.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/);
      if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    if (format === 'MM-DD-YYYY') {
      const match = name.match(/(?:^|[^\d])(\d{2})-(\d{2})-(\d{4})(?:[^\d]|$)/);
      if (match) return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
    }
    if (format === 'DD Month YYYY') {
      const match = name.match(/(?:^|[^\d])(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})(?:[^\d]|$)/i);
      if (match) {
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        return new Date(parseInt(match[3]), months.indexOf(match[2].toLowerCase()), parseInt(match[1]));
      }
    }
    if (format === 'Month YYYY') {
      const match = name.match(/(?:^|[^a-zA-Z])(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})(?:[^\d]|$)/i);
      if (match) {
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        return new Date(parseInt(match[2]), months.indexOf(match[1].toLowerCase()), 1);
      }
    }
    if (format === 'Week WW YYYY') {
      const match = name.match(/(?:^|[^a-zA-Z])Week\s+(\d{1,2})\s+(\d{4})(?:[^\d]|$)/i);
      if (match) {
        const week = parseInt(match[1]);
        const year = parseInt(match[2]);
        return new Date(year, 0, 1 + (week - 1) * 7);
      }
    }
  }
  return null;
}

function getGroupKey(date: Date, groupBy: GroupBy): string {
  if (groupBy === 'Week') {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    return `Week ${weekNo} ${d.getUTCFullYear()}`;
  }
  if (groupBy === 'Month') {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  if (groupBy === 'Year') {
    return `${date.getFullYear()}`;
  }
  if (groupBy === 'Quarter') {
    const q = Math.floor(date.getMonth() / 3) + 1;
    return `Q${q} ${date.getFullYear()}`;
  }
  return 'Unknown';
}

export default function PlaylistMergerView({ onBack }: PlaylistMergerViewProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deduplicate, setDeduplicate] = useState(true);
  
  const [mergeMode, setMergeMode] = useState<MergeMode>('standard');
  const [dateFormats, setDateFormats] = useState<DateFormat[]>(['DD MM YY', 'DD-MM-YY', 'YYYY-MM-DD']);
  const [groupBy, setGroupBy] = useState<GroupBy>('Month');
  const [outputPrefix, setOutputPrefix] = useState<string>('');
  const [outputFilename, setOutputFilename] = useState<string>('merged_playlist');

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultStats, setResultStats] = useState<{ count: number; duplicatesRemoved: number; groups?: number } | null>(null);
  const [isZip, setIsZip] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<{name: string, url: string, content: string, count: number, tracks: ParsedTrack[]}[]>([]);
  const [standardTracks, setStandardTracks] = useState<ParsedTrack[]>([]);
  const [expandedStandard, setExpandedStandard] = useState(false);
  const [expandedZipIndex, setExpandedZipIndex] = useState<number | null>(null);

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

  const processFiles = async (fileList: File[]) => {
    let outputContent = "#EXTM3U\n";
    const seenPaths = new Set<string>();
    let totalCount = 0;
    let duplicates = 0;
    const tracks: ParsedTrack[] = [];

    for (const file of fileList) {
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
          // Skip other comments
        } else {
          let keep = true;
          if (deduplicate) {
            if (seenPaths.has(trimmed)) {
              duplicates++;
              keep = false;
            } else {
              seenPaths.add(trimmed);
            }
          }
          
          if (keep) {
            if (currentMeta) outputContent += currentMeta + "\n";
            outputContent += trimmed + "\n";
            totalCount++;
            
            const { title, artist } = parseExtInf(currentMeta, trimmed);
            tracks.push({ path: trimmed, title, artist });
          }
          currentMeta = "";
        }
      }
    }
    return { content: outputContent, totalCount, duplicates, tracks };
  };

  const handleMerge = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    generatedFiles.forEach(f => URL.revokeObjectURL(f.url));
    
    setResultUrl(null);
    setResultStats(null);
    setIsZip(false);
    setGeneratedFiles([]);
    setStandardTracks([]);
    setExpandedStandard(false);
    setExpandedZipIndex(null);

    try {
      if (mergeMode === 'standard') {
        const { content, totalCount, duplicates, tracks } = await processFiles(files);
        const blob = new Blob([content], { type: 'audio/x-mpegurl' });
        const url = URL.createObjectURL(blob);
        setResultUrl(url);
        setResultBlob(blob);
        setResultStats({ count: totalCount, duplicatesRemoved: duplicates });
        setStandardTracks(tracks);
      } else {
        // Timeframe Merge
        const groups: Record<string, File[]> = {};
        
        for (const file of files) {
          const date = extractDate(file.name, dateFormats);
          const key = date ? getGroupKey(date, groupBy) : 'Ungrouped';
          if (!groups[key]) groups[key] = [];
          groups[key].push(file);
        }

        const zip = new JSZip();
        let totalCount = 0;
        let totalDuplicates = 0;
        let groupCount = 0;
        const newGeneratedFiles: {name: string, url: string, content: string, count: number, tracks: ParsedTrack[]}[] = [];

        for (const [key, groupFiles] of Object.entries(groups)) {
          const { content, totalCount: c, duplicates: d, tracks } = await processFiles(groupFiles);
          const filename = outputPrefix.trim() ? `${outputPrefix.trim()} - ${key}.m3u` : `${key}.m3u`;
          zip.file(filename, content);
          
          const blob = new Blob([content], { type: 'audio/x-mpegurl' });
          const url = URL.createObjectURL(blob);
          newGeneratedFiles.push({ name: filename, url, content, count: c, tracks });

          totalCount += c;
          totalDuplicates += d;
          groupCount++;
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        setResultUrl(url);
        setResultBlob(zipBlob);
        setIsZip(true);
        setGeneratedFiles(newGeneratedFiles);
        setResultStats({ count: totalCount, duplicatesRemoved: totalDuplicates, groups: groupCount });
      }
    } catch (err) {
      console.error("Merge failed", err);
      alert("Failed to merge playlists. Check console for details.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!resultBlob) return;
    if (isZip) {
      await downloadPlaylistFile(resultBlob, `Merged_Playlists_${groupBy}.zip`, 'application/zip');
    } else {
      const name = outputFilename.trim() ? outputFilename.trim() : 'merged_playlist';
      await downloadPlaylistFile(resultBlob, `${name}.m3u`, 'audio/x-mpegurl');
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center space-x-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            Playlist Merger
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Toolbox</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-6">
        <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-4 flex items-start space-x-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
            <Merge size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-cyan-300 uppercase">Combine Playlists</h4>
            <p className="text-[11px] text-slate-400 leading-tight mt-1">
              Merge multiple .m3u files into a single playlist, or group them smartly by timeframe.
            </p>
          </div>
        </div>

        <FileUploader
          label="Playlists to Merge"
          subLabel="Drag & drop or select multiple files"
          files={files}
          onFilesSelected={(newFiles) => setFiles(prev => [...prev, ...newFiles])}
          onClear={() => { 
            setFiles([]); 
            if (resultUrl) URL.revokeObjectURL(resultUrl);
            generatedFiles.forEach(f => URL.revokeObjectURL(f.url));
            setResultUrl(null); 
            setGeneratedFiles([]);
            setStandardTracks([]);
            setExpandedStandard(false);
            setExpandedZipIndex(null);
          }}
          multiple={true}
          accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel"
          colorClass="cyan"
        />

        {files.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                <Merge size={14} className="mr-2" />
                Merge Strategy
              </h3>
              <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button 
                  onClick={() => setMergeMode('standard')}
                  className={`text-[10px] px-3 py-1 rounded-md font-bold transition-colors ${mergeMode === 'standard' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Standard
                </button>
                <button 
                  onClick={() => setMergeMode('timeframe')}
                  className={`text-[10px] px-3 py-1 rounded-md font-bold transition-colors ${mergeMode === 'timeframe' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Timeframe
                </button>
              </div>
            </div>

            {mergeMode === 'standard' && (
              <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 space-y-3 animate-in fade-in slide-in-from-top-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">Output Filename</label>
                  <div className="flex items-center">
                    <input 
                      type="text" 
                      value={outputFilename} 
                      onChange={(e) => setOutputFilename(e.target.value)}
                      placeholder="merged_playlist"
                      className="w-full bg-slate-800 border border-slate-700 rounded-l p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                    />
                    <span className="bg-slate-800 border-t border-b border-r border-slate-700 rounded-r p-2 text-xs text-slate-500">.m3u</span>
                  </div>
                </div>
              </div>
            )}

            {mergeMode === 'timeframe' && (
              <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center space-x-2 text-cyan-400/80 mb-2">
                  <Calendar size={14} />
                  <span className="text-xs font-bold">Smart Grouping</span>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Output Prefix (Optional)</label>
                    <input 
                      type="text" 
                      value={outputPrefix} 
                      onChange={(e) => setOutputPrefix(e.target.value)}
                      placeholder="e.g. My Playlist"
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Group Into</label>
                    <select 
                      value={groupBy} 
                      onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                    >
                      <option value="Week">Week (e.g. Week 42 2023)</option>
                      <option value="Month">Month (e.g. October 2023)</option>
                      <option value="Quarter">Quarter (e.g. Q4 2023)</option>
                      <option value="Year">Year (e.g. 2023)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold block mb-1">Date Formats to Check (Select multiple)</label>
                    <div className="max-h-32 overflow-y-auto bg-slate-800 border border-slate-700 rounded p-2 space-y-1 custom-scrollbar">
                      {AVAILABLE_FORMATS.map(format => (
                        <label key={format.id} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-700/50 p-1 rounded">
                          <input 
                            type="checkbox" 
                            checked={dateFormats.includes(format.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setDateFormats(prev => {
                                  const next = [...prev, format.id];
                                  return next.sort((a, b) => {
                                    const indexA = AVAILABLE_FORMATS.findIndex(f => f.id === a);
                                    const indexB = AVAILABLE_FORMATS.findIndex(f => f.id === b);
                                    return indexA - indexB;
                                  });
                                });
                              } else {
                                setDateFormats(prev => prev.filter(f => f !== format.id));
                              }
                            }}
                            className="rounded border-slate-600 text-cyan-500 focus:ring-cyan-500 bg-slate-900"
                          />
                          <span className="text-xs text-slate-300">{format.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight mt-2">
                  Playlists will be parsed and combined into separate files based on the timeframe, then exported as a ZIP archive.
                  <br/>
                  <span className="text-cyan-400 mt-1 inline-block">Example Output: {outputPrefix.trim() ? `${outputPrefix.trim()} - ` : ''}{groupBy === 'Month' ? 'October 2023' : groupBy === 'Year' ? '2023' : groupBy === 'Quarter' ? 'Q4 2023' : 'Week 42 2023'}.m3u</span>
                </p>
              </div>
            )}

            <div className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-800/50 rounded-lg">
                <div className="flex items-center space-x-3">
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${deduplicate ? 'bg-cyan-500' : 'bg-slate-700'}`}>
                        <input 
                            type="checkbox" 
                            checked={deduplicate} 
                            onChange={(e) => setDeduplicate(e.target.checked)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${deduplicate ? 'left-4.5' : 'left-0.5'}`} style={{ left: deduplicate ? 'calc(100% - 14px)' : '2px' }} />
                    </div>
                    <span className="text-xs font-bold text-slate-300">Remove Duplicates</span>
                </div>
                {deduplicate && <span className="text-[10px] text-slate-500 italic">Recommended</span>}
            </div>
          </div>
        )}

        <button
          onClick={handleMerge}
          disabled={files.length === 0 || isProcessing}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] 
            ${files.length > 0 && !isProcessing
              ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 text-white shadow-xl shadow-cyan-900/20' 
              : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
        >
          {isProcessing ? <Merge className="animate-spin" /> : <Merge size={20} />}
          <span>{isProcessing ? 'Merging...' : (mergeMode === 'timeframe' ? 'Group & Merge' : 'Merge Playlists')}</span>
        </button>

        {resultUrl && resultStats && (
           <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4">
               <div className="p-6 flex flex-col items-center text-center border-b border-slate-800 w-full relative">
                 <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-3">
                     {isZip ? <Archive size={24} /> : <Check size={24} />}
                 </div>
                 <h3 className="text-lg font-bold text-white mb-1">Merge Complete!</h3>
                 <div className="flex space-x-4 text-[11px] text-slate-400 mb-6">
                     <span className="px-2 py-1 bg-slate-800 rounded">Total Songs: <span className="text-slate-200 font-bold">{resultStats.count}</span></span>
                     {deduplicate && (
                          <span className="px-2 py-1 bg-slate-800 rounded">Removed: <span className="text-rose-400 font-bold">{resultStats.duplicatesRemoved}</span></span>
                     )}
                     {isZip && resultStats.groups && (
                          <span className="px-2 py-1 bg-slate-800 rounded">Groups: <span className="text-cyan-400 font-bold">{resultStats.groups}</span></span>
                     )}
                 </div>
                 
                 {!isZip && standardTracks.length > 0 && (
                     <button
                        onClick={() => setExpandedStandard(!expandedStandard)}
                        className="absolute right-4 top-4 p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
                     >
                        {expandedStandard ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                     </button>
                 )}
                 <button 
                   onClick={handleDownload}
                   className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center space-x-2 transition-all"
                 >
                   <Download size={16} />
                   <span className="font-bold">{isZip ? 'Download ZIP Archive' : 'Download Merged File'}</span>
                 </button>
               </div>

               {!isZip && expandedStandard && standardTracks.length > 0 && (
                 <div className="bg-slate-950/50 p-3 max-h-80 overflow-y-auto custom-scrollbar">
                   {standardTracks.map((track, tIdx) => (
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

               {isZip && generatedFiles.length > 0 && (
                 <div className="w-full p-4 space-y-2 text-left bg-slate-900 border-t border-slate-800">
                   <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-800 pb-2">Individual Playlists</h4>
                   <div className="max-h-[400px] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                     {generatedFiles.map((file, idx) => (
                       <div key={idx} className="bg-slate-950/50 border border-slate-800/50 rounded-lg overflow-hidden">
                         <div 
                            className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors"
                            onClick={() => setExpandedZipIndex(expandedZipIndex === idx ? null : idx)}
                         >
                           <div className="flex flex-col overflow-hidden mr-2">
                             <span className="text-sm font-medium text-slate-200 truncate">{file.name}</span>
                             <span className="text-[10px] text-slate-500 hover:text-cyan-400 transition-colors">{file.count} tracks</span>
                           </div>
                           <div className="flex items-center space-x-2">
                             <button
                               onClick={async (e) => {
                                 e.stopPropagation();
                                 await downloadPlaylistFile(file.content, file.name, 'audio/x-mpegurl');
                               }}
                               className="p-2 bg-slate-800 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-colors flex-shrink-0"
                               title="Download Individual File"
                             >
                               <Download size={14} />
                             </button>
                             {expandedZipIndex === idx ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                           </div>
                         </div>
                         
                         {expandedZipIndex === idx && (
                           <div className="bg-slate-900 p-3 border-t border-slate-800/50 max-h-60 overflow-y-auto custom-scrollbar">
                             {file.tracks.map((track, tIdx) => (
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
        )}
      </div>
    </div>
  );
}