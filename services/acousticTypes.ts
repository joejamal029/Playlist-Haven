/**
 * Audimote Acoustic & Emotional Intelligence Types
 * Standardized schema for client-side audio analysis (Essentia.js Wasm + iTunes 30s previews)
 */

export interface AcousticProfile {
  bpm: number;
  bpmConfidence?: number;
  bpmDetails?: {
    rhythmBpm: number;
    percivalBpm: number;
    bassBpm: number;
    vocalFolded?: boolean;
  };
  musicalKey: string;          // e.g. "C", "F#", "Bb"
  key?: string;                // alias for musicalKey
  scale: 'major' | 'minor';
  camelot: string;             // e.g. "8B", "11A", "4A"
  camelotCode?: string;        // alias for camelot
  energy: number;              // 0.0 to 1.0 (dynamics & intensity)
  danceability: number;        // 0.0 to 1.0 (rhythmic regularity & beat prominence)
  valence: number;             // -1.0 (melancholic/somber) to +1.0 (euphoric/joyful)
  arousal: number;             // -1.0 (calm/serene) to +1.0 (frantic/high-energy)
  instrumentalness: number;    // 0.0 to 1.0 (fraction of non-vocal audio)
  loudness?: number;
  speechiness?: number;
  durationSec?: number;
  analysisEngine?: string;
  spectralCentroid?: number;   // Timbre brightness (Hz)
  analyzedAt: number;
  source?: 'itunes_preview' | 'local_file';
}

export type AudimoteAnalysisStatus = 
  | 'idle' 
  | 'pending'
  | 'resolving_stream' 
  | 'decoding_audio' 
  | 'analyzing'
  | 'analyzing_wasm' 
  | 'complete' 
  | 'completed'
  | 'error';

export interface AudimoteTrackItem {
  id: string;                  // artist:::title compound key
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  coverArtUrl?: string;
  audioPreviewUrl?: string;
  previewUrl?: string;
  localFile?: File;
  file?: File;
  acousticProfile?: AcousticProfile;
  profile?: AcousticProfile;
  status: AudimoteAnalysisStatus;
  errorReason?: string;
  errorMessage?: string;
}

/**
 * Standard Camelot System Mapping
 * Maps (Musical Key + Scale) to Camelot code (1A - 12B)
 */
export const CAMELOT_KEY_MAP: Record<string, string> = {
  // Major keys (B series - outer wheel)
  'B major': '1B',
  'F# major': '2B',
  'Gb major': '2B',
  'Db major': '3B',
  'C# major': '3B',
  'Ab major': '4B',
  'G# major': '4B',
  'Eb major': '5B',
  'D# major': '5B',
  'Bb major': '6B',
  'A# major': '6B',
  'F major': '7B',
  'C major': '8B',
  'G major': '9B',
  'D major': '10B',
  'A major': '11B',
  'E major': '12B',

  // Minor keys (A series - inner wheel)
  'Ab minor': '1A',
  'G# minor': '1A',
  'Eb minor': '2A',
  'D# minor': '2A',
  'Bb minor': '3A',
  'A# minor': '3A',
  'F minor': '4A',
  'C minor': '5A',
  'G minor': '6A',
  'D minor': '7A',
  'A minor': '8A',
  'E minor': '9A',
  'B minor': '10A',
  'F# minor': '11A',
  'Gb minor': '11A',
  'Db minor': '12A',
  'C# minor': '12A',
};

export function getCamelotCode(key: string, scale: 'major' | 'minor'): string {
  const normalized = `${key.trim()} ${scale.toLowerCase()}`;
  return CAMELOT_KEY_MAP[normalized] || '8B'; // Default C Major fallback
}

export interface CamelotKeyDetails {
  code: string;           // e.g. "8B"
  musicalKey: string;     // e.g. "C"
  scale: 'major' | 'minor';
  shortName: string;      // e.g. "C" or "Am"
  fullName: string;       // e.g. "C Major" or "A Minor"
}

/**
 * Authoritative Bidirectional Mapping: Camelot Code (1A - 12B) to Musical Key details
 */
