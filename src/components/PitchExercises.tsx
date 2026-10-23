import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  BookmarkCheck,
  Mic,
  MicOff,
  Music,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { hzToNoteInfo } from '../audio/pitchEngine';
import {
  referenceTonePlayer,
  ReferenceToneTimbre,
} from '../audio/toneGenerator';
import {
  DemoVoiceProfile,
  PitchSample,
  SessionStats,
  TrainingSessionRecord,
  VoiceSettings,
} from '../types/voice';

interface PitchExercisesProps {
  isListening: boolean;
  demoProfile: DemoVoiceProfile;
  currentSample: PitchSample | null;
  stats: SessionStats;
  settings: VoiceSettings;
  onStartMic: () => void;
  onStartDemo: (profile: Exclude<DemoVoiceProfile, 'off'>) => void;
  onStop: () => void;
  onSaveSession: (record: TrainingSessionRecord) => Promise<void>;
}

const ANCHOR_NOTES = [
  { note: 'E3', hz: 165, label: 'Androgyn Start' },
  { note: 'F3', hz: 175, label: 'Androgyn Mitte' },
  { note: 'F#3', hz: 185, label: 'Feminin Start' },
  { note: 'G3', hz: 196, label: 'Klassisch Feminin' },
  { note: 'G#3', hz: 208, label: 'Warm & Hell' },
  { note: 'A3', hz: 220, label: 'Kammerton A3' },
  { note: 'A#3', hz: 233, label: 'Hoch & Klar' },
  { note: 'B3', hz: 247, label: 'Oberer Bereich' },
];

type ExerciseMode = 'hold' | 'siren' | 'melody';

