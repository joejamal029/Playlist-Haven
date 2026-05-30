import React, { useState, useEffect } from 'react';
import { ArrowLeft, Eye, Plus, Trash2, Upload, FileText, CheckCircle2, AlertCircle, Loader2, Download, Sparkles, Image, Search, Filter, CheckSquare, Square, Settings } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { 
  parseScreenshot, 
  aggregateSongs, 
  generateCSV, 
  AggregatedSong, 
  ExtractedSong,
  parseScreenshotWithArt,
  enrichMetadataWithSearch,
  EnrichedSong,
  ArtContextSong,
  getAIConfig,
  setAIConfig
} from '../services/visionEngine';

interface VisionToPlaylistViewProps {
  onBack: () => void;
}

interface ImageGroup {
  id: string;
  name: string;
  files: File[];
}

interface ProcessingStatus {
  total: number;
  processed: number;
  failed: number;
  currentFile: string;
  stage: 'vision' | 'search' | 'complete' | 'idle';
}

type VisionMode = 'standard' | 'experimental';

export default function VisionToPlaylistView({ onBack }: VisionToPlaylistViewProps) {
  const [aiConfig, setAiConfigState] = useState(() => getAIConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<VisionMode>('standard');
  const [groups, setGroups] = useState<ImageGroup[]>([
    { id: '1', name: 'Screenshots', files: [] }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<ProcessingStatus>({ 
    total: 0, 
    processed: 0, 
    failed: 0,
    currentFile: '',
    stage: 'idle'
  });
  
  // Standard Results
  const [results, setResults] = useState<AggregatedSong[]>([]);
  // Standard Filtering
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterThreshold, setFilterThreshold] = useState(1);
  
  // Experimental Results
  const [experimentalResults, setExperimentalResults] = useState<EnrichedSong[]>([]);
  const [extractionLog, setExtractionLog] = useState<ArtContextSong[]>([]);

  // Initialize selection when results change
  useEffect(() => {
    if (mode === 'standard' && results.length > 0) {
      // Select all by default
      const allIds = new Set(results.map(s => s.id));
      setSelectedIds(allIds);
    }
  }, [results, mode]);

  // Group Management
  const addGroup = () => {
    setGroups([...groups, { 
      id: Date.now().toString(), 
      name: `Collection ${groups.length + 1}`, 
      files: [] 
    }]);
  };

  const removeGroup = (id: string) => {
    setGroups(groups.filter(g => g.id !== id));
  };

  const updateGroupName = (id: string, name: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, name } : g));
  };

  const updateGroupFiles = (id: string, newFiles: File[]) => {
    setGroups(groups.map(g => g.id === id ? { ...g, files: [...g.files, ...newFiles] } : g));
  };
  
  const clearGroupFiles = (id: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, files: [] } : g));
  };

  // --- Filtering Logic ---
  const applySmartSelect = () => {
    const newSelection = new Set<string>();
    results.forEach(song => {
      if (song.count >= filterThreshold) {
        newSelection.add(song.id);
      }
    });
    setSelectedIds(newSelection);
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const selectAll = () => setSelectedIds(new Set(results.map(s => s.id)));
  const deselectAll = () => setSelectedIds(new Set());

  // --- Standard Process (Parallelized) ---
  const handleStandardProcess = async () => {
    const allFiles = groups.flatMap(g => g.files.map(f => ({ file: f, groupName: g.name })));
    if (allFiles.length === 0) return;

    setIsProcessing(true);
    setResults([]);
    setStatus({ total: allFiles.length, processed: 0, failed: 0, currentFile: 'Starting...', stage: 'vision' });

    try {
      // Thread-safe container
      const extractedData: { song: ExtractedSong, source: string }[] = [];
      const CONCURRENCY = 2; // Reduced from 4 to prevent proxy overload
      let completedCount = 0;
      let failedCount = 0;
      const queue = [...allFiles];

      const worker = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;

          try {
             const songs = await parseScreenshot(item.file);
             songs.forEach(song => {
               // Push to common array (JS is single threaded so this is safe)
               extractedData.push({ song, source: item.groupName });
             });
          } catch (err) {
             console.error(`Failed to parse ${item.file.name}`, err);
             failedCount++;
          } finally {
             completedCount++;
             setStatus(prev => ({ 
                ...prev, 
                processed: completedCount, 
                failed: failedCount,
                currentFile: `Processed ${item.file.name}` 
             }));
          }
        }
      };

      // Launch Workers
      const workers = Array(Math.min(allFiles.length, CONCURRENCY))
        .fill(null)
        .map(() => worker());

      await Promise.all(workers);

      // Aggregation Step
      setStatus(prev => ({ ...prev, currentFile: 'Aggregating Results...', stage: 'complete' }));
      const aggregated = aggregateSongs(extractedData);
      setResults(aggregated);

    } catch (err) {
      console.error("Standard Process Failed", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Experimental Logic ---
  const handleExperimentalProcess = async () => {
    const allFiles = groups.flatMap(g => g.files);
    if (allFiles.length === 0) return;

    setIsProcessing(true);
    setExperimentalResults([]);
    setExtractionLog([]);
    setStatus({ total: allFiles.length, processed: 0, failed: 0, currentFile: 'Starting Vision...', stage: 'vision' });

    try {
      // Step 1: Vision Extraction (Sequential to avoid payload limits with images)
      const rawSongs: ArtContextSong[] = [];
      let visionFailedCount = 0; // Track Step 1 failures locally

      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        setStatus(prev => ({ ...prev, total: allFiles.length, processed: i + 1, currentFile: `Scanning ${file.name}`, stage: 'vision' }));
        
        try {
          const extracted = await parseScreenshotWithArt(file);
          rawSongs.push(...extracted);
        } catch (e) {
          console.error(`Experimental Vision failed for ${file.name}`, e);
          visionFailedCount++;
          setStatus(prev => ({ ...prev, failed: visionFailedCount }));
        }
      }
      setExtractionLog(rawSongs);

      // Step 2: Search Enrichment (Parallelized)
      if (rawSongs.length === 0) {
           setIsProcessing(false);
           return;
      }

      // Preserve Step 1 failures in the display when starting Step 2
      setStatus({ 
          total: rawSongs.length, 
          processed: 0, 
          failed: visionFailedCount, 
          currentFile: 'Searching Web...', 
          stage: 'search' 
      });
      
      const CONCURRENCY = 4; // Run 4 searches in parallel
      let completedCount = 0;
      let searchFailedCount = 0; // Track Step 2 failures locally
      const queue = [...rawSongs];
      
      const worker = async () => {
        while (queue.length > 0) {
            const raw = queue.shift();
            if (!raw) break;

            try {
              const enriched = await enrichMetadataWithSearch(raw);
              setExperimentalResults(prev => [...prev, enriched]);
              setStatus(prev => ({ 
                ...prev, 
                currentFile: `Matched: ${raw.title}` 
              }));
            } catch (e) {
              console.error(`Search enrichment failed for ${raw.title}`, e);
              searchFailedCount++;
            } finally {
              completedCount++;
              setStatus(prev => ({ 
                  ...prev, 
                  processed: completedCount, 
                  // Accumulate both vision failures and search failures
                  failed: visionFailedCount + searchFailedCount
              }));
            }
        }
      };

      // Start worker pool
      const workers = Array(Math.min(rawSongs.length, CONCURRENCY))
        .fill(null)
        .map(() => worker());

      await Promise.all(workers);

      setStatus(prev => ({ ...prev, stage: 'complete', currentFile: 'Done' }));

    } catch (err) {
      console.error("Experimental Process Failed", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCsv = () => {
    let data;
    if (mode === 'standard') {
      // Only include selected songs in Standard Mode
      data = results.filter(r => selectedIds.has(r.id));
    } else {
      data = experimentalResults;
    }
    
    if (data.length === 0) {
      alert("No songs selected for export.");
      return;
    }

    const csvContent = generateCSV(data as any[]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `m3u_haven_${mode}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalFiles = groups.reduce((acc, g) => acc + g.files.length, 0);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Vision-to-Playlist
            </h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">AI Digitizer</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* AI Settings Config Toggle */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg border transition-all ${showSettings ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
            title="Configure AI Models (Local vs Cloud)"
          >
            <Settings size={14} className={showSettings ? 'animate-spin-slow' : ''} />
          </button>

          {/* Mode Switcher */}
          <div className="flex bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setMode('standard')}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors ${mode === 'standard' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Standard
            </button>
            <button
              onClick={() => setMode('experimental')}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors flex items-center gap-1 ${mode === 'experimental' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Sparkles size={10} />
              Art Matcher
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible AI Config Settings */}
      {showSettings && (
        <div className="bg-slate-900 border-b border-slate-800 p-4 animate-in slide-in-from-top duration-200">
          <div className="max-w-4xl mx-auto bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <h3 className="text-xs font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                <Settings size={14} />
                AI Engine Settings
              </h3>
              <button 
                onClick={() => setShowSettings(false)} 
                className="text-[10px] text-slate-500 hover:text-slate-300 font-bold"
              >
                Close Settings
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">AI Provider</label>
                <select
                  value={aiConfig.provider}
                  onChange={(e) => {
                    const provider = e.target.value as 'gemini' | 'openai-compatible';
                    const modelName = provider === 'gemini' ? 'gemini-3-flash-preview' : 'llava';
                    const updates = { provider, modelName };
                    const updated = { ...aiConfig, ...updates };
                    setAiConfigState(updated);
                    setAIConfig(updated);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-violet-500 outline-none rounded-lg p-2.5 text-xs text-slate-200"
                >
                  <option value="gemini">Gemini (Cloud SDK)</option>
                  <option value="openai-compatible">Custom / Local (OpenAI Compatible API)</option>
                </select>
                <p className="text-[9px] text-slate-500 mt-1 leading-tight">
                  {aiConfig.provider === 'gemini' 
                    ? "Uses Google GenAI SDK. Perfect for premium web-search grounding." 
                    : "Connect to Ollama, LM Studio, DeepSeek, or other local engines."}
                </p>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">Model Name</label>
                <input
                  type="text"
                  value={aiConfig.modelName}
                  onChange={(e) => {
                    const updated = { ...aiConfig, modelName: e.target.value };
                    setAiConfigState(updated);
                    setAIConfig(updated);
                  }}
                  placeholder={aiConfig.provider === 'gemini' ? 'gemini-3-flash-preview' : 'llava'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-violet-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 placeholder:text-slate-600"
                />
              </div>

              {aiConfig.provider === 'openai-compatible' && (
                <div className="md:col-span-2">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">Custom Base URL</label>
                  <input
                    type="text"
                    value={aiConfig.baseUrl}
                    onChange={(e) => {
                      const updated = { ...aiConfig, baseUrl: e.target.value };
                      setAiConfigState(updated);
                      setAIConfig(updated);
                    }}
                    placeholder="http://localhost:11434/v1"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-violet-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 placeholder:text-slate-600"
                  />
                  <p className="text-[9px] text-slate-500 mt-1">
                    Base endpoint of the OpenAI-compatible service (e.g. <code>http://localhost:11434/v1</code> for Ollama, <code>http://localhost:1234/v1</code> for LM Studio).
                  </p>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">
                  {aiConfig.provider === 'gemini' ? 'Gemini API Key (Overrides env)' : 'API Key (Optional / Bearer Token)'}
                </label>
                <input
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={(e) => {
                    const updated = { ...aiConfig, apiKey: e.target.value };
                    setAiConfigState(updated);
                    setAIConfig(updated);
                  }}
                  placeholder={aiConfig.provider === 'gemini' ? 'AIzaSy...' : 'Optional Auth Token'}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-violet-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 placeholder:text-slate-600"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-6">
        
        {/* Intro Card */}
        {mode === 'standard' ? (
          <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-4 flex items-start space-x-3">
            <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
              <Eye size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-violet-300 uppercase">Screenshot Digitizer</h4>
              <p className="text-[11px] text-slate-400 leading-tight mt-1">
                Upload screenshots. The AI extracts songs, deduplicates them, and generates a CSV. 
                Use the checklist to filter songs by appearance count.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 flex items-start space-x-3">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <Sparkles size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-300 uppercase">Experimental: Art Matcher</h4>
              <p className="text-[11px] text-slate-400 leading-tight mt-1">
                For screenshots where the <strong>Artist Name is missing</strong> (or duplicated as Title). 
                We use the <strong>Album Art</strong> visuals to search the web and find the correct metadata.
              </p>
            </div>
          </div>
        )}

        {/* Groups Container */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Image Sections</h3>
            <button 
              onClick={addGroup}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full text-slate-300 flex items-center transition-colors border border-slate-700"
            >
              <Plus size={12} className="mr-1" /> Add Section
            </button>
          </div>

          {groups.map((group) => (
            <div key={group.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 transition-all hover:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <input 
                  type="text" 
                  value={group.name}
                  onChange={(e) => updateGroupName(group.id, e.target.value)}
                  className="bg-transparent text-sm font-bold text-slate-200 border-b border-transparent hover:border-slate-700 focus:border-violet-500 outline-none px-1 py-0.5 w-full mr-4"
                />
                {groups.length > 1 && (
                  <button 
                    onClick={() => removeGroup(group.id)} 
                    className="text-slate-600 hover:text-rose-400 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              
              <FileUploader
                label={`Upload Images for ${group.name}`}
                subLabel="Screenshots will be processed & discarded"
                files={group.files}
                onFilesSelected={(files) => updateGroupFiles(group.id, files)}
                onClear={() => clearGroupFiles(group.id)}
                multiple={true}
                accept="image/*"
                colorClass={mode === 'standard' ? 'violet' : 'amber'}
              />
            </div>
          ))}
        </div>

        {/* Action Bar */}
        <div className="sticky bottom-4 z-10">
          <button
            onClick={mode === 'standard' ? handleStandardProcess : handleExperimentalProcess}
            disabled={totalFiles === 0 || isProcessing}
            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all shadow-xl 
              ${totalFiles > 0 && !isProcessing
                ? mode === 'standard' 
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-900/20 active:scale-[0.98]'
                  : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-amber-900/20 active:scale-[0.98]'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
          >
            {isProcessing ? (
               <Loader2 className="animate-spin" />
            ) : mode === 'standard' ? (
               <Upload size={20} />
            ) : (
               <Search size={20} />
            )}
            <span>
              {isProcessing 
                ? mode === 'standard' 
                  ? `Processing ${status.processed}/${status.total}...`
                  : status.stage === 'vision' 
                    ? `Reading Images (${status.processed}/${status.total})...`
                    : `Searching (${status.processed}/${status.total})...`
                : mode === 'standard'
                  ? `Digitize ${totalFiles} Images`
                  : `Analyze & Match`}
            </span>
          </button>
          
          {isProcessing && (
            <div className="mt-2 text-center space-y-1">
              <p className="text-[10px] text-slate-500 animate-pulse">
                {status.stage === 'vision' ? `Analysing ${status.currentFile}` : status.currentFile}
              </p>
              {status.failed > 0 && (
                 <p className="text-[10px] text-rose-400 font-bold">
                   {status.failed} item(s) failed and were skipped.
                 </p>
              )}
            </div>
          )}
        </div>

        {/* STANDARD RESULTS & FILTERING */}
        {mode === 'standard' && results.length > 0 && (
           <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-500 pb-10">
              <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-full">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-300">Extraction Complete</h3>
                    <p className="text-[11px] text-emerald-400/70">Found {results.length} unique tracks</p>
                    {status.failed > 0 && (
                        <p className="text-[10px] text-rose-400 font-bold mt-1">Note: {status.failed} images failed.</p>
                    )}
                  </div>
                </div>
                <button 
                  onClick={downloadCsv}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center space-x-2 transition-colors shadow-lg shadow-emerald-900/20"
                >
                  <Download size={14} />
                  <span>Download CSV ({selectedIds.size})</span>
                </button>
              </div>

              {/* Filtering Control Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col space-y-3">
                 <div className="flex items-center justify-between">
                     <div className="flex items-center space-x-2 text-violet-400">
                         <Filter size={16} />
                         <span className="text-xs font-bold uppercase tracking-wider">Smart Selection</span>
                     </div>
                     <div className="flex items-center space-x-2">
                        <button onClick={selectAll} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded hover:bg-slate-700">All</button>
                        <button onClick={deselectAll} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded hover:bg-slate-700">None</button>
                     </div>
                 </div>
                 
                 <div className="flex items-center space-x-3">
                     <span className="text-[11px] text-slate-400 whitespace-nowrap">Include if appearing &ge; {filterThreshold} times</span>
                     <input 
                       type="range" 
                       min="1" 
                       max={Math.max(...results.map(r => r.count), 5)} 
                       step="1"
                       value={filterThreshold}
                       onChange={(e) => setFilterThreshold(parseInt(e.target.value))}
                       className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                     />
                     <button 
                       onClick={applySmartSelect}
                       className="text-[10px] font-bold bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                     >
                       Auto Select
                     </button>
                 </div>
              </div>

              {/* Checklist Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                   <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-900 sticky top-0 z-10">
                       <tr>
                         <th className="p-3 w-10 text-center border-b border-slate-800">
                             <CheckSquare size={14} className="text-slate-500 mx-auto" />
                         </th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Track</th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Artist</th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Count</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                       {results.map((song) => {
                         const isSelected = selectedIds.has(song.id);
                         return (
                           <tr 
                             key={song.id} 
                             onClick={() => toggleSelection(song.id)}
                             className={`cursor-pointer transition-colors ${isSelected ? 'bg-violet-500/5 hover:bg-violet-500/10' : 'hover:bg-slate-800/50 opacity-60'}`}
                           >
                             <td className="p-3 text-center">
                                {isSelected ? (
                                    <CheckSquare size={16} className="text-violet-400 mx-auto" />
                                ) : (
                                    <Square size={16} className="text-slate-600 mx-auto" />
                                )}
                             </td>
                             <td className={`p-3 text-xs font-medium truncate max-w-[120px] ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>{song.title}</td>
                             <td className={`p-3 text-xs truncate max-w-[100px] ${isSelected ? 'text-slate-400' : 'text-slate-600'}`}>{song.artist}</td>
                             <td className="p-3 text-xs text-right">
                               <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isSelected ? 'bg-violet-500/20 text-violet-300' : 'bg-slate-800 text-slate-600'}`}>
                                 {song.count}
                               </span>
                             </td>
                           </tr>
                         );
                       })}
                     </tbody>
                   </table>
                </div>
              </div>
           </div>
        )}

        {/* EXPERIMENTAL RESULTS */}
        {mode === 'experimental' && experimentalResults.length > 0 && (
           <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-500 pb-10">
              <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                 <div className="flex items-center space-x-3">
                   <div className="p-2 bg-amber-500/20 text-amber-400 rounded-full">
                     <Sparkles size={20} />
                   </div>
                   <div>
                     <h3 className="text-sm font-bold text-amber-300">Enrichment Complete</h3>
                     <p className="text-[11px] text-amber-400/70">Matched {experimentalResults.length} tracks via Web Search</p>
                     {status.failed > 0 && (
                        <p className="text-[10px] text-rose-400 font-bold mt-1">Note: {status.failed} items failed (Vision or Search).</p>
                     )}
                   </div>
                 </div>
                 <button 
                  onClick={downloadCsv}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg flex items-center space-x-2 transition-colors shadow-lg shadow-amber-900/20"
                 >
                   <Download size={14} />
                   <span>Download CSV</span>
                 </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="max-h-80 overflow-y-auto">
                   <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-900 sticky top-0 z-10">
                       <tr>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Original Title</th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Found Artist</th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">Found Album</th>
                         <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Conf.</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                       {experimentalResults.map((res, idx) => (
                         <tr key={idx} className="hover:bg-slate-800/50">
                           <td className="p-3">
                             <div className="text-xs font-bold text-slate-200">{res.title}</div>
                             {res.search_url && (
                               <a href={res.search_url} target="_blank" rel="noreferrer" className="text-[9px] text-blue-400 hover:underline block truncate max-w-[100px]">
                                 Source
                               </a>
                             )}
                           </td>
                           <td className="p-3 text-xs text-amber-300">{res.artist}</td>
                           <td className="p-3 text-xs text-slate-400 italic">{res.album}</td>
                           <td className="p-3 text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase
                                ${res.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' : 
                                  res.confidence === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                {res.confidence}
                              </span>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                </div>
              </div>
           </div>
        )}

      </div>
    </div>
  );
}