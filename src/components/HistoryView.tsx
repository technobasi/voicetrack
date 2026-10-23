import React, { useRef, useState } from 'react';
import {
  Calendar,
  Download,
  History,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { hzToNoteInfo } from '../audio/pitchEngine';
import { createFullBackup, restoreFromBackup, VoiceTrackBackup } from '../storage/db';
import { TrainingSessionRecord, VoiceSettings } from '../types/voice';

interface HistoryViewProps {
  sessions: TrainingSessionRecord[];
  settings: VoiceSettings;
  onDeleteSession: (id: string) => Promise<void>;
  onSeedDemoHistory: () => Promise<void>;
  onBackupRestored: () => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sessions,
  settings,
  onDeleteSession,
  onSeedDemoHistory,
  onBackupRestored,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredSessions =
    filterType === 'all'
      ? sessions
      : sessions.filter((s) => s.type === filterType);

  const totalSpeakingMinutes = Math.round(
    sessions.reduce((acc, s) => acc + (s.stats.activeSpeakingSec || 0), 0) / 60
  );

  const overallMeanHz =
    sessions.length > 0
      ? Math.round(
          sessions.reduce((acc, s) => acc + s.stats.meanHz, 0) / sessions.length
        )
      : 0;

  const overallFemPercent =
    sessions.length > 0
      ? Math.round(
          sessions.reduce((acc, s) => acc + s.stats.femininePercent, 0) /
            sessions.length
        )
      : 0;

  const handleExportBackup = async () => {
    const backup = await createFullBackup();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `voicetrack-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Backup-Datei erfolgreich heruntergeladen!');
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as VoiceTrackBackup;
      const res = await restoreFromBackup(parsed);
      await onBackupRestored();
      setStatusMessage(
        `Import erfolgreich: ${res.sessionsImported} Sessions und ${res.passagesImported} eigene Texte wiederhergestellt.`
      );
    } catch {
      setStatusMessage('Fehler beim Importieren: Ungültige Backup-Datei.');
    }
    e.target.value = '';
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Chronological sessions for the progress chart (oldest -> newest)
  const chronological = [...sessions].reverse().slice(-20);

  return (
    <div className="space-y-5 tabular-nums">
      {/* Header & Cross-Device Backup Controls */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-pink-400" />
            <span>Trainings-Verlauf, Statistik & Geräte-Synchronisation</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Alle Daten werden zu 100% privat in deinem Browser (IndexedDB) gespeichert und können
            per 1-Klick-Backup zwischen PC, Tablet und Smartphone übertragen werden.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-3.5 py-2 text-xs font-semibold text-emerald-200 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Backup exportieren (JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/15 hover:bg-purple-500/25 px-3.5 py-2 text-xs font-semibold text-purple-200 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Backup importieren</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />

          {sessions.length === 0 && (
            <button
              type="button"
              onClick={onSeedDemoHistory}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>Beispiel-Verlauf laden</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-medium text-emerald-200">
          {statusMessage}
        </div>
      )}

      {/* Overall KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
          <div className="text-xs text-slate-400 font-semibold uppercase">
            Gespeicherte Sessions
          </div>
          <div className="text-2xl font-extrabold text-white mt-1">{sessions.length}</div>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
          <div className="text-xs text-slate-400 font-semibold uppercase">
            Ø Tonhöhe über alle Sessions
          </div>
          <div className="text-2xl font-extrabold text-pink-400 mt-1">
            {overallMeanHz > 0
              ? `${overallMeanHz} Hz (${hzToNoteInfo(overallMeanHz).noteName})`
              : '— Hz'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
          <div className="text-xs text-slate-400 font-semibold uppercase">
            Ø Anteil im femininen Bereich
          </div>
          <div className="text-2xl font-extrabold text-purple-300 mt-1">
            {sessions.length > 0 ? `${overallFemPercent}%` : '— %'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
          <div className="text-xs text-slate-400 font-semibold uppercase">
            Aktive Sprechzeit gesamt
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {totalSpeakingMinutes} Min.
          </div>
        </div>
      </div>

      {/* Long-Term Trend Chart */}
      {chronological.length > 1 && (
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-pink-400" />
              <span>Entwicklung deiner Durchschnittstonhöhe (Ø Hz)</span>
            </h3>
            <span className="text-xs text-slate-400">
              Letzte {chronological.length} Sessions
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 700 190"
              className="w-full h-44 rounded-xl bg-[#0d1322] border border-slate-800"
            >
              {/* Feminine threshold line */}
              {(() => {
                const minH = 120;
                const maxH = 250;
                const yOf = (hz: number) =>
                  20 + (1 - Math.max(0, Math.min(1, (hz - minH) / (maxH - minH)))) * 140;
                const femY = yOf(settings.feminineMinHz);
                const androY = yOf(settings.androgynousMinHz);

                return (
                  <>
                    <rect
                      x={45}
                      y={20}
                      width={635}
                      height={Math.max(0, femY - 20)}
                      fill="rgba(244, 114, 182, 0.1)"
                    />
                    <line
                      x1={45}
                      y1={femY}
                      x2={680}
                      y2={femY}
                      stroke="#f472b6"
                      strokeDasharray="4 4"
                      strokeWidth="1.2"
                    />
                    <text x={40} y={femY + 4} fill="#f472b6" fontSize="10" textAnchor="end">
                      {settings.feminineMinHz}
                    </text>

                    <line
                      x1={45}
                      y1={androY}
                      x2={680}
                      y2={androY}
                      stroke="#c084fc"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text x={40} y={androY + 4} fill="#c084fc" fontSize="10" textAnchor="end">
                      {settings.androgynousMinHz}
                    </text>

                    {/* Trend polyline */}
                    <polyline
                      fill="none"
                      stroke="#f472b6"
                      strokeWidth="3"
                      points={chronological
                        .map((s, idx) => {
                          const x =
                            60 +
                            (idx / Math.max(1, chronological.length - 1)) * 600;
                          const y = yOf(s.stats.meanHz || 180);
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />

                    {/* Data points */}
                    {chronological.map((s, idx) => {
                      const x =
                        60 + (idx / Math.max(1, chronological.length - 1)) * 600;
                      const y = yOf(s.stats.meanHz || 180);
                      return (
                        <g key={s.id}>
                          <circle
                            cx={x}
                            cy={y}
                            r="4.5"
                            fill="#f472b6"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                          <text
                            x={x}
                            y={y - 9}
                            fill="#e2e8f0"
                            fontSize="9"
                            textAnchor="middle"
                          >
                            {Math.round(s.stats.meanHz)}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      )}

      {/* Filter Bar & Session Cards */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { id: 'all', label: 'Alle Einträge' },
              { id: 'discord-live', label: 'Discord / Live-Monitor' },
              { id: 'reading', label: 'Lesetraining' },
              { id: 'exercise', label: 'Zielton-Übungen' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`rounded-lg px-3 py-1.5 font-medium transition cursor-pointer ${
                  filterType === tab.id
                    ? 'bg-pink-500/20 text-pink-200 border border-pink-500/40'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/50 p-8 text-center space-y-3">
            <Calendar className="w-8 h-8 text-slate-500 mx-auto" />
            <div className="text-sm font-semibold text-slate-300">
              Noch keine gespeicherten Sessions in dieser Ansicht
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Starte eine Aufnahme im Live-Monitor (z.B. während eines Discord-Gesprächs) oder im
              Lesetraining und klicke auf „Session speichern“, um deinen Fortschritt hier zu
              verfolgen.
            </p>
            <button
              type="button"
              onClick={onSeedDemoHistory}
              className="inline-flex items-center gap-1.5 rounded-xl border border-pink-500/40 bg-pink-500/15 hover:bg-pink-500/25 px-4 py-2 text-xs font-semibold text-pink-200 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Beispiel-Trainingsverlauf generieren</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => {
              const dateFormatted = new Date(session.createdAt).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const note =
                session.stats.meanHz > 0 ? hzToNoteInfo(session.stats.meanHz) : null;

              return (
                <div
                  key={session.id}
                  className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">{session.title}</span>
                      <span className="text-xs text-slate-400">{dateFormatted}</span>
                      {session.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {session.notes && (
                      <p className="text-xs text-slate-300">{session.notes}</p>
                    )}

                    {/* Distribution bar */}
                    <div className="flex items-center gap-3 pt-1 max-w-md">
                      <div className="h-2 flex-1 rounded-full bg-slate-800 overflow-hidden flex">
                        <div
                          style={{ width: `${session.stats.femininePercent}%` }}
                          className="bg-pink-400"
                        />
                        <div
                          style={{ width: `${session.stats.androgynousPercent}%` }}
                          className="bg-purple-400"
                        />
                        <div
                          style={{ width: `${session.stats.masculinePercent}%` }}
                          className="bg-sky-400"
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        Fem {session.stats.femininePercent}% · Andro{' '}
                        {session.stats.androgynousPercent}% · Mask{' '}
                        {session.stats.masculinePercent}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-center">
                    {session.pitchTrace && session.pitchTrace.filter((p) => p.hz !== null).length > 1 && (
                      <svg
                        viewBox="0 0 120 36"
                        className="w-28 h-9 rounded-lg bg-[#0d1322] border border-slate-800 hidden sm:block"
                        aria-label="Gespeicherte Tonhöhenkurve"
                      >
                        {(() => {
                          const voicedPts = session.pitchTrace.filter(
                            (p): p is { t: number; hz: number } => p.hz !== null
                          );
                          const pointsStr = voicedPts
                            .map((pt, idx) => {
                              const x =
                                6 + (idx / Math.max(1, voicedPts.length - 1)) * 108;
                              const ratio = Math.max(
                                0,
                                Math.min(1, (pt.hz - 90) / (280 - 90))
                              );
                              const y = 30 - ratio * 24;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            })
                            .join(' ');
                          return (
                            <polyline
                              fill="none"
                              stroke="#f472b6"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={pointsStr}
                            />
                          );
                        })()}
                      </svg>
                    )}

                    <div className="text-right">
                      <div className="text-lg font-extrabold text-pink-400">
                        {Math.round(session.stats.meanHz)} Hz{' '}
                        <span className="text-xs text-slate-300">
                          ({note ? note.noteName : '—'})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Ziel: {session.stats.targetHitPercent}% ·{' '}
                        {Math.round(session.stats.activeSpeakingSec)}s Redezeit
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void onDeleteSession(session.id)}
                      className="p-2 rounded-xl border border-slate-800 hover:border-rose-500/40 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                      title="Session löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