export const PitchExercises: React.FC<PitchExercisesProps> = ({
  isListening,
  demoProfile,
  currentSample,
  stats,
  onStartMic,
  onStartDemo,
  onStop,
  onSaveSession,
}) => {
  const [exerciseMode, setExerciseMode] = useState<ExerciseMode>('hold');
  const [targetHz, setTargetHz] = useState<number>(196);
  const [timbre, setTimbre] = useState<ReferenceToneTimbre>('warm');
  const [isTonePlaying, setIsTonePlaying] = useState<boolean>(false);
  const [holdProgressSec, setHoldProgressSec] = useState<number>(0);
  const [completedReps, setCompletedReps] = useState<number>(0);
  const [sirenPhase, setSirenPhase] = useState<number>(0);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const HOLD_GOAL_SEC = 5.0;
  const TOLERANCE_HZ = 10;

  useEffect(() => {
    return () => {
      referenceTonePlayer.stop();
    };
  }, []);

  const toggleTone = () => {
    if (isTonePlaying) {
      referenceTonePlayer.stop();
      setIsTonePlaying(false);
    } else {
      referenceTonePlayer.start(targetHz, timbre, 0.24);
      setIsTonePlaying(true);
    }
  };

  const handleSelectNote = (hz: number) => {
    setTargetHz(hz);
    setHoldProgressSec(0);
    if (isTonePlaying) {
      referenceTonePlayer.setFrequency(hz);
    }
  };

  // Siren & Melody dynamic target calculation
  useEffect(() => {
    if (!isListening || exerciseMode === 'hold') return;
    const id = window.setInterval(() => {
      setSirenPhase((p) => (p + 0.05) % (Math.PI * 2));
    }, 50);
    return () => window.clearInterval(id);
  }, [isListening, exerciseMode]);

  const activeTargetHz =
    exerciseMode === 'hold'
      ? targetHz
      : exerciseMode === 'siren'
        ? Math.round(198 + Math.sin(sirenPhase) * 24)
        : sirenPhase < 2.1
          ? 188
          : sirenPhase < 4.2
            ? 216
            : 196;

  const lastTickTimeRef = useRef<number | null>(null);

  // Update hold progress using real elapsed seconds when user matches activeTargetHz
  useEffect(() => {
    if (!isListening || !currentSample?.hz) {
      lastTickTimeRef.current = null;
      return;
    }
    const now = performance.now();
    const dtSec =
      lastTickTimeRef.current !== null
        ? Math.min(0.25, Math.max(0.02, (now - lastTickTimeRef.current) / 1000))
        : 0.12;
    lastTickTimeRef.current = now;

    const diff = Math.abs(currentSample.hz - activeTargetHz);
    if (diff <= TOLERANCE_HZ) {
      setHoldProgressSec((prev) => {
        const next = Math.round((prev + dtSec) * 100) / 100;
        if (next >= HOLD_GOAL_SEC) {
          setCompletedReps((r) => r + 1);
          return 0;
        }
        return next;
      });
    } else {
      setHoldProgressSec((prev) =>
        Math.max(0, Math.round((prev - dtSec * 0.5) * 100) / 100)
      );
    }
  }, [currentSample, isListening, activeTargetHz]);

  const liveHz = currentSample?.hz ?? null;
  const deltaHz = liveHz !== null ? Math.round((liveHz - activeTargetHz) * 10) / 10 : null;
  const isMatched = deltaHz !== null && Math.abs(deltaHz) <= TOLERANCE_HZ;
  const targetNote = hzToNoteInfo(activeTargetHz);

  // Tuner needle position (-40 Hz .. +40 Hz mapped to 5% .. 95%)
  const needlePercent =
    deltaHz !== null
      ? Math.max(5, Math.min(95, 50 + (deltaHz / 40) * 45))
      : 50;

  const handleSaveExercise = async () => {
    const record: TrainingSessionRecord = {
      id: `exercise_${Date.now()}`,
      createdAt: new Date().toISOString(),
      type: 'exercise',
      title: `Zielton-Übung (${targetNote.noteName} · ${activeTargetHz} Hz)`,
      tags: ['Zielton-Übung', `${completedReps} Wiederholungen`],
      notes: `Modus: ${exerciseMode}, Zielton: ${activeTargetHz} Hz (${targetNote.noteName}), Geschaffte 5s-Halterunden: ${completedReps}`,
      stats: {
        ...stats,
        meanHz: stats.meanHz || activeTargetHz,
      },
      pitchTrace: [],
    };
    await onSaveSession(record);
    setSavedBanner('Übung im Verlauf gespeichert!');
    setTimeout(() => setSavedBanner(null), 3500);
  };

  return (
    <div className="space-y-5 tabular-nums">
      {/* Top Mode & Tone Generator Bar */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'hold', label: '1. Zielton treffen & halten' },
                { id: 'siren', label: '2. Sanfte Stimm-Sirene (Glide)' },
                { id: 'melody', label: '3. Satz-Melodie (Stufen)' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setExerciseMode(m.id);
                  setHoldProgressSec(0);
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                  exerciseMode === m.id
                    ? 'bg-pink-500/20 text-pink-200 border border-pink-500/50'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleTone}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition cursor-pointer border ${
                isTonePlaying
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-purple-500/40 bg-purple-500/15 hover:bg-purple-500/25 text-purple-200'
              }`}
            >
              {isTonePlaying ? (
                <>
                  <VolumeX className="w-4 h-4 text-emerald-400" />
                  <span>Referenzton stoppen ({targetHz} Hz)</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-purple-300" />
                  <span>Referenzton abspielen ({targetHz} Hz)</span>
                </>
              )}
            </button>

            <select
              value={timbre}
              onChange={(e) => {
                const next = e.target.value as ReferenceToneTimbre;
                setTimbre(next);
                if (isTonePlaying) {
                  referenceTonePlayer.start(targetHz, next, 0.24);
                }
              }}
              aria-label="Klangfarbe des Referenztons"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200"
            >
              <option value="warm">Klang: Warmer Dreieck-Ton</option>
              <option value="vocal">Klang: Vokal-Oberton</option>
              <option value="sine">Klang: Sanfter Sinus</option>
            </select>
          </div>
        </div>

        {/* Anchor Notes Piano Grid */}
        {exerciseMode === 'hold' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Wähle deinen Zielton (mit Notenname & Frequenz):</span>
              <span>Feinregler: {targetHz} Hz</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {ANCHOR_NOTES.map((item) => {
                const selected = Math.abs(targetHz - item.hz) <= 3;
                return (
                  <button
                    key={item.note}
                    type="button"
                    onClick={() => handleSelectNote(item.hz)}
                    className={`rounded-xl border p-2.5 text-center transition cursor-pointer ${
                      selected
                        ? 'border-pink-500 bg-pink-500/20 text-white shadow-md shadow-pink-500/10'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="text-sm font-extrabold text-pink-300">{item.note}</div>
                    <div className="text-xs font-bold text-white">{item.hz} Hz</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {item.label}
                    </div>
                  </button>
                );
              })}
            </div>

            <input
              type="range"
              min={140}
              max={265}
              step={1}
              value={targetHz}
              onChange={(e) => handleSelectNote(Number(e.target.value))}
              className="w-full cursor-pointer mt-1"
              aria-label="Zielton-Frequenz in Hz"
            />
          </div>
        )}
      </div>

      {/* Main Precision Tuner & Hold Ring Card */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-6 shadow-lg space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <Music className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase font-semibold tracking-wider text-slate-400">
                Aktueller Zielton
              </div>
              <div className="text-2xl font-extrabold text-white">
                {activeTargetHz} Hz ·{' '}
                <span className="text-pink-400">{targetNote.noteName}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isListening || demoProfile !== 'off' ? (
              <button
                type="button"
                onClick={onStartMic}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                <span>Mikrofon für Übung starten</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                <MicOff className="w-4 h-4" />
                <span>Stoppen</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onStartDemo('feminin')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2.5 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Demo-Stimme</span>
            </button>
          </div>
        </div>

        {/* Visual Pitch-Matching Tuner Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium text-slate-400">
            <span>Zu tief (-40 Hz)</span>
            <span className="text-emerald-400 font-bold">
              Zielbereich ({activeTargetHz - TOLERANCE_HZ} – {activeTargetHz + TOLERANCE_HZ} Hz)
            </span>
            <span>Zu hoch (+40 Hz)</span>
          </div>

          <div className="relative h-12 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center">
            {/* Target green sweet spot in center */}
            <div
              style={{ left: '38%', width: '24%' }}
              className="absolute top-0 bottom-0 bg-emerald-500/15 border-x border-emerald-400/40"
            />
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-emerald-400/70" />

            {/* Moving Voice Needle */}
            {liveHz !== null && (
              <div
                style={{ left: `${needlePercent}%` }}
                className="absolute top-1.5 bottom-1.5 -translate-x-1/2 transition-all duration-75 flex flex-col items-center justify-center"
              >
                <div
                  className={`px-2.5 py-1 rounded-full text-xs font-extrabold shadow-lg ${
                    isMatched
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-pink-500 text-white'
                  }`}
                >
                  {Math.round(liveHz)} Hz
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-slate-300">
            {liveHz === null
              ? 'Summ oder sprich ein entspanntes „Mmmmh“ oder „Ahhh“ auf dem Zielton…'
              : isMatched
                ? `Perfekt im Zielbereich! (${deltaHz && deltaHz > 0 ? `+${deltaHz}` : deltaHz} Hz Abweichung)`
                : deltaHz !== null && deltaHz < 0
                  ? `Noch ${Math.abs(Math.round(deltaHz))} Hz höher gleiten…`
                  : `Noch ${Math.abs(Math.round(deltaHz ?? 0))} Hz tiefer entspannen…`}
          </div>
        </div>

        {/* 5-Second Hold Progress & Completed Reps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">
                Ton-Stabilität (5 Sekunden im Zielbereich halten):
              </span>
              <span className="font-bold text-emerald-400">
                {holdProgressSec.toFixed(1)}s / {HOLD_GOAL_SEC.toFixed(1)}s
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                style={{ width: `${(holdProgressSec / HOLD_GOAL_SEC) * 100}%` }}
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-75"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Award className="w-7 h-7 text-amber-400" />
              <div>
                <div className="text-xs text-slate-400">Geschaffte Wiederholungen</div>
                <div className="text-xl font-extrabold text-white">
                  {completedReps} Runden
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {savedBanner && (
                <span className="text-xs text-emerald-400 font-medium">{savedBanner}</span>
              )}
              <button
                type="button"
                onClick={handleSaveExercise}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                <BookmarkCheck className="w-4 h-4" />
                <span>Übung speichern</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
