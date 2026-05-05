import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowUp, ArrowDown, Plus, X, Type, Calendar, Hash, Settings, Download, RefreshCw, ChevronRight, Wand2, Trash2, PlusCircle, Save, RotateCcw, Filter, Layers } from 'lucide-react';
import FileUploader from '../components/FileUploader';

interface SmartRenamerViewProps {
  onBack: () => void;
}

type PartType = 'id' | 'counter' | 'name' | 'month' | 'year' | 'text';

interface NamingPart {
  id: string;
  type: PartType;
  value: string; // Used for 'text' type or as a fallback
  enabled: boolean;
  customLabel?: string;
}

interface LogicState {
  id: string;
  counter: number;
  counterPadding: number; // Keep track of how many zeros to pad
  name: string;
  month: number; // 0-11
  year: number; // Full year e.g. 2024
}

interface IncrementRules {
    counter: boolean;
    month: boolean;
    year: boolean;
}

type FilterMode = 'all' | 'topN' | 'percentage' | 'range';

interface FileWithFilter {
  id: string;
  file: File;
  mode: FilterMode;
  value: string;
}

interface M3UEntry {
  extinf?: string;
  path: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function SmartRenamerView({ onBack }: SmartRenamerViewProps) {
  // Pattern Configuration - Simplified Default
  const [structure, setStructure] = useState<NamingPart[]>([
    { id: '1', type: 'id', value: 'ZY', enabled: true, customLabel: 'Prefix' },
    { id: '2', type: 'text', value: ' ', enabled: true },
    { id: '3', type: 'counter', value: '7', enabled: true, customLabel: 'Episode' },
    { id: '4', type: 'text', value: 'a. ', enabled: true },
    { id: '5', type: 'name', value: 'Relapse Demo', enabled: true, customLabel: 'Title' },
    { id: '6', type: 'text', value: ' ', enabled: true },
    { id: '7', type: 'month', value: 'Long', enabled: true },
    { id: '8', type: 'text', value: ' ', enabled: true },
    { id: '9', type: 'year', value: 'Short', enabled: true },
  ]);

  // Current Logic State (The "Head" of the sequence)
  const [logicState, setLogicState] = useState<LogicState>({
    id: 'ZY',
    counter: 7,
    counterPadding: 2,
    name: 'Relapse Demo',
    month: 9, // October
    year: 2023
  });

  const [incrementRules, setIncrementRules] = useState<IncrementRules>({
      counter: true,
      month: false,
      year: false
  });

  const [targetFiles, setTargetFiles] = useState<FileWithFilter[]>([]);
  const [combineFiles, setCombineFiles] = useState(true);
  const [deduplicate, setDeduplicate] = useState(true);
  const [globalFilterMode, setGlobalFilterMode] = useState<FilterMode>('all');
  const [globalFilterValue, setGlobalFilterValue] = useState<string>('');

  const [renamedFiles, setRenamedFiles] = useState<{ original: string, newName: string, url: string }[]>([]);

  const [testFilename, setTestFilename] = useState("");
  const [validationResult, setValidationResult] = useState<'success' | 'error' | null>(null);

  const handleTestFilenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTestFilename(val);
    if (val.trim() === '') {
        setValidationResult(null);
        return;
    }
    const parsedState = parseFilename(val);
    if (parsedState) {
        setValidationResult('success');
        setLogicState(getNextState(parsedState, 1));
    } else {
        setValidationResult('error');
    }
  };

  const hasPart = (type: PartType) => structure.some(p => p.type === type && p.enabled);

  const getPartLabel = (type: PartType, defaultLabel: string) => {
      const part = structure.find(p => p.type === type && p.enabled);
      if (part && part.customLabel !== undefined && part.customLabel.trim() !== '') {
          return part.customLabel;
      }
      return defaultLabel;
  };

  const renderStateLabel = (type: PartType, defaultLabel: string) => {
      const custom = getPartLabel(type, defaultLabel);
      if (custom !== defaultLabel) {
          return <>{custom} <span className="font-normal opacity-50 ml-1">({defaultLabel})</span></>;
      }
      return custom;
  };

