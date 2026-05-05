import React, { useState } from 'react';
import { Layers, Merge, Music, Settings, Github, Activity, Scissors, Shuffle, Eraser, Type, BarChart3, Eye, Filter, SlidersHorizontal } from 'lucide-react';
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

type AppView = 'dashboard' | 'sieve' | 'merger' | 'splitter' | 'randomizer' | 'pruner' | 'renamer' | 'appearance' | 'vision' | 'tier' | 'manipulator';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');

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
      default:
        return <Dashboard onViewSelect={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {renderView()}
    </div>
  );
}

const Dashboard = ({ onViewSelect }: { onViewSelect: (view: AppView) => void }) => {
  return (
    <div className="flex flex-col min-h-screen pb-10">
      <header className="p-6 pt-8 pb-2">
        <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-slate-100 to-slate-500 bg-clip-text text-transparent">
          M3U Haven
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Mobile Playlist Toolkit</p>
      </header>

      <main className="flex-1 px-4 space-y-6 mt-4">
        
        {/* Main Tools Grid */}
        <div className="grid grid-cols-1 gap-4">
          
          {/* Sonic Sieve Card */}
          <button 
            onClick={() => onViewSelect('sieve')}
            className="group relative overflow-hidden p-6 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-900/10 active:scale-[0.98]"
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
          
          {/* Vision to Playlist Card - Featured New Tool */}
          <button 
            onClick={() => onViewSelect('vision')}
            className="group relative overflow-hidden p-6 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-900/10 active:scale-[0.98]"
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

          <div className="grid grid-cols-2 gap-4">
            {/* Playlist Manipulator Card */}
            <button 
              onClick={() => onViewSelect('manipulator')}
              className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-900/10 active:scale-[0.98] col-span-2"
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
                  Power tool. Rearrange, delete, sort, and select tracks from M3U or CSV.
                </p>
              </div>
            </button>

            {/* Smart Renamer Card */}
            <button 
                onClick={() => onViewSelect('renamer')}
                className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-teal-500/50 hover:shadow-2xl hover:shadow-teal-900/10 active:scale-[0.98]"
            >
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Type size={60} />
                </div>
                <div className="relative z-10">
                <div className="w-8 h-8 bg-teal-500/20 text-teal-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-teal-500 group-hover:text-white transition-colors">
                    <Type size={16} />
                </div>
                <h2 className="text-sm font-bold text-slate-200 mb-1">Renamer</h2>
                <p className="text-[10px] text-slate-500 leading-tight font-medium">
                    Logical sequences.
                </p>
                </div>
            </button>

             {/* Appearance Counter Card */}
             <button 
                onClick={() => onViewSelect('appearance')}
                className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-sky-500/50 hover:shadow-2xl hover:shadow-sky-900/10 active:scale-[0.98]"
            >
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <BarChart3 size={60} />
                </div>
                <div className="relative z-10">
                <div className="w-8 h-8 bg-sky-500/20 text-sky-400 rounded-lg flex items-center justify-center mb-3 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                    <BarChart3 size={16} />
                </div>
                <h2 className="text-sm font-bold text-slate-200 mb-1">Frequency</h2>
                <p className="text-[10px] text-slate-500 leading-tight font-medium">
                    Count song occurrences.
                </p>
                </div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              className="group relative overflow-hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left transition-all hover:border-orange-500/50 hover:shadow-2xl hover:shadow-orange-900/10 active:scale-[0.98]"
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
        </div>

        {/* Status / Coming Soon Area */}
        <div className="pt-4 border-t border-slate-800/50">
            <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">Roadmap</h3>
            <div className="p-4 bg-slate-900/50 border border-slate-800/50 border-dashed rounded-xl flex items-center space-x-3 opacity-60">
                <div className="p-2 bg-slate-800 rounded-lg text-slate-600">
                    <Music size={16} />
                </div>
                <div className="flex-1">
                    <h4 className="text-xs font-bold text-slate-500">Metadata Editor</h4>
                    <p className="text-[10px] text-slate-600">Bulk edit EXTINF tags</p>
                </div>
                <span className="text-[9px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">Soon</span>
            </div>
        </div>
      </main>

      <footer className="text-center p-6 text-[10px] text-slate-600 font-mono">
        <div className="flex items-center justify-center space-x-2 mb-2">
            <Activity size={12} className="text-emerald-500/50" />
            <span>v2.6.0 Stable</span>
        </div>
        <p>M3U Haven &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};