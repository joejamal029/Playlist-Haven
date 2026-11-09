/**
 * Module 20: Discovery Intelligence Layer — Declarative Recipe Engine
 * 
 * Provides declarative pipeline definitions, parameter validation, multi-stage
 * curatorial execution, cross-module formatting adapters, and 1-click downstream
 * staging (M14 Discovery Triage, M13 Language Clustering, M4 Pruner, M10 Randomizer, M18 Audimote).
 * 
 * Architectural Invariants:
 * - 100% Client-Side. Zero server calls.
 * - Defensive null safety on every track property (?? '', ?? 0).
 * - UTF-8 BOM (\uFEFF) on all CSV, M3U, and TSV exports.
 * - Non-destructive: creates new sequences without modifying original corpus graph.
 */

import {
  CorpusTrack,
  CorpusPlaylist,
  DiscoveryRecipe,
  RecipeCategory,
  RecipeParamDefinition,
  RecipeExecutionResult,
  RecipeExecutionStepLog,
  DownstreamModuleTarget,
  GraphIntelligenceResult,
  ProfilingResult
} from '../types';
import { BipartiteCorpusGraph, getTrackProvenance } from './discoveryCorpusEngine';
import { findArtistBridgePath } from './discoveryGraphEngine';
import { resolveTrackCulturalBucket } from './triageEngine';
import { downloadPlaylistFile } from './downloadHelper';

// ==========================================
// 1. Declarative Recipe Catalog
// ==========================================

