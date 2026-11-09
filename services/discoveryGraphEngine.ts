/**
 * Module 20: Discovery Graph Intelligence Engine (Phase 2)
 * 
 * Provides 100% client-side graph theory algorithms:
 * 1. Sparse Jaccard Playlist Similarity Matrix
 * 2. Artist Constellation Co-Occurrence Network
 * 3. Deterministic Louvain Community Detection
 * 4. Shortest-Path Aesthetic Bridge (BFS on Artist Graph)
 * 5. Musicolet Offline Blind Spot Finder
 */

import {
  BipartiteCorpusGraph,
  CorpusPlaylist,
  CorpusTrack,
  JaccardPair,
  CommunityCluster,
  ArtistConstellationNode,
  ArtistBridgeHop,
  ArtistBridgePath,
  BlindSpotArtist,
  GraphIntelligenceResult,
  OfflineSongRecord,
  MusicoletLibraryPayload,
} from '../types';
import { normalizeForMatch } from './discoveryCorpusEngine';

// ==============================================================================
// 1. Sparse Jaccard Playlist Similarity Matrix
// ==============================================================================

/**
 * Computes sparse pairwise Jaccard similarity across all playlists sharing >= minSharedTracks.
 * Uses an inverted index to skip zero-overlap pairs ($O(T \cdot k^2)$ instead of $O(P^2 \cdot T)$).
 */
export function computeSparsePlaylistJaccard(
  graph: BipartiteCorpusGraph,
  minSharedTracks: number = 1,
  minJaccard: number = 0.01
): JaccardPair[] {
  // 1. Inverted index: Track ID -> List of Playlist IDs
  // We can leverage track.playlistIds directly from the graph
  const intersectionMap = new Map<string, Map<string, number>>();

  graph.tracks.forEach(track => {
    const pids = track.playlistIds;
    if (pids.length < 2) return;

    // For all pairs in this track's playlist list
    for (let i = 0; i < pids.length; i++) {
      const pA = pids[i];
      let rowA = intersectionMap.get(pA);
      if (!rowA) {
        rowA = new Map<string, number>();
        intersectionMap.set(pA, rowA);
      }

      for (let j = i + 1; j < pids.length; j++) {
        const pB = pids[j];
        // Enforce ordering to avoid duplicate symmetric pairs: pA < pB
        const [first, second] = pA < pB ? [pA, pB] : [pB, pA];
        
        let targetRow = intersectionMap.get(first);
        if (!targetRow) {
          targetRow = new Map<string, number>();
          intersectionMap.set(first, targetRow);
        }
        targetRow.set(second, (targetRow.get(second) || 0) + 1);
      }
    }
  });

  const pairs: JaccardPair[] = [];

  intersectionMap.forEach((innerMap, pAId) => {
    const plA = graph.playlists.get(pAId);
    if (!plA) return;
    const sizeA = plA.trackCount;
    if (sizeA === 0) return;

    innerMap.forEach((shared, pBId) => {
      if (shared < minSharedTracks) return;
      const plB = graph.playlists.get(pBId);
      if (!plB) return;
      const sizeB = plB.trackCount;
      if (sizeB === 0) return;

      const union = sizeA + sizeB - shared;
      if (union <= 0) return;

      const jaccardIndex = shared / union;
      if (jaccardIndex >= minJaccard) {
        pairs.push({
          playlistAId: pAId,
          playlistAName: plA.name,
          playlistBId: pBId,
          playlistBName: plB.name,
          sharedTracks: shared,
          jaccardIndex: Number(jaccardIndex.toFixed(4)),
        });
      }
    });
  });

  // Sort descending by Jaccard Index, then by shared tracks
  return pairs.sort((a, b) => b.jaccardIndex - a.jaccardIndex || b.sharedTracks - a.sharedTracks);
}

/**
 * Returns playlists most similar to a specific target playlist.
 */
export function getSimilarPlaylists(
  targetPlaylistId: string,
  pairs: JaccardPair[],
  limit: number = 10
): { playlistId: string; playlistName: string; sharedTracks: number; jaccardIndex: number }[] {
  const matches: { playlistId: string; playlistName: string; sharedTracks: number; jaccardIndex: number }[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (p.playlistAId === targetPlaylistId) {
      matches.push({
        playlistId: p.playlistBId,
        playlistName: p.playlistBName,
        sharedTracks: p.sharedTracks,
        jaccardIndex: p.jaccardIndex,
      });
    } else if (p.playlistBId === targetPlaylistId) {
      matches.push({
        playlistId: p.playlistAId,
        playlistName: p.playlistAName,
        sharedTracks: p.sharedTracks,
        jaccardIndex: p.jaccardIndex,
      });
    }
    if (matches.length >= limit * 2) break; // early exit
  }

  matches.sort((a, b) => b.jaccardIndex - a.jaccardIndex || b.sharedTracks - a.sharedTracks);
  return matches.slice(0, limit);
}

