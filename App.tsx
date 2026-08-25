import React, { useState, useEffect } from 'react';
import { Layers, Merge, Music, Settings, Github, Activity, Scissors, Shuffle, Eraser, Type, BarChart3, Eye, Filter, SlidersHorizontal, Wand2, HelpCircle, Sparkles, BookOpen, GitCompare, Globe } from 'lucide-react';
import SonicSieveView from './views/SonicSieveView';
import PlaylistMergerView from './views/PlaylistMergerView';
import PlaylistSplitterView from './views/PlaylistSplitterView';
import PlaylistRandomizerView from './views/PlaylistRandomizerView';
import PlaylistPrunerView from './views/PlaylistPrunerView';
import SmartRenamerView from './views/SmartRenamerView';
import PlaylistAppearanceView from './views/PlaylistAppearanceView';
import VisionToPlaylistView from './views/VisionToPlaylistView';
import PlaylistManipulatorView from './views/PlaylistManipulatorView';
import TierFilteringView from './views/TierFilteringView';
import PlaylistMatcherView from './views/PlaylistMatcherView';
import ScrapeStripperView from './views/ScrapeStripperView';
import LanguageClusteringView from './views/LanguageClusteringView';
import HelpGuideModal from './components/HelpGuideModal';

type AppView = 'dashboard' | 'sieve' | 'merger' | 'splitter' | 'randomizer' | 'pruner' | 'renamer' | 'appearance' | 'vision' | 'tier' | 'manipulator' | 'matcher' | 'stripper' | 'clustering';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);

  // Global Keyboard Shortcut listener for ? (Shift + / or Shift + ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If active element is an input, textarea, or contentEditable, don't hijack
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsHelpModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderView = () => {
    switch (currentView) {
      case 'sieve':
        return <SonicSieveView onBack={() => setCurrentView('dashboard')} />;
      case 'merger':
        return <PlaylistMergerView onBack={() => setCurrentView('dashboard')} />;
      case 'splitter':
        return <PlaylistSplitterView onBack={() => setCurrentView('dashboard')} />;
      case 'randomizer':
        return <PlaylistRandomizerView onBack={() => setCurrentView('dashboard')} />;
      case 'pruner':
        return <PlaylistPrunerView onBack={() => setCurrentView('dashboard')} />;
      case 'renamer':
        return <SmartRenamerView onBack={() => setCurrentView('dashboard')} />;
      case 'appearance':
        return <PlaylistAppearanceView onBack={() => setCurrentView('dashboard')} />;
      case 'vision':
        return <VisionToPlaylistView onBack={() => setCurrentView('dashboard')} />;
      case 'tier':
        return <TierFilteringView onBack={() => setCurrentView('dashboard')} />;
      case 'manipulator':
        return <PlaylistManipulatorView onBack={() => setCurrentView('dashboard')} />;
      case 'matcher':
        return <PlaylistMatcherView onBack={() => setCurrentView('dashboard')} />;
      case 'stripper':
        return <ScrapeStripperView onBack={() => setCurrentView('dashboard')} />;
      case 'clustering':
        return <LanguageClusteringView onBack={() => setCurrentView('dashboard')} />;
      default:
        return <Dashboard onViewSelect={setCurrentView} onOpenHelp={() => setIsHelpModalOpen(true)} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {renderView()}
      
      {/* Universal Searchable Help & Guidance Modal (?) */}
      <HelpGuideModal 
        isOpen={isHelpModalOpen} 
        onClose={() => setIsHelpModalOpen(false)} 
      />
    </div>
  );
}