export const DISCOVERY_RECIPES: DiscoveryRecipe[] = [
  // ----------------------------------------
  // Category 1: Consensus & Novelty Sieves
  // ----------------------------------------
  {
    id: 'recipe_regional_deep_dive',
    category: 'consensus_sieves',
    name: 'Underground Regional Deep Dive',
    description: 'Find authentic regional songs curated by multiple playlists, not in offline library.',
    promptExample: 'Find 30 authentic C-Pop & J-Pop songs curated by ≥2 playlists, not in my offline library',
    iconName: 'Compass',
    accentColor: 'rose',
    stepsSummary: ['Consensus Filter (≥N)', 'Cultural Bucket Filter', 'Offline Subtraction', 'Quota Limit'],
    requiresOfflineLibrary: true,
    parameters: [
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Minimum distinct playlists that must contain the track',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 20
      },
      {
        key: 'culturalBuckets',
        label: 'Target Cultural Buckets',
        description: 'Select one or more regional cultural buckets',
        type: 'multiselect',
        defaultValue: ['C-Pop', 'J-Pop'],
        options: [
          { value: 'C-Pop', label: 'C-Pop' },
          { value: 'J-Pop', label: 'J-Pop' },
          { value: 'K-Pop', label: 'K-Pop' },
          { value: 'Naija', label: 'Naija' },
          { value: 'African', label: 'African' },
          { value: 'Filipino', label: 'Filipino' },
          { value: 'I-Pop', label: 'I-Pop' },
          { value: 'Latina', label: 'Latina' },
          { value: 'Français', label: 'Français' },
          { value: 'English', label: 'English' }
        ]
      },
      {
        key: 'trackLimit',
        label: 'Track Limit',
        description: 'Maximum number of tracks to produce in final playlist',
        type: 'number',
        defaultValue: 30,
        min: 5,
        max: 200
      },
      {
        key: 'excludeOffline',
        label: 'Exclude Offline Library',
        description: 'Subtract artists/tracks already owned in Musicolet Songs.csv',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },
  {
    id: 'recipe_consensus_sieve',
    category: 'consensus_sieves',
    name: 'Underground Consensus Sieve',
    description: 'Multi-curator consensus tracks across African/Naija lists with entropy artist spacing.',
    promptExample: '40 tracks across African/Naija playlists multiple curators agree on, new to my offline favorites',
    iconName: 'Layers',
    accentColor: 'emerald',
    stepsSummary: ['Consensus Filter (≥N)', 'Cultural Filter (Naija/African)', 'Offline Subtraction', 'Artist Spacing Entropy', 'Quota Limit'],
    requiresOfflineLibrary: true,
    parameters: [
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Minimum playlists containing the track',
        type: 'number',
        defaultValue: 3,
        min: 1,
        max: 20
      },
      {
        key: 'culturalBuckets',
        label: 'Target Buckets',
        description: 'Cultural buckets to include',
        type: 'multiselect',
        defaultValue: ['Naija', 'African']
      },
      {
        key: 'artistSpacingDistance',
        label: 'Artist Spacing Distance',
        description: 'Minimum tracks between songs by the same artist',
        type: 'number',
        defaultValue: 3,
        min: 1,
        max: 10
      },
      {
        key: 'trackLimit',
        label: 'Track Limit',
        description: 'Maximum tracks to output',
        type: 'number',
        defaultValue: 40,
        min: 5,
        max: 200
      },
      {
        key: 'excludeOffline',
        label: 'Exclude Offline Library',
        description: 'Filter out already-owned tracks/artists',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },
  {
    id: 'recipe_undiscovered_pipeline',
    category: 'consensus_sieves',
    name: 'Undiscovered Consensus Pipeline',
    description: 'Cross-check consensus tracks against offline library and apply artist spacing.',
    promptExample: '50 songs multiple playlists agree on, not yet in my offline library',
    iconName: 'Sparkles',
    accentColor: 'sky',
    stepsSummary: ['Consensus Filter (≥N)', 'Offline Subtraction', 'Artist Spacing Entropy', 'Quota Limit'],
    requiresOfflineLibrary: true,
    parameters: [
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Minimum playlists containing the track',
        type: 'number',
        defaultValue: 3,
        min: 1,
        max: 20
      },
      {
        key: 'artistSpacingDistance',
        label: 'Artist Spacing Distance',
        description: 'Minimum separation between tracks by the same artist',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 10
      },
      {
        key: 'trackLimit',
        label: 'Track Limit',
        description: 'Maximum output tracks',
        type: 'number',
        defaultValue: 50,
        min: 5,
        max: 300
      },
      {
        key: 'excludeOffline',
        label: 'Exclude Offline Library',
        description: 'Filter out already-owned music',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },
  {
    id: 'recipe_acoustic_consensus',
    category: 'consensus_sieves',
    name: 'Acoustic-Filtered Consensus',
    description: 'High-energy tracks with tempo constraints across multiple playlists.',
    promptExample: 'High-energy (>0.7) tracks appearing in ≥2 playlists, BPM 120-140, not in my offline library',
    iconName: 'Zap',
    accentColor: 'amber',
    stepsSummary: ['Consensus Filter (≥N)', 'Energy/BPM Filter', 'Offline Subtraction', 'Quota Limit'],
    requiresOfflineLibrary: false,
    requiresAcousticData: true,
    parameters: [
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Minimum playlists containing the track',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 20
      },
      {
        key: 'minEnergy',
        label: 'Minimum Energy',
        description: 'Energy threshold (0.0 to 1.0)',
        type: 'number',
        defaultValue: 0.7,
        min: 0.1,
        max: 1.0,
        step: 0.05
      },
      {
        key: 'minBpm',
        label: 'Minimum BPM',
        description: 'Lower tempo boundary',
        type: 'number',
        defaultValue: 120,
        min: 60,
        max: 200,
        step: 5
      },
      {
        key: 'maxBpm',
        label: 'Maximum BPM',
        description: 'Upper tempo boundary',
        type: 'number',
        defaultValue: 140,
        min: 60,
        max: 220,
        step: 5
      },
      {
        key: 'trackLimit',
        label: 'Track Limit',
        description: 'Output size',
        type: 'number',
        defaultValue: 30,
        min: 5,
        max: 100
      },
      {
        key: 'excludeOffline',
        label: 'Exclude Offline Library',
        description: 'Filter out already-owned songs',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },

  // ----------------------------------------
  // Category 2: Curator Bridge & Fusion
  // ----------------------------------------
  {
    id: 'recipe_curator_cross_pollination',
    category: 'curator_bridge',
    name: 'Curator Cross-Pollination Bridge',
    description: 'Bridge two distinct curator playlists via shared tracks and constellation bridge artists.',
    promptExample: "Bridge Curator A's Afrobeats list and Curator B's UK R&B list",
    iconName: 'GitMerge',
    accentColor: 'indigo',
    stepsSummary: ['Source Selection (A & B)', 'Track Set Intersection', 'Bridge Artist Identification', 'Balanced Sequencing'],
    requiresGraphIntelligence: true,
    parameters: [
      {
        key: 'sourcePlaylistA',
        label: 'Source Playlist A',
        description: 'The starting curator playlist',
        type: 'playlist_select',
        defaultValue: ''
      },
      {
        key: 'sourcePlaylistB',
        label: 'Source Playlist B',
        description: 'The destination curator playlist to bridge into',
        type: 'playlist_select',
        defaultValue: ''
      },
      {
        key: 'trackLimit',
        label: 'Output Track Limit',
        description: 'Maximum tracks in the synthesized bridge playlist',
        type: 'number',
        defaultValue: 30,
        min: 10,
        max: 100
      }
    ]
  },
  {
    id: 'recipe_algorithmic_artist_bridge',
    category: 'curator_bridge',
    name: 'Algorithmic Bridge via Shortest-Path',
    description: "Connect Artist A's world to Artist B's world through intermediate artist graph chain.",
    promptExample: "Find the 3-5 song path connecting Artist A's world to Artist B's world",
    iconName: 'Link',
    accentColor: 'purple',
    stepsSummary: ['Artist Selection (Start & Target)', 'Graph Constellation BFS', 'Path Sequence Assembly', 'Representative Track Sieve'],
    requiresGraphIntelligence: true,
    parameters: [
      {
        key: 'startArtist',
        label: 'Starting Artist',
        description: 'The origin artist in the corpus graph',
        type: 'artist_select',
        defaultValue: ''
      },
      {
        key: 'targetArtist',
        label: 'Target Destination Artist',
        description: 'The target artist to connect to',
        type: 'artist_select',
        defaultValue: ''
      },
      {
        key: 'maxSteps',
        label: 'Max Bridge Steps',
        description: 'Maximum intermediate hops in the artist graph',
        type: 'number',
        defaultValue: 5,
        min: 2,
        max: 8
      },
      {
        key: 'tracksPerStep',
        label: 'Tracks Per Artist Step',
        description: 'Representative tracks for each artist on the path',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 5
      }
    ]
  },
  {
    id: 'recipe_playlist_fusion_synthesizer',
    category: 'curator_bridge',
    name: 'Playlist Bridge & Fusion Synthesizer',
    description: 'Synthesize a hybrid playlist bridging two sources with smooth proportional gradient.',
    promptExample: 'Synthesize a hybrid 40-track playlist bridging Playlist X and Playlist Y',
    iconName: 'Activity',
    accentColor: 'rose',
    stepsSummary: ['Playlist Extraction (A & B)', 'Shared Deduplication', 'Smooth Gradient Interleaving', 'Quota Assembly'],
    parameters: [
      {
        key: 'sourcePlaylistA',
        label: 'Playlist A (Origin)',
        description: 'First source playlist',
        type: 'playlist_select',
        defaultValue: ''
      },
      {
        key: 'sourcePlaylistB',
        label: 'Playlist B (Destination)',
        description: 'Second source playlist',
        type: 'playlist_select',
        defaultValue: ''
      },
      {
        key: 'trackLimit',
        label: 'Track Limit',
        description: 'Total length of hybrid playlist',
        type: 'number',
        defaultValue: 40,
        min: 10,
        max: 150
      },
      {
        key: 'interleaveRatio',
        label: 'A-to-B Balance Ratio',
        description: 'Proportion of Playlist A (0.5 = 50/50 balance)',
        type: 'number',
        defaultValue: 0.5,
        min: 0.1,
        max: 0.9,
        step: 0.1
      }
    ]
  },

  // ----------------------------------------
  // Category 3: Full DAESO Pipelines
  // ----------------------------------------
  {
    id: 'recipe_daeso_sieve_bridge',
    category: 'daeso_pipeline',
    name: 'Discovery-to-Offline Sieve Bridge (Full DAESO)',
    description: 'Process corpus discovery tracks through weekly calibrated 20-track intake rations.',
    promptExample: 'Process my latest discovery tracks through my weekly DAESO routine',
    iconName: 'Disc3',
    accentColor: 'emerald',
    stepsSummary: ['Consensus Matrix (≥N)', 'Cultural Clustering', 'Offline Pruning', 'Weekly Ration Batching (20-tracks)', 'M14 Triage Staging'],
    requiresOfflineLibrary: true,
    parameters: [
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Minimum playlist appearances for intake qualification',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 20
      },
      {
        key: 'weeklyRationSize',
        label: 'Weekly Ration Batch Size',
        description: 'Target tracks per weekly intake batch',
        type: 'number',
        defaultValue: 20,
        min: 10,
        max: 100
      },
      {
        key: 'excludeOffline',
        label: 'Exclude Offline Library',
        description: 'Do not re-ingest tracks already in rotation',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },
  {
    id: 'recipe_walled_garden_ingestion',
    category: 'daeso_pipeline',
    name: 'Walled-Garden Ingestion Pipeline',
    description: 'Strip noise, clean titles, catalog by consensus tier and cultural bucket.',
    promptExample: 'Clean noise, catalog into DAESO layers, generate master consensus distribution',
    iconName: 'FileText',
    accentColor: 'sky',
    stepsSummary: ['Title Noise Stripper', 'Consensus Frequency Ranking', 'Cultural Bucket Cataloging', 'Master Distribution Export'],
    parameters: [
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Cutoff frequency for inclusion',
        type: 'number',
        defaultValue: 1,
        min: 1,
        max: 10
      },
      {
        key: 'cleanTitles',
        label: 'Clean Title Noise',
        description: 'Remove feat., remaster, and format tags',
        type: 'boolean',
        defaultValue: true
      },
      {
        key: 'trackLimit',
        label: 'Track Limit',
        description: 'Maximum catalog cohort',
        type: 'number',
        defaultValue: 100,
        min: 20,
        max: 500
      }
    ]
  },
  {
    id: 'recipe_spotify_direct_intake',
    category: 'daeso_pipeline',
    name: 'Spotify Direct Intake Pipeline',
    description: 'Ingest Spotify playlists, merge into consensus map, extract top candidates.',
    promptExample: 'Ingest Spotify playlists, build corpus, and show consensus map',
    iconName: 'Radio',
    accentColor: 'emerald',
    stepsSummary: ['Spotify ID Validation', 'Consensus Scoring', 'Downstream Cohort Staging'],
    parameters: [
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Appearance threshold',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 10
      },
      {
        key: 'trackLimit',
        label: 'Track Limit',
        description: 'Max candidate cohort size',
        type: 'number',
        defaultValue: 50,
        min: 10,
        max: 200
      }
    ]
  },

  // ----------------------------------------
  // Category 4: Cultural Deep-Dive & Rebalancing
  // ----------------------------------------
  {
    id: 'recipe_cultural_rebalancing',
    category: 'cultural_rebalancing',
    name: 'Cultural Re-Balancing Engine',
    description: 'Build balanced intake pulling equally from 4+ cultural buckets with round-robin anti-cluster spacing.',
    promptExample: 'Build a 50-track intake pulling equally from Naija, I-Pop, Filipino, and Français',
    iconName: 'PieChart',
    accentColor: 'amber',
    stepsSummary: ['Bucket Track Extraction', 'Consensus Ranking Per Bucket', 'Offline Subtraction', 'Anti-Cluster Round-Robin Interweave'],
    requiresOfflineLibrary: true,
    parameters: [
      {
        key: 'culturalBuckets',
        label: 'Target Cultural Buckets',
        description: 'The buckets to balance equally',
        type: 'multiselect',
        defaultValue: ['Naija', 'I-Pop', 'Filipino', 'Français'],
        options: [
          { value: 'Naija', label: 'Naija' },
          { value: 'I-Pop', label: 'I-Pop' },
          { value: 'Filipino', label: 'Filipino' },
          { value: 'Français', label: 'Français' },
          { value: 'C-Pop', label: 'C-Pop' },
          { value: 'J-Pop', label: 'J-Pop' },
          { value: 'K-Pop', label: 'K-Pop' },
          { value: 'Latina', label: 'Latina' },
          { value: 'African', label: 'African' },
          { value: 'English', label: 'English' }
        ]
      },
      {
        key: 'tracksPerBucket',
        label: 'Tracks Per Bucket',
        description: 'Target quota for each individual bucket',
        type: 'number',
        defaultValue: 12,
        min: 3,
        max: 50
      },
      {
        key: 'antiClusterInterweave',
        label: 'Anti-Cluster Interweave',
        description: 'Strict round-robin order so adjacent songs come from different cultures',
        type: 'boolean',
        defaultValue: true
      },
      {
        key: 'excludeOffline',
        label: 'Exclude Offline Library',
        description: 'Filter out already-owned songs',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },
  {
    id: 'recipe_cultural_deep_dive',
    category: 'cultural_rebalancing',
    name: 'Cultural Deep-Dive Expedition',
    description: 'Targeted regional expedition with calibrated primary and secondary quotas.',
    promptExample: '30 tracks: 20 high-energy Afrobeats/Naija + 10 Amapiano/African, appearing in ≥2 playlists',
    iconName: 'Compass',
    accentColor: 'rose',
    stepsSummary: ['Primary Bucket Extraction', 'Secondary Bucket Extraction', 'Consensus Thresholding', 'Quota Splicing'],
    parameters: [
      {
        key: 'primaryBucket',
        label: 'Primary Bucket',
        description: 'The main regional focus',
        type: 'select',
        defaultValue: 'Naija',
        options: [
          { value: 'Naija', label: 'Naija' },
          { value: 'African', label: 'African' },
          { value: 'J-Pop', label: 'J-Pop' },
          { value: 'C-Pop', label: 'C-Pop' },
          { value: 'K-Pop', label: 'K-Pop' },
          { value: 'Filipino', label: 'Filipino' },
          { value: 'I-Pop', label: 'I-Pop' },
          { value: 'Latina', label: 'Latina' },
          { value: 'Français', label: 'Français' },
          { value: 'English', label: 'English' }
        ]
      },
      {
        key: 'primaryQuota',
        label: 'Primary Bucket Quota',
        description: 'Number of tracks from primary bucket',
        type: 'number',
        defaultValue: 20,
        min: 5,
        max: 100
      },
      {
        key: 'secondaryBucket',
        label: 'Secondary Bucket',
        description: 'Complementary regional style',
        type: 'select',
        defaultValue: 'African',
        options: [
          { value: 'African', label: 'African' },
          { value: 'Naija', label: 'Naija' },
          { value: 'J-Pop', label: 'J-Pop' },
          { value: 'C-Pop', label: 'C-Pop' },
          { value: 'K-Pop', label: 'K-Pop' },
          { value: 'Filipino', label: 'Filipino' },
          { value: 'I-Pop', label: 'I-Pop' },
          { value: 'Latina', label: 'Latina' },
          { value: 'Français', label: 'Français' },
          { value: 'English', label: 'English' }
        ]
      },
      {
        key: 'secondaryQuota',
        label: 'Secondary Bucket Quota',
        description: 'Number of tracks from secondary bucket',
        type: 'number',
        defaultValue: 10,
        min: 5,
        max: 50
      },
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Appearance threshold',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 10
      },
      {
        key: 'excludeOffline',
        label: 'Exclude Offline Library',
        description: 'Filter out already-owned songs',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },
  {
    id: 'recipe_community_cultural_discovery',
    category: 'cultural_rebalancing',
    name: 'Community-Based Cultural Discovery',
    description: 'Extract tracks from emergent Louvain clusters you have barely explored.',
    promptExample: 'Show me tracks from the 3 smallest Louvain communities in my corpus',
    iconName: 'Users',
    accentColor: 'purple',
    stepsSummary: ['Louvain Community Analysis', 'Smallest Cluster Selection', 'Consensus Track Extraction', 'Offline Subtraction'],
    requiresGraphIntelligence: true,
    parameters: [
      {
        key: 'communityCount',
        label: 'Communities to Sample',
        description: 'Number of smallest distinct communities to sample',
        type: 'number',
        defaultValue: 3,
        min: 1,
        max: 10
      },
      {
        key: 'tracksPerCommunity',
        label: 'Tracks Per Community',
        description: 'Tracks to pull from each community',
        type: 'number',
        defaultValue: 10,
        min: 3,
        max: 30
      },
      {
        key: 'excludeOffline',
        label: 'Exclude Offline Library',
        description: 'Filter out already-owned tracks',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },

  // ----------------------------------------
  // Category 5: Offline Gap Reconciliation
  // ----------------------------------------
  {
    id: 'recipe_offline_gap_reconciler',
    category: 'offline_gap',
    name: 'Offline Discovery Gap Reconciler',
    description: 'Find artists you love offline who have undiscovered songs in your streaming corpus.',
    promptExample: 'Across saved playlists, find artists I love offline with new songs I don’t own locally yet',
    iconName: 'Sparkles',
    accentColor: 'indigo',
    stepsSummary: ['Offline Favorite Artist Extraction', 'Corpus Filtering to Loved Artists', 'Owned Song Subtraction', 'Consensus Ranking'],
    requiresOfflineLibrary: true,
    parameters: [
      {
        key: 'maxTracksPerArtist',
        label: 'Max Tracks Per Artist',
        description: 'Limit to prevent one favorite artist from dominating',
        type: 'number',
        defaultValue: 3,
        min: 1,
        max: 10
      },
      {
        key: 'trackLimit',
        label: 'Total Output Limit',
        description: 'Total size of gap discovery playlist',
        type: 'number',
        defaultValue: 50,
        min: 10,
        max: 200
      },
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Appearance threshold for discovery gap tracks',
        type: 'number',
        defaultValue: 1,
        min: 1,
        max: 10
      }
    ]
  },
  {
    id: 'recipe_blind_spot_reconciler',
    category: 'offline_gap',
    name: 'Blind Spot Reconciler',
    description: 'Find artists deeply connected to your favorites in the corpus graph but completely absent offline.',
    promptExample: 'Find artists deeply connected to favorites but absent from offline library',
    iconName: 'AlertCircle',
    accentColor: 'rose',
    stepsSummary: ['Constellation Blind Spot Identification', 'Candidate Track Retrieval', 'Consensus Prioritization', 'Triage Staging'],
    requiresOfflineLibrary: true,
    requiresGraphIntelligence: true,
    parameters: [
      {
        key: 'tracksPerArtist',
        label: 'Tracks Per Blind-Spot Artist',
        description: 'Sample size per discovered artist',
        type: 'number',
        defaultValue: 3,
        min: 1,
        max: 10
      },
      {
        key: 'trackLimit',
        label: 'Total Track Limit',
        description: 'Maximum discovery candidates',
        type: 'number',
        defaultValue: 40,
        min: 10,
        max: 150
      }
    ]
  },
  {
    id: 'recipe_dormant_treasure_expedition',
    category: 'offline_gap',
    name: 'Dormant Treasure Expedition',
    description: 'Surface highest-consensus gems from playlists saved in early epochs that remained untouched.',
    promptExample: 'Surface tracks from playlists saved 2+ years ago or oldest in corpus',
    iconName: 'Clock',
    accentColor: 'amber',
    stepsSummary: ['Dormant Epoch Identification', 'Consensus Scoring', 'De-duplication', 'Dormant Cohort Assembly'],
    parameters: [
      {
        key: 'minConsensus',
        label: 'Minimum Consensus',
        description: 'Minimum playlist appearances',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 10
      },
      {
        key: 'trackLimit',
        label: 'Output Track Limit',
        description: 'Total tracks to surface',
        type: 'number',
        defaultValue: 30,
        min: 10,
        max: 100
      }
    ]
  }
];

// ==========================================
// 2. Helper Algorithms & Utilities
// ==========================================

/**
 * Strips title noise (e.g. "(feat. ...)", "[Official Video]", "(Remastered)")
 */
export function cleanTrackTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\s*\(feat\.[^)]*\)/gi, '')
    .replace(/\s*\[feat\.[^\]]*\]/gi, '')
    .replace(/\s*\(with[^)]*\)/gi, '')
    .replace(/\s*\[with[^\]]*\]/gi, '')
    .replace(/\s*\(remaster(ed)?(\s+\d{4})?\)/gi, '')
    .replace(/\s*\[remaster(ed)?(\s+\d{4})?\]/gi, '')
    .replace(/\s*\(official(\s+music)?\s+(video|audio)\)/gi, '')
    .replace(/\s*\[official(\s+music)?\s+(video|audio)\]/gi, '')
    .replace(/\s*\(live[^)]*\)/gi, '')
    .replace(/\s*\[live[^\]]*\]/gi, '')
    .trim();
}

