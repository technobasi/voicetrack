import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DemoVoiceProfile,
  PitchSample,
  SessionStats,
  VoiceSettings,
} from '../types/voice';
import {
  classifyPitchZone,
  computeSessionStats,
  detectPitchYin,
  estimateResonanceFromSpectrum,
  stabilizePitch,
} from './pitchEngine';

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

const EMPTY_STATS: SessionStats = {
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
  totalDurationSec: 0,
  activeSpeakingSec: 0,
  voicedSampleCount: 0,
};

export interface UseVoiceTrackerReturn {
  isListening: boolean;
  isPaused: boolean;
  demoProfile: DemoVoiceProfile;
  error: string | null;
  devices: AudioDeviceOption[];
  currentSample: PitchSample | null;
  samples: PitchSample[];
  liveSamplesRef: React.RefObject<PitchSample[]>;
  liveCurrentSampleRef: React.RefObject<PitchSample | null>;
  sessionStats: SessionStats;
  spectrumDb: Float32Array;
  sampleRate: number;
  isDropAlertActive: boolean;
  lowPitchStreakSec: number;
  recordedAudioUrl: string | null;
  startMicrophone: (enableAudioRecording?: boolean) => Promise<void>;
  startDemoMode: (profile: Exclude<DemoVoiceProfile, 'off'>) => void;
  stopTracking: () => void;
  togglePause: () => void;
  resetSession: () => void;
  refreshDevices: () => Promise<void>;
}

const EMPTY_SPECTRUM = new Float32Array(512).fill(-100);

