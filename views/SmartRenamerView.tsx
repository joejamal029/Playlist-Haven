import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowUp, ArrowDown, Plus, X, Type, Calendar, Hash, Settings, Download, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Music, Wand2, RefreshCw, Filter, FileAudio, CheckCircle2, AlertCircle } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { downloadPlaylistFile } from '../services/downloadHelper';

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

interface M3UEntry {
  extinf?: string;
  path: string;
  title?: string;
  artist?: string;
}

interface RenamerTargetFile {
  id: string;
  file: File;
  entries?: M3UEntry[];
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
  // Step Management
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // --- STEP 1: PATTERN DEFINITION ---
  const [exampleFilename, setExampleFilename] = useState("ZY 07a. Relapse Demo October 23");
  
  const [structure, setStructure] = useState<NamingPart[]>([]);

  const handleTokenize = () => {
    const base = exampleFilename.replace(/\.m3u8?$/i, '').trim();
    if (!base) return;

    const tokens: NamingPart[] = [];
    const regex = /([a-zA-Z]+|\d+|[^a-zA-Z\d]+)/g;
    let match;
    let foundCounter = false;
    let foundId = false;
    let i = 0;

    while ((match = regex.exec(base)) !== null) {
      let type: PartType = 'text';
      const val = match[0];
      
      if (/^\d+$/.test(val)) {
        if (val.length === 4 && parseInt(val) > 1900 && parseInt(val) < 2100) type = 'year';
        else if (!foundCounter) { type = 'counter'; foundCounter = true; }
      } else if (/^[a-zA-Z]+$/.test(val)) {
        const lower = val.toLowerCase();
        if (MONTHS.some(m => m.toLowerCase().startsWith(lower.slice(0,3)))) type = 'month';
        else if (!foundId && i < 3) { type = 'id'; foundId = true; }
      }

      tokens.push({ id: Math.random().toString(), type, value: val, enabled: true });
      i++;
    }
    setStructure(tokens);
  };

  useEffect(() => {
    if (structure.length === 0 && exampleFilename) {
      handleTokenize();
    }
  }, []);

  // Derived state for validation
  const [parsedState, setParsedState] = useState<LogicState | null>(null);
  const [typeMenuIdx, setTypeMenuIdx] = useState<number | null>(null);

  // --- STEP 2: SEQUENCE CONFIGURATION ---
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

  // --- STEP 3: PLAYLIST PROCESSING ---
  const [targetFiles, setTargetFiles] = useState<RenamerTargetFile[]>([]);
  const [expandedInputIndex, setExpandedInputIndex] = useState<number | null>(null);
  const [expandedOutputIndex, setExpandedOutputIndex] = useState<number | null>(null);

  const [combineFiles, setCombineFiles] = useState(false);
  const [deduplicate, setDeduplicate] = useState(true);
  const [renameMode, setRenameMode] = useState<'generator' | 'matcher'>('generator');

  const [renamedFiles, setRenamedFiles] = useState<{ original: string, newName: string, url: string, content: string, entries: M3UEntry[] }[]>([]);

  // -------------------------------------------------------------
  // LOGIC & PARSING
  // -------------------------------------------------------------

  const hasPart = (type: PartType) => structure.some(p => p.type === type && p.enabled);

  const getPartLabel = (type: PartType, defaultLabel: string) => {
      const part = structure.find(p => p.type === type && p.enabled);
      if (part && part.customLabel !== undefined && part.customLabel.trim() !== '') return part.customLabel;
      return defaultLabel;
  };

  const parseTextForPattern = (filename: string): LogicState | null => {
    let regexStr = "^";
    const counts: Record<string, number> = {
        id: 0, counter: 0, name: 0, month: 0, year: 0
    };

    structure.forEach(part => {
      if (!part.enabled) return;
      if (part.type === 'text') {
          // Escape the text and replace any sequence of separators with a flexible separator match
          let escaped = part.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (/^[\s.,_\-]+$/.test(part.value)) {
              regexStr += `[\\s.,_\\-]+`;
          } else {
              escaped = escaped.replace(/[\s.,_\-]+/g, `[\\s.,_\\-]+`);
              regexStr += escaped;
          }
      } else {
          switch (part.type) {
            case 'id': regexStr += `(?<id_${counts.id++}>[a-zA-Z0-9_\\-]+)`; break;
            case 'counter': regexStr += `(?<counter_${counts.counter++}>\\d+)`; break;
            case 'name': regexStr += `(?<name_${counts.name++}>.+?)`; break;
            case 'month': regexStr += `(?<month_${counts.month++}>[a-zA-Z]+)`; break;
            case 'year': regexStr += `(?<year_${counts.year++}>\\d{2,4})`; break;
          }
      }
    });
    regexStr += "$";

    const nameOnly = filename.replace(/\.m3u8?$/i, '').trim();
    
    try {
        const regex = new RegExp(regexStr, 'i');
        const match = nameOnly.match(regex);
        if (match && match.groups) {
          const g = match.groups;
          const newState: LogicState = { ...logicState };
          
          const extractLast = (prefix: string) => {
              const keys = Object.keys(g).filter(k => k.startsWith(`${prefix}_`));
              if (keys.length > 0) return g[keys[keys.length - 1]];
              return undefined;
          };

          const gId = extractLast('id');
          if (gId) newState.id = gId;
          
          const gCounter = extractLast('counter');
          if (gCounter) {
            newState.counter = parseInt(gCounter);
            newState.counterPadding = gCounter.length;
          }
          
          const gName = extractLast('name');
          if (gName) newState.name = gName.trim();
          
          const gMonth = extractLast('month');
          if (gMonth) {
            const mStr = gMonth.toLowerCase();
            const mIndex = MONTHS.findIndex(m => m.toLowerCase().startsWith(mStr.slice(0,3)));
            if (mIndex >= 0) newState.month = mIndex;
          }
          
          const gYear = extractLast('year');
          if (gYear) {
            let y = parseInt(gYear);
            if (y < 100) y += 2000;
            newState.year = y;
          }
          
          return newState;
        }
    } catch(err) {
        console.error("Regex error:", err);
        return null;
    }
    
    return null;
  };