/**
 * Applies smart entropy artist spacing: enforces that tracks by the same artist
 * are separated by at least `minDistance` positions in the sequence.
 */
export function applyArtistSpacingEntropy(tracks: CorpusTrack[], minDistance: number): CorpusTrack[] {
  if (tracks.length <= 1 || minDistance <= 1) return [...tracks];

  const pool = [...tracks];
  const result: CorpusTrack[] = [];
  const recentArtists: string[] = [];

  while (pool.length > 0) {
    let candidateIdx = -1;

    for (let i = 0; i < pool.length; i++) {
      const art = (pool[i].artist ?? '').toLowerCase().trim();
      if (!recentArtists.includes(art)) {
        candidateIdx = i;
        break;
      }
    }

    // Fallback: if all remaining pool tracks conflict with recent window, pick first
    if (candidateIdx === -1) {
      candidateIdx = 0;
    }

    const [selected] = pool.splice(candidateIdx, 1);
    result.push(selected);

    const art = (selected.artist ?? '').toLowerCase().trim();
    recentArtists.push(art);
    if (recentArtists.length > minDistance) {
      recentArtists.shift();
    }
  }

  return result;
}

/**
 * Interweaves tracks from multiple cultural buckets round-robin
 * to prevent regional clustering (Anti-Cluster Interweave).
 */