const Dashboard = ({ 
  onViewSelect, 
  onOpenHelp 
}: { 
  onViewSelect: (view: AppView) => void;
  onOpenHelp: () => void;
}) => {
  return (
    <div className="flex flex-col min-h-screen pb-10">
      <header className="p-6 pt-8 pb-3 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-slate-100 to-slate-500 bg-clip-text text-transparent">
            Playlist Haven
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Mobile Playlist Toolkit</p>
        </div>

        {/* Global Help Guide Trigger Button */}
        <button
          onClick={onOpenHelp}
          className="flex items-center space-x-2 bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white px-3.5 py-2 rounded-2xl border border-violet-500/30 transition-all shadow-lg shadow-violet-950/30 active:scale-95 cursor-pointer font-bold text-xs"
          title="User Guide & Philosophy (Press ?)"
        >
          <HelpCircle size={17} />
          <span className="hidden sm:inline font-mono">Guide (?)</span>
        </button>
      </header>

      <main className="flex-1 px-4 space-y-6 mt-1">
        
        {/* Onboarding Guide Banner for Strangers / New Visitors */}
        <div 
          onClick={onOpenHelp}
          className="group p-4 bg-gradient-to-r from-violet-950/40 via-indigo-950/30 to-slate-900 border border-violet-500/30 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-violet-500/60 transition-all shadow-xl hover:shadow-violet-950/20"
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 bg-violet-500/20 text-violet-300 rounded-xl flex items-center justify-center border border-violet-500/30 shrink-0 group-hover:scale-105 transition-transform">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-black text-slate-100 group-hover:text-violet-200 transition-colors">
                  New to Playlist Haven?
                </span>
                <span className="text-[9px] bg-violet-500/30 text-violet-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                  Quick Tour (?)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Learn the Experience Engine philosophy, 60s YouTube-to-Spotify workflows & power tools.
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-1.5 text-xs font-bold text-violet-400 group-hover:text-violet-300 shrink-0 font-mono">
            <span>Open Guide</span>
            <span>→</span>
          </div>
        </div>

        {/* Unified, Balanced & Fully Responsive Tools Grid */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Sonic Sieve Card - Featured */}
          <button 
            onClick={() => onViewSelect('sieve')}
            className="group relative overflow-hidden p-6 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-900/10 active:scale-[0.98] col-span-2"
          >
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Layers size={80} />
            </div>
            <div className="relative z-10">
              <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                <Layers size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-200 mb-1">Sonic Sieve</h2>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Logic Engine for weekly playlist generation. Filter by play counts, apply penalties, and rank with anchors.
              </p>
            </div>
          </button>
          
          {/* Vision to Playlist Card - Featured */}
          <button 
            onClick={() => onViewSelect('vision')}
            className="group relative overflow-hidden p-6 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-900/10 active:scale-[0.98] col-span-2"
          >
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Eye size={80} />
            </div>
            <div className="relative z-10">
              <div className="w-10 h-10 bg-violet-500/20 text-violet-400 rounded-xl flex items-center justify-center mb-4 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                <Eye size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-200 mb-1">Vision-to-Playlist</h2>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                AI Digitizer. Upload screenshots of playlists, extract songs, deduplicate, and export to CSV for Tune My Music.
              </p>
            </div>
          </button>

          {/* Scrape Stripper Card - Featured */}
          <button 
            onClick={() => onViewSelect('stripper')}
            className="group relative overflow-hidden p-6 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-900/10 active:scale-[0.98] col-span-2"
          >
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Wand2 size={80} />
            </div>
            <div className="relative z-10">
              <div className="w-10 h-10 bg-violet-500/20 text-violet-400 rounded-xl flex items-center justify-center mb-4 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                <Wand2 size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-200 mb-1">Scrape Stripper & Formatter</h2>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Parse channel & playlist scrapes. Exclude noise tags (HD, 4K, Official Video), auto-split artists, and convert to clean CSV, TSV, TXT, or M3U.
              </p>
            </div>
          </button>

          {/* Language & Nationality Clustering Card - Featured */}
          <button 
            onClick={() => onViewSelect('clustering')}
            className="group relative overflow-hidden p-6 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-900/10 active:scale-[0.98] col-span-2"
          >
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Globe size={80} />
            </div>
            <div className="relative z-10">
              <div className="w-10 h-10 bg-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                <Globe size={20} />
              </div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-200 mb-1">Language & Nationality Clustering</h2>
                <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                  Module 13
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Multi-tiered classification engine. Intelligently cluster your library into 13 language & nationality groups in seconds using cached base data, Unicode script detection, MusicBrainz, and Gemini AI.
              </p>
            </div>
          </button>

          {/* Playlist Manipulator Card */}
          <button 
            onClick={() => onViewSelect('manipulator')}
            className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-900/10 active:scale-[0.98]"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <SlidersHorizontal size={60} />
            </div>
            <div className="relative z-10">
              <div className="w-8 h-8 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                <SlidersHorizontal size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-200 mb-1">Manipulator</h2>
              <p className="text-[10px] text-slate-500 leading-tight font-medium">
                Power tool. Sort/edit M3Us or CSVs.
              </p>
            </div>
          </button>

          {/* Playlist Reconciler Card */}
          <button 
            onClick={() => onViewSelect('matcher')}
            className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-900/10 active:scale-[0.98]"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <GitCompare size={60} />
            </div>
            <div className="relative z-10">
              <div className="w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                <GitCompare size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-200 mb-1">Reconciler</h2>
              <p className="text-[10px] text-slate-500 leading-tight font-medium">
                Offline Matcher for local paths.
              </p>
            </div>
          </button>

          {/* Playlist Randomizer Card */}
          <button 
            onClick={() => onViewSelect('randomizer')}
            className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-fuchsia-500/50 hover:shadow-2xl hover:shadow-fuchsia-900/10 active:scale-[0.98]"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <Shuffle size={60} />
            </div>
            <div className="relative z-10">
              <div className="w-8 h-8 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-fuchsia-500 group-hover:text-white transition-colors">
                <Shuffle size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-200 mb-1">Randomizer</h2>
              <p className="text-[10px] text-slate-500 leading-tight font-medium">
                Mix and shuffle batches.
              </p>
            </div>
          </button>

          {/* Playlist Pruner Card */}
          <button 
            onClick={() => onViewSelect('pruner')}
            className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-rose-500/50 hover:shadow-2xl hover:shadow-rose-900/10 active:scale-[0.98]"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <Eraser size={60} />
            </div>
            <div className="relative z-10">
              <div className="w-8 h-8 bg-rose-500/20 text-rose-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                <Eraser size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-200 mb-1">Pruner</h2>
              <p className="text-[10px] text-slate-500 leading-tight font-medium">
                Smart remove tracks.
              </p>
            </div>
          </button>

          {/* Playlist Merger Card */}
          <button 
            onClick={() => onViewSelect('merger')}
            className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-900/10 active:scale-[0.98]"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <Merge size={60} />
            </div>
            <div className="relative z-10">
              <div className="w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                <Merge size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-200 mb-1">Merger</h2>
              <p className="text-[10px] text-slate-500 leading-tight font-medium">
                Combine & deduplicate.
              </p>
            </div>
          </button>

          {/* Tier Filtering Card */}
          <button 
            onClick={() => onViewSelect('tier')}
            className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-900/10 active:scale-[0.98]"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <Filter size={60} />
            </div>
            <div className="relative z-10">
              <div className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <Filter size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-200 mb-1">Tier Filter</h2>
              <p className="text-[10px] text-slate-500 leading-tight font-medium">
                Top N, Range & Percent.
              </p>
            </div>
          </button>

          {/* Playlist Splitter Card */}
          <button 
            onClick={() => onViewSelect('splitter')}
            className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-orange-500/50 hover:shadow-2xl hover:shadow-orange-900/10 active:scale-[0.98] col-span-2"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <Scissors size={60} />
            </div>
            <div className="relative z-10">
              <div className="w-8 h-8 bg-orange-500/20 text-orange-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                <Scissors size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-200 mb-1">Splitter</h2>
              <p className="text-[10px] text-slate-500 leading-tight font-medium">
                Cut into parts.
              </p>
            </div>
          </button>
        </div>

        {/* Status / Quick Links Area */}
        <div className="pt-4 border-t border-slate-800/50 flex items-center justify-between text-xs text-slate-500">
          <button 
            onClick={onOpenHelp}
            className="flex items-center space-x-2 text-violet-400 hover:text-violet-300 font-bold transition-colors"
          >
            <HelpCircle size={15} />
            <span>Open User Guide & FAQ</span>
          </button>

          <div className="flex items-center space-x-2 font-mono text-[10px] text-slate-600">
            <Activity size={12} className="text-emerald-500/50" />
            <span>Experience Engine v3.1</span>
          </div>
        </div>
      </main>

      <footer className="text-center p-6 text-[10px] text-slate-600 font-mono">
        <p>Playlist Haven &copy; {new Date().getFullYear()} — Experience Your Art</p>
      </footer>
    </div>
  );
};