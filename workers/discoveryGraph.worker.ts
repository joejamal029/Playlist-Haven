/// <reference lib="webworker" />
/**
 * Module 20: Graph Intelligence Web Worker
 * 
 * Offloads heavy graph operations (Sparse Jaccard, Louvain Community Detection, Artist Constellation)
 * to a background worker thread to ensure 60 FPS UI responsiveness.
 */

import { BipartiteCorpusGraph, GraphIntelligenceResult, CorpusPlaylist, CorpusTrack } from '../types';
import { computeGraphIntelligence } from '../services/discoveryGraphEngine';

export interface GraphWorkerRequest {
  type: 'COMPUTE_GRAPH_INTEL';
  graph: {
    playlists: [string, CorpusPlaylist][] | Map<string, CorpusPlaylist>;
    tracks: [string, CorpusTrack][] | Map<string, CorpusTrack>;
    artistToTrackIds: [string, string[]][] | Map<string, string[]>;
    stats: any;
    config: any;
    rawRowsCount: number;
  };
}

export type GraphWorkerMessage =
  | { type: 'PROGRESS'; percent: number; stage: string }
  | { type: 'COMPLETE'; result: GraphIntelligenceResult }
  | { type: 'ERROR'; error: string };

self.onmessage = (e: MessageEvent<GraphWorkerRequest>) => {
  const { type, graph: rawGraph } = e.data;

  if (type === 'COMPUTE_GRAPH_INTEL') {
    try {
      // Defensive reconstruction of Maps if transferred as entries
      const playlists = rawGraph.playlists instanceof Map
        ? rawGraph.playlists
        : new Map<string, CorpusPlaylist>(rawGraph.playlists);

      const tracks = rawGraph.tracks instanceof Map
        ? rawGraph.tracks
        : new Map<string, CorpusTrack>(rawGraph.tracks);

      const artistToTrackIds = rawGraph.artistToTrackIds instanceof Map
        ? rawGraph.artistToTrackIds
        : new Map<string, string[]>(rawGraph.artistToTrackIds);

      const reconstitutedGraph: BipartiteCorpusGraph = {
        playlists,
        tracks,
        artistToTrackIds,
        stats: rawGraph.stats,
        config: rawGraph.config,
        rawRowsCount: rawGraph.rawRowsCount,
      };

      const result = computeGraphIntelligence(
        reconstitutedGraph,
        (percent, stage) => {
          self.postMessage({ type: 'PROGRESS', percent, stage });
        }
      );

      self.postMessage({ type: 'COMPLETE', result });
    } catch (err: any) {
      console.error('[discoveryGraph.worker] Error computing graph intelligence:', err);
      self.postMessage({ type: 'ERROR', error: err?.message || 'Graph intelligence calculation failed' });
    }
  }
};
