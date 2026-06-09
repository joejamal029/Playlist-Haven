import React, { useState, useMemo, useRef } from 'react';
import { ArrowLeft, SlidersHorizontal, Download, Trash2, CheckSquare, Square, RefreshCcw, Search, Music, HelpCircle, AlertCircle, FileText, Check, X, Sparkles, Sliders } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { downloadPlaylistFile } from '../services/downloadHelper';
import { getAIConfig } from '../services/visionEngine';
import { GoogleGenAI } from '@google/genai';

interface LibraryTrack {
  title: string;
  artist: string;
  album: string;
  path: string;
  duration?: string;
  cleanTitle: string;
  cleanArtist: string;
}

interface MatchResult {
  friendTrack: {
    title: string;
    artist: string;
    rawMeta?: string;
    rawPath?: string;
    duration?: string;
  };
  matchedTrack: LibraryTrack | null;
  score: number; // 0 to 1
  status: 'exact' | 'fuzzy' | 'ai' | 'manual' | 'conflict' | 'not_found';
  candidates: LibraryTrack[]; // Top 5 candidates from library
}

function getBigrams(str: string) {
  const bigrams = [];
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.push(str.substring(i, i + 2));
  }
  return bigrams;
}

function stringSimilarity(str1: string, str2: string) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  if (str1.length < 2 || str2.length < 2) return 0;
  const bg1 = getBigrams(str1);
  const bg2 = getBigrams(str2);
  let intersection = 0;
  const bg2Copy = [...bg2];
  for (const bg of bg1) {
    const idx = bg2Copy.indexOf(bg);
    if (idx !== -1) {
      intersection++;
      bg2Copy.splice(idx, 1);
    }
  }
  return (2.0 * intersection) / (bg1.length + bg2.length);
}

function normalizeForMatch(str: string) {
  if (!str) return '';
  return String(str).toLowerCase()
    .replace(/\([^)]*\)/g, '') // Remove anything in parentheses
    .replace(/\[[^\]]*\]/g, '') // Remove anything in brackets
    .replace(/feat\.?|ft\.?/g, '') // Remove feat/ft
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .trim();
}

