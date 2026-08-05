import React, { useState, useMemo } from 'react';
import { ArrowLeft, Scissors, Download, Copy, Search, RefreshCcw, CheckSquare, Square, FileText, FileSpreadsheet, Music, SlidersHorizontal, Sparkles, Plus, Trash2, Check, Wand2, Filter, Columns, ShieldCheck } from 'lucide-react';
import { downloadPlaylistFile } from '../services/downloadHelper';

interface ScrapeStripperViewProps {
  onBack: () => void;
}

export interface ParsedScrapeTrack {
  id: string;
  originalTitle: string;
  cleanedTitle: string;
  originalArtist: string;
  cleanedArtist: string;
  duration: string;
  durationSeconds: number;
  views: string;
  age: string;
  selected: boolean;
}

type ScrapeModule = 'autodetect' | 'channel' | 'playlist';

// Sample scrape datasets for quick 1-click demonstration
const SAMPLE_CHANNEL_SCRAPE = `3:36

Ryan.B \\& 周延英 - 沒有理由【歌詞字幕 / 完整高清音質】♫「不知不覺的放開你...」Ryan.B \\& Effie - No Reason

19M views

•

8 years ago





3:21

【HD】余佳運 - 和你 \\[新歌\\]\\[歌詞字幕\\]\\[完整高清音質\\] Yu Jia Yun - With You

3.1M views

•

9 years ago





4:09

【HD】張碧晨 - 一吻之間 \\[新歌字幕\\]\\[電視劇《青年醫生》插曲\\]\\[完整高音質\\] The Young Doctor Theme Song

1.7M views

•

11 years ago`;

const SAMPLE_PLAYLIST_SCRAPE = `true
2:50
Now playing
SOLO
JENNIE
•
63M views • 7 years ago

true
2:50
Now playing
とうきょう
Yukopi
•
141K views • 1 year ago

true
3:05
Now playing
Little Too Much
Mercer Henderson
•
178K views • 3 years ago`;

const generateId = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substring(2);
};

