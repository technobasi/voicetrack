import {
  NoteInfo,
  PitchSample,
  PitchZone,
  SessionStats,
  VoiceSettings,
} from '../types/voice';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface RawPitchDetection {
  hz: number | null;
  clarity: number;
  volumeDb: number;
}

export interface ResonanceEstimate {
  f1Hz: number | null;
  f2Hz: number | null;
  brightness: number; // 0..100
}

/**
 * Calculates RMS and dBFS from time-domain audio samples.
 */
export function calculateVolumeDb(buffer: Float32Array): number {
  if (buffer.length === 0) return -100;
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i];
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / buffer.length);
  if (rms <= 1e-5) return -100;
  return Math.max(-100, 20 * Math.log10(rms));
}

/**
 * High-precision fundamental frequency (F0) detector using the YIN
 * Cumulative Mean Normalized Difference Function (CMNDF) with parabolic interpolation.
 */
export function detectPitchYin(
  buffer: Float32Array,
  sampleRate: number,
  minHz = 50,
  maxHz = 450,
  noiseGateDb = -50,
  clarityThreshold = 0.75
): RawPitchDetection {
  const halfLength = Math.floor(buffer.length / 2);
  // Use a focused ~20ms correlation window at the END (newest samples) of the buffer
  const corrWindow = Math.min(halfLength, Math.max(480, Math.floor(sampleRate * 0.02)));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxTau = Math.min(halfLength - 2, Math.ceil(sampleRate / minHz));

  if (maxTau <= minTau) {
    return { hz: null, clarity: 0, volumeDb: -100 };
  }

  // Always analyze the most recent samples at the tail of the time-domain buffer
  const startOffset = Math.max(0, buffer.length - corrWindow - maxTau - 2);
  const recentSlice = buffer.subarray(startOffset);
  const volumeDb = calculateVolumeDb(recentSlice);
  if (volumeDb < noiseGateDb) {
    return { hz: null, clarity: 0, volumeDb };
  }

  const yinBuffer = new Float32Array(maxTau + 1);
  yinBuffer[0] = 1;

  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let diffSum = 0;
    for (let i = 0; i < corrWindow; i++) {
      const delta = buffer[startOffset + i] - buffer[startOffset + i + tau];
      diffSum += delta * delta;
    }
    runningSum += diffSum;
    yinBuffer[tau] = runningSum > 0 ? (diffSum * tau) / runningSum : 1;
  }

  // Max allowed CMNDF value corresponds to 1 - clarityThreshold
  const yinThreshold = Math.max(0.12, Math.min(0.52, 1 - clarityThreshold * 0.85));
  let bestTau = -1;

  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yinBuffer[tau] < yinThreshold) {
      while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
  }

  // Fallback to global minimum if it is still reasonably periodic
  if (bestTau === -1) {
    let minVal = Infinity;
    let minIdx = -1;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (yinBuffer[tau] < minVal) {
        minVal = yinBuffer[tau];
        minIdx = tau;
      }
    }
    if (minIdx !== -1 && minVal < Math.min(0.52, yinThreshold * 1.45)) {
      bestTau = minIdx;
    }
  }

  if (bestTau === -1) {
    return { hz: null, clarity: 0, volumeDb };
  }

  // Parabolic interpolation around bestTau for sub-sample precision
  let refinedTau = bestTau;
  if (bestTau > 1 && bestTau < maxTau) {
    const s0 = yinBuffer[bestTau - 1];
    const s1 = yinBuffer[bestTau];
    const s2 = yinBuffer[bestTau + 1];
    const denominator = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denominator) > 1e-6) {
      const adjustment = (s2 - s0) / denominator;
      if (Math.abs(adjustment) < 1) {
        refinedTau = bestTau + adjustment;
      }
    }
  }

  const hz = sampleRate / refinedTau;
  const clarity = Math.max(0, Math.min(1, 1 - yinBuffer[bestTau]));

  if (hz < minHz || hz > maxHz || clarity < clarityThreshold * 0.72) {
    return { hz: null, clarity, volumeDb };
  }

  return { hz, clarity, volumeDb };
}

/**
 * 3-point raw median + responsive smoothing to suppress single-frame octave glitches
 * while preserving natural vocal fluctuations, vibrato, and speech melody.
 * IMPORTANT: recentRawHz must contain RAW detected Hz values, not previously stabilized outputs.
 */
export function stabilizePitch(recentRawHz: number[], currentRawHz: number): number {
  if (recentRawHz.length === 0) return currentRawHz;
  const lastRaw = recentRawHz[recentRawHz.length - 1];

  // If currentRawHz is within normal speech fluctuation (< 22% jump), follow it directly with light smoothing
  const relDiff = Math.abs(currentRawHz - lastRaw) / Math.max(80, lastRaw);
  if (relDiff < 0.22) {
    return currentRawHz * 0.78 + lastRaw * 0.22;
  }

  // For larger sudden jumps (> 22%, e.g. potential octave glitch), use a 3-point median of raw values
  const window = [...recentRawHz.slice(-2), currentRawHz].sort((a, b) => a - b);
  const median = window[Math.floor(window.length / 2)];
  return median * 0.75 + lastRaw * 0.25;
}

