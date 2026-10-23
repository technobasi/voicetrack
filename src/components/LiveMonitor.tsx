import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  BookmarkCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { hzToNoteInfo } from '../audio/pitchEngine';
import { referenceTonePlayer } from '../audio/toneGenerator';
import { AudioDeviceOption } from '../audio/useVoiceTracker';
import {
  CompactPitchPoint,
  DemoVoiceProfile,
  PitchSample,
  SessionStats,
  TrainingSessionRecord,
  VoiceSettings,
} from '../types/voice';
import { PitchGraphCanvas } from './PitchGraphCanvas';

interface LiveMonitorProps {
  isListening: boolean;
  isPaused: boolean;
  demoProfile: DemoVoiceProfile;
  error: string | null;
  devices: AudioDeviceOption[];
  currentSample: PitchSample | null;
  samples: PitchSample[];
  liveSamplesRef: React.RefObject<PitchSample[]>;
  liveCurrentSampleRef: React.RefObject<PitchSample | null>;
  stats: SessionStats;
  settings: VoiceSettings;
  isDropAlertActive: boolean;
  lowPitchStreakSec: number;
  compactMode: boolean;
  onStartMic: () => void;
  onStartDemo: (profile: Exclude<DemoVoiceProfile, 'off'>) => void;
  onStop: () => void;
  onTogglePause: () => void;
  onReset: () => void;
  onUpdateSettings: (partial: Partial<VoiceSettings>) => void;
  onSaveSession: (record: TrainingSessionRecord) => Promise<void>;
  onOpenSettingsModal: () => void;
}

