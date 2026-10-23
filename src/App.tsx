import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  History,
  Moon,
  Music,
  Sliders,
  Sun,
  Waves,
} from 'lucide-react';
import { useVoiceTracker } from './audio/useVoiceTracker';
import { DiscordPipOverlay } from './components/DiscordPipOverlay';
import { HistoryView } from './components/HistoryView';
import { LiveMonitor } from './components/LiveMonitor';
import { PitchExercises } from './components/PitchExercises';
import { ReadingTrainer } from './components/ReadingTrainer';
import { ResonanceView } from './components/ResonanceView';
import { SettingsDialog } from './components/SettingsDialog';
import {
  deleteCustomPassage,
  deleteSessionRecord,
  getAllSessions,
  getCustomPassages,
  loadVoiceSettings,
  saveCustomPassage,
  saveSessionRecord,
  saveVoiceSettings,
} from './storage/db';
import {
  DEFAULT_VOICE_SETTINGS,
  ReadingPassage,
  TrainingSessionRecord,
  VoiceSettings,
} from './types/voice';

type ActiveTab = 'live' | 'reading' | 'resonance' | 'exercises' | 'history';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('live');
  const [settings, setSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [customPassages, setCustomPassages] = useState<ReadingPassage[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  // Two-state color-scheme toggle per modern-web-guidance
  const [pinnedScheme, setPinnedScheme] = useState<'light' | 'dark' | null>(() => {
    const saved = localStorage.getItem('color-scheme');
    return saved === 'light' || saved === 'dark' ? saved : null;
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveTheme: 'light' | 'dark' =
    pinnedScheme ?? (systemPrefersDark ? 'dark' : 'light');

  const toggleTheme = () => {
    const meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null;
    if (pinnedScheme !== null) {
      // Return to system preference
      setPinnedScheme(null);
      localStorage.removeItem('color-scheme');
      if (meta) meta.content = 'light dark';
      delete document.documentElement.dataset.theme;
    } else {
      // Pin the opposite of the current system setting
      const opposite: 'light' | 'dark' = systemPrefersDark ? 'light' : 'dark';
      setPinnedScheme(opposite);
      localStorage.setItem('color-scheme', opposite);
      if (meta) meta.content = opposite;
      document.documentElement.dataset.theme = opposite;
    }
  };

  const refreshStoredData = useCallback(async () => {
    const [loadedSessions, loadedPassages] = await Promise.all([
      getAllSessions(),
      getCustomPassages(),
    ]);
    setSessions(loadedSessions);
    setCustomPassages(loadedPassages);
    setSettings(loadVoiceSettings());
  }, []);

  useEffect(() => {
    void refreshStoredData();
  }, [refreshStoredData]);

  const handleUpdateSettings = useCallback((partial: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveVoiceSettings(next);
      return next;
    });
  }, []);

  const handleResetDefaults = useCallback(() => {
    saveVoiceSettings(DEFAULT_VOICE_SETTINGS);
    setSettings({ ...DEFAULT_VOICE_SETTINGS });
  }, []);

  const tracker = useVoiceTracker(settings);

  const handleSaveSession = useCallback(
    async (record: TrainingSessionRecord) => {
      await saveSessionRecord(record);
      const updated = await getAllSessions();
      setSessions(updated);
    },
    []
  );

  const handleDeleteSession = useCallback(async (id: string) => {
    await deleteSessionRecord(id);
    const updated = await getAllSessions();
    setSessions(updated);
  }, []);

  const handleAddCustomPassage = useCallback(async (passage: ReadingPassage) => {
    await saveCustomPassage(passage);
    const updated = await getCustomPassages();
    setCustomPassages(updated);
  }, []);

  const handleDeleteCustomPassage = useCallback(async (id: string) => {
    await deleteCustomPassage(id);
    const updated = await getCustomPassages();
    setCustomPassages(updated);
  }, []);

  const handleSeedDemoHistory = useCallback(async () => {
    const now = Date.now();
    const demoEntries: TrainingSessionRecord[] = [
      {
        id: 'seed_1',
        createdAt: new Date(now - 6 * 86400000).toISOString(),
        type: 'reading',
        title: 'Lesetraining: Der Nordwind und die Sonne',
        tags: ['Lesetraining', 'Warmup'],
        notes: 'Erster Durchlauf am Morgen – noch etwas Brustresonanz am Satzende.',
        stats: {
          meanHz: 176,
          medianHz: 175,
          minHz: 148,
          maxHz: 208,
          stdDevHz: 14,
          semitoneRange: 3.1,
          femininePercent: 42,
          androgynousPercent: 46,
          masculinePercent: 12,
          targetHitPercent: 39,
          meanF1Hz: 560,
          meanF2Hz: 1790,
          meanBrightness: 62,
          totalDurationSec: 95,
          activeSpeakingSec: 78,
          voicedSampleCount: 450,
        },
        pitchTrace: [],
      },
      {
        id: 'seed_2',
        createdAt: new Date(now - 4 * 86400000).toISOString(),
        type: 'discord-live',
        title: 'Discord Abendrunde mit Freunden',
        tags: ['Discord', 'Gaming'],
        notes: 'Smart-Scroll genutzt, Fokus auf helle Vokale bei Begrüßungen.',
        stats: {
          meanHz: 186,
          medianHz: 187,
          minHz: 155,
          maxHz: 224,
          stdDevHz: 16,
          semitoneRange: 3.6,
          femininePercent: 61,
          androgynousPercent: 31,
          masculinePercent: 8,
          targetHitPercent: 58,
          meanF1Hz: 595,
          meanF2Hz: 1930,
          meanBrightness: 71,
          totalDurationSec: 1840,
          activeSpeakingSec: 620,
          voicedSampleCount: 2400,
        },
        pitchTrace: [],
      },
      {
        id: 'seed_3',
        createdAt: new Date(now - 2 * 86400000).toISOString(),
        type: 'exercise',
        title: 'Zielton-Übung (G3 · 196 Hz)',
        tags: ['Zielton-Übung', '5 Wiederholungen'],
        notes: 'Weicher Stimmansatz auf G3 und A3 fiel heute sehr leicht.',
        stats: {
          meanHz: 196,
          medianHz: 196,
          minHz: 184,
          maxHz: 212,
          stdDevHz: 7,
          semitoneRange: 2.4,
          femininePercent: 88,
          androgynousPercent: 12,
          masculinePercent: 0,
          targetHitPercent: 86,
          meanF1Hz: 630,
          meanF2Hz: 2080,
          meanBrightness: 78,
          totalDurationSec: 320,
          activeSpeakingSec: 210,
          voicedSampleCount: 920,
        },
        pitchTrace: [],
      },
      {
        id: 'seed_4',
        createdAt: new Date(now - 1 * 86400000).toISOString(),
        type: 'discord-live',
        title: 'Discord Voice-Chat & Co-Op Abend',
        tags: ['Discord', 'Live-Monitor'],
        notes: 'Stimme blieb auch nach 45 Minuten entspannt im femininen Zielbereich!',
        stats: {
          meanHz: 199,
          medianHz: 201,
          minHz: 166,
          maxHz: 238,
          stdDevHz: 17,
          semitoneRange: 4.1,
          femininePercent: 78,
          androgynousPercent: 19,
          masculinePercent: 3,
          targetHitPercent: 74,
          meanF1Hz: 640,
          meanF2Hz: 2110,
          meanBrightness: 80,
          totalDurationSec: 2700,
          activeSpeakingSec: 940,
          voicedSampleCount: 3800,
        },
        pitchTrace: [],
      },
    ];

    for (const item of demoEntries) {
      await saveSessionRecord(item);
    }
    const updated = await getAllSessions();
    setSessions(updated);
  }, []);

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'live',
      label: 'Live-Monitor (Discord)',
      shortLabel: 'Live',
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'reading',
      label: 'Lese- & Sprechtraining',
      shortLabel: 'Lesen',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'resonance',
      label: 'Resonanz & Klangfarbe',
      shortLabel: 'Resonanz',
      icon: <Waves className="w-4 h-4" />,
    },
    {
      id: 'exercises',
      label: 'Zielton-Übungen',
      shortLabel: 'Übungen',
      icon: <Music className="w-4 h-4" />,
    },
    {
      id: 'history',
      label: `Verlauf (${sessions.length})`,
      shortLabel: 'Verlauf',
      icon: <History className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-surface)] text-[var(--text-primary)]">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand Logo & Live Status */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-400 via-purple-500 to-pink-500 p-0.5 shadow-md shadow-pink-500/15">
              <div className="h-full w-full rounded-[10px] bg-slate-950 flex items-center justify-center">
                <Activity className="w-5 h-5 text-pink-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-sky-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                  VoiceTrack
                </h1>
                <span className="hidden sm:inline-block rounded-full border border-pink-500/30 bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold text-pink-300">
                  Stimmfeminisierung & Pitch-Monitor
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden md:block">
                Echtzeit-Frequenzanalyse (Feminin · Androgyn · Maskulin) & Resonanz-Training
              </p>
            </div>
          </div>

          {/* Right Action Controls: PiP Overlay, Settings, Theme */}
          <div className="flex flex-wrap items-center gap-2">
            <DiscordPipOverlay
              currentSample={tracker.currentSample}
              samples={tracker.samples}
              liveSamplesRef={tracker.liveSamplesRef}
              liveCurrentSampleRef={tracker.liveCurrentSampleRef}
              stats={tracker.sessionStats}
              settings={settings}
              isListening={tracker.isListening}
              isDropAlertActive={tracker.isDropAlertActive}
              compactMode={compactMode}
              onToggleCompactMode={() => setCompactMode((prev) => !prev)}
            />

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition cursor-pointer"
              title="Frequenzbereiche und Zielkorridor anpassen"
            >
              <Sliders className="w-3.5 h-3.5 text-pink-400" />
              <span className="hidden sm:inline">Einstellungen</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 p-1.5 text-slate-200 transition cursor-pointer"
              title={
                pinnedScheme
                  ? 'Zurück zum System-Farbschema wechseln'
                  : `Auf ${effectiveTheme === 'dark' ? 'Light-Mode' : 'Dark-Mode'} umschalten`
              }
              aria-label="Farbschema umschalten"
            >
              {effectiveTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-300" />
              ) : (
                <Moon className="w-4 h-4 text-purple-300" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto pb-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-200 border border-pink-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5">
        {activeTab === 'live' && (
          <LiveMonitor
            isListening={tracker.isListening}
            isPaused={tracker.isPaused}
            demoProfile={tracker.demoProfile}
            error={tracker.error}
            devices={tracker.devices}
            currentSample={tracker.currentSample}
            samples={tracker.samples}
            liveSamplesRef={tracker.liveSamplesRef}
            liveCurrentSampleRef={tracker.liveCurrentSampleRef}
            stats={tracker.sessionStats}
            settings={settings}
            isDropAlertActive={tracker.isDropAlertActive}
            lowPitchStreakSec={tracker.lowPitchStreakSec}
            compactMode={compactMode}
            onStartMic={() => void tracker.startMicrophone(false)}
            onStartDemo={tracker.startDemoMode}
            onStop={tracker.stopTracking}
            onTogglePause={tracker.togglePause}
            onReset={tracker.resetSession}
            onUpdateSettings={handleUpdateSettings}
            onSaveSession={handleSaveSession}
            onOpenSettingsModal={() => setIsSettingsOpen(true)}
          />
        )}

        {activeTab === 'reading' && (
          <ReadingTrainer
            isListening={tracker.isListening}
            currentSample={tracker.currentSample}
            samples={tracker.samples}
            liveSamplesRef={tracker.liveSamplesRef}
            liveCurrentSampleRef={tracker.liveCurrentSampleRef}
            stats={tracker.sessionStats}
            settings={settings}
            recordedAudioUrl={tracker.recordedAudioUrl}
            customPassages={customPassages}
            onStartReadingMic={() => tracker.startMicrophone(true)}
            onStartReadingDemo={() => tracker.startDemoMode('feminin')}
            onStopReading={tracker.stopTracking}
            onResetSession={tracker.resetSession}
            onSaveSession={handleSaveSession}
            onAddCustomPassage={handleAddCustomPassage}
            onDeleteCustomPassage={handleDeleteCustomPassage}
          />
        )}

        {activeTab === 'resonance' && (
          <ResonanceView
            isListening={tracker.isListening}
            demoProfile={tracker.demoProfile}
            currentSample={tracker.currentSample}
            samples={tracker.samples}
            stats={tracker.sessionStats}
            spectrumDb={tracker.spectrumDb}
            sampleRate={tracker.sampleRate}
            settings={settings}
            onStartMic={() => void tracker.startMicrophone(false)}
            onStartDemo={tracker.startDemoMode}
            onStop={tracker.stopTracking}
          />
        )}

        {activeTab === 'exercises' && (
          <PitchExercises
            isListening={tracker.isListening}
            demoProfile={tracker.demoProfile}
            currentSample={tracker.currentSample}
            stats={tracker.sessionStats}
            settings={settings}
            onStartMic={() => void tracker.startMicrophone(false)}
            onStartDemo={tracker.startDemoMode}
            onStop={tracker.stopTracking}
            onSaveSession={handleSaveSession}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            sessions={sessions}
            settings={settings}
            onDeleteSession={handleDeleteSession}
            onSeedDemoHistory={handleSeedDemoHistory}
            onBackupRestored={refreshStoredData}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/70 bg-[#0b0f19]/80 py-3 px-4 text-center text-[11px] text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>
            VoiceTrack PWA · 100% lokale Sprachverarbeitung im Browser (keine Audiodaten verlassen
            dein Gerät)
          </span>
          <span>
            Bereiche: Maskulin ({settings.masculineMinHz}–{settings.androgynousMinHz} Hz) ·
            Androgyn ({settings.androgynousMinHz}–{settings.feminineMinHz} Hz) · Feminin (
            {settings.feminineMinHz}–{settings.feminineMaxHz}+ Hz)
          </span>
        </div>
      </footer>

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onResetDefaults={handleResetDefaults}
      />
    </div>
  );
};

export default App;