export const CAMELOT_TO_KEY_MAP: Record<string, CamelotKeyDetails> = {
  // Major keys (B series - Outer Wheel)
  '1B': { code: '1B', musicalKey: 'B', scale: 'major', shortName: 'B', fullName: 'B Major' },
  '2B': { code: '2B', musicalKey: 'F#', scale: 'major', shortName: 'F#', fullName: 'F# Major' },
  '3B': { code: '3B', musicalKey: 'Db', scale: 'major', shortName: 'Db', fullName: 'Db Major' },
  '4B': { code: '4B', musicalKey: 'Ab', scale: 'major', shortName: 'Ab', fullName: 'Ab Major' },
  '5B': { code: '5B', musicalKey: 'Eb', scale: 'major', shortName: 'Eb', fullName: 'Eb Major' },
  '6B': { code: '6B', musicalKey: 'Bb', scale: 'major', shortName: 'Bb', fullName: 'Bb Major' },
  '7B': { code: '7B', musicalKey: 'F', scale: 'major', shortName: 'F', fullName: 'F Major' },
  '8B': { code: '8B', musicalKey: 'C', scale: 'major', shortName: 'C', fullName: 'C Major' },
  '9B': { code: '9B', musicalKey: 'G', scale: 'major', shortName: 'G', fullName: 'G Major' },
  '10B': { code: '10B', musicalKey: 'D', scale: 'major', shortName: 'D', fullName: 'D Major' },
  '11B': { code: '11B', musicalKey: 'A', scale: 'major', shortName: 'A', fullName: 'A Major' },
  '12B': { code: '12B', musicalKey: 'E', scale: 'major', shortName: 'E', fullName: 'E Major' },

  // Minor keys (A series - Inner Wheel)
  '1A': { code: '1A', musicalKey: 'Ab', scale: 'minor', shortName: 'Abm', fullName: 'Ab Minor' },
  '2A': { code: '2A', musicalKey: 'Eb', scale: 'minor', shortName: 'Ebm', fullName: 'Eb Minor' },
  '3A': { code: '3A', musicalKey: 'Bb', scale: 'minor', shortName: 'Bbm', fullName: 'Bb Minor' },
  '4A': { code: '4A', musicalKey: 'F', scale: 'minor', shortName: 'Fm', fullName: 'F Minor' },
  '5A': { code: '5A', musicalKey: 'C', scale: 'minor', shortName: 'Cm', fullName: 'C Minor' },
  '6A': { code: '6A', musicalKey: 'G', scale: 'minor', shortName: 'Gm', fullName: 'G Minor' },
  '7A': { code: '7A', musicalKey: 'D', scale: 'minor', shortName: 'Dm', fullName: 'D Minor' },
  '8A': { code: '8A', musicalKey: 'A', scale: 'minor', shortName: 'Am', fullName: 'A Minor' },
  '9A': { code: '9A', musicalKey: 'E', scale: 'minor', shortName: 'Em', fullName: 'E Minor' },
  '10A': { code: '10A', musicalKey: 'B', scale: 'minor', shortName: 'Bm', fullName: 'B Minor' },
  '11A': { code: '11A', musicalKey: 'F#', scale: 'minor', shortName: 'F#m', fullName: 'F# Minor' },
  '12A': { code: '12A', musicalKey: 'Db', scale: 'minor', shortName: 'Dbm', fullName: 'Db Minor' },
};

export interface HarmonicRelationship {
  type: 'exact' | 'relative' | 'adjacent_subdominant' | 'adjacent_dominant' | 'energy_boost' | 'incompatible';
  label: string;
  shortLabel: string;
  description: string;
  badgeColor: string;
}

