import {
  AcousticProfile,
  AudimoteTrackItem,
  calculateCalibratedValence,
  calculateCalibratedArousal,
} from './acousticTypes';
import { resolveAudioPreviewForTrack } from './itunesApi';
import { updateTrackAcousticProfile, getAllAcousticProfiles } from './metadataDb';
import { AudimoteWorkerRequest, AudimoteWorkerResponse } from '../workers/audimote.worker';
import { cleanCompositeTrack } from './playlistSanitizer';
import { sanitizeSongQuery } from './songQuerySanitizer';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    // DEF-15: Diagnostic logging when browser tab is backgrounded
    audioCtx.resume().catch((err) => {
      console.warn('[AudimoteEngine] AudioContext resume failed (tab may be backgrounded or awaiting user gesture):', err);
    });
  }
  return audioCtx;
}

const WORKER_POOL_SIZE = 2;
const workerPool: Worker[] = [];
let nextWorkerIdx = 0;

const pendingWorkerRequests = new Map<
  string,
  {
    resolve: (profile: AcousticProfile) => void;
    reject: (err: Error) => void;
    timeoutId: any;
  }
>();

function initWorker(): Worker {
  const worker = new Worker(new URL('../workers/audimote.worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (e: MessageEvent<AudimoteWorkerResponse>) => {
    const { id, success, profile, error } = e.data;
    const pending = pendingWorkerRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingWorkerRequests.delete(id);
      if (success && profile) {
        pending.resolve(profile);
      } else {
        pending.reject(new Error(error || 'Audimote analysis failed'));
      }
    }
  };

  worker.onerror = (err) => {
    console.error('[AudimoteEngine] Worker error:', err);
    const idx = workerPool.indexOf(worker);
    if (idx !== -1) {
      workerPool.splice(idx, 1);
    }
    worker.terminate();
  };

  return worker;
}

function getWorker(): Worker {
  if (workerPool.length < WORKER_POOL_SIZE) {
    const w = initWorker();
    workerPool.push(w);
    return w;
  }
  const worker = workerPool[nextWorkerIdx % workerPool.length];
  nextWorkerIdx = (nextWorkerIdx + 1) % workerPool.length;
  return worker;
}

/**
 * Dispatches raw PCM data to the Essentia WebAssembly Web Worker.
 */
function sendToWorker(channelData: Float32Array, sampleRate: number): Promise<AcousticProfile> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substring(2, 10);
    const worker = getWorker();

    const timeoutId = setTimeout(() => {
      pendingWorkerRequests.delete(id);
      reject(new Error('Audimote analysis timed out (60s)'));
    }, 60000);

    pendingWorkerRequests.set(id, { resolve, reject, timeoutId });

    // Zero-copy transfer of Float32Array buffer to the worker
    worker.postMessage({ id, channelData, sampleRate } as AudimoteWorkerRequest, [channelData.buffer]);
  });
}

const ESSENTIA_SAMPLE_RATE = 44100;

/**
 * Resamples a mono Float32Array to 44,100 Hz using linear interpolation fallback
 * if OfflineAudioContext is unavailable or in non-browser execution environments.
 */