// ==============================================================================
// 2. Artist Constellation Co-Occurrence Network
// ==============================================================================

export interface ArtistGraphData {
  nodes: ArtistConstellationNode[];
  edgeMap: Map<string, Map<string, number>>; // normalized artist -> (normalized peer -> weight)
  displayArtistMap: Map<string, string>;     // normalized artist -> clean display name
}

/**
 * Builds the artist-level co-occurrence projection from the bipartite graph.
 * Artists co-occurring in the same playlist receive weighted edges.
 */
export function buildArtistConstellation(graph: BipartiteCorpusGraph): ArtistGraphData {
  const edgeMap = new Map<string, Map<string, number>>();
  const artistTrackCount = new Map<string, number>();
  const artistPlaylistSet = new Map<string, Set<string>>();
  const displayArtistMap = new Map<string, string>();

  // Count tracks per normalized artist
  graph.tracks.forEach(track => {
    const norm = normalizeForMatch(track.artist);
    if (!norm) return;
    if (!displayArtistMap.has(norm)) {
      displayArtistMap.set(norm, track.artist);
    }
    artistTrackCount.set(norm, (artistTrackCount.get(norm) || 0) + 1);
  });

  // Track playlist co-occurrence
  graph.playlists.forEach(playlist => {
    // Collect unique artists in this playlist
    const artistsInPlaylist = new Set<string>();
    playlist.trackIds.forEach(tid => {
      const track = graph.tracks.get(tid);
      if (track) {
        const norm = normalizeForMatch(track.artist);
        if (norm) {
          artistsInPlaylist.add(norm);
          let pSet = artistPlaylistSet.get(norm);
          if (!pSet) {
            pSet = new Set<string>();
            artistPlaylistSet.set(norm, pSet);
          }
          pSet.add(playlist.id);
        }
      }
    });

    const artistList = Array.from(artistsInPlaylist);
    if (artistList.length < 2) return;

    // Co-occurrence pairs within this playlist
    for (let i = 0; i < artistList.length; i++) {
      const a1 = artistList[i];
      let row1 = edgeMap.get(a1);
      if (!row1) {
        row1 = new Map<string, number>();
        edgeMap.set(a1, row1);
      }

      for (let j = i + 1; j < artistList.length; j++) {
        const a2 = artistList[j];
        let row2 = edgeMap.get(a2);
        if (!row2) {
          row2 = new Map<string, number>();
          edgeMap.set(a2, row2);
        }

        row1.set(a2, (row1.get(a2) || 0) + 1);
        row2.set(a1, (row2.get(a1) || 0) + 1);
      }
    }
  });

  // Build ArtistConstellationNode list
  const nodes: ArtistConstellationNode[] = [];

  artistTrackCount.forEach((tCount, normArtist) => {
    const pCount = artistPlaylistSet.get(normArtist)?.size || 0;
    const neighbors = edgeMap.get(normArtist);
    const degree = neighbors ? neighbors.size : 0;

    let totalCoOccurrence = 0;
    const topConnected: { artist: string; weight: number }[] = [];

    if (neighbors) {
      neighbors.forEach((weight, peerNorm) => {
        totalCoOccurrence += weight;
        topConnected.push({
          artist: displayArtistMap.get(peerNorm) || peerNorm,
          weight,
        });
      });
      topConnected.sort((a, b) => b.weight - a.weight);
    }

    nodes.push({
      artist: displayArtistMap.get(normArtist) || normArtist,
      trackCount: tCount,
      playlistCount: pCount,
      degree,
      totalCoOccurrence,
      topConnected: topConnected.slice(0, 5),
    });
  });

  nodes.sort((a, b) => b.totalCoOccurrence - a.totalCoOccurrence || b.degree - a.degree);

  return {
    nodes,
    edgeMap,
    displayArtistMap,
  };
};

// ==============================================================================
// 3. Deterministic Louvain Modularity Community Detection
// ==============================================================================

