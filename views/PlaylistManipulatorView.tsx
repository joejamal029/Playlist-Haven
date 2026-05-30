import React, { useState, useMemo, useRef } from 'react';
import { ArrowLeft, SlidersHorizontal, Download, Trash2, GripVertical, CheckSquare, Square, SortAsc, Filter, Music, RefreshCcw, Search, ArrowUpToLine, ArrowDownToLine, CopyMinus, ArrowUpDown, Dices, Plus, X, Layers, Sparkles, BarChart3 } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { saveAs } from 'file-saver';

interface PlaylistManipulatorViewProps {
  onBack: () => void;
}

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  playCount?: number;
  m3uMeta?: string;
  m3uPath?: string;
  csvRow?: string[];
}

interface PlaylistData {
  id: string;
  originalFilename: string;
  fileType: 'm3u' | 'csv' | null;
  csvHeaders: string[];
  csvDelimiter: string;
  tracks: Track[];
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  artistFilter: string;
  searchQuery: string;
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

function escapeCSV(str: string) {
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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

const generateId = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Date.now().toString(36) + Math.random().toString(36).substring(2);
};

interface CrossPruneMatch {
  targetTrack: Track;
  sourceTrack: Track;
  sourcePlaylistName: string;
  score: number;
  selected: boolean;
}

export default function PlaylistManipulatorView({ onBack }: PlaylistManipulatorViewProps) {
  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  
  const [isCrossPruneOpen, setIsCrossPruneOpen] = useState(false);
  const [isCalculatingMatches, setIsCalculatingMatches] = useState(false);
  const [crossPruneStrictness, setCrossPruneStrictness] = useState(80);
  const [crossPruneMatches, setCrossPruneMatches] = useState<CrossPruneMatch[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Precise Range Selector State
  const [isRangeSelectorOpen, setIsRangeSelectorOpen] = useState(false);
  const [rangeStartId, setRangeStartId] = useState<string>('');
  const [rangeEndId, setRangeEndId] = useState<string>('');

  // Advanced Range Selector State
  const [isAdvancedRangeOpen, setIsAdvancedRangeOpen] = useState(false);
  const [advRangeStartId, setAdvRangeStartId] = useState<string>('');
  const [advRangeEndId, setAdvRangeEndId] = useState<string>('');

  // Play Count Filter State
  const [isPlayCountFilterOpen, setIsPlayCountFilterOpen] = useState(false);
  const [playCountMin, setPlayCountMin] = useState<string>('2');
  const [playCountMax, setPlayCountMax] = useState<string>('');

  const activePlaylist = playlists.find(p => p.id === activePlaylistId) || null;

  const hasPlayCount = useMemo(() => {
    return activePlaylist ? activePlaylist.tracks.some(t => t.playCount !== undefined) : false;
  }, [activePlaylist]);

  const updateActivePlaylist = (updater: (prev: PlaylistData) => PlaylistData) => {
    if (!activePlaylistId) return;
    setPlaylists(prev => prev.map(p => p.id === activePlaylistId ? updater(p) : p));
  };


  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    
    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      let isCsv = lowerName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/csv' || file.type === 'application/vnd.ms-excel';
      let isM3u = lowerName.endsWith('.m3u') || lowerName.endsWith('.m3u8') || file.type === 'audio/x-mpegurl' || file.type === 'application/vnd.apple.mpegurl';
      
      const text = await file.text();
      const firstLine = text.split(/\r?\n/)[0] || '';

      if (!isCsv && !isM3u) {
        // Fallback: guess by content if extension/mime type is missing or unknown
        if (firstLine.startsWith('#EXTM3U') || firstLine.startsWith('#EXTINF')) {
          isM3u = true;
        } else if (firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t')) {
          isCsv = true;
        } else {
          alert(`Unsupported file type: ${file.name}. Please upload .csv or .m3u files.`);
          continue;
        }
      }

      const newTracks: Track[] = [];
      let fileType: 'm3u' | 'csv' | null = null;
      let csvHeaders: string[] = [];
      let csvDelimiter = ',';
      
      if (isCsv) {
        fileType = 'csv';
        
        // Better delimiter detection: check which one appears most in the first line
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semiCount = (firstLine.match(/;/g) || []).length;
        const tabCount = (firstLine.match(/\t/g) || []).length;
        
        if (tabCount > commaCount && tabCount > semiCount) {
          csvDelimiter = '\t';
        } else if (semiCount > commaCount && semiCount > tabCount) {
          csvDelimiter = ';';
        } else {
          csvDelimiter = ',';
        }
        
        const rows = parseCSV(text, csvDelimiter).filter(row => row.length > 0 && row.some(cell => cell.trim() !== ''));
        
        if (rows.length > 0) {
          csvHeaders = rows[0];
          
          const titleIdx = csvHeaders.findIndex(h => /title|track|name/i.test(h));
          const artistIdx = csvHeaders.findIndex(h => /artist/i.test(h));
          const albumIdx = csvHeaders.findIndex(h => /album/i.test(h));
          const durationIdx = csvHeaders.findIndex(h => /duration|time|length/i.test(h));
          const playCountIdx = csvHeaders.findIndex(h => /play_count|plays?/i.test(h));
          
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            const parsedPlays = playCountIdx !== -1 && row[playCountIdx] ? parseInt(row[playCountIdx], 10) : undefined;
            newTracks.push({
              id: generateId(),
              title: titleIdx !== -1 && row[titleIdx] ? row[titleIdx] : `Track ${i}`,
              artist: artistIdx !== -1 && row[artistIdx] ? row[artistIdx] : 'Unknown',
              album: albumIdx !== -1 && row[albumIdx] ? row[albumIdx] : '',
              duration: durationIdx !== -1 && row[durationIdx] ? row[durationIdx] : '',
              playCount: isNaN(parsedPlays as number) ? undefined : parsedPlays,
              csvRow: row
            });
          }
        }
      } else {
        fileType = 'm3u';
        const lines = text.split(/\r?\n/);
        let currentMeta = '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#EXTM3U')) continue;
          