function formatSeconds(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({
  isListening,
  isPaused,
  demoProfile,
  error,
  devices,
  currentSample,
  samples,
  liveSamplesRef,
  liveCurrentSampleRef,
  stats,
  settings,
  isDropAlertActive,
  lowPitchStreakSec,
  compactMode,
  onStartMic,
  onStartDemo,
  onStop,
  onTogglePause,
  onReset,
  onUpdateSettings,
  onSaveSession,
  onOpenSettingsModal,
}) => {
  const [windowSeconds, setWindowSeconds] = useState<number>(20);
  const [saveTitle, setSaveTitle] = useState<string>('Discord-Gespräch');
  const [saveNotes, setSaveNotes] = useState<string>('');
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [isPlayingTargetTone, setIsPlayingTargetTone] = useState(false);
  const [audioChimeEnabled, setAudioChimeEnabled] = useState<boolean>(false);
  const prevDropAlertRef = useRef<boolean>(false);

  const liveHz = currentSample?.hz ?? null;
  const liveNote = liveHz ? hzToNoteInfo(liveHz) : null;
  const meanNote = stats.meanHz > 0 ? hzToNoteInfo(stats.meanHz) : null;
  const targetCenterHz = Math.round((settings.targetMinHz + settings.targetMaxHz) / 2);

  useEffect(() => {
    if (isDropAlertActive && !prevDropAlertRef.current && audioChimeEnabled) {
      referenceTonePlayer.playGentleAlertChime(targetCenterHz);
    }
    prevDropAlertRef.current = isDropAlertActive;
  }, [isDropAlertActive, audioChimeEnabled, targetCenterHz]);

  const handleToggleTargetTone = () => {
    if (isPlayingTargetTone) {
      referenceTonePlayer.stop();
      setIsPlayingTargetTone(false);
    } else {
      referenceTonePlayer.start(targetCenterHz, 'warm', 0.22);
      setIsPlayingTargetTone(true);
      setTimeout(() => {
        referenceTonePlayer.stop();
        setIsPlayingTargetTone(false);
      }, 2800);
    }
  };

  const handleQuickSave = async () => {
    const sourceSamples = liveSamplesRef.current.length > 0 ? liveSamplesRef.current : samples;
    if (stats.voicedSampleCount === 0 || sourceSamples.length === 0) return;

    const step = Math.max(1, Math.floor(sourceSamples.length / 180));
    const t0 = sourceSamples[0]?.timestamp ?? Date.now();
    const trace: CompactPitchPoint[] = [];
    for (let i = 0; i < sourceSamples.length; i += step) {
      const s = sourceSamples[i];
      trace.push({
        t: Math.round((s.timestamp - t0) / 100) / 10,
        hz: s.hz,
        f2: s.f2Hz,
        b: s.brightness,
      });
    }

    const record: TrainingSessionRecord = {
      id: `session_${Date.now()}`,
      createdAt: new Date().toISOString(),
      type: 'discord-live',
      title: saveTitle.trim() || 'Discord-Session',
      tags: demoProfile !== 'off' ? ['Demo', 'Live-Monitor'] : ['Discord', 'Live-Monitor'],
      notes: saveNotes.trim(),
      stats,
      pitchTrace: trace,
    };

    await onSaveSession(record);
    setSaveBanner('Session erfolgreich im Verlauf gespeichert!');
    setSaveNotes('');
    setTimeout(() => setSaveBanner(null), 3500);
  };

  const currentDb = currentSample?.volumeDb ?? -90;
  const meterPercent = Math.max(0, Math.min(100, ((currentDb + 75) / 65) * 100));
  const gatePercent = Math.max(0, Math.min(100, ((settings.noiseGateDb + 75) / 65) * 100));

  const zoneInfo =
    currentSample?.zone === 'feminin'
      ? {
          label: 'Feminin',
          color: 'text-pink-400',
          badge: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
        }
      : currentSample?.zone === 'androgyn'
        ? {
            label: 'Androgyn',
            color: 'text-purple-400',
            badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          }
        : currentSample?.zone === 'maskulin'
          ? {
              label: 'Maskulin',
              color: 'text-sky-400',
              badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
            }
          : {
              label: isListening ? 'Stille' : 'Bereit',
              color: 'text-slate-400',
              badge: 'bg-slate-800 text-slate-400 border-slate-700',
            };

  return (
    <div className={`space-y-4 tabular-nums ${compactMode ? 'max-w-md mx-auto' : ''}`}>
      {/* Top Control & Microphone Bar */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Primary Start / Stop / Pause Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {!isListening || demoProfile !== 'off' ? (
              <button
                type="button"
                onClick={onStartMic}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-pink-500/20 transition cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                <span>Mikrofon starten (Live)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition cursor-pointer"
              >
                <MicOff className="w-4 h-4" />
                <span>Stoppen</span>
              </button>
            )}

            {isListening && (
              <button
                type="button"
                onClick={onTogglePause}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2.5 text-sm font-medium text-slate-200 transition cursor-pointer min-w-[116px] justify-center"
              >
                {isPaused ? (
                  <Play className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Pause className="w-4 h-4 text-amber-400" />
                )}
                <span>{isPaused ? 'Fortsetzen' : 'Pause'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-300 transition cursor-pointer"
              title="Aktuelle Kurve und Statistik zurücksetzen"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Zurücksetzen</span>
            </button>

            <button
              type="button"
              onClick={handleToggleTargetTone}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition cursor-pointer ${
                isPlayingTargetTone
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
              title={`Spielt deinen mittleren Zielton (${targetCenterHz} Hz) für knapp 3 Sekunden als Orientierung ab`}
            >
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>Zielton ({targetCenterHz} Hz)</span>
            </button>
          </div>

          {/* Demo / Simulation Quick Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Demo-Stimme:
            </span>
            {(
              [
                { id: 'discord-dialog', label: 'Discord-Talk' },
                { id: 'feminin', label: 'Feminin' },
                { id: 'androgyn', label: 'Androgyn' },
                { id: 'maskulin', label: 'Maskulin' },
              ] as const
            ).map((preset) => {
              const active = isListening && demoProfile === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => (active ? onStop() : onStartDemo(preset.id))}
                  className={`rounded-lg px-2.5 py-1.5 font-medium transition cursor-pointer border ${
                    active
                      ? 'border-pink-500/60 bg-pink-500/20 text-pink-200'
                      : 'border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Second Row: Microphone Selector, Noise Gate Meter, Smart Pause Toggle */}
        {!compactMode && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 items-center text-xs">
            <div className="flex items-center gap-2">
              <label htmlFor="mic-select" className="text-slate-400 shrink-0 font-medium">
                Mikrofon:
              </label>
              <select
                id="mic-select"
                value={settings.selectedDeviceId}
                onChange={(e) => onUpdateSettings({ selectedDeviceId: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-pink-500"
              >
                <option value="">Standard-Systemmikrofon (wie Discord)</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-slate-400 shrink-0 font-medium w-32">
                Noise-Gate ({settings.noiseGateDb} dB):
              </span>
              <div className="relative flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  style={{ width: `${meterPercent}%` }}
                  className={`h-full transition-none ${
                    currentDb >= settings.noiseGateDb ? 'bg-emerald-400' : 'bg-slate-600'
                  }`}
                />
                <div
                  style={{ left: `${gatePercent}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-pink-400"
                  title={`Noise-Gate Schwelle: ${settings.noiseGateDb} dB`}
                />
              </div>
              <input
                type="range"
                min={-65}
                max={-25}
                step={1}
                value={settings.noiseGateDb}
                onChange={(e) => onUpdateSettings({ noiseGateDb: Number(e.target.value) })}
                className="w-20 cursor-pointer"
                aria-label="Noise-Gate Schwellenwert in dB"
              />
            </div>

            <div className="flex items-center justify-between md:justify-end gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={!settings.smartPauseCompress}
                  onChange={(e) =>
                    onUpdateSettings({ smartPauseCompress: !e.target.checked })
                  }
                  className="rounded border-slate-600"
                />
                <span>Graph dauerhaft durchlaufen lassen (Echtzeit-Slide)</span>
              </label>

              <button
                type="button"
                onClick={onOpenSettingsModal}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 text-slate-300 transition cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-pink-400" />
                <span>Zonen</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => onStartDemo('discord-dialog')}
              className="shrink-0 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 px-2.5 py-1 font-semibold text-rose-100 cursor-pointer"
            >
              Demo starten
            </button>
          </div>
        )}
      </div>

      {/* Fixed-Height Zielbereich-Wächter & Drop-Alert Bar (Zero Layout Shift!) */}
      <div
        role="status"
        aria-live="polite"
        className={`rounded-2xl border px-4 py-2.5 min-h-[52px] flex flex-wrap items-center justify-between gap-3 transition-colors duration-200 ${
          isDropAlertActive
            ? 'border-amber-400/80 bg-amber-500/15 text-amber-100 discord-drop-alert shadow-lg shadow-amber-500/10'
            : lowPitchStreakSec > 0.15 && settings.enableDropAlert
              ? 'border-amber-500/40 bg-slate-900/90 text-slate-200'
              : 'border-slate-800/90 bg-slate-900/65 text-slate-300'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isDropAlertActive ? (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
          ) : (
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                !settings.enableDropAlert
                  ? 'text-slate-500'
                  : lowPitchStreakSec > 0.15
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              }`}
            />
          )}

          <div className="text-xs leading-snug truncate">
            {!settings.enableDropAlert ? (
              <span className="text-slate-400">
                Zielbereich-Alarm ist deaktiviert ·{' '}
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ enableDropAlert: true })}
                  className="underline text-pink-300 hover:text-pink-200 cursor-pointer font-semibold"
                >
                  Jetzt aktivieren
                </button>
              </span>
            ) : isDropAlertActive ? (
              <span className="font-bold text-amber-200">
                Zielbereich-Hinweis ({lowPitchStreakSec.toFixed(1)}s unter {settings.targetMinHz} Hz):
                Heb deine Stimme sanft in Richtung {settings.targetMinHz}–{settings.targetMaxHz} Hz (
                {hzToNoteInfo(targetCenterHz).noteName}) an!
              </span>
            ) : lowPitchStreakSec > 0.15 ? (
              <span className="text-amber-200/90 font-medium">
                Aktuell unter Zielbereich ({settings.targetMinHz} Hz):{' '}
                <strong className="text-amber-300">{lowPitchStreakSec.toFixed(1)}s</strong> /{' '}
                {settings.dropAlertSeconds.toFixed(1)}s bis Hinweis
              </span>
            ) : (
              <span className="text-slate-300">
                <strong className="text-emerald-300">Zielbereich-Wächter aktiv:</strong> Hinweis nach{' '}
                <strong>{settings.dropAlertSeconds.toFixed(1)}s</strong> Sprechzeit unter{' '}
                <strong>{settings.targetMinHz} Hz</strong>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Progress bar toward drop alert threshold */}
          {settings.enableDropAlert && (
            <div
              className="w-24 sm:w-32 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700/80"
              title={`Zeit unter ${settings.targetMinHz} Hz: ${lowPitchStreakSec.toFixed(1)}s / ${settings.dropAlertSeconds.toFixed(1)}s`}
            >
              <div
                style={{
                  width: `${Math.min(
                    100,
                    (lowPitchStreakSec / Math.max(0.5, settings.dropAlertSeconds)) * 100
                  )}%`,
                }}
                className={`h-full transition-all duration-150 ${
                  isDropAlertActive
                    ? 'bg-amber-400'
                    : lowPitchStreakSec > 0.15
                      ? 'bg-amber-500/80'
                      : 'bg-emerald-500/40'
                }`}
              />
            </div>
          )}

          {/* Optional gentle audio chime on drop alert */}
          <button
            type="button"
            onClick={() => {
              const next = !audioChimeEnabled;
              setAudioChimeEnabled(next);
              if (next) {
                referenceTonePlayer.playGentleAlertChime(targetCenterHz);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
              audioChimeEnabled
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                : 'border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-400'
            }`}
            title="Spielt zusätzlich zum optischen Hinweis einen sanften, kurzen Erinnerungston auf deiner Zielfrequenz ab"
          >
            {audioChimeEnabled ? (
              <Bell className="w-3.5 h-3.5 text-amber-300" />
            ) : (
              <BellOff className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="hidden sm:inline">
              {audioChimeEnabled ? 'Alarm-Ton: An' : 'Alarm-Ton: Aus'}
            </span>
          </button>
        </div>
      </div>

      {/* Top KPI Cards with fixed heights & tabular-nums so layout NEVER shifts */}
      <div
        className={`grid gap-3 ${
          compactMode ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        }`}
      >
        {/* Card 1: Current Pitch & Note */}
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 flex flex-col justify-between min-h-[136px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
              Aktuelle Tonhöhe
            </span>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border min-w-[82px] text-center shrink-0 ${zoneInfo.badge}`}
            >
              {zoneInfo.label}
            </span>
          </div>

          <div className="my-2 flex items-baseline justify-between gap-2">
            <div className={`text-3xl font-extrabold tracking-tight whitespace-nowrap ${zoneInfo.color}`}>
              {liveHz !== null ? `${Math.round(liveHz)} Hz` : '— Hz'}
            </div>
            <div className="text-right min-w-[68px]">
              <div className="text-xl font-bold text-slate-100 leading-tight">
                {liveNote ? liveNote.noteName : '—'}
              </div>
              <div className="text-[11px] text-slate-400 leading-tight">
                {liveNote
                  ? `${liveNote.cents >= 0 ? `+${liveNote.cents}` : liveNote.cents} ct`
                  : 'Pause'}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/80">
            <span>Zielkorridor:</span>
            <span className="font-semibold text-emerald-400">
              {settings.targetMinHz}–{settings.targetMaxHz} Hz (
              {hzToNoteInfo(settings.targetMinHz).noteName}–
              {hzToNoteInfo(settings.targetMaxHz).noteName})
            </span>
          </div>
        </div>

        {/* Card 2: Zone Distribution (Feminin / Androgyn / Maskulin) */}
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 flex flex-col justify-between min-h-[136px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
              Bereichs-Verteilung
            </span>
            <span className="text-xs font-semibold text-emerald-400 shrink-0">
              {stats.targetHitPercent.toFixed(0)}% im Ziel
            </span>
          </div>

          <div className="my-2 space-y-2">
            <div className="h-3.5 w-full rounded-full bg-slate-800 overflow-hidden flex p-0.5 gap-0.5">
              <div
                style={{ width: `${stats.femininePercent}%` }}
                className="bg-pink-400 rounded-l-full transition-all duration-200"
                title={`Feminin: ${stats.femininePercent}%`}
              />
              <div
                style={{ width: `${stats.androgynousPercent}%` }}
                className="bg-purple-400 transition-all duration-200"
                title={`Androgyn: ${stats.androgynousPercent}%`}
              />
              <div
                style={{ width: `${stats.masculinePercent}%` }}
                className="bg-sky-400 rounded-r-full transition-all duration-200"
                title={`Maskulin: ${stats.masculinePercent}%`}
              />
            </div>

            <div className="grid grid-cols-3 gap-1 text-center text-xs">
              <div className="rounded-lg bg-pink-500/10 border border-pink-500/20 py-1">
                <div className="font-bold text-pink-300">{stats.femininePercent.toFixed(0)}%</div>
                <div className="text-[10px] text-pink-200/70">Feminin</div>
              </div>
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 py-1">
                <div className="font-bold text-purple-300">{stats.androgynousPercent.toFixed(0)}%</div>
                <div className="text-[10px] text-purple-200/70">Androgyn</div>
              </div>
              <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 py-1">
                <div className="font-bold text-sky-300">{stats.masculinePercent.toFixed(0)}%</div>
                <div className="text-[10px] text-sky-200/70">Maskulin</div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Session Mean, Median, Min/Max & Melodic Intonation */}
        {!compactMode && (
          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 flex flex-col justify-between min-h-[136px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
                Session-Durchschnitt
              </span>
              <span className="text-xs font-medium text-slate-400 shrink-0">
                Median: {stats.medianHz ? `${Math.round(stats.medianHz)} Hz` : '—'}
              </span>
            </div>

            <div className="my-2 flex items-baseline justify-between gap-2">
              <div className="text-3xl font-extrabold text-white whitespace-nowrap">
                {stats.meanHz > 0 ? `${Math.round(stats.meanHz)} Hz` : '— Hz'}
              </div>
              <div className="text-right min-w-[96px]">
                <div className="text-lg font-bold text-purple-300 leading-tight">
                  {meanNote ? meanNote.noteName : '—'}
                </div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  {stats.minHz || '—'}–{stats.maxHz || '—'} Hz
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span>Melodie-Dynamik:</span>
              <span className="font-semibold text-slate-200">
                {stats.semitoneRange > 0 ? `${stats.semitoneRange.toFixed(1)} HT` : '—'} (
                {stats.semitoneRange >= 3.2 ? 'Lebendig' : stats.semitoneRange > 0 ? 'Ruhig' : '—'})
              </span>
            </div>
          </div>
        )}

        {/* Card 4: Resonance Brightness & Active Speaking Time */}
        {!compactMode && (
          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 flex flex-col justify-between min-h-[136px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
                Resonanz & Redezeit
              </span>
              <span className="text-xs font-semibold text-pink-300 shrink-0">
                F2: {currentSample?.f2Hz ?? (stats.meanF2Hz || '—')} Hz
              </span>
            </div>

            <div className="my-2 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Klangfarbe (Helligkeit)</span>
                <span className="font-bold text-slate-100">
                  {currentSample?.hz
                    ? `${currentSample.brightness}%`
                    : stats.meanBrightness
                      ? `Ø ${stats.meanBrightness}%`
                      : '—'}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  style={{
                    width: `${
                      currentSample?.hz ? currentSample.brightness : stats.meanBrightness
                    }%`,
                  }}
                  className="h-full bg-gradient-to-r from-sky-400 via-purple-400 to-pink-400 transition-all duration-200"
                />
              </div>
            </div>

            <div className="text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span>Aktive Sprechzeit:</span>
              <span className="font-semibold text-slate-200">
                {formatSeconds(stats.activeSpeakingSec)}{' '}
                <span className="text-slate-500">
                  / {formatSeconds(stats.totalDurationSec)}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Live Pitch Graph Card (Drop alert pulses border in-place without shifting layout!) */}
      <div
        className={`rounded-2xl border bg-slate-900/75 p-4 shadow-lg space-y-3 transition-colors duration-300 ${
          isDropAlertActive
            ? 'border-amber-400/70 discord-drop-alert'
            : 'border-slate-800/90'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-pink-400 shrink-0" />
            <h2 className="text-sm font-bold text-slate-100">
              Echtzeit-Frequenzverlauf (VoiceTools Pitch-Ansicht)
            </h2>
            {isDropAlertActive && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  Seit {lowPitchStreakSec.toFixed(1)}s unter Zielbereich – sanft anheben
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  showTargetCorridor: settings.showTargetCorridor === false,
                })
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition cursor-pointer ${
                settings.showTargetCorridor !== false
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Grünen Zielkorridor im Frequenzverlauf ein- oder ausblenden"
            >
              {settings.showTargetCorridor !== false ? (
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>
                Zielkorridor: {settings.showTargetCorridor !== false ? 'An' : 'Aus'}
              </span>
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 mr-1">Zeitausschnitt:</span>
              {[10, 20, 45, 90].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setWindowSeconds(sec)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition cursor-pointer ${
                    windowSeconds === sec
                      ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        </div>

        <PitchGraphCanvas
          samples={samples}
          currentSample={currentSample}
          liveSamplesRef={liveSamplesRef}
          liveCurrentSampleRef={liveCurrentSampleRef}
          settings={settings}
          height={compactMode ? 230 : 380}
          windowSeconds={windowSeconds}
          compact={compactMode}
          isListening={isListening}
          isPaused={isPaused}
        />

        {/* Legend bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-pink-400" />
              <span>
                Feminin ({settings.feminineMinHz}–{settings.feminineMaxHz}+ Hz)
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
              <span>
                Androgyn ({settings.androgynousMinHz}–{settings.feminineMinHz} Hz)
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              <span>
                Maskulin ({settings.masculineMinHz}–{settings.androgynousMinHz} Hz)
              </span>
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  showTargetCorridor: settings.showTargetCorridor === false,
                })
              }
              className={`inline-flex items-center gap-1.5 cursor-pointer transition ${
                settings.showTargetCorridor !== false
                  ? 'opacity-100'
                  : 'opacity-45 line-through'
              }`}
              title="Klicken, um den Zielkorridor im Graphen ein- oder auszublenden"
            >
              <span className="h-0.5 w-4 border-b-2 border-dashed border-emerald-400" />
              <span className="text-emerald-300">
                Dein Ziel ({settings.targetMinHz}–{settings.targetMaxHz} Hz)
              </span>
            </button>
          </div>

          <span>
            {settings.smartPauseCompress
              ? 'Smart-Scroll aktiv: Pausen werden angehalten'
              : 'Echtzeit-Slide aktiv (60 FPS)'}
          </span>
        </div>
      </div>

      {/* Save Session Bar (Always rendered in full mode so layout never jumps on first spoken word) */}
      {!compactMode && (
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
            <input
              type="text"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Titel der Session (z.B. Discord Abendrunde)"
              className="rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-pink-500 w-52"
            />
            <input
              type="text"
              value={saveNotes}
              onChange={(e) => setSaveNotes(e.target.value)}
              placeholder="Optionale Notiz (z.B. Stimme fühlte sich heute entspannt an)…"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-pink-500 min-w-[200px]"
            />
          </div>

          <div className="flex items-center gap-3">
            {saveBanner && (
              <span className="text-xs font-medium text-emerald-400">{saveBanner}</span>
            )}
            <button
              type="button"
              disabled={stats.voicedSampleCount === 0}
              onClick={handleQuickSave}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow transition ${
                stats.voicedSampleCount > 0
                  ? 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <BookmarkCheck className="w-4 h-4" />
              <span>Session im Verlauf speichern</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
