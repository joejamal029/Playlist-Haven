/// <reference lib="webworker" />
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import {
  AcousticProfile,
  getCamelotCode,
  calculateCalibratedValence,
  calculateCalibratedArousal,
} from '../services/acousticTypes';

export interface AudimoteWorkerRequest {
  id: string;
  channelData: Float32Array;
  sampleRate: number;
}

export interface AudimoteWorkerResponse {
  id: string;
  success: boolean;
  profile?: AcousticProfile;
  error?: string;
}

let essentia: any = null;

function getEssentiaInstance() {
  if (!essentia) {
    essentia = new (Essentia as any)(EssentiaWASM);
  }
  return essentia;
}

function ensure44100(data: Float32Array, currentRate: number): Float32Array {
  if (!currentRate || currentRate === 44100) return data;
  const ratio = 44100 / currentRate;
  const newLen = Math.max(1, Math.round(data.length * ratio));
  const res = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const origPos = i / ratio;
    const idx0 = Math.floor(origPos);
    const idx1 = Math.min(data.length - 1, idx0 + 1);
    const frac = origPos - idx0;
    res[i] = data[idx0] * (1 - frac) + data[idx1] * frac;
  }
  return res;
}

self.onmessage = async (e: MessageEvent<AudimoteWorkerRequest>) => {
  const { id, channelData, sampleRate } = e.data;

  try {
    if (!channelData || channelData.length === 0) {
      throw new Error('Empty or invalid PCM channel data received');
    }

    const ess = getEssentiaInstance();

    // CRIT-04: Enforce exact 44,100 Hz input to Essentia C++ algorithms
    const pcmData44 = ensure44100(channelData, sampleRate);
    const signalVector = ess.arrayToVector(pcmData44);

    let bpm = 120;
    let bpmConfidence = 0.85;
    let bpmDetails: AcousticProfile['bpmDetails'] = undefined;
    let key = 'C';
    let scale: 'major' | 'minor' = 'major';
    let camelotCode = '8B';
    let rawDanceability = 0.5;
    let danceability = 0.5;
    let energy = 0.5;
    let valence = 0.0;
    let arousal = 0.0;
    let loudness = -12;
    let dynamicComplexity = 0;
    let centroid = 1200; // HIGH-02: Unified with calculateCalibratedValence default (1200 Hz)
    let instrumentalness = 0.1;
    let speechiness = 0.1;

    try {
      // 1. Timbral Brightness (Spectral Centroid in Hz)
      try {
        const scRes = ess.SpectralCentroidTime(signalVector);
        if (scRes && typeof scRes.centroid === 'number' && !isNaN(scRes.centroid)) {
          centroid = scRes.centroid;
        }
      } catch (scErr) {
        console.warn('[AudimoteWorker] SpectralCentroid fallback:', scErr);
      }

      // 2. Dynamic Complexity & Loudness
      try {
        const dcRes = ess.DynamicComplexity(signalVector);
        if (dcRes) {
          dynamicComplexity = dcRes.dynamicComplexity || 0;
          loudness = typeof dcRes.loudness === 'number' && !isNaN(dcRes.loudness) ? dcRes.loudness : -12;
        }
      } catch (dcErr) {
        console.warn('[AudimoteWorker] DynamicComplexity fallback:', dcErr);
      }

      // 3. Danceability (DEF-10: smooth sigmoid normalization centered at 1.8)
      try {
        const danceRes = ess.Danceability(signalVector);
        if (danceRes && typeof danceRes.danceability === 'number' && !isNaN(danceRes.danceability)) {
          const rawDfa = danceRes.danceability;
          const sigmoidDance = 1 / (1 + Math.exp(-1.6 * (rawDfa - 1.8)));
          rawDanceability = Math.max(0.05, Math.min(0.98, Math.round(sigmoidDance * 100) / 100));
        }
      } catch (danceErr) {
        console.warn('[AudimoteWorker] Danceability fallback:', danceErr);
      }

      // 4. Key & Scale
      try {
        const keyData = ess.KeyExtractor(signalVector);
        if (keyData && keyData.key) {
          key = keyData.key;
          scale = (keyData.scale || 'major').toLowerCase() === 'minor' ? 'minor' : 'major';
          camelotCode = getCamelotCode(key, scale);
        }
      } catch (keyErr) {
        console.warn('[AudimoteWorker] KeyExtractor fallback:', keyErr);
      }

      // Calculate Calibrated Perceived Energy with Stevens Power Law & Sub-Bass Presence Compensation
      const normalizedLoudness = Math.max(0, Math.min(1, (loudness + 28) / 22)); // -28 dB to -6 dB
      const powerLoudness = Math.pow(normalizedLoudness, 1.25);
      const brightnessFactor = Math.max(0, Math.min(1, centroid / 3500));
      const sparsityPenalty = Math.max(0, Math.min(0.40, (dynamicComplexity - 4) * 0.05));

      const subBassCompensation = (centroid < 1000 && dynamicComplexity < 5.0)
        ? Math.max(0, Math.min(0.18, ((1000 - centroid) / 1000) * powerLoudness * 0.25))
        : 0;

      const rawCalibratedEnergy = 
        (powerLoudness * 0.55) + 
        (brightnessFactor * 0.40) + 
        subBassCompensation - 
        sparsityPenalty;

      energy = Math.max(0.05, Math.min(1.0, Math.round(rawCalibratedEnergy * 100) / 100));

      // Continuous transient-weighted danceability modulation
      const transientActivity = 1 / (1 + Math.exp(-2.5 * (dynamicComplexity - 2.0)));
      const energyWeight = Math.min(1, Math.max(0.2, energy * 2.5));
      const confidenceScalar = Math.min(1.0, 0.40 + 0.60 * Math.sqrt(transientActivity * energyWeight));
      danceability = Math.max(0.05, Math.min(0.98, Math.round(rawDanceability * confidenceScalar * 100) / 100));

      // 5. 3-Tier Multi-Band Consensus Rhythm Engine with Vocal-Aware Octave Disambiguation
      try {
        let bpmRhythm = 120;
        let bpmPercival = 120;
        let bpmBass = 120;
        let rawConfidence = 2.0;
        let hasRhythm = false;
        let hasPercival = false;
        let hasBass = false;

        // Tier A: Full-Spectrum RhythmExtractor2013 (Multifeature Onset Tracking)
        try {
          const rhythm = ess.RhythmExtractor2013(signalVector, 208, 'multifeature', 40);
          if (rhythm && typeof rhythm.bpm === 'number' && !isNaN(rhythm.bpm) && rhythm.bpm > 0) {
            bpmRhythm = rhythm.bpm;
            hasRhythm = true;
            if (typeof rhythm.confidence === 'number' && !isNaN(rhythm.confidence)) {
              rawConfidence = rhythm.confidence;
            }
          }
        } catch (rhythmErr) {
          console.warn('[AudimoteWorker] RhythmExtractor2013 fallback:', rhythmErr);
        }

        // Tier B: Full-Spectrum PercivalBpmEstimator (Octave-Scale Energy Filterbank)
        try {
          const percival = ess.PercivalBpmEstimator(signalVector, 1024, 2048, 128, 128, 210, 50, 44100);
          if (percival && typeof percival.bpm === 'number' && !isNaN(percival.bpm) && percival.bpm > 0) {
            bpmPercival = percival.bpm;
            hasPercival = true;
          }
        } catch (percivalErr) {
          console.warn('[AudimoteWorker] PercivalBpmEstimator fallback:', percivalErr);
        }

        // Tier C: Low-Pass (180 Hz) Bass Pulse Estimator (Surgically strips vocal formants & consonants)
        try {
          const lpRes = ess.LowPass(signalVector, 180, 44100);
          if (lpRes && lpRes.signal) {
            try {
              const percivalBass = ess.PercivalBpmEstimator(lpRes.signal, 1024, 2048, 128, 128, 210, 40, 44100);
              if (percivalBass && typeof percivalBass.bpm === 'number' && !isNaN(percivalBass.bpm) && percivalBass.bpm > 0) {
                bpmBass = percivalBass.bpm;
                hasBass = true;
              }
            } finally {
              lpRes.signal.delete();
            }
          }
        } catch (bassErr) {
          console.warn('[AudimoteWorker] LowPass Bass pulse fallback:', bassErr);
        }

        const tolRhythm = Math.max(2.5, bpmRhythm * 0.03);
        const tolPercival = Math.max(2.5, bpmPercival * 0.03);
        const tolBass = Math.max(2.5, bpmBass * 0.03);

        let vocalFolded = false;
        const directAgreement = hasRhythm && hasPercival && Math.abs(bpmRhythm - bpmPercival) <= tolRhythm;

        if (directAgreement) {
          const consensus = (bpmRhythm + bpmPercival) / 2;
          bpmConfidence = Math.min(0.99, Math.max(0.40, (rawConfidence - 0.5) / 3.0 + 0.20));

          // Check if Bass confirms vocal octave doubling (Bass is 1/2 of full spectrum)
          const ratioToBass = consensus / bpmBass;
          if (hasBass && ratioToBass >= 1.88 && ratioToBass <= 2.12 && bpmBass >= 48 && bpmBass <= 95) {
            // Full-spectrum engines tracked 2x vocal syllables; low-pass reveals fundamental rhythm
            bpm = bpmBass;
            bpmConfidence = 0.92;
            vocalFolded = true;
          } else if (consensus >= 115 && consensus <= 145 && energy <= 0.45 && (dynamicComplexity >= 4.5 || danceability <= 0.45)) {
            // Vocal Ballad / Slow Jam / Ambient doubling:
            // A mellow, spacious track (E <= 0.45, DC >= 4.5) with apparent 115-145 BPM is tracking 8th note vocal phrasing.
            // True musical tempo is half-time (58 - 72 BPM).
            bpm = consensus / 2;
            bpmConfidence = 0.90;
            vocalFolded = true;
          } else {
            bpm = consensus;
          }
        } else if (hasRhythm && hasPercival) {
          // Octave discrepancy or disagreement
          const slowBpm = Math.min(bpmRhythm, bpmPercival);
          const fastBpm = Math.max(bpmRhythm, bpmPercival);
          const ratio = fastBpm / slowBpm;
          const isHarmonicOctave = (ratio >= 1.88 && ratio <= 2.12);

          if (isHarmonicOctave) {
            const bassConfirmsSlow = hasBass && (Math.abs(bpmBass - slowBpm) <= tolBass);
            const bassConfirmsFast = hasBass && (Math.abs(bpmBass - fastBpm) <= tolBass);

            if (bassConfirmsSlow && !bassConfirmsFast) {
              // Kick/Bass confirms the slow tempo!
              // High-energy driving tracks (Fast Rock, Punk, DnB, Hardstyle: fastBpm >= 150 with energy >= 0.70)
              // preserve the fast tempo rather than being dragged down to half-time.
              // Mellow/vocal tracks (ballads, R&B, pop, acoustic with energy < 0.70) select the slow fundamental.
              if (fastBpm >= 150 && energy >= 0.70) {
                bpm = fastBpm;
                bpmConfidence = 0.92;
              } else {
                bpm = (slowBpm + bpmBass) / 2;
                bpmConfidence = 0.93;
                vocalFolded = (fastBpm === bpmRhythm);
              }
            } else if (bassConfirmsFast) {
              // Bass confirms fast tempo (e.g. 160 BPM fast rock / punk)
              if (energy <= 0.45 && slowBpm >= 45 && slowBpm <= 90) {
                bpm = slowBpm;
                bpmConfidence = 0.90;
                vocalFolded = true;
              } else {
                bpm = fastBpm;
                bpmConfidence = 0.92;
              }
            } else {
              // Bass ambiguous (e.g. pure a cappella or acoustic)
              if (fastBpm >= 140 && energy > 0.65) {
                bpm = fastBpm;
                bpmConfidence = 0.88;
              } else if (slowBpm >= 55 && slowBpm <= 100) {
                bpm = slowBpm;
                bpmConfidence = 0.90;
                vocalFolded = (fastBpm === bpmRhythm);
              } else {
                bpm = slowBpm;
                bpmConfidence = 0.80;
              }
            }
          } else {
            // Non-harmonic disagreement
            if (hasBass && Math.abs(bpmBass - bpmPercival) <= tolBass) {
              bpm = (bpmPercival + bpmBass) / 2;
              bpmConfidence = 0.85;
            } else if (hasBass && Math.abs(bpmBass - bpmRhythm) <= tolRhythm) {
              bpm = (bpmRhythm + bpmBass) / 2;
              bpmConfidence = 0.85;
            } else {
              bpm = bpmRhythm;
              bpmConfidence = Math.max(0.20, Math.min(0.80, (rawConfidence - 0.5) / 3.5));
            }
          }
        } else if (hasRhythm) {
          bpm = bpmRhythm;
          bpmConfidence = Math.max(0.20, Math.min(0.90, (rawConfidence - 0.5) / 3.2));
        } else if (hasPercival) {
          bpm = bpmPercival;
          bpmConfidence = 0.70;
        }

        bpm = Math.round(bpm * 10) / 10;
        bpmConfidence = Math.round(bpmConfidence * 100) / 100;

        bpmDetails = {
          rhythmBpm: Math.round(bpmRhythm * 10) / 10,
          percivalBpm: Math.round(bpmPercival * 10) / 10,
          bassBpm: Math.round(bpmBass * 10) / 10,
          vocalFolded,
        };
      } catch (rhythmErr) {
        console.warn('[AudimoteWorker] Rhythm arbitration fallback:', rhythmErr);
      }
    } finally {
      // DEF-02: Guaranteed C++ Wasm memory deallocation on ALL code/exception paths
      try {
        signalVector.delete();
      } catch (freeErr) {
        console.warn('[AudimoteWorker] Failed to deallocate signalVector:', freeErr);
      }
    }

    // Canonical Single-Source-of-Truth Valence & Arousal Models
    valence = calculateCalibratedValence({
      scale,
      danceability,
      spectralCentroid: centroid,
      bpm,
      energy,
    });

    arousal = calculateCalibratedArousal({
      bpm,
      energy,
    });

    // Continuous Speechiness & Instrumentalness Psychoacoustic Estimation
    // Human speech formants reside in 350 - 2800 Hz corridor with dynamic pauses and low rhythmic regularity
    const formantMatch = (centroid >= 350 && centroid <= 2800)
      ? 1 - Math.abs(centroid - 1400) / 1400
      : 0.1;
    const pausesFactor = Math.min(1, Math.max(0, (dynamicComplexity - 2.5) / 4.0));
    const nonRhythmicFactor = Math.max(0, 1.0 - danceability * 1.5);
    
    speechiness = Math.max(0.02, Math.min(0.95,
      Math.round((formantMatch * 0.40 + pausesFactor * 0.35 + nonRhythmicFactor * 0.25) * 100) / 100
    ));

    const vocalPenalty = speechiness > 0.4 ? (speechiness - 0.4) * 1.6 : 0;
    instrumentalness = Math.max(0.05, Math.min(0.98,
      Math.round((0.55 + (1 - speechiness) * 0.35 - vocalPenalty) * 100) / 100
    ));

    const profile: AcousticProfile = {
      bpm,
      bpmConfidence,
      bpmDetails,
      musicalKey: key,
      key,
      scale,
      camelot: camelotCode,
      camelotCode,
      energy: Math.round(energy * 100) / 100,
      danceability: Math.round(danceability * 100) / 100,
      valence,
      arousal,
      loudness: Math.round(loudness * 10) / 10,
      instrumentalness: Math.round(instrumentalness * 100) / 100,
      speechiness: Math.round(speechiness * 100) / 100,
      spectralCentroid: Math.round(centroid * 10) / 10, // DEF-14: Populated
      durationSec: Math.round((channelData.length / sampleRate) * 10) / 10,
      analyzedAt: Date.now(),
      analysisEngine: 'Essentia.js Wasm (Client-Side)',
      source: 'itunes_preview',
    };

    const response: AudimoteWorkerResponse = {
      id,
      success: true,
      profile,
    };

    self.postMessage(response);
  } catch (err: any) {
    console.error('[AudimoteWorker] Analysis error:', err);
    const response: AudimoteWorkerResponse = {
      id,
      success: false,
      error: err?.message || String(err),
    };
    self.postMessage(response);
  }
};