export function getHarmonicRelationship(baseKey: string, targetKey: string): HarmonicRelationship {
  if (!baseKey || !targetKey) {
    return { type: 'incompatible', label: 'Incompatible', shortLabel: 'Divergent', description: 'Harmonically divergent key', badgeColor: 'text-slate-500' };
  }
  if (baseKey === targetKey) {
    return { type: 'exact', label: 'Exact Match', shortLabel: 'Exact', description: 'Identical key and scale', badgeColor: 'text-emerald-400' };
  }

  const numA = parseInt(baseKey, 10);
  const letterA = baseKey.trim().slice(-1).toUpperCase();
  const numB = parseInt(targetKey, 10);
  const letterB = targetKey.trim().slice(-1).toUpperCase();

  if (isNaN(numA) || isNaN(numB) || numA < 1 || numA > 12 || numB < 1 || numB > 12) {
    return { type: 'incompatible', label: 'Incompatible', shortLabel: 'Divergent', description: 'Invalid Camelot range', badgeColor: 'text-slate-500' };
  }

  // Relative Major/Minor flip (e.g. 8B <-> 8A)
  if (numA === numB && letterA !== letterB) {
    return {
      type: 'relative',
      label: letterB === 'A' ? 'Relative Minor' : 'Relative Major',
      shortLabel: 'Relative',
      description: 'Modal shift sharing all scale notes',
      badgeColor: 'text-indigo-400',
    };
  }

  if (letterA === letterB) {
    const diff = ((numB - numA) % 12 + 12) % 12;
    if (diff === 1) {
      return {
        type: 'adjacent_dominant',
        label: '+1 Dominant (Fifth)',
        shortLabel: '+1 Fifth',
        description: 'Smooth energy lift clockwise',
        badgeColor: 'text-cyan-400',
      };
    }
    if (diff === 11) {
      return {
        type: 'adjacent_subdominant',
        label: '-1 Subdominant (Fourth)',
        shortLabel: '-1 Fourth',
        description: 'Smooth harmonic descent counter-clockwise',
        badgeColor: 'text-sky-400',
      };
    }
    if (diff === 2) {
      return {
        type: 'energy_boost',
        label: '+2 Energy Boost',
        shortLabel: '+2 Boost',
        description: 'Dramatic whole-step key jump',
        badgeColor: 'text-amber-400',
      };
    }
  }

  return { type: 'incompatible', label: 'Incompatible', shortLabel: 'Divergent', description: 'Harmonically divergent key', badgeColor: 'text-slate-500' };
}

export function getHarmonicCompatibleKeys(camelotCode: string): {
  exact: string;
  relative: string;
  adjacentSubdominant: string;
  adjacentDominant: string;
  energyBoost: string;
  allCompatible: string[];
} {
  const num = parseInt(camelotCode, 10);
  const letter = camelotCode.trim().slice(-1).toUpperCase();
  if (isNaN(num) || num < 1 || num > 12) {
    return { exact: '', relative: '', adjacentSubdominant: '', adjacentDominant: '', energyBoost: '', allCompatible: [] };
  }

  const oppositeLetter = letter === 'B' ? 'A' : 'B';
  const relative = `${num}${oppositeLetter}`;
  const subdominantNum = ((num - 2 + 12) % 12) + 1; // num - 1 with 1 wrapping to 12
  const dominantNum = (num % 12) + 1;             // num + 1 with 12 wrapping to 1
  const boostNum = ((num + 1) % 12) + 1;          // num + 2 with 11->1, 12->2

  const adjacentSubdominant = `${subdominantNum}${letter}`;
  const adjacentDominant = `${dominantNum}${letter}`;
  const energyBoost = `${boostNum}${letter}`;

  return {
    exact: camelotCode,
    relative,
    adjacentSubdominant,
    adjacentDominant,
    energyBoost,
    allCompatible: [camelotCode, relative, adjacentSubdominant, adjacentDominant, energyBoost],
  };
}

export const AFFECTIVE_DELTA = 0.18;

/**
 * Computes continuous Arousal (-1.0 to +1.0) using integrated BPM tempo push and perceived energy.
 * Fast pulse (> 110 BPM) and high energy drive arousal positive (kinetic excitement);
 * slow tempo and subdued dynamics drive arousal negative (calm/stillness).
 */
export function calculateCalibratedArousal(params: {
  bpm?: number;
  energy?: number;
}): number {
  let bpm = params.bpm ?? 120;
  const energy = params.energy ?? 0.5;

  // Octave Ambiguity Mitigation:
  // If a track has very subdued energy (< 0.25) but detected BPM > 130,
  // it is typically a double-time subdivision artifact (e.g. acoustic fingerpicking or ambient arpeggios).
  // Fold down by 1 octave to fundamental perceived tempo.
  if (energy < 0.25 && bpm > 130) {
    bpm = bpm / 2;
  } else if (energy > 0.80 && bpm < 75) {
    bpm = bpm * 2;
  }

  const bpmPush = Math.max(-0.45, Math.min(0.45, ((bpm - 110) / 80) * 0.50));
  const energyPush = (energy - 0.50) * 1.20;
  const rawArousal = bpmPush + energyPush;
  return Math.max(-1.0, Math.min(1.0, Math.round(rawArousal * 100) / 100));
}