          if (trimmed.startsWith('#EXTINF')) {
            currentMeta = trimmed;
          } else if (trimmed.startsWith('#')) {
            // Skip other comments
          } else {
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
              } else if (filename.includes(' - ')) {
                const fDash = filename.indexOf(' - ');
                artist = filename.substring(0, fDash).trim();
                title = filename.substring(fDash + 3).trim();
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
            
            newTracks.push({
              id: generateId(),
              title,
              artist,
              album: '',
              duration,
              m3uMeta: currentMeta,
              m3uPath: trimmed
            });
            currentMeta = '';
          }
        }
      }
      
      const newPlaylist: PlaylistData = {
        id: generateId(),
        originalFilename: file.name,
        fileType,
        csvHeaders,
        csvDelimiter,
        tracks: newTracks,
        selectedIds: new Set(),
        lastSelectedId: null,
        artistFilter: '',
        searchQuery: ''
      };
      
      setPlaylists(prev => {
        const updated = [...prev, newPlaylist];
        setActivePlaylistId(newPlaylist.id);
        return updated;
      });
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(Array.from(e.target.files));
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const closePlaylist = (id: string) => {
    setPlaylists(prev => {
      const filtered = prev.filter(p => p.id !== id);
      if (activePlaylistId === id) {
        setActivePlaylistId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
      }
      return filtered;
    });
  };

  const uniqueArtists = useMemo(() => {
    if (!activePlaylist) return [];
    const artists = new Set(activePlaylist.tracks.map(t => t.artist).filter(a => a && a !== 'Unknown'));
    return Array.from(artists).sort();
  }, [activePlaylist?.tracks]);

  const filteredTracks = useMemo(() => {
    if (!activePlaylist) return [];
    return activePlaylist.tracks.filter(t => {
      const matchesSearch = !activePlaylist.searchQuery || (() => {
        const q = activePlaylist.searchQuery.toLowerCase();
        return (
          (t.title && String(t.title).toLowerCase().includes(q)) ||
          (t.artist && String(t.artist).toLowerCase().includes(q)) ||
          (t.album && String(t.album).toLowerCase().includes(q))
        );
      })();
      const matchesArtist = !activePlaylist.artistFilter || t.artist === activePlaylist.artistFilter;
      return matchesSearch && matchesArtist;
    });
  }, [activePlaylist?.tracks, activePlaylist?.searchQuery, activePlaylist?.artistFilter]);

  const temporaryRangeIds = useMemo(() => {
    if (!rangeStartId || !rangeEndId || !activePlaylist) return new Set<string>();
    const startIdx = filteredTracks.findIndex(t => t.id === rangeStartId);
    const endIdx = filteredTracks.findIndex(t => t.id === rangeEndId);
    if (startIdx === -1 || endIdx === -1) return new Set<string>();
    
    const ids = new Set<string>();
    const start = Math.min(startIdx, endIdx);
    const end = Math.max(startIdx, endIdx);
    for (let i = start; i <= end; i++) {
      ids.add(filteredTracks[i].id);
    }
    return ids;
  }, [filteredTracks, rangeStartId, rangeEndId, activePlaylistId]);

  const applyRangeAction = (action: 'add' | 'subtract' | 'replace') => {
    if (temporaryRangeIds.size === 0) return;
    updateActivePlaylist(p => {
      let newSelection = new Set(p.selectedIds);
      if (action === 'replace') {
        newSelection = new Set(temporaryRangeIds);
      } else if (action === 'add') {
        temporaryRangeIds.forEach(id => newSelection.add(id));
      } else if (action === 'subtract') {
        temporaryRangeIds.forEach(id => newSelection.delete(id));
      }
      return { ...p, selectedIds: newSelection, lastSelectedId: rangeEndId || p.lastSelectedId };
    });
    setIsRangeSelectorOpen(false);
    setRangeStartId('');
    setRangeEndId('');
  };

  const advancedRangeIds = useMemo(() => {
    if (!advRangeStartId || !advRangeEndId || !activePlaylist) return new Set<string>();
    const startIdx = filteredTracks.findIndex(t => t.id === advRangeStartId);
    const endIdx = filteredTracks.findIndex(t => t.id === advRangeEndId);
    if (startIdx === -1 || endIdx === -1) return new Set<string>();
    
    const ids = new Set<string>();
    const start = Math.min(startIdx, endIdx);
    const end = Math.max(startIdx, endIdx);
    for (let i = start; i <= end; i++) {
      ids.add(filteredTracks[i].id);
    }
    return ids;
  }, [filteredTracks, advRangeStartId, advRangeEndId, activePlaylistId]);

  const applyAdvancedRangeAction = (action: 'add' | 'subtract' | 'replace' | 'intersect') => {
    if (advancedRangeIds.size === 0) return;
    updateActivePlaylist(p => {
      let newSelection = new Set(p.selectedIds);
      if (action === 'replace') {
        newSelection = new Set(advancedRangeIds);
      } else if (action === 'add') {
        advancedRangeIds.forEach(id => newSelection.add(id));
      } else if (action === 'subtract') {
        advancedRangeIds.forEach(id => newSelection.delete(id));
      } else if (action === 'intersect') {
        const intersected = new Set<string>();
        p.selectedIds.forEach(id => {
          if (advancedRangeIds.has(id)) {
            intersected.add(id);
          }
        });
        newSelection = intersected;
      }
      return { ...p, selectedIds: newSelection, lastSelectedId: advRangeEndId || p.lastSelectedId };
    });
    setIsAdvancedRangeOpen(false);
    setAdvRangeStartId('');
    setAdvRangeEndId('');
  };

  const applyPlayCountAction = (action: 'add' | 'subtract' | 'replace' | 'intersect') => {
    if (!activePlaylist) return;
    const min = playCountMin === '' ? 0 : parseInt(playCountMin, 10);
    const max = playCountMax === '' ? Infinity : parseInt(playCountMax, 10);

    const matchingIds = new Set<string>();
    filteredTracks.forEach(t => {
      if (t.playCount !== undefined && t.playCount >= min && t.playCount <= max) {
        matchingIds.add(t.id);
      }
    });

    updateActivePlaylist(p => {
      let newSelection = new Set(p.selectedIds);
      if (action === 'replace') {
        newSelection = new Set(matchingIds);
      } else if (action === 'add') {
        matchingIds.forEach(id => newSelection.add(id));
      } else if (action === 'subtract') {
        matchingIds.forEach(id => newSelection.delete(id));
      } else if (action === 'intersect') {
        const intersected = new Set<string>();
        p.selectedIds.forEach(id => {
          if (matchingIds.has(id)) {
            intersected.add(id);
          }
        });
        newSelection = intersected;
      }
      return { ...p, selectedIds: newSelection };
    });
    setIsPlayCountFilterOpen(false);
  };

  const handleBasicSelectRange = () => {
    if (!activePlaylist) return;
    
    // Find all currently selected track IDs that are visible (in filteredTracks)
    const selectedVisibleIndices = filteredTracks
      .map((t, idx) => ({ id: t.id, idx }))
      .filter(item => activePlaylist.selectedIds.has(item.id))
      .map(item => item.idx);

    if (selectedVisibleIndices.length > 0) {
      const minIdx = Math.min(...selectedVisibleIndices);
      const maxIdx = Math.max(...selectedVisibleIndices);
      
      updateActivePlaylist(p => {
        const newSelection = new Set(p.selectedIds);
        for (let i = minIdx; i <= maxIdx; i++) {
          newSelection.add(filteredTracks[i].id);
        }
        return { ...p, selectedIds: newSelection };
      });
    } else {
      // If no tracks are selected, open the basic range selector modal as a fallback!
      if (filteredTracks.length > 0) {
        setRangeStartId(filteredTracks[0].id);
        setRangeEndId(filteredTracks[filteredTracks.length - 1].id);
        setIsRangeSelectorOpen(true);
      } else {
        alert("No tracks visible to select a range.");
      }
    }
  };

  const toggleSelection = (id: string, shiftKey: boolean) => {
    updateActivePlaylist(p => {
      const newSelection = new Set(p.selectedIds);
      
      // Filter tracks using the exact same active logic (both Search and Artist)
      const visibleTracks = p.tracks.filter(t => {
        const matchesSearch = !p.searchQuery || (() => {
          const q = p.searchQuery.toLowerCase();
          return (
            (t.title && String(t.title).toLowerCase().includes(q)) ||
            (t.artist && String(t.artist).toLowerCase().includes(q)) ||
            (t.album && String(t.album).toLowerCase().includes(q))
          );
        })();
        const matchesArtist = !p.artistFilter || t.artist === p.artistFilter;
        return matchesSearch && matchesArtist;
      });
      
      if (shiftKey && p.lastSelectedId) {
        const currentIndex = visibleTracks.findIndex(t => t.id === id);
        const lastIndex = visibleTracks.findIndex(t => t.id === p.lastSelectedId);
        
        if (currentIndex !== -1 && lastIndex !== -1) {
          const start = Math.min(currentIndex, lastIndex);
          const end = Math.max(currentIndex, lastIndex);
          
          for (let i = start; i <= end; i++) {
            newSelection.add(visibleTracks[i].id);
          }
        }
      } else {
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
      }
      
      return { ...p, selectedIds: newSelection, lastSelectedId: id };
    });
  };

  const handleSelectAll = () => {
    updateActivePlaylist(p => {
      const newSelection = new Set(p.selectedIds);
      filteredTracks.forEach(t => newSelection.add(t.id));
      return { ...p, selectedIds: newSelection };
    });
  };

  const handleDeselectAll = () => {
    updateActivePlaylist(p => {
      const newSelection = new Set(p.selectedIds);
      filteredTracks.forEach(t => newSelection.delete(t.id));
      return { ...p, selectedIds: newSelection };
    });
  };

  const handleInvertSelection = () => {
    updateActivePlaylist(p => {
      const newSelection = new Set(p.selectedIds);
      filteredTracks.forEach(t => {
        if (newSelection.has(t.id)) {
          newSelection.delete(t.id);
        } else {
          newSelection.add(t.id);
        }
      });
      return { ...p, selectedIds: newSelection };
    });
  };

  const handleDeleteSelected = () => {
    updateActivePlaylist(p => ({
      ...p,
      tracks: p.tracks.filter(t => !p.selectedIds.has(t.id)),
      selectedIds: new Set(),
      lastSelectedId: null
    }));
  };

  const handleSort = (metric: keyof Track) => {
    updateActivePlaylist(p => {
      const sorted = [...p.tracks].sort((a, b) => {
        if (metric === 'playCount') {
          const valA = a.playCount ?? -1;
          const valB = b.playCount ?? -1;
          return valB - valA;
        }
        const valA = (a[metric] || '').toString().toLowerCase();
        const valB = (b[metric] || '').toString().toLowerCase();
        return valA.localeCompare(valB);
      });
      return { ...p, tracks: sorted };
    });
  };

  const handleSelectByArtist = (artist: string) => {
    updateActivePlaylist(p => {
      if (!artist) return { ...p, artistFilter: artist };
      
      const newSelection = new Set(p.selectedIds);
      p.tracks.forEach(t => {
        if (t.artist === artist) newSelection.add(t.id);
      });
      return { ...p, artistFilter: artist, selectedIds: newSelection };
    });
  };

  const handleMoveToTop = () => {
    updateActivePlaylist(p => {
      if (p.selectedIds.size === 0) return p;
      const selected = p.tracks.filter(t => p.selectedIds.has(t.id));
      const unselected = p.tracks.filter(t => !p.selectedIds.has(t.id));
      return { ...p, tracks: [...selected, ...unselected] };
    });
  };

  const handleMoveToBottom = () => {
    updateActivePlaylist(p => {
      if (p.selectedIds.size === 0) return p;
      const selected = p.tracks.filter(t => p.selectedIds.has(t.id));
      const unselected = p.tracks.filter(t => !p.selectedIds.has(t.id));
      return { ...p, tracks: [...unselected, ...selected] };
    });
  };

  const handleRemoveDuplicates = () => {
    updateActivePlaylist(p => {
      const seen = new Set();
      const unique = p.tracks.filter(t => {
        const title = t.title ? String(t.title).toLowerCase().trim() : '';
        const artist = t.artist ? String(t.artist).toLowerCase().trim() : '';
        const key = `${title}|${artist}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
      const newSelection = new Set(p.selectedIds);
      const uniqueIds = new Set(unique.map(t => t.id));
      for (const id of newSelection) {
        if (!uniqueIds.has(id)) newSelection.delete(id);
      }
      
      return { ...p, tracks: unique, selectedIds: newSelection };
    });
  };

  const computeCrossPruneMatches = (strictness: number) => {
    if (!activePlaylist) return;
    
    const threshold = strictness / 100;
    const matches: CrossPruneMatch[] = [];
    
    const otherTracks = playlists
      .filter(p => p.id !== activePlaylist.id)
      .flatMap(p => p.tracks.map(t => ({
        track: t,
        playlistName: p.originalFilename,
        normTitle: normalizeForMatch(t.title),
        normArtist: normalizeForMatch(t.artist)
      })));
      
    for (const targetTrack of activePlaylist.tracks) {
      const normTargetTitle = normalizeForMatch(targetTrack.title);
      const normTargetArtist = normalizeForMatch(targetTrack.artist);
      
      let bestMatch = null;
      let bestScore = 0;
      
      for (const other of otherTracks) {
        const titleScore = stringSimilarity(normTargetTitle, other.normTitle);
        const artistScore = stringSimilarity(normTargetArtist, other.normArtist);
        
        let combinedScore = 0;
        if (!normTargetArtist || !other.normArtist || normTargetArtist === 'unknown' || other.normArtist === 'unknown') {
          combinedScore = titleScore;
        } else {
          combinedScore = (titleScore * 0.7) + (artistScore * 0.3);
        }
        
        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestMatch = other;
        }
      }
      
      if (bestScore >= threshold && bestMatch) {
        matches.push({
          targetTrack,
          sourceTrack: bestMatch.track,
          sourcePlaylistName: bestMatch.playlistName,
          score: bestScore,
          selected: true
        });
      }
    }
    
    setCrossPruneMatches(matches.sort((a, b) => b.score - a.score));
  };

  const openCrossPruneModal = () => {
    setIsCrossPruneOpen(true);
    setIsCalculatingMatches(true);
    setTimeout(() => {
      computeCrossPruneMatches(crossPruneStrictness);
      setIsCalculatingMatches(false);
    }, 50);
  };

  const applyCrossPrune = () => {
    if (!activePlaylist) return;
    
    const idsToRemove = new Set<string>(
      crossPruneMatches.filter(m => m.selected).map(m => m.targetTrack.id)
    );
    
    updateActivePlaylist(p => {
      const remaining = p.tracks.filter(t => !idsToRemove.has(t.id));
      const newSelection = new Set(p.selectedIds);
      for (const id of idsToRemove) {
        newSelection.delete(id);
      }
      return { ...p, tracks: remaining, selectedIds: newSelection };
    });
    
    setIsCrossPruneOpen(false);
  };

  const handleReverse = () => {
    updateActivePlaylist(p => ({
      ...p,
      tracks: [...p.tracks].reverse()
    }));
  };

  const handleRandomize = () => {
    updateActivePlaylist(p => {
      const shuffled = [...p.tracks];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return { ...p, tracks: shuffled };
    });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragOverContainer = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const container = e.currentTarget;
    const threshold = 60;
    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    if (y < threshold) {
      const speed = Math.max(5, (threshold - y) / 2);
      container.scrollTop -= speed;
    } else if (y > rect.height - threshold) {
      const speed = Math.max(5, (y - (rect.height - threshold)) / 2);
      container.scrollTop += speed;
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId || !activePlaylist) return;
    
    updateActivePlaylist(p => {
      const isDraggingSelected = p.selectedIds.has(draggedId);
      const idsToMove = isDraggingSelected ? p.selectedIds : new Set([draggedId]);
      
      if (idsToMove.has(targetId)) {
        return p;
      }
      
      const draggedIdx = p.tracks.findIndex(t => t.id === draggedId);
      const targetIdx = p.tracks.findIndex(t => t.id === targetId);
      
      if (draggedIdx === -1 || targetIdx === -1) return p;
      
      const isDraggingDown = draggedIdx < targetIdx;
      
      const itemsToMove = p.tracks.filter(t => idsToMove.has(t.id));
      const remainingTracks = p.tracks.filter(t => !idsToMove.has(t.id));
      
      let insertIdx = remainingTracks.findIndex(t => t.id === targetId);
      
      if (insertIdx !== -1) {
        if (isDraggingDown) {
          insertIdx += 1;
        }
        remainingTracks.splice(insertIdx, 0, ...itemsToMove);
        return { ...p, tracks: remainingTracks };
      }
      return p;
    });
    
    setDraggedId(null);
  };

  const handleExport = () => {
    if (!activePlaylist || activePlaylist.tracks.length === 0) return;
    
    let content = '';
    if (activePlaylist.fileType === 'csv') {
      content += activePlaylist.csvHeaders.map(escapeCSV).join(activePlaylist.csvDelimiter) + '\n';
      for (const t of activePlaylist.tracks) {
        if (t.csvRow) {
          content += t.csvRow.map(escapeCSV).join(activePlaylist.csvDelimiter) + '\n';
        }
      }
    } else {
      content += '#EXTM3U\n';
      for (const t of activePlaylist.tracks) {
        if (t.m3uMeta) content += t.m3uMeta + '\n';
        if (t.m3uPath) content += t.m3uPath + '\n';
      }
    }
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `manipulated_${activePlaylist.originalFilename}`);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <div className="bg-slate-900/50 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Playlist Manipulator
              </h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Power Tool</p>
            </div>
          </div>
          {activePlaylist && activePlaylist.tracks.length > 0 && (
            <button 
              onClick={handleExport}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors"
            >
              <Download size={14} />
              <span>Export Active</span>
            </button>
          )}
        </div>

        {/* Tabs for Playlists */}
        {playlists.length > 0 && (
          <div className="flex items-center space-x-2 overflow-x-auto custom-scrollbar pb-1">
            {playlists.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePlaylistId(p.id)}
                className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${activePlaylistId === p.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                <span className="truncate max-w-[150px]">{p.originalFilename}</span>
                <span className="ml-2 px-1.5 py-0.5 bg-black/20 rounded text-[10px]">{p.tracks.length}</span>
                <div 
                  onClick={(e) => { e.stopPropagation(); closePlaylist(p.id); }}
                  className="ml-2 p-0.5 hover:bg-black/20 rounded transition-colors"
                >
                  <X size={12} />
                </div>
              </button>
            ))}
            <label className="flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap">
              <Plus size={14} className="mr-1" /> Add
              <input type="file" className="hidden" accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel" multiple onChange={handleFileInput} ref={fileInputRef} />
            </label>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20">
        {playlists.length === 0 ? (
          <div className="space-y-6">
            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-4 flex items-start space-x-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                <SlidersHorizontal size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-indigo-300 uppercase">Manipulate Playlists</h4>
                <p className="text-[11px] text-slate-400 leading-tight mt-1">
                  Upload multiple .m3u or .csv files to rearrange, delete, sort, and cross-reference tracks like a pro.
                </p>
              </div>
            </div>
            <FileUploader
              label="Playlist File(s)"
              subLabel="Upload .m3u or .csv"
              files={[]}
              onFilesSelected={handleFileSelected}
              onClear={() => {}}
              multiple={true}
              accept=".m3u,.m3u8,.csv,text/csv,application/csv,application/vnd.ms-excel"
              colorClass="indigo"
            />
          </div>
        ) : activePlaylist ? (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-3 sticky top-0 z-10 shadow-lg shadow-slate-950/50">
              {/* Top Row: Search & Global Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 flex-1 min-w-[150px]">
                  <Search size={14} className="text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Search tracks..." 
                    value={activePlaylist.searchQuery}
                    onChange={(e) => updateActivePlaylist(p => ({ ...p, searchQuery: e.target.value }))}
                    className="bg-transparent border-none outline-none text-xs text-slate-200 w-full placeholder:text-slate-500"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <SortAsc size={14} className="text-slate-500" />
                  <select 
                    onChange={(e) => handleSort(e.target.value as keyof Track)}
                    className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500"
                    defaultValue=""
                  >
                    <option value="" disabled>Sort by...</option>
                    <option value="title">Title</option>
                    <option value="artist">Artist</option>
                    <option value="album">Album</option>
                    {hasPlayCount && <option value="playCount">Play Count (Highest First)</option>}
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <Filter size={14} className="text-slate-500" />
                  <select 
                    value={activePlaylist.artistFilter}
                    onChange={(e) => handleSelectByArtist(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 max-w-[150px]"
                  >
                    <option value="">Select Artist...</option>
                    {uniqueArtists.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={handleReverse}
                  className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <ArrowUpDown size={14} />
                  <span>Reverse</span>
                </button>

                <button 
                  onClick={handleRandomize}
                  className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Dices size={14} />
                  <span>Randomize</span>
                </button>

                <button 
                  onClick={handleRemoveDuplicates}
                  className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <CopyMinus size={14} />
                  <span>Deduplicate</span>
                </button>

                {playlists.length > 1 && (
                  <button 
                    onClick={openCrossPruneModal}
                    className="flex items-center space-x-2 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/40 px-3 py-1.5 rounded-lg transition-colors border border-indigo-500/30"
                    title="Remove songs that are present in any of the other open playlists"
                  >
                    <Layers size={14} />
                    <span>Cross-Prune</span>
                  </button>
                )}
              </div>

              {/* Bottom Row: Selection Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800/50">
                <button 
                  onClick={handleSelectAll}
                  className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <CheckSquare size={14} className="text-indigo-400" />
                  <span>Select All</span>
                </button>

                <button 
                  onClick={handleDeselectAll}
                  className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Square size={14} />
                  <span>Deselect All</span>
                </button>

                <button 
                  onClick={handleInvertSelection}
                  className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <RefreshCcw size={14} />
                  <span>Invert</span>
                </button>

                <button 
                  onClick={handleBasicSelectRange}
                  title="Expands the selection between the first and last selected tracks. If none selected, opens basic range selector."
                  className="flex items-center space-x-2 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/35 px-3 py-1.5 rounded-lg border border-emerald-500/30 transition-colors shadow-sm"
                >
                  <SlidersHorizontal size={14} className="text-emerald-400" />
                  <span>Select Range</span>
                </button>

                <button 
                  onClick={() => {
                    if (filteredTracks.length > 0) {
                      setAdvRangeStartId(filteredTracks[0].id);
                      setAdvRangeEndId(filteredTracks[filteredTracks.length - 1].id);
                      setIsAdvancedRangeOpen(true);
                    } else {
                      alert("No tracks visible to select an advanced range.");
                    }
                  }}
                  title="Advanced Range selections: union, subtract, or intersect ranges."
                  className="flex items-center space-x-2 text-xs font-medium text-violet-300 hover:text-white bg-violet-500/15 hover:bg-violet-500/35 px-3 py-1.5 rounded-lg border border-violet-500/30 transition-colors shadow-sm"
                >
                  <Sparkles size={14} className="text-violet-400" />
                  <span>Advanced Range...</span>
                </button>

                <button 
                  onClick={() => {
                    if (!hasPlayCount) {
                      alert("This playlist does not contain a 'Play Count' or 'Plays' column. Ensure you upload a Musicolet Songs CSV export containing play count details.");
                      return;
                    }
                    setIsPlayCountFilterOpen(true);
                  }}
                  title="Select or deselect tracks based on their play count range"
                  className={`flex items-center space-x-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors shadow-sm
                    ${hasPlayCount 
                      ? 'text-cyan-300 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/35 border-cyan-500/30 shadow-cyan-900/10' 
                      : 'text-slate-500 bg-slate-800/30 border-slate-800 cursor-not-allowed opacity-50'}`}
                >
                  <BarChart3 size={14} className={hasPlayCount ? "text-cyan-400" : "text-slate-500"} />
                  <span>Select by Plays...</span>
                </button>

                <div className="w-px h-4 bg-slate-700 mx-1"></div>

                <button 
                  onClick={handleMoveToTop}
                  disabled={activePlaylist.selectedIds.size === 0}
                  className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowUpToLine size={14} />
                  <span>Move Top</span>
                </button>

                <button 
                  onClick={handleMoveToBottom}
                  disabled={activePlaylist.selectedIds.size === 0}
                  className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowDownToLine size={14} />
                  <span>Move Bottom</span>
                </button>

                <button 
                  onClick={handleDeleteSelected}
                  disabled={activePlaylist.selectedIds.size === 0}
                  className="flex items-center space-x-2 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                  <span>Delete ({activePlaylist.selectedIds.size})</span>
                </button>

                <div className="ml-auto text-xs text-slate-500 font-medium">
                  {filteredTracks.length} {filteredTracks.length === activePlaylist.tracks.length ? 'tracks' : `of ${activePlaylist.tracks.length} tracks`}
                </div>
              </div>
            </div>

            {/* Track List */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div 
                className="max-h-[60vh] overflow-y-auto custom-scrollbar"
                onDragOver={handleDragOverContainer}
              >
                {filteredTracks.map((track, index) => {
                  const isSelected = activePlaylist.selectedIds.has(track.id);
                  const isTempRange = temporaryRangeIds.has(track.id);
                  const isAdvRange = advancedRangeIds.has(track.id);
                  const isDragged = draggedId === track.id || (draggedId && activePlaylist.selectedIds.has(draggedId) && isSelected);
                  
                  let rowBackgroundClass = '';
                  if (isTempRange) {
                    rowBackgroundClass = 'bg-emerald-500/15 border-y border-emerald-500/30 text-emerald-100 ring-2 ring-emerald-500/10';
                  } else if (isAdvRange) {
                    if (isSelected) {
                      rowBackgroundClass = 'bg-gradient-to-r from-indigo-500/10 to-violet-500/20 border-y border-violet-500/40 text-violet-100 ring-2 ring-violet-500/15';
                    } else {
                      rowBackgroundClass = 'bg-violet-500/15 border-y border-violet-500/30 text-violet-100 ring-2 ring-violet-500/10';
                    }
                  } else if (isSelected) {
                    rowBackgroundClass = 'bg-indigo-500/10';
                  }
                  
                  return (
                    <div 
                      key={track.id}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, track.id)}
                      onClick={(e) => {
                        // Prevent toggling if clicking on drag handle
                        if ((e.target as HTMLElement).closest('.drag-handle')) return;
                        toggleSelection(track.id, e.shiftKey);
                      }}
                      className={`group flex items-center p-3 border-b border-slate-800/50 hover:bg-slate-800/50 transition-all cursor-pointer ${rowBackgroundClass} ${isDragged ? 'opacity-50' : ''}`}
                    >
                      <div 
                        className="drag-handle p-2 text-slate-600 hover:text-slate-300 cursor-grab active:cursor-grabbing mr-1"
                        draggable
                        onDragStart={(e) => {
                          handleDragStart(e, track.id);
                          const row = e.currentTarget.closest('.group');
                          if (row) {
                            e.dataTransfer.setDragImage(row, 20, 20);
                          }
                        }}
                      >
                        <GripVertical size={16} />
                      </div>
                      
                      <div className="mr-3 text-slate-500">
                        {isTempRange ? (
                          <CheckSquare size={16} className="text-emerald-400" />
                        ) : isAdvRange ? (
                          isSelected ? (
                            <CheckSquare size={16} className="text-violet-400 animate-pulse" />
                          ) : (
                            <Square size={16} className="text-violet-400 animate-pulse border-violet-500/50" />
                          )
                        ) : (
                          isSelected ? <CheckSquare size={16} className="text-indigo-400" /> : <Square size={16} />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 flex items-center space-x-3">
                        <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center flex-shrink-0 text-slate-500">
                          <Music size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium text-slate-200 truncate">{track.title}</div>
                            {isTempRange && (
                              <span className="text-[8px] bg-emerald-500/30 text-emerald-300 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/40 uppercase tracking-widest animate-pulse shrink-0">
                                Target Range
                              </span>
                            )}
                            {isAdvRange && (
                              <span className="text-[8px] bg-violet-500/30 text-violet-300 font-bold px-1.5 py-0.5 rounded-full border border-violet-500/40 uppercase tracking-widest animate-pulse shrink-0">
                                {isSelected ? 'Target Deselect / Intersect' : 'Target Add / Selection'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate flex items-center space-x-2">
                            <span>{track.artist}</span>
                            {track.album && (
                              <>
                                <span>•</span>
                                <span>{track.album}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3 flex-shrink-0 font-mono">
                          {track.playCount !== undefined && (
                            <span className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              {track.playCount} plays
                            </span>
                          )}
                          {track.duration && (
                            <div className="text-xs text-slate-500">
                              {track.duration}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredTracks.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    No tracks found matching your criteria.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {isCrossPruneOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-200">Smart Cross-Prune</h3>
                <p className="text-xs text-slate-500">Find and remove fuzzy matches from other playlists</p>
              </div>
              <button onClick={() => setIsCrossPruneOpen(false)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                <X size={20} />
              </button>
            </div>
            
            {/* Controls */}
            <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex items-center space-x-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-400 mb-2 flex justify-between">
                  <span>Matching Strictness</span>
                  <span className="text-indigo-400">{crossPruneStrictness}%</span>
                </label>
                <input 
                  type="range" 
                  min="50" 
                  max="100" 
                  value={crossPruneStrictness}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setCrossPruneStrictness(val);
                    setIsCalculatingMatches(true);
                    setTimeout(() => {
                      computeCrossPruneMatches(val);
                      setIsCalculatingMatches(false);
                    }, 50);
                  }}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>Loose (More False Positives)</span>
                  <span>Exact Match</span>
                </div>
              </div>
            </div>
            
            {/* Match List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {isCalculatingMatches ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <RefreshCcw size={32} className="text-indigo-500 animate-spin" />
                  <p className="text-slate-400 text-sm font-medium">Analyzing tracks...</p>
                </div>
              ) : crossPruneMatches.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm">
                  No matches found at this strictness level.
                </div>
              ) : (
                crossPruneMatches.map((match, idx) => (
                  <div key={idx} className={`flex items-center p-3 rounded-xl border transition-colors ${match.selected ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-slate-800/30 border-slate-800 opacity-50'}`}>
                    <button 
                      onClick={() => {
                        const newMatches = [...crossPruneMatches];
                        newMatches[idx].selected = !newMatches[idx].selected;
                        setCrossPruneMatches(newMatches);
                      }}
                      className="mr-3 text-slate-400 hover:text-indigo-400"
                    >
                      {match.selected ? <CheckSquare size={18} className="text-indigo-400" /> : <Square size={18} />}
                    </button>
                    
                    <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-rose-400 uppercase mb-1">Will Remove</div>
                        <div className="text-slate-200 truncate font-medium">{match.targetTrack.title}</div>
                        <div className="text-slate-500 truncate text-xs">{match.targetTrack.artist}</div>
                      </div>
                      <div className="min-w-0 border-l border-slate-700 pl-4">
                        <div className="text-[10px] font-bold text-emerald-400 uppercase mb-1 flex justify-between">
                          <span className="truncate mr-2">Matched With ({match.sourcePlaylistName})</span>
                          <span className="text-indigo-300 flex-shrink-0">{Math.round(match.score * 100)}% Match</span>
                        </div>
                        <div className="text-slate-200 truncate font-medium">{match.sourceTrack.title}</div>
                        <div className="text-slate-500 truncate text-xs">{match.sourceTrack.artist}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-slate-800 flex justify-end space-x-3 bg-slate-900 rounded-b-2xl">
              <button 
                onClick={() => setIsCrossPruneOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={applyCrossPrune}
                disabled={crossPruneMatches.filter(m => m.selected).length === 0}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Trash2 size={16} />
                <span>Remove {crossPruneMatches.filter(m => m.selected).length} Tracks</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isRangeSelectorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 text-emerald-400">
                <SlidersHorizontal size={18} />
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Precise Range Selector</h3>
                  <p className="text-[10px] text-slate-500">Pick starting and ending boundary marks</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsRangeSelectorOpen(false);
                  setRangeStartId('');
                  setRangeEndId('');
                }} 
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Form */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1.5 uppercase tracking-wider">Start Track Boundary</label>
                  <select 
                    value={rangeStartId} 
                    onChange={(e) => setRangeStartId(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 transition-colors"
                  >
                    {filteredTracks.map((t, idx) => (
                      <option key={t.id} value={t.id}>
                        [{idx + 1}] {t.title} - {t.artist}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1.5 uppercase tracking-wider">End Track Boundary</label>
                  <select 
                    value={rangeEndId} 
                    onChange={(e) => setRangeEndId(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 transition-colors"
                  >
                    {filteredTracks.map((t, idx) => (
                      <option key={t.id} value={t.id}>
                        [{idx + 1}] {t.title} - {t.artist}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3.5 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Temporary Range Size:</span>
                <span className="font-mono font-bold bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded border border-emerald-500/20">
                  {temporaryRangeIds.size} Tracks
                </span>
              </div>
            </div>
            
            {/* Actions Footer */}
            <div className="p-4 border-t border-slate-800 flex flex-col gap-2 bg-slate-950/40">
              <div className="flex gap-2">
                <button 
                  onClick={() => applyRangeAction('add')}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 shadow"
                >
                  <Plus size={14} />
                  <span>Add to Selection</span>
                </button>

                <button 
                  onClick={() => applyRangeAction('subtract')}
                  disabled={activePlaylist.selectedIds.size === 0}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5 shadow"
                >
                  <X size={14} />
                  <span>Deselect Range</span>
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button 
                  onClick={() => applyRangeAction('replace')}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-colors text-center border border-slate-700"
                >
                  Select Only This Range
                </button>

                <button 
                  onClick={() => {
                    setIsRangeSelectorOpen(false);
                    setRangeStartId('');
                    setRangeEndId('');
                  }}
                  className="w-24 py-2 bg-slate-900 hover:bg-slate-800 text-slate-500 hover:text-slate-400 rounded-lg text-xs font-bold transition-colors text-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdvancedRangeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-violet-950/30 to-indigo-950/30 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 text-violet-400">
                <Sparkles size={18} className="animate-pulse" />
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Advanced Range Selector</h3>
                  <p className="text-[10px] text-slate-400">Add, deselect, or intersect custom track spans</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsAdvancedRangeOpen(false);
                  setAdvRangeStartId('');
                  setAdvRangeEndId('');
                }} 
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Form */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wider">Start Track Boundary</label>
                  <select 
                    value={advRangeStartId} 
                    onChange={(e) => setAdvRangeStartId(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 focus:border-violet-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 transition-colors"
                  >
                    {filteredTracks.map((t, idx) => (
                      <option key={t.id} value={t.id}>
                        [{idx + 1}] {t.title} - {t.artist}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wider">End Track Boundary</label>
                  <select 
                    value={advRangeEndId} 
                    onChange={(e) => setAdvRangeEndId(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 focus:border-violet-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 transition-colors"
                  >
                    {filteredTracks.map((t, idx) => (
                      <option key={t.id} value={t.id}>
                        [{idx + 1}] {t.title} - {t.artist}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status and Selection Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-3 flex flex-col justify-between text-xs">
                  <span className="text-slate-400 font-medium">Proposed Range Spanned:</span>
                  <span className="font-mono font-bold text-violet-300 text-sm mt-1">
                    {advancedRangeIds.size} Tracks
                  </span>
                </div>

                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 flex flex-col justify-between text-xs">
                  <span className="text-slate-400 font-medium">Already Selected in Spanned Range:</span>
                  <span className="font-mono font-bold text-indigo-300 text-sm mt-1">
                    {activePlaylist ? Array.from(advancedRangeIds).filter(id => activePlaylist.selectedIds.has(id)).length : 0} Tracks
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Total Selection Size:</span>
                <span className="font-mono font-bold text-slate-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                  {activePlaylist ? activePlaylist.selectedIds.size : 0} Tracks Selected
                </span>
              </div>
            </div>
            
            {/* Actions Footer */}
            <div className="p-4 border-t border-slate-800 flex flex-col gap-2.5 bg-slate-950/40">
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => applyAdvancedRangeAction('add')}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 shadow"
                >
                  <Plus size={14} />
                  <span>Add Range (Union)</span>
                </button>

                <button 
                  onClick={() => applyAdvancedRangeAction('subtract')}
                  disabled={!activePlaylist || activePlaylist.selectedIds.size === 0}
                  className="py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5 shadow"
                >
                  <X size={14} />
                  <span>Deselect Range</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => applyAdvancedRangeAction('intersect')}
                  disabled={!activePlaylist || activePlaylist.selectedIds.size === 0}
                  className="py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition-colors text-center border border-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Deselects everything except the tracks that overlap with this range"
                >
                  Keep Only Overlap (Intersect)
                </button>

                <button 
                  onClick={() => applyAdvancedRangeAction('replace')}
                  className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-colors text-center border border-slate-700"
                >
                  Select Only This Range
                </button>
              </div>

              <div className="flex justify-end pt-1">
                <button 
                  onClick={() => {
                    setIsAdvancedRangeOpen(false);
                    setAdvRangeStartId('');
                    setAdvRangeEndId('');
                  }}
                  className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-300 rounded-lg text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPlayCountFilterOpen && activePlaylist && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 text-cyan-400">
                <BarChart3 size={18} />
                <div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Play Count Filter</h3>
                  <p className="text-[10px] text-slate-500">Select or deselect tracks by play count range</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsPlayCountFilterOpen(false);
                }} 
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Form */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1.5 uppercase tracking-wider">Minimum Plays</label>
                  <input 
                    type="number"
                    min="0"
                    value={playCountMin}
                    onChange={(e) => setPlayCountMin(e.target.value)}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 transition-colors font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1.5 uppercase tracking-wider">Maximum Plays</label>
                  <input 
                    type="number"
                    min="0"
                    value={playCountMax}
                    onChange={(e) => setPlayCountMax(e.target.value)}
                    placeholder="No limit"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 outline-none rounded-lg p-2.5 text-xs text-slate-200 transition-colors font-mono"
                  />
                </div>
              </div>

              {/* Selection Summary */}
              <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-3.5 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Matching Tracks in Active View:</span>
                <span className="font-mono font-bold bg-cyan-500/20 text-cyan-300 px-3 py-1 rounded border border-cyan-500/20 font-mono">
                  {(() => {
                    const min = playCountMin === '' ? 0 : parseInt(playCountMin, 10);
                    const max = playCountMax === '' ? Infinity : parseInt(playCountMax, 10);
                    return filteredTracks.filter(t => t.playCount !== undefined && t.playCount >= min && t.playCount <= max).length;
                  })()} Tracks
                </span>
              </div>
            </div>
            
            {/* Actions Footer */}
            <div className="p-4 border-t border-slate-800 flex flex-col gap-2 bg-slate-950/40">
              <div className="flex gap-2">
                <button 
                  onClick={() => applyPlayCountAction('add')}
                  className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 shadow"
                >
                  <Plus size={14} />
                  <span>Select / Add</span>
                </button>

                <button 
                  onClick={() => applyPlayCountAction('subtract')}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 shadow"
                >
                  <X size={14} />
                  <span>Deselect Range</span>
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button 
                  onClick={() => applyPlayCountAction('replace')}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-colors text-center border border-slate-700"
                >
                  Select Only Matching
                </button>
                
                <button 
                  onClick={() => applyPlayCountAction('intersect')}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-colors text-center border border-slate-700"
                >
                  Intersect Selection
                </button>

                <button 
                  onClick={() => {
                    setIsPlayCountFilterOpen(false);
                  }}
                  className="w-24 py-2 bg-slate-900 hover:bg-slate-800 text-slate-500 hover:text-slate-400 rounded-lg text-xs font-bold transition-colors text-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
