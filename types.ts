export interface ProcessedTrack {
  path: string;
  metadata: string; // The #EXTINF line
  score: number;
}

export interface ProcessingLog {
  timestamp: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
}

export interface SieveFile {
  fileName: string;
  content: string;
  count: number;
  score: number;
}

export interface SieveResult {
  files: SieveFile[];
  logs: ProcessingLog[];
  success: boolean;
}

export interface FileGroup {
  tiers: File[];
  penalties: File[];
  anchor: File | null;
}