/**
 * Recomputes continuous Valence (-1.0 to +1.0) using balanced multi-feature acoustic weighting.
 * Harmonic mode provides a gentle tonal bias (+0.15 major / -0.14 minor, gap = 0.29) that can be
 * overridden by strong danceability, spectral warmth/brightness, tension, or harshness signals.
 * This prevents scale-correlated clustering where Minor keys pile left and Major keys pile right.
 */
export function calculateCalibratedValence(params: {
  scale?: 'major' | 'minor' | string;
  danceability?: number;
  spectralCentroid?: number;
  bpm?: number;
  energy?: number;
}): number {
  const scale = params.scale || 'major';
  const danceability = params.danceability ?? 0.5;
  const centroid = params.spectralCentroid ?? 1200;
  const energy = params.energy ?? 0.5;

  // 1. Harmonic Mode Foundation: Gentle tonal bias, NOT the dominant driver.
  // Major consonance nudges positive (+0.15); Minor sombreness nudges negative (-0.14).
  // Gap reduced from 0.47 to 0.29 so acoustic features can override key/scale bias.
  const modeBonus = scale === 'major' ? 0.15 : -0.14;

  // 2. Danceability & Rhythmic Groove (PRIMARY valence driver):
  // High danceability (> 0.45) provides a strong uplifting boost (up to +0.58)
  // Low danceability carries a moderate negative pull, preventing "dead air" from reading positive
  const danceBonus = danceability >= 0.45
    ? (danceability - 0.45) * 1.05
    : (danceability - 0.45) * 0.14;

  // 3. Spectral Brightness vs Warmth:
  // Centered at 1200 Hz: acoustic warmth (1000-1400 Hz) is gentle/peaceful
  // Wider range [-0.12, 0.20] so timbral color has more influence on valence spread
  const brightnessBonus = Math.max(-0.12, Math.min(0.20, (centroid - 1200) / 2800));

  // 4. Tension Factor (High Energy + Low Danceability):
  // Frantic, chaotic, ungrooved energy creates strong negative tension
  const tensionPenalty = (energy > 0.50 && danceability < 0.50)
    ? (energy - 0.50) * (0.50 - danceability) * 2.5
    : 0;

  // 5. Harshness / Distortion Factor (HIGH-03):
  // High Energy + High Centroid (> 1900 Hz) indicates acoustic distortion / timbral roughness.
  // Minor receives full penalty (1.0x); Major receives 0.70x penalty so aggressive punk/metal in major is properly constrained.
  const harshnessScale = scale === 'minor' ? 1.0 : 0.70;
  const harshnessPenalty = (energy > 0.55 && centroid > 1900)
    ? ((centroid - 1900) / 2000) * (energy - 0.45) * 0.55 * harshnessScale
    : 0;

  const rawValence = modeBonus + danceBonus + brightnessBonus - tensionPenalty - harshnessPenalty;
  return Math.max(-1.0, Math.min(1.0, Math.round(rawValence * 100) / 100));
}

/**
 * Checks if two Camelot keys are harmonically compatible for DJ mixing
 * Rules:
 * 1. Exact key match (e.g. 8B <-> 8B)
 * 2. Relative Major/Minor flip (e.g. 8A <-> 8B)
 * 3. Adjacent fifths +/- 1 on wheel (e.g. 8B <-> 7B or 9B, with 12 wrapping to 1)
 * 4. Energy Boost +2 jump (e.g. 8B <-> 10B, with 11/12 wrapping to 1/2)
 */