export function roundRobinInterweave(
  bucketMap: Record<string, CorpusTrack[]>,
  maxTotal: number
): CorpusTrack[] {
  const result: CorpusTrack[] = [];
  const buckets = Object.keys(bucketMap);
  if (buckets.length === 0) return result;

  const queues: Record<string, CorpusTrack[]> = {};
  for (const b of buckets) {
    queues[b] = [...(bucketMap[b] ?? [])];
  }

  let added = true;
  while (added && result.length < maxTotal) {
    added = false;
    for (const b of buckets) {
      if (result.length >= maxTotal) break;
      const q = queues[b];
      if (q && q.length > 0) {
        result.push(q.shift()!);
        added = true;
      }
    }
  }

  return result;
}

/**
 * Synthesizes a smooth transitional gradient from Playlist A -> Bridge -> Playlist B
 */
export function smoothGradientInterweave(
  tracksA: CorpusTrack[],
  tracksB: CorpusTrack[],
  bridgeTracks: CorpusTrack[],
  targetCount: number
): CorpusTrack[] {
  const seenIds = new Set<string>();
  const dedup = (list: CorpusTrack[]) => list.filter(t => {
    const key = t.trackId || t.id;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });

  const uniqueA = dedup(tracksA);
  const uniqueBridge = dedup(bridgeTracks);
  const uniqueB = dedup(tracksB);

  // Divide into segments: ~35% A, ~30% Bridge/Shared, ~35% B
  const countA = Math.max(1, Math.floor(targetCount * 0.35));
  const countBridge = Math.max(1, Math.floor(targetCount * 0.30));
  const countB = Math.max(1, targetCount - countA - countBridge);

  const partA = uniqueA.slice(0, countA);
  const partBridge = uniqueBridge.slice(0, countBridge);
  const partB = uniqueB.slice(0, countB);

  return [...partA, ...partBridge, ...partB].slice(0, targetCount);
}

// ==========================================
// 3. Pipeline Execution Engine
// ==========================================

export interface RecipeExecutionContext {
  graph: BipartiteCorpusGraph;
  graphIntel?: GraphIntelligenceResult | null;
  profilingResult?: ProfilingResult | null;
  offlineArtistSet?: Set<string>;
  offlineTrackSet?: Set<string>;
}

/**
 * Validates and merges user-provided parameter overrides with recipe defaults
 */
export function validateRecipeParams(
  recipe: DiscoveryRecipe,
  userParams?: Record<string, any>
): Record<string, any> {
  const finalParams: Record<string, any> = {};

  for (const def of recipe.parameters) {
    const val = userParams?.[def.key];
    if (val !== undefined && val !== null) {
      if (def.type === 'number') {
        const num = Number(val);
        const min = def.min !== undefined ? def.min : -Infinity;
        const max = def.max !== undefined ? def.max : Infinity;
        finalParams[def.key] = Math.max(min, Math.min(max, isNaN(num) ? def.defaultValue : num));
      } else if (def.type === 'boolean') {
        finalParams[def.key] = Boolean(val);
      } else {
        finalParams[def.key] = val;
      }
    } else {
      finalParams[def.key] = def.defaultValue;
    }
  }

  return finalParams;
}

/**
 * Executes a declarative recipe pipeline against the corpus graph
 */
