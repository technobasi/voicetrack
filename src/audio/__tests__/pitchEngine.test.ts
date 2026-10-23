import { describe, expect, it } from 'vitest';
import {
  calculateVolumeDb,
  classifyPitchZone,
  computeSessionStats,
  detectPitchYin,
  estimateResonanceFromSpectrum,
  hzToNoteInfo,
  noteNameToHz,
  stabilizePitch,
} from '../pitchEngine';
import { DEFAULT_VOICE_SETTINGS, PitchSample } from '../../types/voice';

function generateHarmonicWave(
  fundamentalHz: number,
  sampleRate: number,
  length: number,
  amplitude = 0.5
): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    buf[i] =
      amplitude *
      (0.7 * Math.sin(2 * Math.PI * fundamentalHz * t) +
        0.2 * Math.sin(2 * Math.PI * fundamentalHz * 2 * t) +
        0.1 * Math.sin(2 * Math.PI * fundamentalHz * 3 * t));
  }
  return buf;
}

describe('pitchEngine DSP & classification', () => {
  it('accurately detects masculine, androgynous, and feminine fundamental frequencies using YIN', () => {
    const sampleRate = 48000;
    const bufferSize = 4096;

    // 1. Masculine pitch (125 Hz)
    const mascWave = generateHarmonicWave(125, sampleRate, bufferSize);
    const mascRes = detectPitchYin(mascWave, sampleRate, 65, 420, -50, 0.75);
    expect(mascRes.hz).not.toBeNull();
    expect(Math.abs((mascRes.hz ?? 0) - 125)).toBeLessThan(1.5);
    expect(mascRes.clarity).toBeGreaterThan(0.85);

    // 2. Androgynous pitch (174.6 Hz - F3)
    const androWave = generateHarmonicWave(174.6, sampleRate, bufferSize);
    const androRes = detectPitchYin(androWave, sampleRate, 65, 420, -50, 0.75);
    expect(androRes.hz).not.toBeNull();
    expect(Math.abs((androRes.hz ?? 0) - 174.6)).toBeLessThan(1.5);

    // 3. Feminine pitch (215 Hz)
    const femWave = generateHarmonicWave(215, sampleRate, bufferSize);
    const femRes = detectPitchYin(femWave, sampleRate, 65, 420, -50, 0.75);
    expect(femRes.hz).not.toBeNull();
    expect(Math.abs((femRes.hz ?? 0) - 215)).toBeLessThan(1.5);
  });

  it('rejects silent or below-noise-gate buffers', () => {
    const quietWave = generateHarmonicWave(200, 48000, 4096, 0.0005);
    const res = detectPitchYin(quietWave, 48000, 65, 420, -45, 0.75);
    expect(res.hz).toBeNull();
    expect(calculateVolumeDb(quietWave)).toBeLessThan(-60);
  });

  it('classifies frequencies into masculine, androgynous, feminine, and out_of_range zones', () => {
    expect(classifyPitchZone(50, DEFAULT_VOICE_SETTINGS)).toBe('maskulin');
    expect(classifyPitchZone(130, DEFAULT_VOICE_SETTINGS)).toBe('maskulin');
    expect(classifyPitchZone(165, DEFAULT_VOICE_SETTINGS)).toBe('androgyn');
    expect(classifyPitchZone(178, DEFAULT_VOICE_SETTINGS)).toBe('androgyn');
    expect(classifyPitchZone(185, DEFAULT_VOICE_SETTINGS)).toBe('feminin');
    expect(classifyPitchZone(220, DEFAULT_VOICE_SETTINGS)).toBe('feminin');
    expect(classifyPitchZone(450, DEFAULT_VOICE_SETTINGS)).toBe('feminin');
    expect(classifyPitchZone(40, DEFAULT_VOICE_SETTINGS)).toBe('out_of_range');
    expect(classifyPitchZone(460, DEFAULT_VOICE_SETTINGS)).toBe('out_of_range');
  });

  it('converts between Hz and musical notes accurately', () => {
    const a3 = hzToNoteInfo(220);
    expect(a3.noteName).toBe('A3');
    expect(a3.cents).toBe(0);

    const g3 = hzToNoteInfo(196);
    expect(g3.noteName).toBe('G3');

    expect(Math.abs(noteNameToHz('A3') - 220)).toBeLessThan(0.2);
    expect(Math.abs(noteNameToHz('G3') - 196)).toBeLessThan(0.2);
  });

  it('estimates higher F2 & brightness for bright feminine spectral profiles', () => {
    const sampleRate = 48000;
    const fftSize = 4096;
    const binHz = sampleRate / fftSize;
    const darkSpec = new Float32Array(1024).fill(-90);
    const brightSpec = new Float32Array(1024).fill(-90);

    for (let i = 0; i < 1024; i++) {
      const f = i * binHz;
      // Dark resonance peak at F1=450, F2=1250
      darkSpec[i] =
        -80 +
        Math.exp(-((f - 450) ** 2) / (2 * 120 ** 2)) * 35 +
        Math.exp(-((f - 1250) ** 2) / (2 * 150 ** 2)) * 28;

      // Bright resonance peak at F1=620, F2=2150
      brightSpec[i] =
        -80 +
        Math.exp(-((f - 620) ** 2) / (2 * 120 ** 2)) * 30 +
        Math.exp(-((f - 2150) ** 2) / (2 * 180 ** 2)) * 35;
    }

    const darkRes = estimateResonanceFromSpectrum(darkSpec, sampleRate, fftSize);
    const brightRes = estimateResonanceFromSpectrum(brightSpec, sampleRate, fftSize);

    expect(brightRes.f2Hz ?? 0).toBeGreaterThan(darkRes.f2Hz ?? 0);
    expect(brightRes.brightness).toBeGreaterThan(darkRes.brightness);
  });

  it('computes accurate session statistics and zone distributions', () => {
    const samples: PitchSample[] = [
      {
        timestamp: 1000,
        speakingTimeMs: 100,
        hz: 200,
        clarity: 0.9,
        volumeDb: -20,
        zone: 'feminin',
        inTarget: true,
        f1Hz: 600,
        f2Hz: 2050,
        brightness: 78,
      },
      {
        timestamp: 1040,
        speakingTimeMs: 200,
        hz: 210,
        clarity: 0.92,
        volumeDb: -19,
        zone: 'feminin',
        inTarget: true,
        f1Hz: 620,
        f2Hz: 2100,
        brightness: 80,
      },
      {
        timestamp: 1080,
        speakingTimeMs: 300,
        hz: 175,
        clarity: 0.88,
        volumeDb: -22,
        zone: 'androgyn',
        inTarget: false,
        f1Hz: 550,
        f2Hz: 1750,
        brightness: 62,
      },
      {
        timestamp: 1120,
        speakingTimeMs: 300,
        hz: null,
        clarity: 0.1,
        volumeDb: -65,
        zone: null,
        inTarget: false,
        f1Hz: null,
        f2Hz: null,
        brightness: 40,
      },
    ];

    const stats = computeSessionStats(samples, 10, 6);
    expect(stats.voicedSampleCount).toBe(3);
    expect(stats.meanHz).toBeCloseTo(195, 0);
    expect(stats.medianHz).toBe(200);
    expect(stats.femininePercent).toBeCloseTo(66.7, 1);
    expect(stats.androgynousPercent).toBeCloseTo(33.3, 1);
    expect(stats.masculinePercent).toBeCloseTo(0, 1);
    expect(stats.targetHitPercent).toBeCloseTo(66.7, 1);
  });

  it('stabilizes single-frame pitch spikes while following genuine vocal fluctuations', () => {
    const stabilized = stabilizePitch([198, 200, 202, 199], 390);
    expect(stabilized).toBeLessThan(215);
    expect(stabilized).toBeGreaterThan(195);

    // Ensure genuine speech melody changes (e.g. 200 -> 218 Hz) are followed immediately without flat-lining
    const rising = stabilizePitch([200, 200, 200], 218);
    expect(rising).toBeGreaterThan(212);
  });
});