function parseCSV(text: string, delimiter: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (char === '\r' && !inQuotes) {
      if (nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  
  return rows;
}

interface PlaylistMatcherViewProps {
  onBack: () => void;
}

export default function PlaylistMatcherView({ onBack }: PlaylistMatcherViewProps) {
  const [friendFile, setFriendFile] = useState<File | null>(null);
  const [libraryFile, setLibraryFile] = useState<File | null>(null);
  
  const [friendTracks, setFriendTracks] = useState<MatchResult['friendTrack'][]>([]);
  const [libraryTracks, setLibraryTracks] = useState<LibraryTrack[]>([]);
  
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [matchingProgress, setMatchingProgress] = useState(0);
  
  // Settings
  const [fuzzyThreshold, setFuzzyThreshold] = useState(70);
  const [aiTriggerThreshold, setAiTriggerThreshold] = useState(50);
  const [useAIAssist, setUseAIAssist] = useState(false);
  const [isAIRunning, setIsAIRunning] = useState(false);
  
  // Search / Filter results
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Inline Search overlays
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState('');

  const parsePlaylistFile = async (file: File): Promise<any[]> => {
    const text = await file.text();
    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith('.csv') || file.type.includes('csv');
    const tracks: any[] = [];

    if (isCsv) {
      const firstLine = text.split(/\r?\n/)[0] || '';
      let delimiter = ',';
      if (firstLine.includes('\t')) delimiter = '\t';
      else if (firstLine.includes(';')) delimiter = ';';

      const rows = parseCSV(text, delimiter).filter(row => row.length > 0 && row.some(c => c.trim() !== ''));
      if (rows.length > 0) {
        const headers = rows[0];
        const titleIdx = headers.findIndex(h => /title|track|name/i.test(h));
        const artistIdx = headers.findIndex(h => /artist/i.test(h));
        const pathIdx = headers.findIndex(h => /path|file_path|url|location/i.test(h));
        const durationIdx = headers.findIndex(h => /duration|time|length/i.test(h));

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          tracks.push({
            title: titleIdx !== -1 && row[titleIdx] ? row[titleIdx] : `Track ${i}`,
            artist: artistIdx !== -1 && row[artistIdx] ? row[artistIdx] : 'Unknown',
            rawPath: pathIdx !== -1 && row[pathIdx] ? row[pathIdx] : '',
            duration: durationIdx !== -1 && row[durationIdx] ? row[durationIdx] : ''
          });
        }
      }
    } else {
      // M3U parsing
      const lines = text.split(/\r?\n/);
      let currentMeta = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#EXTM3U')) continue;

        if (trimmed.startsWith('#EXTINF')) {
          currentMeta = trimmed;
        } else if (!trimmed.startsWith('#')) {
          let title = 'Unknown';
          let artist = 'Unknown';
          let duration = '';

          let filename = trimmed.split(/[\/\\]/).pop() || trimmed;
          filename = filename.replace(/\.[a-zA-Z0-9]+$/, ''); // remove extension
          filename = filename.replace(/^\d+[\s.-]+/, ''); // remove leading track numbers

          const commaIdx = currentMeta.indexOf(',');
          if (commaIdx !== -1) {
            const info = currentMeta.substring(commaIdx + 1).trim();
            const dashIdx = info.indexOf(' - ');
            if (dashIdx !== -1) {
              artist = info.substring(0, dashIdx).trim();
              title = info.substring(dashIdx + 3).trim();
            } else {
              title = info || filename;
            }
            const durMatch = currentMeta.match(/#EXTINF:(-?\d+)/);
            if (durMatch) duration = durMatch[1];
          } else {
            if (filename.includes(' - ')) {
              const fDash = filename.indexOf(' - ');
              artist = filename.substring(0, fDash).trim();
              title = filename.substring(fDash + 3).trim();
            } else {
              title = filename;
            }
          }

          tracks.push({
            title,
            artist,
            rawMeta: currentMeta,
            rawPath: trimmed,
            duration
          });
          currentMeta = '';
        }
      }
    }
    return tracks;
  };

  const handleFriendFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    setFriendFile(file);
    try {
      const parsed = await parsePlaylistFile(file);
      setFriendTracks(parsed);
    } catch (e) {
      alert("Failed to parse friend's playlist file.");
    }
  };

  const handleLibraryFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    setLibraryFile(file);
    try {
      const parsed = await parsePlaylistFile(file);
      const mapped = parsed.map(t => ({
        title: t.title,
        artist: t.artist,
        album: t.album || '',
        path: t.rawPath || '',
        duration: t.duration,
        cleanTitle: normalizeForMatch(t.title),
        cleanArtist: normalizeForMatch(t.artist)
      }));
      setLibraryTracks(mapped);
    } catch (e) {
      alert("Failed to parse library file.");
    }
  };

  const runMatchingEngine = () => {
    if (friendTracks.length === 0 || libraryTracks.length === 0) return;
    setIsMatching(true);
    setMatchingProgress(0);

    const threshold = fuzzyThreshold / 100;
    const resolvedMatches: MatchResult[] = [];

    // Run in chunks or set a short timeout to prevent UI freeze
    setTimeout(() => {
      friendTracks.forEach((friend, idx) => {
        const cleanFriendTitle = normalizeForMatch(friend.title);
        const cleanFriendArtist = normalizeForMatch(friend.artist);
        
        let bestMatch: LibraryTrack | null = null;
        let bestScore = 0;
        const libraryCandidates: { track: LibraryTrack; score: number }[] = [];

        for (const lib of libraryTracks) {
          // 1. Direct path / filename match
          const friendFilename = (friend.rawPath || '').split(/[\/\\]/).pop() || '';
          const libFilename = lib.path.split(/[\/\\]/).pop() || '';
          
          let score = 0;
          if (libFilename.toLowerCase() === friendFilename.toLowerCase() && friendFilename !== '') {
            score = 1.0;
          } else {
            // 2. Title & Artist String Similarity
            const titleSim = stringSimilarity(cleanFriendTitle, lib.cleanTitle);
            const artistSim = stringSimilarity(cleanFriendArtist, lib.cleanArtist);
            
            if (!cleanFriendArtist || !lib.cleanArtist || cleanFriendArtist === 'unknown' || lib.cleanArtist === 'unknown') {
              score = titleSim;
            } else {
              score = (titleSim * 0.7) + (artistSim * 0.3);
            }
          }

          if (score > 0.4) {
            libraryCandidates.push({ track: lib, score });
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = lib;
          }
        }

        // Sort candidates by score descending and take top 5
        libraryCandidates.sort((a, b) => b.score - a.score);
        const topCandidates = libraryCandidates.slice(0, 5).map(c => c.track);

        let status: MatchResult['status'] = 'not_found';
        if (bestScore === 1.0) {
          status = 'exact';
        } else if (bestScore >= threshold) {
          status = 'fuzzy';
        } else if (topCandidates.length > 0) {
          status = 'conflict';
        }

        resolvedMatches.push({
          friendTrack: friend,
          matchedTrack: bestScore >= threshold ? bestMatch : null,
          score: bestScore,
          status,
          candidates: topCandidates
        });
      });

      setMatches(resolvedMatches);
      setIsMatching(false);
      setMatchingProgress(100);
    }, 100);
  };

  const handleTriggerAIResolution = async () => {
    const aiQueuedItems = matches.filter(m => m.status === 'conflict' || (m.status === 'fuzzy' && m.score * 100 < aiTriggerThreshold));
    if (aiQueuedItems.length === 0) {
      alert("No tracks qualify for AI matching under your configured threshold.");
      return;
    }

    setIsAIRunning(true);
    const config = getAIConfig();
    const apiKey = config.apiKey || (import.meta.env?.VITE_GEMINI_API_KEY || import.meta.env?.VITE_API_KEY) || "";

    if (!apiKey) {
      alert("Gemini API key is missing. Please configure it in Settings or Vision-to-Playlist.");
      setIsAIRunning(false);
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = config.modelName || 'gemini-3-flash-preview';
    const CHUNK_SIZE = 5;
    let updatedMatches = [...matches];

    try {
      for (let i = 0; i < aiQueuedItems.length; i += CHUNK_SIZE) {
        const chunk = aiQueuedItems.slice(i, i + CHUNK_SIZE);
        
        const prompt = `You are a music playlist matching expert. I am matching a friend's playlist against my own local library. Some songs have slightly different spellings, extra tags, or layout variations.
For each "Target" song, analyze the list of "Candidates" (from my library) and select the single best matching candidate. If none of the candidates match, return null.

Return your response strictly as a JSON array of objects, where each object corresponds to a target and has these fields:
- target_index: the index of the target song (0 to ${chunk.length - 1})
- match_index: the index of the best candidate, or null if no candidate is a match

JSON schema to return:
[
  { "target_index": number, "match_index": number | null }
]

Here is the data:
${chunk.map((item, idx) => {
  const targetStr = `Target #${idx}: "${item.friendTrack.title}" by "${item.friendTrack.artist}"`;
  const candidatesStr = item.candidates.map((c, cIdx) => `  Candidate #${cIdx}: "${c.title}" by "${c.artist}" (Path: ${c.path})`).join('\n');
  return `${targetStr}\nCandidates:\n${candidatesStr}\n`;
}).join('\n')}

Return ONLY the raw JSON array. No explanations, no markdown formatting blocks, no triple backticks.`;

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const text = response.text || '';
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const results = JSON.parse(cleanJson);

        for (const res of results) {
          const targetIdx = res.target_index;
          const matchIdx = res.match_index;

          if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < chunk.length) {
            const originalItem = chunk[targetIdx];
            const matchIndexInState = updatedMatches.findIndex(m => m.friendTrack.title === originalItem.friendTrack.title && m.friendTrack.artist === originalItem.friendTrack.artist);

            if (matchIndexInState !== -1) {
              if (matchIdx !== null && matchIdx !== undefined && matchIdx >= 0 && matchIdx < originalItem.candidates.length) {
                const matchedTrack = originalItem.candidates[matchIdx];
                updatedMatches[matchIndexInState] = {
                  ...originalItem,
                  matchedTrack,
                  status: 'ai',
                  score: 1.0
                };
              } else {
                updatedMatches[matchIndexInState] = {
                  ...originalItem,
                  status: 'not_found'
                };
              }
            }
          }
        }
        setMatches([...updatedMatches]);
      }
    } catch (e) {
      console.error("AI matching failed", e);
      alert("Failed to complete AI matching. Some chunks might have failed.");
    } finally {
      setIsAIRunning(false);
    }
  };

  // Real-time conflict library search logic
  const handleSelectManualMatch = (index: number, track: LibraryTrack) => {
    setMatches(prev => prev.map((m, idx) => {
      if (idx === index) {
        return {
          ...m,
          matchedTrack: track,
          status: 'manual',
          score: 1.0
        };
      }
      return m;
    }));
    setActiveSearchIndex(null);
    setManualSearchQuery('');
  };

  const filteredLibrarySearchResults = useMemo(() => {
    if (!manualSearchQuery.trim()) return [];
    const q = manualSearchQuery.toLowerCase();
    return libraryTracks.filter(t => 
      t.title.toLowerCase().includes(q) || 
      t.artist.toLowerCase().includes(q) || 
      t.path.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [manualSearchQuery, libraryTracks]);

  // Filter reconciliation results
  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        m.friendTrack.title.toLowerCase().includes(q) || 
        m.friendTrack.artist.toLowerCase().includes(q) ||
        (m.matchedTrack && m.matchedTrack.path.toLowerCase().includes(q));

      let matchesStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'matched') {
          matchesStatus = m.status === 'exact' || m.status === 'fuzzy' || m.status === 'ai' || m.status === 'manual';
        } else if (statusFilter === 'unresolved') {
          matchesStatus = m.status === 'conflict' || m.status === 'not_found';
        } else {
          matchesStatus = m.status === statusFilter;
        }
      }
      return matchesSearch && matchesStatus;
    });
  }, [matches, searchQuery, statusFilter]);

  const matchStats = useMemo(() => {
    const total = matches.length;
    if (total === 0) return { total: 0, matched: 0, percentage: 0 };
    const matchedCount = matches.filter(m => m.status === 'exact' || m.status === 'fuzzy' || m.status === 'ai' || m.status === 'manual').length;
    return {
      total,
      matched: matchedCount,
      percentage: Math.round((matchedCount / total) * 100)
    };
  }, [matches]);

  const handleExportPlaylist = async () => {
    const validMatches = matches.filter(m => m.matchedTrack !== null);
    if (validMatches.length === 0) {
      alert("No matched tracks available to export.");
      return;
    }

    let m3uContent = '#EXTM3U\n';
    for (const m of validMatches) {
      const t = m.matchedTrack!;
      let durationSeconds = -1;
      if (t.duration) {
        const val = parseInt(t.duration, 10);
        if (!isNaN(val)) {
          durationSeconds = val > 5000 ? Math.round(val / 1000) : val;
        }
      }
      m3uContent += `#EXTINF:${durationSeconds},${t.artist} - ${t.title}\n`;
      m3uContent += t.path.replace(/\\/g, '/') + '\n';
    }

    const exportFilename = friendFile ? `reconciled_${friendFile.name.replace(/\.[a-zA-Z0-9]+$/, '')}.m3u` : 'reconciled_playlist.m3u';
    await downloadPlaylistFile(m3uContent, exportFilename, 'audio/x-mpegurl');
  };

  const handleExportMissing = async () => {
    const missing = matches.filter(m => m.matchedTrack === null);
    if (missing.length === 0) {
      alert("No missing tracks to export!");
      return;
    }

    let csvContent = 'TITLE,ARTIST,ORIGINAL_PATH\n';
    const escapeCSV = (str: string) => {
      if (/[,"\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    for (const m of missing) {
      csvContent += `${escapeCSV(m.friendTrack.title)},${escapeCSV(m.friendTrack.artist)},${escapeCSV(m.friendTrack.rawPath || '')}\n`;
    }

    const exportFilename = friendFile ? `missing_tracks_${friendFile.name.replace(/\.[a-zA-Z0-9]+$/, '')}.csv` : 'missing_tracks.csv';
    await downloadPlaylistFile(csvContent, exportFilename, 'text/csv;charset=utf-8;');
  };

  const handleClear = () => {
    setFriendFile(null);
    setLibraryFile(null);
    setFriendTracks([]);
    setLibraryTracks([]);
    setMatches([]);
    setSearchQuery('');
    setStatusFilter('all');
    setActiveSearchIndex(null);
    setManualSearchQuery('');
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                Offline Playlist Matcher
              </h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Reconciliation Workbench</p>
            </div>
          </div>
          
          {matches.length > 0 && (
            <div className="flex items-center space-x-2">
              <button 
                onClick={handleExportPlaylist}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                title="Export matched songs as M3U using your local paths"
              >
                <Download size={14} />
                <span>Export Matched M3U</span>
              </button>
              <button 
                onClick={handleExportMissing}
                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-xs font-bold transition-colors border border-slate-700"
                title="Export missing songs as CSV"
              >
                <FileText size={14} />
                <span>Export Missing CSV</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20">
        
        {/* Step 1: Upload Files */}
        {matches.length === 0 ? (
          <div className="space-y-6">
            <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-4 flex items-start space-x-3">
              <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400 shrink-0">
                <SlidersHorizontal size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-violet-300 uppercase">Offline Sharing Reconciliation</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                  Upload a playlist file shared by your friend and your own music library M3U/CSV database. Playlist Haven will resolve title/artist differences dynamically, allowing you to stream shared playlists natively on your device.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">1. Friend's Playlist File</h3>
                <FileUploader
                  label="Friend's Playlist"
                  subLabel="Upload .m3u, .m3u8, or .csv"
                  files={friendFile ? [friendFile] : []}
                  onFilesSelected={handleFriendFileSelected}
                  onClear={() => { setFriendFile(null); setFriendTracks([]); }}
                  multiple={false}
                  accept=".m3u,.m3u8,.csv,text/csv,application/csv"
                  colorClass="violet"
                />
                {friendTracks.length > 0 && (
                  <p className="text-xs text-emerald-400 font-bold mt-2 flex items-center">
                    <Check size={14} className="mr-1" /> Loaded {friendTracks.length} tracks.
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">2. Your Music Library File</h3>
                <FileUploader
                  label="My Local Library Database"
                  subLabel="Upload library .m3u, .m3u8, or .csv"
                  files={libraryFile ? [libraryFile] : []}
                  onFilesSelected={handleLibraryFileSelected}
                  onClear={() => { setLibraryFile(null); setLibraryTracks([]); }}
                  multiple={false}
                  accept=".m3u,.m3u8,.csv,text/csv,application/csv"
                  colorClass="indigo"
                />
                {libraryTracks.length > 0 && (
                  <p className="text-xs text-emerald-400 font-bold mt-2 flex items-center">
                    <Check size={14} className="mr-1" /> Loaded {libraryTracks.length} library tracks.
                  </p>
                )}
              </div>
            </div>

            {friendTracks.length > 0 && libraryTracks.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Matching Settings</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Slider: Fuzzy Strictness */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 flex justify-between mb-1.5">
                      <span>Fuzzy Strictness Threshold</span>
                      <span className="text-violet-400">{fuzzyThreshold}% Match</span>
                    </label>
                    <input 
                      type="range"
                      min="50"
                      max="100"
                      value={fuzzyThreshold}
                      onChange={(e) => setFuzzyThreshold(parseInt(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <span className="text-[10px] text-slate-500">Lower strictness allows looser matches (ignores minor spelling differences).</span>
                  </div>

                  {/* Slider: AI Trigger Limit */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 flex justify-between mb-1.5">
                      <span>AI Trigger Threshold</span>
                      <span className="text-indigo-400">Under {aiTriggerThreshold}%</span>
                    </label>
                    <input 
                      type="range"
                      min="10"
                      max="90"
                      value={aiTriggerThreshold}
                      onChange={(e) => setAiTriggerThreshold(parseInt(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500">Local matches scoring below this trigger the Gemini AI reconciliation layer.</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <input 
                    type="checkbox"
                    id="ai-toggle"
                    checked={useAIAssist}
                    onChange={(e) => setUseAIAssist(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 accent-indigo-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <label htmlFor="ai-toggle" className="text-xs font-bold text-slate-300 cursor-pointer flex items-center">
                    <Sparkles size={14} className="mr-1 text-indigo-400" /> Enable Gemini AI Assist for unresolved matches
                  </label>
                </div>

                <button 
                  onClick={runMatchingEngine}
                  disabled={isMatching}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl transition-all active:scale-[0.98] shadow shadow-indigo-900/40 flex items-center justify-center space-x-2"
                >
                  {isMatching ? (
                    <>
                      <RefreshCcw size={16} className="animate-spin" />
                      <span>Computing Matches ({matchingProgress}%) ...</span>
                    </>
                  ) : (
                    <>
                      <Music size={16} />
                      <span>Run Matcher Engine</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Step 2: Reconciliation Interface */
          <div className="space-y-4">
            
            {/* Reconciliation Dashboard Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Matching Success Rate</span>
                <div className="flex items-baseline space-x-2 mt-2">
                  <span className="text-2xl font-extrabold text-indigo-400">{matchStats.percentage}%</span>
                  <span className="text-xs text-slate-500">({matchStats.matched} of {matchStats.total} tracks mapped)</span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-3 border border-slate-800">
                  <div 
                    className="bg-gradient-to-r from-violet-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${matchStats.percentage}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Pending Queue</span>
                <div className="flex items-baseline space-x-2 mt-2">
                  <span className="text-2xl font-extrabold text-purple-400">
                    {matches.filter(m => m.status === 'conflict' || (m.status === 'fuzzy' && m.score * 100 < aiTriggerThreshold)).length}
                  </span>
                  <span className="text-xs text-slate-500">tracks trigger AI assist</span>
                </div>
                <div className="flex items-center space-x-2 mt-3">
                  <button 
                    onClick={handleTriggerAIResolution}
                    disabled={isAIRunning || matches.filter(m => m.status === 'conflict' || (m.status === 'fuzzy' && m.score * 100 < aiTriggerThreshold)).length === 0}
                    className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 shadow"
                  >
                    {isAIRunning ? (
                      <>
                        <RefreshCcw size={12} className="animate-spin" />
                        <span>AI Running...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        <span>Reconcile with AI</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action Panel</span>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button 
                    onClick={handleClear}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-300 rounded-lg text-xs font-bold transition-colors border border-slate-700 flex items-center justify-center space-x-1.5"
                  >
                    <RefreshCcw size={12} />
                    <span>Reset Matcher</span>
                  </button>
                  <button 
                    onClick={handleExportPlaylist}
                    className="py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <Download size={12} />
                    <span>Download M3U</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Filters / Search */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 flex-1 w-full">
                <Search size={14} className="text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Filter by song name, artist, or local path..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs text-slate-200 w-full placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto">
                <Sliders size={14} className="text-slate-500" />
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 w-full"
                >
                  <option value="all">All Tracks</option>
                  <option value="matched">Matched (Exact, Fuzzy, AI, Manual)</option>
                  <option value="unresolved">Unresolved (Conflict, Not Found)</option>
                  <option value="exact">Exact Matches</option>
                  <option value="fuzzy">Fuzzy Matches</option>
                  <option value="ai">AI Resolved</option>
                  <option value="manual">Manually Matched</option>
                  <option value="conflict">Conflicts</option>
                  <option value="not_found">Not Found</option>
                </select>
              </div>
            </div>

            {/* Reconciliation List */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                
                {filteredMatches.map((item, index) => {
                  const hasMatch = item.matchedTrack !== null;
                  const originalIndex = matches.findIndex(m => m.friendTrack.title === item.friendTrack.title && m.friendTrack.artist === item.friendTrack.artist);
                  const isSearching = activeSearchIndex === originalIndex;

                  // Render status badges
                  let badgeClass = '';
                  let badgeText = '';

                  switch (item.status) {
                    case 'exact':
                      badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                      badgeText = 'Exact Match';
                      break;
                    case 'fuzzy':
                      badgeClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                      badgeText = `Fuzzy Match (${Math.round(item.score * 100)}%)`;
                      break;
                    case 'ai':
                      badgeClass = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
                      badgeText = 'AI Resolved';
                      break;
                    case 'manual':
                      badgeClass = 'bg-teal-500/10 text-teal-400 border border-teal-500/20';
                      badgeText = 'Manually Matched';
                      break;
                    case 'conflict':
                      badgeClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                      badgeText = 'Conflict';
                      break;
                    case 'not_found':
                      badgeClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                      badgeText = 'Not Found';
                      break;
                  }

                  return (
                    <div key={index} className="flex flex-col p-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        
                        {/* Left Column: Friend's original track */}
                        <div className="flex-1 min-w-0 flex items-start space-x-3">
                          <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center flex-shrink-0 text-slate-500 mt-0.5">
                            <Music size={14} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Friend's Track</div>
                            <div className="text-sm font-bold text-slate-200 truncate">{item.friendTrack.title}</div>
                            <div className="text-xs text-slate-400 truncate">{item.friendTrack.artist}</div>
                          </div>
                        </div>

                        {/* Middle Column: Status Badge */}
                        <div className="flex sm:justify-center items-center shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </div>

                        {/* Right Column: Matched Library Track */}
                        <div className="flex-1 min-w-0 flex items-start justify-between bg-slate-950/40 border border-slate-800/80 rounded-xl p-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">My Library Match</div>
                            {hasMatch ? (
                              <>
                                <div className="text-xs font-bold text-slate-300 truncate">{item.matchedTrack!.title}</div>
                                <div className="text-[11px] text-slate-400 truncate">{item.matchedTrack!.artist}</div>
                                <div className="text-[9px] text-slate-500 font-mono truncate mt-0.5">{item.matchedTrack!.path}</div>
                              </>
                            ) : (
                              <div className="text-xs text-slate-500 italic py-1">No matching file found.</div>
                            )}
                          </div>

                          <div className="ml-3 shrink-0 flex items-center space-x-1">
                            <button
                              onClick={() => {
                                if (isSearching) {
                                  setActiveSearchIndex(null);
                                  setManualSearchQuery('');
                                } else {
                                  setActiveSearchIndex(originalIndex);
                                  setManualSearchQuery('');
                                }
                              }}
                              className={`p-1.5 rounded-lg border transition-all ${isSearching ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400 hover:text-slate-300'}`}
                              title="Search library manually to map this track"
                            >
                              <Search size={14} />
                            </button>
                            {hasMatch && (
                              <button 
                                onClick={() => {
                                  setMatches(prev => prev.map((m, idx) => {
                                    if (idx === originalIndex) {
                                      return { ...m, matchedTrack: null, status: 'not_found', score: 0 };
                                    }
                                    return m;
                                  }));
                                }}
                                className="p-1.5 bg-slate-850 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-900/40 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                                title="Remove match"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* Real-time Searchable Resolution Layer (Expanded search input and results) */}
                      {isSearching && (
                        <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5">
                            <Search size={12} className="text-slate-500" />
                            <input 
                              type="text" 
                              placeholder="Type to search your library by title, artist, or path..." 
                              value={manualSearchQuery}
                              onChange={(e) => setManualSearchQuery(e.target.value)}
                              className="bg-transparent border-none outline-none text-xs text-slate-200 w-full placeholder:text-slate-600 font-medium"
                              autoFocus
                            />
                            {manualSearchQuery && (
                              <button onClick={() => setManualSearchQuery('')} className="p-0.5 hover:bg-slate-800 rounded text-slate-500">
                                <X size={12} />
                              </button>
                            )}
                          </div>

                          {/* Quick Candidates (If search is empty, show local fuzzy candidates) */}
                          <div className="space-y-1.5">
                            <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                              {manualSearchQuery ? 'Search Results' : 'Fuzzy Candidates in Library'}
                            </h4>
                            
                            {manualSearchQuery ? (
                              filteredLibrarySearchResults.length > 0 ? (
                                filteredLibrarySearchResults.map((libTrack, cIdx) => (
                                  <button
                                    key={cIdx}
                                    onClick={() => handleSelectManualMatch(originalIndex, libTrack)}
                                    className="w-full text-left p-2 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/30 rounded-lg transition-colors flex items-center justify-between text-xs"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="font-bold text-slate-300 truncate">{libTrack.title}</div>
                                      <div className="text-[10px] text-slate-400 truncate">{libTrack.artist}</div>
                                      <div className="text-[9px] text-slate-500 font-mono truncate">{libTrack.path}</div>
                                    </div>
                                    <Check size={14} className="text-emerald-400 shrink-0 ml-3 opacity-0 hover:opacity-100 transition-opacity" />
                                  </button>
                                ))
                              ) : (
                                <div className="text-xs text-slate-600 italic p-1.5">No library songs match your query.</div>
                              )
                            ) : (
                              item.candidates.length > 0 ? (
                                item.candidates.map((libTrack, cIdx) => (
                                  <button
                                    key={cIdx}
                                    onClick={() => handleSelectManualMatch(originalIndex, libTrack)}
                                    className="w-full text-left p-2 hover:bg-violet-500/10 border border-transparent hover:border-violet-500/30 rounded-lg transition-colors flex items-center justify-between text-xs"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="font-bold text-slate-300 truncate">{libTrack.title}</div>
                                      <div className="text-[10px] text-slate-400 truncate">{libTrack.artist}</div>
                                      <div className="text-[9px] text-slate-500 font-mono truncate">{libTrack.path}</div>
                                    </div>
                                    <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20 shrink-0 ml-3">Select</span>
                                  </button>
                                ))
                              ) : (
                                <div className="text-xs text-slate-650 italic p-1.5">No fuzzy candidates found. Type in the search box to find a song.</div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredMatches.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    No reconciliation items found.
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