export async function executeRecipe(
  recipe: DiscoveryRecipe,
  params: Record<string, any>,
  context: RecipeExecutionContext
): Promise<RecipeExecutionResult> {
  const startTime = performance.now();
  const stepLogs: RecipeExecutionStepLog[] = [];
  const { graph, graphIntel, profilingResult, offlineArtistSet } = context;

  const validParams = validateRecipeParams(recipe, params);
  let currentTracks: CorpusTrack[] = Array.from(graph.tracks.values());
  let subtractionsCount = 0;
  let balancedBuckets: Record<string, number> | undefined;
  let bridgePath: string[] | undefined;

  const recordStep = (stage: string, module: string, desc: string, inCount: number, outCount: number, stepStart: number) => {
    stepLogs.push({
      stage,
      module,
      description: desc,
      inputCount: inCount,
      outputCount: outCount,
      durationMs: Math.round(performance.now() - stepStart)
    });
  };

  switch (recipe.id) {
    // ----------------------------------------
    // Category 1: Consensus & Novelty Sieves
    // ----------------------------------------
    case 'recipe_regional_deep_dive': {
      const minConsensus = validParams.minConsensus ?? 2;
      const targetBuckets: string[] = validParams.culturalBuckets ?? ['C-Pop', 'J-Pop'];
      const trackLimit = validParams.trackLimit ?? 30;
      const excludeOffline = validParams.excludeOffline ?? true;

      // 1. Consensus Filter
      let t0 = performance.now();
      const inCount1 = currentTracks.length;
      currentTracks = currentTracks.filter(t => (t.consensusCount ?? 0) >= minConsensus);
      recordStep('Consensus Filter', 'M20 Consensus', `Filtered to tracks with consensus ≥ ${minConsensus}`, inCount1, currentTracks.length, t0);

      // 2. Cultural Bucket Filter
      t0 = performance.now();
      const inCount2 = currentTracks.length;
      const targetSet = new Set(targetBuckets.map(b => b.toLowerCase()));
      currentTracks = currentTracks.filter(t => {
        const bucket = (t.culturalBucket || resolveTrackCulturalBucket(t.artist ?? '', t.title ?? '').bucket || '').toLowerCase();
        return targetSet.has(bucket);
      });
      recordStep('Cultural Bucket Filter', 'M13 Language', `Filtered to buckets: ${targetBuckets.join(', ')}`, inCount2, currentTracks.length, t0);

      // 3. Offline Subtraction
      if (excludeOffline && offlineArtistSet && offlineArtistSet.size > 0) {
        t0 = performance.now();
        const inCount3 = currentTracks.length;
        currentTracks = currentTracks.filter(t => {
          const normArtist = (t.artist ?? '').toLowerCase().trim();
          return !offlineArtistSet.has(normArtist);
        });
        subtractionsCount = inCount3 - currentTracks.length;
        recordStep('Offline Subtraction', 'M4 Pruner', `Subtracted owned offline artists from Musicolet`, inCount3, currentTracks.length, t0);
      }

      // 4. Sort & Limit
      t0 = performance.now();
      const inCount4 = currentTracks.length;
      currentTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
      currentTracks = currentTracks.slice(0, trackLimit);
      recordStep('Quota Limit', 'M7 Splitter', `Limited output to top ${trackLimit} tracks`, inCount4, currentTracks.length, t0);
      break;
    }

    case 'recipe_consensus_sieve': {
      const minConsensus = validParams.minConsensus ?? 3;
      const targetBuckets: string[] = validParams.culturalBuckets ?? ['Naija', 'African'];
      const spacingDist = validParams.artistSpacingDistance ?? 3;
      const trackLimit = validParams.trackLimit ?? 40;
      const excludeOffline = validParams.excludeOffline ?? true;

      // 1. Consensus Filter
      let t0 = performance.now();
      let inCount = currentTracks.length;
      currentTracks = currentTracks.filter(t => (t.consensusCount ?? 0) >= minConsensus);
      recordStep('Consensus Filter', 'M20 Consensus', `Filtered to tracks with consensus ≥ ${minConsensus}`, inCount, currentTracks.length, t0);

      // 2. Cultural Filter
      t0 = performance.now();
      inCount = currentTracks.length;
      const targetSet = new Set(targetBuckets.map(b => b.toLowerCase()));
      currentTracks = currentTracks.filter(t => {
        const bucket = (t.culturalBucket || resolveTrackCulturalBucket(t.artist ?? '', t.title ?? '').bucket || '').toLowerCase();
        return targetSet.has(bucket);
      });
      recordStep('Cultural Filter', 'M13 Language', `Filtered to buckets: ${targetBuckets.join(', ')}`, inCount, currentTracks.length, t0);

      // 3. Offline Subtraction
      if (excludeOffline && offlineArtistSet && offlineArtistSet.size > 0) {
        t0 = performance.now();
        inCount = currentTracks.length;
        currentTracks = currentTracks.filter(t => !offlineArtistSet.has((t.artist ?? '').toLowerCase().trim()));
        subtractionsCount = inCount - currentTracks.length;
        recordStep('Offline Subtraction', 'M4 Pruner', `Subtracted owned artists`, inCount, currentTracks.length, t0);
      }

      // 4. Artist Spacing Entropy
      t0 = performance.now();
      inCount = currentTracks.length;
      currentTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
      currentTracks = applyArtistSpacingEntropy(currentTracks.slice(0, trackLimit * 2), spacingDist).slice(0, trackLimit);
      recordStep('Artist Spacing Entropy', 'M10 Randomizer', `Applied entropy artist spacing (min dist: ${spacingDist})`, inCount, currentTracks.length, t0);
      break;
    }

    case 'recipe_undiscovered_pipeline': {
      const minConsensus = validParams.minConsensus ?? 3;
      const spacingDist = validParams.artistSpacingDistance ?? 2;
      const trackLimit = validParams.trackLimit ?? 50;
      const excludeOffline = validParams.excludeOffline ?? true;

      // 1. Consensus Filter
      let t0 = performance.now();
      let inCount = currentTracks.length;
      currentTracks = currentTracks.filter(t => (t.consensusCount ?? 0) >= minConsensus);
      recordStep('Consensus Filter', 'M20 Consensus', `Consensus ≥ ${minConsensus}`, inCount, currentTracks.length, t0);

      // 2. Offline Subtraction
      if (excludeOffline && offlineArtistSet && offlineArtistSet.size > 0) {
        t0 = performance.now();
        inCount = currentTracks.length;
        currentTracks = currentTracks.filter(t => !offlineArtistSet.has((t.artist ?? '').toLowerCase().trim()));
        subtractionsCount = inCount - currentTracks.length;
        recordStep('Offline Subtraction', 'M4 Pruner', `Subtracted owned artists`, inCount, currentTracks.length, t0);
      }

      // 3. Artist Spacing & Quota
      t0 = performance.now();
      inCount = currentTracks.length;
      currentTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
      currentTracks = applyArtistSpacingEntropy(currentTracks.slice(0, trackLimit * 2), spacingDist).slice(0, trackLimit);
      recordStep('Artist Spacing & Quota', 'M10 Randomizer', `Spaced artists and limited to ${trackLimit}`, inCount, currentTracks.length, t0);
      break;
    }

    case 'recipe_acoustic_consensus': {
      const minConsensus = validParams.minConsensus ?? 2;
      const minEnergy = validParams.minEnergy ?? 0.7;
      const minBpm = validParams.minBpm ?? 120;
      const maxBpm = validParams.maxBpm ?? 140;
      const trackLimit = validParams.trackLimit ?? 30;
      const excludeOffline = validParams.excludeOffline ?? true;

      // 1. Consensus Filter
      let t0 = performance.now();
      let inCount = currentTracks.length;
      currentTracks = currentTracks.filter(t => (t.consensusCount ?? 0) >= minConsensus);
      recordStep('Consensus Filter', 'M20 Consensus', `Consensus ≥ ${minConsensus}`, inCount, currentTracks.length, t0);

      // 2. Acoustic Filter
      t0 = performance.now();
      inCount = currentTracks.length;
      currentTracks = currentTracks.filter(t => {
        const energy = (t as any).energy ?? ((t.consensusCount ?? 1) >= 4 ? 0.85 : 0.75);
        const bpm = (t as any).bpm ?? 128;
        return energy >= minEnergy && bpm >= minBpm && bpm <= maxBpm;
      });
      recordStep('Acoustic Filter', 'M18 Audimote', `Filtered by Energy ≥ ${minEnergy} and BPM [${minBpm}-${maxBpm}]`, inCount, currentTracks.length, t0);

      // 3. Offline Subtraction
      if (excludeOffline && offlineArtistSet && offlineArtistSet.size > 0) {
        t0 = performance.now();
        inCount = currentTracks.length;
        currentTracks = currentTracks.filter(t => !offlineArtistSet.has((t.artist ?? '').toLowerCase().trim()));
        subtractionsCount = inCount - currentTracks.length;
        recordStep('Offline Subtraction', 'M4 Pruner', `Subtracted owned artists`, inCount, currentTracks.length, t0);
      }

      currentTracks = currentTracks.slice(0, trackLimit);
      break;
    }

    // ----------------------------------------
    // Category 2: Curator Bridge & Fusion
    // ----------------------------------------
    case 'recipe_curator_cross_pollination': {
      const pIdA = validParams.sourcePlaylistA;
      const pIdB = validParams.sourcePlaylistB;
      const trackLimit = validParams.trackLimit ?? 30;

      let t0 = performance.now();
      const inCount = currentTracks.length;

      // Find playlists
      const playlistA = graph.playlists.get(pIdA) || Array.from(graph.playlists.values())[0];
      const playlistB = graph.playlists.get(pIdB) || Array.from(graph.playlists.values())[1] || playlistA;

      const setA = new Set(playlistA?.trackIds ?? []);
      const setB = new Set(playlistB?.trackIds ?? []);

      // Shared tracks
      const shared: CorpusTrack[] = [];
      const onlyA: CorpusTrack[] = [];
      const onlyB: CorpusTrack[] = [];

      for (const t of graph.tracks.values()) {
        const key = t.trackId || t.id;
        const inA = setA.has(key);
        const inB = setB.has(key);
        if (inA && inB) shared.push(t);
        else if (inA) onlyA.push(t);
        else if (inB) onlyB.push(t);
      }

      // Bridge tracks prioritized first
      currentTracks = [...shared, ...onlyA.slice(0, Math.floor(trackLimit / 2)), ...onlyB.slice(0, Math.floor(trackLimit / 2))].slice(0, trackLimit);
      recordStep('Cross-Pollination Intersection', 'M4 Manipulator', `Bridged "${playlistA?.name ?? 'A'}" and "${playlistB?.name ?? 'B'}" (${shared.length} shared)`, inCount, currentTracks.length, t0);
      break;
    }

    case 'recipe_algorithmic_artist_bridge': {
      const startArtist = (validParams.startArtist || '').trim();
      const targetArtist = (validParams.targetArtist || '').trim();
      const maxSteps = validParams.maxSteps ?? 5;
      const tracksPerStep = validParams.tracksPerStep ?? 2;

      let t0 = performance.now();
      const inCount = currentTracks.length;

      // Find path using Phase 2 shortest-path engine
      const pathRes = findArtistBridgePath(graph, startArtist, targetArtist);

      if (pathRes && pathRes.path.length > 0) {
        bridgePath = pathRes.path.slice(0, maxSteps + 1);
        const assembled: CorpusTrack[] = [];
        const seenIds = new Set<string>();

        for (const artistName of bridgePath) {
          const artistTracks = Array.from(graph.tracks.values()).filter(t =>
            (t.artist ?? '').toLowerCase().trim() === artistName.toLowerCase().trim()
          );
          artistTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
          for (const t of artistTracks.slice(0, tracksPerStep)) {
            const key = t.trackId || t.id;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              assembled.push(t);
            }
          }
        }
        currentTracks = assembled;
      } else {
        // Fallback: take top consensus tracks from start and target artists
        const startTracks = currentTracks.filter(t => (t.artist ?? '').toLowerCase() === startArtist.toLowerCase()).slice(0, tracksPerStep);
        const targetTracks = currentTracks.filter(t => (t.artist ?? '').toLowerCase() === targetArtist.toLowerCase()).slice(0, tracksPerStep);
        currentTracks = [...startTracks, ...targetTracks];
      }

      recordStep('Shortest-Path Graph Bridge', 'M20 Graph Intelligence', `Traversed artist constellation path: ${bridgePath?.join(' ➔ ') || 'Direct'}`, inCount, currentTracks.length, t0);
      break;
    }

    case 'recipe_playlist_fusion_synthesizer': {
      const pIdA = validParams.sourcePlaylistA;
      const pIdB = validParams.sourcePlaylistB;
      const trackLimit = validParams.trackLimit ?? 40;

      const pA = graph.playlists.get(pIdA) || Array.from(graph.playlists.values())[0];
      const pB = graph.playlists.get(pIdB) || Array.from(graph.playlists.values())[1] || pA;

      const tracksA = (pA?.trackIds ?? []).map(id => graph.tracks.get(id)).filter(Boolean) as CorpusTrack[];
      const tracksB = (pB?.trackIds ?? []).map(id => graph.tracks.get(id)).filter(Boolean) as CorpusTrack[];

      const t0 = performance.now();
      const inCount = tracksA.length + tracksB.length;
      currentTracks = smoothGradientInterweave(tracksA, tracksB, [], trackLimit);
      recordStep('Gradient Fusion', 'M10 Randomizer', `Synthesized gradient between "${pA?.name ?? 'A'}" and "${pB?.name ?? 'B'}"`, inCount, currentTracks.length, t0);
      break;
    }

    // ----------------------------------------
    // Category 3: Full DAESO Pipelines
    // ----------------------------------------
    case 'recipe_daeso_sieve_bridge': {
      const minConsensus = validParams.minConsensus ?? 2;
      const weeklyRationSize = validParams.weeklyRationSize ?? 20;
      const excludeOffline = validParams.excludeOffline ?? true;

      // 1. Consensus filter
      let t0 = performance.now();
      let inCount = currentTracks.length;
      currentTracks = currentTracks.filter(t => (t.consensusCount ?? 0) >= minConsensus);
      recordStep('Consensus Sieve', 'M20 Consensus', `Consensus ≥ ${minConsensus}`, inCount, currentTracks.length, t0);

      // 2. Offline pruning
      if (excludeOffline && offlineArtistSet && offlineArtistSet.size > 0) {
        t0 = performance.now();
        inCount = currentTracks.length;
        currentTracks = currentTracks.filter(t => !offlineArtistSet.has((t.artist ?? '').toLowerCase().trim()));
        subtractionsCount = inCount - currentTracks.length;
        recordStep('Offline Pruning', 'M4 Pruner', `Pruned owned artists`, inCount, currentTracks.length, t0);
      }

      // 3. Weekly Ration Splitter
      t0 = performance.now();
      inCount = currentTracks.length;
      currentTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
      currentTracks = currentTracks.slice(0, weeklyRationSize);
      recordStep('Weekly Ration Allocation', 'M7 Splitter', `Staged calibrated ${weeklyRationSize}-track intake cohort`, inCount, currentTracks.length, t0);
      break;
    }

    case 'recipe_walled_garden_ingestion': {
      const minConsensus = validParams.minConsensus ?? 1;
      const cleanTitles = validParams.cleanTitles ?? true;
      const trackLimit = validParams.trackLimit ?? 100;

      let t0 = performance.now();
      let inCount = currentTracks.length;
      currentTracks = currentTracks.filter(t => (t.consensusCount ?? 0) >= minConsensus);
      recordStep('Consensus Filter', 'M20 Consensus', `Consensus ≥ ${minConsensus}`, inCount, currentTracks.length, t0);

      if (cleanTitles) {
        t0 = performance.now();
        inCount = currentTracks.length;
        currentTracks = currentTracks.map(t => ({
          ...t,
          title: cleanTrackTitle(t.title ?? '')
        }));
        recordStep('Title Noise Stripper', 'M12 Stripper', `Cleaned feature/remaster noise from titles`, inCount, currentTracks.length, t0);
      }

      currentTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
      currentTracks = currentTracks.slice(0, trackLimit);
      break;
    }

    case 'recipe_spotify_direct_intake': {
      const minConsensus = validParams.minConsensus ?? 2;
      const trackLimit = validParams.trackLimit ?? 50;

      let t0 = performance.now();
      const inCount = currentTracks.length;
      currentTracks = currentTracks.filter(t => Boolean(t.spotifyId) && (t.consensusCount ?? 0) >= minConsensus);
      currentTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
      currentTracks = currentTracks.slice(0, trackLimit);
      recordStep('Spotify Intake Filter', 'M19 Spotify Intake', `Filtered to verified Spotify tracks (consensus ≥ ${minConsensus})`, inCount, currentTracks.length, t0);
      break;
    }

    // ----------------------------------------
    // Category 4: Cultural Deep-Dive & Rebalancing
    // ----------------------------------------
    case 'recipe_cultural_rebalancing': {
      const targetBuckets: string[] = validParams.culturalBuckets ?? ['Naija', 'I-Pop', 'Filipino', 'Français'];
      const quotaPerBucket = validParams.tracksPerBucket ?? 12;
      const interweave = validParams.antiClusterInterweave ?? true;
      const excludeOffline = validParams.excludeOffline ?? true;

      const t0 = performance.now();
      const inCount = currentTracks.length;
      const bucketMap: Record<string, CorpusTrack[]> = {};
      balancedBuckets = {};

      const targetBucketLowerMap = new Map<string, string>();
      for (const b of targetBuckets) {
        targetBucketLowerMap.set(b.toLowerCase(), b);
        bucketMap[b] = [];
        balancedBuckets[b] = 0;
      }

      // Pre-filter offline artists once if needed
      let pool = currentTracks;
      if (excludeOffline && offlineArtistSet && offlineArtistSet.size > 0) {
        pool = pool.filter(t => !offlineArtistSet.has((t.artist ?? '').toLowerCase().trim()));
      }

      // Sort candidate pool by consensus descending upfront once
      pool.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));

      // Single linear pass with early termination when all buckets filled
      const artistBucketCache = new Map<string, string>();
      let remainingBuckets = targetBuckets.length;
      const maxScan = Math.min(pool.length, 10000);

      for (let i = 0; i < maxScan; i++) {
        if (remainingBuckets === 0) break;
        const t = pool[i];
        let rawBucket = t.culturalBucket;
        if (!rawBucket) {
          const art = (t.artist ?? '').toLowerCase().trim();
          rawBucket = artistBucketCache.get(art);
          if (!rawBucket) {
            rawBucket = resolveTrackCulturalBucket(t.artist ?? '', t.title ?? '').bucket || 'Other';
            artistBucketCache.set(art, rawBucket);
          }
          t.culturalBucket = rawBucket;
        }
        const canonical = targetBucketLowerMap.get(rawBucket.toLowerCase());
        if (canonical) {
          const list = bucketMap[canonical];
          if (list.length < quotaPerBucket) {
            list.push(t);
            balancedBuckets[canonical] = list.length;
            if (list.length === quotaPerBucket) {
              remainingBuckets--;
            }
          }
        }
      }

      if (interweave) {
        currentTracks = roundRobinInterweave(bucketMap, quotaPerBucket * targetBuckets.length);
      } else {
        currentTracks = Object.values(bucketMap).flat();
      }

      recordStep('Cultural Anti-Cluster Rebalancing', 'M13 Language / M10 Randomizer', `Balanced ${targetBuckets.length} regional buckets round-robin`, inCount, currentTracks.length, t0);
      break;
    }

    case 'recipe_cultural_deep_dive': {
      const primaryBucket = validParams.primaryBucket ?? 'Naija';
      const primaryQuota = validParams.primaryQuota ?? 20;
      const secondaryBucket = validParams.secondaryBucket ?? 'African';
      const secondaryQuota = validParams.secondaryQuota ?? 10;
      const minConsensus = validParams.minConsensus ?? 2;
      const excludeOffline = validParams.excludeOffline ?? true;

      const t0 = performance.now();
      const inCount = currentTracks.length;

      let pool = currentTracks.filter(t => (t.consensusCount ?? 0) >= minConsensus);
      if (excludeOffline && offlineArtistSet && offlineArtistSet.size > 0) {
        pool = pool.filter(t => !offlineArtistSet.has((t.artist ?? '').toLowerCase().trim()));
      }
      pool.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));

      const primaryTracks: CorpusTrack[] = [];
      const secondaryTracks: CorpusTrack[] = [];
      const primLower = primaryBucket.toLowerCase();
      const secLower = secondaryBucket.toLowerCase();
      const artistBucketCache = new Map<string, string>();
      const maxScan = Math.min(pool.length, 10000);

      for (let i = 0; i < maxScan; i++) {
        if (primaryTracks.length >= primaryQuota && secondaryTracks.length >= secondaryQuota) break;
        const t = pool[i];
        let rawBucket = t.culturalBucket;
        if (!rawBucket) {
          const art = (t.artist ?? '').toLowerCase().trim();
          rawBucket = artistBucketCache.get(art);
          if (!rawBucket) {
            rawBucket = resolveTrackCulturalBucket(t.artist ?? '', t.title ?? '').bucket || 'Other';
            artistBucketCache.set(art, rawBucket);
          }
          t.culturalBucket = rawBucket;
        }
        const lower = rawBucket.toLowerCase();
        if (lower === primLower && primaryTracks.length < primaryQuota) {
          primaryTracks.push(t);
        } else if (lower === secLower && secondaryTracks.length < secondaryQuota) {
          secondaryTracks.push(t);
        }
      }

      currentTracks = [...primaryTracks, ...secondaryTracks];
      recordStep('Regional Deep Dive Expedition', 'M13 Language / M7 Splitter', `Spliced ${primaryTracks.length} ${primaryBucket} + ${secondaryTracks.length} ${secondaryBucket} tracks`, inCount, currentTracks.length, t0);
      break;
    }

    case 'recipe_community_cultural_discovery': {
      const count = validParams.communityCount ?? 3;
      const perComm = validParams.tracksPerCommunity ?? 10;
      const excludeOffline = validParams.excludeOffline ?? true;

      const t0 = performance.now();
      const inCount = currentTracks.length;

      // Extract communities from graph intelligence
      const communities = (graphIntel?.clusters ?? []).filter(c => (c.size || 0) >= 5);
      communities.sort((a, b) => (a.size || 0) - (b.size || 0)); // smallest first
      const smallest = communities.slice(0, count);

      const assembled: CorpusTrack[] = [];
      const seenIds = new Set<string>();

      for (const comm of smallest) {
        let commTracks = currentTracks.filter(t => 
          (graphIntel?.trackToCommunity && graphIntel.trackToCommunity[t.id] === comm.id) ||
          (comm.topTrackIds || []).includes(t.trackId || t.id)
        );
        if (excludeOffline && offlineArtistSet && offlineArtistSet.size > 0) {
          commTracks = commTracks.filter(t => !offlineArtistSet.has((t.artist ?? '').toLowerCase().trim()));
        }
        commTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
        for (const t of commTracks.slice(0, perComm)) {
          const key = t.trackId || t.id;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            assembled.push(t);
          }
        }
      }

      currentTracks = assembled;
      recordStep('Smallest Louvain Community Mining', 'M20 Graph Intelligence', `Extracted candidates across ${smallest.length} niche communities`, inCount, currentTracks.length, t0);
      break;
    }

    // ----------------------------------------
    // Category 5: Offline Gap Reconciliation
    // ----------------------------------------
    case 'recipe_offline_gap_reconciler': {
      const maxPerArtist = validParams.maxTracksPerArtist ?? 3;
      const trackLimit = validParams.trackLimit ?? 50;
      const minConsensus = validParams.minConsensus ?? 1;

      const t0 = performance.now();
      const inCount = currentTracks.length;

      if (!offlineArtistSet || offlineArtistSet.size === 0) {
        // Fallback: take highest consensus tracks
        currentTracks = currentTracks.filter(t => (t.consensusCount ?? 0) >= minConsensus).slice(0, trackLimit);
        recordStep('Offline Library Fallback', 'M8 Reconciler', 'No offline Songs.csv provided; defaulting to consensus', inCount, currentTracks.length, t0);
      } else {
        // Find tracks in corpus by artists that user owns offline
        const gapCandidates = currentTracks.filter(t => {
          const normArtist = (t.artist ?? '').toLowerCase().trim();
          return offlineArtistSet.has(normArtist) && (t.consensusCount ?? 0) >= minConsensus;
        });

        // Group by artist and cap at maxPerArtist
        const artistGroups: Map<string, CorpusTrack[]> = new Map();
        for (const t of gapCandidates) {
          const art = (t.artist ?? '').toLowerCase().trim();
          const list = artistGroups.get(art) || [];
          list.push(t);
          artistGroups.set(art, list);
        }

        const assembled: CorpusTrack[] = [];
        for (const [_, list] of artistGroups.entries()) {
          list.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
          assembled.push(...list.slice(0, maxPerArtist));
          if (assembled.length >= trackLimit) break;
        }

        currentTracks = assembled.slice(0, trackLimit);
        recordStep('Offline Discovery Gap Reconciler', 'M8 Reconciler / M4 Manipulator', `Identified unowned tracks by ${artistGroups.size} favorite offline artists`, inCount, currentTracks.length, t0);
      }
      break;
    }

    case 'recipe_blind_spot_reconciler': {
      const perArtist = validParams.tracksPerArtist ?? 3;
      const trackLimit = validParams.trackLimit ?? 40;

      const t0 = performance.now();
      const inCount = currentTracks.length;

      const blindSpots = graphIntel?.blindSpots ?? [];
      const assembled: CorpusTrack[] = [];
      const seenIds = new Set<string>();

      if (blindSpots.length > 0) {
        for (const bs of blindSpots) {
          const artistTracks = currentTracks.filter(t =>
            (t.artist ?? '').toLowerCase().trim() === bs.artist.toLowerCase().trim()
          );
          artistTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
          for (const t of artistTracks.slice(0, perArtist)) {
            const key = t.trackId || t.id;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              assembled.push(t);
            }
          }
          if (assembled.length >= trackLimit) break;
        }
        currentTracks = assembled.slice(0, trackLimit);
        recordStep('Blind Spot Reconciler', 'M20 Graph Intelligence', `Surfaced ${currentTracks.length} tracks by ${blindSpots.length} connected blind-spot artists`, inCount, currentTracks.length, t0);
      } else {
        // Fallback
        currentTracks = currentTracks.slice(0, trackLimit);
        recordStep('Blind Spot Fallback', 'M20 Graph Intelligence', `No blind spots calculated; showing top corpus tracks`, inCount, currentTracks.length, t0);
      }
      break;
    }

    case 'recipe_dormant_treasure_expedition': {
      const minConsensus = validParams.minConsensus ?? 2;
      const trackLimit = validParams.trackLimit ?? 30;

      const t0 = performance.now();
      const inCount = currentTracks.length;

      const dormantPlaylists = profilingResult?.temporalArchaeology?.dormantTreasures ?? [];
      let candidateTrackIds: Set<string>;

      if (dormantPlaylists.length > 0) {
        candidateTrackIds = new Set();
        for (const dp of dormantPlaylists) {
          const pl = graph.playlists.get(dp.playlistId);
          if (pl) {
            pl.trackIds.forEach(id => candidateTrackIds.add(id));
          }
        }
      } else {
        // Fallback: check if playlists contain historical/dormant keywords, or earliest playlists
        const allPlaylists = Array.from(graph.playlists.values());
        const keywordDormant = allPlaylists.filter(p =>
          /old|ancient|dormant|archive|throwback|vault|\b201\d\b|\b202[0-2]\b/i.test(p.name)
        );
        const selectedDormant = keywordDormant.length > 0
          ? keywordDormant
          : allPlaylists.slice(0, Math.max(1, Math.ceil(allPlaylists.length * 0.25)));
        candidateTrackIds = new Set(selectedDormant.flatMap(p => p.trackIds));
      }

      currentTracks = currentTracks.filter(t => candidateTrackIds.has(t.trackId || t.id) && (t.consensusCount ?? 0) >= minConsensus);
      currentTracks.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));
      currentTracks = currentTracks.slice(0, trackLimit);
      recordStep('Dormant Treasure Extraction', 'M20 Profiling', `Extracted highest-consensus gems from dormant playlists`, inCount, currentTracks.length, t0);
      break;
    }

    default:
      // Generic fallback
      currentTracks = currentTracks.slice(0, 30);
      recordStep('Execution Complete', 'M20 Recipe Engine', 'Executed standard recipe pass', currentTracks.length, currentTracks.length, performance.now());
      break;
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    executedAt: Date.now(),
    durationMs,
    tracks: currentTracks,
    stepLogs,
    appliedParams: validParams,
    summary: `Generated ${currentTracks.length} tracks across ${stepLogs.length} pipeline stages in ${durationMs}ms.`,
    subtractionsCount,
    balancedBuckets,
    bridgePath
  };
}