function resampleTo44100(audioData: Float32Array, origRate: number): Float32Array {
  if (origRate === ESSENTIA_SAMPLE_RATE) return audioData;
  const ratio = ESSENTIA_SAMPLE_RATE / origRate;
  const newLength = Math.max(1, Math.round(audioData.length * ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const origPos = i / ratio;
    const idx0 = Math.floor(origPos);
    const idx1 = Math.min(audioData.length - 1, idx0 + 1);
    const frac = origPos - idx0;
    result[i] = audioData[idx0] * (1 - frac) + audioData[idx1] * frac;
  }
  return result;
}

/**
 * Decodes an ArrayBuffer of audio into mono Float32Array PCM samples at EXACTLY 44,100 Hz.
 * CRIT-04: Guarantees 44.1 kHz input for Essentia WASM, eliminating the 8.125% slowdown distortion on 48 kHz systems.
 * DEF-03: Performs true (L + R) / 2 sum-to-mono downmix when 2+ channels present.
 * DEF-04: For local files > 60s, slices 45s starting at 25% duration to avoid intro bias.
 */
async function decodeAudioBufferToPCM(
  arrayBuffer: ArrayBuffer,
  isLocalFile = false
): Promise<{ channelData: Float32Array; sampleRate: number }> {
  const ctx = getAudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const origRate = audioBuffer.sampleRate;
  const totalDuration = audioBuffer.duration;

  let startTimeSec = 0;
  const sliceDurationSec = 45;

  // DEF-04: For long local tracks (>60s), sample from the 25% mark to capture the musical body
  if (isLocalFile && totalDuration > 60) {
    startTimeSec = totalDuration * 0.25;
  }

  const actualSliceDuration = Math.min(sliceDurationSec, Math.max(0, totalDuration - startTimeSec));

  // 1. High-fidelity hardware-accelerated polyphase sinc resampling via OfflineAudioContext
  const OfflineAudioCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (OfflineAudioCtxClass) {
    try {
      const targetLength = Math.max(1, Math.floor(actualSliceDuration * ESSENTIA_SAMPLE_RATE));
      const offlineCtx = new OfflineAudioCtxClass(1, targetLength, ESSENTIA_SAMPLE_RATE);

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start(0, startTimeSec, actualSliceDuration);

      const renderedBuffer = await offlineCtx.startRendering();
      const channelData = renderedBuffer.getChannelData(0);
      return { channelData, sampleRate: ESSENTIA_SAMPLE_RATE };
    } catch (offlineErr) {
      console.warn('[AudimoteEngine] OfflineAudioContext resampler fallback:', offlineErr);
    }
  }

  // 2. Fallback: manual stereo-to-mono downmix + linear resample to 44.1 kHz
  const numChannels = audioBuffer.numberOfChannels;
  const totalSamples = audioBuffer.length;
  const startSample = Math.floor(startTimeSec * origRate);
  const maxSliceSamples = Math.floor(actualSliceDuration * origRate);
  const endSample = Math.min(totalSamples, startSample + maxSliceSamples);
  const sliceLength = Math.max(1, endSample - startSample);

  const rawMono = new Float32Array(sliceLength);
  if (numChannels >= 2) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    for (let i = 0; i < sliceLength; i++) {
      rawMono[i] = (left[startSample + i] + right[startSample + i]) * 0.5;
    }
  } else {
    const mono = audioBuffer.getChannelData(0);
    rawMono.set(mono.subarray(startSample, endSample));
  }

  const channelData = resampleTo44100(rawMono, origRate);
  return { channelData, sampleRate: ESSENTIA_SAMPLE_RATE };
}

/**
 * Analyzes a single track's acoustic profile using either its local File or Apple iTunes 30s preview.
 * Persists the resulting profile directly into PlaylistHavenMetadataDB.
 */
export async function analyzeTrack(
  item: AudimoteTrackItem,
  signal?: AbortSignal
): Promise<AcousticProfile> {
  let arrayBuffer: ArrayBuffer;

  if (item.file) {
    // 1. Local audio file drop
    arrayBuffer = await item.file.arrayBuffer();
  } else {
    // 2. iTunes 30s audio preview
    let previewUrl = item.previewUrl;
    if (!previewUrl) {
      const resolved = await resolveAudioPreviewForTrack(item.artist, item.title, item.album, signal);
      if (resolved.previewUrl) {
        previewUrl = resolved.previewUrl;
        item.previewUrl = previewUrl;
        if (!item.coverArtUrl && resolved.coverArt) {
          item.coverArtUrl = resolved.coverArt;
        }
      }
    }

    if (!previewUrl) {
      throw new Error(`No 30s audio preview found for "${item.artist} - ${item.title}"`);
    }

    let resp = await fetch(previewUrl, { signal });
    
    // DEF-16: Handle expired Apple CDN preview URL (HTTP 403) by re-resolving fresh from iTunes
    if (resp.status === 403) {
      console.warn(`[AudimoteEngine] Preview URL 403 expired for "${item.artist} - ${item.title}". Re-resolving...`);
      const reResolved = await resolveAudioPreviewForTrack(item.artist, item.title, item.album, signal);
      if (reResolved.previewUrl && reResolved.previewUrl !== previewUrl) {
        previewUrl = reResolved.previewUrl;
        item.previewUrl = previewUrl;
        resp = await fetch(previewUrl, { signal });
      }
    }

    if (!resp.ok) {
      throw new Error(`Failed to stream audio preview: HTTP ${resp.status}`);
    }
    arrayBuffer = await resp.arrayBuffer();
  }

  // 3. Decode PCM (with stereo sum-to-mono and smart intro-skipping for local files)
  const { channelData, sampleRate } = await decodeAudioBufferToPCM(arrayBuffer, !!item.file);

  // 4. Extract acoustic features via Essentia WASM Worker
  const profile = await sendToWorker(channelData, sampleRate);

  // 5. Direct IndexedDB hydration
  try {
    await updateTrackAcousticProfile(item.artist, item.title, profile, {
      album: item.album,
      previewUrl: item.previewUrl,
    });
  } catch (dbErr) {
    console.warn('[AudimoteEngine] Non-blocking DB save error:', dbErr);
  }

  item.profile = profile;
  item.status = 'completed';
  return profile;
}

