import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  BookmarkCheck,
  CheckCircle2,
  Mic,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import { hzToNoteInfo } from '../audio/pitchEngine';
import { BUILTIN_READING_PASSAGES } from '../data/readingPassages';
import {
  CompactPitchPoint,
  PitchSample,
  ReadingPassage,
  SessionStats,
  TrainingSessionRecord,
  VoiceSettings,
} from '../types/voice';
import { PitchGraphCanvas } from './PitchGraphCanvas';

interface ReadingTrainerProps {
  isListening: boolean;
  currentSample: PitchSample | null;
  samples: PitchSample[];
  liveSamplesRef: React.RefObject<PitchSample[]>;
  liveCurrentSampleRef: React.RefObject<PitchSample | null>;
  stats: SessionStats;
  settings: VoiceSettings;
  recordedAudioUrl: string | null;
  customPassages: ReadingPassage[];
  onStartReadingMic: () => Promise<void>;
  onStartReadingDemo: () => void;
  onStopReading: () => void;
  onResetSession: () => void;
  onSaveSession: (record: TrainingSessionRecord) => Promise<void>;
  onAddCustomPassage: (passage: ReadingPassage) => Promise<void>;
  onDeleteCustomPassage: (id: string) => Promise<void>;
}

export const ReadingTrainer: React.FC<ReadingTrainerProps> = ({
  isListening,
  currentSample,
  samples,
  liveSamplesRef,
  liveCurrentSampleRef,
  stats,
  settings,
  recordedAudioUrl,
  customPassages,
  onStartReadingMic,
  onStartReadingDemo,
  onStopReading,
  onResetSession,
  onSaveSession,
  onAddCustomPassage,
  onDeleteCustomPassage,
}) => {
  const allPassages = [...BUILTIN_READING_PASSAGES, ...customPassages];
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(BUILTIN_READING_PASSAGES[0].id);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<number | null>(null);

  // New custom passage modal state
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newTip, setNewTip] = useState('');
  const [newContent, setNewContent] = useState('');

  // Mandatory modern-web-guidance fallback for <dialog closedby="any">
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      };
      dialog.addEventListener('click', handleBackdropClick);
      return () => dialog.removeEventListener('click', handleBackdropClick);
    }
    return undefined;
  }, []);

  const filteredPassages =
    selectedCategory === 'all'
      ? allPassages
      : allPassages.filter((p) => p.category === selectedCategory);

  const activePassage =
    allPassages.find((p) => p.id === selectedId) ||
    filteredPassages[0] ||
    BUILTIN_READING_PASSAGES[0];

  const handleStartMic = async () => {
    onResetSession();
    setPlaybackProgress(null);
    await onStartReadingMic();
  };

  const handleStartDemo = () => {
    onResetSession();
    setPlaybackProgress(null);
    onStartReadingDemo();
  };

  const handleSaveReadingResult = async () => {
    if (stats.voicedSampleCount === 0) return;
    const step = Math.max(1, Math.floor(samples.length / 180));
    const t0 = samples[0]?.timestamp ?? Date.now();
    const trace: CompactPitchPoint[] = [];
    for (let i = 0; i < samples.length; i += step) {
      const s = samples[i];
      trace.push({
        t: Math.round((s.timestamp - t0) / 100) / 10,
        hz: s.hz,
        f2: s.f2Hz,
        b: s.brightness,
      });
    }

    const record: TrainingSessionRecord = {
      id: `reading_${Date.now()}`,
      createdAt: new Date().toISOString(),
      type: 'reading',
      title: `Lesetraining: ${activePassage.title}`,
      tags: ['Lesetraining', activePassage.category],
      notes: `Text: ${activePassage.title}`,
      stats,
      pitchTrace: trace,
    };

    await onSaveSession(record);
    setSavedNotice('Lese-Auswertung im Verlauf gespeichert!');
    setTimeout(() => setSavedNotice(null), 3500);
  };

  const handleCreateCustomPassage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    const created: ReadingPassage = {
      id: `custom_${Date.now()}`,
      title: newTitle.trim(),
      category: 'custom',
      difficulty: 'mittel',
      focusTip:
        newTip.trim() ||
        'Achte beim Lesen auf eine entspannte Atmung und weiche Stimmeinsätze.',
      content: newContent.trim(),
    };
    await onAddCustomPassage(created);
    setSelectedId(created.id);
    setNewTitle('');
    setNewTip('');
    setNewContent('');
    dialogRef.current?.close();
  };

  // Coaching feedback generator
  const getCoachingTip = (): string => {
    if (stats.voicedSampleCount === 0) return '';
    if (stats.femininePercent >= 75 && stats.meanBrightness >= 65) {
      return 'Hervorragend! Deine Tonhöhe und deine helle Mundraum-Resonanz lagen sehr konstant im femininen Zielbereich.';
    }
    if (stats.semitoneRange < 2.4) {
      return 'Tipp zur Sprachmelodie: Deine Tonhöhe war recht gleichmäßig. Versuche betonte Wörter durch einen sanften Tonhöhen-Bogen nach oben hervorzuheben.';
    }
    if (stats.meanBrightness < 55) {
      return 'Tipp zur Resonanz: Deine Grundfrequenz ist auf einem guten Weg, aber die Klangfarbe war noch etwas dunkel. Denke an ein leichtes inneres Lächeln (wie beim Vokal „i“).';
    }
    if (stats.femininePercent < 50) {
      return 'Tipp zur Tonhöhe: Vor allem am Satzende sinkt die Stimme oft unbewusst ab. Versuche den letzten Teil jedes Satzes gedanklich leicht nach oben zu tragen.';
    }
    return 'Gute Balance! Deine Stimme bewegt sich harmonisch zwischen dem androgynen und femininen Frequenzbereich.';
  };

  return (
    <div className="space-y-5">
      {/* Category & Passage Picker */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { id: 'all', label: 'Alle Texte' },
              { id: 'standard', label: 'Logopädie-Klassiker' },
              { id: 'discord', label: 'Discord & Gaming' },
              { id: 'resonanz', label: 'Resonanz & Melodie' },
              { id: 'custom', label: `Eigene Texte (${customPassages.length})` },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-lg px-3 py-1.5 font-medium transition cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-pink-500/20 text-pink-200 border border-pink-500/40'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => dialogRef.current?.showModal()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20 px-3 py-1.5 text-xs font-semibold text-pink-200 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Eigenen Übungstext anlegen</span>
          </button>
        </div>

        {/* Passage Selector Pills */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filteredPassages.map((passage) => {
            const isSelected = passage.id === activePassage.id;
            return (
              <div
                key={passage.id}
                onClick={() => setSelectedId(passage.id)}
                className={`group flex items-start justify-between gap-2 rounded-xl border p-3 text-left transition cursor-pointer ${
                  isSelected
                    ? 'border-pink-500/60 bg-pink-500/10 text-white'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="space-y-1">
                  <div className="text-xs font-bold leading-snug">{passage.title}</div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="capitalize">{passage.category}</span>
                    <span>·</span>
                    <span className="capitalize">{passage.difficulty}</span>
                  </div>
                </div>
                {passage.category === 'custom' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDeleteCustomPassage(passage.id);
                    }}
                    className="opacity-70 hover:opacity-100 text-rose-400 p-1 rounded cursor-pointer"
                    title="Eigenen Text löschen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Reading Card & Recording Controls */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-pink-400" />
            <div>
              <h2 className="text-base font-bold text-white">{activePassage.title}</h2>
              <p className="text-xs text-purple-300 mt-0.5">{activePassage.focusTip}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isListening ? (
              <>
                <button
                  type="button"
                  onClick={handleStartMic}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 px-4 py-2 text-xs font-semibold text-white shadow-md cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Vorlesen starten (mit Aufnahme)</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartDemo}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Demo-Vorlesen</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onStopReading}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-md cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>Aufnahme beenden & Auswerten</span>
              </button>
            )}
          </div>
        </div>

        {/* Large Readable Passage Text */}
        <div className="rounded-xl bg-slate-950/70 border border-slate-800/90 p-5 text-lg md:text-xl leading-relaxed text-slate-100 font-normal tracking-wide select-text">
          {activePassage.content}
        </div>

        {/* Live or Recorded Pitch Graph */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {isListening
                ? 'Live-Aufzeichnung läuft – lies den Text oben in deinem Wohlfühl-Tempo vor…'
                : stats.voicedSampleCount > 0
                  ? 'Aufgezeichneter Stimmverlauf deiner Lese-Einheit:'
                  : 'Klicke auf „Vorlesen starten“, um deinen Frequenzverlauf beim Lesen aufzuzeichnen.'}
            </span>
            {currentSample?.hz && (
              <span className="font-bold text-pink-400">
                Aktuell: {Math.round(currentSample.hz)} Hz ({hzToNoteInfo(currentSample.hz).noteName})
              </span>
            )}
          </div>

          <PitchGraphCanvas
            samples={samples}
            currentSample={currentSample}
            liveSamplesRef={liveSamplesRef}
            liveCurrentSampleRef={liveCurrentSampleRef}
            settings={settings}
            height={260}
            windowSeconds={30}
            playbackProgress={playbackProgress}
            isListening={isListening}
          />
        </div>

        {/* Audio Playback & Evaluation Summary */}
        {stats.voicedSampleCount > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Auswertung deiner Lese-Session
                </h3>
              </div>

              {recordedAudioUrl && (
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-pink-400" />
                  <audio
                    controls
                    src={recordedAudioUrl}
                    className="h-8"
                    onTimeUpdate={(e) => {
                      const el = e.currentTarget;
                      if (el.duration && isFinite(el.duration) && el.duration > 0) {
                        setPlaybackProgress(el.currentTime / el.duration);
                      }
                    }}
                    onEnded={() => setPlaybackProgress(null)}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
                <div className="text-xs text-slate-400">Ø Tonhöhe</div>
                <div className="text-xl font-extrabold text-white mt-0.5">
                  {Math.round(stats.meanHz)} Hz{' '}
                  <span className="text-sm font-semibold text-pink-400">
                    ({hzToNoteInfo(stats.meanHz).noteName})
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-pink-500/10 border border-pink-500/25 p-3">
                <div className="text-xs text-pink-200/80">Feminin / Androgyn</div>
                <div className="text-xl font-extrabold text-pink-300 mt-0.5">
                  {stats.femininePercent}%{' '}
                  <span className="text-sm font-semibold text-purple-300">
                    / {stats.androgynousPercent}%
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3">
                <div className="text-xs text-emerald-200/80">Im Zielkorridor</div>
                <div className="text-xl font-extrabold text-emerald-300 mt-0.5">
                  {stats.targetHitPercent}%
                </div>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
                <div className="text-xs text-slate-400">Melodie & Helligkeit</div>
                <div className="text-xl font-extrabold text-purple-300 mt-0.5">
                  {stats.semitoneRange} HT · {stats.meanBrightness}%
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
              <p className="text-xs text-slate-300 max-w-2xl">{getCoachingTip()}</p>

              <div className="flex items-center gap-2">
                {savedNotice && (
                  <span className="text-xs text-emerald-400 font-medium">{savedNotice}</span>
                )}
                <button
                  type="button"
                  onClick={handleSaveReadingResult}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  <BookmarkCheck className="w-4 h-4" />
                  <span>Im Verlauf speichern</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Native Modal Dialog for adding a custom passage (follows modern-web-guidance) */}
      <dialog
        ref={dialogRef}
        closedby="any"
        aria-labelledby="custom-passage-dialog-title"
        className="rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 p-6 shadow-2xl max-w-lg w-full m-auto"
      >
        <form onSubmit={handleCreateCustomPassage} className="space-y-4">
          <h3 id="custom-passage-dialog-title" className="text-base font-bold text-white">
            Eigenen Übungstext hinzufügen
          </h3>
          <div className="space-y-1">
            <label htmlFor="custom-title" className="block text-xs font-medium text-slate-300">
              Titel des Textes
            </label>
            <input
              id="custom-title"
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="z.B. Meine Discord-Begrüßung oder Lieblingstext"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="custom-tip" className="block text-xs font-medium text-slate-300">
              Persönlicher Fokus-Tipp (optional)
            </label>
            <input
              id="custom-tip"
              type="text"
              value={newTip}
              onChange={(e) => setNewTip(e.target.value)}
              placeholder="z.B. Am Satzende oben bleiben"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="custom-content" className="block text-xs font-medium text-slate-300">
              Vorlesetext
            </label>
            <textarea
              id="custom-content"
              rows={5}
              required
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Füge hier deinen Text oder deine typischen Sätze ein…"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-xl bg-pink-600 hover:bg-pink-500 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Text speichern
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