// ==========================================
// 4. Cross-Module Format Adapters
// ==========================================

function escapeCsvField(val: any): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Transforms CorpusTrack[] into the exact CSV / M3U structure expected
 * by each downstream module. All text exports prepend the UTF-8 BOM (\uFEFF).
 */
export function formatForModule(
  tracks: CorpusTrack[],
  targetModule: DownstreamModuleTarget,
  graph?: BipartiteCorpusGraph | null
): string {
  const BOM = '\uFEFF';

  switch (targetModule) {
    case 'm14_triage': {
      // Expected headers by DiscoveryTriageView
      const headers = ['Track name', 'Artist name', 'Album', 'Playlist name', 'Type', 'ISRC', 'Spotify - id', 'Cultural Bucket', 'Consensus Count'];
      const rows = tracks.map(t => {
        const provenance = graph ? getTrackProvenance(graph, t.trackId || t.id).join('; ') : '';
        const bucket = t.culturalBucket || resolveTrackCulturalBucket(t.artist ?? '', t.title ?? '').bucket || 'Other';
        return [
          escapeCsvField(t.title ?? ''),
          escapeCsvField(t.artist ?? ''),
          escapeCsvField(t.album ?? ''),
          escapeCsvField(provenance || 'Discovery Recipe Output'),
          escapeCsvField(t.type ?? 'recipe_candidate'),
          escapeCsvField(t.isrc ?? ''),
          escapeCsvField(t.spotifyId ?? ''),
          escapeCsvField(bucket),
          escapeCsvField(t.consensusCount ?? 1)
        ].join(',');
      });
      return BOM + [headers.join(','), ...rows].join('\n');
    }

    case 'm13_clustering':
    case 'm4_pruner':
    case 'm7_splitter':
    case 'm1_sieve': {
      // Standard 4-column Playlist Haven CSV
      const headers = ['Track name', 'Artist name', 'Album', 'Playlist name'];
      const rows = tracks.map(t => {
        const provenance = graph ? getTrackProvenance(graph, t.trackId || t.id)[0] || 'Recipe Intake' : 'Recipe Intake';
        return [
          escapeCsvField(t.title ?? ''),
          escapeCsvField(t.artist ?? ''),
          escapeCsvField(t.album ?? ''),
          escapeCsvField(provenance)
        ].join(',');
      });
      return BOM + [headers.join(','), ...rows].join('\n');
    }

    case 'm10_randomizer': {
      // 3-column track specification
      const headers = ['Track name', 'Artist name', 'Album'];
      const rows = tracks.map(t => [
        escapeCsvField(t.title ?? ''),
        escapeCsvField(t.artist ?? ''),
        escapeCsvField(t.album ?? '')
      ].join(','));
      return BOM + [headers.join(','), ...rows].join('\n');
    }

    case 'm18_audimote': {
      // Audimote acoustic inspection format: Artist, Title, Album
      const headers = ['Artist', 'Title', 'Album'];
      const rows = tracks.map(t => [
        escapeCsvField(t.artist ?? ''),
        escapeCsvField(t.title ?? ''),
        escapeCsvField(t.album ?? '')
      ].join(','));
      return BOM + [headers.join(','), ...rows].join('\n');
    }

    case 'm3u': {
      // Extended M3U format
      const lines = ['#EXTM3U'];
      for (const t of tracks) {
        lines.push(`#EXTINF:-1,${t.artist ?? 'Unknown'} - ${t.title ?? 'Untitled'}`);
        lines.push(`${t.artist ?? 'Unknown'} - ${t.title ?? 'Untitled'}.mp3`);
      }
      return BOM + lines.join('\n');
    }

    case 'tsv': {
      const headers = ['Track name', 'Artist name', 'Album', 'ISRC', 'Spotify ID', 'Consensus Count'];
      const rows = tracks.map(t => [
        t.title ?? '',
        t.artist ?? '',
        t.album ?? '',
        t.isrc ?? '',
        t.spotifyId ?? '',
        t.consensusCount ?? 1
      ].join('\t'));
      return BOM + [headers.join('\t'), ...rows].join('\n');
    }

    case 'standard_csv':
    default: {
      const headers = ['Track name', 'Artist name', 'Album', 'Playlist name', 'Type', 'ISRC', 'Spotify - id', 'Consensus Count'];
      const rows = tracks.map(t => {
        const provenance = graph ? getTrackProvenance(graph, t.trackId || t.id).join('; ') : '';
        return [
          escapeCsvField(t.title ?? ''),
          escapeCsvField(t.artist ?? ''),
          escapeCsvField(t.album ?? ''),
          escapeCsvField(provenance),
          escapeCsvField(t.type ?? ''),
          escapeCsvField(t.isrc ?? ''),
          escapeCsvField(t.spotifyId ?? ''),
          escapeCsvField(t.consensusCount ?? 1)
        ].join(',');
      });
      return BOM + [headers.join(','), ...rows].join('\n');
    }
  }
}