export function useVoiceTracker(settings: VoiceSettings): UseVoiceTrackerReturn {
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [demoProfile, setDemoProfile] = useState<DemoVoiceProfile>('off');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioDeviceOption[]>([]);
  const [currentSample, setCurrentSample] = useState<PitchSample | null>(null);
  const [samples, setSamples] = useState<PitchSample[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats>(EMPTY_STATS);
  const [spectrumDb, setSpectrumDb] = useState<Float32Array>(EMPTY_SPECTRUM);
  const [sampleRate, setSampleRate] = useState<number>(48000);
  const [isDropAlertActive, setIsDropAlertActive] = useState(false);
  const [lowPitchStreakSec, setLowPitchStreakSec] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  const settingsRef = useRef<VoiceSettings>(settings);
  settingsRef.current = settings;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const intervalIdRef = useRef<number | null>(null);

  // Live 60Hz buffers read directly by Canvas requestAnimationFrame without triggering 60Hz React re-renders
  const samplesRef = useRef<PitchSample[]>([]);
  const liveCurrentSampleRef = useRef<PitchSample | null>(null);
  const lastVoicedSampleRef = useRef<PitchSample | null>(null);
  const latestSpectrumRef = useRef<Float32Array>(EMPTY_SPECTRUM);

  const recentValidHzRef = useRef<number[]>([]);
  const totalElapsedMsRef = useRef<number>(0);
  const activeSpeakingMsRef = useRef<number>(0);
  const lowPitchMsRef = useRef<number>(0);
  const alertLatchUntilRef = useRef<number>(0);
  const inTargetRecoveryMsRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);
  const lastUiSyncTimeRef = useRef<number>(0);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = list
        .filter((d) => d.kind === 'audioinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Mikrofon ${idx + 1}`,
        }));
      setDevices(audioInputs);
    } catch {
      // Ignore permission errors before first prompt
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const cleanupMedia = useCallback(() => {
    if (intervalIdRef.current !== null) {
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const syncUiNow = useCallback(() => {
    setSamples(samplesRef.current.slice());
    setSessionStats(
      computeSessionStats(
        samplesRef.current,
        totalElapsedMsRef.current / 1000,
        activeSpeakingMsRef.current / 1000
      )
    );
  }, []);

  const stopTracking = useCallback(() => {
    cleanupMedia();
    syncUiNow();
    alertLatchUntilRef.current = 0;
    inTargetRecoveryMsRef.current = 0;
    setIsListening(false);
    setIsPaused(false);
    setDemoProfile('off');
    setIsDropAlertActive(false);
    setLowPitchStreakSec(0);
    if (typeof document !== 'undefined') {
      document.title = 'VoiceTrack — Stimmfeminisierung & Live-Pitch-Monitor';
    }
  }, [cleanupMedia, syncUiNow]);

  const resetSession = useCallback(() => {
    samplesRef.current = [];
    liveCurrentSampleRef.current = null;
    lastVoicedSampleRef.current = null;
    recentValidHzRef.current = [];
    totalElapsedMsRef.current = 0;
    activeSpeakingMsRef.current = 0;
    lowPitchMsRef.current = 0;
    alertLatchUntilRef.current = 0;
    inTargetRecoveryMsRef.current = 0;
    lastTickTimeRef.current = performance.now();
    lastUiSyncTimeRef.current = 0;
    setSamples([]);
    setCurrentSample(null);
    setSessionStats(EMPTY_STATS);
    setIsDropAlertActive(false);
    setLowPitchStreakSec(0);
    setRecordedAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const appendSample = useCallback((sample: PitchSample, dtMs: number) => {
    const cfg = settingsRef.current;
    const nowPerf = performance.now();
    totalElapsedMsRef.current += dtMs;

    const thresholdHz = cfg.targetMinHz;

    if (sample.hz !== null && sample.zone !== 'out_of_range') {
      activeSpeakingMsRef.current += dtMs;
      if (sample.hz < thresholdHz) {
        lowPitchMsRef.current += dtMs;
        inTargetRecoveryMsRef.current = 0;
      } else {
        inTargetRecoveryMsRef.current += dtMs;
        lowPitchMsRef.current = Math.max(0, lowPitchMsRef.current - dtMs * 1.4);
        // If user speaks back in target range for >= 550ms, clear the alert latch early
        if (inTargetRecoveryMsRef.current >= 550) {
          alertLatchUntilRef.current = 0;
        }
      }
    } else {
      // During brief consonant/syllable gaps (<= 550ms) within active speech, continue the low-pitch timer
      // so normal consonants don't prevent the alert from triggering!
      const lastVoiced = lastVoicedSampleRef.current;
      const silenceGapMs = lastVoiced ? sample.timestamp - lastVoiced.timestamp : Infinity;
      if (silenceGapMs <= 550 && lastVoiced && lastVoiced.hz !== null && lastVoiced.hz < thresholdHz) {
        lowPitchMsRef.current += dtMs * 0.85;
      } else if (silenceGapMs > 550) {
        lowPitchMsRef.current = Math.max(0, lowPitchMsRef.current - dtMs * 0.5);
      }
    }

    const targetAlertMs = cfg.dropAlertSeconds * 1000;
    if (lowPitchMsRef.current >= targetAlertMs) {
      // Cap lowPitchMsRef slightly above targetAlertMs so recovery is responsive, and latch alert for 3.5s
      lowPitchMsRef.current = Math.min(lowPitchMsRef.current, targetAlertMs + 1500);
      alertLatchUntilRef.current = nowPerf + 3500;
    }

    const sampleWithSpeakingTime: PitchSample = {
      ...sample,
      speakingTimeMs: activeSpeakingMsRef.current,
    };

    // Mutate ref array in-place at 60Hz so Canvas reads it with zero allocation overhead
    samplesRef.current.push(sampleWithSpeakingTime);
    if (samplesRef.current.length > 10800) {
      samplesRef.current.splice(0, samplesRef.current.length - 10800);
    }
    liveCurrentSampleRef.current = sampleWithSpeakingTime;
    if (sampleWithSpeakingTime.hz !== null) {
      lastVoicedSampleRef.current = sampleWithSpeakingTime;
    }

    // Throttle React DOM state updates to ~8 Hz (every 125ms) so UI text & cards never stutter or flicker
    if (nowPerf - lastUiSyncTimeRef.current >= 125) {
      lastUiSyncTimeRef.current = nowPerf;

      const streakSec = Math.round((lowPitchMsRef.current / 1000) * 10) / 10;
      const alertActive =
        cfg.enableDropAlert &&
        (lowPitchMsRef.current >= targetAlertMs || nowPerf < alertLatchUntilRef.current);

      setLowPitchStreakSec(streakSec);
      setIsDropAlertActive(alertActive);

      if (typeof document !== 'undefined') {
        document.title = alertActive
          ? '⚠️ [Tonhöhe unter Ziel] VoiceTrack'
          : 'VoiceTrack — Stimmfeminisierung & Live-Pitch-Monitor';
      }

      // Hold the last voiced reading on the numeric card for up to 350ms during brief consonants so numbers don't flicker to "— Hz"
      const recentVoiced = lastVoicedSampleRef.current;
      const displaySample =
        sampleWithSpeakingTime.hz !== null
          ? sampleWithSpeakingTime
          : recentVoiced && sampleWithSpeakingTime.timestamp - recentVoiced.timestamp <= 350
            ? { ...recentVoiced, volumeDb: sampleWithSpeakingTime.volumeDb }
            : sampleWithSpeakingTime;

      setCurrentSample(displaySample);
      setSpectrumDb(latestSpectrumRef.current);
      setSamples(samplesRef.current.slice(-1800));
      setSessionStats(
        computeSessionStats(
          samplesRef.current,
          totalElapsedMsRef.current / 1000,
          activeSpeakingMsRef.current / 1000
        )
      );
    }
  }, []);

  const startMicrophone = useCallback(
    async (enableAudioRecording = false) => {
      cleanupMedia();
      setError(null);
      setDemoProfile('off');

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          'Dein Browser unterstützt keinen Mikrofon-Zugriff (getUserMedia). Du kannst alternativ den Simulations-Modus nutzen.'
        );
        return;
      }

      try {
        const cfg = settingsRef.current;
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: !cfg.rawAudioMode,
          noiseSuppression: !cfg.rawAudioMode,
          autoGainControl: !cfg.rawAudioMode,
        };
        if (cfg.selectedDeviceId) {
          audioConstraints.deviceId = { exact: cfg.selectedDeviceId };
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        mediaStreamRef.current = stream;
        void refreshDevices();

        if (enableAudioRecording && typeof MediaRecorder !== 'undefined') {
          try {
            recordedChunksRef.current = [];
            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                recordedChunksRef.current.push(e.data);
              }
            };
            recorder.onstop = () => {
              if (recordedChunksRef.current.length > 0) {
                const blob = new Blob(recordedChunksRef.current, {
                  type: recorder.mimeType || 'audio/webm',
                });
                const url = URL.createObjectURL(blob);
                setRecordedAudioUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return url;
                });
              }
            };
            recorder.start(250);
            mediaRecorderRef.current = recorder;
          } catch {
            // Audio recording optional
          }
        }

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        setSampleRate(ctx.sampleRate);

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0.65;
        source.connect(analyser);
        analyserRef.current = analyser;

        const timeDomainBuf = new Float32Array(analyser.fftSize);
        const freqDomainBuf = new Float32Array(analyser.frequencyBinCount);

        lastTickTimeRef.current = performance.now();
        setIsListening(true);
        setIsPaused(false);

        let unvoicedTicks = 0;

        intervalIdRef.current = window.setInterval(() => {
          if (isPausedRef.current || !analyserRef.current || !audioCtxRef.current) {
            lastTickTimeRef.current = performance.now();
            return;
          }

          const now = performance.now();
          const dtMs = Math.min(200, Math.max(10, now - lastTickTimeRef.current));
          lastTickTimeRef.current = now;

          const currentCfg = settingsRef.current;
          analyserRef.current.getFloatTimeDomainData(timeDomainBuf);
          analyserRef.current.getFloatFrequencyData(freqDomainBuf);

          const raw = detectPitchYin(
            timeDomainBuf,
            audioCtxRef.current.sampleRate,
            50,
            450,
            currentCfg.noiseGateDb,
            currentCfg.clarityThreshold
          );

          let stabilizedHz: number | null = null;
          let zone = null;
          let inTarget = false;
          let f1Hz: number | null = null;
          let f2Hz: number | null = null;
          let brightness = 50;

          if (raw.hz !== null) {
            unvoicedTicks = 0;
            stabilizedHz = Math.round(stabilizePitch(recentValidHzRef.current, raw.hz) * 10) / 10;
            recentValidHzRef.current = [...recentValidHzRef.current.slice(-3), raw.hz];
            zone = classifyPitchZone(stabilizedHz, currentCfg);
            inTarget =
              stabilizedHz >= currentCfg.targetMinHz && stabilizedHz <= currentCfg.targetMaxHz;

            const res = estimateResonanceFromSpectrum(
              freqDomainBuf,
              audioCtxRef.current.sampleRate,
              analyserRef.current.fftSize
            );
            f1Hz = res.f1Hz;
            f2Hz = res.f2Hz;
            brightness = res.brightness;
          } else {
            unvoicedTicks++;
            if (unvoicedTicks > 8) {
              recentValidHzRef.current = [];
            }
          }

          latestSpectrumRef.current = freqDomainBuf.slice(0, 512);

          appendSample(
            {
              timestamp: Date.now(),
              speakingTimeMs: activeSpeakingMsRef.current,
              hz: stabilizedHz,
              clarity: raw.clarity,
              volumeDb: Math.round(raw.volumeDb * 10) / 10,
              zone,
              inTarget,
              f1Hz,
              f2Hz,
              brightness,
            },
            dtMs
          );
        }, 16);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unbekannter Fehler beim Mikrofon-Zugriff';
        setError(
          `Mikrofon konnte nicht gestartet werden (${message}). Prüfe deine Browser-Berechtigung oder teste den Simulations-Modus.`
        );
      }
    },
    [appendSample, cleanupMedia, refreshDevices]
  );

  const startDemoMode = useCallback(
    (profile: Exclude<DemoVoiceProfile, 'off'>) => {
      cleanupMedia();
      setError(null);
      setDemoProfile(profile);
      setIsListening(true);
      setIsPaused(false);
      setSampleRate(48000);
      lastTickTimeRef.current = performance.now();

      let phase = 0;
      intervalIdRef.current = window.setInterval(() => {
        if (isPausedRef.current) {
          lastTickTimeRef.current = performance.now();
          return;
        }
        const now = performance.now();
        const dtMs = Math.min(200, Math.max(10, now - lastTickTimeRef.current));
        lastTickTimeRef.current = now;
        phase += dtMs / 1000;

        const cfg = settingsRef.current;

        const phraseCycle = phase % 9.5;
        const isPause =
          profile === 'discord-dialog'
            ? phraseCycle > 6.2 && phraseCycle < 8.6
            : phraseCycle > 7.8 && phraseCycle < 8.8;

        if (isPause) {
          latestSpectrumRef.current = EMPTY_SPECTRUM;
          appendSample(
            {
              timestamp: Date.now(),
              speakingTimeMs: activeSpeakingMsRef.current,
              hz: null,
              clarity: 0.1,
              volumeDb: -62,
              zone: null,
              inTarget: false,
              f1Hz: null,
              f2Hz: null,
              brightness: 45,
            },
            dtMs
          );
          return;
        }

        let baseHz = 205;
        let f1Base = 620;
        let f2Base = 2050;
        let brightBase = 78;

        const microVibrato = Math.sin(phase * 12.5) * 3.2 + Math.cos(phase * 7.8) * 4.5;

        if (profile === 'feminin') {
          baseHz = 206 + Math.sin(phase * 2.3) * 18 + Math.cos(phase * 5.1) * 9 + microVibrato;
          f1Base = 640 + Math.sin(phase * 1.9) * 55;
          f2Base = 2120 + Math.cos(phase * 2.7) * 140;
          brightBase = 81 + Math.sin(phase * 2.1) * 8;
        } else if (profile === 'androgyn') {
          baseHz =
            174 + Math.sin(phase * 2.1) * 13 + Math.cos(phase * 4.4) * 6 + microVibrato * 0.8;
          f1Base = 540 + Math.sin(phase * 1.7) * 45;
          f2Base = 1720 + Math.cos(phase * 2.3) * 110;
          brightBase = 61 + Math.sin(phase * 1.8) * 7;
        } else if (profile === 'maskulin') {
          baseHz =
            128 + Math.sin(phase * 1.9) * 14 + Math.cos(phase * 3.8) * 5 + microVibrato * 0.7;
          f1Base = 460 + Math.sin(phase * 1.4) * 35;
          f2Base = 1360 + Math.cos(phase * 2.0) * 90;
          brightBase = 36 + Math.sin(phase * 1.5) * 6;
        } else if (profile === 'discord-dialog') {
          const section = Math.floor(phase / 9.5) % 3;
          if (section === 2) {
            baseHz = 162 + Math.sin(phase * 2.5) * 14 + microVibrato * 0.8;
            f1Base = 520;
            f2Base = 1650;
            brightBase = 55;
          } else {
            baseHz = 198 + Math.sin(phase * 2.6) * 20 + Math.cos(phase * 4.7) * 8 + microVibrato;
            f1Base = 620 + Math.sin(phase * 1.8) * 50;
            f2Base = 2040 + Math.cos(phase * 2.5) * 130;
            brightBase = 76 + Math.sin(phase * 2.0) * 8;
          }
        }

        const hz = Math.round(baseHz * 10) / 10;
        const f1Hz = Math.round(f1Base);
        const f2Hz = Math.round(f2Base);
        const brightness = Math.max(0, Math.min(100, Math.round(brightBase)));
        const zone = classifyPitchZone(hz, cfg);
        const inTarget = hz >= cfg.targetMinHz && hz <= cfg.targetMaxHz;

        const synthSpec = new Float32Array(512);
        const binHz = 48000 / 4096;
        for (let i = 0; i < 512; i++) {
          const freq = i * binHz;
          const f1Env = Math.exp(-((freq - f1Hz) ** 2) / (2 * 180 ** 2)) * 26;
          const f2Env = Math.exp(-((freq - f2Hz) ** 2) / (2 * 260 ** 2)) * 24;
          const harmonicDist = Math.abs(((freq + hz / 2) % hz) - hz / 2);
          const harmonicPeak = Math.exp(-(harmonicDist ** 2) / (2 * 14 ** 2)) * 18;
          const rollOff = -Math.min(40, freq / 110);
          synthSpec[i] = -78 + f1Env + f2Env + harmonicPeak + rollOff;
        }
        latestSpectrumRef.current = synthSpec;

        appendSample(
          {
            timestamp: Date.now(),
            speakingTimeMs: activeSpeakingMsRef.current,
            hz,
            clarity: 0.94,
            volumeDb: -22 + Math.round(Math.sin(phase * 3.2) * 4),
            zone,
            inTarget,
            f1Hz,
            f2Hz,
            brightness,
          },
          dtMs
        );
      }, 16);
    },
    [appendSample, cleanupMedia]
  );

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, [cleanupMedia]);

  return {
    isListening,
    isPaused,
    demoProfile,
    error,
    devices,
    currentSample,
    samples,
    liveSamplesRef: samplesRef,
    liveCurrentSampleRef,
    sessionStats,
    spectrumDb,
    sampleRate,
    isDropAlertActive,
    lowPitchStreakSec,
    recordedAudioUrl,
    startMicrophone,
    startDemoMode,
    stopTracking,
    togglePause,
    resetSession,
    refreshDevices,
  };
}