/**
 * Estimates vocal tract resonance (Formants F1 & F2 and Brightness 0..100)
 * from FFT dB spectrum data.
 */
export function estimateResonanceFromSpectrum(
  freqBinsDb: Float32Array,
  sampleRate: number,
  fftSize: number
): ResonanceEstimate {
  const binHz = sampleRate / fftSize;
  const numBins = freqBinsDb.length;
  if (numBins === 0 || binHz <= 0) {
    return { f1Hz: null, f2Hz: null, brightness: 50 };
  }

  // Smooth spectral envelope across ~180 Hz window to smooth out individual F0 harmonics
  const smoothRadius = Math.max(2, Math.round(90 / binHz));
  const maxRelevantBin = Math.min(numBins - 1, Math.ceil(4200 / binHz));
  const envelope = new Float32Array(maxRelevantBin + 1);

  for (let i = 0; i <= maxRelevantBin; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - smoothRadius);
    const end = Math.min(maxRelevantBin, i + smoothRadius);
    for (let j = start; j <= end; j++) {
      const val = Math.max(-110, freqBinsDb[j]);
      sum += val;
      count++;
    }
    envelope[i] = count > 0 ? sum / count : -110;
  }

  // Find F1 peak in 260 Hz .. 920 Hz
  const f1Start = Math.max(1, Math.floor(260 / binHz));
  const f1End = Math.min(maxRelevantBin, Math.ceil(920 / binHz));
  let f1Bin = f1Start;
  let f1MaxDb = -Infinity;
  for (let i = f1Start; i <= f1End; i++) {
    if (envelope[i] > f1MaxDb) {
      f1MaxDb = envelope[i];
      f1Bin = i;
    }
  }

  // Find F2 peak in 980 Hz .. 2850 Hz (ensure separation from F1)
  const f2Start = Math.max(f1Bin + Math.ceil(250 / binHz), Math.floor(980 / binHz));
  const f2End = Math.min(maxRelevantBin, Math.ceil(2850 / binHz));
  let f2Bin = f2Start;
  let f2MaxDb = -Infinity;
  for (let i = f2Start; i <= f2End; i++) {
    if (envelope[i] > f2MaxDb) {
      f2MaxDb = envelope[i];
      f2Bin = i;
    }
  }

  const f1Hz = f1MaxDb > -95 ? Math.round(f1Bin * binHz) : null;
  const f2Hz = f2MaxDb > -98 ? Math.round(f2Bin * binHz) : null;

  // Compute spectral brightness from F2 frequency + high/low spectral energy ratio
  let lowEnergy = 0;
  let highEnergy = 0;
  const lowBinStart = Math.max(1, Math.floor(100 / binHz));
  const lowBinEnd = Math.min(maxRelevantBin, Math.ceil(800 / binHz));
  const highBinStart = Math.max(lowBinEnd + 1, Math.floor(1100 / binHz));
  const highBinEnd = Math.min(maxRelevantBin, Math.ceil(3400 / binHz));

  for (let i = lowBinStart; i <= lowBinEnd; i++) {
    lowEnergy += Math.pow(10, Math.max(-100, envelope[i]) / 20);
  }
  for (let i = highBinStart; i <= highBinEnd; i++) {
    highEnergy += Math.pow(10, Math.max(-100, envelope[i]) / 20);
  }

  const f2Norm = f2Hz ? Math.max(0, Math.min(1, (f2Hz - 1150) / (2350 - 1150))) : 0.5;
  const energyRatio = lowEnergy > 0 ? highEnergy / lowEnergy : 0.3;
  const ratioNorm = Math.max(0, Math.min(1, (energyRatio - 0.08) / 0.85));

  const brightness = Math.round((f2Norm * 0.65 + ratioNorm * 0.35) * 100);

  return {
    f1Hz,
    f2Hz,
    brightness: Math.max(0, Math.min(100, brightness)),
  };
}

/**
 * Classifies a frequency in Hz into feminine, androgynous, masculine, or out_of_range.
 */
export function classifyPitchZone(hz: number, settings: VoiceSettings): PitchZone {
  if (hz < Math.min(50, settings.masculineMinHz) || hz > 450) {
    return 'out_of_range';
  }
  if (hz >= settings.feminineMinHz) {
    return 'feminin';
  }
  if (hz >= settings.androgynousMinHz) {
    return 'androgyn';
  }
  return 'maskulin';
}

/**
 * Converts a frequency in Hz to its musical note representation (A4 = 440 Hz).
 */