function parseDurationSeconds(durationStr: string): number {
  if (!durationStr) return 0;
  const parts = durationStr.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// Standardized Unified Scrape Parser (Backward compatible with manual & automated scrapes)
function parseStandardizedScrape(text: string, excludeRecommendations: boolean = true): ParsedScrapeTrack[] {
  let mainText = text;

  // 1. Truncate at recommendations section if excludeRecommendations enabled
  if (excludeRecommendations) {
    const recsRegex = /\b(Recommended videos|Recommended playlists|Related videos|You might also like|People also watched)\b/i;
    const recMatch = text.search(recsRegex);
    if (recMatch !== -1) {
      mainText = text.substring(0, recMatch);
    }
  }

  const lines = mainText.split(/\r?\n/).map(l => l.trim());
  const tracks: ParsedScrapeTrack[] = [];

  const isDuration = (str: string) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(str);
  const isViews = (str: string) => /^\d+(\.\d+)?[KMB]?\s+views$/i.test(str);
  const isAge = (str: string) => /\b(ago|year|month|week|day|hour|minute)s?\b/i.test(str);
  const isViewsAgeCombined = (str: string) => /views\s*•/i.test(str) || (str.includes('views') && isAge(str));
  const isBullet = (str: string) => str === '•';

  // Filter out top navigation & sidebar headers
  const isHeaderNoise = (str: string) => {
    if (!str) return true;
    if (str === 'true' || str === 'Now playing' || str === 'Play all' || str === 'Shuffle' || str === 'Skip navigation' || str === 'Create') return true;
    if (/^(Home|Shorts|Subscriptions|History|Playlists|Watch later|Liked videos|Your videos|Downloads|Explore|Music|Gaming|News|Report history|TermsPrivacyPolicy|© \d+ Google LLC|Manual)$/i.test(str)) return true;
    if (/^\d+\s+(subscribers|videos|views|unavailable videos are hidden)$/i.test(str)) return true;
    if (str.startsWith('AboutPressCopyright') || str.startsWith('TermsPrivacyPolicy') || str.includes('unavailable videos are hidden')) return true;
    return false;
  };

  let i = 0;
  while (i < lines.length) {
    let line = lines[i];

    if (!line || isHeaderNoise(line)) {
      i++;
      continue;
    }

    // Pattern 1: Leading Duration (e.g. 2:50, 3:36)
    if (isDuration(line)) {
      const duration = line;
      i++;
      while (i < lines.length && (!lines[i] || isHeaderNoise(lines[i]))) i++;

      let title = '';
      if (i < lines.length && !isBullet(lines[i]) && !isViews(lines[i])) {
        title = lines[i];
        i++;
      }

      while (i < lines.length && lines[i] === '') i++;

      let channelOrViews = '';
      if (i < lines.length && !isBullet(lines[i])) {
        channelOrViews = lines[i];
        i++;
      }

      while (i < lines.length && (lines[i] === '' || isBullet(lines[i]))) i++;

      let views = '';
      let age = '';

      if (isViewsAgeCombined(channelOrViews)) {
        const parts = channelOrViews.split('•').map(p => p.trim());
        views = parts[0] || '';
        age = parts[1] || '';
      } else if (isViews(channelOrViews)) {
        views = channelOrViews;
        if (i < lines.length && isAge(lines[i])) {
          age = lines[i];
          i++;
        }
      } else {
        // channelOrViews was a channel name
        const channel = channelOrViews;
        if (i < lines.length && isViewsAgeCombined(lines[i])) {
          const parts = lines[i].split('•').map(p => p.trim());
          views = parts[0] || '';
          age = parts[1] || '';
          i++;
        } else if (i < lines.length && isViews(lines[i])) {
          views = lines[i];
          i++;
          while (i < lines.length && (lines[i] === '' || isBullet(lines[i]))) i++;
          if (i < lines.length && isAge(lines[i])) {
            age = lines[i];
            i++;
          }
        }

        if (title) {
          tracks.push({
            id: generateId(),
            originalTitle: title,
            cleanedTitle: title,
            originalArtist: channel || 'Unknown Artist',
            cleanedArtist: channel || 'Unknown Artist',
            duration,
            durationSeconds: parseDurationSeconds(duration),
            views,
            age,
            selected: true
          });
          continue;
        }
      }

      if (title) {
        tracks.push({
          id: generateId(),
          originalTitle: title,
          cleanedTitle: title,
          originalArtist: 'Unknown Artist',
          cleanedArtist: 'Unknown Artist',
          duration,
          durationSeconds: parseDurationSeconds(duration),
          views,
          age,
          selected: true
        });
        continue;
      }
    }

    // Pattern 2: Items without leading duration line (e.g. Title, Channel, •, Views • Age)
    let lookAhead = i;
    let candidateTitle = lines[lookAhead];
    lookAhead++;
    while (lookAhead < lines.length && lines[lookAhead] === '') lookAhead++;

    let candidateChannel = '';
    if (lookAhead < lines.length && !isBullet(lines[lookAhead]) && !isViews(lines[lookAhead])) {
      candidateChannel = lines[lookAhead];
      lookAhead++;
    }

    while (lookAhead < lines.length && (lines[lookAhead] === '' || isBullet(lines[lookAhead]))) lookAhead++;

    if (lookAhead < lines.length && (isViewsAgeCombined(lines[lookAhead]) || isViews(lines[lookAhead]) || isAge(lines[lookAhead]))) {
      let views = '';
      let age = '';
      const vLine = lines[lookAhead];
      if (isViewsAgeCombined(vLine)) {
        const parts = vLine.split('•').map(p => p.trim());
        views = parts[0] || '';
        age = parts[1] || '';
      } else if (isViews(vLine)) {
        views = vLine;
      } else if (isAge(vLine)) {
        age = vLine;
      }

      if (!isHeaderNoise(candidateTitle) && candidateTitle.length > 1) {
        tracks.push({
          id: generateId(),
          originalTitle: candidateTitle,
          cleanedTitle: candidateTitle,
          originalArtist: candidateChannel || 'Unknown Artist',
          cleanedArtist: candidateChannel || 'Unknown Artist',
          duration: '',
          durationSeconds: 0,
          views,
          age,
          selected: true
        });
        i = lookAhead + 1;
        continue;
      }
    }

    i++;
  }

  return tracks;
}

export default function ScrapeStripperView({ onBack }: ScrapeStripperViewProps) {
  const [activeModule, setActiveModule] = useState<ScrapeModule>('autodetect');
  const [rawText, setRawText] = useState<string>('');
  const [parsedTracks, setParsedTracks] = useState<ParsedScrapeTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDiffPreview, setShowDiffPreview] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Power Tool Filters & Exclusions
  const [excludeRecommendations, setExcludeRecommendations] = useState<boolean>(true);
  const [stripHD, setStripHD] = useState<boolean>(true);
  const [stripMV, setStripMV] = useState<boolean>(true);
  const [stripLyrics, setStripLyrics] = useState<boolean>(true);
  const [stripAudioQuality, setStripAudioQuality] = useState<boolean>(true);
  const [stripSquareBrackets, setStripSquareBrackets] = useState<boolean>(true);
  const [stripCJKBrackets, setStripCJKBrackets] = useState<boolean>(true);
  const [stripParenthesesTags, setStripParenthesesTags] = useState<boolean>(true);
  const [stripSymbols, setStripSymbols] = useState<boolean>(true);

  // Custom User Exclusion Keywords
  const [customKeywords, setCustomKeywords] = useState<string>('hd, 4k, theme song, 1080p');

  // Auto Splitter Settings
  const [autoSplitDelimiter, setAutoSplitDelimiter] = useState<boolean>(true);

  // Export Column Chooser Selection States
  const [exportColTitle, setExportColTitle] = useState<boolean>(true);
  const [exportColArtist, setExportColArtist] = useState<boolean>(true);
  const [exportColDuration, setExportColDuration] = useState<boolean>(true);
  const [exportColViews, setExportColViews] = useState<boolean>(true);
  const [exportColAge, setExportColAge] = useState<boolean>(true);

  // Default Keyword Presets list built dynamically
  const activeExclusionKeywords = useMemo(() => {
    const keywords: string[] = [];
    if (stripHD) {
      keywords.push('hd', '4k', '1080p', '720p', 'uhd', '2k');
    }
    if (stripMV) {
      keywords.push(
        'official video', 'official music video', 'official visualizer', 'official audio',
        'lyric video', 'visualizer', 'explicit version', 'mv', 'official mv', 'audio'
      );
    }
    if (stripLyrics) {
      keywords.push(
        'lyrics', 'subtitles', '新歌字幕', '歌詞字幕', '歌詞', '動態歌詞',
        '動態歌詞lyrics', 'lyrics video', 'sub'
      );
    }
    if (stripAudioQuality) {
      keywords.push(
        '新歌', '完整高清音質', '完整高音質', '經典原曲', '高清音質無現場雜音版',
        '完整搶聽版', '高音質', '高清音質', '無現場雜音版'
      );
    }

    // Add user custom keywords
    if (customKeywords) {
      const userKws = customKeywords
        .split(/[,;\n]/)
        .map(k => k.trim())
        .filter(k => k.length > 0);
      keywords.push(...userKws);
    }

    return Array.from(new Set(keywords));
  }, [stripHD, stripMV, stripLyrics, stripAudioQuality, customKeywords]);

  // Clean title & split artist logic with unescaping support
  const cleanTitleAndArtist = (rawTitle: string, initialArtist: string) => {
    let text = rawTitle;

    // 1. Unescape markdown / raw escape characters
    text = text.replace(/\\&/g, '&');
    text = text.replace(/\\\[/g, '[');
    text = text.replace(/\\\]/g, ']');
    text = text.replace(/\\\(/g, '(');
    text = text.replace(/\\\)/g, ')');
    text = text.replace(/\\\\/g, ' ');
    text = text.replace(/\\/g, ' ');

    // 2. Strip bracket contents
    if (stripSquareBrackets) {
      text = text.replace(/\[[^\]]*\]/g, ' ');
    }
    if (stripCJKBrackets) {
      text = text.replace(/【[^】]*】/g, ' ');
      text = text.replace(/♫\s*「[^」]*」/g, ' ');
      text = text.replace(/「[^」]*」/g, ' ');
    }

    // 3. Strip music symbols
    if (stripSymbols) {
      text = text.replace(/[♫♪★☆▶️]/g, ' ');
    }

    // 4. Keyword replacements (case-insensitive)
    for (const kw of activeExclusionKeywords) {
      if (!kw.trim()) continue;
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b|${escaped}`, 'gi');
      text = text.replace(regex, ' ');
    }

    // 5. Remove empty brackets left behind
    text = text.replace(/\(\s*\)/g, ' ');
    text = text.replace(/\[\s*\]/g, ' ');
    text = text.replace(/【\s*】/g, ' ');

    if (stripParenthesesTags) {
      // Remove common parenthetical video tags if left over
      text = text.replace(/\(\s*(official|music|video|visualizer|audio|hd|4k|lyric|lyrics)\s*\)/gi, ' ');
    }

    // Remove any lingering slashes or double backslashes
    text = text.replace(/\\/g, ' ');
    text = text.replace(/\/\s*\//g, ' ');

    // 6. Clean extra whitespace
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/^[\s\-–—/|:;]+|[\s\-–—/|:;]+$/g, '').trim();

    let finalArtist = initialArtist.replace(/\\&/g, '&').replace(/\\/g, '').trim();
    let finalTitle = text;

    // Auto-split artist and title if delimiter exists
    if (autoSplitDelimiter) {
      const delimiters = [' - ', ' – ', '—', ' | ', ' / '];
      for (const d of delimiters) {
        if (text.includes(d)) {
          const parts = text.split(d);
          finalArtist = parts[0].trim();
          finalTitle = parts.slice(1).join(d).trim();
          break;
        }
      }
    }

    return { title: finalTitle || rawTitle, artist: finalArtist || 'Unknown Artist' };
  };

  const handleParseAndClean = (inputRawText: string) => {
    if (!inputRawText.trim()) {
      setParsedTracks([]);
      return;
    }

    const parsed = parseStandardizedScrape(inputRawText, excludeRecommendations);

    // Apply cleaning
    const cleaned = parsed.map(track => {
      const { title, artist } = cleanTitleAndArtist(track.originalTitle, track.originalArtist);
      return {
        ...track,
        cleanedTitle: title,
        cleanedArtist: artist
      };
    });

    setParsedTracks(cleaned);
  };

  const handleTextChange = (text: string) => {
    setRawText(text);
    handleParseAndClean(text);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const text = await file.text();
      setRawText(text);
      handleParseAndClean(text);
    }
  };

  const handleModuleSwitch = (mod: ScrapeModule) => {
    setActiveModule(mod);
    handleParseAndClean(rawText);
  };

  // Re-run cleaning when keyword filters or split options change
  const processedTracks = useMemo(() => {
    return parsedTracks.map(track => {
      const { title, artist } = cleanTitleAndArtist(track.originalTitle, track.originalArtist);
      return {
        ...track,
        cleanedTitle: title,
        cleanedArtist: artist
      };
    });
  }, [
    parsedTracks,
    excludeRecommendations,
    stripHD,
    stripMV,
    stripLyrics,
    stripAudioQuality,
    stripSquareBrackets,
    stripCJKBrackets,
    stripParenthesesTags,
    stripSymbols,
    activeExclusionKeywords,
    autoSplitDelimiter
  ]);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return processedTracks;
    const q = searchQuery.toLowerCase();
    return processedTracks.filter(t =>
      t.cleanedTitle.toLowerCase().includes(q) ||
      t.cleanedArtist.toLowerCase().includes(q) ||
      t.originalTitle.toLowerCase().includes(q)
    );
  }, [processedTracks, searchQuery]);

  const selectedCount = useMemo(() => {
    return processedTracks.filter(t => t.selected).length;
  }, [processedTracks]);

  const toggleSelectAll = () => {
    const allSelected = processedTracks.every(t => t.selected);
    setParsedTracks(prev => prev.map(t => ({ ...t, selected: !allSelected })));
  };

  const toggleTrackSelection = (id: string) => {
    setParsedTracks(prev => prev.map(t => t.id === id ? { ...t, selected: !t.selected } : t));
  };

  const updateTrackTitle = (id: string, newTitle: string) => {
    setParsedTracks(prev => prev.map(t => t.id === id ? { ...t, cleanedTitle: newTitle } : t));
  };

  const updateTrackArtist = (id: string, newArtist: string) => {
    setParsedTracks(prev => prev.map(t => t.id === id ? { ...t, cleanedArtist: newArtist } : t));
  };

  // Export handlers with UTF-8 BOM (\uFEFF) and column selection support
  const handleExportCSV = async () => {
    const targets = processedTracks.filter(t => t.selected);
    if (targets.length === 0) return;

    const selectedCols: { key: keyof ParsedScrapeTrack; header: string }[] = [];
    if (exportColTitle) selectedCols.push({ key: 'cleanedTitle', header: 'Title' });
    if (exportColArtist) selectedCols.push({ key: 'cleanedArtist', header: 'Artist' });
    if (exportColDuration) selectedCols.push({ key: 'duration', header: 'Duration' });
    if (exportColViews) selectedCols.push({ key: 'views', header: 'Views' });
    if (exportColAge) selectedCols.push({ key: 'age', header: 'Age' });

    if (selectedCols.length === 0) {
      alert('Please select at least one column to export.');
      return;
    }

    let content = '\uFEFF' + selectedCols.map(c => c.header).join(',') + '\n';
    for (const t of targets) {
      const row = selectedCols.map(c => {
        const val = String(t[c.key] || '');
        return `"${val.replace(/"/g, '""')}"`;
      });
      content += row.join(',') + '\n';
    }

    await downloadPlaylistFile(content, 'cleaned_scrape.csv', 'text/csv;charset=utf-8;');
  };

  const handleExportTSV = async () => {
    const targets = processedTracks.filter(t => t.selected);
    if (targets.length === 0) return;

    const selectedCols: { key: keyof ParsedScrapeTrack; header: string }[] = [];
    if (exportColTitle) selectedCols.push({ key: 'cleanedTitle', header: 'Title' });
    if (exportColArtist) selectedCols.push({ key: 'cleanedArtist', header: 'Artist' });
    if (exportColDuration) selectedCols.push({ key: 'duration', header: 'Duration' });
    if (exportColViews) selectedCols.push({ key: 'views', header: 'Views' });
    if (exportColAge) selectedCols.push({ key: 'age', header: 'Age' });

    if (selectedCols.length === 0) {
      alert('Please select at least one column to export.');
      return;
    }

    let content = '\uFEFF' + selectedCols.map(c => c.header).join('\t') + '\n';
    for (const t of targets) {
      const row = selectedCols.map(c => String(t[c.key] || ''));
      content += row.join('\t') + '\n';
    }

    await downloadPlaylistFile(content, 'cleaned_scrape.tsv', 'text/tab-separated-values;charset=utf-8;');
  };

  const handleExportTXT = async () => {
    const targets = processedTracks.filter(t => t.selected);
    if (targets.length === 0) return;

    let content = '\uFEFF';
    for (const t of targets) {
      const parts: string[] = [];
      if (exportColArtist && t.cleanedArtist) parts.push(t.cleanedArtist);
      if (exportColTitle && t.cleanedTitle) parts.push(t.cleanedTitle);
      
      let line = parts.join(' - ');
      
      const extraParts: string[] = [];
      if (exportColDuration && t.duration) extraParts.push(t.duration);
      if (exportColViews && t.views) extraParts.push(t.views);
      if (exportColAge && t.age) extraParts.push(t.age);
      
      if (extraParts.length > 0) {
        line += ` (${extraParts.join(' • ')})`;
      }

      content += (line || t.cleanedTitle) + '\n';
    }

    await downloadPlaylistFile(content, 'cleaned_scrape.txt', 'text/plain;charset=utf-8;');
  };

  const handleExportM3U = async () => {
    const targets = processedTracks.filter(t => t.selected);
    if (targets.length === 0) return;

    let content = '\uFEFF#EXTM3U\n';
    for (const t of targets) {
      content += `#EXTINF:${t.durationSeconds},${t.cleanedArtist} - ${t.cleanedTitle}\n`;
      content += `${t.cleanedArtist} - ${t.cleanedTitle}.mp3\n`;
    }

    await downloadPlaylistFile(content, 'cleaned_scrape.m3u', 'audio/x-mpegurl');
  };

  const handleCopyToClipboard = () => {
    const targets = processedTracks.filter(t => t.selected);
    if (targets.length === 0) return;

    const lines = targets.map(t => {
      if (exportColArtist && exportColTitle) {
        return `${t.cleanedArtist} - ${t.cleanedTitle}`;
      } else if (exportColTitle) {
        return t.cleanedTitle;
      } else if (exportColArtist) {
        return t.cleanedArtist;
      }
      return `${t.cleanedArtist} - ${t.cleanedTitle}`;
    });

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-200 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800 p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-black bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                Scrape Stripper & Formatter
              </h2>
              <span className="text-[9px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Standardized Engine
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">Standardized parser for manual & automated scrapes with noise/recommendation filters</p>
          </div>
        </div>

        {/* Module Switcher Tabs */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'autodetect', label: 'Auto-Detect' },
            { id: 'channel', label: 'Channel Scrape' },
            { id: 'playlist', label: 'Playlist Scrape' }
          ].map(m => (
            <button
              key={m.id}
              onClick={() => handleModuleSwitch(m.id as ScrapeModule)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeModule === m.id ? 'bg-violet-600 text-white shadow shadow-violet-950/40' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto w-full">
        
        {/* Left Column: Input & Power Tool Options (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Input Box & File Upload Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                <FileText size={14} className="text-violet-400" />
                <span>Raw Scrape Input</span>
              </label>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => {
                    setRawText(SAMPLE_CHANNEL_SCRAPE);
                    handleParseAndClean(SAMPLE_CHANNEL_SCRAPE);
                  }}
                  className="text-[10px] font-bold bg-violet-500/15 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30 px-2 py-1 rounded-md transition-colors"
                >
                  Sample Channel
                </button>
                <button
                  onClick={() => {
                    setRawText(SAMPLE_PLAYLIST_SCRAPE);
                    handleParseAndClean(SAMPLE_PLAYLIST_SCRAPE);
                  }}
                  className="text-[10px] font-bold bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 px-2 py-1 rounded-md transition-colors"
                >
                  Sample Playlist
                </button>
              </div>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Paste raw channel scrape or playlist scrape text here (manual or automated scrapes)..."
              rows={7}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-500/60 transition-colors custom-scrollbar resize-none"
            />

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-750 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-slate-700">
                <Plus size={14} />
                <span>Upload Scrape File</span>
                <input type="file" accept=".txt,.md,.text" className="hidden" onChange={handleFileUpload} />
              </label>
              {rawText && (
                <button
                  onClick={() => {
                    setRawText('');
                    setParsedTracks([]);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold px-2 py-1 rounded transition-colors"
                >
                  Clear Text
                </button>
              )}
            </div>
          </div>

          {/* Keyword Exclusion & Stripper Power Tools */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold text-violet-400 uppercase tracking-wider border-b border-slate-800 pb-2">
              <Wand2 size={16} />
              <span>Keyword & Tag Exclusion Power Tools</span>
            </div>

            {/* Recommendations & Top Headers Shield Toggle */}
            <div className="bg-violet-500/10 border border-violet-500/20 p-2.5 rounded-xl">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeRecommendations}
                  onChange={e => {
                    setExcludeRecommendations(e.target.checked);
                    if (rawText) handleParseAndClean(rawText);
                  }}
                  className="accent-violet-500 rounded w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-1.5">
                    <ShieldCheck size={14} className="text-violet-400" />
                    <span className="text-xs font-bold text-violet-200">Exclude Recommendations & Top Headers</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Filters out YouTube sidebar clutter and truncates at 'Recommended videos/playlists'</p>
                </div>
              </label>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-300">
              <label className="flex items-center space-x-2 bg-slate-955 p-2 rounded-lg border border-slate-850 cursor-pointer hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={stripHD} onChange={e => setStripHD(e.target.checked)} className="accent-violet-500 rounded" />
                <span>HD / 4K / 1080p</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-955 p-2 rounded-lg border border-slate-850 cursor-pointer hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={stripMV} onChange={e => setStripMV(e.target.checked)} className="accent-violet-500 rounded" />
                <span>Official Video / MV</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-955 p-2 rounded-lg border border-slate-850 cursor-pointer hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={stripLyrics} onChange={e => setStripLyrics(e.target.checked)} className="accent-violet-500 rounded" />
                <span>Lyrics / Subtitles</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-955 p-2 rounded-lg border border-slate-850 cursor-pointer hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={stripAudioQuality} onChange={e => setStripAudioQuality(e.target.checked)} className="accent-violet-500 rounded" />
                <span>Audio Quality Tags</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-955 p-2 rounded-lg border border-slate-850 cursor-pointer hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={stripSquareBrackets} onChange={e => setStripSquareBrackets(e.target.checked)} className="accent-violet-500 rounded" />
                <span>Strip Square Brackets [...]</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-955 p-2 rounded-lg border border-slate-850 cursor-pointer hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={stripCJKBrackets} onChange={e => setStripCJKBrackets(e.target.checked)} className="accent-violet-500 rounded" />
                <span>Strip CJK Brackets 【...】</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-955 p-2 rounded-lg border border-slate-850 cursor-pointer hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={stripParenthesesTags} onChange={e => setStripParenthesesTags(e.target.checked)} className="accent-violet-500 rounded" />
                <span>Strip Parentheses (...)</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-955 p-2 rounded-lg border border-slate-850 cursor-pointer hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={stripSymbols} onChange={e => setStripSymbols(e.target.checked)} className="accent-violet-500 rounded" />
                <span>Strip Symbols (♫, ♪)</span>
              </label>
            </div>

            {/* Custom Exclusions Input */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Custom Exclusions (Comma / Newline Separated)
              </label>
              <input
                type="text"
                value={customKeywords}
                onChange={e => setCustomKeywords(e.target.value)}
                placeholder="e.g. hd, 4k, theme song, live, remix"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {/* Auto Delimiter Splitter */}
            <div className="pt-2 border-t border-slate-800/80">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSplitDelimiter}
                  onChange={e => setAutoSplitDelimiter(e.target.checked)}
                  className="accent-violet-500 rounded w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-200">Auto-Split Artist & Title</span>
                  <p className="text-[10px] text-slate-500">Splits titles containing ' - ', ' – ', '—', ' / ', or ' | '</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Cleaned Data Preview & Exports (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          
          {/* Top Control Bar & Export Column Chooser */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Cleaned Tracks ({filteredTracks.length})
                </span>
                <span className="text-xs font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-md">
                  {selectedCount} Selected
                </span>
              </div>

              {/* Diff Preview Toggle */}
              <button
                onClick={() => setShowDiffPreview(!showDiffPreview)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${showDiffPreview ? 'bg-violet-600 border-violet-500 text-white shadow shadow-violet-950/40' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}
              >
                {showDiffPreview ? 'Showing Raw Diff' : 'Show Raw Diff'}
              </button>
            </div>

            {/* Export Column Selection Pills */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <Columns size={12} className="text-violet-400" />
                <span>Export Columns to Include:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                {[
                  { label: 'Title', state: exportColTitle, set: setExportColTitle },
                  { label: 'Artist', state: exportColArtist, set: setExportColArtist },
                  { label: 'Duration', state: exportColDuration, set: setExportColDuration },
                  { label: 'Views', state: exportColViews, set: setExportColViews },
                  { label: 'Age', state: exportColAge, set: setExportColAge },
                ].map(col => (
                  <button
                    key={col.label}
                    onClick={() => col.set(!col.state)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${col.state ? 'bg-violet-500/20 text-violet-300 border-violet-500/40' : 'bg-slate-955 text-slate-500 border-slate-800 hover:text-slate-300'}`}
                  >
                    {col.state ? '✓ ' : ''}{col.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Filter & Bulk Selections */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60">
              <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex-1 min-w-[140px]">
                <Search size={14} className="text-slate-500" />
                <input
                  type="text"
                  placeholder="Search parsed tracks..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs text-slate-200 w-full placeholder:text-slate-600"
                />
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg transition-colors font-bold"
                >
                  Toggle All
                </button>
              </div>
            </div>
          </div>

          {/* Parsed Clean Table List */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl min-h-[350px] flex flex-col">
            <div className="max-h-[55vh] overflow-y-auto custom-scrollbar flex-1">
              {filteredTracks.length > 0 ? (
                filteredTracks.map((t, idx) => (
                  <div
                    key={t.id}
                    className={`p-3 border-b border-slate-850 hover:bg-slate-850/50 transition-colors flex items-center space-x-3 ${t.selected ? 'bg-slate-900' : 'opacity-50'}`}
                  >
                    <button
                      onClick={() => toggleTrackSelection(t.id)}
                      className="text-slate-500 hover:text-violet-400 shrink-0"
                    >
                      {t.selected ? <CheckSquare size={16} className="text-violet-400" /> : <Square size={16} />}
                    </button>

                    <span className="text-[10px] font-mono font-bold text-slate-600 w-6 text-right shrink-0">
                      {idx + 1}
                    </span>

                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Editable Cleaned Title */}
                      <input
                        type="text"
                        value={t.cleanedTitle}
                        onChange={e => updateTrackTitle(t.id, e.target.value)}
                        className="w-full bg-transparent text-xs font-bold text-slate-100 outline-none focus:bg-slate-950 focus:px-2 focus:py-0.5 focus:rounded border border-transparent focus:border-violet-500/50 truncate transition-all"
                      />

                      {/* Editable Cleaned Artist */}
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                        <input
                          type="text"
                          value={t.cleanedArtist}
                          onChange={e => updateTrackArtist(t.id, e.target.value)}
                          className="bg-transparent text-[11px] font-semibold text-violet-300 outline-none focus:bg-slate-950 focus:px-1.5 focus:rounded border border-transparent focus:border-violet-500/50 truncate max-w-[200px]"
                        />
                        {t.views && <span>• {t.views}</span>}
                        {t.age && <span>• {t.age}</span>}
                      </div>

                      {/* Raw Diff Preview */}
                      {showDiffPreview && (
                        <div className="text-[9px] font-mono text-slate-500 truncate bg-slate-950/80 p-1 rounded border border-slate-850 mt-1">
                          <span className="text-rose-400">RAW: </span>{t.originalTitle}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 text-right font-mono text-[11px] text-slate-400">
                      {t.duration || '--:--'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
                  <Scissors size={32} className="text-slate-700 animate-pulse" />
                  <p className="text-xs font-bold">No tracks parsed yet</p>
                  <p className="text-[10px] text-slate-600 max-w-xs">
                    Paste raw text into the left input box or click "Sample Channel" to test instantly.
                  </p>
                </div>
              )}
            </div>

            {/* Export Actions Bar */}
            <div className="bg-slate-955 p-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopyToClipboard}
                  disabled={selectedCount === 0}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700"
                >
                  {copiedNotification ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedNotification ? 'Copied!' : 'Copy Cleaned'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  disabled={selectedCount === 0}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700"
                  title="Export Cleaned CSV (UTF-8 BOM)"
                >
                  <FileSpreadsheet size={14} className="text-emerald-400" />
                  <span>CSV</span>
                </button>

                <button
                  onClick={handleExportTSV}
                  disabled={selectedCount === 0}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700"
                  title="Export Cleaned TSV (UTF-8 BOM)"
                >
                  <FileText size={14} className="text-cyan-400" />
                  <span>TSV</span>
                </button>

                <button
                  onClick={handleExportTXT}
                  disabled={selectedCount === 0}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700"
                  title="Export Cleaned TXT List (UTF-8 BOM)"
                >
                  <FileText size={14} className="text-amber-400" />
                  <span>TXT</span>
                </button>

                <button
                  onClick={handleExportM3U}
                  disabled={selectedCount === 0}
                  className="flex items-center space-x-1.5 bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-violet-950/40"
                  title="Export Playable M3U"
                >
                  <Music size={14} />
                  <span>M3U</span>
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
