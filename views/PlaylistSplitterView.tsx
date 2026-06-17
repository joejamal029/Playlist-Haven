import React, { useState } from 'react';
import { ArrowLeft, Scissors, Download, Check, Divide, ChevronDown, ChevronUp, Music, Shuffle, Trash, X } from 'lucide-react';
import JSZip from 'jszip';
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

interface PlaylistJob {
  id: string;
  file: File;
  tracks: { meta: string; path: string }[];
  originalTracks: { meta: string; path: string }[];
  shuffleCount: number;
  showPreview: boolean;
  status: 'idle' | 'processing' | 'done' | 'error';
  results: SplitResult[];
}

export default function PlaylistSplitterView({ onBack }: PlaylistSplitterViewProps) {
  const [jobs, setJobs] = useState<PlaylistJob[]>([]);
  const [numParts, setNumParts] = useState(2);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<{ jobId: string; partIdx: number } | null>(null);

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

  const parseM3UContent = (content: string) => {
    const lines = content.split(/\r?\n/);
    const parsedTracks: { meta: string; path: string }[] = [];
    let currentMeta = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#EXTM3U')) continue;

      if (trimmed.startsWith('#EXTINF')) {
        currentMeta = trimmed;
      } else if (trimmed.startsWith('#')) {
        // Skip other directives
      } else {
        parsedTracks.push({ meta: currentMeta, path: trimmed });
        currentMeta = "";
      }
    }
    return parsedTracks;
  };

  const handleFilesSelected = async (selectedFiles: File[]) => {
    const newJobs: PlaylistJob[] = [];
    for (const file of selectedFiles) {
      // Check if file is already in queue
      if (jobs.some(j => j.file.name === file.name && j.file.size === file.size)) {
        continue;
      }
      try {
        const content = await readFile(file);
        const parsedTracks = parseM3UContent(content);
        newJobs.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          tracks: parsedTracks,
          originalTracks: [...parsedTracks],
          shuffleCount: 0,
          showPreview: true,
          status: 'idle',
          results: []
        });
      } catch (err) {
        console.error("Failed to parse playlist file", file.name, err);
        alert(`Failed to parse playlist file: ${file.name}`);
      }
    }
    setJobs(prev => [...prev, ...newJobs]);
  };

  const clearQueue = () => {
    setJobs([]);
    setExpandedIndex(null);
  };

  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(job => job.id !== id));
    if (expandedIndex?.jobId === id) setExpandedIndex(null);
  };

  const handleLocalShuffle = (id: string) => {
    setJobs(prev => prev.map(job => {
      if (job.id !== id || job.tracks.length === 0) return job;
      const shuffled = [...job.tracks];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return {
        ...job,
        tracks: shuffled,
        shuffleCount: job.shuffleCount + 1
      };
    }));
  };

  const handleLocalReset = (id: string) => {
    setJobs(prev => prev.map(job => {
      if (job.id !== id) return job;
      return {
        ...job,
        tracks: [...job.originalTracks],
        shuffleCount: 0
      };
    }));
  };

  const toggleLocalPreview = (id: string) => {
    setJobs(prev => prev.map(job => {
      if (job.id !== id) return job;
      return {
        ...job,
        showPreview: !job.showPreview
      };
    }));
  };

  const handleBulkShuffle = () => {
    setJobs(prev => prev.map(job => {
      if (job.tracks.length === 0) return job;
      const shuffled = [...job.tracks];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return {
        ...job,
        tracks: shuffled,
        shuffleCount: job.shuffleCount + 1
      };
    }));
  };

  const handleBulkReset = () => {
    setJobs(prev => prev.map(job => {
      return {
        ...job,
        tracks: [...job.originalTracks],
        shuffleCount: 0
      };
    }));
  };

  const handleSplit = async () => {
    if (jobs.length === 0) return;
    setIsProcessing(true);
    setExpandedIndex(null);

    // Deep copy jobs to update status and clear previous results
    const updatedJobs = jobs.map(j => ({
      ...j,
      status: 'processing' as const,
      results: [] as SplitResult[]
    }));
    setJobs(updatedJobs);

    try {
      for (let jIdx = 0; jIdx < updatedJobs.length; jIdx++) {
        const job = updatedJobs[jIdx];
        if (job.tracks.length === 0) {
          job.status = 'idle';
          continue;
        }

        const totalTracks = job.tracks.length;
        const chunkSize = Math.ceil(totalTracks / numParts);
        const jobResults: SplitResult[] = [];

        for (let i = 0; i < numParts; i++) {
          const start = i * chunkSize;
          const end = start + chunkSize;
          const chunk = job.tracks.slice(start, end);

          if (chunk.length === 0) break;

          let outputContent = "#EXTM3U\n";
          const parsedChunkTracks: ParsedTrack[] = [];
          chunk.forEach(track => {
            if (track.meta) outputContent += track.meta + "\n";
            outputContent += track.path + "\n";
            
            const { title, artist } = parseExtInf(track.meta, track.path);
            parsedChunkTracks.push({ path: track.path, title, artist });
          });

          const baseName = job.file.name.replace(/\.m3u8?$/i, "");
          
          jobResults.push({
            fileName: `${baseName} (Part ${i + 1}).m3u`,
            url: "",
            content: outputContent,
            count: chunk.length,
            tracks: parsedChunkTracks
          });
        }

        job.results = jobResults;
        job.status = 'done';
        
        // Progressive UI updates
        setJobs([...updatedJobs]);
      }
    } catch (err) {
      console.error("Bulk split failed", err);
      alert("Failed to split some playlists.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadJobZip = async (job: PlaylistJob) => {
    if (job.results.length === 0) return;
    try {
      const zip = new JSZip();
      job.results.forEach(part => {
        zip.file(part.fileName, part.content);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const baseName = job.file.name.replace(/\.m3u8?$/i, "");
      await downloadPlaylistFile(zipBlob, `${baseName}_split_parts.zip`, 'application/zip');
    } catch (err) {
      console.error("Failed to generate job ZIP file", err);
      alert("Failed to generate job ZIP file.");
    }
  };

  const handleDownloadAllAsZip = async () => {
    const completedJobs = jobs.filter(j => j.status === 'done' && j.results.length > 0);
    if (completedJobs.length === 0) return;
    try {
      const zip = new JSZip();

      if (completedJobs.length === 1) {
        // Flat ZIP for single playlist
        const job = completedJobs[0];
        job.results.forEach(part => {
          zip.file(part.fileName, part.content);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const baseName = job.file.name.replace(/\.m3u8?$/i, "");
        await downloadPlaylistFile(zipBlob, `${baseName}_split_parts.zip`, 'application/zip');
      } else {
        // Structured ZIP with subfolders for multiple playlists
        completedJobs.forEach(job => {
          const folderName = job.file.name.replace(/\.m3u8?$/i, "").trim() || "Playlist";
          const folder = zip.folder(folderName);
          if (folder) {
            job.results.forEach(part => {
              folder.file(part.fileName, part.content);
            });
          }
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        await downloadPlaylistFile(zipBlob, `Bulk_Split_Playlists.zip`, 'application/zip');
      }
    } catch (err) {
      console.error("Failed to generate bulk ZIP file", err);
      alert("Failed to generate bulk ZIP file.");
    }
  };

  const hasAnyDoneJobs = jobs.some(j => j.status === 'done' && j.results.length > 0);

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
            <h4 className="text-xs font-bold text-orange-300 uppercase">Split Playlist (Bulk)</h4>
            <p className="text-[11px] text-slate-400 leading-tight mt-1">
              Divide one or multiple playlists into equal smaller parts. Shuffling and previews are preserved for each.
            </p>
          </div>
        </div>

        <FileUploader
          label="Source Playlists"
          subLabel="Select one or more playlists to split"
          files={jobs.map(j => j.file)}
          onFilesSelected={handleFilesSelected}
          onClear={clearQueue}
          multiple={true}
          accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel"
          colorClass="amber"
        />

        {jobs.length > 0 && (
          <>
            {/* Global Settings Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Global Actions</span>
                <span className="text-[10px] text-slate-500 font-mono">{jobs.length} playlists loaded</span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleBulkShuffle}
                  disabled={isProcessing}
                  className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 border border-slate-750 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Shuffle size={14} className="text-orange-400" />
                  <span>Shuffle All</span>
                </button>
                <button
                  type="button"
                  onClick={handleBulkReset}
                  disabled={isProcessing}
                  className="py-2 px-3 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-350 rounded-lg text-xs font-bold transition-colors border border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset All
                </button>
              </div>

              <div className="border-t border-slate-800/80 pt-3 space-y-3">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-xs font-bold flex items-center gap-1.5 uppercase text-slate-400">
                    <Divide size={14} className="text-orange-400" />
                    Split each into
                  </span>
                  <span className="text-lg font-black text-white">{numParts} <span className="text-[10px] font-normal text-slate-500 uppercase">Parts</span></span>
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="20" 
                  step="1" 
                  value={numParts}
                  disabled={isProcessing}
                  onChange={(e) => setNumParts(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 disabled:opacity-50"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>2 Parts</span>
                  <span>20 Parts</span>
                </div>
              </div>
            </div>

            {/* Individual Jobs Queue */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Playlists Queue</h3>
              
              {jobs.map((job) => (
                <div key={job.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 relative shadow-inner">
                  {/* File Header */}
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 pr-6">
                      <div className="text-xs font-bold text-slate-200 truncate">{job.file.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{job.tracks.length} tracks</div>
                    </div>
                    {!isProcessing && job.status !== 'processing' && (
                      <button
                        onClick={() => removeJob(job.id)}
                        className="p-1 hover:bg-slate-800 text-slate-500 hover:text-red-400 rounded transition-colors absolute top-3 right-3"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Local Shuffle Row */}
                  {job.tracks.length > 0 && job.status !== 'processing' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleLocalShuffle(job.id)}
                        className="flex-1 py-1.5 px-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center space-x-1 border border-slate-800"
                      >
                        <Shuffle size={12} className="text-orange-400" />
                        <span>Shuffle</span>
                      </button>

                      {job.shuffleCount > 0 && (
                        <>
                          <span className="text-[10px] text-orange-400/80 font-bold bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full shrink-0">
                            x{job.shuffleCount}
                          </span>
                          <button
                            onClick={() => handleLocalReset(job.id)}
                            className="py-1.5 px-2 bg-slate-850 hover:bg-slate-850 text-slate-400 hover:text-slate-300 rounded-lg text-[11px] font-medium transition-colors border border-slate-800"
                          >
                            Reset
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Collapsible Preview toggle */}
                  {job.tracks.length > 0 && (
                    <div className="border-t border-slate-850 pt-2.5">
                      <button
                        type="button"
                        onClick={() => toggleLocalPreview(job.id)}
                        className="w-full flex items-center justify-between text-[10px] font-bold text-slate-400 hover:text-slate-350 transition-colors uppercase tracking-wider text-left"
                      >
                        <span className="flex items-center space-x-1">
                          <Music size={11} className="text-orange-400" />
                          <span>Preview Tracklist</span>
                        </span>
                        <span className="text-slate-500 font-normal">
                          {job.showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </span>
                      </button>

                      {job.showPreview && (
                        <div className="bg-slate-950/60 border border-slate-850/80 rounded-lg p-2 mt-2 space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                          {job.tracks.map((track, idx) => {
                            const { title, artist } = parseExtInf(track.meta, track.path);
                            return (
                              <div key={idx} className="flex items-start space-x-2 text-[10px] text-slate-400 py-0.5">
                                <span className="text-[8px] text-slate-600 font-mono w-6 text-right shrink-0 pt-0.5">{idx + 1}.</span>
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium text-slate-300 break-words">{title}</span>
                                  <span className="text-slate-500 text-[9px] ml-1.5 break-words">- {artist}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Job Processing Status */}
                  {job.status !== 'idle' && (
                    <div className="border-t border-slate-850 pt-2.5 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Status</span>
                      <span className={`font-bold flex items-center gap-1 ${
                        job.status === 'processing' ? 'text-orange-400' :
                        job.status === 'done' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {job.status === 'processing' && <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-ping" />}
                        {job.status === 'done' && <Check size={12} />}
                        {job.status.toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Job Specific Split Results */}
                  {job.status === 'done' && job.results.length > 0 && (
                    <div className="border-t border-slate-850 pt-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Split Parts</span>
                        <button
                          type="button"
                          onClick={() => handleDownloadJobZip(job)}
                          className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded text-[10px] font-bold transition-all flex items-center space-x-1 shadow shadow-orange-950/10"
                        >
                          <Download size={10} />
                          <span>Download Parts ZIP</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        {job.results.map((part, idx) => {
                          const isExpanded = expandedIndex?.jobId === job.id && expandedIndex?.partIdx === idx;
                          return (
                            <div key={idx} className="bg-slate-950/40 border border-slate-850 rounded-lg overflow-hidden transition-colors">
                              <div
                                className="p-2 flex items-center justify-between group hover:border-orange-500/20 cursor-pointer"
                                onClick={() => setExpandedIndex(isExpanded ? null : { jobId: job.id, partIdx: idx })}
                              >
                                <div className="flex items-center space-x-2 overflow-hidden">
                                  <div className="w-6 h-6 bg-slate-850 rounded flex items-center justify-center text-slate-500 shrink-0">
                                    <span className="font-bold text-[10px]">{idx + 1}</span>
                                  </div>
                                  <div className="min-w-0 pr-2">
                                    <div className="text-[11px] font-bold text-slate-350 truncate">{part.fileName}</div>
                                    <div className="text-[9px] text-slate-500">{part.count} tracks</div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await downloadPlaylistFile(part.content, part.fileName, 'audio/x-mpegurl');
                                    }}
                                    className="p-1.5 bg-slate-850 hover:bg-orange-500 hover:text-white text-slate-400 rounded transition-colors"
                                  >
                                    <Download size={12} />
                                  </button>
                                  {isExpanded ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="bg-slate-950/80 p-2 border-t border-slate-900/50 max-h-40 overflow-y-auto custom-scrollbar">
                                  {part.tracks.map((track, tIdx) => (
                                    <div key={tIdx} className="flex items-center space-x-2 py-1 border-b border-slate-900 last:border-0">
                                      <div className="bg-slate-900 text-slate-500 rounded p-1 opacity-50 shrink-0">
                                        <Music size={10} />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <span className="font-medium text-slate-350 break-words">{track.title}</span>
                                        <span className="text-slate-500 text-[9px] ml-1.5 break-words">- {track.artist}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Split Trigger Button */}
            <button
              onClick={handleSplit}
              disabled={isProcessing}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] 
                ${!isProcessing
                  ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-xl shadow-orange-900/20' 
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
            >
              {isProcessing ? <Scissors className="animate-spin text-orange-400" /> : <Scissors size={20} />}
              <span>{isProcessing ? 'Splitting Queue...' : 'Split All Playlists'}</span>
            </button>

            {/* Global Bulk ZIP Download Action */}
            {hasAnyDoneJobs && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <Check size={16} />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Queue Processed</h3>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleDownloadAllAsZip}
                    className="py-2 px-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-lg shadow-orange-950/20 active:scale-95"
                  >
                    <Download size={14} />
                    <span>Download All (.ZIP)</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Downloads a structured ZIP archive with files grouped in subfolders by original playlist name.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}