/**
 * Executes deterministic Louvain modularity clustering on the artist co-occurrence network.
 * Node processing order is strictly alphabetical to ensure 100% reproducible cluster IDs.
 */
export function detectLouvainCommunities(
  graph: BipartiteCorpusGraph,
  artistGraphData?: ArtistGraphData
): {
  clusters: CommunityCluster[];
  artistToCommunity: Record<string, number>;
  trackToCommunity: Record<string, number>;
} {
  const data = artistGraphData || buildArtistConstellation(graph);
  const { edgeMap, displayArtistMap } = data;

  // 1. Gather all nodes with at least 1 edge or track, sorted alphabetically
  const sortedNodeKeys = Array.from(edgeMap.keys()).sort();
  const N = sortedNodeKeys.length;

  if (N === 0) {
    return { clusters: [], artistToCommunity: {}, trackToCommunity: {} };
  }

  // Node to integer index map
  const keyToIdx = new Map<string, number>();
  sortedNodeKeys.forEach((key, idx) => keyToIdx.set(key, idx));

  // Build compact adjacency lists
  const nodeDegrees: number[] = new Array(N).fill(0);
  const adj: { target: number; weight: number }[][] = new Array(N);
  let totalEdgeWeightM = 0;

  for (let i = 0; i < N; i++) {
    const key = sortedNodeKeys[i];
    const neighbors = edgeMap.get(key);
    adj[i] = [];

    if (neighbors) {
      neighbors.forEach((weight, peerKey) => {
        const j = keyToIdx.get(peerKey);
        if (j !== undefined) {
          adj[i].push({ target: j, weight });
          nodeDegrees[i] += weight;
          totalEdgeWeightM += weight;
        }
      });
    }
  }

  // totalEdgeWeightM counts each undirected edge twice
  const twoM = totalEdgeWeightM > 0 ? totalEdgeWeightM : 1;

  // 2. Initial state: each node is in its own community
  const community: number[] = new Array(N);
  const communityTotDegree: number[] = new Array(N);

  for (let i = 0; i < N; i++) {
    community[i] = i;
    communityTotDegree[i] = nodeDegrees[i];
  }

  // 3. Louvain Phase 1 Optimization loop
  let improvement = true;
  let passes = 0;
  const maxPasses = 15;

  while (improvement && passes < maxPasses) {
    improvement = false;
    passes++;

    // Iterate nodes in deterministic order
    for (let u = 0; u < N; u++) {
      const uComm = community[u];
      const uDegree = nodeDegrees[u];
      if (uDegree === 0) continue;

      // Calculate weights from u to neighboring communities
      const commWeights = new Map<number, number>();
      for (let e = 0; e < adj[u].length; e++) {
        const edge = adj[u][e];
        const vComm = community[edge.target];
        commWeights.set(vComm, (commWeights.get(vComm) || 0) + edge.weight);
      }

      // Remove u from its current community
      const currentWeightInComm = commWeights.get(uComm) || 0;
      communityTotDegree[uComm] -= uDegree;

      // Find neighbor community that maximizes modularity gain deltaQ
      let bestComm = uComm;
      let maxDeltaQ = 0;

      commWeights.forEach((k_in, candComm) => {
        // Delta Q formula: [k_in - (totDegree * uDegree) / 2m]
        const deltaQ = k_in - (communityTotDegree[candComm] * uDegree) / twoM;
        if (deltaQ > maxDeltaQ) {
          maxDeltaQ = deltaQ;
          bestComm = candComm;
        }
      });

      // Move u to the best community
      community[u] = bestComm;
      communityTotDegree[bestComm] += uDegree;

      if (bestComm !== uComm) {
        improvement = true;
      }
    }
  }

  // 4. Renumber communities into 0..K-1 sorted by member count descending
  const commMembers = new Map<number, string[]>();
  for (let i = 0; i < N; i++) {
    const c = community[i];
    const key = sortedNodeKeys[i];
    let list = commMembers.get(c);
    if (!list) {
      list = [];
      commMembers.set(c, list);
    }
    list.push(key);
  }

  // Sort raw communities by size desc
  const sortedRawComms = Array.from(commMembers.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  const artistToCommunity: Record<string, number> = {};
  const clusters: CommunityCluster[] = [];

  sortedRawComms.forEach(([_, memberArtistKeys], newClusterId) => {
    // Map artist keys to this newClusterId
    memberArtistKeys.forEach(norm => {
      artistToCommunity[norm] = newClusterId;
    });

    // Collect all tracks belonging to this cluster's artists
    const trackIdsInCluster: string[] = [];
    const artistFrequency = new Map<string, number>();
    const playlistFrequency = new Map<string, number>();

    memberArtistKeys.forEach(norm => {
      const displayName = displayArtistMap.get(norm) || norm;
      const tIds = graph.artistToTrackIds.get(norm) || graph.artistToTrackIds.get(displayName) || [];
      trackIdsInCluster.push(...tIds);
      artistFrequency.set(norm, tIds.length);

      tIds.forEach(tid => {
        const track = graph.tracks.get(tid);
        if (track) {
          track.playlistNames.forEach(pName => {
            playlistFrequency.set(pName, (playlistFrequency.get(pName) || 0) + 1);
          });
        }
      });
    });

    // Top dominant artists
    const dominantArtists = Array.from(artistFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([norm, count]) => ({
        artist: displayArtistMap.get(norm) || norm,
        count,
      }));

    // Top dominant playlists
    const dominantPlaylists = Array.from(playlistFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([playlistName, count]) => ({
        playlistName,
        count,
      }));

    // Auto-generate descriptive label
    let label = `Cluster #${newClusterId + 1}`;
    if (dominantArtists.length >= 2) {
      label = `${dominantArtists[0].artist} & ${dominantArtists[1].artist} Sphere`;
    } else if (dominantArtists.length === 1) {
      label = `${dominantArtists[0].artist} Circle`;
    }

    clusters.push({
      id: newClusterId,
      label,
      size: trackIdsInCluster.length,
      artistCount: memberArtistKeys.length,
      dominantArtists,
      dominantPlaylists,
      topTrackIds: trackIdsInCluster.slice(0, 20),
    });
  });

  // 5. Track to community mapping
  const trackToCommunity: Record<string, number> = {};
  graph.tracks.forEach((track, tid) => {
    const norm = normalizeForMatch(track.artist);
    if (artistToCommunity[norm] !== undefined) {
      trackToCommunity[tid] = artistToCommunity[norm];
    }
  });

  return {
    clusters,
    artistToCommunity,
    trackToCommunity,
  };
}

// ==============================================================================
// 4. Shortest-Path Aesthetic Bridge Engine (BFS on Artist Network)
// ==============================================================================

/**
 * Finds the shortest aesthetic path connecting two artists through co-occurring playlists.
 */
export function findArtistBridgePath(
  graph: BipartiteCorpusGraph,
  sourceArtistName: string,
  targetArtistName: string,
  edgeMap?: Map<string, Map<string, number>>
): ArtistBridgePath | null {
  const normSource = normalizeForMatch(sourceArtistName);
  const normTarget = normalizeForMatch(targetArtistName);

  if (!normSource || !normTarget || normSource === normTarget) return null;

  // Use provided edgeMap or build from graph
  const edges = edgeMap || buildArtistConstellation(graph).edgeMap;

  if (!edges.has(normSource) || !edges.has(normTarget)) return null;

  // BFS Queue: [currentArtistNorm, pathSoFar]
  const queue: [string, string[]][] = [[normSource, [normSource]]];
  const visited = new Set<string>([normSource]);

  let foundPath: string[] | null = null;

  while (queue.length > 0) {
    const [curr, path] = queue.shift()!;
    if (curr === normTarget) {
      foundPath = path;
      break;
    }

    // Safety hop limit: avoid paths longer than 6 hops
    if (path.length > 6) continue;

    const neighbors = edges.get(curr);
    if (neighbors) {
      // Deterministically sort neighbor candidates by edge weight desc, then name asc
      const sortedPeers = Array.from(neighbors.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      );

      for (let i = 0; i < sortedPeers.length; i++) {
        const peer = sortedPeers[i][0];
        if (!visited.has(peer)) {
          visited.add(peer);
          queue.push([peer, [...path, peer]]);
        }
      }
    }
  }

  if (!foundPath || foundPath.length < 2) return null;

  // Construct rich BridgeHops with shared playlists and representative tracks
  const bridgeHops: ArtistBridgeHop[] = [];

  for (let i = 0; i < foundPath.length - 1; i++) {
    const fromNorm = foundPath[i];
    const toNorm = foundPath[i + 1];

    // Find playlists containing BOTH artists
    const sharedPlaylists: string[] = [];
    const repTitles: string[] = [];

    graph.playlists.forEach(pl => {
      let hasFrom = false;
      let hasTo = false;

      pl.trackIds.forEach(tid => {
        const trk = graph.tracks.get(tid);
        if (trk) {
          const aNorm = normalizeForMatch(trk.artist);
          if (aNorm === fromNorm) hasFrom = true;
          if (aNorm === toNorm) hasTo = true;
        }
      });

      if (hasFrom && hasTo) {
        sharedPlaylists.push(pl.name);
      }
    });

    // Grab representative tracks
    const fromTrackIds = graph.artistToTrackIds.get(fromNorm) || [];
    const toTrackIds = graph.artistToTrackIds.get(toNorm) || [];

    if (fromTrackIds[0]) {
      const t1 = graph.tracks.get(fromTrackIds[0]);
      if (t1) repTitles.push(`${t1.artist} - ${t1.title}`);
    }
    if (toTrackIds[0]) {
      const t2 = graph.tracks.get(toTrackIds[0]);
      if (t2) repTitles.push(`${t2.artist} - ${t2.title}`);
    }

    bridgeHops.push({
      fromArtist: fromNorm,
      toArtist: toNorm,
      sharedPlaylists: sharedPlaylists.slice(0, 5),
      representativeTrackTitles: repTitles,
    });
  }

  return {
    sourceArtist: sourceArtistName,
    targetArtist: targetArtistName,
    path: foundPath,
    hops: foundPath.length - 1,
    bridgeHops,
  };
}

// ==============================================================================
// 5. Musicolet Offline Blind Spot Finder
// ==============================================================================

/**
 * Resiliently parses Musicolet Songs.csv (or TABLE_SONGS_view.csv) export to extract
 * full offline library metadata: unique artists, song fingerprints, and track objects.
 */
export function parseMusicoletLibrary(csvText: string): MusicoletLibraryPayload {
  const artists = new Set<string>();
  const trackKeys = new Set<string>();
  const songs: OfflineSongRecord[] = [];
  if (!csvText) return { artists, trackKeys, songs };

  // Strip BOM
  let cleanContent = csvText;
  if (cleanContent.charCodeAt(0) === 0xFEFF) {
    cleanContent = cleanContent.slice(1);
  }

  // RFC-4180 streaming parse lines
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
    }
    result.push(cur);
    return result;
  };

  const lines = cleanContent.split(/\r?\n/);
  if (lines.length < 2) return { artists, trackKeys, songs };

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

  // Detect column indices
  let titleCol = headers.findIndex(h => h === 'col_title' || h === 'title (ref)' || h === 'title' || h === 'name' || h === 'track');
  let artistCol = headers.findIndex(h => h === 'col_artist' || h === 'artist (ref)' || h === 'artist');
  let albumCol = headers.findIndex(h => h === 'col_album' || h === 'album');
  let genreCol = headers.findIndex(h => h === 'col_genre' || h === 'genre');
  let playsCol = headers.findIndex(h => h === 'col_num_played' || h === 'plays' || h === 'play count');
  let durCol = headers.findIndex(h => h === 'col_duration' || h === 'duration');

  if (titleCol === -1) titleCol = 2; // Default for TABLE_SONGS_view.csv
  if (artistCol === -1) artistCol = 3; // Default for TABLE_SONGS_view.csv

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    
    const rawTitle = (cols[titleCol] ?? '').replace(/^["']|["']$/g, '').trim();
    const rawArtist = (cols[artistCol] ?? '').replace(/^["']|["']$/g, '').trim();

    if (!rawTitle || !rawArtist || rawArtist.toLowerCase() === '<unknown>') {
      continue;
    }

    const normA = normalizeForMatch(rawArtist);
    const normT = normalizeForMatch(rawTitle);
    if (!normA || !normT) continue;

    const normKey = `${normA}:::${normT}`;
    artists.add(normA);
    trackKeys.add(normKey);

    // Multi-artist indexing for collaborations (e.g. "Tion Wayne, La Roux" -> index both)
    const subArtists = rawArtist.split(/,\s*|\s*&\s*|\s*feat\.?\s*/i);
    if (subArtists.length > 1) {
      for (const sub of subArtists) {
        const normSub = normalizeForMatch(sub);
        if (normSub) {
          artists.add(normSub);
          trackKeys.add(`${normSub}:::${normT}`);
        }
      }
    }

    songs.push({
      title: rawTitle,
      artist: rawArtist,
      album: albumCol !== -1 ? cols[albumCol]?.trim() : undefined,
      genre: genreCol !== -1 ? cols[genreCol]?.trim() : undefined,
      playCount: playsCol !== -1 ? parseInt(cols[playsCol], 10) || 0 : undefined,
      duration: durCol !== -1 ? parseInt(cols[durCol], 10) || 0 : undefined,
      normKey
    });
  }

  return { artists, trackKeys, songs };
}

/**
 * Resiliently parses Musicolet Songs.csv export to extract the offline artist library.
 * Preserved for backwards compatibility, delegates to parseMusicoletLibrary.
 */
export function parseMusicoletSongsCsv(csvText: string): Set<string> {
  return parseMusicoletLibrary(csvText).artists;
}

/**
 * Identifies high-affinity artists in the streaming corpus that are absent from the offline library.
 */
export function findBlindSpots(
  graph: BipartiteCorpusGraph,
  offlineArtists: Set<string>,
  artistNodes?: ArtistConstellationNode[],
  edgeMap?: Map<string, Map<string, number>>,
  topN: number = 50
): BlindSpotArtist[] {
  const edges = edgeMap || buildArtistConstellation(graph).edgeMap;
  const nodes = artistNodes || buildArtistConstellation(graph).nodes;

  // Determine top offline benchmark set
  // If user provided offlineArtists, use them. Otherwise, benchmark against top consensus artists.
  const benchmarkArtists = new Set<string>();
  if (offlineArtists.size > 0) {
    offlineArtists.forEach(a => benchmarkArtists.add(a));
  } else {
    // Benchmark against top 20 artists in the corpus
    nodes.slice(0, 20).forEach(n => benchmarkArtists.add(normalizeForMatch(n.artist)));
  }

  const results: BlindSpotArtist[] = [];

  nodes.forEach(node => {
    const norm = normalizeForMatch(node.artist);
    // Only evaluate artists NOT in the offline library
    if (offlineArtists.has(norm)) return;

    // Calculate co-occurrence weight connecting this artist to the benchmark pool
    let coOccurrenceWeight = 0;
    const neighbors = edges.get(norm);
    if (neighbors) {
      neighbors.forEach((weight, peerNorm) => {
        if (benchmarkArtists.has(peerNorm)) {
          coOccurrenceWeight += weight;
        }
      });
    }

    // Must have at least some connection or presence
    if (coOccurrenceWeight <= 0 && node.totalCoOccurrence <= 1) return;

    const tIds = graph.artistToTrackIds.get(norm) || graph.artistToTrackIds.get(node.artist) || [];
    if (tIds.length === 0) return;

    // Collect sample tracks and top playlists
    const sampleTracks: string[] = [];
    const pNames = new Set<string>();

    tIds.slice(0, 5).forEach(tid => {
      const trk = graph.tracks.get(tid);
      if (trk) {
        sampleTracks.push(trk.title);
        trk.playlistNames.forEach(p => pNames.add(p));
      }
    });

    // Score priority
    const score = Number(
      (coOccurrenceWeight * Math.log2(1 + node.trackCount) + node.playlistCount * 0.5).toFixed(2)
    );

    results.push({
      artist: node.artist,
      corpusTrackCount: node.trackCount,
      corpusPlaylistCount: node.playlistCount,
      coOccurrenceWeight,
      offlineTrackCount: 0,
      score,
      topPlaylists: Array.from(pNames).slice(0, 4),
      sampleTracks: sampleTracks.slice(0, 4),
    });
  });

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

// ==============================================================================
// 6. Complete Graph Intelligence Orchestrator
// ==============================================================================

/**
 * Computes all Graph Intelligence features synchronously in pure TypeScript.
 * Suitable for main thread execution or inside a Web Worker.
 */
export function computeGraphIntelligence(
  graph: BipartiteCorpusGraph,
  onProgress?: (percent: number, stage: string) => void
): GraphIntelligenceResult {
  onProgress?.(10, 'Computing sparse Jaccard playlist similarity matrix...');
  const jaccardPairs = computeSparsePlaylistJaccard(graph);

  onProgress?.(40, 'Building artist constellation co-occurrence network...');
  const artistData = buildArtistConstellation(graph);

  onProgress?.(70, 'Detecting deterministic Louvain community clusters...');
  const { clusters, artistToCommunity, trackToCommunity } = detectLouvainCommunities(
    graph,
    artistData
  );

  onProgress?.(100, 'Graph analysis complete');

  return {
    timestamp: Date.now(),
    jaccardPairs,
    clusters,
    artistNodes: artistData.nodes,
    trackToCommunity,
    artistToCommunity,
  };
}