  // Run validation effect
  useEffect(() => {
     if (exampleFilename.trim() === '') {
         setParsedState(null);
         return;
     }
     const state = parseTextForPattern(exampleFilename);
     setParsedState(state);
  }, [exampleFilename, structure]);

  const getNextState = (current: LogicState, steps = 1): LogicState => {
    let nextCount = current.counter;
    let nextMonth = current.month;
    let nextYear = current.year;

    if (incrementRules.counter) nextCount += steps;

    if (incrementRules.month) {
        let totalMonths = current.year * 12 + current.month + steps;
        nextYear = Math.floor(totalMonths / 12);
        nextMonth = totalMonths % 12;
    } else if (incrementRules.year) {
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
          if (state.month >= 0 && state.month < 12) {
              const isShortMonth = part.value === 'Short' || part.value.length === 3;
              name += isShortMonth ? SHORT_MONTHS[state.month] : MONTHS[state.month]; 
          }
          break;
        case 'year': 
          const isShortYear = part.value === 'Short' || part.value.length === 2;
          name += isShortYear ? state.year.toString().slice(-2) : state.year.toString(); 
          break;
      }
    });
    return name + ".m3u";
  };

  const formatShape = (): string => {
    let name = "";
    structure.forEach(part => {
      if (!part.enabled) return;
      switch (part.type) {
        case 'id': name += `[${getPartLabel('id', 'ID')}]`; break;
        case 'counter': name += `[${getPartLabel('counter', 'Counter')}]`; break;
        case 'name': name += `[${getPartLabel('name', 'Name')}]`; break;
        case 'text': name += part.value; break;
        case 'month': name += `[${getPartLabel('month', 'Month')}]`; break;
        case 'year': name += `[${getPartLabel('year', 'Year')}]`; break;
      }
    });
    if (name === "") return "Empty Pattern";
    return name + ".m3u";
  };

  // -------------------------------------------------------------
  // UX ACTIONS
  // -------------------------------------------------------------

  const handleApplyPattern = () => {
    if (parsedState) {
        setLogicState(parsedState); // Base sequence state is locked in
        setActiveStep(2);
    }
  };

  // M3U PROCESSING
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

  const parseM3U = async (file: File): Promise<M3UEntry[]> => {
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const entries: M3UEntry[] = [];
    let currentExtinf: string | undefined;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#EXTINF:')) currentExtinf = trimmed;
      else if (!trimmed.startsWith('#')) {
        const { title, artist } = parseExtInf(currentExtinf || '', trimmed);
        entries.push({ extinf: currentExtinf, path: trimmed, title, artist });
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

  const matchUploadedFilename = (filename: string, baseState: LogicState): LogicState | null => {
    const nameOnly = filename.replace(/\.m3u8?$/i, '').trim();
    const newState: LogicState = { ...baseState };
    let matchedAny = false;

    // 1. Match Name (Primary mechanism)
    if (hasPart('name') && baseState.name) {
      const escapedName = baseState.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegex = new RegExp(escapedName, 'i');
      if (!nameRegex.test(nameOnly)) {
        // If name is defined in pattern but doesn't exist in uploaded filename, it's not a match!
        return null;
      }
      newState.name = baseState.name;
      matchedAny = true;
    }

    // 2. Match Month
    if (hasPart('month')) {
      let foundMonthIdx = -1;
      // Search for full month names
      for (let m = 0; m < 12; m++) {
        const monthName = MONTHS[m];
        const monthRegex = new RegExp(`\\b${monthName}\\b`, 'i');
        if (monthRegex.test(nameOnly)) {
          foundMonthIdx = m;
          break;
        }
      }
      // If not found, search for short month names
      if (foundMonthIdx === -1) {
        for (let m = 0; m < 12; m++) {
          const shortMonth = SHORT_MONTHS[m];
          const shortRegex = new RegExp(`\\b${shortMonth}\\b`, 'i');
          if (shortRegex.test(nameOnly)) {
            foundMonthIdx = m;
            break;
          }
        }
      }

      if (foundMonthIdx !== -1) {
        newState.month = foundMonthIdx;
        matchedAny = true;
      }
    }

    // 3. Match Year
    if (hasPart('year')) {
      // Find 4-digit or 2-digit years
      const yearRegex = /\b(20\d{2}|19\d{2}|\d{2})\b/g;
      let match;
      let foundYear = -1;
      while ((match = yearRegex.exec(nameOnly)) !== null) {
        const yrStr = match[1];
        let yrVal = parseInt(yrStr, 10);
        if (yrStr.length === 2) {
          yrVal += 2000; // Convert 2-digit to 4-digit
        }
        if (yrVal >= 1950 && yrVal <= 2100) {
          foundYear = yrVal;
          break;
        }
      }

      if (foundYear !== -1) {
        newState.year = foundYear;
        matchedAny = true;
      }
    }

    // 4. Match ID
    if (hasPart('id') && baseState.id) {
      const escapedId = baseState.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const idRegex = new RegExp(`\\b${escapedId}\\b`, 'i');
      if (idRegex.test(nameOnly)) {
        newState.id = baseState.id;
        matchedAny = true;
      }
    }

    return matchedAny ? newState : null;
  };

  const handleProcess = async () => {
    if (targetFiles.length === 0) return;
    
    // 1. Process and parse all target files first
    const items: { 
      id: string;
      originalIndex: number;
      originalName: string;
      entries: M3UEntry[];
      parsed?: LogicState;
      fileState: LogicState | null;
    }[] = [];

    for (let idx = 0; idx < targetFiles.length; idx++) {
      const tf = targetFiles[idx];
      let entries = tf.entries;
      if (!entries) {
          entries = await parseM3U(tf.file);
      }
      
      let parsed: LogicState | undefined = undefined;
      if (renameMode === 'matcher') {
        const matched = matchUploadedFilename(tf.file.name, logicState);
        if (matched) {
          parsed = matched;
        }
      }
      
      items.push({
        id: tf.id,
        originalIndex: idx,
        originalName: tf.file.name,
        entries,
        parsed,
        fileState: null
      });
    }

    // Cache parsed entries in raw component state as well
    setTargetFiles(prev => prev.map((f, i) => ({ ...f, entries: items[i].entries })));

    const results = [];
    let finalState = { ...logicState };

    if (combineFiles) {
      let combinedEntries: M3UEntry[] = [];
      for (const item of items) combinedEntries.push(...item.entries);

      if (deduplicate) {
        const seen = new Set<string>();
        const deduped: M3UEntry[] = [];
        for (const e of combinedEntries) {
          if (!seen.has(e.path)) { seen.add(e.path); deduped.push(e); }
        }
        combinedEntries = deduped;
      }

      finalState = getNextState(logicState, 1);
      const newName = formatName(finalState);
      const m3uContent = generateM3U(combinedEntries);
      const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });

      results.push({
        original: `${targetFiles.length} playlists combined`,
        newName,
        url: URL.createObjectURL(blob),
        content: m3uContent,
        entries: combinedEntries
      });
    } else {
      // 2. Multi-file sequencing
      if (renameMode === 'generator') {
        let activeLogicState = { ...logicState };
        for (let i = 0; i < items.length; i++) {
          activeLogicState = getNextState(activeLogicState, 1);
          items[i].fileState = { ...activeLogicState };
        }
        finalState = activeLogicState;
      } else {
        // Smart Matcher: Calculate chronological date distance to assign sequence counters
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const fileState = { ...logicState };
          
          if (item.parsed) {
            let dateDistance = 0;
            if (hasPart('month') && hasPart('year')) {
              const baseTotalMonths = logicState.year * 12 + logicState.month;
              const currentTotalMonths = item.parsed.year * 12 + item.parsed.month;
              dateDistance = currentTotalMonths - baseTotalMonths;
            } else if (hasPart('year')) {
              dateDistance = item.parsed.year - logicState.year;
            } else if (hasPart('month')) {
              dateDistance = item.parsed.month - logicState.month;
            }
            
            fileState.name = item.parsed.name;
            fileState.month = item.parsed.month;
            fileState.year = item.parsed.year;
            fileState.id = item.parsed.id;
            
            if (incrementRules.counter && hasPart('counter')) {
              fileState.counter = logicState.counter + dateDistance;
            }
          } else {
            // Fallback for unmatched files: standard incremental increment
            const activeLogicState = getNextState(logicState, i + 1);
            fileState.name = activeLogicState.name;
            fileState.month = activeLogicState.month;
            fileState.year = activeLogicState.year;
            fileState.id = activeLogicState.id;
            fileState.counter = activeLogicState.counter;
          }

          item.fileState = fileState;
        }
        
        if (items.length > 0) {
          finalState = items[items.length - 1].fileState || logicState;
        }
      }

      // 3. Build output list preserving exact original upload order of target files
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let entries = item.entries;
        if (deduplicate) {
          const seen = new Set<string>();
          const deduped: M3UEntry[] = [];
          for (const e of entries) {
            if (!seen.has(e.path)) { seen.add(e.path); deduped.push(e); }
          }
          entries = deduped;
        }

        const fileState = item.fileState || getNextState(logicState, i + 1);
        const newName = formatName(fileState);
        const m3uContent = generateM3U(entries);
        const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });

        results.push({
          original: item.originalName,
          newName,
          url: URL.createObjectURL(blob),
          content: m3uContent,
          entries
        });
      }
    }

    setRenamedFiles(results);
    setLogicState(finalState);
  };

  const downloadAll = async () => {
    for (let i = 0; i < renamedFiles.length; i++) {
        const res = renamedFiles[i];
        await downloadPlaylistFile(res.content, res.newName, 'audio/x-mpegurl');
        await new Promise(resolve => setTimeout(resolve, 300));
    }
  };


  // -------------------------------------------------------------
  // RENDER HELPERS
  // -------------------------------------------------------------

  const mergeLeft = (idx: number) => {
    if (idx <= 0) return;
    const newStruct = [...structure];
    newStruct[idx - 1].value += newStruct[idx].value;
    newStruct[idx - 1].type = 'text'; // Reset to text on merge so they actively choose
    newStruct.splice(idx, 1);
    setStructure(newStruct);
  };

  const mergeRight = (idx: number) => {
    if (idx >= structure.length - 1) return;
    const newStruct = [...structure];
    newStruct[idx].value += newStruct[idx + 1].value;
    newStruct[idx].type = 'text';
    newStruct.splice(idx + 1, 1);
    setStructure(newStruct);
  };

  const updatePartValue = (idx: number, val: string) => {
    const newStruct = [...structure];
    newStruct[idx].value = val;
    setStructure(newStruct);
  };

  const updatePartType = (idx: number, type: PartType) => {
    const newStruct = [...structure];
    newStruct[idx].type = type;
    setStructure(newStruct);
  };

  const getTypeColorCode = (type: PartType) => {
      switch (type) {
          case 'id': return 'text-teal-400 bg-teal-500/10 border-teal-500/30';
          case 'counter': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
          case 'name': return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
          case 'month': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
          case 'year': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
          case 'text': return 'text-slate-300 bg-slate-800 border-slate-700/50';
      }
  };

  const renderStateLabel = (type: PartType, defaultLabel: string) => {
      const custom = getPartLabel(type, defaultLabel);
      if (custom !== defaultLabel) {
          return <>{custom} <span className="font-normal opacity-50 ml-1">({defaultLabel})</span></>;
      }
      return custom;
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-slate-950">
      <div className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
            <ArrowLeft size={20} />
            </button>
            <div>
            <h2 className="text-lg font-bold text-white">
                Smart Renamer
            </h2>
            <p className="text-[10px] text-teal-400 uppercase tracking-widest font-bold">Sequence Normalizer</p>
            </div>
        </div>
        
        {/* Step Indicator */}
        <div className="hidden sm:flex items-center space-x-2 text-xs font-bold text-slate-500">
            <div className={`px-2 py-1 rounded transition-colors ${activeStep === 1 ? 'bg-teal-500/20 text-teal-400' : (activeStep > 1 ? 'text-teal-500' : '')}`}>1. Pattern</div>
            <ChevronRight size={12} className="opacity-30" />
            <div className={`px-2 py-1 rounded transition-colors ${activeStep === 2 ? 'bg-blue-500/20 text-blue-400' : (activeStep > 2 ? 'text-blue-500' : '')}`}>2. Sequence</div>
            <ChevronRight size={12} className="opacity-30" />
            <div className={`px-2 py-1 rounded transition-colors ${activeStep === 3 ? 'bg-purple-500/20 text-purple-400' : ''}`}>3. Process</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-6">
        
        {/* --- STEP 1: PATTERN DEFINITION --- */}
        <section className={`transition-all duration-300 ${activeStep !== 1 ? 'opacity-50 grayscale hover:grayscale-0 hover:opacity-100 cursor-pointer' : ''}`} onClick={() => activeStep !== 1 && setActiveStep(1)}>
            <div className="flex items-center mb-4 space-x-2">
                <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-xs ring-1 ring-teal-500/50">1</div>
                <h3 className="text-sm font-bold text-slate-200">Define Example Pattern</h3>
            </div>
            
            {activeStep === 1 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-6">
                    <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2 block">1. Provide an Example Filename</label>
                        <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                            <input 
                                type="text"
                                value={exampleFilename}
                                onChange={(e) => setExampleFilename(e.target.value)}
                                placeholder="e.g. ZY 07a. Relapse Demo October 23"
                                className="flex-1 bg-slate-950 border border-slate-700/50 focus:border-teal-500 text-teal-300 p-2.5 rounded text-sm font-mono outline-none shadow-inner"
                            />
                            <div className="w-full sm:w-48 relative h-10 border border-dashed border-slate-700 hover:border-teal-500 rounded flex items-center justify-center bg-slate-950 overflow-hidden cursor-pointer">
                                <span className="text-[10px] text-slate-500 font-bold uppercase pointer-events-none">Drop M3U File Hint</span>
                                <input 
                                    type="file" 
                                    className="absolute inset-0 opacity-0 cursor-pointer" 
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                            setExampleFilename(e.target.files[0].name.replace(/\.m3u8?$/i, ''));
                                        }
                                    }}
                                />
                            </div>
                            <button onClick={handleTokenize} className="px-4 bg-teal-600 hover:bg-teal-500 text-white rounded font-bold text-xs uppercase tracking-wider transition-colors active:scale-95 shadow shrink-0">
                                Auto-Split
                            </button>
                        </div>
                    </div>

                    {structure.length > 0 && (
                        <div className="border-t border-slate-800/50 pt-4 bg-slate-900 rounded">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">2. Construct Pattern from Blocks</label>
                                <button onClick={() => setStructure([])} className="text-[10px] text-rose-400 hover:text-rose-300 uppercase font-bold px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 transition-colors">Clear</button>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 bg-slate-950 p-6 pt-8 rounded-lg border border-slate-800 shadow-inner overflow-visible min-h-[140px]">
                                {structure.map((part, idx) => (
                                    <div key={part.id} className="relative group flex flex-col items-center">
                                        <div className="absolute -top-7 flex w-[120%] justify-between px-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            {idx > 0 ? (
                                                <button onClick={() => mergeLeft(idx)} className="bg-slate-700 hover:bg-teal-500 rounded p-0.5 text-white shadow" title="Merge Left">
                                                    <ChevronLeft size={12} />
                                                </button>
                                            ) : <div />}
                                            {idx < structure.length - 1 ? (
                                                <button onClick={() => mergeRight(idx)} className="bg-slate-700 hover:bg-teal-500 rounded p-0.5 text-white shadow" title="Merge Right">
                                                    <ChevronRight size={12} />
                                                </button>
                                            ) : <div />}
                                        </div>
                                        
                                        <div className={`border rounded-lg p-2 pb-1.5 flex flex-col items-center min-w-[3rem] shadow-sm transition-colors relative ${getTypeColorCode(part.type)}`}>
                                            <span 
                                                className="block text-center font-mono text-[13px] font-medium text-white px-1 whitespace-pre max-w-[150px] overflow-hidden text-ellipsis"
                                                title={part.value}
                                            >
                                                {part.value === ' ' ? '\u00A0' : part.value}
                                            </span>
                                            <div className="relative z-20 flex flex-col items-center w-full mt-1.5">
                                                <button
                                                    onClick={(e) => { e.preventDefault(); setTypeMenuIdx(typeMenuIdx === idx ? null : idx); }}
                                                    onContextMenu={(e) => { e.preventDefault(); setTypeMenuIdx(typeMenuIdx === idx ? null : idx); }}
                                                    className={`w-full text-[9px] bg-black/30 rounded px-1 py-0.5 outline-none font-bold uppercase tracking-widest text-center cursor-pointer hover:bg-black/50 transition-colors ${part.type !== 'text' ? 'text-white' : 'text-slate-400'}`}
                                                >
                                                    {part.type === 'counter' ? 'Count' : part.type === 'text' ? 'Literal' : part.type}
                                                </button>
                                                {typeMenuIdx === idx && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setTypeMenuIdx(null); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setTypeMenuIdx(null); }} />
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-800 border border-slate-700 rounded shadow-xl z-50 flex flex-col py-1 min-w-[90px] max-h-48 overflow-y-auto">
                                                            {(['text', 'id', 'counter', 'name', 'month', 'year'] as PartType[]).map(t => (
                                                                <button 
                                                                    key={t} 
                                                                    onClick={(e) => { e.stopPropagation(); updatePartType(idx, t); setTypeMenuIdx(null); }}
                                                                    className={`text-[10px] text-left px-3 py-2 hover:bg-teal-500 hover:text-white uppercase tracking-widest font-bold transition-colors ${part.type === t ? 'text-teal-400 bg-teal-500/10' : 'text-slate-300'}`}
                                                                >
                                                                    {t === 'counter' ? 'Count' : t === 'text' ? 'Literal' : t}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <button onClick={() => setStructure(structure.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-slate-700 hover:bg-rose-500 rounded-full p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                                            <X size={10}/>
                                        </button>
                                    </div>
                                ))}
                                
                                <button onClick={() => setStructure([...structure, {id: Math.random().toString(), type: 'text', value: ' ', enabled: true}])} className="border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 rounded-lg p-3 flex flex-col items-center justify-center transition-colors min-h-[64px]">
                                    <Plus size={16} className="mb-1" />
                                    <span className="text-[9px] uppercase font-bold tracking-widest">Add Text</span>
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-3 text-center px-4">Hover over blocks to merge (&lt; / &gt;) adjacent chunks or delete (x) them. Change a block's type using the dropdown to assign the 6 naming constraints.</p>
                        </div>
                    )}

                    {/* Extracted Data Validation Area */}
                    <div className="pt-4 border-t border-slate-800/50">
                        {parsedState ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 transition-all">
                                <div className="flex items-center text-emerald-400 font-bold text-sm mb-3">
                                    <CheckCircle2 size={16} className="mr-2" /> Match Successful!
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-emerald-100 bg-emerald-950/40 p-3 rounded border border-emerald-500/10 mb-4">
                                    {hasPart('id') && <div><span className="text-emerald-500/50">ID:</span> {parsedState.id}</div>}
                                    {hasPart('counter') && <div><span className="text-emerald-500/50">Count:</span> {parsedState.counter} (pad:{parsedState.counterPadding})</div>}
                                    {hasPart('name') && <div className="col-span-2"><span className="text-emerald-500/50">Name:</span> {parsedState.name}</div>}
                                    {hasPart('month') && <div><span className="text-emerald-500/50">Month:</span> {MONTHS[parsedState.month] || parsedState.month}</div>}
                                    {hasPart('year') && <div><span className="text-emerald-500/50">Year:</span> {parsedState.year}</div>}
                                </div>
                                <button 
                                    onClick={handleApplyPattern}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-all active:scale-[0.98] flex items-center justify-center space-x-2 shadow-lg shadow-emerald-900/20"
                                >
                                    <span>Lock Pattern & Continue to Sequence</span>
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-amber-400 text-sm flex items-start transition-all">
                                <AlertCircle size={16} className="mr-2 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-bold">Pattern mismatch</p>
                                    <p className="text-[10px] mt-1 text-amber-500/80">The current blocks do not PERFECTLY align with your example filename. Ensure spaces, hyphens, and dots are accounted for by "Literal Text" blocks. The engine compares block-by-block.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>


        {/* --- STEP 2: SEQUENCE CONFIGURATION --- */}
        <section className={`transition-all duration-300 ${activeStep !== 2 ? (activeStep < 2 ? 'opacity-30 pointer-events-none' : 'opacity-50 grayscale hover:grayscale-0 hover:opacity-100 cursor-pointer') : ''}`} onClick={() => activeStep > 1 && activeStep !== 2 && setActiveStep(2)}>
            <div className="flex items-center mb-4 space-x-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ring-1 transition-colors ${activeStep === 2 ? 'bg-blue-500/20 text-blue-400 ring-blue-500/50' : 'bg-slate-800 text-slate-500 ring-slate-700'}`}>2</div>
                <h3 className={`text-sm font-bold transition-colors ${activeStep === 2 ? 'text-slate-200' : 'text-slate-500'}`}>Configure Sequence Iterator</h3>
            </div>

            {activeStep === 2 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-6">
                    <p className="text-[11px] text-slate-400">Review your <strong className="text-slate-200">Base State</strong> captured from Step 1. Define which fields auto-increment on each output file.</p>
                    
                    <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800/50 shadow-inner">
                        {hasPart('name') && (
                            <div className="col-span-2">
                                <label className="text-[10px] text-slate-500 font-bold block mb-1.5">{renderStateLabel('name', 'Name')}</label>
                                <input type="text" value={logicState.name} onChange={(e) => setLogicState({...logicState, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded p-2 text-sm text-slate-200 transition-colors" />
                            </div>
                        )}
                        {hasPart('counter') && (
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-[10px] text-slate-500 font-bold">{renderStateLabel('counter', 'Counter')}</label>
                                    <label className="flex items-center space-x-1 cursor-pointer group">
                                        <input type="checkbox" checked={incrementRules.counter} onChange={(e) => setIncrementRules(prev => ({...prev, counter: e.target.checked}))} className="accent-blue-500 w-3 h-3 group-hover:scale-110 transition-transform" />
                                        <span className={`text-[9px] uppercase font-bold transition-colors ${incrementRules.counter ? 'text-blue-400' : 'text-slate-500'}`}>Auto-Inc</span>
                                    </label>
                                </div>
                                <input 
                                    type="text" 
                                    value={logicState.counter.toString().padStart(logicState.counterPadding, '0')} 
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (val === '') setLogicState({...logicState, counter: 0, counterPadding: 1});
                                        else setLogicState({...logicState, counter: parseInt(val, 10), counterPadding: val.length});
                                    }} 
                                    className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded p-2 text-sm text-slate-200 font-mono transition-colors" 
                                />
                            </div>
                        )}
                        {hasPart('id') && (
                            <div>
                                <label className="text-[10px] text-slate-500 font-bold block mb-1.5">{renderStateLabel('id', 'ID')}</label>
                                <input type="text" value={logicState.id} onChange={(e) => setLogicState({...logicState, id: e.target.value})} className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded p-2 text-sm text-slate-200 transition-colors" />
                            </div>
                        )}
                        
                        {hasPart('month') && (
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-[10px] text-slate-500 font-bold">{renderStateLabel('month', 'Month')}</label>
                                    <label className="flex items-center space-x-1 cursor-pointer group">
                                        <input type="checkbox" checked={incrementRules.month} onChange={(e) => setIncrementRules(prev => ({...prev, month: e.target.checked}))} className="accent-blue-500 w-3 h-3 group-hover:scale-110 transition-transform" />
                                        <span className={`text-[9px] uppercase font-bold transition-colors ${incrementRules.month ? 'text-blue-400' : 'text-slate-500'}`}>Auto-Inc</span>
                                    </label>
                                </div>
                                <select value={logicState.month} onChange={(e) => setLogicState({...logicState, month: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded p-2 text-sm text-slate-200 transition-colors">
                                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                </select>
                                <div className="mt-2">
                                    <label className="text-[9px] text-slate-500 font-bold block mb-1">Month Format</label>
                                    <select 
                                        value={structure.find(p => p.type === 'month')?.value === 'Short' || (structure.find(p => p.type === 'month')?.value?.length === 3) ? 'Short' : 'Full'} 
                                        onChange={(e) => {
                                            const newStruct = structure.map(p => {
                                                if (p.type === 'month') {
                                                    return { ...p, value: e.target.value };
                                                }
                                                return p;
                                            });
                                            setStructure(newStruct);
                                        }}
                                        className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded p-1.5 text-xs text-slate-200 transition-colors"
                                    >
                                        <option value="Full">Full (e.g. October)</option>
                                        <option value="Short">Short (e.g. Oct)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        {hasPart('year') && (
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-[10px] text-slate-500 font-bold">{renderStateLabel('year', 'Year')}</label>
                                    <label className="flex items-center space-x-1 cursor-pointer group">
                                        <input type="checkbox" checked={incrementRules.year} onChange={(e) => setIncrementRules(prev => ({...prev, year: e.target.checked}))} className="accent-blue-500 w-3 h-3 group-hover:scale-110 transition-transform" />
                                        <span className={`text-[9px] uppercase font-bold transition-colors ${incrementRules.year ? 'text-blue-400' : 'text-slate-500'}`}>Auto-Inc</span>
                                    </label>
                                </div>
                                <input type="number" value={logicState.year} onChange={(e) => setLogicState({...logicState, year: parseInt(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded p-2 text-sm text-slate-200 transition-colors" />
                                <div className="mt-2">
                                    <label className="text-[9px] text-slate-500 font-bold block mb-1">Year Format</label>
                                    <select 
                                        value={structure.find(p => p.type === 'year')?.value === 'Short' || (structure.find(p => p.type === 'year')?.value?.length === 2) ? 'Short' : 'Full'} 
                                        onChange={(e) => {
                                            const newStruct = structure.map(p => {
                                                if (p.type === 'year') {
                                                    return { ...p, value: e.target.value };
                                                }
                                                return p;
                                            });
                                            setStructure(newStruct);
                                        }}
                                        className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded p-1.5 text-xs text-slate-200 transition-colors"
                                    >
                                        <option value="Full">Full (e.g. 2025)</option>
                                        <option value="Short">Short (e.g. 25)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                        <label className="block text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-2">
                            <Wand2 size={12} className="inline mr-1 -mt-0.5" /> Resulting Filename for Next Operation
                        </label>
                        <div className="bg-slate-950 p-3 rounded font-mono text-sm text-white break-all shadow-inner border border-blue-500/30">
                            {formatName(getNextState(logicState, 1))}
                        </div>
                    </div>

                    <button 
                        onClick={() => setActiveStep(3)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all active:scale-[0.98] flex items-center justify-center space-x-2 shadow-lg shadow-blue-900/20"
                    >
                        <span>Confirm Sequence behavior</span>
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </section>

        {/* --- STEP 3: PLAYLIST PROCESSING --- */}
        <section className={`transition-all duration-300 ${activeStep !== 3 ? 'opacity-30 pointer-events-none' : ''}`}>
            <div className="flex items-center mb-4 space-x-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ring-1 transition-colors ${activeStep === 3 ? 'bg-purple-500/20 text-purple-400 ring-purple-500/50' : 'bg-slate-800 text-slate-500 ring-slate-700'}`}>3</div>
                <h3 className={`text-sm font-bold transition-colors ${activeStep === 3 ? 'text-slate-200' : 'text-slate-500'}`}>Drop & Rename Playlists</h3>
            </div>

            {activeStep === 3 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-6">
                    <FileUploader
                        label="Upload Playlists"
                        subLabel="Upload files to sequence and rename"
                        files={targetFiles.map(tf => tf.file)}
                        onFilesSelected={async (f) => { 
                            const newTfs: RenamerTargetFile[] = [];
                            for (const file of f) {
                                const id = Math.random().toString();
                                const entries = await parseM3U(file);
                                newTfs.push({ id, file, entries });
                            }
                            setTargetFiles(prev => [...prev, ...newTfs]); 
                            setRenamedFiles([]); 
                        }}
                        onClear={() => { setTargetFiles([]); setRenamedFiles([]); }}
                        multiple={true}
                        colorClass="purple"
                    />

                    {targetFiles.length > 0 && (
                        <div className="space-y-4">
                            <div className="bg-slate-950/50 rounded-lg border border-slate-800/50">
                                <div className="p-3 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800">
                                    Input Playlists
                                </div>
                                <div className="space-y-0 max-h-64 overflow-y-auto custom-scrollbar">
                                    {targetFiles.map((tf, idx) => (
                                        <div key={tf.id} className="border-b border-slate-800/50 last:border-0">
                                            <div 
                                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-900 transition-colors"
                                                onClick={() => setExpandedInputIndex(expandedInputIndex === idx ? null : idx)}
                                            >
                                                <div className="flex flex-col flex-1 min-w-0 mr-4">
                                                    <span className="text-[11px] text-slate-200 truncate font-mono" title={tf.file.name}>{tf.file.name}</span>
                                                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                        {tf.entries && (
                                                            <span className="text-[10px] text-slate-500">{tf.entries.length} tracks</span>
                                                        )}
                                                        {renameMode === 'matcher' && (() => {
                                                            const match = matchUploadedFilename(tf.file.name, logicState);
                                                            if (match) {
                                                                const extractedParts = [];
                                                                if (hasPart('name')) extractedParts.push(`Name: "${match.name}"`);
                                                                if (hasPart('month')) extractedParts.push(`M: ${MONTHS[match.month]}`);
                                                                if (hasPart('year')) extractedParts.push(`Y: ${match.year}`);
                                                                return (
                                                                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold flex items-center">
                                                                        <CheckCircle2 size={10} className="mr-1 inline-block shrink-0" />
                                                                        Matched ({extractedParts.join(', ') || 'no fields'})
                                                                    </span>
                                                                );
                                                            } else {
                                                                return (
                                                                    <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold flex items-center">
                                                                        <AlertCircle size={10} className="mr-1 inline-block shrink-0" />
                                                                        Mismatch (will use default template fallback)
                                                                    </span>
                                                                );
                                                            }
                                                        })()}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2 text-slate-500 flex-shrink-0">
                                                    <div className="flex space-x-1 mr-2" onClick={e => e.stopPropagation()}>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setTargetFiles(prev => { const n = [...prev]; [n[idx], n[idx-1]] = [n[idx-1], n[idx]]; return n; }) }}
                                                            disabled={idx === 0}
                                                            className={`p-1 rounded ${idx === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-700 bg-slate-800 hover:text-white'}`}
                                                        ><ArrowUp size={12} /></button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setTargetFiles(prev => { const n = [...prev]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n; }) }}
                                                            disabled={idx === targetFiles.length - 1}
                                                            className={`p-1 rounded ${idx === targetFiles.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-700 bg-slate-800 hover:text-white'}`}
                                                        ><ArrowDown size={12} /></button>
                                                    </div>
                                                    {expandedInputIndex === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </div>
                                            </div>
                                            
                                            {expandedInputIndex === idx && tf.entries && (
                                                <div className="bg-slate-900 border-t border-slate-800/50 p-2 max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                                                    {tf.entries.map((track, tIdx) => (
                                                        <div key={tIdx} className="flex items-center space-x-3 py-1.5 border-b border-slate-800/50 last:border-0 relative group">
                                                            <div className="bg-slate-800/50 text-slate-500 rounded p-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
                                                                <Music size={12} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-xs font-medium text-slate-300 truncate">{track.title || 'Unknown Title'}</div>
                                                                <div className="text-[10px] text-slate-500 truncate">{track.artist || 'Unknown Artist'}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Renaming Mode Options */}
                            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 flex space-x-2">
                                <div 
                                    className={`flex-1 p-3 rounded border cursor-pointer transition-colors ${renameMode === 'generator' ? 'bg-purple-900/20 border-purple-500/50 text-purple-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                                    onClick={() => setRenameMode('generator')}
                                >
                                    <div className="text-xs font-bold mb-1 flex items-center"><Wand2 size={12} className="mr-1.5" /> Sequence Generator</div>
                                    <div className="text-[10px] leading-tight opacity-70">Generates sequential names, ignoring original filenames.</div>
                                </div>
                                <div 
                                    className={`flex-1 p-3 rounded border cursor-pointer transition-colors ${renameMode === 'matcher' ? 'bg-purple-900/20 border-purple-500/50 text-purple-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                                    onClick={() => setRenameMode('matcher')}
                                >
                                    <div className="text-xs font-bold mb-1 flex items-center"><RefreshCw size={12} className="mr-1.5" /> Smart Matcher</div>
                                    <div className="text-[10px] leading-tight opacity-70">Matches and preserves original Name, Month, & Year values.</div>
                                </div>
                            </div>

                            {/* Batch Options */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <label className="flex items-center space-x-2 p-3 bg-slate-950 rounded border border-slate-800 cursor-pointer hover:border-purple-500/30 transition-colors">
                                    <input type="checkbox" checked={combineFiles} onChange={(e) => setCombineFiles(e.target.checked)} className="accent-purple-500 w-4 h-4" />
                                    <span className={combineFiles ? 'text-slate-200' : 'text-slate-500'}>Combine to 1 file</span>
                                </label>
                                {combineFiles && (
                                    <label className="flex items-center space-x-2 p-3 bg-slate-950 rounded border border-slate-800 cursor-pointer hover:border-purple-500/30 transition-colors">
                                        <input type="checkbox" checked={deduplicate} onChange={(e) => setDeduplicate(e.target.checked)} className="accent-purple-500 w-4 h-4" />
                                        <span className={deduplicate ? 'text-slate-200' : 'text-slate-500'}>Deduplicate</span>
                                    </label>
                                )}
                            </div>

                            <button
                                onClick={handleProcess}
                                disabled={targetFiles.length === 0}
                                className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center space-x-2 transition-all active:scale-[0.98] bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20"
                            >
                                <Wand2 size={18} />
                                <span>Generate {combineFiles ? '1 Merged Sequence' : `${targetFiles.length} Sequences`}</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </section>

        {/* RESULTS */}
        {renamedFiles.length > 0 && activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 pt-4 border-t border-slate-800/50">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-200">Processing Complete!</h3>
                    <button 
                        onClick={downloadAll} 
                        className="text-[11px] font-bold text-purple-200 bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg transition-colors flex items-center shadow-lg shadow-purple-900/40"
                    >
                        <Download size={14} className="mr-1.5" />
                        Download All
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {renamedFiles.map((res, idx) => (
                        <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-purple-500/30 transition-colors shadow-sm">
                            <div 
                                className="p-3 flex items-center justify-between cursor-pointer"
                                onClick={() => setExpandedOutputIndex(expandedOutputIndex === idx ? null : idx)}
                            >
                                <div className="min-w-0 pr-4 flex-1">
                                    <div className="text-[10px] text-slate-500 mb-0.5 truncate" title={res.original}>{res.original}</div>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-sm font-bold text-purple-300 font-mono truncate" title={res.newName}>{res.newName}</span>
                                        {res.entries && (
                                            <span className="text-[10px] text-purple-500/70 shrink-0 bg-purple-900/30 px-1.5 py-0.5 rounded">{res.entries.length} tracks</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <button 
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            await downloadPlaylistFile(res.content, res.newName, 'audio/x-mpegurl');
                                        }}
                                        className="p-2.5 bg-slate-800 hover:bg-purple-500 hover:text-white text-slate-400 rounded-lg transition-colors flex-shrink-0"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <div className="text-slate-500 flex-shrink-0">
                                        {expandedOutputIndex === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </div>
                            </div>
                            
                            {expandedOutputIndex === idx && res.entries && (
                                <div className="bg-slate-950/50 p-2 max-h-48 overflow-y-auto custom-scrollbar border-t border-slate-800 shadow-inner">
                                    {res.entries.map((track, tIdx) => (
                                        <div key={tIdx} className="flex items-center space-x-3 py-1.5 border-b border-slate-800/50 last:border-0 relative group">
                                            <div className="bg-slate-800/50 text-slate-500 rounded p-1.5 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                <Music size={12} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-medium text-slate-300 truncate">{track.title || 'Unknown Title'}</div>
                                                <div className="text-[10px] text-slate-500 truncate">{track.artist || 'Unknown Artist'}</div>
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