export function isHarmonicallyCompatible(keyA: string, keyB: string): boolean {
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  
  const numA = parseInt(keyA, 10);
  const letterA = keyA.trim().slice(-1).toUpperCase();
  const numB = parseInt(keyB, 10);
  const letterB = keyB.trim().slice(-1).toUpperCase();

  // DEF-09: Strict validation of Camelot range (1-12) and mode letter (A or B)
  if (isNaN(numA) || isNaN(numB)) return false;
  if (numA < 1 || numA > 12 || numB < 1 || numB > 12) return false;
  if (letterA !== 'A' && letterA !== 'B') return false;
  if (letterB !== 'A' && letterB !== 'B') return false;

  // 1 & 2. Same number: relative major/minor flip (e.g. 8A <-> 8B)
  if (numA === numB) {
    return true; // either same key or relative major/minor
  }

  // 3 & 4. Same mode letter: check circular modular distance on the 12-segment wheel
  if (letterA === letterB) {
    const diff = ((numA - numB) % 12 + 12) % 12; // always in [0, 11]
    // Rule 3: Adjacent fifths (+/- 1)
    if (diff === 1 || diff === 11) return true;
    // Rule 4 (DEF-08): Energy Boost (+2 / -10)
    if (diff === 2 || diff === 10) return true;
  }

  return false;
}

export type ClassicMoodQuadrant = 'euphoric' | 'tense' | 'melancholic' | 'peaceful';

export type AffectiveMoodCategory = 
  | 'euphoric' 
  | 'driving' 
  | 'tense' 
  | 'moody' 
  | 'melancholic' 
  | 'bittersweet' 
  | 'peaceful' 
  | 'sunny' 
  | 'balanced';

export interface AffectiveMoodInfo {
  category: AffectiveMoodCategory;
  label: string;               // e.g. "Bittersweet", "Peaceful", "Balanced"
  subtitle: string;            // e.g. "Contemplative · Nostalgic"
  badgeClass: string;          // Tailwind badge classes with dedicated border/background colors
  isBoundary: boolean;         // true if track sits within the transition overlap band
  primaryQuadrant: ClassicMoodQuadrant;
  secondaryQuadrant?: ClassicMoodQuadrant; // Macro 4-quadrant orientation of 3x3 boundary cells
  adjacentQuadrant?: ClassicMoodQuadrant;  // Adjacent 4-quadrant across zero-axis boundary
  salience: number;            // r in [0, 1.41]
  angleDeg: number;            // theta in [0, 360)
}

/**
 * Computes standard 4-quadrant mood classification
 */
export function get4Quadrant(valence: number, arousal: number): ClassicMoodQuadrant {
  const v = Math.max(-1.0, Math.min(1.0, valence || 0));
  const a = Math.max(-1.0, Math.min(1.0, arousal || 0));
  if (v >= 0 && a >= 0) return 'euphoric';
  if (v < 0 && a >= 0) return 'tense';
  if (v < 0 && a < 0) return 'melancholic';
  return 'peaceful';
}

/**
 * Dual-Layer Affective Mood Resolver
 * Computes continuous polar coordinates (salience r, mood angle theta)
 * Resolves the 9-cell Cartesian Affective Matrix while preserving the classic 4-quadrant root.
 */