export function hzToNoteInfo(hz: number): NoteInfo {
  const safeHz = Math.max(20, hz);
  const exactMidi = 69 + 12 * Math.log2(safeHz / 440);
  const midi = Math.round(exactMidi);
  const cents = Math.round((exactMidi - midi) * 100);
  const exactNoteHz = 440 * Math.pow(2, (midi - 69) / 12);
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const pitchClass = NOTE_NAMES[noteIndex];

  return {
    noteName: `${pitchClass}${octave}`,
    pitchClass,
    octave,
    midi,
    cents,
    exactNoteHz: Math.round(exactNoteHz * 10) / 10,
  };
}

/**
 * Converts a standard note name (e.g. "G3", "F#3", "A3") to Hz.
 */
export function noteNameToHz(noteName: string): number {
  const match = /^([A-G]#?)(-?\d+)$/i.exec(noteName.trim());
  if (!match) return 196;
  const pitchClass = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const noteIdx = NOTE_NAMES.indexOf(pitchClass);
  if (noteIdx === -1) return 196;
  const midi = (octave + 1) * 12 + noteIdx;
  return Math.round(440 * Math.pow(2, (midi - 69) / 12) * 10) / 10;
}

/**
 * Computes comprehensive statistics over a list of PitchSample records.
 */
export function computeSessionStats(
  samples: PitchSample[],
  totalDurationSec: number,
  activeSpeakingSec: number
): SessionStats {
  const voiced = samples.filter(
    (s): s is PitchSample & { hz: number } =>
      s.hz !== null && s.zone !== null && s.zone !== 'out_of_range'
  );

  if (voiced.length === 0) {
    return {
      meanHz: 0,
      medianHz: 0,
      minHz: 0,
      maxHz: 0,
      stdDevHz: 0,
      semitoneRange: 0,
      femininePercent: 0,
      androgynousPercent: 0,
      masculinePercent: 0,
      targetHitPercent: 0,
      meanF1Hz: 0,
      meanF2Hz: 0,
      meanBrightness: 0,
      totalDurationSec: Math.round(totalDurationSec * 10) / 10,
      activeSpeakingSec: Math.round(activeSpeakingSec * 10) / 10,
      voicedSampleCount: 0,
    };
  }

  const hzValues = voiced.map((s) => s.hz);
  const sortedHz = [...hzValues].sort((a, b) => a - b);
  const count = hzValues.length;

  const sumHz = hzValues.reduce((acc, v) => acc + v, 0);
  const meanHz = sumHz / count;
  const medianHz =
    count % 2 === 1
      ? sortedHz[Math.floor(count / 2)]
      : (sortedHz[count / 2 - 1] + sortedHz[count / 2]) / 2;

  // Use 5th and 95th percentile for robust min/max & semitone range if enough samples exist
  const p05 = sortedHz[Math.floor((count - 1) * 0.05)];
  const p95 = sortedHz[Math.floor((count - 1) * 0.95)];
  const minHz = sortedHz[0];
  const maxHz = sortedHz[count - 1];

  const variance = hzValues.reduce((acc, v) => acc + (v - meanHz) ** 2, 0) / count;
  const stdDevHz = Math.sqrt(variance);
  const semitoneRange = p05 > 0 ? 12 * Math.log2(p95 / p05) : 0;

  let femCount = 0;
  let androCount = 0;
  let mascCount = 0;
  let targetCount = 0;
  let f1Sum = 0;
  let f1Count = 0;
  let f2Sum = 0;
  let f2Count = 0;
  let brightnessSum = 0;

  for (const s of voiced) {
    if (s.zone === 'feminin') femCount++;
    else if (s.zone === 'androgyn') androCount++;
    else if (s.zone === 'maskulin') mascCount++;

    if (s.inTarget) targetCount++;
    if (s.f1Hz) {
      f1Sum += s.f1Hz;
      f1Count++;
    }
    if (s.f2Hz) {
      f2Sum += s.f2Hz;
      f2Count++;
    }
    brightnessSum += s.brightness;
  }

  const femininePercent = Math.round((femCount / count) * 1000) / 10;
  const androgynousPercent = Math.round((androCount / count) * 1000) / 10;
  const masculinePercent = Math.max(
    0,
    Math.round((100 - femininePercent - androgynousPercent) * 10) / 10
  );
  const targetHitPercent = Math.round((targetCount / count) * 1000) / 10;

  return {
    meanHz: Math.round(meanHz * 10) / 10,
    medianHz: Math.round(medianHz * 10) / 10,
    minHz: Math.round(minHz),
    maxHz: Math.round(maxHz),
    stdDevHz: Math.round(stdDevHz * 10) / 10,
    semitoneRange: Math.round(semitoneRange * 10) / 10,
    femininePercent,
    androgynousPercent,
    masculinePercent,
    targetHitPercent,
    meanF1Hz: f1Count > 0 ? Math.round(f1Sum / f1Count) : 0,
    meanF2Hz: f2Count > 0 ? Math.round(f2Sum / f2Count) : 0,
    meanBrightness: Math.round(brightnessSum / count),
    totalDurationSec: Math.round(totalDurationSec * 10) / 10,
    activeSpeakingSec: Math.round(activeSpeakingSec * 10) / 10,
    voicedSampleCount: count,
  };
}