  // Helpers to manage structure
  const movePart = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === structure.length - 1) return;
    
    const newStructure = [...structure];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newStructure[index], newStructure[swapIndex]] = [newStructure[swapIndex], newStructure[index]];
    setStructure(newStructure);
  };

  const togglePart = (index: number) => {
    const newStructure = [...structure];
    newStructure[index].enabled = !newStructure[index].enabled;
    setStructure(newStructure);
  };

  const updatePartValue = (index: number, val: string) => {
    const newStructure = [...structure];
    newStructure[index].value = val;
    setStructure(newStructure);
  };

  const updatePartLabel = (index: number, label: string) => {
    const newStructure = [...structure];
    newStructure[index].customLabel = label;
    setStructure(newStructure);
  };

  const addPart = (type: PartType) => {
    let defaultValue = ' ';
    if (type === 'month') defaultValue = 'Long';
    if (type === 'year') defaultValue = 'Long';
    
    setStructure([...structure, { 
        id: Date.now().toString() + Math.random(), 
        type, 
        value: defaultValue, 
        enabled: true 
    }]);
  };

  const removePart = (index: number) => {
    const newStructure = structure.filter((_, i) => i !== index);
    setStructure(newStructure);
  };

  const resetStructure = () => {
      setStructure([
        { id: '1', type: 'id', value: 'ZY', enabled: true, customLabel: 'Prefix' },
        { id: '2', type: 'text', value: ' ', enabled: true },
        { id: '3', type: 'counter', value: '7', enabled: true, customLabel: 'Episode' },
        { id: '4', type: 'text', value: 'a. ', enabled: true },
        { id: '5', type: 'name', value: 'Relapse Demo', enabled: true, customLabel: 'Title' },
        { id: '6', type: 'text', value: ' ', enabled: true },
        { id: '7', type: 'month', value: 'Long', enabled: true },
        { id: '8', type: 'text', value: ' ', enabled: true },
        { id: '9', type: 'year', value: 'Short', enabled: true },
      ]);
  };

  // Logic Engine
  const getNextState = (current: LogicState, steps = 1): LogicState => {
    let nextCount = current.counter;
    let nextMonth = current.month;
    let nextYear = current.year;

    if (incrementRules.counter) {
        nextCount += steps;
    }

    if (incrementRules.month) {
        let totalMonths = current.year * 12 + current.month + steps;
        nextYear = Math.floor(totalMonths / 12);
        nextMonth = totalMonths % 12;
    } else if (incrementRules.year) {
        // Only increment year independently if month logic isn't driving it
        nextYear += steps;
    }

    return {
      ...current,
      counter: nextCount,
      counterPadding: current.counterPadding,
      month: nextMonth,
      year: nextYear
    };
  };

  const formatName = (state: LogicState): string => {
    let name = "";
    structure.forEach(part => {
      if (!part.enabled) return;
      switch (part.type) {
        case 'id': name += state.id; break;
        case 'counter': name += state.counter.toString().padStart(state.counterPadding, '0'); break;
        case 'name': name += state.name; break;
        case 'text': name += part.value; break;
        case 'month': 
          name += part.value === 'Short' ? SHORT_MONTHS[state.month] : MONTHS[state.month]; 
          break;
        case 'year': 
          name += part.value === 'Short' ? state.year.toString().slice(-2) : state.year.toString(); 
          break;
      }
    });
    return name + ".m3u";
  };

  // Parsing Engine
  const parseFilename = (filename: string): LogicState | null => {
    // 1. Construct Regex from Structure
    let regexStr = "^";
    structure.forEach(part => {
      if (!part.enabled) return;
      switch (part.type) {
        case 'id': regexStr += "(?<id>[a-zA-Z0-9_\\-]+)"; break;
        case 'counter': regexStr += "(?<counter>\\d+)"; break;
        case 'name': regexStr += "(?<name>.+?)"; break; // Non-greedy match
        case 'month': regexStr += "(?<month>[a-zA-Z]+)"; break;
        case 'year': regexStr += "(?<year>\\d{2,4})"; break;
        case 'text': 
            // Escape special regex chars
            regexStr += part.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
            break;
      }
    });
    regexStr += "$"; // Force matching the entire string

    // Remove extension for matching
    const nameOnly = filename.replace(/\.m3u8?$/i, '');
    const regex = new RegExp(regexStr, 'i');
    const match = nameOnly.match(regex);

    if (match && match.groups) {
      const g = match.groups;
      const newState: LogicState = { ...logicState };
      
      if (g.id) newState.id = g.id;
      if (g.counter) {
        newState.counter = parseInt(g.counter);
        newState.counterPadding = g.counter.length; // Preserve the original padding length
      }
      if (g.name) newState.name = g.name.trim();
      
      if (g.month) {
        const mStr = g.month.toLowerCase();
        const mIndex = MONTHS.findIndex(m => m.toLowerCase().startsWith(mStr.slice(0,3)));
        if (mIndex >= 0) newState.month = mIndex;
      }
      
      if (g.year) {
        let y = parseInt(g.year);
        if (y < 100) y += 2000; // Assumption for 2-digit years
        newState.year = y;
      }
      
      return newState;
    }
    return null;
  };

  const handleReferenceUpload = (uploadedFiles: File[]) => {
    if (uploadedFiles.length > 0) {
      const file = uploadedFiles[0];
      const parsedState = parseFilename(file.name);
      if (parsedState) {
        setLogicState(getNextState(parsedState, 1));
      } else {
        // Fallback: Just use the filename as the 'name' property
        const nameOnly = file.name.replace(/\.m3u8?$/i, '');
        setLogicState(prev => ({ ...prev, name: nameOnly }));
        // Optional: Notify user
        // alert("Pattern didn't match exactly. Using filename as 'Name'.");
      }
    }
  };

  const parseM3U = async (file: File): Promise<M3UEntry[]> => {
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const entries: M3UEntry[] = [];
    let currentExtinf: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#EXTINF:')) {
        currentExtinf = trimmed;
      } else if (!trimmed.startsWith('#')) {
        entries.push({
          extinf: currentExtinf,
          path: trimmed
        });
        currentExtinf = undefined;
      }
    }
    return entries;
  };

  const generateM3U = (entries: M3UEntry[]): string => {
    let out = "#EXTM3U\n";
    for (const e of entries) {
      if (e.extinf) out += e.extinf + "\n";
      out += e.path + "\n";
    }
    return out;
  };

  const applyFilter = (entries: M3UEntry[], mode: FilterMode, value: string): M3UEntry[] => {
    if (mode === 'all') return entries;
    if (mode === 'topN') {
      const n = parseInt(value);
      if (!isNaN(n) && n > 0) return entries.slice(0, n);
    }
    if (mode === 'percentage') {
      const p = parseFloat(value);
      if (!isNaN(p) && p > 0 && p <= 100) {
        const count = Math.ceil(entries.length * (p / 100));
        return entries.slice(0, count);
      }
    }
    if (mode === 'range') {
      const parts = value.split('-');
      if (parts.length === 2) {
        const start = parseInt(parts[0]) - 1;
        const end = parseInt(parts[1]);
        if (!isNaN(start) && !isNaN(end) && start >= 0 && end > start) {
          return entries.slice(start, end);
        }
      }
    }
    return entries;
  };

  const handleProcess = async () => {
    if (targetFiles.length === 0) return;

    const processedLists: { originalName: string, entries: M3UEntry[] }[] = [];

    for (const tf of targetFiles) {
      const entries = await parseM3U(tf.file);
      const filtered = applyFilter(entries, tf.mode, tf.value);
      processedLists.push({ originalName: tf.file.name, entries: filtered });
    }

    const results = [];

    if (combineFiles) {
      let combinedEntries: M3UEntry[] = [];
      for (const list of processedLists) {
        combinedEntries.push(...list.entries);
      }

      if (deduplicate) {
        const seen = new Set<string>();
        const deduped: M3UEntry[] = [];
        for (const e of combinedEntries) {
          if (!seen.has(e.path)) {
            seen.add(e.path);
            deduped.push(e);
          }
        }
        combinedEntries = deduped;
      }

      const newName = formatName(logicState);
      const m3uContent = generateM3U(combinedEntries);
      const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });

      results.push({
        original: `${targetFiles.length} files combined`,
        newName,
        url: URL.createObjectURL(blob)
      });
      setLogicState(getNextState(logicState, 1));
    } else {
      processedLists.forEach((list, index) => {
        let entries = list.entries;
        if (deduplicate) {
          const seen = new Set<string>();
          const deduped: M3UEntry[] = [];
          for (const e of entries) {
            if (!seen.has(e.path)) {
              seen.add(e.path);
              deduped.push(e);
            }
          }
          entries = deduped;
        }

        const state = getNextState(logicState, index);
        const newName = formatName(state);
        const m3uContent = generateM3U(entries);
        const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });

        results.push({
          original: list.originalName,
          newName,
          url: URL.createObjectURL(blob)
        });
      });
      setLogicState(getNextState(logicState, processedLists.length));
    }

    setRenamedFiles(results);
  };

  const downloadAll = async () => {
    for (let i = 0; i < renamedFiles.length; i++) {
        const res = renamedFiles[i];
        const a = document.createElement('a');
        a.href = res.url;
        a.download = res.newName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Add a small delay to prevent browser crash/blocking
        await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  // Render a part setting block
  const renderPart = (part: NamingPart, index: number) => {
    let icon = <Type size={14} />;
    let defaultLabel = "Text";
    let color = "text-slate-400";
    let bg = "bg-slate-800";

    switch (part.type) {
      case 'id': icon = <Hash size={14} />; defaultLabel = "Group ID"; color = "text-teal-400"; bg = "bg-teal-500/10 border-teal-500/20"; break;
      case 'counter': icon = <ArrowUp size={14} />; defaultLabel = "Counter"; color = "text-blue-400"; bg = "bg-blue-500/10 border-blue-500/20"; break;
      case 'name': icon = <Type size={14} />; defaultLabel = "Name"; color = "text-purple-400"; bg = "bg-purple-500/10 border-purple-500/20"; break;
      case 'month': icon = <Calendar size={14} />; defaultLabel = "Month"; color = "text-orange-400"; bg = "bg-orange-500/10 border-orange-500/20"; break;
      case 'year': icon = <Calendar size={14} />; defaultLabel = "Year"; color = "text-amber-400"; bg = "bg-amber-500/10 border-amber-500/20"; break;
    }

    const displayLabel = part.customLabel !== undefined ? part.customLabel : defaultLabel;

    return (
      <div key={part.id} className={`flex items-center space-x-2 p-2 rounded-lg border mb-2 group ${part.enabled ? bg : 'bg-slate-900 border-slate-800 opacity-60'}`}>
        <div className="flex flex-col space-y-1">
          <button onClick={() => movePart(index, 'up')} className="text-slate-600 hover:text-slate-300"><ArrowUp size={10} /></button>
          <button onClick={() => movePart(index, 'down')} className="text-slate-600 hover:text-slate-300"><ArrowDown size={10} /></button>
        </div>
        
        <input 
          type="checkbox" 
          checked={part.enabled} 
          onChange={() => togglePart(index)}
          className="accent-teal-500"
        />

        <div className={`p-1.5 rounded ${part.enabled ? 'bg-slate-900/50' : 'bg-slate-800'} ${color}`}>
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col">
            <input 
              type="text"
              value={displayLabel}
              onChange={(e) => updatePartLabel(index, e.target.value)}
              placeholder={defaultLabel}
              className={`text-[10px] font-bold uppercase tracking-wider bg-transparent border-b border-transparent hover:border-slate-700 focus:border-teal-500 outline-none w-full ${color}`}
            />
            {part.customLabel && part.customLabel !== defaultLabel && part.customLabel.trim() !== '' && (
                <span className="text-[8px] text-slate-500 uppercase tracking-widest mt-0.5">Type: {defaultLabel}</span>
            )}
          </div>
          {part.type === 'text' && (
            <input 
              type="text" 
              value={part.value}
              onChange={(e) => updatePartValue(index, e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-1.5 py-0.5 text-xs text-slate-200 mt-1 focus:border-teal-500 outline-none font-mono"
            />
          )}
          {part.type === 'month' && (
             <select 
                value={part.value}
                onChange={(e) => updatePartValue(index, e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-1 outline-none"
             >
                 <option value="Long">Full (January)</option>
                 <option value="Short">Short (Jan)</option>
             </select>
          )}
          {part.type === 'year' && (
             <select 
                value={part.value}
                onChange={(e) => updatePartValue(index, e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-1 outline-none"
             >
                 <option value="Long">4-Digit (2024)</option>
                 <option value="Short">2-Digit (24)</option>
             </select>
          )}
        </div>

        <button onClick={() => removePart(index)} className="text-slate-600 hover:text-rose-400 p-1">
            <X size={14} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center space-x-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
            Smart Renamer
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Logic & Sequence</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-6">
        
        {/* Section 1: Structure Builder */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                    <Settings size={14} className="mr-2" />
                    Pattern Preset
                </h3>
                <button 
                    onClick={resetStructure}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded-md text-slate-400 flex items-center transition-colors"
                >
                    <RotateCcw size={12} className="mr-1" /> Reset
                </button>
            </div>
            
            <div className="space-y-1 mb-4">
                {structure.map((part, idx) => renderPart(part, idx))}
                {structure.length === 0 && (
                    <div className="text-center py-8 text-slate-600 text-xs italic">
                        No pattern defined. Add parts below.
                    </div>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
                <button onClick={() => addPart('name')} className="text-[10px] bg-slate-800 hover:bg-purple-500/20 hover:text-purple-300 border border-slate-700 hover:border-purple-500/50 rounded py-1.5 text-slate-400 transition-colors">
                    + Name
                </button>
                <button onClick={() => addPart('counter')} className="text-[10px] bg-slate-800 hover:bg-blue-500/20 hover:text-blue-300 border border-slate-700 hover:border-blue-500/50 rounded py-1.5 text-slate-400 transition-colors">
                    + Counter
                </button>
                <button onClick={() => addPart('text')} className="text-[10px] bg-slate-800 hover:bg-slate-700 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded py-1.5 text-slate-400 transition-colors">
                    + Text
                </button>
                <button onClick={() => addPart('id')} className="text-[10px] bg-slate-800 hover:bg-teal-500/20 hover:text-teal-300 border border-slate-700 hover:border-teal-500/50 rounded py-1.5 text-slate-400 transition-colors">
                    + ID
                </button>
                <button onClick={() => addPart('month')} className="text-[10px] bg-slate-800 hover:bg-orange-500/20 hover:text-orange-300 border border-slate-700 hover:border-orange-500/50 rounded py-1.5 text-slate-400 transition-colors">
                    + Month
                </button>
                <button onClick={() => addPart('year')} className="text-[10px] bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 border border-slate-700 hover:border-amber-500/50 rounded py-1.5 text-slate-400 transition-colors">
                    + Year
                </button>
            </div>

            {/* Live Preview of Standard */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-center text-teal-400 break-all">
                {formatName(logicState)}
            </div>
        </section>

        {/* Section 2: Reference State */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
            
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                <RefreshCw size={14} className="mr-2" />
                Current Sequence State
            </h3>

            <div className="mb-6 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                <label className="text-[10px] text-slate-500 font-bold block mb-2">Extract State from Filename</label>
                <input 
                    type="text" 
                    value={testFilename} 
                    onChange={handleTestFilenameChange} 
                    placeholder="e.g. ZY 07a. Relapse Demo October 23.m3u"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-sm text-slate-200 font-mono focus:border-teal-500 outline-none transition-colors"
                />
                {validationResult === 'success' && <p className="text-[10px] text-emerald-400 mt-1.5 font-bold">✓ State extracted successfully.</p>}
                {validationResult === 'error' && <p className="text-[10px] text-rose-400 mt-1.5 font-bold">✗ Does not match current pattern preset.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                {hasPart('name') && (
                    <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">{renderStateLabel('name', 'Group Name')}</label>
                        <input type="text" value={logicState.name} onChange={(e) => setLogicState({...logicState, name: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200" />
                    </div>
                )}
                {hasPart('counter') && (
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-slate-500 font-bold">{renderStateLabel('counter', 'Counter')}</label>
                            <label className="flex items-center space-x-1 cursor-pointer">
                                <input type="checkbox" checked={incrementRules.counter} onChange={(e) => setIncrementRules(prev => ({...prev, counter: e.target.checked}))} className="accent-blue-500 w-3 h-3" />
                                <span className="text-[9px] text-blue-400 uppercase font-bold">Auto-Inc</span>
                            </label>
                        </div>
                        <input type="number" value={logicState.counter} onChange={(e) => setLogicState({...logicState, counter: parseInt(e.target.value)})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200" />
                    </div>
                )}
                {hasPart('id') && (
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">{renderStateLabel('id', 'Group ID')}</label>
                        <input type="text" value={logicState.id} onChange={(e) => setLogicState({...logicState, id: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200" />
                    </div>
                )}
                
                {hasPart('month') && (
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-slate-500 font-bold">{renderStateLabel('month', 'Month')}</label>
                            <label className="flex items-center space-x-1 cursor-pointer">
                                <input type="checkbox" checked={incrementRules.month} onChange={(e) => setIncrementRules(prev => ({...prev, month: e.target.checked}))} className="accent-orange-500 w-3 h-3" />
                                <span className="text-[9px] text-orange-400 uppercase font-bold">Auto-Inc</span>
                            </label>
                        </div>
                        <select value={logicState.month} onChange={(e) => setLogicState({...logicState, month: parseInt(e.target.value)})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200 outline-none">
                            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                    </div>
                )}
                {hasPart('year') && (
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-slate-500 font-bold">{renderStateLabel('year', 'Year')}</label>
                            <label className="flex items-center space-x-1 cursor-pointer">
                                <input type="checkbox" checked={incrementRules.year} onChange={(e) => setIncrementRules(prev => ({...prev, year: e.target.checked}))} className="accent-amber-500 w-3 h-3" />
                                <span className="text-[9px] text-amber-400 uppercase font-bold">Auto-Inc</span>
                            </label>
                        </div>
                        <input type="number" value={logicState.year} onChange={(e) => setLogicState({...logicState, year: parseInt(e.target.value)})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200" />
                    </div>
                )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800">
                <label className="text-[10px] text-slate-500 font-bold block mb-2">Generated Filename Preview</label>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-center text-teal-400 break-all shadow-inner">
                    {formatName(logicState)}
                </div>
            </div>

            <div className="mt-6">
                <FileUploader
                    label="Import State from File"
                    subLabel="Drop the LAST playlist here to auto-fill above"
                    files={[]}
                    onFilesSelected={handleReferenceUpload}
                    onClear={() => {}}
                    multiple={false}
                    colorClass="teal"
                />
            </div>
        </section>

        {/* Section 3: Tier Filtering & Process */}
        <section className="space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                    <Filter size={14} className="mr-2" />
                    Tier Filtering & Target Files
                </h3>
             </div>

             <FileUploader
                label="Upload Playlists"
                subLabel="Upload files to filter, combine, and rename"
                files={targetFiles.map(tf => tf.file)}
                onFilesSelected={(f) => { 
                    const newTf = f.map(file => ({ id: Math.random().toString(), file, mode: globalFilterMode, value: globalFilterValue }));
                    setTargetFiles(prev => [...prev, ...newTf]); 
                    setRenamedFiles([]); 
                }}
                onClear={() => { setTargetFiles([]); setRenamedFiles([]); }}
                multiple={true}
                colorClass="blue"
            />

            {targetFiles.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
                    {/* Global Settings */}
                    <div className="flex flex-col space-y-3 pb-4 border-b border-slate-800">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Global Condition</h4>
                            <button 
                                onClick={() => {
                                    setTargetFiles(prev => prev.map(tf => ({ ...tf, mode: globalFilterMode, value: globalFilterValue })));
                                }}
                                className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded hover:bg-blue-500/30 transition-colors"
                            >
                                Apply to All
                            </button>
                        </div>
                        <div className="flex space-x-2">
                            <select 
                                value={globalFilterMode} 
                                onChange={(e) => setGlobalFilterMode(e.target.value as FilterMode)}
                                className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                            >
                                <option value="all">All Songs</option>
                                <option value="topN">Top N Songs</option>
                                <option value="percentage">Percentage (%)</option>
                                <option value="range">Range (e.g. 1-10)</option>
                            </select>
                            {globalFilterMode !== 'all' && (
                                <input 
                                    type="text" 
                                    value={globalFilterValue}
                                    onChange={(e) => setGlobalFilterValue(e.target.value)}
                                    placeholder={globalFilterMode === 'range' ? "1-10" : "Value"}
                                    className="flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                                />
                            )}
                        </div>
                    </div>

                    {/* Individual Files */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {targetFiles.map((tf, idx) => (
                            <div key={tf.id} className="flex flex-col space-y-2 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/50">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-300 truncate pr-2 flex-1">{tf.file.name}</span>
                                    <button onClick={() => setTargetFiles(prev => prev.filter(f => f.id !== tf.id))} className="text-slate-600 hover:text-rose-400">
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="flex space-x-2">
                                    <select 
                                        value={tf.mode} 
                                        onChange={(e) => {
                                            const newMode = e.target.value as FilterMode;
                                            setTargetFiles(prev => prev.map(f => f.id === tf.id ? { ...f, mode: newMode } : f));
                                        }}
                                        className="bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 outline-none focus:border-blue-500 w-28"
                                    >
                                        <option value="all">All Songs</option>
                                        <option value="topN">Top N</option>
                                        <option value="percentage">Percentage</option>
                                        <option value="range">Range</option>
                                    </select>
                                    {tf.mode !== 'all' && (
                                        <input 
                                            type="text" 
                                            value={tf.value}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setTargetFiles(prev => prev.map(f => f.id === tf.id ? { ...f, value: val } : f));
                                            }}
                                            placeholder={tf.mode === 'range' ? "1-10" : "Value"}
                                            className="flex-1 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 outline-none focus:border-blue-500"
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Output Options */}
                    <div className="pt-4 border-t border-slate-800 space-y-3">
                        <label className="flex items-center space-x-2 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                checked={combineFiles} 
                                onChange={(e) => setCombineFiles(e.target.checked)}
                                className="accent-blue-500 w-4 h-4"
                            />
                            <span className="text-xs text-slate-300 group-hover:text-white transition-colors">Combine into single playlist</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                checked={deduplicate} 
                                onChange={(e) => setDeduplicate(e.target.checked)}
                                className="accent-blue-500 w-4 h-4"
                            />
                            <span className="text-xs text-slate-300 group-hover:text-white transition-colors">Deduplicate songs (remove exact matches)</span>
                        </label>
                    </div>
                </div>
            )}

            <button
                onClick={handleProcess}
                disabled={targetFiles.length === 0}
                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] 
                    ${targetFiles.length > 0 
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xl shadow-teal-900/20' 
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'}`}
            >
                <Wand2 size={20} />
                <span>Process & Rename {targetFiles.length > 0 && `(${targetFiles.length})`}</span>
            </button>
        </section>

        {/* Section 4: Results */}
        {renamedFiles.length > 0 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Renamed Sequence</h3>
                    <button 
                        onClick={downloadAll} 
                        className="text-[11px] font-bold text-teal-400 flex items-center bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/20 active:bg-teal-500/20"
                    >
                        <Download size={12} className="mr-1.5" />
                        Download All
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {renamedFiles.map((res, idx) => (
                        <div key={idx} className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between group hover:border-teal-500/30 transition-colors">
                            <div className="min-w-0 pr-4 flex-1">
                                <div className="flex items-center space-x-2 text-[10px] text-slate-500 mb-1">
                                    <span className="truncate max-w-[100px]">{res.original}</span>
                                    <ChevronRight size={10} />
                                </div>
                                <div className="text-xs font-bold text-teal-300 truncate font-mono">{res.newName}</div>
                            </div>
                            <a 
                                href={res.url} 
                                download={res.newName}
                                className="p-2 bg-slate-800 hover:bg-teal-500 hover:text-white text-slate-400 rounded-lg transition-colors"
                            >
                                <Download size={16} />
                            </a>
                        </div>
                    ))}
                </div>
            </div>
        )}

      </div>
    </div>
  );
}