export function getAffectiveMood(valence: number, arousal: number): AffectiveMoodInfo {
  const v = Math.max(-1.0, Math.min(1.0, valence || 0));
  const a = Math.max(-1.0, Math.min(1.0, arousal || 0));
  const primaryQuadrant = get4Quadrant(v, a);

  const salience = Math.round(Math.sqrt(v * v + a * a) * 100) / 100;
  const angleDeg = Math.round(((Math.atan2(a, v) * 180 / Math.PI + 360) % 360) * 10) / 10;

  // 1. Central Neutral Core (Strict Cartesian Box: |v| <= AFFECTIVE_DELTA && |a| <= AFFECTIVE_DELTA)
  // Remediates CRIT-03: Pure 3x3 Cartesian cell, eliminating circular theft of edge tracks
  if (Math.abs(v) <= AFFECTIVE_DELTA && Math.abs(a) <= AFFECTIVE_DELTA) {
    return {
      category: 'balanced',
      label: 'Balanced',
      subtitle: 'Ambient · Centered',
      badgeClass: 'bg-slate-800/80 text-slate-300 border border-slate-700/60',
      isBoundary: true,
      primaryQuadrant,
      secondaryQuadrant: primaryQuadrant,
      adjacentQuadrant: primaryQuadrant,
      salience,
      angleDeg,
    };
  }

  // 2. High Arousal (a > AFFECTIVE_DELTA)
  if (a > AFFECTIVE_DELTA) {
    if (v < -AFFECTIVE_DELTA) {
      return {
        category: 'tense',
        label: 'Tense',
        subtitle: 'Aggressive · Dark Energy',
        badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
        isBoundary: false,
        primaryQuadrant: 'tense',
        salience,
        angleDeg,
      };
    }
    if (v > AFFECTIVE_DELTA) {
      return {
        category: 'euphoric',
        label: 'Euphoric',
        subtitle: 'Exuberant · High Energy',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        isBoundary: false,
        primaryQuadrant: 'euphoric',
        salience,
        angleDeg,
      };
    }
    // High Arousal + Neutral Valence (|v| <= AFFECTIVE_DELTA): Driving ⚡
    // Remediates CRIT-01: Correctly points secondaryQuadrant to the adjacent 3x3 corner
    return {
      category: 'driving',
      label: 'Driving',
      subtitle: 'Kinetic · High Arousal',
      badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
      isBoundary: true,
      primaryQuadrant,
      secondaryQuadrant: v >= 0 ? 'euphoric' : 'tense', // leaning right toward Euphoric vs left toward Tense
      adjacentQuadrant: v >= 0 ? 'tense' : 'euphoric',   // cross-axis neighbor in 4-quadrant mode
      salience,
      angleDeg,
    };
  }

  // 3. Low Arousal (a < -AFFECTIVE_DELTA)
  if (a < -AFFECTIVE_DELTA) {
    if (v < -AFFECTIVE_DELTA) {
      return {
        category: 'melancholic',
        label: 'Melancholic',
        subtitle: 'Somber · Downtempo',
        badgeClass: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
        isBoundary: false,
        primaryQuadrant: 'melancholic',
        salience,
        angleDeg,
      };
    }
    if (v > AFFECTIVE_DELTA) {
      return {
        category: 'peaceful',
        label: 'Peaceful',
        subtitle: 'Serene · Deep Focus',
        badgeClass: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
        isBoundary: false,
        primaryQuadrant: 'peaceful',
        salience,
        angleDeg,
      };
    }
    // Low Arousal + Neutral Valence (|v| <= AFFECTIVE_DELTA): Bittersweet 🌸
    // Remediates CRIT-01: Correctly points secondaryQuadrant to the adjacent 3x3 corner
    return {
      category: 'bittersweet',
      label: 'Bittersweet',
      subtitle: 'Contemplative · Nostalgic',
      badgeClass: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
      isBoundary: true,
      primaryQuadrant,
      secondaryQuadrant: v >= 0 ? 'peaceful' : 'melancholic', // leaning right toward Peaceful vs left toward Melancholic
      adjacentQuadrant: v >= 0 ? 'melancholic' : 'peaceful',   // cross-axis neighbor in 4-quadrant mode
      salience,
      angleDeg,
    };
  }

  // 4. Mid Arousal (|a| <= AFFECTIVE_DELTA)
  if (v < -AFFECTIVE_DELTA) {
    // Negative Valence + Mid Arousal: Moody
    // Remediates CRIT-01: Correctly points secondaryQuadrant to the adjacent 3x3 corner
    return {
      category: 'moody',
      label: 'Moody',
      subtitle: 'Restless · Uneasy',
      badgeClass: 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30',
      isBoundary: true,
      primaryQuadrant,
      secondaryQuadrant: a >= 0 ? 'tense' : 'melancholic', // leaning up toward Tense vs down toward Melancholic
      adjacentQuadrant: a >= 0 ? 'melancholic' : 'tense',   // cross-axis neighbor in 4-quadrant mode
      salience,
      angleDeg,
    };
  }

  // Positive Valence + Mid Arousal (v > AFFECTIVE_DELTA): Sunny ☀️
  // Remediates CRIT-01: Correctly points secondaryQuadrant to the adjacent 3x3 corner
  return {
    category: 'sunny',
    label: 'Sunny',
    subtitle: 'Warm · Gentle Groove',
    badgeClass: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    isBoundary: true,
    primaryQuadrant,
    secondaryQuadrant: a >= 0 ? 'euphoric' : 'peaceful', // leaning up toward Euphoric vs down toward Peaceful
    adjacentQuadrant: a >= 0 ? 'peaceful' : 'euphoric',   // cross-axis neighbor in 4-quadrant mode
    salience,
    angleDeg,
  };
}
