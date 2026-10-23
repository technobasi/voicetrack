export type PitchZone = 'feminin' | 'androgyn' | 'maskulin' | 'out_of_range';

export interface VoiceSettings {
  masculineMinHz: number;
  masculineMaxHz: number;
  androgynousMinHz: number;
  androgynousMaxHz: number;
  feminineMinHz: number;
  feminineMaxHz: number;
  targetMinHz: number;
  targetMaxHz: number;
  showTargetCorridor: boolean;
  noiseGateDb: number;
  clarityThreshold: number;
  dropAlertSeconds: number;
  enableDropAlert: boolean;
  smartPauseCompress: boolean;
  selectedDeviceId: string;
  rawAudioMode: boolean;
  graphMinHz: number;
  graphMaxHz: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  masculineMinHz: 85,
  masculineMaxHz: 165,
  androgynousMinHz: 165,
  androgynousMaxHz: 185,
  feminineMinHz: 185,
  feminineMaxHz: 255,
  targetMinHz: 185,
  targetMaxHz: 225,
  showTargetCorridor: true,
  noiseGateDb: -46,
  clarityThreshold: 0.65,
  dropAlertSeconds: 2.5,
  enableDropAlert: true,
  smartPauseCompress: false,
  selectedDeviceId: '',
  rawAudioMode: true,
  graphMinHz: 50,
  graphMaxHz: 450,
};

export interface NoteInfo {
  noteName: string; // e.g., "G3"
  pitchClass: string; // e.g., "G"
  octave: number; // e.g., 3
  midi: number; // e.g., 55
  cents: number; // -50 to +50
  exactNoteHz: number;
}

export interface PitchSample {
  timestamp: number;
  speakingTimeMs: number;
  hz: number | null;
  clarity: number;
  volumeDb: number;
  zone: PitchZone | null;
  inTarget: boolean;
  f1Hz: number | null;
  f2Hz: number | null;
  brightness: number; // 0..100
}

export interface SessionStats {
  meanHz: number;
  medianHz: number;
  minHz: number;
  maxHz: number;
  stdDevHz: number;
  semitoneRange: number;
  femininePercent: number;
  androgynousPercent: number;
  masculinePercent: number;
  targetHitPercent: number;
  meanF1Hz: number;
  meanF2Hz: number;
  meanBrightness: number;
  totalDurationSec: number;
  activeSpeakingSec: number;
  voicedSampleCount: number;
}

export type SessionType = 'discord-live' | 'reading' | 'exercise';

export interface CompactPitchPoint {
  t: number; // relative seconds
  hz: number | null;
  f2?: number | null;
  b?: number;
}

export interface TrainingSessionRecord {
  id: string;
  createdAt: string;
  type: SessionType;
  title: string;
  tags: string[];
  notes: string;
  stats: SessionStats;
  pitchTrace: CompactPitchPoint[];
}

export interface ReadingPassage {
  id: string;
  title: string;
  category: 'standard' | 'discord' | 'resonanz' | 'custom';
  difficulty: 'leicht' | 'mittel' | 'fortgeschritten';
  focusTip: string;
  content: string;
}

export type DemoVoiceProfile = 'off' | 'feminin' | 'androgyn' | 'maskulin' | 'discord-dialog';