export interface ActiveTrackInfo {
  id: string;
  artist: string;
  title: string;
}

export interface AnalysisProgressEvent {
  processed: number;
  total: number;
  currentTrack?: string;
  currentTrackId?: string;
  activeTracks: ActiveTrackInfo[];
  successCount: number;
  failedCount: number;
}

/**
 * Batch analysis coordinator with concurrency control and progress reporting.
 */
export async function analyzeTrackBatch(
  items: AudimoteTrackItem[],
  onProgress?: (progress: AnalysisProgressEvent) => void,
  signal?: AbortSignal,
  concurrency = 2,
  onTrackUpdate?: (item: AudimoteTrackItem) => void
): Promise<void> {
  let processed = 0;
  let successCount = 0;
  let failedCount = 0;

  const total = items.length;
  let currentIndex = 0;
  const activeMap = new Map<string, ActiveTrackInfo>();

  function emitProgress() {
    const activeList = Array.from(activeMap.values());
    const latest = activeList[activeList.length - 1];
    onProgress?.({
      processed,
      total,
      currentTrack: latest ? `${latest.artist} - ${latest.title}` : undefined,
      currentTrackId: latest ? latest.id : undefined,
      activeTracks: activeList,
      successCount,
      failedCount,
    });
  }

  async function workerLoop() {
    while (currentIndex < items.length) {
      if (signal?.aborted) throw new Error('Analysis cancelled by user');

      const item = items[currentIndex++];
      if (!item) break;

      // Skip already completed unless explicitly retried
      if (item.status === 'completed' && item.profile) {
        processed++;
        successCount++;
        emitProgress();
        continue;
      }

      item.status = 'analyzing';
      activeMap.set(item.id, { id: item.id, artist: item.artist, title: item.title });
      onTrackUpdate?.({ ...item });
      emitProgress();

      try {
        await analyzeTrack(item, signal);
        successCount++;
      } catch (err: any) {
        console.warn(`[AudimoteEngine] Failed analyzing "${item.artist} - ${item.title}":`, err);
        item.status = 'error';
        item.errorMessage = err?.message || String(err);
        failedCount++;
      } finally {
        activeMap.delete(item.id);
        processed++;
        onTrackUpdate?.({ ...item });
        emitProgress();
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => workerLoop());
  await Promise.all(workers);
}

/**
 * Hydrates Audimote items from all existing acoustic profiles saved in PlaylistHavenMetadataDB.
 * Automatically recalculates and upgrades continuous Valence using the balanced acoustic model,
 * persisting any updates back to IndexedDB.
 */
export async function loadSavedAcousticTracks(): Promise<AudimoteTrackItem[]> {
  const savedRecords = await getAllAcousticProfiles();
  return savedRecords.map((r) => {
    const calibratedValence = calculateCalibratedValence(r.profile);
    const calibratedArousal = calculateCalibratedArousal(r.profile);
    const updatedProfile: AcousticProfile = {
      ...r.profile,
      valence: calibratedValence,
      arousal: calibratedArousal,
    };
    if (r.profile.valence !== calibratedValence || r.profile.arousal !== calibratedArousal) {
      updateTrackAcousticProfile(r.artist, r.title, updatedProfile, {
        previewUrl: r.previewUrl,
        album: r.album,
      }).catch((e) =>
        console.warn('[AudimoteEngine] Failed to persist recalibrated profile:', e)
      );
    }
    return {
      id: r.id,
      artist: r.artist,
      title: r.title,
      album: r.album,
      previewUrl: r.previewUrl,
      profile: updatedProfile,
      status: 'completed',
    };
  });
}

/**
 * Generates an M3U playlist file content from a set of tracks.
 */
export function generateM3U(tracks: AudimoteTrackItem[], title = 'Audimote Harmonic DJ Set'): string {
  let content = `#EXTM3U\n#PLAYLIST:${title}\n\n`;
  for (const t of tracks) {
    const duration = t.profile?.durationSec ? Math.round(t.profile.durationSec) : 30;
    const camelot = t.profile?.camelotCode ? `[${t.profile.camelotCode}] ` : '';
    const bpm = t.profile?.bpm ? `${Math.round(t.profile.bpm)}BPM ` : '';
    content += `#EXTINF:${duration},${camelot}${bpm}${t.artist} - ${t.title}\n`;
    content += `${t.previewUrl || t.title}\n\n`;
  }
  return content;
}

/**
 * Downloads a string as a file in the browser with automatic UTF-8 BOM injection for text exports.
 */
export function downloadFile(content: string, filename: string, mimeType = 'text/plain;charset=utf-8;') {
  // Ensure UTF-8 BOM is present for CSV, TSV, and TXT files to prevent Excel/Windows encoding corruption
  let finalContent = content;
  if (
    (filename.endsWith('.csv') || filename.endsWith('.tsv') || filename.endsWith('.txt')) &&
    !finalContent.startsWith('\uFEFF')
  ) {
    finalContent = '\uFEFF' + finalContent;
  }

  const blob = new Blob([finalContent], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates TuneMyMusic-compatible CSV (Artist,Track,Album) with UTF-8 BOM.
 */
export function generateTuneMyMusicCSV(tracks: AudimoteTrackItem[]): string {
  const header = 'Artist,Track,Album\n';
  const rows = tracks.map((t) => {
    const artist = (t.artist || '').replace(/"/g, '""');
    const title = (t.title || '').replace(/"/g, '""');
    const album = (t.album || '').replace(/"/g, '""');
    return `"${artist}","${title}","${album}"`;
  });
  return '\uFEFF' + header + rows.join('\n');
}

/**
 * Generates Downloader TXT list (Artist - Title per line) with UTF-8 BOM.
 */
export function generateDownloaderTXT(tracks: AudimoteTrackItem[]): string {
  const lines = tracks.map((t) => `${t.artist || 'Unknown Artist'} - ${t.title || 'Unknown Title'}`);
  return '\uFEFF' + lines.join('\n');
}

/**
 * Generates Tab-Separated Values (TSV) for direct spreadsheet pasting.
 */
export function generateTSV(tracks: AudimoteTrackItem[]): string {
  const headers = ['Artist', 'Title', 'Album', 'BPM', 'Key', 'Camelot', 'Energy', 'Danceability', 'Valence', 'Arousal'];
  const rows = tracks.map((t) => [
    t.artist || '',
    t.title || '',
    t.album || '',
    t.profile?.bpm ? Math.round(t.profile.bpm).toString() : '',
    t.profile?.key ? `${t.profile.key} ${t.profile.scale}` : '',
    t.profile?.camelotCode || '',
    t.profile?.energy != null ? `${Math.round(t.profile.energy * 100)}%` : '',
    t.profile?.danceability != null ? `${Math.round(t.profile.danceability * 100)}%` : '',
    t.profile?.valence != null ? t.profile.valence.toFixed(2) : '',
    t.profile?.arousal != null ? t.profile.arousal.toFixed(2) : '',
  ]);
  return [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
}

/**
 * Generates Session Backup JSON with all tracks, profiles, and state.
 */
export function generateSessionJSON(tracks: AudimoteTrackItem[]): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    engine: 'Audimote 🐣 (Essentia.js Wasm)',
    trackCount: tracks.length,
    analyzedCount: tracks.filter((t) => t.profile != null).length,
    tracks,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Stages tracks into Discovery Triage (Module 14) via the canonical localStorage contract.
 */
export function stageTracksToDiscoveryTriage(tracks: AudimoteTrackItem[]): number {
  const payload = tracks.map((t) => {
    const p = t.profile;
    const camelotTag = p?.camelotCode ? `[${p.camelotCode}] ` : '';
    const bpmTag = p?.bpm ? `${Math.round(p.bpm)}BPM ` : '';
    const energyTag = p?.energy != null ? `Energy: ${Math.round(p.energy * 100)}% ` : '';
    const valenceTag = p?.valence != null ? `Valence: ${p.valence.toFixed(2)}` : '';

    return {
      title: t.title,
      artist: t.artist,
      album: t.album || 'Audimote Acoustic Cohort',
      culturalBucket: 'Other',
      sourceDetails: `Audimote 🐣 ${camelotTag}${bpmTag}${energyTag}${valenceTag}`.trim(),
      confidence: 'acoustic',
      stagedAt: new Date().toISOString(),
    };
  });

  localStorage.setItem('playlist_haven_triage_intake', JSON.stringify(payload));
  return payload.length;
}

/**
 * Exports tracks to high-density acoustic CSV with UTF-8 BOM.
 */
export function exportTracksToCSV(tracks: AudimoteTrackItem[], filename = 'audimote_acoustic_profiles.csv') {
  const headers = [
    'Artist',
    'Title',
    'Album',
    'BPM',
    'Key',
    'Scale',
    'Camelot Code',
    'Energy',
    'Danceability',
    'Valence',
    'Arousal',
    'Loudness (dB)',
    'Instrumentalness',
    'Preview URL',
  ];

  const rows = tracks.map((t) => [
    `"${(t.artist || '').replace(/"/g, '""')}"`,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    `"${(t.album || '').replace(/"/g, '""')}"`,
    t.profile?.bpm ? Math.round(t.profile.bpm).toString() : '',
    t.profile?.key || '',
    t.profile?.scale || '',
    t.profile?.camelotCode || '',
    t.profile?.energy != null ? t.profile.energy.toFixed(2) : '',
    t.profile?.danceability != null ? t.profile.danceability.toFixed(2) : '',
    t.profile?.valence != null ? t.profile.valence.toFixed(2) : '',
    t.profile?.arousal != null ? t.profile.arousal.toFixed(2) : '',
    t.profile?.loudness != null ? t.profile.loudness.toFixed(1) : '',
    t.profile?.instrumentalness != null ? t.profile.instrumentalness.toFixed(2) : '',
    `"${(t.previewUrl || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

/**
 * Splits a CSV/TSV line handling quotes and delimiters
 */
export function splitCSVRow(row: string, defaultDelimiter = ','): string[] {
  const delimiter = row.includes('\t') && defaultDelimiter === ',' ? '\t' : defaultDelimiter;
  const pattern = new RegExp(
    `(${delimiter}|\\r?\\n|\\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}\\r\\n]*))`,
    'gi'
  );
  const fields: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(row))) {
    const field = match[2] ? match[2].replace(/""/g, '"') : match[3];
    fields.push(field ? field.trim() : '');
  }
  return fields.length > 0 ? fields : row.split(delimiter).map((s) => s.trim());
}

/**
 * Parses Dense Acoustic CSV (14 columns) and rehydrates complete AcousticProfile objects.
 */
export function parseDenseAcousticCSV(content: string): AudimoteTrackItem[] {
  const clean = content.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCSVRow(lines[0]).map((h) => h.toLowerCase());
  const artistIdx = header.findIndex((h) => h.includes('artist'));
  const titleIdx = header.findIndex((h) => h.includes('title') || h.includes('track'));
  const albumIdx = header.findIndex((h) => h.includes('album'));
  const bpmIdx = header.findIndex((h) => h === 'bpm');
  const keyIdx = header.findIndex((h) => h === 'key');
  const scaleIdx = header.findIndex((h) => h === 'scale');
  const camelotIdx = header.findIndex((h) => h.includes('camelot'));
  const energyIdx = header.findIndex((h) => h === 'energy');
  const danceabilityIdx = header.findIndex((h) => h === 'danceability');
  const valenceIdx = header.findIndex((h) => h === 'valence');
  const arousalIdx = header.findIndex((h) => h === 'arousal');
  const loudnessIdx = header.findIndex((h) => h.includes('loudness'));
  const instrumentalnessIdx = header.findIndex((h) => h.includes('instrumentalness'));
  const previewUrlIdx = header.findIndex((h) => h.includes('preview'));

  const tracks: AudimoteTrackItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i]);
    if (cols.length === 0 || cols.every((c) => !c)) continue;

    const artist = artistIdx !== -1 && cols[artistIdx] ? cols[artistIdx] : 'Unknown Artist';
    const title = titleIdx !== -1 && cols[titleIdx] ? cols[titleIdx] : 'Unknown Title';
    const album = albumIdx !== -1 && cols[albumIdx] ? cols[albumIdx] : '';
    const bpm = bpmIdx !== -1 ? parseFloat(cols[bpmIdx]) || 0 : 0;
    const musicalKey = keyIdx !== -1 ? cols[keyIdx] : '';
    const scale = scaleIdx !== -1 && cols[scaleIdx]?.toLowerCase() === 'minor' ? 'minor' : 'major';
    const camelotCode = camelotIdx !== -1 ? cols[camelotIdx] : '';
    const energy = energyIdx !== -1 ? parseFloat(cols[energyIdx]) || 0 : 0;
    const danceability = danceabilityIdx !== -1 ? parseFloat(cols[danceabilityIdx]) || 0 : 0;
    const valence = valenceIdx !== -1 ? parseFloat(cols[valenceIdx]) || 0 : 0;
    const arousal = arousalIdx !== -1 ? parseFloat(cols[arousalIdx]) || 0 : 0;
    const loudness = loudnessIdx !== -1 ? parseFloat(cols[loudnessIdx]) || 0 : 0;
    const instrumentalness = instrumentalnessIdx !== -1 ? parseFloat(cols[instrumentalnessIdx]) || 0 : 0;
    const previewUrl = previewUrlIdx !== -1 ? cols[previewUrlIdx] : '';

    const profile: AcousticProfile = {
      bpm,
      musicalKey,
      key: musicalKey,
      scale,
      camelot: camelotCode,
      camelotCode,
      energy,
      danceability,
      valence,
      arousal,
      loudness,
      instrumentalness,
      analyzedAt: Date.now(),
      source: previewUrl ? 'itunes_preview' : 'local_file',
    };

    tracks.push({
      id: `dense-${Math.random().toString(36).substring(2, 9)}`,
      artist,
      title,
      album,
      previewUrl: previewUrl || undefined,
      profile,
      acousticProfile: profile,
      status: 'completed',
    });
  }

  return tracks;
}

/**
 * Parses TuneMyMusic CSV (Artist,Track,Album) or generic CSV/TSV
 */
export function parseTuneMyMusicCSV(content: string): AudimoteTrackItem[] {
  const clean = content.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const header = splitCSVRow(lines[0]);
  const headerLower = header.map((h) => h.toLowerCase());

  let titleIdx = headerLower.findIndex(
    (h) => h.includes('track') || h.includes('title') || h === 'song' || h === 'name'
  );
  let artistIdx = headerLower.findIndex(
    (h) => h.includes('artist') || h === 'performer' || h === 'author'
  );
  let albumIdx = headerLower.findIndex(
    (h) => h.includes('album') || h === 'collection' || h === 'release'
  );

  const hasRecognizedHeader = titleIdx !== -1 || artistIdx !== -1;
  const startRow = hasRecognizedHeader ? 1 : 0;

  if (!hasRecognizedHeader && header.length >= 2) {
    artistIdx = 0;
    titleIdx = 1;
  }

  const tracks: AudimoteTrackItem[] = [];

  for (let i = startRow; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i]);
    if (cols.length === 0 || cols.every((c) => !c)) continue;

    let artist = '';
    let title = '';
    let album = '';

    if (titleIdx !== -1 && cols[titleIdx]) {
      title = cols[titleIdx];
    }
    if (artistIdx !== -1 && cols[artistIdx]) {
      artist = cols[artistIdx];
    }
    if (albumIdx !== -1 && cols[albumIdx]) {
      album = cols[albumIdx];
    }

    if (!artist || !title) {
      const compositeRaw = title || artist || cols[0];
      const cleaned = cleanCompositeTrack(compositeRaw, artist);
      artist = cleaned.artist;
      title = cleaned.title;
    }

    const sanitized = sanitizeSongQuery(artist, title, album);
    if (sanitized.cleanTitle) {
      tracks.push({
        id: `csv-${Math.random().toString(36).substring(2, 9)}`,
        artist: sanitized.cleanArtist || artist || 'Unknown Artist',
        title: sanitized.cleanTitle || title,
        album: sanitized.cleanAlbum || album || '',
        status: 'pending',
      });
    }
  }

  return tracks;
}

/**
 * Parses M3U/M3U8 playlist files, including our harmonic DJ set format
 */
export function parseM3UPlaylist(content: string): AudimoteTrackItem[] {
  const clean = content.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tracks: AudimoteTrackItem[] = [];

  let currentExtinf = '';

  for (const line of lines) {
    if (line.toUpperCase() === '#EXTM3U' || line.toUpperCase().startsWith('#PLAYLIST:')) continue;

    if (line.toUpperCase().startsWith('#EXTINF:')) {
      currentExtinf = line;
      continue;
    }

    if (line.startsWith('#')) continue;

    let title = '';
    let artist = '';
    let camelotCode = '';
    let bpm = 0;
    let previewUrl = '';

    if (currentExtinf) {
      const commaIdx = currentExtinf.indexOf(',');
      if (commaIdx !== -1) {
        let rawInfo = currentExtinf.substring(commaIdx + 1).trim();

        // Check for harmonic tag: [10B] or [4A]
        const camelotMatch = rawInfo.match(/\[([0-9]{1,2}[AB])\]/i);
        if (camelotMatch) {
          camelotCode = camelotMatch[1].toUpperCase();
          rawInfo = rawInfo.replace(/\[[0-9]{1,2}[AB]\]/i, '').trim();
        }

        // Check for BPM tag: 128BPM or 128 BPM
        const bpmMatch = rawInfo.match(/(\d{2,3}(?:\.\d+)?)\s*BPM/i);
        if (bpmMatch) {
          bpm = parseFloat(bpmMatch[1]);
          rawInfo = rawInfo.replace(/\d{2,3}(?:\.\d+)?\s*BPM/i, '').trim();
        }

        const cleaned = cleanCompositeTrack(rawInfo);
        artist = cleaned.artist;
        title = cleaned.title;
      }
      currentExtinf = '';
    }

    // Line might be an HTTP preview URL or a local path
    if (line.startsWith('http://') || line.startsWith('https://')) {
      previewUrl = line;
    }

    // If EXTINF was missing or empty, extract from path filename
    if (!title) {
      const pathParts = line.split(/[/\\]/);
      const fileName = pathParts[pathParts.length - 1].replace(/\.[a-zA-Z0-9]+$/, '');
      const cleaned = cleanCompositeTrack(fileName);
      artist = cleaned.artist;
      title = cleaned.title;
    }

    const sanitized = sanitizeSongQuery(artist, title);
    if (sanitized.cleanTitle) {
      let profile: AcousticProfile | undefined;
      if (camelotCode || bpm > 0) {
        profile = {
          bpm,
          musicalKey: '',
          scale: camelotCode.endsWith('A') ? 'minor' : 'major',
          camelot: camelotCode,
          camelotCode,
          energy: 0,
          danceability: 0,
          valence: 0,
          arousal: 0,
          instrumentalness: 0,
          analyzedAt: Date.now(),
          source: previewUrl ? 'itunes_preview' : 'local_file',
        };
      }

      tracks.push({
        id: `m3u-${Math.random().toString(36).substring(2, 9)}`,
        artist: sanitized.cleanArtist || artist || 'Unknown Artist',
        title: sanitized.cleanTitle || title,
        previewUrl: previewUrl || undefined,
        profile,
        acousticProfile: profile,
        status: profile ? 'completed' : 'pending',
      });
    }
  }

  return tracks;
}

/**
 * Parses Downloader TXT files ("Artist - Title" per line, numbered lists)
 */
export function parseDownloaderTXT(content: string): AudimoteTrackItem[] {
  const clean = content.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tracks: AudimoteTrackItem[] = [];

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue;
    // Strip leading track numbering: "1. ", "01 - ", "[1] ", "#1 "
    const stripped = line.replace(/^(?:#?\d{1,3}[\.\)\:\-\s]+|\[\d{1,3}\]\s*)/, '').trim();
    if (!stripped) continue;

    const cleaned = cleanCompositeTrack(stripped);
    const sanitized = sanitizeSongQuery(cleaned.artist, cleaned.title);

    if (sanitized.cleanTitle) {
      tracks.push({
        id: `txt-${Math.random().toString(36).substring(2, 9)}`,
        artist: sanitized.cleanArtist || cleaned.artist || 'Unknown Artist',
        title: sanitized.cleanTitle || cleaned.title,
        status: 'pending',
      });
    }
  }

  return tracks;
}

/**
 * Parses Session Backup JSON, rehydrating tracks and any existing acoustic profiles
 */
export function parseSessionBackupJSON(content: string): AudimoteTrackItem[] {
  const clean = content.replace(/^\uFEFF/, '').trim();
  const data = JSON.parse(clean);

  const rawList: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data.tracks)
    ? data.tracks
    : [];

  return rawList.map((item) => {
    const profile = item.profile || item.acousticProfile;
    return {
      id: item.id || `json-${Math.random().toString(36).substring(2, 9)}`,
      artist: item.artist || item.queryArtist || 'Unknown Artist',
      title: item.title || item.queryTitle || 'Unknown Title',
      album: item.album || item.queryAlbum || '',
      previewUrl: item.previewUrl || item.audioPreviewUrl,
      coverArtUrl: item.coverArtUrl || item.artworkUrl,
      profile: profile || undefined,
      acousticProfile: profile || undefined,
      status: profile ? 'completed' : item.status || 'pending',
    };
  });
}

/**
 * Auto-detects the format of raw imported text content
 */
export function detectImportFormat(content: string): { format: string; label: string } {
  const clean = content.replace(/^\uFEFF/, '').trim();
  if (!clean) return { format: 'empty', label: 'Empty Input' };

  if (clean.startsWith('{') || clean.startsWith('[')) {
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) || Array.isArray(parsed.tracks)) {
        return { format: 'json', label: 'Session Backup JSON' };
      }
    } catch {}
  }

  if (clean.includes('#EXTM3U') || clean.includes('#EXTINF:')) {
    return { format: 'm3u', label: 'M3U / M3U8 Playlist' };
  }

  const firstLine = clean.split(/\r?\n/)[0].toLowerCase();
  if (
    firstLine.includes('camelot') &&
    (firstLine.includes('valence') || firstLine.includes('energy') || firstLine.includes('bpm'))
  ) {
    return { format: 'dense_csv', label: 'Dense Acoustic CSV (Hydrated)' };
  }

  if (firstLine.includes('artist') && (firstLine.includes('track') || firstLine.includes('title'))) {
    if (firstLine.includes('\t')) {
      return { format: 'tsv', label: 'Tab-Separated Values (TSV)' };
    }
    return { format: 'tunemymusic_csv', label: 'TuneMyMusic CSV' };
  }

  if (firstLine.includes(',') && firstLine.split(',').length >= 2) {
    return { format: 'csv', label: 'Standard CSV' };
  }

  if (firstLine.includes('\t') && firstLine.split('\t').length >= 2) {
    return { format: 'tsv', label: 'Tab-Separated Values (TSV)' };
  }

  return { format: 'txt', label: 'Downloader TXT / Tracklist' };
}

/**
 * Universal text import parser with format auto-detection
 */
export function parseAcousticImportText(
  content: string,
  filename?: string
): { tracks: AudimoteTrackItem[]; formatDetected: string; label: string } {
  const clean = content.replace(/^\uFEFF/, '').trim();
  if (!clean) return { tracks: [], formatDetected: 'empty', label: 'Empty' };

  if (filename?.endsWith('.json')) {
    try {
      return {
        tracks: parseSessionBackupJSON(clean),
        formatDetected: 'json',
        label: 'Session Backup JSON',
      };
    } catch {}
  }

  if (filename?.endsWith('.m3u') || filename?.endsWith('.m3u8')) {
    return {
      tracks: parseM3UPlaylist(clean),
      formatDetected: 'm3u',
      label: 'M3U Playlist',
    };
  }

  const { format, label } = detectImportFormat(clean);

  switch (format) {
    case 'dense_csv':
      return { tracks: parseDenseAcousticCSV(clean), formatDetected: format, label };
    case 'tunemymusic_csv':
    case 'csv':
    case 'tsv':
      return { tracks: parseTuneMyMusicCSV(clean), formatDetected: format, label };
    case 'm3u':
      return { tracks: parseM3UPlaylist(clean), formatDetected: format, label };
    case 'json':
      return { tracks: parseSessionBackupJSON(clean), formatDetected: format, label };
    case 'txt':
    default:
      return { tracks: parseDownloaderTXT(clean), formatDetected: 'txt', label };
  }
}

/**
 * Universal file import parser for both audio files and playlist/metadata documents
 */
export async function parseAcousticImportFile(
  file: File
): Promise<{ tracks: AudimoteTrackItem[]; formatDetected: string; label: string }> {
  const isAudio = /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(file.name);

  if (isAudio) {
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    const cleaned = cleanCompositeTrack(cleanName);
    const sanitized = sanitizeSongQuery(cleaned.artist, cleaned.title);

    const track: AudimoteTrackItem = {
      id: `local-${Math.random().toString(36).substring(2, 9)}`,
      artist: sanitized.cleanArtist || cleaned.artist || 'Unknown Artist',
      title: sanitized.cleanTitle || cleaned.title || cleanName,
      file,
      status: 'pending',
    };

    return {
      tracks: [track],
      formatDetected: 'audio',
      label: 'Local Audio File',
    };
  }

  const text = await file.text();
  return parseAcousticImportText(text, file.name);
}