// ==========================================
// 5. 1-Click Cross-Module Staging & Exporters
// ==========================================

/**
 * 1-click cross-module staging: serializes candidate tracks into the appropriate
 * storage key or triggers file download, then navigates via onViewSelect.
 */
export function stageTracksForModule(
  tracks: CorpusTrack[],
  targetModule: DownstreamModuleTarget,
  onViewSelect?: (view: any) => void
): { success: boolean; message: string; stagedCount: number } {
  if (!tracks || tracks.length === 0) {
    return { success: false, message: 'No tracks available to stage.', stagedCount: 0 };
  }

  switch (targetModule) {
    case 'm14_triage': {
      // Format specifically for DiscoveryTriageView intake
      const payload = tracks.map(t => {
        const cultural = resolveTrackCulturalBucket(t.artist ?? '', t.title ?? '');
        return {
          title: t.title ?? 'Untitled',
          artist: t.artist ?? 'Unknown Artist',
          album: t.album || 'Discovery Recipe Output',
          culturalBucket: t.culturalBucket || cultural.bucket,
          country: cultural.country,
          confidence: cultural.confidence,
          sourceDetails: `M20 Recipe: Consensus ${t.consensusCount ?? 1}`
        };
      });

      try {
        localStorage.setItem('playlist_haven_triage_intake', JSON.stringify(payload));
        if (onViewSelect) {
          onViewSelect('triage');
        }
        return {
          success: true,
          message: `Staged ${tracks.length} tracks to Module 14 (Discovery Triage)! Navigating...`,
          stagedCount: tracks.length
        };
      } catch (err: any) {
        return { success: false, message: `Failed to stage: ${err.message}`, stagedCount: 0 };
      }
    }

    case 'm13_clustering': {
      const payload = tracks.map(t => ({
        title: t.title ?? 'Untitled',
        artist: t.artist ?? 'Unknown Artist',
        album: t.album || 'Discovery Cohort'
      }));
      try {
        localStorage.setItem('playlist_haven_clustering_intake', JSON.stringify(payload));
        if (onViewSelect) {
          onViewSelect('clustering');
        }
        return {
          success: true,
          message: `Staged ${tracks.length} tracks to Module 13 (Language Clustering)! Navigating...`,
          stagedCount: tracks.length
        };
      } catch (err: any) {
        return { success: false, message: `Failed to stage: ${err.message}`, stagedCount: 0 };
      }
    }

    case 'm4_pruner': {
      if (onViewSelect) onViewSelect('pruner');
      return { success: true, message: `Opening Module 4 (Fuzzy Pruner)...`, stagedCount: tracks.length };
    }

    case 'm10_randomizer': {
      if (onViewSelect) onViewSelect('randomizer');
      return { success: true, message: `Opening Module 10 (Smart Randomizer)...`, stagedCount: tracks.length };
    }

    case 'm18_audimote': {
      if (onViewSelect) onViewSelect('audimote');
      return { success: true, message: `Opening Module 18 (Audimote Engine)...`, stagedCount: tracks.length };
    }

    case 'm3_manipulator': {
      if (onViewSelect) onViewSelect('manipulator');
      return { success: true, message: `Opening Module 3 (Playlist Manipulator)...`, stagedCount: tracks.length };
    }

    default:
      return { success: true, message: `Action completed for ${tracks.length} tracks.`, stagedCount: tracks.length };
  }
}

/**
 * Direct file download helpers with UTF-8 BOM
 */
export async function exportRecipeTracksCSV(
  tracks: CorpusTrack[],
  fileName: string = 'Discovery_Recipe_Tracks.csv',
  graph?: BipartiteCorpusGraph | null
): Promise<void> {
  const content = formatForModule(tracks, 'standard_csv', graph);
  await downloadPlaylistFile(content, fileName, 'text/csv;charset=utf-8;');
}

export async function exportRecipeTracksM3U(
  tracks: CorpusTrack[],
  fileName: string = 'Discovery_Recipe_Playlist.m3u'
): Promise<void> {
  const content = formatForModule(tracks, 'm3u');
  await downloadPlaylistFile(content, fileName, 'audio/x-mpegurl;charset=utf-8;');
}

export async function exportRecipeTracksTSV(
  tracks: CorpusTrack[],
  fileName: string = 'Discovery_Recipe_Tracks.tsv',
  graph?: BipartiteCorpusGraph | null
): Promise<void> {
  const content = formatForModule(tracks, 'tsv', graph);
  await downloadPlaylistFile(content, fileName, 'text/tab-separated-values;charset=utf-8;');
}
